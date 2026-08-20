import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { tooltip } from "./useDashboardHelpers";

/**
 * Rosquinha de distribuição, com total no centro e legenda com valores.
 *
 * Nasceu compartilhada de propósito. Os cartões de KPI deste dashboard já
 * tinham sido escritos à mão três vezes e divergido entre si; começar com dois
 * consumidores (motivos de perda e origem dos leads) e um componente só evita
 * repetir aquilo.
 *
 * Por que rosquinha e não pizza cheia: o furo do meio é onde mora o total, que
 * é a primeira pergunta de quem olha uma distribuição ("de quantos estamos
 * falando?"). Numa pizza cheia esse número teria que ir para fora, competindo
 * com a legenda.
 */

/** Paleta de reserva, para conjuntos sem cor própria (ex.: motivos de perda,
 *  que são cadastrados pelo usuário e não têm cor definida). Ordenada para
 *  fatias vizinhas não ficarem parecidas. */
const PALETA = ["#128A68", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#EF4444", "#64748B"];

/**
 * Classes das duas colunas de número da legenda.
 *
 * Ficam em constante porque são aplicadas em dois lugares (cabeçalho e células),
 * e é a igualdade entre eles que faz a régua vertical cair no mesmo pixel. Se
 * uma largura fosse editada só num dos lados, a linha sairia torta.
 *
 * `whitespace-nowrap` na coluna de valor: ela recebe dinheiro em alguns painéis,
 * e "R$ 1.610,00" quebrado em duas linhas desalinharia a tabela inteira.
 */
const COL_VALOR = "w-[92px] text-center whitespace-nowrap";
const COL_EXTRA = "w-[76px] text-center border-l border-card-border";

export interface FatiaDonut {
  nome: string;
  valor: number;
  /** Opcional: sem cor, entra a da paleta na posição do item. */
  cor?: string;
  /**
   * Segunda coluna da legenda, já formatada (ex.: "12%" de conversão).
   *
   * Chega pronta como texto, e não como número, porque é grandeza de outra
   * natureza: o `valor` é o que a rosquinha reparte, e este não. Deixar o
   * componente formatá-la abriria a porta para ele somar as duas coisas.
   */
  extra?: string;
}

interface Props {
  dados: FatiaDonut[];
  /** Palavra sob o número central ("perdidos", "leads"). */
  rotuloCentro: string;
  /**
   * Total do centro. Só passar quando o total do universo for maior que a soma
   * das fatias -- é o caso de listas cortadas no top N, onde somar as fatias
   * daria um número menor que a realidade e o centro mentiria.
   */
  total?: number;
  /** Altura da área do gráfico. */
  altura?: number;
  /**
   * Espelha o arranjo: gráfico à direita, legenda à esquerda.
   *
   * Serve para quando dois donuts empilham no mesmo painel. Alternar o lado
   * cria um zigue-zague que separa visualmente as duas leituras; dois blocos
   * idênticos um sobre o outro seriam lidos como repetição.
   */
  inverso?: boolean;
  /**
   * Formata o número do centro e os da legenda.
   *
   * Existe por causa de dinheiro: "12000" no centro não diz nada, e o valor
   * formatado é longo demais para o corpo padrão. Quando presente, o centro
   * também encolhe a fonte para caber no furo.
   */
  formatarValor?: (v: number) => string;
  /**
   * Cabeçalhos das colunas da legenda. Sem isto, a legenda não mostra cabeçalho
   * e a coluna de valor exibe a fatia do total ("51%"), que é o padrão de uma
   * legenda de rosquinha.
   *
   * Com `extra` nomeado, aquela porcentagem cede lugar ao dado de cada fatia:
   * a proporção continua legível no próprio anel, então repeti-la em texto
   * gastaria a coluna à toa.
   */
  colunas?: { valor: string; extra?: string };
}

export function DonutDistribuicao({ dados, rotuloCentro, total, altura = 190, inverso, formatarValor, colunas }: Props) {
  const soma = dados.reduce((s, d) => s + d.valor, 0);
  const fatias = dados.map((d, i) => ({ ...d, cor: d.cor ?? PALETA[i % PALETA.length] }));

  /**
   * Sem nada para repartir: nenhuma fatia, ou todas em zero.
   *
   * Nesse caso o painel continua na tela com um anel cinza e zero no centro, em
   * vez de sumir. Painel que desaparece muda a altura da página e faz o leitor
   * procurar o que se perdeu; o anel vazio responde a pergunta ("quanto?
   * nenhum") e mantém o lugar do painel entre um período e outro.
   */
  const vazio = fatias.length === 0 || soma === 0;
  const ANEL_VAZIO = [{ nome: "—", valor: 1, cor: "#E5E7EB" }];

  /** Fatia em foco. null = mostrando o total. */
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const emFoco = fatias.find(f => f.nome === selecionada) ?? null;
  // Clicar de novo na mesma fatia volta ao total, então o gráfico nunca fica
  // preso num filtro que o usuário não sabe como desfazer.
  const alternar = (nome: string) => setSelecionada(atual => (atual === nome ? null : nome));

  // Com fatia em foco o centro passa a mostrar aquela fatia; sem foco, o total.
  const valorCentro = emFoco ? emFoco.valor : (total ?? soma);
  const textoCentro = formatarValor ? formatarValor(valorCentro) : String(valorCentro);
  const rotuloExibido = emFoco ? emFoco.nome : rotuloCentro;
  // Valor formatado (dinheiro) não cabe no furo no corpo de 26px. O limite de 7
  // caracteres é o ponto em que "R$ 1.200" ainda entra e "R$ 12.000,00" não.
  const corpoCentro = textoCentro.length > 7 ? "text-[15px]" : "text-[26px]";

  return (
    // Gráfico e legenda lado a lado. O donut ganha largura fixa (quadrado) e não
    // encolhe; a legenda toma o resto e trunca nomes longos.
    //
    // Empilha em telas estreitas: com o painel ocupando a largura toda no
    // celular, 190px de donut deixariam pouco para o nome da origem, e "Facebook
    // Ads" viraria reticências.
    <div className={`flex flex-col sm:items-center gap-4 sm:gap-5 ${inverso ? "sm:flex-row-reverse" : "sm:flex-row"}`}>
      <div className="relative shrink-0 mx-auto sm:mx-0" style={{ height: altura, width: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={vazio ? ANEL_VAZIO : fatias}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              /* Respiro entre fatias: sem ele, duas cores próximas viram um
                 bloco só e some a fronteira entre elas. */
              paddingAngle={vazio ? 0 : 2}
              stroke="none"
              isAnimationActive={false}
              // Anel vazio não seleciona nada: não há fatia por trás dele.
              onClick={vazio ? undefined : (_, i) => alternar(fatias[i].nome)}
              className={vazio ? undefined : "cursor-pointer"}
            >
              {(vazio ? ANEL_VAZIO : fatias).map(f => (
                <Cell
                  key={f.nome}
                  fill={f.cor}
                  // As não escolhidas esmaecem, em vez de a escolhida crescer:
                  // o anel mantém a espessura e a proporção segue legível.
                  opacity={!vazio && selecionada && selecionada !== f.nome ? 0.28 : 1}
                />
              ))}
            </Pie>
            {/* Sem tooltip no anel vazio: ele mostraria "— 1", que é o valor
                falso usado só para desenhar o círculo inteiro. */}
            {!vazio && <Tooltip contentStyle={tooltip} />}
          </PieChart>
        </ResponsiveContainer>

        {/* Centro em HTML, não em <text> do SVG: o texto fica com o mesmo
            antialiasing do resto da página e acompanha os tokens de cor.
            pointer-events-none para não roubar o hover das fatias. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-5">
          <span className={`${corpoCentro} leading-none font-bold text-foreground tabular-nums text-center`}>{textoCentro}</span>
          {/* Com fatia em foco o rótulo vira o nome dela, então o centro sempre
              diz de que aquele número é. Truncado porque nome de origem e de
              motivo de perda são livres e podem ser longos. */}
          <span
            className="text-[11px] text-muted-foreground mt-1 text-center truncate max-w-full"
            title={emFoco ? emFoco.nome : undefined}
          >
            {rotuloExibido}
          </span>
        </div>
      </div>

      {/* Legenda com valor alinhado à direita. Uma fatia por linha: nomes de
          motivo de perda e de origem são livres e podem ser longos, e lado a
          lado eles se atropelariam. */}
      {/* Tabela de verdade, e não divs em flex.
          A régua vertical entre as colunas é o motivo: `border-l` num <span>
          dentro de flex só desenha na altura do texto, então a linha saía
          picotada a cada fatia. Numa <td> a borda cobre a altura inteira da
          célula, padding incluído, e a régua fica contínua de ponta a ponta. */}
      <div className="flex-1 min-w-0">
        {/* Sem dado, a tabela dá lugar a uma frase. O cabeçalho de colunas
            pendurado sobre nenhuma linha pareceria carregamento travado. */}
        {vazio ? (
          <p className="text-xs text-muted-foreground">Sem dados no período.</p>
        ) : (
        <table className="w-full text-xs">
          {colunas && (
            <thead>
              <tr className="border-b border-card-border text-[10px] uppercase tracking-wide text-foreground">
                <th className="font-semibold pb-1.5 text-left" />
                <th className={`font-semibold pb-1.5 ${COL_VALOR}`}>{colunas.valor}</th>
                {colunas.extra && <th className={`font-semibold pb-1.5 ${COL_EXTRA}`}>{colunas.extra}</th>}
              </tr>
            </thead>
          )}
          <tbody>
            {/* A linha seleciona a mesma fatia que o anel. É o alvo de clique
                confortável: a fatia do anel pode ser um sliver de 1%, que
                ninguém acerta. */}
            {fatias.map(f => {
              const ativa = selecionada === f.nome;
              return (
                <tr
                  key={f.nome}
                  onClick={() => alternar(f.nome)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ativa}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(f.nome); } }}
                  className={`cursor-pointer transition-colors ${
                    ativa ? "bg-muted" : "hover:bg-muted/50"
                  } ${selecionada && !ativa ? "opacity-50" : ""}`}
                >
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.cor }} />
                      <span className={`truncate text-foreground ${ativa ? "font-semibold" : ""}`}>{f.nome}</span>
                    </span>
                  </td>
                  <td className={`py-1.5 text-muted-foreground tabular-nums ${COL_VALOR}`}>
                    {formatarValor ? formatarValor(f.valor) : f.valor}
                    {/* Sem colunas nomeadas, a fatia do total acompanha o valor --
                        é o comportamento padrão de legenda de rosquinha. */}
                    {!colunas && (
                      <span className="ml-1.5 text-[11px]">
                        {soma > 0 ? `${Math.round((f.valor / soma) * 100)}%` : "0%"}
                      </span>
                    )}
                  </td>
                  {colunas?.extra && (
                    <td className={`py-1.5 text-muted-foreground tabular-nums ${COL_EXTRA}`}>
                      {f.extra ?? "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
