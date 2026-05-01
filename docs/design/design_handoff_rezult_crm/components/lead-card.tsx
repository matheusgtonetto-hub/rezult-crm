// components/ui/lead-card.tsx
// Pipeline lead card — used in Kanban columns
import * as React from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export interface LeadCardProps {
  name: string;
  company: string;
  value: number;
  source: string;
  sourceIcon?: React.ReactNode;
  time: string;
  score: number;
  hot?: boolean;
  onClick?: () => void;
  className?: string;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    .format(v);

const initials = (name: string) =>
  name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();

export function LeadCard({
  name, company, value, source, sourceIcon, time, score, hot, onClick, className,
}: LeadCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer p-3 hover:border-rz-border-active hover:-translate-y-px",
        "bg-rz-surface-2",
        className
      )}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-rz-primary/15 font-mono text-[10px] font-semibold text-rz-primary"
          aria-hidden
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium tracking-[-0.005em] text-rz-text">{name}</span>
            {hot && <Flame size={11} className="text-rz-warning" />}
          </div>
          <div className="truncate text-[10px] text-rz-text-subtle">{company}</div>
        </div>
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-sans text-sm font-semibold tracking-[-0.02em] text-rz-primary">
          {fmtBRL(value)}
        </span>
        <span className="font-mono text-[9px] tracking-wider text-rz-text-subtle">{time}</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-wider text-rz-text-muted">
          {sourceIcon}
          <span>{source}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[9px] text-rz-text-subtle">SCORE</span>
          <span className={cn(
            "font-mono text-[11px] font-semibold",
            score >= 85 ? "text-rz-primary" : "text-rz-text"
          )}>{score}</span>
        </div>
      </div>
    </Card>
  );
}
