import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Especificação do design system (components/forms/Checkbox.jsx e seção
      // 3.7 da matriz): 18px, raio 6, contorno de 1,5px.
      //
      // Desmarcado: fundo branco e contorno NEUTRO (--input, que é o
      // --border-strong do sistema). Antes era `border-primary`, e por isso a
      // caixa aparecia verde mesmo vazia -- o verde passava a marcar "existe uma
      // caixa aqui" em vez de "está selecionado", que é o trabalho dele.
      //
      // Marcado: superfície emerald com o "certo" em charcoal (7,25:1), e o
      // contorno um degrau mais escuro para fechar a borda.
      "peer h-[18px] w-[18px] shrink-0 rounded-sm border-[1.5px] border-input bg-card ring-offset-background transition-colors data-[state=checked]:bg-primary data-[state=checked]:border-[color:var(--accent-500)] data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-[color:var(--accent-500)] data-[state=indeterminate]:text-primary-foreground hover:border-[color:var(--accent-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      {/* Indeterminado é um TRAÇO, não um "certo": ele diz "parte da lista está
          marcada". Com o mesmo ✓ dos outros, a caixa do cabeçalho afirmava que
          tudo estava selecionado quando havia uma linha só. Especificação em
          components/forms/Checkbox.jsx do design system.

          Traço 3 e 12px: o glifo precisa de peso para ler a 18px. */}
      {props.checked === "indeterminate"
        ? <Minus className="h-3 w-3" strokeWidth={3} />
        : <Check className="h-3 w-3" strokeWidth={3} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
