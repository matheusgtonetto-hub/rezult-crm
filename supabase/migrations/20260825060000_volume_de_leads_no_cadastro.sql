-- Volume de leads por mês, perguntado no cadastro.
--
-- É o melhor previsor isolado de disposição a pagar neste produto, e é a
-- informação que `company_size` e `expected_users` não dão: as duas medem o
-- tamanho da EMPRESA, e esta mede o tamanho da DOR. Uma clínica de 4 pessoas
-- com 300 leads no WhatsApp tem urgência que uma indústria de 60 que vende por
-- licitação não tem, e até agora nada no cadastro separava as duas.
--
-- Serve para priorizar quem receber contato durante os 7 dias de teste: ligar
-- no dia 2 para quem tem volume vale mais do que ligar no dia 7 para todo
-- mundo.
--
-- Faixas em texto, como as outras perguntas do cadastro. A última opção,
-- "Ainda não controlo isso", não é uma faixa e é de propósito: quem não sabe
-- quantos leads recebe não está com preguiça de contar, está dizendo que não
-- existe processo nenhum -- que é justamente o perfil que mais precisa de CRM
-- e o que menos sabe pedir ajuda. Ler isso como "não respondeu" perderia o
-- sinal mais forte da pergunta.
--
-- Nula nas empresas anteriores, que se cadastraram antes da pergunta existir.

alter table public.companies
  add column if not exists monthly_leads text;

comment on column public.companies.monthly_leads is
  'Leads novos por mês, respondido no cadastro: Até 10, De 11 a 50, De 51 a 200, De 201 a 500, Mais de 500, Ainda não controlo isso. Mede o tamanho da dor, não o da empresa (ver company_size). A última opção é resposta válida, não ausência de resposta.';
