create table if not exists public.products (
  id            uuid        primary key default gen_random_uuid(),
  owner_id      uuid        not null references auth.users(id) on delete cascade,
  name          text        not null,
  sku           text        not null default '',
  default_value numeric     not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.products enable row level security;
