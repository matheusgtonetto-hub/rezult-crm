-- Trigger que auto-vincula novos usuários ao perfil de empresa que os convidou.
-- Disparado após INSERT em profiles (criado pelo AuthContext após sign-up).
-- Se o e-mail constar em company_invites com accepted_at null,
-- insere em company_members e marca o convite como aceito.

create or replace function handle_invited_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite record;
begin
  select company_id into v_invite
  from company_invites
  where email = new.email
    and accepted_at is null
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

drop trigger if exists on_profile_created_link_invite on profiles;

create trigger on_profile_created_link_invite
  after insert on profiles
  for each row execute function handle_invited_user();
