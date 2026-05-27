-- ============================================================================
-- Rezult CRM — Tabela de logs de execução de automações
-- ============================================================================
-- Criada por: automation-runner Edge Function
-- Usada por: AutomacoesPage.tsx (visualização de leads por status)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id  uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id        uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  node_id        text NOT NULL,
  status         text NOT NULL CHECK (status IN ('success', 'alert', 'error')),
  error_message  text,
  created_at     timestamptz DEFAULT now()
);

-- Índices para queries frequentes (filtrar por automation_id + node_id + status)
CREATE INDEX IF NOT EXISTS automation_logs_automation_id_idx ON public.automation_logs (automation_id);
CREATE INDEX IF NOT EXISTS automation_logs_company_id_idx   ON public.automation_logs (company_id);
CREATE INDEX IF NOT EXISTS automation_logs_lead_id_idx      ON public.automation_logs (lead_id);

-- RLS: dono da empresa pode ler seus próprios logs
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_owner_read_logs"
  ON public.automation_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  );

-- A Edge Function usa service role key (bypassa RLS) para inserir
