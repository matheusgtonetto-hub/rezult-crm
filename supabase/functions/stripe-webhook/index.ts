import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, stripe-signature",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing stripe-signature" }, 400);

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return json({ error: "invalid signature" }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session       = event.data.object as Stripe.Checkout.Session;
        const companyId     = session.metadata?.companyId;
        const userId        = session.metadata?.userId;
        const planName      = session.metadata?.planName;
        const billingPeriod = session.metadata?.billingPeriod;

        if (!companyId) {
          console.error("checkout.session.completed: missing companyId in metadata");
          break;
        }

        const subId = session.subscription as string;
        const sub   = await stripe.subscriptions.retrieve(subId);

        await db.from("subscriptions").upsert(
          {
            company_id:               companyId,
            owner_user_id:            userId ?? null,
            stripe_customer_id:       session.customer as string,
            stripe_subscription_id:   subId,
            stripe_price_id:          sub.items.data[0]?.price.id ?? null,
            plan_name:                planName ?? null,
            billing_period:           billingPeriod ?? null,
            status:                   sub.status,
            trial_ends_at:            sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            current_period_start:     new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end:       new Date(sub.current_period_end * 1000).toISOString(),
            updated_at:               new Date().toISOString(),
          },
          { onConflict: "stripe_subscription_id" },
        );

        if (planName) {
          await db.from("companies")
            .update({
              plan:            planName,
              plan_expires_at: new Date(sub.current_period_end * 1000).toISOString(),
            })
            .eq("id", companyId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub       = event.data.object as Stripe.Subscription;
        const companyId = sub.metadata?.companyId;

        await db.from("subscriptions")
          .update({
            status:               sub.status,
            stripe_price_id:      sub.items.data[0]?.price.id ?? null,
            trial_ends_at:        sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(sub.current_period_end * 1000).toISOString(),
            canceled_at:          sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
            updated_at:           new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        if (companyId) {
          await db.from("companies")
            .update({ plan_expires_at: new Date(sub.current_period_end * 1000).toISOString() })
            .eq("id", companyId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub       = event.data.object as Stripe.Subscription;
        const companyId = sub.metadata?.companyId;

        await db.from("subscriptions")
          .update({
            status:      "canceled",
            canceled_at: new Date().toISOString(),
            updated_at:  new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        if (companyId) {
          await db.from("companies")
            .update({ plan: "free" })
            .eq("id", companyId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId   = invoice.subscription as string;
        if (subId) {
          await db.from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error("Error processing webhook event:", err);
    return json({ error: "internal error" }, 500);
  }

  return json({ received: true });
});
