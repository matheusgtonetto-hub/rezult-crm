-- Follow-up e automação em espera passam a pertencer ao ATENDIMENTO.
--
-- Ambos guardavam só telefone. O problema que isso cria: o follow-up é
-- programado dentro do atendimento #1002, o atendimento fecha, um novo (#1003)
-- abre depois da janela, e a cutucada dispara dentro do episódio novo. Foi
-- combinado numa conversa comercial e executa em outra.
--
-- E o cancelamento era PREGUIÇOSO: não acontecia no fechamento, e sim na
-- próxima tentativa, quando o runner chamava o agente, o agente respondia
-- conversation_finished e só então o estado virava cancelado. Entre uma coisa e
-- outra o estado ficava 'ativo' mentindo.
--
-- O que NÃO muda: o follow-up continua passando pelo agente em vez de mandar
-- texto próprio. É isso que o faz herdar os gates de tag, conversa finalizada e
-- horário de atendimento, em vez de atropelar um atendente humano com frase
-- fixa. Essa parte já estava certa.

alter table public.agent_followup_state
  add column if not exists atendimento_id uuid references public.atendimentos(id) on delete cascade;

alter table public.automation_awaiting_reply
  add column if not exists atendimento_id uuid references public.atendimentos(id) on delete cascade;

comment on column public.agent_followup_state.atendimento_id is
  'Atendimento que originou o follow-up. Fechou o atendimento, o follow-up morre junto -- nao atravessa para o episodio seguinte.';
comment on column public.automation_awaiting_reply.atendimento_id is
  'Atendimento em que a automacao ficou esperando resposta. Mesma regra do follow-up.';

create index if not exists idx_followup_por_atendimento
  on public.agent_followup_state (atendimento_id) where atendimento_id is not null;
create index if not exists idx_awaiting_por_atendimento
  on public.automation_awaiting_reply (atendimento_id) where atendimento_id is not null;

-- Backfill do que está em voo: liga ao atendimento ABERTO daquele telefone.
-- Pendência sem atendimento aberto fica nula de propósito (as que existiam
-- estavam expiradas havia semanas, são linhas mortas).
update public.agent_followup_state f
   set atendimento_id = a.id
  from public.atendimentos a
  join public.whatsapp_conversations w on w.id = a.conversation_id
 where f.atendimento_id is null
   and a.company_id = f.company_id
   and a.status <> 'finalizado'
   and public.nucleo_telefone(w.phone) = public.nucleo_telefone(f.phone);

update public.automation_awaiting_reply r
   set atendimento_id = a.id
  from public.atendimentos a
  join public.whatsapp_conversations w on w.id = a.conversation_id
 where r.atendimento_id is null
   and a.company_id = r.company_id
   and a.status <> 'finalizado'
   and public.nucleo_telefone(w.phone) = public.nucleo_telefone(r.phone);

-- ── Nasce vinculada ─────────────────────────────────────────────────────────
-- Resolvido no BANCO e não no TypeScript de propósito: quem cria follow-up e
-- quem cria espera de resposta são funções diferentes (agent-sds-qualify e
-- automation-runner), e amanhã pode ser uma terceira. Um gatilho por tabela
-- cobre todas, e não tem como um caminho novo esquecer de preencher.
create or replace function public.vincula_pendencia_ao_atendimento()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_id uuid;
begin
  if NEW.atendimento_id is not null or NEW.company_id is null or coalesce(NEW.phone,'') = '' then
    return NEW;
  end if;

  -- Atendimento ABERTO daquele telefone na empresa. Casa pelo núcleo (DDD + 8
  -- dígitos), o mesmo critério do resto do sistema, porque o telefone gravado
  -- na pendência e o da conversa podem vir em formatos diferentes.
  select a.id into v_id
    from public.atendimentos a
    join public.whatsapp_conversations w on w.id = a.conversation_id
   where a.company_id = NEW.company_id
     and a.status <> 'finalizado'
     and public.nucleo_telefone(w.phone) = public.nucleo_telefone(NEW.phone)
   order by a.aberto_em desc
   limit 1;

  NEW.atendimento_id := v_id;
  return NEW;
exception when others then
  -- Sem vínculo a pendência ainda funciona como antes (por telefone). Nunca
  -- vale derrubar a criação do follow-up por causa disso.
  raise warning 'vincula_pendencia_ao_atendimento falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_followup_vincula_atendimento on public.agent_followup_state;
create trigger trg_followup_vincula_atendimento
  before insert or update on public.agent_followup_state
  for each row execute function public.vincula_pendencia_ao_atendimento();

drop trigger if exists trg_awaiting_vincula_atendimento on public.automation_awaiting_reply;
create trigger trg_awaiting_vincula_atendimento
  before insert on public.automation_awaiting_reply
  for each row execute function public.vincula_pendencia_ao_atendimento();

-- ── Morre com o atendimento ─────────────────────────────────────────────────
-- Fechou o atendimento, morre o que estava pendente nele. É o comportamento de
-- ticket de Zendesk e Intercom, e é o que o operador espera: finalizei, acabou.
create or replace function public.encerra_pendencias_do_atendimento()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if NEW.status = 'finalizado' and coalesce(OLD.status, '') <> 'finalizado' then
    update public.agent_followup_state
       set status = 'cancelado', updated_at = now()
     where atendimento_id = NEW.id and status = 'ativo';

    -- A espera de resposta não tem status: a linha existir É o estado. Some.
    delete from public.automation_awaiting_reply where atendimento_id = NEW.id;
  end if;
  return NEW;
exception when others then
  raise warning 'encerra_pendencias_do_atendimento falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_encerra_pendencias on public.atendimentos;
create trigger trg_encerra_pendencias
  after update on public.atendimentos
  for each row execute function public.encerra_pendencias_do_atendimento();
