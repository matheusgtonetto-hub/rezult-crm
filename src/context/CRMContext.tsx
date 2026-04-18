import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";
import {
  Lead,
  Task,
  Pipeline,
  PipelineColumn,
  Product,
  Activity,
  defaultPipelines,
  mockLeads,
  mockTasks,
  mockProducts,
  teamMembers,
  memberColors,
} from "@/data/mockData";

interface CRMContextType {
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;

  // Pipelines
  pipelines: Pipeline[];
  activePipelineId: string;
  setActivePipelineId: (id: string) => void;
  activePipeline: Pipeline;
  addPipeline: (p: Pipeline) => void;
  updatePipeline: (id: string, data: Partial<Pipeline>) => void;
  deletePipeline: (id: string) => void;

  // Columns of the ACTIVE pipeline (kept for backward compat)
  columns: PipelineColumn[];
  setColumns: (cols: PipelineColumn[]) => void;
  updateColumn: (pipelineId: string, columnId: string, data: Partial<PipelineColumn>) => void;
  deleteColumn: (pipelineId: string, columnId: string) => void;
  addColumn: (pipelineId: string, column: PipelineColumn) => void;

  // Leads
  leads: Record<string, Lead>;
  updateLead: (id: string, data: Partial<Lead>) => void;
  addLead: (lead: Lead) => void;
  deleteLead: (id: string) => void;
  moveLead: (leadId: string, fromCol: string, toCol: string, toIndex: number) => void;
  markLeadWon: (leadId: string) => void;
  markLeadLost: (leadId: string) => void;
  nextDealNumber: () => number;

  // Tasks
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, data: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  // Team & products
  teamMembers: string[];
  memberColors: Record<string, string>;
  products: Product[];

  // Activities
  addActivity: (leadId: string, activity: Activity) => void;

  // Drawer
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
}

const CRMContext = createContext<CRMContextType | null>(null);

export function useCRM() {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error("useCRM must be within CRMProvider");
  return ctx;
}

export function CRMProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>(defaultPipelines);
  const [activePipelineId, setActivePipelineId] = useState<string>(defaultPipelines[0].id);
  const [leads, setLeads] = useState<Record<string, Lead>>(mockLeads);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [products] = useState<Product[]>(mockProducts);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const login = () => setIsLoggedIn(true);
  const logout = () => setIsLoggedIn(false);

  const activePipeline = useMemo(
    () => pipelines.find(p => p.id === activePipelineId) || pipelines[0],
    [pipelines, activePipelineId]
  );

  const columns = activePipeline.columns;

  const setColumns = useCallback(
    (cols: PipelineColumn[]) => {
      setPipelines(prev => prev.map(p => (p.id === activePipelineId ? { ...p, columns: cols } : p)));
    },
    [activePipelineId]
  );

  const addPipeline = useCallback((p: Pipeline) => setPipelines(prev => [...prev, p]), []);
  const updatePipeline = useCallback((id: string, data: Partial<Pipeline>) => {
    setPipelines(prev => prev.map(p => (p.id === id ? { ...p, ...data } : p)));
  }, []);
  const deletePipeline = useCallback((id: string) => {
    setPipelines(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateColumn = useCallback(
    (pipelineId: string, columnId: string, data: Partial<PipelineColumn>) => {
      setPipelines(prev =>
        prev.map(p =>
          p.id === pipelineId
            ? { ...p, columns: p.columns.map(c => (c.id === columnId ? { ...c, ...data } : c)) }
            : p
        )
      );
    },
    []
  );

  const deleteColumn = useCallback((pipelineId: string, columnId: string) => {
    setPipelines(prev =>
      prev.map(p =>
        p.id === pipelineId ? { ...p, columns: p.columns.filter(c => c.id !== columnId) } : p
      )
    );
  }, []);

  const addColumn = useCallback((pipelineId: string, column: PipelineColumn) => {
    setPipelines(prev =>
      prev.map(p => (p.id === pipelineId ? { ...p, columns: [...p.columns, column] } : p))
    );
  }, []);

  const updateLead = useCallback((id: string, data: Partial<Lead>) => {
    setLeads(prev => ({ ...prev, [id]: { ...prev[id], ...data } }));
  }, []);

  const nextDealNumber = useCallback(() => {
    const all = Object.values(leads).map(l => l.dealNumber || 0);
    return (all.length ? Math.max(...all) : 1000) + 1;
  }, [leads]);

  const addLead = useCallback(
    (lead: Lead) => {
      setLeads(prev => ({ ...prev, [lead.id]: lead }));
      setPipelines(prev =>
        prev.map(p =>
          p.id === lead.pipelineId
            ? {
                ...p,
                columns: p.columns.map(c =>
                  c.id === lead.stage ? { ...c, leadIds: [...c.leadIds, lead.id] } : c
                ),
              }
            : p
        )
      );
    },
    []
  );

  const deleteLead = useCallback((id: string) => {
    setLeads(prev => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setPipelines(prev =>
      prev.map(p => ({ ...p, columns: p.columns.map(c => ({ ...c, leadIds: c.leadIds.filter(l => l !== id) })) }))
    );
    setTasks(prev => prev.filter(t => t.leadId !== id));
  }, []);

  const addTask = useCallback((task: Task) => setTasks(prev => [...prev, task]), []);
  const updateTask = useCallback((id: string, data: Partial<Task>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...data } : t)));
  }, []);
  const deleteTask = useCallback((id: string) => setTasks(prev => prev.filter(t => t.id !== id)), []);

  const addActivity = useCallback((leadId: string, activity: Activity) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: { ...prev[leadId], activities: [...prev[leadId].activities, activity] },
    }));
  }, []);

  // Move within the pipeline that owns the lead (typically the active one).
  const moveLead = useCallback(
    (leadId: string, fromCol: string, toCol: string, toIndex: number) => {
      setPipelines(prev => {
        return prev.map(p => {
          // Operate on the pipeline that contains either column
          const hasFrom = p.columns.some(c => c.id === fromCol);
          const hasTo = p.columns.some(c => c.id === toCol);
          if (!hasFrom || !hasTo) return p;
          const newCols = p.columns.map(c => ({ ...c, leadIds: [...c.leadIds] }));
          const from = newCols.find(c => c.id === fromCol)!;
          const to = newCols.find(c => c.id === toCol)!;
          from.leadIds = from.leadIds.filter(id => id !== leadId);
          to.leadIds.splice(toIndex, 0, leadId);
          return { ...p, columns: newCols };
        });
      });
      setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], stage: toCol } }));
    },
    []
  );

  const findWonLostStage = useCallback(
    (pipelineId: string, kind: "won" | "lost"): string | null => {
      const p = pipelines.find(x => x.id === pipelineId);
      if (!p) return null;
      const candidates = kind === "won" ? ["fechado", "ganho", "recuperado"] : ["perdido"];
      const col = p.columns.find(c => candidates.some(k => c.id.toLowerCase().includes(k)));
      return col?.id || null;
    },
    [pipelines]
  );

  const markLeadWon = useCallback(
    (leadId: string) => {
      const lead = leads[leadId];
      if (!lead) return;
      const target = findWonLostStage(lead.pipelineId, "won");
      if (!target) return;
      const fromCol = lead.stage;
      moveLead(leadId, fromCol, target, 0);
      addActivity(leadId, {
        id: `a-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        type: "won",
        description: "Negócio marcado como ganho.",
      });
    },
    [leads, moveLead, addActivity, findWonLostStage]
  );

  const markLeadLost = useCallback(
    (leadId: string) => {
      const lead = leads[leadId];
      if (!lead) return;
      const target = findWonLostStage(lead.pipelineId, "lost");
      if (!target) return;
      const fromCol = lead.stage;
      moveLead(leadId, fromCol, target, 0);
      addActivity(leadId, {
        id: `a-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        type: "lost",
        description: "Negócio marcado como perdido.",
      });
    },
    [leads, moveLead, addActivity, findWonLostStage]
  );

  return (
    <CRMContext.Provider
      value={{
        isLoggedIn, login, logout,
        pipelines, activePipelineId, setActivePipelineId, activePipeline,
        addPipeline, updatePipeline, deletePipeline,
        columns, setColumns, updateColumn, deleteColumn, addColumn,
        leads, updateLead, addLead, deleteLead, moveLead, markLeadWon, markLeadLost, nextDealNumber,
        tasks, addTask, updateTask, deleteTask,
        teamMembers, memberColors, products,
        addActivity,
        selectedLeadId, setSelectedLeadId,
      }}
    >
      {children}
    </CRMContext.Provider>
  );
}
