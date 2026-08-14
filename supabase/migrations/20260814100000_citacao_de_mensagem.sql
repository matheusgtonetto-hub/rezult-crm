-- Responder citando mensagem — fatia 1 de 3: parar de jogar fora a citação que
-- já chega nos webhooks.
--
-- Hoje, quando o cliente responde citando uma mensagem específica, a citação é
-- descartada na entrada: os três webhooks leem corpo, tipo e telefone, e ignoram
-- o bloco de contexto. Na tela a atendente lê "não, esse aqui" sem saber a qual
-- mensagem o cliente se refere.
--
-- Esta fatia não muda nada do que aparece: só grava. Enviar citando e mostrar a
-- citação na bolha vêm depois, e cada uma sobe sozinha.

-- Id da mensagem citada, no formato DO PROVEDOR (não o nosso uuid).
--
-- É o provedor que manda esse id na entrada e é ele que espera esse id na
-- saída, então guardar no formato dele evita duas traduções. Para achar a
-- mensagem correspondente na nossa base, casa com whatsapp_messages.message_id,
-- que já tem índice.
alter table public.whatsapp_messages
  add column if not exists reply_to_message_id text;

comment on column public.whatsapp_messages.reply_to_message_id is
  'Id (no formato do provedor) da mensagem que esta cita. Casa com whatsapp_messages.message_id.';

-- Retrato do texto citado, gravado junto.
--
-- Parece redundante com a coluna acima, e não é: 707 mensagens enviadas pelo
-- CRM não têm message_id gravado, porque as APIs devolvem esse id no envio e a
-- gente descartava. Se o cliente citar uma dessas, o id não resolve para linha
-- nenhuma e a bolha ficaria com uma citação vazia.
--
-- O próprio WhatsApp funciona assim: ele renderiza a citação a partir do retrato
-- que vem no evento, não buscando a mensagem original. Guardar o texto é o que
-- garante que a citação sempre apareça, inclusive quando ela é anterior ao CRM.
alter table public.whatsapp_messages
  add column if not exists reply_to_preview text;

comment on column public.whatsapp_messages.reply_to_preview is
  'Retrato do texto da mensagem citada, para renderizar a citacao mesmo quando a mensagem original nao existe na base.';

-- Busca "quem respondeu a esta mensagem". Parcial porque a esmagadora maioria
-- das mensagens não cita nada, e um índice sobre todas seria quase todo nulo.
create index if not exists idx_msgs_reply_to
  on public.whatsapp_messages (reply_to_message_id)
  where reply_to_message_id is not null;
