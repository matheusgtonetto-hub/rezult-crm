-- Corrige o fluxo de convite de membros:
-- 1. add_member_to_company sempre roteia por company_invites (nunca direto para company_members)
-- 2. handle_invited_user passa permissions ao aceitar convite de novo usuário
-- 3. accept_my_pending_invites() aceita convites pendentes para usuários já existentes

-- ── 1. add_member_to_company: sempre cria convite pendente ────────────────────

drop function if exists public.add_member_to_company(text, text[]);
drop function if exists public.add_member_to_company(text, jsonb);
drop function if exists public.add_member_to_company(text);

create or replace function add_member_to_company(
  member_email       text,
  member_permissions text[] default '{}'
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
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

  -- Sempre insere em company_invites, independente de o usuário já ter perfil.
  -- Para usuários existentes, accept_my_pending_invites() aceita ao fazer login.
  insert into company_invites (company_id, email, invited_by, permissions)
  values (v_company_id, member_email, auth.uid(), member_permissions)
  on conflict (company_id, email) do update
    set permissions = excluded.permissions,
        invited_by  = excluded.invited_by,
        accepted_at = null;

  return 'invited';
end;
$$;

-- ── 2. handle_invited_user: inclui permissions ao aceitar convite ─────────────

create or replace function handle_invited_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite record;
begin
  select company_id, permissions
  into v_invite
  from company_invites
  where email = new.email
    and accepted_at is null
  limit 1;

  if v_invite.company_id is not null then
    insert into company_members (company_id, user_id, permissions)
    values (v_invite.company_id, new.id, coalesce(v_invite.permissions, '{}'))
    on conflict (company_id, user_id) do nothing;

    update company_invites
    set accepted_at = now()
    where email = new.email
      and company_id = v_invite.company_id;
  end if;

  return new;
end;
$$;

-- ── 3. accept_my_pending_invites: aceita convites para usuários já existentes ─

create or replace function accept_my_pending_invites()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id    uuid;
  v_user_email text;
  v_invite     record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then return; end if;

  select email into v_user_email
  from profiles
  where id = v_user_id;

  if v_user_email is null then return; end if;

  for v_invite in
    select company_id, permissions
    from company_invites
    where email = v_user_email
      and accepted_at is null
  loop
    insert into company_members (company_id, user_id, permissions)
    values (v_invite.company_id, v_user_id, coalesce(v_invite.permissions, '{}'))
    on conflict (company_id, user_id) do nothing;

    update company_invites
    set accepted_at = now()
    where email = v_user_email
      and company_id = v_invite.company_id;
  end loop;
end;
$$;
