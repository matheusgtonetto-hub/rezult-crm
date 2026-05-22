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

    const db = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await db.auth.getUser(jwt);
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    const { data: tokenRow, error: tokenErr } = await db
      .from("google_oauth_tokens")
      .select("access_token, refresh_token, token_expiry, gcal_sync_token")
      .eq("user_id", user.id)
      .maybeSingle();

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
        await db.from("google_oauth_tokens").update({
          access_token: accessToken,
          token_expiry: refreshData.expires_in
            ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
            : null,
        }).eq("user_id", user.id);
      } else {
        return json({ error: "token_refresh_failed" }, 502);
      }
    }

    // Busca eventos incrementalmente usando syncToken, ou faz sync inicial
    const syncToken: string | null = tokenRow.gcal_sync_token ?? null;
    let url: string;

    if (syncToken) {
      url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?syncToken=${encodeURIComponent(syncToken)}&showDeleted=true`;
    } else {
      // Sync inicial: só eventos futuros (últimos 7 dias + próximos 90 dias)
      const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&showDeleted=true&maxResults=250&singleEvents=true`;
    }

    const gcalRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // syncToken expirado — resetar e retornar para o cliente tentar de novo
    if (gcalRes.status === 410) {
      await db.from("google_oauth_tokens").update({ gcal_sync_token: null }).eq("user_id", user.id);
      return json({ error: "sync_token_expired", cancelled_event_ids: [] });
    }

    if (!gcalRes.ok) {
      const detail = await gcalRes.text();
      return json({ error: "gcal_list_failed", detail }, 502);
    }

    const gcalData = await gcalRes.json() as {
      items?: Array<{ id: string; status?: string }>;
      nextSyncToken?: string;
      nextPageToken?: string;
    };

    // Salva novo sync token
    if (gcalData.nextSyncToken) {
      await db.from("google_oauth_tokens")
        .update({ gcal_sync_token: gcalData.nextSyncToken })
        .eq("user_id", user.id);
    }

    // Retorna IDs de eventos cancelados/deletados
    const cancelledIds = (gcalData.items ?? [])
      .filter(e => e.status === "cancelled")
      .map(e => e.id);

    return json({ success: true, cancelled_event_ids: cancelledIds });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar-sync] CRASH:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
