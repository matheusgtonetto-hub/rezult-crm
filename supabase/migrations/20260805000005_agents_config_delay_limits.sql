-- Aba Configurações: delay de resposta (com debounce), janela de mensagens
-- consideradas, limite de interações por atendimento, saudação automática,
-- restrição de tópicos. Config em si já cabe em agents.behavior_config
-- (jsonb, criado antes) -- aqui só o que precisa de estado/infra própria.

-- Contador de respostas da IA no atendimento atual -- zera quando
-- finalizar_conversa/transferir_responsavel encerram o ciclo.
alter table whatsapp_conversations add column if not exists ai_interaction_count int not null default 0;

-- ─── Delay de resposta com debounce ──────────────────────────────────────────
-- Cada mensagem inbound nova, se o agente tiver delay configurado, reescreve
-- respond_at (empurra pra frente) em vez de criar linha nova -- é isso que dá
-- o comportamento de debounce (só responde depois que o lead parar de
-- mandar mensagem por N minutos seguidos). unique(company_id, phone) garante
-- upsert em vez de acumular linha por mensagem.
create table if not exists agent_pending_response (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  phone       text not null,
  respond_at  timestamptz not null,
  status      text not null default 'pending', -- pending | processado
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, phone)
);

create index if not exists idx_agent_pending_response_due on agent_pending_response(status, respond_at);

alter table agent_pending_response enable row level security;
create policy "company_all_agent_pending_response" on agent_pending_response
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));

create or replace function agent_pending_response_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_agent_pending_response_touch on agent_pending_response;
create trigger trg_agent_pending_response_touch before update on agent_pending_response
  for each row execute function agent_pending_response_touch_updated_at();

-- Cron roda a cada minuto -- granularidade mínima do pg_cron. Delay de
-- resposta configurado em minutos já respeita essa granularidade.
select cron.schedule(
  'process-agent-pending-responses',
  '* * * * *',
  $job$
  select net.http_post(
    url              => (select value from automation_runner_config where key = 'supabase_url' limit 1)
                        || '/functions/v1/agent-response-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (select value from automation_runner_config where key = 'automation_secret' limit 1)
                        ),
    body             => '{}'::jsonb,
    timeout_milliseconds => 55000
  )
  where exists (
    select 1 from agent_pending_response
    where status = 'pending' and respond_at <= now()
  )
  $job$
);
