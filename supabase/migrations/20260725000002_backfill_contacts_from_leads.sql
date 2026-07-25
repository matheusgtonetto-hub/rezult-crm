-- =============================================================
-- Backfill de contacts a partir de leads existentes, agrupando por
-- telefone normalizado (fallback e-mail quando não há telefone).
-- Leads sem telefone e sem e-mail ficam com person_id nulo (não é bug).
-- Aditivo e seguro para re-execução (ON CONFLICT / NOT EXISTS).
-- =============================================================

alter table public.leads
  add column if not exists person_id uuid references public.contacts(id) on delete set null;

create index if not exists idx_leads_person_id on public.leads(person_id);

-- 1) Um contato por (company_id, telefone normalizado) entre leads com telefone.
insert into public.contacts (company_id, owner_id, name, phone, phone_ddi, email)
select
  g.company_id,
  (array_agg(g.owner_id order by g.created_at, g.id))[1] as owner_id,
  (array_agg(g.name order by g.created_at, g.id))[1] as name,
  (array_agg(g.whatsapp order by g.created_at, g.id))[1] as phone,
  (array_agg(g.phone_ddi order by g.created_at, g.id))[1] as phone_ddi,
  (array_agg(g.email order by g.created_at, g.id) filter (where g.email is not null and g.email <> ''))[1] as email
from public.leads g
where public.normalize_br_phone(g.whatsapp) <> ''
group by g.company_id, public.normalize_br_phone(g.whatsapp)
on conflict (company_id, phone_normalized) where phone_normalized <> '' do nothing;

-- 2) Um contato por (company_id, e-mail) entre leads sem telefone mas com e-mail,
-- que ainda não tenham um contato correspondente (idempotência em re-execução).
insert into public.contacts (company_id, owner_id, name, email)
select
  g.company_id,
  (array_agg(g.owner_id order by g.created_at, g.id))[1],
  (array_agg(g.name order by g.created_at, g.id))[1],
  g.email
from public.leads g
where public.normalize_br_phone(g.whatsapp) = ''
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
