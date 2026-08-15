-- O contador de interações da IA passa a viver no ATENDIMENTO.
--
-- Vivia em whatsapp_conversations, que atravessa episódios: só zerava ao
-- finalizar a conversa ou ao transferir para humano. Um lead que voltasse meses
-- depois chegava com o contador cheio e o agente podia se calar na PRIMEIRA
-- mensagem do contato novo, sem nada na tela explicando.
--
-- No atendimento, ele reinicia sozinho a cada episódio, porque cada episódio é
-- uma linha nova. Não é arrumação: é a correção daquele bug.
--
-- Raio de alcance hoje: ZERO. Os cinco agentes da base estão com
-- limite_interacoes = 0, então o portão está desligado em todos. A mudança é
-- preventiva, e o plano pedia que fosse anunciada em vez de descoberta.
alter table public.atendimentos
  add column if not exists ai_interaction_count integer not null default 0;

comment on column public.atendimentos.ai_interaction_count is
  'Respostas da IA neste atendimento. Uma resposta conta 1 mesmo dividida em varias mensagens. Reinicia por episodio, que e o ponto de estar aqui e nao na conversa.';

-- Herda o contador atual do episódio em curso: o atendimento aberto continua a
-- mesma conversa, então a contagem dele segue de onde estava.
update public.atendimentos a
   set ai_interaction_count = coalesce(w.ai_interaction_count, 0)
  from public.whatsapp_conversations w
 where w.id = a.conversation_id
   and a.status <> 'finalizado'
   and coalesce(w.ai_interaction_count, 0) > 0;

-- A coluna antiga fica, sem ser mais escrita pelo agente. Não derrubo agora
-- porque prefiro uma migration só para remover, depois de algumas semanas
-- confirmando que ninguém mais lê.
comment on column public.whatsapp_conversations.ai_interaction_count is
  'SUPERSEDIDA por atendimentos.ai_interaction_count desde 2026-08-15. Mantida temporariamente; nao usar em codigo novo.';
