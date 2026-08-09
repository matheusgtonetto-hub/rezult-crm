-- Lembrete de reunião: o agente marca a reunião e some até o dia. Entre o
-- agendamento e o encontro o lead esfria, e em negócio de agendamento o
-- prejuízo não está na captação -- está no não comparecimento.
--
-- São DOIS lembretes por reunião (um distante, um próximo), configurados na
-- aba Perfil junto do objetivo "Agendar Reunião".

-- Controle de envio. Existe por dois motivos:
--   1. dedup: o cron roda a cada minuto e mandaria o mesmo lembrete sem parar.
--   2. atomicidade: o unique(activity_id, indice) é o que garante que dois
--      ticks simultâneos não enviem em duplicidade -- o INSERT do segundo
--      falha por conflito, mesmo padrão de agent_business_hours_claims.
create table if not exists agent_meeting_reminders (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  indice      smallint not null check (indice in (1, 2)),
  sent_at     timestamptz not null default now(),
  unique (activity_id, indice)
);

alter table agent_meeting_reminders enable row level security;
create policy "company_read_agent_meeting_reminders" on agent_meeting_reminders
  for select using (is_member_of(company_id));

-- Índice para a varredura do runner (reuniões futuras por empresa).
create index if not exists idx_activities_meeting_futuras
  on activities (company_id, scheduled_at)
  where type = 'meeting';

-- Cron: mesma granularidade e padrão dos outros runners de agente. Só chama
-- a function se existir pelo menos 1 agente com lembrete ligado -- o filtro
-- fino (qual reunião, qual antecedência, já enviou?) roda dentro dela.
select cron.schedule(
  'process-agent-meeting-reminders',
  '* * * * *',
  $job$
  select net.http_post(
    url              => (select value from automation_runner_config where key = 'supabase_url' limit 1)
                        || '/functions/v1/agent-meeting-reminder-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (select value from automation_runner_config where key = 'automation_secret' limit 1)
                        ),
    body             => '{}'::jsonb,
    timeout_milliseconds => 55000
  )
  where exists (
    select 1 from agents
    where type = 'SDS' and active = true
      and (behavior_config->>'lembrete_reuniao_ativo')::boolean is true
  )
  $job$
);
