import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Filter, ChevronDown, ChevronRight } from "lucide-react";
import type { LeadFilter } from "@/data/disparos";
import type { LeadOrigin } from "@/data/mockData";

const LEAD_ORIGINS: LeadOrigin[] = [
  "Instagram", "Facebook Ads", "Google Ads", "Meta Ads", "TikTok Ads", "LinkedIn Ads",
  "YouTube Ads", "Email Marketing", "Orgânico", "WhatsApp", "Evento", "Indicação", "Site", "Outro",
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium px-2.5 py-1 rounded-full border transition-colors"
      style={{
        borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border))",
        background: active ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
        color: active ? "hsl(var(--primary))" : "#475569",
      }}
    >
      {children}
    </button>
  );
}

function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2.5 text-left"
      >
        <span className="text-sm font-medium text-foreground flex items-center gap-2">
          {label}
          {count ? <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">{count}</span> : null}
        </span>
        {open ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
      </button>
      {open && <div className="pb-3 pt-1">{children}</div>}
    </div>
  );
}

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter(x => x !== v) : [...a, v];
}

export function LeadFilterPanel({
  value,
  onApply,
}: {
  value: LeadFilter;
  onApply: (f: LeadFilter) => void;
}) {
  const { crmTags, teamMembers, pipelines, crmLists, products, customFieldGroups } = useCRM();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeadFilter>(value);

  const stages = pipelines
    .filter(p => !draft.pipelines?.length || draft.pipelines.includes(p.id))
    .flatMap(p => p.columns.map(c => ({ id: c.id, title: `${c.title}` })));

  const activeCount =
    (draft.tags?.ids.length ?? 0) + (draft.origins?.length ?? 0) + (draft.responsibles?.length ?? 0) +
    (draft.pipelines?.length ?? 0) + (draft.stages?.length ?? 0) + (draft.dealStatus?.length ?? 0) +
    (draft.lists?.length ?? 0) + (draft.products?.length ?? 0) +
    (draft.city ? 1 : 0) + (draft.state ? 1 : 0) +
    (draft.createdFrom || draft.createdTo ? 1 : 0) +
    (typeof draft.valueMin === "number" || typeof draft.valueMax === "number" ? 1 : 0) +
    (draft.customFields?.filter(c => c.value).length ?? 0);

  const set = (patch: Partial<LeadFilter>) => setDraft(d => ({ ...d, ...patch }));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(value); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter size={14} /> Filtros
          {activeCount > 0 && <span className="text-[10px] font-bold bg-primary text-white rounded-full px-1.5">{activeCount}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Filter size={15} className="text-primary" />
          <span className="text-sm font-semibold">Filtros</span>
        </div>
        <div className="px-4 overflow-y-auto flex-1">
          <Section label="Tags" count={draft.tags?.ids.length}>
            <div className="flex items-center gap-1.5 mb-2">
              {(["any", "all", "none"] as const).map(m => (
                <Chip key={m} active={(draft.tags?.mode ?? "any") === m} onClick={() => set({ tags: { mode: m, ids: draft.tags?.ids ?? [] } })}>
                  {m === "any" ? "Contém algum" : m === "all" ? "Contém todos" : "Não contém"}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {crmTags.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag.</span>}
              {crmTags.map(t => (
                <Chip key={t.id} active={!!draft.tags?.ids.includes(t.name)}
                  onClick={() => set({ tags: { mode: draft.tags?.mode ?? "any", ids: toggle(draft.tags?.ids, t.name) } })}>
                  {t.name}
                </Chip>
              ))}
            </div>
          </Section>

          <Section label="Origem" count={draft.origins?.length}>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_ORIGINS.map(o => (
                <Chip key={o} active={!!draft.origins?.includes(o)} onClick={() => set({ origins: toggle(draft.origins, o) })}>{o}</Chip>
              ))}
            </div>
          </Section>

          <Section label="Atendente" count={draft.responsibles?.length}>
            <div className="flex flex-wrap gap-1.5">
              {teamMembers.length === 0 && <span className="text-xs text-muted-foreground">Nenhum atendente.</span>}
              {teamMembers.map(m => (
                <Chip key={m} active={!!draft.responsibles?.includes(m)} onClick={() => set({ responsibles: toggle(draft.responsibles, m) })}>{m}</Chip>
              ))}
            </div>
          </Section>

          <Section label="Negócios" count={(draft.pipelines?.length ?? 0) + (draft.stages?.length ?? 0) + (draft.dealStatus?.length ?? 0) + (typeof draft.valueMin === "number" || typeof draft.valueMax === "number" ? 1 : 0)}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Situação</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {([["open", "Aberto"], ["won", "Ganho"], ["lost", "Perdido"]] as const).map(([v, label]) => (
                <Chip key={v} active={!!draft.dealStatus?.includes(v)} onClick={() => set({ dealStatus: toggle(draft.dealStatus, v) })}>{label}</Chip>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Pipeline</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {pipelines.map(p => (
                <Chip key={p.id} active={!!draft.pipelines?.includes(p.id)} onClick={() => set({ pipelines: toggle(draft.pipelines, p.id), stages: [] })}>{p.name}</Chip>
              ))}
            </div>
            {stages.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Etapa</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {stages.map(s => (
                    <Chip key={s.id} active={!!draft.stages?.includes(s.id)} onClick={() => set({ stages: toggle(draft.stages, s.id) })}>{s.title}</Chip>
                  ))}
                </div>
              </>
            )}
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Valor (R$)</p>
            <div className="flex items-center gap-2">
              <Input type="number" placeholder="mín" className="h-8 text-sm" value={draft.valueMin ?? ""} onChange={e => set({ valueMin: e.target.value === "" ? undefined : Number(e.target.value) })} />
              <span className="text-muted-foreground text-sm">—</span>
              <Input type="number" placeholder="máx" className="h-8 text-sm" value={draft.valueMax ?? ""} onChange={e => set({ valueMax: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </div>
          </Section>

          <Section label="Listas" count={draft.lists?.length}>
            <div className="flex flex-wrap gap-1.5">
              {crmLists.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma lista.</span>}
              {crmLists.map(l => (
                <Chip key={l.id} active={!!draft.lists?.includes(l.id)} onClick={() => set({ lists: toggle(draft.lists, l.id) })}>{l.name}</Chip>
              ))}
            </div>
          </Section>

          <Section label="Produtos" count={draft.products?.length}>
            <div className="flex flex-wrap gap-1.5">
              {products.length === 0 && <span className="text-xs text-muted-foreground">Nenhum produto.</span>}
              {products.map(p => (
                <Chip key={p.id} active={!!draft.products?.includes(p.id)} onClick={() => set({ products: toggle(draft.products, p.id) })}>{p.name}</Chip>
              ))}
            </div>
          </Section>

          <Section label="Endereço" count={(draft.city ? 1 : 0) + (draft.state ? 1 : 0)}>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Cidade" className="h-8 text-sm" value={draft.city ?? ""} onChange={e => set({ city: e.target.value || undefined })} />
              <Input placeholder="Estado (UF)" className="h-8 text-sm" value={draft.state ?? ""} onChange={e => set({ state: e.target.value || undefined })} />
            </div>
          </Section>

          <Section label="Data de criação" count={draft.createdFrom || draft.createdTo ? 1 : 0}>
            <div className="flex items-center gap-2">
              <Input type="date" className="h-8 text-sm" value={draft.createdFrom ?? ""} onChange={e => set({ createdFrom: e.target.value || undefined })} />
              <span className="text-muted-foreground text-sm">—</span>
              <Input type="date" className="h-8 text-sm" value={draft.createdTo ?? ""} onChange={e => set({ createdTo: e.target.value || undefined })} />
            </div>
          </Section>

          {customFieldGroups.some(g => g.items.length > 0) && (
            <Section label="Campos adicionais" count={draft.customFields?.filter(c => c.value).length}>
              <div className="space-y-2">
                {customFieldGroups.flatMap(g => g.items).map(item => {
                  const cur = draft.customFields?.find(c => c.fieldId === item.id)?.value ?? "";
                  return (
                    <div key={item.id}>
                      <label className="text-[11px] text-muted-foreground">{item.label}</label>
                      <Input className="h-8 text-sm" value={cur}
                        onChange={e => {
                          const others = (draft.customFields ?? []).filter(c => c.fieldId !== item.id);
                          set({ customFields: e.target.value ? [...others, { fieldId: item.id, value: e.target.value }] : others });
                        }} />
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => { setDraft({}); }}>Limpar filtros</Button>
          <Button size="sm" onClick={() => { onApply(draft); setOpen(false); }}>Aplicar filtros</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
