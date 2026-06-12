-- Corrige acesso de MEMBROS (não-donos) a recursos que estavam restritos só ao dono.
--
-- Contexto: o app é multi-tenant por empresa e membros de equipe (company_members)
-- acessam a empresa do dono. As tabelas `automations`, `leads`, `tags` já tinham
-- políticas member_*; porém `automation_logs`, `custom_field_groups` e
-- `custom_field_items` ficaram só com políticas de dono. Resultado:
--   • Bug 1: membro não conseguia LER os logs de execução das automações
--            (apareciam vazios mesmo com a automação rodando).
--   • Bug 2: membro não conseguia EXCLUIR/EDITAR grupos e perguntas de campos
--            adicionais (o DELETE batia em RLS, afetava 0 linhas sem erro, e o
--            item "voltava" ao atualizar a página).

-- ── Bug 1: logs de automação legíveis por membros ───────────────────────────
drop policy if exists member_read_automation_logs on public.automation_logs;
create policy member_read_automation_logs on public.automation_logs
  for select using (public.is_member_of(company_id));

-- ── Bug 2: membros podem editar/excluir campos adicionais ────────────────────
drop policy if exists member_update_custom_field_groups on public.custom_field_groups;
create policy member_update_custom_field_groups on public.custom_field_groups
  for update using (public.is_company_member(owner_id));

drop policy if exists member_delete_custom_field_groups on public.custom_field_groups;
create policy member_delete_custom_field_groups on public.custom_field_groups
  for delete using (public.is_company_member(owner_id));

drop policy if exists member_update_custom_field_items on public.custom_field_items;
create policy member_update_custom_field_items on public.custom_field_items
  for update using (public.is_company_member(owner_id));

drop policy if exists member_delete_custom_field_items on public.custom_field_items;
create policy member_delete_custom_field_items on public.custom_field_items
  for delete using (public.is_company_member(owner_id));
