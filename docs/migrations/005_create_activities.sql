create table if not exists public.activities (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  lead_id     uuid        not null references public.leads(id) on delete cascade,
  type        text        not null,
  description text        not null,
  date        date        not null default current_date,
  created_at  timestamptz not null default now()
);

alter table public.activities enable row level security;
