-- Marca quais mensagens saíram do agente de IA, e não de uma pessoa.
--
-- Até aqui o agente gravava a mensagem SEM sender_name, e o Multiatendimento
-- caía no nome do usuário logado para preencher a bolha. Resultado: a resposta
-- do agente aparecia assinada por quem estivesse olhando a tela naquele
-- momento, e cada atendente via a mesma mensagem com um autor diferente.
--
-- Coluna própria em vez de inferir pelo nome: comparar sender_name com a lista
-- de agentes da empresa quebraria no dia em que um atendente se chamasse como
-- o agente, que é justamente o caso comum (empresa batiza o agente com nome de
-- gente).
alter table public.whatsapp_messages
  add column if not exists sent_by_agent boolean not null default false;

-- Histórico: mensagem de saída sem remetente só podia ter vindo do agente. As
-- enviadas por pessoas sempre gravaram sender_name, desde o primeiro dia do
-- Multiatendimento.
update public.whatsapp_messages
set sent_by_agent = true
where from_me = true and (sender_name is null or sender_name = '');

comment on column public.whatsapp_messages.sent_by_agent is
  'true quando a mensagem foi enviada pelo agente de IA (agent-sds-qualify), não por um atendente humano.';
