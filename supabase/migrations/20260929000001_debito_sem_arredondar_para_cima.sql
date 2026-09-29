-- O debito para de arredondar para CIMA e passa a usar as duas casas que a
-- coluna sempre teve.
--
-- ═══ O defeito ══════════════════════════════════════════════════════════════
--
-- `debitar_credito` fazia `ceil(custo_usd * 1500)`. Para a chamada do modelo
-- isso e ruido: ela custa dezenas de creditos e meio credito a mais nao muda
-- nada. Para o EMBEDDING DE BUSCA da Base de Conhecimento, o arredondamento
-- vira o preco inteiro:
--
--   pergunta curta   0,0117 creditos de custo real  ->  cobrado 1
--   pergunta media   0,0585 creditos                ->  cobrado 1
--   conversa longa   0,2340 creditos                ->  cobrado 1
--
-- Com 44 chamadas por lead, o custo real fica entre 0,5 e 10 creditos e o
-- cliente era cobrado 44. Ate 85x. Nao quebra a margem -- sao ~3% do consumo --
-- mas e cobranca sem lastro, e a conciliacao mensal contra a fatura do
-- fornecedor acusaria a diferenca sem que a causa fosse obvia.
--
-- ═══ Por que `round(.., 2)` e nao `round(..)` inteiro ══════════════════════
--
-- `saldo_creditos` e `valor` sao numeric(14,2): as duas casas SEMPRE existiram,
-- e o `ceil` as descartava a toa. Com elas, 0,0585 vira 0,06 -- fiel ate o
-- centesimo de credito.
--
-- O `greatest(.., 0.01)` preserva o que o `ceil` protegia de verdade: chamada
-- com custo real nunca sai de graca, por menor que seja. So que o piso passou
-- de 1 credito para 0,01, cem vezes mais fino. Sem ele, um custo abaixo de
-- US$ 0,0000033 arredondaria para zero, e chamada barata em volume -- o perfil
-- de uma automacao em laco -- voltaria a nao ser cobrada.
--
-- A tela nao muda: ela formata credito sem casas decimais, entao o centesimo
-- aparece somado no saldo e nunca sozinho.

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
  -- A definicao da unidade. Ver o cabecalho da migration 20260925000002: isto
  -- NAO e preco, e mudar este numero mudaria o significado de todo saldo ja
  -- vendido.
  c_creditos_por_dolar constant numeric := 1500;
  v_creditos numeric;
  v_saldo    numeric;
begin
  if p_custo_usd <= 0 then
    -- Chamada sem custo (cache, erro antes do modelo) nao mexe no saldo nem
    -- polui o extrato com linha de zero.
    select saldo_creditos into v_saldo from credit_accounts where company_id = p_company_id;
    return v_saldo;
  end if;

  -- Era `ceil(...)`, que cobrava 1 credito inteiro pelo embedding de busca da
  -- Base de Conhecimento -- custo real de 0,0117 a 0,234 credito, ate 85x mais.
  -- As colunas sempre tiveram 2 casas; o `ceil` as descartava. O piso de 0,01
  -- preserva o que o `ceil` protegia de fato: chamada barata em laco nao sai
  -- de graca.
  v_creditos := greatest(round(p_custo_usd * c_creditos_por_dolar, 2), 0.01);

  -- Empresa sem conta de credito nao e tocada: e quem usa chave propria e paga
  -- direto ao fornecedor. O update nao acha linha, o insert nao acontece.
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
  'Debita o custo real convertido em creditos (1500 por USD), com 2 casas e piso de 0,01. Devolve null para empresa sem conta (BYOK). Repetir com o mesmo agent_usage_id falha por chave duplicada.';
