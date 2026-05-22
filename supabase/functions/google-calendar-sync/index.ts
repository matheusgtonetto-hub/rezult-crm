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

    let body: { event_ids?: string[] };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const { event_ids = [] } = body;
    if (event_ids.length === 0) return json({ success: true, deleted_event_ids: [] });

    const db = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await db.auth.getUser(jwt);
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    const { data: tokenRow, error: tokenErr } = await db
      .from("google_oauth_tokens")
      .select("access_token, refresh_token, token_expiry")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tokenErr || !tokenRow) return json({ error: "google_not_connected" }, 400);

    let accessToken: string = tokenRow.access_token;

    // Renova token se expirado
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

    // Verifica cada evento individualmente no Google Calendar
    const results = await Promise.all(
      event_ids.map(async (eventId) => {
        try {
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (res.status === 404 || res.status === 410) return { eventId, deleted: true };
          if (!res.ok) return { eventId, deleted: false };
          const data = await res.json() as { status?: string };
          return { eventId, deleted: data.status === "cancelled" };
        } catch {
          return { eventId, deleted: false };
        }
      }),
    );

    const deletedEventIds = results.filter(r => r.deleted).map(r => r.eventId);
    return json({ success: true, deleted_event_ids: deletedEventIds });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar-sync] CRASH:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
