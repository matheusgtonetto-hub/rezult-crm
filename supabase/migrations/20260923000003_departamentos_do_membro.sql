-- Editar o departamento de quem JÁ está na equipe -- e fechar a porta que a
-- migration de ontem deixou aberta.
--
-- ─── O buraco ──────────────────────────────────────────────────────────────
--
-- `definir_departamentos_do_membro` nasceu em 20260923000001 para aplicar os
-- departamentos escolhidos no convite, no momento do aceite. Ela é
-- SECURITY DEFINER, NÃO checa quem chamou (não precisava: só era chamada de
-- dentro de outra função que já checava) e ficou com execute para `anon`.
--
-- `anon` é a chave pública, que vai no bundle do front e qualquer um lê. Com
-- ela, uma pessoa de fora podia chamar a função direto e trocar os
-- departamentos de qualquer membro de QUALQUER empresa -- ou seja, mudar quem
-- enxerga quais conversas no Multiatendimento.
--
-- É o mesmo erro encontrado em 22/09/2026 nas funções de item do negócio: o
-- privilégio vem de PUBLIC, e revogar de anon/authenticated sem revogar de
-- public não tira nada.

-- ── 1. A função interna deixa de ser alcançável de fora ────────────────────
-- Quem a chama são `add_member_to_company` e `accept_my_pending_invites`, as
-- duas SECURITY DEFINER: elas rodam como o dono da função e seguem chamando
-- normalmente. O que some é a porta pela API.
revoke execute on function public.definir_departamentos_do_membro(uuid, uuid, uuid[]) from public;
revoke execute on function public.definir_departamentos_do_membro(uuid, uuid, uuid[]) from anon;
revoke execute on function public.definir_departamentos_do_membro(uuid, uuid, uuid[]) from authenticated;
grant execute on function public.definir_departamentos_do_membro(uuid, uuid, uuid[]) to service_role;

comment on function public.definir_departamentos_do_membro(uuid, uuid, uuid[]) is
  'INTERNA: aplica os departamentos no aceite do convite. Nao checa quem chamou, por isso nao e exposta pela API. A tela usa atualizar_departamentos_do_membro.';

-- ── 2. A porta da tela, com tranca ─────────────────────────────────────────
-- Mesma mecânica, mas com a checagem que a interna não faz. Existe separada
-- porque o aceite do convite é chamado pela PRÓPRIA pessoa convidada, que
-- ainda não é admin: a checagem de admin quebraria o aceite se fosse na mesma
-- função.
create or replace function public.atualizar_departamentos_do_membro(
  p_company_id     uuid,
  p_user_id        uuid,
  p_department_ids uuid[]
) returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pode boolean := false;
begin
  -- Mesma porta do update_member_permissions: dono da empresa ou admin dela.
  select true into v_pode
  from companies c
  where c.id = p_company_id
    and (
      c.owner_id = auth.uid()
      or exists (
        select 1 from company_members cm
        where cm.company_id = c.id
          and cm.user_id    = auth.uid()
          and 'admin' = any(cm.permissions)
      )
    )
  limit 1;

  if not coalesce(v_pode, false) then
    return 'no_permission';
  end if;

  if public.empresa_bloqueada(p_company_id) then
    raise exception 'conta em somente leitura: pagamento em aberto';
  end if;

  -- O alvo precisa ser da empresa. Sem isto, um id qualquer entraria no array
  -- de atendentes de um departamento.
  if not exists (
    select 1 from company_members
    where company_id = p_company_id and user_id = p_user_id
    union all
    select 1 from companies where id = p_company_id and owner_id = p_user_id
  ) then
    return 'nao_e_membro';
  end if;

  -- O dono NÃO é exceção aqui, ao contrário das permissões: admin enxerga
  -- todas as telas, mas é o departamento que decide QUAIS CONVERSAS ele vê no
  -- Multiatendimento, e isso vale para ele também.
  perform public.definir_departamentos_do_membro(p_company_id, p_user_id, p_department_ids);
  return 'ok';
end;
$$;

comment on function public.atualizar_departamentos_do_membro(uuid, uuid, uuid[]) is
  'Define de quais departamentos um membro faz parte. Só dono ou admin da empresa. Usada pela tela de Usuarios e acessos.';

revoke execute on function public.atualizar_departamentos_do_membro(uuid, uuid, uuid[]) from public;
grant execute on function public.atualizar_departamentos_do_membro(uuid, uuid, uuid[]) to authenticated, service_role;

-- O Supabase concede execute a anon e authenticated por privilégio PADRÃO em
-- função nova do schema public. Esse grant não vem de PUBLIC, então o revoke
-- acima não o alcança: anon precisa ser revogado pelo nome. A função checa
-- auth.uid() e devolveria 'no_permission' de qualquer jeito, mas porta que não
-- precisa existir não fica aberta.
revoke execute on function public.atualizar_departamentos_do_membro(uuid, uuid, uuid[]) from anon;
