import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

type GCalConnection = {
  user_id:       string;
  access_token:  string;
  refresh_token: string | null;
  token_expiry:  string | null;
  calendar_id:   string | null;
};

async function refreshToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    "refresh_token",
    }),
  });
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Não autenticado" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Verifica o JWT do usuário
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Token inválido" });

  // Busca a conexão Google do usuário
  const { data: conn, error: connError } = await supabase
    .from("google_calendar_connections")
    .select("user_id, access_token, refresh_token, token_expiry, calendar_id")
    .eq("user_id", user.id)
    .single();

  if (connError || !conn) {
    return res.status(404).json({ error: "Google Calendar não conectado" });
  }

  let accessToken = (conn as GCalConnection).access_token;

  // Renova o token se expirado ou prestes a expirar (< 5 min)
  const c = conn as GCalConnection;
  if (c.refresh_token && c.token_expiry) {
    const expiresAt = new Date(c.token_expiry).getTime();
    if (expiresAt - Date.now() < 5 * 60 * 1000) {
      try {
        const newTokens = await refreshToken(c.refresh_token);
        accessToken = newTokens.access_token;
        await supabase
          .from("google_calendar_connections")
          .update({
            access_token: newTokens.access_token,
            token_expiry: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            updated_at:   new Date().toISOString(),
          })
          .eq("user_id", user.id);
      } catch { /* usa o token atual */ }
    }
  }

  const { title, scheduledAt, durationMinutes, meetLink, description, contactEmail } = req.body;

  if (!title || !scheduledAt) {
    return res.status(400).json({ error: "title e scheduledAt são obrigatórios" });
  }

  const startTime = new Date(scheduledAt);
  const endTime   = new Date(startTime.getTime() + ((durationMinutes ?? 60) as number) * 60 * 1000);

  const event: Record<string, unknown> = {
    summary:     title,
    description: description ?? "",
    start:       { dateTime: startTime.toISOString() },
    end:         { dateTime: endTime.toISOString() },
  };
  if (meetLink)      event.location  = meetLink;
  if (contactEmail)  event.attendees = [{ email: contactEmail }];

  const calendarId = (c.calendar_id ?? "primary");
  const gcalRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify(event),
    }
  );

  if (!gcalRes.ok) {
    const err = await gcalRes.json();
    return res.status(502).json({ error: "Erro no Google Calendar", details: err });
  }

  const created = await gcalRes.json();
  return res.status(200).json({ success: true, eventId: created.id, htmlLink: created.htmlLink });
}
