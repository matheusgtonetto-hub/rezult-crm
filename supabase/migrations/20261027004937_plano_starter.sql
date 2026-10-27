-- Plano Starter (R$ 97), criado em 26/10/2026.
--
-- A restrição de subscriptions.plan_name só aceitava os três planos pagos. Sem
-- 'starter' na lista, a primeira venda do Starter faria o stripe-webhook falhar
-- com 500 ao gravar a assinatura -- o mesmo erro que a migration
-- 20260616000001 corrigiu depois da renomeação dos planos.
--
-- 'starter' já foi a chave do plano que virou 'silver' em 13/06/2026
-- (20260613000001). Conferido antes de reaproveitar: nenhuma assinatura ATIVA
-- daquela época carrega o nome antigo do Silver; a única ativa anterior à
-- renomeação é um Emerald.
--
-- companies.plan não tem restrição de valores, então só esta tabela muda.

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_name_check;

alter table public.subscriptions
  add constraint subscriptions_plan_name_check
  check (plan_name in ('starter', 'silver', 'platinum', 'emerald'));
