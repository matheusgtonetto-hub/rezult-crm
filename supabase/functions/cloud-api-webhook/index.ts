import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertConversationForMessage, previewLabelFor } from "../_shared/upsert-conversation.ts";
import { telefonesIguais } from "../_shared/telefone.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Token configurado no painel Meta → URL de callback / Verificar token
const VERIFY_TOKEN = Deno.env.get("CLOUD_API_WEBHOOK_TOKEN") ?? "rezult_cloud_webhook";


serve(async (req) => {
  // ── Verificação do webhook (GET) ─────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }

  // Ignora eventos que não são do WhatsApp Business
  if (payload.object !== "whatsapp_business_account") return new Response("ok", { status: 200 });

  const supabase = createClient(supabaseUrl, serviceKey);
  const entries = (payload.entry as Record<string, unknown>[]) ?? [];

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) ?? [];

    for (const change of changes) {
      if (change.field !== "messages") continue;

      const value    = change.value as Record<string, unknown>;
      const metadata = value.metadata as { phone_number_id: string; display_phone_number: string } | undefined;
      const messages = (value.messages as Record<string, unknown>[]) ?? [];
      const contacts = (value.contacts as { profile?: { name?: string }; wa_id?: string }[]) ?? [];

      if (!metadata?.phone_number_id) continue;
      const phoneNumberId = metadata.phone_number_id;

      // Encontra a conexão pelo phone_number_id (salvo como instance_id)
      const { data: conn } = await supabase
        .from("whatsapp_connections")
        .select("owner_id, company_id, id, token")
        .eq("instance_id", phoneNumberId)
        .eq("provider", "cloud_api")
        .maybeSingle();

      if (!conn) {
        console.warn("cloud-api-webhook: conexão não encontrada para phone_number_id:", phoneNumberId);
        continue;
      }
      const ownerId   = (conn as { owner_id: string }).owner_id;
      const companyId = (conn as { company_id: string | null }).company_id;
      const accessToken = (conn as { token: string }).token;

      for (const message of messages) {
        const msgId    = message.id as string;
        const from     = message.from as string;
        const type     = (message.type as string) ?? "text";
        const timestamp = message.timestamp as string;

        const contact    = contacts.find(c => c.wa_id === from);
        const senderName = contact?.profile?.name ?? null;
        const cleanPhone = from.replace(/\D/g, "");

        let body: string | null = null;
        let mediaUrl: string | null = null;
        let msgType = "text";

        if (type === "text") {
          const t = message.text as { body?: string } | undefined;
          body = t?.body ?? null;
          msgType = "text";
        } else if (type === "audio") {
          const a = message.audio as { id?: string } | undefined;
          msgType = "audio";
          body = "";
          if (a?.id) {
            // Busca URL da mídia via Graph API
            try {
              const mr = await fetch(`https://graph.facebook.com/v21.0/${a.id}`, {
                headers: { "Authorization": `Bearer ${accessToken}` },
              });
              const md = await mr.json() as { url?: string };
              mediaUrl = md.url ?? null;
            } catch { /* ignora — sem mídia */ }
          }
        } else if (type === "image") {
          const img = message.image as { id?: string; caption?: string } | undefined;
          msgType = "image";
          body = img?.caption ?? "";
          if (img?.id) {
            try {
              const mr = await fetch(`https://graph.facebook.com/v21.0/${img.id}`, {
                headers: { "Authorization": `Bearer ${accessToken}` },
              });
              const md = await mr.json() as { url?: string };
              mediaUrl = md.url ?? null;
            } catch { /* ignora */ }
          }
        } else if (type === "document") {
          const doc = message.document as { id?: string; filename?: string } | undefined;
          msgType = "document";
          body = doc?.filename ?? "arquivo";
          if (doc?.id) {
            try {
              const mr = await fetch(`https://graph.facebook.com/v21.0/${doc.id}`, {
                headers: { "Authorization": `Bearer ${accessToken}` },
              });
              const md = await mr.json() as { url?: string };
              mediaUrl = md.url ?? null;
            } catch { /* ignora */ }
          }
        } else {
          // Tipo não suportado (vídeo, sticker, localização, reação…)
          continue;
        }

        if (!body && !mediaUrl) continue;

        // Deduplicação por message_id
        if (msgId) {
          const { count } = await supabase
            .from("whatsapp_messages")
            .select("id", { count: "exact", head: true })
            .eq("message_id", msgId);
          if (count && count > 0) continue;
        }

        const momment = timestamp
          ? Number(timestamp) * 1000
          : Date.now();

        const { error } = await supabase.from("whatsapp_messages").insert({
          owner_id:    ownerId,
          company_id:  companyId,
          instance_id: phoneNumberId,
          phone:       cleanPhone,
          message_id:  msgId ?? null,
          from_me:     false,
          body,
          type:        msgType,
          media_url:   mediaUrl,
          momment,
          chat_name:   senderName,
          sender_name: senderName,
        });

        if (error && error.code !== "23505") {
          console.error("cloud-api-webhook: erro ao inserir mensagem:", error);
        }

        // Garante a linha em whatsapp_conversations no servidor — não depender
        // de alguém estar com o Multiatendimento aberto no navegador nesse
        // instante (ver comentário em _shared/upsert-conversation.ts).
        try {
          await upsertConversationForMessage(supabase, {
            ownerId, companyId, instanceId: phoneNumberId, phone: cleanPhone,
            name: senderName,
            preview: previewLabelFor(msgType, body),
            fromMe: false,
          });
        } catch (e) {
          console.error("cloud-api-webhook: upsertConversationForMessage failed:", e);
        }

        // Retoma automações pausadas em "Entrada do usuário"
        if (body) {
          const { data: awaitingRows } = await supabase
            .from("automation_awaiting_reply")
            .select("id, phone")
            .eq("owner_id", ownerId)
            .order("created_at", { ascending: true });

          const awaiting = (awaitingRows as { id: string; phone: string }[] | null ?? [])
            .find(r => telefonesIguais(r.phone, cleanPhone));

          if (awaiting?.id) {
            const { data: cfgRows } = await supabase
              .from("automation_runner_config")
              .select("key, value")
              .in("key", ["supabase_url", "automation_secret"]);
            const cfg = Object.fromEntries(((cfgRows ?? []) as { key: string; value: string }[]).map(r => [r.key, r.value]));
            if (cfg["supabase_url"] && cfg["automation_secret"]) {
              try {
                await fetch(`${cfg["supabase_url"]}/functions/v1/automation-runner/resume-reply`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceKey}`,
                    "apikey": serviceKey,
                  },
                  body: JSON.stringify({ awaiting_id: awaiting.id, text: body, secret: cfg["automation_secret"] }),
                });
              } catch (e) {
                console.error("cloud-api-webhook: resume_reply falhou:", e);
              }
            }
          } else {
            // Nenhuma automação aguardando resposta — tenta o agente SDS.
            // Mutuamente exclusivo com o resume acima.
            if (companyId) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/agent-sds-qualify`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
                  },
                  body: JSON.stringify({ companyId, phone: cleanPhone, instanceId: phoneNumberId }),
                });
              } catch (e) {
                console.error("cloud-api-webhook: agent-sds-qualify falhou:", e);
              }
            }
          }
        }
      }
    }
  }

  return new Response("ok", { status: 200 });
});
