-- ============================================================================
-- Rezult CRM — Automation Engine Setup
-- ============================================================================
--
-- ANTES DE EXECUTAR, preencha os dois valores abaixo:
--   1. REPLACE_WITH_YOUR_SUPABASE_URL
--      Exemplo: https://abcdefghijkl.supabase.co
--      (sem barra no final)
--
--   2. REPLACE_WITH_A_RANDOM_SECRET
--      Gere com: openssl rand -hex 32
--      Este MESMO valor deve ser configurado como secret da Edge Function:
--        supabase secrets set AUTOMATION_SECRET=<valor>
--      Ou pelo painel: Dashboard → Edge Functions → Secrets → AUTOMATION_SECRET
--
-- Após preencher, execute no SQL Editor do Supabase.
-- ============================================================================

-- ── 1. Tabela de configuração (somente lida pela trigger function) ─────────────

CREATE TABLE IF NOT EXISTS public.automation_runner_config (
  key   text NOT NULL PRIMARY KEY,
  value text NOT NULL
);

-- Bloqueia acesso direto via API (RLS sem políticas = bloqueado para todos)
ALTER TABLE public.automation_runner_config ENABLE ROW LEVEL SECURITY;

-- Insere/atualiza os valores — PREENCHA ANTES DE EXECUTAR
INSERT INTO public.automation_runner_config (key, value) VALUES
  ('supabase_url',      'REPLACE_WITH_YOUR_SUPABASE_URL'),
  ('automation_secret', 'REPLACE_WITH_A_RANDOM_SECRET')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── 2. Função dispatcher (chama a Edge Function via pg_net) ───────────────────

CREATE OR REPLACE FUNCTION public.dispatch_automation_event(
  p_trigger_type  text,
  p_company_id    uuid,
  p_lead_id       uuid,
  p_context       jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT value INTO v_url    FROM public.automation_runner_config WHERE key = 'supabase_url';
  SELECT value INTO v_secret FROM public.automation_runner_config WHERE key = 'automation_secret';

  -- Não executa se a configuração ainda tem os placeholders
  IF v_url IS NULL OR v_url LIKE 'REPLACE%' THEN RETURN; END IF;
  IF v_secret IS NULL OR v_secret LIKE 'REPLACE%' THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/automation-runner',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object(
      'trigger_type', p_trigger_type,
      'company_id',   p_company_id::text,
      'lead_id',      p_lead_id::text,
      'context',      p_context
    )::text
  );
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia a transação principal
  RAISE WARNING 'dispatch_automation_event falhou [%]: %', p_trigger_type, SQLERRM;
END;
$$;

-- ── 3. Função do trigger na tabela leads ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.leads_automation_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id   uuid;
  v_added_tags   text[];
  v_removed_tags text[];
BEGIN
  -- Resolve company_id a partir do owner_id do lead
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE owner_id = COALESCE(NEW.owner_id, OLD.owner_id)
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── INSERT: lead criado ────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    PERFORM public.dispatch_automation_event(
      'lead_criado', v_company_id, NEW.id,
      jsonb_build_object('pipeline_id', NEW.pipeline_id, 'column_id', NEW.column_id)
    );
    PERFORM public.dispatch_automation_event(
      'neg_criado', v_company_id, NEW.id,
      jsonb_build_object('pipeline_id', NEW.pipeline_id, 'column_id', NEW.column_id)
    );
    RETURN NEW;
  END IF;

  -- ── UPDATE ─────────────────────────────────────────────────────────────────

  -- Negócio movido de etapa
  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    PERFORM public.dispatch_automation_event(
      'neg_movido', v_company_id, NEW.id,
      jsonb_build_object(
        'old_column_id', OLD.column_id,
        'new_column_id', NEW.column_id,
        'pipeline_id',   NEW.pipeline_id
      )
    );
  END IF;

  -- Status do negócio alterado (ganho / perdido / restaurado)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'won' THEN
      PERFORM public.dispatch_automation_event('neg_ganho', v_company_id, NEW.id, '{}');
    ELSIF NEW.status = 'lost' THEN
      PERFORM public.dispatch_automation_event(
        'neg_perdido', v_company_id, NEW.id,
        jsonb_build_object('loss_reason_id', NEW.loss_reason_id)
      );
    ELSIF NEW.status = 'open' AND OLD.status IN ('won', 'lost') THEN
      PERFORM public.dispatch_automation_event('neg_restaurado', v_company_id, NEW.id, '{}');
    END IF;
  END IF;

  -- Atendente responsável alterado
  IF NEW.responsible IS DISTINCT FROM OLD.responsible THEN
    IF NEW.responsible IS NOT NULL AND NEW.responsible <> '' THEN
      PERFORM public.dispatch_automation_event(
        'atend_atribuido', v_company_id, NEW.id,
        jsonb_build_object('old_responsible', OLD.responsible, 'new_responsible', NEW.responsible)
      );
    ELSIF OLD.responsible IS NOT NULL AND OLD.responsible <> '' THEN
      PERFORM public.dispatch_automation_event(
        'atend_retirado', v_company_id, NEW.id,
        jsonb_build_object('old_responsible', OLD.responsible)
      );
    END IF;
  END IF;

  -- Tags alteradas (adicionadas / removidas)
  IF NEW.tags IS DISTINCT FROM OLD.tags THEN
    -- Tags adicionadas: estão no NEW mas não no OLD
    SELECT array_agg(t) INTO v_added_tags
    FROM unnest(COALESCE(NEW.tags, ARRAY[]::text[])) AS t
    WHERE NOT (t = ANY(COALESCE(OLD.tags, ARRAY[]::text[])));

    -- Tags removidas: estavam no OLD mas não estão no NEW
    SELECT array_agg(t) INTO v_removed_tags
    FROM unnest(COALESCE(OLD.tags, ARRAY[]::text[])) AS t
    WHERE NOT (t = ANY(COALESCE(NEW.tags, ARRAY[]::text[])));

    IF v_added_tags IS NOT NULL AND array_length(v_added_tags, 1) > 0 THEN
      PERFORM public.dispatch_automation_event(
        'tag_adicionada', v_company_id, NEW.id,
        jsonb_build_object('tag_ids_added', to_jsonb(v_added_tags))
      );
    END IF;

    IF v_removed_tags IS NOT NULL AND array_length(v_removed_tags, 1) > 0 THEN
      PERFORM public.dispatch_automation_event(
        'tag_removida', v_company_id, NEW.id,
        jsonb_build_object('tag_ids_removed', to_jsonb(v_removed_tags))
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Registra o trigger na tabela leads ─────────────────────────────────────

DROP TRIGGER IF EXISTS leads_automation_trigger ON public.leads;

CREATE TRIGGER leads_automation_trigger
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_automation_trigger_fn();

-- ── Verificação ───────────────────────────────────────────────────────────────
-- Execute para confirmar que o setup foi aplicado:
--
-- SELECT * FROM public.automation_runner_config;
-- SELECT trigger_name, event_manipulation, event_object_table
--   FROM information_schema.triggers
--   WHERE trigger_name = 'leads_automation_trigger';
