import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

const CORS = {
  "Access-Control-Allow-Origin":  "*",
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

  let body: { customerId: string; returnUrl?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { customerId, returnUrl } = body;
  if (!customerId) return json({ error: "missing customerId" }, 400);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: returnUrl ?? "https://app.rezultcrm.com/configuracoes",
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return json({ error: "failed to create portal session" }, 500);
  }
});
