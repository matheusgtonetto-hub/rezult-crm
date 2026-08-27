/**
 * Balão do passo a passo da tela de planos.
 *
 * É só a caixa: quem decide onde ela aparece e qual passo está no ar é a
 * SetupPage, que tem os elementos a apontar. Separar assim evita que este
 * componente precise medir posições de tela -- ele nasce dentro do elemento que
 * quer destacar e se posiciona em relação a ele, sem biblioteca e sem conta.
 *
 * Não tem botão de fechar. É decisão de produto: a sequência existe para
 * desarmar o medo de que os "7 dias grátis" fossem isca, e quem fecha no
 * primeiro clique fica exatamente com esse medo. O preço é que quem já conhece
 * o produto precisa passar pelos passos antes de escolher um plano.
 *
 * Sem bico apontando para o elemento destacado. Já teve um, e ele saiu: a
 * ligação com o alvo já vem de o balão nascer colado nele e de ser a única
 * coisa nítida da tela enquanto o resto desfoca. O bico só repetia isso, e
 * repetia mal -- um retângulo de cantos iguais lê como peça do sistema, um com
 * uma saliência num canto lê como enfeite.
 */

const VERDE = "#00E599";
const SOBRE_VERDE = "#04140D";
const SUPERFICIE = "#0C1115";
/** Um degrau acima do fundo do balão, para a barra de baixo se destacar. */
const SUPERFICIE_2 = "#151D22";
const BORDA = "rgba(0, 229, 153, 0.45)";
/**
 * Halo atrás do balão. Era verde e virou preto -- o brilho de marca passou para
 * o cartão, e repeti-lo aqui somaria dois verdes na mesma borda.
 *
 * Preto sobre o cartão preto não acende: ele ESCAVA. O balão passa a se
 * destacar por abrir um poço de sombra em volta de si em vez de por brilhar, e
 * isso só funciona porque o que está atrás dele é escuro sem ser preto puro.
 *
 * A consequência é que ele some contra fundo claro, se um dia o balão for parar
 * em outra tela. Aqui não é o caso: o cartão atrás é sempre escuro.
 *
 * O raio fica no `boxShadow`, lá embaixo.
 */
const HALO = "rgba(0, 0, 0, 0.70)";
/**
 * Tamanho base do balão. Vira número, e não classe do Tailwind, porque a `folga`
 * soma em cima destes valores -- classe com valor calculado em tempo de
 * execução não gera CSS, o Tailwind só enxerga o que está escrito no código.
 *
 * O respiro de baixo é maior que o de cima de propósito: o balão do passo 1
 * nasce preso pelo canto de cima, então altura a mais desce, longe do botão que
 * ele acompanha.
 */
const LARGURA = 335;
/** Respiro dos lados. */
const RESPIRO = 16;
const RESPIRO_INFERIOR = 47;
/** Respiro vertical da barra de baixo. */
const RESPIRO_DA_BARRA = 12;
/**
 * Moldura do "Voltar". Só o contorno, sem fundo: o botão fica com a silhueta de
 * uma pílula, do mesmo tamanho da do "Avançar", mas sem massa nenhuma.
 *
 * É o meio-termo entre as duas versões que ele já teve. Texto puro sumia demais
 * e não parecia clicável; branco chapado virava a peça mais clara da barra e
 * disputava com o verde. O contorno diz "sou um botão" sem gritar.
 */
const BORDA_SECUNDARIA = "rgba(255, 255, 255, 0.30)";
const BORDA_SECUNDARIA_ATIVA = "rgba(255, 255, 255, 0.55)";
const BORDA_INTERNA = "rgba(255, 255, 255, 0.08)";
const TEXTO_SUAVE = "#D1D1D1";
const TEXTO_FRACO = "rgba(244, 246, 244, 0.55)";

import type { ReactNode } from "react";

interface Props {
  passo: number;
  total: number;
  /**
   * Texto simples ou uma peça pronta. Texto ganha o estilo de título daqui; uma
   * peça (o selo da oferta, por exemplo) entra como está, com o visual dela.
   */
  titulo: ReactNode;
  /**
   * Nome do balão para leitor de tela. Existe separado porque `titulo` pode não
   * ser texto, e `aria-label` só aceita texto -- sem isto, o passo da oferta
   * anunciaria "[object Object]".
   */
  rotulo: string;
  /** Aceita nó, e não só texto: os passos destacam trechos com peso 500. */
  texto: ReactNode;
  aoAvancar: () => void;
  /**
   * Volta ao passo anterior. Opcional: sem função para voltar, o botão nem
   * aparece -- é o que resolve o primeiro passo, que não tem para onde voltar,
   * sem o componente precisar saber em que passo está.
   */
  aoVoltar?: () => void;
  /**
   * Quanto o balão cresce de cada lado, além do tamanho base. Só na
   * HORIZONTAL: a altura continua sendo a que o texto pedir.
   *
   * A razão é que as duas direções não custam o mesmo. Largura a mais dá
   * respiro e ainda encurta as linhas; altura a mais é vão vazio entre o texto
   * e a moldura, que só afasta o botão de quem ia clicar nele.
   *
   * Cresce em respiro interno, não em escala: a fonte e as distâncias entre os
   * elementos ficam iguais às do balão sem folga.
   */
  folga?: number;
  /**
   * Folga lateral da descrição E do filete acima dela, que formam um bloco só.
   * Quando não vem, os dois acompanham a `folga` e tudo dentro do balão fica na
   * mesma coluna.
   *
   * Existe para o passo da oferta, onde o título é o selo, uma peça de largura
   * própria: alinhar a descrição ao selo e não à moldura dá uma coluna de texto
   * mais larga sem que os dois pareçam desalinhados.
   */
  folgaDoTexto?: number;
  /**
   * Respiro acima do título. Sem valor, é o mesmo dos lados.
   *
   * É prop, e não constante, porque os dois balões pedem coisas diferentes: no
   * passo 1 o título é texto e o respiro dos lados basta; no 2 é o selo, uma
   * peça com fundo próprio, que precisa de mais ar acima para não parecer
   * encaixado na quina.
   */
  respiroSuperior?: number;
  /** Espaço do título até o filete. Mesmo motivo do `respiroSuperior`. */
  espacoAteOFilete?: number;
}

export function BalaoDoTour({
  passo,
  total,
  titulo,
  rotulo,
  texto,
  aoAvancar,
  aoVoltar,
  folga = 0,
  folgaDoTexto = folga,
  respiroSuperior = RESPIRO,
  espacoAteOFilete = 10,
}: Props) {
  return (
    <div
      role="dialog"
      aria-label={rotulo}
      // `overflow-hidden` para a barra de baixo respeitar os cantos
      // arredondados: sem ele, o fundo mais claro dela escaparia pelas quinas.
      className="rounded-[12px] overflow-hidden text-left"
      style={{
        width: LARGURA + folga * 2,
        background: SUPERFICIE,
        border: `1px solid ${BORDA}`,
        // Duas sombras pretas, com papéis diferentes. A primeira, deslocada
        // 8px, dá peso e descola o balão do cartão; a segunda, sem
        // deslocamento, escurece parelho nos quatro lados e recorta a silhueta.
        //
        // O deslocamento da primeira é 8px, e não os 24px que já teve. Numa
        // lista de box-shadow a PRIMEIRA é pintada por cima das seguintes, e
        // empurrada 24px para baixo ela cobria a segunda só na metade de baixo,
        // deixando o halo torto. Subir isto de novo traz a assimetria junto.
        boxShadow: `0 8px 70px rgba(0,0,0,0.5), 0 0 80px ${HALO}`,
      }}
    >
      {/* O balão nasce preso pelo canto superior direito, então crescer é de
          graça nas duas direções que interessam: largura a mais vai para a
          esquerda sozinha, e altura a mais desce. Por isso o respiro extra fica
          todo aqui embaixo, e nunca no `pt` -- crescer pelo topo empurraria o
          balão para dentro do botão que ele acompanha. */}
      {/* Só o respiro vertical mora aqui. O lateral desceu para cada filho,
          porque a descrição pode ter o seu próprio -- ver `folgaDoTexto`.

          A folga não entra na vertical: crescer para baixo é vão vazio entre o
          texto e a moldura, e só afasta o botão de quem ia clicar nele. */}
      <div style={{ paddingTop: respiroSuperior, paddingBottom: RESPIRO_INFERIOR }}>
        {/* Título no verde da marca, o mesmo do botão que o balão acompanha.
            Além de dar um pulo de hierarquia sobre a descrição em cinza, amarra
            os dois pela cor: lidos como a mesma coisa.

            O estilo só entra quando o título é TEXTO. Vindo pronto, ele entra
            como está -- o passo da oferta manda o próprio selo, que já traz
            fundo e tipografia dele. Envolver a peça num `h3` seria HTML
            inválido, porque título não comporta bloco dentro. */}
        {typeof titulo === "string" ? (
          // A caixa é decidida por CSS, e não escrevendo o texto já formatado na
          // origem: o `rotulo` que vai para o leitor de tela sai da mesma
          // frase, e ela precisa continuar sendo uma frase normal lá.
          //
          // `capitalize` só levanta a primeira letra de cada palavra e deixa o
          // resto como está -- por isso a frase é escrita em minúsculas na
          // origem, senão sobrariam maiúsculas no meio das palavras.
          //
          // Sem respiro extra entre letras: ele existia para a caixa alta, onde
          // as formas têm todas o mesmo tamanho e se encostam. Em caixa de
          // título as maiúsculas e minúsculas já se distinguem sozinhas.
          <h3
            className="text-[20px] font-bold capitalize"
            style={{ color: VERDE, marginLeft: RESPIRO + folga, marginRight: RESPIRO + folga }}
          >
            {titulo}
          </h3>
        ) : (
          <div style={{ marginLeft: RESPIRO + folga, marginRight: RESPIRO + folga }}>{titulo}</div>
        )}

        {/* Filete separando título de descrição. Fica DENTRO do `px-4` do
            bloco, então nasce recuado das bordas do balão sem precisar de
            margem própria -- encostado nelas viraria uma segunda borda em vez
            de uma divisão de conteúdo.

            Mesma cor do filete da barra de baixo: são as duas divisões internas
            do balão, e usar tons diferentes daria a entender que separam coisas
            de peso diferente. */}
        <div
          className="h-px"
          style={{
            // Abaixo da linha o espaço é fixo e menor que o de cima, porque a
            // linha e o texto que ela apresenta são o mesmo bloco. Espaço igual
            // dos dois lados faria a linha parecer solta em vez de dividir
            // duas partes.
            marginTop: espacoAteOFilete,
            marginBottom: 10,
            // Alinha pela descrição, e não pelo título: a linha existe para
            // apresentar o texto que vem abaixo dela, então pertence àquele
            // bloco. Alinhada ao título, ela pareceria fechar o título em vez
            // de abrir a descrição.
            marginLeft: RESPIRO + folgaDoTexto,
            marginRight: RESPIRO + folgaDoTexto,
            background: BORDA_INTERNA,
          }}
        />

        <p
          className="text-[15px] leading-[1.5]"
          style={{
            color: TEXTO_SUAVE,
            marginLeft: RESPIRO + folgaDoTexto,
            marginRight: RESPIRO + folgaDoTexto,
          }}
        >
          {texto}
        </p>
      </div>

      {/* Barra de confirmação: fundo um degrau mais claro e um filete no topo.
          O contraste separa "o que estou lendo" de "o que faço agora", e é o
          que faz a linha ler como rodapé de ação em vez de mais um parágrafo. */}
      <div
        className="flex items-center justify-between gap-3"
        style={{
          // A folga entra só nos lados aqui também. O respiro vertical da barra
          // é o mesmo dos dois balões.
          padding: `${RESPIRO_DA_BARRA}px ${RESPIRO + folga}px`,
          background: SUPERFICIE_2,
          borderTop: `1px solid ${BORDA_INTERNA}`,
        }}
      >
        <span className="text-[11px] font-normal shrink-0" style={{ color: TEXTO_FRACO }}>
          Etapa {passo} de {total}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {/* Voltar tem fundo, mas claro e translúcido, enquanto Avançar é a
              única pílula acesa. Os dois são pílulas agora, e a hierarquia
              passou a vir da cor: verde chapado convida, cinza translúcido só
              se oferece. Com o mesmo peso nos dois, a pessoa pararia para
              escolher entre eles em vez de seguir.

              Só existe quando há para onde voltar -- ver `aoVoltar`. */}
          {aoVoltar && (
            <button
              type="button"
              onClick={aoVoltar}
              className="rounded-full px-3 py-[6px] text-[12px] font-medium transition-colors"
              style={{ border: `1px solid ${BORDA_SECUNDARIA}`, color: TEXTO_SUAVE }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = BORDA_SECUNDARIA_ATIVA; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDA_SECUNDARIA; }}
            >
              Voltar
            </button>
          )}
          <button
            type="button"
            onClick={aoAvancar}
            className="rounded-full px-4 py-[6px] text-[12px] font-semibold transition-transform hover:-translate-y-[1px]"
            style={{ background: VERDE, color: SOBRE_VERDE }}
          >
            Avançar
          </button>
        </div>
      </div>
    </div>
  );
}
