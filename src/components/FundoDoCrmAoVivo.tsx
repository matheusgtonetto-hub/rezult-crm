import { AppSidebar } from "@/components/AppSidebar";
import InicioPage from "@/pages/InicioPage";

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
 * descendentes fixos -- o mesmo desfoque que embaça o fundo é o que o prende
 * aqui dentro.
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

export function FundoDoCrmAoVivo() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* -8px com 16px a mais de tamanho: joga para fora da janela a faixa que
          o desfoque desbota nas bordas, onde o conteúdo encontra o nada. */}
      <div
        className="absolute flex"
        style={{
          top: -8,
          left: -8,
          width: "calc(100% + 16px)",
          height: "calc(100% + 16px)",
          filter: "blur(3px)",
        }}
      >
        <AppSidebar />
        <main
          className="flex-1 min-w-0 overflow-hidden"
          style={{ marginLeft: 52, background: "hsl(var(--background))" }}
        >
          <InicioPage />
        </main>
      </div>

      <div className="absolute inset-0" style={{ background: `hsl(${VEU_COR} / ${VEU_FORCA})` }} />
    </div>
  );
}
