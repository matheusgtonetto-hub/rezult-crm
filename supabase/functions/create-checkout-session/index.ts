import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

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
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      ...(customerId ? { customer: customerId } : { customer_email: userEmail }),
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { companyId, userId, planName, billingPeriod },
      },
      metadata: { companyId, userId, planName, billingPeriod },
      success_url: "https://app.rezultcrm.com/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return json({ error: "failed to create checkout session" }, 500);
  }
});
