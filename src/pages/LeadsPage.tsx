import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { Lead } from "@/data/mockData";
import { type Contact } from "@/lib/contacts";
import { normalizarTelefoneBr } from "@/lib/telefone";
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
import { Plus, Menu, MoreHorizontal, Pencil, Briefcase, MessageSquare, Trash2, Users, Upload, Download, Network } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { ExecutarAutomacaoWizard } from "@/components/multiatendimento/ExecutarAutomacaoWizard";
import { executarAutomacaoNoLead } from "@/data/disparos";
import { Checkbox } from "@/components/ui/checkbox";
import { LeadModal } from "@/components/LeadModal";
import { CreateDealDialog } from "@/components/CreateDealDialog";
import { ImportLeadsModal } from "@/components/ImportLeadsModal";
import { LeadDrawer } from "@/components/LeadDrawer";
import { toast } from "sonner";

export default function LeadsPage() {
  const { leads, contacts, columns, pipelines, teamMembers, memberColors, memberAvatars, deleteLead, deleteLeadAndContact, deleteContact, crmTags } = useCRM();
  const { company } = useCompany();

  const [search, setSearch] = useState("");
  const [filterResp, setFilterResp] = useState("all");
  const [filterPipeline, setFilterPipeline] = useState("all");
  const [filterStage, setFilterStage] = useState("all");

  // Lead modal (create / edit lead / edit contato sem negócio)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleteContactTarget, setDeleteContactTarget] = useState<Contact | null>(null);
  const [delWithContact, setDelWithContact] = useState(false);
  const [bulkDelWithContact, setBulkDelWithContact] = useState(false);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);

  // Executar automação: mesmo wizard do Multiatendimento, com o lead da linha
  // já resolvido no passo 2. Guardamos o lead inteiro (e não só o id) porque a
  // tela de confirmação mostra nome e telefone -- é o que permite perceber que
  // se clicou na linha errada antes de a mensagem sair.
  const [automacaoLead, setAutomacaoLead] = useState<Lead | null>(null);
  const [executandoAutomacao, setExecutandoAutomacao] = useState(false);

  // Drawer de detalhes do lead
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);

  // Seleção de leads
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

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
  const [dealContactTarget, setDealContactTarget] = useState<Contact | null>(null);

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

  // Contatos ainda sem nenhum negócio vinculado (nenhuma linha em `leads` com
  // person_id apontando pra eles) -- aparecem misturados na mesma lista, com
  // badge "Sem negócio" no lugar do Responsável. Só entram quando nenhum filtro
  // exclusivo de negócio (Responsável/Pipeline/Etapa) está ativo, já que um
  // contato solto não tem nenhum desses atributos pra filtrar.
  const linkedPersonIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(leads).forEach(l => { if (l.personId) s.add(l.personId); });
    return s;
  }, [leads]);
  const noExtraFilters = filterResp === "all" && filterPipeline === "all" && filterStage === "all";
  const filteredContacts = noExtraFilters
    ? Object.values(contacts)
        .filter(c => !linkedPersonIds.has(c.id))
        .filter(c => !search
          || c.name.toLowerCase().includes(search.toLowerCase())
          || (c.company || "").toLowerCase().includes(search.toLowerCase()))
    : [];

  type Row = { kind: "lead"; lead: Lead } | { kind: "contact"; contact: Contact };
  const rows: Row[] = useMemo(() => {
    const leadRows: (Row & { ts: number })[] = filtered.map(l => ({
      kind: "lead", lead: l, ts: l.created_at ? new Date(l.created_at).getTime() : 0,
    }));
    const contactRows: (Row & { ts: number })[] = filteredContacts.map(c => ({
      kind: "contact", contact: c, ts: c.createdAt ? new Date(c.createdAt).getTime() : 0,
    }));
    return [...leadRows, ...contactRows].sort((a, b) => b.ts - a.ts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, filteredContacts]);

  const colName = (id: string) => {
    for (const p of pipelines) {
      const col = p.columns.find(c => c.id === id);
      if (col) return col.title;
    }
    return columns.find(c => c.id === id)?.title || id;
  };

  const openCreate = () => { setEditingLead(null); setEditingContact(null); setModalOpen(true); };
  const openEdit = (lead: Lead) => { setEditingContact(null); setEditingLead(lead); setModalOpen(true); };
  const openEditContact = (contact: Contact) => { setEditingLead(null); setEditingContact(contact); setModalOpen(true); };

  const openWhatsApp = (phoneDdi: string | undefined, whatsapp: string) => {
    const number = (phoneDdi ?? "+55").replace("+", "") + whatsapp.replace(/\D/g, "");
    window.open(`https://wa.me/${number}`, "_blank", "noopener");
  };

  const openDeal = (lead: Lead) => setDealTarget(lead);
  const openDealFromContact = (contact: Contact) => setDealContactTarget(contact);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (delWithContact && deleteTarget.personId) {
      await deleteLeadAndContact(deleteTarget.id);
    } else {
      deleteLead(deleteTarget.id);
      toast.success("Lead removido.");
    }
    setDeleteTarget(null);
    setDelWithContact(false);
  };

  const confirmDeleteContact = () => {
    if (!deleteContactTarget) return;
    // Defensivo: bareContacts já exclui contatos com negócio vinculado, mas
    // confere de novo aqui contra corrida (negócio criado em outra aba/sessão
    // entre a listagem e o clique em excluir).
    if (linkedPersonIds.has(deleteContactTarget.id)) {
      toast.error("Este contato já tem negócio vinculado — não pode ser excluído por aqui.");
      setDeleteContactTarget(null);
      return;
    }
    deleteContact(deleteContactTarget.id);
    toast.success("Lead removido.");
    setDeleteContactTarget(null);
  };

  // Chave de "mesma pessoa" para agregar vendas.
  //
  // É personId (leads.person_id → contacts.id), que hoje cobre 2500 dos 2502
  // leads. O fallback é o núcleo do telefone, o mesmo do resto do sistema.
  //
  // Antes a chave era `contactId`, que é OUTRA coisa: leads.contact_id é
  // auto-referência para leads.id, do "Novo negócio" legado, e existe em UMA
  // linha do banco inteiro. Na prática todo mundo caía no fallback, que usava
  // dígitos CRUS -- então "5548999998888" e "48999998888" viravam duas pessoas
  // e o ticket médio de quem tivesse dois negócios ganhos partia em dois.
  // Ninguém tem dois ganhos hoje, então isso nunca apareceu na tela; é uma
  // bomba com o pino puxado esperando o primeiro cliente recorrente.
  //
  // Produtor e consumidor usam ESTA função. Antes usavam expressões diferentes
  // (aqui `contactId`, na tabela `lead.id`), o que só funcionava por acidente.
  const chaveDaPessoa = (l: { personId?: string; whatsapp?: string }): string | null =>
    l.personId ?? (l.whatsapp ? normalizarTelefoneBr(l.whatsapp) || null : null);

  const ticketByContact = useMemo(() => {
    const map: Record<string, number[]> = {};
    Object.values(leads).forEach(l => {
      if (l.dealStatus === "won" && l.value > 0) {
        const key = chaveDaPessoa(l);
        if (key) { if (!map[key]) map[key] = []; map[key].push(l.value); }
      }
    });
    const result: Record<string, { avg: number; total: number; count: number }> = {};
    Object.entries(map).forEach(([k, vals]) => {
      const total = vals.reduce((a, b) => a + b, 0);
      result[k] = { avg: total / vals.length, total, count: vals.length };
    });
    return result;
  }, [leads]);

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  // Seleção
  const selectedLeads = filtered.filter(l => selectedIds.has(l.id));
  const allSelected   = filtered.length > 0 && filtered.every(l => selectedIds.has(l.id));
  const someSelected  = filtered.some(l => selectedIds.has(l.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(l => l.id)));
  };

  const exportSelected = () => {
    const headers = ["Nome", "Empresa", "WhatsApp", "Email", "Pipeline", "Etapa", "Tags", "Data de Criação"];
    const rows = selectedLeads.map(l => [
      l.name,
      l.company || "",
      l.whatsapp || "",
      l.email || "",
      pipelines.find(p => p.id === l.pipelineId)?.name || "",
      colName(l.stage || ""),
      (l.tags || []).join("; "),
      l.created_at ? new Intl.DateTimeFormat("pt-BR").format(new Date(l.created_at)) : "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selectedLeads.length} lead${selectedLeads.length > 1 ? "s" : ""} exportado${selectedLeads.length > 1 ? "s" : ""}.`);
  };

  const confirmBulkDelete = () => {
    const count = selectedLeads.length;
    let contactsKept = 0;
    selectedLeads.forEach(l => {
      deleteLead(l.id);
      if (bulkDelWithContact && l.personId) {
        const otherDeals = Object.values(leads).some(o => o.id !== l.id && o.personId === l.personId);
        if (otherDeals) contactsKept++;
        else deleteContact(l.personId);
      }
    });
    setSelectedIds(new Set());
    setBulkDeleteConfirm(false);
    setBulkDelWithContact(false);
    toast.success(`${count} lead${count > 1 ? "s" : ""} excluído${count > 1 ? "s" : ""}.`);
    if (bulkDelWithContact && contactsKept > 0) {
      toast.info(`${contactsKept} contato(s) mantido(s) por ter outro(s) negócio(s) vinculado(s).`);
    }
  };

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
          <Button variant="outline" onClick={() => setImportOpen(true)} className="rounded-lg font-semibold bg-white">
            <Upload size={16} className="mr-1" /> Importar lista
          </Button>
          <Button onClick={openCreate} className="rounded-lg font-semibold">
            <Plus size={16} className="mr-1" /> Novo Lead
          </Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
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

        {someSelected && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">
              {selectedLeads.length} selecionado{selectedLeads.length > 1 ? "s" : ""}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-md border border-card-border bg-card hover:bg-muted text-foreground transition-colors">
                  <Menu size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={exportSelected}>
                  <Download size={14} className="mr-2" /> Exportar selecionados
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 size={14} className="mr-2" /> Excluir selecionados
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
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
                <TableHead className="text-muted-foreground" style={{ width: "20%" }}>
                  <div className="flex items-center gap-2">
                    {someSelected && (
                      <Checkbox
                        checked={allSelected ? true : "indeterminate"}
                        onCheckedChange={toggleSelectAll}
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                    Nome
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "16%" }}>Responsável</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "16%" }}>Contato</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "14%" }}>Tags</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "18%" }}>Dados</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "12%" }}>Data de Criação</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "4%" }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => row.kind === "contact" ? (
                <TableRow
                  key={`c-${row.contact.id}`}
                  className="border-card-border hover:bg-secondary/50 cursor-pointer"
                  onClick={() => openEditContact(row.contact)}
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-[10px] min-w-0">
                      <div className="min-w-0" style={{ lineHeight: 1.1 }}>
                        <span className="truncate block">{row.contact.name}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium text-muted-foreground border border-card-border">
                      Sem negócio
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-foreground truncate">
                        {row.contact.phoneDdi && row.contact.phoneDdi !== "+55" ? `${row.contact.phoneDdi} ` : ""}
                        {row.contact.phone || "—"}
                      </span>
                      {row.contact.email && (
                        <span className="text-xs text-muted-foreground truncate">{row.contact.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(row.contact.tags ?? []).length === 0
                        ? <span className="text-sm text-muted-foreground">—</span>
                        : (row.contact.tags ?? []).map(tagName => {
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
                  <TableCell>
                    <span className="text-sm text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground" style={{ fontSize: 12 }}>
                    {(() => {
                      const d = row.contact.createdAt ? new Date(row.contact.createdAt) : null;
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
                        <DropdownMenuItem onClick={() => openEditContact(row.contact)}>
                          <Pencil size={14} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDealFromContact(row.contact)}>
                          <Briefcase size={14} className="mr-2" /> Criar negócio
                        </DropdownMenuItem>
                        {row.contact.phone && (
                          <DropdownMenuItem onClick={() => openWhatsApp(row.contact.phoneDdi, row.contact.phone!)}>
                            <MessageSquare size={14} className="mr-2" /> Abrir Chat
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteContactTarget(row.contact)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 size={14} className="mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow
                  key={row.lead.id}
                  className="border-card-border hover:bg-secondary/50 cursor-pointer"
                  onClick={() => setDrawerLeadId(row.lead.id)}
                >
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-[10px] min-w-0">
                      <div onClick={e => e.stopPropagation()} className="shrink-0">
                        <Checkbox
                          checked={selectedIds.has(row.lead.id)}
                          onCheckedChange={() => toggleSelect(row.lead.id)}
                        />
                      </div>
                      <div className="min-w-0" style={{ lineHeight: 1.1 }}>
                        <span className="truncate block">{row.lead.name}</span>
                        {(() => {
                          const key = chaveDaPessoa(row.lead);
                          const avg = (key ? ticketByContact[key]?.avg : undefined) ?? 0;
                          return (
                            <span style={{ fontSize: 9, fontWeight: 600 }} className="inline-flex items-center rounded-full bg-gray-100 px-1 py-0.5 text-gray-500">
                              Ticket médio <span className="text-green-600 ml-1">{fmtBRL(avg)}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const resps = row.lead.responsibles?.length ? row.lead.responsibles : (row.lead.responsible ? [row.lead.responsible] : []);
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
                        {row.lead.phoneDdi && row.lead.phoneDdi !== "+55" ? `${row.lead.phoneDdi} ` : ""}
                        {row.lead.whatsapp || "—"}
                      </span>
                      {row.lead.email && (
                        <span className="text-xs text-muted-foreground truncate">{row.lead.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(row.lead.tags ?? []).length === 0
                        ? <span className="text-sm text-muted-foreground">—</span>
                        : (row.lead.tags ?? []).map(tagName => {
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
                  <TableCell>
                    {(() => {
                      const key = chaveDaPessoa(row.lead);
                      const d = key ? ticketByContact[key] : null;
                      const total = d?.total ?? 0;
                      const count = d?.count ?? 0;
                      return (
                        <div className="flex items-start" style={{ gap: 25 }}>
                          <div style={{ lineHeight: 1.4 }}>
                            <div style={{ fontSize: 10 }} className="text-muted-foreground">Total:</div>
                            <div style={{ fontSize: 14 }} className="font-semibold text-foreground">{fmtBRL(total)}</div>
                          </div>
                          <div className="flex flex-col items-center" style={{ lineHeight: 1.4 }}>
                            <div className="flex items-center justify-center rounded-full font-semibold text-foreground" style={{ width: 26, height: 26, fontSize: 14, border: "1.5px solid #16a34a", background: "transparent" }}>{count}</div>
                            <div style={{ fontSize: 8 }} className="text-muted-foreground">Compras</div>
                          </div>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-muted-foreground" style={{ fontSize: 12 }}>
                    {(() => {
                      const d = row.lead.created_at ? new Date(row.lead.created_at) : null;
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
                        <DropdownMenuItem onClick={() => openEdit(row.lead)}>
                          <Pencil size={14} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDeal(row.lead)}>
                          <Briefcase size={14} className="mr-2" /> Criar negócio
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openWhatsApp(row.lead.phoneDdi, row.lead.whatsapp)}>
                          <MessageSquare size={14} className="mr-2" /> Abrir Chat
                        </DropdownMenuItem>
                        {/* Mesmo ícone que a sidebar usa em /automacoes: quem
                            já associou aquele desenho a "automação" reconhece
                            a ação sem ler o rótulo. */}
                        <DropdownMenuItem onClick={() => setAutomacaoLead(row.lead)}>
                          <Network size={14} className="mr-2" /> Executar automação
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(row.lead)}
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

      {/* Create / Edit Lead Modal (lead ou contato sem negócio) */}
      <LeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editLead={editingLead}
        editContact={editingContact}
        onCreated={openDealFromContact}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) { setDeleteTarget(null); setDelWithContact(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          {deleteTarget?.personId && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Checkbox checked={delWithContact} onCheckedChange={v => setDelWithContact(!!v)} />
              Excluir também o contato vinculado
            </label>
          )}
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDelWithContact(false); }}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Contact Confirmation */}
      <Dialog open={!!deleteContactTarget} onOpenChange={v => !v && setDeleteContactTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteContactTarget?.name}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteContactTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteContact}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Deal Modal (a partir de negócio existente ou de contato sem negócio) */}
      <CreateDealDialog lead={dealTarget} onClose={() => setDealTarget(null)} />
      <CreateDealDialog contact={dealContactTarget} onClose={() => setDealContactTarget(null)} />

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={v => { if (!v) { setBulkDeleteConfirm(false); setBulkDelWithContact(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir leads selecionados</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{selectedLeads.length} lead{selectedLeads.length > 1 ? "s" : ""}</strong>? Esta ação não pode ser desfeita.
          </p>
          {selectedLeads.some(l => l.personId) && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Checkbox checked={bulkDelWithContact} onCheckedChange={v => setBulkDelWithContact(!!v)} />
              Excluir também os contatos vinculados
            </label>
          )}
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { setBulkDeleteConfirm(false); setBulkDelWithContact(false); }}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmBulkDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportLeadsModal open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Executar automação a partir da lista de leads. É o MESMO wizard do
          Multiatendimento: a tarefa é a mesma, muda só o ponto de partida --
          lá o alvo é a conversa, aqui é o lead. O `termo` existe para os
          textos falarem "lead" em vez de "conversa". */}
      <ExecutarAutomacaoWizard
        open={automacaoLead !== null}
        onOpenChange={aberto => { if (!aberto) setAutomacaoLead(null); }}
        executando={executandoAutomacao}
        termo={{ singular: "lead", plural: "leads" }}
        conversas={automacaoLead ? [{
          id: automacaoLead.id,
          nome: automacaoLead.name,
          telefone: automacaoLead.whatsapp || undefined,
          // Na lista de leads a linha JÁ é um negócio, então sempre há em que
          // executar. O aviso de "sem negócio" do wizard fica para o
          // Multiatendimento, onde a conversa pode não ter negócio nenhum.
          temNegocio: true,
        }] : []}
        onExecutar={async automationId => {
          if (!automacaoLead || !company) return;
          setExecutandoAutomacao(true);
          const erro = await executarAutomacaoNoLead(company.id, automacaoLead.id, automationId);
          setExecutandoAutomacao(false);
          setAutomacaoLead(null);
          if (erro) toast.error(`Falha ao executar a automação. ${erro}`);
          else toast.success("Automação executada.");
        }}
      />

      {/* Lead Detail Drawer */}
      <LeadDrawer
        leadId={drawerLeadId}
        open={!!drawerLeadId}
        onClose={() => setDrawerLeadId(null)}
      />
    </div>
  );
}
