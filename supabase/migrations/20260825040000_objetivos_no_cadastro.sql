-- Objetivos com o Rezult, perguntados na etapa 3 do cadastro.
--
-- Resposta múltipla: "Quais resultados você busca alcançar com o Rezult?", com
-- cinco opções e nenhuma exclusiva. Quem quer vender mais normalmente também
-- quer organizar a operação, e obrigar a escolher uma só produziria uma
-- resposta mais pobre do que a realidade.
--
-- `text[]` e não texto com vírgulas: array é o que o Postgres sabe consultar
-- ("quem marcou relatórios?" vira `'...' = any(goals)`), enquanto uma string
-- concatenada exigiria LIKE e quebraria no dia em que um rótulo contivesse
-- vírgula. Também não virou tabela separada porque são cinco valores fechados
-- respondidos uma vez -- uma tabela de junção aqui seria estrutura sem uso.
--
-- Fica em `profiles` e não em `companies` porque a pergunta é dirigida à
-- pessoa ("você busca"), como o cargo e a experiência com CRM da etapa 1. As
-- três juntas descrevem quem está do outro lado.
--
-- Nula nos perfis anteriores, que se cadastraram antes da pergunta existir.
-- Nulo é "não perguntamos"; array vazio seria "perguntamos e não marcou nada",
-- que a validação da tela não permite.

alter table public.profiles
  add column if not exists goals text[];

comment on column public.profiles.goals is
  'Resultados que a pessoa busca com o Rezult, marcados no cadastro (múltipla escolha): Aumentar minhas vendas, Melhorar a gestão do comercial, Definir os processos comerciais da empresa, Ter relatórios de resultado para tomada de decisão, Busco ajuda para organizar minha operação. Nulo em perfis criados antes da pergunta existir.';
