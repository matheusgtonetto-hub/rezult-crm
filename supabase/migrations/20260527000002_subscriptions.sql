-- Tabela de assinaturas Stripe
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id               uuid        REFERENCES companies(id) ON DELETE SET NULL,
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

CREATE POLICY "Users view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);
