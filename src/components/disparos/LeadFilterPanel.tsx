import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Filter, ChevronRight, Tag, Radio, UserCheck, Briefcase,
  ListChecks, Package, MapPin, CalendarDays, SlidersHorizontal,
} from "lucide-react";
import type { LeadFilter } from "@/data/disparos";
import { LEAD_ORIGINS } from "@/data/mockData";
import { ListaOpcoes } from "@/components/filtros/ListaOpcoes";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium px-2.5 py-1 rounded-full border transition-colors"
      style={{
        borderColor: active ? "hsl(var(--primary))" : "#E5E7EB",
        background: active ? "hsl(var(--primary) / 0.08)" : "#fff",
        color: active ? "hsl(var(--primary))" : "#475569",
      }}
    >
      {children}
    </button>
  );
}

/** Rótulo das subdivisões dentro de um critério (Situação, Pipeline, Etapa…). */
function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{children}</p>
  );
}

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter(x => x !== v) : [...a, v];
}

type Criterio =
  | "tags" | "origem" | "atendente" | "negocios"
  | "listas" | "produtos" | "endereco" | "criacao" | "campos";

/**
 * Os critérios, na ordem do menu, com o próprio contador.
 *
 * A contagem mora aqui e não espalhada pelo JSX porque ela aparece em dois
 * lugares (a bolinha da linha e o total do botão), e duas contas separadas para
 * o mesmo número divergem no dia em que um critério ganhar um campo novo.
 */
const CRITERIOS: {
  chave: Criterio;
  rotulo: string;
  Icone: typeof Tag;
  contar: (f: LeadFilter) => number;
}[] = [
  { chave: "tags",      rotulo: "Tags",              Icone: Tag,               contar: f => f.tags?.ids.length ?? 0 },
  { chave: "origem",    rotulo: "Origem",            Icone: Radio,             contar: f => f.origins?.length ?? 0 },
  { chave: "atendente", rotulo: "Responsáveis",      Icone: UserCheck,         contar: f => f.responsibles?.length ?? 0 },
  { chave: "negocios",  rotulo: "Negócios",          Icone: Briefcase,         contar: f =>
    (f.pipelines?.length ?? 0) + (f.stages?.length ?? 0) + (f.dealStatus?.length ?? 0)
    + (typeof f.valueMin === "number" || typeof f.valueMax === "number" ? 1 : 0) },
  { chave: "listas",    rotulo: "Listas",            Icone: ListChecks,        contar: f => f.lists?.length ?? 0 },
  { chave: "produtos",  rotulo: "Produtos",          Icone: Package,           contar: f => f.products?.length ?? 0 },
  { chave: "endereco",  rotulo: "Endereço",          Icone: MapPin,            contar: f => (f.city ? 1 : 0) + (f.state ? 1 : 0) },
  { chave: "criacao",   rotulo: "Data de criação",   Icone: CalendarDays,      contar: f => (f.createdFrom || f.createdTo ? 1 : 0) },
  { chave: "campos",    rotulo: "Campos adicionais", Icone: SlidersHorizontal, contar: f => f.customFields?.filter(c => c.value).length ?? 0 },
];

/**
 * Filtro de leads do disparo e da automação.
 *
 * Menu de critérios com painel lateral, e não mais nove seções sanfonadas numa
 * coluna só. O formato antigo obrigava a rolar para descobrir o que existia: os
 * critérios de baixo (Produtos, Endereço, Campos adicionais) ficavam fora da
 * tela e ninguém sabia que estavam lá. Como menu, os nove cabem de uma vez e a
 * bolinha ao lado de cada um diz onde já há critério.
 *
 * É o mesmo desenho do filtro de /leads, de propósito: é a mesma tarefa nos três
 * lugares, e dois desenhos para ela obrigam a aprender duas vezes.
 *
 * Continua sendo este componente, e não o de /leads, porque aquele cobre cinco
 * critérios e este cobre nove. Trocar um pelo outro apagaria Listas, Produtos,
 * Endereço, Campos adicionais, situação do negócio e faixa de valor.
 */
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
  const [aberto, setAberto] = useState<Criterio | null>(null);

  const stages = pipelines
    .filter(p => !draft.pipelines?.length || draft.pipelines.includes(p.id))
    .flatMap(p => p.columns.map(c => ({ id: c.id, title: `${c.title}` })));

  // Campos adicionais só entram no menu quando a empresa tem algum: uma linha
  // que abre um painel vazio é uma promessa que o produto não cumpre.
  const temCampos = customFieldGroups.some(g => g.items.length > 0);
  const criterios = temCampos ? CRITERIOS : CRITERIOS.filter(c => c.chave !== "campos");

  const activeCount = criterios.reduce((s, c) => s + c.contar(draft), 0);

  const set = (patch: Partial<LeadFilter>) => setDraft(d => ({ ...d, ...patch }));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Ao abrir, o rascunho parte do que está em vigor. Ao fechar, o critério
        // aberto some: reabrir direto no painel lateral da última vez esconderia
        // a lista de critérios de quem só queria conferir o que está ativo.
        if (o) setDraft(value);
        setAberto(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter size={14} /> Filtros
          {activeCount > 0 && <span className="text-[10px] font-bold bg-primary text-white rounded-full px-1.5">{activeCount}</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-0 relative">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          <Filter size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
        </div>

        <div className="p-1.5">
          {criterios.map(({ chave, rotulo, Icone, contar }) => {
            const qtd = contar(draft);
            const ativo = aberto === chave;
            return (
              <button
                key={chave}
                type="button"
                onClick={() => setAberto(ativo ? null : chave)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors ${ativo ? "bg-muted" : "hover:bg-muted"}`}
              >
                <Icone size={14} className={qtd > 0 ? "text-primary" : "text-muted-foreground"} />
                <span className={`flex-1 text-left ${qtd > 0 ? "text-primary font-medium" : "text-foreground"}`}>
                  {rotulo}
                </span>
                {qtd > 0 && (
                  <span className="rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1.5 leading-4">{qtd}</span>
                )}
                <ChevronRight size={14} className="text-muted-foreground" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-2"
            disabled={activeCount === 0}
            // Limpa E aplica: um "limpar" que deixa a seleção filtrada até um
            // segundo clique em Aplicar não limpou nada aos olhos de quem usa.
            onClick={() => { setDraft({}); onApply({}); setAberto(null); }}
          >
            Limpar filtros
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => { onApply(draft); setOpen(false); }}>
            Aplicar filtros
          </Button>
        </div>

        {/* Painel do critério escolhido, à esquerda do menu. É para onde a pessoa
            acabou de apontar, e mantém a lista de critérios visível ao lado, sem
            trocar de tela dentro do popover. */}
        {aberto && (
          <div
            className="absolute top-0 right-full mr-2 w-72 rounded-md border bg-popover shadow-md p-3"
            style={{ maxHeight: 360, overflowY: "auto" }}
          >
            {aberto === "tags" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Sub>Tags</Sub>
                  {/* Três modos, porque "contém alguma", "contém todas" e "não
                      contém" respondem perguntas diferentes ao segmentar. */}
                  <select
                    value={draft.tags?.mode ?? "any"}
                    onChange={e => set({ tags: { mode: e.target.value as "any" | "all" | "none", ids: draft.tags?.ids ?? [] } })}
                    className="text-[11px] bg-transparent border rounded px-1.5 py-0.5 text-muted-foreground mb-1.5"
                  >
                    <option value="any">contém alguma</option>
                    <option value="all">contém todas</option>
                    <option value="none">não contém</option>
                  </select>
                </div>
                {/* Valor = NOME, e não id: `leads.tags` guarda o rótulo em
                    texto, e é isso que `leadMatchesFilter` compara. */}
                <ListaOpcoes
                  opcoes={crmTags.map(t => ({ valor: t.name, rotulo: t.name, cor: t.color }))}
                  selecionados={draft.tags?.ids}
                  onAlternar={v => set({ tags: { mode: draft.tags?.mode ?? "any", ids: toggle(draft.tags?.ids, v) } })}
                  vazio="Nenhuma tag."
                />
              </div>
            )}

            {aberto === "origem" && (
              <ListaOpcoes
                opcoes={LEAD_ORIGINS.map(o => ({ valor: o, rotulo: o }))}
                selecionados={draft.origins}
                onAlternar={v => set({ origins: toggle(draft.origins, v as typeof LEAD_ORIGINS[number]) })}
              />
            )}

            {aberto === "atendente" && (
              <ListaOpcoes
                opcoes={teamMembers.map(m => ({ valor: m, rotulo: m }))}
                selecionados={draft.responsibles}
                onAlternar={v => set({ responsibles: toggle(draft.responsibles, v) })}
                vazio="Nenhum responsável."
              />
            )}

            {aberto === "negocios" && (
              <>
                <Sub>Situação</Sub>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {([["open", "Aberto"], ["won", "Ganho"], ["lost", "Perdido"]] as const).map(([v, label]) => (
                    <Chip key={v} active={!!draft.dealStatus?.includes(v)} onClick={() => set({ dealStatus: toggle(draft.dealStatus, v) })}>{label}</Chip>
                  ))}
                </div>
                <Sub>Pipeline</Sub>
                <div className="mb-3">
                  {/* Trocar de pipeline zera as etapas: etapa pertence a um
                      pipeline, e uma etapa de outro nunca casaria com nada. */}
                  <ListaOpcoes
                    opcoes={pipelines.map(p => ({ valor: p.id, rotulo: p.name }))}
                    selecionados={draft.pipelines}
                    onAlternar={v => set({ pipelines: toggle(draft.pipelines, v), stages: [] })}
                    vazio="Nenhum pipeline."
                  />
                </div>
                {stages.length > 0 && (
                  <>
                    <Sub>Etapa</Sub>
                    <div className="mb-3">
                      <ListaOpcoes
                        opcoes={stages.map(s => ({ valor: s.id, rotulo: s.title }))}
                        selecionados={draft.stages}
                        onAlternar={v => set({ stages: toggle(draft.stages, v) })}
                      />
                    </div>
                  </>
                )}
                <Sub>Valor (R$)</Sub>
                <div className="flex items-center gap-2">
                  <Input type="number" placeholder="mín" className="h-8 text-sm" value={draft.valueMin ?? ""} onChange={e => set({ valueMin: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  <span className="text-muted-foreground text-sm">—</span>
                  <Input type="number" placeholder="máx" className="h-8 text-sm" value={draft.valueMax ?? ""} onChange={e => set({ valueMax: e.target.value === "" ? undefined : Number(e.target.value) })} />
                </div>
              </>
            )}

            {aberto === "listas" && (
              <ListaOpcoes
                opcoes={crmLists.map(l => ({ valor: l.id, rotulo: l.name }))}
                selecionados={draft.lists}
                onAlternar={v => set({ lists: toggle(draft.lists, v) })}
                vazio="Nenhuma lista."
              />
            )}

            {aberto === "produtos" && (
              <ListaOpcoes
                opcoes={products.map(p => ({ valor: p.id, rotulo: p.name }))}
                selecionados={draft.products}
                onAlternar={v => set({ products: toggle(draft.products, v) })}
                vazio="Nenhum produto."
              />
            )}

            {aberto === "endereco" && (
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Cidade" className="h-8 text-sm" value={draft.city ?? ""} onChange={e => set({ city: e.target.value || undefined })} />
                <Input placeholder="Estado (UF)" className="h-8 text-sm" value={draft.state ?? ""} onChange={e => set({ state: e.target.value || undefined })} />
              </div>
            )}

            {aberto === "criacao" && (
              <div className="flex items-center gap-2">
                <Input type="date" className="h-8 text-sm" value={draft.createdFrom ?? ""} onChange={e => set({ createdFrom: e.target.value || undefined })} />
                <span className="text-muted-foreground text-sm">—</span>
                <Input type="date" className="h-8 text-sm" value={draft.createdTo ?? ""} onChange={e => set({ createdTo: e.target.value || undefined })} />
              </div>
            )}

            {aberto === "campos" && (
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
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
