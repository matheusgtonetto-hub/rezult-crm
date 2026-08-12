import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sugestão de resposta com IA para o Multiatendimento.
// Lê o histórico recente da conversa + contexto do lead e gera a próxima
// mensagem do atendente via Claude (Anthropic). A chave fica no servidor.
// Autenticada pelo JWT do usuário logado (verify_jwt = false; validado aqui).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type InMsg = { from?: string; text?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Autentica o usuário pelo JWT (evita uso anônimo da chave de IA)
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const db = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await db.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  let body: { messages?: InMsg[]; leadName?: string; stage?: string; pipeline?: string; companyId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  // Chave da EMPRESA (BYOK), o mesmo padrão do agente. Antes esta função
  // exigia um ANTHROPIC_API_KEY global do projeto, que nenhum cliente tem: o
  // botão de sugestão nascia morto para todo mundo, respondendo "not_configured"
  // com status 200. A variável de ambiente fica como último recurso, para
  // ambiente de desenvolvimento.
  let apiKey = "";
  if (body.companyId) {
    const { data: chave } = await db
      .from("ai_provider_keys")
      .select("api_key")
      .eq("company_id", body.companyId)
      .eq("provider", "anthropic")
      .eq("active", true)
      .maybeSingle();
    apiKey = (chave?.api_key as string) ?? "";
  }
  if (!apiKey) apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!apiKey) return json({ error: "not_configured" }, 200);

  const msgs = (body.messages ?? []).filter(m => (m.text ?? "").trim()).slice(-30);
  if (msgs.length === 0) return json({ error: "empty_conversation" }, 400);

  // Monta a transcrição rotulada (Lead / Atendente)
  const transcript = msgs
    .map(m => `${m.from === "agent" ? "Atendente" : "Lead"}: ${m.text}`)
    .join("\n");

  const contextLines = [
    body.leadName ? `Nome do lead: ${body.leadName}` : "",
    body.pipeline ? `Pipeline: ${body.pipeline}` : "",
    body.stage ? `Etapa do funil: ${body.stage}` : "",
  ].filter(Boolean).join("\n");

  const system =
    "Você é um atendente de vendas B2B brasileiro atuando no WhatsApp via CRM. " +
    "Com base no histórico da conversa, escreva a PRÓXIMA mensagem do atendente: " +
    "natural, cordial, objetiva, em português brasileiro, adequada ao contexto e à etapa do funil. " +
    "Seja conciso (1 a 3 frases). Não invente informações que você não tem. " +
    "Responda APENAS com o texto da mensagem a ser enviada — sem aspas, sem rótulos, sem comentários ou explicações.";

  const userContent =
    (contextLines ? `Contexto:\n${contextLines}\n\n` : "") +
    `Conversa até agora:\n${transcript}\n\n` +
    "Escreva a próxima mensagem do atendente.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("[ai-suggest-reply] Anthropic error:", res.status, detail);
      return json({ error: "ai_request_failed", status: res.status }, 502);
    }

    const data = await res.json() as { content?: { type: string; text?: string }[] };
    const suggestion = (data.content ?? [])
      .filter(b => b.type === "text")
      .map(b => b.text ?? "")
      .join("")
      .trim();

    if (!suggestion) return json({ error: "empty_suggestion" }, 502);
    return json({ suggestion }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-suggest-reply] CRASH:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
