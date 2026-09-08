-- Índices do kanban incluindo o filtro de status.
--
-- O board SEMPRE filtra por status: existe o seletor Abertos/Ganhos/Perdidos,
-- e "Abertos" é o padrão. Sem o status no índice, o Postgres lê a coluna
-- inteira, aplica o filtro, ordena e só então corta a página:
--
--   sem status no indice   726 buffers   20,3 ms   (le 657, descarta 72)
--
-- coalesce(status,'open') e não status puro: é assim que a função compara, e
-- expressão diferente da do índice não casa. Hoje nenhuma linha tem status
-- nulo, mas a coluna permite, e a função precisa continuar correta se aparecer.

create index if not exists idx_leads_kanban_status_recente
  on public.leads (company_id, pipeline_id, column_id, (coalesce(status, 'open')), entry_date desc, id);

comment on index public.idx_leads_kanban_status_recente is
  'Kanban na ordem padrao (recent) COM o filtro de status.';

create index if not exists idx_leads_kanban_status_posicao
  on public.leads (company_id, pipeline_id, column_id, (coalesce(status, 'open')), position, id);

comment on index public.idx_leads_kanban_status_posicao is
  'Kanban ordenado por posicao COM o filtro de status. Par do idx_leads_kanban_status_recente.';
