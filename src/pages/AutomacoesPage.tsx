import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronLeft,
  Play, Zap, Power, Minus, Maximize2, ArrowLeft, ArrowRight,
  Save, Pencil, Copy, Download, Upload, Trash2,
  Briefcase, User, MessageCircle, Instagram, Globe, Settings,
  Calendar, Filter, LayoutGrid, X, CheckCircle2,
  Clock, Shuffle, Bot, Code2, Sliders, Mic, Paperclip, Link2, AlignLeft, HelpCircle, StickyNote, Palette,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerConfig = { categoryId: string; triggerId: string; label: string; description: string };

type ActionNodeType = "mensagem" | "acoes" | "condicoes" | "espera" | "randomizador" | "api" | "campos" | "ia" | "javascript";

type SubBlockType = "mensagem_texto" | "entrada_usuario" | "atraso_tempo" | "mensagem_audio" | "arquivo_anexo" | "arquivo_url";

type SubBlock = {
  id: string;
  type: SubBlockType;
  text?: string;
  delaySeconds?: number;
  fileUrl?: string;
};

type CanvasNode = {
  id: string;
  type: "start" | "note" | ActionNodeType;
  x: number; y: number;
  label: string;
  trigger?: TriggerConfig | null;
  parentId?: string | null;
  subBlocks?: SubBlock[];
  noteText?: string;
  noteColorIndex?: number;
  width?: number;
  height?: number;
};

type AutomationRecord = {
  id: string;
  name: string;
  description: string;
  group_name: string;
  active: boolean;
  flow: { nodes: CanvasNode[]; trigger: TriggerConfig | null };
  created_at: string;
};

// ─── Static data ──────────────────────────────────────────────────────────────

const TRIGGER_CATEGORIES = [
  {
    id: "negocios", label: "Negócios", icon: Briefcase,
    description: "Adicione gatilhos para ações nos seus negócios",
    triggers: [
      { id: "neg_movido",        label: "Negócio movido",                    description: "Quando um negócio é movido para a etapa" },
      { id: "neg_criado",        label: "Negócio criado",                    description: "Quando um negócio é criado em uma etapa." },
      { id: "atend_atribuido",   label: "Atendente atribuído ao negócio",    description: "Quando um atendente é atribuído a um negócio" },
      { id: "atend_retirado",    label: "Atendente retirado do negócio",     description: "Quando um atendente é retirado do negócio" },
      { id: "neg_ganho",         label: "Negócio ganho",                     description: "Quando um negócio é marcado como ganho" },
      { id: "neg_perdido",       label: "Negócio perdido",                   description: "Quando um negócio é marcado como perdido" },
      { id: "neg_restaurado",    label: "Situação do negócio restaurada",    description: "Quando a situação do negócio é restaurada" },
    ],
  },
  {
    id: "leads", label: "Leads", icon: User,
    description: "Adicione gatilhos para ações em leads",
    triggers: [
      { id: "lead_manual",       label: "Execução manual da automação por lead ou contato", description: "Permite executar a automação manualmente a partir de uma seleção ou filtros de leads" },
      { id: "tag_removida",      label: "Tag removida do lead",              description: "Quando uma tag é removida do lead" },
      { id: "tag_adicionada",    label: "Tag adicionada ao lead",            description: "Quando uma tag é adicionada ao lead" },
      { id: "lead_criado",       label: "Lead criado",                       description: "Quando um lead é criado" },
      { id: "lead_qtd_ganhos",   label: "Lead atingir uma quantidade definida de negócios ganhos", description: "Dispara quando o lead alcançar o número especificado de negócios ganhos" },
      { id: "lead_valor_ganhos", label: "Lead ultrapassar um valor definido de negócios ganhos",   description: "Dispara quando o lead ultrapassar o valor especificado de negócios ganhos" },
      { id: "lead_sem_compra",   label: "Lead não realiza compras nos últimos dias",               description: "Dispara quando o lead não realiza compras nos últimos dias" },
    ],
  },
  {
    id: "mensagens", label: "Mensagens", icon: MessageCircle,
    description: "Adicione gatilhos para ações em mensagens",
    triggers: [
      { id: "msg_recebida",      label: "Mensagem recebida",    description: "Quando uma mensagem é recebida" },
      { id: "msg_enviada",       label: "Mensagem enviada",     description: "Quando uma mensagem é enviada" },
      { id: "atend_finalizado",  label: "Atendimento finalizado", description: "Quando um atendimento é finalizado" },
      { id: "atend_iniciado",    label: "Atendimento iniciado", description: "Quando um atendimento é iniciado" },
      { id: "dep_alterado",      label: "Departamento Alterado", description: "Quando um departamento é alterado na conversa" },
    ],
  },
  {
    id: "instagram", label: "Instagram", icon: Instagram,
    description: "Adicione gatilhos para ações no Instagram (exceto mensagens)",
    triggers: [
      { id: "ig_comentario",     label: "Comentário do Instagram recebido",      description: "Quando um comentário do Instagram é recebido" },
      { id: "ig_live",           label: "Comentário em live do Instagram recebido", description: "Quando um comentário em live do Instagram é recebido" },
    ],
  },
  {
    id: "facebook", label: "Facebook", icon: Globe,
    description: "Adicione gatilhos para ações no Facebook (exceto mensagens)",
    triggers: [
      { id: "fb_comentario",     label: "Comentário do Facebook recebido",      description: "Quando um comentário do Facebook é recebido" },
      { id: "fb_live",           label: "Comentário em live do Facebook recebido", description: "Quando um comentário em live do Facebook é recebido" },
    ],
  },
  {
    id: "campos", label: "Campos", icon: LayoutGrid,
    description: "Adicione gatilhos para alterações em campos do sistema ou campos adicionais",
    triggers: [
      { id: "campo_alterado",    label: "Campo alterado", description: "Quando um campo do lead ou negócio é alterado" },
    ],
  },
  {
    id: "http", label: "HTTP", icon: Globe,
    description: "Adicione gatilhos por chamadas HTTP",
    triggers: [
      { id: "http_webhook",      label: "Requisição HTTP (Webhook)", description: "Quando uma requisição HTTP é recebida" },
    ],
  },
  {
    id: "sistema", label: "Sistema", icon: Settings,
    description: "Adicione gatilhos para ações no sistema",
    triggers: [
      { id: "outra_automacao",   label: "Iniciado por outra automação", description: "Quando a automação é iniciada por outra automação" },
      { id: "mcp_tool",          label: "MCP Server Tool",              description: "Trigger acionada quando um agente de IA chama uma tool via MCP" },
      { id: "agendado",          label: "Execução Agendada",            description: "Dispara a automação em um intervalo de tempo fixo" },
    ],
  },
  {
    id: "atividades", label: "Atividades", icon: Calendar,
    description: "Adicione gatilhos para ações em atividades",
    triggers: [
      { id: "atividade_exec",    label: "Atividade executada", description: "Quando uma atividade com automação é executada" },
    ],
  },
];

const ACTION_TYPES = [
  { id: "mensagem",     label: "Mensagem",             icon: MessageCircle, color: "#0EA5E9" },
  { id: "acoes",        label: "Ações",                icon: Zap,           color: "#F97316" },
  { id: "condicoes",    label: "Condições",            icon: Filter,        color: "#8B5CF6" },
  { id: "espera",       label: "Espera",               icon: Clock,         color: "#3B82F6" },
  { id: "randomizador", label: "Randomizador",         icon: Shuffle,       color: "#F97316" },
  { id: "api",          label: "API",                  icon: Globe,         color: "#3B82F6" },
  { id: "campos",       label: "Operações de campos",  icon: Sliders,       color: "#22C55E" },
  { id: "ia",           label: "IA",                   icon: Bot,           color: "#8B5CF6" },
  { id: "javascript",   label: "JavaScript",           icon: Code2,         color: "#3B82F6" },
] as const;

const NOTE_COLORS = [
  { bg: "#FEFCE8", header: "#FEF08A", border: "#FDE047", borderSel: "#EAB308", text: "#713F12", headerText: "#854D0E" },
  { bg: "#EFF6FF", header: "#BFDBFE", border: "#93C5FD", borderSel: "#3B82F6", text: "#1E40AF", headerText: "#1D4ED8" },
  { bg: "#F0FDF4", header: "#BBF7D0", border: "#86EFAC", borderSel: "#22C55E", text: "#14532D", headerText: "#166534" },
  { bg: "#FDF2F8", header: "#F9A8D4", border: "#F472B6", borderSel: "#EC4899", text: "#831843", headerText: "#9D174D" },
  { bg: "#FFF7ED", header: "#FED7AA", border: "#FDBA74", borderSel: "#F97316", text: "#7C2D12", headerText: "#9A3412" },
  { bg: "#FAF5FF", header: "#DDD6FE", border: "#C4B5FD", borderSel: "#8B5CF6", text: "#4C1D95", headerText: "#5B21B6" },
];

const START_NODE: CanvasNode = { id: "n1", type: "start", x: 80, y: 80, label: "Início", trigger: null };

// ─── Main component ────────────────────────────────────────────────────────────

export default function AutomacoesPage() {
  const { user } = useAuth();
  const { company } = useCompany();

  // Navigation
  const [view, setView]         = useState<"list" | "editor">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Data
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [loading, setLoading]   = useState(true);

  // Sidebar
  const [search, setSearch]             = useState("");
  const [openGroups, setOpenGroups]     = useState<Record<string, boolean>>({});
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // Modals
  const [createOpen, setCreateOpen]     = useState(false);
  const [triggerOpen, setTriggerOpen]   = useState(false);
  const [renameOpen, setRenameOpen]     = useState(false);
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [listSearch, setListSearch]     = useState("");

  // Create form
  const [newName, setNewName]           = useState("");
  const [newDesc, setNewDesc]           = useState("");
  const [newGroup, setNewGroup]         = useState("Automação");
  const [startType, setStartType]       = useState<"blank" | "import" | "model">("blank");
  const [creating, setCreating]         = useState(false);

  // Rename form
  const [renameName, setRenameName]     = useState("");

  // Canvas (editor)
  const [nodes, setNodes]               = useState<CanvasNode[]>([START_NODE]);
  const [trigger, setTrigger]           = useState<TriggerConfig | null>(null);
  const [zoom, setZoom]                 = useState(1);
  const [pan, setPan]                   = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedTriggerCat, setSelectedTriggerCat] = useState(TRIGGER_CATEGORIES[0].id);
  const [saving, setSaving]             = useState(false);
  const [addNodeMenu, setAddNodeMenu]   = useState<{ fromNodeId: string; x: number; y: number } | null>(null);
  const [portDragLine, setPortDragLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [nodePanel, setNodePanel]       = useState<string | null>(null);

  const canvasRef    = useRef<HTMLDivElement>(null);
  const panRef       = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const fileRef      = useRef<HTMLInputElement>(null);
  const portDragRef  = useRef<{ fromNodeId: string; startX: number; startY: number } | null>(null);
  const nodeDragRef  = useRef<{ nodeId: string; startX: number; startY: number; baseX: number; baseY: number; hasDragged: boolean; onSelect: () => void } | null>(null);
  const resizeDragRef = useRef<{ nodeId: string; startX: number; startY: number; baseW: number; baseH: number } | null>(null);
  // Always-fresh refs to avoid stale closures in mouse event handlers
  const stateRef = useRef({ pan, zoom, nodes });
  stateRef.current = { pan, zoom, nodes };

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar automações");
    else {
      setAutomations((data ?? []) as AutomationRecord[]);
      // Open first group by default
      const groups = [...new Set((data ?? []).map((a: AutomationRecord) => a.group_name))];
      if (groups.length > 0) setOpenGroups({ [groups[0]]: true });
    }
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const map: Record<string, AutomationRecord[]> = {};
    automations.forEach(a => {
      if (!map[a.group_name]) map[a.group_name] = [];
      map[a.group_name].push(a);
    });
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  }, [automations]);

  const filteredGroups = useMemo(() =>
    groups.map(g => ({
      ...g,
      items: g.items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    })).filter(g => !search || g.items.length > 0),
  [groups, search]);

  const filteredAutomations = useMemo(() =>
    automations.filter(a => a.name.toLowerCase().includes(listSearch.toLowerCase())),
  [automations, listSearch]);

  const selectedAutomation = automations.find(a => a.id === selectedId) ?? null;

  // ── Editor helpers ────────────────────────────────────────────────────────

  const openEditor = useCallback((id: string) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return;
    const flow = auto.flow ?? { nodes: [START_NODE], trigger: null };
    const n = flow.nodes?.length ? flow.nodes : [START_NODE];
    setNodes(n);
    setTrigger(flow.trigger ?? null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
    setSelectedId(id);
    setView("editor");
  }, [automations]);

  // ── Canvas interactions ───────────────────────────────────────────────────

  const startPortDrag = (e: React.MouseEvent, fromNodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    portDragRef.current = { fromNodeId, startX: e.clientX, startY: e.clientY };
  };

  const onNodeDragStart = (e: React.MouseEvent, nodeId: string, onSelectFn: () => void) => {
    if ((e.target as HTMLElement).closest("[data-port]")) return;
    if ((e.target as HTMLElement).closest("[data-resize-handle]")) return;
    e.stopPropagation();
    const node = stateRef.current.nodes.find(n => n.id === nodeId);
    if (!node) return;
    nodeDragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, baseX: node.x, baseY: node.y, hasDragged: false, onSelect: onSelectFn };
  };

  const onNodeResizeStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const node = stateRef.current.nodes.find(n => n.id === nodeId);
    if (!node) return;
    resizeDragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, baseW: node.width ?? 220, baseH: node.height ?? 140 };
  };

  const handleAddNode = (type: string, label: string) => {
    if (!addNodeMenu) return;
    const newNode: CanvasNode = {
      id: `n${Date.now()}`,
      type: type as ActionNodeType,
      x: addNodeMenu.x,
      y: addNodeMenu.y,
      label,
      parentId: addNodeMenu.fromNodeId,
      subBlocks: [],
    };
    setNodes(prev => [...prev, newNode]);
    setAddNodeMenu(null);
  };

  const addSubBlock = (nodeId: string, type: SubBlockType) => {
    const newBlock: SubBlock = { id: `sb${Date.now()}`, type };
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, subBlocks: [...(n.subBlocks ?? []), newBlock] } : n));
  };

  const removeSubBlock = (nodeId: string, blockId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, subBlocks: (n.subBlocks ?? []).filter(b => b.id !== blockId) } : n));
  };

  const updateSubBlock = (nodeId: string, blockId: string, data: Partial<SubBlock>) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, subBlocks: (n.subBlocks ?? []).map(b => b.id === blockId ? { ...b, ...data } : b) } : n));
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-port]")) return;
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
    setSelectedNode(null);
    setAddNodeMenu(null);
    setNodePanel(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Port drag: draw the connecting line
      if (portDragRef.current && canvasRef.current) {
        const { pan, zoom } = stateRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const portEl = canvasRef.current.querySelector(
          `[data-port][data-from-node="${portDragRef.current.fromNodeId}"]`
        ) as HTMLElement | null;
        if (portEl) {
          const portRect = portEl.getBoundingClientRect();
          const x1 = (portRect.left + portRect.width / 2 - rect.left - pan.x) / zoom;
          const y1 = (portRect.top + portRect.height / 2 - rect.top - pan.y) / zoom;
          const x2 = (e.clientX - rect.left - pan.x) / zoom;
          const y2 = (e.clientY - rect.top - pan.y) / zoom;
          setPortDragLine({ x1, y1, x2, y2 });
        }
        return;
      }
      // Resize drag: resize a note node
      if (resizeDragRef.current) {
        const { zoom } = stateRef.current;
        const dx = e.clientX - resizeDragRef.current.startX;
        const dy = e.clientY - resizeDragRef.current.startY;
        const nodeId = resizeDragRef.current.nodeId;
        const newW = Math.max(160, resizeDragRef.current.baseW + dx / zoom);
        const newH = Math.max(110, resizeDragRef.current.baseH + dy / zoom);
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newW, height: newH } : n));
        return;
      }
      // Node drag: move the node
      if (nodeDragRef.current) {
        const { zoom } = stateRef.current;
        const dx = e.clientX - nodeDragRef.current.startX;
        const dy = e.clientY - nodeDragRef.current.startY;
        if (Math.sqrt(dx * dx + dy * dy) > 4) {
          nodeDragRef.current.hasDragged = true;
          const nodeId = nodeDragRef.current.nodeId;
          const newX = nodeDragRef.current.baseX + dx / zoom;
          const newY = nodeDragRef.current.baseY + dy / zoom;
          setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x: newX, y: newY } : n));
        }
        return;
      }
      if (!panRef.current) return;
      setPan({ x: panRef.current.baseX + e.clientX - panRef.current.startX, y: panRef.current.baseY + e.clientY - panRef.current.startY });
    };
    const onUp = (e: MouseEvent) => {
      // Port drag end: show block selection popup at drop position
      if (portDragRef.current && canvasRef.current) {
        const { pan, zoom, nodes } = stateRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = e.clientX - portDragRef.current.startX;
        const dy = e.clientY - portDragRef.current.startY;
        const isDrag = Math.sqrt(dx * dx + dy * dy) > 30;
        const fromNodeId = portDragRef.current.fromNodeId;
        portDragRef.current = null;
        setPortDragLine(null);
        if (isDrag) {
          const dropX = (e.clientX - rect.left - pan.x) / zoom;
          const dropY = (e.clientY - rect.top - pan.y) / zoom;
          setAddNodeMenu({ fromNodeId, x: dropX, y: dropY });
        } else {
          const fromNode = nodes.find(n => n.id === fromNodeId);
          if (fromNode) setAddNodeMenu({ fromNodeId, x: fromNode.x + 322, y: fromNode.y + 50 });
        }
        return;
      }
      // Resize drag end
      if (resizeDragRef.current) {
        resizeDragRef.current = null;
        return;
      }
      // Node drag end: if no real drag occurred, treat as a click (select)
      if (nodeDragRef.current) {
        const { hasDragged, onSelect } = nodeDragRef.current;
        nodeDragRef.current = null;
        if (!hasDragged) onSelect();
        return;
      }
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(z => Math.max(0.4, Math.min(2, z + delta)));
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Informe um nome"); return; }
    if (!user || !company) return;
    if (startType !== "blank") { toast.info("Em breve"); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("automations")
        .insert({
          owner_id: user.id,
          company_id: company.id,
          name: newName.trim(),
          description: newDesc.trim(),
          group_name: newGroup.trim() || "Automação",
          active: false,
          flow: { nodes: [START_NODE], trigger: null },
        })
        .select()
        .single();
      if (error) throw error;
      const rec = data as AutomationRecord;
      setAutomations(prev => [rec, ...prev]);
      setCreateOpen(false);
      setNewName(""); setNewDesc(""); setNewGroup("Automação"); setStartType("blank");
      toast.success("Automação criada");
      openEditor(rec.id);
    } catch {
      toast.error("Erro ao criar automação");
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const updatedNodes = nodes.map(n => n.id === "n1" ? { ...n, trigger } : n);
      const { error } = await supabase
        .from("automations")
        .update({ flow: { nodes: updatedNodes, trigger }, updated_at: new Date().toISOString() })
        .eq("id", selectedId);
      if (error) throw error;
      setAutomations(prev => prev.map(a => a.id === selectedId ? { ...a, flow: { nodes: updatedNodes, trigger } } : a));
      toast.success("Automação salva");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("automations").update({ active }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, active } : a));
    toast.success(active ? "Automação ativada" : "Automação desativada");
  };

  const handleRename = async () => {
    if (!renameName.trim() || !selectedId) return;
    const { error } = await supabase.from("automations").update({ name: renameName.trim() }).eq("id", selectedId);
    if (error) { toast.error("Erro ao renomear"); return; }
    setAutomations(prev => prev.map(a => a.id === selectedId ? { ...a, name: renameName.trim() } : a));
    setRenameOpen(false);
    toast.success("Nome atualizado");
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const { error } = await supabase.from("automations").delete().eq("id", selectedId);
    if (error) { toast.error("Erro ao excluir"); return; }
    setAutomations(prev => prev.filter(a => a.id !== selectedId));
    setDeleteOpen(false);
    setView("list");
    setSelectedId(null);
    toast.success("Automação excluída");
  };

  const handleDuplicate = async () => {
    if (!selectedAutomation || !user || !company) return;
    const { data, error } = await supabase
      .from("automations")
      .insert({
        owner_id: user.id,
        company_id: company.id,
        name: `${selectedAutomation.name} (cópia)`,
        description: selectedAutomation.description,
        group_name: selectedAutomation.group_name,
        active: false,
        flow: selectedAutomation.flow,
      })
      .select().single();
    if (error) { toast.error("Erro ao duplicar"); return; }
    setAutomations(prev => [data as AutomationRecord, ...prev]);
    toast.success("Automação duplicada");
  };

  const handleDownload = () => {
    if (!selectedAutomation) return;
    const blob = new Blob([JSON.stringify(selectedAutomation.flow, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${selectedAutomation.name}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const flow = JSON.parse(ev.target?.result as string);
        setNodes(flow.nodes ?? [START_NODE]);
        setTrigger(flow.trigger ?? null);
        toast.success("Fluxo importado — salve para persistir");
      } catch {
        toast.error("Arquivo inválido");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSelectTrigger = (cat: typeof TRIGGER_CATEGORIES[0], t: typeof TRIGGER_CATEGORIES[0]["triggers"][0]) => {
    const cfg: TriggerConfig = { categoryId: cat.id, triggerId: t.id, label: t.label, description: t.description };
    setTrigger(cfg);
    setNodes(prev => prev.map(n => n.id === "n1" ? { ...n, trigger: cfg } : n));
    setTriggerOpen(false);
    toast.success(`Gatilho "${t.label}" adicionado`);
  };

  // ─── SIDEBAR (shared) ────────────────────────────────────────────────────────

  const Sidebar = () => (
    <>
      {!leftCollapsed ? (
        <aside style={{ width: 240, minWidth: 240, background: "#FFFFFF", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", position: "relative", zIndex: 2, flexShrink: 0 }}>
          <div style={{ padding: 12, borderBottom: "0.5px solid #E5E5E5" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar automação..."
                style={{ width: "100%", background: "#F9FAFB", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: "8px 32px 8px 30px", fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
              <Power
                size={14}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", cursor: "pointer" }}
                title="Filtrar por estado"
              />
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              style={{ width: "100%", marginTop: 8, background: "hsl(var(--primary))", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
            >
              <Plus size={14} /> Adicionar automação
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>Carregando...</div>
            ) : filteredGroups.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>Nenhuma automação</div>
            ) : filteredGroups.map(g => {
              const open = openGroups[g.name] ?? false;
              return (
                <div key={g.name}>
                  <button
                    onClick={() => setOpenGroups(s => ({ ...s, [g.name]: !open }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6B7280", letterSpacing: 0.3 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {g.name}
                    </span>
                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>{g.items.length}</span>
                  </button>
                  {open && g.items.map(item => {
                    const sel = selectedId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => openEditor(item.id)}
                        className="group"
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: sel ? "#F0FDF4" : "transparent", borderLeft: sel ? "3px solid hsl(var(--primary))" : "3px solid transparent", cursor: "pointer" }}
                      >
                        <Zap size={14} color="hsl(var(--primary))" />
                        <span style={{ flex: 1, fontSize: 13, color: "#111111", fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </span>
                        <Switch
                          checked={item.active}
                          onCheckedChange={(v) => { toggleActive(item.id, v); }}
                          onClick={(e) => e.stopPropagation()}
                          className="scale-75"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setLeftCollapsed(true)}
            style={{ position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", background: "#FFFFFF", border: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
          >
            <ChevronLeft size={14} color="#6B7280" />
          </button>
        </aside>
      ) : (
        <button
          onClick={() => setLeftCollapsed(false)}
          style={{ width: 24, height: 60, alignSelf: "center", background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderLeft: "none", borderRadius: "0 8px 8px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <ChevronRight size={14} color="#6B7280" />
        </button>
      )}
    </>
  );

  // ─── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "#F4F6F8", overflow: "hidden" }}>
      {/* Left sidebar — always visible */}
      <Sidebar />

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {view === "list" && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "20px 28px 0", background: "#F4F6F8" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111111", margin: 0 }}>Fluxo de automações</h1>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <div style={{ display: "flex", gap: 0 }}>
                <button style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#111111", background: "#FFFFFF", border: "none", borderBottom: "2px solid hsl(var(--primary))", cursor: "pointer" }}>
                  Minhas Automações
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Pesquisar..."
                  style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: "7px 12px 7px 30px", fontSize: 12, outline: "none", width: 200 }}
                />
              </div>
            </div>
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {/* Create card */}
                <div style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 260 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#111111" }}>Criar nova automação</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4, lineHeight: 1.5 }}>
                      Crie sua nova automação e aumente seus resultados. Lembre-se, não há limites para sua criatividade.
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {groups.slice(0, 5).map((g, i) => (
                      <button
                        key={g.name}
                        onClick={() => { setNewGroup(g.name); setCreateOpen(true); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "0.5px solid #E5E5E5", borderRadius: 8, background: i === 0 ? "hsl(var(--primary))" : "#FFFFFF", color: i === 0 ? "#FFFFFF" : "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
                      >
                        <Zap size={13} color={i === 0 ? "#FFFFFF" : "hsl(var(--primary))"} />
                        {g.name}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCreateOpen(true)}
                    style={{ marginTop: "auto", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "hsl(var(--primary))", fontSize: 12, fontWeight: 600, padding: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Criar nova automação
                  </button>
                </div>

                {/* Automation cards */}
                {filteredAutomations.map(auto => (
                  <div key={auto.id} style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 200 }}>
                    {/* Mini canvas preview */}
                    <div style={{ height: 120, background: "#F8FAFC", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ opacity: 0.15, fontSize: 10, color: "#374151", transform: "scale(0.35)", transformOrigin: "center", pointerEvents: "none", userSelect: "none" }}>
                        <div style={{ background: "#FFFFFF", border: "1px dashed #CCCCCC", borderRadius: 8, padding: "8px 12px", width: 200 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                            <Play size={10} fill="hsl(var(--primary))" color="hsl(var(--primary))" />
                            <span style={{ fontSize: 11, fontWeight: 700 }}>Início</span>
                          </div>
                          {auto.flow?.trigger ? (
                            <div style={{ fontSize: 9, color: "#374151" }}>{auto.flow.trigger.label}</div>
                          ) : (
                            <div style={{ fontSize: 9, color: "#9CA3AF" }}>Sem gatilho</div>
                          )}
                        </div>
                      </div>
                      {auto.active && (
                        <div style={{ position: "absolute", top: 8, right: 8, background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4 }}>
                          Ativo
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auto.name}</div>
                      <button
                        onClick={() => openEditor(auto.id)}
                        style={{ marginTop: "auto", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "#374151", fontSize: 12, fontWeight: 500, padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.color = "hsl(var(--primary))"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.color = "#374151"; }}
                      >
                        <ArrowRight size={13} /> Abrir automação
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── EDITOR VIEW ────────────────────────────────────────────────────── */}
      {view === "editor" && selectedAutomation && (
        <section style={{ flex: 1, position: "relative", overflow: "hidden", background: "#F4F6F8", backgroundImage: "radial-gradient(circle, rgba(210,210,210,0.7) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>

          {/* Edit panel overlay — aparece sobre o canvas, à direita do sidebar */}
          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "mensagem" && (
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", zIndex: 25, display: "flex", pointerEvents: "none" }}>
              <div style={{ pointerEvents: "all" }}>
                <MensagemPanel
                  node={nodes.find(n => n.id === nodePanel)!}
                  onClose={() => setNodePanel(null)}
                  onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
                  onDuplicate={() => {
                    const n = nodes.find(x => x.id === nodePanel);
                    if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]);
                  }}
                  addSubBlock={(type) => addSubBlock(nodePanel, type)}
                  removeSubBlock={(blockId) => removeSubBlock(nodePanel, blockId)}
                  updateSubBlock={(blockId, data) => updateSubBlock(nodePanel, blockId, data)}
                />
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "#FFFFFF", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 4, zIndex: 20 }}>
            {/* Active toggle */}
            <button
              onClick={() => toggleActive(selectedAutomation.id, !selectedAutomation.active)}
              title={selectedAutomation.active ? "Desativar" : "Ativar"}
              style={{ width: 32, height: 32, borderRadius: 8, background: selectedAutomation.active ? "#DCFCE7" : "transparent", border: "none", color: selectedAutomation.active ? "#15803D" : "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={e => !selectedAutomation.active && (e.currentTarget.style.background = "#F3F4F6")}
              onMouseLeave={e => !selectedAutomation.active && (e.currentTarget.style.background = "transparent")}
            >
              <Power size={15} />
            </button>
            <div style={{ width: 1, background: "#E5E5E5", height: 20, margin: "0 2px" }} />
            {[
              { icon: Save,     label: saving ? "Salvando..." : "Salvar",    action: handleSave },
              { icon: Pencil,   label: "Renomear",   action: () => { setRenameName(selectedAutomation.name); setRenameOpen(true); } },
              { icon: Copy,     label: "Duplicar",   action: handleDuplicate },
              { icon: Download, label: "Exportar",   action: handleDownload },
              { icon: Upload,   label: "Importar",   action: () => fileRef.current?.click() },
            ].map((t, i) => {
              const Icon = t.icon;
              return (
                <button key={i} title={t.label} onClick={t.action}
                  style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Icon size={15} />
                </button>
              );
            })}
            <div style={{ width: 1, background: "#E5E5E5", height: 20, margin: "0 2px" }} />
            <button title="Excluir" onClick={() => setDeleteOpen(true)}
              style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = "#FEE2E2"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* Automation name badge */}
          <div style={{ position: "absolute", top: 16, left: 16, background: "#FFFFFF", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#374151", zIndex: 20, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedAutomation.name}
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            onMouseDown={onCanvasMouseDown}
            onWheel={onWheel}
            onDragOver={(e) => e.preventDefault()}
            style={{ position: "absolute", inset: 0, cursor: "grab" }}
          >
            <div style={{ position: "absolute", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
              {/* SVG connection lines */}
              <svg style={{ position: "absolute", top: 0, left: 0, width: 9999, height: 9999, overflow: "visible", pointerEvents: "none" }}>
                {nodes.filter(n => n.parentId).map(n => {
                  const parent = nodes.find(p => p.id === n.parentId);
                  if (!parent) return null;
                  const x1 = parent.type === "start" ? parent.x + 244 : parent.x + 248;
                  const y1 = parent.type === "start" ? parent.y + 158 : parent.y + 110;
                  const x2 = n.x, y2 = n.y + 40;
                  return <path key={n.id} d={`M ${x1} ${y1} C ${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`} stroke="#CCCCCC" strokeWidth={1.5} fill="none" strokeDasharray="5,4" />;
                })}
                {/* Live drag line */}
                {portDragLine && (
                  <path
                    d={`M ${portDragLine.x1} ${portDragLine.y1} C ${portDragLine.x1 + 60} ${portDragLine.y1} ${portDragLine.x2 - 60} ${portDragLine.y2} ${portDragLine.x2} ${portDragLine.y2}`}
                    stroke="#378ADD" strokeWidth={2} fill="none" strokeDasharray="5,4"
                  />
                )}
              </svg>

              {/* Nodes */}
              {nodes.map(n => {
                if (n.type === "start") return (
                  <StartNode
                    key={n.id}
                    node={{ ...n, trigger: n.id === "n1" ? trigger : n.trigger }}
                    selected={selectedNode === n.id}
                    onSelect={() => setSelectedNode(n.id)}
                    onAddTrigger={() => setTriggerOpen(true)}
                    onPortDragStart={(e) => startPortDrag(e, n.id)}
                    onDragStart={(e) => onNodeDragStart(e, n.id, () => setSelectedNode(n.id))}
                  />
                );
                if (n.type === "note") return (
                  <NoteNode
                    key={n.id}
                    node={n}
                    selected={selectedNode === n.id}
                    onDragStart={(e) => onNodeDragStart(e, n.id, () => setSelectedNode(n.id))}
                    onResizeStart={(e) => onNodeResizeStart(e, n.id)}
                    onDelete={() => { setNodes(prev => prev.filter(x => x.id !== n.id)); setSelectedNode(null); }}
                    onUpdateText={(text) => setNodes(prev => prev.map(x => x.id === n.id ? { ...x, noteText: text } : x))}
                    onUpdateColor={(colorIndex) => setNodes(prev => prev.map(x => x.id === n.id ? { ...x, noteColorIndex: colorIndex } : x))}
                  />
                );
                return (
                  <ActionNode
                    key={n.id}
                    node={n}
                    selected={selectedNode === n.id}
                    onSelect={() => { setSelectedNode(n.id); if (n.type === "mensagem") setNodePanel(n.id); }}
                    onPortDragStart={(e) => startPortDrag(e, n.id)}
                    onDragStart={(e) => onNodeDragStart(e, n.id, () => { setSelectedNode(n.id); if (n.type === "mensagem") setNodePanel(n.id); })}
                    onDelete={() => { setNodes(prev => prev.filter(x => x.id !== n.id)); setSelectedNode(null); if (nodePanel === n.id) setNodePanel(null); }}
                    onDuplicate={() => setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }])}
                    onAddNote={() => setNodes(prev => [...prev, { id: `note${Date.now()}`, type: "note", x: n.x + 300, y: n.y, label: "Anotação", noteText: "", width: 220, height: 140 }])}
                  />
                );
              })}

              {/* Add node popup — appears at drop position */}
              {addNodeMenu && (
                <div
                  data-node
                  style={{ position: "absolute", left: addNodeMenu.x, top: addNodeMenu.y, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 12, padding: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", width: 220, zIndex: 30 }}
                  onClick={e => e.stopPropagation()}
                >
                  {ACTION_TYPES.map(at => {
                    const Icon = at.icon;
                    return (
                      <button
                        key={at.id}
                        onClick={() => handleAddNode(at.id, at.label)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 13, color: "#111111" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <Icon size={16} color={at.color} />
                        {at.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Zoom controls */}
          <div style={{ position: "absolute", right: 16, bottom: 60, display: "flex", flexDirection: "column", gap: 4, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} style={zoomBtn}><Plus size={14} /></button>
            <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} style={zoomBtn}><Minus size={14} /></button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={zoomBtn}><Maximize2 size={14} /></button>
          </div>

          {/* Nav arrows */}
          <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
            <button onClick={() => setView("list")} style={zoomBtn} title="Voltar à lista"><ArrowLeft size={14} /></button>
            <button style={zoomBtn}><ArrowRight size={14} /></button>
          </div>

          {/* Hidden file input for import */}
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        </section>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Criar nova automação</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label className="text-xs font-medium">Nome</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome da automação"
                className="mt-1"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Descrição</Label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Descrição da automação"
                className="mt-1 resize-none"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Grupo</Label>
              <Input
                value={newGroup}
                onChange={e => setNewGroup(e.target.value)}
                placeholder="Ex: Automação"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-medium mb-2 block">Como você deseja começar?</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { id: "blank" as const,  label: "Em branco",  desc: "Comece do zero e crie sua automação personalizada",   icon: LayoutGrid },
                  { id: "import" as const, label: "Importar",   desc: "Importe uma automação existente",                     icon: Upload },
                  { id: "model" as const,  label: "Modelo",     desc: "Use um modelo pré-configurado",                       icon: Copy },
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStartType(opt.id)}
                      style={{ border: `1.5px solid ${startType === opt.id ? "hsl(var(--primary))" : "#E5E5E5"}`, borderRadius: 10, padding: "10px 8px", background: startType === opt.id ? "hsl(var(--primary) / 0.04)" : "#FFFFFF", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}
                    >
                      <Icon size={18} color={startType === opt.id ? "hsl(var(--primary))" : "#6B7280"} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{opt.label}</span>
                      <span style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.4 }}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Criando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trigger panel */}
      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent style={{ maxWidth: 620, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 480 }}>
            {/* Category list */}
            <div style={{ width: 160, borderRight: "0.5px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
              <div style={{ padding: "0 12px 12px", fontSize: 13, fontWeight: 600, color: "#111111" }}>Adicionar gatilho</div>
              {TRIGGER_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const sel = selectedTriggerCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedTriggerCat(cat.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: sel ? "#F0FDF4" : "transparent", border: "none", borderLeft: sel ? "2px solid hsl(var(--primary))" : "2px solid transparent", cursor: "pointer", fontSize: 12, color: sel ? "hsl(var(--primary))" : "#374151", fontWeight: sel ? 600 : 400, textAlign: "left" }}
                  >
                    <Icon size={14} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
            {/* Trigger list */}
            <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
              {(() => {
                const cat = TRIGGER_CATEGORIES.find(c => c.id === selectedTriggerCat)!;
                return (
                  <>
                    <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700, color: "#111111" }}>{cat.label}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{cat.description}</div>
                    {trigger && trigger.categoryId === cat.id && (
                      <div style={{ marginBottom: 12, padding: "6px 10px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, fontSize: 11, color: "#15803D", display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={12} /> Gatilho atual: {trigger.label}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {cat.triggers.map(t => (
                        <button
                          key={t.id}
                          onClick={() => handleSelectTrigger(cat, t)}
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.background = "#F0FDF4"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.background = "#FFFFFF"; }}
                        >
                          <ArrowRight size={14} color="hsl(var(--primary))" style={{ marginTop: 1, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{t.label}</div>
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{t.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
            <button
              onClick={() => setTriggerOpen(false)}
              style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}
            >
              <X size={16} />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename modal */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Renomear automação</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs font-medium">Nome</Label>
            <Input value={renameName} onChange={e => setRenameName(e.target.value)} className="mt-1" onKeyDown={e => e.key === "Enter" && handleRename()} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={handleRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir automação</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A automação "{selectedAutomation?.name}" será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const zoomBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none",
  color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

function StartNode({ node, selected, onSelect, onAddTrigger, onPortDragStart, onDragStart }: {
  node: CanvasNode & { trigger?: TriggerConfig | null };
  selected: boolean;
  onSelect: () => void;
  onAddTrigger: () => void;
  onPortDragStart: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      data-node
      onMouseDown={onDragStart}
      style={{
        position: "absolute", left: node.x, top: node.y, width: 260,
        zIndex: 2,
        background: "#FFFFFF",
        border: `${selected ? 2 : 1.5}px dashed ${selected ? "hsl(var(--primary))" : "#CCCCCC"}`,
        borderRadius: 12, padding: 14, cursor: "grab",
        boxShadow: selected ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: "0.5px solid #E5E5E5" }}>
        <Play size={14} fill="hsl(var(--primary))" color="hsl(var(--primary))" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Início</span>
      </div>
      <div style={{ paddingTop: 10 }}>
        {node.trigger ? (
          <div style={{ padding: "8px 10px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}>{node.trigger.label}</div>
            <div style={{ fontSize: 11, color: "#4ADE80", marginTop: 2 }}>{node.trigger.description}</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, lineHeight: 1.5 }}>
            O gatilho é responsável por acionar a automação. Clique para adicionar um gatilho:
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAddTrigger(); }}
          style={{ width: "100%", border: "1px dashed #CCCCCC", background: "transparent", color: "#6B7280", fontSize: 12, padding: "6px", borderRadius: 6, cursor: "pointer", marginTop: 4 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.color = "hsl(var(--primary))"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#CCCCCC"; e.currentTarget.style.color = "#6B7280"; }}
        >
          {node.trigger ? "Alterar gatilho" : "+ Adicionar gatilho"}
        </button>
        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Quando o evento ocorrer, então</span>
          <div
            data-port
            data-from-node={node.id}
            title="Arraste para adicionar próximo passo"
            onMouseDown={onPortDragStart}
            style={{ width: 12, height: 12, borderRadius: "50%", background: "#378ADD", border: "2px solid #FFFFFF", cursor: "crosshair", boxShadow: "0 0 0 3px rgba(55,138,221,0.25)", flexShrink: 0 }}
          />
        </div>
      </div>
      {/* Metrics */}
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #E5E5E5", fontSize: 11 }}>
        <span style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>0 Sucessos</span>
        <span style={{ color: "#F59E0B", fontWeight: 600 }}>0 Alertas</span>
        <span style={{ color: "#EF4444", fontWeight: 600 }}>0 Erros</span>
      </div>
    </div>
  );
}

// ─── NoteNode ─────────────────────────────────────────────────────────────────

function NoteNode({ node, selected, onDragStart, onResizeStart, onDelete, onUpdateText, onUpdateColor }: {
  node: CanvasNode;
  selected: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onUpdateText: (text: string) => void;
  onUpdateColor: (colorIndex: number) => void;
}) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const w = node.width ?? 220;
  const h = node.height ?? 140;
  const c = NOTE_COLORS[node.noteColorIndex ?? 0];

  return (
    <div
      data-node
      onMouseDown={onDragStart}
      style={{
        position: "absolute", left: node.x, top: node.y,
        width: w, height: h,
        zIndex: 1,
        background: c.bg,
        border: `1.5px solid ${selected ? c.borderSel : c.border}`,
        borderRadius: 10,
        boxShadow: selected ? `0 4px 16px ${c.borderSel}44` : "0 2px 8px rgba(0,0,0,0.08)",
        display: "flex", flexDirection: "column", cursor: "grab", overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "6px 10px", borderBottom: `0.5px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: c.header }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <StickyNote size={12} color={c.headerText} />
          <span style={{ fontSize: 11, fontWeight: 700, color: c.headerText }}>Anotação</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Color picker button */}
          <div style={{ position: "relative" }}>
            <button
              data-action
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setColorPickerOpen(v => !v); }}
              title="Alterar cor"
              style={{ width: 18, height: 18, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: c.headerText, padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = `${c.border}99`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Palette size={11} />
            </button>
            {colorPickerOpen && (
              <div
                data-action
                onMouseDown={e => e.stopPropagation()}
                style={{ position: "absolute", top: 22, right: 0, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 6, display: "flex", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 50 }}
              >
                {NOTE_COLORS.map((col, i) => (
                  <button
                    key={i}
                    data-action
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onUpdateColor(i); setColorPickerOpen(false); }}
                    title={`Cor ${i + 1}`}
                    style={{ width: 18, height: 18, borderRadius: "50%", background: col.header, border: `2px solid ${(node.noteColorIndex ?? 0) === i ? col.borderSel : col.border}`, cursor: "pointer", padding: 0, flexShrink: 0 }}
                  />
                ))}
              </div>
            )}
          </div>
          {/* Delete button */}
          <button
            data-action
            onMouseDown={e => e.stopPropagation()}
            onClick={onDelete}
            title="Excluir anotação"
            style={{ width: 18, height: 18, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: c.headerText, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.background = `${c.border}99`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Text area */}
      <textarea
        data-action
        value={node.noteText ?? ""}
        onChange={e => onUpdateText(e.target.value)}
        placeholder="Digite uma anotação..."
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setColorPickerOpen(false); }}
        style={{
          flex: 1, width: "100%", border: "none", background: "transparent",
          fontSize: 12, resize: "none", outline: "none", fontFamily: "inherit",
          color: c.text, padding: "8px 10px", boxSizing: "border-box", lineHeight: 1.5,
        }}
      />

      {/* Resize handle (bottom-right corner) */}
      <div
        data-resize-handle
        onMouseDown={onResizeStart}
        title="Redimensionar"
        style={{ position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 3 }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
          <path d="M2 10 L10 2 M6 10 L10 6" stroke={c.borderSel} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

// ─── ActionNode ───────────────────────────────────────────────────────────────

const SUB_BLOCK_ICONS: Record<SubBlockType, React.ElementType> = {
  mensagem_texto:  AlignLeft,
  entrada_usuario: HelpCircle,
  atraso_tempo:    Clock,
  mensagem_audio:  Mic,
  arquivo_anexo:   Paperclip,
  arquivo_url:     Link2,
};

const SUB_BLOCK_LABELS: Record<SubBlockType, string> = {
  mensagem_texto:  "Mensagem de texto",
  entrada_usuario: "Entrada do usuário",
  atraso_tempo:    "Atraso de tempo",
  mensagem_audio:  "Mensagem de áudio",
  arquivo_anexo:   "Arquivo anexo",
  arquivo_url:     "Arquivo URL Dinâmica",
};

function ActionNode({ node, selected, onSelect, onPortDragStart, onDragStart, onDelete, onDuplicate, onAddNote }: {
  node: CanvasNode;
  selected: boolean;
  onSelect: () => void;
  onPortDragStart: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddNote: () => void;
}) {
  const at = ACTION_TYPES.find(a => a.id === node.type);
  const Icon = at?.icon ?? Zap;
  const hasUserInput = node.subBlocks?.some(b => b.type === "entrada_usuario");

  const toolbar = (
    <div
      data-action
      onMouseDown={e => e.stopPropagation()}
      style={{ position: "absolute", top: -40, right: 0, display: "flex", gap: 4, background: "#FFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
    >
      {([
        { Ic: Trash2,     title: "Excluir",    action: onDelete,   hoverBg: "#FEE2E2", hoverColor: "#EF4444" },
        { Ic: Copy,       title: "Duplicar",   action: onDuplicate, hoverBg: "#F3F4F6", hoverColor: "#374151" },
        { Ic: StickyNote, title: "Anotações",  action: onAddNote,  hoverBg: "#FEF9C3", hoverColor: "#854D0E" },
      ] as const).map(({ Ic, title, action, hoverBg, hoverColor }, i) => (
        <button key={i} title={title} onClick={action}
          style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}
          onMouseEnter={e => { e.currentTarget.style.background = hoverBg; (e.currentTarget.style as CSSStyleDeclaration).color = hoverColor; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B7280"; }}
        ><Ic size={13} /></button>
      ))}
    </div>
  );

  if (node.type !== "mensagem") {
    return (
      <div
        data-node
        onMouseDown={onDragStart}
        style={{
          position: "absolute", left: node.x, top: node.y, width: 240,
          zIndex: 2,
          background: "#FFFFFF",
          border: `${selected ? 2 : 1}px solid ${selected ? "hsl(var(--primary))" : "#E5E5E5"}`,
          borderRadius: 12, padding: 14, cursor: "grab",
          boxShadow: selected ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {selected && toolbar}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: at ? `${at.color}18` : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={15} color={at?.color ?? "#6B7280"} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{node.label}</span>
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>Clique para configurar</div>
        <div
          data-port data-from-node={node.id}
          title="Arraste para adicionar próximo passo"
          onMouseDown={onPortDragStart}
          style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, borderRadius: "50%", background: "#378ADD", border: "2.5px solid #FFF", cursor: "crosshair", boxShadow: "0 0 0 3px rgba(55,138,221,0.25)", zIndex: 5 }}
        />
      </div>
    );
  }

  // ── Mensagem node ────────────────────────────────────────────────────────
  return (
    <div
      data-node
      onMouseDown={onDragStart}
      style={{
        position: "absolute", left: node.x, top: node.y, width: 280,
        zIndex: 2,
        background: "#FFFFFF",
        border: `${selected ? 2 : 1}px solid ${selected ? "#3B82F6" : "#E5E5E5"}`,
        borderRadius: 12, cursor: "grab",
        boxShadow: selected ? "0 4px 16px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Toolbar above node (shown when selected) */}
      {selected && toolbar}

      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle size={16} color="#3B82F6" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Mensagem</span>
      </div>

      {/* Body */}
      <div style={{ padding: "10px 14px" }}>
        {(!node.subBlocks || node.subBlocks.length === 0) ? (
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
            Envie e receba mensagens. Clique para adicionar uma mensagem:
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {node.subBlocks.map(b => {
              const SBIcon = SUB_BLOCK_ICONS[b.type];
              return (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#F9FAFB", border: "0.5px solid #E5E5E5", borderRadius: 7, fontSize: 12, color: "#374151" }}>
                  <SBIcon size={12} color="#6B7280" />
                  {b.type === "atraso_tempo" ? `Atraso de ${b.delaySeconds ?? 0} segundos` : SUB_BLOCK_LABELS[b.type]}
                </div>
              );
            })}
          </div>
        )}

        {/* Output ports */}
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {hasUserInput && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#6B7280" }}>Caso o contato não responda.</span>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FCA5A5", border: "1.5px solid #EF4444", flexShrink: 0 }} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>Caso ocorrer erro no envio da mensagem</span>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FCA5A5", border: "1.5px solid #EF4444", flexShrink: 0 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 500 }}>Próximo passo</span>
            <div
              data-port data-from-node={node.id}
              onMouseDown={onPortDragStart}
              style={{ width: 12, height: 12, borderRadius: "50%", background: "#93C5FD", border: "2px solid #3B82F6", flexShrink: 0, cursor: "crosshair" }}
            />
          </div>
        </div>
      </div>

      {/* Footer metrics */}
      <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 14px", borderTop: "0.5px solid #E5E5E5", fontSize: 11 }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>0</div><div style={{ color: "#3B82F6" }}>Sucessos</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>0</div><div style={{ color: "#F59E0B" }}>Alertas</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>0</div><div style={{ color: "#EF4444" }}>Erros</div></div>
      </div>
    </div>
  );
}

// ─── MensagemPanel ────────────────────────────────────────────────────────────

const MENSAGEM_SUB_BLOCKS: { type: SubBlockType; icon: React.ElementType; color: string }[] = [
  { type: "mensagem_texto",  icon: AlignLeft,  color: "#374151" },
  { type: "entrada_usuario", icon: HelpCircle, color: "#3B82F6" },
  { type: "atraso_tempo",    icon: Clock,      color: "#3B82F6" },
  { type: "mensagem_audio",  icon: Mic,        color: "#6B7280" },
  { type: "arquivo_anexo",   icon: Paperclip,  color: "#374151" },
  { type: "arquivo_url",     icon: Link2,      color: "#3B82F6" },
];

function MensagemPanel({ node, onClose, onDelete, onDuplicate, addSubBlock, removeSubBlock, updateSubBlock }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  addSubBlock: (type: SubBlockType) => void;
  removeSubBlock: (blockId: string) => void;
  updateSubBlock: (blockId: string, data: Partial<SubBlock>) => void;
}) {
  return (
    <aside style={{ width: 340, minWidth: 340, maxWidth: 340, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} /> Mensagens
          </button>
          <div style={{ display: "flex", gap: 2 }}>
            {[{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }, { Icon: Download, action: () => {}, color: "#6B7280", hover: "#F3F4F6" }].map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><Icon size={13} /></button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Envie, receba e armazene respostas</p>
      </div>

      {/* Conexão */}
      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #F0F0F0" }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Conexão</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select style={{ flex: 1, padding: "7px 10px", border: "0.5px solid #E5E5E5", borderRadius: 8, fontSize: 12, outline: "none", background: "#FFF" }}>
            <option>Selecionar</option>
          </select>
          <button style={{ width: 30, height: 30, borderRadius: 7, border: "0.5px solid #E5E5E5", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={12} style={{ transform: "rotate(180deg)" }} /></button>
          <button style={{ width: 30, height: 30, borderRadius: 7, border: "0.5px solid #E5E5E5", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Settings size={12} /></button>
        </div>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0", lineHeight: 1.4 }}>Deixe em branco para usar a conexão dos blocos anteriores.</p>
      </div>

      {/* Added sub-blocks */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {(node.subBlocks ?? []).map(b => {
          const SBIcon = SUB_BLOCK_ICONS[b.type];
          return (
            <div key={b.id} style={{ marginBottom: 8, border: "0.5px solid #E5E5E5", borderRadius: 10, overflow: "hidden", background: "#FAFAFA" }}>
              {/* Sub-block toolbar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "4px 8px", gap: 2, borderBottom: "0.5px solid #F0F0F0", background: "#F9FAFB" }}>
                <button onClick={() => removeSubBlock(b.id)} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                ><Trash2 size={11} /></button>
              </div>
              {/* Sub-block content */}
              <div style={{ padding: "10px 12px" }}>
                {b.type === "mensagem_texto" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#374151" }}><AlignLeft size={13} /> Mensagem de texto</div>
                    <textarea
                      value={b.text ?? ""}
                      onChange={e => updateSubBlock(b.id, { text: e.target.value })}
                      placeholder="Digite a mensagem..."
                      style={{ width: "100%", minHeight: 80, border: "0.5px solid #E5E5E5", borderRadius: 7, padding: "8px 10px", fontSize: 12, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                )}
                {b.type === "entrada_usuario" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#3B82F6" }}><HelpCircle size={13} /> Entrada do usuário</div>
                    <div style={{ padding: "8px 12px", background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, fontSize: 12, color: "#1D4ED8", textAlign: "center" }}>Resposta do usuário</div>
                  </div>
                )}
                {b.type === "atraso_tempo" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Clock size={13} /> Atraso de tempo</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#6B7280" }}>Atraso de</span>
                      <input
                        type="number" min={0}
                        value={b.delaySeconds ?? 0}
                        onChange={e => updateSubBlock(b.id, { delaySeconds: Number(e.target.value) })}
                        style={{ width: 64, padding: "5px 8px", border: "0.5px solid #E5E5E5", borderRadius: 6, fontSize: 12, outline: "none" }}
                      />
                      <span style={{ fontSize: 12, color: "#6B7280" }}>segundos</span>
                    </div>
                  </div>
                )}
                {b.type === "mensagem_audio" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Mic size={13} /> Mensagem de áudio</div>
                    <div style={{ padding: "10px 12px", background: "#F9FAFB", border: "0.5px dashed #D1D5DB", borderRadius: 8, textAlign: "center" }}>
                      <button style={{ padding: "6px 14px", border: "0.5px solid #E5E5E5", borderRadius: 6, background: "#FFF", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, margin: "0 auto" }}>
                        <Mic size={12} /> Iniciar gravação
                      </button>
                    </div>
                  </div>
                )}
                {b.type === "arquivo_anexo" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Paperclip size={13} /> Arquivo anexo</div>
                    <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 14, border: "0.5px dashed #D1D5DB", borderRadius: 8, background: "#F9FAFB", cursor: "pointer", fontSize: 11, color: "#6B7280" }}>
                      <Upload size={20} color="#D1D5DB" />
                      Selecionar arquivo
                      <input type="file" style={{ display: "none" }} />
                    </label>
                  </div>
                )}
                {b.type === "arquivo_url" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Link2 size={13} /> Arquivo URL Dinâmica</div>
                    <input
                      type="url"
                      value={b.fileUrl ?? ""}
                      onChange={e => updateSubBlock(b.id, { fileUrl: e.target.value })}
                      placeholder="URL do arquivo"
                      style={{ width: "100%", padding: "7px 10px", border: `0.5px solid ${b.fileUrl && !b.fileUrl.startsWith("http") ? "#EF4444" : "#E5E5E5"}`, borderRadius: 7, fontSize: 12, outline: "none", boxSizing: "border-box" }}
                    />
                    {b.fileUrl && !b.fileUrl.startsWith("http") && (
                      <p style={{ fontSize: 11, color: "#EF4444", margin: "4px 0 0" }}>URL informada é inválida</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sub-block type buttons */}
      <div style={{ borderTop: "0.5px solid #E5E5E5", padding: "8px 0" }}>
        {MENSAGEM_SUB_BLOCKS.map(({ type, icon: Icon, color }) => (
          <button
            key={type}
            onClick={() => addSubBlock(type)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "#111111", textAlign: "left" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <Icon size={15} color={color} />
            {SUB_BLOCK_LABELS[type]}
          </button>
        ))}
      </div>
    </aside>
  );
}
