import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-2xl border p-4 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground [&>svg]:text-[color:var(--icon-default)]",
        soft: "border-[color:var(--accent-200)] bg-[color:var(--accent-50)] text-[color:var(--accent-800)] [&>svg]:text-[color:var(--accent-700)]",
        warning:
          "border-[color:var(--warning-400)]/40 bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)] [&>svg]:text-[color:var(--warning-fg)]",
        destructive:
          "border-[color:var(--danger-400)]/40 bg-[color:var(--danger-bg)] text-[color:var(--danger-fg)] [&>svg]:text-[color:var(--danger-fg)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
