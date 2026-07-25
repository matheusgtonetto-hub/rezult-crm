-- =============================================================
-- Contatos (pessoas) separados de negócios (leads). Um contato pode
-- ter múltiplos leads/negócios ao longo do tempo. Esta migration só
-- cria a tabela base + RLS; o backfill a partir de leads existentes
-- e o vínculo leads.person_id vêm na próxima migration.
-- =============================================================

create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade, -- auditoria apenas
  name         text not null,
  phone        text,
  phone_ddi    text,
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Porta 1:1 de normalizeBrPhone (src/pages/MultiatendimentoPage.tsx:39-45).
-- Qualquer mudança na versão JS deve ser espelhada aqui.
create or replace function public.normalize_br_phone(raw text)
returns text language plpgsql immutable as $$
declare d text;
begin
  d := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  if length(d) > 11 and left(d, 2) = '55' then d := substring(d from 3); end if;
  if length(d) = 11 and substring(d from 3 for 1) = '9' then d := left(d, 2) || substring(d from 4); end if;
  return d;
end; $$;

alter table public.contacts
  add column if not exists phone_normalized text generated always as (public.normalize_br_phone(phone)) stored;

create index if not exists idx_contacts_company_id on public.contacts(company_id);

-- Hardening que hoje não existe em nenhuma tabela do app (leads e
-- whatsapp_conversations também não têm unicidade de telefone).
-- Protege a corrida em ensureContactForConversation (fase E do plano):
-- em caso de 23505, o app reaproveita a linha vencedora em vez de duplicar.
create unique index if not exists uq_contacts_company_phone_norm
  on public.contacts(company_id, phone_normalized) where phone_normalized <> '';

alter table public.contacts enable row level security;

-- Owner da empresa: acesso total
create policy "company_owner_contacts" on contacts for all using (
  exists (select 1 from companies where id = contacts.company_id and owner_id = auth.uid())
);

-- Membros: mesmas permissões de leads:*. Sem a checagem 'leads:restricted'
-- ainda (precisa de leads.person_id / whatsapp_conversations.contact_id,
-- que só existem a partir da fase C do plano).
create policy "company_member_select_contacts" on contacts for select using (
  exists (select 1 from company_members cm where cm.company_id = contacts.company_id
    and cm.user_id = auth.uid()
    and ('admin' = any(cm.permissions) or 'leads:admin' = any(cm.permissions)
      or 'leads:member' = any(cm.permissions) or 'leads:operator' = any(cm.permissions)))
);
create policy "company_member_insert_contacts" on contacts for insert with check (
  exists (select 1 from company_members cm where cm.company_id = contacts.company_id and cm.user_id = auth.uid())
);
create policy "company_member_update_contacts" on contacts for update using (
  exists (select 1 from company_members cm where cm.company_id = contacts.company_id
    and cm.user_id = auth.uid()
    and ('admin' = any(cm.permissions) or 'leads:admin' = any(cm.permissions)
      or 'leads:member' = any(cm.permissions) or 'leads:operator' = any(cm.permissions)))
);
create policy "company_member_delete_contacts" on contacts for delete using (
  exists (select 1 from company_members cm where cm.company_id = contacts.company_id
    and cm.user_id = auth.uid() and ('admin' = any(cm.permissions) or 'leads:admin' = any(cm.permissions)))
);
