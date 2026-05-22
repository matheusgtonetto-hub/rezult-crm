import {
  createContext, useContext, useState, ReactNode,
  useCallback, useMemo, useEffect,
} from "react";
import {
  Lead, Task, Tag, CrmList, Pipeline, PipelineColumn, PipelineGroup, Product, LossReason,
  Activity, PipelineCategory, Priority, LeadOrigin,
  ActivityType, TaskStatus, CustomFieldGroup, CustomFieldItem, CustomFieldType,
} from "@/data/mockData";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { toast } from "sonner";

interface CRMContextType {
  crmLoading: boolean;

  pipelines: Pipeline[];
  activePipelineId: string;
  setActivePipelineId: (id: string) => void;
  activePipeline: Pipeline | null;
  addPipeline: (name: string, category: PipelineCategory, columns: Omit<PipelineColumn, "leadIds">[], description?: string) => Promise<void>;
  updatePipeline: (id: string, data: Partial<Pick<Pipeline, "name" | "category" | "description">>) => void;
  deletePipeline: (id: string) => void;

  pipelineGroups: PipelineGroup[];
  addPipelineGroup: (name: string) => Promise<boolean>;
  deletePipelineGroup: (id: string) => void;

  columns: PipelineColumn[];
  updateColumn: (pipelineId: string, columnId: string, data: Partial<Pick<PipelineColumn, "title" | "color">>) => void;
  deleteColumn: (pipelineId: string, columnId: string) => void;
  addColumn: (pipelineId: string, column: Omit<PipelineColumn, "leadIds">) => Promise<void>;
  reorderColumns: (pipelineId: string, orderedIds: string[]) => void;

  leads: Record<string, Lead>;
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>;
  addLead: (lead: Omit<Lead, "id">) => Promise<boolean>;
  deleteLead: (id: string) => void;
  moveLead: (leadId: string, fromCol: string, toCol: string, toIndex: number) => void;
  transferLead: (leadId: string, toPipelineId: string, toColumnId: string) => void;
  markLeadWon: (leadId: string, productName?: string, value?: number) => void;
  markLeadLost: (leadId: string, reason?: string) => void;
  markLeadOpen: (leadId: string) => void;
  nextDealNumber: () => number;

  tasks: Task[];
  addTask: (task: Omit<Task, "id">) => Promise<void>;
  updateTask: (id: string, data: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  addActivity: (leadId: string, activity: Omit<Activity, "id">) => void;
  updateActivity: (leadId: string, activityId: string, description: string) => void;
  patchActivity: (leadId: string, activityId: string, fields: Partial<Pick<Activity, "title" | "description" | "scheduledAt" | "meetLink" | "contactEmail" | "type" | "durationMinutes" | "participants">>) => void;
  completeActivity: (leadId: string, activityId: string) => void;
  uncompleteActivity: (leadId: string, activityId: string) => void;
  markNoShow: (leadId: string, activityId: string) => void;
  unmarkNoShow: (leadId: string, activityId: string) => void;
  deleteActivity: (leadId: string, activityId: string, gcalEventId?: string) => void;
  pinActivity: (leadId: string, activityId: string, pinned: boolean) => void;

  crmTags: Tag[];
  addTag: (name: string, description: string, color: string) => Promise<boolean>;
  updateTag: (id: string, data: Partial<Omit<Tag, "id">>) => Promise<void>;
  deleteTag: (id: string) => void;

  crmLists: CrmList[];
  addList: (name: string, description: string) => Promise<CrmList | null>;
  updateList: (id: string, data: Partial<Pick<CrmList, "name" | "description">>) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  addLeadToList: (listId: string, leadId: string) => Promise<void>;
  removeLeadFromList: (listId: string, leadId: string) => Promise<void>;

  teamMembers: string[];
  memberColors: Record<string, string>;
  memberEmails: Record<string, string>;
  memberAvatars: Record<string, string>;
  products: Product[];
  addProduct: (data: Omit<Product, "id">) => Promise<void>;
  updateProduct: (id: string, data: Partial<Omit<Product, "id">>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  lossReasons: LossReason[];
  addLossReason: (name: string) => Promise<boolean>;
  updateLossReason: (id: string, name: string) => Promise<void>;
  deleteLossReason: (id: string) => Promise<void>;

  customFieldGroups: CustomFieldGroup[];
  addCustomFieldGroup: (name: string) => Promise<CustomFieldGroup | null>;
  updateCustomFieldGroup: (id: string, name: string) => Promise<void>;
  deleteCustomFieldGroup: (id: string) => Promise<void>;
  addCustomFieldItem: (groupId: string, label: string, fieldType: CustomFieldType) => Promise<CustomFieldItem | null>;
  updateCustomFieldItem: (id: string, data: Partial<Pick<CustomFieldItem, "label" | "fieldType">>) => Promise<void>;
  deleteCustomFieldItem: (groupId: string, itemId: string) => Promise<void>;
  updateLeadCustomFieldValues: (leadId: string, values: Record<string, string>) => Promise<void>;

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
    description: (row.description as string) ?? "",
    columns,
  };
}

function dbToColumn(row: Record<string, unknown>, leadIds: string[]): PipelineColumn {
  return {
    id: row.id as string,
    title: row.title as string,
    color: row.color as string,
    position: (row.position as number) ?? 0,
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
    phoneDdi: (row.phone_ddi as string) ?? undefined,
    site: (row.site as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    emails: (() => {
      const raw = row.emails;
      const parsed: string[] = Array.isArray(raw)
        ? (raw as string[])
        : (raw ? JSON.parse(raw as string) as string[] : []);
      return parsed.length > 0 ? parsed : ((row.email as string) ? [(row.email as string)] : []);
    })(),
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
    document: (row.document as string) ?? undefined,
    birthDate: (row.birth_date as string) ?? undefined,
    country: (row.country as string) ?? undefined,
    zipCode: (row.zip_code as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    addrNumber: (row.addr_number as string) ?? undefined,
    complement: (row.complement as string) ?? undefined,
    neighborhood: (row.neighborhood as string) ?? undefined,
    city: (row.city as string) ?? undefined,
    state: (row.state as string) ?? undefined,
    created_at: (row.created_at as string) ?? undefined,
    dealStatus: (row.status as "open" | "won" | "lost") ?? "open",
    lossReasonId: (row.loss_reason_id as string) ?? undefined,
    customFieldValues: (row.custom_field_values as Record<string, string>) ?? {},
    utmSource:   (row.utm_source   as string) ?? undefined,
    utmMedium:   (row.utm_medium   as string) ?? undefined,
    utmCampaign: (row.utm_campaign as string) ?? undefined,
    utmTerm:     (row.utm_term     as string) ?? undefined,
    utmContent:  (row.utm_content  as string) ?? undefined,
    activities,
  };
}

function dbToActivity(row: Record<string, unknown>): Activity {
  return {
    id: row.id as string,
    date: (row.created_at ?? row.date) as string,
    type: row.type as ActivityType,
    description: row.description as string,
    userName: (row.user_name as string) ?? undefined,
    pinned: (row.pinned as boolean) ?? false,
    title: (row.title as string) ?? undefined,
    scheduledAt: (row.scheduled_at as string) ?? undefined,
    durationMinutes: (row.duration_minutes as number) ?? undefined,
    contactEmail: (row.contact_email as string) ?? undefined,
    meetLink: (row.meet_link as string) ?? undefined,
    completedAt: (row.completed_at as string) ?? undefined,
    noShowAt: (row.no_show_at as string) ?? undefined,
    gcalEventId: (row.gcal_event_id as string) ?? undefined,
    participants: (() => {
      const p = row.participants;
      if (!p) return undefined;
      if (Array.isArray(p)) return p as string[];
      try { return JSON.parse(p as string) as string[]; } catch { return undefined; }
    })(),
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
  const { company } = useCompany();

  const [crmLoading, setCrmLoading] = useState(true);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string>("");
  const [leads, setLeads] = useState<Record<string, Lead>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [crmTags, setCrmTags] = useState<Tag[]>([]);
  const [crmLists, setCrmLists] = useState<CrmList[]>([]);
  const [pipelineGroups, setPipelineGroups] = useState<PipelineGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [customFieldGroups, setCustomFieldGroups] = useState<CustomFieldGroup[]>([]);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [memberEmails, setMemberEmails] = useState<Record<string, string>>({});
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");

  function colorFromString(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360} 55% 45%)`;
  }

  const memberColors = useMemo(() => {
    const map: Record<string, string> = {};
    teamMembers.forEach(m => { map[m] = colorFromString(m); });
    return map;
  }, [teamMembers]);

  // ── Load all data when user or selected company changes ───────────────────
  useEffect(() => {
    if (!user) {
      setPipelines([]);
      setLeads({});
      setTasks([]);
      setCrmTags([]);
      setPipelineGroups([]);
      setProducts([]);
      setLossReasons([]);
      setCustomFieldGroups([]);
      setTeamMembers([]);
      setActivePipelineId("");
      setCrmLoading(false);
      return;
    }
    if (!company) return; // wait for CompanyContext to finish loading

    // Clear previous company's data immediately to avoid mixing
    setPipelines([]);
    setLeads({});
    setTasks([]);
    setCrmTags([]);
    setPipelineGroups([]);
    setProducts([]);
    setLossReasons([]);
    setCustomFieldGroups([]);
    setTeamMembers([]);
    setActivePipelineId("");
    setCrmLoading(true);

    const ownerId = company.owner_id;

    async function loadAll() {

      const [pipelineRes, columnRes, leadRes, activityRes, taskRes, tagRes, groupRes, productRes, lossReasonRes, customFieldRes, myProfileRes, listRes, listLeadRes] = await Promise.all([
        supabase.from("pipelines").select("*").eq("owner_id", ownerId).order("position"),
        supabase.from("pipeline_columns").select("*").order("position"),
        supabase.from("leads").select("*").eq("owner_id", ownerId).order("position"),
        supabase.from("activities").select("*").eq("owner_id", ownerId),
        supabase.from("tasks").select("*").eq("owner_id", ownerId).order("created_at"),
        supabase.from("tags").select("*").eq("owner_id", ownerId).order("created_at"),
        supabase.from("pipeline_groups").select("*").eq("owner_id", ownerId).order("created_at"),
        supabase.from("products").select("*").eq("owner_id", ownerId).order("created_at"),
        supabase.from("loss_reasons").select("*").eq("owner_id", ownerId).order("created_at"),
        supabase.from("custom_field_groups").select("*").eq("owner_id", ownerId).order("position"),
        supabase.from("profiles").select("full_name").eq("id", user.id).single(),
        supabase.from("lists").select("*").eq("owner_id", ownerId).order("created_at"),
        supabase.from("list_leads").select("list_id, lead_id"),
      ]);

      const myProfileData = myProfileRes.data as { full_name?: string } | null;
      if (myProfileData?.full_name) setCurrentUserName(myProfileData.full_name);

      // Load team members via company RPC (works for owners and members)
      const { data: membersData } = await supabase.rpc("get_company_members", { p_company_id: company.id });
      const memberRows = (membersData ?? []) as { user_id: string; full_name: string; email: string; avatar_url: string }[];
      setTeamMembers(memberRows.map(p => p.full_name).filter(Boolean));
      const emailMap: Record<string, string> = {};
      const avatarMap: Record<string, string> = {};
      memberRows.forEach(p => {
        if (p.full_name && p.email) emailMap[p.full_name] = p.email;
        if (p.full_name && p.avatar_url) avatarMap[p.full_name] = p.avatar_url;
      });
      setMemberEmails(emailMap);
      setMemberAvatars(avatarMap);

      const dbPipelines = (pipelineRes.data ?? []) as Record<string, unknown>[];
      const dbColumns = (columnRes.data ?? []) as Record<string, unknown>[];
      const dbLeads = (leadRes.data ?? []) as Record<string, unknown>[];
      const dbActivities = (activityRes.data ?? []) as Record<string, unknown>[];
      const dbTasks = (taskRes.data ?? []) as Record<string, unknown>[];
      const dbTagsList = (tagRes.data ?? []) as Record<string, unknown>[];
      const dbGroupsList = (groupRes.data ?? []) as Record<string, unknown>[];
      const dbProducts = (productRes.data ?? []) as Record<string, unknown>[];
      const dbLossReasons = (lossReasonRes.data ?? []) as Record<string, unknown>[];
      const dbCFGroups = (customFieldRes.data ?? []) as Record<string, unknown>[];

      // Load items for all groups
      const { data: cfItemsData } = await supabase
        .from("custom_field_items")
        .select("*")
        .eq("owner_id", ownerId)
        .order("position");
      const dbCFItems = (cfItemsData ?? []) as Record<string, unknown>[];

      const builtGroups: CustomFieldGroup[] = dbCFGroups.map(g => ({
        id: g.id as string,
        name: g.name as string,
        position: (g.position as number) ?? 0,
        isDefault: !!(g.is_default),
        created_at: (g.created_at as string) ?? undefined,
        items: dbCFItems
          .filter(i => i.group_id === g.id)
          .map(i => ({
            id: i.id as string,
            groupId: i.group_id as string,
            label: i.label as string,
            fieldType: (i.field_type as CustomFieldType) ?? "text",
            position: (i.position as number) ?? 0,
          })),
      }));

      // Seed default "Qualificação" group — only on first use, only for the company owner
      const hasDefault = builtGroups.some(g => g.isDefault);
      if (!hasDefault && ownerId === user.id) {
        const { data: gData } = await supabase
          .from("custom_field_groups")
          .insert({ owner_id: ownerId, name: "Qualificação", position: 0, is_default: true })
          .select()
          .single();
        if (gData) {
          const gRow = gData as Record<string, unknown>;
          const defaultItems = [
            { label: "O que o lead está buscando?", field_type: "text", position: 0 },
            { label: "Qual o ramo da empresa?",     field_type: "text", position: 1 },
            { label: "O lead é o decisor?",         field_type: "boolean", position: 2 },
            { label: "Orçamento disponível?",       field_type: "text", position: 3 },
            { label: "Previsão de fechamento?",     field_type: "date", position: 4 },
          ].map(i => ({ ...i, owner_id: ownerId, group_id: gRow.id }));
          const { data: iData } = await supabase
            .from("custom_field_items")
            .insert(defaultItems)
            .select();
          const iRows = (iData ?? []) as Record<string, unknown>[];
          builtGroups.push({
            id: gRow.id as string,
            name: "Qualificação",
            position: 0,
            isDefault: true,
            items: iRows.map((i, idx) => ({
              id: i.id as string,
              groupId: gRow.id as string,
              label: i.label as string,
              fieldType: (i.field_type as CustomFieldType) ?? "text",
              position: idx,
            })),
          });
        }
      }

      // Deduplicate: if multiple default groups exist in DB, keep only the first
      let sawDefault = false;
      const deduped = builtGroups.filter(g => {
        if (g.isDefault) {
          if (sawDefault) return false;
          sawDefault = true;
        }
        return true;
      });
      setCustomFieldGroups(deduped);

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

      const tagsList: Tag[] = dbTagsList.map(r => ({
        id: r.id as string,
        name: r.name as string,
        description: (r.description as string) ?? "",
        color: (r.color as string) ?? "#128A68",
      }));

      let groupsList: PipelineGroup[] = dbGroupsList.map(r => ({
        id: r.id as string,
        name: r.name as string,
        createdBy: (r.created_by as string) ?? "",
      }));

      const dbLists = (listRes.data ?? []) as Record<string, unknown>[];
      const dbListLeads = (listLeadRes.data ?? []) as { list_id: string; lead_id: string }[];
      const listsArr: CrmList[] = dbLists.map(r => ({
        id: r.id as string,
        name: r.name as string,
        description: (r.description as string) ?? "",
        created_at: r.created_at as string | undefined,
        leadIds: dbListLeads.filter(ll => ll.list_id === (r.id as string)).map(ll => ll.lead_id),
      }));

      setPipelines(pipelinesArr);
      setLeads(leadsMap);
      setTasks(tasksList);
      setCrmTags(tagsList);
      setCrmLists(listsArr);
      setPipelineGroups(groupsList);
      setProducts(dbProducts.map(p => ({
        id: p.id as string,
        name: p.name as string,
        sku: (p.sku as string) ?? "",
        defaultValue: Number(p.default_value ?? 0),
        created_at: p.created_at as string | undefined,
      })));
      setLossReasons(dbLossReasons.map(r => ({
        id: r.id as string,
        name: r.name as string,
      })));
      if (pipelinesArr.length > 0) setActivePipelineId(pipelinesArr[0].id);
      setCrmLoading(false);
    }

    loadAll().catch(err => {
      console.error("[CRMContext] loadAll crash:", err);
      setCrmLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, company?.id]);

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
    colDefs: Omit<PipelineColumn, "leadIds">[],
    description?: string
  ) => {
    if (!user || !company) return;

    const { data: pData, error: pErr } = await supabase
      .from("pipelines")
      .insert({ owner_id: company.owner_id, name, category, description: description ?? "", position: pipelines.length })
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
      description: description ?? "",
      columns: (cData ?? []).map((c: Record<string, unknown>) => dbToColumn(c, [])),
    };

    setPipelines(prev => [...prev, newPipeline]);
    setActivePipelineId(newPipeline.id);
  }, [user, company, pipelines.length]);

  const updatePipeline = useCallback((id: string, data: Partial<Pick<Pipeline, "name" | "category" | "description">>) => {
    setPipelines(prev => prev.map(p => (p.id === id ? { ...p, ...data } : p)));
    const dbData: Record<string, unknown> = {};
    if ("name" in data) dbData.name = data.name;
    if ("category" in data) dbData.category = data.category;
    if ("description" in data) dbData.description = data.description ?? "";
    supabase.from("pipelines").update(dbData).eq("id", id).then(({ error }) => {
      if (error) console.error("updatePipeline error:", error.message);
    });
  }, []);

  const deletePipeline = useCallback((id: string) => {
    setPipelines(prev => prev.filter(p => p.id !== id));
    supabase.from("pipelines").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("deletePipeline error:", error.message);
    });
  }, []);

  // ── Columns ────────────────────────────────────────────────────────────────

  const updateColumn = useCallback((pipelineId: string, columnId: string, data: Partial<Pick<PipelineColumn, "title" | "color">>) => {
    setPipelines(prev => prev.map(p =>
      p.id === pipelineId
        ? { ...p, columns: p.columns.map(c => (c.id === columnId ? { ...c, ...data } : c)) }
        : p
    ));
    supabase.from("pipeline_columns").update(data).eq("id", columnId).then(({ error }) => {
      if (error) console.error("updateColumn error:", error.message);
    });
  }, []);

  const deleteColumn = useCallback((pipelineId: string, columnId: string) => {
    setPipelines(prev => prev.map(p =>
      p.id === pipelineId ? { ...p, columns: p.columns.filter(c => c.id !== columnId) } : p
    ));
    supabase.from("pipeline_columns").delete().eq("id", columnId).then(({ error }) => {
      if (error) console.error("deleteColumn error:", error.message);
    });
  }, []);

  const reorderColumns = useCallback((pipelineId: string, orderedIds: string[]) => {
    setPipelines(prev => prev.map(p => {
      if (p.id !== pipelineId) return p;
      const colMap = Object.fromEntries(p.columns.map(c => [c.id, c]));
      const reordered = orderedIds.map((id, i) => ({ ...colMap[id], position: i }));
      return { ...p, columns: reordered };
    }));
    orderedIds.forEach((id, i) => {
      supabase.from("pipeline_columns").update({ position: i }).eq("id", id)
        .then(({ error }) => { if (error) console.error("reorderColumns error:", error.message); });
    });
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

  const addLead = useCallback(async (lead: Omit<Lead, "id">): Promise<boolean> => {
    if (!user || !company) return false;

    if (!lead.pipelineId) {
      toast.error("Crie um pipeline antes de adicionar um lead.");
      return false;
    }

    const pipeline = pipelines.find(p => p.id === lead.pipelineId);
    const col = pipeline?.columns.find(c => c.id === lead.stage);
    const position = col ? col.leadIds.length : 0;

    const { data, error } = await supabase
      .from("leads")
      .insert({
        owner_id: company.owner_id,
        pipeline_id: lead.pipelineId,
        column_id: lead.stage || null,
        deal_number: lead.dealNumber,
        name: lead.name,
        company: lead.company || null,
        whatsapp: lead.whatsapp,
        phone_ddi: lead.phoneDdi || null,
        site: lead.site || null,
        email: (lead.emails && lead.emails.length > 0 ? lead.emails[0] : lead.email) || null,
        emails: JSON.stringify(lead.emails ?? []),
        value: lead.value,
        responsible: lead.responsible,
        priority: lead.priority,
        origin: lead.origin,
        product_id: lead.productId || null,
        entry_date: lead.entryDate || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })(),
        next_follow_up: lead.nextFollowUp || null,
        notes: lead.notes,
        tags: lead.tags ?? [],
        document: lead.document || null,
        birth_date: lead.birthDate || null,
        country: lead.country || null,
        zip_code: lead.zipCode || null,
        address: lead.address || null,
        addr_number: lead.addrNumber || null,
        complement: lead.complement || null,
        neighborhood: lead.neighborhood || null,
        city: lead.city || null,
        state: lead.state || null,
        position,
        status: "open",
      })
      .select()
      .single();

    if (error || !data) {
      console.error("addLead error:", error?.message, error?.details, error?.hint);
      toast.error("Erro ao criar lead.");
      return false;
    }

    const realId = (data as Record<string, unknown>).id as string;

    if (lead.activities.length > 0) {
      await supabase.from("activities").insert(
        lead.activities.map(a => ({
          owner_id: company.owner_id,
          lead_id: realId,
          type: a.type,
          description: a.description,
          date: a.date,
        }))
      );
    }

    const newLead: Lead = {
      ...lead,
      id: realId,
      created_at: (data as Record<string, unknown>).created_at as string | undefined,
    };
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
    return true;
  }, [user, company, pipelines]);

  const updateLead = useCallback(async (id: string, data: Partial<Lead>) => {
    setLeads(prev => ({ ...prev, [id]: { ...prev[id], ...data } }));

    const dbData: Record<string, unknown> = {};
    if ("name" in data) dbData.name = data.name;
    if ("company" in data) dbData.company = data.company ?? null;
    if ("whatsapp" in data) dbData.whatsapp = data.whatsapp;
    if ("phoneDdi" in data) dbData.phone_ddi = data.phoneDdi ?? null;
    if ("site" in data) dbData.site = data.site ?? null;
    if ("email" in data) dbData.email = data.email ?? null;
    if ("emails" in data) {
      dbData.emails = JSON.stringify(data.emails ?? []);
      dbData.email = (data.emails && data.emails.length > 0 ? data.emails[0] : null);
    }
    if ("value" in data) dbData.value = data.value;
    if ("responsible" in data) dbData.responsible = data.responsible;
    if ("priority" in data) dbData.priority = data.priority;
    if ("origin" in data) dbData.origin = data.origin;
    if ("productId" in data) dbData.product_id = data.productId ?? null;
    if ("entryDate" in data) dbData.entry_date = data.entryDate;
    if ("nextFollowUp" in data) dbData.next_follow_up = data.nextFollowUp ?? null;
    if ("notes" in data) dbData.notes = data.notes;
    if ("tags" in data) dbData.tags = data.tags;
    if ("stage" in data) dbData.column_id = data.stage;
    if ("pipelineId" in data) dbData.pipeline_id = data.pipelineId;
    if ("document" in data) dbData.document = data.document ?? null;
    if ("birthDate" in data) dbData.birth_date = data.birthDate ?? null;
    if ("country" in data) dbData.country = data.country ?? null;
    if ("zipCode" in data) dbData.zip_code = data.zipCode ?? null;
    if ("address" in data) dbData.address = data.address ?? null;
    if ("addrNumber" in data) dbData.addr_number = data.addrNumber ?? null;
    if ("complement" in data) dbData.complement = data.complement ?? null;
    if ("neighborhood" in data) dbData.neighborhood = data.neighborhood ?? null;
    if ("city" in data) dbData.city = data.city ?? null;
    if ("state" in data) dbData.state = data.state ?? null;
    if ("lossReasonId" in data) dbData.loss_reason_id = data.lossReasonId ?? null;
    if ("customFieldValues" in data) dbData.custom_field_values = data.customFieldValues ?? {};
    if ("utmSource"   in data) dbData.utm_source   = data.utmSource   ?? null;
    if ("utmMedium"   in data) dbData.utm_medium   = data.utmMedium   ?? null;
    if ("utmCampaign" in data) dbData.utm_campaign = data.utmCampaign ?? null;
    if ("utmTerm"     in data) dbData.utm_term     = data.utmTerm     ?? null;
    if ("utmContent"  in data) dbData.utm_content  = data.utmContent  ?? null;

    if (Object.keys(dbData).length > 0) {
      const { error } = await supabase.from("leads").update(dbData).eq("id", id);
      if (error) console.error("updateLead error:", error.message, error.details);
    }
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads(prev => { const n = { ...prev }; delete n[id]; return n; });
    setPipelines(prev => prev.map(p => ({
      ...p,
      columns: p.columns.map(c => ({ ...c, leadIds: c.leadIds.filter(l => l !== id) })),
    })));
    setTasks(prev => prev.filter(t => t.leadId !== id));
    supabase.from("leads").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("deleteLead error:", error.message);
    });
  }, []);

  const moveLead = useCallback((leadId: string, fromCol: string, toCol: string, toIndex: number) => {
    const lead = leads[leadId];
    const newResponsible = !lead?.responsible && currentUserName ? currentUserName : lead?.responsible;
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
    setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], stage: toCol, responsible: newResponsible ?? prev[leadId]?.responsible } }));
    const update: Record<string, unknown> = { column_id: toCol };
    if (newResponsible) update.responsible = newResponsible;
    supabase.from("leads").update(update).eq("id", leadId).then(({ error }) => {
      if (error) console.error("moveLead error:", error.message);
    });
  }, [leads, currentUserName]);

  const transferLead = useCallback((leadId: string, toPipelineId: string, toColumnId: string) => {
    const lead = leads[leadId];
    if (!lead) return;
    const fromCol = lead.stage;
    const newResponsible = !lead.responsible && currentUserName ? currentUserName : lead.responsible;
    setPipelines(prev => prev.map(p => {
      const hasFromCol = p.columns.some(c => c.id === fromCol);
      const isTarget = p.id === toPipelineId;
      if (!hasFromCol && !isTarget) return p;
      return {
        ...p,
        columns: p.columns.map(c => {
          if (c.id === fromCol) return { ...c, leadIds: c.leadIds.filter(id => id !== leadId) };
          if (c.id === toColumnId) return { ...c, leadIds: [...c.leadIds, leadId] };
          return c;
        }),
      };
    }));
    setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], pipelineId: toPipelineId, stage: toColumnId, dealStatus: "open", responsible: newResponsible ?? prev[leadId]?.responsible } }));
    const update: Record<string, unknown> = { pipeline_id: toPipelineId, column_id: toColumnId, status: "open" };
    if (newResponsible) update.responsible = newResponsible;
    supabase.from("leads").update(update).eq("id", leadId)
      .then(({ error }) => { if (error) console.error("transferLead error:", error.message); });
  }, [leads, currentUserName]);

  const findWonLostCol = useCallback((pipelineId: string, kind: "won" | "lost"): string | null => {
    const p = pipelines.find(x => x.id === pipelineId);
    if (!p) return null;
    const candidates = kind === "won" ? ["fechado", "ganho", "recuperado"] : ["perdido"];
    const col = p.columns.find(c => candidates.some(k => c.title.toLowerCase().includes(k)));
    return col?.id ?? null;
  }, [pipelines]);

  const markLeadWon = useCallback((leadId: string, productName?: string, value?: number) => {
    if (!user || !company) return;
    setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], dealStatus: "won" } }));
    supabase.from("leads").update({ status: "won" }).eq("id", leadId)
      .then(({ error }) => { if (error) console.error("markLeadWon error:", error.message); });
    const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    const description = productName
      ? `Negócio marcado como ganho. Produto: ${productName} · Valor: ${fmtBRL(value ?? 0)}`
      : "Negócio marcado como ganho.";
    const act = { id: `a-${Date.now()}`, date: new Date().toISOString(), type: "won" as const, description, userName: currentUserName || undefined };
    setLeads(prev => ({
      ...prev,
      [leadId]: { ...prev[leadId], activities: [...(prev[leadId]?.activities ?? []), act] },
    }));
    supabase.from("activities").insert({ owner_id: company.owner_id, lead_id: leadId, type: "won", description: act.description, date: act.date, user_name: act.userName ?? null })
      .then(({ error }) => { if (error) console.error("markLeadWon activity error:", error.message); });
  }, [user, company, currentUserName]);

  const markLeadLost = useCallback((leadId: string, reason?: string) => {
    if (!user || !company) return;
    setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], dealStatus: "lost" } }));
    supabase.from("leads").update({ status: "lost" }).eq("id", leadId)
      .then(({ error }) => { if (error) console.error("markLeadLost error:", error.message); });
    const description = reason
      ? `Negócio marcado como perdido. Motivo: ${reason}`
      : "Negócio marcado como perdido.";
    const act = { id: `a-${Date.now()}`, date: new Date().toISOString(), type: "lost" as const, description, userName: currentUserName || undefined };
    setLeads(prev => ({
      ...prev,
      [leadId]: { ...prev[leadId], activities: [...(prev[leadId]?.activities ?? []), act] },
    }));
    supabase.from("activities").insert({ owner_id: company.owner_id, lead_id: leadId, type: "lost", description: act.description, date: act.date, user_name: act.userName ?? null })
      .then(({ error }) => { if (error) console.error("markLeadLost activity error:", error.message); });
  }, [user, company, currentUserName]);

  const markLeadOpen = useCallback((leadId: string) => {
    if (!user || !company) return;
    setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], dealStatus: "open" } }));
    supabase.from("leads").update({ status: "open" }).eq("id", leadId)
      .then(({ error }) => { if (error) console.error("markLeadOpen error:", error.message); });
    const act = { id: `a-${Date.now()}`, date: new Date().toISOString(), type: "stage_change" as const, description: "Negócio reaberto.", userName: currentUserName || undefined };
    setLeads(prev => ({
      ...prev,
      [leadId]: { ...prev[leadId], activities: [...(prev[leadId]?.activities ?? []), act] },
    }));
    supabase.from("activities").insert({ owner_id: company.owner_id, lead_id: leadId, type: "stage_change", description: act.description, date: act.date, user_name: act.userName ?? null })
      .then(({ error }) => { if (error) console.error("markLeadOpen activity error:", error.message); });
  }, [user, company, currentUserName]);

  // ── Loss Reasons ───────────────────────────────────────────────────────────

  const addLossReason = useCallback(async (name: string): Promise<boolean> => {
    if (!user || !company) return false;
    const { data, error } = await supabase
      .from("loss_reasons")
      .insert({ owner_id: company.owner_id, name })
      .select()
      .single();
    if (error) { console.error("addLossReason error:", error.message); return false; }
    setLossReasons(prev => [...prev, { id: data.id as string, name: data.name as string }]);
    return true;
  }, [user, company]);

  const updateLossReason = useCallback(async (id: string, name: string) => {
    setLossReasons(prev => prev.map(r => r.id === id ? { ...r, name } : r));
    const { error } = await supabase.from("loss_reasons").update({ name }).eq("id", id);
    if (error) console.error("updateLossReason error:", error.message);
  }, []);

  const deleteLossReason = useCallback(async (id: string) => {
    setLossReasons(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from("loss_reasons").delete().eq("id", id);
    if (error) console.error("deleteLossReason error:", error.message);
  }, []);

  // ── Custom Field Groups & Items ────────────────────────────────────────────

  const addCustomFieldGroup = useCallback(async (name: string): Promise<CustomFieldGroup | null> => {
    if (!user || !company) return null;
    const position = customFieldGroups.length;
    const { data, error } = await supabase
      .from("custom_field_groups")
      .insert({ owner_id: company.owner_id, name, position })
      .select().single();
    if (error || !data) { console.error("addCustomFieldGroup:", error?.message); return null; }
    const row = data as Record<string, unknown>;
    const group: CustomFieldGroup = { id: row.id as string, name, position, isDefault: false, items: [] };
    setCustomFieldGroups(prev => [...prev, group]);
    return group;
  }, [user, company, customFieldGroups.length]);

  const updateCustomFieldGroup = useCallback(async (id: string, name: string) => {
    setCustomFieldGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
    const { error } = await supabase.from("custom_field_groups").update({ name }).eq("id", id);
    if (error) console.error("updateCustomFieldGroup:", error.message);
  }, []);

  const deleteCustomFieldGroup = useCallback(async (id: string) => {
    setCustomFieldGroups(prev => prev.filter(g => g.id !== id));
    const { error } = await supabase.from("custom_field_groups").delete().eq("id", id);
    if (error) console.error("deleteCustomFieldGroup:", error.message);
  }, []);

  const addCustomFieldItem = useCallback(async (groupId: string, label: string, fieldType: CustomFieldType): Promise<CustomFieldItem | null> => {
    if (!user || !company) return null;
    const group = customFieldGroups.find(g => g.id === groupId);
    const position = group ? group.items.length : 0;
    const { data, error } = await supabase
      .from("custom_field_items")
      .insert({ owner_id: company.owner_id, group_id: groupId, label, field_type: fieldType, position })
      .select().single();
    if (error || !data) { console.error("addCustomFieldItem:", error?.message); return null; }
    const row = data as Record<string, unknown>;
    const item: CustomFieldItem = { id: row.id as string, groupId, label, fieldType, position };
    setCustomFieldGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, items: [...g.items, item] } : g
    ));
    return item;
  }, [user, company, customFieldGroups]);

  const updateCustomFieldItem = useCallback(async (id: string, data: Partial<Pick<CustomFieldItem, "label" | "fieldType">>) => {
    setCustomFieldGroups(prev => prev.map(g => ({
      ...g,
      items: g.items.map(i => i.id === id ? { ...i, ...data } : i),
    })));
    const dbData: Record<string, unknown> = {};
    if ("label" in data) dbData.label = data.label;
    if ("fieldType" in data) dbData.field_type = data.fieldType;
    const { error } = await supabase.from("custom_field_items").update(dbData).eq("id", id);
    if (error) console.error("updateCustomFieldItem:", error.message);
  }, []);

  const deleteCustomFieldItem = useCallback(async (groupId: string, itemId: string) => {
    setCustomFieldGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, items: g.items.filter(i => i.id !== itemId) } : g
    ));
    const { error } = await supabase.from("custom_field_items").delete().eq("id", itemId);
    if (error) console.error("deleteCustomFieldItem:", error.message);
  }, []);

  const updateLeadCustomFieldValues = useCallback(async (leadId: string, values: Record<string, string>) => {
    setLeads(prev => prev[leadId] ? { ...prev, [leadId]: { ...prev[leadId], customFieldValues: values } } : prev);
    const { error } = await supabase.from("leads").update({ custom_field_values: values }).eq("id", leadId);
    if (error) console.error("updateLeadCustomFieldValues:", error.message);
  }, []);

  // ── Lists ──────────────────────────────────────────────────────────────────

  const addList = useCallback(async (name: string, description: string): Promise<CrmList | null> => {
    if (!user || !company) return null;
    const { data, error } = await supabase.from("lists").insert({ owner_id: company.owner_id, name, description }).select().single();
    if (error || !data) { toast.error("Erro ao criar lista"); console.error("addList error:", error?.message, error?.details); return null; }
    const newList: CrmList = { id: data.id as string, name, description, leadIds: [], created_at: data.created_at as string };
    setCrmLists(prev => [...prev, newList]);
    return newList;
  }, [user, company]);

  const updateList = useCallback(async (id: string, data: Partial<Pick<CrmList, "name" | "description">>) => {
    setCrmLists(prev => prev.map(l => l.id === id ? { ...l, ...data } : l));
    const { error } = await supabase.from("lists").update(data).eq("id", id);
    if (error) toast.error("Erro ao atualizar lista");
  }, []);

  const deleteList = useCallback(async (id: string) => {
    setCrmLists(prev => prev.filter(l => l.id !== id));
    const { error } = await supabase.from("lists").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir lista");
  }, []);

  const addLeadToList = useCallback(async (listId: string, leadId: string) => {
    setCrmLists(prev => prev.map(l => l.id === listId && !l.leadIds.includes(leadId)
      ? { ...l, leadIds: [...l.leadIds, leadId] } : l));
    const { error } = await supabase.from("list_leads").insert({ list_id: listId, lead_id: leadId });
    if (error) { toast.error("Erro ao adicionar lead à lista"); }
  }, []);

  const removeLeadFromList = useCallback(async (listId: string, leadId: string) => {
    setCrmLists(prev => prev.map(l => l.id === listId
      ? { ...l, leadIds: l.leadIds.filter(id => id !== leadId) } : l));
    const { error } = await supabase.from("list_leads").delete().eq("list_id", listId).eq("lead_id", leadId);
    if (error) { toast.error("Erro ao remover lead da lista"); }
  }, []);

  // ── Tags ───────────────────────────────────────────────────────────────────

  const addTag = useCallback(async (name: string, description: string, color: string): Promise<boolean> => {
    if (!user || !company) return false;
    const { data, error } = await supabase
      .from("tags")
      .insert({ owner_id: company.owner_id, name, description, color })
      .select()
      .single();
    if (error || !data) {
      console.error("addTag error:", error?.message, error?.details);
      toast.error("Erro ao criar tag.");
      return false;
    }
    const row = data as Record<string, unknown>;
    setCrmTags(prev => [...prev, { id: row.id as string, name, description, color }]);
    return true;
  }, [user, company]);

  const updateTag = useCallback(async (id: string, data: Partial<Omit<Tag, "id">>) => {
    setCrmTags(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
    const { error } = await supabase.from("tags").update(data).eq("id", id);
    if (error) console.error("updateTag error:", error.message);
  }, []);

  const deleteTag = useCallback((id: string) => {
    setCrmTags(prev => prev.filter(t => t.id !== id));
    supabase.from("tags").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("deleteTag error:", error.message);
    });
  }, []);

  // ── Pipeline groups ────────────────────────────────────────────────────────

  const addPipelineGroup = useCallback(async (name: string): Promise<boolean> => {
    if (!user || !company) return false;
    const { data, error } = await supabase
      .from("pipeline_groups")
      .insert({ owner_id: company.owner_id, name, created_by: user.email ?? "" })
      .select()
      .single();
    if (error || !data) {
      console.error("addPipelineGroup error:", error?.message);
      toast.error("Erro ao criar grupo.");
      return false;
    }
    const row = data as Record<string, unknown>;
    setPipelineGroups(prev => [...prev, { id: row.id as string, name, createdBy: user.email ?? "" }]);
    return true;
  }, [user, company]);

  const deletePipelineGroup = useCallback((id: string) => {
    setPipelineGroups(prev => prev.filter(g => g.id !== id));
    supabase.from("pipeline_groups").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("deletePipelineGroup error:", error.message);
    });
  }, []);

  // ── Products ───────────────────────────────────────────────────────────────

  const addProduct = useCallback(async (data: Omit<Product, "id">) => {
    if (!user || !company) return;
    const { data: row, error } = await supabase
      .from("products")
      .insert({ owner_id: company.owner_id, name: data.name, sku: data.sku, default_value: data.defaultValue })
      .select()
      .single();
    if (error || !row) { toast.error("Erro ao criar produto."); return; }
    setProducts(prev => [...prev, {
      id: (row as Record<string, unknown>).id as string,
      name: data.name,
      sku: data.sku,
      defaultValue: data.defaultValue,
    }]);
  }, [user, company]);

  const updateProduct = useCallback(async (id: string, data: Partial<Omit<Product, "id">>) => {
    const dbData: Record<string, unknown> = {};
    if (data.name !== undefined) dbData.name = data.name;
    if (data.sku !== undefined) dbData.sku = data.sku;
    if (data.defaultValue !== undefined) dbData.default_value = data.defaultValue;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    const { error } = await supabase.from("products").update(dbData).eq("id", id);
    if (error) console.error("updateProduct error:", error.message);
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) console.error("deleteProduct error:", error.message);
  }, []);

  // ── Tasks ──────────────────────────────────────────────────────────────────

  const addTask = useCallback(async (task: Omit<Task, "id">) => {
    if (!user || !company) return;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        owner_id: company.owner_id,
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
  }, [user, company]);

  const updateTask = useCallback((id: string, data: Partial<Task>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...data } : t)));

    const dbData: Record<string, unknown> = {};
    if ("title" in data) dbData.title = data.title;
    if ("responsible" in data) dbData.responsible = data.responsible;
    if ("dueDate" in data) dbData.due_date = data.dueDate;
    if ("status" in data) dbData.status = data.status;
    if ("leadName" in data) dbData.lead_name = data.leadName;

    if (Object.keys(dbData).length > 0) {
      supabase.from("tasks").update(dbData).eq("id", id).then(({ error }) => {
        if (error) console.error("updateTask error:", error.message);
      });
    }
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    supabase.from("tasks").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("deleteTask error:", error.message);
    });
  }, []);

  // ── Activities ─────────────────────────────────────────────────────────────

  const addActivity = useCallback((leadId: string, activity: Omit<Activity, "id">) => {
    const tempId = `a-${Date.now()}`;
    const full: Activity = { ...activity, id: tempId };
    setLeads(prev => ({
      ...prev,
      [leadId]: { ...prev[leadId], activities: [...(prev[leadId]?.activities ?? []), full] },
    }));
    if (user && company) {
      supabase.from("activities").insert({
        owner_id: company.owner_id,
        lead_id: leadId,
        type: activity.type,
        description: activity.description,
        date: activity.date,
        user_name: activity.userName ?? null,
        title: activity.title ?? null,
        scheduled_at: activity.scheduledAt ?? null,
        duration_minutes: activity.durationMinutes ?? null,
        contact_email: activity.contactEmail ?? null,
        meet_link: activity.meetLink ?? null,
        participants: activity.participants ? JSON.stringify(activity.participants) : null,
        gcal_event_id: activity.gcalEventId ?? null,
      }).select().single().then(({ data, error }) => {
        if (error) { console.error("addActivity error:", error.message); return; }
        if (data) {
          const realId = (data as Record<string, unknown>).id as string;
          setLeads(prev => ({
            ...prev,
            [leadId]: {
              ...prev[leadId],
              activities: prev[leadId]?.activities.map(a => a.id === tempId ? { ...a, id: realId } : a) ?? [],
            },
          }));
        }
      });
    }
  }, [user, company]);

  const completeActivity = useCallback((leadId: string, activityId: string) => {
    const completedAt = new Date().toISOString();
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.map(a =>
          a.id === activityId ? { ...a, completedAt, noShowAt: undefined } : a
        ) ?? [],
      },
    }));
    if (user) {
      supabase.from("activities").update({ completed_at: completedAt, no_show_at: null }).eq("id", activityId)
        .then(({ error }) => { if (error) console.error("completeActivity error:", error.message); });
    }
  }, [user]);

  const patchActivity = useCallback((
    leadId: string,
    activityId: string,
    fields: Partial<Pick<Activity, "title" | "description" | "scheduledAt" | "meetLink" | "contactEmail" | "type" | "durationMinutes" | "participants">>
  ) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.map(a =>
          a.id === activityId ? { ...a, ...fields } : a
        ) ?? [],
      },
    }));
    if (user) {
      const dbFields: Record<string, unknown> = {};
      if (fields.title !== undefined) dbFields.title = fields.title;
      if (fields.description !== undefined) dbFields.description = fields.description;
      if (fields.scheduledAt !== undefined) dbFields.scheduled_at = fields.scheduledAt;
      if (fields.meetLink !== undefined) dbFields.meet_link = fields.meetLink;
      if (fields.contactEmail !== undefined) dbFields.contact_email = fields.contactEmail;
      if (fields.type !== undefined) dbFields.type = fields.type;
      if (fields.durationMinutes !== undefined) dbFields.duration_minutes = fields.durationMinutes;
      if (fields.participants !== undefined) dbFields.participants = fields.participants ? JSON.stringify(fields.participants) : null;
      supabase.from("activities").update(dbFields).eq("id", activityId)
        .then(({ error }) => { if (error) console.error("patchActivity error:", error.message); });
    }
  }, [user]);

  const uncompleteActivity = useCallback((leadId: string, activityId: string) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.map(a =>
          a.id === activityId ? { ...a, completedAt: undefined } : a
        ) ?? [],
      },
    }));
    if (user) {
      supabase.from("activities").update({ completed_at: null }).eq("id", activityId)
        .then(({ error }) => { if (error) console.error("uncompleteActivity error:", error.message); });
    }
  }, [user]);

  const markNoShow = useCallback((leadId: string, activityId: string) => {
    const noShowAt = new Date().toISOString();
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.map(a =>
          a.id === activityId ? { ...a, noShowAt, completedAt: undefined } : a
        ) ?? [],
      },
    }));
    if (user) {
      supabase.from("activities").update({ no_show_at: noShowAt, completed_at: null }).eq("id", activityId)
        .then(({ error }) => { if (error) console.error("markNoShow error:", error.message); });
    }
  }, [user]);

  const unmarkNoShow = useCallback((leadId: string, activityId: string) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.map(a =>
          a.id === activityId ? { ...a, noShowAt: undefined } : a
        ) ?? [],
      },
    }));
    if (user) {
      supabase.from("activities").update({ no_show_at: null }).eq("id", activityId)
        .then(({ error }) => { if (error) console.error("unmarkNoShow error:", error.message); });
    }
  }, [user]);

  const deleteActivity = useCallback((leadId: string, activityId: string, gcalEventId?: string) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.filter(a => a.id !== activityId) ?? [],
      },
    }));
    if (user) {
      supabase.from("activities").delete().eq("id", activityId)
        .then(({ error }) => { if (error) console.error("deleteActivity error:", error.message); });
      if (gcalEventId) {
        supabase.functions.invoke("google-calendar-delete", { body: { event_id: gcalEventId } })
          .catch(() => {});
      }
    }
  }, [user]);

  const pinActivity = useCallback((leadId: string, activityId: string, pinned: boolean) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.map(a =>
          a.id === activityId ? { ...a, pinned } : a
        ) ?? [],
      },
    }));
    if (user) {
      supabase.from("activities").update({ pinned }).eq("id", activityId)
        .then(({ error }) => { if (error) console.error("pinActivity error:", error.message); });
    }
  }, [user]);

  const updateActivity = useCallback((leadId: string, activityId: string, description: string) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: {
        ...prev[leadId],
        activities: prev[leadId]?.activities.map(a =>
          a.id === activityId ? { ...a, description } : a
        ) ?? [],
      },
    }));
    if (user) {
      supabase.from("activities").update({ description }).eq("id", activityId)
        .then(({ error }) => { if (error) console.error("updateActivity error:", error.message); });
    }
  }, [user]);

  return (
    <CRMContext.Provider
      value={{
        crmLoading,
        pipelines, activePipelineId, setActivePipelineId, activePipeline,
        addPipeline, updatePipeline, deletePipeline,
        columns, updateColumn, deleteColumn, addColumn, reorderColumns,
        leads, updateLead, addLead, deleteLead, moveLead, transferLead,
        markLeadWon, markLeadLost, markLeadOpen, nextDealNumber,
        tasks, addTask, updateTask, deleteTask,
        addActivity, updateActivity, patchActivity, completeActivity, uncompleteActivity, markNoShow, unmarkNoShow, deleteActivity, pinActivity,
        crmTags, addTag, updateTag, deleteTag,
        crmLists, addList, updateList, deleteList, addLeadToList, removeLeadFromList,
        pipelineGroups, addPipelineGroup, deletePipelineGroup,
        teamMembers, memberColors, memberEmails, memberAvatars,
        products, addProduct, updateProduct, deleteProduct,
        lossReasons, addLossReason, updateLossReason, deleteLossReason,
        customFieldGroups, addCustomFieldGroup, updateCustomFieldGroup, deleteCustomFieldGroup,
        addCustomFieldItem, updateCustomFieldItem, deleteCustomFieldItem, updateLeadCustomFieldValues,
        logout: signOut,
        selectedLeadId, setSelectedLeadId,
      }}
    >
      {children}
    </CRMContext.Provider>
  );
}
