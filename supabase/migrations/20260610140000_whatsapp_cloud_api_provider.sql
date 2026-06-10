-- Suporte à API oficial do WhatsApp (Meta Cloud API) na tabela de conexões.
--
-- Hoje a tabela só guarda credenciais do Z-API (instance_id/token/client_token).
-- A Cloud API usa outro conjunto: phone_number_id + waba_id + access_token,
-- obtidos via Embedded Signup. Adicionamos um discriminador `provider` e os
-- campos do provedor oficial, e tornamos os campos do Z-API opcionais.
alter table public.whatsapp_connections
  add column if not exists provider        text not null default 'zapi',  -- 'zapi' | 'cloud_api'
  add column if not exists phone_number_id text,                          -- Cloud API: ID do número
  add column if not exists waba_id         text,                          -- Cloud API: WhatsApp Business Account ID
  add column if not exists access_token    text;                          -- Cloud API: token de acesso (System User)

-- Campos do Z-API deixam de ser obrigatórios (não se aplicam à Cloud API)
alter table public.whatsapp_connections alter column instance_id drop not null;
alter table public.whatsapp_connections alter column token       drop not null;
