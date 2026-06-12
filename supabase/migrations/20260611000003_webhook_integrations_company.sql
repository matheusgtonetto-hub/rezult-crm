-- Adiciona company_id em webhook_integrations para isolamento multi-tenant.
-- Integrações existentes sem company_id continuam funcionando via owner_id.

alter table public.webhook_integrations
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists webhook_integrations_company_id_idx
  on public.webhook_integrations(company_id);
