-- Adiciona coluna stage_entered_at em leads para rastrear quando o lead entrou na etapa atual
alter table leads
  add column if not exists stage_entered_at timestamptz;

-- Preenche registros existentes com created_at como fallback
update leads
  set stage_entered_at = coalesce(created_at, now())
  where stage_entered_at is null;
