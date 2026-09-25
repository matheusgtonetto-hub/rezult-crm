-- Passo 2b: fechar a medição de custo nos CINCO pontos que chamam IA.
--
-- Varredura de 25/09/2026 sobre supabase/functions/*/index.ts, procurando por
-- api.openai.com, api.anthropic.com e generativelanguage.googleapis.com:
--
--   agent-operacional-runner  → media e debitava
--   agent-sds-qualify         → media e debitava
--   automation-runner (bloco ia) → NÃO media
--   ai-suggest-reply             → NÃO media
--   agent-kb-ingest (embeddings) → NÃO media
--
-- Metade do consumo era invisível. Uma tela de consumo alimentada por esse
-- número mostraria menos do que a realidade, e o cliente confiaria nela. Cobrar
-- sobre ele seria pior ainda. Por isso 2b vem antes da tela e antes da venda.

-- ── 1. agent_id deixa de ser obrigatório ───────────────────────────────────
--
-- Três dos cinco pontos não têm agente nenhum: uma sugestão de resposta no
-- Multiatendimento é do atendente humano, um bloco de IA dentro de automação é
-- da automação, e um embedding da Base de Conhecimento é do documento.
--
-- A alternativa seria uma segunda tabela de uso. Rejeitada: o débito é
-- idempotente por `credit_transactions.agent_usage_id`, que é uma FK para
-- ESTA tabela. Duas tabelas de uso significariam duas chaves de idempotência e
-- dois caminhos para o mesmo dinheiro.
alter table public.agent_usage_log
  alter column agent_id drop not null;

-- ── 2. `origem`: de onde veio a chamada ────────────────────────────────────
--
-- É a dimensão que a tela de Consumo agrega por coluna (agente nas linhas,
-- origem nas colunas), e é o que permite responder "minhas automações gastam
-- mais que meus agentes?" sem nomear modelo nenhum para o cliente.
alter table public.agent_usage_log
  add column if not exists origem text not null default 'agente';

alter table public.agent_usage_log
  drop constraint if exists agent_usage_log_origem_valida;

alter table public.agent_usage_log
  add constraint agent_usage_log_origem_valida
  check (origem in ('agente', 'automacao', 'sugestao', 'base_conhecimento'));

comment on column public.agent_usage_log.origem is
  'agente | automacao | sugestao | base_conhecimento. Dimensao de agregacao da tela de Consumo.';

-- O default 'agente' está correto para todas as linhas já existentes: até hoje
-- só os dois runners de agente escreviam aqui.

-- ── 3. Precisão: numeric(10,4) não enxerga um embedding ────────────────────
--
-- Um chunk de 500 tokens no text-embedding-3-large custa US$ 0,000065. Com 4
-- casas decimais isso vira 0,0001 (erro de 54%) e um chunk menor vira 0,0000 --
-- ingestão de documento apareceria como consumo ZERO.
--
-- Seis casas é o mesmo que credit_transactions.custo_usd já usa, então as duas
-- colunas passam a bater exatamente na conciliação mensal. Antes não batiam: o
-- débito guardava 6 casas e a origem, 4.
alter table public.agent_usage_log
  alter column cost_usd type numeric(12,6);

-- ── 4. Índice para a tela de Consumo ───────────────────────────────────────
-- Os índices existentes são por (agent_id, created_at) e (lead_id). A tela nova
-- filtra por empresa e período, e agent_id agora pode ser null.
create index if not exists agent_usage_log_empresa_data
  on public.agent_usage_log (company_id, created_at desc);
