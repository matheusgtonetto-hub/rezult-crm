-- Tabela para armazenar mensagens do WhatsApp (recebidas via webhook Z-API e enviadas pelo CRM)
create table if not exists public.whatsapp_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  instance_id text not null,
  phone       text not null,       -- telefone do contato (só dígitos)
  message_id  text,                -- ID da mensagem na Z-API (para deduplicação)
  from_me     boolean not null default false,
  body        text,
  type        text not null default 'text',
  momment     bigint,              -- timestamp unix em ms (vindo da Z-API)
  chat_name   text,
  sender_name text,
  created_at  timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_message_id_idx
  on public.whatsapp_messages(message_id)
  where message_id is not null;

create index if not exists whatsapp_messages_owner_phone_idx
  on public.whatsapp_messages(owner_id, phone, created_at desc);

alter table public.whatsapp_messages enable row level security;

create policy "owner select" on public.whatsapp_messages
  for select using (auth.uid() = owner_id);

create policy "owner insert" on public.whatsapp_messages
  for insert with check (auth.uid() = owner_id);

-- Habilitar realtime nesta tabela (rodar separadamente no dashboard se necessário)
-- alter publication supabase_realtime add table public.whatsapp_messages;
