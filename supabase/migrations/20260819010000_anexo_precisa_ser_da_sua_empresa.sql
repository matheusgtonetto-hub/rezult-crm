-- Anexo de lead só pode ser gravado em lead da sua própria empresa.
--
-- A política anterior era `owner_id = auth.uid()` e nada mais. O owner_id vem do
-- navegador no momento de gravar, então ele não prova nada sobre o lead: bastava
-- mandar o próprio id junto com o lead_id de QUALQUER empresa para a linha entrar.
--
-- Reproduzido em 2026-08-19: usuário da "Empresa teste" anexou arquivo num lead da
-- "Geomar Junior". Não é vazamento de leitura (a política também limita o SELECT
-- ao owner_id, então a empresa invadida nem enxerga o arquivo), mas é escrita
-- cruzando a fronteira entre contas, e enfraquecia o bloqueio por inadimplência:
-- sem saber de que empresa era o lead, não havia como perguntar se ela devia.
--
-- empresa_do_lead é SECURITY DEFINER e enxerga a tabela inteira de propósito.
-- Uma subconsulta comum aqui seria filtrada pelo RLS de quem está escrevendo e
-- devolveria NULL justamente no caso que precisamos barrar.
--
-- Impacto medido antes de aplicar: 1 anexo no banco, nenhum órfão e ninguém que
-- tenha deixado a empresa, ou seja, nenhuma linha existente perde acesso.
-- lead_files.lead_id tem FK ON DELETE CASCADE, então órfão não se acumula.

drop policy if exists own_lead_files on public.lead_files;

create policy own_lead_files on public.lead_files
  for all
  using      (owner_id = auth.uid() and public.is_member_of(public.empresa_do_lead(lead_id)))
  with check (owner_id = auth.uid() and public.is_member_of(public.empresa_do_lead(lead_id)));
