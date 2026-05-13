-- Corrige add_member_to_company para usar a mesma empresa que o CompanyContext
-- (ordena por plan_expires_at desc, prefere plano pago — igual ao frontend)
create or replace function add_member_to_company(member_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id   uuid;
  v_company_name text;
  v_member_id    uuid;
begin
  -- Ordena igual ao CompanyContext: plan_expires_at desc, prefere plano pago
  select id, name into v_company_id, v_company_name
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
    update profiles set company_name = v_company_name where id = v_member_id;
    return 'ok';
  else
    insert into company_invites (company_id, email, invited_by)
    values (v_company_id, member_email, auth.uid())
    on conflict (company_id, email) do nothing;
    return 'invited';
  end if;
end;
$$;
