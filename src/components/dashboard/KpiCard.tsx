import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Variacao } from "./useDashboardHelpers";

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  deltaPct?: number | null;
  /**
   * Inverte a hierarquia: o `sub` vira o número grande, no verde da marca, e o
   * `value` desce para a linha de baixo.
   *
   * Existe para os cartões de negócio, onde o dinheiro é a resposta e a
   * contagem é o detalhe: "quanto entrou" pesa mais que "quantos negócios".
   * Nos cartões de tempo e volume o padrão continua certo, então isto é uma
   * variante e não uma troca do componente.
   */
  destaqueNoSub?: boolean;
  /**
   * Palavra que acompanha o número na linha de baixo ("3 negócios").
   *
   * Só faz sentido com `destaqueNoSub`: quando o dinheiro assume o destaque, o
   * número sozinho lá embaixo não diz de que ele é contagem. Quem passa decide
   * singular ou plural -- o cartão não precisa saber gramática.
   */
  sufixo?: string;
  /**
   * Comparação com o período anterior, já classificada.
   *
   * Preferir a `deltaPct` solta: um número não consegue dizer a diferença
   * entre "cresceu do zero" e "não existe período anterior", e tratar os dois
   * como o mesmo `null` fazia o cartão desenhar um traço nos dois casos.
   */
  variacao?: Variacao;
}

export function KpiCard({ label, value, sub, deltaPct, destaqueNoSub, sufixo, variacao }: KpiCardProps) {
  // `variacao` manda quando vem; senão, o número solto é traduzido para os
  // mesmos estados, para os dois caminhos desenharem igual.
  const v: Variacao | undefined = variacao ?? (
    deltaPct === undefined ? undefined
      : deltaPct === null ? { tipo: "novo", base: "periodo-anterior" }
        : { tipo: "pct", valor: deltaPct, base: "periodo-anterior" }
  );

  // Explica contra o que a comparação foi feita. Sem isso, "+30%" no período
  // "Todo histórico" seria lido como comparação com um período anterior que
  // não existe.
  const explicacao = !v ? undefined
    : v.base === "dentro-do-periodo"
      ? "Comparado com a primeira metade do período (não há período anterior)"
      : "Comparado com o período anterior";

  const badge = v && (
    v.tipo === "pct" ? (
      <span title={explicacao} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${v.valor >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
        {v.valor >= 0 ? "+" : ""}{v.valor.toFixed(1)}%
      </span>
    ) : v.tipo === "novo" ? (
      // Sair de zero é alta, mas não tem percentual: dividir por zero não dá
      // número. "novo" diz o que aconteceu sem inventar uma conta.
      <span title={explicacao} className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full text-success bg-success/10">novo</span>
    ) : null
  );

  const tendencia = !v ? null : (
    <span title={explicacao}>
      {v.tipo === "estavel"
        ? <Minus size={20} className="text-muted-foreground" />
        : v.tipo === "novo" || v.valor >= 0
          ? <TrendingUp size={20} className="text-success" />
          : <TrendingDown size={20} className="text-destructive" />}
    </span>
  );

  if (destaqueNoSub) {
    return (
      <div className="bg-card rounded-xl p-4 border border-gray-200">
        <div className="mb-3">
          {/* `text-foreground` e não um preto fixo: no tema escuro o cartão
              inverte, e um #000 cravado sumiria dentro do próprio fundo. */}
          <span className="text-[13px] text-foreground font-medium">{label}</span>
        </div>
        {/* O dinheiro no lugar de destaque, na cor da marca. `tabular-nums`
            porque são valores lidos em coluna: sem ele os dígitos dançam de
            largura entre um cartão e outro e a linha perde o alinhamento. */}
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[22px] leading-none font-bold tabular-nums" style={{ color: "hsl(var(--primary))" }}>
            {sub ?? "—"}
          </p>
          {badge}
        </div>
        <div className="flex items-center justify-between mt-2">
          {/* Número à esquerda e a palavra logo depois. O `tabular-nums` fica
              só no número: aplicá-lo à palavra abriria as letras sem motivo. */}
          <p className="text-[13px] text-muted-foreground">
            <span className="tabular-nums">{value}</span>
            {sufixo ? ` ${sufixo}` : ""}
          </p>
          {tendencia}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-4 border border-gray-200">
      <div className="mb-3">
        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-2xl leading-none font-bold text-foreground">{value}</p>
        {badge}
      </div>
      {/* O `sub` aparece mesmo sem `deltaPct`. Antes ele estava dentro da
          condição da variação, então um cartão sem comparação perdia o
          subtítulo em silêncio -- e é justamente nesses (métricas de retrato,
          que não se comparam com período anterior) que o subtítulo explica ao
          leitor o que ele está vendo. */}
      {(sub || deltaPct !== undefined) && (
        <div className="flex items-center justify-between mt-2">
          {sub
            ? <p className="text-[12px] text-muted-foreground">{sub}</p>
            : <span />
          }
          {tendencia}
        </div>
      )}
    </div>
  );
}
