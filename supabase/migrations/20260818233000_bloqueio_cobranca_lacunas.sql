-- Lacunas encontradas na revisão do bloqueio por inadimplência.
--
-- A migration anterior cobriu as 47 tabelas que têm company_id. Três caminhos de
-- escrita ficaram de fora porque não se ligam à empresa por essa coluna:
--
--   lead_files  → anexo de arquivo no lead, escopado por owner_id. Era o pior dos
--                 três: a tela grava direto (LeadDetailPage), sem passar pelo
--                 CRMContext, então não havia trava nem no cliente nem no banco.
--   list_leads  → leads dentro de uma lista, escopado pelo dono da lista.
--   RPCs de equipe → funções SECURITY DEFINER passam por cima do RLS por
--                 definição, então company_members estar protegida não bastava.
--
-- custom_fields também ficou sem trava e continua assim: é tabela legada, sem
-- nenhuma referência no aplicativo e sem vínculo com empresa para escrever a regra.

-- ── lead_files: a empresa vem pelo lead ──────────────────────────────────────
drop policy if exists bloqueio_cobranca_insert on public.lead_files;
drop policy if exists bloqueio_cobranca_update on public.lead_files;
drop policy if exists bloqueio_cobranca_delete on public.lead_files;

create policy bloqueio_cobranca_insert on public.lead_files as restrictive
  for insert to authenticated
  with check (not public.empresa_bloqueada((select l.company_id from leads l where l.id = lead_id)));
create policy bloqueio_cobranca_update on public.lead_files as restrictive
  for update to authenticated
  using      (not public.empresa_bloqueada((select l.company_id from leads l where l.id = lead_id)))
  with check (not public.empresa_bloqueada((select l.company_id from leads l where l.id = lead_id)));
create policy bloqueio_cobranca_delete on public.lead_files as restrictive
  for delete to authenticated
  using (not public.empresa_bloqueada((select l.company_id from leads l where l.id = lead_id)));

-- ── list_leads: a empresa vem pela lista ─────────────────────────────────────
drop policy if exists bloqueio_cobranca_insert on public.list_leads;
drop policy if exists bloqueio_cobranca_update on public.list_leads;
drop policy if exists bloqueio_cobranca_delete on public.list_leads;

create policy bloqueio_cobranca_insert on public.list_leads as restrictive
  for insert to authenticated
  with check (not public.empresa_bloqueada((select li.company_id from lists li where li.id = list_id)));
create policy bloqueio_cobranca_update on public.list_leads as restrictive
  for update to authenticated
  using      (not public.empresa_bloqueada((select li.company_id from lists li where li.id = list_id)))
  with check (not public.empresa_bloqueada((select li.company_id from lists li where li.id = list_id)));
create policy bloqueio_cobranca_delete on public.list_leads as restrictive
  for delete to authenticated
  using (not public.empresa_bloqueada((select li.company_id from lists li where li.id = list_id)));

-- ── RPCs de equipe ───────────────────────────────────────────────────────────
--
-- Bloqueia só o que ENTREGA acesso: convidar membro e ampliar permissão. Remover
-- membro e cancelar convite seguem liberados de propósito, porque reduzem o uso
-- em vez de aumentar, e travar isso puniria quem está justamente enxugando a
-- conta para conseguir pagar.
--
-- Levanta exceção em vez de devolver um status novo: os chamadores tratam
-- `error`, mas quem recebe um texto desconhecido em handleRemove e
-- handleSavePermissions cai no caminho de sucesso e mostraria "salvo" sem ter
-- salvo nada.

create or replace function public.add_member_to_company(member_email text, member_permissions text[], p_company_id uuid DEFAULT NULL::uuid)
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
    RAISE EXCEPTION 'Sem permissão para convidar membros';
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
    RETURN 'ok';
  ELSE
    INSERT INTO company_invites (company_id, email, permissions, invited_by)
    VALUES (v_company_id, member_email, coalesce(member_permissions, '{}'::text[]), v_inviter_id)
    ON CONFLICT (company_id, email)
    DO UPDATE SET permissions = EXCLUDED.permissions, invited_by = EXCLUDED.invited_by, accepted_at = NULL;
    RETURN 'invited';
  END IF;
END;
$function$;

create or replace function public.update_member_permissions(p_member_id uuid, p_permissions text[], p_company_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_caller_can boolean := false;
BEGIN
  SELECT true INTO v_caller_can
  FROM companies c
  WHERE c.id = p_company_id
    AND (
      c.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM company_members cm
        WHERE cm.company_id = c.id
          AND cm.user_id    = auth.uid()
          AND 'admin' = ANY(cm.permissions)
      )
    )
  LIMIT 1;

  IF NOT COALESCE(v_caller_can, false) THEN
    RETURN 'no_permission';
  END IF;

  IF public.empresa_bloqueada(p_company_id) THEN
    RAISE EXCEPTION 'conta em somente leitura: pagamento em aberto';
  END IF;

  IF EXISTS (
    SELECT 1 FROM companies WHERE id = p_company_id AND owner_id = p_member_id
  ) THEN
    RETURN 'cannot_edit_owner';
  END IF;

  UPDATE company_members
  SET permissions = p_permissions
  WHERE user_id    = p_member_id
    AND company_id = p_company_id;

  RETURN 'ok';
END;
$function$;
