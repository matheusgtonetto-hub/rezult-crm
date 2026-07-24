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

  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("id, email, scopes, token_expiry")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return null;
  return data as { id: string; email: string | null; scopes: string[] | null; token_expiry: string | null };
}

export async function disconnectGoogle(companyId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from("google_oauth_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("company_id", companyId);

  if (error) throw error;
}
