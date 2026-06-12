-- "Entrada do usuário" no bloco Mensagem: a automação PAUSA e aguarda a resposta
-- do contato no WhatsApp. Esta tabela guarda o estado da espera; quando chega uma
-- mensagem do contato (zapi-webhook), o motor é retomado a partir dos filhos do nó.
--
-- Sem acesso via API (RLS total) — escrita/leitura só pelo service role, igual a
-- automation_pending.
create table if not exists public.automation_awaiting_reply (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  automation_id   uuid not null,
  lead_id         uuid,
  owner_id        uuid not null,                 -- casa com a mensagem recebida (zapi-webhook)
  phone           text not null,                 -- telefone normalizado (dígitos) do contato
  node_id         text not null,                 -- nó "mensagem" onde pausou
  var_name        text not null default 'resposta',
  resume_node_ids text[] not null default '{}',  -- filhos do nó (Próximo passo) p/ retomar
  trigger_payload jsonb not null,
  expires_at      timestamptz,                   -- limpeza: descarta esperas antigas
  created_at      timestamptz not null default now()
);

alter table public.automation_awaiting_reply enable row level security;
-- Sem policies: acesso exclusivo via service role.

create index if not exists idx_awaiting_reply_lookup
  on public.automation_awaiting_reply (owner_id, phone);
