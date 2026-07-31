-- pg_cron: processa follow-ups agendados vencidos a cada minuto.
-- Chama a Edge Function scheduled-followup-runner com o segredo do motor (mesmo do automation-runner/disparo-runner).
-- Pré-requisito: automation_runner_config deve ter supabase_url e automation_secret
-- (preenchidos pela migration automation_engine_setup.sql).

SELECT cron.schedule(
  'process-scheduled-followups',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url              => (SELECT value FROM automation_runner_config WHERE key = 'supabase_url' LIMIT 1)
                        || '/functions/v1/scheduled-followup-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (SELECT value FROM automation_runner_config WHERE key = 'automation_secret' LIMIT 1)
                        ),
    body             => '{}'::jsonb,
    timeout_milliseconds => 55000
  )
  WHERE EXISTS (
    SELECT 1 FROM scheduled_followups
    WHERE status = 'agendado' AND scheduled_at <= now()
  )
  $job$
);
