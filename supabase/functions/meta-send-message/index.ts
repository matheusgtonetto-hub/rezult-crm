import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaBloqueada } from "../_shared/cobranca.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const db = createClient(supabaseUrl, serviceKey);

  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userErr } = await db.auth.getUser(jwt);
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const { connection_id, recipient_id, text, lead_id } = await req.json() as {
    connection_id: string;
    recipient_id: string;
    text: string;
    lead_id?: string;
  };

  if (!connection_id || !recipient_id || !text) {
    return json({ error: "parâmetros obrigatórios: connection_id, recipient_id, text" }, 400);
  }

  // Busca a conexão
  const { data: connection, error: connErr } = await db
    .from("meta_connections")
    .select("*")
    .eq("id", connection_id)
    .eq("owner_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (connErr || !connection) return json({ error: "conexão não encontrada" }, 404);

  // A tela já barra o envio, mas esta função é a porta do servidor: sem a
  // checagem aqui, bastaria chamar o endpoint direto para seguir mandando
  // mensagem com a mensalidade em aberto.
  if (await empresaBloqueada(db, connection.company_id)) {
    return json({ error: "conta em somente leitura: pagamento em aberto" }, 402);
  }

  const provider = connection.provider as "instagram" | "messenger";
  const pageId = connection.page_id as string;
  const accessToken = connection.access_token as string;

  // Monta o payload para a Graph API
  const messagePayload = {
    recipient: { id: recipient_id },
    message: { text },
    messaging_type: "RESPONSE",
  };

  // Endpoint varia por provider
  const endpoint = provider === "instagram"
    ? `https://graph.facebook.com/v21.0/${connection.instagram_account_id}/messages`
    : `https://graph.facebook.com/v21.0/${pageId}/messages`;

  const sendRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(messagePayload),
  });

  const sendData = await sendRes.json();

  if (!sendRes.ok || sendData.error) {
    console.error("Erro ao enviar mensagem:", sendData);
    return json({ error: "falha ao enviar mensagem", detail: sendData.error?.message }, 500);
  }

  // Salva a mensagem enviada no banco
  const { data: company } = await db
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  await db.from("meta_messages").insert({
    owner_id: user.id,
    company_id: company?.id,
    connection_id,
    lead_id: lead_id || null,
    provider,
    direction: "out",
    sender_id: provider === "instagram" ? connection.instagram_account_id : pageId,
    recipient_id,
    message_id: sendData.message_id || null,
    message_type: "text",
    content: text,
    status: "sent",
    sent_at: new Date().toISOString(),
  });

  return json({ success: true, message_id: sendData.message_id });
});
