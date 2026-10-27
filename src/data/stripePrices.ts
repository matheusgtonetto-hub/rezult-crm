export const STRIPE_PRICES = {
  /*
   * Starter: SÓ MENSAL (dono, 26/10/2026). Produto no Stripe:
   * prod_VW0TXyilSbvLYL. Semestral e anual ficam vazios para sempre, e os três
   * pontos que abrem o checkout recusam ID vazio com um aviso em vez de chamar
   * o Stripe.
   */
  starter: {
    monthly:    "price_1UUyT0HxAJVer2B2wNTb51rc",
    semiannual: "",
    annual:     "",
  },
  silver: {
    monthly:    "price_1TougzHxAJVer2B2OhFa2dMf",
    semiannual: "price_1TougyHxAJVer2B2XcQObtEA",
    annual:     "price_1TougzHxAJVer2B2pYF5yixE",
  },
  platinum: {
    monthly:    "price_1TougzHxAJVer2B21QUlvqh7",
    semiannual: "price_1Touh0HxAJVer2B2nc56t9f1",
    annual:     "price_1TougzHxAJVer2B2U6e9SlEV",
  },
  emerald: {
    monthly:    "price_1TougyHxAJVer2B2UWGevkxv",
    semiannual: "price_1TougzHxAJVer2B247BGzYO9",
    annual:     "price_1TougzHxAJVer2B2pePEiWPm",
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_PRICES;
export type StripeBillingPeriod = "monthly" | "semiannual" | "annual";
