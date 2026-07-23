import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.11.0";

// Processa um documento enviado na aba "Base de Conhecimento" do agente:
// baixa do Storage, extrai texto, divide em chunks, gera embedding e grava
// em agent_knowledge_chunks. Chamado depois do upload (documentId já existe
// em agent_knowledge_documents com status='pending').
//
// ⚠️ CONFIANÇA POR TIPO DE ARQUIVO:
//   .txt  — ALTA, decodificação direta, sem dependência externa
//   .pdf  — MEDIA, usa `unpdf` (biblioteca real, feita pra edge/Deno/Workers,
//           mas não testei contra um PDF real do Rezult ainda)
//   .docx — NÃO IMPLEMENTADO — não encontrei biblioteca de extração DOCX
//           comprovadamente compatível com Deno edge runtime. Recomendo
//           testar antes de liberar upload de .docx pro cliente, ou converter
//           pra .txt/.pdf como passo manual até resolver isso.

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

const CHUNK_SIZE_CHARS = 2000; // ~500 palavras por chunk

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += CHUNK_SIZE_CHARS) {
    const chunk = clean.slice(i, i + CHUNK_SIZE_CHARS).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-large", input: text }),
  });
  if (!res.ok) throw new Error(`embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.data[0].embedding as number[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Duas formas de chamar: secret interno (server-to-server) OU JWT de
  // usuário logado (o navegador, depois de fazer upload, nunca deve ter o
  // secret interno — só o servidor tem). Mesmo padrão do google-calendar-event.
  const internalSecret = req.headers.get("x-internal-secret") ?? "";
  const configuredSecret = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";
  const isInternalCall = configuredSecret !== "" && internalSecret === configuredSecret;

  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  let body: { documentId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.documentId) return json({ error: "missing_document_id" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: doc, error: docErr } = await db
    .from("agent_knowledge_documents")
    .select("*")
    .eq("id", body.documentId)
    .single();
  if (docErr || !doc) return json({ error: "document_not_found" }, 404);

  if (!isInternalCall) {
    // Chamada do navegador: exige JWT válido de alguém com acesso à empresa
    // dona do documento (dono da empresa OU membro em company_members —
    // mesma regra do is_member_of, reimplementada aqui porque o service role
    // não roda RLS automaticamente).
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const uid = userData.user.id;

    const { data: companyRow } = await db
      .from("companies")
      .select("owner_id")
      .eq("id", doc.company_id as string)
      .maybeSingle();
    const isOwner = companyRow?.owner_id === uid;

    let isMember = false;
    if (!isOwner) {
      const { data: memberRow } = await db
        .from("company_members")
        .select("id")
        .eq("company_id", doc.company_id as string)
        .eq("user_id", uid)
        .maybeSingle();
      isMember = !!memberRow;
    }

    if (!isOwner && !isMember) return json({ error: "forbidden" }, 403);
  }

  await db.from("agent_knowledge_documents").update({ status: "processing" }).eq("id", doc.id);

  try {
    const { data: fileBlob, error: dlErr } = await db.storage
      .from("agent-knowledge")
      .download(doc.storage_path as string);
    if (dlErr || !fileBlob) throw new Error(`download falhou: ${dlErr?.message}`);

    const ext = (doc.file_name as string).split(".").pop()?.toLowerCase();
    let rawText = "";

    if (ext === "txt") {
      rawText = await fileBlob.text();
    } else if (ext === "pdf") {
      const buf = new Uint8Array(await fileBlob.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = text;
    } else {
      throw new Error(`extração para .${ext} não implementada — só .txt e .pdf por enquanto`);
    }

    // Chave de embeddings: prioriza a chave própria da empresa (ai_provider_keys,
    // mesmo padrão do agent-sds-qualify pra Anthropic), cai pro fallback global.
    const { data: companyOpenaiKey } = await db
      .from("ai_provider_keys")
      .select("api_key")
      .eq("company_id", doc.company_id as string)
      .eq("provider", "openai")
      .eq("active", true)
      .maybeSingle();
    const openaiKey = companyOpenaiKey?.api_key || Deno.env.get("OPENAI_API_KEY") || "";
    if (!openaiKey) throw new Error("OPENAI_API_KEY não configurada (nem por empresa, nem global)");

    const chunks = chunkText(rawText);
    for (const content of chunks) {
      const embedding = await embed(content, openaiKey);
      await db.from("agent_knowledge_chunks").insert({
        document_id: doc.id,
        company_id: doc.company_id,
        content,
        embedding,
      });
    }

    await db.from("agent_knowledge_documents").update({ status: "ready" }).eq("id", doc.id);
    return json({ ok: true, chunks: chunks.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-kb-ingest] falhou:", message);
    await db.from("agent_knowledge_documents").update({ status: "error", error_detail: message }).eq("id", doc.id);
    return json({ error: "ingest_failed", detail: message }, 500);
  }
});
