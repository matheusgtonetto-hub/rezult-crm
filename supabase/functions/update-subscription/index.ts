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

    // O período vem do topo da Subscription na versão de API fixada acima, mas
    // a Stripe moveu esse campo para os itens em versões novas. Ler os dois e
    // tolerar a ausência evita o "Invalid time value" que já derrubou o webhook.
    // deno-lint-ignore no-explicit-any
    const bruto = updatedSub as any;
    const fimEpoch: unknown = bruto?.current_period_end ?? bruto?.items?.data?.[0]?.current_period_end;
    const fimDoPeriodo = typeof fimEpoch === "number" && Number.isFinite(fimEpoch)
      ? new Date(fimEpoch * 1000).toISOString()
      : null;

    // A assinatura registra a troca sempre: é o espelho do que existe na Stripe.
    await db
      .from("subscriptions")
      .update({
        stripe_price_id:      newPriceId,
        plan_name:            planName,
        billing_period:       billingPeriod,
        status:               updatedSub.status,
        ...(fimDoPeriodo ? { current_period_end: fimDoPeriodo } : {}),
        updated_at:           new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscriptionId);

    // A empresa, não. Antes o plano novo e a validade eram gravados aqui logo
    // depois da chamada à Stripe, sem olhar se a cobrança da diferença passou:
    // um upgrade com cartão recusado era aplicado do mesmo jeito. Agora só vale
    // com a assinatura em dia, e quem paga depois é liberado pelo stripe-webhook
    // quando o invoice.payment_succeeded chegar.
    const emDia = updatedSub.status === "active" || updatedSub.status === "trialing";

    if (!emDia) {
      console.warn(
        `[update-subscription] ${subscriptionId} ficou em "${updatedSub.status}" após a troca para ${planName}.`,
        "Plano NÃO aplicado na empresa; aguardando confirmação de pagamento.",
      );
      return json({ success: false, pendingPayment: true, status: updatedSub.status });
    }

    await db
      .from("companies")
      .update({
        plan: planName,
        ...(fimDoPeriodo ? { plan_expires_at: fimDoPeriodo } : {}),
        billing_status:      "ok",
        billing_grace_until: null,
      })
      .eq("id", companyId);

    return json({ success: true });
  } catch (err) {
    console.error("Stripe update error:", err);
    return json({ error: "failed to update subscription" }, 500);
  }
});
