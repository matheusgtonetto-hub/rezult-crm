-- Acesso completo dos membros de equipe aos dados da empresa
-- Membros podem ler/escrever todos os dados da empresa à qual foram convidados.
-- Donos também passam a ver os dados criados pelos membros.

-- ─── Funções auxiliares ───────────────────────────────────────────────────────

-- Verdadeiro se auth.uid() é membro (não dono) da empresa cujo dono é p_owner_id
create or replace function is_company_member(p_owner_id uuid)
returns boolean stable language sql security definer set search_path = public as $$
  select auth.uid() != p_owner_id and exists (
    select 1 from profiles p
    join companies c on c.name = p.company_name
    where p.id = auth.uid()
      and c.owner_id = p_owner_id
  )
$$;

-- Verdadeiro se auth.uid() é o dono da empresa à qual p_member_id pertence
create or replace function is_owner_of_member(p_member_id uuid)
returns boolean stable language sql security definer set search_path = public as $$
  select auth.uid() != p_member_id and exists (
    select 1 from profiles p
    join companies c on c.name = p.company_name
    where p.id = p_member_id
      and c.owner_id = auth.uid()
  )
$$;

-- ─── COMPANIES ────────────────────────────────────────────────────────────────
-- Membro pode ler a empresa à qual foi vinculado via company_name no perfil

create policy "member_read_company"
  on companies for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.company_name = companies.name
    )
  );

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- Membros podem ver o perfil do dono e dos outros membros da empresa

create policy "member_sees_team_profiles"
  on profiles for select
  using (
    -- Perfil do dono da minha empresa
    exists (
      select 1 from profiles me
      join companies c on c.name = me.company_name
      where me.id = auth.uid()
        and c.owner_id = profiles.id
        and auth.uid() != profiles.id
    )
    -- Ou outro membro com o mesmo company_name
    or (
      profiles.company_name is not null
      and exists (
        select 1 from profiles me
        where me.id = auth.uid()
          and me.company_name = profiles.company_name
          and auth.uid() != profiles.id
      )
    )
  );

-- ─── PIPELINES ────────────────────────────────────────────────────────────────

create policy "member_select_pipelines"
  on pipelines for select using (is_company_member(owner_id));

create policy "owner_reads_member_pipelines"
  on pipelines for select using (is_owner_of_member(owner_id));

create policy "member_update_pipelines"
  on pipelines for update using (is_company_member(owner_id)) with check (is_company_member(owner_id));

create policy "member_delete_pipelines"
  on pipelines for delete using (is_company_member(owner_id));

-- ─── PIPELINE COLUMNS ─────────────────────────────────────────────────────────
-- Não tem owner_id direto — acessa via pipeline_id

create policy "member_select_pipeline_columns"
  on pipeline_columns for select using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_columns.pipeline_id
        and is_company_member(p.owner_id)
    )
  );

create policy "owner_reads_member_pipeline_columns"
  on pipeline_columns for select using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_columns.pipeline_id
        and is_owner_of_member(p.owner_id)
    )
  );

create policy "member_update_pipeline_columns"
  on pipeline_columns for update using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_columns.pipeline_id
        and is_company_member(p.owner_id)
    )
  );

create policy "member_delete_pipeline_columns"
  on pipeline_columns for delete using (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_columns.pipeline_id
        and is_company_member(p.owner_id)
    )
  );

-- ─── PIPELINE GROUPS ─────────────────────────────────────────────────────────

create policy "member_select_pipeline_groups"
  on pipeline_groups for select using (is_company_member(owner_id));

create policy "owner_reads_member_pipeline_groups"
  on pipeline_groups for select using (is_owner_of_member(owner_id));

-- ─── LEADS ────────────────────────────────────────────────────────────────────

create policy "member_select_leads"
  on leads for select using (is_company_member(owner_id));

create policy "owner_reads_member_leads"
  on leads for select using (is_owner_of_member(owner_id));

create policy "member_update_leads"
  on leads for update using (is_company_member(owner_id)) with check (is_company_member(owner_id));

create policy "member_delete_leads"
  on leads for delete using (is_company_member(owner_id));

-- ─── ACTIVITIES ───────────────────────────────────────────────────────────────

create policy "member_select_activities"
  on activities for select using (is_company_member(owner_id));

create policy "owner_reads_member_activities"
  on activities for select using (is_owner_of_member(owner_id));

create policy "member_update_activities"
  on activities for update using (is_company_member(owner_id)) with check (is_company_member(owner_id));

create policy "member_delete_activities"
  on activities for delete using (is_company_member(owner_id));

-- ─── TASKS ────────────────────────────────────────────────────────────────────

create policy "member_select_tasks"
  on tasks for select using (is_company_member(owner_id));

create policy "owner_reads_member_tasks"
  on tasks for select using (is_owner_of_member(owner_id));

create policy "member_update_tasks"
  on tasks for update using (is_company_member(owner_id)) with check (is_company_member(owner_id));

create policy "member_delete_tasks"
  on tasks for delete using (is_company_member(owner_id));

-- ─── TAGS ─────────────────────────────────────────────────────────────────────

create policy "member_select_tags"
  on tags for select using (is_company_member(owner_id));

create policy "owner_reads_member_tags"
  on tags for select using (is_owner_of_member(owner_id));

-- ─── PRODUCTS ────────────────────────────────────────────────────────────────

create policy "member_select_products"
  on products for select using (is_company_member(owner_id));

create policy "owner_reads_member_products"
  on products for select using (is_owner_of_member(owner_id));

-- ─── LOSS REASONS ─────────────────────────────────────────────────────────────

create policy "member_select_loss_reasons"
  on loss_reasons for select using (is_company_member(owner_id));

create policy "owner_reads_member_loss_reasons"
  on loss_reasons for select using (is_owner_of_member(owner_id));

-- ─── CUSTOM FIELD GROUPS ─────────────────────────────────────────────────────

create policy "member_select_custom_field_groups"
  on custom_field_groups for select using (is_company_member(owner_id));

create policy "owner_reads_member_custom_field_groups"
  on custom_field_groups for select using (is_owner_of_member(owner_id));

-- ─── CUSTOM FIELD ITEMS ───────────────────────────────────────────────────────

create policy "member_select_custom_field_items"
  on custom_field_items for select using (is_company_member(owner_id));

create policy "owner_reads_member_custom_field_items"
  on custom_field_items for select using (is_owner_of_member(owner_id));
