-- =============================================================
-- Migração: RLS baseada em company_id, não em owner_id
-- Recursos pertencem à empresa. owner_id é apenas auditoria.
-- is_member_of(company_id) já reconhece o owner da empresa.
-- =============================================================

-- ─── AUTOMATIONS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_access" ON automations;
DROP POLICY IF EXISTS "member_read_automations" ON automations;
DROP POLICY IF EXISTS "member_insert_automations" ON automations;
DROP POLICY IF EXISTS "member_update_automations" ON automations;
DROP POLICY IF EXISTS "member_delete_automations" ON automations;

CREATE POLICY "company_select_automations" ON automations
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_automations" ON automations
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_automations" ON automations
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_automations" ON automations
  FOR DELETE USING (is_member_of(company_id));

-- ─── PIPELINES ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner pipelines" ON pipelines;
DROP POLICY IF EXISTS "pipelines: ver próprios" ON pipelines;
DROP POLICY IF EXISTS "pipelines: criar próprios" ON pipelines;
DROP POLICY IF EXISTS "pipelines: editar próprios" ON pipelines;
DROP POLICY IF EXISTS "pipelines: excluir próprios" ON pipelines;
DROP POLICY IF EXISTS "member_select_pipelines" ON pipelines;
DROP POLICY IF EXISTS "member_insert_pipelines" ON pipelines;
DROP POLICY IF EXISTS "member_update_pipelines" ON pipelines;
DROP POLICY IF EXISTS "member_delete_pipelines" ON pipelines;
DROP POLICY IF EXISTS "owner_reads_member_pipelines" ON pipelines;

CREATE POLICY "company_select_pipelines" ON pipelines
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_pipelines" ON pipelines
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_pipelines" ON pipelines
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_pipelines" ON pipelines
  FOR DELETE USING (is_member_of(company_id));

-- ─── PIPELINE_GROUPS ──────────────────────────────────────────
DROP POLICY IF EXISTS "Owner pipeline_groups" ON pipeline_groups;
DROP POLICY IF EXISTS "pipeline_groups: ver próprios" ON pipeline_groups;
DROP POLICY IF EXISTS "pipeline_groups: criar próprios" ON pipeline_groups;
DROP POLICY IF EXISTS "pipeline_groups: editar próprios" ON pipeline_groups;
DROP POLICY IF EXISTS "pipeline_groups: excluir próprios" ON pipeline_groups;
DROP POLICY IF EXISTS "member_select_pipeline_groups" ON pipeline_groups;
DROP POLICY IF EXISTS "member_insert_pipeline_groups" ON pipeline_groups;
DROP POLICY IF EXISTS "owner_reads_member_pipeline_groups" ON pipeline_groups;

CREATE POLICY "company_select_pipeline_groups" ON pipeline_groups
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_pipeline_groups" ON pipeline_groups
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_pipeline_groups" ON pipeline_groups
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_pipeline_groups" ON pipeline_groups
  FOR DELETE USING (is_member_of(company_id));

-- ─── PIPELINE_COLUMNS ─────────────────────────────────────────
DROP POLICY IF EXISTS "Owner pipeline_columns" ON pipeline_columns;
DROP POLICY IF EXISTS "pipeline_columns: ver via pipeline" ON pipeline_columns;
DROP POLICY IF EXISTS "pipeline_columns: criar via pipeline" ON pipeline_columns;
DROP POLICY IF EXISTS "pipeline_columns: editar via pipeline" ON pipeline_columns;
DROP POLICY IF EXISTS "pipeline_columns: excluir via pipeline" ON pipeline_columns;
DROP POLICY IF EXISTS "member_select_pipeline_columns" ON pipeline_columns;
DROP POLICY IF EXISTS "member_insert_pipeline_columns" ON pipeline_columns;
DROP POLICY IF EXISTS "member_update_pipeline_columns" ON pipeline_columns;
DROP POLICY IF EXISTS "member_delete_pipeline_columns" ON pipeline_columns;
DROP POLICY IF EXISTS "owner_reads_member_pipeline_columns" ON pipeline_columns;

CREATE POLICY "company_select_pipeline_columns" ON pipeline_columns
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_pipeline_columns" ON pipeline_columns
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_pipeline_columns" ON pipeline_columns
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_pipeline_columns" ON pipeline_columns
  FOR DELETE USING (is_member_of(company_id));

-- ─── TAGS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner tags" ON tags;
DROP POLICY IF EXISTS "tags: ver próprias" ON tags;
DROP POLICY IF EXISTS "tags: criar próprias" ON tags;
DROP POLICY IF EXISTS "tags: editar próprias" ON tags;
DROP POLICY IF EXISTS "tags: excluir próprias" ON tags;
DROP POLICY IF EXISTS "member_select_tags" ON tags;
DROP POLICY IF EXISTS "member_insert_tags" ON tags;
DROP POLICY IF EXISTS "owner_reads_member_tags" ON tags;

CREATE POLICY "company_select_tags" ON tags
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_tags" ON tags
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_tags" ON tags
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_tags" ON tags
  FOR DELETE USING (is_member_of(company_id));

-- ─── TASKS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner tasks" ON tasks;
DROP POLICY IF EXISTS "tasks: ver próprias" ON tasks;
DROP POLICY IF EXISTS "tasks: criar próprias" ON tasks;
DROP POLICY IF EXISTS "tasks: editar próprias" ON tasks;
DROP POLICY IF EXISTS "tasks: excluir próprias" ON tasks;
DROP POLICY IF EXISTS "member_select_tasks" ON tasks;
DROP POLICY IF EXISTS "member_insert_tasks" ON tasks;
DROP POLICY IF EXISTS "member_update_tasks" ON tasks;
DROP POLICY IF EXISTS "member_delete_tasks" ON tasks;
DROP POLICY IF EXISTS "owner_reads_member_tasks" ON tasks;

CREATE POLICY "company_select_tasks" ON tasks
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_tasks" ON tasks
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_tasks" ON tasks
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_tasks" ON tasks
  FOR DELETE USING (is_member_of(company_id));

-- ─── ACTIVITIES ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner activities" ON activities;
DROP POLICY IF EXISTS "activities: ver próprias" ON activities;
DROP POLICY IF EXISTS "activities: criar próprias" ON activities;
DROP POLICY IF EXISTS "activities: editar próprias" ON activities;
DROP POLICY IF EXISTS "activities: excluir próprias" ON activities;
DROP POLICY IF EXISTS "member_select_activities" ON activities;
DROP POLICY IF EXISTS "member_insert_activities" ON activities;
DROP POLICY IF EXISTS "member_update_activities" ON activities;
DROP POLICY IF EXISTS "member_delete_activities" ON activities;
DROP POLICY IF EXISTS "owner_reads_member_activities" ON activities;

CREATE POLICY "company_select_activities" ON activities
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_activities" ON activities
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_activities" ON activities
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_activities" ON activities
  FOR DELETE USING (is_member_of(company_id));

-- ─── LEADS ────────────────────────────────────────────────────
-- Mantém o sistema de permissões granulares por membro,
-- mas o owner da empresa sempre tem acesso total.
DROP POLICY IF EXISTS "Owner leads" ON leads;
DROP POLICY IF EXISTS "leads: ver próprios" ON leads;
DROP POLICY IF EXISTS "leads: criar próprios" ON leads;
DROP POLICY IF EXISTS "leads: editar próprios" ON leads;
DROP POLICY IF EXISTS "leads: excluir próprios" ON leads;
DROP POLICY IF EXISTS "member_select_leads" ON leads;
DROP POLICY IF EXISTS "member_insert_leads" ON leads;
DROP POLICY IF EXISTS "member_update_leads" ON leads;
DROP POLICY IF EXISTS "member_delete_leads" ON leads;
DROP POLICY IF EXISTS "owner_reads_member_leads" ON leads;

-- Owner da empresa: acesso total
CREATE POLICY "company_owner_leads" ON leads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM companies WHERE id = leads.company_id AND owner_id = auth.uid())
  );

-- Membros: acesso baseado em permissões
CREATE POLICY "company_member_select_leads" ON leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN profiles p ON p.id = auth.uid()
      WHERE cm.company_id = leads.company_id
        AND cm.user_id = auth.uid()
        AND (
          'admin'        = ANY(cm.permissions) OR
          'leads:admin'  = ANY(cm.permissions) OR
          'leads:member' = ANY(cm.permissions) OR
          'leads:operator' = ANY(cm.permissions) OR
          (
            'leads:restricted' = ANY(cm.permissions) AND
            (leads.responsible = p.full_name OR leads.responsibles @> jsonb_build_array(p.full_name))
          )
        )
    )
  );

CREATE POLICY "company_member_insert_leads" ON leads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = leads.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "company_member_update_leads" ON leads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN profiles p ON p.id = auth.uid()
      WHERE cm.company_id = leads.company_id
        AND cm.user_id = auth.uid()
        AND (
          'admin'          = ANY(cm.permissions) OR
          'leads:admin'    = ANY(cm.permissions) OR
          'leads:member'   = ANY(cm.permissions) OR
          'leads:operator' = ANY(cm.permissions) OR
          (
            'leads:restricted' = ANY(cm.permissions) AND
            (leads.responsible = p.full_name OR leads.responsibles @> jsonb_build_array(p.full_name))
          )
        )
    )
  );

CREATE POLICY "company_member_delete_leads" ON leads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = leads.company_id
        AND cm.user_id = auth.uid()
        AND (
          'admin'       = ANY(cm.permissions) OR
          'leads:admin' = ANY(cm.permissions)
        )
    )
  );

-- ─── DISPAROS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "disparos_select" ON disparos;
DROP POLICY IF EXISTS "disparos_insert" ON disparos;
DROP POLICY IF EXISTS "disparos_update" ON disparos;
DROP POLICY IF EXISTS "disparos_delete" ON disparos;

CREATE POLICY "company_select_disparos" ON disparos
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_disparos" ON disparos
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_disparos" ON disparos
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_disparos" ON disparos
  FOR DELETE USING (is_member_of(company_id));

-- ─── DISPARO_ITENS ────────────────────────────────────────────
DROP POLICY IF EXISTS "disparo_itens_select" ON disparo_itens;
DROP POLICY IF EXISTS "disparo_itens_insert" ON disparo_itens;
DROP POLICY IF EXISTS "disparo_itens_update" ON disparo_itens;
DROP POLICY IF EXISTS "disparo_itens_delete" ON disparo_itens;

CREATE POLICY "company_select_disparo_itens" ON disparo_itens
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_disparo_itens" ON disparo_itens
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_disparo_itens" ON disparo_itens
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_disparo_itens" ON disparo_itens
  FOR DELETE USING (is_member_of(company_id));

-- ─── AUTOMATION_LOGS ──────────────────────────────────────────
DROP POLICY IF EXISTS "owner_access" ON automation_logs;
DROP POLICY IF EXISTS "company_owner_read_logs" ON automation_logs;
DROP POLICY IF EXISTS "member_read_automation_logs" ON automation_logs;

CREATE POLICY "company_select_automation_logs" ON automation_logs
  FOR SELECT USING (is_member_of(company_id));

-- ─── WHATSAPP_CONNECTIONS ─────────────────────────────────────
-- Fase 2: adicionar company_id e atualizar RLS
ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE whatsapp_connections wc
SET company_id = c.id
FROM companies c
WHERE c.owner_id = wc.owner_id
  AND wc.company_id IS NULL;

DROP POLICY IF EXISTS "owner_manage" ON whatsapp_connections;

CREATE POLICY "company_select_whatsapp_connections" ON whatsapp_connections
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_whatsapp_connections" ON whatsapp_connections
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_whatsapp_connections" ON whatsapp_connections
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_whatsapp_connections" ON whatsapp_connections
  FOR DELETE USING (is_member_of(company_id));

-- ─── WHATSAPP_CONVERSATIONS ───────────────────────────────────
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE whatsapp_conversations wc
SET company_id = c.id
FROM companies c
WHERE c.owner_id = wc.owner_id
  AND wc.company_id IS NULL;

DROP POLICY IF EXISTS "owner all" ON whatsapp_conversations;
DROP POLICY IF EXISTS "member_select_conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "member_insert_conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "member_update_conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "member_delete_conversations" ON whatsapp_conversations;

CREATE POLICY "company_select_conversations" ON whatsapp_conversations
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_conversations" ON whatsapp_conversations
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_conversations" ON whatsapp_conversations
  FOR UPDATE USING (is_member_of(company_id));
CREATE POLICY "company_delete_conversations" ON whatsapp_conversations
  FOR DELETE USING (is_member_of(company_id));

-- ─── WHATSAPP_MESSAGES ────────────────────────────────────────
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS company_id uuid;

UPDATE whatsapp_messages wm
SET company_id = c.id
FROM companies c
WHERE c.owner_id = wm.owner_id
  AND wm.company_id IS NULL;

DROP POLICY IF EXISTS "owner insert" ON whatsapp_messages;
DROP POLICY IF EXISTS "owner select" ON whatsapp_messages;
DROP POLICY IF EXISTS "member_select_messages" ON whatsapp_messages;
DROP POLICY IF EXISTS "member_insert_messages" ON whatsapp_messages;

CREATE POLICY "company_select_messages" ON whatsapp_messages
  FOR SELECT USING (is_member_of(company_id));
CREATE POLICY "company_insert_messages" ON whatsapp_messages
  FOR INSERT WITH CHECK (is_member_of(company_id));
CREATE POLICY "company_update_messages" ON whatsapp_messages
  FOR UPDATE USING (is_member_of(company_id));

-- ─── REMOVER TRIGGER DE TRANSFERÊNCIA (não mais necessário) ───
DROP TRIGGER IF EXISTS on_member_removed ON company_members;
DROP FUNCTION IF EXISTS transfer_ownership_on_member_remove();
