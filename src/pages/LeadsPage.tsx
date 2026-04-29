import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Lead } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, MoreHorizontal, Pencil, Briefcase, MessageSquare, Trash2, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { LeadModal } from "@/components/LeadModal";
import { toast } from "sonner";

export default function LeadsPage() {
  const { leads, columns, pipelines, teamMembers, deleteLead, addLead, nextDealNumber } = useCRM();

  const [search, setSearch] = useState("");
  const [filterResp, setFilterResp] = useState("all");
  const [filterStage, setFilterStage] = useState("all");

  // Lead modal (create / edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);

  // Create deal modal
  const [dealTarget, setDealTarget] = useState<Lead | null>(null);
  const [dealPipeline, setDealPipeline] = useState("");
  const [dealStage, setDealStage] = useState("");

  const allLeads = Object.values(leads);
  const filtered = allLeads.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterResp !== "all" && l.responsible !== filterResp) return false;
    if (filterStage !== "all" && l.stage !== filterStage) return false;
    return true;
  });

  const colName = (id: string) => {
    for (const p of pipelines) {
      const col = p.columns.find(c => c.id === id);
      if (col) return col.title;
    }
    return columns.find(c => c.id === id)?.title || id;
  };

  const openCreate = () => { setEditingLead(null); setModalOpen(true); };
  const openEdit = (lead: Lead) => { setEditingLead(lead); setModalOpen(true); };

  const openWhatsApp = (lead: Lead) => {
    const number = (lead.phoneDdi ?? "+55").replace("+", "") + lead.whatsapp.replace(/\D/g, "");
    window.open(`https://wa.me/${number}`, "_blank", "noopener");
  };

  const openDeal = (lead: Lead) => {
    setDealTarget(lead);
    const p = pipelines[0];
    setDealPipeline(p?.id ?? "");
    setDealStage(p?.columns[0]?.id ?? "");
  };

  const confirmDeal = async () => {
    if (!dealTarget || !dealPipeline || !dealStage) return;
    await addLead({
      ...dealTarget,
      id: undefined as unknown as string,
      dealNumber: nextDealNumber(),
      pipelineId: dealPipeline,
      stage: dealStage,
      activities: [{
        id: `a-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        type: "created",
        description: `Negócio criado a partir do lead ${dealTarget.name}.`,
      }],
    });
    toast.success("Negócio criado!");
    setDealTarget(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteLead(deleteTarget.id);
    toast.success("Lead removido.");
    setDeleteTarget(null);
  };

  const dealPipelineObj = pipelines.find(p => p.id === dealPipeline);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Consulte, crie, modifique ou remova seus leads
          </p>
        </div>
        <Button onClick={openCreate} className="rounded-lg font-semibold">
          <Plus size={16} className="mr-1" /> Novo Lead
        </Button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Input
          placeholder="Buscar por nome ou empresa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-card border-card-border rounded-lg max-w-xs"
        />
        <Select value={filterResp} onValueChange={setFilterResp}>
          <SelectTrigger className="bg-card border-card-border rounded-lg w-40">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent className="bg-card border-card-border">
            <SelectItem value="all">Todos</SelectItem>
            {teamMembers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="bg-card border-card-border rounded-lg w-44">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent className="bg-card border-card-border">
            <SelectItem value="all">Todas</SelectItem>
            {columns.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum lead encontrado.</p>
          <Button onClick={openCreate} variant="outline" className="mt-4">
            <Plus size={14} className="mr-1" /> Criar primeiro lead
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-card-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">Empresa</TableHead>
                <TableHead className="text-muted-foreground">WhatsApp</TableHead>
                <TableHead className="text-muted-foreground">Etapa</TableHead>
                <TableHead className="text-muted-foreground">Responsável</TableHead>
                <TableHead className="text-muted-foreground w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(lead => (
                <TableRow key={lead.id} className="border-card-border hover:bg-secondary/50">
                  <TableCell className="font-medium text-foreground">{lead.name}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.company || "—"}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => openWhatsApp(lead)}
                      className="text-success hover:underline flex items-center gap-1.5 text-sm"
                    >
                      <WhatsAppIcon size={16} />
                      {lead.phoneDdi && lead.phoneDdi !== "+55" ? `${lead.phoneDdi} ` : ""}
                      {lead.whatsapp || "—"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      {colName(lead.stage)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.responsible || "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                          <MoreHorizontal size={16} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openEdit(lead)}>
                          <Pencil size={14} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDeal(lead)}>
                          <Briefcase size={14} className="mr-2" /> Criar negócio
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openWhatsApp(lead)}>
                          <MessageSquare size={14} className="mr-2" /> Abrir Chat
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(lead)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 size={14} className="mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Lead Modal */}
      <LeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editLead={editingLead}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Deal Modal */}
      <Dialog open={!!dealTarget} onOpenChange={v => !v && setDealTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar negócio</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Vincule <strong>{dealTarget?.name}</strong> a um pipeline e etapa.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pipeline</label>
              <Select
                value={dealPipeline}
                onValueChange={v => {
                  setDealPipeline(v);
                  const p = pipelines.find(x => x.id === v);
                  setDealStage(p?.columns[0]?.id ?? "");
                }}
              >
                <SelectTrigger className="border-card-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
              <Select value={dealStage} onValueChange={setDealStage}>
                <SelectTrigger className="border-card-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(dealPipelineObj?.columns ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDealTarget(null)}>Cancelar</Button>
            <Button onClick={confirmDeal} className="bg-[#128A68] hover:bg-[#128A68]/90">Criar negócio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
