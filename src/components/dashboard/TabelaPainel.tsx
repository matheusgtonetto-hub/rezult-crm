import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * As peças de tabela dos painéis do dashboard.
 *
 * ESTA É A ÚNICA CÓPIA. Em 19/09/2026 o dashboard tinha nove tabelas, e só a de
 * "Performance por UTM" era tabela de verdade: moldura, réguas entre colunas,
 * filtro na coluna de texto, ordenação nas de número. As outras oito eram
 * listas com cabeçalho, cada uma escrita à mão, com três jeitos diferentes de
 * separar o cabeçalho do corpo. O dono apontou a diferença.
 *
 * Refazer as oito à mão repetiria o problema: a nona ajustada divergiria das
 * outras. Então o desenho mora aqui, e cada painel só declara as colunas.
 *
 * ─── Como uma coluna se declara ─────────────────────────────────────────────
 *
 *   filtro  presente -> o cabeçalho vira o menu de filtro (um valor, ou todos),
 *                       o mesmo do UTM. É o da coluna de nome.
 *   valor   presente -> o cabeçalho vira botão de ordenar, com a seta só na
 *                       coluna ativa. É o das colunas de número.
 *   nenhum           -> cabeçalho simples.
 *
 * Linha "fixa" não entra na ordenação nem no filtro: fica no pé, na ordem em
 * que veio. É o lugar dos desfechos (Ganhos, Perdidos) nas tabelas de funil,
 * que são um resultado da tabela, não mais uma linha dela.
 */

/**
 * A tabela ocupa o cartão INTEIRO.
 *
 * Era uma moldura -- borda de 1px e raio de 6 -- dentro de um painel que já tem
 * borda e raio. Cartão dentro de cartão, com duas linhas desenhadas a 20px uma
 * da outra. O dono comparou com o `DataTable.jsx` do material (19/09/2026), onde
 * a tabela É o cartão: nenhuma moldura própria, e só linhas HORIZONTAIS
 * separando as linhas de dado.
 *
 * O `-mx-5 -mb-5` cancela o `p-5` do painel, para a tabela sangrar até as
 * bordas dele e encostar no rodapé. O recuo volta nas células das pontas
 * (`pl-5`/`pr-5` em `TABELA`), então o texto da primeira coluna continua
 * alinhado com o título do painel.
 *
 * Quem tem conteúdo ABAIXO da tabela usa `SANGRIA_LATERAL`, que não puxa o
 * rodapé.
 */
export const MOLDURA = "overflow-x-auto -mx-5 -mb-5";

/** Sangra só nas laterais: para tabela que não é o último bloco do painel. */
export const SANGRIA_LATERAL = "overflow-x-auto -mx-5";

/** Respiro nas pontas por seletor, e não célula a célula. */
export const TABELA =
  "w-full text-sm [&_th:first-child]:pl-5 [&_td:first-child]:pl-5 [&_th:last-child]:pr-5 [&_td:last-child]:pr-5";

/**
 * Cabeçalho sem fundo tingido (matriz, seção 4) e **sem réguas verticais**: só
 * a régua de 1px que o separa do corpo, como no material.
 */
export const LINHA_CABECALHO =
  "text-xs border-b border-[color:var(--border-default)] [&>th]:py-2.5 [&>th]:px-3 [&>th]:font-medium [&>th]:whitespace-nowrap";

export const CORPO = "divide-y divide-card-border";
export const LINHA_CORPO = "hover:bg-[color:var(--surface-hover)] transition-colors";

/**
 * O pé da tabela: linha de total ou de desfecho. Régua mais forte em cima,
 * sem fundo -- igual ao total do UTM desde que ele deixou de ser faixa verde.
 */
export const LINHA_PE = "border-t border-[color:var(--border-strong)]";

type Alinhamento = "esquerda" | "centro" | "direita";

const ALINHAR: Record<Alinhamento, string> = {
  esquerda: "text-left justify-start",
  centro: "text-center justify-center",
  direita: "text-right justify-end",
};

export interface ColunaTabela<T> {
  id: string;
  rotulo: string;
  alinhar?: Alinhamento;
  /** Presente = a coluna ordena por este número. */
  valor?: (linha: T) => number;
  /** Presente = o cabeçalho é um filtro por este texto. */
  filtro?: (linha: T) => string;
  /**
   * O primeiro clique ordena CRESCENTE, e não decrescente. É o caso da coluna
   * "Etapa" das tabelas de funil: o valor dela é a posição no pipeline, e o
   * sentido natural é da primeira etapa para a última.
   */
  primeiroCrescente?: boolean;
  /**
   * Largura fixa, em pixels. Serve às colunas de número em painel estreito: sem
   * ela, a coluna encolhe até a largura do próprio número e o rótulo do
   * cabeçalho ("Número de vendas") quebra em três linhas.
   */
  largura?: number;
}

/** Valor do filtro que significa "sem filtro". Não colide com texto real. */
const TODOS = "__todos__";

export interface EstadoTabela<T> {
  /** As linhas já filtradas e ordenadas, sem as fixas. */
  visiveis: T[];
  /** O cabeçalho de uma coluna, com filtro ou ordenação conforme ela declarar. */
  cabecalho: (coluna: ColunaTabela<T>) => ReactNode;
}

export function useTabelaPainel<T>(
  linhas: T[],
  colunas: ColunaTabela<T>[],
  /** Coluna e sentido em que a tabela abre. */
  inicial: { coluna: string; desc: boolean },
): EstadoTabela<T> {
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState(inicial);

  const alternar = (coluna: string) => {
    // Primeiro clique numa coluna nova já vem decrescente: em métrica de
    // desempenho quem olha quer o topo, não o fundo. Mesma regra do UTM. A
    // exceção é a coluna que declara `primeiroCrescente`.
    const crescente = colunas.find(c => c.id === coluna)?.primeiroCrescente ?? false;
    setOrdem(a => (a.coluna === coluna ? { coluna, desc: !a.desc } : { coluna, desc: !crescente }));
  };

  const visiveis = useMemo(() => {
    let r = linhas;
    for (const c of colunas) {
      const v = filtros[c.id];
      if (c.filtro && v && v !== TODOS) r = r.filter(l => c.filtro!(l) === v);
    }
    const col = colunas.find(c => c.id === ordem.coluna);
    if (!col?.valor) return r;
    const chave = col.valor;
    return [...r].sort((a, b) => (ordem.desc ? chave(b) - chave(a) : chave(a) - chave(b)));
  }, [linhas, colunas, filtros, ordem]);

  const cabecalho = (c: ColunaTabela<T>): ReactNode => {
    const alinhar = ALINHAR[c.alinhar ?? "centro"];

    if (c.filtro) {
      const opcoes = [...new Set(linhas.map(c.filtro))];
      const escolhido = filtros[c.id] && filtros[c.id] !== TODOS ? filtros[c.id] : null;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger className={`group flex items-center gap-1 w-full outline-none ${alinhar}`}>
            {/* Coluna com filtro ativo em --accent-800, o verde que o app usa
                para "escolhido". Sem filtro, a tinta do cabeçalho. */}
            <span className={`truncate ${escolhido ? "text-[color:var(--accent-800)] font-semibold" : "text-[color:var(--text-muted)]"}`}>
              {escolhido ?? c.rotulo}
            </span>
            <ChevronDown
              size={12}
              className={`shrink-0 transition-colors ${
                escolhido ? "text-[color:var(--accent-800)]" : "text-[color:var(--text-muted)] group-hover:text-[color:var(--text-heading)]"
              }`}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuRadioGroup
              value={filtros[c.id] ?? TODOS}
              onValueChange={v => setFiltros(a => ({ ...a, [c.id]: v }))}
            >
              <DropdownMenuRadioItem value={TODOS} className="text-xs">Todos</DropdownMenuRadioItem>
              {opcoes.map(o => (
                <DropdownMenuRadioItem key={o} value={o} className="text-xs max-w-[260px]">
                  <span className="truncate">{o}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    if (c.valor) {
      const ativa = ordem.coluna === c.id;
      return (
        <button
          onClick={() => alternar(c.id)}
          className={`w-full flex items-center gap-1 text-[color:var(--text-muted)] transition-opacity hover:opacity-75 ${alinhar} ${
            ativa ? "font-semibold" : ""
          }`}
        >
          {c.rotulo}
          {/* A seta dupla fica em TODA coluna ordenável, mesmo em repouso: é ela
              que diz "esta coluna ordena", e sem ela a pessoa precisa clicar
              para descobrir. Clicada, vira a seta única no sentido em vigor.
              É o cabeçalho do `DataTable.jsx` do material (chevrons-up-down ->
              chevron-up/down), pedido do dono em 20/09/2026.

              O peso fica na COR, e não na presença: em repouso `--icon-default`,
              na coluna ativa `--icon-strong`. Assim a seta apagada não compete
              com os números, que é o que a tabela existe para mostrar. */}
          {ativa
            ? (ordem.desc
                ? <ChevronDown size={13} className="shrink-0 text-[color:var(--icon-strong)]" />
                : <ChevronUp size={13} className="shrink-0 text-[color:var(--icon-strong)]" />)
            : <ChevronsUpDown size={13} className="shrink-0 text-[color:var(--icon-default)]" />}
        </button>
      );
    }

    return <span className={`block text-[color:var(--text-muted)] ${alinhar}`}>{c.rotulo}</span>;
  };

  return { visiveis, cabecalho };
}

/**
 * A tabela inteira, para quem não pode chamar o hook: as tabelas que moram
 * dentro de blocos `(() => { ... })()` no `DashboardPage`, onde um hook quebraria
 * a regra dos hooks. Aqui o hook fica dentro de um componente de verdade.
 *
 * Quem usa só declara as colunas e desenha as células de uma linha.
 */
export function TabelaDoPainel<T>({
  linhas, colunas, inicial, chave, celulas, pe, vazio,
}: {
  linhas: T[];
  colunas: ColunaTabela<T>[];
  inicial: { coluna: string; desc: boolean };
  chave: (linha: T) => string;
  /** As células (`<td>`) de uma linha, na ordem das colunas. */
  celulas: (linha: T) => ReactNode;
  /** Linhas presas no pé, fora da ordenação: desfecho ou total. */
  pe?: ReactNode;
  /** Frase quando não há linha, dentro da tabela. */
  vazio?: string;
}) {
  const { visiveis, cabecalho } = useTabelaPainel(linhas, colunas, inicial);
  return (
    <div className={MOLDURA}>
      <table className={TABELA}>
        <thead>
          <tr className={LINHA_CABECALHO}>
            {colunas.map(c => <th key={c.id} style={c.largura ? { width: c.largura } : undefined}>{cabecalho(c)}</th>)}
          </tr>
        </thead>
        <tbody className={CORPO}>
          {visiveis.length === 0 && vazio && (
            <tr>
              <td colSpan={colunas.length} className="py-6 text-xs text-muted-foreground text-center">
                {vazio}
              </td>
            </tr>
          )}
          {visiveis.map(l => (
            <tr key={chave(l)} className={LINHA_CORPO}>
              {celulas(l)}
            </tr>
          ))}
          {pe}
        </tbody>
      </table>
    </div>
  );
}
