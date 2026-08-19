import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

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

// Quando a assinatura deve começar a cobrar.
//
// Os dois períodos não podem somar. Quem assina no último passo do cadastro tem
// 7 dias sem cobrança e paga no fim deles; quem deixou o teste vencer e só depois
// contratou paga na hora, porque já usou os 7 dias.
//
// Por isso data absoluta em vez de `trial_period_days`: o dia da cobrança é o
// mesmo quer a assinatura saia no primeiro ou no quinto dia do teste. Com
// trial_period_days, assinar no quinto dia daria 12 dias grátis.
//
// A Stripe recusa `trial_end` a menos de 48h de distância. Sobrando menos que
// isso, devolve null e a cobrança é imediata: melhor adiantar no máximo dois
// dias do que conceder um período novo por cima do que já foi usado.
export function fimDoTrialDaStripe(
  trialEndsAt: string | null | undefined,
  agoraEmMs: number = Date.now(),
): number | null {
  if (!trialEndsAt) return null;

  const fimEmMs = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(fimEmMs)) return null;

  const MINIMO_DA_STRIPE_EM_MS = 48 * 60 * 60 * 1000;
  if (fimEmMs - agoraEmMs < MINIMO_DA_STRIPE_EM_MS) return null;

  return Math.floor(fimEmMs / 1000);
}

serve(async (req) => {
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

  const { priceId, companyId, userId, userEmail, planName, billingPeriod, customerId } = body;
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

    const trialEnd = fimDoTrialDaStripe(co?.trial_ends_at as string | null);

    console.log(
      `[create-checkout-session] empresa=${companyId} fim_do_teste=${co?.trial_ends_at ?? "nenhum"}`,
      trialEnd
        ? `→ trial ate ${new Date(trialEnd * 1000).toISOString()}`
        : "→ sem trial, cobranca imediata",
    );

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        metadata: { companyId, userId, planName, billingPeriod },
      },
      metadata: { companyId, userId, planName, billingPeriod },
      allow_promotion_codes: true,
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
