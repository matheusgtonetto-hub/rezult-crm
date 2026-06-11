-- Horários de trabalho nomeados (Configurações → Horários de trabalho).
-- Cada horário tem dias ativos e, por dia, um ou mais intervalos ("Vários horários").
-- Usados também como "Horário de funcionamento" dos departamentos.
create table if not exists public.work_schedules (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null,                  -- dono da empresa (escopo RLS)
  company_id uuid,
  name       text not null,
  -- [{ day:"Segunda", active:true, intervals:[{start:"08:00",end:"12:00"},...] }, ...]
  days       jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table public.work_schedules enable row level security;

create policy owner_all on public.work_schedules
  for all using (auth.uid() = owner_id);
create policy member_select on public.work_schedules
  for select using (is_company_member(owner_id));
create policy member_insert on public.work_schedules
  for insert with check ((owner_id = auth.uid()) or is_company_member(owner_id));
create policy member_update on public.work_schedules
  for update using (is_company_member(owner_id));
create policy member_delete on public.work_schedules
  for delete using (is_company_member(owner_id));

create index if not exists idx_work_schedules_owner on public.work_schedules(owner_id);
