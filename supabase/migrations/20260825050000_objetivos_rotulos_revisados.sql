-- Rótulos dos objetivos revisados, e o comentário da coluna junto.
--
-- Três das cinco opções mudaram de texto logo depois de entrarem. O comentário
-- de `profiles.goals` listava os rótulos antigos, e comentário que descreve
-- valores que não existem mais é pior do que comentário nenhum: ele parece
-- documentação e manda para o lado errado.
--
-- Nenhum UPDATE de dados acompanha porque a coluna está vazia -- nenhuma pessoa
-- se cadastrou entre uma migração e outra. Se houvesse resposta gravada com o
-- texto antigo, esta migração precisaria trazer o de-para junto, senão o mesmo
-- objetivo passaria a existir com dois nomes.

comment on column public.profiles.goals is
  'Resultados que a pessoa busca com o Rezult, marcados no cadastro (múltipla escolha): Aumentar minhas vendas, Ter mais gestão de processos comerciais, Implementar processos comerciais na empresa, Relatórios avançados pra tomada de decisão, Busco ajuda para organizar minha operação. Nulo em perfis criados antes da pergunta existir.';
