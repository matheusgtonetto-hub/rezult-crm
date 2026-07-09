import { useMemo } from "react";
import type { Lead, Tag } from "@/data/mockData";
import { fmt } from "./useDashboardHelpers";

interface TagPerformancePanelProps {
  periodLeads: Lead[];
  crmTags: Tag[];
}

export function TagPerformancePanel({ periodLeads, crmTags }: TagPerformancePanelProps) {
  const rows = useMemo(() => {
    // Lead.tags guarda o NOME da tag (não o id) — ver LeadDetailPage.tsx, onde a checagem
    // de tag ativa é sempre feita por t.name.
    return crmTags
      .map(tag => {
        const tagged = periodLeads.filter(l => l.tags?.includes(tag.name));
        const won = tagged.filter(l => l.dealStatus === "won");
        const totalValue = won.reduce((s, l) => s + l.value, 0);
        return {
          tag,
          count: tagged.length,
          won: won.length,
          winRate: tagged.length > 0 ? won.length / tagged.length * 100 : 0,
          avgTicket: won.length > 0 ? totalValue / won.length : 0,
        };
      })
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [periodLeads, crmTags]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Performance por tag</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum negócio com tag no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="text-left pb-2 font-medium">Tag</th>
                <th className="text-right pb-2 font-medium">Negócios</th>
                <th className="text-right pb-2 font-medium">Conversão</th>
                <th className="text-right pb-2 font-medium">Ticket médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {rows.map(r => (
                <tr key={r.tag.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.tag.color || "hsl(var(--primary))" }} />
                      <span className="font-medium text-foreground truncate max-w-[140px]">{r.tag.name}</span>
                    </div>
                  </td>
                  <td className="text-right py-2.5 text-muted-foreground">{r.count}</td>
                  <td className="text-right py-2.5 font-medium text-foreground">{r.winRate.toFixed(0)}%</td>
                  <td className="text-right py-2.5 font-semibold text-foreground">{fmt(r.avgTicket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
