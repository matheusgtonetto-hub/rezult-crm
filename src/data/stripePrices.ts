export const STRIPE_PRICES = {
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
