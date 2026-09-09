-- Em que etapa o rascunho de agente parou.
--
-- O rascunho já sobrevivia à saída da tela: `draft = true` o mantém no banco e
-- ele reaparece na grade com o botão "Continuar". O que se perdia era a POSIÇÃO
-- -- "Continuar" devolvia a pessoa ao passo 1, e ela precisava clicar Avançar
-- oito vezes para voltar de onde tinha saído.
--
-- No banco, e não no localStorage: o rascunho é dado do servidor, e a posição
-- dele é parte do estado do rascunho. Guardada só no navegador, ela sumiria ao
-- trocar de máquina justamente no caso em que a retomada importa.
--
-- `smallint` porque são dez etapas. `default 0` cobre todo rascunho que já
-- existe: sem posição gravada, a retomada é do começo, que é o comportamento
-- de hoje.
--
-- Vale só enquanto `draft = true`. Depois de publicado o agente não tem mais
-- wizard, e a coluna vira registro morto -- inofensivo, e o caminho de volta
-- (reabrir um agente no modo passo a passo) encontraria o valor certo.

alter table public.agents
  add column if not exists wizard_step smallint not null default 0;
