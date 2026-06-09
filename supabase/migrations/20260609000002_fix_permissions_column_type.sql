-- Converte company_members.permissions de jsonb para text[].
-- Usa coluna temporária para evitar subquery no USING clause.

-- 1. Nova coluna text[]
alter table company_members
  add column if not exists permissions_new text[] not null default '{}';

-- 2. Copia dados da coluna jsonb (se existir)
update company_members
set permissions_new = array(select jsonb_array_elements_text(permissions))
where permissions is not null
  and jsonb_typeof(permissions) = 'array';

-- 3. Remove coluna jsonb antiga
alter table company_members drop column if exists permissions;

-- 4. Renomeia nova coluna
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'company_members'
      and column_name  = 'permissions_new'
  ) then
    alter table company_members rename column permissions_new to permissions;
  end if;
end;
$$;
