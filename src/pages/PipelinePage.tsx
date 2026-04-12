import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useCRM } from "@/context/CRMContext";
import { LeadDrawer } from "@/components/LeadDrawer";
import { NewLeadDialog } from "@/components/NewLeadDialog";
import { Button } from "@/components/ui/button";
import { Plus, MessageCircle } from "lucide-react";

const priorityColors: Record<string, string> = {
  Alta: "bg-destructive/20 text-destructive",
  Média: "bg-primary/20 text-primary",
  Baixa: "bg-muted text-muted-foreground",
};

export default function PipelinePage() {
  const { columns, leads, moveLead, selectedLeadId, setSelectedLeadId } = useCRM();
  const [newLeadCol, setNewLeadCol] = useState<string | null>(null);
  const [globalNewLead, setGlobalNewLead] = useState(false);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    moveLead(draggableId, source.droppableId, destination.droppableId, destination.index);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
        <Button onClick={() => setGlobalNewLead(true)} className="rounded-lg font-semibold">
          <Plus size={16} className="mr-1" /> Novo Lead
        </Button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
          {columns.map(col => (
            <Droppable droppableId={col.id} key={col.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-w-[280px] w-[280px] flex flex-col rounded-lg transition-colors ${
                    snapshot.isDraggingOver ? "bg-card/80" : "bg-card/40"
                  }`}
                >
                  <div className="flex items-center justify-between px-3 py-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
                      <span className="text-xs bg-card rounded-full px-2 py-0.5 text-muted-foreground border border-card-border">
                        {col.leadIds.length}
                      </span>
                    </div>
                    <button
                      onClick={() => setNewLeadCol(col.id)}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
                    {col.leadIds.map((leadId, index) => {
                      const lead = leads[leadId];
                      if (!lead) return null;
                      return (
                        <Draggable key={leadId} draggableId={leadId} index={index}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => setSelectedLeadId(leadId)}
                              className={`bg-card border border-card-border rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-all ${
                                snap.isDragging ? "shadow-lg shadow-primary/10 rotate-1" : ""
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">
                                    {lead.responsible.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-foreground leading-tight">{lead.name}</p>
                                    {lead.company && (
                                      <p className="text-xs text-muted-foreground">{lead.company}</p>
                                    )}
                                  </div>
                                </div>
                                <a
                                  href={`https://wa.me/${lead.whatsapp}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-success hover:scale-110 transition-transform"
                                >
                                  <MessageCircle size={16} />
                                </a>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-primary">
                                  {formatCurrency(lead.value)}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColors[lead.priority]}`}>
                                  {lead.priority}
                                </span>
                              </div>
                              {lead.nextFollowUp && (
                                <p className="text-[10px] text-muted-foreground mt-2">
                                  Follow-up: {new Date(lead.nextFollowUp).toLocaleDateString("pt-BR")}
                                </p>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                    {col.leadIds.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-xs">
                        Nenhum lead nesta etapa
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <LeadDrawer
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />

      <NewLeadDialog
        open={!!newLeadCol || globalNewLead}
        onClose={() => { setNewLeadCol(null); setGlobalNewLead(false); }}
        defaultStage={newLeadCol || columns[0]?.id}
      />
    </div>
  );
}
