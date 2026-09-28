// Imports por `npm:`, e não pelo esm.sh.
//
// O esm.sh entrega o pacote já convertido para o navegador e, para isso, injeta
// polyfills de Node vindos do `deno.land/std`. Esses arquivos são baixados na
// hora de empacotar a função, e o `deno.land` vinha dando timeout: em 28/08/2026
// o webhook ficou dias fora do ar sem conseguir subir por causa disso -- primeiro
// pelo import direto do std, depois por dentro do SDK da Stripe
// (esm.sh/stripe -> object-inspect -> deno.land/std/node/util.ts).
//
// O `npm:` é resolvido pelo próprio runtime, que já traz a compatibilidade com
// Node embutida. Tira o `deno.land` inteiro do grafo de dependências e o deploy
// deixa de depender de um CDN de terceiro estar respondendo.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";
import { cotacaoDoDolar } from "../_shared/cambio.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

/**
 * Cupom de 50% da primeira contratação, criado no painel da Stripe.
 *
 * Vem do ambiente, e não escrito aqui, para trocar ou encerrar a promoção sem
 * deploy. Ausente, o checkout simplesmente sai sem desconto -- a venda continua
 * acontecendo, que é melhor do que quebrar por causa de uma variável faltando.
 */
const CUPOM_PRIMEIRA_COMPRA = Deno.env.get("STRIPE_COUPON_PRIMEIRA_COMPRA") ?? "";

/**
 * ─── Compra de crédito de IA (passo 4 do plano do saldo) ────────────────────
 *
 * `1.070 créditos por dólar pago` é a taxa de VENDA, com markup de 30% sobre o
 * custo efetivo (dono, 25/09/2026). **Mora só aqui**: a cópia que existia em
 * `src/components/SaldoDeCreditos.tsx` saiu junto com a previsão de créditos na
 * tela, e com ela foi embora o risco de as duas divergirem.
 *
 * ─── Como 1.070 sai de "30%" ────────────────────────────────────────────────
 *
 * O markup é sobre o custo EFETIVO, não sobre o preço de tabela do fornecedor:
 * comprar US$ 1 de custo custa US$ 1,0764, porque o IOF (3,5%) e o spread do
 * cartão (~4%) incidem na recarga.
 *
 *     1500 / (1,30 x 1,0764) = 1072,3  ->  1.070
 *
 * Arredondado para BAIXO de propósito: menos crédito por dólar empurra o markup
 * para cima (30,24%), e o erro de arredondamento deve cair do lado seguro.
 * Margem líquida depois de Stripe (3,99%) e imposto (6%): ~13,2%.
 *
 * A outra taxa, 1.500 créditos por dólar de CUSTO, vive em `debitar_credito` no
 * banco e é FIXA: ela define a unidade, e mudá-la mudaria o significado de todo
 * saldo já vendido. Ver a migration 20260925000002.
 */
const CREDITOS_POR_DOLAR_DE_CUSTO = 1500;

/**
 * Markup sobre o custo EFETIVO (dono, 25/09/2026).
 *
 * Efetivo, e não o preço de tabela do fornecedor: comprar US$ 1 de custo sai
 * por US$ 1,0764, porque o IOF (3,5%) e o spread do cartão (~4%) incidem na
 * recarga da OpenAI. É a única definição em que "30% de markup" significa 30%
 * acima do que sai do bolso.
 */
const MARKUP = 1.30;
const CUSTO_DE_AQUISICAO = 1.0764;

/**
 * Quantos créditos cada REAL compra, na cotação do momento.
 *
 *     creditos = reais x 1500 / (cotacao x 1,0764 x 1,30)
 *
 * A US$ 5,1991 (PTAX de 25/09/2026) isso dá ~206 créditos por real, ou
 * R$ 48,50 pelos 10.000 créditos.
 *
 * ─── Por que em real, e não mais em dólar ──────────────────────────────────
 *
 * A conta Stripe é brasileira e liquida em real. Preço em USD nela não traz
 * dólar: traz real convertido pelo Stripe, joga IOF no cartão do cliente e
 * desliga o Adaptive Pricing, que converte DA moeda da conta PARA a do
 * cliente. Ver a migration 20260928000001.
 */
function creditosPorReal(cotacao: number): number {
  return CREDITOS_POR_DOLAR_DE_CUSTO / (cotacao * CUSTO_DE_AQUISICAO * MARKUP);
}

/**
 * Mínimo, em real (dono, 28/09/2026).
 *
 * Era R$ 50, escolhido para ficar acima do piso de recarga de US$ 5 da OpenAI.
 * Esse raciocínio estava errado: o piso da OpenAI vale para CADA recarga nossa,
 * e o hedge recarrega acompanhando o passivo TOTAL, não venda a venda. Uma
 * compra de R$ 25 se soma às outras antes de virar recarga.
 *
 * O que R$ 25 custa de verdade é margem: a taxa fixa do Stripe (R$ 0,39) pesa
 * 1,56% num pedido desse tamanho contra 0,08% num de R$ 500, e a margem cai de
 * 13,0% para 11,5%.
 */
const COMPRA_MINIMA_BRL = 25;

/**
 * Máximo. Não é desconfiança do cliente, é proteção contra dedo errado: um
 * zero a mais em "1500" vira uma cobrança de R$ 15.000, e desfazer isso custa
 * estorno, taxa e uma conversa ruim.
 */
const COMPRA_MAXIMA_BRL = 15000;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Sem trial na assinatura: quem contrata paga na hora.
//
// A assinatura já vinha com `trial_end` na data em que o teste grátis acabaria,
// para os dois períodos não se somarem. Isso saiu quando a oferta de 50% passou
// a valer pelos sete dias do teste: os dias que sobram e o desconto viraram uma
// TROCA, não duas coisas que se acumulam. Quem assina no primeiro dia abre mão
// do que restava de teste e leva metade do preço; quem prefere usar os sete dias
// inteiros assina depois, pelo mesmo desconto, e só então começa a pagar.
//
// Consequência que a tela precisa dizer: a cobrança acontece no ato e o teste
// encerra ali. Sem isso, quem assina no dia 1 é cobrado sem esperar.

// `Deno.serve`, e não o `serve` do deno.land/std.
//
// O std é buscado pela rede na hora de empacotar a função, e essa busca dá
// timeout com frequência -- foi o que impediu este deploy em 28/08/2026, com o
// webhook fora do ar. O `Deno.serve` é nativo do runtime: não baixa nada, então
// o deploy deixa de depender de um CDN externo estar respondendo.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: {
    priceId: string;
    companyId: string;
    userId: string;
    userEmail: string;
    planName: string;
    billingPeriod: string;
    customerId?: string;
    semOferta?: boolean;
    /** "credito" entra no caminho de compra de saldo. Ausente = assinatura. */
    tipo?: string;
    /** Só em tipo="credito": quanto o cliente quer pôr, em REAL. */
    valorBrl?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  /*
   * ─── Compra de crédito: caminho separado, e curto de propósito ────────────
   *
   * Sai antes de toda a lógica de assinatura (cupom da primeira contratação,
   * janela do teste grátis, `subscription_data`) porque nada daquilo se aplica
   * a um pagamento único de saldo. Misturar os dois num só fluxo seria pedir
   * para o cupom de 50% um dia cair numa compra de crédito.
   */
  if (body.tipo === "credito") {
    const { companyId, userId, userEmail, valorBrl } = body;
    if (!companyId || !userId || !userEmail) {
      return json({ error: "missing required fields" }, 400);
    }

    const valor = Number(valorBrl);
    if (!Number.isFinite(valor) || valor < COMPRA_MINIMA_BRL || valor > COMPRA_MAXIMA_BRL) {
      return json({ error: "valor_invalido", minimo: COMPRA_MINIMA_BRL, maximo: COMPRA_MAXIMA_BRL }, 400);
    }

    const db = createClient(supabaseUrl, serviceKey);

    /*
     * A cotação ANTES de criar a sessão, e falhando alto se não houver.
     *
     * Sem ela não dá para saber quantos créditos aquele real compra. Vender
     * assim mesmo, com um número chutado, transformaria uma falha visível num
     * prejuízo silencioso que só apareceria na recarga do mês seguinte.
     */
    let cotacao: number;
    try {
      cotacao = (await cotacaoDoDolar(db)).valor;
    } catch (err) {
      console.error("[create-checkout-session] sem cotacao do dolar:", err);
      return json({ error: "cotacao_indisponivel" }, 503);
    }

    // Centavos inteiros: o Stripe recusa fração de centavo, e `Math.round`
    // evita que 50.005 vire 5000.4999999 por aritmética de ponto flutuante.
    const centavos = Math.round(valor * 100);
    const pagoBrl  = centavos / 100;
    const creditos = Math.floor(pagoBrl * creditosPorReal(cotacao));
    /*
     * O equivalente em dólar da RECEITA, na cotação do dia.
     *
     * NÃO é o que vamos gastar na OpenAI, e a diferença importa: R$ 25 valem
     * US$ 4,80 de receita, mas compram só US$ 3,43 de trabalho -- o resto é
     * IOF, spread e margem. Quem soma contra a fatura do fornecedor é
     * `custo_usd` das linhas de CONSUMO, não este campo.
     *
     * Serve para medir a margem realizada: receita em dólar contra custo em
     * dólar, sem o câmbio no meio distorcendo a comparação entre meses.
     */
    const pagoUsd  = Number((pagoBrl / cotacao).toFixed(2));

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: userEmail,
        line_items: [{
          quantity: 1,
          price_data: {
            /*
             * REAL, a moeda da conta.
             *
             * Era USD, e isso desligava o Adaptive Pricing: ele converte DA
             * moeda da conta PARA a do cliente, e com a moeda já forçada em
             * dólar não sobrava o que adaptar -- o brasileiro via "US$ 10,00"
             * e pagava IOF do próprio banco. Em real, ele vê real, e o
             * estrangeiro passa a ver a moeda dele.
             *
             * A tabela de preço não envelhece porque o valor vem da cotação
             * do momento, e o hedge compra os dólares na mesma cotação.
             */
            currency: "brl",
            unit_amount: centavos,
            /*
             * A descrição NÃO diz quantos créditos são.
             *
             * Ela trazia "26.750 créditos para os agentes de IA", e isso
             * aparece na página de pagamento do Stripe. Anunciar a quantidade
             * torna a TAXA pública, e com ela todo reajuste futuro fica
             * visível: quem comprou a 1.070 por dólar e voltar a 830 lê um
             * aumento de 29%. Poder reajustar sem essa comparação é a razão de
             * o saldo ser em créditos (secao 4.1 do plano).
             *
             * O concorrente faz igual: cobra "US$ 10,00" de "Ribas credits" e
             * em nenhum momento diz quantos créditos são.
             *
             * A quantidade continua no `metadata`, que é interno e é de onde o
             * webhook credita. O cliente a descobre no saldo, depois de pagar.
             */
            product_data: { name: "Créditos Rezult" },
          },
        }],
        /*
         * `creditos` e `pagoUsd` viajam no metadata, calculados AQUI.
         *
         * O webhook credita a partir deste número, e não de `amount_total`, por
         * dois motivos. O primeiro é que com a conversão automática do Stripe o
         * `amount_total` pode vir na moeda de apresentação (real), e creditar
         * "135 x 1070" seria catastrófico. O segundo é que este valor nasce do
         * mesmo `valor` que foi cobrado: o cliente não consegue inflar um sem
         * inflar o outro.
         */
        metadata: {
          companyId, userId, tipo: "credito",
          creditos: String(creditos),
          pagoBrl:  String(pagoBrl),
          pagoUsd:  String(pagoUsd),
          cotacao:  String(cotacao),
        },
        // Sem `allow_promotion_codes`: cupom em compra de saldo daria crédito
        // acima do que foi pago, e o markup de 30% não tem folga para isso.
        success_url: "https://app.rezultcrm.com/agentes?credito=ok",
        cancel_url:  "https://app.rezultcrm.com/agentes",
      });

      console.log(`[create-checkout-session] credito: empresa=${companyId} R$ ${pagoBrl} (cotacao ${cotacao}, ~US$ ${pagoUsd}) -> ${creditos} creditos sessao=${session.id}`);
      return json({ url: session.url });
    } catch (err) {
      console.error("[create-checkout-session] credito falhou:", err);
      return json({ error: "failed to create checkout session" }, 500);
    }
  }

  const { priceId, companyId, userId, userEmail, planName, billingPeriod, customerId, semOferta } = body;
  if (!priceId || !companyId || !userId || !userEmail) {
    return json({ error: "missing required fields" }, 400);
  }

  try {
    // Busca dados da empresa para preencher corretamente o cliente Stripe
    const db = createClient(supabaseUrl, serviceKey);

    const { data: co } = await db
      .from("companies")
      .select("name, email, phone, address, number, complement, neighborhood, city, state, zip_code, country, trial_ends_at")
      .eq("id", companyId)
      .single();

    const billingEmail = co?.email || userEmail;
    const billingName  = co?.name  || undefined;
    const billingPhone = co?.phone || undefined;

    const billingAddress = co?.city ? {
      line1:       [co.address, co.number].filter(Boolean).join(", ") || undefined,
      line2:       [co.complement, co.neighborhood].filter(Boolean).join(", ") || undefined,
      city:        co.city        || undefined,
      state:       co.state       || undefined,
      postal_code: co.zip_code    || undefined,
      country:     co.country     || "BR",
    } : undefined;

    // Resolve o customer Stripe: usa existente ou cria novo com dados da empresa
    let stripeCustomerId = customerId ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email:   billingEmail,
        name:    billingName,
        phone:   billingPhone,
        ...(billingAddress ? { address: billingAddress } : {}),
        metadata: { companyId, userId },
      });
      stripeCustomerId = customer.id;
    }

    /**
     * O desconto vale enquanto o teste grátis estiver correndo.
     *
     * A janela é checada AQUI, e não no `redeem_by` do cupom, porque aquele é
     * uma data única para todo mundo. Comparando com o `trial_ends_at` da
     * empresa, cada cliente ganha os seus próprios sete dias, contados da
     * criação da conta dele.
     *
     * A MESMA regra está escrita no frontend, em
     * `src/data/ofertaDePrimeiraContratacao.ts` (`ofertaEstaValida`), que decide
     * se a tela mostra os preços com desconto. São dois runtimes e o código não
     * é compartilhável, então a regra é uma linha só de propósito -- quanto mais
     * simples, menos chance de as duas cópias divergirem.
     *
     * Mudou aqui? Mude lá. Divergirem significa a tela anunciar 50% e o
     * checkout cobrar cheio, que é o defeito mais caro que esta tela pode ter.
     *
     * ── `semOferta`: estar na janela não basta ──
     *
     * A oferta é EXCLUSIVA de um caminho: a tarja do teste grátis, que leva ao
     * cartão do cadastro. O diálogo de Upgrade em Configurações vende os mesmos
     * planos a preço cheio, inclusive para quem ainda está nos sete dias -- e
     * ele manda `semOferta: true` para dizer isso.
     *
     * Sem esta chave, aquele diálogo mostraria preço cheio na tela e a Stripe
     * aplicaria o cupom mesmo assim, cobrando metade. Divergência ao contrário
     * da de cima: não prejudica o cliente, mas entrega de graça o desconto que a
     * tarja existe para tornar especial.
     *
     * Quem manda a chave é o cliente, e isso é seguro pela direção do efeito:
     * ela só consegue TIRAR o desconto. Para dar, a empresa ainda precisa estar
     * dentro da janela, o que é verificado aqui com dados do banco.
     */
    const dentroDaJanela =
      !!co?.trial_ends_at && new Date(co.trial_ends_at as string).getTime() > Date.now();
    const aplicaCupom = !!CUPOM_PRIMEIRA_COMPRA && dentroDaJanela && semOferta !== true;

    console.log(
      `[create-checkout-session] empresa=${companyId} fim_do_teste=${co?.trial_ends_at ?? "nenhum"}`,
      "→ sem trial na assinatura, cobranca imediata",
      aplicaCupom
        ? `| cupom ${CUPOM_PRIMEIRA_COMPRA} aplicado`
        : `| sem cupom (${
            !CUPOM_PRIMEIRA_COMPRA ? "nao configurado"
            : semOferta === true    ? "pedido sem oferta (upgrade)"
            : "fora da janela do teste"
          })`,
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { companyId, userId, planName, billingPeriod },
      },
      metadata: { companyId, userId, planName, billingPeriod },
      // Um OU outro, nunca os dois: a Stripe recusa a sessão que traz
      // `discounts` e `allow_promotion_codes` juntos.
      //
      // Com o cupom, ele já entra aplicado e a pessoa vê o valor com desconto no
      // resumo, sem digitar nada. Sem o cupom, o campo de código promocional
      // volta a aparecer, que é o comportamento de antes.
      ...(aplicaCupom
        ? { discounts: [{ coupon: CUPOM_PRIMEIRA_COMPRA }] }
        : { allow_promotion_codes: true }),
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      success_url: "https://app.rezultcrm.com/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://app.rezultcrm.com/configuracoes/planos",
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return json({ error: "failed to create checkout session" }, 500);
  }
});
