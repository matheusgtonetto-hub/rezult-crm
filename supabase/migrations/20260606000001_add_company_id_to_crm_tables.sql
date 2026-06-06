-- Adiciona company_id em todas as tabelas CRM para isolamento correto entre empresas.
-- Problema: todas as tabelas usavam apenas owner_id (UUID do usuário), então um usuário
-- com duas empresas via dados das duas misturados, pois ambas têm o mesmo owner_id.

-- ── Adiciona coluna company_id ────────────────────────────────────────────────

ALTER TABLE pipelines          ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE pipeline_columns   ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE pipeline_groups    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE leads              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE activities         ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE tasks              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE tags               ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE products           ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE loss_reasons       ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE custom_field_groups ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE custom_field_items  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE lists              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- ── Backfill: dados existentes vão para a empresa mais antiga do mesmo owner ──
-- (dados anteriores não tinham company_id, logo mapeamos para a 1ª empresa criada)

UPDATE pipelines SET company_id = (
  SELECT id FROM companies WHERE owner_id = pipelines.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE pipeline_columns SET company_id = (
  SELECT p.company_id FROM pipelines p WHERE p.id = pipeline_columns.pipeline_id
) WHERE company_id IS NULL;

UPDATE pipeline_groups SET company_id = (
  SELECT id FROM companies WHERE owner_id = pipeline_groups.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE leads SET company_id = (
  SELECT id FROM companies WHERE owner_id = leads.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE activities SET company_id = (
  SELECT id FROM companies WHERE owner_id = activities.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE tasks SET company_id = (
  SELECT id FROM companies WHERE owner_id = tasks.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE tags SET company_id = (
  SELECT id FROM companies WHERE owner_id = tags.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE products SET company_id = (
  SELECT id FROM companies WHERE owner_id = products.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE loss_reasons SET company_id = (
  SELECT id FROM companies WHERE owner_id = loss_reasons.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE custom_field_groups SET company_id = (
  SELECT id FROM companies WHERE owner_id = custom_field_groups.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE custom_field_items SET company_id = (
  SELECT id FROM companies WHERE owner_id = custom_field_items.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

UPDATE lists SET company_id = (
  SELECT id FROM companies WHERE owner_id = lists.owner_id ORDER BY created_at ASC LIMIT 1
) WHERE company_id IS NULL;

-- ── Índices para performance ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pipelines_company_id          ON pipelines(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_columns_company_id   ON pipeline_columns(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_groups_company_id    ON pipeline_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_id              ON leads(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_company_id         ON activities(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_company_id              ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tags_company_id               ON tags(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company_id           ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_loss_reasons_company_id       ON loss_reasons(company_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_groups_company_id ON custom_field_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_items_company_id  ON custom_field_items(company_id);
CREATE INDEX IF NOT EXISTS idx_lists_company_id              ON lists(company_id);
