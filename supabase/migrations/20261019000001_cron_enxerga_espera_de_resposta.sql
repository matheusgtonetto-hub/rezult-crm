-- O cron de retomada passa a enxergar as esperas de resposta vencidas.
--
-- SINTOMA (relatado por cliente em 19/10/2026): a saída "Caso o contato não
-- responda" do sub-bloco Entrada do usuário nunca executava. O fluxo enviava a
-- mensagem, ficava aguardando, o prazo vencia, e nada acontecia.
--
-- CAUSA: o job `resume-pending-automations` chama o runner por `net.http_post`,
-- mas a chamada é condicionada a:
--
--     WHERE EXISTS (SELECT 1 FROM automation_pending WHERE resume_after <= now())
--
-- As esperas de RESPOSTA não vivem em `automation_pending`. Vivem em
-- `automation_awaiting_reply`, com `expires_at`. A guarda nunca olhava para
-- essa tabela, então, sem nada vencido na outra, o POST não saía e
-- `handleResume` não rodava. O job terminava com status "succeeded" sem ter
-- feito nada, que é o pior tipo de falha: silenciosa e verde no monitoramento.
--
-- O runner sempre esteve certo: `handleResume` processa
-- `automation_awaiting_reply` ANTES de `automation_pending`. Ele só nunca era
-- chamado.
--
-- Por isso parecia intermitente: funcionava por acidente quando outra
-- automação qualquer da mesma instância tinha uma espera de TEMPO vencendo no
-- mesmo minuto, porque aí o POST saía e carregava as duas filas junto.
--
-- Medido no banco de produção em 19/10/2026, antes da correção:
--   automation_pending:        0 linhas
--   automation_awaiting_reply: 34 linhas, 1 vencida havia 1h25min
--   job 3:                     5.226 execuções, todas "succeeded"
--
-- CORREÇÃO: a guarda passa a aceitar as duas filas. O resto do comando segue
-- igual, inclusive o nome do job, para o histórico em cron.job_run_details não
-- se partir em dois.

select cron.schedule(
  'resume-pending-automations',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url              => (SELECT value FROM automation_runner_config WHERE key = 'supabase_url' LIMIT 1)
                        || '/functions/v1/automation-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (SELECT value FROM automation_runner_config WHERE key = 'automation_secret' LIMIT 1)
                        ),
    body             => '{"resume": true}'::jsonb,
    timeout_milliseconds => 55000
  )
  WHERE EXISTS (
    SELECT 1 FROM automation_pending WHERE resume_after <= now()
  )
  OR EXISTS (
    SELECT 1 FROM automation_awaiting_reply WHERE expires_at < now()
  )
  $cron$
);
