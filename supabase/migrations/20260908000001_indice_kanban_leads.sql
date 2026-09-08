-- Índice do kanban paginado.
--
-- O funil vai deixar de baixar todos os cards de uma vez e passar a pedir "os
-- 50 primeiros da coluna X, ordenados por posição", buscando mais conforme a
-- pessoa rola aquela coluna. Sem um índice que case exatamente com esse
-- formato de consulta, cada rolagem obriga o Postgres a varrer a tabela e
-- ordenar o resultado inteiro para devolver 50 linhas.
--
-- ── Por que composto, e nesta ordem ──
--
-- Os índices existentes são de coluna única (`leads_column_id_idx`,
-- `leads_pipeline_id_idx`, `leads_status_idx`). Eles resolvem "todos os cards
-- desta coluna", mas não a ordenação nem o recorte, então o planejador ainda
-- precisa ordenar depois de filtrar.
--
-- A ordem das colunas segue a da consulta: igualdades primeiro
-- (company_id, pipeline_id, column_id), depois o que ordena (position), e por
-- último o desempate (id). Com isso o Postgres lê a fatia já ordenada e para
-- assim que junta as 50 linhas, sem tocar no resto.
--
-- ── Por que o `id` no fim ──
--
-- `position` tem pouquíssimos valores distintos: na maior conta em produção são
-- 3 valores para 1.451 linhas. Linhas empatadas voltam em ordem arbitrária, e
-- numa consulta paginada isso faz a página 2 repetir ou pular registros que a
-- página 1 já trouxe. O `id` no fim torna a ordenação total e a paginação
-- estável. Ele também precisa estar NO ÍNDICE, senão a ordenação por dois
-- critérios volta a exigir um sort.
--
-- ── Por que sem CONCURRENTLY ──
--
-- `create index` comum trava escrita na tabela enquanto roda. A tabela inteira
-- tem 3.330 linhas e 4,5 MB, então isso são milissegundos. `CONCURRENTLY` não
-- roda dentro de transação, e migração roda em transação: usá-lo aqui exigiria
-- tirar a migração do fluxo normal para evitar um bloqueio que não existe.
--
-- ── Por que não é parcial por status ──
--
-- Seria tentador restringir a `where status = 'open'`, já que o kanban só
-- desenha negócios abertos. Mas o mesmo índice serve as telas que listam
-- ganhos e perdidos por etapa, e um índice parcial não atende essas consultas.
-- Com 3.330 linhas o custo de indexar tudo é irrelevante; se um dia a tabela
-- crescer a ponto de importar, a versão parcial vira uma migração nova.

create index if not exists idx_leads_kanban
  on public.leads (company_id, pipeline_id, column_id, position, id);

comment on index public.idx_leads_kanban is
  'Serve a paginacao do kanban: filtra por empresa/pipeline/coluna e devolve ja ordenado por position, id. O id no fim torna a ordenacao total e a paginacao estavel, porque position tem poucos valores distintos.';
