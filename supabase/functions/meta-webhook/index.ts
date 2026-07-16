import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);

  // Webhook verification (GET) - Meta chama isso quando você configura o webhook
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
    }
    return json({ error: "invalid verification token" }, 403);
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const db = createClient(supabaseUrl, serviceKey);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  console.log("Meta webhook payload:", JSON.stringify(payload).slice(0, 500));

  const object = payload.object as string; // "page" = Messenger, "instagram" = Instagram
  const entries = payload.entry as { id: string; messaging?: unknown[]; changes?: unknown[] }[];

  if (!Array.isArray(entries)) return json({ ok: true });

  for (const entry of entries) {
    const pageId = entry.id;

    // Busca a conexão ativa para essa página
    const { data: connection } = await db
      .from("meta_connections")
      .select("*")
      .eq("page_id", pageId)
      .eq("active", true)
      .maybeSingle();

    if (!connection) {
      console.log(`Nenhuma conexão ativa para page_id: ${pageId}`);
      continue;
    }

    const ownerId = connection.owner_id as string;
    const companyId = connection.company_id as string;
    const provider = connection.provider as "instagram" | "messenger";

    // Mensagens do Messenger (object = "page")
    if (object === "page" && Array.isArray(entry.messaging)) {
      for (const event of entry.messaging as Record<string, unknown>[]) {
        await handleMessagingEvent(db, event, connection, ownerId, companyId, "messenger");
      }
    }

    // Mensagens do Instagram (object = "instagram")
    if (object === "instagram" && Array.isArray(entry.messaging)) {
      for (const event of entry.messaging as Record<string, unknown>[]) {
        await handleMessagingEvent(db, event, connection, ownerId, companyId, "instagram");
      }
    }
  }

  return json({ ok: true });
});

async function handleMessagingEvent(
  db: ReturnType<typeof createClient>,
  event: Record<string, unknown>,
  connection: Record<string, unknown>,
  ownerId: string,
  companyId: string,
  provider: "instagram" | "messenger"
) {
  const message = event.message as Record<string, unknown> | undefined;
  if (!message) return;

  // Ignora echos (mensagens enviadas pela própria página)
  if (message.is_echo) return;

  const senderId = (event.sender as { id: string })?.id;
  const recipientId = (event.recipient as { id: string })?.id;
  const messageId = message.mid as string;
  const timestamp = event.timestamp as number;

  if (!senderId || !messageId) return;

  // Evita duplicatas
  const { data: existing } = await db
    .from("meta_messages")
    .select("id")
    .eq("message_id", messageId)
    .maybeSingle();
  if (existing) return;

  // Conteúdo da mensagem
  let content: string | null = null;
  let mediaUrl: string | null = null;
  let messageType = "text";

  if (message.text) {
    content = message.text as string;
    messageType = "text";
  } else if (message.attachments) {
    const attachments = message.attachments as { type: string; payload: { url?: string } }[];
    const att = attachments[0];
    messageType = att?.type || "file";
    mediaUrl = att?.payload?.url || null;
  }

  // Busca lead existente por sender_id em mensagens anteriores
  const { data: prevMsg } = await db
    .from("meta_messages")
    .select("lead_id")
    .eq("sender_id", senderId)
    .eq("owner_id", ownerId)
    .not("lead_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let leadId: string | null = (prevMsg as { lead_id?: string } | null)?.lead_id ?? null;

  // Se não há lead, cria um novo
  if (!leadId) {
    let senderName = senderId;

    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/v21.0/${senderId}?` +
        new URLSearchParams({
          access_token: connection.access_token as string,
          fields: provider === "instagram" ? "name,username" : "name",
        })
      );
      const profile = await profileRes.json();
      senderName = profile.name || profile.username || senderId;
    } catch (e) {
      console.error("Falha ao buscar perfil do remetente:", e);
    }

    const { data: maxRow } = await db
      .from("leads")
      .select("deal_number")
      .eq("owner_id", ownerId)
      .order("deal_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dealNumber = ((maxRow as { deal_number?: number } | null)?.deal_number ?? 1000) + 1;

    const { data: pipelines } = await db
      .from("pipelines")
      .select("id, pipeline_columns(id)")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1);

    const firstPipeline = pipelines?.[0] as { id: string; pipeline_columns?: { id: string }[] } | undefined;
    if (!firstPipeline) return;

    const stageId = (firstPipeline.pipeline_columns ?? [])[0]?.id;
    if (!stageId) return;

    const { data: newLead } = await db
      .from("leads")
      .insert({
        owner_id: ownerId,
        deal_number: dealNumber,
        name: senderName,
        pipeline_id: firstPipeline.id,
        column_id: stageId,
        value: 0,
        responsible: "",
        priority: "Média",
        origin: provider === "instagram" ? "Instagram" : "Facebook Ads",
        entry_date: new Date().toISOString().split("T")[0],
        status: "open",
        tags: [provider === "instagram" ? "Instagram" : "Messenger"],
      })
      .select("id")
      .single();

    leadId = (newLead as { id: string } | null)?.id ?? null;
  }

  // Salva a mensagem
  await db.from("meta_messages").insert({
    owner_id: ownerId,
    company_id: companyId,
    connection_id: connection.id,
    lead_id: leadId,
    provider,
    direction: "in",
    sender_id: senderId,
    recipient_id: recipientId,
    message_id: messageId,
    message_type: messageType,
    content,
    media_url: mediaUrl,
    raw_payload: event,
    sent_at: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
  });

  console.log(`Mensagem ${provider} salva. Lead: ${leadId}, Conteúdo: ${content?.slice(0, 50)}`);
}
