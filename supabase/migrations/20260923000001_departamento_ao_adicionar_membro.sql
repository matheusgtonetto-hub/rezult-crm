-- O departamento entra na hora de adicionar o membro (dono, 23/09/2026).
--
-- Antes, o vínculo só existia do lado do DEPARTAMENTO: criava-se o membro e
-- depois alguém precisava lembrar de ir em Configurações > Multiatendimento >
-- Departamentos > editar > marcar o nome. Quem esquecia deixava a pessoa
-- CEGA, e não é figura de linguagem: com a visibilidade por departamento,
-- quem não está em nenhum e não tem conversa atribuída nem negócio próprio
-- abre o Multiatendimento e não vê conversa nenhuma, sem nada explicando por
-- quê.

-- O convite guarda o departamento escolhido. Quem foi convidado e ainda não
-- criou a conta NÃO TEM user_id, e `departments.attendant_ids` é uma lista de
-- ids de perfil -- não há a quem vincular ainda. Fica aqui até o aceite, no
-- mesmo lugar onde `permissions` já espera.
alter table public.company_invites
  add column if not exists department_ids uuid[] not null default '{}';

comment on column public.company_invites.department_ids is
  'Departamentos escolhidos no convite. Aplicados em departments.attendant_ids quando a pessoa aceita (ver accept_my_pending_invites).';

/*
 * Põe (ou tira) uma pessoa dos departamentos de uma empresa.
 *
 * Escreve nos DOIS campos, como a tela de departamentos faz: `attendant_ids` é
 * o vínculo que vale e `attendants` é o espelho com o nome, que é o que várias
 * telas ainda leem. Gravar só um deixaria a lista em branco de um lado.
 *
 * É uma sincronização, e não um append: a pessoa sai dos departamentos que não
 * estão na lista. Sem isso, editar um membro só acrescentaria acesso, e tirar
 * alguém de um time exigiria voltar na outra tela -- o problema que esta
 * migration existe para resolver, invertido.
 */
create or replace function public.definir_departamentos_do_membro(
  p_company_id uuid,
  p_user_id uuid,
  p_department_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if p_company_id is null or p_user_id is null then return; end if;

  select full_name into v_nome from profiles where id = p_user_id;

  -- Sai de todos os departamentos da empresa que não foram escolhidos.
  update departments d
     set attendant_ids = array_remove(d.attendant_ids, p_user_id),
         attendants = case
           when v_nome is null then d.attendants
           else array_remove(d.attendants, v_nome)
         end
   where d.company_id = p_company_id
     and p_user_id = any(d.attendant_ids)
     and not (d.id = any(coalesce(p_department_ids, '{}'::uuid[])));

  -- Entra nos escolhidos, sem duplicar quem já está.
  update departments d
     set attendant_ids = array_append(d.attendant_ids, p_user_id),
         attendants = case
           when v_nome is null or v_nome = any(d.attendants) then d.attendants
           else array_append(d.attendants, v_nome)
         end
   where d.company_id = p_company_id
     and d.id = any(coalesce(p_department_ids, '{}'::uuid[]))
     and not (p_user_id = any(d.attendant_ids));
end;
$$;

revoke execute on function public.definir_departamentos_do_membro(uuid, uuid, uuid[]) from public;
grant execute on function public.definir_departamentos_do_membro(uuid, uuid, uuid[]) to authenticated, service_role;

-- A função de adicionar membro ganha o parâmetro. Precisa de DROP: um quarto
-- argumento com DEFAULT criaria uma sobrecarga, e a chamada de três argumentos
-- que o app faz hoje ficaria ambígua entre as duas ("function is not unique").
drop function if exists public.add_member_to_company(text, text[], uuid);

create or replace function public.add_member_to_company(
  member_email text,
  member_permissions text[],
  p_company_id uuid default null::uuid,
  p_department_ids uuid[] default '{}'::uuid[]
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_company_id  uuid;
  v_inviter_id  uuid := auth.uid();
  v_existing_id uuid;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
  ELSE
    SELECT id INTO v_company_id FROM companies WHERE owner_id = v_inviter_id LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RETURN 'no_company';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM companies WHERE id = v_company_id AND owner_id = v_inviter_id
  ) AND NOT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = v_company_id AND user_id = v_inviter_id
      AND 'admin' = ANY(permissions)
  ) THEN
    RAISE EXCEPTION 'Sem permissao para convidar membros';
  END IF;

  IF public.empresa_bloqueada(v_company_id) THEN
    RAISE EXCEPTION 'conta em somente leitura: pagamento em aberto';
  END IF;

  SELECT id INTO v_existing_id FROM profiles WHERE email = member_email LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    INSERT INTO company_members (company_id, user_id, permissions)
    VALUES (v_company_id, v_existing_id, coalesce(member_permissions, '{}'::text[]))
    ON CONFLICT (company_id, user_id)
    DO UPDATE SET permissions = EXCLUDED.permissions;

    -- Já tem conta, então o vínculo é imediato.
    PERFORM public.definir_departamentos_do_membro(v_company_id, v_existing_id, p_department_ids);
    RETURN 'ok';
  ELSE
    INSERT INTO company_invites (company_id, email, permissions, invited_by, department_ids)
    VALUES (v_company_id, member_email, coalesce(member_permissions, '{}'::text[]), v_inviter_id, coalesce(p_department_ids, '{}'::uuid[]))
    ON CONFLICT (company_id, email)
    DO UPDATE SET permissions = EXCLUDED.permissions, invited_by = EXCLUDED.invited_by,
                  department_ids = EXCLUDED.department_ids, accepted_at = NULL;
    RETURN 'invited';
  END IF;
END;
$function$;

-- O aceite aplica o que ficou guardado no convite.
create or replace function public.accept_my_pending_invites()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_user_id    uuid;
  v_user_email text;
  v_invite     record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id;
  IF v_user_email IS NULL THEN RETURN; END IF;

  FOR v_invite IN
    SELECT company_id, permissions, department_ids
    FROM company_invites
    WHERE email = v_user_email AND accepted_at IS NULL
  LOOP
    INSERT INTO company_members (company_id, user_id, permissions)
    VALUES (v_invite.company_id, v_user_id, coalesce(v_invite.permissions, '{}'::text[]))
    ON CONFLICT (company_id, user_id) DO NOTHING;

    -- Agora existe user_id, então o departamento escolhido no convite vira
    -- vínculo de verdade. Sem esta linha a pessoa aceitaria o convite e abriria
    -- o Multiatendimento vazia, que é o defeito que esta migration corrige.
    IF coalesce(array_length(v_invite.department_ids, 1), 0) > 0 THEN
      PERFORM public.definir_departamentos_do_membro(v_invite.company_id, v_user_id, v_invite.department_ids);
    END IF;

    UPDATE company_invites SET accepted_at = now()
    WHERE email = v_user_email AND company_id = v_invite.company_id;
  END LOOP;
END;
$function$;
