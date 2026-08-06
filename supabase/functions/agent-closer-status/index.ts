import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Devolve conexão do Google Calendar por usuário (booleano + e-mail da conta
// conectada, pra distinguir qual conta Google cada um linkou), pra aba
// "Vendedores" e "Integrações > Calendar" mostrarem status de outros membros
// da empresa. Precisa de service role porque a RLS de google_oauth_tokens é
// "auth.uid() = user_id" (cada um só vê o próprio token) -- não dá pra fazer
// essa checagem cross-user direto do client. Nunca devolve o token em si.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { company_id?: string; user_ids?: string[] };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.company_id || !Array.isArray(body.user_ids) || !body.user_ids.length) {
    return json({ error: "missing_company_id_or_user_ids" }, 400);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Exige JWT válido de alguém com acesso à empresa (dono OU membro) --
  // mesma regra reimplementada em agent-kb-ingest, porque o service role
  // não roda RLS automaticamente.
  const { data: userData, error: userErr } = await db.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  const uid = userData.user.id;

  const { data: companyRow } = await db.from("companies").select("owner_id").eq("id", body.company_id).maybeSingle();
  const isOwner = companyRow?.owner_id === uid;
  let isMember = isOwner;
  if (!isMember) {
    const { data: memberRow } = await db
      .from("company_members")
      .select("id")
      .eq("company_id", body.company_id)
      .eq("user_id", uid)
      .maybeSingle();
    isMember = !!memberRow;
  }
  if (!isMember) return json({ error: "forbidden" }, 403);

  const { data: tokens } = await db
    .from("google_oauth_tokens")
    .select("user_id, email")
    .in("user_id", body.user_ids);

  const connected = (tokens ?? []).map((t) => t.user_id as string);
  const emails = Object.fromEntries((tokens ?? []).map((t) => [t.user_id as string, t.email as string]));
  return json({ connected, emails });
});
