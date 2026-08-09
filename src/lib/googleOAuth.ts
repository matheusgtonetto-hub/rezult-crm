import { supabase } from "@/lib/supabase";

const CLIENT_ID    = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI as string;

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

export function initGoogleOAuth(companyId: string) {
  const state = btoa(JSON.stringify({ companyId }));
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state,
  });
  const fullUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  console.log("[GoogleOAuth] REDIRECT_URI:", REDIRECT_URI);
  console.log("[GoogleOAuth] URL completa:", fullUrl);
  window.location.href = fullUrl;
}

export async function checkGoogleConnection(companyId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Mesma regra do backend (google-calendar-event, google-calendar-delete,
  // agent-sds-qualify): vale o token desta empresa OU um legado sem empresa,
  // criado antes da coluna company_id existir. Com `.eq(company_id)` puro a
  // tela dizia "Google não conectado" enquanto o agente agendava normalmente
  // usando o token legado.
  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("id, email, scopes, token_expiry")
    .eq("user_id", user.id)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .order("company_id", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error || !data?.length) return null;
  return data[0] as { id: string; email: string | null; scopes: string[] | null; token_expiry: string | null };
}

export async function disconnectGoogle(companyId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  // Apaga também a linha legada sem empresa: ela vale em qualquer empresa, e
  // o backend continuaria usando o token depois do usuário clicar em
  // "Desconectar" -- a tela dizia desconectado e o agente seguia agendando.
  const { error } = await supabase
    .from("google_oauth_tokens")
    .delete()
    .eq("user_id", user.id)
    .or(`company_id.eq.${companyId},company_id.is.null`);

  if (error) throw error;
}
