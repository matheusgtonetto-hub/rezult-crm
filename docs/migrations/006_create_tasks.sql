create table if not exists public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references auth.users(id) on delete cascade,
  lead_id     uuid        references public.leads(id) on delete set null,
  lead_name   text        not null default '',
  title       text        not null,
  responsible text        not null default '',
  due_date    text        not null default '',
  status      text        not null default 'Pendente',
  created_at  timestamptz not null default now()
);

alter table public.tasks enable row level security;
