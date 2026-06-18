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

export interface PlanLimits {
  leads: number | null;
  members: number | null;
  connections: number | null;
  automations: number | null;
  pipelines: number | null;
  webhooks: number | null;
  storage: number | null; // GB
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:     { leads: 50,     members: 2,    connections: 1,    automations: 3,    pipelines: 2,    webhooks: 1,    storage: 1    },
  silver:   { leads: 5000,   members: 4,    connections: 3,    automations: 8,    pipelines: 5,    webhooks: 3,    storage: 10   },
  platinum: { leads: 100000, members: 15,   connections: 10,   automations: 20,   pipelines: 20,   webhooks: 15,   storage: 50   },
  emerald:  { leads: null,   members: null, connections: null, automations: null, pipelines: null, webhooks: null, storage: null },
};

export const PLANS: PlanDefinition[] = [
  {
    key: "silver",
    name: "Silver",
    features: [
      "Criação e gerenciamento de até 5 pipelines com até 8 etapas.",
      "Criação e gerenciamento de negócios e produtos.",
      "Gerenciamento de até 5 mil leads com controle de tags.",
      "Cadastro de 4 membros na empresa.",
      "8 automações para otimizar interações com leads.",
      "Multiatendimento com até 3 conexões (WhatsApp, Instagram e outros).",
      "3 integrações com Webhooks para conectar outras ferramentas.",
    ],
    pricing: {
      mensal:        "R$ 237,00",
      semestral:     "R$ 201,50",   // R$1.209,00 / 6
      semestralSave: "R$ 213,00",   // economia total vs mensal
      anual:         "R$ 165,75",   // R$1.989,00 / 12
      anualSave:     "R$ 855,00",   // economia total vs mensal
    },
  },
  {
    key: "platinum",
    name: "Platinum",
    badge: "Recomendado",
    features: [
      "Criação e gerenciamento de até 20 pipelines com até 15 etapas.",
      "Criação e gerenciamento de negócios e produtos.",
      "Gerenciamento de até 100 mil leads com controle de tags.",
      "Cadastro de 15 membros na empresa.",
      "20 automações para otimizar interações com leads.",
      "Multiatendimento com até 10 conexões (WhatsApp, Instagram e outros).",
      "15 integrações com Webhooks para conectar outras ferramentas.",
      "Dashboards de negócios das pipelines.",
      "Acesso à API para integração com outras ferramentas.",
    ],
    pricing: {
      mensal:        "R$ 399,00",
      semestral:     "R$ 339,17",   // R$2.035,00 / 6
      semestralSave: "R$ 359,00",   // economia total vs mensal
      anual:         "R$ 279,33",   // R$3.352,00 / 12
      anualSave:     "R$ 1.436,00", // economia total vs mensal
    },
  },
  {
    key: "emerald",
    name: "Emerald",
    features: [
      "Criação e gerenciamento de pipelines ilimitadas com até 25 etapas.",
      "Gerenciamento ilimitado de leads com controle de tags.",
      "Criação e gerenciamento de negócios e produtos.",
      "Cadastro ilimitado de membros na empresa.",
      "Automações ilimitadas para otimizar interações com leads.",
      "Multiatendimento com conexões ilimitadas (WhatsApp, Instagram e outros).",
      "Integrações com Webhooks ilimitadas para conectar outras ferramentas.",
      "Dashboards de negócios das pipelines.",
      "Acesso à API para integração com outras ferramentas.",
    ],
    pricing: {
      mensal:        "R$ 747,00",
      semestral:     "R$ 635,00",   // R$3.810,00 / 6
      semestralSave: "R$ 672,00",   // economia total vs mensal
      anual:         "R$ 522,67",   // R$6.272,00 / 12
      anualSave:     "R$ 2.692,00", // economia total vs mensal
    },
  },
];
