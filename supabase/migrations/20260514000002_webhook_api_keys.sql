-- Tabela de chaves de API para o webhook público de leads
create table if not exists webhook_api_keys (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  owner_id    uuid not null references profiles(id) on delete cascade,
  key         text not null unique,
  label       text not null default 'Chave padrão',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);

alter table webhook_api_keys enable row level security;

-- Somente o dono da empresa gerencia as chaves
create policy "owner manages api keys"
  on webhook_api_keys
  for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());
