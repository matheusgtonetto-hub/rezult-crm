import { useMemo } from "react";
import type { DateRangeValue } from "@/components/ui/date-range-picker";

export const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const pct = (n: number, d: number) =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

// Parseia entryDate (string YYYY-MM-DD) como hora local, não UTC.
// entryDate vazio → retorna null (lead sem data é sempre incluído pelo chamador).
export const parseEntryDate = (d: string) => (d ? new Date(d + "T00:00:00") : null);

export const tooltip = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--card-border))",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
  fontSize: 12,
};

/**
 * Como um KPI se compara com o período anterior.
 *
 * São quatro respostas diferentes, e tratá-las como um número só era o bug:
 * `deltaPct` devolvia `null` tanto para "cresceu do zero" quanto para "não há
 * o que comparar", e o cartão desenhava um traço nos dois casos. Com "Todo
 * histórico" selecionado o traço aparecia em TODOS os cartões, porque a janela
 * anterior cai antes do primeiro registro que existe no sistema.
 */
/** Contra o que a comparação foi feita. Muda a explicação, não o desenho. */
export type BaseDaVariacao = "periodo-anterior" | "dentro-do-periodo";

export type Variacao =
  | { tipo: "pct"; valor: number; base: BaseDaVariacao }  // dá para comparar: -12,5%, +30%…
  | { tipo: "novo"; base: BaseDaVariacao }                // antes zero, agora tem: alta sem percentual possível
  | { tipo: "estavel"; base: BaseDaVariacao };            // zero dos dois lados: nada a apontar

/**
 * Compara dois números e diz o que aconteceu.
 *
 * Sempre devolve algo desenhável. Um cartão sem indicador nenhum é pior que um
 * indicador modesto: quem olha não sabe se está tudo estável ou se a tela
 * quebrou.
 */
export function variacao(current: number, prior: number, base: BaseDaVariacao = "periodo-anterior"): Variacao {
  if (prior === 0) return current > 0 ? { tipo: "novo", base } : { tipo: "estavel", base };
  return { tipo: "pct", valor: ((current - prior) / prior) * 100, base };
}

/**
 * Divide um período no meio. Usado para medir tendência DENTRO da janela
 * quando não existe período anterior com o que comparar -- o caso de "Todo
 * histórico", cuja janela anterior cai antes do primeiro dado do sistema.
 *
 * Comparar a segunda metade com a primeira responde à mesma pergunta ("está
 * subindo ou caindo?") usando só dado que existe, em vez de comparar com um
 * vazio e concluir qualquer coisa dele.
 */
export function meioDoPeriodo(de: Date, ate: Date): Date {
  return new Date((de.getTime() + ate.getTime()) / 2);
}

// Variação percentual crua, para quem só precisa do número.
// Em cartão, preferir `variacao()`: ela distingue "cresceu do zero" de "não há
// base", distinção que este número não consegue expressar.
export function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? null : 0;
  return ((current - prior) / prior) * 100;
}

// Janela imediatamente anterior ao período selecionado, com a mesma duração.
// Ex.: período 01-15 jan (15 dias) → anterior = 17 dez a 31 dez (15 dias).
export function usePriorPeriod(dateRange: DateRangeValue) {
  return useMemo(() => {
    const from = new Date(dateRange.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.to);
    to.setHours(23, 59, 59, 999);

    const durationMs = to.getTime() - from.getTime();
    const priorTo = new Date(from.getTime() - 1);
    const priorFrom = new Date(priorTo.getTime() - durationMs);

    return { priorFrom, priorTo };
  }, [dateRange]);
}
