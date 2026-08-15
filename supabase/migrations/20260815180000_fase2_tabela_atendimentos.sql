-- Fase 2 do plano "Conversa vira Atendimento": a tabela.
--
-- Extrai o conceito que já existia embolado dentro de whatsapp_conversations.
-- Aquela tabela tem 29 colunas de três donos diferentes: o contato (nome,
-- telefone, email), o negócio (pipeline, valor, etapa) e o atendimento (read,
-- finished, answered, assigned_to). Só o terceiro grupo varia de um atendimento
-- para outro; os dois primeiros seguem iguais atravessando dez atendimentos da
-- mesma pessoa.
--
-- ESTA FASE NÃO tem ciclo de vida (isso é a Fase 3) nem dashboard (Fase 4).
-- Cada conversa existente vira UM atendimento, aberto na data de criação dela.
-- O histórico NÃO é fatiado: dividir 3.760 mensagens por tempo seria um chute
-- retroativo que ninguém pode conferir, e métrica que nasce de chute mente.

create table if not exists public.atendimentos (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  owner_id      uuid not null,

  -- Número próprio, por empresa, começando em 1001 -- mesma convenção de
  -- leads.deal_number. É ele que deve aparecer no cabeçalho do Multiatendimento,
  -- onde hoje se mostra o número do NEGÓCIO, que é outra coisa.
  numero        integer not null,

  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  contact_id      uuid references public.contacts(id)               on delete set null,
  lead_id         uuid references public.leads(id)                  on delete set null,

  canal         text not null default 'whatsapp',

  -- Três valores desde o nascimento, nunca um booleano.
  --
  -- "aguardando" (chegou e ninguém pegou) separado de "em_atendimento" (alguém
  -- respondeu ou assumiu) é o que torna mensurável o tempo até a primeira
  -- resposta e o que permite alertar sobre fila parada. Acrescentar esse estado
  -- depois obrigaria a reinterpretar histórico que não guardou a diferença.
  -- É o que o Datacrazy expõe e o que o Chatwoot chama de pending/open/resolved.
  status        text not null default 'aguardando'
                check (status in ('aguardando', 'em_atendimento', 'finalizado')),

  aberto_em     timestamptz not null default now(),

  -- Nulos no histórico DE PROPÓSITO. whatsapp_conversations.finished é um
  -- booleano solto, sem data nem autor: para as 13 conversas já finalizadas não
  -- existe quando nem por quem. Preencher com last_msg_at seria plausível e
  -- errado, e contaminaria o tempo médio de fechamento do dashboard da Fase 4.
  fechado_em    timestamptz,
  fechado_por   text,

  responsavel   text,
  department_id uuid references public.departments(id) on delete set null,

  -- Calculado do histórico, coisa que só ficou possível porque a Fase 1 pôs
  -- conversation_id em cada mensagem. Antes disso, "a primeira resposta desta
  -- conversa" dependia de casar telefone por aproximação.
  primeira_resposta_em timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (company_id, numero)
);

comment on table public.atendimentos is
  'Episodio de atendimento: comeca, alguem pega, termina. Separado do contato e do negocio. Fase 2 do plano Conversa vira Atendimento.';
comment on column public.atendimentos.numero is
  'Numero por empresa comecando em 1001, mesma convencao de leads.deal_number.';
comment on column public.atendimentos.fechado_em is
  'Null no historico anterior a 2026-08-15: a origem (whatsapp_conversations.finished) era booleano sem data.';
comment on column public.atendimentos.primeira_resposta_em is
  'Primeira mensagem de saida DEPOIS da primeira mensagem do contato. Base do tempo de primeira resposta.';

create index if not exists idx_atendimentos_empresa_status on public.atendimentos (company_id, status);
create index if not exists idx_atendimentos_conversa       on public.atendimentos (conversation_id);
create index if not exists idx_atendimentos_contato        on public.atendimentos (contact_id) where contact_id is not null;
create index if not exists idx_atendimentos_abertura       on public.atendimentos (company_id, aberto_em desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Exatamente as políticas das tabelas irmãs (whatsapp_conversations e
-- whatsapp_messages), que usam is_member_of(company_id). Tabela nova sem RLS
-- num banco multiempresa é vazamento entre clientes, não bug de tela.
alter table public.atendimentos enable row level security;

drop policy if exists company_select_atendimentos on public.atendimentos;
create policy company_select_atendimentos on public.atendimentos
  for select using (public.is_member_of(company_id));

drop policy if exists company_insert_atendimentos on public.atendimentos;
create policy company_insert_atendimentos on public.atendimentos
  for insert with check (public.is_member_of(company_id));

drop policy if exists company_update_atendimentos on public.atendimentos;
create policy company_update_atendimentos on public.atendimentos
  for update using (public.is_member_of(company_id));

drop policy if exists company_delete_atendimentos on public.atendimentos;
create policy company_delete_atendimentos on public.atendimentos
  for delete using (public.is_member_of(company_id));
