import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GripVertical, Plus, Trash2 } from "lucide-react";

export default function SettingsPage() {
  const { columns, setColumns } = useCRM();
  const [companyName, setCompanyName] = useState("Minha Empresa");
  const [newColName, setNewColName] = useState("");

  const addColumn = () => {
    if (!newColName.trim()) return;
    setColumns([...columns, { id: `col-${Date.now()}`, title: newColName.trim(), leadIds: [] }]);
    setNewColName("");
    toast.success("Etapa adicionada!");
  };

  const removeColumn = (id: string) => {
    const col = columns.find(c => c.id === id);
    if (col && col.leadIds.length > 0) { toast.error("Remova os leads desta etapa primeiro."); return; }
    setColumns(columns.filter(c => c.id !== id));
    toast.success("Etapa removida!");
  };

  const renameColumn = (id: string, newTitle: string) => {
    setColumns(columns.map(c => c.id === id ? { ...c, title: newTitle } : c));
  };

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-foreground">Configurações</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Dados da empresa</h2>
        <Input value={companyName} onChange={e => setCompanyName(e.target.value)} className="bg-card border-card-border rounded-lg max-w-sm" />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Etapas do pipeline</h2>
        <div className="space-y-2">
          {columns.map(col => (
            <div key={col.id} className="flex items-center gap-2 bg-card border border-card-border rounded-lg px-3 py-2">
              <GripVertical size={14} className="text-muted-foreground" />
              <Input value={col.title} onChange={e => renameColumn(col.id, e.target.value)} className="bg-transparent border-0 p-0 h-auto text-sm text-foreground focus-visible:ring-0" />
              <span className="text-xs text-muted-foreground">{col.leadIds.length}</span>
              <button onClick={() => removeColumn(col.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Nova etapa..." value={newColName} onChange={e => setNewColName(e.target.value)} className="bg-card border-card-border rounded-lg max-w-xs" onKeyDown={e => e.key === "Enter" && addColumn()} />
          <Button onClick={addColumn} variant="outline" size="sm" className="rounded-lg border-card-border"><Plus size={14} /></Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Alterar senha</h2>
        <Input type="password" placeholder="Senha atual" className="bg-card border-card-border rounded-lg max-w-sm" />
        <Input type="password" placeholder="Nova senha" className="bg-card border-card-border rounded-lg max-w-sm" />
        <Button onClick={() => toast.success("Senha alterada!")} className="rounded-lg font-semibold">Salvar</Button>
      </section>
    </div>
  );
}
