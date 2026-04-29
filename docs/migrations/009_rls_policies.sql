-- ── profiles ──────────────────────────────────────────────────────────────
create policy "profiles: owner select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: owner insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id);

-- ── pipelines ─────────────────────────────────────────────────────────────
create policy "pipelines: ver próprios"
  on public.pipelines for select
  using (owner_id = auth.uid());

create policy "pipelines: criar próprios"
  on public.pipelines for insert
  with check (owner_id = auth.uid());

create policy "pipelines: editar próprios"
  on public.pipelines for update
  using (owner_id = auth.uid());

create policy "pipelines: excluir próprios"
  on public.pipelines for delete
  using (owner_id = auth.uid());

-- ── pipeline_columns ──────────────────────────────────────────────────────
create policy "pipeline_columns: ver via pipeline"
  on public.pipeline_columns for select
  using (
    exists (
      select 1 from public.pipelines p
      where p.id = pipeline_columns.pipeline_id
        and p.owner_id = auth.uid()
    )
  );

create policy "pipeline_columns: criar via pipeline"
  on public.pipeline_columns for insert
  with check (
    exists (
      select 1 from public.pipelines p
      where p.id = pipeline_columns.pipeline_id
        and p.owner_id = auth.uid()
    )
  );

create policy "pipeline_columns: editar via pipeline"
  on public.pipeline_columns for update
  using (
    exists (
      select 1 from public.pipelines p
      where p.id = pipeline_columns.pipeline_id
        and p.owner_id = auth.uid()
    )
  );

create policy "pipeline_columns: excluir via pipeline"
  on public.pipeline_columns for delete
  using (
    exists (
      select 1 from public.pipelines p
      where p.id = pipeline_columns.pipeline_id
        and p.owner_id = auth.uid()
    )
  );

-- ── leads ─────────────────────────────────────────────────────────────────
create policy "leads: ver próprios"
  on public.leads for select
  using (owner_id = auth.uid());

create policy "leads: criar próprios"
  on public.leads for insert
  with check (owner_id = auth.uid());

create policy "leads: editar próprios"
  on public.leads for update
  using (owner_id = auth.uid());

create policy "leads: excluir próprios"
  on public.leads for delete
  using (owner_id = auth.uid());

-- ── activities ────────────────────────────────────────────────────────────
create policy "activities: ver próprias"
  on public.activities for select
  using (owner_id = auth.uid());

create policy "activities: criar próprias"
  on public.activities for insert
  with check (owner_id = auth.uid());

create policy "activities: editar próprias"
  on public.activities for update
  using (owner_id = auth.uid());

create policy "activities: excluir próprias"
  on public.activities for delete
  using (owner_id = auth.uid());

-- ── tasks ─────────────────────────────────────────────────────────────────
create policy "tasks: ver próprias"
  on public.tasks for select
  using (owner_id = auth.uid());

create policy "tasks: criar próprias"
  on public.tasks for insert
  with check (owner_id = auth.uid());

create policy "tasks: editar próprias"
  on public.tasks for update
  using (owner_id = auth.uid());

create policy "tasks: excluir próprias"
  on public.tasks for delete
  using (owner_id = auth.uid());

-- ── products ──────────────────────────────────────────────────────────────
create policy "products: ver próprios"
  on public.products for select
  using (owner_id = auth.uid());

create policy "products: criar próprios"
  on public.products for insert
  with check (owner_id = auth.uid());

create policy "products: editar próprios"
  on public.products for update
  using (owner_id = auth.uid());

create policy "products: excluir próprios"
  on public.products for delete
  using (owner_id = auth.uid());
