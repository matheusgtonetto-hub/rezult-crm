// Envio de WhatsApp compartilhado entre functions autônomas (sem JWT de
// usuário). Espelha fielmente a lógica real de supabase/functions/
// automation-runner/index.ts (sendWa/sendZapi/sendDapi/sendCloudApi) —
// copiado, não movido, para não alterar o automation-runner em produção.
// Suporta os 3 provedores: Z-API, D-API e a API oficial (Cloud API/WABA).

export interface ZapiCreds {
  instanceId: string; // Z-API: id da instância · D-API: sessionId · Cloud API: Phone Number ID
  token: string;       // Z-API: token da instância · D-API: API Key · Cloud API: access token
  clientToken: string | null;
  provider?: "zapi" | "dapi" | "cloud_api";
}

export type WaMsg =
  | { kind: "text"; phone: string; message: string }
  | { kind: "buttons"; phone: string; message: string; buttons: string[] }
  | { kind: "audio"; phone: string; url: string }
  | { kind: "image"; phone: string; url: string }
  | { kind: "document"; phone: string; url: string; fileName: string; ext: string };

// Mostra "digitando..." pro contato antes da mensagem sair. É BEST-EFFORT:
// qualquer falha aqui é engolida de propósito, porque indicador de presença
// nunca pode impedir a mensagem real de ser enviada.
//
// Cobertura por provedor (verificado na documentação de cada um):
//  - D-API .......... suportado (POST /chats/presence)
//  - Z-API .......... NÃO tem endpoint pra ENVIAR presença; a doc só expõe
//                     webhook pra RECEBER o status do outro lado.
//  - Cloud API ...... a Meta suporta, mas exige o message_id da mensagem
//                     recebida (vai junto com o "marcar como lida"), e esse
//                     id não chega até aqui hoje. Fica pendente.
// Provedor sem suporte simplesmente não faz nada -- a conversa segue igual,
// só sem o indicador.
export async function sendPresence(
  creds: ZapiCreds,
  phone: string,
  presence: "typing" | "paused",
  durationMs?: number,
): Promise<void> {
  if (creds.provider !== "dapi") return;
  try {
    await fetch("https://api.d-api.cloud/api/v1/chats/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": creds.token },
      body: JSON.stringify({
        sessionId: creds.instanceId,
        to: phone,
        presence,
        // durationMs só faz sentido pro "typing"; o "paused" encerra na hora.
        ...(presence === "typing" && durationMs
          ? { durationMs: Math.max(1000, Math.min(15000, Math.round(durationMs))) }
          : {}),
      }),
    });
  } catch (e) {
    console.warn(`[whatsapp-send] presença '${presence}' falhou (ignorado):`, e);
  }
}

export async function sendTyping(creds: ZapiCreds, phone: string, durationMs: number): Promise<void> {
  await sendPresence(creds, phone, "typing", durationMs);
}

// Encerra o "digitando" imediatamente. Sem isso o indicador continuava
// rodando até o durationMs expirar -- numa resposta curta o contato via a
// mensagem chegar e o "digitando" seguir por mais alguns segundos, como se
// viesse mais coisa que nunca vinha.
export async function clearTyping(creds: ZapiCreds, phone: string): Promise<void> {
  await sendPresence(creds, phone, "paused");
}

export async function sendWa(creds: ZapiCreds, msg: WaMsg): Promise<void> {
  if (creds.provider === "dapi") { await sendDapi(creds, msg); return; }
  if (creds.provider === "cloud_api") { await sendCloudApi(creds, msg); return; }
  switch (msg.kind) {
    case "text":
      await sendZapi(creds, "send-text", { phone: msg.phone, message: msg.message });
      break;
    case "buttons":
      await sendZapi(creds, "send-button-list", {
        phone: msg.phone, message: msg.message,
        buttonList: { buttons: msg.buttons.map((label, idx) => ({ id: String(idx + 1), label })) },
      });
      break;
    case "audio":
      await sendZapi(creds, "send-audio", { phone: msg.phone, audio: msg.url });
      break;
    case "image":
      await sendZapi(creds, "send-image", { phone: msg.phone, image: msg.url });
      break;
    case "document":
      await sendZapi(creds, `send-document/${msg.ext || "pdf"}`, { phone: msg.phone, document: msg.url, fileName: msg.fileName });
      break;
  }
}

async function sendZapi(creds: ZapiCreds, endpoint: string, body: Record<string, unknown>): Promise<void> {
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/${endpoint}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (creds.clientToken) headers["Client-Token"] = creds.clientToken;
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Z-API ${endpoint} HTTP ${resp.status}: ${detail.slice(0, 200)}`);
  }
}

async function sendDapi(creds: ZapiCreds, msg: WaMsg): Promise<void> {
  const sessionId = creds.instanceId;
  const to = msg.phone;
  let path = "text";
  let body: Record<string, unknown> = {};
  switch (msg.kind) {
    case "text":
      path = "text"; body = { sessionId, to, text: msg.message }; break;
    case "buttons":
      path = "text";
      body = { sessionId, to, text: [msg.message, ...msg.buttons.map((b, i) => `${i + 1}. ${b}`)].filter(Boolean).join("\n") };
      break;
    case "audio":
      path = "audio"; body = { sessionId, to, audio: msg.url }; break;
    case "image":
      path = "image"; body = { sessionId, to, image: msg.url }; break;
    case "document":
      path = "document"; body = { sessionId, to, document: msg.url, fileName: msg.fileName }; break;
  }
  const resp = await fetch(`https://api.d-api.cloud/api/v1/messages/send/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": creds.token },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`D-API send/${path} HTTP ${resp.status}: ${detail.slice(0, 200)}`);
  }
}

async function sendCloudApi(creds: ZapiCreds, msg: WaMsg): Promise<void> {
  const phoneNumberId = creds.instanceId;
  const accessToken = creds.token;
  const to = msg.phone.replace(/\D/g, "");
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` };

  let body: Record<string, unknown>;
  switch (msg.kind) {
    case "text":
      body = { messaging_product: "whatsapp", to, type: "text", text: { body: msg.message, preview_url: false } };
      break;
    case "buttons":
      body = {
        messaging_product: "whatsapp", to, type: "text",
        text: { body: [msg.message, ...msg.buttons.map((b, i) => `${i + 1}. ${b}`)].join("\n"), preview_url: false },
      };
      break;
    case "audio":
      body = { messaging_product: "whatsapp", to, type: "audio", audio: { link: msg.url } };
      break;
    case "image":
      body = { messaging_product: "whatsapp", to, type: "image", image: { link: msg.url } };
      break;
    case "document":
      body = { messaging_product: "whatsapp", to, type: "document", document: { link: msg.url, filename: msg.fileName } };
      break;
    default:
      return;
  }

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Cloud API HTTP ${resp.status}: ${detail.slice(0, 200)}`);
  }
}
