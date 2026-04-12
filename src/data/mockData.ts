export type Priority = "Alta" | "Média" | "Baixa";
export type LeadOrigin = "Instagram" | "Facebook Ads" | "Indicação" | "Site" | "Outro";
export type TaskStatus = "Pendente" | "Concluída";

export interface Lead {
  id: string;
  name: string;
  company?: string;
  whatsapp: string;
  email?: string;
  value: number;
  responsible: string;
  stage: string;
  priority: Priority;
  origin: LeadOrigin;
  entryDate: string;
  nextFollowUp?: string;
  notes: string;
  activities: Activity[];
}

export interface Activity {
  id: string;
  date: string;
  type: "stage_change" | "note";
  description: string;
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
  leadIds: string[];
}

export const defaultColumns: PipelineColumn[] = [
  { id: "novo-lead", title: "Novo Lead", leadIds: ["1", "2"] },
  { id: "contato-feito", title: "Contato Feito", leadIds: ["3"] },
  { id: "proposta-enviada", title: "Proposta Enviada", leadIds: ["4", "5"] },
  { id: "negociacao", title: "Negociação", leadIds: ["6"] },
  { id: "fechado", title: "Fechado", leadIds: ["7"] },
  { id: "perdido", title: "Perdido", leadIds: ["8"] },
];

export const mockLeads: Record<string, Lead> = {
  "1": {
    id: "1", name: "Ana Souza", company: "Bela Moda", whatsapp: "5511999887766",
    email: "ana@belamoda.com", value: 3500, responsible: "Carlos", stage: "novo-lead",
    priority: "Alta", origin: "Instagram", entryDate: "2026-04-01", nextFollowUp: "2026-04-13",
    notes: "Interessada em pacote mensal.", activities: [
      { id: "a1", date: "2026-04-01", type: "note", description: "Lead captado via Instagram." },
    ],
  },
  "2": {
    id: "2", name: "Bruno Lima", company: "Tech Solutions", whatsapp: "5511988776655",
    value: 8000, responsible: "Mariana", stage: "novo-lead",
    priority: "Média", origin: "Site", entryDate: "2026-04-03",
    notes: "", activities: [],
  },
  "3": {
    id: "3", name: "Carla Mendes", whatsapp: "5511977665544",
    email: "carla@email.com", value: 1200, responsible: "Carlos", stage: "contato-feito",
    priority: "Baixa", origin: "Indicação", entryDate: "2026-03-28", nextFollowUp: "2026-04-14",
    notes: "Aguardando retorno.", activities: [
      { id: "a2", date: "2026-03-28", type: "note", description: "Primeiro contato por WhatsApp." },
      { id: "a3", date: "2026-04-02", type: "stage_change", description: "Movido para Contato Feito." },
    ],
  },
  "4": {
    id: "4", name: "Diego Ferreira", company: "DF Consulting", whatsapp: "5511966554433",
    value: 5000, responsible: "Mariana", stage: "proposta-enviada",
    priority: "Alta", origin: "Facebook Ads", entryDate: "2026-03-20", nextFollowUp: "2026-04-12",
    notes: "Proposta enviada dia 05/04.", activities: [
      { id: "a4", date: "2026-03-20", type: "note", description: "Lead de Facebook Ads." },
      { id: "a5", date: "2026-04-05", type: "stage_change", description: "Proposta enviada." },
    ],
  },
  "5": {
    id: "5", name: "Elisa Rocha", company: "Rocha & Filhos", whatsapp: "5511955443322",
    value: 2500, responsible: "Carlos", stage: "proposta-enviada",
    priority: "Média", origin: "Instagram", entryDate: "2026-03-25",
    notes: "", activities: [],
  },
  "6": {
    id: "6", name: "Fábio Costa", whatsapp: "5511944332211",
    email: "fabio@email.com", value: 12000, responsible: "Carlos", stage: "negociacao",
    priority: "Alta", origin: "Indicação", entryDate: "2026-03-15", nextFollowUp: "2026-04-15",
    notes: "Negociando desconto para fechamento.", activities: [
      { id: "a6", date: "2026-03-15", type: "note", description: "Indicação do cliente João." },
      { id: "a7", date: "2026-04-01", type: "stage_change", description: "Em negociação." },
    ],
  },
  "7": {
    id: "7", name: "Gisele Alves", company: "GA Design", whatsapp: "5511933221100",
    value: 4000, responsible: "Mariana", stage: "fechado",
    priority: "Média", origin: "Site", entryDate: "2026-03-10",
    notes: "Contrato assinado.", activities: [
      { id: "a8", date: "2026-04-08", type: "stage_change", description: "Negócio fechado!" },
    ],
  },
  "8": {
    id: "8", name: "Hugo Santos", whatsapp: "5511922110099",
    value: 1500, responsible: "Carlos", stage: "perdido",
    priority: "Baixa", origin: "Outro", entryDate: "2026-03-05",
    notes: "Sem orçamento no momento.", activities: [
      { id: "a9", date: "2026-04-06", type: "stage_change", description: "Lead perdido - sem budget." },
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

export const teamMembers = ["Carlos", "Mariana"];
