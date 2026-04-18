export type Priority = "Alta" | "Média" | "Baixa";
export type LeadOrigin = "Instagram" | "Facebook Ads" | "Indicação" | "Site" | "Outro";
export type TaskStatus = "Pendente" | "Concluída";
export type ActivityType = "stage_change" | "note" | "whatsapp" | "won" | "lost" | "created";
export type PipelineCategory = "Venda" | "Follow-up" | "Operações";

export interface Activity {
  id: string;
  date: string;
  type: ActivityType;
  description: string;
}

export interface Lead {
  id: string;
  dealNumber: number;
  name: string;
  company?: string;
  whatsapp: string;
  email?: string;
  value: number;
  responsible: string;
  pipelineId: string;
  stage: string;
  priority: Priority;
  origin: LeadOrigin;
  productId?: string;
  entryDate: string;
  nextFollowUp?: string;
  notes: string;
  activities: Activity[];
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
  color: string; // hex/hsl for top line
  leadIds: string[];
}

export interface Pipeline {
  id: string;
  name: string;
  category: PipelineCategory;
  columns: PipelineColumn[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  defaultValue: number;
}

// Default column colors per stage type
export const stageColors = {
  "novo-lead": "#AAAAAA",
  "contato-feito": "#378ADD",
  "proposta-enviada": "#F59E0B",
  "negociacao": "#8B5CF6",
  "fechado": "#0F6E56",
  "perdido": "#E24B4A",
} as const;

const buildSalesColumns = (): PipelineColumn[] => [
  { id: "novo-lead", title: "Novo Lead", color: stageColors["novo-lead"], leadIds: ["1", "2", "9"] },
  { id: "contato-feito", title: "Contato Feito", color: stageColors["contato-feito"], leadIds: ["3", "10"] },
  { id: "proposta-enviada", title: "Proposta Enviada", color: stageColors["proposta-enviada"], leadIds: ["4", "5"] },
  { id: "negociacao", title: "Negociação", color: stageColors["negociacao"], leadIds: ["6", "11"] },
  { id: "fechado", title: "Fechado", color: stageColors["fechado"], leadIds: ["7", "12"] },
  { id: "perdido", title: "Perdido", color: stageColors["perdido"], leadIds: ["8", "13"] },
];

const buildFollowUpColumns = (): PipelineColumn[] => [
  { id: "fu-pendente", title: "Pendente", color: "#AAAAAA", leadIds: [] },
  { id: "fu-em-andamento", title: "Em andamento", color: "#378ADD", leadIds: [] },
  { id: "fu-concluido", title: "Concluído", color: "#0F6E56", leadIds: [] },
];

const buildRecoveryColumns = (): PipelineColumn[] => [
  { id: "rec-novo", title: "Reabrir contato", color: "#AAAAAA", leadIds: [] },
  { id: "rec-tentativa", title: "Tentativa", color: "#F59E0B", leadIds: [] },
  { id: "rec-recuperado", title: "Recuperado", color: "#0F6E56", leadIds: [] },
  { id: "rec-perdido", title: "Definitivamente perdido", color: "#E24B4A", leadIds: [] },
];

export const defaultPipelines: Pipeline[] = [
  { id: "pipe-comercial", name: "Pipeline Comercial", category: "Venda", columns: buildSalesColumns() },
  { id: "pipe-followup", name: "Follow-up", category: "Follow-up", columns: buildFollowUpColumns() },
  { id: "pipe-recuperacao", name: "Recuperação de Leads", category: "Follow-up", columns: buildRecoveryColumns() },
];

export const mockProducts: Product[] = [
  { id: "prod-1", name: "Plano Mensal", sku: "PM-001", defaultValue: 2500 },
  { id: "prod-2", name: "Plano Anual", sku: "PA-001", defaultValue: 24000 },
  { id: "prod-3", name: "Consultoria avulsa", sku: "CONS-01", defaultValue: 3500 },
];

const PIPE = "pipe-comercial";

export const mockLeads: Record<string, Lead> = {
  "1": {
    id: "1", dealNumber: 1001, name: "Ana Souza", company: "Bela Moda", whatsapp: "5511999887766",
    email: "ana@belamoda.com", value: 3500, responsible: "Carlos", pipelineId: PIPE, stage: "novo-lead",
    priority: "Alta", origin: "Instagram", productId: "prod-1",
    entryDate: "2026-04-01", nextFollowUp: "2026-04-13",
    notes: "Interessada em pacote mensal.", activities: [
      { id: "a1", date: "2026-04-01", type: "created", description: "Lead criado." },
      { id: "a1b", date: "2026-04-01", type: "note", description: "Lead captado via Instagram." },
    ],
  },
  "2": {
    id: "2", dealNumber: 1002, name: "Bruno Lima", company: "Tech Solutions", whatsapp: "5511988776655",
    value: 8000, responsible: "Mariana", pipelineId: PIPE, stage: "novo-lead",
    priority: "Média", origin: "Site", entryDate: "2026-04-03",
    notes: "", activities: [
      { id: "a2a", date: "2026-04-03", type: "created", description: "Lead criado." },
    ],
  },
  "3": {
    id: "3", dealNumber: 1003, name: "Carla Mendes", whatsapp: "5511977665544",
    email: "carla@email.com", value: 1200, responsible: "Carlos", pipelineId: PIPE, stage: "contato-feito",
    priority: "Baixa", origin: "Indicação", entryDate: "2026-03-28", nextFollowUp: "2026-04-14",
    notes: "Aguardando retorno.", activities: [
      { id: "a2", date: "2026-03-28", type: "note", description: "Primeiro contato por WhatsApp." },
      { id: "a3", date: "2026-04-02", type: "stage_change", description: "Movido para Contato Feito." },
    ],
  },
  "4": {
    id: "4", dealNumber: 1004, name: "Diego Ferreira", company: "DF Consulting", whatsapp: "5511966554433",
    value: 5000, responsible: "Mariana", pipelineId: PIPE, stage: "proposta-enviada",
    priority: "Alta", origin: "Facebook Ads", productId: "prod-3",
    entryDate: "2026-03-20", nextFollowUp: "2026-04-12",
    notes: "Proposta enviada dia 05/04.", activities: [
      { id: "a4", date: "2026-03-20", type: "note", description: "Lead de Facebook Ads." },
      { id: "a5", date: "2026-04-05", type: "stage_change", description: "Proposta enviada." },
    ],
  },
  "5": {
    id: "5", dealNumber: 1005, name: "Elisa Rocha", company: "Rocha & Filhos", whatsapp: "5511955443322",
    value: 2500, responsible: "Carlos", pipelineId: PIPE, stage: "proposta-enviada",
    priority: "Média", origin: "Instagram", entryDate: "2026-03-25",
    notes: "", activities: [
      { id: "a5b", date: "2026-03-25", type: "created", description: "Lead criado." },
    ],
  },
  "6": {
    id: "6", dealNumber: 1006, name: "Fábio Costa", whatsapp: "5511944332211",
    email: "fabio@email.com", value: 12000, responsible: "Carlos", pipelineId: PIPE, stage: "negociacao",
    priority: "Alta", origin: "Indicação", productId: "prod-2",
    entryDate: "2026-03-15", nextFollowUp: "2026-04-15",
    notes: "Negociando desconto para fechamento.", activities: [
      { id: "a6", date: "2026-03-15", type: "note", description: "Indicação do cliente João." },
      { id: "a6b", date: "2026-03-22", type: "whatsapp", description: "Conversa por WhatsApp." },
      { id: "a7", date: "2026-04-01", type: "stage_change", description: "Em negociação." },
    ],
  },
  "7": {
    id: "7", dealNumber: 1007, name: "Gisele Alves", company: "GA Design", whatsapp: "5511933221100",
    value: 4000, responsible: "Mariana", pipelineId: PIPE, stage: "fechado",
    priority: "Média", origin: "Site", productId: "prod-1",
    entryDate: "2026-03-10",
    notes: "Contrato assinado.", activities: [
      { id: "a8", date: "2026-04-08", type: "won", description: "Negócio fechado!" },
    ],
  },
  "8": {
    id: "8", dealNumber: 1008, name: "Hugo Santos", whatsapp: "5511922110099",
    value: 1500, responsible: "Carlos", pipelineId: PIPE, stage: "perdido",
    priority: "Baixa", origin: "Outro", entryDate: "2026-03-05",
    notes: "Sem orçamento no momento.", activities: [
      { id: "a9", date: "2026-04-06", type: "lost", description: "Lead perdido — sem budget." },
    ],
  },
  "9": {
    id: "9", dealNumber: 1009, name: "Isabela Martins", company: "Estúdio Aurora", whatsapp: "5511911223344",
    email: "isabela@aurora.com.br", value: 6200, responsible: "Rafael", pipelineId: PIPE, stage: "novo-lead",
    priority: "Média", origin: "Site", entryDate: "2026-04-04", nextFollowUp: "2026-04-15",
    notes: "Pediu material institucional.", activities: [
      { id: "a9a", date: "2026-04-04", type: "created", description: "Lead criado pelo formulário do site." },
    ],
  },
  "10": {
    id: "10", dealNumber: 1010, name: "João Pereira", company: "Pereira Advocacia", whatsapp: "5511900112233",
    email: "joao@pereiraadv.com.br", value: 9800, responsible: "Mariana", pipelineId: PIPE, stage: "contato-feito",
    priority: "Alta", origin: "Indicação", productId: "prod-2", entryDate: "2026-03-30", nextFollowUp: "2026-04-13",
    notes: "Vai apresentar para os sócios.", activities: [
      { id: "a10a", date: "2026-03-30", type: "whatsapp", description: "Primeiro contato por WhatsApp." },
    ],
  },
  "11": {
    id: "11", dealNumber: 1011, name: "Larissa Andrade", company: "LA Cosméticos", whatsapp: "5511899223344",
    email: "larissa@lacosmeticos.com.br", value: 15400, responsible: "Carlos", pipelineId: PIPE, stage: "negociacao",
    priority: "Alta", origin: "Facebook Ads", productId: "prod-2", entryDate: "2026-03-18", nextFollowUp: "2026-04-14",
    notes: "Discutindo prazo de pagamento.", activities: [
      { id: "a11a", date: "2026-04-02", type: "stage_change", description: "Avançou para Negociação." },
    ],
  },
  "12": {
    id: "12", dealNumber: 1012, name: "Marcos Oliveira", company: "MO Engenharia", whatsapp: "5511877334455",
    value: 22000, responsible: "Mariana", pipelineId: PIPE, stage: "fechado",
    priority: "Alta", origin: "Indicação", productId: "prod-2", entryDate: "2026-03-08",
    notes: "Cliente recorrente.", activities: [
      { id: "a12a", date: "2026-04-07", type: "won", description: "Renovação de contrato fechada." },
    ],
  },
  "13": {
    id: "13", dealNumber: 1013, name: "Natália Ribeiro", whatsapp: "5511866445566",
    email: "natalia@email.com", value: 2800, responsible: "Rafael", pipelineId: PIPE, stage: "perdido",
    priority: "Média", origin: "Instagram", entryDate: "2026-03-12",
    notes: "Optou por concorrente.", activities: [
      { id: "a13a", date: "2026-04-05", type: "lost", description: "Escolheu outra solução." },
    ],
  },
};

export const mockTasks: Task[] = [
  { id: "t1", title: "Enviar proposta comercial", leadId: "1", leadName: "Ana Souza", responsible: "Carlos", dueDate: "2026-04-13T10:00", status: "Pendente" },
  { id: "t2", title: "Follow-up por WhatsApp", leadId: "3", leadName: "Carla Mendes", responsible: "Carlos", dueDate: "2026-04-14T14:00", status: "Pendente" },
  { id: "t3", title: "Reunião de negociação", leadId: "6", leadName: "Fábio Costa", responsible: "Carlos", dueDate: "2026-04-11T09:00", status: "Pendente" },
  { id: "t4", title: "Enviar contrato", leadId: "4", leadName: "Diego Ferreira", responsible: "Mariana", dueDate: "2026-04-12T16:00", status: "Pendente" },
  { id: "t5", title: "Agendar demonstração", leadId: "2", leadName: "Bruno Lima", responsible: "Mariana", dueDate: "2026-04-10T11:00", status: "Concluída" },
];

export const teamMembers = ["Carlos", "Mariana", "Rafael"];

// Deterministic color per team member (for tags/avatars)
export const memberColors: Record<string, string> = {
  Carlos: "#0F6E56",
  Mariana: "#8B5CF6",
  Rafael: "#F59E0B",
};

// Backward-compat export (some code may still reference it)
export const defaultColumns: PipelineColumn[] = defaultPipelines[0].columns;
