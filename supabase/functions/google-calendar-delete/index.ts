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
    const clientId     = Deno.env.get("GOOGLE_CLIENT_ID")           ?? "";
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")        ?? "";
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")                ?? "";
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")   ?? "";

    const authHeader = req.headers.get("authorization") ?? "";
    const jwt        = authHeader.replace(/^Bearer\s+/i, "");

    // Mesmo caminho server-to-server da google-calendar-event: sem ele, só
    // o navegador conseguia apagar evento, e o agente não tinha como
    // cancelar uma reunião (ex.: lead desmarca) -- ficava um evento morto na
    // agenda do vendedor pra sempre.
    const internalSecretHeader = req.headers.get("x-internal-secret") ?? "";
    const configuredInternalSecret = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";
    const isInternalCall = configuredInternalSecret !== "" && internalSecretHeader === configuredInternalSecret;

    let body: { event_id?: string; company_id?: string; user_id?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const { event_id, company_id, user_id: bodyUserId } = body;
    if (!event_id) return json({ error: "missing event_id" }, 400);
    if (isInternalCall && !bodyUserId) return json({ error: "missing required field: user_id" }, 400);

    const db = createClient(supabaseUrl, serviceKey);
    let userId: string;
    if (isInternalCall) {
      userId = bodyUserId!;
    } else {
      const { data: { user }, error: authError } = await db.auth.getUser(jwt);
      if (authError || !user) return json({ error: "unauthorized" }, 401);
      userId = user.id;
    }

    // Mesmo filtro da google-calendar-event: aceita o token da empresa ou um
    // legado sem empresa, e `.limit(1)` em vez de `.maybeSingle()` -- com o
    // Google reconectado (2 linhas de token) o maybeSingle dava ERRO e a
    // exclusão falhava com "google_not_connected".
    let tokenQuery = db
      .from("google_oauth_tokens")
      .select("id, access_token, refresh_token, token_expiry")
      .eq("user_id", userId);
    if (company_id) tokenQuery = tokenQuery.or(`company_id.eq.${company_id},company_id.is.null`);
    const { data: tokenRows, error: tokenErr } = await tokenQuery
      .order("company_id", { ascending: false, nullsFirst: false })
      .limit(1);
    const tokenRow = tokenRows?.[0];

    if (tokenErr || !tokenRow) return json({ error: "google_not_connected" }, 400);

    let accessToken: string = tokenRow.access_token;

    const isExpired = tokenRow.token_expiry && new Date(tokenRow.token_expiry) <= new Date();
    if (isExpired && tokenRow.refresh_token) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          refresh_token: tokenRow.refresh_token,
          grant_type:    "refresh_token",
        }),
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json() as { access_token: string; expires_in?: number };
        accessToken = refreshData.access_token;
        // Por id da linha usada: `user` não existe mais neste escopo (chamada
        // interna não tem sessão) e, com token duplicado, atualizar por
        // user_id podia gravar na linha errada.
        await db.from("google_oauth_tokens").update({
          access_token: accessToken,
          token_expiry: refreshData.expires_in
            ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
            : null,
        }).eq("id", tokenRow.id);
      } else {
        return json({ error: "token_refresh_failed" }, 502);
      }
    }

    const delRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event_id)}?sendUpdates=none`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );

    // 204 = sucesso, 410 = já deletado — ambos são OK
    if (!delRes.ok && delRes.status !== 410 && delRes.status !== 404) {
      const detail = await delRes.text();
      return json({ error: "delete_failed", detail }, 502);
    }

    return json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar-delete] CRASH:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
