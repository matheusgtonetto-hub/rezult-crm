// Regra ÚNICA de "qual token do Google vale" e de renovação.
//
// Essa regra já esteve espalhada em cinco arquivos com implementações
// diferentes, e cada divergência virou bug silencioso: tela dizendo
// "conectado" enquanto o agente considerava desconectado, token legado
// ignorado, renovação gravando na linha errada. Toda leitura nova de token
// deve passar por aqui.
//
// Regra: vale o token DESTA empresa ou um legado sem empresa (criado antes da
// coluna company_id existir); o da empresa ganha quando os dois existem.
// `.limit(1)` e não `.maybeSingle()`: reconectar o Google deixa mais de uma
// linha por usuário, e o maybeSingle devolve ERRO nesse caso, não a primeira
// linha.

// deno-lint-ignore-file no-explicit-any
export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "google_not_connected" | "token_refresh_failed" };

export async function getGoogleAccessToken(
  db: any,
  userId: string,
  companyId?: string,
): Promise<TokenResult> {
  let query = db
    .from("google_oauth_tokens")
    .select("id, access_token, refresh_token, token_expiry")
    .eq("user_id", userId);
  if (companyId) query = query.or(`company_id.eq.${companyId},company_id.is.null`);

  const { data: rows, error } = await query
    .order("company_id", { ascending: false, nullsFirst: false })
    .limit(1);
  const row = rows?.[0];
  if (error || !row) return { ok: false, reason: "google_not_connected" };

  const expirado = row.token_expiry && new Date(row.token_expiry) <= new Date();
  if (!expirado) return { ok: true, accessToken: row.access_token };
  if (!row.refresh_token) return { ok: false, reason: "token_refresh_failed" };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("[google-token] refresh falhou:", res.status, await res.text());
    return { ok: false, reason: "token_refresh_failed" };
  }

  const data = await res.json() as { access_token: string; expires_in?: number };
  // Atualiza pelo id da linha lida: por user_id + company_id o token novo
  // podia acabar gravado numa linha diferente da que foi usada.
  await db.from("google_oauth_tokens").update({
    access_token: data.access_token,
    token_expiry: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
  }).eq("id", row.id);

  return { ok: true, accessToken: data.access_token };
}
