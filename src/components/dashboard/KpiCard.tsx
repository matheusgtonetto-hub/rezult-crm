import { TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { Variacao } from "./useDashboardHelpers";

/**
 * Famílias de cor do cartão.
 *
 * Cada KPI ganha a sua, e ela vale para o ícone e para o sparkline ao mesmo
 * tempo. São hexadecimais e não tokens do tema porque o Recharts pinta em SVG,
 * onde `hsl(var(--primary))` não resolve: o SVG não enxerga a variável CSS do
 * elemento pai. Os valores são os mesmos dos tokens.
 */
const TONS = {
  primary: "#128A68",
  success: "#10B981",
  danger: "#EF4444",
  amber: "#F59E0B",
} as const;

export type TomDoKpi = keyof typeof TONS;

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  deltaPct?: number | null;
  /** Ícone do canto superior direito, dentro do quadrado tingido. */
  icone?: LucideIcon;
  /** Família de cor do ícone e do sparkline. Padrão: verde da marca. */
  tom?: TomDoKpi;
  /**
   * Série do mini gráfico no rodapé do cartão.
   *
   * Opcional de propósito: cartão sem série desenha exatamente como antes, o
   * que permite adotar o sparkline aba por aba sem mexer nos outros.
   * Menos de 2 pontos não vira linha, então nesse caso nada é desenhado.
   */
  serie?: number[];
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

/**
 * Mini gráfico do rodapé. Sem eixo, sem grade, sem tooltip: ele não é para ler
 * valor, é para dar a forma do período num relance. O degradê some para baixo
 * para a linha não virar um bloco pesado dentro de um cartão pequeno.
 */
function Sparkline({ serie, cor, id }: { serie: number[]; cor: string; id: string }) {
  const dados = serie.map((v, i) => ({ i, v }));
  return (
    // O cartão tem p-5 (20px). Na horizontal o -mx-5 anula o padding inteiro e
    // o gráfico sangra de ponta a ponta. Embaixo o recuo é de 15px, e não 20,
    // justamente para sobrar 5px entre a curva e a borda inferior do cartão.
    // Se o padding do cartão mudar, os dois números mudam junto.
    <div className="h-11 -mx-5 -mb-[15px] mt-3">
      <ResponsiveContainer width="100%" height="100%">
        {/* bottom: 0 aqui de propósito. O respiro de 5px até a borda vem do
            recuo do contêiner acima; somar os dois daria 8px e o número
            deixaria de bater com o que foi pedido. */}
        <AreaChart data={dados} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity={0.22} />
              <stop offset="100%" stopColor={cor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={cor}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCard({ label, value, sub, deltaPct, destaqueNoSub, sufixo, variacao, icone: Icone, tom = "primary", serie }: KpiCardProps) {
  const cor = TONS[tom];
  // Id único por cartão: dois `linearGradient` com o mesmo id na página fazem o
  // segundo herdar o primeiro, e os sparklines sairiam todos da mesma cor.
  const gradId = `spark-${tom}-${label.replace(/\W+/g, "-").toLowerCase()}`;
  // Série toda zerada também desenha, como reta na base. Período sem movimento
  // é informação, e o cartão que some deixa a fileira desalinhada e obriga a
  // comparar cartões de alturas diferentes.
  const temSparkline = Array.isArray(serie) && serie.length >= 2;

  const chipDoIcone = Icone && (
    <div
      className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
      style={{ background: `${cor}1A` }}  /* 1A = 10% de opacidade em hex */
    >
      <Icone size={17} style={{ color: cor }} />
    </div>
  );

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

  // Sem pastilha de fundo: só o texto colorido. A cor já diz alta ou queda, e o
  // fundo somava uma segunda camada de sinal para a mesma informação, num cartão
  // que já tem seta, ícone tingido e sparkline.
  const badge = v && (
    v.tipo === "pct" ? (
      <span title={explicacao} className={`text-[11px] font-semibold ${v.valor >= 0 ? "text-success" : "text-destructive"}`}>
        {v.valor >= 0 ? "+" : ""}{v.valor.toFixed(1)}%
      </span>
    ) : v.tipo === "novo" ? (
      // Sair de zero é alta, mas não tem percentual: dividir por zero não dá
      // número. "novo" diz o que aconteceu sem inventar uma conta.
      <span title={explicacao} className="text-[11px] font-semibold text-success">novo</span>
    ) : null
  );

  // Seta pequena: ela fica colada no percentual, e não sozinha no canto. No
  // tamanho antigo (20) ela pesava mais que o próprio número que qualifica.
  const tendencia = !v ? null : (
    <span title={explicacao} className="flex items-center">
      {v.tipo === "estavel"
        ? <Minus size={15} className="text-muted-foreground" />
        : v.tipo === "novo" || v.valor >= 0
          ? <TrendingUp size={15} className="text-success" />
          : <TrendingDown size={15} className="text-destructive" />}
    </span>
  );

  if (destaqueNoSub) {
    return (
      <div className="bg-card rounded-xl p-5 border border-gray-200 shadow-elev-1 overflow-hidden">
        {/* Rótulo e ícone dividem a primeira linha. O ícone à direita dá âncora
            visual ao cartão sem competir com o número, que continua sendo a
            informação principal. */}
        <div className="flex items-start justify-between gap-2 mb-3">
          {/* Rótulo em cinza, não em preto: quem manda no cartão é o número
              logo abaixo, e dois pesos fortes na sequência anulam a hierarquia. */}
          <span className="text-[13px] text-muted-foreground font-medium">{label}</span>
          {chipDoIcone}
        </div>
        {/* O dinheiro no lugar de destaque. `tabular-nums` porque são valores
            lidos em coluna: sem ele os dígitos dançam de largura entre um
            cartão e outro e a linha perde o alinhamento. */}
        <p className="text-[26px] leading-none font-bold tabular-nums text-foreground">
          {sub ?? "—"}
        </p>
        {/* Variação e contagem na mesma linha, com a seta colada no percentual
            em vez de exilada na outra ponta do cartão: as duas dizem a mesma
            coisa, e separá-las obrigava o olho a cruzar o cartão para juntar. */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {tendencia}
          {badge}
          <span className="text-[12px] text-muted-foreground">
            {/* O `tabular-nums` fica só no número: aplicá-lo à palavra abriria
                as letras sem motivo. */}
            <span className="tabular-nums">{value}</span>
            {sufixo ? ` ${sufixo}` : ""}
          </span>
        </div>
        {temSparkline && <Sparkline serie={serie} cor={cor} id={gradId} />}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-5 border border-gray-200 shadow-elev-1 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
        {chipDoIcone}
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
