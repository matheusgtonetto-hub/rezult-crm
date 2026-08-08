import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertConversationForMessage, previewLabelFor } from "../_shared/upsert-conversation.ts";

// Webhook da D-API (https://d-api.cloud). Espelha o zapi-webhook, mas traduz o
// formato de payload da D-API — eventos `{ event, sessionId, data }` — para o
// mesmo insert em whatsapp_messages + retomada de automações do bloco
// "Entrada do usuário". A fonte da verdade é whatsapp_connections onde
// instance_id == sessionId (uma sessão D-API por número).

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Normaliza um telefone brasileiro para DDD + 8 dígitos finais (mesma lógica do
// zapi-webhook), tolerando o código do país 55 e o 9º dígito do celular.
function normalizeBrPhone(raw: string): string {
  let d = String(raw).replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}
function phonesMatch(a: string, b: string): boolean {
  const na = normalizeBrPhone(a);
  const nb = normalizeBrPhone(b);
  if (na.length < 10 || nb.length < 10) return false;
  return na.slice(-10) === nb.slice(-10);
}

// "5511999999999@s.whatsapp.net" → "5511999999999"
function jidToPhone(jid: unknown): string {
  const s = String(jid ?? "");
  if (!s.includes("@s.whatsapp.net")) return ""; // ignora grupos (@g.us) e outros
  return s.split("@")[0].replace(/\D/g, "");
}

serve(async (req) => {
  // Health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // A D-API bloqueia a URL do webhook inteira depois de muitos erros seguidos
  // na entrega (confirmado pelo suporte deles — foi o que já derrubou esse
  // webhook duas vezes). Por isso, a partir daqui o handler NUNCA devolve um
  // status != 200 pra D-API: qualquer método/corpo/evento inesperado ou falha
  // interna é só logado (console.warn/error, visível nos logs da function) e
  // respondido como "ok" do mesmo jeito. Isso é recomendação explícita deles:
  // webhook sempre assíncrono, sem devolver erro pra quem entrega o evento.
  try {
    if (req.method !== "POST") {
      console.warn("dapi-webhook: método inesperado:", req.method);
      return new Response("ok", { status: 200 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      console.warn("dapi-webhook: corpo da requisição não é JSON válido");
      return new Response("ok", { status: 200 });
    }

    const event     = String(payload?.event ?? "");
    const sessionId = payload?.sessionId as string | undefined;
    const data      = (payload?.data ?? {}) as Record<string, unknown>;

    if (!sessionId) {
      return new Response("ok", { status: 200 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Eventos de conexão: mantém whatsapp_connections em sincronia ────────────
    if (event === "connection.status") {
      const status = String(data.status ?? "");
      const connected = data.connected === true || status === "connected";
      const phone = data.phone ? String(data.phone).replace(/\D/g, "") : null;
      const patch: Record<string, unknown> = { connected };
      if (connected && phone) patch.phone = phone;
      await supabase.from("whatsapp_connections").update(patch).eq("instance_id", sessionId);
      return new Response("ok", { status: 200 });
    }

    // ── Mensagens recebidas ─────────────────────────────────────────────────────
    if (event !== "messages.received") {
      // Outros eventos (status de mensagem, presença, grupos, etc.) — ignorados.
      return new Response("ok", { status: 200 });
    }

    const fromMe = data.fromMe === true;
    // Quando fromMe=true (ex: resposta enviada do próprio celular, fora do
    // Rezult), `from` é o dono da sessão — a contraparte da conversa está em
    // `to`. Quando fromMe=false, `from` já é a contraparte. Sem essa distinção,
    // uma resposta enviada direto do celular cria uma conversa nova associada
    // ao próprio número da sessão em vez de continuar o chat existente.
    const counterparty = (fromMe ? (data.to ?? {}) : (data.from ?? {})) as Record<string, unknown>;
    const cleanPhone = jidToPhone(counterparty.jid);
    if (!cleanPhone) {
      return new Response("ok", { status: 200 });
    }

    const messageId = data.id ? String(data.id) : null;
    const type = String(data.type ?? "text");
    const mediaUrl = data.media_url ? String(data.media_url) : null;
    const mediaData = (data.media_data ?? {}) as Record<string, unknown>;
    const momment = data.timestamp ? Number(data.timestamp) : null;
    const senderName = counterparty.name ? String(counterparty.name) : null;

    let msgType = "text";
    let body: string | null = null;
    let media: string | null = null;

    if (type === "text") {
      msgType = "text"; body = String(data.message ?? "");
    } else if (type === "audio") {
      msgType = "audio"; media = mediaUrl; body = "";
    } else if (type === "image") {
      msgType = "image"; media = mediaUrl; body = String(data.message ?? mediaData.caption ?? "");
    } else if (type === "document") {
      msgType = "document"; media = mediaUrl; body = String(mediaData.fileName ?? mediaData.filename ?? "arquivo");
    } else {
      // Tipos não suportados (vídeo, sticker, localização, etc.) — ignora por ora.
      console.warn("dapi-webhook: tipo de mensagem não mapeado:", type);
      return new Response("ok", { status: 200 });
    }

    // Encontra o dono da sessão (instance_id == sessionId).
    const { data: conn } = await supabase
      .from("whatsapp_connections")
      .select("owner_id, company_id")
      .eq("instance_id", sessionId)
      .maybeSingle();
    const ownerId = conn ? (conn as { owner_id: string }).owner_id : null;
    const companyId = conn ? (conn as { company_id: string | null }).company_id : null;
    if (!ownerId) {
      console.warn("D-API session not found:", sessionId);
      return new Response("ok", { status: 200 });
    }

    // Deduplicação manual por message_id antes de inserir
    if (messageId) {
      const { count } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("message_id", messageId);
      if (count && count > 0) {
        return new Response("ok", { status: 200 });
      }
    }

    const { error } = await supabase
      .from("whatsapp_messages")
      .insert({
        owner_id:    ownerId,
        company_id:  companyId,
        instance_id: sessionId,
        phone:       cleanPhone,
        message_id:  messageId,
        from_me:     fromMe,
        body:        body,
        type:        msgType,
        media_url:   media,
        momment:     momment,
        chat_name:   senderName,
        sender_name: senderName,
      });

    if (error) {
      if (error.code !== "23505") console.error("dapi-webhook: insert error:", error);
      // Duplicado ou falha real de gravação — nos dois casos não há mensagem
      // nova persistida, então não faz sentido acionar retomada de automação
      // abaixo. Sempre "ok" pra D-API de qualquer forma.
      return new Response("ok", { status: 200 });
    }

    // Garante a linha em whatsapp_conversations no servidor — não depender de
    // alguém estar com o Multiatendimento aberto no navegador nesse instante
    // (ver comentário em _shared/upsert-conversation.ts).
    try {
      await upsertConversationForMessage(supabase, {
        ownerId, companyId, instanceId: sessionId, phone: cleanPhone,
        name: fromMe ? null : senderName, // from_me: senderName é o dono da sessão, não serve de nome da conversa
        preview: previewLabelFor(msgType, body),
        fromMe,
      });
    } catch (e) {
      console.error("dapi-webhook: upsertConversationForMessage failed:", e);
    }

    // ── Retoma automações pausadas no bloco "Entrada do usuário" ────────────────
    if (!fromMe) {
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
            await fetch(`${runnerUrl}/functions/v1/automation-runner/resume-reply`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
                "apikey": serviceKey,
              },
              body: JSON.stringify({ awaiting_id: awaiting.id, text: body ?? "", secret }),
            });
          } catch (e) {
            console.error("resume_reply call failed:", e);
          }
        }
      } else if (companyId) {
        // Nenhuma automação aguardando resposta — tenta o agente SDS. Mesma
        // lógica do zapi-webhook: mutuamente exclusivo com o resume acima.
        try {
          await fetch(`${supabaseUrl}/functions/v1/agent-sds-qualify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
            },
            body: JSON.stringify({ companyId, phone: cleanPhone, instanceId: sessionId }),
          });
        } catch (e) {
          console.error("agent-sds-qualify call failed:", e);
        }
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    // Última rede de segurança: NENHUMA exceção inesperada pode escapar como
    // 500 pra D-API — sempre "ok", erro só vai pro log da function.
    console.error("dapi-webhook: erro inesperado:", err);
    return new Response("ok", { status: 200 });
  }
});
