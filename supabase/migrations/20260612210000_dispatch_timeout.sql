-- Aumenta o timeout do disparo de automações de 5s (default do pg_net) para 15s.
--
-- Problema: net._http_response mostrava ~40% das chamadas trigger→runner com
-- timed_out=true e "TCP/SSL handshake time: ~10s" — o handshake até o gateway
-- das Edge Functions às vezes leva ~10s e o default de 5s derrubava a chamada
-- ANTES do request ser entregue. Resultado: automações silenciosamente não
-- disparavam nesses casos (nenhum erro em automation_logs, pois o runner nunca
-- era invocado).
--
-- O job horário "automation-agendado-hourly" também usa esta função (rajada de
-- um http_post por lead aberto no minuto 0 de cada hora — principal fonte dos
-- picos de timeout). O job "resume-pending-automations" já usava 55s e não é
-- afetado.

CREATE OR REPLACE FUNCTION public.dispatch_automation_event(
  p_trigger_type text,
  p_company_id   uuid,
  p_lead_id      uuid,
  p_context      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT value INTO v_url    FROM public.automation_runner_config WHERE key = 'supabase_url';
  SELECT value INTO v_secret FROM public.automation_runner_config WHERE key = 'automation_secret';

  IF v_url IS NULL OR v_url LIKE 'REPLACE%' THEN RETURN; END IF;
  IF v_secret IS NULL OR v_secret LIKE 'REPLACE%' THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/automation-runner',
    body    := jsonb_build_object(
      'trigger_type', p_trigger_type,
      'company_id',   p_company_id::text,
      'lead_id',      p_lead_id::text,
      'context',      p_context
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 15000
  );
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia a transação principal
  RAISE WARNING 'dispatch_automation_event falhou [%]: %', p_trigger_type, SQLERRM;
END;
$$;
