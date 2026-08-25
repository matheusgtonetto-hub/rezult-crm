-- Porte da empresa, agora convivendo com "quantas pessoas usarão o Rezult".
--
-- Esta coluna já existiu com este nome e virou `expected_users` na migração
-- 20260825010000, quando a pergunta do cadastro mudou de "tamanho da empresa"
-- para "quantas pessoas usarão o Rezult". Agora o cadastro faz as DUAS
-- perguntas, então o nome volta -- desta vez significando o que ele diz.
--
-- A diferença entre as duas é o que justifica perguntar as duas:
--
--   company_size    quantas pessoas a empresa TEM
--   expected_users  quantas pessoas vão USAR o Rezult
--
-- Uma agência de 40 pessoas com 6 no comercial responde "De 21 a 50
-- funcionários" numa e "6-15" na outra. A primeira diz o tamanho do cliente,
-- que é informação comercial; a segunda diz o tamanho da conta, que é
-- informação de produto. Uma não substitui a outra, e ler uma pela outra
-- produz conclusão errada nas duas direções.
--
-- Faixas em texto pelo mesmo motivo das outras: é o que a pessoa responde sem
-- parar para contar. Nula por padrão e nula nas empresas anteriores, que se
-- cadastraram antes da pergunta existir -- nulo é "não perguntamos".

alter table public.companies
  add column if not exists company_size text;

comment on column public.companies.company_size is
  'Porte declarado no cadastro: Somente eu, De 2 a 5 funcionários, ... , +101 funcionários. Quantas pessoas a empresa TEM. Não confundir com expected_users, que é quantas vão usar o Rezult.';
