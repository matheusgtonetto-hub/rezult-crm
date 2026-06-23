-- Corrige CHECK constraint de plan_name em subscriptions após renomeação dos planos
-- (starter→silver, essential→platinum, pro→emerald feita em 20260613000001_rename_plans.sql)
-- O constraint antigo rejeitava os novos nomes, causando HTTP 500 no stripe-webhook.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_name_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_name_check
  CHECK (plan_name IN ('silver', 'platinum', 'emerald'));

-- Atualiza plan_limits para os novos nomes (seguro com ON CONFLICT)
DELETE FROM plan_limits WHERE plan_name IN ('starter', 'essential', 'pro');

INSERT INTO plan_limits (plan_name, max_users, max_pipelines, max_leads) VALUES
  ('silver',   3,   2,    500),
  ('platinum', 10,  5,   2000),
  ('emerald',  -1,  -1,    -1)
ON CONFLICT (plan_name) DO UPDATE SET
  max_users     = EXCLUDED.max_users,
  max_pipelines = EXCLUDED.max_pipelines,
  max_leads     = EXCLUDED.max_leads;
