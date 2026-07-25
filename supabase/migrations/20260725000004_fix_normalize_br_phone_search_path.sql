-- Corrige alerta de segurança do Supabase (function_search_path_mutable):
-- normalize_br_phone (fase A) não tinha search_path fixo, mesmo padrão
-- já usado por is_member_of/shares_company_with neste projeto.
create or replace function public.normalize_br_phone(raw text)
returns text language plpgsql immutable set search_path = public as $$
declare d text;
begin
  d := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  if length(d) > 11 and left(d, 2) = '55' then d := substring(d from 3); end if;
  if length(d) = 11 and substring(d from 3 for 1) = '9' then d := left(d, 2) || substring(d from 4); end if;
  return d;
end; $$;
