import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useCRM } from "@/context/CRMContext";
import { LeadDrawer } from "@/components/LeadDrawer";
import { NewLeadDialog } from "@/components/NewLeadDialog";
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
import { Plus, Search, Activity as ActivityIcon, MoreHorizontal, Pencil, Trash2, MessageSquarePlus, Calendar, Tag as TagIcon } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { availableTags } from "@/data/mockData";

const priorityColors: Record<string, string> = {
  Alta: "bg-destructive/10 text-destructive",
  Média: "bg-primary/10 text-primary",
  Baixa: "bg-muted text-muted-foreground",
};

type SortKey = "recent" | "value" | "name";
type StatusFilter = "open" | "won" | "lost" | "all";

export default function PipelinePage() {
  const {
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
  } = useCRM();
  const { openChat } = useFloatingChat();
  const [newLeadCol, setNewLeadCol] = useState<string | null>(null);
  const [globalNewLead, setGlobalNewLead] = useState(false);

  // Column edit/delete dialogs
  const [renamingCol, setRenamingCol] = useState<{ id: string; title: string } | null>(null);
  const [deletingCol, setDeletingCol] = useState<{ id: string; title: string; count: number } | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [showNewColumn, setShowNewColumn] = useState(false);

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
  }, [activePipeline.columns, leads, search, status, dateFrom, dateTo, sortKey]);

  return (
    <div className="flex h-[100vh-0] min-h-screen bg-background">
      <PipelineSidebar />

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
          <Button
            onClick={() => setGlobalNewLead(true)}
            className="rounded-lg font-semibold shrink-0"
          >
            <Plus size={16} className="mr-1" /> Novo Lead
          </Button>
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
                        <div className="min-w-0">
                          <h3 className="truncate" style={{ fontSize: 14, fontWeight: 600, color: "#111111" }}>
                            {col.title}
                          </h3>
                          <p className="mt-0.5" style={{ fontSize: 12, color: "#AAAAAA" }}>
                            {formatCurrency(totalValue)} · {col.filteredIds.length}{" "}
                            {col.filteredIds.length === 1 ? "negócio" : "negócios"}
                          </p>
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
                          const activityCount = lead.activities.length;
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
                                  onClick={() => setSelectedLeadId(leadId)}
                                  className={`bg-card border border-card-border rounded-xl p-3 cursor-pointer shadow-elev-1 hover:shadow-elev-2 hover:border-[#DDDDDD] transition-all ${
                                    snap.isDragging
                                      ? "shadow-elev-2 rotate-1"
                                      : ""
                                  } ${isWonStage(col.id) ? "glow-closed" : ""}`}
                                >
                                  {/* Top: deal number + actions */}
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      #{lead.dealNumber}
                                    </span>
                                    <div className="flex items-center" style={{ gap: 8 }}>
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          openChat(leadId);
                                        }}
                                        className="flex items-center justify-center transition-colors hover:bg-[#F0F0F0]"
                                        style={{
                                          width: 24,
                                          height: 24,
                                          borderRadius: 6,
                                        }}
                                        aria-label="Abrir chat WhatsApp"
                                      >
                                        <WhatsAppIcon size={18} />
                                      </button>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            onClick={e => e.stopPropagation()}
                                            className="flex items-center justify-center transition-colors hover:bg-[#F0F0F0]"
                                            style={{
                                              width: 24,
                                              height: 24,
                                              borderRadius: 6,
                                              color: "#AAAAAA",
                                            }}
                                            aria-label="Adicionar tag"
                                          >
                                            <TagIcon size={14} />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-44">
                                          {availableTags.map(t => {
                                            const has = (lead.tags || []).includes(t.name);
                                            return (
                                              <DropdownMenuItem
                                                key={t.name}
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
                                                  className="inline-block w-2 h-2 rounded-full mr-2"
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

                                  {/* Name + company */}
                                  <p className="text-sm font-medium text-foreground leading-tight">
                                    {lead.name}
                                  </p>
                                  {lead.company && (
                                    <p className="text-xs text-muted-foreground">
                                      {lead.company}
                                    </p>
                                  )}

                                  {/* Tags */}
                                  {lead.tags && lead.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {lead.tags.map(tagName => {
                                        const t = availableTags.find(x => x.name === tagName);
                                        const color = t?.color || "#888";
                                        return (
                                          <span
                                            key={tagName}
                                            className="text-[10px] px-2 py-0.5 rounded-full text-white font-medium"
                                            style={{ background: color }}
                                          >
                                            {tagName}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* "Sem produto" tag */}
                                  {!lead.productId && (
                                    <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                      Sem produto
                                    </span>
                                  )}

                                  {/* Value + priority */}
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="text-sm font-semibold text-primary">
                                      {formatCurrency(lead.value)}
                                    </span>
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColors[lead.priority]}`}
                                    >
                                      {lead.priority}
                                    </span>
                                  </div>

                                  {/* Follow-up date */}
                                  {lead.nextFollowUp && (
                                    <div className="flex items-center gap-1 mt-1" style={{ fontSize: 11, color: "#AAAAAA" }}>
                                      <Calendar size={11} />
                                      {new Date(lead.nextFollowUp).toLocaleDateString("pt-BR")}
                                    </div>
                                  )}

                                  {/* Footer: responsible tag + activities + quick add */}
                                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-card-border">
                                    <span
                                      className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                                      style={{ backgroundColor: respColor }}
                                    >
                                      {lead.responsible}
                                    </span>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <ActivityIcon size={11} />
                                        {activityCount === 0
                                          ? "Sem atividades"
                                          : `${activityCount} atividade${activityCount > 1 ? "s" : ""}`}
                                      </span>
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          setSelectedLeadId(leadId);
                                        }}
                                        className="text-muted-foreground hover:text-primary"
                                        aria-label="Adicionar atividade"
                                      >
                                        <Plus size={12} />
                                      </button>
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

                      {/* Footer: + Novo negócio */}
                      <button
                        onClick={() => setNewLeadCol(col.id)}
                        className="w-full text-xs text-muted-foreground hover:text-primary transition-colors py-2.5 border-t border-card-border flex items-center justify-center gap-1.5"
                        style={{ borderTopWidth: "0.5px" }}
                      >
                        <Plus size={13} /> Novo negócio
                      </button>
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

        <NewLeadDialog
          open={!!newLeadCol || globalNewLead}
          onClose={() => {
            setNewLeadCol(null);
            setGlobalNewLead(false);
          }}
          defaultStage={newLeadCol || activePipeline.columns[0]?.id}
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
      </div>
    </div>
  );
}
