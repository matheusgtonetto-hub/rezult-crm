import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* Badge do design system (components/core/Badge.jsx e seção 3.4 da matriz):
 * raio 6, 12px Medium. A pílula (raio 999) é o Chip, e existe aqui como
 * variante `pill` para os filtros que já a usam.
 *
 * `soft` é o tom mais usado em produto: fundo emerald claro com tinta verde
 * fechada (6,26:1). `accent` é o emerald cheio com tinta charcoal, para quando
 * o badge precisa gritar. */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium leading-normal transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)]",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        soft: "border-transparent bg-[color:var(--accent-100)] text-[color:var(--accent-800)]",
        secondary: "border-transparent bg-muted text-muted-foreground",
        destructive: "border-transparent bg-[color:var(--danger-bg)] text-[color:var(--danger-fg)]",
        warning: "border-transparent bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)]",
        dark: "border-transparent bg-[color:var(--surface-inverse)] text-[color:var(--neutral-0)]",
        dead: "border-transparent bg-[color:var(--muted-dead)] text-[color:var(--neutral-800)]",
        outline: "border-border text-foreground",
      },
      shape: {
        badge: "rounded-sm",
        pill: "rounded-full px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "badge",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
