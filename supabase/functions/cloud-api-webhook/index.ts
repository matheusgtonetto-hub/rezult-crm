import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertConversationForMessage, previewLabelFor, extrairCitacao } from "../_shared/upsert-conversation.ts";
import { telefonesIguais } from "../_shared/telefone.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Token configurado no painel Meta → URL de callback / Verificar token
const VERIFY_TOKEN = Deno.env.get("CLOUD_API_WEBHOOK_TOKEN") ?? "rezult_cloud_webhook";

/**
 * Texto de uma resposta interativa do contato (clique em botão ou item de lista).
 *
 * A Meta manda isso em duas formas, dependendo de como a mensagem original foi
 * enviada:
 *
 *   type "button"      → modelo aprovado com quick reply. O rótulo vem em
 *                        `button.text`, e `button.payload` traz o valor cru.
 *   type "interactive" → mensagem interativa. `interactive.button_reply.title`
 *                        para botão, `interactive.list_reply.title` para lista.
 *
 * Devolve o RÓTULO, não o id: é o que o contato entende ter dito, é o que a
 * automação compara para casar a resposta, e é o que faz sentido na bolha da
 * conversa. O id só serviria para nós.
 */
function textoDeRespostaInterativa(message: Record<string, unknown>): string {
  const botao = message.button as { text?: string; payload?: string } | undefined;
  const interativa = message.interactive as {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  } | undefined;

  const candidatos = [
    botao?.text,
    interativa?.button_reply?.title,
    interativa?.list_reply?.title,
    // Payload por último: em modelo sem rótulo configurado ele é tudo que existe.
    botao?.payload,
    interativa?.button_reply?.id,
    interativa?.list_reply?.id,
  ];
  for (const c of candidatos) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/** Extensão a partir do mime, para o arquivo no storage abrir com o app certo. */
function extensaoDoMime(mime: string): string {
  const limpo = mime.split(";")[0].trim().toLowerCase();
  const mapa: Record<string, string> = {
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/amr": "amr", "audio/aac": "aac",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
  };
  return mapa[limpo] ?? (limpo.split("/")[1] || "bin");
}

/**
 * Traz a mídia recebida para o nosso storage e devolve a URL pública.
 *
 * A URL que a Graph API entrega NÃO serve para guardar: ela expira em minutos e
 * exige o cabeçalho `Authorization: Bearer` para ser baixada. Gravar aquilo em
 * `media_url` deixava a mensagem apontando para um endereço que o navegador do
 * atendente nunca conseguiria abrir -- áudio mudo e imagem quebrada, sem nada na
 * tela explicando por quê. Mídia de SAÍDA já vive no nosso bucket desde sempre
 * (enviarArquivoWhatsapp); isto põe a de entrada no mesmo lugar.
 *
 * Devolve a URL do Graph como último recurso quando o download ou o upload
 * falham: ela provavelmente não vai abrir, mas descartá-la faria a mensagem
 * inteira ser perdida logo abaixo (`if (!body && !mediaUrl) continue`), e uma
 * mensagem que existe com mídia quebrada é melhor que uma que sumiu.
 */
async function midiaParaStorage(
  supabase: ReturnType<typeof createClient>,
  mediaId: string,
  accessToken: string,
  ownerId: string,
  nomeSugerido?: string,
): Promise<string | null> {
  let urlDoGraph: string | null = null;
  try {
    const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    const dados = await meta.json() as { url?: string; mime_type?: string };
    urlDoGraph = dados.url ?? null;
    if (!urlDoGraph) return null;

    // O download também exige o token: sem ele a Meta devolve 401.
    const binario = await fetch(urlDoGraph, { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (!binario.ok) {
      console.error("cloud-api-webhook: download da mídia falhou:", binario.status);
      return urlDoGraph;
    }
    const mime = binario.headers.get("content-type") ?? dados.mime_type ?? "application/octet-stream";
    const bytes = new Uint8Array(await binario.arrayBuffer());

    const nomeSeguro = (nomeSugerido ?? `${mediaId}.${extensaoDoMime(mime)}`).replace(/[^\w.-]+/g, "_");
    const caminho = `${ownerId}/recebidos/${Date.now()}-${nomeSeguro}`;
    const { error } = await supabase.storage
      .from("automation-media")
      .upload(caminho, bytes, { upsert: true, contentType: mime });
    if (error) {
      console.error("cloud-api-webhook: upload da mídia falhou:", error.message);
      return urlDoGraph;
    }
    return supabase.storage.from("automation-media").getPublicUrl(caminho).data.publicUrl;
  } catch (e) {
    console.error("cloud-api-webhook: não consegui trazer a mídia:", e);
    return urlDoGraph;
  }
}


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
        // Citação: a Meta manda em message.context quando é resposta.
        const citacao = extrairCitacao(message);

        const contact    = contacts.find(c => c.wa_id === from);
        const senderName = contact?.profile?.name ?? null;
        const cleanPhone = from.replace(/\D/g, "");

        // Deduplicação por message_id, ANTES de classificar. A Meta reentrega o
        // evento quando não recebe 200 rápido, e desde que a mídia passou a ser
        // baixada aqui, deixar essa checagem para depois significaria baixar e
        // subir o mesmo áudio de novo a cada reentrega.
        if (msgId) {
          const { count } = await supabase
            .from("whatsapp_messages")
            .select("id", { count: "exact", head: true })
            .eq("message_id", msgId);
          if (count && count > 0) continue;
        }

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
          if (a?.id) mediaUrl = await midiaParaStorage(supabase, a.id, accessToken, ownerId);
        } else if (type === "image") {
          const img = message.image as { id?: string; caption?: string } | undefined;
          msgType = "image";
          body = img?.caption ?? "";
          if (img?.id) mediaUrl = await midiaParaStorage(supabase, img.id, accessToken, ownerId);
        } else if (type === "document") {
          const doc = message.document as { id?: string; filename?: string } | undefined;
          msgType = "document";
          body = doc?.filename ?? "arquivo";
          if (doc?.id) mediaUrl = await midiaParaStorage(supabase, doc.id, accessToken, ownerId, doc.filename);
        } else if (type === "button" || type === "interactive") {
          // O contato clicou num botão do modelo ou escolheu um item de lista.
          //
          // Isto vinha sendo DESCARTADO pelo `continue` do caso não mapeado: a
          // resposta não chegava a existir para nós. Quem clicava em "Agendar
          // consulta" recebia silêncio, a automação parada em "Entrada do
          // usuário" nunca era retomada, o agente não era acionado e a conversa
          // parecia sem resposta nas duas telas. A pior forma de perder mensagem
          // de cliente, porque nada indica que se perdeu.
          //
          // Mesmo tratamento que o dapi-webhook já dava: vira mensagem de texto
          // com o rótulo do botão, e daí em diante segue o caminho normal,
          // inclusive a retomada de automação lá embaixo.
          msgType = "text";
          body = textoDeRespostaInterativa(message);
          if (!body) {
            // Formato desconhecido: registra o payload para ser reconhecido na
            // próxima, em vez de sumir sem deixar rastro.
            console.warn(`cloud-api-webhook: resposta interativa '${type}' sem texto reconhecido:`, JSON.stringify(message).slice(0, 800));
            continue;
          }
        } else {
          // Vídeo, figurinha, localização, reação, contato… Ainda não sabemos
          // exibir esses tipos, mas o aviso fica: sem ele, ninguém descobre que
          // o cliente mandou algo que o CRM não mostra.
          console.warn("cloud-api-webhook: tipo de mensagem não mapeado:", type);
          continue;
        }

        if (!body && !mediaUrl) continue;

        const momment = timestamp
          ? Number(timestamp) * 1000
          : Date.now();

        // Resolve a conversa ANTES de inserir, para a mensagem já nascer com o
        // vínculo em vez de depender de casar telefone por texto na hora de ler.
        // A ordem inverteu na Fase 1 do plano de atendimentos; é seguro porque a
        // deduplicação por message_id acima já deu `continue`, então entrega
        // repetida não chega aqui.
        let conversationId: string | null = null;
        try {
          conversationId = await upsertConversationForMessage(supabase, {
            ownerId, companyId, instanceId: phoneNumberId, phone: cleanPhone,
            name: senderName,
            preview: previewLabelFor(msgType, body),
            fromMe: false,
          });
        } catch (e) {
          console.error("cloud-api-webhook: upsertConversationForMessage failed:", e);
        }

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
          conversation_id: conversationId,
          // A Meta manda só o id da citada (message.context.id), sem o texto:
          // o preview fica nulo e a bolha resolve buscando pelo id.
          reply_to_message_id: citacao.replyToMessageId,
          reply_to_preview:    citacao.replyToPreview,
        });

        if (error && error.code !== "23505") {
          console.error("cloud-api-webhook: erro ao inserir mensagem:", error);
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
