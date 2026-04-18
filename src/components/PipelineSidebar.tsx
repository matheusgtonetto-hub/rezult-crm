import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { ChevronDown, ChevronRight, Filter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { PipelineCategory } from "@/data/mockData";

const ALL_CATEGORIES: PipelineCategory[] = ["Venda", "Follow-up", "Operações"];

export function PipelineSidebar() {
  const { pipelines, activePipelineId, setActivePipelineId, addPipeline } = useCRM();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Venda: true,
    "Follow-up": true,
    "Operações": true,
  });
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<PipelineCategory>("Venda");

  const toggleGroup = (cat: string) =>
    setOpenGroups(prev => ({ ...prev, [cat]: !prev[cat] }));

  const grouped = ALL_CATEGORIES.map(cat => ({
    cat,
    items: pipelines.filter(p => p.category === cat),
  }));

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("Informe o nome da pipeline.");
      return;
    }
    const id = `pipe-${Date.now()}`;
    addPipeline({
      id,
      name: newName.trim(),
      category: newCategory,
      columns: [
        { id: `${id}-novo`, title: "Novo", color: "#AAAAAA", leadIds: [] },
        { id: `${id}-andamento`, title: "Em andamento", color: "#378ADD", leadIds: [] },
        { id: `${id}-fechado`, title: "Fechado", color: "#0F6E56", leadIds: [] },
      ],
    });
    setActivePipelineId(id);
    setNewName("");
    setShowNew(false);
    toast.success("Pipeline criada!");
  };

  return (
    <aside className="w-60 shrink-0 border-r border-card-border bg-secondary/30 flex flex-col">
      <div className="p-3 border-b border-card-border">
        <Button
          onClick={() => setShowNew(true)}
          variant="outline"
          size="sm"
          className="w-full justify-start rounded-lg border-card-border bg-card font-medium"
        >
          <Plus size={14} className="mr-2" />
          Nova pipeline
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {grouped.map(group => (
          <div key={group.cat}>
            <button
              onClick={() => toggleGroup(group.cat)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {openGroups[group.cat] ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              {group.cat}
              <span className="ml-auto text-muted-foreground/70">{group.items.length}</span>
            </button>

            {openGroups[group.cat] && (
              <div className="space-y-0.5 mb-1">
                {group.items.length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground italic">
                    Sem pipelines
                  </p>
                )}
                {group.items.map(p => {
                  const active = p.id === activePipelineId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActivePipelineId(p.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-foreground hover:bg-secondary"
                      }`}
                    >
                      <Filter
                        size={14}
                        className={active ? "text-primary" : "text-muted-foreground"}
                      />
                      <span className="truncate text-left flex-1">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="bg-card border-card-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: Pós-venda"
                className="bg-background border-card-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Categoria</label>
              <Select
                value={newCategory}
                onValueChange={v => setNewCategory(v as PipelineCategory)}
              >
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {ALL_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)} className="rounded-lg">
              Cancelar
            </Button>
            <Button onClick={handleCreate} className="rounded-lg font-semibold">
              Criar pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
