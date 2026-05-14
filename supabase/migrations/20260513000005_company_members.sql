-- ─── COMPANY_MEMBERS TABLE ───────────────────────────────────────────────────

create table if not exists company_members (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade not null,
  user_id    uuid references auth.users not null,
  joined_at  timestamptz default now(),
  unique(company_id, user_id)
);

alter table company_members enable row level security;

create policy "owner_manage_company_members" on company_members
  for all using (
    exists (
      select 1 from companies
      where id = company_members.company_id
        and owner_id = auth.uid()
    )
  );

create policy "member_sees_own_membership" on company_members
  for select using (user_id = auth.uid());

-- ─── DATA MIGRATION ───────────────────────────────────────────────────────────

insert into company_members (company_id, user_id, joined_at)
select c.id, p.id, now()
from profiles p
join companies c on c.name = p.company_name
where p.id != c.owner_id and p.company_name is not null
on conflict (company_id, user_id) do nothing;

-- ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

-- True if auth.uid() is a member (not owner) of the company owned by p_owner_id
create or replace function is_company_member(p_owner_id uuid)
returns boolean stable language sql security definer set search_path = public as $$
  select auth.uid() != p_owner_id and exists (
    select 1 from company_members cm
    join companies c on c.id = cm.company_id
    where cm.user_id = auth.uid()
      and c.owner_id = p_owner_id
  )
$$;

-- True if auth.uid() owns the company that p_member_id is a member of
create or replace function is_owner_of_member(p_member_id uuid)
returns boolean stable language sql security definer set search_path = public as $$
  select auth.uid() != p_member_id and exists (
    select 1 from company_members cm
    join companies c on c.id = cm.company_id
    where cm.user_id = p_member_id
      and c.owner_id = auth.uid()
  )
$$;

-- True if auth.uid() is in company_members for the given company_id
create or replace function is_member_of(p_company_id uuid)
returns boolean stable language sql security definer set search_path = public as $$
  select exists (
    select 1 from company_members
    where company_id = p_company_id
      and user_id = auth.uid()
  )
$$;

-- True if auth.uid() and p_other_user_id share a company_members entry
create or replace function shares_company_with(p_other_user_id uuid)
returns boolean stable language sql security definer set search_path = public as $$
  select auth.uid() != p_other_user_id and exists (
    select 1 from company_members a
    join company_members b on b.company_id = a.company_id
    where a.user_id = auth.uid()
      and b.user_id = p_other_user_id
  )
$$;

-- Returns all companies where the user is a member (not owner)
create or replace function get_my_member_companies()
returns setof companies language plpgsql security definer set search_path = public as $$
begin
  return query
  select c.* from companies c
  join company_members cm on cm.company_id = c.id
  where cm.user_id = auth.uid()
    and c.owner_id != auth.uid()
  order by cm.joined_at;
end;
$$;

-- Returns the first company where the user is a member (backward compat)
create or replace function get_my_member_company()
returns setof companies language plpgsql security definer set search_path = public as $$
begin
  return query
  select c.* from companies c
  join company_members cm on cm.company_id = c.id
  where cm.user_id = auth.uid()
    and c.owner_id != auth.uid()
  order by cm.joined_at
  limit 1;
end;
$$;

-- Returns profiles of owner + all members for a given company
-- Accessible by both the owner and any member of that company
create or replace function get_company_members(p_company_id uuid)
returns table(user_id uuid, full_name text, email text, avatar_url text)
language sql security definer set search_path = public as $$
  select p.id, p.full_name, p.email, p.avatar_url
  from companies c
  join profiles p on p.id = c.owner_id
  where c.id = p_company_id
    and (c.owner_id = auth.uid() or is_member_of(p_company_id))
  union
  select p.id, p.full_name, p.email, p.avatar_url
  from company_members cm
  join profiles p on p.id = cm.user_id
  where cm.company_id = p_company_id
    and (
      exists (select 1 from companies where id = p_company_id and owner_id = auth.uid())
      or is_member_of(p_company_id)
    )
$$;

-- ─── UPDATE RPC FUNCTIONS ────────────────────────────────────────────────────

create or replace function add_member_to_company(member_email text)
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
    insert into company_members (company_id, user_id)
    values (v_company_id, v_member_id)
    on conflict do nothing;
    return 'ok';
  else
    insert into company_invites (company_id, email, invited_by)
    values (v_company_id, member_email, auth.uid())
    on conflict (company_id, email) do nothing;
    return 'invited';
  end if;
end;
$$;

create or replace function remove_member_from_company(member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  select id into v_company_id
  from companies
  where owner_id = auth.uid()
  limit 1;

  delete from company_members
  where company_id = v_company_id
    and user_id = member_id;
end;
$$;

create or replace function handle_invited_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite record;
begin
  select ci.company_id
  into v_invite
  from company_invites ci
  where ci.email = new.email
    and ci.accepted_at is null
  limit 1;

  if v_invite.company_id is not null then
    insert into company_members (company_id, user_id)
    values (v_invite.company_id, new.id)
    on conflict do nothing;

    update company_invites
    set accepted_at = now()
    where email = new.email
      and company_id = v_invite.company_id;
  end if;

  return new;
end;
$$;

-- ─── UPDATE RLS ON COMPANIES ─────────────────────────────────────────────────

drop policy if exists "member_read_company" on companies;
create policy "member_read_company" on companies
  for select using (is_member_of(id));

-- ─── UPDATE RLS ON PROFILES ──────────────────────────────────────────────────

drop policy if exists "company_owner_sees_members" on profiles;
create policy "company_owner_sees_members" on profiles
  for select using (auth.uid() = id or is_owner_of_member(id));

drop policy if exists "member_sees_team_profiles" on profiles;
create policy "member_sees_team_profiles" on profiles
  for select using (is_company_member(id) or shares_company_with(id));

-- ─── INSERT POLICIES FOR MEMBERS ON DATA TABLES ──────────────────────────────

create policy "member_insert_leads" on leads for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_activities" on activities for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_tasks" on tasks for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_pipelines" on pipelines for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_pipeline_groups" on pipeline_groups for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_tags" on tags for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_products" on products for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_loss_reasons" on loss_reasons for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_custom_field_groups" on custom_field_groups for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_custom_field_items" on custom_field_items for insert
  with check (owner_id = auth.uid() or is_company_member(owner_id));

create policy "member_insert_pipeline_columns" on pipeline_columns for insert
  with check (
    exists (
      select 1 from pipelines p
      where p.id = pipeline_columns.pipeline_id
        and (p.owner_id = auth.uid() or is_company_member(p.owner_id))
    )
  );
