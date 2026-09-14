-- Agente Operacional: o agente que nasce pronto em toda empresa.
--
-- Ele não conversa com ninguém. Lê as conversas de WhatsApp e mantém o CRM fiel
-- ao que aconteceu nelas: anotação, campos, dados do contato, etapa e tags. Não
-- depende de material da empresa, então basta a chave da OpenAI e ligar.
--
-- Decisões do dono (14/09/2026):
--   * atua em TODAS as conversas, sem tag de ativação; a tag
--     "Operacional: ignorar" tira um contato do escopo;
--   * processa POR CONVERSA, não por mensagem: espera a conversa ficar parada
--     10 minutos, ou roda na hora quando o atendimento é finalizado. Processar a
--     cada mensagem multiplicaria o gasto na chave do cliente.
--
-- Peças:
--   1. agent_operacional_fila     uma linha por conversa, com o relógio
--   2. gatilho em whatsapp_messages  empurra o relógio a cada mensagem
--   3. gatilho em whatsapp_conversations  antecipa quando o atendimento fecha
--   4. operacional_reivindicar / operacional_concluir  usadas pelo runner
--   5. operacional_lead_da_conversa  acha o lead pelo núcleo do telefone
--   6. criar_agente_operacional    um agente por empresa (novas e existentes)
--   7. cron que chama agent-operacional-runner

-- ─── 1. Fila ────────────────────────────────────────────────────────────────
create table if not exists public.agent_operacional_fila (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  conversation_id     uuid not null references public.whatsapp_conversations(id) on delete cascade,
  -- Quando rodar. Cada mensagem nova empurra para 10 minutos depois dela.
  processar_em        timestamptz not null,
  -- created_at da última mensagem que entrou na conversa.
  ultima_mensagem_em  timestamptz not null default now(),
  -- created_at da última mensagem já lida pelo agente. O runner só olha o que
  -- vem depois disso, e o resto da conversa entra como contexto.
  processado_ate      timestamptz,
  status              text not null default 'pendente'
                        check (status in ('pendente', 'processando', 'processado', 'erro')),
  tentativas          int not null default 0,
  erro                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (conversation_id)
);

create index if not exists idx_agent_operacional_fila_vencida
  on public.agent_operacional_fila (status, processar_em);

-- Só o runner (service_role) mexe aqui. RLS ligada e sem política: nenhum
-- cliente lê ou escreve pela API.
alter table public.agent_operacional_fila enable row level security;

-- ─── 2. Enfileirar a cada mensagem ──────────────────────────────────────────
-- AFTER INSERT: o vínculo com a conversa é feito por um gatilho BEFORE
-- (vincular_mensagem_a_conversa), então aqui conversation_id já está resolvido.
create or replace function public.operacional_enfileirar_mensagem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.company_id is null or NEW.conversation_id is null then
    return NEW;
  end if;

  if not exists (
    select 1 from public.agents a
    where a.company_id = NEW.company_id and a.type = 'OPERACIONAL' and a.active
  ) then
    return NEW;
  end if;

  insert into public.agent_operacional_fila
    (company_id, conversation_id, processar_em, ultima_mensagem_em, status)
  values
    (NEW.company_id, NEW.conversation_id, now() + interval '10 minutes', coalesce(NEW.created_at, now()), 'pendente')
  on conflict (conversation_id) do update set
    processar_em       = now() + interval '10 minutes',
    ultima_mensagem_em = greatest(agent_operacional_fila.ultima_mensagem_em, excluded.ultima_mensagem_em),
    -- Em processamento, continua em processamento: quem decide se sobrou
    -- mensagem nova é operacional_concluir, comparando com processado_ate.
    status     = case when agent_operacional_fila.status = 'processando' then 'processando' else 'pendente' end,
    tentativas = case when agent_operacional_fila.status = 'processando' then agent_operacional_fila.tentativas else 0 end,
    erro       = case when agent_operacional_fila.status = 'processando' then agent_operacional_fila.erro else null end,
    updated_at = now();

  return NEW;
exception when others then
  -- Falha aqui não pode derrubar a gravação da mensagem.
  raise warning '[operacional_enfileirar_mensagem] falhou: %', sqlerrm;
  return NEW;
end;
$function$;

drop trigger if exists trg_operacional_enfileirar on public.whatsapp_messages;
create trigger trg_operacional_enfileirar
  after insert on public.whatsapp_messages
  for each row execute function public.operacional_enfileirar_mensagem();

-- ─── 3. Atendimento finalizado roda na hora ─────────────────────────────────
create or replace function public.operacional_conversa_finalizada()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.finished is true and coalesce(OLD.finished, false) is false then
    update public.agent_operacional_fila
       set processar_em = now(), updated_at = now()
     where conversation_id = NEW.id and status = 'pendente';
  end if;
  return NEW;
exception when others then
  raise warning '[operacional_conversa_finalizada] falhou: %', sqlerrm;
  return NEW;
end;
$function$;

drop trigger if exists trg_operacional_conversa_finalizada on public.whatsapp_conversations;
create trigger trg_operacional_conversa_finalizada
  after update of finished on public.whatsapp_conversations
  for each row execute function public.operacional_conversa_finalizada();

-- ─── 4. Funções do runner ───────────────────────────────────────────────────
-- Pega um lote vencido e marca como em processamento, sem dois runners pegarem
-- a mesma conversa (skip locked). Linha presa em "processando" por mais de 10
-- minutos é de uma execução que morreu, e volta para a fila.
create or replace function public.operacional_reivindicar(p_limite int default 8)
returns setof public.agent_operacional_fila
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.agent_operacional_fila
     set status = 'pendente', updated_at = now()
   where status = 'processando' and updated_at < now() - interval '10 minutes';

  return query
  update public.agent_operacional_fila f
     set status = 'processando', updated_at = now()
   where f.id in (
     select q.id from public.agent_operacional_fila q
      where q.status = 'pendente' and q.processar_em <= now()
      order by q.processar_em
      limit p_limite
      for update skip locked
   )
  returning f.*;
end;
$function$;

-- Fecha uma execução. Com erro: tenta de novo com espera crescente, e desiste
-- na terceira. Sem erro: se chegou mensagem durante o processamento
-- (ultima_mensagem_em passou de processado_ate), volta para pendente; o
-- gatilho já empurrou processar_em para 10 minutos depois dela.
create or replace function public.operacional_concluir(
  p_id uuid,
  p_processado_ate timestamptz,
  p_erro text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_erro is not null then
    update public.agent_operacional_fila
       set tentativas   = tentativas + 1,
           erro         = p_erro,
           status       = case when tentativas + 1 >= 3 then 'erro' else 'pendente' end,
           processar_em = now() + make_interval(mins => 5 * (tentativas + 1)),
           updated_at   = now()
     where id = p_id;
    return;
  end if;

  update public.agent_operacional_fila
     set processado_ate = coalesce(p_processado_ate, processado_ate),
         tentativas     = 0,
         erro           = null,
         status         = case
                            when ultima_mensagem_em > coalesce(p_processado_ate, processado_ate, 'epoch'::timestamptz)
                            then 'pendente' else 'processado'
                          end,
         updated_at     = now()
   where id = p_id;
end;
$function$;

-- Lead da conversa pelo núcleo do telefone, o mesmo critério dos gatilhos de
-- automação. Comparar o texto não serve: lead guarda "+55...", conversa guarda
-- só dígitos, e cada canal grava com ou sem o nono dígito.
create or replace function public.operacional_lead_da_conversa(p_company_id uuid, p_phone text)
returns setof public.leads
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.*
    from public.leads l
   where l.company_id = p_company_id
     and l.whatsapp is not null
     and length(public.nucleo_telefone(p_phone)) >= 10
     and public.nucleo_telefone(l.whatsapp) = public.nucleo_telefone(p_phone)
   order by (l.status = 'open' and l.pipeline_id is not null) desc, l.created_at desc
   limit 1
$function$;

revoke all on function public.operacional_reivindicar(int) from public, anon, authenticated;
revoke all on function public.operacional_concluir(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.operacional_lead_da_conversa(uuid, text) from public, anon, authenticated;
grant execute on function public.operacional_reivindicar(int) to service_role;
grant execute on function public.operacional_concluir(uuid, timestamptz, text) to service_role;
grant execute on function public.operacional_lead_da_conversa(uuid, text) to service_role;

-- ─── 5. Um agente por empresa ───────────────────────────────────────────────
-- As tags de sistema dos agentes que conversam ("Agente", "SDS: ...") não fazem
-- sentido para o Operacional: sem isto, criar o Operacional em toda empresa
-- espalharia essas três tags por contas que nunca tiveram agente de conversa.
create or replace function public.ensure_agente_tag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Rascunho não é agente. Sai sem criar nada; quem cria é o gatilho de UPDATE,
  -- quando o rascunho virar agente de verdade.
  if coalesce(NEW.draft, false) then
    return NEW;
  end if;

  -- O Operacional não conversa e não usa tag de ativação nem de qualificação.
  if NEW.type = 'OPERACIONAL' then
    return NEW;
  end if;

  insert into public.tags (owner_id, name, description, color, company_id)
  select c.owner_id, v.nome, v.descricao, v.cor, c.id
  from public.companies c
  cross join (values
    ('Agente',               'Ativa o agente de IA neste negócio. Remover a tag devolve a conversa para atendimento humano.', '#6D28D9'),
    ('SDS: Qualificado',     'Marcada pelo agente quando o lead é considerado um bom encaixe.',                                '#128A68'),
    ('SDS: Não qualificado', 'Marcada pelo agente quando o lead não é um bom encaixe.',                                        '#B91C1C')
  ) as v(nome, descricao, cor)
  where c.id = NEW.company_id
    and not exists (select 1 from public.tags t where t.company_id = c.id and t.name = v.nome);
  return NEW;
end;
$function$;

create or replace function public.criar_agente_operacional(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.companies where id = p_company_id;
  if v_owner is null then
    return;
  end if;

  if not exists (select 1 from public.agents where company_id = p_company_id and type = 'OPERACIONAL') then
    insert into public.agents (company_id, owner_id, type, name, description, avatar, model, active, draft)
    values (p_company_id, v_owner, 'OPERACIONAL', 'Agente Operacional',
            'Mantém o CRM atualizado a partir das conversas', 'zap', 'gpt-5.6-terra', false, false);
  end if;

  insert into public.tags (owner_id, company_id, name, description, color)
  select v_owner, p_company_id, 'Operacional: ignorar',
         'O Agente Operacional não lê nem altera os negócios com esta tag.', '#767676'
   where not exists (
     select 1 from public.tags where company_id = p_company_id and name = 'Operacional: ignorar'
   );
end;
$function$;

create or replace function public.trg_fn_criar_agente_operacional()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.criar_agente_operacional(NEW.id);
  return NEW;
exception when others then
  raise warning '[criar_agente_operacional] falhou para a empresa %: %', NEW.id, sqlerrm;
  return NEW;
end;
$function$;

drop trigger if exists trg_criar_agente_operacional on public.companies;
create trigger trg_criar_agente_operacional
  after insert on public.companies
  for each row execute function public.trg_fn_criar_agente_operacional();

-- Empresas que já existem. Nasce desligado: nada muda até alguém ligar.
select public.criar_agente_operacional(c.id) from public.companies c where c.owner_id is not null;

-- ─── 6. Cron ────────────────────────────────────────────────────────────────
-- Mesmo padrão dos outros runners: a cada minuto, e só chama a função quando há
-- conversa vencida na fila.
select cron.unschedule('process-agent-operacional')
 where exists (select 1 from cron.job where jobname = 'process-agent-operacional');

select cron.schedule(
  'process-agent-operacional',
  '* * * * *',
  $job$
  select net.http_post(
    url              => (select value from automation_runner_config where key = 'supabase_url' limit 1)
                        || '/functions/v1/agent-operacional-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (select value from automation_runner_config where key = 'automation_secret' limit 1)
                        ),
    body             => '{}'::jsonb,
    timeout_milliseconds => 55000
  )
  where exists (
    select 1 from agent_operacional_fila
     where status = 'pendente' and processar_em <= now()
  )
  $job$
);
