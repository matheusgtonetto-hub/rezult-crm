import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useCRM } from "@/context/CRMContext";
import { LeadDrawer } from "@/components/LeadDrawer";
import { PipelineSidebar } from "@/components/PipelineSidebar";
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
import { Plus, Search, MoreHorizontal, Pencil, Trash2, MessageSquarePlus, Calendar, Tag as TagIcon, Settings, Users, GitBranch, ChevronLeft, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type SortKey = "recent" | "value" | "name";
type StatusFilter = "open" | "won" | "lost" | "all";

export default function PipelinePage() {
  const {
    pipelines,
    activePipeline,
    leads,
    moveLead,
    selectedLeadId,
    setSelectedLeadId,
    memberColors,
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
  } = useCRM();
  const { openChat } = useFloatingChat();
  const navigate = useNavigate();

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
      try { localStorage.setItem("pipeline-sidebar-open", String(next)); } catch {}
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
  const [colorPickerColId, setColorPickerColId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    moveLead(draggableId, source.droppableId, destination.droppableId, destination.index);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const isWonStage = (id: string) =>
    /fechado|ganho|recuperado/i.test(id);
  const isLostStage = (id: string) => /perdido/i.test(id);

  const filteredColumns = useMemo(() => {
    if (!activePipeline) return [];
    return activePipeline.columns
      .filter(col => {
        if (status === "open") return !isWonStage(col.id) && !isLostStage(col.id);
        if (status === "won") return isWonStage(col.id);
        if (status === "lost") return isLostStage(col.id);
        return true;
      })
      .map(col => {
        let ids = col.leadIds.filter(id => leads[id]);
        if (search) {
          const q = search.toLowerCase();
          ids = ids.filter(id => {
            const l = leads[id];
            return (
              l.name.toLowerCase().includes(q) ||
              (l.company || "").toLowerCase().includes(q) ||
              String(l.dealNumber || "").includes(q)
            );
          });
        }
        if (dateFrom) ids = ids.filter(id => leads[id].entryDate >= dateFrom);
        if (dateTo) ids = ids.filter(id => leads[id].entryDate <= dateTo);

        ids.sort((a, b) => {
          const la = leads[a];
          const lb = leads[b];
          if (sortKey === "value") return lb.value - la.value;
          if (sortKey === "name") return la.name.localeCompare(lb.name);
          return lb.entryDate.localeCompare(la.entryDate);
        });
        return { ...col, filteredIds: ids };
      });
  }, [activePipeline?.columns, leads, search, status, dateFrom, dateTo, sortKey]);

  const openEditPipeline = () => {
    setEditPipelineName(activePipeline.name);
    setEditPipelineDesc(activePipeline.description ?? "");
    setEditPipelineGroup(activePipeline.category);
    setEditPipelineTab("config");
    setCreatingGroup(false);
    setNewGroupName("");
    setShowEditPipeline(true);
  };

  const handleDeletePipeline = () => {
    const groupName = activePipeline.category;
    const othersInGroup = pipelines.filter(p => p.category === groupName && p.id !== activePipeline.id);
    deletePipeline(activePipeline.id);
    if (othersInGroup.length === 0) {
      const group = pipelineGroups.find(g => g.name === groupName);
      if (group) deletePipelineGroup(group.id);
    }
    setConfirmDeletePipeline(false);
    setShowEditPipeline(false);
    toast.success("Pipeline removida.");
  };

  const handleSaveEditPipeline = () => {
    if (!editPipelineName.trim()) { toast.error("Informe um nome."); return; }
    updatePipeline(activePipeline.id, {
      name: editPipelineName.trim(),
      description: editPipelineDesc.trim(),
      category: editPipelineGroup,
    });
    toast.success("Pipeline atualizado.");
    setShowEditPipeline(false);
  };

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
        <div className="px-6 pt-6 pb-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate">
              {activePipeline.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activePipeline.category} ·{" "}
              {activePipeline.columns.reduce((s, c) => s + c.leadIds.length, 0)} negócios
            </p>
          </div>
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
              <DropdownMenuItem className="py-2.5" onClick={() => toast("Em breve: Permissões da pipeline")}>
                <Users size={14} className="mr-3 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Permissões da pipeline</div>
                  <div className="text-xs text-muted-foreground">Adicione acesso para os atendentes</div>
                </div>
              </DropdownMenuItem>
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
        <div className="px-6 pb-4 flex flex-nowrap items-center gap-2 border-b border-card-border overflow-x-auto">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, empresa ou #"
              className="pl-8 h-9 w-64 bg-card border-card-border rounded-lg text-sm"
            />
          </div>

          <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-9 w-40 bg-card border-card-border rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-card-border">
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="value">Valor</SelectItem>
              <SelectItem value="name">Nome</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={v => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-36 bg-card border-card-border rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-card-border">
              <SelectItem value="open">Em aberto</SelectItem>
              <SelectItem value="won">Ganho</SelectItem>
              <SelectItem value="lost">Perdido</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-9 w-36 bg-card border-card-border rounded-lg text-sm"
            />
            <span>—</span>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-9 w-36 bg-card border-card-border rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Kanban */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto flex-1 p-4 bg-background">
            {filteredColumns.map(col => {
              const totalValue = col.filteredIds.reduce(
                (s, id) => s + (leads[id]?.value || 0),
                0
              );
              return (
                <Droppable droppableId={col.id} key={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-w-[280px] w-[280px] flex flex-col rounded-xl border border-card-border bg-card shadow-elev-1 transition-colors ${
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
                            <p className="mt-0.5" style={{ fontSize: 12, color: "#AAAAAA" }}>
                              {formatCurrency(totalValue)} · {col.filteredIds.length}{" "}
                              {col.filteredIds.length === 1 ? "negócio" : "negócios"}
                            </p>
                          </div>
                        </div>
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
                      </div>

                      <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)]">
                        {col.filteredIds.map((leadId, index) => {
                          const lead = leads[leadId];
                          if (!lead) return null;
                          const respColor =
                            memberColors[lead.responsible] || "#888888";
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
                                  className={`bg-card border border-card-border rounded-xl p-3 cursor-pointer shadow-elev-1 hover:shadow-elev-2 hover:border-[#DDDDDD] transition-all ${
                                    snap.isDragging
                                      ? "shadow-elev-2 rotate-1"
                                      : ""
                                  } ${isWonStage(col.id) ? "glow-closed" : ""}`}
                                >
                                  {/* Top: deal number + whatsapp */}
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      #{lead.dealNumber}
                                    </span>
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        openChat(leadId);
                                      }}
                                      className="flex items-center justify-center transition-colors hover:bg-[#F0F0F0]"
                                      style={{ width: 24, height: 24, borderRadius: 6 }}
                                      aria-label="Abrir chat WhatsApp"
                                    >
                                      <WhatsAppIcon size={18} />
                                    </button>
                                  </div>

                                  {/* Name + company */}
                                  <p className="text-sm font-medium text-foreground leading-tight">
                                    {lead.name}
                                  </p>
                                  {lead.company && (
                                    <p className="text-xs text-muted-foreground">
                                      {lead.company}
                                    </p>
                                  )}

                                  {/* Responsible */}
                                  {lead.responsible && (
                                    <div className="mt-2">
                                      <span
                                        className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                                        style={{ backgroundColor: respColor }}
                                      >
                                        {lead.responsible}
                                      </span>
                                    </div>
                                  )}

                                  {/* Value */}
                                  <div className="mt-2">
                                    <span className="text-sm font-semibold text-primary">
                                      {formatCurrency(lead.value)}
                                    </span>
                                  </div>

                                  {/* Entry date */}
                                  {lead.entryDate && (
                                    <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 11, color: "#AAAAAA" }}>
                                      <Calendar size={11} />
                                      {new Date(lead.entryDate + "T00:00:00").toLocaleDateString("pt-BR")}
                                    </div>
                                  )}

                                  {/* Follow-up date */}
                                  {lead.nextFollowUp && (
                                    <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: 11, color: "#AAAAAA" }}>
                                      <Calendar size={11} />
                                      Follow-up: {new Date(lead.nextFollowUp + "T00:00:00").toLocaleDateString("pt-BR")}
                                    </div>
                                  )}

                                  {/* Footer: tags + tag button */}
                                  <div className="flex items-center mt-3 pt-2 border-t border-card-border gap-1">
                                    <div className="flex items-center gap-1 flex-1 min-w-0">
                                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                                        {(lead.tags || []).map(tagName => {
                                          const t = crmTags.find(x => x.name === tagName);
                                          return (
                                            <span
                                              key={tagName}
                                              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium whitespace-nowrap"
                                              style={{ background: t?.color || "#888" }}
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
                                            className="shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-[#F0F0F0] text-muted-foreground hover:text-foreground"
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
              );
            })}

            {/* Add column tile */}
            <button
              onClick={() => {
                setNewColumnName("");
                setShowNewColumn(true);
              }}
              className="min-w-[280px] w-[280px] rounded-xl flex items-center justify-center text-sm transition-colors"
              style={{
                backgroundColor: "#F5F5F5",
                border: "1px dashed #CCCCCC",
                color: "#AAAAAA",
              }}
            >
              <Plus size={16} className="mr-1.5" /> Nova coluna
            </button>
          </div>
        </DragDropContext>

        <LeadDrawer
          leadId={selectedLeadId}
          open={!!selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
        />


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
              className="rounded-lg"
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
              className="rounded-lg"
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
                  addColumn(activePipeline.id, { id, title: name, color: "#AAAAAA", leadIds: [] });
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
          <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
            <div className="flex" style={{ height: 520 }}>
              {/* Left sidebar */}
              <div className="flex flex-col border-r bg-muted/30" style={{ width: 176, padding: 12 }}>
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
                <button
                  onClick={() => setEditPipelineTab("atendentes")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                    editPipelineTab === "atendentes"
                      ? "bg-background shadow-sm font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                  }`}
                >
                  <Users size={14} className="shrink-0" /> Atendentes
                </button>
              </div>

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
                          className="mt-1.5 rounded-lg"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Descrição</Label>
                        <Textarea
                          value={editPipelineDesc}
                          onChange={e => setEditPipelineDesc(e.target.value)}
                          placeholder="Descreva o propósito desta pipeline"
                          className="mt-1.5 rounded-lg resize-none"
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
                              className="rounded-lg h-8 text-sm flex-1"
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
                  {editPipelineTab === "atendentes" && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-16">
                      <Users size={32} className="mb-3 opacity-30" />
                      <p className="text-sm font-medium">Gerenciamento de atendentes</p>
                      <p className="text-xs mt-1">Em breve</p>
                    </div>
                  )}
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
