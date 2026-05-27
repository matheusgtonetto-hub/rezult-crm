-- Migração: refatora subscriptions para vinculação por empresa (company_id como FK principal)
-- e cria tabela plan_limits com limites por plano.

-- 1. Remove a tabela anterior (criada em 20260527000002) e recria com estrutura correta
DROP TABLE IF EXISTS subscriptions;

CREATE TABLE subscriptions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_user_id            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_customer_id       text,
  stripe_subscription_id   text        UNIQUE,
  stripe_price_id          text,
  plan_name                text        CHECK (plan_name IN ('starter', 'essential', 'pro')),
  billing_period           text        CHECK (billing_period IN ('monthly', 'semiannual', 'annual')),
  status                   text        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  trial_ends_at            timestamptz,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  canceled_at              timestamptz,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuário vê a subscription se:
--   a) for o owner da empresa
--   b) for membro da empresa
--   c) for o owner_user_id registrado na subscription
CREATE POLICY "Company members view subscription"
  ON subscriptions FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR company_id IN (
      SELECT id FROM companies WHERE owner_id = auth.uid()
    )
    OR auth.uid() IN (
      SELECT user_id FROM company_members WHERE company_id = subscriptions.company_id
    )
  );

-- 2. Tabela de limites por plano
CREATE TABLE IF NOT EXISTS plan_limits (
  plan_name      text    PRIMARY KEY,
  max_users      integer NOT NULL,
  max_pipelines  integer NOT NULL,
  max_leads      integer NOT NULL
);

-- Sem RLS — leitura pública (dados não sensíveis)
ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plan limits are publicly readable"
  ON plan_limits FOR SELECT
  USING (true);

INSERT INTO plan_limits (plan_name, max_users, max_pipelines, max_leads) VALUES
  ('starter',   3,   2,    500),
  ('essential', 10,  5,   2000),
  ('pro',       -1,  -1,    -1)   -- -1 = ilimitado
ON CONFLICT (plan_name) DO UPDATE SET
  max_users     = EXCLUDED.max_users,
  max_pipelines = EXCLUDED.max_pipelines,
  max_leads     = EXCLUDED.max_leads;
