-- Tamanho da empresa, perguntado no cadastro.
--
-- Faixa de número de pessoas, respondida na etapa 1 do /company-register. Serve
-- para segmentar quem está entrando: uma empresa de uma pessoa e uma de cem
-- usam o CRM de formas diferentes, e hoje não há como separar as duas depois
-- que a conta existe.
--
-- É texto e não número porque a resposta É uma faixa ("2-5", "101+"), não uma
-- contagem. Guardar o número exato exigiria pedir o número exato, que é uma
-- pergunta pior: quem tem 43 pessoas não sabe se conta estagiário, e quem tem 3
-- responde 3 hoje e 5 no mês que vem. A faixa é o que a pessoa sabe responder
-- sem pensar, e é o suficiente para segmentar.
--
-- Nula por padrão, e continua nula para as empresas que já existiam: elas se
-- cadastraram antes da pergunta existir, e inventar um valor para elas seria
-- transformar ausência de resposta em resposta. Quem consultar precisa tratar
-- o nulo como "não perguntamos", não como "não respondeu".

alter table public.companies
  add column if not exists company_size text;

comment on column public.companies.company_size is
  'Faixa de número de pessoas na empresa, respondida no cadastro: 1, 2-5, 6-10, 11-20, 21-50, 51-100, 101+. Nulo em empresas criadas antes da pergunta existir.';
