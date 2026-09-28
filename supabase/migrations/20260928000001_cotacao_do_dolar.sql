-- Preco do credito em REAL, calculado com a cotacao do momento da compra.
--
-- ═══ Por que mudou de dolar para real ═══════════════════════════════════════
--
-- A secao 4.1 do plano decidiu precificar em USD para tirar o risco cambial:
-- receita e divida na mesma moeda. Isso pressupunha RECEBER dolar.
--
-- A conta Stripe e brasileira e liquida em real (as assinaturas sao R$ 237,
-- R$ 399, R$ 747). Precificar em USD nela nao traz dolar nenhum -- traz real
-- convertido pelo Stripe -- e ainda joga IOF e spread no cartao do cliente,
-- que passa a ver uma compra internacional com risco maior de recusa.
--
-- Pior: desliga na pratica o Adaptive Pricing. Ele converte DA moeda da conta
-- PARA a moeda do cliente; com a moeda ja forcada em USD, nao sobra o que
-- adaptar. Era por isso que o nosso checkout mostrava so "US$ 10,00" enquanto
-- o do concorrente (conta americana) mostrava R$ 54,29 com a cotacao ao lado.
--
-- ═══ O que torna o preco em real seguro ═════════════════════════════════════
--
-- O HEDGE (secao 6.1): os dolares sao comprados no ato da venda, entao receita
-- e custo ficam travados na mesma cotacao. Sem ele, preco fixo em real seria
-- exatamente a exposicao que a 5.1 queria evitar.

-- ── A cotacao usada, guardada ──────────────────────────────────────────────
--
-- Nao e cache por performance: e REDE DE SEGURANCA. Se a fonte da cotacao
-- estiver fora no instante do checkout, vender a uma cotacao desconhecida
-- e como vender sem saber o preco. Com a ultima cotacao boa guardada, a venda
-- continua acontecendo enquanto o valor for recente o bastante.
create table if not exists public.cotacao_dolar (
  id         bigserial primary key,
  valor      numeric(10,4) not null check (valor > 0),
  fonte      text not null,
  criado_em  timestamptz not null default now()
);

create index if not exists cotacao_dolar_recente on public.cotacao_dolar (criado_em desc);

comment on table public.cotacao_dolar is
  'Ultimas cotacoes USD/BRL obtidas. Rede de seguranca para o checkout quando a fonte esta fora, nao cache de performance.';

-- Historico e do dono, nao do cliente: nenhuma policy de leitura.
alter table public.cotacao_dolar enable row level security;

-- ── O que cada compra registrou ────────────────────────────────────────────
alter table public.credit_transactions
  add column if not exists pago_brl numeric(12,2),
  add column if not exists cotacao  numeric(10,4);

comment on column public.credit_transactions.pago_brl is
  'Compra: quanto o cliente pagou em REAL. E o valor que bate com o extrato do Stripe.';
comment on column public.credit_transactions.cotacao is
  'Compra: a cotacao USD/BRL usada para converter. Sem ela, uma compra antiga vira numero sem origem na conciliacao.';

-- `pago_usd` continua, agora como o equivalente em dolar daquele real na
-- cotacao do dia. E ele que soma contra a fatura do fornecedor.

-- ── Creditar passa a aceitar os dois ───────────────────────────────────────
drop function if exists public.creditar_credito(uuid, numeric, text, text, text, numeric);

create or replace function public.creditar_credito(
  p_company_id      uuid,
  p_creditos        numeric,
  p_tipo            text default 'compra',
  p_stripe_event_id text default null,
  p_descricao       text default null,
  p_pago_usd        numeric default null,
  p_pago_brl        numeric default null,
  p_cotacao         numeric default null
) returns numeric
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_saldo numeric;
begin
  if p_creditos <= 0 then
    raise exception 'credito precisa ser positivo, recebido %', p_creditos;
  end if;

  insert into credit_accounts (company_id, saldo_creditos)
  values (p_company_id, p_creditos)
  on conflict (company_id) do update
    set saldo_creditos = credit_accounts.saldo_creditos + p_creditos,
        atualizado_em  = now()
  returning saldo_creditos into v_saldo;

  insert into credit_transactions
    (company_id, tipo, valor, saldo_depois, stripe_event_id, descricao, pago_usd, pago_brl, cotacao)
  values
    (p_company_id, p_tipo, p_creditos, v_saldo, p_stripe_event_id, p_descricao, p_pago_usd, p_pago_brl, p_cotacao);

  return v_saldo;
end $$;

comment on function public.creditar_credito(uuid, numeric, text, text, text, numeric, numeric, numeric) is
  'Credita creditos. Repetir com o mesmo stripe_event_id falha por chave duplicada, que e o comportamento desejado.';

revoke execute on function public.creditar_credito(uuid, numeric, text, text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant  execute on function public.creditar_credito(uuid, numeric, text, text, text, numeric, numeric, numeric) to service_role;
