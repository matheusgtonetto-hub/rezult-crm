-- Correção definitiva do fluxo de permissões de membros.
-- Garante que company_members.permissions seja text[] e que
-- add_member_to_company insira text[] corretamente.

-- 1. Converte permissions de jsonb para text[] se ainda for jsonb
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'company_members'
      and column_name  = 'permissions'
      and data_type    <> 'ARRAY'
  ) then
    alter table company_members add column if not exists permissions_new text[] not null default '{}';
    update company_members
    set permissions_new = array(
      select jsonb_array_elements_text(permissions)
    )
    where permissions is not null
      and jsonb_typeof(permissions) = 'array';
    alter table company_members drop column if exists permissions;
    alter table company_members rename column permissions_new to permissions;
  end if;
end;
$$;

-- 2. Remove overloads conflitantes
drop function if exists public.add_member_to_company(text, jsonb);
drop function if exists public.add_member_to_company(text, text[]);
drop function if exists public.add_member_to_company(text);

-- 3. Recria a função com assinatura correta
create or replace function add_member_to_company(
  member_email       text,
  member_permissions text[] default '{}'
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_member_id  uuid;
begin
  select id into v_company_id
  from companies
  where owner_id = auth.uid()
  order by
    case when plan <> 'free' then 0 else 1 end,
    plan_expires_at desc
  limit 1;

  if v_company_id is null then
    return 'no_company';
  end if;

  select id into v_member_id
  from profiles
  where email = member_email
  limit 1;

  if v_member_id is not null then
    insert into company_members (company_id, user_id, permissions)
    values (v_company_id, v_member_id, member_permissions)
    on conflict (company_id, user_id) do update
      set permissions = excluded.permissions;
    return 'ok';
  else
    insert into company_invites (company_id, email, invited_by, permissions)
    values (v_company_id, member_email, auth.uid(), member_permissions)
    on conflict (company_id, email) do update
      set permissions = excluded.permissions,
          invited_by  = excluded.invited_by;
    return 'invited';
  end if;
end;
$$;

-- 4. Garante que company_invites.permissions também seja text[]
alter table company_invites
  add column if not exists permissions text[] not null default '{}';
