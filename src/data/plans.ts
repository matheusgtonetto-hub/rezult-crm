export interface PlanPricing {
  mensal: string;
  semestral: string;
  semestralSave: string;
  anual: string;
  anualSave: string;
}

/**
 * Um item da lista de benefícios do plano.
 *
 * Vem partido em dois porque a leitura é assim: `forte` é o número, que é o que
 * a pessoa compara entre os planos, e `resto` é o que aquele número mede. Em
 * "**5 mil leads** com controle de tags", quem decide entre Silver e Platinum lê
 * o negrito e pula o resto.
 *
 * Os dois são opcionais porque os últimos itens de cada plano não têm número
 * nenhum ("Acesso à API e MCP"), e aí só o `resto` é preenchido.
 *
 * A redação é a de rezult-site/planos.html, palavra por palavra, inclusive sem
 * ponto final. Três telas que vendem o mesmo plano não podem descrevê-lo com
 * palavras diferentes.
 */
export interface Recurso {
  forte?: string;
  resto?: string;
}

/** Chave estável para listas. O par forte+resto é único dentro de um plano. */
export const chaveDoRecurso = (r: Recurso) => `${r.forte ?? ""}|${r.resto ?? ""}`;

export interface PlanDefinition {
  key: string;
  name: string;
  badge?: string;
  /**
   * Fonte única dos benefícios. Antes existiam TRÊS listas do mesmo plano --
   * esta, a `SETUP_PLAN_FEATURES` do /setup e a `UPGRADE_PLAN_INFO` das
   * configurações -- e elas já tinham divergido: o /setup prometia "Acesso à
   * API e MCP" no Silver enquanto as outras duas só davam API a partir do
   * Platinum. Quem compara a tela da oferta com a de upgrade vê promessas
   * diferentes do mesmo produto.
   */
  features: Recurso[];
  pricing: PlanPricing;
  /**
   * Só é vendido no ciclo MENSAL: some das abas semestral e anual de toda tela
   * de venda. Quem decide isso é `planosDoPeriodo`, e não cada tela.
   */
  soMensal?: boolean;
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

export const PAID_PLANS = ["starter", "silver", "platinum", "emerald"];

/**
 * O plano que vale AGORA, já considerando a validade.
 *
 * A coluna `plan` guarda o que foi contratado e não muda sozinha quando a data
 * passa. Quem lia `PLAN_LIMITS[company.plan]` direto continuava concedendo o
 * limite do plano pago a uma empresa vencida: em agosto/2026 uma conta expirada
 * seguia com os 5000 leads do Silver. Passe sempre por aqui antes de consultar
 * limite, senão o vencimento não significa nada na prática.
 */
export function planoEmVigor(
  company: { plan?: string | null; plan_expires_at?: string | null } | null | undefined,
): string {
  if (!company) return "free";
  if (!PAID_PLANS.includes(company.plan ?? "")) return "free";
  if (!company.plan_expires_at) return "free";
  return new Date(company.plan_expires_at) < new Date() ? "free" : (company.plan as string);
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:      { leads: 50,     members: 2,    connections: 1,    automations: 3,    pipelines: 2,    webhooks: 1,    storage: 1    },
  // Starter (26/10/2026): o plano de entrada de R$ 97. Os seis números são os
  // que o dono definiu; o armazenamento ficou em 1 GB, o do free.
  starter:   { leads: 500,    members: 1,    connections: 1,    automations: 3,    pipelines: 2,    webhooks: 3,    storage: 1    },
  silver:    { leads: 5000,   members: 4,    connections: 3,    automations: 8,    pipelines: 5,    webhooks: 3,    storage: 10   },
  platinum:  { leads: 100000, members: 15,   connections: 10,   automations: 20,   pipelines: 20,   webhooks: 15,   storage: 50   },
  emerald:   { leads: null,   members: null, connections: null, automations: null, pipelines: null, webhooks: null, storage: null },
};

export const PLANS: PlanDefinition[] = [
  {
    key: "starter",
    name: "Starter",
    // Só mensal, decisão do dono (26/10/2026). Os campos semestral e anual de
    // `pricing` ficam vazios porque o tipo os exige, e nenhuma tela os lê:
    // `planosDoPeriodo` tira o Starter dessas abas antes.
    soMensal: true,
    features: [
      { forte: "1 usuário",     resto: "no sistema" },
      { forte: "500 leads",     resto: "com controle de tags" },
      { forte: "3 automações",  resto: "para interações com leads" },
      { forte: "1 conexão",     resto: "WhatsApp" },
      { forte: "2 pipelines",   resto: "com até 8 etapas" },
      { forte: "3 integrações", resto: "via Webhook" },
      { resto: "Acesso à API e MCP" },
      { resto: "Dashboards detalhados da operação" },
    ],
    pricing: {
      mensal:        "R$ 97,00",
      semestral:     "",
      semestralSave: "",
      anual:         "",
      anualSave:     "",
    },
  },
  {
    key: "silver",
    name: "Silver",
    features: [
      { forte: "4 usuários",    resto: "no sistema" },
      { forte: "5 mil leads",   resto: "com controle de tags" },
      { forte: "8 automações",  resto: "para interações com leads" },
      { forte: "3 conexões",    resto: "WhatsApp" },
      { forte: "5 pipelines",   resto: "com até 8 etapas" },
      { forte: "3 integrações", resto: "via Webhook" },
      { resto: "Acesso à API e MCP" },
      { resto: "Dashboards detalhados da operação" },
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
      { forte: "15 usuários",    resto: "no sistema" },
      { forte: "100 mil leads",  resto: "com controle de tags" },
      { forte: "20 automações",  resto: "para interações com leads" },
      { forte: "10 conexões",    resto: "WhatsApp" },
      { forte: "20 pipelines",   resto: "com até 15 etapas" },
      { forte: "15 integrações", resto: "via Webhook" },
      { resto: "Acesso à API e MCP" },
      { resto: "Dashboards detalhados da operação" },
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
      { forte: "Usuários ilimitados",    resto: "no sistema" },
      { forte: "Leads ilimitados",       resto: "com controle de tags" },
      { forte: "Automações ilimitadas" },
      { forte: "Conexões ilimitadas",    resto: "WhatsApp" },
      { forte: "Pipelines ilimitadas",   resto: "com até 25 etapas" },
      { forte: "Integrações ilimitadas", resto: "via Webhook" },
      { resto: "Acesso à API e MCP" },
      { resto: "Dashboards detalhados da operação" },
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

/**
 * Os planos à venda num período, na ordem de `PLANS`.
 *
 * Existe porque o Starter é só mensal (26/10/2026). Sem um lugar único para
 * essa regra, cada uma das quatro telas de venda (Setup, oferta de
 * contratação, faixa do plano gratuito e /planos) filtraria do seu jeito, e
 * a primeira que esquecesse venderia um Starter anual que não existe.
 */
export function planosDoPeriodo(periodo: "mensal" | "semestral" | "anual"): PlanDefinition[] {
  return PLANS.filter(p => periodo === "mensal" || !p.soMensal);
}

/**
 * A classe de grade para N planos. Por extenso, e não `grid-cols-${n}`: o
 * Tailwind só gera as classes que encontra escritas no código.
 */
export const COLUNAS_DA_GRADE: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
};
