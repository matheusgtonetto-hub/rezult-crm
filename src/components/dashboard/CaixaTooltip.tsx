import { tooltip } from "./useDashboardHelpers";

/**
 * A caixa que aparece no mouse, igual em todo gráfico do dashboard.
 *
 * O padrão do Recharts escreve "Negócios : 12" numa linha corrida, com o valor
 * grudado no rótulo. Numa caixa com três ou quatro linhas isso obriga a ler
 * cada uma inteira para achar o número, porque os números não se alinham entre
 * si -- eles começam onde o rótulo anterior terminou.
 *
 * Aqui rótulo e valor vão para lados opostos da caixa: os valores formam uma
 * coluna à direita, em `tabular-nums`, e comparar três números vira correr o
 * olho por uma coluna. É por isso que a caixa tem largura mínima, e não se
 * ajusta ao conteúdo: entre uma fatia e a vizinha, a coluna de números fica no
 * mesmo lugar em vez de dançar com o tamanho do rótulo.
 *
 * Vive num arquivo só porque quatro gráficos a usam -- os dois de área, o
 * ranking em barras e o anel. Copiada em cada um, a primeira mudança de padding
 * valeria em um quarto do dashboard.
 */

/**
 * Anel claro em volta da bolinha de cor.
 *
 * A caixa é escura desde 20/09/2026, e a série "Negócios" é desenhada em
 * charcoal: a bolinha dela sumia contra o fundo, e a linha ficava sem a marca
 * que diz de qual curva ela fala. O anel devolve a borda sem mexer na cor da
 * série -- que precisa ser a MESMA do gráfico, senão a caixa aponta para a
 * curva errada.
 */
const ANEL = "0 0 0 1px rgba(255,255,255,.45)";

export interface LinhaTooltip {
  rotulo: string;
  /** Já formatado: a caixa não sabe se aquilo é contagem ou dinheiro. */
  valor: string;
  /** Bolinha antes do rótulo. Para linhas que são séries de um gráfico. */
  cor?: string;
  /**
   * Linha em destaque.
   *
   * Marca o número que explica o desenho -- o que dita o tamanho da fatia ou da
   * barra --, para ele se distinguir dos que só o acompanham.
   */
  destaque?: boolean;
}

export function CaixaTooltip({
  titulo,
  cor,
  // `= []` não é zelo à toa: um popup sem linhas é um detalhe de um canto da
  // tela, e derrubava a PÁGINA inteira em tela branca quando o dado não vinha
  // como esperado (foi o que aconteceu com o anel em camadas, em 20/09/2026).
  // A caixa some sozinha; o dashboard continua de pé.
  linhas = [],
}: {
  titulo: string;
  /** Bolinha ao lado do título. Para quando a caixa inteira é de uma cor só. */
  cor?: string;
  linhas?: LinhaTooltip[];
}) {
  return (
    <div style={{ ...tooltip, padding: "8px 10px", minWidth: 148 }}>
      {/* Tintas CLARAS: a caixa é escura desde 20/09/2026 (ver `tooltip` em
          `useDashboardHelpers`). Título em branco, rótulos em `--neutral-400`
          -- que sobre o charcoal da caixa dá 7,4:1 -- e a linha de destaque de
          volta ao branco, para o número que explica o desenho continuar sendo o
          mais forte da caixa. */}
      <p className="text-xs font-semibold text-[color:var(--text-inverse)] mb-1.5 flex items-center gap-1.5">
        {cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cor, boxShadow: ANEL }} />}
        <span className="truncate">{titulo}</span>
      </p>
      {linhas.map(l => (
        <p
          key={l.rotulo}
          className={`flex items-center gap-4 text-[12px] leading-5 ${
            l.destaque
              ? "text-[color:var(--text-inverse)] font-semibold"
              : "text-[color:var(--neutral-400)]"
          }`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {l.cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.cor, boxShadow: ANEL }} />}
            <span className="truncate">{l.rotulo}</span>
          </span>
          {/* `ml-auto` empurra o valor para a direita mesmo com o rótulo curto,
              que é o que mantém a coluna de números alinhada entre as linhas. */}
          <span className="tabular-nums ml-auto">{l.valor}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Adaptador para gráficos de série (área, linha, barra empilhada).
 *
 * Traduz o que o Recharts entrega -- um item por série visível no ponto olhado
 * -- para as linhas da caixa. O título é o rótulo do eixo X: o mês, ou a hora.
 *
 * As cores chegam por um mapa de nome da série para cor, e não do payload. O
 * Recharts guarda a cor do item em campos que mudam conforme o tipo do gráfico
 * (`stroke` na área, `fill` na barra), e nas áreas daqui o `fill` é `url(#...)`
 * de um degradê -- que como cor de bolinha não pinta nada.
 */
export function TooltipSeries({
  active,
  payload,
  label,
  cores,
  formatarValor,
}: {
  active?: boolean;
  payload?: { name?: string | number; value?: number | string }[];
  label?: string | number;
  cores?: Record<string, string>;
  formatarValor?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <CaixaTooltip
      titulo={String(label ?? "")}
      linhas={payload.map(p => {
        const nome = String(p.name ?? "");
        return {
          rotulo: nome,
          valor: formatarValor ? formatarValor(Number(p.value ?? 0)) : String(p.value ?? 0),
          cor: cores?.[nome],
        };
      })}
    />
  );
}
