import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  conv?: string | null;
  icon: LucideIcon;
  color: string;
  // undefined → não mostra pill de variação; null → mostra "novo" (sem base de comparação); number → % vs. período anterior
  deltaPct?: number | null;
}

export function KpiCard({ label, value, sub, conv, icon: Icon, color, deltaPct }: KpiCardProps) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
        <Icon size={15} className={color} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-2xl leading-none font-bold text-foreground">{value}</p>
        {deltaPct !== undefined && (
          deltaPct === null ? (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full text-muted-foreground bg-muted">novo</span>
          ) : (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${deltaPct >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
              {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%
            </span>
          )
        )}
      </div>
      {sub && <p className="text-[12px] text-muted-foreground mt-2">{sub}</p>}
      {conv && <p className={`text-[11px] font-semibold mt-1.5 ${color}`}>{conv}</p>}
    </div>
  );
}
