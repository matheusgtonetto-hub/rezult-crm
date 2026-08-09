-- Chave de provedor de IA é credencial DA EMPRESA, igual ao token da D-API
-- em whatsapp_connections e ao access token da Meta em meta_connections,
-- que já usam is_member_of. Fica no mesmo padrão.
--
-- A política original era `owner_id = auth.uid()`, e owner_id é quem DIGITOU
-- a chave, não o dono da empresa. Quem cadastrasse a chave para um cliente
-- deixava o cliente sem enxergar a própria credencial: tela vazia, sem poder
-- trocar nem revogar, enquanto o agente usava a chave normalmente (a edge
-- function lê por company_id com service role, ignorando RLS).
--
-- O with_check original também não checava a empresa, então qualquer
-- autenticado podia inserir uma chave no company_id de terceiros e trocar a
-- credencial que o agente daquela empresa usaria. Agora exige vínculo.
--
-- owner_id continua gravado como registro de quem cadastrou, mas não manda
-- mais no acesso.
drop policy if exists "owner manages ai provider keys" on public.ai_provider_keys;

create policy "membros da empresa gerenciam chaves de ia"
on public.ai_provider_keys
for all
using (public.is_member_of(company_id))
with check (public.is_member_of(company_id));
