-- Passo 3a: o saldo passa a ser contado em CRÉDITOS, não em dólar de custo.
--
-- Decisão do dono em 25/09/2026, secao 4.1 de
-- docs/plans/2026-09-24-estrutura-do-saldo-de-creditos.md: o cliente paga em
-- dólar e recebe créditos. O dólar aparece uma única vez, no ato do pagamento.
--
-- ═══ As DUAS taxas, e por que uma é fixa e a outra não ═══════════════════════
--
-- Ao implementar, a regra 4.4 ("o valor do crédito nunca muda para trás")
-- derrubou o desenho ingênuo. Se o débito usasse um fator derivado do markup,
-- subir o markup de 50% para 80% mudaria esse fator de 1500 para 1800 -- e os
-- créditos que o cliente JÁ COMPROU passariam a comprar menos trabalho. Honrar
-- 4.4 exigiria congelar o fator por compra, com lotes FIFO, saldo em camadas e
-- toda a complexidade que vem com isso.
--
-- A saída é separar as duas coisas que estavam sendo confundidas:
--
--   1. CREDITOS_POR_DOLAR_DE_CUSTO = 1500   → FIXO, para sempre.
--      Não é preço, é a DEFINIÇÃO da unidade: 1 crédito vale US$ 1/1500 de
--      trabalho. Mudar isso seria mudar o significado de todo saldo existente.
--
--   2. Créditos vendidos por dólar pago     → é PREÇO, e pode mudar.
--      Hoje 1.000, o que dá markup de 50% (1.000 créditos compram US$ 0,6667
--      de custo; vendidos por US$ 1,00). Para markup de 80%, vende-se 833 por
--      dólar -- e o saldo de quem já comprou não é tocado.
--
-- Essa taxa NÃO mora no banco: mora no Price do Stripe (secao 4). O banco só
-- recebe a quantidade de créditos que a compra gerou.
--
-- Resultado: 4.4 fica satisfeita sem lote nenhum. O crédito é uma unidade de
-- TRABALHO, fixa; o que varia é quanto ela custa.

-- ── 1. As colunas ──────────────────────────────────────────────────────────
alter table public.credit_accounts rename column saldo_usd       to saldo_creditos;
alter table public.credit_accounts rename column teto_diario_usd to teto_diario_creditos;

-- Crédito é unidade de conta do cliente: inteiro, sem centésimo de crédito para
-- ele interpretar. As seis casas do custo real seguem preservadas em custo_usd.
--
-- A conversão vai DENTRO do `using`, e não num update depois.
--
-- Separado em dois passos, o `alter type` roda primeiro e arredonda o valor em
-- DÓLAR para duas casas -- um consumo de US$ 0,0129 vira US$ 0,01 -- e só então
-- multiplicar por 1500 daria 15 créditos em vez de 20. Todo valor sairia
-- quantizado em múltiplos de 15. Aconteceu de verdade na primeira tentativa
-- desta migration, em 25/09/2026, e só o saldo de demonstração pagou.
--
-- No `using`, a multiplicação acontece sobre o numeric(12,6) original e o
-- resultado já nasce na precisão nova. Nada é arredondado no meio.
alter table public.credit_accounts
  alter column saldo_creditos       type numeric(14,2) using round(saldo_creditos * 1500, 2),
  alter column teto_diario_creditos type numeric(14,2) using round(teto_diario_creditos * 1500, 2);

-- `ceil` no consumo, `round` no resto: é o mesmo arredondamento que
-- `debitar_credito` aplica, então o histórico convertido bate com o que a função
-- produziria se as mesmas chamadas acontecessem hoje.
alter table public.credit_transactions
  alter column valor        type numeric(14,2)
    using case when tipo = 'consumo' then -ceil(abs(valor) * 1500) else round(valor * 1500, 2) end,
  alter column saldo_depois type numeric(14,2) using round(saldo_depois * 1500, 2);

comment on column public.credit_accounts.saldo_creditos is
  'Saldo em Creditos Rezult. 1 credito = US$ 1/1500 de custo real de IA.';

-- O fator na própria linha. É fixo hoje, então guardá-lo é redundante -- e é
-- justamente por isso que vale: se algum dia alguém mudar a constante, a
-- diferença entre um extrato auditável e um extrato indecifrável é esta coluna.
alter table public.credit_transactions
  add column if not exists creditos_por_dolar numeric(10,2);

-- Quanto o cliente pagou, em dólar, na linha de compra. É o que bate contra o
-- Stripe na conciliação, e o que permite calcular o markup realizado.
alter table public.credit_transactions
  add column if not exists pago_usd numeric(12,2);

comment on column public.credit_transactions.pago_usd is
  'Compra: quanto o cliente pagou em USD. Dividido por `valor` da o preco do credito naquela venda.';

-- ── 2. Carimba o fator no histórico ───────────────────────────────────────
-- A conversão dos valores já aconteceu no `using` acima. Aqui sobra só marcar
-- com que fator essas linhas foram convertidas.
update public.credit_transactions
   set creditos_por_dolar = 1500
 where creditos_por_dolar is null;

-- ── 3. Creditar: recebe CRÉDITOS, já convertidos por quem vendeu ───────────
drop function if exists public.creditar_credito(uuid, numeric, text, text, text);

create or replace function public.creditar_credito(
  p_company_id      uuid,
  p_creditos        numeric,
  p_tipo            text default 'compra',
  p_stripe_event_id text default null,
  p_descricao       text default null,
  p_pago_usd        numeric default null
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

  -- A conta nasce no primeiro crédito; não há cadastro separado a manter.
  insert into credit_accounts (company_id, saldo_creditos)
  values (p_company_id, p_creditos)
  on conflict (company_id) do update
    set saldo_creditos = credit_accounts.saldo_creditos + p_creditos,
        atualizado_em  = now()
  returning saldo_creditos into v_saldo;

  insert into credit_transactions
    (company_id, tipo, valor, saldo_depois, stripe_event_id, descricao, pago_usd)
  values
    (p_company_id, p_tipo, p_creditos, v_saldo, p_stripe_event_id, p_descricao, p_pago_usd);

  return v_saldo;
end $$;

comment on function public.creditar_credito(uuid, numeric, text, text, text, numeric) is
  'Credita creditos. Repetir com o mesmo stripe_event_id falha por chave duplicada, que e o comportamento desejado.';

-- ── 4. Debitar: recebe o CUSTO REAL e converte ─────────────────────────────
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
  -- A definição da unidade. Ver o cabeçalho desta migration: isto NÃO é preço,
  -- e mudar este número mudaria o significado de todo saldo já vendido.
  c_creditos_por_dolar constant numeric := 1500;
  v_creditos numeric;
  v_saldo    numeric;
begin
  if p_custo_usd <= 0 then
    -- Chamada sem custo (cache, erro antes do modelo) não mexe no saldo nem
    -- polui o extrato com linha de zero.
    select saldo_creditos into v_saldo from credit_accounts where company_id = p_company_id;
    return v_saldo;
  end if;

  -- Arredonda para CIMA. Meio crédito não existe para o cliente, e a diferença
  -- precisa cair do lado de quem paga o fornecedor: arredondar para baixo faria
  -- toda chamada abaixo de meio crédito sair de graça, e chamada barata em
  -- volume é exatamente o perfil de uma automação em laço.
  v_creditos := ceil(p_custo_usd * c_creditos_por_dolar);

  -- Empresa sem conta de crédito não é tocada: é quem usa chave própria e paga
  -- direto ao fornecedor. O update não acha linha, o insert não acontece.
  update credit_accounts
     set saldo_creditos = saldo_creditos - v_creditos,
         atualizado_em  = now()
   where company_id = p_company_id
  returning saldo_creditos into v_saldo;

  if v_saldo is null then
    return null;
  end if;

  insert into credit_transactions
    (company_id, tipo, valor, saldo_depois, agent_usage_id, custo_usd, creditos_por_dolar, descricao)
  values
    (p_company_id, 'consumo', -v_creditos, v_saldo, p_usage_id, p_custo_usd, c_creditos_por_dolar, 'uso de agente');

  return v_saldo;
end $$;

comment on function public.debitar_credito(uuid, uuid, numeric) is
  'Debita o custo real convertido em creditos (1500 por USD). Devolve null para empresa sem conta (BYOK). Repetir com o mesmo agent_usage_id falha por chave duplicada.';

-- ── 5. Consumo do dia, agora em créditos ───────────────────────────────────
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
    -- Fuso de São Paulo, não UTC: `date_trunc('day', now())` cortava o dia às
    -- 21h do dia anterior no Brasil.
    and criado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;

-- ── 6. Privilégios (a assinatura de creditar_credito mudou) ────────────────
-- O privilégio vem de PUBLIC (o `=X/postgres` da ACL) e o Supabase ainda
-- concede a anon e authenticated por privilégio padrão: os dois precisam sair
-- pelo nome. Mesmo erro corrigido quatro vezes nesta base.
revoke execute on function public.creditar_credito(uuid, numeric, text, text, text, numeric) from public, anon, authenticated;
grant  execute on function public.creditar_credito(uuid, numeric, text, text, text, numeric) to service_role;

revoke execute on function public.debitar_credito(uuid, uuid, numeric) from public, anon, authenticated;
grant  execute on function public.debitar_credito(uuid, uuid, numeric) to service_role;

revoke execute on function public.consumo_do_dia(uuid) from public, anon;
grant  execute on function public.consumo_do_dia(uuid) to authenticated, service_role;
