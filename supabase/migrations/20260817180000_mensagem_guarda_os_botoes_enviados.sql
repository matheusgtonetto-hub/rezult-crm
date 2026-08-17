-- A mensagem passa a guardar os botões que foram enviados com ela.
--
-- No WhatsApp o contato via os botões; no Multiatendimento o atendente via só
-- o texto, sem saber que opções tinham sido oferecidas. Quando o contato
-- respondia "Agendar consulta inicial", a resposta chegava sem contexto: o
-- atendente não tinha como saber de onde aquilo tinha saído.
--
-- jsonb e não tabela à parte: é um punhado de rótulos que só existem junto
-- desta mensagem, nunca são consultados isoladamente e nunca mudam depois de
-- enviados. Uma tabela criaria um join para sempre em troca de nada.
alter table public.whatsapp_messages
  add column if not exists buttons jsonb;

comment on column public.whatsapp_messages.buttons is
  'Rotulos dos botoes enviados junto desta mensagem (array de string). Nulo em mensagem sem botao.';
