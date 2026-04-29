import { useEffect, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { ChevronDown, ChevronRight, Filter, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const DEFAULT_COLUMNS = [
  { id: "col-novo", title: "Novo", color: "#AAAAAA" },
  { id: "col-andamento", title: "Em andamento", color: "#378ADD" },
  { id: "col-fechado", title: "Fechado", color: "#128A68" },
];

export function PipelineSidebar() {
  const {
    pipelines,
    activePipelineId,
    setActivePipelineId,
    addPipeline,
    pipelineGroups,
    addPipelineGroup,
  } = useCRM();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [creatingNewGroup, setCreatingNewGroup] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState("");
  const [creating, setCreating] = useState(false);

  // Auto-expand any group that doesn't yet have an entry
  useEffect(() => {
    setOpenGroups(prev => {
      const next = { ...prev };
      pipelineGroups.forEach(g => {
        if (!(g.name in next)) next[g.name] = true;
      });
      return next;
    });
  }, [pipelineGroups]);

  const toggleGroup = (cat: string) =>
    setOpenGroups(prev => ({ ...prev, [cat]: prev[cat] === false ? true : false }));

  const grouped = pipelineGroups.map(g => ({
    groupId: g.id,
    cat: g.name,
    items: pipelines.filter(p => p.category === g.name),
  }));

  // Pipelines whose group no longer exists
  const orphanPipelines = pipelines.filter(
    p => !pipelineGroups.some(g => g.name === p.category)
  );

  const closeNewDialog = () => {
    setShowNew(false);
    setNewName("");
    setNewDesc("");
    setNewCategory("");
    setShowGroupPicker(false);
    setCreatingNewGroup(false);
    setNewGroupInput("");
  };

  const handleCreateGroup = async () => {
    if (!newGroupInput.trim()) { toast.error("Informe o nome do grupo."); return; }
    const ok = await addPipelineGroup(newGroupInput.trim());
    if (ok) {
      setNewCategory(newGroupInput.trim());
      setNewGroupInput("");
      setCreatingNewGroup(false);
      setShowGroupPicker(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Informe o nome da pipeline."); return; }
    if (!newCategory) { toast.error("Selecione ou crie um grupo."); return; }
    setCreating(true);
    await addPipeline(newName.trim(), newCategory, DEFAULT_COLUMNS, newDesc.trim());
    setCreating(false);
    closeNewDialog();
    toast.success("Pipeline criada!");
  };

  return (
    <aside className="w-60 h-full shrink-0 bg-card flex flex-col shadow-rail relative z-10">
      <div className="px-4 pt-4 pb-3 border-b border-card-border space-y-3">
        <p className="text-base font-semibold text-foreground tracking-tight text-center">Pipelines</p>
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
        {pipelines.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground italic text-center">
            Nenhuma pipeline ainda.
            <br />Clique em "Nova pipeline" para começar.
          </p>
        )}
        {grouped.map(group => (
          <div key={group.groupId}>
            <button
              onClick={() => toggleGroup(group.cat)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {openGroups[group.cat] !== false ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {group.cat}
              <span className="ml-auto text-muted-foreground/70">{group.items.length}</span>
            </button>

            {openGroups[group.cat] !== false && (
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
                          ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                          : "text-foreground hover:bg-[#F8F9FA]"
                      }`}
                    >
                      <Filter size={14} className={active ? "text-primary" : "text-muted-foreground"} />
                      <span className="truncate text-left flex-1">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {orphanPipelines.length > 0 && (
          <div>
            <p className="px-2 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Outros
            </p>
            <div className="space-y-0.5 mb-1">
              {orphanPipelines.map(p => {
                const active = p.id === activePipelineId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePipelineId(p.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary"
                        : "text-foreground hover:bg-[#F8F9FA]"
                    }`}
                  >
                    <Filter size={14} className={active ? "text-primary" : "text-muted-foreground"} />
                    <span className="truncate text-left flex-1">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={(o) => !o && closeNewDialog()}>
        <DialogContent className="bg-card border-card-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <label className="text-xs text-muted-foreground mb-1 block">Descrição</label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Descreva o propósito desta pipeline"
                className="bg-background border-card-border rounded-lg resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Grupo</label>
              {/* Trigger */}
              <button
                type="button"
                onClick={() => { setShowGroupPicker(v => !v); setCreatingNewGroup(false); setNewGroupInput(""); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm bg-background transition-colors ${
                  showGroupPicker ? "border-primary ring-1 ring-primary/20" : "border-card-border hover:border-foreground/30"
                }`}
              >
                <span className={newCategory ? "text-foreground" : "text-muted-foreground"}>
                  {newCategory || "Selecione ou crie um grupo"}
                </span>
                <ChevronDown size={14} className="text-muted-foreground shrink-0" />
              </button>

              {/* Picker panel */}
              {showGroupPicker && (
                <div className="mt-1 rounded-lg border border-card-border bg-card shadow-md overflow-hidden">
                  {pipelineGroups.length === 0 && !creatingNewGroup && (
                    <p className="px-3 py-2 text-xs text-muted-foreground italic">Nenhum grupo ainda.</p>
                  )}
                  {pipelineGroups.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => { setNewCategory(g.name); setShowGroupPicker(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left ${
                        newCategory === g.name ? "bg-primary/5 text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      <span>{g.name}</span>
                      {newCategory === g.name && <span className="text-xs text-primary">✓</span>}
                    </button>
                  ))}

                  <div className="border-t border-card-border">
                    {!creatingNewGroup ? (
                      <button
                        type="button"
                        onClick={() => setCreatingNewGroup(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors"
                      >
                        <Plus size={12} /> Criar grupo
                      </button>
                    ) : (
                      <div className="p-2 flex gap-1.5 items-center">
                        <Input
                          value={newGroupInput}
                          onChange={e => setNewGroupInput(e.target.value)}
                          placeholder="Nome do grupo"
                          className="h-7 text-xs rounded-md flex-1"
                          onKeyDown={e => { if (e.key === "Enter") handleCreateGroup(); }}
                          autoFocus
                        />
                        <Button size="sm" className="h-7 text-xs rounded-md px-2 shrink-0" onClick={handleCreateGroup}>
                          Criar
                        </Button>
                        <button
                          type="button"
                          onClick={() => { setCreatingNewGroup(false); setNewGroupInput(""); }}
                          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeNewDialog} className="rounded-lg">
              Cancelar
            </Button>
            <Button onClick={handleCreate} className="rounded-lg font-semibold" disabled={creating}>
              {creating ? "Criando..." : "Criar pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
