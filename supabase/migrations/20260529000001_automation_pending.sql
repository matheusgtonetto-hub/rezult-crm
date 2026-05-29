-- Tabela para armazenar execuções de automação pausadas por blocos de Espera.
-- Criada pelo motor de automações quando um nó "espera" precisa de delay longo (> 90 s).
-- O pg_cron chama a Edge Function automation-runner a cada minuto para retomar.

-- 1. Tabela automation_pending
CREATE TABLE IF NOT EXISTS automation_pending (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL,
  automation_id    uuid        NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  lead_id          uuid        NOT NULL,
  node_ids         text[]      NOT NULL DEFAULT '{}',     -- IDs dos nós a executar ao retomar
  trigger_payload  jsonb       NOT NULL DEFAULT '{}',     -- payload original do trigger
  resume_after     timestamptz NOT NULL,                   -- quando retomar a execução
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_pending_resume_idx
  ON automation_pending (resume_after)
  WHERE resume_after IS NOT NULL;

CREATE INDEX IF NOT EXISTS automation_pending_company_idx
  ON automation_pending (company_id);

-- 2. RLS — sem acesso direto via API; apenas service role (Edge Function)
ALTER TABLE automation_pending ENABLE ROW LEVEL SECURITY;

-- 3. pg_cron: chama a Edge Function a cada minuto para processar pendentes.
--    Pré-requisito: automation_runner_config deve ter supabase_url e automation_secret
--    preenchidos (feito pela migration automation_engine_setup.sql).
SELECT cron.schedule(
  'resume-pending-automations',
  '* * * * *',
  $$
  SELECT net.http_post(
    url              => (SELECT supabase_url FROM automation_runner_config LIMIT 1)
                        || '/functions/v1/automation-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (SELECT automation_secret FROM automation_runner_config LIMIT 1)
                        ),
    body             => '{"resume": true}'::jsonb,
    timeout_milliseconds => 55000
  )
  WHERE EXISTS (
    SELECT 1 FROM automation_pending WHERE resume_after <= now()
  )
  $$
);
