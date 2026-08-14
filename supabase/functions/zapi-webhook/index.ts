import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertConversationForMessage, previewLabelFor, extrairCitacao } from "../_shared/upsert-conversation.ts";
import { telefonesIguais } from "../_shared/telefone.ts";

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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Extrai o conteúdo conforme o tipo da mensagem. Antes só texto era salvo;
  // áudio/imagem/documento recebidos eram descartados (não apareciam no chat
  // e o preview da conversa não atualizava).
  const text     = payload?.text     as { message?: string } | undefined;
  const audio    = payload?.audio    as { audioUrl?: string; seconds?: number } | undefined;
  const image    = payload?.image    as { imageUrl?: string; caption?: string } | undefined;
  const document = payload?.document as { documentUrl?: string; fileName?: string } | undefined;

  let msgType = "text";
  let body: string | null = null;
  let mediaUrl: string | null = null;

  if (text?.message) {
    msgType = "text"; body = text.message;
  } else if (audio?.audioUrl) {
    msgType = "audio"; mediaUrl = audio.audioUrl;
    const s = Number(audio.seconds ?? 0);
    body = s > 0 ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : "";
  } else if (image?.imageUrl) {
    msgType = "image"; mediaUrl = image.imageUrl; body = image.caption ?? "";
  } else if (document?.documentUrl) {
    msgType = "document"; mediaUrl = document.documentUrl; body = document.fileName ?? "arquivo";
  } else {
    // Tipo não suportado (vídeo, sticker, localização, etc.) — ignora por ora.
    return new Response("unsupported message type", { status: 200 });
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
  let companyId: string | null = null;
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("owner_id, company_id")
    .eq("instance_id", instanceId)
    .maybeSingle();
  if (conn) {
    ownerId = (conn as { owner_id: string }).owner_id;
    companyId = (conn as { company_id: string | null }).company_id;
  }
  if (!ownerId) {
    const { data: company } = await supabase
      .from("companies")
      .select("id, owner_id")
      .eq("zapi_instance_id", instanceId)
      .maybeSingle();
    if (company) {
      ownerId = (company as { owner_id: string }).owner_id;
      companyId = (company as { id: string }).id;
    }
  }

  if (!ownerId) {
    console.warn("Instance not found:", instanceId);
    return new Response("instance not found", { status: 200 });
  }

  const cleanPhone = String(phone).replace(/\D/g, "");
  // Citação: a Z-API varia o nome do campo conforme o evento, então o extrator
  // recebe o payload inteiro e procura nas formas conhecidas.
  const citacao = extrairCitacao(payload);

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

  // Resolve a conversa ANTES de inserir, para a mensagem já nascer com o vínculo
  // em vez de depender de casar telefone por texto na hora de ler. A ordem
  // inverteu na Fase 1 do plano de atendimentos; é seguro porque a deduplicação
  // por message_id acima já retornou, então entrega repetida não chega aqui.
  let conversationId: string | null = null;
  try {
    conversationId = await upsertConversationForMessage(supabase, {
      ownerId, companyId, instanceId: String(instanceId), phone: cleanPhone,
      name: fromMe ? null : ((senderName as string | undefined) ?? (chatName as string | undefined) ?? null),
      preview: previewLabelFor(msgType, body),
      fromMe: !!fromMe,
    });
  } catch (e) {
    console.error("zapi-webhook: upsertConversationForMessage failed:", e);
  }

  const { error } = await supabase
    .from("whatsapp_messages")
    .insert({
      owner_id:    ownerId,
      company_id:  companyId,
      instance_id: instanceId,
      phone:       cleanPhone,
      message_id:  messageId ?? null,
      from_me:     !!fromMe,
      body:        body,
      type:        msgType,
      media_url:   mediaUrl,
      momment:     momment ?? null,
      chat_name:   chatName ?? null,
      sender_name: senderName ?? null,
      conversation_id: conversationId,
      reply_to_message_id: citacao.replyToMessageId,
      reply_to_preview:    citacao.replyToPreview,
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
      .find((r) => telefonesIguais(r.phone, cleanPhone));

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
            body: JSON.stringify({ awaiting_id: awaiting.id, text: body ?? "", secret }),
          });
        } catch (e) {
          console.error("resume_reply call failed:", e);
        }
      }
    } else if (companyId) {
      // Nenhuma automação aguardando resposta — tenta o agente SDS (se ativo
      // pra essa empresa; a própria function decide e não faz nada se não
      // houver agente ligado). Mutuamente exclusivo com o resume acima: evita
      // dois sistemas automáticos respondendo o mesmo lead ao mesmo tempo.
      try {
        await fetch(`${supabaseUrl}/functions/v1/agent-sds-qualify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
          },
          body: JSON.stringify({ companyId, phone: cleanPhone, instanceId: String(instanceId) }),
        });
      } catch (e) {
        console.error("agent-sds-qualify call failed:", e);
      }
    }
  }

  return new Response("ok", { status: 200 });
});
