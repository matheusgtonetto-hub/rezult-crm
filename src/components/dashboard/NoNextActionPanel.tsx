import { useMemo } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";
import type { Lead } from "@/data/mockData";

interface NoNextActionPanelProps {
  allLeads: Lead[];
}

const MAX_ROWS = 8;

// Lista operacional "agora" — não filtrada por dateRange, mesma convenção de overdueTasks.
export function NoNextActionPanel({ allLeads }: NoNextActionPanelProps) {
  const stuckLeads = useMemo(() => {
    const now = new Date();
    return allLeads
      .filter(l => (!l.dealStatus || l.dealStatus === "open"))
      .filter(l => !l.nextFollowUp || new Date(l.nextFollowUp) < now)
      .sort((a, b) => {
        const da = a.nextFollowUp ? new Date(a.nextFollowUp).getTime() : 0;
        const db = b.nextFollowUp ? new Date(b.nextFollowUp).getTime() : 0;
        return da - db; // sem data (0) primeiro, depois os mais atrasados
      });
  }, [allLeads]);

  const visible = stuckLeads.slice(0, MAX_ROWS);

  return (
    <div className="bg-card border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        Negócios sem próxima ação
        {stuckLeads.length > 0 && (
          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full font-semibold">{stuckLeads.length}</span>
        )}
      </h3>
      {stuckLeads.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-success">
          <CheckCircle size={14} />
          <span>Todo negócio aberto tem uma próxima ação agendada.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(l => {
            const hasDate = !!l.nextFollowUp;
            const daysLate = hasDate
              ? Math.max(0, Math.floor((new Date().getTime() - new Date(l.nextFollowUp!).getTime()) / 86400000))
              : null;
            return (
              <div key={l.id} className="flex items-start gap-3 pb-3 border-b border-card-border last:border-0 last:pb-0">
                <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle size={14} className="text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{l.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{l.responsible || "—"}</p>
                  <p className="text-xs text-destructive mt-0.5">
                    {hasDate
                      ? (daysLate === 0 ? "Venceu hoje" : `${daysLate} dia${daysLate! > 1 ? "s" : ""} sem follow-up`)
                      : "Sem próxima ação definida"}
                  </p>
                </div>
              </div>
            );
          })}
          {stuckLeads.length > MAX_ROWS && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              +{stuckLeads.length - MAX_ROWS} outro{stuckLeads.length - MAX_ROWS > 1 ? "s" : ""} negócio{stuckLeads.length - MAX_ROWS > 1 ? "s" : ""} sem próxima ação
            </p>
          )}
        </div>
      )}
    </div>
  );
}
