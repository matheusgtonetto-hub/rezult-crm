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
import { Plus, MessageCircle, Search, Activity as ActivityIcon } from "lucide-react";

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
  } = useCRM();
  const [newLeadCol, setNewLeadCol] = useState<string | null>(null);
  const [globalNewLead, setGlobalNewLead] = useState(false);

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
        <div className="px-6 pb-4 flex flex-wrap items-center gap-2 border-b border-card-border">
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
          <div className="flex gap-3 overflow-x-auto flex-1 p-4">
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
                      className={`min-w-[280px] w-[280px] flex flex-col rounded-lg border border-card-border bg-secondary/40 transition-colors ${
                        snapshot.isDraggingOver ? "bg-secondary" : ""
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
                          <h3 className="text-sm font-semibold text-foreground truncate">
                            {col.title}
                          </h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatCurrency(totalValue)} · {col.filteredIds.length}{" "}
                            {col.filteredIds.length === 1 ? "negócio" : "negócios"}
                          </p>
                        </div>
                        <button
                          onClick={() => setNewLeadCol(col.id)}
                          className="text-muted-foreground hover:text-primary transition-colors p-1 -m-1"
                          aria-label="Adicionar negócio"
                        >
                          <Plus size={16} />
                        </button>
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
                                  className={`bg-card border border-card-border rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-all ${
                                    snap.isDragging
                                      ? "shadow-lg shadow-primary/10 rotate-1"
                                      : ""
                                  }`}
                                >
                                  {/* Top: deal number + WhatsApp */}
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      #{lead.dealNumber}
                                    </span>
                                    <a
                                      href={`https://wa.me/${lead.whatsapp}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="text-success hover:scale-110 transition-transform"
                                      aria-label="Abrir WhatsApp"
                                    >
                                      <MessageCircle size={14} />
                                    </a>
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
                    </div>
                  )}
                </Droppable>
              );
            })}
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
      </div>
    </div>
  );
}
