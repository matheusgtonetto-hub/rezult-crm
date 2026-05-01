// components/ui/card.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-rz-border bg-rz-surface text-rz-text",
        "transition-[border-color,transform] duration-[var(--rz-duration-fast)] ease-rz",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 p-5", className)} {...p} />
);
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-base font-semibold tracking-tight text-rz-text", className)} {...p} />
);
export const CardDescription = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-sm text-rz-text-muted", className)} {...p} />
);
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5 pt-0", className)} {...p} />
);
export const CardFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center p-5 pt-0", className)} {...p} />
);

// Convenience: a metric card matching the Pipeline / Reports pattern.
export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  delta?: string;
  deltaPositive?: boolean;
  icon?: React.ReactNode;
  className?: string;
}
export const MetricCard = ({ label, value, delta, deltaPositive, icon, className }: MetricCardProps) => (
  <Card className={cn("p-4", className)}>
    <div className="flex items-center justify-between">
      <span className="rz-eyebrow">{label}</span>
      {icon && <span className="text-rz-text-subtle">{icon}</span>}
    </div>
    <div className="mt-2 flex items-baseline gap-2">
      <span className="font-sans text-2xl font-semibold tracking-[-0.025em] text-rz-text">{value}</span>
      {delta && (
        <span className={cn("font-mono text-xs", deltaPositive ? "text-rz-success" : "text-rz-danger")}>
          {delta}
        </span>
      )}
    </div>
  </Card>
);
