-- Origem de aquisição da empresa: de qual anúncio veio a conta que começou o
-- teste. Preenchida pela edge function meta-evento-trial logo após o cadastro
-- da empresa.
--
-- Não confundir com leads.utm_* (dados dos clientes, dentro do CRM). Isto é a
-- aquisição do próprio Rezult, e é o que permite calcular custo por trial por
-- campanha e por variante de anúncio (utm_content) direto no banco.
--
-- Todas as colunas são opcionais: empresa que chegou sem UTM continua nascendo
-- normalmente.

alter table public.companies
  add column if not exists utm_source               text,
  add column if not exists utm_medium               text,
  add column if not exists utm_campaign             text,
  add column if not exists utm_content              text,
  add column if not exists utm_term                 text,
  add column if not exists fbclid                   text,
  add column if not exists secao_origem             text,
  add column if not exists atribuicao_capturada_em  timestamptz;

comment on column public.companies.utm_content  is 'Variante do anúncio que trouxe a empresa (ex.: bigidea_a).';
comment on column public.companies.secao_origem is 'Id da dobra do site onde foi clicado o CTA de cadastro.';
