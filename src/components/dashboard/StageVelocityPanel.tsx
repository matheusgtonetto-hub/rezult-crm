import { useMemo } from "react";
import type { Lead, Pipeline } from "@/data/mockData";

interface StageVelocityPanelProps {
  funnelPipeline?: Pipeline | null;
  allLeads?: Lead[];
  funnelResponsible?: string;
  periodLeads?: Lead[];
  pipelines?: Pipeline[];
}

const DAY_MS = 86400000;

function getExitTime(lead: Lead): number {
  // Para leads ganhos/perdidos, usa a data da atividade de conclusão
  if (lead.dealStatus === "won" || lead.dealStatus === "lost") {
    const act = lead.activities.find(a => a.type === lead.dealStatus);
    if (act) return new Date(act.date).getTime();
  }
  return Date.now();
}

export function StageVelocityPanel({
  funnelPipeline,
  allLeads = [],
  funnelResponsible = "all",
}: StageVelocityPanelProps) {
  const rows = useMemo(() => {
    if (!funnelPipeline) return [];
    const stages = [...funnelPipeline.columns].sort((a, b) => a.position - b.position);
    if (stages.length === 0) return [];

    // title → id para mapear atividades stage_change ao id da etapa
    const titleToId = new Map(stages.map(s => [s.title, s.id]));

    // acumula lista de dias por stage id
    const stageDays = new Map<string, number[]>();
    stages.forEach(s => stageDays.set(s.id, []));

    const pipelineLeads = allLeads.filter(l => {
      if (l.pipelineId !== funnelPipeline.id) return false;
      if (funnelResponsible === "all") return true;
      const resps = l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
      return resps.includes(funnelResponsible);
    });

    for (const lead of pipelineLeads) {
      // Usa created_at (timestamp com hora) se disponível, senão entryDate
      const firstEntry = lead.created_at
        ? new Date(lead.created_at).getTime()
        : lead.entryDate
          ? new Date(lead.entryDate + "T00:00:00").getTime()
          : null;
      if (!firstEntry) continue;

      // Extrai transições de stage_change: "Movido de 'X' para 'Y'."
      const transitions = lead.activities
        .filter(a => a.type === "stage_change" && /para "/.test(a.description))
        .map(a => {
          const m = a.description.match(/para "([^"]+)"\./);
          return m ? { stageId: titleToId.get(m[1]) ?? null, time: new Date(a.date).getTime() } : null;
        })
        .filter((t): t is { stageId: string; time: number } => t !== null && t.stageId !== null)
        .sort((a, b) => a.time - b.time);

      // Linha do tempo do lead: [(stageId, entryTime)]
      // Começa sempre na primeira etapa do pipeline
      const timeline: { stageId: string; entryTime: number }[] = [
        { stageId: stages[0].id, entryTime: firstEntry },
      ];

      for (const t of transitions) {
        timeline.push({ stageId: t.stageId, entryTime: t.time });
      }

      const exitTime = getExitTime(lead);

      // Calcula dias em cada etapa
      for (let i = 0; i < timeline.length; i++) {
        const { stageId, entryTime } = timeline[i];
        const stageExit = i + 1 < timeline.length ? timeline[i + 1].entryTime : exitTime;
        const days = Math.max(0, stageExit - entryTime) / DAY_MS;
        stageDays.get(stageId)?.push(days);
      }
    }

    // Linha "Ganhos": da criação do negócio até a data da atividade won
    const wonDays: number[] = [];
    for (const lead of pipelineLeads) {
      if (lead.dealStatus !== "won") continue;
      const wonAct = lead.activities.find(a => a.type === "won");
      if (!wonAct) continue;
      const entry = lead.created_at
        ? new Date(lead.created_at).getTime()
        : lead.entryDate
          ? new Date(lead.entryDate + "T00:00:00").getTime()
          : null;
      if (!entry) continue;
      const days = Math.max(0, new Date(wonAct.date).getTime() - entry) / DAY_MS;
      wonDays.push(days);
    }
    const wonAvg = wonDays.length > 0
      ? wonDays.reduce((s, d) => s + d, 0) / wonDays.length
      : null;

    return [
      ...stages.map(stage => {
        const arr = stageDays.get(stage.id) ?? [];
        const avgDays = arr.length > 0
          ? arr.reduce((s, d) => s + d, 0) / arr.length
          : null;
        return { stage, count: arr.length, avgDays, isWon: false };
      }),
      { stage: { id: "__won__", title: "Ganhos", color: "#10B981", leadIds: [], position: 999 }, count: wonDays.length, avgDays: wonAvg, isWon: true },
    ];
  }, [funnelPipeline, allLeads, funnelResponsible]);

  if (!funnelPipeline) return null;

  return (
    <div className="bg-card border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">Tempo médio por etapa</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Média de dias que os negócios ficaram em cada etapa, calculada a partir da data de criação e das transições registradas.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma etapa configurada neste pipeline.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="text-left pb-2 font-medium">Etapa</th>
                <th className="text-right pb-2 font-medium">Negócios</th>
                <th className="text-right pb-2 font-medium">Tempo médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {rows.map(r => (
                <tr
                  key={r.stage.id}
                  className={`hover:bg-muted/30 transition-colors${r.isWon ? " border-t-2 border-card-border" : ""}`}
                >
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: r.stage.color || "hsl(var(--primary))" }}
                      />
                      <span className={`font-medium ${r.isWon ? "text-success" : "text-foreground"}`}>
                        {r.stage.title}
                      </span>
                    </div>
                  </td>
                  <td className={`text-right py-2.5 tabular-nums ${r.isWon ? "text-success font-medium" : "text-muted-foreground"}`}>
                    {r.count}
                  </td>
                  <td className={`text-right py-2.5 font-semibold tabular-nums ${r.isWon ? "text-success" : "text-foreground"}`}>
                    {r.avgDays !== null ? `${Math.round(r.avgDays)} dia${Math.round(r.avgDays) !== 1 ? "s" : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
