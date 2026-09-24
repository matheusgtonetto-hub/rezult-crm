-- Revisão do passo 1, antes de ligar o débito no código.
--
-- Três defeitos encontrados relendo a própria migration anterior. Os dois
-- primeiros são meus; o terceiro é uma decisão que faltava tomar.

-- ── 1. O "dia" do teto diário era o dia de NINGUÉM ─────────────────────────
--
-- `date_trunc('day', now())` corta em 00:00 UTC, que são 21:00 do dia anterior
-- no Brasil. O teto diário de uma empresa de São Paulo zerava às 21h, e o
-- consumo da noite entrava no dia seguinte. Um teto que vira em hora errada é
-- pior que teto nenhum: ele libera gasto justo no fim do dia de trabalho.
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
    -- O dia do CLIENTE, não o do servidor.
    and criado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                      at time zone 'America/Sao_Paulo');
$$;

comment on function public.consumo_do_dia(uuid) is
  'Consumo de hoje, no fuso de Sao Paulo. O teto diario precisa virar a meia-noite do cliente, nao do servidor.';

-- ── 2. A idempotência tinha um buraco: NULL não conflita ──────────────────
--
-- `stripe_event_id` e `agent_usage_id` são unique, mas em Postgres vários NULL
-- convivem no mesmo índice único. Então uma compra sem event_id, ou um consumo
-- sem usage_id, podiam ser gravados quantas vezes quisessem -- exatamente o que
-- as restrições existiam para impedir.
--
-- Agora a origem é OBRIGATÓRIA nos dois tipos que mexem com dinheiro de
-- verdade. Ajuste, estorno e expiração seguem sem origem, porque são lançamentos
-- manuais e deliberados: ali repetir é intenção, não acidente.
alter table public.credit_transactions
  drop constraint if exists credit_transactions_origem_obrigatoria;
alter table public.credit_transactions
  add constraint credit_transactions_origem_obrigatoria check (
    (tipo = 'compra'  and stripe_event_id is not null)
    or (tipo = 'consumo' and agent_usage_id is not null)
    or tipo in ('ajuste', 'estorno', 'expiracao')
  );

-- ── 3. Debitar quem NÃO comprou crédito criaria conta negativa ────────────
--
-- A versão anterior fazia `insert ... on conflict do update`: se a empresa não
-- tivesse conta, ela era criada já no negativo. Todas as 13 empresas de hoje
-- usam chave própria (BYOK) e pagam direto ao fornecedor -- debitá-las encheria
-- a base de contas negativas de gente que não deve nada.
--
-- A regra passa a ser: **só debita quem tem conta**, e a conta nasce na compra.
-- Isso é o que permite ligar o débito no código HOJE, sem risco: quem não
-- comprou crédito não é tocado.
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
  -- Sem conta de crédito, a empresa usa a chave dela e paga direto ao
  -- fornecedor. Nada a debitar, e nada a criar.
  if not exists (select 1 from credit_accounts where company_id = p_company_id) then
    return null;
  end if;

  if p_custo_usd is null or p_custo_usd <= 0 then
    select saldo_usd into v_saldo from credit_accounts where company_id = p_company_id;
    return v_saldo;
  end if;

  if p_usage_id is null then
    raise exception 'debito de consumo exige o id do uso, para nao debitar duas vezes';
  end if;

  update credit_accounts
     set saldo_usd = saldo_usd - p_custo_usd, atualizado_em = now()
   where company_id = p_company_id
  returning saldo_usd into v_saldo;

  insert into credit_transactions
    (company_id, tipo, valor, saldo_depois, agent_usage_id, custo_usd, descricao)
  values
    (p_company_id, 'consumo', -p_custo_usd, v_saldo, p_usage_id, p_custo_usd, 'uso de agente');

  return v_saldo;
end $$;

comment on function public.debitar_credito(uuid, uuid, numeric) is
  'Debita o custo real de uma chamada, SE a empresa tiver conta de credito. Sem conta, devolve null e nao cria nada: quem usa chave propria nao e tocado.';

-- A compra também passa a exigir a origem, pelo mesmo motivo do check acima.
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
  if p_tipo = 'compra' and p_stripe_event_id is null then
    raise exception 'compra exige o id do evento do Stripe, para nao creditar duas vezes';
  end if;

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
