import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal, Plus, Minus, ChevronRight, ChevronDown, Check, X } from "lucide-react";
import type { LeadFilter } from "@/data/disparos";
import type { LeadOrigin } from "@/data/mockData";

const LEAD_ORIGINS: LeadOrigin[] = [
  "Instagram", "Facebook Ads", "Google Ads", "Meta Ads", "TikTok Ads", "LinkedIn Ads",
  "YouTube Ads", "Email Marketing", "Orgânico", "WhatsApp", "Evento", "Indicação", "Site", "Outro",
];

type Opt = { id: string; label: string };

// ─── Dropdown de múltipla seleção com busca (portal → sem corte pelo scroll) ──
function MultiSelect({
  options, selected, onToggle, placeholder = "Selecionar",
}: {
  options: Opt[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase())),
    [options, q],
  );
  const chosen = options.filter(o => selected.includes(o.id));

  return (
    <>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full h-9 px-3 inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-card text-sm hover:border-primary transition-colors"
          >
            <span className={chosen.length ? "text-foreground" : "text-muted-foreground"}>
              {chosen.length ? `${chosen.length} selecionado${chosen.length > 1 ? "s" : ""}` : placeholder}
            </span>
            <ChevronDown size={15} className="text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <div className="p-2 border-b border-border">
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar..." className="h-8 text-sm" />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nada encontrado.</div>}
            {filtered.map(o => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onToggle(o.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-foreground hover:bg-muted"
                >
                  <span className={"w-4 h-4 rounded border flex items-center justify-center shrink-0 " + (on ? "bg-primary border-primary" : "border-border")}>
                    {on && <Check size={11} className="text-primary-foreground" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {chosen.map(o => (
            <span key={o.id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full pl-2 pr-1 py-0.5 max-w-full">
              <span className="truncate">{o.label}</span>
              <button type="button" onClick={() => onToggle(o.id)} className="hover:text-primary/70 shrink-0"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Dropdown de seleção única com busca (usado no picker de campo adicional) ─
function SingleSelect({
  options, value, onChange, placeholder = "Selecionar",
}: {
  options: Opt[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase())),
    [options, q],
  );
  const current = options.find(o => o.id === value);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-9 px-3 inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-card text-sm hover:border-primary transition-colors"
        >
          <span className={current ? "text-foreground truncate" : "text-muted-foreground"}>{current?.label ?? placeholder}</span>
          <ChevronDown size={15} className="text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <div className="p-2 border-b border-border">
          <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar..." className="h-8 text-sm" />
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nada encontrado.</div>}
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-foreground hover:bg-muted"
            >
              <span className="truncate">{o.label}</span>
              {o.id === value && <Check size={13} className="text-primary ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Linha colapsável no estilo do print (＋ label … ＞)
function Row({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2.5 text-left"
      >
        <span className="text-sm text-foreground flex items-center gap-2">
          {open
            ? <Minus size={14} className="text-muted-foreground" />
            : <Plus size={14} className="text-muted-foreground" />}
          {label}
          {count ? <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">{count}</span> : null}
        </span>
        <ChevronRight size={15} className={"text-muted-foreground transition-transform " + (open ? "rotate-90" : "")} />
      </button>
      {open && <div className="pb-3 pt-1">{children}</div>}
    </div>
  );
}

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter(x => x !== v) : [...a, v];
}

const CF_OP_LABEL: Record<"igual" | "contem" | "diferente", string> = {
  igual: "Igual", contem: "Contém", diferente: "Diferente",
};

export function PipelineFilterPanel({
  value,
  onApply,
}: {
  value: LeadFilter;
  onApply: (f: LeadFilter) => void;
}) {
  const { crmTags, teamMembers, products, customFieldGroups, lossReasons } = useCRM();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeadFilter>(value);
  const set = (patch: Partial<LeadFilter>) => setDraft(d => ({ ...d, ...patch }));
  // Mantém o rascunho sincronizado quando o filtro aplicado muda por fora
  // (ex: botão "Limpar" na toolbar) — assim o badge do botão fica correto.
  useEffect(() => { if (!open) setDraft(value); }, [value, open]);

  // rascunho do "adicionar campo adicional" (print 3 e 4)
  const [cfField, setCfField] = useState("");
  const [cfOp, setCfOp] = useState<"igual" | "contem" | "diferente" | "">("");
  const [cfValue, setCfValue] = useState("");

  const cfItems = useMemo(() => customFieldGroups.flatMap(g => g.items), [customFieldGroups]);
  const cfLabel = (id: string) => cfItems.find(i => i.id === id)?.label ?? id;

  const activeCF = (draft.customFields ?? []).filter(c => c.value);
  const activeCount =
    (draft.tags?.ids.length ?? 0) + (draft.products?.length ?? 0) + (draft.responsibles?.length ?? 0) +
    (draft.movedFrom || draft.movedTo ? 1 : 0) + (draft.origins?.length ?? 0) +
    activeCF.length + (draft.lossReasons?.length ?? 0) +
    (typeof draft.valueMin === "number" ? 1 : 0) + (typeof draft.valueMax === "number" ? 1 : 0);

  const hasCustomFields = cfItems.length > 0;

  const addCustomField = () => {
    if (!cfField || !cfOp || !cfValue.trim()) return;
    const others = (draft.customFields ?? []).filter(c => c.fieldId !== cfField);
    set({ customFields: [...others, { fieldId: cfField, op: cfOp, value: cfValue.trim() }] });
    setCfField(""); setCfOp(""); setCfValue("");
  };
  const removeCustomField = (fieldId: string) =>
    set({ customFields: (draft.customFields ?? []).filter(c => c.fieldId !== fieldId) });

  const resetDraft = () => { setDraft({}); setCfField(""); setCfOp(""); setCfValue(""); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(value); }}>
      <PopoverTrigger asChild>
        <button className="h-[30px] px-3 inline-flex items-center gap-1.5 bg-card border border-card-border rounded-lg text-xs text-foreground hover:border-primary transition-colors whitespace-nowrap">
          <SlidersHorizontal size={13} className="text-muted-foreground" />
          Filtros
          {activeCount > 0 && <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 min-w-[16px] text-center">{activeCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 max-h-[75vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
        </div>

        <div className="px-4 overflow-y-auto flex-1">
          <Row label="Tags" count={draft.tags?.ids.length}>
            <label className="text-[11px] text-muted-foreground">Operação</label>
            <Select
              value={draft.tags?.mode ?? "any"}
              onValueChange={(m) => set({ tags: { mode: m as "any" | "all" | "none", ids: draft.tags?.ids ?? [] } })}
            >
              <SelectTrigger className="h-9 mt-0.5 mb-2 bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Contém algum</SelectItem>
                <SelectItem value="all">Contém todos</SelectItem>
                <SelectItem value="none">Não contém nenhum</SelectItem>
              </SelectContent>
            </Select>
            <MultiSelect
              options={crmTags.map(t => ({ id: t.name, label: t.name }))}
              selected={draft.tags?.ids ?? []}
              onToggle={(name) => set({ tags: { mode: draft.tags?.mode ?? "any", ids: toggle(draft.tags?.ids, name) } })}
            />
          </Row>

          <Row label="Produtos" count={draft.products?.length}>
            <MultiSelect
              options={products.map(p => ({ id: p.id, label: p.name }))}
              selected={draft.products ?? []}
              onToggle={(id) => set({ products: toggle(draft.products, id) })}
            />
          </Row>

          <Row label="Atendente" count={draft.responsibles?.length}>
            <MultiSelect
              options={teamMembers.map(m => ({ id: m, label: m }))}
              selected={draft.responsibles ?? []}
              onToggle={(id) => set({ responsibles: toggle(draft.responsibles, id) })}
            />
          </Row>

          <Row label="Data de movimentação" count={draft.movedFrom || draft.movedTo ? 1 : 0}>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-muted-foreground">De</label>
                <Input type="date" className="h-9 text-sm w-full min-w-0 mt-0.5" value={draft.movedFrom ?? ""} onChange={e => set({ movedFrom: e.target.value || undefined })} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Até</label>
                <Input type="date" className="h-9 text-sm w-full min-w-0 mt-0.5" value={draft.movedTo ?? ""} onChange={e => set({ movedTo: e.target.value || undefined })} />
              </div>
            </div>
          </Row>

          <Row label="Origem" count={draft.origins?.length}>
            <MultiSelect
              options={LEAD_ORIGINS.map(o => ({ id: o, label: o }))}
              selected={draft.origins ?? []}
              onToggle={(id) => set({ origins: toggle(draft.origins, id) })}
            />
          </Row>

          {hasCustomFields && (
            <Row label="Campos adicionais" count={activeCF.length}>
              <label className="text-[11px] text-muted-foreground">Campo</label>
              <div className="mt-0.5 mb-2">
                <SingleSelect
                  options={cfItems.map(i => ({ id: i.id, label: i.label }))}
                  value={cfField}
                  onChange={setCfField}
                />
              </div>
              <label className="text-[11px] text-muted-foreground">Operação</label>
              <Select value={cfOp} onValueChange={(v) => setCfOp(v as typeof cfOp)}>
                <SelectTrigger className="h-9 mt-0.5 mb-2 bg-card border-border">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="igual">Igual</SelectItem>
                  <SelectItem value="contem">Contém</SelectItem>
                  <SelectItem value="diferente">Diferente</SelectItem>
                </SelectContent>
              </Select>
              <label className="text-[11px] text-muted-foreground">Valor</label>
              <Input
                className="h-9 text-sm mt-0.5 mb-2"
                placeholder="Valor"
                value={cfValue}
                onChange={e => setCfValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomField(); } }}
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!cfField || !cfOp || !cfValue.trim()}
                onClick={addCustomField}
              >
                Adicionar
              </Button>

              {activeCF.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {activeCF.map(c => (
                    <div key={c.fieldId} className="flex items-center justify-between gap-2 bg-muted rounded-md px-2.5 py-1.5">
                      <span className="text-xs text-foreground truncate">
                        <b className="font-semibold">{cfLabel(c.fieldId)}</b>{" "}
                        <span className="text-muted-foreground">{CF_OP_LABEL[c.op ?? "contem"].toLowerCase()}</span>{" "}
                        {c.value}
                      </span>
                      <button type="button" onClick={() => removeCustomField(c.fieldId)} className="text-muted-foreground hover:text-foreground shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Row>
          )}

          <Row label="Motivo de perda" count={draft.lossReasons?.length}>
            <MultiSelect
              options={lossReasons.map(r => ({ id: r.id, label: r.name }))}
              selected={draft.lossReasons ?? []}
              onToggle={(id) => set({ lossReasons: toggle(draft.lossReasons, id) })}
            />
          </Row>

          <Row label="Valor mínimo" count={typeof draft.valueMin === "number" ? 1 : 0}>
            <Input type="number" placeholder="R$ mínimo" className="h-8 text-sm" value={draft.valueMin ?? ""}
              onChange={e => set({ valueMin: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Row>

          <Row label="Valor máximo" count={typeof draft.valueMax === "number" ? 1 : 0}>
            <Input type="number" placeholder="R$ máximo" className="h-8 text-sm" value={draft.valueMax ?? ""}
              onChange={e => set({ valueMax: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </Row>
        </div>

        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={resetDraft}>Limpar filtros</Button>
          <Button size="sm" onClick={() => { onApply(draft); setOpen(false); }}>Aplicar filtros</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
