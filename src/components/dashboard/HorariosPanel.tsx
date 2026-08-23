import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CaixaTooltip } from "./CaixaTooltip";

/**
 * Ranking de horários em barras, medido por negócios criados ou por ganhos.
 *
 * Ordem decrescente, e não cronológica. O painel ao lado já mostra o dia na
 * ordem do relógio, e é dele o trabalho de descrever a rotina; aqui a pergunta
 * é outra -- em que horas o negócio nasce --, e ordenar por relógio esconderia
 * a resposta no meio das vinte e quatro horas.
 *
 * Isso tem uma consequência no eixo: os horários saem fora de ordem ("14h, 0h,
 * 22h..."), o que é o certo para um ranking e seria erro numa série temporal.
 * Quem quer o dia em ordem tem a curva ao lado.
 *
 * Uma cor só para todas as barras: elas medem a MESMA grandeza, e a posição já
 * diz quem é maior. Uma cor por hora sugeriria categorias que não existem.
 */

export interface HoraDoDia {
  /** Rótulo do eixo: "14h". */
  hora: string;
  /** Negócios criados nessa hora. */
  negocios: number;
  ganhos: number;
  perdidos: number;
}

/** O que a barra mede. Também é a chave do campo em `HoraDoDia`. */
type Metrica = "negocios" | "ganhos";

const ROTULO: Record<Metrica, string> = { negocios: "Negócios", ganhos: "Ganhos" };

/** Quantas horas entram no ranking. */
const HORAS_NO_RANKING = 10;

function TooltipHora({
  active,
  payload,
  total,
  metrica,
}: {
  active?: boolean;
  payload?: { payload: HoraDoDia }[];
  total?: number;
  metrica?: Metrica;
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;

  // As três linhas aparecem nas duas métricas: o botão troca o que a BARRA
  // mede, não o que a hora é. O destaque acompanha a barra, e a porcentagem
  // mede a mesma grandeza que ela -- senão o popup responderia com um número
  // sobre um universo que o desenho não mostra.
  const escolhido = metrica === "ganhos" ? d.ganhos : d.negocios;

  return (
    <CaixaTooltip
      titulo={d.hora}
      cor="#128A68"
      linhas={[
        { rotulo: "Negócios", valor: String(d.negocios), destaque: metrica === "negocios" },
        { rotulo: "Ganhos", valor: String(d.ganhos), destaque: metrica === "ganhos" },
        { rotulo: "Perdidos", valor: String(d.perdidos) },
        {
          rotulo: "% do total",
          valor: total && total > 0 ? `${Math.round((escolhido / total) * 100)}%` : "—",
        },
      ]}
    />
  );
}

/**
 * A posição no ranking, escrita dentro da barra.
 *
 * A ordem já está no desenho -- as barras descem da maior para a menor --, mas
 * ler "esta é a terceira" exige contar da esquerda. O número poupa a contagem,
 * e dentro da barra ele não gasta linha nenhuma de layout.
 *
 * A barra baixa é o caso que obriga a decidir: em ~18px de altura o número não
 * cabe, e escrever mesmo assim o deixaria pendurado para fora com a cor errada
 * (branco sobre o fundo do cartão). Abaixo disso ele sobe para cima da barra e
 * troca para a cor de texto secundário. Some da barra, mas continua legível --
 * e é justamente na cauda do ranking que o número importa menos.
 */
function RotuloDaPosicao({
  x,
  y,
  width,
  height,
  index,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  index?: number;
}) {
  const alturaBarra = Number(height) || 0;
  const cabeDentro = alturaBarra >= 18;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={cabeDentro ? Number(y) + 13 : Number(y) - 5}
      textAnchor="middle"
      fontSize={10}
      fontWeight={600}
      fill={cabeDentro ? "#fff" : "hsl(var(--muted-foreground))"}
    >
      {Number(index) + 1}
    </text>
  );
}

export function HorariosPanel({
  dados,
  className,
}: {
  /**
   * Todas as horas do período, em qualquer ordem.
   *
   * O painel é quem ordena e corta, e não a página, porque a ordem depende da
   * métrica escolhida no botão daqui: as horas em que mais entra negócio não
   * são as mesmas em que mais se ganha. Cortado de fora, o ranking de "Ganhos"
   * sairia das dez melhores horas de ENTRADA, e a resposta certa poderia estar
   * na décima primeira.
   */
  dados: HoraDoDia[];
  className?: string;
}) {
  const [metrica, setMetrica] = useState<Metrica>("negocios");

  // Horas sem nada na métrica escolhida ficam de fora: no ranking elas seriam
  // uma linha com o horário e barra nenhuma, e ainda tomariam a vaga de uma
  // hora que teve movimento.
  const ranking = [...dados]
    .filter(d => d[metrica] > 0)
    .sort((a, b) => b[metrica] - a[metrica])
    .slice(0, HORAS_NO_RANKING);

  /**
   * Denominador da porcentagem: só o que está no gráfico.
   *
   * A lista está cortada nas dez maiores horas, então este total é o das dez,
   * não o do dia. É a leitura certa para o painel: as porcentagens somam 100%
   * do que está desenhado, e não fatias de um bolo invisível.
   */
  const total = ranking.reduce((s, d) => s + d[metrica], 0);

  return (
    /**
     * Cartão em coluna com o gráfico esticando: `flex flex-col` aqui, `flex-1`
     * na área do gráfico e `height="100%"` no container do Recharts.
     *
     * O cartão é item de uma grade e já vinha esticado até a altura da linha,
     * que é ditada pela curva ao lado. Com altura calculada, as cinco barras
     * paravam na metade e sobrava um bloco branco de uns 180px no pé do painel.
     * Esticando, as barras se distribuem pela altura inteira e o vazio some.
     *
     * `min-h` porque no celular a grade vira uma coluna só: sem linha para
     * esticar, `flex-1` não teria altura de onde crescer e o gráfico colapsaria
     * para zero.
     */
    <div className={`bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 flex flex-col ${className ?? ""}`}>
      {/* Sem `flex-wrap`, ao contrário dos painéis mais largos.
          
          Com quebra, quem descia para a segunda linha era o par de botões, e
          isso acontecia só numa das duas métricas: "Volume de novos negócios
          por hora" é bem mais largo que "Ganhos por hora", então o cabeçalho
          tinha uma altura em Negócios e outra em Ganhos, e o gráfico inteiro
          pulava ao trocar o botão.
          
          Agora o bloco de texto é quem cede (`min-w-0`, e o subtítulo quebra em
          duas linhas se precisar) e os botões ficam fixos no canto (`shrink-0`).
          O que se move é a frase, não o controle que a pessoa acabou de
          clicar. */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Horários de maior resultado</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {metrica === "ganhos" ? "Ganhos por hora" : "Volume de novos negócios por hora"}
          </p>
        </div>
        {/* Mesmo par de botões do "Resultado no período" e do painel de
            responsáveis, um ponto menor: 11px e metade do respiro lateral. É o
            que faz os dois caberem ao lado do título nos ~356px deste painel,
            que é o mais estreito dos três. */}
        <div className="inline-flex shrink-0 rounded-lg border border-card-border p-0.5 bg-muted/40">
          {(["negocios", "ganhos"] as const).map(op => (
            <button
              key={op}
              onClick={() => setMetrica(op)}
              aria-pressed={metrica === op}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                metrica === op
                  ? "bg-card text-foreground shadow-elev-1"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ROTULO[op]}
            </button>
          ))}
        </div>
      </div>

      {ranking.length === 0 ? (
        <p className="text-xs text-muted-foreground py-8 text-center">
          {metrica === "ganhos" ? "Nenhum ganho no período selecionado." : "Nenhum negócio criado no período selecionado."}
        </p>
      ) : (
        <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ranking} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            {/* Grade só horizontal: em barra em pé é a linha horizontal que
                ajuda a comparar alturas. A vertical duplicaria a própria barra. */}
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" vertical={false} />
            {/* `interval={0}` força todo horário a aparecer. No padrão o Recharts
                pula rótulos quando aperta, e num ranking o rótulo pulado é
                justamente o que identifica a barra.

                Corpo 10, menor que os 11 do resto do dashboard: são dez rótulos
                em ~330px de largura, uns 33px cada, e "23h" em 11 encostaria no
                vizinho. */}
            <XAxis
              dataKey="hora"
              interval={0}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              allowDecimals={false}
              width={38}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
              content={<TooltipHora total={total} metrica={metrica} />}
            />
            {/* Canto arredondado só no topo: a base nasce colada no eixo, e
                arredondá-la descolaria a barra da linha de base.

                `maxBarSize` de 22: com dez barras a faixa de cada uma cai para
                ~33px, e a fita de 26 da versão deitada encostaria na vizinha. */}
            <Bar dataKey={metrica} fill="#128A68" radius={[6, 6, 0, 0]} maxBarSize={22} label={<RotuloDaPosicao />} />
          </BarChart>
        </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
