import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { Lead, Task, PipelineColumn, Activity, defaultColumns, mockLeads, mockTasks, teamMembers } from "@/data/mockData";

interface CRMContextType {
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;
  columns: PipelineColumn[];
  setColumns: (cols: PipelineColumn[]) => void;
  leads: Record<string, Lead>;
  updateLead: (id: string, data: Partial<Lead>) => void;
  addLead: (lead: Lead) => void;
  deleteLead: (id: string) => void;
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, data: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  teamMembers: string[];
  addActivity: (leadId: string, activity: Activity) => void;
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
  moveLead: (leadId: string, fromCol: string, toCol: string, toIndex: number) => void;
}

const CRMContext = createContext<CRMContextType | null>(null);

export function useCRM() {
  const ctx = useContext(CRMContext);
  if (!ctx) throw new Error("useCRM must be within CRMProvider");
  return ctx;
}

export function CRMProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [columns, setColumns] = useState<PipelineColumn[]>(defaultColumns);
  const [leads, setLeads] = useState<Record<string, Lead>>(mockLeads);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const login = () => setIsLoggedIn(true);
  const logout = () => setIsLoggedIn(false);

  const updateLead = useCallback((id: string, data: Partial<Lead>) => {
    setLeads(prev => ({ ...prev, [id]: { ...prev[id], ...data } }));
  }, []);

  const addLead = useCallback((lead: Lead) => {
    setLeads(prev => ({ ...prev, [lead.id]: lead }));
    setColumns(prev => prev.map(c => c.id === lead.stage ? { ...c, leadIds: [...c.leadIds, lead.id] } : c));
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads(prev => { const n = { ...prev }; delete n[id]; return n; });
    setColumns(prev => prev.map(c => ({ ...c, leadIds: c.leadIds.filter(l => l !== id) })));
    setTasks(prev => prev.filter(t => t.leadId !== id));
  }, []);

  const addTask = useCallback((task: Task) => setTasks(prev => [...prev, task]), []);
  const updateTask = useCallback((id: string, data: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  }, []);
  const deleteTask = useCallback((id: string) => setTasks(prev => prev.filter(t => t.id !== id)), []);

  const addActivity = useCallback((leadId: string, activity: Activity) => {
    setLeads(prev => ({
      ...prev,
      [leadId]: { ...prev[leadId], activities: [...prev[leadId].activities, activity] },
    }));
  }, []);

  const moveLead = useCallback((leadId: string, fromCol: string, toCol: string, toIndex: number) => {
    setColumns(prev => {
      const newCols = prev.map(c => ({ ...c, leadIds: [...c.leadIds] }));
      const from = newCols.find(c => c.id === fromCol);
      const to = newCols.find(c => c.id === toCol);
      if (!from || !to) return prev;
      from.leadIds = from.leadIds.filter(id => id !== leadId);
      to.leadIds.splice(toIndex, 0, leadId);
      return newCols;
    });
    setLeads(prev => ({ ...prev, [leadId]: { ...prev[leadId], stage: toCol } }));
  }, []);

  return (
    <CRMContext.Provider value={{
      isLoggedIn, login, logout, columns, setColumns, leads, updateLead, addLead, deleteLead,
      tasks, addTask, updateTask, deleteTask, teamMembers, addActivity,
      selectedLeadId, setSelectedLeadId, moveLead,
    }}>
      {children}
    </CRMContext.Provider>
  );
}
