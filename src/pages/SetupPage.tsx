import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PLANS, type PlanDefinition } from "@/data/plans";
import { STRIPE_PRICES } from "@/data/stripePrices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { pixelTrack } from "@/lib/metaPixel";
import { FundoDoCrmAoVivo } from "@/components/FundoDoCrmAoVivo";
import {
  Check,
  ChevronDown,
  CircleCheck,
} from "lucide-react";

type Step = 1;
type BillingTab = "mensal" | "semestral" | "anual";

type PlanKey = keyof typeof STRIPE_PRICES;

const BILLING_TAB_TO_PERIOD: Record<BillingTab, "monthly" | "semiannual" | "annual"> = {
  mensal:    "monthly",
  semestral: "semiannual",
  anual:     "annual",
};

/**
 * Paleta do site (rezult-site/styles.css), portada para os cartões de plano.
 *
 * Os valores estão em constantes e não em classes do Tailwind porque não são
 * do tema do app: o CRM é claro, e este bloco é uma ilha escura dentro dele.
 * Usar `bg-card` ou `text-foreground` aqui traria as cores do app de volta e
 * quebraria a semelhança com o site, que é o ponto.
 *
 * Verde diferente do `--primary` do CRM de propósito: no fundo escuro do site
 * o #00E599 é o que dá o contraste, e o #128A68 do app sumiria.
 */
const SITE = {
  // O preto do site é mais escuro que a superfície dos cartões, e é essa
  // diferença que faz os três se destacarem do fundo em vez de sumirem nele.
  fundo:       "#05080A",
  superficie:  "#0C1115",
  superficie2: "#131A1E",
  verde:       "#00E599",
  sobreVerde:  "#04140D",
  texto:       "#F4F6F4",
  textoSuave:  "#D1D1D1",
  textoFraco:  "rgba(244, 246, 244, 0.38)",
  borda:       "rgba(255, 255, 255, 0.15)",
  // Cinza da moldura do card de planos. Mais forte que o `borda` dos cartões
  // internos porque precisa se sustentar ao lado do gradiente que gira.
  cinzaBorda:  "#3A4147",
  bordaSuave:  "rgba(0, 229, 153, 0.20)",
  bordaAtiva:  "rgba(0, 229, 153, 0.45)",
  // 0.18 é o `--glow-soft` do site, usado no brilho das sombras, nas pílulas e
  // também no topo do degradê do cartão em destaque. O site usa 0.06 lá, um véu
  // quase imperceptível; aqui o verde é mais presente de propósito, porque os
  // cartões são menores e o degradê fraco praticamente desaparecia.
  brilhoSuave: "rgba(0, 229, 153, 0.18)",
  // O `--red: #EF4444` do site, nos preços antigos riscados. Vermelho marca o
  // que a pessoa NÃO vai pagar.
  vermelho:    "#EF4444",
  // Verde fechado do selo da oferta. Escolhido por duas razões, não por gosto:
  //
  // 1. Precisa ser claramente mais escuro que o #00E599 do botão "7 Dias
  //    grátis" logo ao lado, senão os dois blocos verdes competem e nenhum
  //    ganha. Este é dois degraus abaixo, e a diferença lê de longe.
  //
  // 2. O texto do selo é branco, e branco sobre o #00E599 do botão dá 1.66:1,
  //    ilegível. Sobre este verde dá 5.48:1, acima do 4.5:1 que a WCAG pede
  //    para texto normal. O botão passa porque o texto dele é escuro; o selo
  //    não teria essa saída sem um verde fechado.
  verdeFechado: "#047857",
} as const;

/**
 * Escala do seletor de período, sendo 1 o tamanho exato do site.
 *
 * As nove medidas dele (largura, vãos, preenchimentos e as duas fontes) saem
 * todas daqui. É um número só porque encolher um seletor mexendo em cada
 * medida à mão sempre deixa alguma para trás, e o que fica desproporcional
 * costuma ser justo o selo de desconto, pequeno demais para alguém notar antes
 * de a tela ir ao ar.
 *
 * O raio fica fora da conta: em 100px o trilho já é uma pílula perfeita em
 * qualquer largura, e escalar isso não mudaria nada.
 *
 * 0.9 encolhe 10%, 0.8 encolhe 20%. Abaixo de 0.75 a fonte do selo cai de 10px
 * para menos de 8, que é onde ela deixa de ser legível.
 */
const ESCALA_DO_SELETOR = 0.9;

/** Aplica a escala e arredonda, porque meio pixel de padding não existe. */
const esc = (valor: number) => Math.round(valor * ESCALA_DO_SELETOR);

/**
 * Preenchimento vertical dos botões do seletor, em pixels.
 *
 * Fora da escala de propósito: ele é o único jeito de encolher o seletor só na
 * altura sem estreitar os 270px de largura, e cada ponto aqui tira 2px do
 * trilho inteiro. No site esse valor é 9, igual ao horizontal; aqui os dois se
 * separaram porque a altura precisava ceder e a largura não.
 */
const PADDING_VERTICAL_DO_BOTAO = 5;

/**
 * Fonte do rótulo dos botões do seletor, em pixels.
 *
 * Também fora da escala, e pelo mesmo motivo do preenchimento acima: encolher
 * a letra pela escala estreitaria o trilho junto. A escala em 0.9 daria 13px;
 * aqui é 12, um ponto abaixo.
 *
 * O selo de desconto NÃO acompanha: em 9px ele já é o menor texto do card, e
 * cair para 8 é onde ele deixa de ser lido e vira mancha.
 */
const FONTE_DO_BOTAO = 12;

/**
 * Desconto da oferta desta tela, como fração.
 *
 * ATENÇÃO: isto muda apenas o que a TELA mostra. O que a Stripe cobra vem dos
 * ids em `STRIPE_PRICES`, que continuam apontando para os preços cheios. Com
 * 0.5 aqui e nada lá, o cartão anuncia metade e o checkout cobra o dobro.
 *
 * Para a oferta valer de verdade, é preciso criar preços novos na Stripe e
 * trocar os ids -- ou aplicar um cupom na sessão de checkout. Enquanto isso não
 * acontecer, esta constante deveria ficar em 0.
 */
const DESCONTO = 0.5;

/** "R$ 1.234,56" -> 1234.56 */
const emNumero = (texto: string) =>
  Number(texto.replace(/[^\d,]/g, "").replace(",", "."));

/** 1234.56 -> "R$ 1.234,56" */
const emReais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Aplica o desconto a um preço já formatado.
 *
 * Recebe e devolve texto porque é assim que os preços moram em `PLANS` e em
 * `SETUP_PLAN_TOTALS`. Converter na entrada e formatar na saída mantém um lugar
 * só decidindo o desconto: mudar o número acima acerta cartão e diálogo de
 * confirmação de uma vez.
 */
const comDesconto = (precoCheio: string) => emReais(emNumero(precoCheio) * (1 - DESCONTO));

/**
 * Desconto anunciado em cada período, no selo do seletor.
 *
 * Números fixos, como no site: são o desconto do PERÍODO, igual para os três
 * planos. Não confundir com `plan.pricing.semestralSave`, que é a economia em
 * reais daquele plano específico, nem com `DESCONTO`, que é a promoção desta
 * tela e vale para todos os períodos.
 */
const DESCONTO_DO_PERIODO: Record<BillingTab, string | null> = {
  mensal:    null,
  semestral: "-15%",
  anual:     "-30%",
};

// A etapa de convidar membro saiu: quem acabou de criar a conta ainda não sabe
// o que é o produto, e convidar time antes de conhecer é pedir um favor a quem
// não tem o que mostrar. O convite continua em Configurações > Empresa > Equipe.
const STEP_META = [
  {
    title: "-50% OFF Oferta Exclusiva",
    subtitle: "",
  },
];

const SETUP_PLAN_TOTALS: Record<string, { semestral: string; anual: string }> = {
  silver:   { semestral: "R$ 1.209,00",  anual: "R$ 1.989,00"  },
  platinum: { semestral: "R$ 2.035,00",  anual: "R$ 3.352,00"  },
  emerald:  { semestral: "R$ 3.810,00",  anual: "R$ 6.272,00"  },
};


/**
 * Recursos de cada plano, na divisão que o site usa.
 *
 * `forte` é o pedaço em negrito, `resto` é o que vem depois em cinza, e o
 * primeiro item de cada plano leva o brilho verde -- é assim em
 * rezult-site/planos.html, onde só o primeiro item ganha o `em-shine-text`.
 * Os dois últimos itens não têm negrito nenhum, também como lá.
 *
 * Os textos são os do site, palavra por palavra, inclusive sem o ponto final
 * que a versão anterior desta tela usava. Duas telas que vendem o mesmo plano
 * não deveriam descrevê-lo com palavras diferentes.
 */
interface Recurso {
  forte?: string;
  resto?: string;
  brilho?: boolean;
}

const SETUP_PLAN_FEATURES: Record<string, Recurso[]> = {
  silver: [
    { forte: "4 usuários",    resto: "no sistema", brilho: true },
    { forte: "5 mil leads",   resto: "com controle de tags" },
    { forte: "8 automações",  resto: "para interações com leads" },
    { forte: "3 conexões",    resto: "WhatsApp" },
    { forte: "5 pipelines",   resto: "com até 8 etapas" },
    { forte: "3 integrações", resto: "via Webhook" },
    { resto: "Acesso à API e MCP" },
    { resto: "Dashboards detalhados da operação" },
  ],
  platinum: [
    { forte: "15 usuários",    resto: "no sistema", brilho: true },
    { forte: "100 mil leads",  resto: "com controle de tags" },
    { forte: "20 automações",  resto: "para interações com leads" },
    { forte: "10 conexões",    resto: "WhatsApp" },
    { forte: "20 pipelines",   resto: "com até 15 etapas" },
    { forte: "15 integrações", resto: "via Webhook" },
    { resto: "Acesso à API e MCP" },
    { resto: "Dashboards detalhados da operação" },
  ],
  emerald: [
    { forte: "Usuários ilimitados",    resto: "no sistema", brilho: true },
    { forte: "Leads ilimitados",       resto: "com controle de tags" },
    { forte: "Automações ilimitadas" },
    { forte: "Conexões ilimitadas",    resto: "WhatsApp" },
    { forte: "Pipelines ilimitadas",   resto: "com até 25 etapas" },
    { forte: "Integrações ilimitadas", resto: "via Webhook" },
    { resto: "Acesso à API e MCP" },
    { resto: "Dashboards detalhados da operação" },
  ],
};

/**
 * Selo da oferta, no topo do card.
 *
 * Duas caixas, uma dentro da outra: a de fora é o campo verde fechado, a de
 * dentro é a linha tracejada branca. É o desenho de cupom -- o tracejado sugere
 * recorte, e recorte sugere que aquilo é destacável e tem prazo.
 *
 * O tracejado precisa de DUAS caixas porque ele tem que flutuar dentro do
 * campo, com margem dos dois lados. Uma borda tracejada aplicada direto no
 * campo colorido ficaria na beirada dele, sem a moldura de cor em volta, e o
 * efeito de cupom se perderia.
 *
 * O respiro interno é curto de propósito (3px em cima e embaixo, 10 nas
 * laterais): o texto quase encosta no tracejado, que é o que faz o selo parecer
 * apertado e urgente em vez de uma caixa com texto dentro.
 */
function SeloDaOferta({ texto }: { texto: string }) {
  return (
    <div className="shrink-0 rounded-[7px]" style={{ background: SITE.verdeFechado, padding: 4 }}>
      <div
        className="rounded-[4px]"
        style={{
          border: "1px dashed rgba(255, 255, 255, 0.75)",
          padding: "3px 10px",
        }}
      >
        <h1
          className="text-[16px] font-bold whitespace-nowrap"
          style={{ color: "#FFFFFF", letterSpacing: "0.01em" }}
        >
          {texto}
        </h1>
      </div>
    </div>
  );
}

export default function SetupPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { company, companyLoading, isFreePlan, isTrialing } = useCompany();
  const { user } = useAuth();

  useEffect(() => {
    if (companyLoading) return;
    // Quem está em teste grátis tem plano pago e cairia neste desvio, indo direto
    // para o dashboard sem passar pelo onboarding, que é justamente onde a
    // assinatura é oferecida. O desvio existe para quem JÁ assinou.
    if (company && !isFreePlan && !isTrialing) {
      navigate("/dashboard", { replace: true });
    }
  }, [companyLoading, company, isFreePlan, isTrialing, navigate]);



  useEffect(() => {
    pixelTrack("ViewContent", { content_name: "Planos" });
  }, []);


  /**
   * Semestral por padrão, e não mensal.
   *
   * É o meio da escada: quem chega vendo o semestral tem o anual à direita como
   * "um passo além" e o mensal à esquerda como "um passo atrás". Abrindo no
   * mensal, os outros dois só existem para quem for procurar, e o preço que a
   * pessoa vê primeiro é o mais alto por mês.
   */
  const [billingTab, setBillingTab]   = useState<BillingTab>("semestral");
  const [confirmPlan, setConfirmPlan] = useState<PlanKey | null>(null);
  const [confirming, setConfirming]   = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [planConfirmed, setPlanConfirmed] = useState(false);
  /** Qual cartão está sob o mouse, para acender a borda dele. */
  const [planoSobMouse, setPlanoSobMouse] = useState<string | null>(null);


  const handleSelectPlan = (planKey: PlanKey) => {
    setConfirmPlan(planKey);
  };

  const handleConfirmPlan = async () => {
    if (!user || !company || !confirmPlan) return;
    setConfirming(true);

    const priceId = STRIPE_PRICES[confirmPlan][BILLING_TAB_TO_PERIOD[billingTab]];
    pixelTrack("InitiateCheckout", { content_name: confirmPlan, content_category: "subscription" });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          priceId,
          companyId:     company.id,
          userId:        user.id,
          userEmail:     user.email ?? "",
          planName:      confirmPlan,
          billingPeriod: BILLING_TAB_TO_PERIOD[billingTab],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Erro ao criar sessão de pagamento.");
      window.open(data.url, "_blank");
      setConfirmPlan(null);
      setPlanConfirmed(true);
      setSuccessOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar checkout.");
    } finally {
      setConfirming(false);
    }
  };

  const { title, subtitle } = STEP_META[0];

  const getPlanPrice = (plan: PlanDefinition) => {
    if (billingTab === "mensal")    return plan.pricing.mensal;
    if (billingTab === "semestral") return plan.pricing.semestral;
    return plan.pricing.anual;
  };

  /**
   * Quanto a promoção tira do que se paga no ciclo escolhido.
   *
   * Antes esta pílula mostrava a economia do PERÍODO (quanto o anual poupa em
   * relação a pagar mensal). Aquela conta estava certa, mas não existe no
   * mensal: escolher mensal economiza zero em relação a mensal, e por isso o
   * cartão ficava sem pílula naquela aba.
   *
   * Medindo a promoção, os três períodos têm o que mostrar e a pílula significa
   * a mesma coisa em todos. E não duplica informação: a vantagem de escolher um
   * período mais longo já está nos selos -15% e -30% do seletor logo acima.
   *
   * O valor é sempre sobre o ciclo que a pessoa vai pagar -- um mês no mensal,
   * seis no semestral, doze no anual -- que é o mesmo ciclo do "De X por Y" na
   * linha abaixo do preço.
   */
  const getPlanSave = (plan: PlanDefinition) => {
    if (DESCONTO <= 0) return null;
    const cicloCheio = billingTab === "mensal"
      ? plan.pricing.mensal
      : SETUP_PLAN_TOTALS[plan.key]?.[billingTab as "semestral" | "anual"];
    if (!cicloCheio) return null;
    return emReais(emNumero(cicloCheio) * DESCONTO);
  };

  return (
    <>
      {/* A conta já existe aqui, então o fundo é o CRM de verdade dela, e não
          a réplica que o cadastro usa. Ver FundoDoCrmAoVivo. */}
      <div className="relative min-h-screen overflow-y-auto flex items-center justify-center px-4 py-10" style={{ background: "hsl(var(--background))" }}>
        <FundoDoCrmAoVivo />
        {/* 980 × 650. Altura FIXA, então o card não cresce com o conteúdo: cada
            linha nova nos planos precisa caber nos 594px úteis que sobram
            depois do respiro interno, ou some. Se um dia apertar de novo, o
            conserto duradouro é trocar por `minHeight` e deixar o card se
            ajustar sozinho. */}
        <div className="relative rounded-[16px] p-[1px] overflow-hidden w-full max-w-[980px]">
          {/* Rotating border light */}
          <div
            className="absolute inset-[-100%]"
            style={{
              background: "conic-gradient(from 0deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
              animation: "spin-border 4s linear infinite",
            }}
          />

          <div
            className="relative w-full rounded-[15px] overflow-hidden flex"
            style={{
              height: 650,
              background: SITE.fundo,
              // Cinza, e não o verde do selo: com o gradiente verde girando no
              // anel de fora, uma segunda linha verde colada nele virava uma
              // faixa só. O cinza separa as duas e deixa o movimento aparecer.
              //
              // O invólucro tem 15+1 de raio para acompanhar este: raios iguais
              // nos dois deixariam o gradiente aparecendo em excesso nos
              // cantos, onde a curva de fora é mais fechada que a de dentro.
              border: `2px solid ${SITE.cinzaBorda}`,
            }}
          >
            {/* ── Right content ── */}
            <div className="flex-1 flex flex-col px-10 pt-8 pb-6 min-w-0">
              {/* Título à esquerda e a saída à direita, na mesma linha.
                  O botão estava no rodapé, depois dos três planos, onde ele
                  competia com os "Escolher plano" -- quatro botões seguidos, e
                  o único que NÃO leva ao pagamento era o último. Aqui em cima
                  ele fica claramente fora da comparação, que é o que ele é: a
                  saída de quem prefere olhar o produto antes de decidir.

                  Sem contador de etapas nem barra de progresso: com uma etapa,
                  um diria "1/1" e a outra estaria sempre cheia. */}
              <div className="flex items-center gap-3 mb-1">
                <SeloDaOferta texto={title} />

                {/* Ao lado do selo, e não dentro dele: o selo diz O QUE é a
                    oferta, esta linha diz ONDE ela existe. Duas frases dentro do
                    mesmo cupom tirariam dele a cara de etiqueta.

                    Branco, e não o cinza dos textos de apoio, porque é argumento
                    de venda e não observação de rodapé.

                    `truncate` com `min-w-0`: numa janela estreita esta frase
                    encolhe primeiro, preservando o selo e o botão, que são os
                    dois elementos com função. */}
                <p className="text-[12px] min-w-0 truncate" style={{ color: SITE.texto }}>
                  Essa oferta é única.
                </p>

                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="brilho-botao-verde shrink-0 ml-auto h-auto py-[7px] px-4 rounded-[12px] text-[13px] font-semibold transition-all hover:-translate-y-[2px]"
                  style={{ background: SITE.verde, color: SITE.sobreVerde }}
                >
                  {planConfirmed ? "Acessar" : "7 Dias grátis"}
                </button>
              </div>


              {/* ── Planos ── */}
              {(
                <div className="mt-1">
                  {/* Billing tabs */}
                  {/* Seletor idêntico ao `.price-toggle` do site: 300px de
                      largura, cantos de 100px, fundo #131A1E, borda verde a
                      20%, botões de 14px em `flex: 1` e o selo de desconto em
                      10px. A ordem também é a de lá, Mensal primeiro.

                      O único desvio é o espaço abaixo: no site são 56px, que
                      ali separam o seletor do resto da página. Dentro de um
                      card de 630px isso custaria mais altura do que os 30px que
                      o card acabou de ganhar, então ficou em 24px. */}
                  <div
                    className="flex items-center mx-auto mb-6"
                    style={{
                      width: esc(300),
                      gap: esc(3),
                      padding: esc(4),
                      borderRadius: 100,
                      background: SITE.superficie2,
                      border: `1px solid ${SITE.bordaSuave}`,
                    }}
                  >
                    {(["mensal", "semestral", "anual"] as BillingTab[]).map((tab) => {
                      const ativa = billingTab === tab;
                      const desconto = DESCONTO_DO_PERIODO[tab];
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setBillingTab(tab)}
                          className="flex flex-1 items-center justify-center capitalize transition-all"
                          style={{
                            fontSize: FONTE_DO_BOTAO,
                            fontWeight: ativa ? 600 : 500,
                            padding: `${PADDING_VERTICAL_DO_BOTAO}px ${esc(9)}px`,
                            gap: esc(4),
                            borderRadius: 100,
                            background: ativa ? SITE.verde : undefined,
                            color: ativa ? SITE.sobreVerde : SITE.textoSuave,
                          }}
                        >
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                          {desconto && (
                            <span
                              style={{
                                fontSize: esc(10),
                                padding: `${esc(2)}px ${esc(5)}px`,
                                borderRadius: 100,
                                letterSpacing: "0.02em",
                                background: ativa ? "rgba(4,20,13,0.2)" : SITE.brilhoSuave,
                                color: ativa ? SITE.sobreVerde : SITE.verde,
                              }}
                            >
                              {desconto}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Cartões no visual do site (rezult-site/planos.html):
                      fundo escuro, borda clara, preço grande e lista com o
                      visto verde. O que NÃO veio do site é o destino do clique
                      -- lá o botão manda para /register, aqui ele abre a
                      confirmação e o checkout da conta que já existe. Os
                      valores continuam saindo de PLANS e SETUP_PLAN_TOTALS,
                      que são os do app. */}
                  <div className="grid grid-cols-3 gap-3 pt-4">
                    {PLANS.map((plan) => {
                      const save = getPlanSave(plan);
                      const destaque = !!plan.badge;
                      return (
                        <div
                          key={plan.key}
                          // O hover é o do site (`.pcard:hover`): sobe 4px e a
                          // borda acende em verde. Vem por estado e não por
                          // classe porque a borda mora no `style` -- uma classe
                          // `hover:border-*` do Tailwind não venceria o inline.
                          onMouseEnter={() => setPlanoSobMouse(plan.key)}
                          onMouseLeave={() => setPlanoSobMouse(null)}
                          className="relative flex flex-col rounded-[16px] p-5 transition-all duration-200"
                          style={{
                            background: destaque
                              ? `linear-gradient(180deg, ${SITE.brilhoSuave}, ${SITE.superficie} 40%)`
                              : SITE.superficie,
                            border: `1px solid ${destaque || planoSobMouse === plan.key ? SITE.bordaAtiva : SITE.borda}`,
                            boxShadow: destaque
                              ? `0 30px 70px rgba(0,0,0,0.4), 0 0 60px ${SITE.brilhoSuave}`
                              : undefined,
                            transform: planoSobMouse === plan.key ? "translateY(-4px)" : undefined,
                          }}
                        >
                          {destaque && (
                            <span
                              className="absolute -top-[11px] left-1/2 -translate-x-1/2 text-[11px] font-semibold px-3 py-[4px] rounded-full whitespace-nowrap"
                              style={{ background: SITE.verde, color: SITE.sobreVerde, letterSpacing: "0.04em" }}
                            >
                              {plan.badge}
                            </span>
                          )}

                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-[20px] font-semibold shrink-0" style={{ color: SITE.texto, letterSpacing: "-0.02em" }}>
                              {plan.name}
                            </h3>
                            {save && (
                              <span
                                className="inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5 truncate"
                                style={{ background: SITE.brilhoSuave, color: SITE.verde }}
                              >
                                <span className="truncate">Economize {save}</span>
                              </span>
                            )}
                          </div>

                          {/* 2px, e não os 12 de `mt-3` que havia aqui. O nome
                              do plano e o preço são a mesma informação dita em
                              duas linhas, então colam. O respiro grande fica
                              embaixo (`mb-4`), separando o preço do botão, que
                              é onde a divisão realmente existe. */}
                          <div className="mt-[2px] mb-4">
                            {/* O preço cheio, acima do promocional. Só aparece
                                quando há desconto: com DESCONTO em 0 ele
                                mostraria o mesmo valor duas vezes.

                                Margem NEGATIVA: eram 2px de `mb-0.5`, e tirar
                                5px daí exige puxar 3px para dentro. A folga que
                                sobra vem da caixa de linha do texto de 16px, que
                                carrega 4px invisíveis abaixo das letras -- é
                                nela que a margem negativa come, sem encostar uma
                                linha na outra. */}
                            {DESCONTO > 0 && (
                              <p className="text-[16px] font-medium -mb-[3px]" style={{ color: SITE.vermelho }}>
                                de {getPlanPrice(plan)}
                              </p>
                            )}
                            <div className="flex items-baseline gap-1 flex-wrap">
                              {/* "de X" na linha de cima e "por Y" aqui: as duas
                                  formam uma frase só, quebrada em duas linhas
                                  para o valor novo poder ser grande. */}
                              {DESCONTO > 0 && (
                                <span className="text-[13px]" style={{ color: SITE.textoFraco }}>por</span>
                              )}
                              <span className="text-[26px] font-semibold" style={{ color: SITE.texto, letterSpacing: "-0.04em" }}>
                                {comDesconto(getPlanPrice(plan))}
                              </span>
                              <span className="text-[13px]" style={{ color: SITE.textoFraco }}>/mês</span>
                              {/* 9px e preenchimento estreito para caber na mesma
                                  linha do preço em qualquer período: "Semestral"
                                  ao lado de "R$ 317,50" é a combinação mais
                                  larga do card. O `flex-wrap` do contêiner fica
                                  como rede de segurança -- se em algum zoom não
                                  couber, ela desce em vez de ser cortada. */}
                              <span
                                className="text-[9px] font-semibold px-1.5 py-[3px] rounded-full ml-auto capitalize shrink-0"
                                style={{ background: SITE.brilhoSuave, color: SITE.verde, letterSpacing: "0.02em" }}
                              >
                                {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}
                              </span>
                            </div>
                            {/* O preço acima é sempre por mês, inclusive no
                                semestral e no anual. Sem esta linha, quem
                                escolhe anual vê "R$ 166/mês" e pode entrar no
                                checkout esperando ser cobrado de 166 em 166. */}
                            {/* Tudo no mesmo cinza: o vermelho e o verde que
                                havia aqui repetiam o destaque que o "de X / por
                                Y" logo acima já faz em tamanho grande. Duas
                                linhas gritando a mesma coisa cancelavam uma à
                                outra. O risco fica, porque separa o valor
                                antigo do novo sem precisar de cor. */}
                            {(() => {
                              const total = billingTab !== "mensal"
                                ? SETUP_PLAN_TOTALS[plan.key]?.[billingTab as "semestral" | "anual"]
                                : null;
                              return (
                                <div className="flex items-center gap-2 mt-1 min-w-0">
                                  <p className="text-[11px] min-w-0 truncate" style={{ color: SITE.textoFraco }}>
                                    {total
                                      ? <>de <s>{total}</s> por {comDesconto(total)}</>
                                      : "Cobrança mensal recorrente"}
                                  </p>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Botão acima da lista, como no site: quem já decidiu
                              não precisa varrer oito linhas para chegar nele.

                              O rótulo carrega o período ("Escolher plano
                              Anual") porque é a última coisa lida antes de o
                              card sumir e a confirmação abrir -- é a chance de
                              a pessoa notar que estava na aba errada. Qual
                              plano é, o título do cartão logo acima já diz. */}
                          <button
                            type="button"
                            onClick={() => handleSelectPlan(plan.key as PlanKey)}
                            className="w-full rounded-[12px] py-[9px] text-[13px] font-semibold transition-transform hover:-translate-y-[1px]"
                            style={destaque
                              ? { background: SITE.verde, color: SITE.sobreVerde, boxShadow: `0 8px 30px ${SITE.brilhoSuave}` }
                              : { background: SITE.superficie2, color: SITE.texto, border: `1px solid ${SITE.borda}` }}
                          >
                            Escolher plano {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}
                          </button>

                          <ul className="flex flex-col gap-[9px] mt-4">
                            {(SETUP_PLAN_FEATURES[plan.key] ?? []).map((recurso) => (
                              // O item em destaque é um ponto maior que os
                              // demais. Sai do mesmo `brilho` que já lhe dá a
                              // cor animada, então tamanho e efeito não podem
                              // se separar por engano: o item destacado é
                              // destacado nas duas coisas ou em nenhuma.
                              <li
                                key={`${recurso.forte ?? ""}${recurso.resto ?? ""}`}
                                className={cn(
                                  "flex items-start gap-2 leading-[1.45]",
                                  recurso.brilho ? "text-[14px]" : "text-[12px]"
                                )}
                                style={{ color: SITE.textoSuave }}
                              >
                                <Check size={14} strokeWidth={2.5} className="mt-[1px] shrink-0" style={{ color: SITE.verde }} />
                                <span>
                                  {recurso.forte && (
                                    <b
                                      className={recurso.brilho ? "texto-brilho" : undefined}
                                      style={{ fontWeight: 600, color: recurso.brilho ? undefined : SITE.texto }}
                                    >
                                      {recurso.forte}
                                    </b>
                                  )}
                                  {recurso.forte && recurso.resto ? " " : ""}
                                  {recurso.resto}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmation dialog ── */}
      <Dialog open={!!confirmPlan} onOpenChange={v => { if (!v) setConfirmPlan(null); }}>
        <DialogContent className="max-w-[400px] rounded-[7px] bg-white">
          <DialogHeader>
            <DialogTitle className="text-[16px]">Confirmar seleção de plano</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {confirmPlan && (() => {
              const plan = PLANS.find(p => p.key === confirmPlan)!;
              // Com desconto, como no cartão: se o diálogo mostrasse o preço
              // cheio, a pessoa veria um valor no card e outro maior no passo
              // seguinte, e desistiria achando que foi enganada.
              const price = comDesconto(getPlanPrice(plan));
              const totalCheio = billingTab !== "mensal" ? SETUP_PLAN_TOTALS[confirmPlan]?.[billingTab as "semestral" | "anual"] : null;
              const total = totalCheio ? comDesconto(totalCheio) : null;
              return (
                <>
                  <div className="flex items-center justify-between py-3 border-y border-gray-100">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{plan.name} — {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{price}/mês</p>
                    </div>
                    {total && (
                      <p className="text-[12px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{total}</span></p>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">O checkout será aberto em uma nova aba para concluir o pagamento.</p>
                </>
              );
            })()}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmPlan(null)} className="flex-1 rounded-[5px]">Cancelar</Button>
            <Button onClick={handleConfirmPlan} disabled={confirming} className="flex-1 rounded-[5px]">
              {confirming ? "Aguarde..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Success dialog ── */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-[400px] rounded-[7px] bg-white text-center">
          <div className="flex flex-col items-center py-4 gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CircleCheck size={36} className="fill-primary stroke-white" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-foreground">Parabéns!</h2>
              <p className="text-[15px] text-foreground mt-1 leading-snug" style={{ fontWeight: 500 }}>
                Seu plano foi selecionado com sucesso.
              </p>
              <p className="text-[13px] text-muted-foreground mt-2 leading-snug">
                Após finalizar o pagamento clique em "Concluir", aguarde alguns segundos e atualize a página para conferir as alterações.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
