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
  CalendarDays,
  Phone,
  Mail,
  RefreshCw,
  Check,
  Link,
  X,
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
  whatsapp: { icon: MessageCircle, tone: "text-emerald-500 bg-emerald-500/10", label: "WhatsApp" },
  won: { icon: Trophy, tone: "text-success bg-success/10", label: "Ganho" },
  lost: { icon: XCircle, tone: "text-destructive bg-destructive/10", label: "Perdido" },
  created: { icon: PlusCircle, tone: "text-muted-foreground bg-muted", label: "Criado" },
  meeting: { icon: CalendarDays, tone: "text-blue-500 bg-blue-500/10", label: "Reunião" },
  call: { icon: Phone, tone: "text-green-500 bg-green-500/10", label: "Ligação" },
  email: { icon: Mail, tone: "text-orange-500 bg-orange-500/10", label: "E-mail" },
  follow_up: { icon: RefreshCw, tone: "text-purple-500 bg-purple-500/10", label: "Follow-up" },
  task: { icon: CheckSquare, tone: "text-muted-foreground bg-muted", label: "Tarefa" },
};

export function LeadDrawer({ leadId, open, onClose }: Props) {
  const {
    leads,
    updateLead,
    columns,
    teamMembers,
    addActivity,
    completeActivity,
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
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [actTitle, setActTitle] = useState("");
  const [actType, setActType] = useState<ActivityType>("meeting");
  const [actScheduledAt, setActScheduledAt] = useState("");
  const [actEmail, setActEmail] = useState("");
  const [actMeetLink, setActMeetLink] = useState("");
  const [actDescription, setActDescription] = useState("");

  const SCHED_TYPES: { type: ActivityType; icon: typeof CalendarDays; label: string }[] = [
    { type: "meeting", icon: CalendarDays, label: "Reunião" },
    { type: "call", icon: Phone, label: "Ligação" },
    { type: "whatsapp", icon: MessageCircle, label: "WhatsApp" },
    { type: "email", icon: Mail, label: "E-mail" },
    { type: "follow_up", icon: RefreshCw, label: "Follow-up" },
  ];

  const openNewActivity = () => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
    setActScheduledAt(d.toISOString().slice(0, 16));
    setActEmail(lead.email ?? "");
    setActTitle("");
    setActType("meeting");
    setActMeetLink("");
    setActDescription("");
    setShowNewActivity(true);
  };

  const handleCreateActivity = () => {
    if (!actTitle.trim() || !actScheduledAt) return;
    addActivity(leadId, {
      date: new Date().toISOString(),
      type: actType,
      title: actTitle.trim(),
      description: actDescription,
      scheduledAt: actScheduledAt,
      contactEmail: actEmail || undefined,
      meetLink: actMeetLink || undefined,
    });
    setShowNewActivity(false);
    toast.success("Atividade criada!");
  };

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
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">
                Histórico de atividades
              </h4>
              {!showNewActivity && (
                <Button
                  size="sm"
                  onClick={openNewActivity}
                  className="h-7 rounded-lg text-xs"
                >
                  <Plus size={12} className="mr-1" />
                  Nova atividade
                </Button>
              )}
            </div>

            {showNewActivity && (
              <div className="mb-4 p-3 rounded-lg border border-card-border bg-background space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Nova atividade</p>
                  <button onClick={() => setShowNewActivity(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Título</label>
                  <Input
                    autoFocus
                    placeholder="Ex: Reunião de apresentação"
                    value={actTitle}
                    onChange={e => setActTitle(e.target.value)}
                    className="bg-card border-card-border rounded-lg h-8 text-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground mb-1.5 block">Tipo</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {SCHED_TYPES.map(({ type: t, icon: Icon, label }) => (
                      <button
                        key={t}
                        onClick={() => setActType(t)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium transition-colors ${
                          actType === t
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-card-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <Icon size={11} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Data e hora</label>
                  <Input
                    type="datetime-local"
                    value={actScheduledAt}
                    onChange={e => setActScheduledAt(e.target.value)}
                    className="bg-card border-card-border rounded-lg h-8 text-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">E-mail do contato</label>
                  <Input
                    type="email"
                    placeholder="contato@empresa.com"
                    value={actEmail}
                    onChange={e => setActEmail(e.target.value)}
                    className="bg-card border-card-border rounded-lg h-8 text-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Link do Meet / Zoom</label>
                  <Input
                    type="url"
                    placeholder="https://meet.google.com/..."
                    value={actMeetLink}
                    onChange={e => setActMeetLink(e.target.value)}
                    className="bg-card border-card-border rounded-lg h-8 text-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Descrição</label>
                  <Textarea
                    placeholder="Detalhes da atividade..."
                    value={actDescription}
                    onChange={e => setActDescription(e.target.value)}
                    className="bg-card border-card-border rounded-lg min-h-[60px] resize-none text-sm"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewActivity(false)}
                    className="rounded-lg border-card-border flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateActivity}
                    disabled={!actTitle.trim() || !actScheduledAt}
                    className="rounded-lg flex-1"
                  >
                    <Check size={12} className="mr-1" />
                    Criar atividade
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
              {lead.activities.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma atividade registrada.
                </p>
              )}
              {[...lead.activities].reverse().map(act => {
                const meta = ACTIVITY_META[act.type] || ACTIVITY_META.note;
                const Icon = meta.icon;
                const isScheduled = !!act.scheduledAt;
                const now = new Date();
                const scheduledDate = act.scheduledAt ? new Date(act.scheduledAt) : null;
                const isCompleted = !!act.completedAt;
                const isOverdue = isScheduled && !isCompleted && scheduledDate! < now;

                return (
                  <div
                    key={act.id}
                    className="flex gap-2 items-start text-xs p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    {isScheduled ? (
                      <button
                        title={isCompleted ? "Realizada" : "Marcar como realizada"}
                        disabled={isCompleted}
                        onClick={() => !isCompleted && completeActivity(leadId!, act.id)}
                        className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all
                          ${isCompleted
                            ? "bg-green-500 border-green-500 text-white cursor-default"
                            : isOverdue
                              ? "bg-transparent border-destructive hover:bg-destructive/10 cursor-pointer"
                              : "bg-transparent border-muted-foreground/40 hover:border-muted-foreground cursor-pointer"
                          }`}
                      >
                        {isCompleted && <Check size={12} />}
                      </button>
                    ) : (
                      <span
                        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${meta.tone}`}
                      >
                        <Icon size={13} />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground leading-snug font-medium">
                        {act.title || act.description}
                      </p>
                      {act.title && act.description && (
                        <p className="text-muted-foreground leading-snug mt-0.5">{act.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">
                          {meta.label}
                          {scheduledDate
                            ? ` · ${scheduledDate.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                            : ` · ${new Date(act.date).toLocaleDateString("pt-BR")}`
                          }
                        </span>
                        {isOverdue && !isCompleted && (
                          <span className="text-[10px] text-destructive font-medium">Vencida</span>
                        )}
                        {isCompleted && (
                          <span className="text-[10px] text-green-500 font-medium">Realizada</span>
                        )}
                        {act.meetLink && (
                          <a
                            href={act.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                          >
                            <Link size={9} />
                            Link
                          </a>
                        )}
                      </div>
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
