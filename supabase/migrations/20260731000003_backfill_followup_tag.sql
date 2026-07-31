-- Backfill: garante a tag "Follow-up" em todas as empresas já existentes.
-- A partir de agora ela também é criada por padrão em toda empresa nova
-- (ver CompanyRegisterPage.tsx) e é aplicada automaticamente às conversas
-- quando um follow up é agendado no Multiatendimento.

insert into public.tags (owner_id, company_id, name, color)
select c.owner_id, c.id, 'Follow-up', '#A32D2D'
from public.companies c
where not exists (
  select 1 from public.tags t
  where t.company_id = c.id and t.name = 'Follow-up'
);
