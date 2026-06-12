-- Permite EXCLUIR empresa para o dono e para membros "Administrador (acesso total)".
--
-- A tabela companies não tinha NENHUMA policy de DELETE — ou seja, ninguém
-- conseguia excluir uma empresa via API. Adiciona a capacidade, restrita a:
--   • dono da empresa (companies.owner_id = auth.uid())
--   • membro com permissão "admin" (acesso total) em company_members.permissions
--
-- A exclusão da linha em companies já tem ON DELETE CASCADE para todas as
-- tabelas relacionadas (leads, automations, tags, pipelines, tasks, etc.),
-- então apagar a empresa remove todos os seus dados.

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from companies c
    where c.id = p_company_id and c.owner_id = auth.uid()
  ) or exists (
    select 1 from company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.permissions ? 'admin'   -- jsonb: "admin" é elemento do array de permissões
  );
$$;

drop policy if exists admin_delete_company on public.companies;
create policy admin_delete_company on public.companies
  for delete using (public.is_company_admin(id));
