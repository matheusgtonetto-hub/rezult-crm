import { supabase } from "@/lib/supabase";

const CLIENT_ID    = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI as string;

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export function initGoogleOAuth() {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function checkGoogleConnection() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("id, email, scopes, token_expiry")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as { id: string; email: string | null; scopes: string[] | null; token_expiry: string | null };
}

export async function disconnectGoogle() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  const { error } = await supabase
    .from("google_oauth_tokens")
    .delete()
    .eq("user_id", user.id);

  if (error) throw error;
}
