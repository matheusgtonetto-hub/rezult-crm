import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadFilterPanel } from "./LeadFilterPanel";
import {
  fetchLeadManualAutomations, createDisparo, filterLeads, RHYTHMS,
  type AutomationOption, type LeadFilter, type DisparoRhythm,
} from "@/data/disparos";
import { Workflow, Search, Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Selecionar tipo de disparo" },
  { n: 2, label: "Selecionar automação" },
  { n: 3, label: "Selecionar leads" },
  { n: 4, label: "Configurar disparo" },
];

export function CreateDisparoWizard({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { leads, crmLists } = useCRM();
  const { company } = useCompany();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<"automation" | null>(null);
  const [automations, setAutomations] = useState<AutomationOption[]>([]);
  const [autoSearch, setAutoSearch] = useState("");
  const [automationId, setAutomationId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadFilter>({});
  const [leadSearch, setLeadSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rhythm, setRhythm] = useState<DisparoRhythm>("normal");
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirmFilters, setConfirmFilters] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // reset
    setStep(1); setType(null); setAutomationId(null); setFilter({}); setLeadSearch("");
    setTitle(""); setDescription(""); setRhythm("normal"); setScheduleOn(false); setScheduledAt(""); setConfirmFilters(false);
    if (company) fetchLeadManualAutomations(company.id).then(setAutomations).catch(() => setAutomations([]));
  }, [open, company?.id]);

  const allLeads = useMemo(() => Object.values(leads), [leads]);
  const effFilter = useMemo<LeadFilter>(() => ({ ...filter, search: leadSearch || filter.search }), [filter, leadSearch]);
  const matched = useMemo(() => filterLeads(allLeads, effFilter, { lists: crmLists }), [allLeads, effFilter, crmLists]);
  const selectedAutomation = automations.find(a => a.id === automationId);

  const canNext =
    (step === 1 && type) || (step === 2 && automationId) || (step === 3 && matched.length > 0) || step === 4;

  const save = async () => {
    if (!company || !automationId) return;
    if (!title.trim()) { toast.error("Informe um título"); return; }
    setSaving(true);
    try {
      const disparo = await createDisparo({
        companyId: company.id,
        ownerId: company.owner_id,
        createdBy: user?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        automationId,
        automationName: selectedAutomation?.name,
        rhythm,
        filters: filter,
        scheduledAt: scheduleOn && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        confirmFilters,
        leads: matched.map(l => ({ id: l.id, name: l.name, phone: l.whatsapp ?? "" })),
      });
      toast.success("Disparo criado com sucesso");
      onCreated(disparo.id);
    } catch (e) {
      toast.error("Não foi possível criar o disparo");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const filteredAutos = automations.filter(a => a.name.toLowerCase().includes(autoSearch.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden" style={{ width: "min(920px, 94vw)" }}>
        <div className="flex" style={{ minHeight: 480 }}>
          {/* Left rail */}
          <div className="w-64 shrink-0 border-r border-border p-6 bg-secondary/30">
            <h2 className="text-lg font-bold">Criar disparo</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Crie um disparo para executar automações em seus leads, acompanhe o progresso e configure intervalos entre execuções.
            </p>
            <div className="mt-6 space-y-4">
              {STEPS.map(s => {
                const done = step > s.n;
                const active = step === s.n;
                return (
                  <div key={s.n} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{
                        background: done ? "hsl(var(--primary))" : active ? "hsl(var(--primary) / 0.12)" : "transparent",
                        color: done ? "#fff" : active ? "hsl(var(--primary))" : "#94A3B8",
                        border: active ? "1.5px solid hsl(var(--primary))" : done ? "none" : "1.5px solid #CBD5E1",
                      }}
                    >
                      {done ? <Check size={13} /> : s.n}
                    </div>
                    <span className="text-sm" style={{ color: active ? "hsl(var(--foreground))" : "#94A3B8", fontWeight: active ? 600 : 400 }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 p-6 overflow-y-auto" style={{ maxHeight: "72vh" }}>
              {step === 1 && (
                <>
                  <h3 className="text-base font-semibold">Selecione o tipo de disparo</h3>
                  <p className="text-sm text-muted-foreground mb-4">Escolha o tipo de disparo que deseja criar.</p>
                  <button
                    type="button"
                    onClick={() => setType("automation")}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors"
                    style={{ borderColor: type === "automation" ? "hsl(var(--primary))" : "#E5E7EB", background: type === "automation" ? "hsl(var(--primary) / 0.04)" : "#fff" }}
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Workflow size={20} className="text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Disparo de automação</p>
                      <p className="text-xs text-muted-foreground">Execute automações completas para nutrir e engajar seus leads de forma eficaz.</p>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: type === "automation" ? "hsl(var(--primary))" : "#CBD5E1" }}>
                      {type === "automation" && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                  </button>
                </>
              )}

              {step === 2 && (
                <>
                  <h3 className="text-base font-semibold">Selecione a automação</h3>
                  <p className="text-sm text-muted-foreground">Escolha a automação que será executada.</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2 mb-3">
                    <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/50 flex items-center justify-center text-[9px]">i</span>
                    Somente automações com gatilho manual de leads podem ser selecionadas.
                  </p>
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Pesquisar..." className="pl-9 h-9" value={autoSearch} onChange={e => setAutoSearch(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    {filteredAutos.length === 0 && (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        Nenhuma automação com gatilho manual de leads.<br />Crie uma automação com o gatilho "Execução manual por lead".
                      </p>
                    )}
                    {filteredAutos.map(a => (
                      <button key={a.id} type="button" onClick={() => setAutomationId(a.id)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors"
                        style={{ borderColor: automationId === a.id ? "hsl(var(--primary))" : "#E5E7EB", background: automationId === a.id ? "hsl(var(--primary) / 0.04)" : "#fff" }}>
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: automationId === a.id ? "hsl(var(--primary))" : "#CBD5E1" }}>
                          {automationId === a.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm font-medium">{a.name}</span>
                        {!a.active && <span className="text-[10px] text-muted-foreground ml-auto">inativa</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h3 className="text-base font-semibold">Selecionar leads</h3>
                  <p className="text-sm text-muted-foreground mb-3">Filtre pelos leads que serão adicionados no disparo. Apenas os filtros serão considerados.</p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative flex-1">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Procurar na lista" className="pl-9 h-9" value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
                    </div>
                    <LeadFilterPanel value={filter} onApply={setFilter} />
                  </div>
                  <p className="text-sm font-semibold text-primary mb-2">{matched.length.toLocaleString("pt-BR")} leads correspondentes</p>
                  <div className="space-y-1.5">
                    {matched.slice(0, 60).map(l => (
                      <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border">
                        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                          {l.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{l.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{l.whatsapp || l.email || "—"}</p>
                        </div>
                        {(l.tags ?? []).slice(0, 2).map(t => (
                          <span key={t} className="text-[10px] bg-secondary rounded px-1.5 py-0.5 text-muted-foreground">{t}</span>
                        ))}
                      </div>
                    ))}
                    {matched.length > 60 && <p className="text-xs text-muted-foreground text-center py-2">+ {(matched.length - 60).toLocaleString("pt-BR")} leads</p>}
                    {matched.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum lead corresponde aos filtros.</p>}
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <h3 className="text-base font-semibold">Configurar disparo</h3>
                  <p className="text-sm text-muted-foreground mb-4">Preencha informações e configurações do disparo</p>
                  <label className="text-sm font-medium">Título</label>
                  <Input className="mt-1 mb-4" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Disparo Clientes Q3" />
                  <label className="text-sm font-medium">Descrição</label>
                  <Textarea className="mt-1 mb-4" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                  <label className="text-sm font-medium">Ritmo de execução</label>
                  <Select value={rhythm} onValueChange={v => setRhythm(v as DisparoRhythm)}>
                    <SelectTrigger className="mt-1 [&_[data-hint]]:hidden"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RHYTHMS.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          <div className="flex flex-col"><span>{r.label}</span><span data-hint className="text-[11px] text-muted-foreground">{r.hint}</span></div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-2">
                    <span className="text-primary">ℹ</span>
                    Verifique nas configurações da conexão da automação o limite de mensagens por segundo para definir o melhor tamanho do lote.
                  </p>
                  <p className="text-xs text-amber-600 flex items-start gap-1.5 mt-1 mb-4">⚠ Concorrência com APIs externas pode impactar a taxa de envio de mensagens/seg.</p>

                  <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
                    <Checkbox checked={scheduleOn} onCheckedChange={v => setScheduleOn(!!v)} className="mt-0.5" />
                    <span>
                      <span className="text-sm font-medium block">Agendar</span>
                      <span className="text-xs text-muted-foreground">Definir uma data e hora para o início do disparo, caso contrário deverá ser iniciado manualmente.</span>
                      {scheduleOn && <Input type="datetime-local" className="mt-2 h-9" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />}
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox checked={confirmFilters} onCheckedChange={v => setConfirmFilters(!!v)} className="mt-0.5" />
                    <span>
                      <span className="text-sm font-medium block">Confirmar filtros antes da execução</span>
                      <span className="text-xs text-muted-foreground">Atualizar a lista de leads com base no filtro selecionado antes do disparo inicial.</span>
                    </span>
                  </label>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2">
              {step > 1 && <Button variant="outline" onClick={() => setStep((step - 1) as Step)}>Voltar</Button>}
              {step < 4 && (
                <Button disabled={!canNext} onClick={() => setStep((step + 1) as Step)}>
                  {step === 3 ? `Selecionar ${matched.length.toLocaleString("pt-BR")} leads` : "Próximo"}
                </Button>
              )}
              {step === 4 && (
                <Button disabled={saving} onClick={save} className="gap-2">
                  {saving ? "Salvando..." : <><CheckCircle2 size={16} /> Salvar disparo</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
