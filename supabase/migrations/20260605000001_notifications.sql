-- Tabela de notificações do sistema (criadas por automações ou outros eventos)

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,
  lead_id     UUID,
  message     TEXT NOT NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa lê próprias notificações"
  ON public.notifications FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Empresa atualiza próprias notificações"
  ON public.notifications FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE owner_id = auth.uid()
    )
  );

-- Service role pode inserir (usado pela Edge Function)
CREATE POLICY "Service role insere notificações"
  ON public.notifications FOR INSERT
  WITH CHECK (true);
