-- Aba "Closers": disponibilidade de dias/horários que cada closer libera
-- pro agente agendar reuniões, por agente (mesmo closer pode ter janelas
-- diferentes em agentes diferentes). Shape do "days" espelha work_schedules
-- (WorkDay[] em src/components/WorkSchedulesManager.tsx) pra manter
-- consistência visual/de código, mas é uma tabela própria porque
-- work_schedules é escopado por empresa (template nomeado atribuído a
-- departamento/fila), não por (agente, usuário).
create table if not exists agent_closer_availability (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references agents(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  days        jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agent_id, user_id)
);

alter table agent_closer_availability enable row level security;
create policy "company_all_agent_closer_availability" on agent_closer_availability
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));

create or replace function agent_closer_availability_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_agent_closer_availability_touch on agent_closer_availability;
create trigger trg_agent_closer_availability_touch before update on agent_closer_availability
  for each row execute function agent_closer_availability_touch_updated_at();
