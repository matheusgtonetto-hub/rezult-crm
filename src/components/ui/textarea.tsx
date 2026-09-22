import * as React from "react";

import { cn } from "@/lib/utils";

const FOCO =
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)] focus-visible:ring-offset-0";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        /* Mesmo tratamento do Input: raio 10, borda de 1px, foco com borda
           charcoal mais anel emerald, desabilitado em superfície neutra. */
        "flex min-h-[80px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground transition-[border-color,box-shadow] duration-[120ms] placeholder:text-[color:var(--text-subtle)] focus-visible:border-[color:var(--neutral-900)] " +
          FOCO +
          " disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
