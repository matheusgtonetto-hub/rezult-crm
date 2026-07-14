import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret  = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const META_PIXEL_ID  = Deno.env.get("META_PIXEL_ID")  ?? "";
const META_CAPI_TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";

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

// ── Meta Conversions API ─────────────────────────────────────────────────────
async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str.toLowerCase().trim()),
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendMetaConversion(opts: {
  eventName: string;
  eventId:   string;
  email?:    string | null;
  name?:     string | null;
  value?:    number;
  currency?: string;
  planName?: string;
}) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
    console.warn("[meta-capi] META_PIXEL_ID ou META_CAPI_TOKEN não configurados — evento ignorado");
    return;
  }

  const userData: Record<string, string[]> = {};
  if (opts.email) userData.em = [await sha256hex(opts.email)];
  if (opts.name) {
    const parts = opts.name.trim().split(" ");
    userData.fn = [await sha256hex(parts[0])];
    if (parts.length > 1) userData.ln = [await sha256hex(parts.slice(1).join(" "))];
  }

  const payload = {
    data: [{
      event_name:    opts.eventName,
      event_time:    Math.floor(Date.now() / 1000),
      event_id:      opts.eventId,
      action_source: "website",
      user_data:     userData,
      custom_data: {
        currency:         (opts.currency ?? "BRL").toUpperCase(),
        value:            opts.value ?? 0,
        content_name:     opts.planName ?? "",
        content_category: "subscription",
      },
    }],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    );
    const result = await res.json();
    if (!res.ok) {
      console.error("[meta-capi] erro:", JSON.stringify(result));
    } else {
      console.log(`[meta-capi] ${opts.eventName} enviado — events_received=${result.events_received}`);
    }
  } catch (err) {
    console.error("[meta-capi] falha na requisição:", err);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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

        // Dispara evento de conversão no Meta CAPI
        await sendMetaConversion({
          eventName: "Purchase",
          eventId:   session.id,
          email:     session.customer_details?.email,
          name:      session.customer_details?.name,
          value:     session.amount_total ? session.amount_total / 100 : undefined,
          currency:  session.currency ?? "BRL",
          planName,
        });
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
