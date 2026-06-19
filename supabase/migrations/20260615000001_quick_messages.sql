-- Mensagens rápidas do Multiatendimento (Configurações → Mensagens rápidas).
-- Respostas pré-definidas que o atendente insere no compositor do chat.
-- Escopo multi-tenant por owner_id (dono da empresa), igual a departments.
create table if not exists public.quick_messages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,                       -- dono da empresa (escopo RLS)
  company_id    uuid,                                -- empresa de origem
  title         text not null,                       -- nome/identificação da mensagem
  shortcut      text,                                -- atalho opcional (ex: /ola)
  content       text not null,                       -- conteúdo enviado
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.quick_messages enable row level security;

-- Dono: acesso total
create policy owner_all on public.quick_messages
  for all using (auth.uid() = owner_id);

-- Membros da empresa: leitura e gestão (igual aos demais recursos de config)
create policy member_select on public.quick_messages
  for select using (is_company_member(owner_id));
create policy member_insert on public.quick_messages
  for insert with check ((owner_id = auth.uid()) or is_company_member(owner_id));
create policy member_update on public.quick_messages
  for update using (is_company_member(owner_id));
create policy member_delete on public.quick_messages
  for delete using (is_company_member(owner_id));

create index if not exists idx_quick_messages_owner on public.quick_messages(owner_id);
