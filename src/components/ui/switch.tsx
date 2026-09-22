import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      /* components/forms/Switch.jsx do design system: trilho 44x26 com 3px de
         respiro, botão de 20px. Desligado é o cinza --neutral-300 (e não uma
         cor "apagada"), ligado é a superfície emerald. */
      "peer inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full border-[3px] border-transparent transition-colors duration-[180ms] ease-[cubic-bezier(.16,1,.3,1)] data-[state=checked]:bg-primary data-[state=unchecked]:bg-[color:var(--neutral-300)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-card shadow-xs ring-0 transition-transform duration-[180ms] ease-[cubic-bezier(.16,1,.3,1)] data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
