import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} ref={ref} />;
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        /* components/forms/Radio.jsx do design system: 18px, contorno neutro de
           1,5px quando vazio e emerald 500 quando marcado, ponto interno de 9px.
           Vazio NÃO é verde: o verde é o estado, não a existência do controle. */
        "aspect-square h-[18px] w-[18px] rounded-full border-[1.5px] border-input bg-card text-[color:var(--accent-500)] transition-colors duration-[120ms] data-[state=checked]:border-[color:var(--accent-500)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-[9px] w-[9px] fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
