-- Tabela de definição de campos adicionais por empresa
create table if not exists custom_fields (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users not null,
  label       text not null,
  field_type  text not null default 'text', -- 'text' | 'date' | 'boolean'
  position    integer not null default 0,
  created_at  timestamptz default now()
);

alter table custom_fields enable row level security;

create policy "owner_all" on custom_fields
  for all using (auth.uid() = owner_id);

-- Coluna para armazenar os valores dos campos adicionais em cada lead
alter table leads
  add column if not exists custom_field_values jsonb default '{}';
