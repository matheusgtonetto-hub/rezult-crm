import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CaixaTooltip } from "./CaixaTooltip";

/**
 * Ranking das faixas do dia ou da semana que mais geram negócio, em barras.
 *
 * Ordem decrescente, e não cronológica. O painel ao lado já mostra o ciclo na
 * ordem do relógio e do calendário, e é dele o trabalho de descrever a rotina;
 * aqui a pergunta é outra -- onde o negócio nasce --, e ordenar por relógio
 * esconderia a resposta no meio das vinte e quatro horas.
 *
 * Isso tem uma consequência no eixo: as faixas saem fora de ordem ("14h, 0h,
 * 22h..." ou "Qua, Seg, Sex..."), o que é o certo para um ranking e seria erro
 * numa série temporal. Quem quer o ciclo em ordem tem a curva ao lado.
 *
 * Uma cor só para todas as barras: elas medem a MESMA grandeza, e a posição já
 * diz quem é maior. Uma cor por faixa sugeriria categorias que não existem.
 */

export interface FaixaDoCiclo {
  /** Rótulo do eixo: "14h" no ciclo de horas, "Seg" no de dias. */
  rotulo: string;
  /** Negócios criados nessa faixa. */
  negocios: number;
  ganhos: number;
  perdidos: number;
}

/** Em que relógio o ranking lê o período. Mesmos nomes do painel ao lado. */
type Ciclo = "dias" | "horas";

/** Quantas faixas entram no ranking. */
const FAIXAS_NO_RANKING = 10;

function TooltipFaixa({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload: FaixaDoCiclo }[];
  total?: number;
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;

  // As três linhas juntas, e não só a que a barra mede: o ranking é de
  // negócios criados, mas saber que a melhor hora de entrada é também a de mais
  // perda é justamente o tipo de coisa que o balão existe para contar.
  return (
    <CaixaTooltip
      titulo={d.rotulo}
      cor="#128A68"
      linhas={[
        { rotulo: "Negócios", valor: String(d.negocios), destaque: true },
        { rotulo: "Ganhos", valor: String(d.ganhos) },
        { rotulo: "Perdidos", valor: String(d.perdidos) },
        {
          rotulo: "% do total",
          valor: total && total > 0 ? `${Math.round((d.negocios / total) * 100)}%` : "—",
        },
      ]}
    />
  );
}

/**
 * O valor da barra, escrito dentro dela.
 *
 * Era a posição no ranking (1, 2, 3...), que repetia o que o desenho já dizia:
 * as barras encurtam da esquerda para a direita, então a terceira é a terceira
 * colocada, com ou sem o número. O que ela NÃO dizia era o tamanho -- para
 * saber se a primeira teve doze negócios ou dois era preciso mirar o topo da
 * barra no eixo da esquerda, ou abrir o tooltip uma a uma.
 *
 * A barra baixa é o caso que obriga a decidir: em menos de 18px de altura o
 * número não cabe, e escrevê-lo mesmo assim o deixaria pendurado para fora com
 * a cor errada (branco sobre o fundo do cartão). Abaixo disso ele sobe para
 * cima da barra e troca para a cor de texto secundário. Some de dentro, mas
 * continua legível -- e é justamente na cauda do ranking que ele importa menos.
 *
 * Com a barra em pé, quem manda no "cabe ou não cabe" é a ALTURA (`height`),
 * que é o comprimento da barra; `width` é a espessura da fita, fixa, e nunca
 * diz nada sobre o valor.
 */
function ValorDaBarra({
  x,
  y,
  width,
  height,
  value,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
}) {
  const alturaBarra = Number(height) || 0;
  const cabeDentro = alturaBarra >= 18;

  return (
    <text
      // Centro horizontal da fita: a barra tem espessura fixa, então o número
      // fica alinhado com o rótulo dela no eixo de baixo.
      x={Number(x) + Number(width) / 2}
      y={cabeDentro ? Number(y) + 13 : Number(y) - 5}
      textAnchor="middle"
      fontSize={10}
      fontWeight={600}
      fill={cabeDentro ? "#fff" : "hsl(var(--muted-foreground))"}
    >
      {String(value ?? "")}
    </text>
  );
}

/**
 * O esqueleto que segura os eixos quando não há uma faixa sequer para ranquear.
 *
 * Antes o vazio era uma frase centralizada, e o painel encolhia para um cartão
 * com um texto solto bem ao lado do "Resultado no período", que no mesmo vazio
 * continua desenhando eixo, grade e a linha rente ao zero. Dois painéis lado a
 * lado tratando o mesmo "não há nada" de duas formas diferentes leem como se um
 * deles tivesse quebrado.
 *
 * Os rótulos saem em branco (`tickFormatter` abaixo) porque aqui a categoria é
 * a faixa vencedora, e não existe nenhuma para escrever: um "0h" de enfeite
 * seria o painel afirmando que a meia-noite ganhou o ranking. Ficam as dez
 * faixas vazias e a escala numérica que o Recharts monta sozinho a partir dos
 * zeros -- a mesma 0–4 que aparece no painel ao lado.
 */
const RANKING_VAZIO: FaixaDoCiclo[] = Array.from({ length: FAIXAS_NO_RANKING }, (_, i) => ({
  // `rotulo` precisa ser único em cada linha: é a chave da categoria no eixo, e
  // dez linhas com o mesmo valor virariam uma faixa só.
  rotulo: String(i),
  negocios: 0,
  ganhos: 0,
  perdidos: 0,
}));

export function HorariosPanel({
  horas,
  dias,
  className,
}: {
  /**
   * As duas leituras do mesmo período, cada uma com todas as suas faixas e em
   * qualquer ordem.
   *
   * O painel é quem ordena e corta, e não a página: a ordem depende do ciclo
   * escolhido no botão daqui, e cortar de fora obrigaria a página a saber qual
   * botão está apertado.
   */
  horas: FaixaDoCiclo[];
  dias: FaixaDoCiclo[];
  className?: string;
}) {
  /**
   * Nasce em dias, igual ao painel ao lado.
   *
   * Os dois abrem no mesmo ciclo de propósito: eles ficam lado a lado na mesma
   * linha e respondem perguntas complementares sobre o mesmo recorte -- a curva
   * mostra a forma da semana, o ranking diz quais dias puxam. Abrir cada um num
   * relógio diferente faria o par parecer dois painéis sem relação.
   */
  const [ciclo, setCiclo] = useState<Ciclo>("dias");
  const dados = ciclo === "horas" ? horas : dias;

  // Faixas sem negócio nenhum ficam de fora: no ranking elas seriam uma linha
  // com o rótulo e barra nenhuma, e ainda tomariam a vaga de uma que teve
  // movimento.
  const ranking = [...dados]
    .filter(d => d.negocios > 0)
    .sort((a, b) => b.negocios - a.negocios)
    .slice(0, FAIXAS_NO_RANKING);

  /**
   * Denominador da porcentagem: só o que está no gráfico.
   *
   * A lista está cortada nas dez maiores, então este total é o das dez, não o
   * do período. É a leitura certa para o painel: as porcentagens somam 100% do
   * que está desenhado, e não fatias de um bolo invisível. Em dias o corte
   * nunca morde -- a semana tem sete faixas --, então ali o total é o do
   * período inteiro.
   */
  const total = ranking.reduce((s, d) => s + d.negocios, 0);

  /** Sem uma faixa sequer para ranquear. Ver RANKING_VAZIO. */
  const vazio = ranking.length === 0;

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
          isso acontecia só num dos dois ciclos, porque os dois subtítulos têm
          larguras diferentes -- o cabeçalho teria uma altura em Dias e outra em
          Horas, e o gráfico inteiro pularia ao trocar o botão.

          Agora o bloco de texto é quem cede (`min-w-0`, e o subtítulo quebra em
          duas linhas se precisar) e os botões ficam fixos no canto (`shrink-0`).
          O que se move é a frase, não o controle que a pessoa acabou de
          clicar. */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Horários e dias de maior resultado</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ciclo === "horas" ? "Volume de novos negócios por hora" : "Volume de novos negócios por dia"}
          </p>
        </div>
        {/* O mesmo par Dias/Horas do painel ao lado, e na mesma ordem, um ponto
            menor: 11px e metade do respiro lateral. É o que faz os dois caberem
            ao lado do título nos ~356px deste painel, que é o mais estreito da
            linha.

            No lugar do par Negócios/Ganhos que estava aqui. Aquele trocava o
            que a barra MEDE; este troca em que relógio o período é lido, que é
            a pergunta que o painel ao lado também faz. Com os dois controles
            iguais, um clique de cada lado mantém a linha falando do mesmo
            recorte. */}
        <div className="inline-flex shrink-0 rounded-lg border border-card-border p-0.5 bg-muted/40">
          {([
            { id: "dias", rotulo: "Dias" },
            { id: "horas", rotulo: "Horas" },
          ] as const).map(op => (
            <button
              key={op.id}
              onClick={() => setCiclo(op.id)}
              aria-pressed={ciclo === op.id}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                ciclo === op.id
                  ? "bg-card text-foreground shadow-elev-1"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          {/* Barra em pé, que é o padrão do Recharts: a categoria vai para o
              eixo X, embaixo, e o número sobe pelo Y. */}
          <BarChart data={vazio ? RANKING_VAZIO : ranking} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            {/* Grade só horizontal: em barra em pé é a linha deitada que ajuda a
                comparar alturas. A vertical correria junto com a própria barra. */}
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" vertical={false} />
            {/* `interval={0}` força toda faixa a aparecer. No padrão o Recharts
                pula rótulos quando aperta, e num ranking o rótulo pulado é
                justamente o que identifica a barra.

                Corpo 10, menor que os 11 do resto do dashboard: em pé os
                rótulos dividem a largura entre si, e no ciclo de horas são dez
                deles em ~330px, uns 33px cada -- "23h" em 11 encostaria no
                vizinho. Em dias sobra espaço, mas um corpo por ciclo faria o
                eixo mudar de tamanho ao trocar o botão. */}
            <XAxis
              dataKey="rotulo"
              interval={0}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              dy={4}
              tickFormatter={vazio ? () => "" : undefined}
            />
            <YAxis
              allowDecimals={false}
              width={38}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            {/* Sem tooltip no vazio: passar o mouse abriria um balão com o
                rótulo interno da faixa ("0", "1"...) e três zeros, respondendo
                sobre uma faixa que não foi medida. */}
            {!vazio && (
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
                content={<TooltipFaixa total={total} />}
              />
            )}
            {/* Canto arredondado só no topo: a base nasce colada no eixo, e
                arredondá-la descolaria a barra da linha de base.

                `maxBarSize` de 22: com dez barras a faixa de cada uma cai para
                ~33px de largura, e uma fita mais grossa encostaria na vizinha.
                Em dias são sete faixas e sobra folga, mas o teto fixo evita que
                a barra engorde ao trocar o ciclo.

                Sem rótulo no vazio: seriam dez zeros pendurados na linha de
                base, medindo faixas que não existem. */}
            <Bar
              dataKey="negocios"
              fill="#128A68"
              radius={[6, 6, 0, 0]}
              maxBarSize={22}
              label={vazio ? undefined : <ValorDaBarra />}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
