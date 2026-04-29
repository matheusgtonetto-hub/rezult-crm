create table if not exists public.pipeline_columns (
  id          uuid        primary key default gen_random_uuid(),
  pipeline_id uuid        not null references public.pipelines(id) on delete cascade,
  title       text        not null,
  color       text        not null default '#AAAAAA',
  position    integer     not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.pipeline_columns enable row level security;
