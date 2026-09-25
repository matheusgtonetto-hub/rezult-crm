-- Passo 3b: a agregação que alimenta a aba "Consumo".
--
-- ═══ Por que é função, e não uma query na tela ═══════════════════════════════
--
-- Porque os créditos consumidos NÃO podem ser calculados a partir do dólar.
-- `debitar_credito` arredonda cada chamada para cima (`ceil`), individualmente:
-- a soma dos `ceil` não é o `ceil` da soma. Multiplicar o custo total por 1500
-- na tela daria um número que não fecha com o extrato, e um consumo que não
-- fecha com o saldo é pior do que nenhum consumo na tela.
--
-- Então a verdade é a soma de `credit_transactions.valor`, que exige juntar
-- agent_usage_log + credit_transactions + agents. PostgREST não agrega join.
--
-- ═══ Por que SECURITY INVOKER (o padrão), e não DEFINER ═════════════════════
--
-- Uma função DEFINER aqui precisaria checar `is_member_of(p_company_id)` na
-- primeira linha, e esquecer essa checagem é o erro que já foi corrigido QUATRO
-- vezes nesta base (22, 23, 24 e 25/09/2026): função DEFINER alcançável pela
-- chave pública devolvendo dado de qualquer empresa.
--
-- Como INVOKER, o RLS das três tabelas aplica sozinho -- todas usam
-- `is_member_of(company_id)`. Não há guarda para esquecer. Custa uma checagem
-- por tabela e elimina a classe de erro.

create or replace function public.consumo_por_origem(
  p_company_id uuid,
  p_dias       int default 30
)
returns table (
  origem     text,
  rotulo     text,
  agent_id   uuid,
  chamadas   bigint,
  creditos   numeric,
  custo_usd  numeric
)
language sql
stable
set search_path = 'public'
as $$
  select
    u.origem,
    -- O que o cliente lê na linha. Agente tem nome; os outros três pontos de
    -- chamada não são agente nenhum e ganham o nome da função que os gerou.
    coalesce(
      a.name,
      case u.origem
        when 'automacao'         then 'Automações'
        when 'sugestao'          then 'Sugestão de resposta'
        when 'base_conhecimento' then 'Base de Conhecimento'
        else 'Agente removido'
      end
    ) as rotulo,
    u.agent_id,
    count(*) as chamadas,
    -- `valor` é negativo no consumo. Zero quando a empresa não tem conta de
    -- crédito (BYOK): não há débito porque ela paga direto ao fornecedor.
    coalesce(-sum(t.valor), 0) as creditos,
    coalesce(sum(u.cost_usd), 0) as custo_usd
  from agent_usage_log u
  left join agents a on a.id = u.agent_id
  -- LEFT, e não INNER: a chamada existe mesmo sem débito. É assim que o
  -- consumo de quem usa chave própria continua visível na tela, em dólar.
  left join credit_transactions t
         on t.agent_usage_id = u.id
        and t.tipo = 'consumo'
  where u.company_id = p_company_id
    and u.created_at >= now() - make_interval(days => p_dias)
  group by u.origem, rotulo, u.agent_id
  order by creditos desc, custo_usd desc;
$$;

comment on function public.consumo_por_origem(uuid, int) is
  'Consumo de IA agregado por origem e agente, nos ultimos N dias. SECURITY INVOKER: o RLS das tabelas faz o isolamento.';

revoke execute on function public.consumo_por_origem(uuid, int) from public, anon;
grant  execute on function public.consumo_por_origem(uuid, int) to authenticated, service_role;
