import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppSidebar";
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
  // Só os dois primeiros reservam espaço no rodapé. Durante o teste a tarja é um
  // cartão FLUTUANTE no canto, como as janelas de conversa: ele passa por cima
  // do conteúdo em vez de empurrá-lo. Reservar espaço para algo que flutua
  // deixaria uma faixa vazia no fim de todas as telas.
  const reservaRodape = isFreePlan || billingBlocked;
  const showBanner = reservaRodape || isTrialing;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <AppSidebar />
      <main
        style={{
          marginLeft: 52,
          width: "calc(100vw - 52px)",
          height: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          background: "hsl(var(--background))",
          paddingBottom: reservaRodape ? BANNER_HEIGHT : 0,
        }}
      >
        <div style={{ width: "100%", height: "100%", boxSizing: "border-box" }}>
          <Outlet />
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
      <OfertaDeContratacao
        aberto={billingBlockedOpen && motivoDoBloqueio === "teste"}
        aoFechar={() => setBillingBlockedOpen(false)}
      />
    </div>
  );
}
