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
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        /* A largura ATUAL da barra, para todos que precisam dela: a própria
           barra, a margem do conteúdo e a tarja de plano fixa no rodapé. Uma
           variável só, para as três andarem juntas na animação. */
        ["--barra-largura" as string]: larguraDaBarra(barraRecolhida),
      }}
    >
      <AppSidebar recolhida={barraRecolhida} aoAlternar={alternarBarra} />
      {/*
        As duas barras como UMA peça em L.

        O `<main>` é BRANCO, igual às barras, e quem desenha o cinza é o bloco
        de dentro -- que ainda arredonda o próprio canto superior esquerdo. O
        branco que aparece nessa curva é o do `<main>`, e é ele que emenda a
        barra superior na lateral: o olho lê um L contínuo, e não duas faixas
        que se encontram num canto reto.

        Por isso nenhuma das duas tem mais régua no encontro. Quem separa as
        barras do conteúdo é a diferença de cor (branco contra canvas), que não
        precisa de linha para ser vista.
      */}
      <main
        style={{
          marginLeft: "var(--barra-largura)",
          width: "calc(100vw - var(--barra-largura))",
          transition: "margin-left var(--dur-normal) var(--ease-out), width var(--dur-normal) var(--ease-out)",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--surface-card)",
        }}
      >
        <BarraSuperior />
        {/* A rolagem mora AQUI, e não no <main>: no <main> a barra superior
            rolaria junto com a tela, e o lugar dela é fixo. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            background: "hsl(var(--background))",
            borderTopLeftRadius: "var(--junta-barras)",
            /*
             * A régua das duas barras, numa linha só.
             *
             * Ela é a BORDA deste bloco, e não uma borda em cada barra: como o
             * canto aqui é arredondado, a linha sobe pela esquerda (encostada
             * na lateral), faz a curva e segue para a direita (sob a barra
             * superior). Uma linha contínua em L, que é o que o dono pediu --
             * duas bordas separadas se encontrariam num canto reto, cada uma
             * parando onde a outra começa.
             */
            borderTop: "1px solid var(--border-default)",
            borderLeft: "1px solid var(--border-default)",
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
