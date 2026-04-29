export interface PlanPricing {
  mensal: string;
  semestral: string;
  semestralSave: string;
  anual: string;
  anualSave: string;
}

export interface PlanDefinition {
  key: string;
  name: string;
  badge?: string;
  features: string[];
  pricing: PlanPricing;
}

export const PLANS: PlanDefinition[] = [
  {
    key: "starter",
    name: "Starter",
    features: [
      "Até 5 pipelines com até 8 etapas",
      "Negócios e produtos",
      "Até 5 mil leads com tags",
      "4 membros",
      "8 automações",
      "3 conexões de multiatendimento",
      "3 Webhooks",
    ],
    pricing: {
      mensal:        "R$ 297,00",
      semestral:     "R$ 226,50",
      semestralSave: "R$ 423,00",
      anual:         "R$ 183,25",
      anualSave:     "R$ 1.365,00",
    },
  },
  {
    key: "essential",
    name: "Essential",
    badge: "Recomendado",
    features: [
      "Até 20 pipelines com até 15 etapas",
      "Negócios e produtos",
      "Até 100 mil leads com tags",
      "15 membros",
      "20 automações",
      "10 conexões de multiatendimento",
      "15 Webhooks",
      "Dashboards de negócios",
      "Acesso à API",
    ],
    pricing: {
      mensal:        "R$ 460,00",
      semestral:     "R$ 402,00",
      semestralSave: "R$ 348,00",
      anual:         "R$ 344,00",
      anualSave:     "R$ 1.392,00",
    },
  },
  {
    key: "pro",
    name: "Pro",
    features: [
      "Pipelines ilimitadas com até 25 etapas",
      "Leads ilimitados",
      "Membros ilimitados",
      "Automações ilimitadas",
      "Conexões ilimitadas",
      "Webhooks ilimitados",
      "Dashboards + API",
    ],
    pricing: {
      mensal:        "R$ 807,00",
      semestral:     "R$ 750,00",
      semestralSave: "R$ 342,00",
      anual:         "R$ 692,00",
      anualSave:     "R$ 1.380,00",
    },
  },
];
