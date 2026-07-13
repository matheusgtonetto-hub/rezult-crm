import { useMemo } from "react";
import type { Lead } from "@/data/mockData";
import { fmt } from "./useDashboardHelpers";

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

export function UtmAttributionPanel({ periodLeads }: UtmAttributionPanelProps) {
  const { withUtm, noUtmCount, coverage, activeFields, rows } = useMemo(() => {
    const withUtm = periodLeads.filter(l =>
      UTM_FIELDS.some(f => (l[f.key] as string | undefined)?.trim())
    );

    const coverage = periodLeads.length > 0
      ? Math.round(withUtm.length / periodLeads.length * 100)
      : 0;

    // Only show UTM columns that have at least one value
    const activeFields = UTM_FIELDS.filter(f =>
      withUtm.some(l => (l[f.key] as string | undefined)?.trim())
    );

    // Group by full UTM combination
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

    const rows = [...map.values()]
      .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

    return { withUtm, noUtmCount: periodLeads.length - withUtm.length, coverage, activeFields, rows };
  }, [periodLeads]);

  const visible = rows.slice(0, TOP_N);
  const restCount = rows.length - visible.length;

  return (
    <div className="bg-card border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold text-foreground">Resultados por UTM</h3>
        {periodLeads.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {withUtm.length}/{periodLeads.length} com UTM ({coverage}%)
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Combinações de parâmetros UTM com performance por combinação.
      </p>

      {withUtm.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum lead com dados UTM no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                {activeFields.map(f => (
                  <th key={f.key} className="text-left pb-2 font-medium pr-4 whitespace-nowrap">
                    {f.label} <span className="font-normal text-muted-foreground/60">({f.param})</span>
                  </th>
                ))}
                <th className="text-right pb-2 font-medium">Leads</th>
                <th className="text-right pb-2 font-medium pl-3">Vendas</th>
                <th className="text-right pb-2 font-medium pl-3">Perdidos</th>
                <th className="text-right pb-2 font-medium pl-3">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {visible.map((r, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  {activeFields.map(f => (
                    <td key={f.key} className="py-2.5 pr-4 max-w-[140px]">
                      <span
                        className={`block truncate text-xs ${
                          r.utmValues[f.key] === "—"
                            ? "text-muted-foreground/40"
                            : f.key === "utmCampaign"
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                        }`}
                      >
                        {r.utmValues[f.key]}
                      </span>
                    </td>
                  ))}
                  <td className="text-right py-2.5 text-muted-foreground">{r.leads}</td>
                  <td className="text-right py-2.5 pl-3 text-success font-medium">{r.won}</td>
                  <td className="text-right py-2.5 pl-3 text-destructive font-medium">{r.lost}</td>
                  <td className="text-right py-2.5 pl-3 font-semibold text-foreground whitespace-nowrap">{fmt(r.revenue)}</td>
                </tr>
              ))}
              {restCount > 0 && (
                <tr>
                  <td colSpan={activeFields.length + 4} className="py-2 text-xs text-muted-foreground text-center">
                    +{restCount} outra{restCount > 1 ? "s" : ""} combinação{restCount > 1 ? "ões" : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {noUtmCount > 0 && (
            <p className="text-xs text-muted-foreground/50 mt-3 pt-3 border-t border-card-border">
              {noUtmCount} lead{noUtmCount > 1 ? "s" : ""} sem UTM {noUtmCount > 1 ? "não são exibidos" : "não é exibido"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
