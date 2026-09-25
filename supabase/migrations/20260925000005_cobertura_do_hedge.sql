-- Secao 6.1 do plano: o relatorio de cobertura do hedge.
--
-- ═══ O que este numero e ════════════════════════════════════════════════════
--
-- `usd_necessario_openai` e o PASSIVO: o trabalho que ja foi vendido e ainda
-- nao foi entregue. Enquanto o saldo em dolar na conta da OpenAI cobrir esse
-- numero, os dolares ja foram comprados e a variacao do cambio deixa de
-- importar -- e e isso que sustenta o markup de 30%. Sem o hedge, o mesmo
-- markup tem ponto de ruina em dolar a R$ 6,02 (secao 5.2).
--
-- ═══ Por que RELATORIO e nao automatismo ════════════════════════════════════
--
-- Porque o sistema NAO consegue ler o saldo real na OpenAI: nao ha API estavel
-- para isso. Entao ele diz quanto DEVERIA haver, e a conferencia com o painel
-- e a recarga sao humanas. A recarga automatica da OpenAI tambem dispara por
-- limite minimo, e nao por venda, o que significa que o casamento exato
-- depende de alguem olhando.
--
-- ═══ Por que service_role apenas ════════════════════════════════════════════
--
-- Este e um agregado de TODAS as empresas: e dado do dono, nao do cliente.
-- `authenticated` sai pelo nome junto com public e anon, senao qualquer
-- usuario logado leria o passivo total da operacao.

create or replace function public.cobertura_do_hedge()
returns table (
  empresas_com_saldo     bigint,
  creditos_em_circulacao numeric,
  usd_necessario_openai  numeric,
  saldo_negativo_total   numeric,
  empresas_negativas     bigint
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    count(*) filter (where saldo_creditos > 0),
    coalesce(sum(saldo_creditos) filter (where saldo_creditos > 0), 0),
    -- 1500 creditos = US$ 1,00 de custo do fornecedor.
    round(coalesce(sum(saldo_creditos) filter (where saldo_creditos > 0), 0) / 1500, 2),
    -- Saldo negativo e trabalho entregue e nao pago. A trava (`pode_gastar`)
    -- limita isso a uma chamada por empresa, mas o numero vale ser olhado: se
    -- crescer, a trava esta furando em algum ponto de chamada.
    coalesce(-sum(saldo_creditos) filter (where saldo_creditos < 0), 0),
    count(*) filter (where saldo_creditos < 0)
  from credit_accounts;
$$;

comment on function public.cobertura_do_hedge() is
  'Quanto USD precisa existir na conta da OpenAI para cobrir o credito vendido e nao consumido (secao 6.1 do plano). Agregado de TODAS as empresas: dado do dono.';

revoke execute on function public.cobertura_do_hedge() from public, anon, authenticated;
grant  execute on function public.cobertura_do_hedge() to service_role;
