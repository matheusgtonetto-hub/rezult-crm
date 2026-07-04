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

// Variação percentual formatada para exibir ao lado de um KPI.
// null quando não há base de comparação (período anterior zerado) — o chamador decide o rótulo ("novo" etc.)
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
