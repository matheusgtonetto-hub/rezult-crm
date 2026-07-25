-- =============================================================
-- Vincula whatsapp_conversations a contacts (só canal whatsapp —
-- Instagram usa ID de usuário Meta, não telefone). Completa a RLS
-- de contacts com a checagem 'leads:restricted', que depende de
-- leads.person_id (fase B) e whatsapp_conversations.contact_id
-- (nesta fase), por isso não podia ir junto na fase A.
-- =============================================================

alter table public.whatsapp_conversations
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists idx_whatsapp_conversations_contact_id on public.whatsapp_conversations(contact_id);

-- Backfill best-effort das conversas existentes (poucas linhas hoje).
update public.whatsapp_conversations wc
set contact_id = c.id
from public.contacts c
where wc.contact_id is null
  and wc.channel = 'whatsapp'
  and coalesce(wc.phone, '') <> ''
  and c.company_id = wc.company_id
  and c.phone_normalized = public.normalize_br_phone(wc.phone);

-- Completa as policies de select/update com a checagem 'leads:restricted'.
drop policy if exists "company_member_select_contacts" on contacts;
create policy "company_member_select_contacts" on contacts for select using (
  exists (
    select 1 from company_members cm
    join profiles p on p.id = auth.uid()
    where cm.company_id = contacts.company_id
      and cm.user_id = auth.uid()
      and (
        'admin' = any(cm.permissions) or 'leads:admin' = any(cm.permissions)
        or 'leads:member' = any(cm.permissions) or 'leads:operator' = any(cm.permissions)
        or (
          'leads:restricted' = any(cm.permissions) and (
            exists (select 1 from leads l where l.person_id = contacts.id
              and (l.responsible = p.full_name or l.responsibles @> jsonb_build_array(p.full_name)))
            or exists (select 1 from whatsapp_conversations wc where wc.contact_id = contacts.id and wc.assigned_to = p.full_name)
          )
        )
      )
  )
);

drop policy if exists "company_member_update_contacts" on contacts;
create policy "company_member_update_contacts" on contacts for update using (
  exists (
    select 1 from company_members cm
    join profiles p on p.id = auth.uid()
    where cm.company_id = contacts.company_id
      and cm.user_id = auth.uid()
      and (
        'admin' = any(cm.permissions) or 'leads:admin' = any(cm.permissions)
        or 'leads:member' = any(cm.permissions) or 'leads:operator' = any(cm.permissions)
        or (
          'leads:restricted' = any(cm.permissions) and (
            exists (select 1 from leads l where l.person_id = contacts.id
              and (l.responsible = p.full_name or l.responsibles @> jsonb_build_array(p.full_name)))
            or exists (select 1 from whatsapp_conversations wc where wc.contact_id = contacts.id and wc.assigned_to = p.full_name)
          )
        )
      )
  )
);
