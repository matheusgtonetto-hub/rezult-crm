import { Minus, ArrowUpRight, ArrowDownRight, type LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { Variacao } from "./useDashboardHelpers";

/**
 * Famílias de cor do cartão.
 *
 * Cada KPI ganha a sua, e ela vale para o ícone e para o sparkline ao mesmo
 * tempo. São hexadecimais e não tokens do tema porque o Recharts pinta em SVG,
 * onde `hsl(var(--primary))` não resolve: o SVG não enxerga a variável CSS do
 * elemento pai. Os valores são os do Rezult CRM Design System: esmeralda 400,
 * esmeralda 700, vermelho de decadência e âmbar de alerta.
 */
const TONS = {
  primary: "#01D8A4",
  success: "#008762",
  danger: "#FD5555",
  amber: "#F7B32B",
} as const;

export type TomDoKpi = keyof typeof TONS;

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  deltaPct?: number | null;
  /** Ícone do canto superior direito, dentro do quadrado tingido. */
  icone?: LucideIcon;
  /**
   * Para onde o cartão leva. Quando existe, o canto superior direito ganha o
   * botão redondo escuro com a seta diagonal -- o `IconButton variant="dark"`
   * do `StatCard` do material -- no lugar do quadrado com o ícone da métrica.
   *
   * Sem isto o botão não é desenhado: uma seta de "abrir" que não abre nada
   * promete uma tela que não existe.
   */
  aoAbrir?: () => void;
  /** O que a seta abre, para o leitor de tela ("Ver os negócios ganhos"). */
  rotuloDeAbrir?: string;
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
    // o gráfico sangra de ponta a ponta. Embaixo o recuo é de 5px, e não 20,
    // justamente para sobrar 15px entre a curva e a borda inferior do cartão.
    // Se o padding do cartão mudar, os dois números mudam junto.
    <div className="h-11 -mx-5 -mb-[5px] mt-3">
      <ResponsiveContainer width="100%" height="100%">
        {/* bottom: 0 aqui de propósito. O respiro de 15px até a borda vem do
            recuo do contêiner acima; somar os dois deixaria o número maior do
            que o pedido, e sem nenhum lugar óbvio para conferir de onde veio. */}
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

export function KpiCard({ label, value, sub, deltaPct, destaqueNoSub, sufixo, variacao, icone: Icone, tom = "primary", serie, aoAbrir, rotuloDeAbrir }: KpiCardProps) {
  const cor = TONS[tom];
  // Id único por cartão: dois `linearGradient` com o mesmo id na página fazem o
  // segundo herdar o primeiro, e os sparklines sairiam todos da mesma cor.
  const gradId = `spark-${tom}-${label.replace(/\W+/g, "-").toLowerCase()}`;
  // Série toda zerada também desenha, como reta na base. Período sem movimento
  // é informação, e o cartão que some deixa a fileira desalinhada e obriga a
  // comparar cartões de alturas diferentes.
  const temSparkline = Array.isArray(serie) && serie.length >= 2;

  /*
    O ícone, com ou sem o quadrado tingido atrás.

    Nos cartões de negócio (`destaqueNoSub`) ele fica solto, só o traço colorido.
    Nos demais o quadrado continua, porque ali o ícone é a única cor do cartão e
    sem o fundo ele se perde na área branca.

    A caixa de 36px permanece nos dois casos, e é ela que segura o layout: o
    respiro da primeira linha e o centro vertical do rótulo saem dessa altura.
    Tirar a caixa junto com o fundo encolheria o cartão inteiro em uns 15px, o
    que não é remover um fundo, é mudar o cartão.

    A condição está presa a `destaqueNoSub` porque hoje ele marca exatamente um
    caso -- os quatro cartões do topo de Negócios. Se um dia uma terceira
    variante precisar decidir isso por conta própria, vira prop.
  */
  const chipDoIcone = Icone && (
    <div
      className={`w-9 h-9 flex items-center justify-center shrink-0 ${destaqueNoSub ? "" : "rounded-[10px]"}`}
      style={destaqueNoSub ? undefined : { background: `${cor}1A` }}  /* 1A = 10% de opacidade em hex */
    >
      <Icone size={17} style={{ color: cor }} />
    </div>
  );

  /**
   * O botão de abrir, no canto superior direito.
   *
   * É o `IconButton variant="dark"` do `StatCard` do material: círculo de 38px
   * em `--surface-inverse` com a seta diagonal em branco. Ele TOMA o lugar do
   * quadrado com o ícone da métrica -- os dois no mesmo canto seriam duas
   * âncoras disputando o olho, e o material tem só uma.
   */
  const botaoDeAbrir = aoAbrir && (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={rotuloDeAbrir ?? `Ver ${label}`}
      className="w-[30px] h-[30px] shrink-0 rounded-full inline-flex items-center justify-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)] bg-[color:var(--surface-inverse)] text-[color:var(--text-inverse)] hover:bg-[color:var(--neutral-800)]"
    >
      {/* 30px com ícone de 15: é o `size="sm"` do `IconButton` do material, que
          é o tamanho que o `StatCard` usa. Entrou em 36 (o `md`), e ao lado de
          um rótulo de 12px ele pesava mais que o próprio rótulo. */}
      <ArrowUpRight size={15} strokeWidth={2} />
    </button>
  );

  /** O canto: o botão manda quando existe. */
  const cantoSuperior = botaoDeAbrir ?? chipDoIcone;

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

  /**
   * A escala tipográfica do cartão: rótulo, número, e a linha de apoio (seta,
   * variação e texto secundário).
   *
   * Uma só para as duas variantes. Antes eram duas escalas -- a do
   * `destaqueNoSub` maior e com o rótulo em preto, a padrão menor e com o
   * rótulo em cinza --, e as fileiras de topo de cada aba do dashboard saíam
   * com corpos diferentes para a mesma função. Lado a lado nunca dava para
   * comparar, mas trocar de aba trocava o tamanho do texto sob o mesmo rótulo
   * ("Total de negócios"), o que lê como duas telas de produtos diferentes.
   *
   * O que continua distinguindo as variantes é só a HIERARQUIA -- qual campo
   * ocupa o lugar de destaque --, que é decisão de conteúdo. Tamanho e respiro
   * não são.
   *
   * Tudo num objeto só, e não em constantes soltas, porque são lidos juntos:
   * é a relação entre eles que decide se o cartão fica equilibrado, e
   * separá-los deixaria isso invisível na hora de editar.
   */
  const ESCALA = {
    // Rótulo em caption cinza e número na escala "Métrica" do sistema (32/600,
    // tracking -2%, tabular-nums). Antes: rótulo de 14px no preto do corpo e
    // número de 22px, que é tamanho de título de painel -- o cartão inteiro
    // pesava igual ao painel ao lado em vez de destacar o número.
    rotulo: "text-xs text-muted-foreground font-normal",
    // 32px é o alvo da escala "Métrica", mas valor em reais com milhar cheio
    // ("R$ 10.475.302,00") tem 17 caracteres e encostava na borda do cartão com
    // quatro KPIs na fileira. O clamp mantém os 32px onde cabe e encolhe até
    // 20px em cartão estreito, sem quebrar a linha.
    numero: "text-[clamp(20px,2.1vw,32px)] font-semibold tracking-[-0.02em] leading-[1.05] tabular-nums",
    badge: "text-[12px]",
    apoio: "text-xs",
    seta: 11,
  };

  // Sem pastilha de fundo: só o texto colorido. A cor já diz alta ou queda, e o
  // fundo somava uma segunda camada de sinal para a mesma informação, num cartão
  // que já tem seta, ícone tingido e sparkline.
  const badge = v && (
    v.tipo === "pct" ? (
      <span
        title={explicacao}
        className={`${ESCALA.badge} inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 font-medium text-foreground tabular-nums`}
      >
        {v.valor >= 0 ? "+" : ""}{v.valor.toFixed(1)}%
        {/* A seta mora DENTRO da pílula, à direita do número, como no
            `DeltaChip.jsx` do material. Ela estava do lado de fora, na outra
            ponta da linha: as duas dizem a mesma coisa, e separá-las obrigava o
            olho a cruzar o cartão para juntar.

            O número fica na tinta do texto e só a seta é colorida -- verde na
            alta, vermelho na queda. É a mesma regra do material, e evita a
            leitura "verde = bom" num cartão como "Total perdidos", onde subir
            não é boa notícia. */}
        {v.valor >= 0
          ? <ArrowUpRight size={ESCALA.seta} strokeWidth={2.4} className="text-[color:var(--accent-700)]" />
          : <ArrowDownRight size={ESCALA.seta} strokeWidth={2.4} className="text-destructive" />}
      </span>
    ) : v.tipo === "novo" ? (
      // Sair de zero é alta, mas não tem percentual: dividir por zero não dá
      // número. "novo" diz o que aconteceu sem inventar uma conta.
      <span title={explicacao} className={`${ESCALA.badge} inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 font-medium text-foreground`}>
        novo
        <ArrowUpRight size={ESCALA.seta} strokeWidth={2.4} className="text-[color:var(--accent-700)]" />
      </span>
    ) : null
  );

  /**
   * O caso "estável" continua com marca própria, porque não tem pílula: sem
   * variação não há percentual para desenhar, e um traço diz "igual ao período
   * anterior" onde a ausência de qualquer sinal diria "não medimos".
   */
  const tendencia = v && v.tipo === "estavel" ? (
    <span title={explicacao} className="flex items-center">
      <Minus size={ESCALA.seta} className="text-muted-foreground" />
    </span>
  ) : null;

  if (destaqueNoSub) {
    return (
      <div className="bg-card rounded-2xl p-5 border border-card-border shadow-elev-1 overflow-hidden">
        {/* Rótulo e ícone dividem a primeira linha. O ícone à direita dá âncora
            visual ao cartão sem competir com o número, que continua sendo a
            informação principal.

            `items-center`, e não `items-start` como no modo padrão: o quadrado
            do ícone tem 36px e a caixa de linha do rótulo tem 21px, então
            alinhar pelo topo deixava o texto uns 7px acima do centro do ícone.
            Os quatro rótulos daqui são curtos e nunca quebram em duas linhas,
            que é o caso em que alinhar pelo topo seria o certo. */}
        <div className="flex items-center justify-between gap-2 mb-3">
          {/* Rótulo em preto. A hierarquia contra o número logo abaixo fica por
              conta do corpo (14 contra 22) e do peso (400 contra 700), sem
              precisar rebaixar a cor também. */}
          <span className={ESCALA.rotulo}>{label}</span>
          {cantoSuperior}
        </div>
        {/* O dinheiro no lugar de destaque. `tabular-nums` porque são valores
            lidos em coluna: sem ele os dígitos dançam de largura entre um
            cartão e outro e a linha perde o alinhamento.

            22px, contra os 24 (text-2xl) da variante padrão logo abaixo. Aqui o
            valor divide a atenção com o título de 14px e a linha de apoio, e o
            corpo menor deixa o cartão mais respirado sem perder a hierarquia,
            que continua garantida pelo peso 700 e pela cor. */}
        <p className={`${ESCALA.numero} leading-none font-bold tabular-nums text-foreground`}>
          {sub ?? "—"}
        </p>
        {/* Variação e contagem na mesma linha, com a seta colada no percentual
            em vez de exilada na outra ponta do cartão: as duas dizem a mesma
            coisa, e separá-las obrigava o olho a cruzar o cartão para juntar. */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {tendencia}
          {badge}
          <span className={`${ESCALA.apoio} text-muted-foreground`}>
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
    <div className="bg-card rounded-2xl p-5 border border-card-border shadow-elev-1 overflow-hidden">
      {/* `items-center` como na outra variante: com o rótulo em 14px as duas
          fileiras passaram a ter a mesma altura de linha, e alinhar pelo topo
          aqui deixaria o texto acima do centro do ícone. */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={ESCALA.rotulo}>{label}</span>
        {cantoSuperior}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <p className={`${ESCALA.numero} leading-none font-bold tabular-nums text-foreground`}>{value}</p>
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
            ? <p className={`${ESCALA.apoio} text-muted-foreground`}>{sub}</p>
            : <span />
          }
          {tendencia}
        </div>
      )}
    </div>
  );
}
