create table if not exists public.tags (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  description text        not null default '',
  color       text        not null default '#128A68',
  created_at  timestamptz not null default now()
);

alter table public.tags enable row level security;

create policy "tags: ver próprias"
  on public.tags for select
  using (owner_id = auth.uid());

create policy "tags: criar próprias"
  on public.tags for insert
  with check (owner_id = auth.uid());

create policy "tags: editar próprias"
  on public.tags for update
  using (owner_id = auth.uid());

create policy "tags: excluir próprias"
  on public.tags for delete
  using (owner_id = auth.uid());
