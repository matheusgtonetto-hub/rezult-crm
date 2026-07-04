import { useMemo } from "react";
import type { Lead, Pipeline } from "@/data/mockData";

interface StageVelocityPanelProps {
  funnelPipeline: Pipeline | null;
  allLeads: Lead[];
  funnelResponsible: string;
}

const DAY_MS = 86400000;

// V1: tempo médio que os negócios ATUALMENTE em cada etapa estão parados nela
// (baseado em stageEnteredAt). Não reconstrói o histórico completo de transições —
// ver nota no roteiro sobre uma v2 baseada em activities "stage_change", caso este
// nível de precisão se mostre insuficiente.
export function StageVelocityPanel({ funnelPipeline, allLeads, funnelResponsible }: StageVelocityPanelProps) {
  const rows = useMemo(() => {
    if (!funnelPipeline) return [];
    const stages = [...funnelPipeline.columns].sort((a, b) => a.position - b.position);
    const now = Date.now();

    return stages.map(stage => {
      const stageLeadIds = new Set(stage.leadIds);
      const leadsHere = allLeads.filter(l => {
        if (!stageLeadIds.has(l.id)) return false;
        if (funnelResponsible === "all") return true;
        const resps = l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
        return resps.includes(funnelResponsible);
      });
      const withDate = leadsHere.filter(l => !!l.stageEnteredAt);
      const avgDays = withDate.length > 0
        ? withDate.reduce((s, l) => s + (now - new Date(l.stageEnteredAt!).getTime()) / DAY_MS, 0) / withDate.length
        : null;
      return {
        stage,
        count: leadsHere.length,
        avgDays,
        missingDate: leadsHere.length - withDate.length,
      };
    }).filter(r => r.count > 0);
  }, [funnelPipeline, allLeads, funnelResponsible]);

  const maxAvg = Math.max(...rows.map(r => r.avgDays ?? 0), 1);

  if (!funnelPipeline) return null;

  return (
    <div className="bg-card border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">Tempo médio por etapa</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Quantos dias, em média, os negócios que estão hoje em cada etapa já estão parados nela.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum negócio em aberto neste pipeline.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.stage.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-2 text-foreground">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.stage.color || "hsl(var(--primary))" }} />
                  <span className="truncate max-w-[160px]">{r.stage.title}</span>
                </span>
                <span className="text-muted-foreground">
                  {r.avgDays !== null ? `${r.avgDays.toFixed(1)} dias` : "sem dado"}
                  {r.missingDate > 0 && ` · ${r.missingDate} sem data`}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${r.avgDays !== null ? (r.avgDays / maxAvg) * 100 : 0}%`,
                    backgroundColor: r.stage.color || "hsl(var(--primary))",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
