import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "method not allowed" }, 405);

  try {
  const clientId     = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
  const redirectUri  = Deno.env.get("GOOGLE_REDIRECT_URI") ?? "";
  const supabaseUrl  = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  console.log("[oauth] clientId:", clientId ? clientId.slice(0, 20) + "..." : "VAZIO");
  console.log("[oauth] redirectUri:", redirectUri || "VAZIO");
  console.log("[oauth] serviceKey:", serviceKey ? "ok" : "VAZIO");

  // Extrai user_id do JWT do Supabase
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt        = authHeader.replace(/^Bearer\s+/i, "");
  console.log("[oauth] jwt presente:", jwt ? "sim" : "NÃO");

  let body: { code?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const { code } = body;
  console.log("[oauth] code recebido:", code ? code.slice(0, 12) + "..." : "VAZIO");
  if (!code) return json({ error: "missing code" }, 400);

  // Identifica o usuário via JWT
  const db = createClient(supabaseUrl, serviceKey);
  const authResult = await db.auth.getUser(jwt);
  console.log("[oauth] getUser error:", authResult.error?.message ?? "nenhum");
  const user = authResult.data?.user;
  if (authResult.error || !user) return json({ error: "unauthorized", detail: authResult.error?.message }, 401);

  // 1. Troca o code pelo token Google
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    console.error("Google token error:", detail);
    return json({ error: "google_token_exchange_failed", detail }, 502);
  }

  const tokenData = await tokenRes.json() as {
    access_token:  string;
    refresh_token?: string;
    expires_in?:   number;
    scope?:        string;
  };

  // 2. Busca o email do usuário Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const googleUser = userInfoRes.ok
    ? await userInfoRes.json() as { email?: string }
    : { email: undefined };

  const tokenExpiry = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  const scopes = tokenData.scope ? tokenData.scope.split(" ") : [];

  // 3. Upsert em google_oauth_tokens (um registro por user_id)
  const { error: upsertErr } = await db
    .from("google_oauth_tokens")
    .upsert(
      {
        user_id:       user.id,
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        token_expiry:  tokenExpiry,
        email:         googleUser.email ?? null,
        scopes,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertErr) {
    console.error("Upsert error:", upsertErr);
    return json({ error: "db_error", detail: upsertErr.message }, 500);
  }

  return json({ success: true, email: googleUser.email ?? null }, 200);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oauth] CRASH não capturado:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
