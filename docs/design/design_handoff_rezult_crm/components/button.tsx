// =============================================================
// Rezult CRM — shadcn-ready components
// Drop these into components/ui/ alongside shadcn defaults.
// They override the defaults with Rezult-specific styling.
// Requires: tokens.css imported in globals.css, tailwind.config.ts
// =============================================================

// ------------------------------------------------------------
// components/ui/button.tsx
// ------------------------------------------------------------
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium tracking-tight transition-all duration-[var(--rz-duration-fast)] ease-rz focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rz-primary focus-visible:ring-offset-2 focus-visible:ring-offset-rz-bg disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-rz-primary text-rz-on-primary shadow-rz-glow hover:bg-rz-primary-hover active:translate-y-[1px]",
        secondary:
          "bg-rz-surface-2 text-rz-text border border-rz-border hover:border-rz-border-active hover:bg-rz-surface-3",
        outline:
          "bg-transparent text-rz-primary border border-rz-primary hover:bg-rz-primary/10",
        ghost:
          "bg-transparent text-rz-text-muted hover:bg-rz-surface-2 hover:text-rz-text",
        danger:
          "bg-rz-danger text-white hover:bg-rz-danger/90",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  }
);
Button.displayName = "Button";
export { buttonVariants };
