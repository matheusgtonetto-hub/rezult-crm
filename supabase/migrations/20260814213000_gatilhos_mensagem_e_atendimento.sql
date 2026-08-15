-- Gatilhos de automação para mensagens e atendimento.
--
-- A tela oferecia "Mensagem recebida", "Mensagem enviada", "Atendimento
-- iniciado", "Atendimento finalizado" e "Departamento alterado", e nenhum dos
-- cinco existia no servidor. O cliente montava o fluxo, ativava, e nada
-- acontecia nunca: sem erro, sem aviso, sem nada no log. A pior forma de falha,
-- porque parece configuração errada do usuário.
--
-- Vão por trigger de banco, e não pelos webhooks de cada provedor, porque toda
-- mensagem passa por whatsapp_messages independente de vir da D-API, Z-API ou
-- Cloud API. Um ponto em vez de três, e um canal novo no futuro já nasce
-- coberto. Mesmo padrão de leads_automation_trigger_fn, que já roda em produção.

-- ── Guarda de volume ────────────────────────────────────────────────────────
-- Só vale pagar um POST HTTP se alguma automação ativa da empresa escuta aquele
-- gatilho. Sem isso seria uma chamada por mensagem recebida, para todo mundo,
-- inclusive empresas sem automação nenhuma. Hoje são ~65 mensagens/dia, mas
-- esse número cresce com cada cliente novo, e mensagem é o evento mais quente
-- do sistema.
create or replace function public.alguma_automacao_escuta(
  p_company_id uuid,
  p_trigger_id text
) returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from public.automations
    where company_id = p_company_id
      and active
      and flow->'trigger'->>'triggerId' = p_trigger_id
  );
$$;

comment on function public.alguma_automacao_escuta(uuid, text) is
  'Alguma automacao ativa desta empresa usa este gatilho? Evita disparar HTTP por evento que ninguem escuta.';

-- ── Mensagens ───────────────────────────────────────────────────────────────
create or replace function public.mensagens_automation_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_trigger text;
  v_lead_id uuid;
begin
  if NEW.company_id is null then
    return NEW;
  end if;

  v_trigger := case when NEW.from_me then 'msg_enviada' else 'msg_recebida' end;

  if not public.alguma_automacao_escuta(NEW.company_id, v_trigger) then
    return NEW;
  end if;

  -- Lead pelo mesmo núcleo de telefone usado no resto do sistema (DDD + 8
  -- dígitos), para não depender do formato em que o provedor entregou o número.
  -- Sem lead não é erro: a automação roda com os dados da mensagem, igual ao
  -- gatilho de webhook faz quando o lead ainda não existe.
  select l.id into v_lead_id
  from public.leads l
  where l.company_id = NEW.company_id
    and l.whatsapp is not null
    and public.nucleo_telefone(l.whatsapp) = public.nucleo_telefone(NEW.phone)
  order by l.created_at desc
  limit 1;

  perform public.dispatch_automation_event(
    v_trigger,
    NEW.company_id,
    v_lead_id,
    jsonb_build_object(
      'instance_id',     coalesce(NEW.instance_id, ''),
      'conversation_id', NEW.conversation_id,
      'message_body',    coalesce(NEW.body, ''),
      'message_type',    coalesce(NEW.type, 'text'),
      'phone',           coalesce(NEW.phone, '')
    )
  );

  return NEW;
exception when others then
  -- Nunca derrubar a gravação da mensagem por causa da automação. Mensagem
  -- perdida é dano permanente; automação não disparada é recuperável.
  raise warning 'mensagens_automation_trigger_fn falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_mensagens_automation on public.whatsapp_messages;
create trigger trg_mensagens_automation
  after insert on public.whatsapp_messages
  for each row execute function public.mensagens_automation_trigger_fn();

-- ── Atendimento (conversa) ──────────────────────────────────────────────────
-- "Atendimento" aqui é a conversa: quem assumiu (assigned_to), se encerrou
-- (finished) e em que departamento está (department_id). São as colunas que a
-- tela de Multiatendimento já move hoje.
create or replace function public.conversas_automation_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_lead_id uuid;
  v_ctx jsonb;
  v_iniciou  boolean;
  v_encerrou boolean;
  v_mudou_dep boolean;
begin
  if NEW.company_id is null then
    return NEW;
  end if;

  -- A conversa é atualizada a CADA mensagem (preview, last_msg_at, read), então
  -- a maioria absoluta destas execuções não dispara gatilho nenhum. Decide isso
  -- primeiro, com comparação de coluna, e só depois paga a busca do lead.
  v_iniciou   := coalesce(NEW.assigned_to, '') <> '' and coalesce(OLD.assigned_to, '') = '';
  v_encerrou  := NEW.finished is true and coalesce(OLD.finished, false) is false;
  v_mudou_dep := NEW.department_id is distinct from OLD.department_id;

  if not (v_iniciou or v_encerrou or v_mudou_dep) then
    return NEW;
  end if;

  v_ctx := jsonb_build_object(
    'conversation_id', NEW.id,
    'instance_id',     coalesce(NEW.instance_id, ''),
    'department_id',   NEW.department_id,
    'phone',           coalesce(NEW.phone, '')
  );

  select l.id into v_lead_id
  from public.leads l
  where l.company_id = NEW.company_id
    and l.whatsapp is not null
    and public.nucleo_telefone(l.whatsapp) = public.nucleo_telefone(NEW.phone)
  order by l.created_at desc
  limit 1;

  -- Atendimento iniciado: alguém assumiu uma conversa que não tinha dono.
  if v_iniciou
     and public.alguma_automacao_escuta(NEW.company_id, 'atend_iniciado') then
    perform public.dispatch_automation_event(
      'atend_iniciado', NEW.company_id, v_lead_id,
      v_ctx || jsonb_build_object('new_responsible', NEW.assigned_to)
    );
  end if;

  -- Atendimento finalizado: a conversa foi encerrada.
  if v_encerrou
     and public.alguma_automacao_escuta(NEW.company_id, 'atend_finalizado') then
    perform public.dispatch_automation_event(
      'atend_finalizado', NEW.company_id, v_lead_id,
      v_ctx || jsonb_build_object('old_responsible', coalesce(OLD.assigned_to, ''))
    );
  end if;

  -- Departamento alterado: inclui a entrada num departamento vindo de nenhum.
  if v_mudou_dep
     and public.alguma_automacao_escuta(NEW.company_id, 'dep_alterado') then
    perform public.dispatch_automation_event(
      'dep_alterado', NEW.company_id, v_lead_id,
      v_ctx || jsonb_build_object(
        'old_department_id', OLD.department_id,
        'new_department_id', NEW.department_id
      )
    );
  end if;

  return NEW;
exception when others then
  raise warning 'conversas_automation_trigger_fn falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_conversas_automation on public.whatsapp_conversations;
create trigger trg_conversas_automation
  after update on public.whatsapp_conversations
  for each row execute function public.conversas_automation_trigger_fn();

-- O lookup de lead por núcleo de telefone roda em toda mensagem que tenha
-- ouvinte. Sem índice funcional seria seq scan em leads a cada uma.
create index if not exists idx_leads_nucleo_telefone
  on public.leads (company_id, public.nucleo_telefone(whatsapp))
  where whatsapp is not null;
