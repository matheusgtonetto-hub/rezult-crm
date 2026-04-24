import { useCRM } from "@/context/CRMContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Trophy,
  XCircle,
  StickyNote,
  ArrowRightLeft,
  PlusCircle,
  Sparkles,
  Plus,
  CheckSquare,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Priority, LeadOrigin, ActivityType } from "@/data/mockData";

interface Props {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

const ACTIVITY_META: Record<
  ActivityType,
  { icon: typeof StickyNote; tone: string; label: string }
> = {
  note: { icon: StickyNote, tone: "text-foreground bg-muted", label: "Anotação" },
  stage_change: { icon: ArrowRightLeft, tone: "text-primary bg-primary/10", label: "Etapa" },
  whatsapp: { icon: MessageCircle, tone: "text-success bg-success/10", label: "WhatsApp" },
  won: { icon: Trophy, tone: "text-success bg-success/10", label: "Ganho" },
  lost: { icon: XCircle, tone: "text-destructive bg-destructive/10", label: "Perdido" },
  created: { icon: PlusCircle, tone: "text-muted-foreground bg-muted", label: "Criado" },
};

export function LeadDrawer({ leadId, open, onClose }: Props) {
  const {
    leads,
    updateLead,
    columns,
    teamMembers,
    addActivity,
    products,
    markLeadWon,
    markLeadLost,
    tasks: allTasks,
    addTask: addTaskToContext,
    updateTask,
  } = useCRM();
  const [newNote, setNewNote] = useState("");
  const [taskFilter, setTaskFilter] = useState<"pending" | "done" | "all">("pending");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);

  if (!leadId || !leads[leadId]) return null;
  const lead = leads[leadId];

  // Bug 4: use real tasks from context filtered by this lead, not hardcoded data
  const tasks = allTasks.filter(t => t.leadId === leadId);

  const toggleTask = (id: string) => {
    const t = allTasks.find(x => x.id === id);
    if (!t) return;
    updateTask(id, { status: t.status === "Concluída" ? "Pendente" : "Concluída" });
  };
  const filteredTasks = tasks.filter(t =>
    taskFilter === "all" ? true :
    taskFilter === "done" ? t.status === "Concluída" :
    t.status === "Pendente"
  );
  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    addTaskToContext({
      id: `t-${Date.now()}`,
      title: newTaskTitle.trim(),
      leadId: leadId,
      leadName: lead.name,
      responsible: lead.responsible,
      dueDate: new Date().toISOString().split("T")[0] + "T12:00",
      status: "Pendente",
    });
    setNewTaskTitle("");
    setShowNewTask(false);
    toast.success("Tarefa criada!");
  };
  const handleSaveNote = () => {
    if (!newNote.trim()) return;
    addActivity(leadId, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      type: "note",
      description: newNote.trim(),
    });
    setNewNote("");
    toast.success("Anotação salva!");
  };

  const handleFieldChange = (field: string, value: string | number | undefined) => {
    updateLead(leadId, { [field]: value });
  };

  const handleStageChange = (newStage: string) => {
    const oldStage = lead.stage;
    const oldCol = columns.find(c => c.id === oldStage);
    const newCol = columns.find(c => c.id === newStage);
    updateLead(leadId, { stage: newStage });
    addActivity(leadId, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      type: "stage_change",
      description: `Movido de "${oldCol?.title}" para "${newCol?.title}".`,
    });
    toast.success("Etapa atualizada!");
  };

  const handleWon = () => {
    markLeadWon(leadId);
    toast.success("Negócio marcado como ganho!");
  };
  const handleLost = () => {
    markLeadLost(leadId);
    toast.error("Negócio marcado como perdido.");
  };

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-card-border overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Sparkles size={12} className="text-primary" />
            Negócio #{lead.dealNumber}
          </div>
          <SheetTitle className="text-foreground">{lead.name}</SheetTitle>
        </SheetHeader>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          <Button
            onClick={handleWon}
            className="flex-1 rounded-lg font-semibold bg-success text-success-foreground hover:bg-success/90"
          >
            <Trophy size={14} className="mr-1.5" />
            Ganho
          </Button>
          <Button
            onClick={handleLost}
            variant="destructive"
            className="flex-1 rounded-lg font-semibold"
          >
            <XCircle size={14} className="mr-1.5" />
            Perdido
          </Button>
        </div>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-1.5">
              <CheckSquare size={12} /> Tarefas
              {tasks.filter(t => t.status === "Pendente").length > 0 && (
                <span className="ml-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                  {tasks.filter(t => t.status === "Pendente").length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {(["pending", "done", "all"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTaskFilter(f)}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                      taskFilter === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {f === "pending" ? "Pendentes" : f === "done" ? "Concluídas" : "Todas"}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                onClick={() => setShowNewTask(v => !v)}
                className="bg-primary text-primary-foreground rounded-lg h-8"
              >
                <Plus size={14} className="mr-1" /> Nova tarefa
              </Button>
            </div>

            {showNewTask && (
              <div className="flex gap-2 p-2 border border-card-border rounded-lg bg-background">
                <Input
                  autoFocus
                  placeholder="Título da tarefa..."
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTask()}
                  className="bg-card border-card-border rounded-md h-8 text-sm"
                />
                <Button size="sm" onClick={addTask} className="rounded-md h-8">Salvar</Button>
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-card-border rounded-lg">
                <CheckSquare size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground mb-3">Nenhuma tarefa para este lead</p>
                <Button size="sm" variant="outline" onClick={() => setShowNewTask(true)} className="rounded-lg">
                  <Plus size={14} className="mr-1" /> Criar primeira tarefa
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map(t => {
                  const done = t.status === "Concluída";
                  const dueLabel = t.dueDate
                    ? new Date(t.dueDate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                    : "";
                  return (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-card-border bg-background hover:bg-secondary/40 transition-colors"
                    >
                      <Checkbox
                        checked={done}
                        onCheckedChange={() => toggleTask(t.id)}
                        className="mt-0.5 rounded-full"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {t.title}
                          </p>
                          {done && (
                            <Badge className="bg-success/15 text-success border-0 text-[10px] h-4">
                              Concluída
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {dueLabel && <span>{dueLabel}</span>}
                          {dueLabel && <span>·</span>}
                          <span className="inline-flex items-center gap-1">
                            <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center">
                              {t.responsible[0]}
                            </span>
                            {t.responsible}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="details" className="mt-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome completo</label>
              <Input
                value={lead.name}
                onChange={e => handleFieldChange("name", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Empresa</label>
              <Input
                value={lead.company || ""}
                onChange={e => handleFieldChange("company", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">WhatsApp</label>
              <div className="flex gap-2">
                <Input
                  value={lead.whatsapp}
                  onChange={e => handleFieldChange("whatsapp", e.target.value)}
                  className="bg-background border-card-border rounded-lg flex-1"
                />
                <a
                  href={`https://wa.me/${lead.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-success text-success-foreground hover:opacity-90"
                >
                  <MessageCircle size={16} />
                </a>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">E-mail</label>
              <Input
                value={lead.email || ""}
                onChange={e => handleFieldChange("email", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor do negócio</label>
              <Input
                type="number"
                value={lead.value}
                onChange={e => handleFieldChange("value", Number(e.target.value))}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Responsável</label>
              <Select
                value={lead.responsible}
                onValueChange={v => handleFieldChange("responsible", v)}
              >
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {teamMembers.map(m => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
              <Select value={lead.stage} onValueChange={handleStageChange}>
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {columns.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
              <Select
                value={lead.priority}
                onValueChange={v => handleFieldChange("priority", v)}
              >
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {(["Alta", "Média", "Baixa"] as Priority[]).map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Origem</label>
              <Select value={lead.origin} onValueChange={v => handleFieldChange("origin", v)}>
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {(["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"] as LeadOrigin[]).map(
                    o => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Próximo follow-up</label>
              <Input
                type="date"
                value={lead.nextFollowUp || ""}
                onChange={e => handleFieldChange("nextFollowUp", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
          </div>

          {/* Product link */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Produto vinculado</label>
            <Select
              value={lead.productId || "none"}
              onValueChange={v =>
                handleFieldChange("productId", v === "none" ? undefined : v)
              }
            >
              <SelectTrigger className="bg-background border-card-border rounded-lg">
                <SelectValue placeholder="Sem produto" />
              </SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                <SelectItem value="none">Sem produto</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Anotações</label>
            <Textarea
              value={lead.notes}
              onChange={e => handleFieldChange("notes", e.target.value)}
              className="bg-background border-card-border rounded-lg min-h-[80px]"
            />
          </div>

          {/* Activity history */}
          <div className="border-t border-card-border pt-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">
              Histórico de atividades
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {lead.activities.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma atividade registrada.
                </p>
              )}
              {[...lead.activities].reverse().map(act => {
                const meta = ACTIVITY_META[act.type] || ACTIVITY_META.note;
                const Icon = meta.icon;
                return (
                  <div
                    key={act.id}
                    className="flex gap-2 items-start text-xs p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${meta.tone}`}
                    >
                      <Icon size={13} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground leading-snug">{act.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {meta.label} ·{" "}
                        {new Date(act.date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova anotação..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="bg-background border-card-border rounded-lg flex-1"
                onKeyDown={e => e.key === "Enter" && handleSaveNote()}
              />
              <Button onClick={handleSaveNote} size="sm" className="rounded-lg">
                Salvar
              </Button>
            </div>
          </div>
        </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
