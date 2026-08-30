import { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PLANS, chaveDoRecurso } from "@/data/plans";
import { STRIPE_PRICES } from "@/data/stripePrices";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { pixelTrack } from "@/lib/metaPixel";
import { linkDoParcelado, PARCELAS_POR_PERIODO } from "@/data/tictoOfertas";
import { Check, CircleCheck, X } from "lucide-react";

/**
 * O cartão de planos como DIÁLOGO, para quem já tem conta.
 *
 * É o irmão do `SetupPage`, a Oferta de Primeira Contratação. Os dois desenham o
 * mesmo cartão preto de 980x650, com o mesmo seletor de período, os mesmos três
 * planos e o mesmo caminho até o checkout. O que muda é o contexto:
 *
 * | | SetupPage (/setup) | Este diálogo |
 * |---|---|---|
 * | Quando | último passo do cadastro | botão Upgrade em Configurações |
 * | Passo a passo em balões | sim, dois passos | não -- quem já usa o CRM já viu |
 * | Botão "Começar 7 dias grátis" | sim | não -- o teste já começou ou já acabou |
 * | Fundo | réplica do CRM (`FundoDoCrmAoVivo`) | o CRM de verdade, desfocado atrás |
 * | Saída | finalizar o cadastro | fechar e continuar onde estava |
 *
 * ── Cópia independente, e é para continuar assim ──
 *
 * As duas telas não compartilham nada além da REGRA da oferta. Cor, medida,
 * tabela de preço e marcação estão duplicadas aqui dentro de propósito: mexer
 * numa não pode alterar a outra, e é para isso que a duplicação existe.
 *
 * Isto não é acidente nem falta de refatoração. Uma primeira versão extraía as
 * constantes para um módulo comum, e o efeito apareceu na hora: um ajuste feito
 * neste diálogo mudou o cartão do cadastro, que ninguém pediu para mexer. O
 * arquivo comum foi desfeito por causa disso.
 *
 * O custo é conhecido e aceito: quem mudar preço precisa mudar nos dois lugares.
 * A tabela do cadastro é o `SETUP_PLAN_TOTALS` em `pages/SetupPage.tsx`; a deste
 * é o `TOTAIS_DO_CICLO` logo abaixo.
 *
 * ── Aqui NÃO existe a oferta de 50% ──
 *
 * Preço cheio sempre, inclusive para quem ainda está nos sete dias de teste. Os
 * 50% da Oferta de Primeira Contratação são exclusivos de um caminho: o botão da
 * tarja do teste grátis, que leva ao cartão do cadastro. Um desconto que aparece
 * em toda tela de plano deixa de ser oferta e vira o preço.
 *
 * Isso não se resolve só escondendo o selo. O `create-checkout-session` decide o
 * cupom pelo `trial_ends_at` da empresa, e sozinho ele aplicaria os 50% mesmo
 * com a tela mostrando o valor cheio -- cobrando metade de quem não deveria
 * ganhar. Por isso o pedido daqui leva `semOferta: true`, e é a edge function
 * que honra a regra. Mexer numa ponta sem a outra reabre a divergência.
 */

/**
 * ── Constantes deste cartão, e SÓ dele ──
 *
 * Estão aqui dentro, e não num módulo comum com o `SetupPage`, de propósito. As
 * duas telas são cópias INDEPENDENTES: mexer no preço, na cor ou no desenho de
 * uma não pode alterar a outra, e é exatamente para isso que a duplicação
 * existe. Um arquivo compartilhado desfaria isso em silêncio -- foi o que
 * aconteceu numa primeira tentativa, em que um ajuste aqui apareceu no cadastro
 * sem ninguém pedir.
 *
 * O preço em duas cópias é o custo aceito por essa separação. Quem mudar uma
 * tabela precisa lembrar da outra: elas estão em `SetupPage.tsx`
 * (`SETUP_PLAN_TOTALS`) e aqui (`TOTAIS_DO_CICLO`).
 */

/** Aba de período. Os três ciclos que o produto vende. */
type BillingTab = "mensal" | "semestral" | "anual";

/** Tradução para o vocabulário da Stripe, que nomeia os períodos em inglês. */
const BILLING_TAB_TO_PERIOD: Record<BillingTab, "monthly" | "semiannual" | "annual"> = {
  mensal:    "monthly",
  semestral: "semiannual",
  anual:     "annual",
};

/**
 * O que se paga POR CICLO no semestral e no anual.
 *
 * `PLANS[].pricing` guarda o equivalente mensal, que é o número grande do
 * cartão. Este guarda o total da fatura, que é o que sai do cartão de crédito
 * de verdade. Os dois precisam existir: mostrar só o mensal esconde o valor
 * cobrado, mostrar só o total esconde a comparação entre planos.
 *
 * O mensal não aparece aqui porque para ele os dois números são o mesmo.
 */
const TOTAIS_DO_CICLO: Record<string, { semestral: string; anual: string }> = {
  silver:   { semestral: "R$ 1.209,00",  anual: "R$ 1.989,00"  },
  platinum: { semestral: "R$ 2.035,00",  anual: "R$ 3.352,00"  },
  emerald:  { semestral: "R$ 3.810,00",  anual: "R$ 6.272,00"  },
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
  bordaSuave:  "rgba(0, 229, 153, 0.20)",
  bordaAtiva:  "rgba(0, 229, 153, 0.45)",
  // 0.18 é o `--glow-soft` do site, usado no brilho das sombras, nas pílulas e
  // também no topo do degradê do cartão em destaque. O site usa 0.06 lá, um véu
  // quase imperceptível; aqui o verde é mais presente de propósito, porque os
  // cartões são menores e o degradê fraco praticamente desaparecia.
  brilhoSuave: "rgba(0, 229, 153, 0.18)",
  // O brilho da moldura do card, nos dois sentidos. O site usa 0.45 no `--glow`
  // dos elementos primários; aqui é 0.35, porque a moldura acende para dentro
  // também e o valor cheio esverdeava demais o preto por baixo dos cartões.
  // Não confundir com o `brilhoSuave` (0.18), que é véu.
  brilhoVerde: "rgba(0, 229, 153, 0.35)",
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

/** Medidas do cartão preto. O desenho inteiro foi calibrado nelas. */
const LARGURA_DO_CARD = 980;
const ALTURA_DO_CARD  = 652;

/** Quantos meses cada ciclo cobre. É a ponte entre mensalidade e total. */
const MESES_DO_CICLO: Record<BillingTab, number> = {
  mensal: 1,
  semestral: 6,
  anual: 12,
};

/**
 * O desconto de escolher um período mais longo, para o selo do seletor.
 *
 * Nada calcula estes números: eles são a política de preço, e é dela que saem os
 * totais de `TOTAIS_DO_CICLO`. Confira: 237 × 6 = 1.422, e o semestral custa
 * 1.209 -- exatos 15% a menos. O anual, 237 × 12 = 2.844 contra 1.989, 30%.
 *
 * Os mesmos rótulos aparecem no site (rezult-site/planos.html) e em /planos.
 */
const DESCONTO_DO_PERIODO: Record<BillingTab, string | null> = {
  mensal: null,
  semestral: "-15%",
  anual: "-30%",
};

/** "R$ 1.234,56" -> 1234.56 */
const emNumero = (texto: string) =>
  Number(texto.replace(/[^\d,]/g, "").replace(",", "."));

/** 1234.56 -> "R$ 1.234,56" */
const emReais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Todos os números de dinheiro de um cartão de plano, de uma vez.
 *
 * Uma função só, e não cinco espalhadas pelo JSX, porque os cinco valores
 * PRECISAM fechar entre si: o riscado menos a economia tem que dar o total, e o
 * total dividido pelos meses tem que dar a mensalidade exibida. Calculados em
 * pontos diferentes da marcação, é questão de tempo até um ser ajustado sem os
 * outros e o cartão anunciar uma conta que não bate.
 *
 * ── O riscado é a MENSALIDADE do plano mensal ──
 *
 * R$ 237,00 riscado, R$ 201,50 embaixo: as duas linhas na mesma unidade, e a
 * comparação se lê sem conta nenhuma. É o preço de referência do plano, o que
 * se pagaria por mês sem se comprometer com período nenhum.
 *
 * O site risca outra coisa -- lá vai o total do ciclo (237 × 6 = 1.422) contra a
 * mensalidade embaixo, duas unidades diferentes na mesma caixa. O valor do ciclo
 * não some daqui: ele aparece inteiro na linha "Cobrança semestral de
 * R$ 1.209,00", logo abaixo, onde há espaço para dizer o que ele é.
 *
 * ── A economia é a do CICLO ──
 *
 * R$ 213,00 no semestral do Silver, e não os R$ 35,50 que a mensalidade poupa
 * por mês. Quem decide entre mensal e semestral quer saber quanto deixa de gastar
 * na decisão inteira, não por parcela.
 *
 * ── Sem a oferta de 50% ──
 *
 * Esta função não conhece a Oferta de Primeira Contratação, e é de propósito:
 * este cartão vende sempre a preço cheio. O desconto único vive no cartão do
 * cadastro, que tem a própria conta.
 *
 * ── Por que derivar a mensalidade em vez de ler `PLANS[].pricing` ──
 *
 * Porque assim ela não tem como discordar do total. Os seis valores derivados
 * batem exatamente com os de `PLANS` hoje (201,50 · 165,75 · 339,17 · 279,33 ·
 * 635,00 · 522,67); a diferença é que, se um total mudar amanhã, a mensalidade
 * acompanha sozinha em vez de ficar para trás.
 */
function precosDoCartao(
  plano: { key: string; pricing: { mensal: string } },
  ciclo: BillingTab,
): {
  /** O número grande do cartão, sempre por mês. */
  porMes: string;
  /** A mensalidade do plano mensal, para riscar acima do `porMes`. */
  referenciaMensal: string;
  /**
   * Quanto o ciclo inteiro poupa em relação a comprar mês a mês. Nulo quando não
   * há economia -- o caso do mensal sem oferta, onde os dois valores são o mesmo.
   */
  economia: string | null;
  /**
   * O que sai do cartão de crédito neste ciclo.
   *
   * Exposto além da `linhaDeCobranca` porque o diálogo de confirmação mostra o
   * total sozinho, num "Total: R$ 1.209,00" à direita. Sem isto ele recalcularia
   * o valor por conta própria, que é o caminho para o cartão anunciar um número
   * e a confirmação outro -- exatamente o susto que faz desistir da compra.
   */
  total: string;
  /** A linha abaixo do preço, dizendo o que é cobrado e quando. */
  linhaDeCobranca: string;
} {
  const meses = MESES_DO_CICLO[ciclo];
  const mensalCheio = emNumero(plano.pricing.mensal);

  // No mensal o "total do ciclo" é a própria mensalidade; nos outros ele vem da
  // tabela, porque já traz o desconto de período embutido.
  const totalDeTabela = ciclo === "mensal"
    ? mensalCheio
    : emNumero(TOTAIS_DO_CICLO[plano.key]?.[ciclo] ?? plano.pricing.mensal);

  // Contra o ciclo inteiro comprado mês a mês, e não contra a mensalidade: é a
  // economia da decisão, não a de uma parcela.
  const economia = mensalCheio * meses - totalDeTabela;

  return {
    porMes: emReais(totalDeTabela / meses),
    referenciaMensal: emReais(mensalCheio),
    // Meio centavo de arredondamento não é economia. O corte em 0,01 evita um
    // "Economize R$ 0,00" no mensal sem oferta, onde os dois valores são o mesmo.
    economia: economia >= 0.01 ? emReais(economia) : null,
    total: emReais(totalDeTabela),
    linhaDeCobranca: ciclo === "mensal"
      ? "Cobrança mensal recorrente"
      : `Cobrança ${ciclo} de ${emReais(totalDeTabela)}`,
  };
}

/** Respiro mínimo entre o cartão e a borda da janela. */
const RESPIRO_DA_JANELA = 40;

/** Brilho branco atrás do cartão inteiro. */
const BRILHO_DO_CARTAO = "0 0 80px rgba(255, 255, 255, 0.70)";

const ESCALA_DO_SELETOR = 0.9;
/** Aplica a escala e arredonda, porque meio pixel de padding não existe. */
const esc = (valor: number) => Math.round(valor * ESCALA_DO_SELETOR);
const PADDING_VERTICAL_DO_BOTAO = 5;
const FONTE_DO_BOTAO = 12;
const LARGURA_DO_SELETOR = 300;

type PlanKey = keyof typeof STRIPE_PRICES;
type FormaDePagamento = "avista" | "parcelado";

export function OfertaDeContratacao({
  aberto,
  aoFechar,
}: {
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { company, isTrialing } = useCompany();
  const { user } = useAuth();

  const [billingTab, setBillingTab] = useState<BillingTab>("mensal");
  const [confirmPlan, setConfirmPlan] = useState<PlanKey | null>(null);
  const [formaDePagamento, setFormaDePagamento] = useState<FormaDePagamento | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [planoSobMouse, setPlanoSobMouse] = useState<string | null>(null);

  /**
   * Quanto o cartão precisa encolher para caber na janela. Nunca passa de 1: em
   * tela grande ele fica no tamanho de projeto, e sobra espaço em volta.
   *
   * Cobre o zoom do navegador junto com o redimensionamento, e de graça: dar
   * zoom muda o tamanho da janela em pixels de CSS, que é exatamente o que esta
   * conta lê.
   */
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const medir = () => setEscala(Math.min(
      1,
      (window.innerWidth - RESPIRO_DA_JANELA * 2) / LARGURA_DO_CARD,
      (window.innerHeight - RESPIRO_DA_JANELA * 2) / ALTURA_DO_CARD,
    ));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  const handleSelectPlan = (planKey: PlanKey) => {
    setConfirmPlan(planKey);
    // O mensal não passa pela escolha: já é uma cobrança por mês.
    setFormaDePagamento(billingTab === "mensal" ? "avista" : null);
  };

  const fecharConfirmacao = () => {
    setConfirmPlan(null);
    setFormaDePagamento(null);
  };

  /**
   * Checkout parcelado, pela Ticto.
   *
   * Não há sessão a criar como na Stripe: o link já É a oferta, com o preço
   * embutido. O `false` escolhe a oferta de PREÇO CHEIO entre as duas
   * cadastradas na Ticto para cada plano -- a com desconto existe só para o
   * cartão do cadastro.
   */
  const abrirCheckoutTicto = () => {
    if (!confirmPlan) return;
    const link = linkDoParcelado(confirmPlan, billingTab, company?.id, false);
    if (!link) {
      toast.error("Pagamento parcelado indisponível para este plano.");
      return;
    }
    pixelTrack("InitiateCheckout", { content_name: confirmPlan, content_category: "subscription" });
    window.open(link, "_blank");
    fecharConfirmacao();
    setSuccessOpen(true);
  };

  const handleConfirmPlan = async () => {
    if (!user || !company || !confirmPlan) return;

    // Parcelado é outro provedor, outro checkout. Sai antes de tocar no Stripe.
    if (formaDePagamento === "parcelado") {
      abrirCheckoutTicto();
      return;
    }

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
          // Sem isto a edge function aplicaria o cupom de 50% para quem ainda
          // está no teste, cobrando metade de um valor cheio anunciado na tela.
          semOferta: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Erro ao criar sessão de pagamento.");
      window.open(data.url, "_blank");
      fecharConfirmacao();
      setSuccessOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar checkout.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      {/*
        Montado com as primitivas do Radix, e não com o `DialogContent` do
        projeto, por causa de duas coisas que aquele componente fixa e este
        precisa mudar: o véu dele é preto opaco sem desfoque, e o `DialogContent`
        não deixa passar classe para o véu. Aqui o véu desfoca o CRM atrás, que é
        o efeito que a tela do cadastro tem e que esta precisava reproduzir.

        O resto do `DialogContent` também atrapalharia: fundo branco, respiro de
        24px, largura máxima de 512px e um X no canto -- tudo a ser desfeito num
        cartão preto de 980px com o seu próprio botão de fechar.
      */}
      <DialogPrimitive.Root open={aberto} onOpenChange={v => { if (!v) aoFechar(); }}>
        <DialogPrimitive.Portal>
          {/* Só véu, sem desfoque -- como no cartão do cadastro, onde o
              `FundoDoCrmAoVivo` mantém o desfoque do fundo em 0 e escurece a
              tela com um véu de 62%. */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            style={{ background: "rgba(0, 0, 0, 0.62)" }}
          />
          <DialogPrimitive.Content
            // Sem respiro, sem fundo e sem borda: o cartão preto lá dentro é a
            // superfície, e qualquer moldura do diálogo apareceria como um halo
            // claro em volta dele.
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            {/* O leitor de tela precisa de um nome para o diálogo. Visualmente o
                cartão já se apresenta pelo selo e pelos três planos, então o
                título fica só para quem não vê a tela. */}
            <DialogPrimitive.Title className="sr-only">Escolher um plano</DialogPrimitive.Title>

            {/* Caixa que reserva o espaço do cartão JÁ reduzido.

                `transform: scale` encolhe o desenho mas não o espaço que ele
                ocupa: sozinho, o cartão continuaria empurrando 980x652 de
                layout, e a janela ganharia barra de rolagem por causa de um
                vazio. Esta caixa existe só para contar ao layout o tamanho de
                verdade. */}
            <div style={{ width: LARGURA_DO_CARD * escala, height: ALTURA_DO_CARD * escala }}>
              <div
                className="relative rounded-[16px] p-[1px] overflow-hidden"
                style={{
                  width: LARGURA_DO_CARD,
                  height: ALTURA_DO_CARD,
                  transform: `scale(${escala})`,
                  transformOrigin: "top left",
                  boxShadow: BRILHO_DO_CARTAO,
                }}
              >
                {/* Luz que percorre a borda */}
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
                    border: `1px solid ${SITE.verde}`,
                    boxShadow: `inset 0 0 50px ${SITE.brilhoVerde}`,
                  }}
                >
                  <div className="flex-1 flex flex-col px-10 pt-8 pb-6 min-w-0">
                    {/* Título à esquerda, saída à direita.

                        No cadastro este canto direito é o botão de teste grátis.
                        Aqui é o X: quem abriu o Upgrade tem uma tela por trás
                        para voltar, e precisa de um jeito óbvio de fazer isso
                        sem escolher plano nenhum. */}
                    {/* `items-start`, e não `items-center`: com o subtítulo em
                        duas linhas o bloco da esquerda ficou alto, e centrar
                        deixaria o X flutuando no meio dele em vez de no canto. */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* "Rezult" com o degradê verde animado, como no site.

                            A classe `.texto-brilho` do `index.css` é o
                            `em-shine-text` de rezult-site/styles.css portado:
                            mesmo degradê, mesma varredura de 5s. O que ela tem a
                            mais é um recuo para `prefers-reduced-motion` -- sem
                            ele, quem desliga animações veria texto transparente,
                            porque o efeito pinta a letra com o fundo recortado. */}
                        <h2
                          className="text-[25px] font-semibold leading-tight"
                          style={{ color: SITE.texto, letterSpacing: "-0.02em" }}
                        >
                          <span className="texto-brilho">Rezult</span> Planos
                        </h2>

                      </div>

                      <button
                        type="button"
                        onClick={aoFechar}
                        aria-label="Fechar"
                        className="shrink-0 rounded-[7px] p-2 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2"
                        style={{ color: SITE.textoSuave }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="mt-2">
                      {/* Subtítulo à esquerda, seletor de período no centro.

                          Grade de três colunas com a do meio do tamanho do
                          conteúdo e as das pontas iguais (`1fr`), e não um
                          `justify-between`: assim o seletor fica centrado no
                          CARTÃO, e não no espaço que sobra do subtítulo. Com
                          duas colunas, cada palavra a mais no texto empurraria
                          o seletor um pouco para a direita.

                          A terceira coluna fica vazia. É ela que equilibra a
                          primeira -- sem esse contrapeso não há centro. */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-6">
                        {/* A quebra é a do site, e não do acaso da largura: lá a
                            frase também vira depois de "se adequa". Como aqui
                            sobra largura, sem o `<br>` ela sairia numa linha só
                            e ficaria mais comprida que o próprio seletor. */}
                        <p className="text-[13px] leading-[1.4]" style={{ color: SITE.textoSuave }}>
                          Selecione o plano que melhor se adequa<br />ao momento do seu negócio.
                        </p>

                        {/* Seletor de período, idêntico ao `.price-toggle` do site. */}
                        <div
                          className="flex items-center"
                          style={{
                            width: LARGURA_DO_SELETOR,
                            gap: esc(3),
                            padding: esc(4),
                            borderRadius: 100,
                            background: SITE.superficie2,
                            border: `1px solid ${SITE.bordaSuave}`,
                          }}
                        >
                        {(["mensal", "semestral", "anual"] as BillingTab[]).map((tab) => {
                          const ativa = billingTab === tab;
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
                              {/* Quanto se ganha escolhendo este período, como no
                                  site. O selo herda a cor do botão: no ativo, o
                                  verde vira fundo e o texto escurece junto. */}
                              {DESCONTO_DO_PERIODO[tab] && (
                                <span
                                  className="text-[9px] font-semibold rounded-full px-1 py-[1px] shrink-0"
                                  style={{
                                    background: ativa ? "rgba(4,20,13,0.18)" : SITE.brilhoSuave,
                                    color: ativa ? SITE.sobreVerde : SITE.verde,
                                  }}
                                >
                                  {DESCONTO_DO_PERIODO[tab]}
                                </span>
                              )}
                            </button>
                          );
                        })}
                        </div>

                        {/* Contrapeso da coluna do subtítulo. Vazia de
                            propósito: é a existência dela que põe o seletor no
                            centro do cartão. */}
                        <span aria-hidden />
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-4">
                        {PLANS.map((plan) => {
                          const precos = precosDoCartao(plan, billingTab);
                          const destaque = !!plan.badge;
                          return (
                            <div
                              key={plan.key}
                              // O hover é o do site (`.pcard:hover`): sobe 4px e
                              // a borda acende. Vem por estado e não por classe
                              // porque a borda mora no `style` -- uma classe
                              // `hover:border-*` não venceria o inline.
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

                              <h3 className="text-[20px] font-semibold" style={{ color: SITE.texto, letterSpacing: "-0.02em" }}>
                                {plan.name}
                              </h3>

                              {/* Riscado, economia, preço e linha de cobrança.
                                  Os quatro números saem de UMA função, em
                                  `precosDoCartao`, justamente porque precisam
                                  fechar entre si. */}
                              <div className="mt-[2px] mb-4">
                                {/* Riscado a MENSALIDADE, e não o total do ciclo:
                                    o número grande logo abaixo também é por mês,
                                    e assim a comparação se lê sem conta nenhuma.
                                    O valor do ciclo inteiro aparece na linha de
                                    cobrança, onde há espaço para dizer o que ele
                                    é.

                                    Margem NEGATIVA de 3px: a caixa de linha do
                                    texto de 16px carrega uns 4px invisíveis
                                    abaixo das letras, e é neles que ela come,
                                    sem encostar uma linha na outra. */}
                                {precos.economia && (
                                  <div className="flex items-center gap-2 -mb-[3px] min-w-0">
                                    <s className="text-[16px] font-medium shrink-0" style={{ color: SITE.vermelho }}>
                                      {precos.referenciaMensal}
                                    </s>
                                    <span
                                      className="inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5 min-w-0"
                                      style={{ background: SITE.brilhoSuave, color: SITE.verde }}
                                    >
                                      <span className="truncate">Economize {precos.economia}</span>
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-baseline gap-1 flex-wrap">
                                  <span className="text-[26px] font-semibold" style={{ color: SITE.texto, letterSpacing: "-0.04em" }}>
                                    {precos.porMes}
                                  </span>
                                  <span className="text-[13px]" style={{ color: SITE.textoFraco }}>/mês</span>
                                  <span
                                    className="text-[9px] font-semibold px-1.5 py-[3px] rounded-full ml-auto capitalize shrink-0"
                                    style={{ background: SITE.brilhoSuave, color: SITE.verde, letterSpacing: "0.02em" }}
                                  >
                                    {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}
                                  </span>
                                </div>
                                {/* O preço acima é sempre por mês, inclusive no
                                    semestral e no anual. Sem esta linha, quem
                                    escolhe anual vê "R$ 166/mês" e pode entrar
                                    no checkout esperando ser cobrado de 166 em
                                    166. */}
                                <div className="flex items-center gap-2 mt-1 min-w-0">
                                  <p className="text-[11px] min-w-0 truncate" style={{ color: SITE.textoFraco }}>
                                    {precos.linhaDeCobranca}
                                  </p>
                                </div>
                              </div>

                              {/* Botão acima da lista, como no site: quem já
                                  decidiu não precisa varrer oito linhas para
                                  chegar nele.

                                  Sem a pulsação que o cadastro usa. Lá ela existe
                                  para puxar o olho depois que o passo a passo
                                  termina; aqui não houve passo a passo, e três
                                  botões pulsando sozinhos numa tela que a pessoa
                                  abriu de propósito é barulho. */}
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
                                {plan.features.map((recurso, indice) => {
                                  // O primeiro item é o destaque do plano: ponto
                                  // maior e cor verde animada. As duas coisas
                                  // saem da MESMA condição.
                                  const emDestaque = indice === 0;
                                  return (
                                    <li
                                      key={chaveDoRecurso(recurso)}
                                      className={cn(
                                        "flex items-start gap-2 leading-[1.45]",
                                        emDestaque ? "text-[15px]" : "text-[12px]"
                                      )}
                                      style={{ color: SITE.textoSuave }}
                                    >
                                      <Check size={14} strokeWidth={2.5} className="mt-[1px] shrink-0" style={{ color: SITE.verde }} />
                                      <span>
                                        {recurso.forte && (
                                          <b
                                            className={emDestaque ? "texto-brilho" : undefined}
                                            style={{ fontWeight: 600, color: emDestaque ? undefined : SITE.texto }}
                                          >
                                            {recurso.forte}
                                          </b>
                                        )}
                                        {recurso.forte && recurso.resto ? " " : ""}
                                        {recurso.resto}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* ── Confirmação da escolha de plano ──

          Duas telas dentro do MESMO diálogo, decididas por `formaDePagamento`:
          nula, aparece a escolha de como pagar; preenchida, aparece o resumo.
          Duas janelas separadas fariam uma fechar e outra abrir no meio de uma
          decisão de compra, e cada troca dessas é uma chance de desistir. */}
      <Dialog open={!!confirmPlan} onOpenChange={v => { if (!v) fecharConfirmacao(); }}>
        <DialogContent className="max-w-[400px] rounded-[7px] bg-white">
          {confirmPlan && (() => {
            const plan = PLANS.find(p => p.key === confirmPlan)!;
            // Com desconto, como no cartão: se o diálogo mostrasse o preço
            // cheio, a pessoa veria um valor no card e outro maior no passo
            // seguinte, e desistiria achando que foi enganada.
            // Os MESMOS números do cartão, da mesma função. Recalcular aqui era
            // o caminho para o cartão dizer um valor e esta janela dizer outro,
            // no passo em que a pessoa está decidindo pagar.
            const precos = precosDoCartao(plan, billingTab);
            const price = precos.porMes;
            const total = billingTab !== "mensal" ? precos.total : null;
            const periodo = billingTab.charAt(0).toUpperCase() + billingTab.slice(1);

            // ── Passo 1: como pagar (só semestral e anual) ──
            if (formaDePagamento === null) {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-[16px]">Como você prefere pagar?</DialogTitle>
                  </DialogHeader>
                  <p className="text-[13px] text-muted-foreground">
                    {plan.name} — {periodo}, total de{" "}
                    <span className="font-semibold text-foreground">{total}</span>.
                  </p>
                  <div className="flex flex-col gap-2 pt-1">
                    {/* Sem cor diferente entre as duas: aqui não existe opção
                        errada, só caminhos diferentes para a mesma compra. */}
                    <button
                      type="button"
                      onClick={() => setFormaDePagamento("avista")}
                      className="text-left rounded-[5px] border border-gray-200 px-4 py-3 transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <p className="text-[13px] font-semibold text-foreground">À vista</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Uma cobrança única de {total}, no cartão de crédito.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormaDePagamento("parcelado")}
                      className="text-left rounded-[5px] border border-gray-200 px-4 py-3 transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <p className="text-[13px] font-semibold text-foreground">Parcelado</p>
                      {/* O juro é dito aqui, e não no checkout. Parcelado sai
                          mais caro que à vista, e quem descobre isso só na tela
                          de pagamento sente que foi levado. */}
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Parcele em até {PARCELAS_POR_PERIODO[billingTab as "semestral" | "anual"]}x no
                        cartão de crédito, com juros.
                      </p>
                    </button>
                  </div>
                  <div className="pt-2">
                    <Button variant="outline" onClick={fecharConfirmacao} className="w-full rounded-[5px]">
                      Cancelar
                    </Button>
                  </div>
                </>
              );
            }

            // ── Passo 2: resumo e saída para o checkout ──
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-[16px]">Confirmar seleção de plano</DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-3">
                  <div className="flex items-center justify-between py-3 border-y border-gray-100">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{plan.name} — {periodo}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {price}/mês
                        {billingTab !== "mensal" && (formaDePagamento === "avista" ? " · à vista" : " · parcelado")}
                      </p>
                    </div>
                    {total && (
                      <p className="text-[12px] text-muted-foreground">
                        Total: <span className="font-semibold text-foreground">{total}</span>
                      </p>
                    )}
                  </div>
                  {/* A frase sobre o teste só aparece para quem TEM teste
                      correndo. Dizer "o seu teste grátis se encerra" a quem já
                      passou dos 7 dias, ou a quem está trocando de plano pago,
                      seria falar de uma coisa que não existe mais. */}
                  <p className="text-[12px] text-muted-foreground">
                    O checkout será aberto em uma nova aba para concluir o pagamento.
                    {isTrialing
                      ? " A cobrança acontece agora e o seu teste grátis se encerra."
                      : " A cobrança acontece agora."}
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  {/* Voltar, e não Cancelar, quando houve uma escolha antes:
                      quem errou a forma de pagamento quer trocá-la, não sair. */}
                  <Button
                    variant="outline"
                    onClick={() => (billingTab === "mensal" ? fecharConfirmacao() : setFormaDePagamento(null))}
                    className="flex-1 rounded-[5px]"
                  >
                    {billingTab === "mensal" ? "Cancelar" : "Voltar"}
                  </Button>
                  <Button onClick={handleConfirmPlan} disabled={confirming} className="flex-1 rounded-[5px]">
                    {confirming ? "Aguarde..." : "Confirmar"}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Sucesso ── */}
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
