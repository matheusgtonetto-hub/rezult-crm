import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* Rótulo de campo: 13px Medium no charcoal dos títulos (seção 3.2 da matriz e
 * components/forms/Input.jsx do design system). */
const labelVariants = cva(
  "text-[13px] font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
