-- Função SECURITY DEFINER para buscar a empresa da qual o usuário é membro.
-- Bypassa RLS, evitando conflitos entre policies na tabela companies.
-- Retorna apenas a empresa cujo owner_id != auth.uid() e cujo name
-- corresponde ao company_name do perfil do usuário logado.

create or replace function get_my_member_company()
returns setof companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text;
begin
  select company_name into v_company_name
  from profiles
  where id = auth.uid()
    and company_name is not null;

  if v_company_name is not null then
    return query
    select * from companies
    where name = v_company_name
      and owner_id != auth.uid()
    limit 1;
  end if;
end;
$$;
