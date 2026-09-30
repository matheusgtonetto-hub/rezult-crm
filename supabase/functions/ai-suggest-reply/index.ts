import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaBloqueada } from "../_shared/cobranca.ts";
import { registrarUso } from "../_shared/uso.ts";
import { podeGastar } from "../_shared/credito.ts";
import { resolverChaveDeIa } from "../_shared/chave-ia.ts";

// Sugestão de resposta com IA para o Multiatendimento.
// Lê o histórico recente da conversa + contexto do lead e gera a próxima
// mensagem do atendente. A chave fica no servidor.
// Autenticada pelo JWT do usuário logado (verify_jwt = false; validado aqui).
//
// Só OpenAI. Dizia "OpenAI primeiro, Anthropic como alternativa", que fazia
// sentido enquanto o cliente trazia a própria chave; desde 30/09/2026 a chave é
// a da Rezult e o consumo sai do saldo, então não há segunda fornecedora para
// onde cair.

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

/*
 * Luna (dono, 25/09/2026).
 *
 * Aqui o degrau mais barato e o mais indicado, nao um compromisso: e UMA
 * chamada, a saida sao 1 a 3 frases, nao ha ferramenta para chamar e o
 * atendente esta olhando a tela esperando. Rapidez pesa mais que deliberacao,
 * que e o mesmo motivo de `reasoning_effort: "none"` logo abaixo.
 */
const MODELO_OPENAI = "gpt-5.6-luna";

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

  // Conta em somente leitura não queima token de IA. Checado antes de resolver
  // a chave para a chamada nem chegar a ser montada.
  if (await empresaBloqueada(db, body.companyId)) {
    return json({ error: "billing_blocked" }, 402);
  }

  /*
   * Trava de saldo, no mesmo lugar da trava de cobrança: antes de resolver a
   * chave, para a chamada nem chegar a ser montada.
   *
   * Aqui o erro VAI para a tela, diferente dos agentes. Quem clicou em "sugerir
   * resposta" é o atendente, está olhando e esperando uma resposta: devolver
   * silêncio faria ele clicar de novo.
   */
  const veredicto = await podeGastar(db, body.companyId ?? "", "sugestao");
  if (veredicto !== "ok") return json({ error: veredicto }, 200);

  /*
   * ─── A chave, e quem paga por ela ─────────────────────────────────────────
   *
   * Sempre a da Rezult, e o consumo é debitado do saldo (`daRezult`). A trava
   * de saldo mora antes desta linha e responde `sem_saldo`, que é o erro que a
   * tela mostra para quem precisa comprar crédito.
   *
   * Saiu a segunda tentativa em `anthropic`. Ela existia para quem tinha chave
   * própria da Anthropic cadastrada, e o BYOK acabou em 30/09/2026 -- hoje ela
   * só produziria uma segunda chamada garantidamente nula antes do mesmo
   * `not_configured`.
   *
   * Com isso some também a inferência do provedor, que saía de QUAL tentativa
   * funcionou (nunca do prefixo da chave, que quebraria em silêncio no dia em
   * que um deles mudasse o formato do token). Com uma tentativa só, não há o
   * que inferir.
   */
  const chave = await resolverChaveDeIa(db, body.companyId ?? "", "openai", "sugestao");
  if (!chave) return json({ error: "not_configured" }, 200);

  const openaiKey = chave.apiKey;

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
    "Responda APENAS com o texto da mensagem a ser enviada, sem aspas, sem rótulos, sem comentários ou explicações.";

  const userContent =
    (contextLines ? `Contexto:\n${contextLines}\n\n` : "") +
    `Conversa até agora:\n${transcript}\n\n` +
    "Escreva a próxima mensagem do atendente.";

  let entrada = 0;
  let saida = 0;
  // Subconjunto de `entrada` que veio do cache e custa 10%.
  let cacheada = 0;
  let modelo = "";

  try {
    let suggestion = "";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
      // GPT-5.x é modelo de raciocínio: recusa temperature e usa
      // max_completion_tokens. Raciocínio desligado, como no agente
      // (agent-sds-qualify), porque aqui é uma frase curta e o tempo de
      // resposta pesa mais que a deliberação.
      body: JSON.stringify({
        model: MODELO_OPENAI,
        reasoning_effort: "none",
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("[ai-suggest-reply] OpenAI error:", res.status, detail);
      return json({ error: "ai_request_failed", status: res.status }, 502);
    }
    const data = await res.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    suggestion = (data.choices?.[0]?.message?.content ?? "").trim();
    entrada  = data.usage?.prompt_tokens ?? 0;
    saida    = data.usage?.completion_tokens ?? 0;
    cacheada = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    modelo   = MODELO_OPENAI;

    /*
     * Registra o uso mesmo quando a sugestao vem vazia.
     *
     * A chamada aconteceu e o fornecedor cobrou por ela; se o registro ficasse
     * depois do `if`, uma resposta vazia viraria consumo invisivel -- e resposta
     * vazia e justamente o caso em que o modelo gastou tokens sem entregar nada.
     *
     * Sem `await`: a sugestao ja esta pronta e o atendente esta esperando ela na
     * tela. O registro nao pode somar latencia a uma acao sincrona do usuario.
     */
    registrarUso(db, {
      companyId: body.companyId ?? "",
      model: modelo,
      entrada,
      saida,
      entradaCacheada: cacheada,
      origem: "sugestao",
      sucesso: !!suggestion,
      debitar: chave.daRezult,
    }).catch(e => console.error("[ai-suggest-reply] registrarUso:", e));

    if (!suggestion) return json({ error: "empty_suggestion" }, 502);
    return json({ suggestion }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai-suggest-reply] CRASH:", msg);
    return json({ error: "internal_error", detail: msg }, 500);
  }
});
