-- Departamentos do Multiatendimento (também em Configurações → Departamentos).
-- Escopo multi-tenant por owner_id (dono da empresa), igual a custom_field_groups.
create table if not exists public.departments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,                       -- dono da empresa (escopo RLS)
  company_id    uuid,                                -- empresa de origem
  name          text not null,
  color         text not null default '#EF4444',
  work_hours    text,                                -- "Horário de funcionamento" (opcional)
  attendants    text[] not null default '{}',        -- atendentes atribuídos (nomes, igual teamMembers)
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.departments enable row level security;

-- Dono: acesso total
create policy owner_all on public.departments
  for all using (auth.uid() = owner_id);

-- Membros da empresa: leitura e gestão (igual aos demais recursos de config)
create policy member_select on public.departments
  for select using (is_company_member(owner_id));
create policy member_insert on public.departments
  for insert with check ((owner_id = auth.uid()) or is_company_member(owner_id));
create policy member_update on public.departments
  for update using (is_company_member(owner_id));
create policy member_delete on public.departments
  for delete using (is_company_member(owner_id));

create index if not exists idx_departments_owner on public.departments(owner_id);
