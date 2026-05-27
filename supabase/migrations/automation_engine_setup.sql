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
  ('supabase_url',      'https://adhjmwkgyxrpsohufqob.supabase.co'),
  ('automation_secret', '13e8ba16d9a9a703a0c5a08ae89584ac5d64c808deab325232de1321ac852cec')
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
    body    := jsonb_build_object(
      'trigger_type', p_trigger_type,
      'company_id',   p_company_id::text,
      'lead_id',      p_lead_id::text,
      'context',      p_context
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    )
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
  v_company_id    uuid;
  v_added_tags    text[];
  v_removed_tags  text[];
  v_changed_fields jsonb;
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
      jsonb_build_object('pipeline_id', NEW.pipeline_id, 'new_column_id', NEW.column_id)
    );
    PERFORM public.dispatch_automation_event(
      'neg_criado', v_company_id, NEW.id,
      jsonb_build_object('pipeline_id', NEW.pipeline_id, 'new_column_id', NEW.column_id)
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
      PERFORM public.dispatch_automation_event(
        'neg_ganho', v_company_id, NEW.id,
        jsonb_build_object('pipeline_id', NEW.pipeline_id, 'new_column_id', NEW.column_id)
      );
    ELSIF NEW.status = 'lost' THEN
      PERFORM public.dispatch_automation_event(
        'neg_perdido', v_company_id, NEW.id,
        jsonb_build_object('pipeline_id', NEW.pipeline_id, 'new_column_id', NEW.column_id, 'loss_reason_id', NEW.loss_reason_id)
      );
    ELSIF NEW.status = 'open' AND OLD.status IN ('won', 'lost') THEN
      PERFORM public.dispatch_automation_event(
        'neg_restaurado', v_company_id, NEW.id,
        jsonb_build_object('pipeline_id', NEW.pipeline_id, 'new_column_id', NEW.column_id)
      );
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

  -- ── Campo alterado ─────────────────────────────────────────────────────────
  v_changed_fields := '{}';
  IF NEW.name            IS DISTINCT FROM OLD.name            THEN v_changed_fields := v_changed_fields || jsonb_build_object('name',            NEW.name);            END IF;
  IF NEW.value           IS DISTINCT FROM OLD.value           THEN v_changed_fields := v_changed_fields || jsonb_build_object('value',           NEW.value);           END IF;
  IF NEW.column_id       IS DISTINCT FROM OLD.column_id       THEN v_changed_fields := v_changed_fields || jsonb_build_object('column_id',       NEW.column_id);       END IF;
  IF NEW.pipeline_id     IS DISTINCT FROM OLD.pipeline_id     THEN v_changed_fields := v_changed_fields || jsonb_build_object('pipeline_id',     NEW.pipeline_id);     END IF;
  IF NEW.responsible     IS DISTINCT FROM OLD.responsible     THEN v_changed_fields := v_changed_fields || jsonb_build_object('responsible',     NEW.responsible);     END IF;
  IF NEW.status          IS DISTINCT FROM OLD.status          THEN v_changed_fields := v_changed_fields || jsonb_build_object('status',          NEW.status);          END IF;
  IF NEW.origin          IS DISTINCT FROM OLD.origin          THEN v_changed_fields := v_changed_fields || jsonb_build_object('origin',          NEW.origin);          END IF;
  IF NEW.priority        IS DISTINCT FROM OLD.priority        THEN v_changed_fields := v_changed_fields || jsonb_build_object('priority',        NEW.priority);        END IF;
  IF NEW.product_id      IS DISTINCT FROM OLD.product_id      THEN v_changed_fields := v_changed_fields || jsonb_build_object('product_id',      NEW.product_id);      END IF;
  IF NEW.tags            IS DISTINCT FROM OLD.tags            THEN v_changed_fields := v_changed_fields || jsonb_build_object('tags',            NEW.tags);            END IF;
  IF NEW.entry_date      IS DISTINCT FROM OLD.entry_date      THEN v_changed_fields := v_changed_fields || jsonb_build_object('entry_date',      NEW.entry_date);      END IF;
  IF NEW.next_follow_up  IS DISTINCT FROM OLD.next_follow_up  THEN v_changed_fields := v_changed_fields || jsonb_build_object('next_follow_up',  NEW.next_follow_up);  END IF;
  IF NEW.loss_reason_id  IS DISTINCT FROM OLD.loss_reason_id  THEN v_changed_fields := v_changed_fields || jsonb_build_object('loss_reason_id',  NEW.loss_reason_id);  END IF;
  IF NEW.notes           IS DISTINCT FROM OLD.notes           THEN v_changed_fields := v_changed_fields || jsonb_build_object('notes',           NEW.notes);           END IF;
  IF NEW.whatsapp        IS DISTINCT FROM OLD.whatsapp        THEN v_changed_fields := v_changed_fields || jsonb_build_object('whatsapp',        NEW.whatsapp);        END IF;
  IF NEW.email           IS DISTINCT FROM OLD.email           THEN v_changed_fields := v_changed_fields || jsonb_build_object('email',           NEW.email);           END IF;
  IF NEW.site            IS DISTINCT FROM OLD.site            THEN v_changed_fields := v_changed_fields || jsonb_build_object('site',            NEW.site);            END IF;
  IF NEW.company         IS DISTINCT FROM OLD.company         THEN v_changed_fields := v_changed_fields || jsonb_build_object('company',         NEW.company);         END IF;
  IF NEW.document        IS DISTINCT FROM OLD.document        THEN v_changed_fields := v_changed_fields || jsonb_build_object('document',        NEW.document);        END IF;
  IF NEW.birth_date      IS DISTINCT FROM OLD.birth_date      THEN v_changed_fields := v_changed_fields || jsonb_build_object('birth_date',      NEW.birth_date);      END IF;
  IF NEW.country         IS DISTINCT FROM OLD.country         THEN v_changed_fields := v_changed_fields || jsonb_build_object('country',         NEW.country);         END IF;
  IF NEW.zip_code        IS DISTINCT FROM OLD.zip_code        THEN v_changed_fields := v_changed_fields || jsonb_build_object('zip_code',        NEW.zip_code);        END IF;
  IF NEW.address         IS DISTINCT FROM OLD.address         THEN v_changed_fields := v_changed_fields || jsonb_build_object('address',         NEW.address);         END IF;
  IF NEW.addr_number     IS DISTINCT FROM OLD.addr_number     THEN v_changed_fields := v_changed_fields || jsonb_build_object('addr_number',     NEW.addr_number);     END IF;
  IF NEW.complement      IS DISTINCT FROM OLD.complement      THEN v_changed_fields := v_changed_fields || jsonb_build_object('complement',      NEW.complement);      END IF;
  IF NEW.neighborhood    IS DISTINCT FROM OLD.neighborhood    THEN v_changed_fields := v_changed_fields || jsonb_build_object('neighborhood',    NEW.neighborhood);    END IF;
  IF NEW.city            IS DISTINCT FROM OLD.city            THEN v_changed_fields := v_changed_fields || jsonb_build_object('city',            NEW.city);            END IF;
  IF NEW.state           IS DISTINCT FROM OLD.state           THEN v_changed_fields := v_changed_fields || jsonb_build_object('state',           NEW.state);           END IF;
  IF NEW.utm_source      IS DISTINCT FROM OLD.utm_source      THEN v_changed_fields := v_changed_fields || jsonb_build_object('utm_source',      NEW.utm_source);      END IF;
  IF NEW.utm_medium      IS DISTINCT FROM OLD.utm_medium      THEN v_changed_fields := v_changed_fields || jsonb_build_object('utm_medium',      NEW.utm_medium);      END IF;
  IF NEW.utm_campaign    IS DISTINCT FROM OLD.utm_campaign    THEN v_changed_fields := v_changed_fields || jsonb_build_object('utm_campaign',    NEW.utm_campaign);    END IF;
  IF NEW.utm_term        IS DISTINCT FROM OLD.utm_term        THEN v_changed_fields := v_changed_fields || jsonb_build_object('utm_term',        NEW.utm_term);        END IF;
  IF NEW.utm_content     IS DISTINCT FROM OLD.utm_content     THEN v_changed_fields := v_changed_fields || jsonb_build_object('utm_content',     NEW.utm_content);     END IF;
  IF NEW.custom_field_values IS DISTINCT FROM OLD.custom_field_values THEN
    v_changed_fields := v_changed_fields || jsonb_build_object('custom_field_values', COALESCE(NEW.custom_field_values, '{}'));
  END IF;

  IF v_changed_fields <> '{}' THEN
    PERFORM public.dispatch_automation_event(
      'campo_alterado', v_company_id, NEW.id,
      jsonb_build_object('changed_fields', v_changed_fields)
    );
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

-- ── 5. Trigger na tabela activities (atividade_exec) ─────────────────────────

CREATE OR REPLACE FUNCTION public.activities_automation_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_company_id
  FROM public.companies
  WHERE owner_id = NEW.owner_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.dispatch_automation_event(
    'atividade_exec', v_company_id, NEW.lead_id,
    jsonb_build_object('activity_type', COALESCE(NEW.type, ''))
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'activities_automation_trigger_fn falhou: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activities_automation_trigger ON public.activities;

CREATE TRIGGER activities_automation_trigger
  AFTER INSERT ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.activities_automation_trigger_fn();

-- ── 6. RPC para execução manual (lead_manual) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_manual_automation(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_lead_owner uuid;
BEGIN
  SELECT owner_id INTO v_lead_owner FROM public.leads WHERE id = p_lead_id;

  IF v_lead_owner IS NULL OR v_lead_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Lead não encontrado ou acesso negado';
  END IF;

  SELECT id INTO v_company_id FROM public.companies WHERE owner_id = auth.uid() LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;

  PERFORM public.dispatch_automation_event('lead_manual', v_company_id, p_lead_id, '{}');
END;
$$;

-- ── 7. Execução agendada via pg_cron (agendado) ───────────────────────────────
-- Dispara o gatilho 'agendado' para TODOS os leads ativos de cada empresa,
-- a cada hora. As automações filtram por si mesmas via configData.interval.

SELECT cron.schedule(
  'automation-agendado-hourly',
  '0 * * * *',
  $$
  DO $$
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN
      SELECT DISTINCT l.id AS lead_id, c.id AS company_id
      FROM public.leads l
      JOIN public.companies c ON c.owner_id = l.owner_id
      WHERE l.status = 'open'
    LOOP
      PERFORM public.dispatch_automation_event('agendado', r.company_id, r.lead_id, '{}');
    END LOOP;
  END;
  $$
  $$
);

-- ── Verificação ───────────────────────────────────────────────────────────────
-- Execute para confirmar que o setup foi aplicado:
--
-- SELECT * FROM public.automation_runner_config;
-- SELECT trigger_name, event_manipulation, event_object_table
--   FROM information_schema.triggers
--   WHERE trigger_name = 'leads_automation_trigger';
