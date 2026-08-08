-- Trava contra corrida no agent-business-hours-runner: sem isso, se uma
-- invocação do agente demorar mais que 1 tick do cron (1 minuto), o próximo
-- tick pode reinvocar a mesma conversa antes da primeira resposta ser
-- enviada -- ver comentário no topo de
-- supabase/functions/agent-business-hours-runner/index.ts.
--
-- unique(company_id, phone) é o mutex de verdade: o INSERT falha com
-- conflito se outro tick já reivindicou esse telefone, então só uma
-- invocação por vez processa cada conversa. claimed_at existe só pra
-- autolimpeza de claims órfãs (se a function crashar antes de liberar) --
-- o runner apaga claims com mais de 2 minutos no início de cada execução.
create table if not exists agent_business_hours_claims (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  phone       text not null,
  claimed_at  timestamptz not null default now(),
  unique (company_id, phone)
);

alter table agent_business_hours_claims enable row level security;
-- Leitura via RLS normal; toda escrita é via service role no edge function
-- (agent-business-hours-runner), que não passa por RLS.
create policy "company_read_agent_business_hours_claims" on agent_business_hours_claims
  for select using (is_member_of(company_id));
