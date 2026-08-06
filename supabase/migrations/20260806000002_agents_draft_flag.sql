-- "/agentes" vira grade de cards: um agente só aparece nela quando o wizard
-- de criação foi concluído (botão "Criar" no último passo). Enquanto isso,
-- draft=true -- existe no banco (pra cada passo do wizard poder salvar
-- algo contra um agent_id real), mas fica invisível na grade.
alter table agents add column if not exists draft boolean not null default false;

-- Rede de segurança pra rascunhos abandonados sem passar pelo fluxo normal
-- de "Cancelar" (fechar aba, crash do navegador) -- JS não garante limpeza
-- assíncrona em beforeunload/unmount nesses casos.
select cron.schedule('cleanup-draft-agents', '0 * * * *', $$
  delete from agents where draft = true and created_at < now() - interval '24 hours';
$$);
