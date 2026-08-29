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
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
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
