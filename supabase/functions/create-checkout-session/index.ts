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
      .select("name, email, phone, address, number, complement, neighborhood, city, state, zip_code, country")
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
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
