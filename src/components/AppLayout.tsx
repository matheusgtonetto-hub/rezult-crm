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

// Routes where the user is actively completing onboarding — no redirect needed
const ONBOARDING_PATHS = ["/company-register", "/setup"];


export default function AppLayout() {
  const { crmLoading }                                                    = useCRM();
  const { company, companyLoading, isFreePlan, billingBlocked, motivoDoBloqueio, isTrialing } = useCompany();
  const navigate                                                          = useNavigate();
  const { pathname }                                                      = useLocation();
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
        ["--barra-largura" as string]: larguraDaBarra(barraRecolhida),
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
      <BarraSuperior />
      <AppSidebar recolhida={barraRecolhida} aoAlternar={alternarBarra} />
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
            overflowX: "hidden",
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
          <div style={{ width: "100%", height: "100%", boxSizing: "border-box" }}>
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
