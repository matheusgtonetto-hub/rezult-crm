import { useEffect, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SlidersHorizontal, ChevronRight,
  Tag, Package, UserCheck, CalendarClock, CalendarCheck, Radio, CircleSlash, CircleDot, GitBranch,
} from "lucide-react";
import type { LeadFilter } from "@/data/disparos";
import { LEAD_ORIGINS } from "@/data/mockData";
import { ListaOpcoes } from "@/components/filtros/ListaOpcoes";
import { SeletorDePeriodo } from "@/components/DateRangePicker";

/** Rótulo de subdivisão dentro do painel de um critério. */
function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{children}</p>;
}

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const a = arr ?? [];
  return a.includes(v) ? a.filter(x => x !== v) : [...a, v];
}

/**
 * Situação do negócio. Mora aqui, e não na página, porque agora dois controles
 * a escrevem -- o seletor da barra e este painel -- e um `type` em cada lugar
 * deixaria as opções divergirem na primeira vez que alguém acrescentasse uma.
 */
export type StatusFilter = "open" | "won" | "lost" | "all";

const STATUS_OPCOES: { valor: StatusFilter; rotulo: string }[] = [
  { valor: "open", rotulo: "Em aberto" },
  { valor: "won",  rotulo: "Ganho" },
  { valor: "lost", rotulo: "Perdido" },
  { valor: "all",  rotulo: "Todos" },
];

type Criterio =
  | "tags" | "produtos" | "atendente" | "status" | "criacao" | "origem"
  | "situacao" | "negocios" | "fechamento" | "perda";

/**
 * Critérios do filtro, na ordem do menu, cada um com o próprio contador.
 *
 * A contagem mora aqui porque aparece em dois lugares -- a bolinha da linha e o
 * total do botão -- e duas contas separadas para o mesmo número divergem no dia
 * em que um critério ganhar um campo novo.
 */
const CRITERIOS: {
  chave: Criterio;
  rotulo: string;
  Icone: typeof Tag;
  contar: (f: LeadFilter) => number;
}[] = [
  { chave: "tags",         rotulo: "Tags",                             Icone: Tag,             contar: f => f.tags?.ids.length ?? 0 },
  { chave: "produtos",     rotulo: "Produtos",                         Icone: Package,         contar: f => f.products?.length ?? 0 },
  // "Responsáveis", e não "Atendente": o campo é `responsibles` no lead e a
  // coluna se chama Responsável na lista. Dois nomes para o mesmo dado fazem
  // quem filtra duvidar se está mexendo em outra coisa.
  { chave: "atendente",    rotulo: "Responsáveis",                     Icone: UserCheck,       contar: f => f.responsibles?.length ?? 0 },
  // Status não sai do LeadFilter: ele vive fora, no seletor da barra. Por isso
  // conta zero aqui e ganha o próprio badge no menu, tratado à parte.
  { chave: "status",       rotulo: "Status",                           Icone: CircleDot,       contar: () => 0 },
  // Conta só etapas: o funil é navegação, não critério, e este painel nunca
  // escreve em `f.pipelines`.
  /**
   * Situação pelo `dealStatus` do próprio filtro, e não pelo estado externo do
   * critério "status".
   *
   * São dois critérios porque são dois mecanismos. O "status" espelha o seletor
   * da barra da pipeline: escolha única, sempre com um valor, e "Todos" é como
   * ele diz "sem restrição". Este grava no filtro: aceita nenhuma marcada, e
   * nenhuma marcada JÁ significa todas -- por isso não tem a opção "Todos" nem
   * precisa de valor inicial.
   *
   * Telas sem o seletor da barra usam este. Além de dispensar o pré-preenchido,
   * ele some a classe inteira de bug do outro: sem estado paralelo, não há
   * neutro para o contador errar.
   */
  { chave: "situacao",     rotulo: "Status",                           Icone: CircleDot,       contar: f => f.dealStatus?.length ?? 0 },
  { chave: "negocios",     rotulo: "Negócios",                         Icone: GitBranch,       contar: f => f.stages?.length ?? 0 },
  // `createdFrom/To` casa contra `lead.created_at ?? lead.entryDate`, que é a
  // data de criação do negócio. O critério anterior usava `movedFrom/To`, que
  // olha `stageEnteredAt` -- a última vez que o card mudou de etapa, e não
  // quando ele nasceu.
  { chave: "criacao",      rotulo: "Data de criação",                  Icone: CalendarClock,   contar: f => (f.createdFrom || f.createdTo ? 1 : 0) },
  // Logo abaixo de "Data de criação" no menu, mas responde outra pergunta:
  // quando o negócio TERMINOU. Só casa com ganhos e perdidos, porque quem está
  // em aberto não tem data de desfecho.
  { chave: "fechamento",   rotulo: "Data de ganho/perdido",            Icone: CalendarCheck,   contar: f => (f.closedFrom || f.closedTo ? 1 : 0) },
  { chave: "origem",       rotulo: "Origem",                           Icone: Radio,           contar: f => f.origins?.length ?? 0 },
  { chave: "perda",        rotulo: "Motivo de perda",                  Icone: CircleSlash,     contar: f => f.lossReasons?.length ?? 0 },
];

/**
 * Filtro da pipeline. É o desenho de referência dos filtros do CRM.
 *
 * Menu de critérios com painel à esquerda, e não sanfonas empilhadas. Com nove
 * critérios abertos numa coluna, os de baixo (Motivo de perda, faixa de valor)
 * ficavam fora da vista e ninguém descobria que existiam; e abrir dois ao mesmo
 * tempo cobria a pipeline que a pessoa está justamente tentando filtrar.
 *
 * O painel abre AO LADO, não por baixo: mantém a lista de critérios visível
 * enquanto se mexe num deles, e é ela que diz onde já existe filtro ativo.
 */
export function PipelineFilterPanel({
  value,
  onApply,
  status,
  onChangeStatus,
  statusNeutro = "open",
  contarResultados,
  mostrar,
}: {
  value: LeadFilter;
  onApply: (f: LeadFilter) => void;
  /**
   * Situação em vigor. Vem de fora porque é a MESMA do seletor da barra: dois
   * filtros de status independentes se somariam em silêncio, e "Ganho" na barra
   * com "Perdido" aqui devolveria zero cards sem nada na tela explicando.
   */
  status?: StatusFilter;
  onChangeStatus?: (s: StatusFilter) => void;
  /**
   * Qual valor de status significa "sem filtro de situação" NESTA tela.
   *
   * Muda de lugar para lugar, por isso vem de fora. Na pipeline é "Em aberto":
   * é o dia a dia de quem trabalha o funil, e tratá-lo como filtro ativo
   * deixaria o "Limpar" da barra e o contador acesos para sempre. Onde o status
   * é o `dealStatus` do filtro, o neutro é a ausência dele.
   *
   * Governa duas coisas: o que o contador considera restrição, e para onde o
   * "Limpar filtros" devolve a tela.
   */
  statusNeutro?: StatusFilter;
  /**
   * Quantos itens o rascunho pegaria, para o botão "Aplicar" mostrar antes.
   *
   * Recebe o filtro E o status separados porque só quem chama sabe combiná-los:
   * na pipeline o status vive fora do LeadFilter, na lista de leads ele É o
   * `dealStatus` do filtro. Compondo aqui, um dos dois contaria errado.
   *
   * Ausente, o botão fica só "Aplicar filtros".
   */
  contarResultados?: (f: LeadFilter, s: StatusFilter) => number;
  /**
   * Quais critérios o menu mostra, na ordem em que aparecem.
   *
   * Obrigatória, e não com um padrão "mostra todos". O padrão parecia cômodo e
   * era uma armadilha: cada critério novo criado para uma tela aparecia sozinho
   * em todas as outras. Foi assim que a pipeline ganhou um segundo "Status" e um
   * "Negócios" que não faz sentido dentro de um funil.
   *
   * Exigindo a lista, incluir um critério vira decisão de quem o quer, e não
   * efeito colateral de quem não sabia que ele existia.
   */
  mostrar: Criterio[];
}) {
  const { crmTags, teamMembers, products, lossReasons, pipelines } = useCRM();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeadFilter>(value);
  const [aberto, setAberto] = useState<Criterio | null>(null);
  // Rascunho próprio para o status seguir a mesma regra do painel: só vale no
  // "Aplicar". Aplicado a cada clique, a pipeline se refaria por baixo do menu.
  const [statusDraft, setStatusDraft] = useState<StatusFilter>(status ?? "all");
  const set = (patch: Partial<LeadFilter>) => setDraft(d => ({ ...d, ...patch }));

  /**
   * Etapas oferecidas: as dos funis escolhidos, ou de todos quando nenhum foi.
   *
   * O nome do funil entra no rótulo quando há mais de um em jogo. Sem isso,
   * "Contato" e "Proposta" aparecem repetidos, uma vez por funil, e não há como
   * saber qual é qual na hora de marcar.
   */
  /**
   * Funil em foco: aquele cujas etapas a coluna da direita mostra.
   *
   * Só isso. O funil NÃO entra no filtro -- ele é o caminho até a etapa, não um
   * critério. Quem filtra é `stages`, e elas se acumulam entre funis: dá para
   * marcar duas etapas de Vendas, trocar para Suporte e marcar mais uma, e as
   * três valem juntas.
   *
   * Se o funil também filtrasse, marcar "Vendas" e a etapa "Proposta" de lá
   * criaria uma condição redundante, e marcar "Vendas" sem etapa nenhuma
   * significaria uma coisa diferente de marcar todas as etapas dele -- duas
   * formas de dizer o mesmo, com resultados que divergem em casos de borda.
   */
  const [funilFocado, setFunilFocado] = useState<string | null>(null);
  const focado = pipelines.find(p => p.id === funilFocado) ?? pipelines[0] ?? null;
  const idsDoFoco = new Set(focado?.columns.map(c => c.id) ?? []);
  const etapasForaDoFoco = (draft.stages ?? []).filter(id => !idsDoFoco.has(id)).length;

  /**
   * Com o painel FECHADO, os rascunhos voltam a espelhar o que está aplicado.
   *
   * Vale para os dois. O do LeadFilter já precisava disso para acompanhar
   * mudanças de fora, como o "Limpar" da barra. O do status precisa por outro
   * motivo: ele abre em "Todos" por padrão, e sem devolvê-lo ao fechar, sair
   * sem aplicar deixaria o botão contando um filtro que nunca entrou em vigor.
   *
   * Fechar por qualquer caminho passa por aqui -- Esc, clique fora ou Aplicar --
   * então não há saída que escape da sincronização.
   */
  useEffect(() => {
    if (open) return;
    setDraft(value);
    setStatusDraft(status ?? "all");
  }, [value, status, open]);

  // A ordem é a de `mostrar`, não a do catálogo: quem chama decide onde cada
  // critério cai no menu da sua tela.
  const criterios = mostrar.map(c => CRITERIOS.find(x => x.chave === c)!).filter(Boolean);

  /**
   * O status é assunto deste painel? Sai de `mostrar`, e não de uma prop à
   * parte, para o painel não poder contar um critério que ele não desenha.
   *
   * Era o bug: em /leads o Status não aparece no menu, mas o contador seguia
   * somando +1 sempre. "Sem filtro de situação" ali vira "Todos" (o `dealStatus`
   * some do filtro), e o teste era `!== "open"` -- verdadeiro para "Todos". O
   * botão nascia com "1" e não havia como zerar, porque não existia o controle.
   */
  const usaStatus = criterios.some(c => c.chave === "status");
  const statusRestringe = usaStatus && statusDraft !== statusNeutro;
  const activeCount = criterios.reduce((s, c) => s + c.contar(draft), 0);
  // O número do botão soma o status, senão filtrar por "Ganho" não apareceria
  // em lugar nenhum com o menu fechado.
  const badgeCount = activeCount + (statusRestringe ? 1 : 0);

  // Limpar devolve ao MESMO estado em que o painel abre, e não ao padrão da
  // barra. Zerando para "Em aberto", limpar deixaria o recorte mais restrito do
  // que simplesmente abrir o painel, que é o oposto do que a palavra promete.
  /**
   * Limpa E aplica, no mesmo clique.
   *
   * Só zerar o rascunho fazia o botão mentir: a tela continuava filtrada até um
   * segundo clique em "Aplicar", e "limpar" que não limpa nada é a pior espécie
   * de botão. Fecha junto porque não sobrou nada para ajustar ali.
   *
   * O status também sai daqui, e não só do rascunho, senão limpar deixaria a
   * lista sem filtro nenhum mas ainda presa a uma situação.
   */
  const limparEAplicar = () => {
    setDraft({});
    // Volta ao NEUTRO da tela, e não a "Todos".
    //
    // Abrir o painel parte de "Todos" para o filtro não esbarrar no status da
    // barra, mas limpar é outra coisa: é devolver a tela ao estado sem filtro.
    // Na pipeline o neutro é "Em aberto", e deixá-la em "Todos" mantinha o
    // "Limpar" da barra na tela e o contador do botão em 1 -- ou seja, limpar
    // não limpava, que é justamente o que se quer evitar aqui.
    setStatusDraft(statusNeutro);
    onApply({});
    if (usaStatus) onChangeStatus?.(statusNeutro);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Abrir os filtros parte de "Todos", e não do status em vigor.
        //
        // O seletor da barra começa em "Em aberto", e ele se soma ao que for
        // marcado aqui. Filtrar por "Data de ganho/perdido" nessa combinação
        // devolve zero cards SEMPRE, porque nenhum negócio ganho continua em
        // aberto -- e a tela não tem como dizer que a culpa é de um seletor lá
        // fora. Partindo de "Todos", o painel responde só o que foi pedido nele.
        //
        // O seletor da barra não muda: lá o padrão "Em aberto" é o dia a dia de
        // quem trabalha a pipeline.
        if (o) { setDraft(value); setStatusDraft("all"); }  // "all" = sem restrição de situação
        // Fechar esquece o critério aberto: reabrir direto no painel lateral da
        // última vez esconderia a lista de quem só queria conferir o que está ativo.
        setAberto(null);
      }}
    >
      <PopoverTrigger asChild>
        <button className="h-[30px] px-3 inline-flex items-center gap-1.5 bg-card border border-card-border rounded-lg text-xs text-foreground hover:border-primary transition-colors whitespace-nowrap">
          <SlidersHorizontal size={13} className="text-muted-foreground" />
          Filtros
          {badgeCount > 0 && <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 min-w-[16px] text-center">{badgeCount}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-0 relative">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          <SlidersHorizontal size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
        </div>

        <div className="p-1.5">
          {criterios.map(({ chave, rotulo, Icone, contar }) => {
            const qtd = contar(draft);
            const ativo = aberto === chave;
            // Status não tem contagem; o que o marca como ativo é não estar no
            // padrão. Sem isto, a linha nunca acenderia mesmo filtrando.
            const destacado = chave === "status" ? statusDraft !== "open" : qtd > 0;
            return (
              <button
                key={chave}
                type="button"
                onClick={() => setAberto(ativo ? null : chave)}
                // py-[5px] e não py-1.3: a escala do Tailwind pula de 1 (4px) para
                // 1.5 (6px), e classe fora da escala não vira CSS nenhum -- o
                // padding cairia para zero sem erro em lugar algum. 1.3 daria
                // 5,2px; 5 evita a fração de pixel.
                className={`w-full flex items-center gap-2 px-2 py-[5px] rounded-md text-[13px] transition-colors ${ativo ? "bg-muted" : "hover:bg-muted"}`}
              >
                {/* Ícone e nome sempre em preto. O verde era a terceira camada
                    dizendo a mesma coisa que a bolinha de contagem ao lado, e
                    numa coluna de oito linhas deixava metade delas coloridas.
                    O peso 500 fica: sinaliza o critério ativo sem tingir. */}
                <Icone size={13} className="text-foreground" />
                <span className={`flex-1 text-left text-foreground ${destacado ? "font-medium" : ""}`}>
                  {rotulo}
                </span>
                {qtd > 0 && (
                  <span className="rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1.5 leading-4">{qtd}</span>
                )}
                {/* O status mostra o VALOR escolhido, não uma contagem: "Ganho"
                    diz o que está filtrando, e "1" não diria nada. Só aparece
                    fora do padrão ("Em aberto"), senão a linha ficaria sempre
                    marcada e o realce perderia a função. */}
                {chave === "status" && statusDraft !== "open" && (
                  <span className="rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1.5 leading-4">
                    {STATUS_OPCOES.find(o => o.valor === statusDraft)?.rotulo}
                  </span>
                )}
                <ChevronRight size={14} className="text-muted-foreground" />
              </button>
            );
          })}
        </div>

        {/* Metade para cada um. Com `justify-between` sobrava um vão no meio
            que não separava nada: são duas ações do mesmo passo, e o espaço
            entre elas sugeria que uma pertencia a outro grupo. */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-t">
          {/* Contorno verde e fundo branco, contra o verde chapado do "Aplicar"
              ao lado. Os dois são ações de peso diferente: um desfaz, o outro
              confirma, e o botão vazado diz isso sem precisar de rótulo extra.
              Antes era `ghost`, sem borda nenhuma, e passava por texto solto.

              Mesmo `size="sm"` do vizinho, então o raio já era idêntico. */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs px-2 border-primary bg-card text-primary hover:bg-primary/10 hover:text-primary"
            disabled={activeCount === 0 && !statusRestringe}
            onClick={limparEAplicar}
          >
            Limpar filtros
          </Button>
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            // Os dois saem no mesmo clique. Aplicando só um, a pipeline se
            // refaria duas vezes e o intermediário mostraria um recorte que
            // ninguém pediu.
            // O status só é escrito onde ele é oferecido. Sem esta guarda, o
            // painel de /leads apagaria um `dealStatus` que veio de outro lugar.
            onClick={() => { onApply(draft); if (usaStatus) onChangeStatus?.(statusDraft); setOpen(false); }}
          >
            Aplicar filtros{contarResultados ? ` (${contarResultados(draft, statusDraft)})` : ""}
          </Button>
        </div>

        {/* Painel do critério escolhido, à esquerda do menu. É para onde a pessoa
            acabou de apontar, e mantém a lista de critérios visível ao lado. */}
        {aberto && (() => {
          // Os dois critérios de data usam o calendário, que dimensiona pelo
          // conteúdo e passa da altura das listas. Uma flag só evita a lista de
          // exceções crescer a cada critério de data novo.
          const ehCalendario = aberto === "criacao" || aberto === "fechamento";
          // Negócios tem duas colunas e não cabe nos 288px das listas simples.
          const largo = ehCalendario || aberto === "negocios";
          const duasColunas = aberto === "negocios";
          /**
           * Quais painéis levam régua sob o título.
           *
           * Os que começam direto numa lista, sem busca no meio. Onde a busca
           * existe, ela já é o corte entre o título e as opções, e a régua
           * viraria um segundo separador para a mesma divisão.
           */
          const tituloComRegua = duasColunas || aberto === "situacao";
          return (
          <div
            className={`absolute top-0 right-full mr-2 rounded-md border bg-popover shadow-md p-3 ${
              // O calendário precisa de presets + um mês lado a lado; os demais
              // critérios são listas e ficariam soltas nessa largura.
              // `w-auto` e não uma largura fixa: o cabeçalho do calendário
              // (seta, dois títulos de mês, seta) pede mais que a fileira de
              // dias, e qualquer número que eu chutasse espremia o header e
              // empurrava a seta da direita para fora do painel. Deixando
              // dimensionar pelo conteúdo, é o mesmo comportamento do popover
              // da barra, que é `w-auto`.
              largo ? "w-auto" : "w-72"
            }`}
            // O calendário passa dos 380px de altura e ficaria com rolagem
            // interna, escondendo o rodapé de "Limpar filtro". As listas
            // continuam limitadas, senão uma conta com 200 tags esticaria o
            // painel para fora da tela.
            style={largo ? undefined : { maxHeight: 380, overflowY: "auto" }}
          >
            {/* O nome vem do CRITERIOS, e não escrito em cada ramo. Um painel
                novo herda o título de graça, e nenhum pode nascer anônimo por
                esquecimento -- que é como o de Produtos e o de Responsáveis
                estavam. Também impede o título divergir do rótulo do menu, que
                é o mesmo texto lido dois segundos antes. */}
            <div className={tituloComRegua ? "border-b pb-1.5 mb-2" : ""}>
              <Sub>{criterios.find(c => c.chave === aberto)?.rotulo}</Sub>
            </div>

            {aberto === "tags" && (
              <div className="space-y-2">
                <div>
                  {/* Três modos, porque "contém algum", "contém todos" e "não
                      contém" respondem perguntas diferentes ao segmentar. */}
                  <Select
                    value={draft.tags?.mode ?? "any"}
                    onValueChange={(m) => set({ tags: { mode: m as "any" | "all" | "none", ids: draft.tags?.ids ?? [] } })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-card border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Contém algum</SelectItem>
                      <SelectItem value="all">Contém todos</SelectItem>
                      <SelectItem value="none">Não contém nenhum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Valor = NOME, e não id: `leads.tags` guarda o rótulo em texto,
                    e é isso que `leadMatchesFilter` compara. */}
                <ListaOpcoes
                  opcoes={crmTags.map(t => ({ valor: t.name, rotulo: t.name, cor: t.color }))}
                  selecionados={draft.tags?.ids}
                  onAlternar={(nome) => set({ tags: { mode: draft.tags?.mode ?? "any", ids: toggle(draft.tags?.ids, nome) } })}
                  vazio="Nenhuma tag."
                />
              </div>
            )}

            {aberto === "produtos" && (
              <ListaOpcoes
                opcoes={products.map(p => ({ valor: p.id, rotulo: p.name }))}
                selecionados={draft.products}
                onAlternar={(id) => set({ products: toggle(draft.products, id) })}
                vazio="Nenhum produto."
              />
            )}

            {aberto === "atendente" && (
              <ListaOpcoes
                opcoes={teamMembers.map(m => ({ valor: m, rotulo: m }))}
                selecionados={draft.responsibles}
                onAlternar={(id) => set({ responsibles: toggle(draft.responsibles, id) })}
                vazio="Nenhum responsável."
              />
            )}

            {aberto === "status" && (
              // Escolha única com a mesma lista dos outros critérios: o gesto de
              // marcar é o mesmo, só que aqui a marcação anterior sai sozinha.
              <ListaOpcoes
                opcoes={STATUS_OPCOES.map(o => ({ valor: o.valor, rotulo: o.rotulo }))}
                selecionados={[statusDraft]}
                onAlternar={(v) => setStatusDraft(v as StatusFilter)}
              />
            )}

            {aberto === "fechamento" && (
              <div className="-m-3">
                <SeletorDePeriodo
                  dateFrom={draft.closedFrom ?? ""}
                  dateTo={draft.closedTo ?? ""}
                  onChangeRange={(de, ate) => set({ closedFrom: de || undefined, closedTo: ate || undefined })}
                />
              </div>
            )}

            {aberto === "situacao" && (
              // Múltipla escolha: "ganhos e perdidos" é um recorte legítimo, e
              // o campo do filtro é uma lista. Sem "Todos" na lista, porque
              // nada marcado já é isso.
              <ListaOpcoes
                semBusca
                opcoes={[
                  { valor: "open", rotulo: "Em aberto" },
                  { valor: "won",  rotulo: "Ganho" },
                  { valor: "lost", rotulo: "Perdido" },
                ]}
                selecionados={draft.dealStatus}
                onAlternar={(v) => set({
                  // Lista vazia sai do filtro: um `dealStatus: []` continuaria
                  // contando como critério ativo e o botão nunca zeraria.
                  dealStatus: (() => {
                    const proxima = toggle(draft.dealStatus, v as "open" | "won" | "lost");
                    return proxima.length ? proxima : undefined;
                  })(),
                })}
              />
            )}

            {aberto === "negocios" && (
              // Duas colunas: funis à esquerda, etapas do funil em foco à
              // direita. Empilhadas, a lista de etapas ficava longe do funil que
              // a originou e era preciso rolar para ligar uma coisa à outra.
              <div className="flex gap-3">
                <div className="w-[170px] shrink-0 border-r pr-3">
                  <Sub>Pipeline</Sub>
                  {/* `navegacao`: escolher um funil só troca o que a coluna da
                      direita mostra. Sem visto e com realce cinza, porque não há
                      nada sendo filtrado aqui.

                      Sem busca: funis são poucos e cabem inteiros na coluna.

                      As etapas NÃO são zeradas ao trocar de funil: é isso que
                      permite juntar etapas de funis diferentes num filtro só. */}
                  <ListaOpcoes
                    navegacao
                    semBusca
                    opcoes={pipelines.map(p => ({ valor: p.id, rotulo: p.name }))}
                    selecionados={focado ? [focado.id] : []}
                    onAlternar={setFunilFocado}
                    vazio="Nenhum pipeline."
                  />
                </div>
                <div className="flex-1 min-w-[190px]">
                  <Sub>Etapa</Sub>
                  {focado ? (
                    <ListaOpcoes
                      marcador="ponto"
                      // Sem busca também: as etapas mostradas são as de UM funil,
                      // e funil com tantas colunas a ponto de precisar procurar
                      // já seria difícil de operar no kanban.
                      semBusca
                      opcoes={focado.columns.map(c => ({ valor: c.id, rotulo: c.title, cor: c.color }))}
                      selecionados={draft.stages}
                      onAlternar={(id) => set({ stages: toggle(draft.stages, id) })}
                      vazio="Nenhuma etapa."
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground py-1">Escolha um pipeline.</p>
                  )}
                  {/* Etapa marcada em OUTRO funil fica invisível nesta coluna. Sem
                      este aviso, o número no menu diria 5 com duas marcadas na
                      tela, e não haveria como descobrir onde estão as outras. */}
                  {etapasForaDoFoco > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t">
                      +{etapasForaDoFoco} etapa{etapasForaDoFoco > 1 ? "s" : ""} marcada{etapasForaDoFoco > 1 ? "s" : ""} em outro pipeline.
                    </p>
                  )}
                </div>
              </div>
            )}

            {aberto === "criacao" && (
              // Mesmo seletor do "Data" da barra da pipeline, e não dois campos
              // de data soltos: ali em cima "Últimos 15 dias" é um clique, e
              // aqui exigia abrir dois calendários e contar os dias na mão.
              //
              // Cabe inteiro porque o painel abre para a ESQUERDA: 700px do
              // calendário mais os 256 do menu dão ~964px a partir da borda
              // direita, e a pipeline é tela de desktop.
              <div className="-m-3">
                <SeletorDePeriodo
                  dateFrom={draft.createdFrom ?? ""}
                  dateTo={draft.createdTo ?? ""}
                  onChangeRange={(de, ate) => set({ createdFrom: de || undefined, createdTo: ate || undefined })}
                />
              </div>
            )}

            {aberto === "origem" && (
              <ListaOpcoes
                opcoes={LEAD_ORIGINS.map(o => ({ valor: o, rotulo: o }))}
                selecionados={draft.origins}
                onAlternar={(id) => set({ origins: toggle(draft.origins, id as typeof LEAD_ORIGINS[number]) })}
              />
            )}

            {aberto === "perda" && (
              <ListaOpcoes
                opcoes={lossReasons.map(r => ({ valor: r.id, rotulo: r.name }))}
                selecionados={draft.lossReasons}
                onAlternar={(id) => set({ lossReasons: toggle(draft.lossReasons, id) })}
                vazio="Nenhum motivo cadastrado."
              />
            )}

          </div>
          );
        })()}
      </PopoverContent>
    </Popover>
  );
}
