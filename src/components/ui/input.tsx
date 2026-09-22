import * as React from "react";

import { cn } from "@/lib/utils";

const FOCO =
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)] focus-visible:ring-offset-0";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          /* Campo do design system (components/forms/Input.jsx): altura 40,
             raio 10, borda de 1px, texto 14, padding 12.
             No foco a borda vira charcoal E entra o anel emerald: a borda diz
             "este é o campo", o anel diz "o teclado está aqui".
             Desabilitado é superfície neutra, não opacidade. */
          "flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground transition-[border-color,box-shadow] duration-[120ms] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[color:var(--text-subtle)] focus-visible:border-[color:var(--neutral-900)] " +
            FOCO +
            " disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
