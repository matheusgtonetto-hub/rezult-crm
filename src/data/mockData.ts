// ─── Types only — zero mock data ───────────────────────────────────────────

export type Priority = "Alta" | "Média" | "Baixa";
export type LeadOrigin = "Instagram" | "Facebook Ads" | "Indicação" | "Site" | "Outro";
export type TaskStatus = "Pendente" | "Concluída";
export type ActivityType = "stage_change" | "note" | "whatsapp" | "won" | "lost" | "created";
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
  tags?: string[];
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
}

export interface Tag {
  id: string;
  name: string;
  description: string;
  color: string;
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
}

export interface Pipeline {
  id: string;
  name: string;
  category: PipelineCategory;
  description?: string;
  columns: PipelineColumn[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  defaultValue: number;
}

export const stageColors = {
  "novo-lead": "#AAAAAA",
  "contato-feito": "#378ADD",
  "proposta-enviada": "#F59E0B",
  "negociacao": "#8B5CF6",
  "fechado": "#128A68",
  "perdido": "#E24B4A",
} as const;
