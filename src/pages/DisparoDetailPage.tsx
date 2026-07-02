import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EditDisparoDialog } from "@/components/disparos/EditDisparoDialog";
import {
  fetchDisparo, fetchDisparoItens, updateDisparo, deleteDisparoItem,
  DISPARO_STATUS_META, ITEM_STATUS_META, RHYTHM_LABEL,
  type Disparo, type DisparoItem, type DisparoItemStatus, type LeadFilter,
} from "@/data/disparos";
import {
  Rocket, Info, Play, Pause, Pencil, Copy, Users, Workflow, ExternalLink, Search, Trash2, Circle, CheckCircle2, XCircle, Loader,
} from "lucide-react";
import { toast } from "sonner";

const CARD_DEFS: { key: DisparoItemStatus; title: string; sub: string; icon: typeof Circle; color: string }[] = [
  { key: "nao_iniciado", title: "Não iniciados", sub: "Itens que ainda não iniciaram o fluxo", icon: Circle, color: "#F59E0B" },
  { key: "pendente",     title: "Pendentes",     sub: "Itens adicionados no fluxo",           icon: Loader, color: "#F97316" },
  { key: "em_execucao",  title: "Em execução",   sub: "Itens que iniciaram o fluxo",          icon: Play, color: "#0EA5E9" },
  { key: "concluido",    title: "Concluídos",    sub: "Itens que concluíram o fluxo",         icon: CheckCircle2, color: "#16A34A" },
  { key: "erro",         title: "Com erro",      sub: "Itens que ocorreram erro",             icon: XCircle, color: "#DC2626" },
];

function summarizeFilter(f: LeadFilter): string[] {
  const parts: string[] = [];
  if (f.tags?.ids.length) parts.push(`Tags ${f.tags.mode === "none" ? "não contém" : f.tags.mode === "all" ? "contém todos" : "contém algum"}: ${f.tags.ids.join(", ")}`);
  if (f.origins?.length) parts.push(`Origem: ${f.origins.join(", ")}`);
  if (f.responsibles?.length) parts.push(`Atendente: ${f.responsibles.join(", ")}`);
  if (f.dealStatus?.length) parts.push(`Situação: ${f.dealStatus.join(", ")}`);
  if (f.lists?.length) parts.push(`Listas: ${f.lists.length}`);
  if (f.products?.length) parts.push(`Produtos: ${f.products.length}`);
  if (f.city) parts.push(`Cidade: ${f.city}`);
  if (f.state) parts.push(`Estado: ${f.state}`);
  if (f.createdFrom || f.createdTo) parts.push(`Criação: ${f.createdFrom ?? "…"} — ${f.createdTo ?? "…"}`);
  if (typeof f.valueMin === "number" || typeof f.valueMax === "number") parts.push(`Valor: ${f.valueMin ?? 0} — ${f.valueMax ?? "∞"}`);
  return parts;
}

export default function DisparoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [disparo, setDisparo] = useState<Disparo | null>(null);
  const [items, setItems] = useState<DisparoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    if (!id) return;
    setItems(await fetchDisparoItens(id));
  }, [id]);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const d = await fetchDisparo(id);
      setDisparo(d);
      await loadItems();
    } finally {
      setLoading(false);
    }
  }, [id, loadItems]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime: itens e status do disparo
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`disparo-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "disparo_itens", filter: `disparo_id=eq.${id}` }, () => loadItems())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "disparos", filter: `id=eq.${id}` }, (payload) => {
        setDisparo(prev => prev ? { ...prev, ...(payload.new as Partial<Disparo>) } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, loadItems]);

  const counts = useMemo(() => {
    const c: Record<DisparoItemStatus, number> = { nao_iniciado: 0, pendente: 0, em_execucao: 0, concluido: 0, erro: 0 };
    for (const it of items) c[it.status] = (c[it.status] ?? 0) + 1;
    return c;
  }, [items]);

  const filteredItems = useMemo(
    () => items.filter(it => (it.lead_name ?? "").toLowerCase().includes(search.toLowerCase()) || (it.lead_phone ?? "").includes(search)),
    [items, search]
  );

  const canStart = disparo && (disparo.status === "criado" || disparo.status === "pausado" || disparo.status === "agendado");
  const canPause = disparo && disparo.status === "em_andamento";

  const doStart = async () => {
    if (!disparo) return;
    setBusy(true);
    try {
      await updateDisparo(disparo.id, { status: "em_andamento", started_at: disparo.started_at ?? new Date().toISOString() });
      setDisparo({ ...disparo, status: "em_andamento" });
      // Aciona o motor de execução imediatamente (o cron também processa periodicamente)
      supabase.functions.invoke("disparo-runner", { body: { disparo_id: disparo.id } }).catch(() => {});
      toast.success("Disparo iniciado");
    } catch { toast.error("Não foi possível iniciar"); }
    finally { setBusy(false); }
  };

  const doPause = async () => {
    if (!disparo) return;
    setBusy(true);
    try {
      await updateDisparo(disparo.id, { status: "pausado" });
      setDisparo({ ...disparo, status: "pausado" });
      toast.success("Disparo pausado — o lote atual será concluído.");
    } catch { toast.error("Não foi possível pausar"); }
    finally { setBusy(false); }
  };

  const removeItem = async (itemId: string) => {
    await deleteDisparoItem(itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  if (loading) {
    return <div className="p-10 flex justify-center"><div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  }
  if (!disparo) {
    return <div className="p-10 text-center text-muted-foreground">Disparo não encontrado. <Link to="/disparos" className="text-primary underline">Voltar</Link></div>;
  }

  const statusMeta = DISPARO_STATUS_META[disparo.status];
  const filterParts = summarizeFilter(disparo.filters);

  return (
    <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link to="/disparos" className="hover:text-foreground">Disparos</Link>
            <span>›</span>
            <span className="text-foreground">{disparo.title}</span>
          </div>
          <h1 className="text-2xl font-bold mt-0.5">{disparo.title}</h1>
        </div>
        <button onClick={() => setHelpOpen(true)} className="text-muted-foreground hover:text-foreground" aria-label="Como funciona"><Info size={20} /></button>
      </div>

      {/* Status cards */}
      <div className="grid gap-3 mt-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {CARD_DEFS.map(cd => {
          const Icon = cd.icon;
          return (
            <div key={cd.key} className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{cd.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{cd.sub}</p>
                </div>
                <Icon size={18} style={{ color: cd.color }} />
              </div>
              <p className="text-2xl font-bold mt-3" style={{ color: cd.color }}>{counts[cd.key]}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 mt-6" style={{ gridTemplateColumns: "260px 1fr" }}>
        {/* Left panel */}
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold mb-2">Ações</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}><Pencil size={14} /> Editar</Button>
              {canPause ? (
                <Button size="sm" className="gap-1.5" disabled={busy} onClick={doPause}><Pause size={14} /> Pausar</Button>
              ) : (
                <Button size="sm" className="gap-1.5" disabled={busy || !canStart || disparo.total_leads === 0} onClick={doStart}><Play size={14} /> Iniciar</Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5 col-span-2" onClick={() => toast.info("Duplicação em breve")}><Copy size={14} /> Duplicar</Button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Status</p>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <span className="w-2 h-2 rounded-full" style={{ background: statusMeta.color }} />
              <span style={{ color: statusMeta.color }}>{statusMeta.label}</span>
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Total de leads</p>
            <div className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2">
              <Users size={15} className="text-primary" /> {disparo.total_leads.toLocaleString("pt-BR")}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Automação</p>
            {disparo.automation_id ? (
              <Link to={`/automacoes/${disparo.automation_id}`} className="flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:border-primary/40">
                <Workflow size={15} className="text-primary" /> <span className="truncate flex-1">{disparo.automation_name ?? "Automação"}</span> <ExternalLink size={13} className="text-muted-foreground" />
              </Link>
            ) : <p className="text-sm text-muted-foreground">—</p>}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Ritmo de execução</p>
            <div className="border border-border rounded-lg px-3 py-2">
              <p className="text-sm font-medium">{RHYTHM_LABEL[disparo.rhythm].label}</p>
              <p className="text-[11px] text-muted-foreground">{RHYTHM_LABEL[disparo.rhythm].hint}</p>
            </div>
          </div>

          {filterParts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Filtros utilizados</p>
              <div className="flex flex-wrap gap-1.5">
                {filterParts.map((p, i) => (
                  <span key={i} className="text-[11px] bg-secondary rounded px-2 py-1 text-muted-foreground">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — leads */}
        <div className="bg-card border border-card-border rounded-xl">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
            <p className="text-sm font-semibold">Leads selecionados</p>
            <div className="relative w-64 max-w-[50%]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Pesquisar" className="pl-9 h-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {filteredItems.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Nenhum lead.</p>}
            {filteredItems.map(it => {
              const m = ITEM_STATUS_META[it.status];
              return (
                <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                    {(it.lead_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium flex-1 truncate">{it.lead_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{it.lead_phone}</span>
                  <span className="text-[11px] font-medium rounded-full px-2 py-0.5" style={{ background: m.bg, color: m.fg }} title={it.error_message ?? ""}>{m.label}</span>
                  {(disparo.status === "criado" || disparo.status === "agendado") && (
                    <button onClick={() => removeItem(it.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remover"><Trash2 size={15} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <EditDisparoDialog
        disparo={disparo}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(patch) => setDisparo(prev => prev ? { ...prev, ...patch } : prev)}
      />

      {/* Help panel */}
      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent className="overflow-y-auto w-[380px] sm:max-w-[380px]">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><Rocket size={18} className="text-primary" /> Como os disparos funcionam</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-5 text-sm text-muted-foreground">
            <p>Um disparo é uma execução em massa, onde vários itens são enviados para uma automação em lotes configurados conforme o ritmo do disparo.</p>
            <div>
              <p className="font-semibold text-foreground mb-1">Como o envio dos lotes acontece</p>
              <p>O envio dos lotes começa quando você executa o disparo ou na data/hora do agendamento.</p>
              <p className="mt-2">O sistema envia o primeiro lote e aguarda todos os itens desse lote entrarem no primeiro bloco da automação.</p>
              <p className="mt-2">Somente depois que todos os itens do lote passarem pelo primeiro bloco, o próximo lote começa a ser enviado respeitando o intervalo configurado.</p>
              <p className="mt-2">O tempo entre um lote e outro pode variar caso haja fila ou alta carga no sistema.</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Sobre a pausa do disparo</p>
              <p>Ao pausar o disparo, o sistema conclui o envio do lote atual e não envia novos lotes.</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-2">Status dos itens</p>
              <div className="space-y-1.5">
                {(["nao_iniciado", "pendente", "em_execucao", "concluido", "erro"] as DisparoItemStatus[]).map(s => {
                  const m = ITEM_STATUS_META[s];
                  const desc: Record<DisparoItemStatus, string> = {
                    nao_iniciado: "Item ainda não iniciou o fluxo.",
                    pendente: "Item enviado, aguardando início.",
                    em_execucao: "Item entrou no primeiro bloco do fluxo.",
                    concluido: "Item completou toda a automação.",
                    erro: "Ocorreu um erro durante a execução do item.",
                  };
                  return (
                    <p key={s} className="flex items-baseline gap-2">
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                      <span>{desc[s]}</span>
                    </p>
                  );
                })}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
