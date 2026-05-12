-- Colunas faltando na tabela activities (title, scheduled_at, duration_minutes, user_name)
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 60;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS user_name text;
