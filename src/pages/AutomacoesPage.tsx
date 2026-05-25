import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronLeft,
  Play, Zap, Power, Minus, Maximize2, ArrowLeft, ArrowRight,
  Save, Pencil, Copy, Download, Upload, Trash2,
  Briefcase, User, MessageCircle, Instagram, Globe, Settings,
  Calendar, Filter, LayoutGrid, X, CheckCircle2,
  Clock, Shuffle, Bot, Code2, Sliders,
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

type CanvasNode = {
  id: string;
  type: "start" | ActionNodeType;
  x: number; y: number;
  label: string;
  trigger?: TriggerConfig | null;
  parentId?: string | null;
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
  const [addNodeMenu, setAddNodeMenu]   = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef    = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

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

  const handleAddNode = (fromNodeId: string, type: string, label: string) => {
    const fromNode = nodes.find(n => n.id === fromNodeId);
    if (!fromNode) return;
    const children = nodes.filter(n => n.parentId === fromNodeId);
    const newNode: CanvasNode = {
      id: `n${Date.now()}`,
      type: type as ActionNodeType,
      x: fromNode.x + 340,
      y: fromNode.y + children.length * 180,
      label,
      parentId: fromNodeId,
    };
    setNodes(prev => [...prev, newNode]);
    setAddNodeMenu(null);
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
    setSelectedNode(null);
    setAddNodeMenu(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panRef.current) return;
      setPan({ x: panRef.current.baseX + e.clientX - panRef.current.startX, y: panRef.current.baseY + e.clientY - panRef.current.startY });
    };
    const onUp = () => { panRef.current = null; };
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
                  const x1 = parent.x + 260, y1 = parent.y + 110;
                  const x2 = n.x, y2 = n.y + 40;
                  return <path key={n.id} d={`M ${x1} ${y1} C ${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`} stroke="#CCCCCC" strokeWidth={1.5} fill="none" strokeDasharray="5,4" />;
                })}
                {addNodeMenu && (() => {
                  const p = nodes.find(n => n.id === addNodeMenu);
                  if (!p) return null;
                  const x1 = p.x + 260, y1 = p.y + 110, x2 = p.x + 320, y2 = p.y + 110;
                  return <path key="addline" d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke="#378ADD" strokeWidth={1.5} fill="none" strokeDasharray="5,4" />;
                })()}
              </svg>

              {/* Nodes */}
              {nodes.map(n => n.type === "start" ? (
                <StartNode
                  key={n.id}
                  node={{ ...n, trigger: n.id === "n1" ? trigger : n.trigger }}
                  selected={selectedNode === n.id}
                  onSelect={() => setSelectedNode(n.id)}
                  onAddTrigger={() => setTriggerOpen(true)}
                  onAddStep={() => setAddNodeMenu(addNodeMenu === n.id ? null : n.id)}
                />
              ) : (
                <ActionNode
                  key={n.id}
                  node={n}
                  selected={selectedNode === n.id}
                  onSelect={() => setSelectedNode(n.id)}
                />
              ))}

              {/* Add node popup */}
              {addNodeMenu && (() => {
                const parentNode = nodes.find(n => n.id === addNodeMenu);
                if (!parentNode) return null;
                return (
                  <div
                    data-node
                    style={{ position: "absolute", left: parentNode.x + 322, top: parentNode.y + 50, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 12, padding: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", width: 220, zIndex: 30 }}
                    onClick={e => e.stopPropagation()}
                  >
                    {ACTION_TYPES.map(at => {
                      const Icon = at.icon;
                      return (
                        <button
                          key={at.id}
                          onClick={() => handleAddNode(addNodeMenu, at.id, at.label)}
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
                );
              })()}
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

function StartNode({ node, selected, onSelect, onAddTrigger, onAddStep }: {
  node: CanvasNode & { trigger?: TriggerConfig | null };
  selected: boolean;
  onSelect: () => void;
  onAddTrigger: () => void;
  onAddStep: () => void;
}) {
  return (
    <div
      data-node
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: "absolute", left: node.x, top: node.y, width: 260,
        background: "#FFFFFF",
        border: `${selected ? 2 : 1.5}px dashed ${selected ? "hsl(var(--primary))" : "#CCCCCC"}`,
        borderRadius: 12, padding: 14, cursor: "pointer",
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
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#378ADD" }} />
        </div>
      </div>
      {/* Metrics */}
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #E5E5E5", fontSize: 11 }}>
        <span style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>0 Sucessos</span>
        <span style={{ color: "#F59E0B", fontWeight: 600 }}>0 Alertas</span>
        <span style={{ color: "#EF4444", fontWeight: 600 }}>0 Erros</span>
      </div>

      {/* Output port — aparece após gatilho ser definido */}
      {node.trigger && (
        <div
          data-node
          title="Adicionar próximo passo"
          onClick={(e) => { e.stopPropagation(); onAddStep(); }}
          style={{
            position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)",
            width: 16, height: 16, borderRadius: "50%",
            background: "#378ADD", border: "2.5px solid #FFFFFF",
            cursor: "pointer", boxShadow: "0 0 0 3px rgba(55,138,221,0.25)",
            zIndex: 5,
          }}
        />
      )}
    </div>
  );
}

// ─── ActionNode ───────────────────────────────────────────────────────────────

function ActionNode({ node, selected, onSelect }: {
  node: CanvasNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const at = ACTION_TYPES.find(a => a.id === node.type);
  const Icon = at?.icon ?? Zap;
  return (
    <div
      data-node
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{
        position: "absolute", left: node.x, top: node.y, width: 240,
        background: "#FFFFFF",
        border: `${selected ? 2 : 1}px solid ${selected ? "hsl(var(--primary))" : "#E5E5E5"}`,
        borderRadius: 12, padding: 14, cursor: "pointer",
        boxShadow: selected ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: at ? `${at.color}18` : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={15} color={at?.color ?? "#6B7280"} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{node.label}</span>
      </div>
      <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8, lineHeight: 1.4 }}>
        Clique para configurar
      </div>
    </div>
  );
}
