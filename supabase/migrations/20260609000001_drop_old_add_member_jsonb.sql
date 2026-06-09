-- Remove a versão antiga de add_member_to_company que recebia jsonb,
-- deixando apenas a versão text[] criada em 20260608000001_fix_invite_permissions.sql.
-- O conflito de assinaturas impedia o PostgreSQL de resolver qual função chamar.
drop function if exists public.add_member_to_company(text, jsonb);
