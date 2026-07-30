-- =============================================================
-- whatsapp_conversations precisa estar na publicação de realtime:
-- mudanças feitas em uma linha por outro atendente/aba/dispositivo
-- (tag, responsável, departamento, negócio vinculado, finalizar) só
-- eram refletidas na tela do Multiatendimento via F5 ou o botão
-- "Atualizar conversas" -- não havia listener nenhum na tabela.
-- Ver MultiatendimentoPage.tsx, canal waconv-global.
-- =============================================================

alter publication supabase_realtime add table public.whatsapp_conversations;
