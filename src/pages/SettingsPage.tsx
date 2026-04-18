import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  GripVertical, Plus, Trash2, Pencil, MessageSquare, CreditCard, Calendar,
  Building2, Package, UsersRound, Workflow, Mail,
} from "lucide-react";
import { Pipeline, PipelineCategory } from "@/data/mockData";

const STAGE_COLORS = ["#AAAAAA", "#378ADD", "#F59E0B", "#8B5CF6", "#0F6E56", "#E24B4A", "#EC4899", "#06B6D4"];

export default function SettingsPage() {
  const {
    pipelines, addPipeline, updatePipeline, deletePipeline,
    activePipelineId, setActivePipelineId,
    columns, setColumns,
    products, teamMembers, memberColors,
  } = useCRM();

  const [companyName, setCompanyName] = useState("Minha Empresa");
  const [newColName, setNewColName] = useState("");
  const [newPipeOpen, setNewPipeOpen] = useState(false);
  const [newPipeName, setNewPipeName] = useState("");
  const [newPipeCategory, setNewPipeCategory] = useState<PipelineCategory>("Venda");
  const [editingPipe, setEditingPipe] = useState<Pipeline | null>(null);

  const addColumn = () => {
    if (!newColName.trim()) return;
    setColumns([...columns, { id: `col-${Date.now()}`, title: newColName.trim(), color: STAGE_COLORS[0], leadIds: [] }]);
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

  const recolorColumn = (id: string, color: string) => {
    setColumns(columns.map(c => c.id === id ? { ...c, color } : c));
  };

  const handleCreatePipeline = () => {
    if (!newPipeName.trim()) return;
    const id = `pipe-${Date.now()}`;
    addPipeline({
      id, name: newPipeName.trim(), category: newPipeCategory,
      columns: [
        { id: `${id}-c1`, title: "Novo", color: STAGE_COLORS[0], leadIds: [] },
        { id: `${id}-c2`, title: "Em andamento", color: STAGE_COLORS[1], leadIds: [] },
        { id: `${id}-c3`, title: "Concluído", color: STAGE_COLORS[4], leadIds: [] },
      ],
    });
    setNewPipeName(""); setNewPipeOpen(false);
    toast.success("Pipeline criada!");
  };

  const handleDeletePipeline = (p: Pipeline) => {
    const hasLeads = p.columns.some(c => c.leadIds.length > 0);
    if (hasLeads) { toast.error("Mova ou exclua os leads desta pipeline primeiro."); return; }
    if (pipelines.length <= 1) { toast.error("Você precisa ter pelo menos uma pipeline."); return; }
    deletePipeline(p.id);
    if (activePipelineId === p.id) setActivePipelineId(pipelines.find(x => x.id !== p.id)!.id);
    toast.success("Pipeline removida!");
  };

  const integrations = [
    { name: "WhatsApp", description: "Envie e receba mensagens direto do CRM.", icon: MessageSquare },
    { name: "Asaas", description: "Cobranças e histórico financeiro automatizados.", icon: CreditCard },
    { name: "Google Calendar", description: "Sincronize tarefas e reuniões com seu calendário.", icon: Calendar },
  ];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Configurações</h1>

      <Tabs defaultValue="empresa" className="space-y-6">
        <TabsList className="bg-card border border-card-border rounded-lg flex-wrap h-auto">
          <TabsTrigger value="empresa" className="rounded-md"><Building2 size={14} className="mr-1.5" />Empresa</TabsTrigger>
          <TabsTrigger value="pipelines" className="rounded-md"><Workflow size={14} className="mr-1.5" />Pipelines</TabsTrigger>
          <TabsTrigger value="produtos" className="rounded-md"><Package size={14} className="mr-1.5" />Produtos</TabsTrigger>
          <TabsTrigger value="equipe" className="rounded-md"><UsersRound size={14} className="mr-1.5" />Equipe</TabsTrigger>
          <TabsTrigger value="integracoes" className="rounded-md"><Plus size={14} className="mr-1.5" />Integrações</TabsTrigger>
        </TabsList>

        {/* EMPRESA */}
        <TabsContent value="empresa" className="space-y-6 mt-0">
          <section className="bg-card border border-card-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Dados da empresa</h2>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} className="bg-background border-card-border rounded-lg max-w-sm" />
          </section>

          <section className="bg-card border border-card-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Alterar senha</h2>
            <Input type="password" placeholder="Senha atual" className="bg-background border-card-border rounded-lg max-w-sm" />
            <Input type="password" placeholder="Nova senha" className="bg-background border-card-border rounded-lg max-w-sm" />
            <Button onClick={() => toast.success("Senha alterada!")} className="rounded-lg font-semibold">Salvar</Button>
          </section>
        </TabsContent>

        {/* PIPELINES */}
        <TabsContent value="pipelines" className="space-y-6 mt-0">
          <section className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Suas pipelines</h2>
              <Dialog open={newPipeOpen} onOpenChange={setNewPipeOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-lg"><Plus size={14} className="mr-1" />Nova pipeline</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nova pipeline</DialogTitle></DialogHeader>
                  <div className="space-y-3 py-2">
                    <Input placeholder="Nome da pipeline" value={newPipeName} onChange={e => setNewPipeName(e.target.value)} />
                    <Select value={newPipeCategory} onValueChange={(v) => setNewPipeCategory(v as PipelineCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Venda">Venda</SelectItem>
                        <SelectItem value="Follow-up">Follow-up</SelectItem>
                        <SelectItem value="Operações">Operações</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setNewPipeOpen(false)}>Cancelar</Button>
                    <Button onClick={handleCreatePipeline}>Criar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              {pipelines.map(p => (
                <div key={p.id} className={`flex items-center gap-2 bg-background border rounded-lg px-3 py-2.5 ${activePipelineId === p.id ? "border-primary" : "border-card-border"}`}>
                  <button onClick={() => setActivePipelineId(p.id)} className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category} · {p.columns.length} etapas · {p.columns.reduce((s, c) => s + c.leadIds.length, 0)} leads</p>
                  </button>
                  {activePipelineId === p.id && <Badge variant="secondary" className="text-xs">Ativa</Badge>}
                  <button onClick={() => setEditingPipe(p)} className="text-muted-foreground hover:text-foreground p-1"><Pencil size={14} /></button>
                  <button onClick={() => handleDeletePipeline(p)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Edit dialog */}
          <Dialog open={!!editingPipe} onOpenChange={(o) => !o && setEditingPipe(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Renomear pipeline</DialogTitle></DialogHeader>
              {editingPipe && (
                <div className="space-y-3 py-2">
                  <Input value={editingPipe.name} onChange={e => setEditingPipe({ ...editingPipe, name: e.target.value })} />
                  <Select value={editingPipe.category} onValueChange={(v) => setEditingPipe({ ...editingPipe, category: v as PipelineCategory })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Venda">Venda</SelectItem>
                      <SelectItem value="Follow-up">Follow-up</SelectItem>
                      <SelectItem value="Operações">Operações</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingPipe(null)}>Cancelar</Button>
                <Button onClick={() => {
                  if (editingPipe) {
                    updatePipeline(editingPipe.id, { name: editingPipe.name, category: editingPipe.category });
                    toast.success("Pipeline atualizada!");
                    setEditingPipe(null);
                  }
                }}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Stages of active pipeline */}
          <section className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Etapas da pipeline ativa</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Editando: {pipelines.find(p => p.id === activePipelineId)?.name}</p>
            </div>
            <div className="space-y-2">
              {columns.map(col => (
                <div key={col.id} className="flex items-center gap-2 bg-background border border-card-border rounded-lg px-3 py-2">
                  <GripVertical size={14} className="text-muted-foreground" />
                  <div className="flex gap-1">
                    {STAGE_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => recolorColumn(col.id, c)}
                        className={`w-4 h-4 rounded-full border-2 transition-all ${col.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                        aria-label={`Cor ${c}`}
                      />
                    ))}
                  </div>
                  <Input value={col.title} onChange={e => renameColumn(col.id, e.target.value)} className="bg-transparent border-0 p-0 h-auto text-sm text-foreground focus-visible:ring-0 flex-1" />
                  <span className="text-xs text-muted-foreground">{col.leadIds.length}</span>
                  <button onClick={() => removeColumn(col.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Nova etapa..." value={newColName} onChange={e => setNewColName(e.target.value)} className="bg-background border-card-border rounded-lg max-w-xs" onKeyDown={e => e.key === "Enter" && addColumn()} />
              <Button onClick={addColumn} variant="outline" size="sm" className="rounded-lg border-card-border"><Plus size={14} /></Button>
            </div>
          </section>
        </TabsContent>

        {/* PRODUTOS */}
        <TabsContent value="produtos" className="space-y-6 mt-0">
          <section className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Produtos cadastrados</h2>
              <Button size="sm" className="rounded-lg" onClick={() => toast.info("Em breve: cadastro de produtos.")}>
                <Plus size={14} className="mr-1" />Novo produto
              </Button>
            </div>
            <div className="space-y-2">
              {products.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-background border border-card-border rounded-lg px-3 py-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package size={16} className="text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.defaultValue)}
                  </span>
                  <button className="text-muted-foreground hover:text-foreground p-1"><Pencil size={14} /></button>
                  <button className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        {/* EQUIPE */}
        <TabsContent value="equipe" className="space-y-6 mt-0">
          <section className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Membros da equipe</h2>
              <Button size="sm" className="rounded-lg" onClick={() => toast.info("Em breve: convite de membros.")}>
                <Plus size={14} className="mr-1" />Convidar
              </Button>
            </div>
            <div className="space-y-2">
              {teamMembers.map(m => (
                <div key={m} className="flex items-center gap-3 bg-background border border-card-border rounded-lg px-3 py-2.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                    style={{ backgroundColor: memberColors[m] || "#888" }}
                  >
                    {m[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{m}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail size={11} />{m.toLowerCase()}@empresa.com
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">Atendente</Badge>
                  <button className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        {/* INTEGRAÇÕES */}
        <TabsContent value="integracoes" className="space-y-6 mt-0">
          <section className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Integrações disponíveis</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {integrations.map(i => (
                <div key={i.name} className="bg-background border border-card-border rounded-lg p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <i.icon size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{i.name}</p>
                      <Badge variant="secondary" className="text-[10px] h-5">Em breve</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{i.description}</p>
                    <Button size="sm" variant="outline" className="mt-3 h-7 text-xs rounded-md" disabled>
                      Conectar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
