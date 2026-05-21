import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI!;
const RETURN_URL    = "https://app.rezultcrm.com/configuracoes/conexoes";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error } = req.query;

  if (error || !code || !state) {
    return res.redirect(302, `${RETURN_URL}?google=error`);
  }

  try {
    const { userId, companyId } = JSON.parse(
      Buffer.from(state as string, "base64url").toString()
    );

    // Troca o code por tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code:          code as string,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("Token não recebido");

    // Busca o e-mail do usuário Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // Salva no Supabase (upsert por user_id)
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error: dbError } = await supabase
      .from("google_calendar_connections")
      .upsert({
        user_id:       userId,
        company_id:    companyId,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expiry:  tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        google_email:  userInfo.email ?? null,
        updated_at:    new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (dbError) throw dbError;

    return res.redirect(302, `${RETURN_URL}?google=connected`);
  } catch {
    return res.redirect(302, `${RETURN_URL}?google=error`);
  }
}
