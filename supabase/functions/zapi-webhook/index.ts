import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Normaliza um telefone brasileiro para DDD + 8 dígitos finais, tolerando:
//  - código do país 55 (ex.: 5531989904484 → 31989904484)
//  - o 9º dígito de celular (ex.: 31989904484 → 3189904484), que o WhatsApp/Z-API
//    às vezes entrega sem o 9. Comparar só os últimos dígitos não basta porque o
//    9 desloca a contagem; por isso reduzimos ao núcleo DDD + 8 dígitos.
function normalizeBrPhone(raw: string): string {
  let d = String(raw).replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // remove código do país
  // 11 dígitos = DDD(2) + 9 + 8 dígitos de celular → remove o 9 para casar com 8 dígitos
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d; // DDD(2) + 8 dígitos
}
function phonesMatch(a: string, b: string): boolean {
  const na = normalizeBrPhone(a);
  const nb = normalizeBrPhone(b);
  if (na.length < 10 || nb.length < 10) return false;
  return na.slice(-10) === nb.slice(-10); // DDD + 8 dígitos
}

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

  let payload: Record<string, unknown>;
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

  // Encontra o dono da instância. Multi-instância: a fonte da verdade é
  // whatsapp_connections (uma empresa pode ter vários números). Fallback para
  // o campo legado companies.zapi_instance_id (instalações antigas).
  let ownerId: string | null = null;
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("owner_id")
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (conn) ownerId = (conn as { owner_id: string }).owner_id;
  if (!ownerId) {
    const { data: company } = await supabase
      .from("companies")
      .select("owner_id")
      .eq("zapi_instance_id", instanceId)
      .maybeSingle();
    if (company) ownerId = (company as { owner_id: string }).owner_id;
  }

  if (!ownerId) {
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
      owner_id:    ownerId,
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

  // ── Retoma automações pausadas no bloco "Entrada do usuário" ────────────────
  // Se este contato (owner + telefone) tem uma automação aguardando resposta,
  // dispara a retomada no motor com o texto recebido.
  if (!fromMe) {
    // Busca as esperas do dono e casa o telefone tolerando formato (o lead pode
    // estar salvo sem o 55; o Z-API entrega com o 55). Igualdade exata falharia.
    const { data: awaitingRows } = await supabase
      .from("automation_awaiting_reply")
      .select("id, phone")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    const awaiting = (awaitingRows as { id: string; phone: string }[] | null ?? [])
      .find((r) => phonesMatch(r.phone, cleanPhone));

    if (awaiting?.id) {
      const { data: cfgRows } = await supabase
        .from("automation_runner_config")
        .select("key, value")
        .in("key", ["supabase_url", "automation_secret"]);
      const cfg = Object.fromEntries(((cfgRows ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
      const runnerUrl = cfg["supabase_url"];
      const secret = cfg["automation_secret"];
      if (runnerUrl && secret) {
        try {
          // Gateway autentica pela service key; o segredo do motor vai no corpo.
          await fetch(`${runnerUrl}/functions/v1/automation-runner/resume-reply`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
              "apikey": serviceKey,
            },
            body: JSON.stringify({ awaiting_id: awaiting.id, text: textBody, secret }),
          });
        } catch (e) {
          console.error("resume_reply call failed:", e);
        }
      }
    }
  }

  return new Response("ok", { status: 200 });
});
