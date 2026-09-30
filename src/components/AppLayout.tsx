import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppSidebar";
import { BarraSuperior } from "@/components/BarraSuperior";
import { lerBarraRecolhida, gravarBarraRecolhida, larguraDaBarra } from "@/lib/barraLateral";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { FreePlanBanner, BANNER_HEIGHT } from "@/components/FreePlanBanner";
import { PlanLimitModal } from "@/components/PlanLimitModal";
import { BillingBlockedModal } from "@/components/BillingBlockedModal";
import { OfertaDeContratacao } from "@/components/OfertaDeContratacao";
import { useTelaDeCelular, aplicarViewport, VIEWPORT_DO_APP, VIEWPORT_DE_CELULAR } from "@/lib/telaDeCelular";

// Routes where the user is actively completing onboarding — no redirect needed
const ONBOARDING_PATHS = ["/company-register", "/setup"];


/**
 * O piso de largura do conteúdo, em pixels.
 *
 * Mil porque é o que a tela mais apertada exige: o Multiatendimento tem
 * 350px de lista + 350px de perfil do lead, e o chat entre os dois precisa de
 * uns 300 para uma mensagem não virar uma palavra por linha.
 *
 * Não é um número de estilo, é um limite físico: abaixo dele as colunas se
 * sobrepõem. Por isso vale para TODAS as telas, e não só para as de três
 * colunas -- um piso único é o que torna previsível o que acontece ao estreitar
 * a janela.
 *
 * Confira antes de subir: num notebook de 1280px com a barra lateral aberta
 * (248px) sobram 1032px de conteúdo. Passar de mil faria esse notebook ganhar
 * rolagem horizontal em toda tela, que é o oposto do que se quer.
 *
 * O `width=1100` do viewport, no index.html, deriva deste número. Os dois
 * andam juntos.
 */
const LARGURA_MINIMA_DO_APP = 1000;

/**
 * As rotas que têm layout PRÓPRIO de celular.
 *
 * Nelas o app abre mão do truque do viewport de 1100px: a página volta a se
 * medir pela largura real do aparelho, e o piso de 1000px sai do caminho --
 * senão a tela de uma coluna nasceria com rolagem horizontal, que é o oposto do
 * que ela existe para resolver.
 *
 * É uma lista, e não um `if` no meio do componente, porque ela vai crescer: o
 * Multiatendimento foi a primeira porque é onde o celular é usado de verdade
 * (vendedor atendendo WhatsApp na rua). Leads e Pipeline são as candidatas
 * seguintes.
 */
const ROTAS_COM_LAYOUT_DE_CELULAR = ["/multiatendimento"];

export default function AppLayout() {
  const { crmLoading }                                                    = useCRM();
  const { company, companyLoading, isFreePlan, billingBlocked, motivoDoBloqueio, isTrialing } = useCompany();
  const navigate                                                          = useNavigate();
  const { pathname }                                                      = useLocation();
  const telaDeCelular = useTelaDeCelular();
  /**
   * A tela atual se vira sozinha num celular?
   *
   * Duas condições, não uma: é preciso SER um celular e estar numa rota
   * preparada. Num computador nada disto liga, e numa rota sem layout próprio o
   * celular continua recebendo a versão de desktop reduzida, que é melhor que
   * uma tela de desktop espremida em 390px.
   */
  const emModoCelular = telaDeCelular && ROTAS_COM_LAYOUT_DE_CELULAR.some(r => pathname.startsWith(r));

  /**
   * A gaveta do menu, só no modo celular.
   *
   * Fecha sozinha ao trocar de rota: tocar num item e ficar com a gaveta aberta
   * por cima da tela nova é o defeito clássico deste padrão.
   */
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => { setMenuAberto(false); }, [pathname]);
  const [planLimitResource, setPlanLimitResource] = useState<string | null>(null);
  const [billingBlockedOpen, setBillingBlockedOpen] = useState(false);
  /** Cartão de planos aberto a pedido da tarja, sem ação barrada por trás. */
  const [ofertaAberta, setOfertaAberta] = useState(false);
  const [barraRecolhida, setBarraRecolhida] = useState(lerBarraRecolhida);
  const alternarBarra = () =>
    setBarraRecolhida(v => {
      gravarBarraRecolhida(!v);
      return !v;
    });

  useEffect(() => {
    const handler = (e: Event) => {
      const resource = (e as CustomEvent<{ resource: string }>).detail.resource;
      setPlanLimitResource(resource);
    };
    window.addEventListener("plan-limit-reached", handler);
    return () => window.removeEventListener("plan-limit-reached", handler);
  }, []);

  /**
   * Ação barrada numa conta em somente leitura.
   *
   * Quem foi barrado pelo fim do teste ganha um aviso junto com o cartão de
   * planos. Sem ele, a pessoa clica em "Novo lead" e recebe uma tabela de preços
   * sem nenhuma frase dizendo por quê -- e, principalmente, sem a informação que
   * mais importa naquele instante: os dados continuam lá.
   *
   * Aviso flutuante, e não uma linha dentro do cartão, porque a pergunta que ele
   * responde ("por que isto abriu?") é do MOMENTO, e não do cartão. Uma linha
   * fixa ali continuaria aparecendo quando o mesmo cartão fosse aberto pelo
   * botão Upgrade, onde ninguém foi barrado de nada.
   *
   * O caso de cobrança recusada não recebe aviso: ele abre o
   * `BillingBlockedModal`, que já explica tudo com texto próprio.
   *
   * `motivoDoBloqueio` entra nas dependências porque o ouvinte LÊ o valor. Com a
   * lista vazia, ele ficaria preso ao motivo do primeiro render -- que é `null`
   * enquanto a empresa ainda está carregando, e nunca dispararia o aviso.
   */
  useEffect(() => {
    const handler = () => {
      setBillingBlockedOpen(true);
      if (motivoDoBloqueio === "teste") {
        toast("Seu teste grátis terminou", {
          description: "Seus dados continuam aqui. Escolha um plano para voltar a cadastrar e editar.",
          duration: 6000,
        });
      }
    };
    window.addEventListener("billing-blocked", handler);
    return () => window.removeEventListener("billing-blocked", handler);
  }, [motivoDoBloqueio]);

  /**
   * Pedido explícito para ver os planos, vindo da tarja flutuante.
   *
   * Separado do `billing-blocked` por causa do aviso: lá ele explica por que uma
   * janela abriu sozinha depois de um clique em "Novo lead". Aqui a pessoa
   * clicou num botão que diz "Escolher um plano", e repetir o aviso seria
   * responder uma pergunta que ela não fez.
   */
  useEffect(() => {
    const handler = () => setOfertaAberta(true);
    window.addEventListener("abrir-oferta", handler);
    return () => window.removeEventListener("abrir-oferta", handler);
  }, []);

  // Only redirect to company-register if:
  // 1. Company data has finished loading
  // 2. No company record exists
  // 3. User is not already on an onboarding route (safety guard)
  // A meta viewport segue a rota. Trocá-la em tempo de execução é reconhecido
  // pelo Safari do iOS e pelo Chrome do Android, e é o que permite uma tela ter
  // layout de celular sem que o app inteiro precise ter.
  useEffect(() => {
    aplicarViewport(emModoCelular ? VIEWPORT_DE_CELULAR : VIEWPORT_DO_APP);
  }, [emModoCelular]);

  useEffect(() => {
    if (companyLoading) return;
    if (!company && !ONBOARDING_PATHS.includes(pathname)) {
      navigate("/company-register", { replace: true });
    }
  }, [companyLoading, company, pathname, navigate]);

  if (crmLoading || companyLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "hsl(var(--background))" }}
      >
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Bloqueio por cobrança não implica plano expirado (uma anual pode falhar com
  // validade ainda no futuro), e o teste grátis é plano pago válido.
  //
  // Reserva de espaço só para quem ainda usa a FAIXA de rodapé. Durante o teste
  // -- e agora também depois dele -- a tarja é um cartão FLUTUANTE no canto,
  // como as janelas de conversa: ele passa por cima do conteúdo em vez de
  // empurrá-lo. Reservar espaço para algo que flutua deixaria uma faixa vazia no
  // fim de todas as telas.
  //
  // `motivoDoBloqueio === "teste"` sai da conta pelo mesmo motivo: aquele caso
  // virou cartão. Sobram o plano free e a cobrança recusada, que seguem em
  // faixa.
  const reservaRodape = (isFreePlan || billingBlocked) && motivoDoBloqueio !== "teste";
  // Quem APARECE e quem RESERVA espaço deixaram de ser a mesma conta: o teste
  // encerrado mostra tarja (flutuante) sem reservar nada. Derivar um do outro,
  // como era antes, faria a tarja sumir junto com a reserva.
  const showBanner = isFreePlan || billingBlocked || isTrialing;

  return (
    <div
      style={{
        /* COLUNA, e não linha: a barra superior é o primeiro filho e precisa
           ocupar a largura inteira da tela. Em linha -- como era enquanto a
           superior morava dentro do `main` -- ela virava uma coluna estreita à
           esquerda, do tamanho do próprio conteúdo. */
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        /* A largura ATUAL da barra, para todos que precisam dela: a própria
           barra, a margem do conteúdo e a tarja de plano fixa no rodapé. Uma
           variável só, para as três andarem juntas na animação. */
        /* Zero no modo celular: ali a barra vira gaveta por cima do conteúdo,
           e a coluna que ela ocupava devolve os 55px para a conversa. Como a
           margem e a largura do `<main>` derivam desta variável, os dois
           acompanham sem precisar de um segundo `if`. */
        ["--barra-largura" as string]: emModoCelular ? "0px" : larguraDaBarra(barraRecolhida),
      }}
    >
      {/*
        A barra superior vem PRIMEIRO e ocupa a tela toda.
        ────────────────────────────────────────────────────────────────────────
        Ela morava dentro do `<main>`, à direita da lateral, quando as duas eram
        uma peça em L. Em 22/09/2026 o dono pediu o contrário: a régua de baixo
        dela seguindo até a borda esquerda da tela, com a lateral começando
        abaixo. Para a linha atravessar de verdade, a barra tem que estar FORA
        do bloco que a lateral empurra -- por isso ela subiu um nível.

        A marca e o botão de recolher seguem na LATERAL: o dono quis a faixa
        atravessando a tela, mas com a assinatura na coluna da esquerda.
      */}
      <BarraSuperior compacta={emModoCelular} aoAbrirMenu={emModoCelular ? () => setMenuAberto(true) : undefined} />
      {/* `recolhida={false}` na gaveta: ela abre com os rótulos. Num telefone
          não há tooltip de mouse, então uma coluna de ícones sem texto seria
          adivinhação. */}
      <AppSidebar
        recolhida={emModoCelular ? false : barraRecolhida}
        aoAlternar={alternarBarra}
        sobreposta={emModoCelular}
        aberta={menuAberto}
        aoFechar={() => setMenuAberto(false)}
      />
      {/*
        As barras SEPARADAS, com a linha atravessando a tela.

        Foi peça em L, com o canto arredondado e uma régua única contornando a
        curva, entre 21/09 e 22/09/2026. O dono desfez: quer a linha de baixo da
        barra superior seguindo até a borda esquerda da tela, sem curva, para as
        duas barras ficarem bem divididas.

        Agora cada uma carrega a sua borda -- a superior a de baixo, a lateral a
        da direita --, e a linha horizontal atravessa também o cabeçalho da
        lateral, onde mora a marca. O que o olho lê é uma faixa de 48px no topo
        da tela inteira, e abaixo dela o menu à esquerda e o conteúdo à direita.
      */}
      <main
        style={{
          marginLeft: "var(--barra-largura)",
          width: "calc(100vw - var(--barra-largura))",
          transition: "margin-left var(--dur-normal) var(--ease-out), width var(--dur-normal) var(--ease-out)",
          /* O que sobra da janela depois da barra superior. Com `100vh` o
             conteúdo passaria da tela pela altura dela, e a última linha sairia
             por baixo. */
          height: "var(--altura-util)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--surface-card)",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            /*
             * Era `hidden`, que CLIPAVA o que não coubesse: numa janela estreita
             * a coluna da direita simplesmente sumia, sem rolagem para
             * alcançá-la. Com `auto` o conteúdo continua acessível, arrastando.
             *
             * É o par do `minWidth` logo abaixo: um define o piso, o outro dá o
             * caminho para ver o que passa dele. Sozinho, o `minWidth` só
             * esconderia mais coisa.
             */
            overflowX: "auto",
            background: "hsl(var(--background))",
            /*
             * Sem borda e sem canto arredondado.
             *
             * As duas linhas que cercavam este bloco eram a régua em L da
             * junção; agora elas pertencem às barras (a de baixo na superior, a
             * da direita na lateral), e repeti-las aqui desenharia a mesma
             * linha duas vezes, com 1px de desencontro.
             */
            paddingBottom: reservaRodape ? BANNER_HEIGHT : 0,
          }}
        >
          {/*
            O piso de largura do conteúdo.

            Abaixo de mil pixels as telas de três colunas -- Multiatendimento é
            a mais apertada, com 350 de lista + 350 de perfil + o chat --
            deixam de caber e passam a se sobrepor. O `minWidth` troca esse
            atropelo por rolagem horizontal: a informação continua inteira, e
            quem está numa janela estreita arrasta em vez de perder metade da
            tela.

            Mora AQUI, e não no `<main>`: quem rola é o pai, e um `minWidth` no
            próprio elemento que rola não empurra nada -- é o filho que precisa
            ser mais largo que o pai para a barra aparecer.

            O `width: 100%` continua: em tela larga ele manda, e o `minWidth` só
            entra quando a janela encolhe além do limite.
          */}
          <div style={{ width: "100%", minWidth: emModoCelular ? undefined : LARGURA_MINIMA_DO_APP, height: "100%", boxSizing: "border-box" }}>
            <Outlet />
          </div>
        </div>
      </main>

      <FreePlanBanner />
      {planLimitResource && (
        <PlanLimitModal resource={planLimitResource} onClose={() => setPlanLimitResource(null)} />
      )}
      {/*
        Ação barrada numa conta em somente leitura: o que aparece depende do
        MOTIVO, porque as duas pessoas precisam de coisas diferentes.

        Teste encerrado -> o cartão de planos, direto. Ela nunca contratou nada,
        e o passo seguinte é escolher um plano. Um aviso intermediário só para
        depois oferecer um botão "Ver planos" põe um clique entre ela e a única
        saída que existe.

        Cobrança recusada -> o aviso de sempre. Essa pessoa JÁ tem plano; abrir
        uma tabela de preços para quem só precisa trocar o cartão seria oferecer
        o que ela já comprou. O caminho dela é o portal de pagamento.
      */}
      {billingBlockedOpen && motivoDoBloqueio !== "teste" && (
        <BillingBlockedModal motivo={motivoDoBloqueio} onClose={() => setBillingBlockedOpen(false)} />
      )}
      {/* Um cartão só para os dois caminhos: a ação barrada (que o abre com o
          aviso) e o botão da tarja (que o abre direto). Duas instâncias
          montadas dariam dois diálogos concorrendo pelo mesmo espaço. */}
      <OfertaDeContratacao
        aberto={(billingBlockedOpen && motivoDoBloqueio === "teste") || ofertaAberta}
        aoFechar={() => { setBillingBlockedOpen(false); setOfertaAberta(false); }}
      />
    </div>
  );
}
