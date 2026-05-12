-- Tabela para persistir conversas do multi-atendimento no Supabase
create table if not exists public.whatsapp_conversations (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  phone        text,
  channel      text not null default 'whatsapp',
  tags         text[] not null default '{}',
  company_name text,
  email        text,
  pipeline     text,
  deal_number  text,
  value        numeric,
  preview      text not null default '',
  last_msg_at  timestamptz not null default now(),
  -- metadata
  stage_idx    int not null default 0,
  notes        text not null default '',
  read         boolean not null default true,
  finished     boolean not null default false,
  meeting_date  text,
  meeting_time  text,
  meeting_owner text,
  meeting_note  text,
  created_at   timestamptz not null default now()
);

alter table public.whatsapp_conversations enable row level security;

create policy "owner all" on public.whatsapp_conversations
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index if not exists whatsapp_conversations_owner_idx
  on public.whatsapp_conversations(owner_id, last_msg_at desc);
