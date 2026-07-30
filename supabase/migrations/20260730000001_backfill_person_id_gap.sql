-- =============================================================
-- Fecha o gap remanescente de leads.person_id / whatsapp_conversations.contact_id
-- deixado pelo backfill original (20260725000002). Reaproveita a mesma lógica
-- (telefone normalizado, fallback e-mail), idempotente (ON CONFLICT / NOT
-- EXISTS), seguro pra re-executar. Os 2 conflitos de negócio aberto duplicado
-- já foram revisados e resolvidos manualmente antes desta migração (ver
-- leads #1114 e #1341-duplicata, marcados status='lost').
-- =============================================================

-- 1) Um contato por (company_id, telefone normalizado) entre leads com telefone
-- que ainda não tenham contato correspondente.
insert into public.contacts (company_id, owner_id, name, phone, phone_ddi, email)
select
  g.company_id,
  (array_agg(g.owner_id order by g.created_at, g.id))[1] as owner_id,
  (array_agg(g.name order by g.created_at, g.id))[1] as name,
  (array_agg(g.whatsapp order by g.created_at, g.id))[1] as phone,
  (array_agg(g.phone_ddi order by g.created_at, g.id))[1] as phone_ddi,
  (array_agg(g.email order by g.created_at, g.id) filter (where g.email is not null and g.email <> ''))[1] as email
from public.leads g
where g.person_id is null
  and public.normalize_br_phone(g.whatsapp) <> ''
group by g.company_id, public.normalize_br_phone(g.whatsapp)
on conflict (company_id, phone_normalized) where phone_normalized <> '' do nothing;

-- 2) Um contato por (company_id, e-mail) entre leads sem telefone mas com
-- e-mail, sem contato correspondente ainda.
insert into public.contacts (company_id, owner_id, name, email)
select
  g.company_id,
  (array_agg(g.owner_id order by g.created_at, g.id))[1],
  (array_agg(g.name order by g.created_at, g.id))[1],
  g.email
from public.leads g
where g.person_id is null
  and public.normalize_br_phone(g.whatsapp) = ''
  and g.email is not null and g.email <> ''
  and not exists (
    select 1 from public.contacts c where c.company_id = g.company_id and c.email = g.email
  )
group by g.company_id, g.email;

-- 3) Backfill leads.person_id via telefone normalizado.
update public.leads l
set person_id = c.id
from public.contacts c
where l.person_id is null
  and public.normalize_br_phone(l.whatsapp) <> ''
  and c.company_id = l.company_id
  and c.phone_normalized = public.normalize_br_phone(l.whatsapp);

-- 4) Backfill do restante (sem telefone) via e-mail.
update public.leads l
set person_id = c.id
from public.contacts c
where l.person_id is null
  and l.email is not null and l.email <> ''
  and c.company_id = l.company_id
  and c.email = l.email;

-- 5) whatsapp_conversations.contact_id via o mesmo critério de telefone
-- normalizado (mesmo gap identificado em 20260725000003).
update public.whatsapp_conversations wc
set contact_id = c.id
from public.contacts c
where wc.contact_id is null
  and wc.channel = 'whatsapp'
  and wc.company_id is not null
  and public.normalize_br_phone(wc.phone) <> ''
  and c.company_id = wc.company_id
  and c.phone_normalized = public.normalize_br_phone(wc.phone);
