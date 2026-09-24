-- Fecha as quatro funções de LEITURA que a chave anon alcançava.
--
-- Continuação de 20260924000001, que fechou as três que escrevem. Estas quatro
-- não escrevem nada: o que vazavam era estrutura (a que empresa pertence um
-- id, se uma empresa escuta um gatilho). Risco pequeno, mas porta que não
-- precisa existir não fica aberta.
--
-- ─── Elas NÃO fecham do mesmo jeito, e o motivo importa ─────────────────────
--
-- `empresa_do_lead` e `empresa_da_lista` são usadas DENTRO de policies de RLS
-- (bloqueio_cobranca_insert/update/delete, lead_files_update/delete,
-- delete_lead_files). Uma policy é avaliada como o usuário que faz a consulta,
-- e uma função sem EXECUTE ali não faz a policy negar a linha: faz a consulta
-- ESTOURAR. Testado nesta base, com rollback:
--
--     permission denied for function empresa_do_lead
--
-- Tirar o execute de `authenticated` nessas duas derrubaria criar, editar e
-- excluir lead e arquivo de lead, para todo mundo. Por isso elas perdem só o
-- `anon`, que não tem operação legítima nessas tabelas.
--
-- As outras duas só são chamadas por funções SECURITY DEFINER
-- (mensagens/conversas_automation_trigger_fn e vincula_atendimento_ao_negocio),
-- que rodam como o dono: essas fecham inteiro.

-- ── Fecham para todos, menos o service_role ───────────────────────────────
revoke execute on function public.alguma_automacao_escuta(uuid, text)       from public, anon, authenticated;
revoke execute on function public.negocio_do_atendimento(uuid, uuid, uuid)  from public, anon, authenticated;
grant  execute on function public.alguma_automacao_escuta(uuid, text)       to service_role;
grant  execute on function public.negocio_do_atendimento(uuid, uuid, uuid)  to service_role;

-- ── Perdem só o anônimo: quem está logado precisa delas para as policies ──
revoke execute on function public.empresa_do_lead(uuid)  from public, anon;
revoke execute on function public.empresa_da_lista(uuid) from public, anon;
grant  execute on function public.empresa_do_lead(uuid)  to authenticated, service_role;
grant  execute on function public.empresa_da_lista(uuid) to authenticated, service_role;
