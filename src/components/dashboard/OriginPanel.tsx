import { useMemo } from "react";
import type { Lead } from "@/data/mockData";
import { fmt } from "./useDashboardHelpers";
import { DonutDistribuicao } from "./DonutDistribuicao";

const ORIGIN_COLORS: Record<string, string> = {
  "Instagram": "#E1306C",
  "Facebook Ads": "#1877F2",
  "Indicação": "#10B981",
  "Site": "#6366F1",
  "Outro": "#94A3B8",
};

interface OriginPanelProps {
  periodLeads: Lead[];
}

export function OriginPanel({ periodLeads }: OriginPanelProps) {
  const originData = useMemo(() => {
    const map = new Map<string, { name: string; count: number; won: number; lost: number; revenue: number }>();
    periodLeads.forEach(l => {
      const o = l.origin || "Outro";
      const cur = map.get(o) || { name: o, count: 0, won: 0, lost: 0, revenue: 0 };
      cur.count++;
      if (l.dealStatus === "won") { cur.won++; cur.revenue += l.value; }
      if (l.dealStatus === "lost") cur.lost++;
      map.set(o, cur);
    });
    return [...map.values()]
      .map(o => ({
        ...o,
        // conversão sobre negócios encerrados (ganhos+perdidos), não sobre o total
        winRate: (o.won + o.lost) > 0 ? o.won / (o.won + o.lost) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [periodLeads]);

  const maxRevenue = Math.max(...originData.map(o => o.revenue), 1);

  return (
    <div className="bg-card border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">Origem dos leads</h3>
      {originData.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados no período.</p>
      ) : (
        <>
          {/* Rosquinha no lugar das barras deitadas: origem é repartição de um
              todo ("de onde vieram os leads"), e a rosquinha mostra a proporção
              de cada fatia sem o leitor ter que comparar comprimentos de barra.
              O total no centro responde antes de tudo de quantos se fala.

              As cores vêm de ORIGIN_COLORS, que é a cor da própria marca de cada
              canal (rosa do Instagram, azul do Facebook). A paleta de reserva do
              componente só entra para origens fora dessa lista. */}
          <DonutDistribuicao
            dados={originData.map(o => ({
              nome: o.name,
              valor: o.count,
              cor: ORIGIN_COLORS[o.name],
            }))}
            rotuloCentro={periodLeads.length === 1 ? "lead" : "leads"}
          />

          <div className="space-y-3 mt-4 pt-4 border-t border-card-border">
            <p className="text-xs font-medium text-muted-foreground">Conversão e receita por origem</p>
            {originData.map(o => (
              <div key={o.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground truncate max-w-[140px]">{o.name}</span>
                  <span className="text-muted-foreground">
                    {o.winRate.toFixed(0)}% conversão · {fmt(o.revenue)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${maxRevenue > 0 ? (o.revenue / maxRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
