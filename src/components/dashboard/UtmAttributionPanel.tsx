import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Lead } from "@/data/mockData";
import { fmt } from "./useDashboardHelpers";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function TruncatedCell({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  const handleMouseEnter = () => {
    if (ref.current && ref.current.scrollWidth > ref.current.clientWidth) {
      setOpen(true);
    }
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          onMouseEnter={handleMouseEnter}
          className="block truncate text-xs text-muted-foreground cursor-default"
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-all text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

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
  const navigate = useNavigate();
  const [noUtmOpen, setNoUtmOpen] = useState(false);

  const { withUtm, noUtmLeads, noUtmCount, coverage, activeFields, rows } = useMemo(() => {
    const withUtm = periodLeads.filter(l =>
      UTM_FIELDS.some(f => (l[f.key] as string | undefined)?.trim())
    );
    const noUtmLeads = periodLeads.filter(l =>
      !UTM_FIELDS.some(f => (l[f.key] as string | undefined)?.trim())
    );

    const coverage = periodLeads.length > 0
      ? Math.round(withUtm.length / periodLeads.length * 100)
      : 0;

    const activeFields = UTM_FIELDS.filter(f =>
      withUtm.some(l => (l[f.key] as string | undefined)?.trim())
    );

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

    return { withUtm, noUtmLeads, noUtmCount: noUtmLeads.length, coverage, activeFields, rows };
  }, [periodLeads]);

  const visible = rows.slice(0, TOP_N);
  const restCount = rows.length - visible.length;
  const maxLeads = Math.max(...rows.map(r => r.leads), 1);

  const totalLeads   = rows.reduce((s, r) => s + r.leads, 0);
  const totalLost    = rows.reduce((s, r) => s + r.lost, 0);
  const totalWon     = rows.reduce((s, r) => s + r.won, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  const coverageColor = coverage >= 70 ? "bg-emerald-500" : coverage >= 40 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="bg-card border border-gray-200 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-foreground">Resultados por UTM</h3>
        {periodLeads.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${coverageColor}`} style={{ width: `${coverage}%` }} />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {coverage}% com UTM
            </span>
          </div>
        )}
      </div>

      {withUtm.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum lead com dados UTM no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="pb-2 pr-3 w-6" />
                {activeFields.map(f => (
                  <th key={f.key} className="text-left pb-2 pr-4 whitespace-nowrap w-[120px] max-w-[120px]">
                    <span className="font-medium text-foreground">{f.label}</span>
                    <span className="block font-normal text-muted-foreground/50 text-[10px] leading-tight">{f.param}</span>
                  </th>
                ))}
                <th className="text-center pb-2 font-medium text-foreground w-[10%]">Leads</th>
                <th className="text-center pb-2 font-medium pl-3 text-destructive/70 w-[10%]">Perdidos</th>
                <th className="text-center pb-2 font-medium pl-3 text-success/70 w-[10%]">Vendas</th>
                <th className="text-center pb-2 font-medium pl-3 text-success/70 w-[10%]">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {visible.map((r, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors group">
                  <td className="py-2.5 pr-3 text-[10px] text-muted-foreground/40 tabular-nums text-right select-none">
                    {i + 1}
                  </td>
                  {activeFields.map(f => (
                    <td key={f.key} className="py-2.5 pr-4 w-[120px] max-w-[120px]">
                      {r.utmValues[f.key] !== "—" ? (
                        <TruncatedCell text={r.utmValues[f.key]} />
                      ) : (
                        <span className="block text-xs text-muted-foreground/30">—</span>
                      )}
                    </td>
                  ))}
                  <td className="text-center py-2.5 text-muted-foreground tabular-nums text-xs">{r.leads}</td>
                  <td className="text-center py-2.5 pl-3 text-destructive font-medium tabular-nums text-xs">{r.lost}</td>
                  <td className="text-center py-2.5 pl-3 text-success font-medium tabular-nums text-xs">{r.won}</td>
                  <td className="text-center py-2.5 pl-3 font-semibold text-success whitespace-nowrap tabular-nums text-xs">{fmt(r.revenue)}</td>
                </tr>
              ))}
              {restCount > 0 && (
                <tr>
                  <td colSpan={activeFields.length + 5} className="py-2 text-xs text-muted-foreground text-center">
                    +{restCount} outra{restCount > 1 ? "s" : ""} combinação{restCount > 1 ? "ões" : ""}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-card-border bg-muted/20 text-xs font-semibold">
                <td className="py-2.5 pr-3" />
                {activeFields.map(f => (
                  <td key={f.key} className="py-2.5 pr-4 text-muted-foreground text-xs">
                    {f.key === activeFields[0].key ? "Total" : ""}
                  </td>
                ))}
                <td className="text-center py-2.5 text-foreground tabular-nums">{totalLeads}</td>
                <td className="text-center py-2.5 pl-3 text-destructive tabular-nums">{totalLost}</td>
                <td className="text-center py-2.5 pl-3 text-success tabular-nums">{totalWon}</td>
                <td className="text-center py-2.5 pl-3 text-success whitespace-nowrap tabular-nums">{fmt(totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>

          {noUtmCount > 0 && (
            <button
              onClick={() => setNoUtmOpen(true)}
              className="text-xs text-muted-foreground/50 mt-3 pt-3 border-t border-card-border w-full text-left hover:text-muted-foreground transition-colors cursor-pointer"
            >
              {noUtmCount} lead{noUtmCount > 1 ? "s" : ""} sem UTM {noUtmCount > 1 ? "não são exibidos" : "não é exibido"} — <span className="underline underline-offset-2">ver todos</span>
            </button>
          )}
        </div>
      )}

      <Dialog open={noUtmOpen} onOpenChange={setNoUtmOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Leads sem UTM ({noUtmCount})
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            <div className="divide-y divide-border">
              {noUtmLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => { setNoUtmOpen(false); navigate(`/pipeline/lead/${lead.id}`); }}
                  className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded px-2 -mx-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                    {lead.company && <p className="text-xs text-muted-foreground truncate">{lead.company}</p>}
                  </div>
                  {lead.value > 0 && (
                    <span className="text-xs text-success font-medium shrink-0">{fmt(lead.value)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
