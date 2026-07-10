import { useMemo } from "react";
import type { Lead } from "@/data/mockData";
import { fmt } from "./useDashboardHelpers";

interface UtmAttributionPanelProps {
  periodLeads: Lead[];
}

const TOP_N = 10;

export function UtmAttributionPanel({ periodLeads }: UtmAttributionPanelProps) {
  const rows = useMemo(() => {
    const map = new Map<string, { source: string; campaign: string; count: number; won: number; revenue: number }>();
    periodLeads.forEach(l => {
      const source = l.utmSource?.trim() || "Direto";
      const campaign = l.utmCampaign?.trim() || "Sem campanha";
      const key = `${source}::${campaign}`;
      const cur = map.get(key) || { source, campaign, count: 0, won: 0, revenue: 0 };
      cur.count++;
      if (l.dealStatus === "won") { cur.won++; cur.revenue += l.value; }
      map.set(key, cur);
    });
    return [...map.values()]
      .map(r => ({ ...r, winRate: r.count > 0 ? r.won / r.count * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [periodLeads]);

  const top = rows.slice(0, TOP_N);
  const restCount = rows.length - top.length;

  return (
    <div className="bg-card border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">Atribuição por campanha (UTM)</h3>
      <p className="text-xs text-muted-foreground mb-4">Origem e campanha declaradas no lead, ordenadas por receita.</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados de UTM no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="text-left pb-2 font-medium">Origem</th>
                <th className="text-left pb-2 font-medium">Campanha</th>
                <th className="text-right pb-2 font-medium">Leads</th>
                <th className="text-right pb-2 font-medium">Conversão</th>
                <th className="text-right pb-2 font-medium">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {top.map(r => (
                <tr key={`${r.source}::${r.campaign}`} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 text-foreground font-medium truncate max-w-[140px]">{r.source}</td>
                  <td className="py-2.5 text-muted-foreground truncate max-w-[160px]">{r.campaign}</td>
                  <td className="text-right py-2.5 text-muted-foreground">{r.count}</td>
                  <td className="text-right py-2.5 text-foreground font-medium">{r.winRate.toFixed(0)}%</td>
                  <td className="text-right py-2.5 font-semibold text-foreground">{fmt(r.revenue)}</td>
                </tr>
              ))}
              {restCount > 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-xs text-muted-foreground text-center">
                    +{restCount} outra{restCount > 1 ? "s" : ""} combinação{restCount > 1 ? "ões" : ""} de origem/campanha
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
