-- Chaves de API dos provedores de IA (modelo BYOK — "traga sua própria chave").
-- Os clientes cadastram aqui as chaves das IAs que já possuem; o Bloco de IA das
-- automações usa essas chaves (via Edge Function/service role) para executar.
-- Uma chave por provedor por empresa. Apenas o dono da empresa gerencia.
create table if not exists ai_provider_keys (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  owner_id    uuid not null references profiles(id) on delete cascade,
  provider    text not null check (provider in ('openai', 'anthropic', 'google')),
  api_key     text not null,
  label       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, provider)
);

alter table ai_provider_keys enable row level security;

-- Somente o dono da empresa gerencia as chaves de IA.
create policy "owner manages ai provider keys"
  on ai_provider_keys
  for all
  using  (owner_id = auth.uid())
  with check (owner_id = auth.uid());
