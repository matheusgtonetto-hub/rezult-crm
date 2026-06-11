-- Multiatendimento multi-tenant: as conversas/mensagens são da EMPRESA (owner_id =
-- dono da empresa). Antes só o dono (auth.uid() = owner_id) tinha acesso, então
-- membros da empresa não viam as conversas da empresa (e, no front, acabavam
-- vendo as próprias). Adiciona políticas de MEMBRO espelhando os demais recursos.

-- whatsapp_messages
create policy member_select_messages on public.whatsapp_messages
  for select using (is_company_member(owner_id));
create policy member_insert_messages on public.whatsapp_messages
  for insert with check (is_company_member(owner_id));

-- whatsapp_conversations
create policy member_select_conversations on public.whatsapp_conversations
  for select using (is_company_member(owner_id));
create policy member_insert_conversations on public.whatsapp_conversations
  for insert with check (is_company_member(owner_id));
create policy member_update_conversations on public.whatsapp_conversations
  for update using (is_company_member(owner_id));
create policy member_delete_conversations on public.whatsapp_conversations
  for delete using (is_company_member(owner_id));
