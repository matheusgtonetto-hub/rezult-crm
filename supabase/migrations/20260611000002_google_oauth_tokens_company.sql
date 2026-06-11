-- Adiciona company_id em google_oauth_tokens para isolamento multi-tenant.
-- Tokens existentes ficam com company_id = null e não serão exibidos para nenhuma empresa
-- (usuários precisam reconectar uma vez após esta migration).

alter table public.google_oauth_tokens
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

-- Remove constraint única antiga em user_id (permitia só 1 token por usuário global)
alter table public.google_oauth_tokens
  drop constraint if exists google_oauth_tokens_user_id_key;

-- Remove índice simples antigo e cria um único (user_id, company_id)
drop index if exists google_oauth_tokens_user_id_idx;

create unique index if not exists google_oauth_tokens_user_company_idx
  on public.google_oauth_tokens(user_id, company_id);

-- Índice simples por user_id para queries legadas
create index if not exists google_oauth_tokens_user_id_idx
  on public.google_oauth_tokens(user_id);
