-- Porta vermelha "Caso o contato não responda" + Atraso de tempo sem limite
--
-- 1) timeout_node_ids: filhos conectados à saída de timeout do bloco
--    "Entrada do usuário". Quando a espera expira (contato não respondeu),
--    o motor retoma o fluxo por esses nós.
alter table public.automation_awaiting_reply
  add column if not exists timeout_node_ids text[] not null default '{}';

-- 2) resume_sub_index: permite retomar um nó "Mensagem" a partir de um
--    sub-bloco específico, usado quando um "Atraso de tempo" longo agenda a
--    retomada da própria sequência de mensagens (pg_cron).
alter table public.automation_pending
  add column if not exists resume_sub_index int;
