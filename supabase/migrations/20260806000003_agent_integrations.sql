-- Nova etapa "Integrações" no wizard de agentes: o agente passa a declarar
-- explicitamente quais conexões existentes (WhatsApp, Instagram/Messenger,
-- calendars dos vendedores selecionados em "Vendedores", webhooks de
-- entrada tipo Hotmart/Kiwify) ele de fato usa.

-- ─── RLS: meta_connections e webhook_integrations eram owner-only ───────
-- (só quem CONECTOU enxergava a linha), diferente de whatsapp_connections
-- que já foi corrigido pra company-wide em 20260718000002. Sem isso, um
-- membro da empresa que não foi quem conectou o Instagram/webhook não veria
-- a conexão na etapa Integrações (RLS bloqueia silenciosamente).
drop policy if exists "owner_can_manage_meta_connections" on meta_connections;
create policy "company_select_meta_connections" on meta_connections
  for select using (is_member_of(company_id));
create policy "company_insert_meta_connections" on meta_connections
  for insert with check (is_member_of(company_id));
create policy "company_update_meta_connections" on meta_connections
  for update using (is_member_of(company_id));
create policy "company_delete_meta_connections" on meta_connections
  for delete using (is_member_of(company_id));

drop policy if exists "owner_manage" on webhook_integrations;
create policy "company_select_webhook_integrations" on webhook_integrations
  for select using (is_member_of(company_id));
create policy "company_insert_webhook_integrations" on webhook_integrations
  for insert with check (is_member_of(company_id));
create policy "company_update_webhook_integrations" on webhook_integrations
  for update using (is_member_of(company_id));
create policy "company_delete_webhook_integrations" on webhook_integrations
  for delete using (is_member_of(company_id));

-- ─── AGENT_WHATSAPP_CONNECTIONS ──────────────────────────────────────────
create table if not exists agent_whatsapp_connections (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agents(id) on delete cascade,
  connection_id uuid not null references whatsapp_connections(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (agent_id, connection_id)
);
alter table agent_whatsapp_connections enable row level security;
create policy "company_all_agent_whatsapp_connections" on agent_whatsapp_connections
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));

-- ─── AGENT_META_CONNECTIONS ──────────────────────────────────────────────
create table if not exists agent_meta_connections (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agents(id) on delete cascade,
  connection_id uuid not null references meta_connections(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (agent_id, connection_id)
);
alter table agent_meta_connections enable row level security;
create policy "company_all_agent_meta_connections" on agent_meta_connections
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));

-- ─── AGENT_WEBHOOK_INTEGRATIONS ──────────────────────────────────────────
create table if not exists agent_webhook_integrations (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agents(id) on delete cascade,
  connection_id uuid not null references webhook_integrations(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (agent_id, connection_id)
);
alter table agent_webhook_integrations enable row level security;
create policy "company_all_agent_webhook_integrations" on agent_webhook_integrations
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));

-- ─── AGENT_CALENDAR_CONNECTIONS ──────────────────────────────────────────
-- Google Calendar é conectado por usuário (google_oauth_tokens), não existe
-- uma lista de calendários da empresa. Por isso guarda por user_id (mesmo
-- usuário referenciado em agent_closers), não por token id -- o frontend
-- já não tem acesso direto a google_oauth_tokens de outros usuários (RLS
-- auth.uid() = user_id), só sabe "conectado ou não" via edge function
-- agent-closer-status.
create table if not exists agent_calendar_connections (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references agents(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agent_id, user_id)
);
alter table agent_calendar_connections enable row level security;
create policy "company_all_agent_calendar_connections" on agent_calendar_connections
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));
