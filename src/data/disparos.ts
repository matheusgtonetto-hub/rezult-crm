// ─── Disparos — camada de dados ────────────────────────────────────────────
// Execução em massa de automações (gatilho manual por leads) sobre leads filtrados.
import { supabase } from "@/lib/supabase";
import type { Lead, CrmList } from "./mockData";

export type DisparoStatus = "criado" | "agendado" | "em_andamento" | "pausado" | "concluido" | "erro";
export type DisparoRhythm = "normal" | "turbo" | "lento" | "humano";
export type DisparoItemStatus = "nao_iniciado" | "pendente" | "em_execucao" | "concluido" | "erro";

// Filtro de leads (usado na etapa "Selecionar leads")
export interface LeadFilter {
  search?: string;
  tags?: { mode: "any" | "all" | "none"; ids: string[] };
  origins?: string[];
  responsibles?: string[];
  pipelines?: string[];
  stages?: string[];
  dealStatus?: Array<"open" | "won" | "lost">;
  valueMin?: number;
  valueMax?: number;
  lists?: string[];
  products?: string[];
  city?: string;
  state?: string;
  country?: string;
  createdFrom?: string;
  createdTo?: string;
  // op: "contem" (default, retrocompatível) | "igual" | "diferente"
  customFields?: Array<{ fieldId: string; op?: "igual" | "contem" | "diferente"; value: string }>;
  // Data de movimentação (entrada na etapa atual — stageEnteredAt)
  movedFrom?: string;
  movedTo?: string;
  // Motivo de perda (lossReasonId)
  lossReasons?: string[];
}

export interface Disparo {
  id: string;
  company_id: string;
  owner_id: string;
  created_by?: string;
  title: string;
  description?: string;
  automation_id?: string;
  automation_name?: string;
  status: DisparoStatus;
  rhythm: DisparoRhythm;
  filters: LeadFilter;
  scheduled_at?: string;
  confirm_filters: boolean;
  total_leads: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DisparoItem {
  id: string;
  disparo_id: string;
  company_id: string;
  owner_id: string;
  lead_id?: string;
  lead_name?: string;
  lead_phone?: string;
  status: DisparoItemStatus;
  error_message?: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

// ─── Metadados de apresentação ──────────────────────────────────────────────
export const RHYTHMS: { id: DisparoRhythm; label: string; hint: string }[] = [
  { id: "normal", label: "Normal", hint: "Até 50 execuções/segundo (aprox.)" },
  { id: "turbo",  label: "Turbo",  hint: "Até 80 execuções/segundo (aprox.)" },
  { id: "lento",  label: "Lento",  hint: "Até 20 execuções/segundo (aprox.)" },
  { id: "humano", label: "Humano", hint: "Até 6 execuções/minuto (aprox.)" },
];
export const RHYTHM_LABEL: Record<DisparoRhythm, { label: string; hint: string }> =
  Object.fromEntries(RHYTHMS.map(r => [r.id, { label: r.label, hint: r.hint }])) as Record<DisparoRhythm, { label: string; hint: string }>;

export const DISPARO_STATUS_META: Record<DisparoStatus, { label: string; color: string }> = {
  criado:       { label: "Criado",       color: "#2563EB" },
  agendado:     { label: "Agendado",     color: "#7C3AED" },
  em_andamento: { label: "Em andamento", color: "#0EA5E9" },
  pausado:      { label: "Pausado",      color: "#F59E0B" },
  concluido:    { label: "Concluído",    color: "#16A34A" },
  erro:         { label: "Com erro",     color: "#DC2626" },
};

export const ITEM_STATUS_META: Record<DisparoItemStatus, { label: string; bg: string; fg: string }> = {
  nao_iniciado: { label: "Criado",           bg: "#FEF9C3", fg: "#854D0E" },
  pendente:     { label: "Pendente",         bg: "#FFEDD5", fg: "#9A3412" },
  em_execucao:  { label: "Em execução",      bg: "#DBEAFE", fg: "#1E40AF" },
  concluido:    { label: "Concluído",        bg: "#DCFCE7", fg: "#166534" },
  erro:         { label: "Erro na execução", bg: "#FEE2E2", fg: "#991B1B" },
};

// ─── Motor de filtro (client-side, sobre os leads já carregados no CRMContext) ─
function inRange(dateStr: string | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr).getTime();
  if (from && d < new Date(from).getTime()) return false;
  if (to && d > new Date(to + "T23:59:59").getTime()) return false;
  return true;
}

export function leadMatchesFilter(lead: Lead, f: LeadFilter, ctx: { lists: CrmList[] }): boolean {
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${lead.name} ${lead.email ?? ""} ${lead.whatsapp ?? ""} ${lead.company ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.tags && f.tags.ids.length > 0) {
    const lt = lead.tags ?? [];
    if (f.tags.mode === "any" && !f.tags.ids.some(id => lt.includes(id))) return false;
    if (f.tags.mode === "all" && !f.tags.ids.every(id => lt.includes(id))) return false;
    if (f.tags.mode === "none" && f.tags.ids.some(id => lt.includes(id))) return false;
  }
  if (f.origins && f.origins.length > 0 && !f.origins.includes(lead.origin)) return false;
  if (f.responsibles && f.responsibles.length > 0) {
    const rs = lead.responsibles ?? (lead.responsible ? [lead.responsible] : []);
    if (!f.responsibles.some(r => rs.includes(r))) return false;
  }
  if (f.pipelines && f.pipelines.length > 0 && !f.pipelines.includes(lead.pipelineId)) return false;
  if (f.stages && f.stages.length > 0 && !f.stages.includes(lead.stage)) return false;
  if (f.dealStatus && f.dealStatus.length > 0 && !f.dealStatus.includes(lead.dealStatus ?? "open")) return false;
  if (typeof f.valueMin === "number" && lead.value < f.valueMin) return false;
  if (typeof f.valueMax === "number" && lead.value > f.valueMax) return false;
  if (f.products && f.products.length > 0 && !(lead.productId && f.products.includes(lead.productId))) return false;
  if (f.lists && f.lists.length > 0) {
    const inList = f.lists.some(listId => ctx.lists.find(l => l.id === listId)?.leadIds.includes(lead.id));
    if (!inList) return false;
  }
  if (f.city && (lead.city ?? "").toLowerCase() !== f.city.toLowerCase()) return false;
  if (f.state && (lead.state ?? "").toLowerCase() !== f.state.toLowerCase()) return false;
  if (f.country && (lead.country ?? "").toLowerCase() !== f.country.toLowerCase()) return false;
  if (!inRange(lead.created_at ?? lead.entryDate, f.createdFrom, f.createdTo)) return false;
  if (!inRange(lead.stageEnteredAt ?? lead.entryDate, f.movedFrom, f.movedTo)) return false;
  if (f.lossReasons && f.lossReasons.length > 0 && !(lead.lossReasonId && f.lossReasons.includes(lead.lossReasonId))) return false;
  if (f.customFields && f.customFields.length > 0) {
    for (const cf of f.customFields) {
      if (!cf.value) continue;
      const v = ((lead.customFieldValues ?? {})[cf.fieldId] ?? "").toLowerCase();
      const target = cf.value.toLowerCase();
      const op = cf.op ?? "contem";
      if (op === "igual" && v !== target) return false;
      if (op === "contem" && !v.includes(target)) return false;
      if (op === "diferente" && v === target) return false;
    }
  }
  return true;
}

export function filterLeads(leads: Lead[], f: LeadFilter, ctx: { lists: CrmList[] }): Lead[] {
  return leads.filter(l => leadMatchesFilter(l, f, ctx));
}

export function isFilterEmpty(f: LeadFilter): boolean {
  return !(
    (f.tags && f.tags.ids.length) || (f.origins && f.origins.length) || (f.responsibles && f.responsibles.length) ||
    (f.pipelines && f.pipelines.length) || (f.stages && f.stages.length) || (f.dealStatus && f.dealStatus.length) ||
    (f.lists && f.lists.length) || (f.products && f.products.length) ||
    typeof f.valueMin === "number" || typeof f.valueMax === "number" ||
    f.city || f.state || f.country || f.createdFrom || f.createdTo ||
    f.movedFrom || f.movedTo || (f.lossReasons && f.lossReasons.length) ||
    (f.customFields && f.customFields.some(c => c.value)) || f.search
  );
}

// ─── CRUD ───────────────────────────────────────────────────────────────────
function rowToDisparo(r: Record<string, unknown>): Disparo {
  return {
    id: r.id as string,
    company_id: r.company_id as string,
    owner_id: r.owner_id as string,
    created_by: (r.created_by as string) ?? undefined,
    title: r.title as string,
    description: (r.description as string) ?? undefined,
    automation_id: (r.automation_id as string) ?? undefined,
    automation_name: (r.automation_name as string) ?? undefined,
    status: r.status as DisparoStatus,
    rhythm: r.rhythm as DisparoRhythm,
    filters: (r.filters as LeadFilter) ?? {},
    scheduled_at: (r.scheduled_at as string) ?? undefined,
    confirm_filters: !!r.confirm_filters,
    total_leads: (r.total_leads as number) ?? 0,
    started_at: (r.started_at as string) ?? undefined,
    completed_at: (r.completed_at as string) ?? undefined,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export async function fetchDisparos(companyId: string): Promise<Disparo[]> {
  const { data, error } = await supabase
    .from("disparos")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDisparo);
}

export async function fetchDisparo(id: string): Promise<Disparo | null> {
  const { data, error } = await supabase.from("disparos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToDisparo(data) : null;
}

export async function fetchDisparoItens(disparoId: string): Promise<DisparoItem[]> {
  const { data, error } = await supabase
    .from("disparo_itens")
    .select("*")
    .eq("disparo_id", disparoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DisparoItem[];
}

export interface CreateDisparoInput {
  companyId: string;
  ownerId: string;
  createdBy?: string;
  title: string;
  description?: string;
  automationId: string;
  automationName?: string;
  rhythm: DisparoRhythm;
  filters: LeadFilter;
  scheduledAt?: string | null;
  confirmFilters: boolean;
  leads: { id: string; name: string; phone: string }[];
}

export async function createDisparo(input: CreateDisparoInput): Promise<Disparo> {
  const status: DisparoStatus = input.scheduledAt ? "agendado" : "criado";
  const { data, error } = await supabase
    .from("disparos")
    .insert({
      company_id: input.companyId,
      owner_id: input.ownerId,
      created_by: input.createdBy ?? null,
      title: input.title,
      description: input.description ?? null,
      automation_id: input.automationId,
      automation_name: input.automationName ?? null,
      status,
      rhythm: input.rhythm,
      filters: input.filters,
      scheduled_at: input.scheduledAt ?? null,
      confirm_filters: input.confirmFilters,
      total_leads: input.leads.length,
    })
    .select()
    .single();
  if (error) throw error;
  const disparo = rowToDisparo(data);

  if (input.leads.length > 0) {
    const rows = input.leads.map(l => ({
      disparo_id: disparo.id,
      company_id: input.companyId,
      owner_id: input.ownerId,
      lead_id: l.id,
      lead_name: l.name,
      lead_phone: l.phone,
      status: "nao_iniciado" as DisparoItemStatus,
    }));
    // insere em lotes para não estourar limites
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e2 } = await supabase.from("disparo_itens").insert(rows.slice(i, i + 500));
      if (e2) throw e2;
    }
  }
  return disparo;
}

export async function updateDisparo(id: string, patch: Partial<Disparo>): Promise<void> {
  const { error } = await supabase.from("disparos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDisparo(id: string): Promise<void> {
  const { error } = await supabase.from("disparos").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteDisparoItem(id: string): Promise<void> {
  const { error } = await supabase.from("disparo_itens").delete().eq("id", id);
  if (error) throw error;
}

// Automações elegíveis: apenas as que têm o gatilho "Execução manual da automação
// por lead ou contato" (triggerId === "lead_manual").
export interface AutomationOption { id: string; name: string; active: boolean; }
export async function fetchLeadManualAutomations(companyId: string): Promise<AutomationOption[]> {
  const { data, error } = await supabase
    .from("automations")
    .select("id, name, flow, active")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter(a => {
      const trig = (a.flow as { trigger?: { triggerId?: string } } | null)?.trigger;
      return trig?.triggerId === "lead_manual";
    })
    .map(a => ({ id: a.id as string, name: a.name as string, active: !!a.active }));
}

/**
 * Executa UMA automação manual em UM lead, agora.
 *
 * Mora aqui junto de `fetchLeadManualAutomations` porque é a outra metade da
 * mesma operação, e porque agora tem dois chamadores: o Multiatendimento
 * (partindo da conversa) e a lista de leads (partindo do lead). Duas cópias
 * desta chamada divergiriam no dia em que a rota ou o corpo mudassem.
 *
 * Devolve a mensagem de erro quando falha, e null quando deu certo. Não engole
 * nem lança: quem chama está sempre num laço sobre vários alvos e precisa
 * contar sucesso e falha separadamente -- foi misturar essas duas contagens que
 * escondeu um erro de CORS por semanas, com a tela culpando o cadastro do
 * cliente por uma automação que nunca era executada.
 */
export async function executarAutomacaoNoLead(
  companyId: string, leadId: string, automationId: string,
): Promise<string | null> {
  const { error } = await supabase.functions.invoke("automation-runner/manual", {
    body: { company_id: companyId, lead_id: leadId, automation_id: automationId },
  });
  if (!error) return null;
  console.error("[automacao-manual] falha ao executar:", error);
  return error.message ?? String(error);
}
