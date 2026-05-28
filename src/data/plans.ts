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
      "Criação e gerenciamento de até 5 pipelines com até 8 etapas.",
      "Criação e gerenciamento de negócios e produtos.",
      "Gerenciamento de até 5 mil leads com controle de tags.",
      "Cadastro de 4 membros na empresa.",
      "8 automações para otimizar interações com leads.",
      "Multiatendimento com até 3 conexões (WhatsApp, Instagram e outros).",
      "3 integrações com Webhooks para conectar outras ferramentas.",
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
      mensal:        "R$ 807,00",
      semestral:     "R$ 750,00",
      semestralSave: "R$ 342,00",
      anual:         "R$ 692,00",
      anualSave:     "R$ 1.380,00",
    },
  },
];
