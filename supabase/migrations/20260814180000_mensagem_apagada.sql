-- Apagar mensagem: marca quando foi apagada, em vez de remover a linha.
--
-- Apagar de verdade destruiria o histórico do atendimento, que é justamente o
-- registro que o CRM existe para guardar. O WhatsApp faz igual: a mensagem
-- continua na conversa, com "Esta mensagem foi apagada" no lugar do conteúdo.
--
-- Guardamos QUEM apagou junto, porque numa caixa compartilhada "sumiu uma
-- mensagem" sem autor vira discussão entre atendentes.

alter table public.whatsapp_messages
  add column if not exists deleted_at timestamptz;

alter table public.whatsapp_messages
  add column if not exists deleted_by text;

comment on column public.whatsapp_messages.deleted_at is
  'Quando a mensagem foi apagada no WhatsApp. Null = mensagem ativa. A linha e o corpo permanecem: o historico do atendimento nao se apaga.';

comment on column public.whatsapp_messages.deleted_by is
  'Nome de quem apagou. Em caixa compartilhada, mensagem que some sem autor vira discussao entre atendentes.';

-- Contagem de mensagens ativas de uma conversa, que é o padrão da tela. Parcial
-- porque a esmagadora maioria não foi apagada, e um índice sobre todas seria
-- quase todo nulo.
create index if not exists idx_msgs_apagadas
  on public.whatsapp_messages (conversation_id, deleted_at)
  where deleted_at is not null;
