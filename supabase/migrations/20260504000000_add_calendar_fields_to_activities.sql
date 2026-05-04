-- Campos para o Calendário de Atividades
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 60;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS user_name text;

-- Index para consultas por data agendada
CREATE INDEX IF NOT EXISTS activities_scheduled_at_idx ON public.activities (scheduled_at)
  WHERE scheduled_at IS NOT NULL;
