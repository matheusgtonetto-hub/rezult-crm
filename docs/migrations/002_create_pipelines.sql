create table if not exists public.pipelines (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  category   text        not null default 'Venda',
  position   integer     not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pipelines enable row level security;
