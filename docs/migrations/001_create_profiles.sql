create table if not exists public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  name         text        not null default '',
  email        text        not null default '',
  full_name    text,
  phone        text,
  avatar_url   text,
  company_name text,
  role         text        not null default 'admin',
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
