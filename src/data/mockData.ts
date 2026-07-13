// ─── Types only — zero mock data ───────────────────────────────────────────

export type Priority = "Alta" | "Média" | "Baixa";
export type LeadOrigin = "Instagram" | "Facebook Ads" | "Google Ads" | "Meta Ads" | "TikTok Ads" | "LinkedIn Ads" | "YouTube Ads" | "Email Marketing" | "Orgânico" | "WhatsApp" | "Evento" | "Indicação" | "Site" | "Outro";
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
  "fechado": "#128A68",
  "perdido": "#E24B4A",
} as const;
