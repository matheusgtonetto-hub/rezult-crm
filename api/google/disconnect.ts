import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Não autenticado" });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Token inválido" });

  // Busca o access_token para revogar
  const { data: conn } = await supabase
    .from("google_calendar_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .single();

  // Revoga o token no Google (best-effort)
  if (conn?.access_token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${conn.access_token}`, {
      method: "POST",
    }).catch(() => {});
  }

  // Remove do banco
  await supabase
    .from("google_calendar_connections")
    .delete()
    .eq("user_id", user.id);

  return res.status(200).json({ success: true });
}
