// components/ui/input.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-rz-border bg-rz-surface-2 px-3.5 py-2 text-sm text-rz-text",
        "placeholder:text-rz-text-subtle",
        "transition-[border,box-shadow] duration-[var(--rz-duration-fast)] ease-rz",
        "focus:outline-none focus:border-rz-border-active focus:shadow-[0_0_0_3px_var(--rz-glow)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

// components/ui/textarea.tsx
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-rz-border bg-rz-surface-2 px-3.5 py-2.5 text-sm text-rz-text",
        "placeholder:text-rz-text-subtle resize-y",
        "focus:outline-none focus:border-rz-border-active focus:shadow-[0_0_0_3px_var(--rz-glow)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
