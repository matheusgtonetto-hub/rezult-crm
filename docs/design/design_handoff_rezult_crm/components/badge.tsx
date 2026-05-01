// components/ui/badge.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.06em] uppercase transition-colors",
  {
    variants: {
      tone: {
        neutral:
          "bg-rz-surface-2 border-rz-border text-rz-text-muted",
        success:
          "bg-[color:var(--rz-success-bg)] border-rz-success/30 text-rz-success",
        warning:
          "bg-[color:var(--rz-warning-bg)] border-rz-warning/30 text-rz-warning",
        danger:
          "bg-[color:var(--rz-danger-bg)] border-rz-danger/30 text-rz-danger",
        info:
          "bg-[color:var(--rz-info-bg)] border-rz-info/30 text-rz-info",
        purple:
          "bg-rz-purple/10 border-rz-purple/30 text-rz-purple",
        primary:
          "bg-rz-primary/10 border-rz-primary/30 text-rz-primary",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
      )}
      {children}
    </span>
  );
}
