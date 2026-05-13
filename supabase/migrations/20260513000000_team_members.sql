-- Tabela de convites pendentes de equipe
create table if not exists company_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade not null,
  email       text not null,
  invited_by  uuid references auth.users not null,
  accepted_at timestamptz,
  created_at  timestamptz default now(),
  unique(company_id, email)
);

alter table company_invites enable row level security;

create policy "owner_manage_invites" on company_invites
  for all using (
    exists (
      select 1 from companies
      where companies.id = company_invites.company_id
        and companies.owner_id = auth.uid()
    )
  );

-- Adiciona membro à empresa: vincula imediatamente se já tiver conta,
-- ou cria convite pendente para quando o e-mail criar sua conta
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
  select id, name into v_company_id, v_company_name
  from companies
  where owner_id = auth.uid()
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

-- Remove vínculo de um membro da empresa
create or replace function remove_member_from_company(member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text;
begin
  select name into v_company_name
  from companies
  where owner_id = auth.uid()
  limit 1;

  update profiles
  set company_name = null
  where id = member_id and company_name = v_company_name;
end;
$$;

-- Cancela um convite pendente
create or replace function cancel_company_invite(invite_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select id into v_company_id
  from companies
  where owner_id = auth.uid()
  limit 1;

  delete from company_invites
  where company_id = v_company_id and email = invite_email;
end;
$$;

-- Trigger: quando um novo perfil é criado, verifica se há convite pendente
-- e vincula automaticamente à empresa que convidou
create or replace function handle_invited_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  select ci.company_id, c.name as company_name
  into v_invite
  from company_invites ci
  join companies c on c.id = ci.company_id
  where ci.email = new.email
    and ci.accepted_at is null
  limit 1;

  if v_invite.company_name is not null then
    new.company_name := v_invite.company_name;

    update company_invites
    set accepted_at = now()
    where email = new.email and company_id = v_invite.company_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_created_check_invite on profiles;
create trigger on_profile_created_check_invite
  before insert on profiles
  for each row execute procedure handle_invited_user();
