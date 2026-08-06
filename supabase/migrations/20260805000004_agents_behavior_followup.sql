-- Aba Comportamento: configs de personalidade/comportamento do agente
-- (finalizar conversa, transferir responsável, estilo, emojis, assinatura,
-- divisão de mensagem longa, follow-up automático). Um jsonb só porque são
-- campos heterogêneos (bool/enum/number) que crescem com o tempo -- mesmo
-- padrão de "bag de config flexível" que custom_field_values já usa em leads.
alter table agents add column if not exists behavior_config jsonb not null default '{}';

-- ─── Follow-up automático: estado de execução por lead ──────────────────────
-- A CONFIG (quantas tentativas, intervalo, automação de destino) vive em
-- agents.behavior_config -- isso aqui é só o estado runtime de "onde estou
-- nesse ciclo de follow-up" por conversa. Reaproveita o padrão de
-- scheduled_followups (status + campo de vencimento + pg_cron), mas é uma
-- entidade diferente -- aquela é 1 mensagem avulsa agendada por humano, essa
-- é um ciclo de N tentativas controlado pelo agente.
create table if not exists agent_followup_state (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references agents(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  phone           text not null,
  attempt_count   int not null default 0,
  next_attempt_at timestamptz not null,
  status          text not null default 'ativo',  -- ativo | concluido | cancelado
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (agent_id, lead_id)
);

create index if not exists idx_agent_followup_state_due on agent_followup_state(status, next_attempt_at);

alter table agent_followup_state enable row level security;
create policy "company_all_agent_followup_state" on agent_followup_state
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));

create or replace function agent_followup_state_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_agent_followup_state_touch on agent_followup_state;
create trigger trg_agent_followup_state_touch before update on agent_followup_state
  for each row execute function agent_followup_state_touch_updated_at();

-- ─── Cron: processa tentativas de follow-up vencidas a cada minuto ──────────
select cron.schedule(
  'process-agent-followups',
  '* * * * *',
  $job$
  select net.http_post(
    url              => (select value from automation_runner_config where key = 'supabase_url' limit 1)
                        || '/functions/v1/agent-followup-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (select value from automation_runner_config where key = 'automation_secret' limit 1)
                        ),
    body             => '{}'::jsonb,
    timeout_milliseconds => 55000
  )
  where exists (
    select 1 from agent_followup_state
    where status = 'ativo' and next_attempt_at <= now()
  )
  $job$
);
