import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronDown, X } from "lucide-react";
import type { Lead } from "@/data/mockData";
import { fmt } from "./useDashboardHelpers";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function TruncatedCell({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const handleMouseEnter = () => {
    if (ref.current && ref.current.scrollWidth > ref.current.clientWidth) {
      setOpen(true);
    }
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          onMouseEnter={handleMouseEnter}
          className="block truncate text-xs text-muted-foreground cursor-default"
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-all text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

interface UtmAttributionPanelProps {
  periodLeads: Lead[];
}

const UTM_FIELDS = [
  { key: "utmCampaign" as keyof Lead, label: "Campanha", param: "utm_campaign" },
  { key: "utmMedium"   as keyof Lead, label: "Conjunto", param: "utm_medium"   },
  { key: "utmContent"  as keyof Lead, label: "Criativo", param: "utm_content"  },
  { key: "utmSource"   as keyof Lead, label: "Fonte",    param: "utm_source"   },
] as const;

const TOP_N = 10;

/**
 * Medalhas do pódio para as três primeiras posições da tabela, que é ordenada
 * por receita.
 *
 * São degradês, e não cores chapadas, por necessidade e não por enfeite: ouro e
 * prata clássicos (#D4AF37, #C0C0C0) dão 2.1:1 e 1.8:1 contra texto branco, ou
 * seja, ilegíveis. O degradê diagonal desce até um tom escuro do mesmo metal, e
 * é essa metade que sustenta o número. A sombra fina no texto fecha a conta na
 * parte clara.
 *
 * Da quarta posição em diante entra o verde da marca, mais claro que o primário
 * para não competir com o pódio.
 */
const MEDALHAS = [
  "linear-gradient(135deg, #F2CE63 0%, #B8860B 100%)",  // ouro
  "linear-gradient(135deg, #CBD0D7 0%, #78828F 100%)",  // prata
  "linear-gradient(135deg, #D48F55 0%, #8C4A21 100%)",  // bronze
] as const;

/**
 * Fundo das posições fora do pódio: o verde da marca chapado, o mesmo das
 * faixas de cabeçalho e total.
 *
 * Era rgba a 55%, escolhido para o verde ficar claro a ponto de não competir com
 * as três medalhas. Saiu por dois motivos. O primeiro é coerência: com as duas
 * faixas da tabela nesse verde, uma pastilha num verde só parecido lê como
 * desalinho, não como hierarquia. O segundo é legibilidade, e é o que decide: a
 * 55% o número branco ficava em 2.1:1, sustentado só pela sombra do texto.
 * Chapado, sobe para 4.3:1.
 *
 * A distinção com o pódio não se perde: ouro, prata e bronze são degradês
 * metálicos, e nenhum verde é confundível com eles.
 */
const VERDE_DEMAIS = "#128A68";

/**
 * Colunas numéricas, na ordem em que aparecem. `chave` indexa a linha.
 *
 * Largura em pixels, e não em classe do Tailwind, porque quem aplica é o
 * <colgroup>: com `table-layout: fixed` é o <col> que manda na coluna, e uma
 * classe no <th> seria ignorada. Fixas de propósito -- o conteúdo delas é
 * número curto e não tem por que o usuário ajustar.
 */
const COLUNAS_NUM = [
  { chave: "leads"   as const, label: "Leads",    px: 78  },
  { chave: "lost"    as const, label: "Perdidos", px: 84  },
  { chave: "won"     as const, label: "Vendas",   px: 76  },
  { chave: "revenue" as const, label: "Receita",  px: 116 },
];

/** Coluna da medalha. Cabe a pastilha de 24px mais o respiro das duas bordas. */
const PX_MEDALHA = 44;

/**
 * Piso do arraste. Abaixo disso a coluna vira uma fatia sem texto legível, e
 * quem arrastou perde a referência do que estava mexendo.
 */
const PX_MIN_COLUNA = 70;

/**
 * Folga entre a régua vertical e o texto da coluna seguinte.
 *
 * Sem ela a primeira letra encosta no traço. Vai no cabeçalho E nas células do
 * corpo: aplicada só no topo, o título ficaria dois pixels à direita do valor
 * embaixo, e a coluna sairia desalinhada consigo mesma.
 *
 * A primeira coluna de UTM não recebe: a régua à esquerda dela foi removida,
 * então não há de que se afastar.
 */
const PL_APOS_REGUA = "pl-[5px]";

type ChaveOrdem = typeof COLUNAS_NUM[number]["chave"];

/** Valor do filtro que significa "não filtrar". Sentinela em vez de string
 *  vazia porque o RadioGroup do Radix trata "" como nenhum item selecionado, e
 *  aí "Todos" não apareceria marcado no menu. */
const TODOS = "__todos__";

export function UtmAttributionPanel({ periodLeads }: UtmAttributionPanelProps) {
  const navigate = useNavigate();
  const [noUtmOpen, setNoUtmOpen] = useState(false);

  const { withUtm, noUtmLeads, noUtmCount, coverage, activeFields, rows } = useMemo(() => {
    const withUtm = periodLeads.filter(l =>
      UTM_FIELDS.some(f => (l[f.key] as string | undefined)?.trim())
    );
    const noUtmLeads = periodLeads.filter(l =>
      !UTM_FIELDS.some(f => (l[f.key] as string | undefined)?.trim())
    );

    const coverage = periodLeads.length > 0
      ? Math.round(withUtm.length / periodLeads.length * 100)
      : 0;

    const activeFields = UTM_FIELDS.filter(f =>
      withUtm.some(l => (l[f.key] as string | undefined)?.trim())
    );

    const map = new Map<string, {
      utmValues: Record<string, string>;
      leads: number; won: number; lost: number; revenue: number;
    }>();

    withUtm.forEach(l => {
      const values: Record<string, string> = {};
      activeFields.forEach(f => {
        values[f.key] = (l[f.key] as string | undefined)?.trim() || "—";
      });
      const key = activeFields.map(f => values[f.key]).join("|");
      const cur = map.get(key) || { utmValues: values, leads: 0, won: 0, lost: 0, revenue: 0 };
      cur.leads++;
      if (l.dealStatus === "won") { cur.won++; cur.revenue += l.value; }
      if (l.dealStatus === "lost") cur.lost++;
      map.set(key, cur);
    });

    // Posição por receita gravada na linha, e não deduzida da ordem de
    // exibição. É o que permite a medalha continuar querendo dizer "3ª maior
    // receita" mesmo com a tabela ordenada por leads ou filtrada por campanha.
    const rows = [...map.values()]
      .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)
      .map((r, i) => ({ ...r, rankReceita: i }));

    return { withUtm, noUtmLeads, noUtmCount: noUtmLeads.length, coverage, activeFields, rows };
  }, [periodLeads]);

  /**
   * Largura fixada pelo usuário, por coluna de UTM. Ausente = automática.
   *
   * Começar vazio, e não com um padrão em pixels, é o que faz as colunas
   * dividirem o espaço disponível enquanto ninguém mexeu. A coluna só vira
   * largura fixa depois de arrastada; duplo clique na alça devolve ao
   * automático.
   *
   * Não persiste entre sessões. Guardar em localStorage seria fácil, mas uma
   * largura salva por engano sobreviveria a uma troca de campanha e ninguém
   * lembraria de onde veio.
   */
  const [larguras, setLarguras] = useState<Record<string, number>>({});
  const arraste = useRef<{ chave: string; x0: number; w0: number } | null>(null);

  /**
   * Arraste da alça entre colunas.
   *
   * Os listeners vão no `document`, não na alça: o ponteiro passa por fora dela
   * assim que o movimento começa, e presos ao elemento o arraste morreria no
   * primeiro pixel. O cursor e o `user-select` do body mudam durante o gesto
   * para o ponteiro não piscar sobre cada célula e para o arraste não sair
   * selecionando o texto da tabela.
   */
  const iniciarArraste = (e: React.MouseEvent, chave: string) => {
    e.preventDefault();
    const th = (e.currentTarget as HTMLElement).closest("th");
    if (!th) return;
    arraste.current = { chave, x0: e.clientX, w0: th.getBoundingClientRect().width };

    const mover = (ev: MouseEvent) => {
      const a = arraste.current;
      if (!a) return;
      setLarguras(p => ({ ...p, [a.chave]: Math.max(PX_MIN_COLUNA, Math.round(a.w0 + ev.clientX - a.x0)) }));
    };
    const soltar = () => {
      arraste.current = null;
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const soltarLargura = (chave: string) =>
    setLarguras(p => { const n = { ...p }; delete n[chave]; return n; });

  /** Filtro por coluna de UTM. Ausente ou TODOS = coluna não filtra. */
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  /** Ordenação. Começa por receita, que é a leitura padrão do painel. */
  const [ordem, setOrdem] = useState<{ chave: ChaveOrdem; desc: boolean }>({ chave: "revenue", desc: true });

  const alternarOrdem = (chave: ChaveOrdem) =>
    // Primeiro clique numa coluna nova já vem decrescente: em métrica de
    // desempenho, quem olha quer o topo, não o fundo.
    setOrdem(a => (a.chave === chave ? { chave, desc: !a.desc } : { chave, desc: true }));

  const filtrosAtivos = Object.entries(filtros).filter(([, v]) => v && v !== TODOS);

  /**
   * Opções de cada filtro, tiradas de TODAS as linhas e não das já filtradas.
   *
   * Assim a lista de campanhas não encolhe conforme você escolhe um criativo, e
   * dá para trocar de escolha sem antes limpar o resto. O preço é permitir
   * combinações que não existem, coberto pelo estado vazio com o botão de
   * limpar logo abaixo.
   */
  const opcoes = useMemo(() => {
    const m: Record<string, string[]> = {};
    activeFields.forEach(f => {
      m[f.key] = [...new Set(rows.map(r => r.utmValues[f.key]).filter(v => v && v !== "—"))].sort();
    });
    return m;
  }, [rows, activeFields]);

  const filtradas = useMemo(() => {
    const base = filtrosAtivos.length === 0
      ? rows
      : rows.filter(r => filtrosAtivos.every(([k, v]) => r.utmValues[k] === v));
    // Desempate por receita: com duas linhas empatadas em leads, a ordem entre
    // elas seria a do Map e mudaria a cada render sem motivo visível.
    return [...base].sort((a, b) => {
      const d = a[ordem.chave] - b[ordem.chave];
      return (ordem.desc ? -d : d) || b.revenue - a.revenue;
    });
  }, [rows, filtros, ordem]);  // eslint-disable-line react-hooks/exhaustive-deps

  const visible = filtradas.slice(0, TOP_N);
  const restCount = filtradas.length - visible.length;

  // Totais sobre o conjunto filtrado inteiro, não só sobre as 10 visíveis: o
  // rodapé responde "quanto isto tudo somou", e somar só o que coube na tela
  // daria um número que não corresponde a pergunta nenhuma.
  const totalLeads   = filtradas.reduce((s, r) => s + r.leads, 0);
  const totalLost    = filtradas.reduce((s, r) => s + r.lost, 0);
  const totalWon     = filtradas.reduce((s, r) => s + r.won, 0);
  const totalRevenue = filtradas.reduce((s, r) => s + r.revenue, 0);

  const coverageColor = coverage >= 70 ? "bg-emerald-500" : coverage >= 40 ? "bg-amber-400" : "bg-red-400";

  // Piso de largura da tabela: colunas fixadas somadas ao mínimo das que ainda
  // são automáticas. É o que decide quando o contêiner passa a rolar.
  const larguraMinima =
    PX_MEDALHA
    + COLUNAS_NUM.reduce((s, c) => s + c.px, 0)
    + activeFields.reduce((s, f) => s + (larguras[f.key] ?? PX_MIN_COLUNA), 0);

  return (
    <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
      {/* Header
          A cobertura ganhou peso. Ela é o dado que qualifica todo o resto do
          painel: com 20% de cobertura, a campanha "vencedora" da tabela pode ser
          só a que por acaso foi rastreada. Antes era uma barra de 20px com o
          percentual em cinza, do mesmo tamanho de qualquer legenda. */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Performance por UTM</h3>
          {periodLeads.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {withUtm.length} de {periodLeads.length} {periodLeads.length === 1 ? "lead" : "leads"} com rastreio
            </p>
          )}
        </div>
        {periodLeads.length > 0 && (
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${coverageColor}`} style={{ width: `${coverage}%` }} />
            </div>
            <span className="text-sm font-semibold text-foreground tabular-nums">{coverage}%</span>
          </div>
        )}
      </div>

      {withUtm.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum lead com dados UTM no período.</p>
      ) : (
        <>
        {/* Escape dos filtros. Aparece só com algum ativo, e é uma linha de
            estado, não uma barra de filtros: os filtros moram nos cabeçalhos.
            Existe porque limpar quatro colunas uma a uma é trabalho, e porque a
            tabela filtrada até o vazio precisa de saída visível. */}
        {filtrosAtivos.length > 0 && (
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setFiltros({})}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={12} />
              Limpar {filtrosAtivos.length} filtro{filtrosAtivos.length > 1 ? "s" : ""}
            </button>
          </div>
        )}

        {/* Moldura da tabela. O `overflow-x-auto` que já existia para o scroll
            horizontal é o que recorta os cantos: com overflow diferente de
            visible, o conteúdo respeita o raio da borda, e sem ele o cabeçalho
            e o rodapé pintados passariam reto por cima dos cantos arredondados. */}
        <div className="overflow-x-auto rounded-[5px] border border-card-border">
          {/* Respiro nas colunas das pontas, por seletor e não célula a célula:
              são doze células nas duas extremidades entre thead, tbody e tfoot,
              e a primeira que alguém esquecesse deixaria uma linha encostada na
              moldura sem ninguém notar. */}
          {/* `table-fixed` é requisito do redimensionamento, não preferência: no
              layout automático o navegador recalcula as colunas pelo conteúdo a
              cada render, e a largura arrastada seria descartada no mesmo quadro.

              `minWidth` somando as colunas: quando o usuário alarga além do
              painel, a tabela cresce e o contêiner rola na horizontal, em vez de
              espremer as outras colunas até sumirem. */}
          <table
            className="w-full table-fixed text-sm [&_th:first-child]:pl-3 [&_td:first-child]:pl-3 [&_th:last-child]:pr-3 [&_td:last-child]:pr-3"
            style={{ minWidth: larguraMinima }}
          >
            {/* As colunas de UTM sem entrada em `larguras` saem sem `width`, e
                repartem entre si o espaço que sobra. É o que mantém a tabela
                preenchendo o painel antes de qualquer arraste. */}
            <colgroup>
              <col style={{ width: PX_MEDALHA }} />
              {activeFields.map(f => (
                <col key={f.key} style={larguras[f.key] ? { width: larguras[f.key] } : undefined} />
              ))}
              {COLUNAS_NUM.map(c => (
                <col key={c.chave} style={{ width: c.px }} />
              ))}
            </colgroup>
            <thead>
              {/* Cabeçalhos todos em cinza. Antes "Perdidos", "Vendas" e
                  "Receita" vinham coloridos, repetindo uma informação que os
                  próprios números já carregam e deixando a faixa do topo
                  arlequinada. Os títulos dizem o que é a coluna; a cor fica para
                  o dado. */}
              {/* Faixa verde da sidebar: --primary chapado, texto branco.
                  Sobre ela nenhum texto pode continuar com a cor de antes. O
                  verde que marcava a coluna filtrada sumiria dentro do fundo, e
                  os cinzas cairiam para contraste ilegível. A distinção passa a
                  ser feita por opacidade e peso do branco, que funcionam sem
                  depender de matiz.

                  Sem `border-b`: a troca de cor entre a faixa e o corpo branco
                  já é a divisa, e um traço cinza por cima dela sujaria a banda.

                  As réguas verticais existem só aqui. No corpo elas cortariam
                  cada linha em pedaços e brigariam com as divisórias horizontais
                  que já separam as linhas; no topo, delimitam o alvo de arraste
                  de cada coluna, que é onde a divisa precisa ser vista.

                  `[&>th]:pt-2` porque as células só tinham padding embaixo: sem
                  o de cima, a faixa colada no texto pareceria corte, não banda. */}
              <tr className="text-xs bg-primary [&>th]:pt-2 [&>th]:border-r [&>th]:border-white/20 [&>th:first-child]:border-r-0 [&>th:last-child]:border-r-0">
                <th className="pb-2 pr-3 w-6" />
                {/* O cabeçalho É o filtro. Com filtro ativo, o título dá lugar
                    ao valor escolhido, em branco cheio e negrito: assim a coluna
                    diz o que está mostrando sem precisar de uma barra de filtros
                    separada repetindo a informação em outro canto da tela.

                    Todos os títulos em branco cheio, inclusive os das colunas
                    inativas. O que separa os estados é o PESO (semibold quando
                    filtrado ou ordenando) e o sinal ao lado: a seta na coluna que
                    ordena, o valor no lugar do título na que filtra. Opacidade
                    ficaria de fora porque este verde dá 4.3:1 com branco puro, o
                    teto dele; qualquer branco rebaixado começa abaixo disso.

                    O nome do parâmetro embaixo fica sempre, mesmo filtrado. É
                    ele que identifica a coluna quando o título some, e é o que
                    liga o que se vê aqui ao que se configura no link. */}
                {activeFields.map((f, iCol) => {
                  const escolhido = filtros[f.key] && filtros[f.key] !== TODOS ? filtros[f.key] : null;
                  return (
                    <th key={f.key} className={`relative text-left pb-2 pr-4 ${iCol > 0 ? PL_APOS_REGUA : ""}`}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="group flex items-center gap-1 max-w-full text-left outline-none">
                          <span className={`truncate ${escolhido ? "text-white font-semibold" : "text-white font-medium"}`}>
                            {escolhido ?? f.label}
                          </span>
                          <ChevronDown
                            size={12}
                            className={`shrink-0 transition-colors ${
                              escolhido ? "text-white" : "text-white/60 group-hover:text-white"
                            }`}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                          <DropdownMenuRadioGroup
                            value={filtros[f.key] ?? TODOS}
                            onValueChange={v => setFiltros(a => ({ ...a, [f.key]: v }))}
                          >
                            <DropdownMenuRadioItem value={TODOS} className="text-xs">
                              Todos
                            </DropdownMenuRadioItem>
                            {opcoes[f.key]?.map(v => (
                              <DropdownMenuRadioItem key={v} value={v} className="text-xs max-w-[260px]">
                                <span className="truncate">{v}</span>
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span className="block font-normal text-white/60 text-[10px] leading-tight font-mono truncate">
                        {f.param}
                      </span>

                      {/* Alça de arraste sobre a divisa da coluna. Fica dentro
                          do <th>, não entre as colunas, porque não existe
                          "entre" numa tabela: a divisa é a borda direita da
                          célula. 8px de alvo para um traço de 1px, que é o
                          mínimo confortável para acertar sem mira. */}
                      <span
                        onMouseDown={e => iniciarArraste(e, f.key)}
                        onDoubleClick={() => soltarLargura(f.key)}
                        title="Arraste para ajustar a largura. Duplo clique volta ao automático."
                        /* O realce do hover vai na PRÓPRIA linha, via ::before de
                           1px centrado sobre ela, e não num bloco de 8px pintado
                           por cima. Com o bloco, o divisor sob o ponteiro
                           parecia mais grosso e mais claro que os outros seis, e
                           a fileira toda lia como se tivesse réguas de tipos
                           diferentes. O alvo de clique continua com os 8px. */
                        className="absolute top-0 right-0 h-full w-2 translate-x-1 cursor-col-resize select-none z-10
                                   before:absolute before:inset-y-0 before:left-1/2 before:-translate-x-1/2 before:w-px
                                   before:bg-transparent before:transition-colors hover:before:bg-white"
                      />
                    </th>
                  );
                })}
                {/* Numéricas centralizadas. O `tabular-nums` fica em todas elas
                    justamente por isso: com dígitos de larguras diferentes, o
                    centro de cada número cairia num ponto distinto e a coluna
                    ficaria trêmula. Travada a largura do dígito, valores do
                    mesmo tamanho alinham entre si.

                    A seta só aparece na coluna que está ordenando. Uma seta
                    apagada em todas as quatro sinalizaria melhor que dá para
                    clicar, mas deixaria quatro marcas competindo com os números
                    ao lado, que é o que a tabela existe para mostrar. */}
                {COLUNAS_NUM.map((c, i) => {
                  const ativa = ordem.chave === c.chave;
                  return (
                    <th
                      key={c.chave}
                      className={`pb-2 font-medium ${i > 0 ? "pl-3" : ""}`}
                    >
                      <button
                        onClick={() => alternarOrdem(c.chave)}
                        className={`w-full flex items-center justify-center gap-1 text-white transition-opacity hover:opacity-75 ${
                          ativa ? "font-semibold" : ""
                        }`}
                      >
                        {c.label}
                        {ativa && (ordem.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {visible.map((r, i) => (
                <tr key={i} className="hover:bg-muted/40 transition-colors group">
                  {/* Pódio por RECEITA, não por posição na tela.
                      A medalha é da linha, não do lugar dela: ordenada por
                      leads, o ouro pode aparecer na terceira linha, e é isso
                      que se quer ver -- "a que mais fatura não é a que mais
                      traz volume". Se a medalha seguisse a ordem, ela só
                      repetiria o que a posição já diz. */}
                  <td className="py-2.5 pr-3 select-none">
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold tabular-nums text-white"
                      style={{
                        background: MEDALHAS[r.rankReceita] ?? VERDE_DEMAIS,
                        // Sombra fina no número: é o que mantém o branco legível
                        // sobre a ponta clara do ouro e da prata.
                        textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                      }}
                      title={`${r.rankReceita + 1}ª maior receita`}
                    >
                      {r.rankReceita + 1}
                    </span>
                  </td>
                  {activeFields.map((f, iCol) => (
                    <td key={f.key} className={`py-2.5 pr-4 ${iCol > 0 ? PL_APOS_REGUA : ""}`}>
                      {r.utmValues[f.key] !== "—" ? (
                        <TruncatedCell text={r.utmValues[f.key]} />
                      ) : (
                        <span className="block text-xs text-muted-foreground/30">—</span>
                      )}
                    </td>
                  ))}
                  <td className="text-center py-2.5 align-middle text-xs text-foreground tabular-nums">
                    {r.leads}
                  </td>
                  {/* Cor fixa por coluna, inclusive no zero. A cor aqui identifica
                      a natureza do dado (perda em vermelho, dinheiro em verde), e
                      não a intensidade dele; rebaixar o zero para cinza fazia a
                      coluna trocar de significado no meio da leitura, e uma
                      campanha sem venda nenhuma sumia da varredura vertical em
                      vez de aparecer como o zero que ela é. */}
                  <td className="text-center py-2.5 pl-3 font-medium tabular-nums text-xs text-destructive">{r.lost}</td>
                  <td className="text-center py-2.5 pl-3 font-medium tabular-nums text-xs text-success">{r.won}</td>
                  <td className="text-center py-2.5 pl-3 font-semibold whitespace-nowrap tabular-nums text-xs text-success">{fmt(r.revenue)}</td>
                </tr>
              ))}
              {/* Filtro sem resultado. As opções vêm de todas as linhas, então
                  é possível montar uma combinação que não existe; o caminho de
                  volta tem que estar aqui, e não só lá em cima. */}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={activeFields.length + 5} className="py-6 text-xs text-muted-foreground text-center">
                    Nenhuma combinação com esses filtros.{" "}
                    <button onClick={() => setFiltros({})} className="underline underline-offset-2 hover:text-foreground">
                      Limpar
                    </button>
                  </td>
                </tr>
              )}
              {restCount > 0 && (
                <tr>
                  <td colSpan={activeFields.length + 5} className="py-2 text-xs text-muted-foreground text-center">
                    +{restCount} outra{restCount > 1 ? "s" : ""} combinação{restCount > 1 ? "ões" : ""}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              {/* Rodapé na mesma faixa verde do cabeçalho, fechando a tabela
                  entre duas bandas.

                  Todos os números em branco. Perdidos em vermelho e Vendas em
                  verde não sobrevivem aqui: o verde de "Vendas" é o próprio
                  --primary do fundo e sumiria por completo. Não é perda de
                  informação, é rodapé de soma, não de estado; a leitura de bom
                  ou ruim continua nas linhas de cima, onde ela decide algo. */}
              <tr className="bg-primary text-xs font-semibold text-white">
                <td className="py-2.5 pr-3" />
                {activeFields.map((f, iCol) => (
                  <td key={f.key} className={`py-2.5 pr-4 text-white/85 text-xs ${iCol > 0 ? PL_APOS_REGUA : ""}`}>
                    {f.key === activeFields[0].key ? "Total" : ""}
                  </td>
                ))}
                <td className="text-center py-2.5 tabular-nums">{totalLeads}</td>
                <td className="text-center py-2.5 pl-3 tabular-nums">{totalLost}</td>
                <td className="text-center py-2.5 pl-3 tabular-nums">{totalWon}</td>
                <td className="text-center py-2.5 pl-3 whitespace-nowrap tabular-nums">{fmt(totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Fora da moldura de propósito: esta linha fala dos leads que NÃO estão
            na tabela. Dentro dela, seria lida como mais uma linha de dados.
            Perdeu o `border-t` que a separava do conteúdo, porque agora quem
            faz essa separação é a borda da própria tabela. */}
        {noUtmCount > 0 && (
          <button
            onClick={() => setNoUtmOpen(true)}
            className="text-xs text-muted-foreground/50 mt-3 w-full text-left hover:text-muted-foreground transition-colors cursor-pointer"
          >
            {noUtmCount} lead{noUtmCount > 1 ? "s" : ""} sem UTM {noUtmCount > 1 ? "não são exibidos" : "não é exibido"} — <span className="underline underline-offset-2">ver todos</span>
          </button>
        )}
        </>
      )}

      <Dialog open={noUtmOpen} onOpenChange={setNoUtmOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Leads sem UTM ({noUtmCount})
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            <div className="divide-y divide-border">
              {noUtmLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => { setNoUtmOpen(false); navigate(`/pipeline/lead/${lead.id}`); }}
                  className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded px-2 -mx-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                    {lead.company && <p className="text-xs text-muted-foreground truncate">{lead.company}</p>}
                  </div>
                  {lead.value > 0 && (
                    <span className="text-xs text-success font-medium shrink-0">{fmt(lead.value)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
