import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl   = Deno.env.get("SUPABASE_URL")!;
const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// Statuses aceitos pelo CHECK constraint da tabela
const VALID_STATUSES = new Set(["trialing", "active", "past_due", "canceled", "unpaid"]);

function normalizeStatus(raw: string): string {
  if (VALID_STATUSES.has(raw)) return raw;
  // incomplete / incomplete_expired → active (pagamento pode ainda completar)
  console.warn(`[webhook] status Stripe inesperado "${raw}" → normalizando para "active"`);
  return "active";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("[webhook] stripe-signature header ausente");
    return json({ error: "missing stripe-signature" }, 400);
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    // Erro aqui quase sempre = STRIPE_WEBHOOK_SECRET incorreto.
    // Certifique-se que o secret no Supabase é o do Dashboard → Webhooks → endpoint,
    // NÃO o secret local do "stripe listen".
    console.error("[webhook] falha na verificação de assinatura:", err);
    console.error("[webhook] DICA: confirme que STRIPE_WEBHOOK_SECRET é o signing secret do endpoint de produção no Stripe Dashboard");
    return json({ error: "invalid signature" }, 400);
  }

  console.log(`[webhook] evento recebido: ${event.type} id=${event.id}`);

  const db = createClient(supabaseUrl, serviceKey);

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session       = event.data.object as Stripe.Checkout.Session;
        const companyId     = session.metadata?.companyId;
        const userId        = session.metadata?.userId;
        const planName      = session.metadata?.planName;
        const billingPeriod = session.metadata?.billingPeriod;

        console.log("[checkout.session.completed] metadata:", { companyId, userId, planName, billingPeriod });
        console.log("[checkout.session.completed] customer:", session.customer, "subscription:", session.subscription);

        if (!companyId) {
          console.error("[checkout.session.completed] companyId ausente no metadata — abortando");
          break;
        }

        const subId = session.subscription as string | null;
        if (!subId) {
          console.error("[checkout.session.completed] session.subscription é null — modo não-subscription?");
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subId);
        console.log("[checkout.session.completed] subscription recuperada: status=", sub.status, "trial_end=", sub.trial_end);

        const upsertData = {
          company_id:             companyId,
          owner_user_id:          userId   ?? null,
          stripe_customer_id:     session.customer as string,
          stripe_subscription_id: subId,
          stripe_price_id:        sub.items.data[0]?.price.id ?? null,
          plan_name:              planName      ?? null,
          billing_period:         billingPeriod ?? null,
          status:                 normalizeStatus(sub.status),
          trial_ends_at:          sub.trial_end
                                    ? new Date(sub.trial_end * 1000).toISOString()
                                    : null,
          current_period_start:   new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:     new Date(sub.current_period_end   * 1000).toISOString(),
          updated_at:             new Date().toISOString(),
        };

        console.log("[checkout.session.completed] upsert payload:", upsertData);

        const { error: upsertErr } = await db
          .from("subscriptions")
          .upsert(upsertData, { onConflict: "stripe_subscription_id" });

        if (upsertErr) {
          console.error("[checkout.session.completed] erro no upsert subscriptions:", upsertErr);
          throw new Error(`Upsert subscriptions falhou: ${upsertErr.message}`);
        }

        console.log("[checkout.session.completed] subscription salva com sucesso");

        if (planName) {
          const { error: companyErr } = await db
            .from("companies")
            .update({
              plan:            planName,
              plan_expires_at: new Date(sub.current_period_end * 1000).toISOString(),
            })
            .eq("id", companyId);

          if (companyErr) {
            console.error("[checkout.session.completed] erro ao atualizar companies:", companyErr);
          } else {
            console.log("[checkout.session.completed] companies atualizado: plan=", planName);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        console.log("[customer.subscription.updated] sub.id=", sub.id, "status=", sub.status);

        const { error: updateErr } = await db
          .from("subscriptions")
          .update({
            status:               normalizeStatus(sub.status),
            stripe_price_id:      sub.items.data[0]?.price.id ?? null,
            trial_ends_at:        sub.trial_end
                                    ? new Date(sub.trial_end * 1000).toISOString()
                                    : null,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
            canceled_at:          sub.canceled_at
                                    ? new Date(sub.canceled_at * 1000).toISOString()
                                    : null,
            updated_at:           new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        if (updateErr) {
          console.error("[customer.subscription.updated] erro no update:", updateErr);
        }

        const companyId = sub.metadata?.companyId;
        if (companyId) {
          await db
            .from("companies")
            .update({ plan_expires_at: new Date(sub.current_period_end * 1000).toISOString() })
            .eq("id", companyId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub       = event.data.object as Stripe.Subscription;
        const companyId = sub.metadata?.companyId;
        console.log("[customer.subscription.deleted] sub.id=", sub.id);

        await db
          .from("subscriptions")
          .update({
            status:      "canceled",
            canceled_at: new Date().toISOString(),
            updated_at:  new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        if (companyId) {
          await db.from("companies").update({ plan: "free" }).eq("id", companyId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId   = invoice.subscription as string | null;
        console.log("[invoice.payment_failed] subId=", subId);
        if (subId) {
          await db
            .from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
        }
        break;
      }

      default:
        console.log(`[webhook] evento ignorado: ${event.type}`);
    }
  } catch (err) {
    console.error("[webhook] erro ao processar evento:", err);
    return json({ error: "internal error" }, 500);
  }

  return json({ received: true });
});
