// Menu de filtros da lista de /leads.
//
// Formato: uma lista curta com o nome de cada filtro e, ao clicar, um painel
// que abre AO LADO com os controles daquele critério. A alternativa (todos os
// campos empilhados de uma vez) é o que o painel do disparo já faz, e ali cabe:
// é uma etapa de wizard, com a tela inteira. Aqui é um menu suspenso sobre a
// lista, e cinco blocos abertos ao mesmo tempo cobririam justamente os leads
// que a pessoa está tentando filtrar.
//
// O filtro só vale quando a pessoa clica em "Aplicar": o que está sendo mexido
// é um rascunho. Aplicar a cada clique faria a lista pular embaixo do menu a
// cada tag marcada, e o número de resultados no rodapé perderia a função de
// prévia -- ele existe para responder "quantos vou pegar?" ANTES de aplicar.

import { useEffect, useMemo, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListaOpcoes } from "@/components/filtros/ListaOpcoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, SlidersHorizontal, Tag, GitBranch, CalendarDays, Radio, UserCheck } from "lucide-react";
import { LEAD_ORIGINS } from "@/data/mockData";
import type { LeadFilter } from "@/data/disparos";

/** Cada linha do menu. `contar` diz o número que aparece ao lado do nome. */
type Criterio = {
  chave: "tags" | "pipeline" | "criacao" | "origem" | "responsavel";
  rotulo: string;
  Icone: typeof Tag;
  contar: (f: LeadFilter) => number;
};

const CRITERIOS: Criterio[] = [
  { chave: "tags",        rotulo: "Tags",            Icone: Tag,          contar: f => f.tags?.ids.length ?? 0 },
  { chave: "pipeline",    rotulo: "Pipeline",        Icone: GitBranch,    contar: f => (f.pipelines?.length ?? 0) + (f.stages?.length ?? 0) },
  { chave: "criacao",     rotulo: "Data de criação", Icone: CalendarDays, contar: f => (f.createdFrom ? 1 : 0) + (f.createdTo ? 1 : 0) },
  { chave: "origem",      rotulo: "Origem",          Icone: Radio,        contar: f => f.origins?.length ?? 0 },
  { chave: "responsavel", rotulo: "Responsável",     Icone: UserCheck,    contar: f => f.responsibles?.length ?? 0 },
];

/** Marca ou desmarca um item numa lista de strings, devolvendo `undefined` quando esvazia. */
function alternar(atual: string[] | undefined, valor: string): string[] | undefined {
  const lista = atual ?? [];
  const proxima = lista.includes(valor) ? lista.filter(v => v !== valor) : [...lista, valor];
  return proxima.length ? proxima : undefined;
}

function LinhaMarcavel({ marcada, onClick, children }: { marcada: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
        marcada ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
      }`}
    >
      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${marcada ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
        {marcada && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}

export function LeadsFilterMenu({
  valor,
  onAplicar,
  contarResultados,
}: {
  /** O filtro em vigor na lista. */
  valor: LeadFilter;
  onAplicar: (f: LeadFilter) => void;
  /** Quantos leads o rascunho pegaria. Prévia, para decidir antes de aplicar. */
  contarResultados: (f: LeadFilter) => number;
}) {
  const { crmTags, pipelines, teamMembers } = useCRM();
  const [aberto, setAberto] = useState(false);
  const [criterioAberto, setCriterioAberto] = useState<Criterio["chave"] | null>(null);
  const [rascunho, setRascunho] = useState<LeadFilter>(valor);

  // Reabrir com o que está valendo, e não com o rascunho abandonado da vez
  // passada: quem fecha sem aplicar está desistindo, e o menu tem que refletir
  // a lista que a pessoa está vendo.
  useEffect(() => {
    // A busca de tags não é zerada aqui porque agora ela mora dentro da
    // ListaOpcoes, que remonta a cada abertura do critério e já nasce vazia.
    if (aberto) { setRascunho(valor); setCriterioAberto(null); }
  }, [aberto, valor]);

  const totalAplicado = useMemo(
    () => CRITERIOS.reduce((soma, c) => soma + c.contar(valor), 0),
    [valor],
  );
  const temFiltro = totalAplicado > 0;
  const resultados = contarResultados(rascunho);

  // Etapas do pipeline escolhido. Com mais de um pipeline marcado a lista
  // misturaria colunas homônimas ("Contato", "Proposta") de funis diferentes,
  // sem como distinguir qual é qual -- então ela só aparece com um escolhido.
  const pipelineUnico = rascunho.pipelines?.length === 1 ? rascunho.pipelines[0] : null;
  const etapas = pipelineUnico ? (pipelines.find(p => p.id === pipelineUnico)?.columns ?? []) : [];


  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          title="Filtrar leads"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors text-sm ${
            temFiltro
              ? "border-primary bg-primary/10 text-primary font-semibold"
              : "border-card-border bg-card hover:bg-muted text-foreground"
          }`}
        >
          <SlidersHorizontal size={15} />
          Filtros
          {/* O número evita o mistério mais comum de lista filtrada: "sumiram
              leads" quase sempre é um critério esquecido de ontem. */}
          {temFiltro && (
            <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-1.5 leading-5">
              {totalAplicado}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-60 p-0 relative">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          <SlidersHorizontal size={14} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
        </div>

        <div className="p-1.5">
          {CRITERIOS.map(({ chave, rotulo, Icone, contar }) => {
            const qtd = contar(rascunho);
            const ativo = criterioAberto === chave;
            return (
              <button
                key={chave}
                type="button"
                onClick={() => setCriterioAberto(ativo ? null : chave)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors ${
                  ativo ? "bg-muted" : "hover:bg-muted"
                }`}
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
            disabled={!temFiltro && CRITERIOS.every(c => c.contar(rascunho) === 0)}
            // Limpa E aplica: "limpar" que deixa a lista filtrada até um
            // segundo clique em Aplicar não limpa nada aos olhos de quem usa.
            onClick={() => { setRascunho({}); onAplicar({}); setCriterioAberto(null); }}
          >
            Limpar filtros
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => { onAplicar(rascunho); setAberto(false); }}
          >
            Aplicar {resultados > 0 ? `(${resultados})` : ""}
          </Button>
        </div>

        {/* Painel do critério escolhido, à esquerda do menu -- é para onde a
            pessoa acabou de apontar, e mantém a lista de critérios visível ao
            lado, sem trocar de tela dentro do menu. */}
        {criterioAberto && (
          <div
            className="absolute top-0 right-full mr-2 w-64 rounded-md border bg-popover shadow-md p-3"
            style={{ maxHeight: 340, overflowY: "auto" }}
          >
            {criterioAberto === "tags" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Tags</span>
                  {/* Três modos, porque "tem alguma", "tem todas" e "não tem"
                      respondem perguntas diferentes na hora de segmentar. */}
                  <select
                    value={rascunho.tags?.mode ?? "any"}
                    onChange={e => setRascunho(f => ({
                      ...f,
                      tags: { mode: e.target.value as "any" | "all" | "none", ids: f.tags?.ids ?? [] },
                    }))}
                    className="text-[11px] bg-transparent border rounded px-1.5 py-0.5 text-muted-foreground"
                  >
                    <option value="any">contém alguma</option>
                    <option value="all">contém todas</option>
                    <option value="none">não contém</option>
                  </select>
                </div>
                {/* Lista, e não nuvem de chips. Com rótulos de larguras
                    diferentes, cada linha quebrava num ponto distinto e nomes
                    longos ("Agente: Consultório Samantha Oliveira") tomavam uma
                    faixa inteira; achar uma tag virava varredura em zigue-zague.
                    Em coluna, o marcador alinha tudo no mesmo x e conferir o que
                    está marcado é correr o olho por uma coluna só.

                    Valor = NOME, e não id: `leads.tags` guarda o rótulo em texto
                    ("Meta ads"), e é isso que `leadMatchesFilter` compara. */}
                <ListaOpcoes
                  opcoes={crmTags.map(t => ({ valor: t.name, rotulo: t.name, cor: t.color }))}
                  selecionados={rascunho.tags?.ids}
                  onAlternar={nome => setRascunho(f => {
                    const ids = alternar(f.tags?.ids, nome) ?? [];
                    // Sem tag marcada, o critério inteiro sai do filtro: um
                    // `tags` com lista vazia continuaria contando como filtro
                    // ativo e a lista nunca voltaria ao normal.
                    return { ...f, tags: ids.length ? { mode: f.tags?.mode ?? "any", ids } : undefined };
                  })}
                  vazio="Nenhuma tag."
                />
              </div>
            )}

            {criterioAberto === "pipeline" && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-foreground">Pipeline</span>
                {pipelines.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">Nenhum pipeline cadastrado.</p>
                ) : pipelines.map(p => (
                  <LinhaMarcavel
                    key={p.id}
                    marcada={rascunho.pipelines?.includes(p.id) ?? false}
                    // Trocar de pipeline zera a etapa: ela pertence ao funil
                    // anterior e, mantida, filtraria por uma coluna que não
                    // existe no novo -- lista vazia sem explicação.
                    onClick={() => setRascunho(f => ({ ...f, pipelines: alternar(f.pipelines, p.id), stages: undefined }))}
                  >
                    {p.name}
                  </LinhaMarcavel>
                ))}
                {etapas.length > 0 && (
                  <div className="pt-2 mt-1 border-t space-y-1">
                    <span className="text-xs font-semibold text-foreground">Etapa</span>
                    {etapas.map(c => (
                      <LinhaMarcavel
                        key={c.id}
                        marcada={rascunho.stages?.includes(c.id) ?? false}
                        onClick={() => setRascunho(f => ({ ...f, stages: alternar(f.stages, c.id) }))}
                      >
                        {c.title}
                      </LinhaMarcavel>
                    ))}
                  </div>
                )}
              </div>
            )}

            {criterioAberto === "criacao" && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground">Data de criação</span>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">De</label>
                  <Input
                    type="date"
                    value={rascunho.createdFrom ?? ""}
                    onChange={e => setRascunho(f => ({ ...f, createdFrom: e.target.value || undefined }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Até</label>
                  <Input
                    type="date"
                    value={rascunho.createdTo ?? ""}
                    onChange={e => setRascunho(f => ({ ...f, createdTo: e.target.value || undefined }))}
                    className="h-8 text-xs"
                  />
                </div>
                {/* Um lado só é intervalo aberto, e vale: "criados a partir de
                    março" é pedido tão comum quanto o intervalo fechado. */}
                <p className="text-[11px] text-muted-foreground">Deixe um dos campos vazio para não limitar aquele lado.</p>
              </div>
            )}

            {criterioAberto === "origem" && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-foreground">Origem</span>
                {LEAD_ORIGINS.map(o => (
                  <LinhaMarcavel
                    key={o}
                    marcada={rascunho.origins?.includes(o) ?? false}
                    onClick={() => setRascunho(f => ({ ...f, origins: alternar(f.origins, o) }))}
                  >
                    {o}
                  </LinhaMarcavel>
                ))}
              </div>
            )}

            {criterioAberto === "responsavel" && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-foreground">Responsável</span>
                {teamMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">Nenhum membro na equipe.</p>
                ) : teamMembers.map(m => (
                  <LinhaMarcavel
                    key={m}
                    marcada={rascunho.responsibles?.includes(m) ?? false}
                    onClick={() => setRascunho(f => ({ ...f, responsibles: alternar(f.responsibles, m) }))}
                  >
                    {m}
                  </LinhaMarcavel>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
