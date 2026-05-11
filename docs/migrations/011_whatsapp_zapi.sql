-- Adiciona campos de integração Z-API (WhatsApp) na tabela companies
alter table public.companies
  add column if not exists zapi_instance_id  text,
  add column if not exists zapi_token        text,
  add column if not exists zapi_client_token text,
  add column if not exists zapi_phone        text,
  add column if not exists zapi_connected    boolean not null default false;
