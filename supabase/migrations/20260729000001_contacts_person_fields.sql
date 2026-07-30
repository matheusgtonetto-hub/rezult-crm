-- =============================================================
-- Expande contacts com os campos de pessoa que hoje só existem em
-- leads (coletados no popup "Novo Lead", abas Contato/Dados
-- Pessoais/Endereço/Anotações). Necessário antes de "Novo Lead"
-- passar a gravar só em contacts (fase B do plano de separação
-- lead/negócio) -- sem isso, tags/documento/endereço/anotações
-- digitados no formulário seriam descartados silenciosamente.
-- =============================================================

alter table public.contacts
  add column if not exists tags          text[],
  add column if not exists site          text,
  add column if not exists document      text,
  add column if not exists company       text,
  add column if not exists origin        text,
  add column if not exists birth_date    date,
  add column if not exists country       text,
  add column if not exists zip_code      text,
  add column if not exists address       text,
  add column if not exists addr_number   text,
  add column if not exists complement    text,
  add column if not exists neighborhood  text,
  add column if not exists city          text,
  add column if not exists state         text,
  add column if not exists notes         text;
