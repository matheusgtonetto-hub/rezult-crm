import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Lido aqui (dentro do handler) para sempre pegar o valor atual do secret,
  // mesmo em instâncias warm sem redeploy.
  const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

  if (!TURNSTILE_SECRET) {
    console.error("TURNSTILE_SECRET_KEY não configurado");
    return json({ error: "configuração ausente" }, 500);
  }

  let token: string;
  try {
    const body = await req.json();
    token = body.token;
  } catch {
    return json({ error: "body inválido" }, 400);
  }

  if (!token) return json({ success: false, error: "token ausente" }, 400);

  // Usa application/x-www-form-urlencoded (formato esperado pelo Cloudflare)
  const params = new URLSearchParams();
  params.set("secret", TURNSTILE_SECRET);
  params.set("response", token);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await res.json();
  console.log("Turnstile siteverify:", JSON.stringify(data));

  if (!data.success) {
    return json({ success: false, error: "verificação falhou", codes: data["error-codes"] }, 400);
  }

  return json({ success: true });
});
