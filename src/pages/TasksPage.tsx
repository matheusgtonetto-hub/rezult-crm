import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, CheckSquare, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Filter = "today" | "week" | "all" | "done";

export default function TasksPage() {
  const { tasks, updateTask, addTask, leads, teamMembers } = useCRM();
  const [filter, setFilter] = useState<Filter>("all");
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLeadId, setNewLeadId] = useState("");
  const [newResp, setNewResp] = useState(teamMembers[0]);
  const [newDate, setNewDate] = useState("");

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

  const filtered = tasks.filter(t => {
    if (filter === "done") return t.status === "Concluída";
    if (filter === "today") return t.status === "Pendente" && t.dueDate.split("T")[0] === today;
    if (filter === "week") return t.status === "Pendente" && t.dueDate.split("T")[0] <= weekEnd;
    return true;
  });

  const isOverdue = (t: typeof tasks[0]) => t.status === "Pendente" && t.dueDate < now.toISOString();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newLeadId || !newDate) { toast.error("Preencha todos os campos."); return; }
    const lead = leads[newLeadId];
    addTask({ id: `t-${Date.now()}`, title: newTitle, leadId: newLeadId, leadName: lead?.name || "", responsible: newResp, dueDate: newDate, status: "Pendente" });
    toast.success("Tarefa criada!"); setShowNew(false); setNewTitle(""); setNewDate("");
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "today", label: "Hoje" }, { key: "week", label: "Esta semana" },
    { key: "all", label: "Todas" }, { key: "done", label: "Concluídas" },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">Tarefas</h1>
        <Button onClick={() => setShowNew(true)} className="rounded-lg font-semibold"><Plus size={16} className="mr-1" /> Nova Tarefa</Button>
      </div>
      <div className="flex gap-2 mb-4">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground border border-card-border"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CheckSquare size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhuma tarefa encontrada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
            <div key={task.id} className={`flex items-center gap-4 bg-card border rounded-lg p-4 transition-colors ${isOverdue(task) ? "border-destructive/50" : "border-card-border"}`}>
              <Checkbox
                checked={task.status === "Concluída"}
                onCheckedChange={checked => {
                  updateTask(task.id, { status: checked ? "Concluída" : "Pendente" });
                  toast.success(checked ? "Tarefa concluída!" : "Tarefa reaberta.");
                }}
                className="border-muted-foreground data-[state=checked]:bg-success data-[state=checked]:border-success"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${task.status === "Concluída" ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {task.leadName} · {task.responsible} · {new Date(task.dueDate).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {isOverdue(task) && <AlertCircle size={16} className="text-destructive shrink-0" />}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="bg-card border-card-border sm:max-w-md">
          <DialogHeader><DialogTitle className="text-foreground">Nova Tarefa</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <Input placeholder="Título da tarefa" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="bg-background border-card-border rounded-lg" />
            <Select value={newLeadId} onValueChange={setNewLeadId}>
              <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue placeholder="Lead vinculado" /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                {Object.values(leads).map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newResp} onValueChange={setNewResp}>
              <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-card-border">{teamMembers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="datetime-local" value={newDate} onChange={e => setNewDate(e.target.value)} className="bg-background border-card-border rounded-lg" />
            <Button type="submit" className="w-full rounded-lg font-semibold">Criar Tarefa</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
