-- Saldo de créditos de IA, por empresa.
--
-- Passo 1 do desenho em docs/plans/2026-09-24-estrutura-do-saldo-de-creditos.md.
-- Cria a estrutura e as funções. NÃO liga o débito em lugar nenhum e não cobra
-- ninguém: depois desta migration o comportamento do app é exatamente o mesmo.
--
-- ─── A moeda é o DÓLAR (decisão do dono, 24/09/2026) ───────────────────────
--
-- O saldo é em USD, e o câmbio acontece na VENDA, não no débito: o cliente paga
-- em real no Stripe e recebe um valor em dólar de crédito. Isso tira o câmbio
-- do caminho quente -- cada débito é uma subtração, sem taxa do dia, sem
-- conversão para explicar no extrato.
--
-- ─── Onde vive o markup ────────────────────────────────────────────────────
--
-- No PREÇO DE VENDA, não no débito. O débito é o custo real da chamada, então o
-- extrato do cliente é verdadeiro e auditável: "esta resposta custou US$
-- 0,0232". A margem está em quantos dólares de crédito ele recebe por real
-- pago, que é onde ele aceita ou não o preço.
--
-- Mesmo assim, `custo_usd` e `valor` são colunas SEPARADAS na transação. Hoje
-- são iguais; se um dia o markup passar para o débito, o fator entra sem
-- migração de dados e sem perder o histórico do custo real.

-- ── 1. A conta corrente de cada empresa ────────────────────────────────────
create table if not exists public.credit_accounts (
  company_id      uuid primary key references public.companies(id) on delete cascade,
  saldo_usd       numeric(12,6) not null default 0,
  -- Teto de consumo por dia. Null = sem teto. É a trava contra laço em
  -- automação queimando saldo antes de alguém perceber.
  teto_diario_usd numeric(12,6),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

comment on table public.credit_accounts is
  'Saldo de credito de IA por empresa, em USD. Escrito so pelas funcoes creditar_credito/debitar_credito.';

/*
 * Por que NÃO existe um `check (saldo_usd >= 0)`.
 *
 * O desenho original previa esse check, e mudei de opinião ao implementar. O
 * débito acontece DEPOIS da chamada, com o custo real -- ele registra um fato
 * consumado, dinheiro que já foi gasto no fornecedor. Se o check fizesse esse
 * insert falhar, o resultado seria consumo sem débito: o pior dos dois mundos,
 * porque o prejuízo acontece e não fica registrado em lugar nenhum.
 *
 * Então saldo negativo é permitido e VISÍVEL, e a proteção mora antes: a trava
 * na entrada (não chamar a IA com saldo abaixo da margem) e o teto diário. O
 * negativo possível é de uma chamada, não de uma conta inteira.
 */

-- ── 2. O extrato, que é a verdade ──────────────────────────────────────────
create table if not exists public.credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  tipo          text not null check (tipo in ('compra','consumo','ajuste','estorno','expiracao')),
  -- Positivo credita, negativo debita. Em USD.
  valor         numeric(12,6) not null,
  -- Fotografia do saldo depois desta linha, para o extrato ser lido direto sem
  -- somar a coluna inteira a cada abertura de tela.
  saldo_depois  numeric(12,6) not null,
  descricao     text,

  -- ── As duas chaves que tornam tudo repetível ──
  -- O webhook do Stripe reenvia evento por DESENHO, não por defeito, e um retry
  -- de chamada de IA é normal. Com estas restrições no banco, repetir vira erro
  -- de chave duplicada (que se ignora com segurança) em vez de dinheiro errado.
  -- É a diferença entre idempotência garantida e idempotência esperada.
  stripe_event_id text unique,
  agent_usage_id  uuid unique references public.agent_usage_log(id) on delete set null,

  -- Só em consumo: o custo real da chamada, antes de qualquer markup.
  custo_usd     numeric(12,6),
  criado_em     timestamptz not null default now()
);

create index if not exists credit_transactions_empresa_data
  on public.credit_transactions (company_id, criado_em desc);

comment on table public.credit_transactions is
  'Extrato do saldo de credito. stripe_event_id e agent_usage_id unicos garantem que webhook repetido e retry nao dobrem valor.';

-- ── 3. Creditar (compra, ajuste, estorno) ──────────────────────────────────
create or replace function public.creditar_credito(
  p_company_id      uuid,
  p_valor_usd       numeric,
  p_tipo            text default 'compra',
  p_stripe_event_id text default null,
  p_descricao       text default null
) returns numeric
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_saldo numeric;
begin
  if p_valor_usd <= 0 then
    raise exception 'valor de credito precisa ser positivo, recebido %', p_valor_usd;
  end if;

  -- A conta nasce no primeiro crédito; não há cadastro separado a manter.
  insert into credit_accounts (company_id, saldo_usd)
  values (p_company_id, p_valor_usd)
  on conflict (company_id) do update
    set saldo_usd = credit_accounts.saldo_usd + p_valor_usd,
        atualizado_em = now()
  returning saldo_usd into v_saldo;

  insert into credit_transactions
    (company_id, tipo, valor, saldo_depois, stripe_event_id, descricao)
  values
    (p_company_id, p_tipo, p_valor_usd, v_saldo, p_stripe_event_id, p_descricao);

  return v_saldo;
end $$;

comment on function public.creditar_credito(uuid, numeric, text, text, text) is
  'Credita saldo. Repetir com o mesmo stripe_event_id falha por chave duplicada, que e o comportamento desejado.';

-- ── 4. Debitar (consumo) ───────────────────────────────────────────────────
create or replace function public.debitar_credito(
  p_company_id uuid,
  p_usage_id   uuid,
  p_custo_usd  numeric
) returns numeric
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_saldo numeric;
begin
  if p_custo_usd <= 0 then
    -- Chamada sem custo (cache, erro antes do modelo) não mexe no saldo nem
    -- polui o extrato com linhas de zero.
    select saldo_usd into v_saldo from credit_accounts where company_id = p_company_id;
    return coalesce(v_saldo, 0);
  end if;

  insert into credit_accounts (company_id, saldo_usd)
  values (p_company_id, -p_custo_usd)
  on conflict (company_id) do update
    set saldo_usd = credit_accounts.saldo_usd - p_custo_usd,
        atualizado_em = now()
  returning saldo_usd into v_saldo;

  insert into credit_transactions
    (company_id, tipo, valor, saldo_depois, agent_usage_id, custo_usd, descricao)
  values
    (p_company_id, 'consumo', -p_custo_usd, v_saldo, p_usage_id, p_custo_usd, 'uso de agente');

  return v_saldo;
end $$;

comment on function public.debitar_credito(uuid, uuid, numeric) is
  'Debita o custo real de uma chamada. Repetir com o mesmo agent_usage_id falha por chave duplicada: o consumo nao dobra.';

-- ── 5. Quanto a empresa já gastou HOJE (para o teto diário) ────────────────
create or replace function public.consumo_do_dia(p_company_id uuid)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce(-sum(valor), 0)
  from credit_transactions
  where company_id = p_company_id
    and tipo = 'consumo'
    and criado_em >= date_trunc('day', now());
$$;

-- ── 6. RLS: a empresa LÊ o seu saldo e o seu extrato, e não escreve nada ──
alter table public.credit_accounts     enable row level security;
alter table public.credit_transactions enable row level security;

create policy credit_accounts_leitura on public.credit_accounts
  for select using (public.is_member_of(company_id));

create policy credit_transactions_leitura on public.credit_transactions
  for select using (public.is_member_of(company_id));

-- Sem policy de insert, update ou delete, de propósito: saldo se mexe apenas
-- pelas funções acima, chamadas pelo service_role nas Edge Functions. Uma
-- policy de update aqui seria um cliente editando o próprio saldo.

-- ── 7. Quem pode chamar as funções ─────────────────────────────────────────
-- As três são SECURITY DEFINER e as duas primeiras ESCREVEM. O privilégio vem
-- de PUBLIC (o `=X/postgres` da ACL), e o Supabase ainda concede a anon e
-- authenticated por privilégio padrão -- os dois precisam sair pelo nome. É o
-- mesmo erro corrigido três vezes nesta base em 22, 23 e 24/09/2026.
revoke execute on function public.creditar_credito(uuid, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public.debitar_credito(uuid, uuid, numeric)              from public, anon, authenticated;
grant  execute on function public.creditar_credito(uuid, numeric, text, text, text) to service_role;
grant  execute on function public.debitar_credito(uuid, uuid, numeric)              to service_role;

-- Esta só lê, e a tela precisa dela para mostrar o quanto já foi gasto hoje.
revoke execute on function public.consumo_do_dia(uuid) from public, anon;
grant  execute on function public.consumo_do_dia(uuid) to authenticated, service_role;
