-- Corrige o fluxo de permissões no convite de membros:
-- 1. Garante coluna permissions em company_invites
-- 2. Atualiza add_member_to_company para aceitar e salvar permissions
-- 3. Atualiza handle_invited_user para copiar permissions do convite para company_members

-- 1. Coluna permissions em company_invites (se não existir)
alter table company_invites
  add column if not exists permissions text[] not null default '{}';

-- 2. Recria add_member_to_company com suporte a member_permissions
create or replace function add_member_to_company(
  member_email      text,
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
    -- Usuário já tem conta: insere direto em company_members com permissões
    insert into company_members (company_id, user_id, permissions)
    values (v_company_id, v_member_id, member_permissions)
    on conflict (company_id, user_id) do update
      set permissions = excluded.permissions;
    return 'ok';
  else
    -- Usuário sem conta: salva convite com permissões
    insert into company_invites (company_id, email, invited_by, permissions)
    values (v_company_id, member_email, auth.uid(), member_permissions)
    on conflict (company_id, email) do update
      set permissions = excluded.permissions,
          invited_by  = excluded.invited_by;
    return 'invited';
  end if;
end;
$$;

-- 3. Recria handle_invited_user para copiar permissions do convite
create or replace function handle_invited_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite record;
begin
  select company_id, permissions into v_invite
  from company_invites
  where email = new.email
    and accepted_at is null
  limit 1;

  if v_invite.company_id is not null then
    insert into company_members (company_id, user_id, permissions)
    values (v_invite.company_id, new.id, coalesce(v_invite.permissions, '{}'))
    on conflict (company_id, user_id) do update
      set permissions = excluded.permissions;

    update company_invites
    set accepted_at = now()
    where email = new.email
      and company_id = v_invite.company_id;
  end if;

  return new;
end;
$$;
