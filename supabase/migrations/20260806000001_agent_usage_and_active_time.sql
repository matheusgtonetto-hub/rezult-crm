-- Aba Performance: 3 métricas novas -- valor gasto em $ (uso real de tokens
-- por chamada de IA), horas ativas (uptime do toggle "Agente ativo") e
-- vendas feitas (usa leads.status='won', já existente).

create table if not exists agent_usage_log (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references agents(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(10,4) not null default 0,
  created_at    timestamptz not null default now()
);

alter table agent_usage_log enable row level security;
-- Leitura via RLS normal (dono/membro da empresa); gravação é sempre via
-- service role no edge function (agent-sds-qualify), que não passa por RLS.
create policy "company_read_agent_usage_log" on agent_usage_log
  for select using (is_member_of(company_id));

create index if not exists agent_usage_log_agent_created_idx
  on agent_usage_log (agent_id, created_at);

-- "Horas ativas" = tempo de relógio com o toggle "Agente ativo" ligado
-- (proxy de uptime, não tempo respondendo mensagem de verdade -- não existe
-- agent_id em whatsapp_messages/whatsapp_conversations hoje pra medir isso
-- com precisão).
alter table agents add column if not exists activated_at timestamptz;
alter table agents add column if not exists active_seconds_total integer not null default 0;
