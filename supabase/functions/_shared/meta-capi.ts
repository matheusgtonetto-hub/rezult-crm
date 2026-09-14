/**
 * Envio de eventos para a Meta Conversions API.
 *
 * O stripe-webhook tem a própria cópia deste envio (Purchase) e continua com
 * ela de propósito: é o caminho da cobrança, e mexer nele junto com a
 * instrumentação de aquisição misturaria dois riscos num deploy só. Quando esta
 * versão estiver provada em produção, o webhook pode passar a usá-la.
 *
 * Diferença em relação à cópia do webhook: esta aceita _fbp, _fbc, IP e user
 * agent. Sem eles a Meta recebe o evento mas mal consegue ligá-lo ao anúncio.
 */

const PIXEL = Deno.env.get("META_PIXEL_ID") ?? "";
const TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";
const VERSAO = "v19.0";

async function sha256(valor: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor.toLowerCase().trim()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface EventoMeta {
  nome: string;
  eventId: string;
  urlOrigem?: string;
  email?: string | null;
  nomeCompleto?: string | null;
  telefone?: string | null;
  idExterno?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  customData?: Record<string, unknown>;
}

export async function enviarEventoMeta(e: EventoMeta): Promise<{ enviado: boolean; detalhe: string }> {
  if (!PIXEL || !TOKEN) return { enviado: false, detalhe: "META_PIXEL_ID ou META_CAPI_TOKEN ausente" };

  const u: Record<string, unknown> = {};
  if (e.email) u.em = [await sha256(e.email)];
  if (e.nomeCompleto) {
    const partes = e.nomeCompleto.trim().split(/\s+/);
    u.fn = [await sha256(partes[0])];
    if (partes.length > 1) u.ln = [await sha256(partes.slice(1).join(" "))];
  }
  if (e.telefone) {
    // A Meta pede só dígitos, com código do país.
    const digitos = e.telefone.replace(/\D/g, "");
    if (digitos.length >= 10) u.ph = [await sha256(digitos)];
  }
  if (e.idExterno) u.external_id = [await sha256(e.idExterno)];
  // _fbp, _fbc, IP e user agent vão SEM hash: é o formato que a Meta exige.
  if (e.fbp) u.fbp = e.fbp;
  if (e.fbc) u.fbc = e.fbc;
  if (e.ip) u.client_ip_address = e.ip;
  if (e.userAgent) u.client_user_agent = e.userAgent;

  const corpo = {
    data: [{
      event_name: e.nome,
      event_time: Math.floor(Date.now() / 1000),
      event_id: e.eventId,
      action_source: "website",
      event_source_url: e.urlOrigem,
      user_data: u,
      custom_data: e.customData ?? {},
    }],
  };

  try {
    const r = await fetch(`https://graph.facebook.com/${VERSAO}/${PIXEL}/events?access_token=${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const j = await r.json();
    if (!r.ok) return { enviado: false, detalhe: JSON.stringify(j) };
    return { enviado: true, detalhe: `events_received=${j.events_received}` };
  } catch (err) {
    return { enviado: false, detalhe: String(err) };
  }
}
