import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  /* Carregando é cintilação neutra (seção 3.7): nunca a cor da marca. */
  return <div className={cn("animate-pulse rounded-md bg-[color:var(--neutral-100)]", className)} {...props} />;
}

export { Skeleton };
