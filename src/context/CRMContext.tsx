import {
  createContext, useContext, useState, ReactNode,
  useCallback, useMemo, useEffect,
} from "react";
import {
  Lead, Task, Pipeline, PipelineColumn, Product,
  Activity, PipelineCategory, Priority, LeadOrigin,
  ActivityType, TaskStatus,
} from "@/data/mockData";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface CRMContextType {
  crmLoading: boolean;

  pipelines: Pipeline[];
  activePipelineId: string;
  setActivePipelineId: (id: string) => void;
  activePipeline: Pipeline | null;
  addPipeline: (name: string, category: PipelineCategory, columns: Omit<PipelineColumn, "leadIds">[]) => Promise<void>;
  updatePipeline: (id: string, data: Partial<Pick<Pipeline, "name" | "category">>) => void;
  deletePipeline: (id: string) => void;

  columns: PipelineColumn[];
  updateColumn: (pipelineId: string, columnId: string, data: Partial<Pick<PipelineColumn, "title" | "color">>) => void;
  deleteColumn: (pipelineId: string, columnId: string) => void;
  addColumn: (pipelineId: string, column: Omit<PipelineColumn, "leadIds">) => Promise<void>;

  leads: Record<string, Lead>;
  updateLead: (id: string, data: Partial<Lead>) => void;
  addLead: (lead: Omit<Lead, "id">) => Promise<void>;
  deleteLead: (id: string) => void;
  moveLead: (leadId: string, fromCol: string, toCol: string, toIndex: number) => void;
  markLeadWon: (leadId: string) => void;
  markLeadLost: (leadId: string) => void;
  nextDealNumber: () => number;

  tasks: Task[];
  addTask: (task: Omit<Task, "id">) => Promise<void>;
  updateTask: (id: string, data: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  addActivity: (leadId: string, activity: Omit<Activity, "id">) => void;

  teamMembers: string[];
  memberColors: Record<string, string>;
  products: Product[];
  logout: () => void;

  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
}

const CRMContext = createContext<CRMContextType | null>(null);

export function useCRM() {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error("useCRM must be within CRMProvider");
  return ctx;
}

// ─── DB row → TypeScript type mappers ───────────────────────────────────────

function dbToPipeline(row: Record<string, unknown>, columns: PipelineColumn[]): Pipeline {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as PipelineCategory,
    columns,
  };
}

function dbToColumn(row: Record<string, unknown>, leadIds: string[]): PipelineColumn {
  return {
    id: row.id as string,
    title: row.title as string,
    color: row.color as string,
    leadIds,
  };
}

function dbToLead(row: Record<string, unknown>, activities: Activity[]): Lead {
  return {
    id: row.id as string,
    dealNumber: (row.deal_number as number) ?? 0,
    name: row.name as string,
    company: (row.company as string) ?? undefined,
    whatsapp: (row.whatsapp as string) ?? "",
    email: (row.email as string) ?? undefined,
    value: Number(row.value ?? 0),
    responsible: (row.responsible as string) ?? "",
    pipelineId: row.pipeline_id as string,
    stage: (row.column_id as string) ?? "",
    priority: (row.priority as Priority) ?? "Média",
    origin: (row.origin as LeadOrigin) ?? "Outro",
    productId: (row.product_id as string) ?? undefined,
    entryDate: (row.entry_date as string) ?? "",
    nextFollowUp: (row.next_follow_up as string) ?? undefined,
    notes: (row.notes as string) ?? "",
    tags: (row.tags as string[]) ?? [],
    activities,
  };
}

function dbToActivity(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    date: row.date as string,
    type: row.type as ActivityType,
    description: row.description as string,
  };
}

function dbToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    leadId: (row.lead_id as string) ?? "",
    leadName: (row.lead_name as string) ?? "",
    responsible: (row.responsible as string) ?? "",
    dueDate: (row.due_date as string) ?? "",
    status: (row.status as TaskStatus) ?? "Pendente",
  };
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function CRMProvider({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  const [crmLoading, setCrmLoading] = useState(true);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string>("");
  const [leads, setLeads] = useState<Record<string, Lead>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  function colorFromString(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360} 55% 45%)`;
  }

  const teamMembers = useMemo(() => {
    const names = new Set<string>();
    Object.values(leads).forEach(l => { if (l.responsible) names.add(l.responsible); });
    return Array.from(names);
  }, [leads]);

  const memberColors = useMemo(() => {
    const map: Record<string, string> = {};
    teamMembers.forEach(m => { map[m] = colorFromString(m); });
    return map;
  }, [teamMembers]);

  const products: Product[] = [];

  // ── Load all data when user changes ───────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setPipelines([]);
      setLeads({});
      setTasks([]);
      setActivePipelineId("");
      setCrmLoading(false);
      return;
    }

    async function loadAll() {
      setCrmLoading(true);

      const [pipelineRes, columnRes, leadRes, activityRes, taskRes] = await Promise.all([
        supabase.from("pipelines").select("*").order("position"),
        supabase.from("pipeline_columns").select("*").order("position"),
        supabase.from("leads").select("*").order("position"),
        supabase.from("activities").select("*"),
        supabase.from("tasks").select("*").order("created_at"),
      ]);

      const dbPipelines = (pipelineRes.data ?? []) as Record<string, unknown>[];
      const dbColumns = (columnRes.data ?? []) as Record<string, unknown>[];
      const dbLeads = (leadRes.data ?? []) as Record<string, unknown>[];
      const dbActivities = (activityRes.data ?? []) as Record<string, unknown>[];
      const dbTasks = (taskRes.data ?? []) as Record<string, unknown>[];

      // Map activities by lead_id
      const actsByLead: Record<string, Activity[]> = {};
      for (const a of dbActivities) {
        const lid = a.lead_id as string;
        if (!actsByLead[lid]) actsByLead[lid] = [];
        actsByLead[lid].push(dbToActivity(a));
      }

      // Build leads map
      const leadsMap: Record<string, Lead> = {};
      for (const l of dbLeads) {
        const id = l.id as string;
        leadsMap[id] = dbToLead(l, actsByLead[id] ?? []);
      }

      // Build pipelines with columns and leadIds
      const pipelinesArr: Pipeline[] = dbPipelines.map(p => {
        const pid = p.id as string;
        const cols = dbColumns
          .filter(c => c.pipeline_id === pid)
          .map(c => {
            const cid = c.id as string;
            const leadIds = dbLeads
              .filter(l => l.column_id === cid)
              .sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0))
              .map(l => l.id as string);
            return dbToColumn(c, leadIds);
          });
        return dbToPipeline(p, cols);
      });

      const tasksList = dbTasks.map(dbToTask);

      setPipelines(pipelinesArr);
      setLeads(leadsMap);
      setTasks(tasksList);
      if (pipelinesArr.length > 0) setActivePipelineId(pipelinesArr[0].id);
      setCrmLoading(false);
    }

    loadAll();
  }, [user?.id]);

  // Keep activePipelineId valid when pipelines list changes
  useEffect(() => {
    if (pipelines.length > 0 && !pipelines.find(p => p.id === activePipelineId)) {
      setActivePipelineId(pipelines[0].id);
    }
  }, [pipelines, activePipelineId]);

  const activePipeline = useMemo(
    () => pipelines.find(p => p.id === activePipelineId) ?? null,
    [pipelines, activePipelineId]
  );

  const columns = useMemo(
    () => activePipeline?.columns ?? [],
    [activePipeline]
  );

  // ── Pipelines ──────────────────────────────────────────────────────────────

  const addPipeline = useCallback(async (
    name: string,
    category: PipelineCategory,
    colDefs: Omit<PipelineColumn, "leadIds">[]
  ) => {
    if (!user) return;

    const { data: pData, error: pErr } = await supabase
      .from("pipelines")
      .insert({ owner_id: user.id, name, category, position: pipelines.length })
      .select()
      .single();

    if (pErr || !pData) { toast.error("Erro ao criar pipeline."); return; }

    const colsPayload = colDefs.map((c, i) => ({
      pipeline_id: pData.id,
      title: c.title,
      color: c.color,
      position: i,
    }));

    const { data: cData } = await supabase
      .from("pipeline_columns")
      .insert(colsPayload)
      .select();

    const newPipeline: Pipeline = {
      id: pData.id,
      name: pData.name,
      category: pData.category as PipelineCategory,
      columns: (cData ?? []).map((c: Record<string, unknown>) => dbToColumn(c, [])),
    };

    setPipelines(prev => [...prev, newPipeline]);
    setActivePipelineId(newPipeline.id);
  }, [user, pipelines.length]);

  const updatePipeline = useCallback((id: string, data: Partial<Pick<Pipeline, "name" | "category">>) => {
    setPipelines(prev => prev.map(p => (p.id === id ? { ...p, ...data } : p)));
    supabase.from("pipelines").update(data).eq("id", id);
  }, []);

  const deletePipeline = useCallback((id: string) => {
    setPipelines(prev => prev.filter(p => p.id !== id));
    supabase.from("pipelines").delete().eq("id", id);
  }, []);

  // ── Columns ────────────────────────────────────────────────────────────────

  const updateColumn = useCallback((pipelineId: string, columnId: string, data: Partial<Pick<PipelineColumn, "title" | "color">>) => {
    setPipelines(prev => prev.map(p =>
      p.id === pipelineId
        ? { ...p, columns: p.columns.map(c => (c.id === columnId ? { ...c, ...data } : c)) }
        : p
    ));
    supabase.from("pipeline_columns").update(data).eq("id", columnId);
  }, []);

  const deleteColumn = useCallback((pipelineId: string, columnId: string) => {
    setPipelines(prev => prev.map(p =>
      p.id === pipelineId ? { ...p, columns: p.columns.filter(c => c.id !== columnId) } : p
    ));
    supabase.from("pipeline_columns").delete().eq("id", columnId);
  }, []);

  const addColumn = useCallback(async (pipelineId: string, col: Omit<PipelineColumn, "leadIds">) => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;

    const { data, error } = await supabase
      .from("pipeline_columns")
      .insert({ pipeline_id: pipelineId, title: col.title, color: col.color, position: pipeline.columns.length })
      .select()
      .single();

    if (error || !data) { toast.error("Erro ao criar coluna."); return; }

    const newCol = dbToColumn(data as Record<string, unknown>, []);
    setPipelines(prev => prev.map(p =>
      p.id === pipelineId ? { ...p, columns: [...p.columns, newCol] } : p
    ));
  }, [pipelines]);

  // ── Leads ──────────────────────────────────────────────────────────────────

  const nextDealNumber = useCallback(() => {
    const nums = Object.values(leads).map(l => l.dealNumber ?? 0);
    return (nums.length ? Math.max(...nums) : 1000) + 1;
  }, [leads]);

  const addLead = useCallback(async (lead: Omit<Lead, "id">) => {
    if (!user) return;

    const pipeline = pipelines.find(p => p.id === lead.pipelineId);
    const col = pipeline?.columns.find(c => c.id === lead.stage);
    const position = col ? col.leadIds.length : 0;

    const { data, error } = await supabase
      .from("leads")
      .insert({
        owner_id: user.id,
        pipeline_id: lead.pipelineId,
        column_id: lead.stage || null,
        deal_number: lead.dealNumber,
        name: lead.name,
        company: lead.company || null,
        whatsapp: lead.whatsapp,
        email: lead.email || null,
        value: lead.value,
        responsible: lead.responsible,
        priority: lead.priority,
        origin: lead.origin,
        product_id: lead.productId || null,
        entry_date: lead.entryDate || new Date().toISOString().split("T")[0],
        next_follow_up: lead.nextFollowUp || null,
        notes: lead.notes,
        tags: lead.tags ?? [],
        position,
        status: "Ativo",
      })
      .select()
      .single();

    if (error || !data) { toast.error("Erro ao criar lead."); return; }

    const realId = (data as Record<string, unknown>).id as string;

    // Insert initial activities
    if (lead.activities.length > 0) {
      await supabase.from("activities").insert(
        lead.activities.map(a => ({
          owner_id: user.id,
          lead_id: realId,
          type: a.type,
          description: a.description,
          date: a.date,
        }))
      );
    }

    const newLead: Lead = { ...lead, id: realId };
    setLeads(prev => ({ ...prev, [realId]: newLead }));
    setPipelines(prev => prev.map(p =>
      p.id === lead.pipelineId
        ? {
            ...p,
            columns: p.columns.map(c =>
              c.id === lead.stage ? { ...c, leadIds: [...c.leadIds, realId] } : c
            ),
          }
        : p
    ));
  }, [user, pipelines]);

  const updateLead = useCallback((id: string, data: Partial<Lead>) => {
    setLeads(prev => ({ ...prev, [id]: { ...prev[id], ...data } }));

    const dbData: Record<string, unknown> = {};
    if ("name" in data) dbData.name = data.name;
    if ("company" in data) dbData.company = data.company;
    if ("whatsapp" in data) dbData.whatsapp = data.whatsapp;
    if ("email" in data) dbData.email = data.email;
    if ("value" in data) dbData.value = data.value;
    if ("responsible" in data) dbData.responsible = data.responsible;
    if ("priority" in data) dbData.priority = data.priority;
    if ("origin" in data) dbData.origin = data.origin;
    if ("productId" in data) dbData.product_id = data.productId;
    if ("entryDate" in data) dbData.entry_date = data.entryDate;
    if ("nextFollowUp" in data) dbData.next_follow_up = data.nextFollowUp;
    if ("notes" in data) dbData.notes = data.notes;
    if ("tags" in data) dbData.tags = data.tags;
    if ("stage" in data) dbData.column_id = data.stage;
    if ("pipelineId" in data) dbData.pipeline_id = data.pipelineId;

    if (Object.keys(dbData).length > 0) {
      supabase.from("leads").update(dbData).eq("id", id);
    }
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads(prev => { const n = { ...prev }; delete n[id]; return n; });
    setPipelines(prev => prev.map(p => ({
      ...p,
      columns: p.columns.map(c => ({ ...c, leadIds: c.leadIds.filter(l => l !== id) })),
    })));
    setTasks(prev => prev.filter(t => t.leadId !== id));
    supabase.from("leads").delete().eq("id", id);
  }, []);

  const moveLead = useCallback((leadId: string, fromCol: string, toCol: string, toIndex: number) => {
    setPipelines(prev => prev.map(p => {
      const hasFrom = p.columns.some(c => c.id === fromCol);
      const hasTo = p.columns.some(c => c.id === toCol);
      if (!hasFrom || !hasTo) return p;
      const newCols = p.columns.map(c => ({ ...c, leadIds: [...c.leadIds] }));
      const from = newCols.find(c => c.id === fromCol)!;
      const to = newCols.find(c => c.id === toCol)!;
      from.leadIds = from.leadIds.filter(id => id !== leadId);
      to.leadIds.splice(toIndex, 0, leadId);
      return { ...p, columns: newCols };
    }));
    setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], stage: toCol } }));
    supabase.from("leads").update({ column_id: toCol }).eq("id", leadId);
  }, []);

  const findWonLostCol = useCallback((pipelineId: string, kind: "won" | "lost"): string | null => {
    const p = pipelines.find(x => x.id === pipelineId);
    if (!p) return null;
    const candidates = kind === "won" ? ["fechado", "ganho", "recuperado"] : ["perdido"];
    const col = p.columns.find(c => candidates.some(k => c.title.toLowerCase().includes(k)));
    return col?.id ?? null;
  }, [pipelines]);

  const markLeadWon = useCallback((leadId: string) => {
    const lead = leads[leadId];
    if (!lead) return;
    const target = findWonLostCol(lead.pipelineId, "won");
    if (!target) return;
    moveLead(leadId, lead.stage, target, 0);
    addActivity(leadId, { date: new Date().toISOString().split("T")[0], type: "won", description: "Negócio marcado como ganho." });
  }, [leads, moveLead, findWonLostCol]);

  const markLeadLost = useCallback((leadId: string) => {
    const lead = leads[leadId];
    if (!lead) return;
    const target = findWonLostCol(lead.pipelineId, "lost");
    if (!target) return;
    moveLead(leadId, lead.stage, target, 0);
    addActivity(leadId, { date: new Date().toISOString().split("T")[0], type: "lost", description: "Negócio marcado como perdido." });
  }, [leads, moveLead, findWonLostCol]);

  // ── Tasks ──────────────────────────────────────────────────────────────────

  const addTask = useCallback(async (task: Omit<Task, "id">) => {
    if (!user) return;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        owner_id: user.id,
        lead_id: task.leadId || null,
        lead_name: task.leadName,
        title: task.title,
        responsible: task.responsible,
        due_date: task.dueDate,
        status: task.status,
      })
      .select()
      .single();

    if (error || !data) { toast.error("Erro ao criar tarefa."); return; }

    setTasks(prev => [...prev, dbToTask(data as Record<string, unknown>)]);
  }, [user]);

  const updateTask = useCallback((id: string, data: Partial<Task>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...data } : t)));

    const dbData: Record<string, unknown> = {};
    if ("title" in data) dbData.title = data.title;
    if ("responsible" in data) dbData.responsible = data.responsible;
    if ("dueDate" in data) dbData.due_date = data.dueDate;
    if ("status" in data) dbData.status = data.status;
    if ("leadName" in data) dbData.lead_name = data.leadName;

    if (Object.keys(dbData).length > 0) {
      supabase.from("tasks").update(dbData).eq("id", id);
    }
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    supabase.from("tasks").delete().eq("id", id);
  }, []);

  // ── Activities ─────────────────────────────────────────────────────────────

  const addActivity = useCallback((leadId: string, activity: Omit<Activity, "id">) => {
    const tempId = `a-${Date.now()}`;
    const full: Activity = { ...activity, id: tempId };
    setLeads(prev => ({
      ...prev,
      [leadId]: { ...prev[leadId], activities: [...(prev[leadId]?.activities ?? []), full] },
    }));
    if (user) {
      supabase.from("activities").insert({
        owner_id: user.id,
        lead_id: leadId,
        type: activity.type,
        description: activity.description,
        date: activity.date,
      });
    }
  }, [user]);

  return (
    <CRMContext.Provider
      value={{
        crmLoading,
        pipelines, activePipelineId, setActivePipelineId, activePipeline,
        addPipeline, updatePipeline, deletePipeline,
        columns, updateColumn, deleteColumn, addColumn,
        leads, updateLead, addLead, deleteLead, moveLead,
        markLeadWon, markLeadLost, nextDealNumber,
        tasks, addTask, updateTask, deleteTask,
        addActivity,
        teamMembers, memberColors, products,
        logout: signOut,
        selectedLeadId, setSelectedLeadId,
      }}
    >
      {children}
    </CRMContext.Provider>
  );
}
