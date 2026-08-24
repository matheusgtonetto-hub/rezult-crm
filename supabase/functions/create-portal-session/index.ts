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

    /**
     * A mensagem que volta para a tela precisa dizer o que fazer.
     *
     * Antes voltava sempre "failed to create portal session", em inglês e sem
     * pista nenhuma: os dois motivos possíveis (cliente de outra conta Stripe e
     * portal não configurado) exigem ações completamente diferentes, e a tela
     * mostrava a mesma frase para os dois. O texto do Stripe fica no log; para
     * o usuário vai a tradução do caso.
     */
    const e = err as { code?: string; message?: string };

    // O id gravado no banco não existe NESTA conta Stripe. Acontece quando a
    // assinatura nasceu em outra conta (ou no modo de teste) e a chave atual é
    // de outra: o cliente existe, só não onde a chave enxerga.
    if (e?.code === "resource_missing") {
      return json({
        error: "Esta assinatura foi criada em outra conta de cobrança e não pode ser gerenciada por aqui. Fale com o suporte para revincular.",
      }, 409);
    }

    // Portal nunca salvo no painel do Stripe. Some assim que alguém salvar as
    // configurações em Settings > Billing > Customer portal.
    if (e?.message?.includes("configuration")) {
      return json({
        error: "O portal de pagamento ainda não foi configurado no Stripe.",
      }, 500);
    }

    return json({ error: e?.message ?? "Não foi possível abrir o portal de pagamento." }, 500);
  }
});
