-- Cobranca: separa o token de entrada CACHEADO, que custa 10% do normal.
--
-- ═══ O defeito ══════════════════════════════════════════════════════════════
--
-- O cache da OpenAI e automatico em prompts acima de 1.024 tokens, com 90% de
-- desconto no input cacheado. O prompt destes runners JA esta estruturado para
-- cachear: a mensagem `system` (3.917 tokens de metodologia no operacional,
-- 2.652 no SDS) vem PRIMEIRO, e o contexto variavel vem depois. Entao o
-- desconto ja vinha acontecendo.
--
-- So que `custoDaChamada` multiplicava TODOS os tokens de entrada pelo preco
-- cheio. O `cost_usd` gravado ficava acima do custo real, e:
--
--   1. o cliente era cobrado a mais -- o saldo dele caia por 1500 x um custo
--      inflado, e o markup efetivo passava dos 30% combinados;
--   2. a conciliacao mensal nao fecharia -- a soma dos nossos custo_usd ficaria
--      acima da fatura da OpenAI, e essa verificacao existe justamente para
--      detectar erro de medicao;
--   3. o hedge super-provisionava.
--
-- Ordem de grandeza, com 43 das 44 chamadas de um lead acertando o cache so na
-- metodologia: ~37% do custo no Terra.

alter table public.agent_usage_log
  add column if not exists cached_input_tokens integer not null default 0;

comment on column public.agent_usage_log.cached_input_tokens is
  'Parte de input_tokens que veio do cache do fornecedor e custa 10%. SUBCONJUNTO de input_tokens, nao soma a ele.';

-- Nota sobre o historico: as 98 linhas anteriores a esta migration ficam com
-- zero, o que as deixa com `cost_usd` SUPERESTIMADO. Nao da para corrigir
-- retroativamente, porque o dado de quanto foi cacheado nunca foi pedido ao
-- fornecedor. Elas seguem validas para medir ordem de grandeza (custo por lead,
-- chamadas por lead) e NAO servem para conciliar contra fatura.
