-- Permite que o dono de uma empresa veja os perfis dos membros da sua empresa
-- (necessário para listar membros ativos na tela de Equipe)
create policy "company_owner_sees_members"
  on profiles
  for select
  using (
    auth.uid() = id
    or exists (
      select 1 from companies
      where companies.owner_id = auth.uid()
        and companies.name = profiles.company_name
    )
  );
