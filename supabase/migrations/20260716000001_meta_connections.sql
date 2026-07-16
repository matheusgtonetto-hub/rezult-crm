-- Conexões Meta (Instagram / Messenger) por empresa
create table if not exists public.meta_connections (
  id                     uuid        default gen_random_uuid() primary key,
  owner_id               uuid        references auth.users(id) on delete cascade not null,
  company_id             uuid        not null,
  provider               text        not null check (provider in ('instagram', 'messenger')),
  page_id                text        not null,
  page_name              text,
  instagram_account_id   text,
  instagram_username     text,
  access_token           text        not null,
  token_expires_at       timestamptz,
  active                 boolean     default true not null,
  created_at             timestamptz default now() not null,
  unique (company_id, page_id, provider)
);

alter table public.meta_connections enable row level security;

create policy "owner_can_manage_meta_connections"
  on public.meta_connections for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Mensagens recebidas/enviadas via Instagram / Messenger
create table if not exists public.meta_messages (
  id             uuid        default gen_random_uuid() primary key,
  owner_id       uuid        references auth.users(id) on delete cascade not null,
  company_id     uuid        not null,
  connection_id  uuid        references public.meta_connections(id) on delete set null,
  lead_id        uuid        references public.leads(id) on delete set null,
  provider       text        not null check (provider in ('instagram', 'messenger')),
  direction      text        not null check (direction in ('in', 'out')),
  sender_id      text,
  recipient_id   text,
  message_id     text        unique,
  message_type   text        default 'text',
  content        text,
  media_url      text,
  status         text        default 'sent',
  raw_payload    jsonb,
  sent_at        timestamptz default now() not null
);

alter table public.meta_messages enable row level security;

create policy "owner_can_manage_meta_messages"
  on public.meta_messages for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

alter publication supabase_realtime add table public.meta_messages;
