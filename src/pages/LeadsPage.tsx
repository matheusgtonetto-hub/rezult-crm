import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Plus, MoreHorizontal, Pencil, Briefcase, MessageSquare, Trash2, Users, Upload } from "lucide-react";
import { LeadModal } from "@/components/LeadModal";
import { ImportLeadsModal } from "@/components/ImportLeadsModal";
import { LeadDrawer } from "@/components/LeadDrawer";
import { toast } from "sonner";

export default function LeadsPage() {
  const { leads, columns, pipelines, teamMembers, memberColors, memberAvatars, deleteLead, addLead, nextDealNumber, crmTags } = useCRM();

  const [search, setSearch] = useState("");
  const [filterResp, setFilterResp] = useState("all");
  const [filterPipeline, setFilterPipeline] = useState("all");
  const [filterStage, setFilterStage] = useState("all");

  // Lead modal (create / edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);

  // Drawer de detalhes do lead
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);

  // Abre o drawer do lead vindo por URL (?lead=<id>), ex.: link do Multiatendimento.
  // Limpa o param depois para não reabrir em refresh/navegação.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (leadParam && leads[leadParam]) {
      setDrawerLeadId(leadParam);
      searchParams.delete("lead");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, leads, setSearchParams]);

  // Create deal modal
  const [dealTarget, setDealTarget] = useState<Lead | null>(null);
  const [dealPipeline, setDealPipeline] = useState("");
  const [dealStage, setDealStage] = useState("");

  // Ordena por data de criação (mais recente primeiro); desempate pelo dealNumber
  const allLeadsSorted = Object.values(leads).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return b.dealNumber - a.dealNumber;
  });
  const filtered = allLeadsSorted.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterResp !== "all") {
      const resps = l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
      if (!resps.includes(filterResp)) return false;
    }
    if (filterPipeline !== "all" && l.pipelineId !== filterPipeline) return false;
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="rounded-lg font-semibold">
            <Upload size={16} className="mr-1" /> Importar lista
          </Button>
          <Button onClick={openCreate} className="rounded-lg font-semibold">
            <Plus size={16} className="mr-1" /> Novo Lead
          </Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Input
          placeholder="Buscar por nome ou empresa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-card border-card-border rounded-lg max-w-xs focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
        />
        <Select value={filterResp} onValueChange={setFilterResp}>
          <SelectTrigger className="bg-card border-card-border rounded-lg w-40 focus:ring-0 focus:ring-offset-0 focus:border-primary">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent className="bg-card border-card-border">
            <SelectItem value="all">Todos</SelectItem>
            {teamMembers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPipeline} onValueChange={v => { setFilterPipeline(v); setFilterStage("all"); }}>
          <SelectTrigger className="bg-card border-card-border rounded-lg w-44 focus:ring-0 focus:ring-offset-0 focus:border-primary">
            <SelectValue placeholder="Pipeline" />
          </SelectTrigger>
          <SelectContent className="bg-card border-card-border">
            <SelectItem value="all">Todos</SelectItem>
            {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="bg-card border-card-border rounded-lg w-44 focus:ring-0 focus:ring-offset-0 focus:border-primary">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent className="bg-card border-card-border">
            <SelectItem value="all">Todas</SelectItem>
            {(filterPipeline !== "all"
              ? pipelines.find(p => p.id === filterPipeline)?.columns ?? []
              : columns
            ).map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
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
          <Table className="table-fixed w-full overflow-hidden">
            <TableHeader>
              <TableRow className="border-card-border hover:bg-transparent">
                <TableHead className="text-muted-foreground" style={{ width: "20%" }}>Nome</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "16%" }}>Responsável</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "16%" }}>Contato</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "14%" }}>Tags</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "18%" }}>Pipeline</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "12%" }}>Data de Criação</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "4%" }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(lead => (
                <TableRow
                  key={lead.id}
                  className="border-card-border hover:bg-secondary/50 cursor-pointer"
                  onClick={() => setDrawerLeadId(lead.id)}
                >
                  <TableCell className="font-medium text-foreground truncate">{lead.name}</TableCell>
                  <TableCell>
                    {(() => {
                      const resps = lead.responsibles?.length ? lead.responsibles : (lead.responsible ? [lead.responsible] : []);
                      if (resps.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
                      return (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center" style={{ gap: 0 }}>
                            {resps.slice(0, 3).map((name, idx) => {
                              const av = memberAvatars[name];
                              const cl = memberColors[name] ?? "#AAAAAA";
                              return av ? (
                                <img key={name} src={av} alt={name} title={name} className="rounded-full object-cover" style={{ width: 22, height: 22, marginLeft: idx > 0 ? -6 : 0, outline: "2px solid hsl(var(--card))" }} />
                              ) : (
                                <div key={name} title={name} className="rounded-full flex items-center justify-center text-white font-semibold" style={{ width: 22, height: 22, background: cl, fontSize: 9, marginLeft: idx > 0 ? -6 : 0, outline: "2px solid hsl(var(--card))" }}>
                                  {name[0].toUpperCase()}
                                </div>
                              );
                            })}
                            {resps.length > 3 && (
                              <div className="rounded-full flex items-center justify-center font-semibold" style={{ width: 22, height: 22, background: "#E5E5E5", color: "#555", fontSize: 9, marginLeft: -6, outline: "2px solid hsl(var(--card))" }}>
                                +{resps.length - 3}
                              </div>
                            )}
                          </div>
                          <span className="text-sm text-foreground">
                            {resps.length === 1 ? resps[0] : `${resps.length} responsáveis`}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-foreground truncate">
                        {lead.phoneDdi && lead.phoneDdi !== "+55" ? `${lead.phoneDdi} ` : ""}
                        {lead.whatsapp || "—"}
                      </span>
                      {lead.email && (
                        <span className="text-xs text-muted-foreground truncate">{lead.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(lead.tags ?? []).length === 0
                        ? <span className="text-sm text-muted-foreground">—</span>
                        : (lead.tags ?? []).map(tagName => {
                            const t = crmTags.find(x => x.name === tagName);
                            return (
                              <span key={tagName} className="text-[11px] px-2 rounded-full text-white font-medium" style={{ paddingTop: 2, paddingBottom: 2, background: t?.color || "#888" }}>
                                {tagName}
                              </span>
                            );
                          })
                      }
                    </div>
                  </TableCell>
                  <TableCell className="truncate">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full whitespace-nowrap">
                      {pipelines.find(p => p.id === lead.pipelineId)?.name || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {(() => {
                      const d = lead.created_at ? new Date(lead.created_at) : null;
                      if (!d || isNaN(d.getTime())) return "—";
                      return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
                    })()}
                  </TableCell>
                  <TableCell className="text-right pr-3" onClick={e => e.stopPropagation()}>
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
                <SelectTrigger className="border-card-border focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
              <Select value={dealStage} onValueChange={setDealStage}>
                <SelectTrigger className="border-card-border focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
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

      <ImportLeadsModal open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Lead Detail Drawer */}
      <LeadDrawer
        leadId={drawerLeadId}
        open={!!drawerLeadId}
        onClose={() => setDrawerLeadId(null)}
      />
    </div>
  );
}
