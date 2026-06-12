import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

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
    subscriptionId: string;
    newPriceId: string;
    planName: string;
    billingPeriod: string;
    companyId: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { subscriptionId, newPriceId, planName, billingPeriod, companyId } = body;
  if (!subscriptionId || !newPriceId || !planName || !companyId) {
    return json({ error: "missing required fields" }, 400);
  }

  try {
    const currentSub = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = currentSub.items.data[0]?.id;
    if (!itemId) return json({ error: "subscription item not found" }, 400);

    const updatedSub = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: "create_prorations",
      metadata: { planName, billingPeriod, companyId },
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    await db
      .from("subscriptions")
      .update({
        stripe_price_id:      newPriceId,
        plan_name:            planName,
        billing_period:       billingPeriod,
        status:               updatedSub.status,
        current_period_end:   new Date(updatedSub.current_period_end * 1000).toISOString(),
        updated_at:           new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscriptionId);

    await db
      .from("companies")
      .update({
        plan:            planName,
        plan_expires_at: new Date(updatedSub.current_period_end * 1000).toISOString(),
      })
      .eq("id", companyId);

    return json({ success: true });
  } catch (err) {
    console.error("Stripe update error:", err);
    return json({ error: "failed to update subscription" }, 500);
  }
});
