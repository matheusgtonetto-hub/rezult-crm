import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Só processa mensagens de texto
  const textBody = payload?.text?.message;
  if (!textBody) {
    return new Response("no text message", { status: 200 });
  }

  const {
    instanceId,
    messageId,
    phone,
    fromMe,
    momment,
    chatName,
    senderName,
  } = payload;

  if (!instanceId || !phone) {
    return new Response("missing fields", { status: 200 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Encontra o dono da instância na tabela companies
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .select("owner_id")
    .eq("zapi_instance_id", instanceId)
    .maybeSingle();

  if (compErr || !company) {
    console.warn("Instance not found:", instanceId);
    return new Response("instance not found", { status: 200 });
  }

  const cleanPhone = String(phone).replace(/\D/g, "");

  // Deduplicação manual por message_id antes de inserir
  if (messageId) {
    const { count } = await supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("message_id", messageId);
    if (count && count > 0) {
      return new Response("duplicate", { status: 200 });
    }
  }

  const { error } = await supabase
    .from("whatsapp_messages")
    .insert({
      owner_id:    company.owner_id,
      instance_id: instanceId,
      phone:       cleanPhone,
      message_id:  messageId ?? null,
      from_me:     !!fromMe,
      body:        textBody,
      type:        "text",
      momment:     momment ?? null,
      chat_name:   chatName ?? null,
      sender_name: senderName ?? null,
    });

  if (error) {
    // 23505 = unique_violation (race condition de deduplicação)
    if (error.code === "23505") {
      return new Response("duplicate", { status: 200 });
    }
    console.error("Insert error:", error);
    return new Response("db error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
