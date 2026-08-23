import { Fragment, useState, type ReactElement } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { tooltip, PALETA } from "./useDashboardHelpers";
import { CaixaTooltip, type LinhaTooltip } from "./CaixaTooltip";

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

/** Cinza do anel sem nada para repartir. Valor 1 é falso, só fecha o círculo. */
const ANEL_VAZIO = [{ nome: "—", valor: 1, cor: "#E5E7EB" }];

interface AnelProps {
  fatias: { nome: string; valor: number; cor?: string }[];
  vazio: boolean;
  altura: number;
  textoCentro: string;
  rotuloCentro: string;
  /** Nome completo da fatia em foco, para o `title` do rótulo truncado. */
  tituloDoRotulo?: string;
  /** Ausente = anel só de leitura, sem clique nem esmaecimento. */
  selecionada?: string | null;
  onSelecionar?: (nome: string) => void;
  /**
   * Etiqueta do critério, no topo do furo ("Por origem", "Por motivo").
   *
   * Só faz sentido com dois anéis lado a lado: sozinho, o anel já é explicado
   * pelo título do painel e a etiqueta viraria ruído. Dentro do furo, e não
   * abaixo do anel, para a etiqueta acompanhar o número que ela qualifica em
   * vez de flutuar entre os dois desenhos.
   */
  rodape?: string;
  /**
   * Tooltip próprio, no lugar do padrão do Recharts (nome e valor).
   *
   * Para anéis onde a fatia carrega mais de um número: o de responsável mostra
   * negócios, ganhos, perdidos e receita da mesma pessoa. Recharts injeta os
   * props no elemento, então basta passá-lo montado: `<MeuTooltip />`.
   */
  conteudoTooltip?: ReactElement;
  /**
   * Fatia sob o mouse, ou null ao sair.
   *
   * Existe para o anel sem legenda: ali o hover é o ÚNICO jeito de descobrir de
   * quem é a fatia, e quem escuta este aviso costuma usá-lo para trocar o
   * número do furo pelo da fatia apontada.
   */
  onPassarMouse?: (nome: string | null) => void;
}

/**
 * O popup da fatia, no mesmo formato dos outros gráficos do dashboard.
 *
 * Mostra o que a linha da legenda mostra: o valor e as colunas extras, com os
 * mesmos títulos. É de propósito -- apontar uma fatia e ler a linha dela na
 * tabela têm que responder a mesma coisa, senão o painel fala com duas vozes.
 *
 * Existe porque o padrão do Recharts escrevia "Facebook Ads : 42" numa linha
 * corrida, e estes anéis eram os últimos gráficos daqui ainda naquele formato.
 */
function TooltipDaFatia({
  active,
  payload,
  rotuloValor,
  rotulosExtras,
  formatarValor,
  soma,
}: {
  active?: boolean;
  payload?: { payload: FatiaDonut }[];
  rotuloValor?: string;
  rotulosExtras?: string[];
  formatarValor?: (v: number) => string;
  soma?: number;
}) {
  const f = payload?.[0]?.payload;
  if (!active || !f) return null;

  const linhas: LinhaTooltip[] = [
    {
      // Sem colunas nomeadas o painel não deu nome à grandeza, e "Total" é o
      // rótulo honesto para "o que este anel reparte".
      rotulo: rotuloValor ?? "Total",
      valor: formatarValor ? formatarValor(f.valor) : String(f.valor),
      destaque: true,
    },
    ...(rotulosExtras ?? []).map((r, i) => ({ rotulo: r, valor: f.extras?.[i] ?? "—" })),
  ];

  // A fatia do total só entra quando não há colunas extras. Com elas, o painel
  // já escolheu que números quer ao lado do valor, e um deles costuma ser
  // justamente a porcentagem -- repetir daria duas linhas iguais.
  if (!rotulosExtras?.length) {
    linhas.push({
      rotulo: "% do total",
      valor: soma && soma > 0 ? `${Math.round((f.valor / soma) * 100)}%` : "—",
    });
  }

  return <CaixaTooltip titulo={f.nome} cor={f.cor} linhas={linhas} />;
}

/**
 * Um anel com o número no furo.
 *
 * Está fora do componente principal porque o painel de perdas desenha dois lado
 * a lado (a mesma grandeza repartida por dois critérios). Inline, o segundo
 * exigiria copiar quarenta linhas de Recharts, e as duas cópias divergiriam na
 * primeira vez que alguém mexesse num raio.
 *
 * Exportado porque painéis fora deste arquivo desenham o mesmo anel sem a
 * tabela ao lado. É a espessura que obriga: os anéis do dashboard ficam na
 * mesma linha, e uma faixa mais grossa que a vizinha lê como erro de
 * renderização, não como distinção. Uma cópia solta divergiria no primeiro
 * ajuste de raio.
 */
export function Anel({
  fatias, vazio, altura, textoCentro, rotuloCentro,
  tituloDoRotulo, selecionada, onSelecionar, rodape,
  conteudoTooltip, onPassarMouse,
}: AnelProps) {
  const dados = vazio ? ANEL_VAZIO : fatias;
  const clicavel = !vazio && !!onSelecionar;

  // Corpo do número central. Duas variáveis o encolhem:
  //
  // 1. Texto longo. Dinheiro formatado não cabe no furo no corpo cheio, e o
  //    limite de 7 caracteres é onde "R$ 1.200" ainda entra e "R$ 12.000,00"
  //    não.
  // 2. Etiqueta presente. Com "POR ORIGEM" no topo, o furo divide o espaço com
  //    mais uma linha, e o número precisa ceder para as três caberem.
  const longo = textoCentro.length > 7;
  const corpoCentro = rodape
    ? (longo ? "text-[13px]" : "text-[19px]")
    : (longo ? "text-[15px]" : "text-[26px]");


  return (
    <div className="shrink-0 mx-auto sm:mx-0">
      <div className="relative" style={{ height: altura, width: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              /* Mesma espessura em todos os painéis: eles ficam lado a lado na
                 mesma linha, e faixas de larguras diferentes leem como erro de
                 renderização, não como distinção intencional. */
              innerRadius="62%"
              outerRadius="88%"
              /* Respiro entre fatias: sem ele, duas cores próximas viram um
                 bloco só e some a fronteira entre elas. */
              paddingAngle={vazio ? 0 : 2}
              stroke="none"
              isAnimationActive={false}
              // Anel vazio não seleciona nada: não há fatia por trás dele.
              onClick={clicavel ? (_, i) => onSelecionar(fatias[i].nome) : undefined}
              // Anel vazio não avisa hover: a única fatia ali é o cinza falso.
              onMouseEnter={!vazio && onPassarMouse ? (_, i) => onPassarMouse(fatias[i].nome) : undefined}
              onMouseLeave={!vazio && onPassarMouse ? () => onPassarMouse(null) : undefined}
              className={clicavel ? "cursor-pointer" : undefined}
            >
              {dados.map(f => (
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
            {/* zIndex no wrapper porque o número do furo é desenhado DEPOIS do
                gráfico (é a div de centro logo abaixo) e, empatados em camada,
                quem vem depois no DOM ganha. O tooltip passava por baixo do
                total e do rótulo, e as duas camadas de texto se embaralhavam.
                10 é o suficiente para vencer o centro e continuar bem abaixo da
                sidebar (30) e do overlay de diálogo (50). */}
            {!vazio && <Tooltip contentStyle={tooltip} content={conteudoTooltip} wrapperStyle={{ zIndex: 10 }} />}
          </PieChart>
        </ResponsiveContainer>

        {/* Centro em HTML, não em <text> do SVG: o texto fica com o mesmo
            antialiasing do resto da página e acompanha os tokens de cor.
            pointer-events-none para não roubar o hover das fatias. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-5">
          {rodape && (
            <span className="text-[10px] text-muted-foreground mb-1 text-center truncate max-w-full">
              {rodape}
            </span>
          )}
          <span className={`${corpoCentro} leading-none font-bold text-foreground tabular-nums text-center`}>{textoCentro}</span>
          {/* Com fatia em foco o rótulo vira o nome dela, então o centro sempre
              diz de que aquele número é. Truncado porque nome de origem e de
              motivo de perda são livres e podem ser longos. */}
          <span
            className="text-[11px] text-muted-foreground mt-1 text-center truncate max-w-full"
            title={tituloDoRotulo}
          >
            {rotuloCentro}
          </span>
        </div>
      </div>
    </div>
  );
}

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
   * Colunas extras da legenda, já formatadas (ex.: "12%" de conversão), na
   * mesma ordem dos títulos em `colunas.extras`.
   *
   * Chegam prontas como texto, e não como número, porque são grandezas de outra
   * natureza: o `valor` é o que a rosquinha reparte, e estas não. Deixar o
   * componente formatá-las abriria a porta para ele somar as duas coisas.
   *
   * Lista, e não um campo só, porque um painel pode precisar de mais de um
   * número por linha -- resultado por responsável mostra ganhos no anel e ainda
   * perdidos e negócios ao lado.
   */
  extras?: string[];
  /**
   * Quebra da fatia, mostrada como sub-linhas recuadas sob ela na legenda.
   *
   * Não entra no anel de propósito: o anel reparte UMA grandeza, e desenhar a
   * fatia e a sub-fatia no mesmo círculo faria as duas competirem pelo mesmo
   * 100%. Aqui a leitura é de dois níveis: o anel responde "onde", a sub-linha
   * responde "por quê", e cada uma vive no lugar onde se lê melhor.
   */
  detalhes?: {
    nome: string;
    valor: number;
    extras?: string[];
    /**
     * Obrigatória na prática quando há `anelSecundario`.
     *
     * A cor de reserva é atribuída pela POSIÇÃO na lista, e a posição de um
     * motivo muda entre o agregado e o recorte de uma origem. Sem cor fixa por
     * nome, "Preço alto" sairia verde num anel e roxo no outro, e o clique
     * pareceria trocar os dados em vez de filtrá-los.
     */
    cor?: string;
  }[];
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
   * Gráfico em cima, legenda embaixo, em qualquer largura de tela.
   *
   * Existe para colunas estreitas. O anel tem largura fixa e a legenda tem duas
   * colunas de número de largura fixa (92px e 76px); lado a lado, abaixo de uns
   * 350px, sobra tão pouco para o nome que "Facebook Ads" vira três letras.
   * Empilhado, a legenda recebe a largura inteira da coluna e os nomes cabem.
   *
   * É prop, e não breakpoint, porque o que decide aqui é a largura do PAINEL,
   * não a da janela: o mesmo componente pode estar num painel de 1/3 e noutro
   * de largura cheia na mesma tela, e `lg:` não sabe distinguir os dois.
   */
  empilhado?: boolean;
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
   * Com `extras` nomeadas, aquela porcentagem cede lugar ao dado de cada fatia:
   * a proporção continua legível no próprio anel, então repeti-la em texto
   * gastaria a coluna à toa.
   */
  colunas?: { valor: string; extras?: string[] };
  /**
   * Segundo anel ao lado do primeiro, sem legenda própria.
   *
   * Para a mesma grandeza repartida por dois critérios: o de perdas mostra as
   * mesmas perdas por origem e por motivo. Os dois somam o mesmo total, e é
   * justamente por isso que ficam lado a lado -- a comparação entre os dois
   * recortes é a informação.
   *
   * Sem legenda porque a tabela embaixo já é de dois níveis e cobre os dois.
   *
   * Segue a seleção do primeiro: com uma fatia em foco, este anel passa a
   * mostrar os `detalhes` dela ("por que perdemos NO Facebook Ads"). Sem foco,
   * mostra o agregado que vem em `dados`.
   */
  anelSecundario?: { dados: FatiaDonut[]; rodape: string };
  /** Legenda curta sob o primeiro anel. Só usada junto com `anelSecundario`. */
  rodape?: string;
}

export function DonutDistribuicao({
  dados, rotuloCentro, total, altura = 190, inverso, empilhado,
  formatarValor, colunas, anelSecundario, rodape,
}: Props) {
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

  /** Fatia em foco. null = mostrando o total. */
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const emFoco = fatias.find(f => f.nome === selecionada) ?? null;

  /**
   * Detalhe em foco, dentro da fatia selecionada. Segundo nível de seleção.
   *
   * Trocar de fatia zera este: os detalhes são de UMA fatia, e "Preço alto"
   * escolhido no Facebook Ads não significa nada no Instagram. Sem zerar, a
   * seleção sobreviveria a uma troca de origem e o anel destacaria um motivo
   * que o usuário não escolheu ali.
   */
  const [detalheSelecionado, setDetalheSelecionado] = useState<string | null>(null);

  // Clicar de novo na mesma fatia volta ao total, então o gráfico nunca fica
  // preso num filtro que o usuário não sabe como desfazer.
  const alternar = (nome: string) => {
    setSelecionada(atual => (atual === nome ? null : nome));
    setDetalheSelecionado(null);
  };
  const alternarDetalhe = (nome: string) =>
    setDetalheSelecionado(atual => (atual === nome ? null : nome));

  // Com fatia em foco o centro passa a mostrar aquela fatia; sem foco, o total.
  const valorCentro = emFoco ? emFoco.valor : (total ?? soma);
  const textoCentro = formatarValor ? formatarValor(valorCentro) : String(valorCentro);
  const rotuloExibido = emFoco ? emFoco.nome : rotuloCentro;

  /**
   * Segundo anel: os `detalhes` da fatia em foco, ou o agregado quando não há
   * foco.
   *
   * É o que amarra os dois anéis. Clicar em "Facebook Ads" no primeiro troca o
   * segundo de "por que perdemos" para "por que perdemos NO Facebook Ads" --
   * duas perguntas que, separadas em dois painéis, ninguém cruzaria.
   *
   * Só troca se a fatia tiver `detalhes`; sem eles o agregado fica, em vez de
   * o anel esvaziar sem explicação.
   */
  const detalhesEmFoco = emFoco?.detalhes?.length ? emFoco.detalhes : null;
  const dadosSecundarios = detalhesEmFoco ?? anelSecundario?.dados ?? [];
  const somaSecundaria = dadosSecundarios.reduce((s, d) => s + d.valor, 0);
  const fatiasSecundarias = dadosSecundarios.map((d, i) => ({
    ...d,
    cor: d.cor ?? PALETA[i % PALETA.length],
  }));
  const vazioSecundario = fatiasSecundarias.length === 0 || somaSecundaria === 0;

  // Três níveis para o número do segundo anel, do mais específico ao mais geral:
  // o detalhe escolhido, a soma da origem escolhida, ou o total.
  //
  // O `total` do primeiro anel só vale no caso geral: ele existe para cobrir
  // listas cortadas no top N, e dentro de uma origem esse corte não se aplica.
  const detalheEmFoco = fatiasSecundarias.find(f => f.nome === detalheSelecionado) ?? null;
  const valorCentroSecundario = detalheEmFoco
    ? detalheEmFoco.valor
    : detalhesEmFoco ? somaSecundaria : (total ?? somaSecundaria);
  const textoCentroSecundario = formatarValor
    ? formatarValor(valorCentroSecundario)
    : String(valorCentroSecundario);
  // O rótulo não muda com o filtro: ele diz a natureza do número ("perdidos"),
  // e isso continua verdade no recorte de uma origem. Quem informa o recorte é
  // a etiqueta no topo do furo e a origem já selecionada no anel ao lado; trocar
  // o rótulo por "em Facebook Ads" repetia essa informação e ainda tirava da
  // tela a única palavra que dizia do que aquele número é contagem.

  return (
    // Gráfico e legenda lado a lado. O donut ganha largura fixa (quadrado) e não
    // encolhe; a legenda toma o resto e trunca nomes longos.
    //
    // Empilha em telas estreitas: com o painel ocupando a largura toda no
    // celular, 190px de donut deixariam pouco para o nome da origem, e "Facebook
    // Ads" viraria reticências. Com `empilhado`, empilha em qualquer largura.
    <div
      className={
        empilhado
          ? "flex flex-col items-center gap-4"
          : `flex flex-col sm:items-center gap-4 sm:gap-5 ${inverso ? "sm:flex-row-reverse" : "sm:flex-row"}`
      }
    >
      {/* Os dois anéis numa fileira só quando há segundo. Sem ele, o Fragment
          entrega o anel direto e o layout externo continua igual ao de antes. */}
      <div className={anelSecundario ? "flex items-start justify-center gap-6" : "contents"}>
        <Anel
          fatias={fatias}
          vazio={vazio}
          altura={altura}
          textoCentro={textoCentro}
          rotuloCentro={rotuloExibido}
          tituloDoRotulo={emFoco?.nome}
          selecionada={selecionada}
          onSelecionar={alternar}
          rodape={anelSecundario ? rodape : undefined}
          conteudoTooltip={
            <TooltipDaFatia
              rotuloValor={colunas?.valor}
              rotulosExtras={colunas?.extras}
              formatarValor={formatarValor}
              soma={soma}
            />
          }
        />

        {anelSecundario && (
          <Anel
            // Clicável nos dois estados: com origem selecionada, escolhe um
            // motivo dela; sem, escolhe um motivo do agregado. É o mesmo gesto
            // do anel ao lado, e negá-lo aqui faria o segundo parecer decoração.
            selecionada={detalheSelecionado}
            onSelecionar={alternarDetalhe}
            fatias={fatiasSecundarias}
            vazio={vazioSecundario}
            altura={altura}
            textoCentro={textoCentroSecundario}
            rotuloCentro={rotuloCentro}
            rodape={anelSecundario.rodape}
            // `somaSecundaria`, e não `soma`: este anel reparte outro conjunto
            // (os motivos, ou os motivos de UMA origem), e usar o total do
            // primeiro faria as porcentagens daqui não fecharem em 100%.
            conteudoTooltip={
              <TooltipDaFatia
                rotuloValor={colunas?.valor}
                rotulosExtras={colunas?.extras}
                formatarValor={formatarValor}
                soma={somaSecundaria}
              />
            }
          />
        )}
      </div>

      {/* Legenda com valor alinhado à direita. Uma fatia por linha: nomes de
          motivo de perda e de origem são livres e podem ser longos, e lado a
          lado eles se atropelariam. */}
      {/* Tabela de verdade, e não divs em flex.
          A régua vertical entre as colunas é o motivo: `border-l` num <span>
          dentro de flex só desenha na altura do texto, então a linha saía
          picotada a cada fatia. Numa <td> a borda cobre a altura inteira da
          célula, padding incluído, e a régua fica contínua de ponta a ponta. */}
      {/* `w-full` quando empilhado: em coluna, `flex-1` cresceria na vertical e
          deixaria a tabela com a largura do próprio conteúdo, desalinhada do
          resto do painel. */}
      <div className={empilhado ? "w-full min-w-0" : "flex-1 min-w-0"}>
        {/* Sem dado, a tabela dá lugar a uma frase. O cabeçalho de colunas
            pendurado sobre nenhuma linha pareceria carregamento travado.

            O corte é "nenhuma fatia", e não `vazio`: uma lista com todos os
            valores em zero tem o que dizer nas colunas extras. Um responsável
            sem nenhuma venda no período pode ter dez perdas, e trocar a tabela
            por "sem dados" esconderia justamente o número que explica o zero. */}
        {fatias.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados no período.</p>
        ) : (
        <table className="w-full text-xs">
          {colunas && (
            <thead>
              <tr className="border-b border-card-border text-[10px] uppercase tracking-wide text-foreground">
                <th className="font-semibold pb-1.5 text-left" />
                <th className={`font-semibold pb-1.5 ${COL_VALOR}`}>{colunas.valor}</th>
                {colunas.extras?.map(t => (
                  <th key={t} className={`font-semibold pb-1.5 ${COL_EXTRA}`}>{t}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {/* A linha seleciona a mesma fatia que o anel. É o alvo de clique
                confortável: a fatia do anel pode ser um sliver de 1%, que
                ninguém acerta. */}
            {fatias.map(f => {
              const ativa = selecionada === f.nome;
              const apagada = selecionada && !ativa;
              return (
                <Fragment key={f.nome}>
                <tr
                  onClick={() => alternar(f.nome)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={ativa}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(f.nome); } }}
                  className={`cursor-pointer transition-colors ${
                    ativa ? "bg-muted" : "hover:bg-muted/50"
                  } ${apagada ? "opacity-50" : ""}`}
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
                  {colunas?.extras?.map((t, i) => (
                    <td key={t} className={`py-1.5 text-muted-foreground tabular-nums ${COL_EXTRA}`}>
                      {f.extras?.[i] ?? "—"}
                    </td>
                  ))}
                </tr>

                {/* Quebra da fatia, só com a fatia selecionada. Todas abertas de
                    uma vez, a tabela virava um paredão de trinta linhas onde a
                    origem (que é o que o anel reparte) se perdia no meio dos
                    motivos. Fechadas, a tabela lista origens, e abrir uma é a
                    pergunta seguinte -- "por que perdemos NESTA".

                    Recuo alinhado com a bolinha de cor da linha de cima, para a
                    sub-linha ler como filha dela e não como fatia nova. Corpo e
                    cor menores pelo mesmo motivo.

                    Clicável quando há segundo anel: aí a sub-linha TEM fatia
                    onde se destacar. Sem ele o clique não teria para onde
                    apontar, e um alvo que não responde é pior que nenhum. */}
                {ativa && f.detalhes?.map(d => {
                  const detalheAtivo = detalheSelecionado === d.nome;
                  const selecionavel = !!anelSecundario;
                  return (
                  <tr
                    key={`${f.nome}-${d.nome}`}
                    onClick={selecionavel ? () => alternarDetalhe(d.nome) : undefined}
                    role={selecionavel ? "button" : undefined}
                    tabIndex={selecionavel ? 0 : undefined}
                    aria-pressed={selecionavel ? detalheAtivo : undefined}
                    onKeyDown={selecionavel
                      ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternarDetalhe(d.nome); } }
                      : undefined}
                    className={!selecionavel ? "" : `cursor-pointer transition-colors ${
                      detalheAtivo ? "bg-muted" : "hover:bg-muted/50"
                    } ${detalheSelecionado && !detalheAtivo ? "opacity-50" : ""}`}
                  >
                    <td className="py-1 pr-2 pl-4">
                      <span className="flex items-center gap-2 min-w-0">
                        {/* Bolinha menor que a da origem, e só quando há anel:
                            é ela que diz qual fatia é qual. Sem anel, seria
                            enfeite marcando uma cor que não aparece em lugar
                            nenhum. */}
                        {selecionavel && (
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: d.cor }} />
                        )}
                        <span className={`truncate text-[11px] text-muted-foreground ${detalheAtivo ? "font-semibold" : ""}`}>
                          {d.nome}
                        </span>
                      </span>
                    </td>
                    <td className={`py-1 text-[11px] text-muted-foreground tabular-nums ${COL_VALOR}`}>
                      {formatarValor ? formatarValor(d.valor) : d.valor}
                    </td>
                    {colunas?.extras?.map((t, i) => (
                      <td key={t} className={`py-1 text-[11px] text-muted-foreground tabular-nums ${COL_EXTRA}`}>
                        {d.extras?.[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                  );
                })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
