import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { Lead } from "@/data/mockData";
import { type Contact } from "@/lib/contacts";
import { chaveDaPessoa, ticketPorPessoa } from "@/lib/ticketMedio";
import { formatarTelefone } from "@/lib/telefone";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Menu, MoreHorizontal, Pencil, Briefcase, MessageSquare, Trash2, Users, Upload, Download, Network, Rocket } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { ExecutarAutomacaoWizard, leadParaAlvo } from "@/components/multiatendimento/ExecutarAutomacaoWizard";
import { CreateDisparoWizard } from "@/components/disparos/CreateDisparoWizard";
import { PipelineFilterPanel } from "@/components/PipelineFilterPanel";
import { executarAutomacaoNoLead, filterLeads, isFilterEmpty, type LeadFilter } from "@/data/disparos";
import { Checkbox } from "@/components/ui/checkbox";
import { LeadModal } from "@/components/LeadModal";
import { CreateDealDialog } from "@/components/CreateDealDialog";
import { ImportLeadsModal } from "@/components/ImportLeadsModal";
import { LeadDrawer } from "@/components/LeadDrawer";
import { toast } from "sonner";

export default function LeadsPage() {
  const { leads, contacts, columns, pipelines, teamMembers, memberColors, memberAvatars, deleteLead, deleteLeadAndContact, deleteContact, crmTags, crmLists } = useCRM();
  const { company } = useCompany();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");

  /**
   * Filtros da lista, no MESMO formato que o disparo grava (`LeadFilter`).
   *
   * Reaproveita `filterLeads`, e não uma segunda implementação de "quem passa":
   * a pergunta "quais leads deste responsável, neste pipeline, nesta etapa" já
   * é respondida no wizard de disparo, e duas respostas para a mesma pergunta
   * divergem no dia em que uma das duas ganhar um critério novo.
   *
   * Servem para preparar envio em massa: filtra, marca todos de uma vez e
   * manda para o disparo ou para a automação do menu ao lado.
   */
  const [filtros, setFiltros] = useState<LeadFilter>({});

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
  // Automação em lote, a partir dos leads marcados na lista.
  const [automacaoEmLote, setAutomacaoEmLote] = useState<Lead[] | null>(null);

  // Mapeia o lead para o wizard pela função do próprio wizard: a pipeline abre
  // o mesmo popup e precisa das mesmas colunas.
  const paraAlvo = (l: Lead) => leadParaAlvo(l, ticketByContact, crmTags);

  /**
   * Filtro do passo "Selecionar leads" da automação em lote.
   *
   * Estado próprio, separado do `filtros` da página: são duas perguntas
   * diferentes. O da página decide o que a lista mostra; este decide em quem a
   * automação roda. Compartilhados, abrir o popup e mexer num filtro mudaria a
   * tela por baixo, e fechar sem executar deixaria a lista alterada sem que
   * ninguém tivesse pedido.
   */
  const [filtroAutomacao, setFiltroAutomacao] = useState<LeadFilter>({});
  // Criar disparo direto daqui, levando a seleção quando houver.
  const [disparoAberto, setDisparoAberto] = useState(false);

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
  const semFiltro = isFilterEmpty(filtros);
  const porBusca = allLeadsSorted.filter(l => {
    if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !(l.company || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const filtered = semFiltro ? porBusca : filterLeads(porBusca, filtros, { lists: crmLists });

  // Contatos ainda sem nenhum negócio vinculado (nenhuma linha em `leads` com
  // person_id apontando pra eles) -- aparecem misturados na mesma lista, com
  // badge "Sem negócio" no lugar do Responsável.
  //
  // Somem quando há filtro ativo: responsável, pipeline e etapa são atributos
  // do NEGÓCIO, e um contato solto não tem nenhum deles. Deixá-los na lista
  // filtrada seria responder "estes são os leads do Fulano" incluindo gente que
  // não é de ninguém.
  const linkedPersonIds = useMemo(() => {
    const s = new Set<string>();
    Object.values(leads).forEach(l => { if (l.personId) s.add(l.personId); });
    return s;
  }, [leads]);
  const filteredContacts = useMemo(() => {
    if (!semFiltro) return [];
    return Object.values(contacts)
      .filter(c => !linkedPersonIds.has(c.id))
      .filter(c => !search
        || c.name.toLowerCase().includes(search.toLowerCase())
        || (c.company || "").toLowerCase().includes(search.toLowerCase()));
  }, [contacts, linkedPersonIds, search, semFiltro]);

  type Row = { kind: "lead"; lead: Lead } | { kind: "contact"; contact: Contact };
  const rows: Row[] = useMemo(() => {
    const leadRows: (Row & { ts: number })[] = filtered.map(l => ({
      kind: "lead", lead: l, ts: l.created_at ? new Date(l.created_at).getTime() : 0,
    }));
    const contactRows: (Row & { ts: number })[] = filteredContacts.map(c => ({
      kind: "contact", contact: c, ts: c.createdAt ? new Date(c.createdAt).getTime() : 0,
    }));
    return [...leadRows, ...contactRows].sort((a, b) => b.ts - a.ts);
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
  // Ticket médio por pessoa, do mesmo cálculo que o wizard de disparo usa.
  const ticketByContact = useMemo(() => ticketPorPessoa(leads), [leads]);

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
    // max-w-7xl (1280px) e mx-auto para acompanhar as demais páginas. Antes
    // esta ocupava toda a largura da janela, então em monitor grande a tabela
    // de leads era a única coisa do CRM esticada até a borda.
    //
    // Espaçamento igual ao de /dashboard: 40px no topo, 30px nos outros lados.
    // O respiro maior em cima separa a página da barra do navegador; nas
    // laterais o limite já é a sidebar.
    <div className="pt-[40px] px-[30px] pb-[30px] max-w-7xl mx-auto">
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
        {/* Este menu some quando nada está marcado? Não mais. Ele guarda ações
            que existem independente de seleção (criar disparo parte de filtro),
            e um botão que aparece e desaparece obriga a descobrir de novo onde
            as ações moram. O que depende de seleção fica desabilitado, com o
            porquê no título -- some a dúvida, fica a explicação. */}
        <div className="flex items-center gap-2 ml-auto">
          {someSelected && (
            <span className="text-sm text-muted-foreground">
              {selectedLeads.length} selecionado{selectedLeads.length > 1 ? "s" : ""}
            </span>
          )}

          {/* Filtros. Ficam à esquerda do menu de ações de propósito: a ordem
              na tela é a ordem do trabalho -- primeiro reduz a lista a quem
              deve receber, depois marca todos, depois dispara. */}
          {/* Mesmo painel do /pipeline e do "Selecionar leads" da automação.
              Como não há seletor de status separado nesta tela, ele é traduzido
              de e para o `dealStatus` do próprio filtro. */}
          <PipelineFilterPanel
            value={filtros}
            onApply={setFiltros}
            /* Sem "Status" e com "Negócios" no lugar dele. Aqui a lista mistura
               funis, então "em qual funil e etapa" é a pergunta que separa os
               leads; a situação do negócio já está coberta por Data de
               ganho/perdido e Motivo de perda. */
            mostrar={["tags", "produtos", "atendente", "situacao", "negocios", "criacao", "fechamento", "origem", "perda"]}
            // Prévia do rascunho: o painel precisa dizer quantos leads o
            // critério pegaria ANTES de aplicar, e quem sabe filtrar é esta
            // tela. O status fica de fora da conta porque ele não é oferecido
            // aqui -- contar por ele daria um número que a tela não deixa mudar.
            contarResultados={f => (isFilterEmpty(f)
              ? porBusca.length
              : filterLeads(porBusca, f, { lists: crmLists }).length)}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-md border border-card-border bg-card hover:bg-muted text-foreground transition-colors">
                <Menu size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => setDisparoAberto(true)}>
                <Rocket size={14} className="mr-2" /> Criar disparo
              </DropdownMenuItem>
              {/* Ativo mesmo sem seleção: quando nada está marcado, os leads
                  são escolhidos dentro do wizard, no passo 2. */}
              <DropdownMenuItem onClick={() => setAutomacaoEmLote(selectedLeads)}>
                <Network size={14} className="mr-2" /> Executar automação
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!someSelected}
                onClick={() => someSelected && exportSelected()}
                title={someSelected ? undefined : "Marque ao menos um lead"}
              >
                <Download size={14} className="mr-2" /> Exportar selecionados
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!someSelected}
                onClick={() => someSelected && setBulkDeleteConfirm(true)}
                className="text-destructive focus:text-destructive"
                title={someSelected ? undefined : "Marque ao menos um lead"}
              >
                <Trash2 size={14} className="mr-2" /> Excluir selecionados
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
          {/* `text-xs` na tabela, e não em cada célula: nome, responsável, contato
              e os cabeçalhos herdam daqui, e a próxima coluna nasce no mesmo
              corpo sem ninguém precisar lembrar. Quem tem tamanho próprio
              (pastilha de tag, número da receita) continua com o dele. */}
          <Table className="table-fixed w-full overflow-hidden text-xs">
            <TableHeader>
              <TableRow className="border-card-border hover:bg-transparent">
                <TableHead className="text-muted-foreground" style={{ width: "20%" }}>
                  {/* `justify-center` no flex, e não `text-center` na célula: o
                      rótulo divide a linha com a caixa de seleção, e centralizar
                      o texto sozinho deixaria os dois em pontos diferentes. */}
                  <div className="flex items-center justify-center gap-2">
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
                <TableHead className="text-muted-foreground text-center" style={{ width: "16%" }}>Contato</TableHead>
                <TableHead className="text-muted-foreground text-center" style={{ width: "18%" }}>Responsável</TableHead>
                <TableHead className="text-muted-foreground text-center" style={{ width: "16%" }}>Receita</TableHead>
                <TableHead className="text-muted-foreground text-center" style={{ width: "14%" }}>Tags</TableHead>
                <TableHead className="text-muted-foreground text-center" style={{ width: "10%" }}>Criado em</TableHead>
                <TableHead className="text-muted-foreground" style={{ width: "6%" }}></TableHead>
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
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs text-foreground truncate">
                        {row.contact.phoneDdi && row.contact.phoneDdi !== "+55" ? `${row.contact.phoneDdi} ` : ""}
                        {row.contact.phone || "—"}
                      </span>
                      {row.contact.email && (
                        <span className="text-xs text-muted-foreground truncate">{row.contact.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium text-muted-foreground border border-card-border">
                      Sem negócio
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-xs text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-center gap-1">
                      {(row.contact.tags ?? []).length === 0
                        ? <span className="text-xs text-muted-foreground">—</span>
                        : (row.contact.tags ?? []).map(tagName => {
                            const t = crmTags.find(x => x.name === tagName);
                            return (
                              <span key={tagName} className="text-[10px] px-2 rounded-full text-white font-medium" style={{ paddingTop: 1, paddingBottom: 1, background: t?.color || "#888" }}>
                                {tagName}
                              </span>
                            );
                          })
                      }
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-center" style={{ fontSize: 12 }}>
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
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-center gap-0.5">
                      {/* Formatado na hora de mostrar, e não gravado formatado:
                          o banco guarda o número como cada canal entregou, e é
                          esse texto cru que as buscas e comparações usam. */}
                      <span className="text-xs text-foreground truncate">
                        {row.lead.whatsapp ? formatarTelefone(row.lead.whatsapp, row.lead.phoneDdi) : "—"}
                      </span>
                      {row.lead.email && (
                        <span className="text-xs text-muted-foreground truncate">{row.lead.email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const resps = row.lead.responsibles?.length ? row.lead.responsibles : (row.lead.responsible ? [row.lead.responsible] : []);
                      if (resps.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
                      return (
                        <div className="flex items-center justify-center gap-2">
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
                          <span className="text-xs text-foreground">
                            {resps.length === 1 ? resps[0] : `${resps.length} responsáveis`}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const key = chaveDaPessoa(row.lead);
                      const d = key ? ticketByContact[key] : null;
                      const total = d?.total ?? 0;
                      const count = d?.count ?? 0;
                      return (
                        <div className="flex items-start justify-center" style={{ gap: 25 }}>
                          <div style={{ lineHeight: 1.4 }}>
                            <div style={{ fontSize: 10 }} className="text-muted-foreground">Receita:</div>
                            <div style={{ fontSize: 14 }} className="font-semibold text-foreground">{fmtBRL(total)}</div>
                          </div>
                          <div className="flex flex-col items-center" style={{ lineHeight: 1.4 }}>
                            <div className="flex items-center justify-center font-semibold text-foreground" style={{ width: 26, height: 26, fontSize: 14, borderRadius: 5, border: "1.5px solid #16a34a", background: "transparent" }}>{count}</div>
                            <div style={{ fontSize: 8 }} className="text-muted-foreground">Compras</div>
                          </div>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-center gap-1">
                      {(row.lead.tags ?? []).length === 0
                        ? <span className="text-xs text-muted-foreground">—</span>
                        : (row.lead.tags ?? []).map(tagName => {
                            const t = crmTags.find(x => x.name === tagName);
                            return (
                              <span key={tagName} className="text-[10px] px-2 rounded-full text-white font-medium" style={{ paddingTop: 1, paddingBottom: 1, background: t?.color || "#888" }}>
                                {tagName}
                              </span>
                            );
                          })
                      }
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-center" style={{ fontSize: 12 }}>
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
        conversas={automacaoLead ? [paraAlvo(automacaoLead)] : []}
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

      {/* Automação a partir do menu do topo. Diferente do menu da linha, aqui
          o passo 2 é de ESCOLHA: quem veio marcado começa marcado, e quem abriu
          sem marcar nada escolhe ali mesmo. O universo é a lista como ela está
          agora (`filtered`), e não todos os leads da base -- se a pessoa
          filtrou a tela, o filtro é parte do que ela quis. */}
      <ExecutarAutomacaoWizard
        open={automacaoEmLote !== null}
        onOpenChange={aberto => {
          if (!aberto) {
            setAutomacaoEmLote(null);
            // Zera junto com o fechamento: o filtro é da sessão do popup, e
            // reencontrá-lo aplicado na próxima abertura, sem lembrança de o
            // ter escolhido, explicaria mal uma lista que veio menor.
            setFiltroAutomacao({});
          }
        }}
        executando={executandoAutomacao}
        termo={{ singular: "lead", plural: "leads" }}
        conversas={(automacaoEmLote ?? []).map(paraAlvo)}
        /* A base é a lista INTEIRA (`allLeadsSorted`), não a filtrada da tela.
           São duas perguntas separadas: o filtro da tela responde "o que estou
           olhando agora", o do popup responde "em quem a automação vai rodar".
           Herdando um no outro, a automação mudaria de alcance conforme a busca
           que por acaso estivesse digitada atrás do popup.

           Quem marcou linhas na lista parte daquelas: a marcação é uma escolha
           explícita, e é ela que vira o critério inicial.

           O filtro usa a mesma `filterLeads` do disparo, para os dois popups
           responderem igual ao mesmo critério. O wizard recebe só id, nome e
           telefone e não teria como avaliar tag, origem ou valor. */
        opcoes={(() => {
          const base = automacaoEmLote?.length ? automacaoEmLote : allLeadsSorted;
          return (isFilterEmpty(filtroAutomacao)
            ? base
            : filterLeads(base, filtroAutomacao, { lists: crmLists })
          ).map(paraAlvo);
        })()}
        /* Mesmo painel do /pipeline. Ele pede `status` de fora porque lá o
           seletor vive na barra; aqui não existe barra, então o status é
           traduzido de e para o próprio filtro (`dealStatus`). Assim continua
           havendo UMA fonte -- o LeadFilter -- e não um estado paralelo para
           sair de sincronia com ele. */
        acaoFiltro={
          <PipelineFilterPanel
            value={filtroAutomacao}
            onApply={setFiltroAutomacao}
            mostrar={["tags", "produtos", "atendente", "situacao", "negocios", "criacao", "fechamento", "origem", "perda"]}
          />
        }
        /* Linhas marcadas na lista contam como critério: foram uma escolha, e
           por isso já entram selecionadas, do mesmo jeito que um filtro. */
        filtroVazio={isFilterEmpty(filtroAutomacao) && !automacaoEmLote?.length}
        onExecutar={async (automationId, ids) => {
          if (!company || ids.length === 0) return;
          setExecutandoAutomacao(true);
          // Sucesso e falha contados separadamente: num lote, dizer só
          // "executada" esconderia os que não rodaram, e dizer só "falhou"
          // esconderia os que rodaram.
          let ok = 0; let ultimoErro = "";
          for (const id of ids) {
            const erro = await executarAutomacaoNoLead(company.id, id, automationId);
            if (erro) ultimoErro = erro; else ok++;
          }
          const falhas = ids.length - ok;
          setExecutandoAutomacao(false);
          setAutomacaoEmLote(null);
          if (ok > 0) toast.success(`Automação executada em ${ok} lead(s).`);
          if (falhas > 0) toast.error(`Falha em ${falhas} lead(s). ${ultimoErro}`);
        }}
      />

      {/* Criar disparo sem sair de /leads. Leva os leads marcados para o passo
          "Selecionar leads" já restrito; sem seleção, abre como em /disparos. */}
      <CreateDisparoWizard
        open={disparoAberto}
        onOpenChange={setDisparoAberto}
        leadsPreSelecionados={someSelected ? selectedLeads.map(l => l.id) : undefined}
        onCreated={id => {
          setDisparoAberto(false);
          toast.success("Disparo criado.");
          navigate(`/disparos/${id}`);
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
