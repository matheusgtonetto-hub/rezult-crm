// ─── Types only — zero mock data ───────────────────────────────────────────

export type Priority = "Alta" | "Média" | "Baixa";
export type LeadOrigin = "Instagram" | "Facebook Ads" | "Google Ads" | "Meta Ads" | "TikTok Ads" | "LinkedIn Ads" | "YouTube Ads" | "Email Marketing" | "Orgânico" | "WhatsApp" | "Evento" | "Indicação" | "Site" | "Outro";

/**
 * As origens, na ordem em que aparecem nos seletores.
 *
 * Mora junto do tipo porque a lista PRECISA acompanhá-lo: uma origem nova no
 * tipo e esquecida aqui some dos filtros sem ninguém notar. Estava copiada em
 * três telas (filtro do pipeline, filtro do disparo e Multiatendimento), com a
 * ordem já divergindo entre elas.
 */
export const LEAD_ORIGINS: LeadOrigin[] = [
  "Instagram", "Facebook Ads", "Google Ads", "Meta Ads", "TikTok Ads", "LinkedIn Ads",
  "YouTube Ads", "Email Marketing", "Orgânico", "WhatsApp", "Evento", "Indicação", "Site", "Outro",
];
export type TaskStatus = "Pendente" | "Concluída";
export type ActivityType = "stage_change" | "note" | "whatsapp" | "won" | "lost" | "created" | "meeting" | "call" | "follow_up" | "task" | "email" | "transfer";
export type PipelineCategory = string;

export interface PipelineGroup {
  id: string;
  name: string;
  createdBy: string;
}

export interface Activity {
  id: string;
  date: string;
  type: ActivityType;
  description: string;
  userName?: string;
  pinned?: boolean;
  title?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  contactEmail?: string;
  meetLink?: string;
  completedAt?: string;
  completedBy?: string;
  noShowAt?: string;
  participants?: string[];
  gcalEventId?: string;
}

export type CustomFieldType = "text" | "number" | "currency" | "date" | "options" | "boolean";

export interface CustomFieldItem {
  id: string;
  groupId: string;
  label: string;
  fieldType: CustomFieldType;
  position: number;
}

export interface CustomFieldGroup {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  items: CustomFieldItem[];
  created_at?: string;
}

/** Um produto dentro de um negócio, com quantidade e preço próprios. */
export interface ItemDoNegocio {
  id: string;
  productId: string;
  quantidade: number;
  /**
   * Preço deste item NESTE negócio.
   *
   * Copiado do produto ao adicionar, e editável: é aqui que mora o desconto por
   * item. Guardado por item, e não lido do produto na hora de exibir, para a
   * tabela de preços poder mudar sem reescrever o que já foi vendido.
   */
  valorUnitario: number;
  posicao: number;
}

export interface Lead {
  id: string;
  dealNumber: number;
  name: string;
  company?: string;
  whatsapp: string;
  phoneDdi?: string;
  site?: string;
  email?: string;
  emails?: string[];
  value: number;
  /**
   * Os produtos deste negócio.
   *
   * Um negócio pode ter vários (decisão do dono em 20/09/2026, a pedido de
   * clientes). O `productId` acima CONTINUA existindo como espelho do primeiro
   * item, porque automações, agente de IA e o filtro de disparos ainda leem de
   * lá -- os dois andam juntos até aquela migração terminar.
   *
   * O valor do negócio é a soma de `quantidade × valorUnitario` destes itens,
   * calculada no banco. A exceção é `valorManual`, abaixo.
   */
  itens?: ItemDoNegocio[];
  /**
   * O valor do negócio foi digitado à mão e parou de acompanhar os itens.
   *
   * É o desconto no total: sem isto, o número digitado sumiria no próximo item
   * adicionado. Voltar para `false` faz o valor somar os itens de novo.
   */
  valorManual?: boolean;
  /**
   * Valor congelado no momento em que o negócio foi marcado como ganho.
   *
   * `value` é o valor ATUAL e muda quando alguém edita o negócio -- o que
   * reescrevia a receita de meses passados no dashboard. Este aqui não muda:
   * é o que foi fechado. Ausente em negócio que nunca foi ganho (e limpo ao
   * reabrir). Quem soma receita de ganho usa `wonValue ?? value`.
   */
  wonValue?: number;
  responsible: string;
  responsibles: string[];
  pipelineId: string;
  stage: string;
  priority: Priority;
  origin: LeadOrigin;
  productId?: string;
  entryDate: string;
  stageEnteredAt?: string;
  nextFollowUp?: string;
  notes: string;
  activities: Activity[];
  tags?: string[];
  dealStatus?: "open" | "won" | "lost";
  contactId?: string;
  personId?: string;
  lossReasonId?: string;
  created_at?: string;
  // Dados pessoais
  document?: string;
  birthDate?: string;
  // Endereço
  country?: string;
  zipCode?: string;
  address?: string;
  addrNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  customFieldValues?: Record<string, string>;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface CrmList {
  id: string;
  name: string;
  description: string;
  leadIds: string[];
  created_at?: string;
}

export interface Tag {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at?: string;
}

export interface Task {
  id: string;
  title: string;
  leadId: string;
  leadName: string;
  responsible: string;
  dueDate: string;
  status: TaskStatus;
}

export interface PipelineColumn {
  id: string;
  title: string;
  color: string;
  leadIds: string[];
  position: number;
}

export interface AttendantPermissions {
  blockViewPipeline?: boolean;
  blockChangeAttendant?: boolean;
  viewOwnDealsOnly?: boolean;
  blockDeleteDeals?: boolean;
  blockCreateDeals?: boolean;
}

export interface PipelinePermissions {
  byAttendant?: Record<string, AttendantPermissions>;
}

export interface Pipeline {
  id: string;
  name: string;
  category: PipelineCategory;
  description?: string;
  columns: PipelineColumn[];
  permissions?: PipelinePermissions;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  defaultValue: number;
  /** O que é o produto, em uma ou duas frases. Os agentes usam para explicar ao lead. */
  descricao?: string;
  /** Link de venda cadastrado. O agente Closer envia este link, nunca um escrito por ele. */
  linkVenda?: string;
  created_at?: string;
}

export interface LossReason {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
}

export const stageColors = {
  "novo-lead": "#AAAAAA",
  "contato-feito": "#378ADD",
  "proposta-enviada": "#F59E0B",
  "negociacao": "#8B5CF6",
  "fechado": "#008762",
  "perdido": "#E24B4A",
} as const;
