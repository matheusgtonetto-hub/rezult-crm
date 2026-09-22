import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Anel de foco do sistema, repetido nos controles. */
const FOCO =
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)] focus-visible:ring-offset-0";

/* Botão do Rezult Design System (matriz: docs/design-system, seções 3.3, 3.4,
 * 3.6 e 3.7).
 *
 * Geometria: raio 10 (papel "botão"), alturas 36/40/44, ícone 16px, texto 14px
 * Medium. Estados: o hover CLAREIA a superfície emerald para o tom 300 e a
 * pressão ESCURECE para o 500, com escala .97 -- a única transformação do
 * sistema. Foco é o anel emerald de 3px, nunca o contorno do navegador.
 *
 * Desabilitado é superfície e tinta neutras, e não opacidade: opacidade sobre
 * cor de marca vira um verde lavado que ainda parece clicável. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-[120ms] ease-[cubic-bezier(.16,1,.3,1)] active:scale-[.97] " + FOCO + " disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:border-transparent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color:var(--accent-300)] active:bg-[color:var(--accent-500)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-[color:#E33A3A] active:bg-[color:#BF2A2A]",
        outline:
          "border border-input bg-card text-foreground hover:bg-[color:var(--surface-hover)] active:bg-[color:var(--neutral-100)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color:var(--neutral-100)] active:bg-[color:var(--neutral-150,#EBEBEB)]",
        ghost: "text-foreground hover:bg-[color:var(--neutral-100)] active:bg-[color:var(--neutral-150,#EBEBEB)]",
        link: "text-[color:var(--text-link)] underline-offset-4 hover:underline active:scale-100",
      },
      /* Alturas de controle da seção 3.3: 36 (sm), 40 (md, padrão) e 44 (lg),
         com o padding horizontal de 12/14/18 do sistema. */
      size: {
        default: "h-10 px-[14px]",
        sm: "h-9 px-3 text-[13px]",
        lg: "h-11 px-[18px] text-[14px]",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
