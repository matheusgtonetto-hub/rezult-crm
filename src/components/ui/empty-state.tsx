import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Estado vazio e estado de erro, no mesmo componente.
 *
 * A matriz (seção 3.7) define um desenho só para os dois: um quadrado tingido
 * com o glifo, um título de até seis palavras, uma linha de orientação e no
 * máximo UMA ação secundária. Erro é a mesma forma no tom vermelho, e a ação
 * vira "tentar de novo".
 *
 * Por que um componente e não 147 mensagens soltas: hoje o app diz "Nenhuma
 * atividade agendada" em 147 lugares, cada um com seu tamanho, seu cinza e seu
 * respiro. O leitor aprende uma vez o que significa uma área vazia, e não
 * quatorze vezes.
 *
 * Voz: título afirma o fato em até seis palavras ("Nenhum lead neste filtro"),
 * nunca pede desculpa e nunca fala na primeira pessoa do plural. A orientação
 * diz o próximo passo em uma linha.
 */
export interface EmptyStateProps {
  /** Glifo do Lucide. Fica dentro do quadrado tingido. */
  icone?: LucideIcon;
  /** Até seis palavras, afirmando o fato. */
  titulo: string;
  /** Uma linha de orientação. Opcional. */
  descricao?: string;
  /** No máximo uma ação, e secundária. */
  acao?: ReactNode;
  /** `erro` usa o tom vermelho; `destaque` usa o emerald claro. */
  tom?: "neutro" | "destaque" | "erro";
  /** Versão curta, para dentro de painel e de menu. */
  compacto?: boolean;
  className?: string;
}

const TONS = {
  neutro: { fundo: "bg-muted", tinta: "text-[color:var(--icon-default)]" },
  destaque: { fundo: "bg-[color:var(--accent-100)]", tinta: "text-[color:var(--accent-800)]" },
  erro: { fundo: "bg-[color:var(--danger-bg)]", tinta: "text-[color:var(--danger-fg)]" },
} as const;

export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  acao,
  tom = "neutro",
  compacto = false,
  className,
}: EmptyStateProps) {
  const t = TONS[tom];
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2.5 text-center",
        compacto ? "px-5 py-7" : "px-6 py-14",
        className,
      )}
    >
      {Icone && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-2xl",
            t.fundo,
            compacto ? "h-11 w-11" : "h-14 w-14",
          )}
        >
          <Icone size={compacto ? 20 : 24} className={t.tinta} strokeWidth={1.75} />
        </span>
      )}
      <span className={cn("font-semibold text-foreground", compacto ? "text-sm" : "text-base")}>{titulo}</span>
      {descricao && <p className="max-w-[340px] text-[13px] leading-normal text-muted-foreground">{descricao}</p>}
      {acao && <span className="mt-1.5">{acao}</span>}
    </div>
  );
}
