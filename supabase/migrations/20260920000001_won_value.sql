-- Valor do negócio NO MOMENTO DO GANHO.
--
-- Aplicada em produção em 20/09/2026 (pelo MCP do Supabase); este arquivo
-- registra a mudança no repositório.
--
-- Até aqui o dashboard somava `leads.value`, que é o valor ATUAL: editar o
-- negócio depois mudava a receita do mês passado, e um negócio reaberto e ganho
-- de novo por outro preço reescrevia o histórico. O valor informado no ganho só
-- existia dentro do TEXTO da atividade ("… · Valor: R$ 2.191,00"), de onde não
-- dá para somar.
--
-- Nulo = negócio que nunca foi ganho, ou ganho antes desta coluna existir e sem
-- valor recuperável. Quem lê usa `coalesce(won_value, value)`.
alter table leads add column if not exists won_value numeric;

comment on column leads.won_value is
  'Valor do negócio congelado no momento em que foi marcado como ganho. Preenchido por markLeadWon; limpo ao reabrir. Leitura: coalesce(won_value, value).';

-- Backfill: congela o valor ATUAL dos negócios já ganhos. De propósito NÃO
-- reinterpreta o histórico (não vai buscar o número dentro do texto da
-- atividade): isso mudaria valores que os clientes já veem nos painéis.
update leads set won_value = value where status = 'won' and won_value is null;
