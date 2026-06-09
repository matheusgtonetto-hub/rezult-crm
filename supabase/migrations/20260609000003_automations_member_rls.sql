-- Permite que membros da empresa acessem as automações.
-- A tabela automations tem RLS por owner_id, mas membros acessam via company_id.

drop policy if exists "member_read_automations" on automations;
create policy "member_read_automations" on automations
  for select using (
    owner_id = auth.uid()
    or is_member_of(company_id)
  );

drop policy if exists "member_insert_automations" on automations;
create policy "member_insert_automations" on automations
  for insert with check (
    owner_id = auth.uid()
    or is_member_of(company_id)
  );

drop policy if exists "member_update_automations" on automations;
create policy "member_update_automations" on automations
  for update using (
    owner_id = auth.uid()
    or is_member_of(company_id)
  );

drop policy if exists "member_delete_automations" on automations;
create policy "member_delete_automations" on automations
  for delete using (
    owner_id = auth.uid()
    or is_member_of(company_id)
  );
