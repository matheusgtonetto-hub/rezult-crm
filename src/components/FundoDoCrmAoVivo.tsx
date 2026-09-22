import { AppSidebar } from "@/components/AppSidebar";
import { BarraSuperior } from "@/components/BarraSuperior";
import InicioPage from "@/pages/InicioPage";
import { lerBarraRecolhida, larguraDaBarra } from "@/lib/barraLateral";

/**
 * O CRM de verdade, desfocado, atrás da tela de escolha de plano.
 *
 * Difere de `FundoDoCrm`, usado no cadastro da empresa, e a diferença é o
 * momento: lá a empresa ainda não existe, então o fundo precisa ser uma
 * réplica desenhada ou um print. Aqui a conta acabou de ser criada, e o que
 * aparece atrás é a conta da própria pessoa -- com o nome da empresa dela na
 * barra lateral e na saudação, e a trilha de missões toda por fazer.
 *
 * É essa diferença que muda o recado: no cadastro o fundo dizia "existe um
 * produto do outro lado"; aqui ele diz "sua conta está pronta, falta escolher
 * como continuar".
 *
 * A `AppSidebar` é `position: fixed`, e normalmente escaparia deste contêiner
 * para cobrir a tela inteira por cima do cartão. Não escapa porque o `filter`
 * do bloco de cima transforma esse elemento em bloco de contenção para
 * descendentes fixos -- é o `filter` que a prende aqui dentro, e por isso ele
 * segue declarado mesmo quando o desfoque está em 0.
 *
 * A contenção vale para a POSIÇÃO, não para as medidas em unidade de janela: o
 * `height: 100vh` da barra continua lendo a janela inteira. É o que obriga este
 * bloco a começar em `top: 0` -- ver o comentário na sangria, abaixo.
 *
 * `InicioPage` e não `PipelinePage`: as duas renderizam bem, mas a de pipeline
 * carrega contexto de arrastar-e-soltar e assinaturas de tempo real, coisas
 * que não valem a pena montar para algo que a pessoa não vai tocar. Início é
 * leitura pura, e ainda por cima é a tela para onde a pessoa vai quando sair
 * daqui.
 *
 * Decorativo do começo ao fim: `aria-hidden` para o leitor de tela pular, e
 * `pointer-events-none` para nenhum clique parar aqui em vez de no cartão.
 */

/** Cor e força do véu, mesmos valores do fundo usado no cadastro. */
const VEU_COR = "var(--background)";
const VEU_FORCA = 0.62;
/**
 * Desfoque do CRM atrás do cartão. Em 0 para avaliar a tela com o fundo nítido;
 * era 3px, e voltar é trocar este número.
 *
 * O `filter` continua declarado mesmo em 0, e isso NÃO é sobra: é ele que
 * prende a barra lateral aqui dentro. Ver a explicação no bloco abaixo -- com
 * `filter: none` a barra escapa e cobre a tela por cima do cartão.
 */
const DESFOQUE_DO_FUNDO = 0;

export function FundoDoCrmAoVivo() {
  const barraRecolhida = lerBarraRecolhida();
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Sangra 8px só para a DIREITA e para BAIXO, e nunca para cima ou para a
          esquerda. A sangria existe para jogar fora da janela a faixa que o
          desfoque desbota nas bordas, mas ela custa caro em duas das quatro.

          O motivo é a barra lateral. Ela é `position: fixed` em `top: 0`,
          `left: 0`, com a largura de `--barra-largura` e `height: 100vh`. O `filter` daqui faz
          este bloco virar o bloco de contenção dela, então a POSIÇÃO dela passa
          a contar a partir daqui -- mas as medidas em unidade de janela, como o
          `100vh`, continuam lendo a janela. Sangrar por cima ou pela esquerda
          empurra a barra para fora sem que ela cresça junto, e a parte que sai
          é recortada pela janela:

            top: -8  -> a barra nasce 8px acima, o topo dela some e sobra uma
                        faixa nua de 8px no rodapé
            left: -8 -> a barra nasce 8px à esquerda, aparece 8px mais estreita
                        e fica visivelmente mais fina que a de verdade

          Direita e baixo não têm nada ancorado, então ali a sangria é de graça.

          O preço é o desfoque desbotar nas bordas de cima e da esquerda. É onde
          o véu já cobre, e é bem menos visível que uma barra lateral torta. */}
      <div
        /* Coluna: a barra superior ocupa a largura toda e a lateral fica
           abaixo dela, como no app. Era `flex` em linha, de quando a superior
           morava dentro do `main`. */
        className="absolute flex flex-col"
        style={{
          top: 0,
          left: 0,
          width: "calc(100% + 8px)",
          height: "calc(100% + 8px)",
          filter: `blur(${DESFOQUE_DO_FUNDO}px)`,
          /* Fora do AppLayout a variável de largura não existe, e a barra
             sairia com largura zero. A réplica usa o estado que a pessoa deixou
             no app, para o fundo parecer o CRM dela. */
          ["--barra-largura" as string]: larguraDaBarra(barraRecolhida),
        }}
      >
        {/* A mesma ordem do app: barra superior por cima de tudo, lateral
            embaixo dela. Réplica decorativa, então a superior vai sem o botão
            de recolher -- aqui ele não teria o que fazer. */}
        <BarraSuperior recolhida={barraRecolhida} />
        <div className="flex-1 min-h-0 flex">
        <AppSidebar recolhida={barraRecolhida} aoAlternar={() => {}} />
        {/* A mesma pilha do `AppLayout`: barra superior no topo, conteúdo
            embaixo. Sem isso a réplica mostraria um CRM que não existe -- a
            pessoa vê as duas barras em todas as telas depois daqui.

            O canto arredondado da junta saiu junto com o do app, em
            22/09/2026: as barras passaram a ser separadas, cada uma com a sua
            borda. */}
        <main
          className="flex-1 min-w-0 overflow-hidden flex flex-col"
          style={{ marginLeft: "var(--barra-largura)", background: "var(--surface-card)" }}
        >
          <div
            className="flex-1 min-h-0 overflow-hidden"
            style={{ background: "hsl(var(--background))" }}
          >
            <InicioPage />
          </div>
        </main>
        </div>
      </div>

      <div className="absolute inset-0" style={{ background: `hsl(${VEU_COR} / ${VEU_FORCA})` }} />
    </div>
  );
}
