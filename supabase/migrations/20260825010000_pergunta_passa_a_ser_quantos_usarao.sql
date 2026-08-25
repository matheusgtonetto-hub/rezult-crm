-- A pergunta do cadastro mudou de assunto, e a coluna acompanha.
--
-- Era "Qual o tamanho da sua empresa?" e virou "Quantas pessoas na sua empresa
-- usarão o Rezult?". Parece a mesma pergunta e não é: uma empresa de cinquenta
-- pessoas pode ter cinco no comercial, e são essas cinco que interessam aqui.
-- Guardar a segunda resposta numa coluna chamada `company_size` produziria uma
-- análise errada daqui a seis meses, quando ninguém lembrar da troca.
--
-- Renomear em vez de criar outra coluna porque a anterior nasceu há minutos e
-- está vazia: nenhuma empresa se cadastrou entre uma migração e outra. Se
-- houvesse dado, o certo seria coluna nova, já que as respostas antigas
-- responderiam a outra pergunta e não poderiam ser lidas como estas.
--
-- As faixas também mudaram (eram sete, agora são cinco), o que reforça o ponto:
-- nada do que existisse na coluna antiga seria comparável com o que entra agora.

alter table public.companies
  rename column company_size to expected_users;

comment on column public.companies.expected_users is
  'Quantas pessoas da empresa vão usar o Rezult, respondido no cadastro: 1, 2-5, 6-15, 16-50, Mais de 51. Nulo em empresas criadas antes da pergunta existir. Não é o tamanho da empresa.';
