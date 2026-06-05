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
    const clientId    = Deno.env.get("GOOGLE_CLIENT_ID")    ?? "";
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")         ?? "";
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("authorization") ?? "";
    const jwt        = authHeader.replace(/^Bearer\s+/i, "");

    let body: { event_id?: string; title?: string; description?: string; start_datetime?: string; duration_minutes?: number; attendees?: string[]; create_meet?: boolean };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const { event_id, title, description, start_datetime, duration_minutes = 60, attendees = [], create_meet = false } = body;
    if (!title || !start_datetime) {
      return json({ error: "missing required fields: title, start_datetime" }, 400);
    }

    // Calcula end_datetime somando duration_minutes ao start local (sem conversão UTC)
    const startMs = new Date(start_datetime + "Z").getTime();
    const endDate = new Date(startMs + duration_minutes * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const end_datetime = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(endDate.getUTCDate())}T${pad(endDate.getUTCHours())}:${pad(endDate.getUTCMinutes())}:00`;

    // Identifica o usuário
    const db = createClient(supabaseUrl, serviceKey);
    const authResult = await db.auth.getUser(jwt);
    const user = authResult.data?.user;
    if (authResult.error || !user) return json({ error: "unauthorized" }, 401);

    // Busca token Google do usuário
    const { data: tokenRow, error: tokenErr } = await db
      .from("google_oauth_tokens")
      .select("access_token, refresh_token, token_expiry")
      .eq("user_id", user.id)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return json({ error: "google_not_connected" }, 400);
    }

    let accessToken: string = tokenRow.access_token;

    // Renova se expirado
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

    // Atualiza evento existente (PATCH) quando event_id fornecido
    if (event_id) {
      const patch = {
        summary: title,
        description: description ?? "",
        start: { dateTime: start_datetime, timeZone: "America/Sao_Paulo" },
        end:   { dateTime: end_datetime,   timeZone: "America/Sao_Paulo" },
        ...(attendees.length > 0 && {
          attendees: attendees.map(email => ({ email })),
        }),
      };

      const patchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event_id}`,
        {
          method: "PATCH",
          headers: {
            Authorization:  `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patch),
        },
      );

      if (!patchRes.ok) {
        const detail = await patchRes.text();
        console.error("Google Calendar PATCH error:", detail);
        return json({ error: "calendar_event_failed", detail }, 502);
      }

      const patchData = await patchRes.json() as {
        id: string;
        htmlLink: string;
        conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
      };

      const meetLink = patchData.conferenceData?.entryPoints
        ?.find(ep => ep.entryPointType === "video")?.uri ?? null;

      return json({ success: true, event_id: patchData.id, event_link: patchData.htmlLink, meet_link: meetLink });
    }

    // Cria evento novo (POST)
    const event = {
      summary: title,
      description: description ?? "",
      start: { dateTime: start_datetime, timeZone: "America/Sao_Paulo" },
      end:   { dateTime: end_datetime,   timeZone: "America/Sao_Paulo" },
      ...(attendees.length > 0 && {
        attendees: attendees.map(email => ({ email })),
      }),
      ...(create_meet && {
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    };

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events${create_meet ? "?conferenceDataVersion=1" : ""}`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
    );

    if (!calRes.ok) {
      const detail = await calRes.text();
      console.error("Google Calendar error:", detail);
      return json({ error: "calendar_event_failed", detail }, 502);
    }

    const calData = await calRes.json() as {
      id: string;
      htmlLink: string;
      hangoutLink?: string;
      conferenceData?: {
        conferenceId?: string;
        entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
        createRequest?: { status?: { statusCode?: string } };
      };
    };

    console.log("[calendar] create_meet:", create_meet, "conferenceData:", JSON.stringify(calData.conferenceData), "hangoutLink:", calData.hangoutLink);

    const meetLink =
      calData.conferenceData?.entryPoints?.find(ep => ep.entryPointType === "video")?.uri
      ?? calData.hangoutLink
      ?? null;

    return json({ success: true, event_id: calData.id, event_link: calData.htmlLink, meet_link: meetLink });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[calendar] CRASH:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
