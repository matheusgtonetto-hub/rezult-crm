import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useCRM } from "@/context/CRMContext";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useProfile } from "@/context/ProfileContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePipelinePermissions } from "@/hooks/usePipelinePermissions";
import { LeadDrawer } from "@/components/LeadDrawer";
import { PipelineSidebar } from "@/components/PipelineSidebar";
import { DateRangePicker } from "@/components/DateRangePicker";
import { PipelineFilterPanel } from "@/components/PipelineFilterPanel";
import { leadMatchesFilter, isFilterEmpty, type LeadFilter } from "@/data/disparos";
import type { AttendantPermissions } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Calendar, CalendarClock, Tag as TagIcon, Settings, Users, GitBranch, ChevronLeft, ChevronRight, GripVertical, Trophy, XCircle, ChevronDown, AlertTriangle, CheckCircle, X, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useFloatingChat } from "@/context/FloatingChatContext";

const priorityColors: Record<string, string> = {
  Alta: "bg-destructive/10 text-destructive",
  Média: "bg-primary/10 text-primary",
  Baixa: "bg-muted text-muted-foreground",
};

const COLUMN_COLORS = [
  "#AAAAAA", "#378ADD", "#128A68", "#F59E0B", "#8B5CF6",
  "#E24B4A", "#EC4899", "#14B8A6", "#F97316", "#06B6D4",
  "#84CC16", "#EAB308", "#6366F1", "#78716C", "#0EA5E9",
  "#10B981", "#F43F5E", "#A855F7", "#3B82F6", "#22C55E",
];

type SortKey = "recent" | "oldest" | "value" | "name";
type StatusFilter = "open" | "won" | "lost" | "all";

export default function PipelinePage() {
  const {
    pipelines,
    activePipeline,
    activePipelineId,
    setActivePipelineId,
    leads,
    moveLead,
    addActivity,
    selectedLeadId,
    setSelectedLeadId,
    memberColors,
    memberAvatars,
    reorderColumns,
    updateColumn,
    deleteColumn,
    addColumn,
    updateLead,
    updatePipeline,
    deletePipeline,
    crmTags,
    pipelineGroups,
    addPipelineGroup,
    deletePipelineGroup,
    teamMembers,
  } = useCRM();
  const { openChat } = useFloatingChat();
  const { user } = useAuth();
  const { company } = useCompany();
  const { profile } = useProfile();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { pipelineId } = useParams();

  const isAdmin = can("admin");
  const isPipelineAdmin = isAdmin || can("pipelines:admin");
  const myName = profile?.full_name ?? "";

  // helper inline — evita depender de getPerms (hook declarado abaixo)
  const isAccessible = useCallback((pid: string) => {
    if (isAdmin) return true;
    const p = pipelines.find(pl => pl.id === pid);
    return !(p?.permissions?.byAttendant?.[myName]?.blockViewPipeline ?? false);
  }, [isAdmin, myName, pipelines]);

  // A URL é a fonte da verdade do pipeline ativo: /pipeline/:pipelineId
  // 1) param válido na URL → adota como pipeline ativo
  useEffect(() => {
    if (pipelineId && pipelines.some(p => p.id === pipelineId) && pipelineId !== activePipelineId) {
      setActivePipelineId(pipelineId);
    }
  }, [pipelineId, pipelines, activePipelineId, setActivePipelineId]);

  // 2) URL sem id (/pipeline) ou id inexistente → redireciona para o ativo/primeiro acessível
  useEffect(() => {
    if (pipelines.length === 0) return;
    const valid = pipelineId && pipelines.some(p => p.id === pipelineId);
    if (!valid) {
      const target =
        (pipelines.some(p => p.id === activePipelineId) && isAccessible(activePipelineId))
          ? activePipelineId
          : (pipelines.find(p => isAccessible(p.id))?.id ?? pipelines[0].id);
      navigate(`/pipeline/${target}`, { replace: true });
    }
  }, [pipelineId, pipelines, activePipelineId, navigate, isAccessible]);

  // 3) Pipeline da URL está bloqueado → redireciona para o primeiro acessível
  useEffect(() => {
    if (!pipelineId || !pipelines.length || isAdmin) return;
    if (isAccessible(pipelineId)) return;
    const next = pipelines.find(p => isAccessible(p.id));
    setSidebarOpen(true);
    if (next) navigate(`/pipeline/${next.id}`, { replace: true });
  }, [pipelineId, pipelines, isAdmin, isAccessible, navigate]);

  const { getPerms } = usePipelinePermissions();
  const myPerms = activePipeline ? getPerms(activePipeline.id) : {};

  // "Visualizando como:" — só usado por admins; [] = todos os leads
  // Usa sessionStorage para resetar ao sair da sessão (não persiste entre logins).
  // Na primeira abertura da sessão, inicializa com o próprio usuário logado.
  const [viewAsUser, setViewAsUser] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem("pipeline_filter_viewAsUser");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (myName && !sessionStorage.getItem("pipeline_filter_viewAsUser_init")) {
      sessionStorage.setItem("pipeline_filter_viewAsUser_init", "1");
      setViewAsUser([myName]);
    }
  }, [myName]);

  useEffect(() => { sessionStorage.setItem("pipeline_filter_viewAsUser", JSON.stringify(viewAsUser)); }, [viewAsUser]);

  function toggleViewAsUser(val: string) {
    setViewAsUser(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  }
  const [viewPickerOpen, setViewPickerOpen] = useState(false);
  const viewPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewPickerOpen) return;
    const close = (e: MouseEvent) => {
      if (viewPickerRef.current && !viewPickerRef.current.contains(e.target as Node))
        setViewPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [viewPickerOpen]);

  // Z-API instances for WhatsApp selector
  const [zapiInstances, setZapiInstances] = useState<{ instanceId: string; label: string }[]>([]);
  const [selectedZapiInstance, setSelectedZapiInstance] = useState("");
  const [wpPopoverLeadId, setWpPopoverLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (company?.zapi_connected && company.zapi_instance_id) {
      const inst = {
        instanceId: company.zapi_instance_id,
        label: company.zapi_phone ? `Z-API · ${company.zapi_phone}` : `Z-API · ${company.zapi_instance_id.slice(0, 8)}…`,
      };
      setZapiInstances([inst]);
      setSelectedZapiInstance(inst.instanceId);
    } else {
      setZapiInstances([]);
      setSelectedZapiInstance("");
    }
  }, [company?.zapi_instance_id, company?.zapi_connected]);

  // Sidebar collapse — persisted in localStorage, collapsed by default on mobile
  const SIDEBAR_W = 240;

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (window.innerWidth < 768) return false;
    try {
      const saved = localStorage.getItem("pipeline-sidebar-open");
      return saved === null ? true : saved === "true";
    } catch { return true; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => {
      const next = !prev;
      try { localStorage.setItem("pipeline-sidebar-open", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Keyboard shortcut: [ to toggle sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "[" && tag !== "INPUT" && tag !== "TEXTAREA") toggleSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  // Popover de responsável inline no card
  const [respPopoverLeadId, setRespPopoverLeadId] = useState<string | null>(null);

  // Column edit/delete dialogs
  const [renamingCol, setRenamingCol] = useState<{ id: string; title: string } | null>(null);
  const [deletingCol, setDeletingCol] = useState<{ id: string; title: string; count: number } | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [showNewColumn, setShowNewColumn] = useState(false);

  // Pipeline settings dialog
  const [showEditPipeline, setShowEditPipeline] = useState(false);
  const [editPipelineTab, setEditPipelineTab] = useState<"config" | "atendentes">("config");
  const [editPipelineName, setEditPipelineName] = useState("");
  const [editPipelineDesc, setEditPipelineDesc] = useState("");
  const [editPipelineGroup, setEditPipelineGroup] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [confirmDeletePipeline, setConfirmDeletePipeline] = useState(false);
  // Permissions state (per attendant)
  const [selectedPermAttendant, setSelectedPermAttendant] = useState<string | null>(null);
  const [attendantPerms, setAttendantPerms] = useState<Record<string, AttendantPermissions>>({});
  const [colorPickerColId, setColorPickerColId] = useState<string | null>(null);

  // Modal de confirmação de avanço de etapa
  const [pendingAdvance, setPendingAdvance] = useState<{
    leadId: string;
    leadName: string;
    toIndex: number;
    steps: Array<{ colId: string; colTitle: string }>;
    currentStep: number; // índice em `steps` da posição atual do lead
  } | null>(null);

  // Filters
  // A busca é refletida na URL como ?search=... (fonte da verdade); os demais
  // filtros persistem em localStorage para sobreviver a recarregamentos.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const setSearch = (val: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (val) next.set("search", val);
      else next.delete("search");
      return next;
    }, { replace: true });
  };
  const [sortKey, setSortKey] = useState<SortKey>(() => (sessionStorage.getItem("pipeline_filter_sort") as SortKey) ?? "recent");
  const [status, setStatus] = useState<StatusFilter>(() => (sessionStorage.getItem("pipeline_filter_status") as StatusFilter) ?? "open");
  const [dateFrom, setDateFrom] = useState(() => sessionStorage.getItem("pipeline_filter_dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(() => sessionStorage.getItem("pipeline_filter_dateTo") ?? "");
  // Filtro avançado ("Filtros"): persiste POR PIPELINE em localStorage, então
  // sobrevive a trocar de página, recarregar e até fechar o navegador — cada
  // pipeline lembra do seu próprio filtro.
  const advKey = (pid?: string | null) => `pipeline_adv_filter_${pid ?? "default"}`;
  const [advFilter, setAdvFilter] = useState<LeadFilter>(() => {
    try { return JSON.parse(localStorage.getItem(advKey(activePipelineId)) ?? "{}"); } catch { return {}; }
  });
  const advPidRef = useRef(activePipelineId);

  useEffect(() => { sessionStorage.setItem("pipeline_filter_sort", sortKey); }, [sortKey]);
  useEffect(() => { sessionStorage.setItem("pipeline_filter_status", status); }, [status]);
  useEffect(() => { sessionStorage.setItem("pipeline_filter_dateFrom", dateFrom); }, [dateFrom]);
  useEffect(() => { sessionStorage.setItem("pipeline_filter_dateTo", dateTo); }, [dateTo]);
  // Grava o filtro no pipeline atual (ignora a passada em que o pipeline acabou
  // de trocar, para não sobrescrever a chave nova com o filtro antigo).
  useEffect(() => {
    if (advPidRef.current !== activePipelineId) return;
    try { localStorage.setItem(advKey(activePipelineId), JSON.stringify(advFilter)); } catch { /* ignore */ }
  }, [advFilter, activePipelineId]);
  // Ao trocar de pipeline, recarrega o filtro salvo daquele pipeline.
  useEffect(() => {
    if (advPidRef.current === activePipelineId) return;
    advPidRef.current = activePipelineId;
    try { setAdvFilter(JSON.parse(localStorage.getItem(advKey(activePipelineId)) ?? "{}")); }
    catch { setAdvFilter({}); }
  }, [activePipelineId]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination, type } = result;
    if (type === "COLUMN") {
      if (source.index === destination.index) return;
      const cols = activePipeline?.columns ?? [];
      const ordered = [...cols].sort((a, b) => a.position - b.position);
      const [moved] = ordered.splice(source.index, 1);
      ordered.splice(destination.index, 0, moved);
      reorderColumns(activePipeline!.id, ordered.map(c => c.id));
      return;
    }
    if (source.droppableId !== destination.droppableId) {
      const cols = [...(activePipeline?.columns ?? [])].sort((a, b) => a.position - b.position);
      const fromCol  = cols.find(c => c.id === source.droppableId);
      const toCol    = cols.find(c => c.id === destination.droppableId);
      const fromIdx  = cols.findIndex(c => c.id === source.droppableId);
      const toIdx    = cols.findIndex(c => c.id === destination.droppableId);
      const isAdvance = toIdx > fromIdx;
      if (isAdvance) {
        const steps = cols.slice(fromIdx, toIdx + 1).map(c => ({ colId: c.id, colTitle: c.title }));
        setPendingAdvance({
          leadId: draggableId,
          leadName: leads[draggableId]?.name ?? "",
          toIndex: destination.index,
          steps,
          currentStep: 0,
        });
        return;
      }
      // Mover para etapa anterior — executa sem confirmação
      addActivity(draggableId, {
        id: `a-${Date.now()}`,
        date: new Date().toISOString(),
        type: "stage_change",
        description: `Movido de "${fromCol?.title}" para "${toCol?.title}".`,
      });
    }
    moveLead(draggableId, source.droppableId, destination.droppableId, destination.index);
  };

  const handleConfirmAdvance = () => {
    if (!pendingAdvance) return;
    const { steps, currentStep, leadId, toIndex } = pendingAdvance;
    const from = steps[currentStep];
    const to = steps[currentStep + 1];
    moveLead(leadId, from.colId, to.colId, toIndex);
    addActivity(leadId, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString(),
      type: "stage_change",
      description: `Movido de "${from.colTitle}" para "${to.colTitle}".`,
    });
    if (currentStep + 1 === steps.length - 1) {
      setPendingAdvance(null);
    } else {
      setPendingAdvance({ ...pendingAdvance, currentStep: currentStep + 1 });
    }
  };

  const handleCancelAdvance = () => {
    // Estado nunca foi alterado — só limpa o pendingAdvance
    setPendingAdvance(null);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const filteredColumns = useMemo(() => {
    if (!activePipeline) return [];
    return [...activePipeline.columns]
      .sort((a, b) => a.position - b.position)
      .map(col => {
        let ids = col.leadIds.filter(id => {
          const l = leads[id];
          if (!l) return false;
          if (status === "open") return !l.dealStatus || l.dealStatus === "open";
          if (status === "won") return l.dealStatus === "won";
          if (status === "lost") return l.dealStatus === "lost";
          return true;
        });
        if (search) {
          const q = search.toLowerCase();
          const qDigits = q.replace(/\D/g, "");
          ids = ids.filter(id => {
            const l = leads[id];
            return (
              l.name.toLowerCase().includes(q) ||
              (l.company || "").toLowerCase().includes(q) ||
              String(l.dealNumber || "").includes(q) ||
              (qDigits.length >= 3 && (l.whatsapp || "").replace(/\D/g, "").includes(qDigits))
            );
          });
        }
        if (dateFrom) ids = ids.filter(id => leads[id].entryDate >= dateFrom);
        if (dateTo) ids = ids.filter(id => leads[id].entryDate <= dateTo);

        // Filtros avançados (painel "Filtros")
        if (!isFilterEmpty(advFilter)) {
          ids = ids.filter(id => leadMatchesFilter(leads[id], advFilter, { lists: [] }));
        }

        // Visibilidade por responsável
        const getResps = (l: typeof leads[string]) =>
          l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
        if (myPerms.viewOwnDealsOnly) {
          ids = ids.filter(id => {
            const resps = getResps(leads[id]);
            return resps.includes(myName);
          });
        } else if (isAdmin && viewAsUser.length > 0) {
          ids = ids.filter(id => {
            const resps = getResps(leads[id]);
            return viewAsUser.some(v =>
              v === "__no_responsible__" ? resps.length === 0 : resps.includes(v)
            );
          });
        }

        ids.sort((a, b) => {
          const la = leads[a];
          const lb = leads[b];
          if (sortKey === "value") return lb.value - la.value;
          if (sortKey === "name") return la.name.localeCompare(lb.name);
          if (sortKey === "oldest") return la.entryDate.localeCompare(lb.entryDate);
          return lb.entryDate.localeCompare(la.entryDate);
        });
        return { ...col, filteredIds: ids };
      });
  }, [activePipeline?.columns, leads, search, status, dateFrom, dateTo, sortKey, isAdmin, myName, viewAsUser, advFilter, myPerms.viewOwnDealsOnly]);

  const loadPermissionsState = () => {
    setAttendantPerms(activePipeline.permissions?.byAttendant ?? {});
    setSelectedPermAttendant(null);
  };

  const setAttendantPerm = (perm: keyof AttendantPermissions, value: boolean) => {
    if (!selectedPermAttendant) return;
    setAttendantPerms(prev => ({
      ...prev,
      [selectedPermAttendant]: { ...(prev[selectedPermAttendant] ?? {}), [perm]: value },
    }));
  };

  const openEditPipeline = () => {
    setEditPipelineName(activePipeline.name);
    setEditPipelineDesc(activePipeline.description ?? "");
    setEditPipelineGroup(activePipeline.category);
    setEditPipelineTab("config");
    setCreatingGroup(false);
    setNewGroupName("");
    loadPermissionsState();
    setShowEditPipeline(true);
  };

  const openPermissions = () => {
    setEditPipelineName(activePipeline.name);
    setEditPipelineDesc(activePipeline.description ?? "");
    setEditPipelineGroup(activePipeline.category);
    setEditPipelineTab("atendentes");
    setCreatingGroup(false);
    setNewGroupName("");
    loadPermissionsState();
    setShowEditPipeline(true);
  };

  const handleDeletePipeline = () => {
    const groupName = activePipeline.category;
    const deletedId = activePipeline.id;
    const othersInGroup = pipelines.filter(p => p.category === groupName && p.id !== deletedId);
    const nextPipeline = pipelines.find(p => p.id !== deletedId);
    deletePipeline(deletedId);
    if (othersInGroup.length === 0) {
      const group = pipelineGroups.find(g => g.name === groupName);
      if (group) deletePipelineGroup(group.id);
    }
    setConfirmDeletePipeline(false);
    setShowEditPipeline(false);
    // A URL aponta para a pipeline excluída — vai para a próxima disponível
    if (nextPipeline) navigate(`/pipeline/${nextPipeline.id}`, { replace: true });
    toast.success("Pipeline removida.");
  };

  const handleSaveEditPipeline = () => {
    if (!editPipelineName.trim()) { toast.error("Informe um nome."); return; }
    updatePipeline(activePipeline.id, {
      name: editPipelineName.trim(),
      description: editPipelineDesc.trim(),
      category: editPipelineGroup,
      permissions: { byAttendant: attendantPerms },
    });
    toast.success("Pipeline atualizado.");
    setShowEditPipeline(false);
  };

  if (myPerms.blockViewPipeline) {
    return (
      <div className="relative flex h-screen bg-background">
        <div className="shrink-0 overflow-hidden h-full" style={{ width: sidebarOpen ? SIDEBAR_W : 0, transition: "width 300ms ease" }}>
          <div style={{ width: SIDEBAR_W, height: "100%" }}><PipelineSidebar /></div>
        </div>
        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? "Fechar sidebar ( [ )" : "Mostrar pipelines ( [ )"}
          aria-label={sidebarOpen ? "Fechar sidebar de pipelines" : "Mostrar pipelines"}
          style={{
            position: "absolute",
            left: SIDEBAR_W,
            top: 30,
            transform: `translateX(${sidebarOpen ? 0 : -SIDEBAR_W}px)`,
            transition: "transform 300ms ease",
            zIndex: 20,
          }}
          className="w-4 h-8 rounded-r-md bg-primary/60 text-white flex items-center justify-center shadow-sm hover:bg-primary/80 transition-colors cursor-pointer shrink-0"
        >
          {sidebarOpen ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <ShieldCheck size={40} className="text-muted-foreground opacity-30" />
          <p className="text-base font-semibold text-foreground">Acesso restrito</p>
          <p className="text-sm text-muted-foreground max-w-xs">Você não tem permissão para visualizar este pipeline.</p>
        </div>
      </div>
    );
  }

  if (!activePipeline) {
    return (
      <div className="relative flex h-screen bg-background">
        <div
          className="shrink-0 overflow-hidden h-full"
          style={{ width: sidebarOpen ? SIDEBAR_W : 0, transition: "width 300ms ease" }}
        >
          <div style={{ width: SIDEBAR_W, height: "100%" }}>
            <PipelineSidebar />
          </div>
        </div>

        <button
          onClick={toggleSidebar}
          title={sidebarOpen ? "Fechar sidebar ( [ )" : "Mostrar pipelines ( [ )"}
          aria-label={sidebarOpen ? "Fechar sidebar de pipelines" : "Mostrar pipelines"}
          style={{
            position: "absolute",
            left: SIDEBAR_W,
            top: 30,
            transform: `translateX(${sidebarOpen ? 0 : -SIDEBAR_W}px)`,
            transition: "transform 300ms ease",
            zIndex: 20,
          }}
          className="w-4 h-8 rounded-r-md bg-primary/60 text-white flex items-center justify-center shadow-sm hover:bg-primary/80 transition-colors cursor-pointer shrink-0"
        >
          {sidebarOpen ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
        </button>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <GitBranch size={48} className="text-muted-foreground/20 mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Nenhuma pipeline criada</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Crie sua primeira pipeline usando o botão "+" na barra lateral.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen bg-background">
      <div
        className="shrink-0 overflow-hidden h-full"
        style={{ width: sidebarOpen ? SIDEBAR_W : 0, transition: "width 300ms ease" }}
      >
        <div style={{ width: SIDEBAR_W, height: "100%" }}>
          <PipelineSidebar />
        </div>
      </div>

      <button
        onClick={toggleSidebar}
        title={sidebarOpen ? "Fechar sidebar ( [ )" : "Mostrar pipelines ( [ )"}
        aria-label={sidebarOpen ? "Fechar sidebar de pipelines" : "Mostrar pipelines"}
        style={{
          position: "absolute",
          left: SIDEBAR_W,
          top: 30,
          transform: `translateX(${sidebarOpen ? 0 : -SIDEBAR_W}px)`,
          transition: "transform 300ms ease",
          zIndex: 20,
        }}
        className="w-4 h-8 rounded-r-md bg-primary/60 text-white flex items-center justify-center shadow-sm hover:bg-primary/80 transition-colors cursor-pointer shrink-0"
      >
        {sidebarOpen ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
      </button>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Page header */}
        <div className="px-6 pb-3 flex items-center gap-4" style={{ paddingTop: 15 }}>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {activePipeline.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activePipeline.category} ·{" "}
              {activePipeline.columns.reduce((s, c) => s + c.leadIds.length, 0)} negócios
            </p>
          </div>

          {/* Seletor "Visualizando como:" — apenas admins */}
          {isAdmin && teamMembers.length > 0 && (
            <div ref={viewPickerRef} className="relative flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">Visualizando como:</span>
              <button
                onClick={() => setViewPickerOpen(v => !v)}
                className="flex items-center gap-1.5 h-[30px] px-3 rounded-lg border bg-card text-xs transition-colors hover:bg-secondary"
                style={{
                  borderColor: viewPickerOpen ? "hsl(var(--primary))" : "hsl(var(--card-border))",
                  color: viewAsUser.length > 0 ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                {viewAsUser.length === 0 ? (
                  <span>Todos os leads</span>
                ) : viewAsUser.length === 1 && viewAsUser[0] === "__no_responsible__" ? (
                  <span>Sem responsável</span>
                ) : viewAsUser.length === 1 ? (
                  <>
                    {memberAvatars[viewAsUser[0]] ? (
                      <img src={memberAvatars[viewAsUser[0]]} alt={viewAsUser[0]} className="rounded-full object-cover shrink-0" style={{ width: 18, height: 18 }} />
                    ) : (
                      <div className="rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ width: 18, height: 18, background: memberColors[viewAsUser[0]] ?? "#AAAAAA", fontSize: 9 }}>
                        {viewAsUser[0][0].toUpperCase()}
                      </div>
                    )}
                    <span className="max-w-[120px] truncate">{viewAsUser[0]}</span>
                  </>
                ) : (
                  <span>{viewAsUser.length} selecionados</span>
                )}
                <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
              </button>

              {viewPickerOpen && (
                <div
                  className="absolute bg-card border border-card-border shadow-lg z-[200] overflow-hidden"
                  style={{ top: "calc(100% + 6px)", right: 0, width: 210, borderRadius: 12, maxHeight: 300, overflowY: "auto" }}
                >
                  <div className="px-3 py-2 border-b border-card-border">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Visualizando como</span>
                  </div>
                  <button
                    onClick={() => setViewAsUser([])}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center justify-center rounded shrink-0" style={{ width: 15, height: 15, border: viewAsUser.length === 0 ? "2px solid hsl(var(--primary))" : "1.5px solid #CCCCCC", background: viewAsUser.length === 0 ? "hsl(var(--primary))" : "transparent" }}>
                      {viewAsUser.length === 0 && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span className="text-xs" style={{ fontWeight: viewAsUser.length === 0 ? 600 : 400 }}>Todos os leads</span>
                  </button>
                  <button
                    onClick={() => toggleViewAsUser("__no_responsible__")}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center justify-center rounded shrink-0" style={{ width: 15, height: 15, border: viewAsUser.includes("__no_responsible__") ? "2px solid hsl(var(--primary))" : "1.5px solid #CCCCCC", background: viewAsUser.includes("__no_responsible__") ? "hsl(var(--primary))" : "transparent" }}>
                      {viewAsUser.includes("__no_responsible__") && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span className="text-xs" style={{ fontWeight: viewAsUser.includes("__no_responsible__") ? 600 : 400 }}>Sem responsável</span>
                  </button>
                  {teamMembers.map(name => {
                    const selected = viewAsUser.includes(name);
                    const avatar = memberAvatars[name];
                    const color = memberColors[name] ?? "#AAAAAA";
                    return (
                      <button key={name} onClick={() => toggleViewAsUser(name)} className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors hover:bg-muted">
                        <div className="flex items-center justify-center rounded shrink-0" style={{ width: 15, height: 15, border: selected ? `2px solid ${color}` : "1.5px solid #CCCCCC", background: selected ? color : "transparent" }}>
                          {selected && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        {avatar ? (
                          <img src={avatar} alt={name} className="rounded-full object-cover shrink-0" style={{ width: 22, height: 22 }} />
                        ) : (
                          <div className="rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ width: 22, height: 22, background: color, fontSize: 9 }}>{name[0].toUpperCase()}</div>
                        )}
                        <span className="text-xs truncate flex-1" style={{ color: "#111111", fontWeight: selected ? 600 : 400 }}>
                          {name}{name === myName ? " (você)" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center rounded-lg border border-card-border bg-card hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground shrink-0"
                style={{ width: 32, height: 32 }}
                aria-label="Opções da pipeline"
              >
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={openEditPipeline} className="py-2.5">
                <Pencil size={14} className="mr-3 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Editar Pipeline</div>
                  <div className="text-xs text-muted-foreground">Edite, configure ou exclua sua pipeline</div>
                </div>
              </DropdownMenuItem>
              {isPipelineAdmin && (
                <DropdownMenuItem className="py-2.5" onClick={openPermissions}>
                  <ShieldCheck size={14} className="mr-3 shrink-0" />
                  <div>
                    <div className="font-medium text-sm">Permissões da pipeline</div>
                    <div className="text-xs text-muted-foreground">Configure o acesso dos atendentes</div>
                  </div>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="py-2.5 text-destructive focus:text-destructive"
                onClick={() => setConfirmDeletePipeline(true)}
              >
                <Trash2 size={14} className="mr-3 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Remover pipeline</div>
                  <div className="text-xs opacity-70">Exclui etapas e negócios</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filters bar */}
        <div className="px-6 pb-[7px] flex flex-nowrap items-center gap-2 overflow-x-auto">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, empresa, telefone ou #"
              className="pl-8 h-[30px] w-64 bg-card border-card-border rounded-lg text-xs focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Ordenação</span>
            <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-[30px] w-[135px] bg-card border-card-border rounded-lg text-xs focus:ring-0 focus:ring-offset-0 focus:border-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="oldest">Mais antigos</SelectItem>
                <SelectItem value="value">Valor</SelectItem>
                <SelectItem value="name">Nome</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Status</span>
            <Select value={status} onValueChange={v => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-[30px] w-[115px] bg-card border-card-border rounded-lg text-xs focus:ring-0 focus:ring-offset-0 focus:border-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                <SelectItem value="open">Em aberto</SelectItem>
                <SelectItem value="won">Ganho</SelectItem>
                <SelectItem value="lost">Perdido</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Data</span>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChangeRange={(from, to) => { setDateFrom(from); setDateTo(to); }}
            />
          </div>

          <PipelineFilterPanel value={advFilter} onApply={setAdvFilter} />

          {(!isFilterEmpty(advFilter) || status !== "open" || !!dateFrom || !!dateTo) && (
            <button
              onClick={() => { setAdvFilter({}); setStatus("open"); setDateFrom(""); setDateTo(""); }}
              title="Limpar filtros"
              className="h-[30px] px-2.5 inline-flex items-center gap-1 bg-card border border-card-border rounded-lg text-xs text-muted-foreground hover:text-destructive hover:border-destructive transition-colors whitespace-nowrap"
            >
              <X size={13} />
              Limpar
            </button>
          )}

        </div>

        {/* Kanban */}
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="kanban-columns" direction="horizontal" type="COLUMN">
            {(colsProvided) => (
              <div
                ref={colsProvided.innerRef}
                {...colsProvided.droppableProps}
                className="flex gap-3 overflow-x-auto flex-1 px-4 pb-4 pt-[7px] bg-background"
              >
                {filteredColumns.map((col, colIndex) => {
                  const totalValue = col.filteredIds.reduce(
                    (s, id) => s + (leads[id]?.value || 0),
                    0
                  );
                  return (
                    <Draggable draggableId={`col-${col.id}`} index={colIndex} key={col.id}>
                      {(colDrag) => (
                        <div
                          ref={colDrag.innerRef}
                          {...colDrag.draggableProps}
                          className="h-full"
                        >
                          <Droppable droppableId={col.id} key={col.id}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`min-w-[280px] w-[280px] h-full flex flex-col rounded-xl border border-card-border bg-card shadow-elev-1 transition-colors ${
                                  snapshot.isDraggingOver ? "bg-[#F8F9FA]" : ""
                                }`}
                              >
                                {/* Top color line */}
                                <div
                                  className="h-1 w-full rounded-t-lg"
                                  style={{ backgroundColor: col.color }}
                                />
                                {/* Header */}
                                <div className="flex items-start justify-between px-3 py-3">
                                  <div className="flex items-start gap-2 min-w-0 flex-1">
                                    <Popover
                                      open={colorPickerColId === col.id}
                                      onOpenChange={o => setColorPickerColId(o ? col.id : null)}
                                    >
                                      <PopoverTrigger asChild>
                                        <button
                                          onClick={e => e.stopPropagation()}
                                          className="mt-[3px] shrink-0 rounded-full ring-offset-background transition-all hover:ring-2 hover:ring-offset-1 hover:ring-border"
                                          style={{ width: 13, height: 13, background: col.color }}
                                          aria-label="Cor da etapa"
                                        />
                                      </PopoverTrigger>
                                      <PopoverContent align="start" side="bottom" className="w-auto p-2.5">
                                        <div className="grid grid-cols-5 gap-1.5">
                                          {COLUMN_COLORS.map(c => (
                                            <button
                                              key={c}
                                              onClick={() => {
                                                updateColumn(activePipeline.id, col.id, { color: c });
                                                setColorPickerColId(null);
                                              }}
                                              className="rounded-full transition-transform hover:scale-110 focus:outline-none"
                                              style={{
                                                width: 22,
                                                height: 22,
                                                background: c,
                                                boxShadow: col.color === c ? `0 0 0 2px white, 0 0 0 3.5px ${c}` : undefined,
                                              }}
                                              aria-label={c}
                                            />
                                          ))}
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                    <div className="min-w-0">
                                      <h3 className="truncate" style={{ fontSize: 14, fontWeight: 600, color: "#111111" }}>
                                        {col.title}
                                      </h3>
                                      <p className="mt-0.5 whitespace-nowrap" style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                                        {formatCurrency(totalValue)} · {col.filteredIds.length}{" "}
                                        {col.filteredIds.length === 1 ? "negócio" : "negócios"}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          className="text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors w-7 h-7 flex items-center justify-center"
                                          aria-label="Opções da etapa"
                                        >
                                          <MoreHorizontal size={16} />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem onClick={() => setRenamingCol({ id: col.id, title: col.title })}>
                                          <Pencil size={14} className="mr-2" /> Renomear etapa
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => setDeletingCol({ id: col.id, title: col.title, count: col.leadIds.length })}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 size={14} className="mr-2" /> Excluir etapa
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <button
                                      {...colDrag.dragHandleProps}
                                      className="text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors w-7 h-7 flex items-center justify-center cursor-grab active:cursor-grabbing"
                                      aria-label="Arrastar coluna"
                                    >
                                      <GripVertical size={15} />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto min-h-0">
                                  {col.filteredIds.map((leadId, index) => {
                                    const lead = leads[leadId];
                                    if (!lead) return null;
                                    const leadResps = lead.responsibles?.length ? lead.responsibles : (lead.responsible ? [lead.responsible] : []);
                                    const respColor = memberColors[lead.responsible] || "#888888";
                                    return (
                                      <Draggable
                                        key={leadId}
                                        draggableId={leadId}
                                        index={index}
                                      >
                                        {(prov, snap) => (
                                          <div
                                            ref={prov.innerRef}
                                            {...prov.draggableProps}
                                            {...prov.dragHandleProps}
                                            onClick={() => navigate(`/pipeline/lead/${leadId}`)}
                                            className={`bg-card border border-card-border rounded-xl p-3 cursor-pointer shadow-elev-1 hover:shadow-elev-2 hover:border-border transition-all ${
                                              snap.isDragging ? "shadow-elev-2 rotate-1" : ""
                                            } ${lead.dealStatus === "won" ? "glow-closed" : ""}`}
                                          >
                                            {/* Avatar + Name + Company + deal number */}
                                            <div className="flex items-center gap-2 mb-1.5">
                                              <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-semibold text-xs"
                                                style={{ backgroundColor: col.color }}
                                              >
                                                {lead.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("")}
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-foreground leading-tight truncate">
                                                  {lead.name}
                                                </p>
                                                {lead.company && (
                                                  <p className="text-xs text-muted-foreground truncate">
                                                    {lead.company}
                                                  </p>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-1 shrink-0">
                                                {lead.dealStatus === "won" && (
                                                  <Trophy size={12} style={{ color: "#128A68" }} />
                                                )}
                                                {lead.dealStatus === "lost" && (
                                                  <XCircle size={12} style={{ color: "#E24B4A" }} />
                                                )}
                                                <span className="text-[10px] font-mono text-muted-foreground">
                                                  #{lead.dealNumber}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Responsáveis — multi-select via popover */}
                                            <Popover
                                              open={myPerms.blockChangeAttendant ? false : respPopoverLeadId === leadId}
                                              onOpenChange={open => !myPerms.blockChangeAttendant && setRespPopoverLeadId(open ? leadId : null)}
                                            >
                                              <PopoverTrigger asChild>
                                                <button
                                                  type="button"
                                                  onClick={e => e.stopPropagation()}
                                                  onMouseDown={e => e.stopPropagation()}
                                                  disabled={myPerms.blockChangeAttendant}
                                                  className="flex items-center gap-1.5 w-full text-left rounded-md px-1 -mx-1 py-0.5 mt-2 hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                  style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                                                >
                                                  {leadResps.length === 0 ? (
                                                    <>
                                                      <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-white" style={{ fontSize: 8, fontWeight: 700, backgroundColor: "#AAAAAA" }}>S</div>
                                                      <span>Sem responsável</span>
                                                    </>
                                                  ) : (
                                                    <>
                                                      {/* Avatares empilhados (máx 3) */}
                                                      <div className="flex items-center shrink-0" style={{ gap: 0 }}>
                                                        {leadResps.slice(0, 3).map((name, idx) => {
                                                          const av = memberAvatars[name];
                                                          const cl = memberColors[name] ?? "#AAAAAA";
                                                          return av ? (
                                                            <img key={name} src={av} alt={name} title={name} className="rounded-full object-cover" style={{ width: 16, height: 16, marginLeft: idx > 0 ? -4 : 0, outline: "1.5px solid hsl(var(--card))", zIndex: 3 - idx }} />
                                                          ) : (
                                                            <div key={name} title={name} className="rounded-full flex items-center justify-center text-white shrink-0" style={{ width: 16, height: 16, background: cl, fontSize: 7, fontWeight: 700, marginLeft: idx > 0 ? -4 : 0, outline: "1.5px solid hsl(var(--card))", zIndex: 3 - idx }}>
                                                              {name[0].toUpperCase()}
                                                            </div>
                                                          );
                                                        })}
                                                        {leadResps.length > 3 && (
                                                          <div className="rounded-full flex items-center justify-center font-semibold" style={{ width: 16, height: 16, background: "#E5E5E5", color: "#555", fontSize: 7, marginLeft: -4, outline: "1.5px solid hsl(var(--card))" }}>
                                                            +{leadResps.length - 3}
                                                          </div>
                                                        )}
                                                      </div>
                                                      <span className="truncate flex-1">
                                                        {leadResps.length === 1 ? leadResps[0] : `${leadResps.length} responsáveis`}
                                                      </span>
                                                    </>
                                                  )}
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent
                                                side="bottom"
                                                align="start"
                                                className="p-0 w-52 overflow-hidden"
                                                style={{ borderRadius: 12, zIndex: 200 }}
                                                onClick={e => e.stopPropagation()}
                                                onMouseDown={e => e.stopPropagation()}
                                              >
                                                <div className="px-3 py-2 border-b border-card-border flex items-center justify-between">
                                                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Responsáveis</span>
                                                  {leadResps.length > 0 && (
                                                    <button
                                                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                                                      onClick={e => { e.stopPropagation(); updateLead(leadId, { responsibles: [], responsible: "" }); setRespPopoverLeadId(null); }}
                                                    >
                                                      Limpar
                                                    </button>
                                                  )}
                                                </div>
                                                {teamMembers.map(name => {
                                                  const selected = leadResps.includes(name);
                                                  const avatar = memberAvatars[name];
                                                  const color = memberColors[name] ?? "#AAAAAA";
                                                  return (
                                                    <button
                                                      key={name}
                                                      className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                                                      style={{ background: selected ? `${color}14` : undefined }}
                                                      onClick={e => {
                                                        e.stopPropagation();
                                                        const next = selected
                                                          ? leadResps.filter(r => r !== name)
                                                          : [...leadResps, name];
                                                        updateLead(leadId, { responsibles: next, responsible: next[0] ?? "" });
                                                      }}
                                                    >
                                                      <div className="flex items-center justify-center rounded shrink-0" style={{ width: 14, height: 14, border: selected ? `2px solid ${color}` : "1.5px solid #CCCCCC", background: selected ? color : "transparent" }}>
                                                        {selected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                                      </div>
                                                      {avatar ? (
                                                        <img src={avatar} alt={name} className="rounded-full object-cover shrink-0" style={{ width: 20, height: 20 }} />
                                                      ) : (
                                                        <div className="rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ width: 20, height: 20, background: color, fontSize: 9 }}>{name[0].toUpperCase()}</div>
                                                      )}
                                                      <span className="text-xs truncate flex-1" style={{ fontWeight: selected ? 600 : 400 }}>{name}</span>
                                                    </button>
                                                  );
                                                })}
                                              </PopoverContent>
                                            </Popover>

                                            {/* Value */}
                                            <div className="mt-2">
                                              <span className="text-sm font-semibold text-primary">
                                                {formatCurrency(lead.value)}
                                              </span>
                                            </div>

                                            {/* Entry date */}
                                            {lead.entryDate && (
                                              <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                                                <Calendar size={11} />
                                                {new Date(lead.entryDate + "T00:00:00").toLocaleDateString("pt-BR")}
                                              </div>
                                            )}

                                            {/* Próxima atividade + WhatsApp */}
                                            <div className="flex items-center justify-between mt-0.5">
                                              {(() => {
                                                const next = (lead.activities ?? [])
                                                  .filter(a => a.scheduledAt && !a.completedAt && new Date(a.scheduledAt) > new Date())
                                                  .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];
                                                return next ? (
                                                  <div className="flex items-center gap-1" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                                                    <CalendarClock size={11} />
                                                    {new Date(next.scheduledAt!).toLocaleDateString("pt-BR")}
                                                  </div>
                                                ) : <div />;
                                              })()}
                                              {zapiInstances.length === 0 && lead.whatsapp ? (
                                                // Sem conexão mas tem número → abre WhatsApp Web direto
                                                <button
                                                  onClick={e => {
                                                    e.stopPropagation();
                                                    window.open(`https://wa.me/${lead.whatsapp!.replace(/\D/g, "")}`, "_blank");
                                                  }}
                                                  className="flex items-center justify-center transition-colors hover:bg-muted"
                                                  style={{ width: 24, height: 24, borderRadius: 6 }}
                                                  aria-label="Abrir no WhatsApp Web"
                                                >
                                                  <WhatsAppIcon size={18} />
                                                </button>
                                              ) : (
                                                // Tem conexão ativa OU sem número → popover
                                                <Popover
                                                  open={wpPopoverLeadId === leadId}
                                                  onOpenChange={open => setWpPopoverLeadId(open ? leadId : null)}
                                                >
                                                  <PopoverTrigger asChild>
                                                    <button
                                                      onClick={e => {
                                                        e.stopPropagation();
                                                        setWpPopoverLeadId(wpPopoverLeadId === leadId ? null : leadId);
                                                      }}
                                                      className="flex items-center justify-center transition-colors hover:bg-muted"
                                                      style={{ width: 24, height: 24, borderRadius: 6 }}
                                                      aria-label="Abrir chat WhatsApp"
                                                    >
                                                      <WhatsAppIcon size={18} />
                                                    </button>
                                                  </PopoverTrigger>
                                                  <PopoverContent
                                                    className="w-60 p-3"
                                                    align="end"
                                                    onClick={e => e.stopPropagation()}
                                                  >
                                                    <p className="text-xs font-semibold text-[#111] mb-3">Enviar via WhatsApp</p>
                                                    {zapiInstances.length > 0 ? (
                                                      <div className="space-y-2">
                                                        {zapiInstances.map(inst => (
                                                          <label key={inst.instanceId} className="flex items-center gap-2 cursor-pointer">
                                                            <input
                                                              type="radio"
                                                              name={`wp-inst-${leadId}`}
                                                              checked={selectedZapiInstance === inst.instanceId}
                                                              onChange={() => setSelectedZapiInstance(inst.instanceId)}
                                                              className="accent-[#128A68]"
                                                            />
                                                            <span className="text-xs text-[#535353]">{inst.label}</span>
                                                          </label>
                                                        ))}
                                                        <Button
                                                          size="sm"
                                                          className="w-full bg-[#128A68] hover:bg-[#128A68]/90 h-7 text-xs mt-1"
                                                          onClick={e => {
                                                            e.stopPropagation();
                                                            openChat(leadId);
                                                            setWpPopoverLeadId(null);
                                                          }}
                                                        >
                                                          Abrir chat
                                                        </Button>
                                                      </div>
                                                    ) : (
                                                      <div className="space-y-2">
                                                        <p className="text-xs text-[#AAAAAA]">Adicione um número de telefone ao lead para contato via WhatsApp.</p>
                                                      </div>
                                                    )}
                                                  </PopoverContent>
                                                </Popover>
                                              )}
                                            </div>

                                            {/* Footer: tags + tag button */}
                                            <div className="flex items-center mt-3 pt-2 border-t border-card-border gap-1">
                                              <div className="flex items-center gap-1 flex-1 min-w-0">
                                                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                                                  {(lead.tags || []).map(tagName => {
                                                    const t = crmTags.find(x => x.name === tagName);
                                                    if (!t) return null;
                                                    return (
                                                      <span
                                                        key={tagName}
                                                        className="text-[10px] px-1.5 rounded-full text-white font-medium whitespace-nowrap"
                                                        style={{ paddingTop: 2, paddingBottom: 2, background: t.color || "#888" }}
                                                      >
                                                        {tagName}
                                                      </span>
                                                    );
                                                  })}
                                                </div>
                                                <DropdownMenu>
                                                  <DropdownMenuTrigger asChild>
                                                    <button
                                                      onClick={e => e.stopPropagation()}
                                                      className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
                                                      style={{ width: 22, height: 22 }}
                                                      aria-label="Gerenciar tags"
                                                    >
                                                      <TagIcon size={13} />
                                                    </button>
                                                  </DropdownMenuTrigger>
                                                  <DropdownMenuContent align="end" className="w-44">
                                                    {crmTags.length === 0 && (
                                                      <div className="px-3 py-2 text-xs text-muted-foreground">
                                                        Crie tags em Configurações.
                                                      </div>
                                                    )}
                                                    {crmTags.map(t => {
                                                      const has = (lead.tags || []).includes(t.name);
                                                      return (
                                                        <DropdownMenuItem
                                                          key={t.id}
                                                          onClick={e => {
                                                            e.stopPropagation();
                                                            const current = lead.tags || [];
                                                            const next = has
                                                              ? current.filter(x => x !== t.name)
                                                              : [...current, t.name];
                                                            updateLead(leadId, { tags: next });
                                                          }}
                                                        >
                                                          <span
                                                            className="inline-block w-2 h-2 rounded-full mr-2 shrink-0"
                                                            style={{ background: t.color }}
                                                          />
                                                          <span className="flex-1">{t.name}</span>
                                                          {has && <span className="text-xs text-primary">✓</span>}
                                                        </DropdownMenuItem>
                                                      );
                                                    })}
                                                  </DropdownMenuContent>
                                                </DropdownMenu>
                                              </div>
                                            </div>
                                            {(lead.dealStatus === "won" || lead.dealStatus === "lost") && (
                                              <div
                                                className="flex items-center justify-center gap-1.5 -mx-3 -mb-3 mt-3 py-1.5 rounded-b-xl text-xs font-semibold"
                                                style={
                                                  lead.dealStatus === "won"
                                                    ? { background: "#DCFCE7", color: "#128A68" }
                                                    : { background: "#FEE2E2", color: "#E24B4A" }
                                                }
                                              >
                                                {lead.dealStatus === "won"
                                                  ? <><Trophy size={11} /><span>Ganho</span></>
                                                  : <><XCircle size={11} /><span>Perdido</span></>}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </Draggable>
                                    );
                                  })}
                                  {provided.placeholder}
                                  {col.filteredIds.length === 0 && (
                                    <div className="text-center py-8 text-muted-foreground text-xs">
                                      Nenhum negócio nesta etapa
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </Droppable>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {colsProvided.placeholder}

                {/* Add column tile */}
                <button
                  onClick={() => {
                    setNewColumnName("");
                    setShowNewColumn(true);
                  }}
                  className="min-w-[280px] w-[280px] rounded-xl flex items-center justify-center text-sm transition-colors"
                  style={{
                    backgroundColor: "hsl(var(--muted))",
                    border: "1px dashed hsl(var(--border))",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  <Plus size={16} className="mr-1.5" /> Nova coluna
                </button>
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <LeadDrawer
          leadId={selectedLeadId}
          open={!!selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />


        {/* Confirmação de avanço de etapa */}
        {pendingAdvance && (() => {
          const pa = pendingAdvance;
          const totalMoves = pa.steps.length - 1;
          const currentCol = pa.steps[pa.currentStep];
          const nextCol = pa.steps[pa.currentStep + 1];
          const finalCol = pa.steps[pa.steps.length - 1];
          const isSkipping = totalMoves > 1;
          const stepsLeft = totalMoves - pa.currentStep;
          return (
            <AlertDialog open onOpenChange={(open) => !open && handleCancelAdvance()}>
              <AlertDialogContent className="max-w-[380px] p-0 overflow-hidden gap-0">
                {/* Header */}
                <div className="px-5 pt-5 pb-3">
                  <AlertDialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                    Confirmar avanço de etapa
                  </AlertDialogTitle>
                  <AlertDialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {isSkipping ? (
                      <>
                        Mover <strong className="text-foreground font-medium">{pa.leadName}</strong> para{" "}
                        <strong className="text-foreground font-medium">{nextCol?.colTitle}</strong>
                        {stepsLeft > 1 && <span className="text-muted-foreground/70"> ({stepsLeft} confirmações até {finalCol?.colTitle})</span>}
                        .
                      </>
                    ) : (
                      <>
                        Mover <strong className="text-foreground font-medium">{pa.leadName}</strong> para{" "}
                        <strong className="text-foreground font-medium">{nextCol?.colTitle}</strong>?
                      </>
                    )}
                  </AlertDialogDescription>
                </div>

                {/* Stepper compacto — de → para */}
                <div className="px-5 pb-4">
                  <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 flex items-center gap-2 min-w-0">
                    {/* Etapa atual */}
                    <div className="flex flex-col items-center gap-1 min-w-0 shrink-0 max-w-[120px]">
                      <span className="text-[11px] text-muted-foreground/50 truncate w-full text-center">{currentCol?.colTitle}</span>
                      <span className="block h-[2px] w-full rounded-full bg-muted-foreground/20" />
                    </div>
                    <ChevronRight className="h-3 w-3 text-primary/60 shrink-0" />
                    {/* Próxima etapa */}
                    <div className="flex flex-col items-center gap-1 min-w-0 shrink-0 max-w-[120px]">
                      <span className="text-[11px] text-primary font-semibold truncate w-full text-center">{nextCol?.colTitle}</span>
                      <span className="block h-[2px] w-full rounded-full bg-primary" />
                    </div>
                    {/* Etapas restantes */}
                    {stepsLeft > 1 && (
                      <>
                        <span className="text-[10px] text-muted-foreground/30 shrink-0">→ ···</span>
                        <div className="flex flex-col items-center gap-1 min-w-0 shrink-0 max-w-[100px]">
                          <span className="text-[11px] text-muted-foreground/30 truncate w-full text-center">{finalCol?.colTitle}</span>
                          <span className="block h-[2px] w-full rounded-full bg-transparent" />
                        </div>
                      </>
                    )}
                    {/* Contador */}
                    {totalMoves > 1 && (
                      <span className="ml-auto text-[10px] text-muted-foreground/40 shrink-0 whitespace-nowrap">
                        {pa.currentStep + 1}/{totalMoves}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-muted/20">
                  <AlertDialogCancel onClick={handleCancelAdvance} className="h-8 px-3 text-xs">Cancelar</AlertDialogCancel>
                  <Button onClick={handleConfirmAdvance} size="sm" className="h-8 px-4 text-xs gap-1.5">
                    Confirmar <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          );
        })()}

        {/* Rename column */}
        <Dialog open={!!renamingCol} onOpenChange={(o) => !o && setRenamingCol(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Renomear etapa</DialogTitle>
            </DialogHeader>
            <Input
              value={renamingCol?.title || ""}
              onChange={(e) => setRenamingCol(prev => prev ? { ...prev, title: e.target.value } : prev)}
              placeholder="Nome da etapa"
              className="rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
            />
            <DialogFooter>
              <Button variant="outline" className="rounded-lg" onClick={() => setRenamingCol(null)}>
                Cancelar
              </Button>
              <Button
                className="rounded-lg"
                onClick={() => {
                  if (!renamingCol || !renamingCol.title.trim()) {
                    toast.error("Informe um nome.");
                    return;
                  }
                  updateColumn(activePipeline.id, renamingCol.id, { title: renamingCol.title.trim() });
                  toast.success("Etapa renomeada.");
                  setRenamingCol(null);
                }}
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete column */}
        <AlertDialog open={!!deletingCol} onOpenChange={(o) => !o && setDeletingCol(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir etapa "{deletingCol?.title}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {deletingCol && deletingCol.count > 0
                  ? `Esta etapa contém ${deletingCol.count} negócio(s). Eles serão removidos da pipeline.`
                  : "Esta ação não pode ser desfeita."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (!deletingCol) return;
                  deleteColumn(activePipeline.id, deletingCol.id);
                  toast.success("Etapa excluída.");
                  setDeletingCol(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* New column */}
        <Dialog open={showNewColumn} onOpenChange={setShowNewColumn}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova coluna</DialogTitle>
            </DialogHeader>
            <Input
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Ex: Aguardando assinatura"
              className="rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
            />
            <DialogFooter>
              <Button variant="outline" className="rounded-lg" onClick={() => setShowNewColumn(false)}>
                Cancelar
              </Button>
              <Button
                className="rounded-lg"
                onClick={() => {
                  const name = newColumnName.trim();
                  if (!name) {
                    toast.error("Informe um nome.");
                    return;
                  }
                  const id = `col-${Date.now()}`;
                  addColumn(activePipeline.id, { id, title: name, color: "#AAAAAA" });
                  toast.success("Coluna criada.");
                  setShowNewColumn(false);
                }}
              >
                Criar coluna
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm delete pipeline */}
        <AlertDialog open={confirmDeletePipeline} onOpenChange={(o) => !o && setConfirmDeletePipeline(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover pipeline "{activePipeline.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Ao remover uma pipeline você perderá todas as etapas e negócios associados a ela. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeletePipeline}
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Edit pipeline dialog */}
        <Dialog open={showEditPipeline} onOpenChange={(o) => !o && setShowEditPipeline(false)}>
          <DialogContent className="p-0 overflow-hidden gap-0" style={{ maxWidth: editPipelineTab === "atendentes" ? 780 : 672 }}>
            <div className="flex" style={{ height: 520 }}>
              {/* Left sidebar — nav */}
              <div className="flex flex-col border-r bg-muted/30 shrink-0" style={{ width: 176, padding: 12 }}>
                <p className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  {activePipeline.name}
                </p>
                <button
                  onClick={() => setEditPipelineTab("config")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                    editPipelineTab === "config"
                      ? "bg-background shadow-sm font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  }`}
                >
                  <Settings size={14} className="shrink-0" /> Configurações
                </button>
                {isPipelineAdmin && (
                  <button
                    onClick={() => { setEditPipelineTab("atendentes"); setSelectedPermAttendant(null); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                      editPipelineTab === "atendentes"
                        ? "bg-background shadow-sm font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                    }`}
                  >
                    <ShieldCheck size={14} className="shrink-0" /> Permissões
                  </button>
                )}
              </div>

              {/* Center — attendant list (only when on Permissões tab) */}
              {editPipelineTab === "atendentes" && (
                <div className="flex flex-col border-r bg-muted/10 shrink-0 overflow-y-auto" style={{ width: 188 }}>
                  <p className="px-3 pt-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
                    Atendentes
                  </p>
                  {teamMembers.length === 0 ? (
                    <div className="px-3 py-8 text-xs text-muted-foreground text-center">
                      Nenhum atendente encontrado
                    </div>
                  ) : (
                    teamMembers.map(name => {
                      const avatar = memberAvatars[name];
                      const color = memberColors[name] ?? "#AAAAAA";
                      const perms = attendantPerms[name] ?? {};
                      const hasActivePerms = Object.values(perms).some(Boolean);
                      const isSelected = selectedPermAttendant === name;
                      return (
                        <button
                          key={name}
                          onClick={() => setSelectedPermAttendant(name)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                            isSelected ? "bg-primary/8 border-r-2 border-primary" : "hover:bg-muted/60"
                          }`}
                        >
                          {avatar ? (
                            <img src={avatar} alt={name} className="rounded-full object-cover shrink-0" style={{ width: 28, height: 28 }} />
                          ) : (
                            <div className="rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ width: 28, height: 28, background: color, fontSize: 11 }}>
                              {name[0].toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm truncate flex-1" style={{ fontWeight: isSelected ? 600 : 400, color: "hsl(var(--foreground))" }}>
                            {name}
                          </span>
                          {hasActivePerms && (
                            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary" title="Possui permissões configuradas" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Right content */}
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex-1 overflow-y-auto p-6">
                  {editPipelineTab === "config" && (
                    <div className="space-y-5">
                      <div>
                        <Label className="text-sm font-medium">Nome</Label>
                        <Input
                          value={editPipelineName}
                          onChange={e => setEditPipelineName(e.target.value)}
                          placeholder="Nome da pipeline"
                          className="mt-1.5 rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Descrição</Label>
                        <Textarea
                          value={editPipelineDesc}
                          onChange={e => setEditPipelineDesc(e.target.value)}
                          placeholder="Descreva o propósito desta pipeline"
                          className="mt-1.5 rounded-lg resize-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                          rows={3}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm font-medium">Grupo</Label>
                          {!creatingGroup && (
                            <button
                              onClick={() => setCreatingGroup(true)}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Plus size={12} /> Criar
                            </button>
                          )}
                        </div>
                        {creatingGroup && (
                          <div className="flex gap-2 mb-3">
                            <Input
                              value={newGroupName}
                              onChange={e => setNewGroupName(e.target.value)}
                              placeholder="Nome do grupo"
                              className="rounded-lg h-8 text-sm flex-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                              onKeyDown={async e => {
                                if (e.key === "Enter") {
                                  if (!newGroupName.trim()) return;
                                  const ok = await addPipelineGroup(newGroupName.trim());
                                  if (ok) {
                                    setEditPipelineGroup(newGroupName.trim());
                                    setNewGroupName("");
                                    setCreatingGroup(false);
                                    toast.success("Grupo criado.");
                                  }
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              className="h-8 rounded-lg"
                              onClick={async () => {
                                if (!newGroupName.trim()) { toast.error("Informe um nome."); return; }
                                const ok = await addPipelineGroup(newGroupName.trim());
                                if (ok) {
                                  setEditPipelineGroup(newGroupName.trim());
                                  setNewGroupName("");
                                  setCreatingGroup(false);
                                  toast.success("Grupo criado.");
                                }
                              }}
                            >
                              Criar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => { setCreatingGroup(false); setNewGroupName(""); }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {pipelineGroups.map(g => (
                            <button
                              key={g.id}
                              onClick={() => setEditPipelineGroup(g.name)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border transition-colors ${
                                editPipelineGroup === g.name
                                  ? "border-primary bg-primary/5 text-foreground"
                                  : "border-card-border bg-card text-foreground hover:bg-muted/50"
                              }`}
                            >
                              <span className="font-medium">{g.name}</span>
                              {g.createdBy && (
                                <span className="text-xs text-muted-foreground truncate ml-2">{g.createdBy}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Danger zone */}
                      <div className="pt-5 mt-2 border-t border-card-border">
                        <p className="text-sm font-semibold text-destructive mb-1">Remover pipeline</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Ao remover uma pipeline você perderá todas as etapas e negócios associados a ela.
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="rounded-lg"
                          onClick={() => setConfirmDeletePipeline(true)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  )}
                  {editPipelineTab === "atendentes" && !selectedPermAttendant && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                      <ShieldCheck size={32} className="mb-3 opacity-20" />
                      <p className="text-sm font-medium">Selecione um atendente</p>
                      <p className="text-xs mt-1 max-w-[200px]">Escolha um atendente ao lado para configurar as permissões</p>
                    </div>
                  )}
                  {editPipelineTab === "atendentes" && selectedPermAttendant && (() => {
                    const perms = attendantPerms[selectedPermAttendant] ?? {};
                    return (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                          Permissões — {selectedPermAttendant}
                        </p>

                        <div className="flex items-start justify-between gap-4 py-3 border-b border-card-border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Bloquear visualização do pipeline</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Impede que o atendente visualize e tenha acesso ao pipeline</p>
                          </div>
                          <Switch
                            checked={perms.blockViewPipeline ?? false}
                            onCheckedChange={v => setAttendantPerm("blockViewPipeline", v)}
                            className="shrink-0 mt-0.5"
                          />
                        </div>

                        <div className="flex items-start justify-between gap-4 py-3 border-b border-card-border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Bloquear alteração do atendente</p>
                            <p className="text-xs text-muted-foreground mt-0.5">O atendente não poderá alterar o responsável pelo negócio</p>
                          </div>
                          <Switch
                            checked={perms.blockChangeAttendant ?? false}
                            onCheckedChange={v => setAttendantPerm("blockChangeAttendant", v)}
                            className="shrink-0 mt-0.5"
                          />
                        </div>

                        <div className="flex items-start justify-between gap-4 py-3 border-b border-card-border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Visualizar apenas os negócios do atendente</p>
                            <p className="text-xs text-muted-foreground mt-0.5">O atendente verá apenas os negócios atribuídos a ele</p>
                          </div>
                          <Switch
                            checked={perms.viewOwnDealsOnly ?? false}
                            onCheckedChange={v => setAttendantPerm("viewOwnDealsOnly", v)}
                            className="shrink-0 mt-0.5"
                          />
                        </div>

                        <div className="flex items-start justify-between gap-4 py-3 border-b border-card-border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Bloquear exclusão de negócios</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Impede que o atendente exclua negócios</p>
                          </div>
                          <Switch
                            checked={perms.blockDeleteDeals ?? false}
                            onCheckedChange={v => setAttendantPerm("blockDeleteDeals", v)}
                            className="shrink-0 mt-0.5"
                          />
                        </div>

                        <div className="flex items-start justify-between gap-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Bloquear criação de negócios</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Impede que o atendente crie novos negócios</p>
                          </div>
                          <Switch
                            checked={perms.blockCreateDeals ?? false}
                            onCheckedChange={v => setAttendantPerm("blockCreateDeals", v)}
                            className="shrink-0 mt-0.5"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="border-t px-6 py-4 flex justify-end gap-2">
                  <Button variant="outline" className="rounded-lg" onClick={() => setShowEditPipeline(false)}>
                    Cancelar
                  </Button>
                  <Button className="rounded-lg" onClick={handleSaveEditPipeline}>
                    Salvar alterações
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
