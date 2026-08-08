import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.11.0";

// Processa um documento enviado na aba "Base de Conhecimento" do agente:
// baixa do Storage, extrai texto, divide em chunks, gera embedding e grava
// em agent_knowledge_chunks. Chamado depois do upload (documentId já existe
// em agent_knowledge_documents com status='pending').
//
// ⚠️ CONFIANÇA POR TIPO DE ARQUIVO:
//   .txt  — ALTA, decodificação direta, sem dependência externa
//   .csv  — ALTA, é texto puro, mesmo caminho do .txt
//   .json — ALTA, parse + stringify pra normalizar formatação (cai pro texto
//           cru se não for JSON válido)
//   .html — ALTA, strip de tags via regex (não é um parser HTML de verdade,
//           mas suficiente pra extrair o texto visível pra embeddings)
//   .pdf  — MEDIA, usa `unpdf` (biblioteca real, feita pra edge/Deno/Workers,
//           mas não testei contra um PDF real do Rezult ainda)
//   .docx — NÃO IMPLEMENTADO — não encontrei biblioteca de extração DOCX
//           comprovadamente compatível com Deno edge runtime. Recomendo
//           testar antes de liberar upload de .docx pro cliente, ou converter
//           pra .txt/.pdf como passo manual até resolver isso.

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB — mesmo limite anunciado na UI

// Extrator só-o-bastante-bom pra HTML: remove tags e normaliza espaços. Não é
// um parser de verdade (não trata <script>/<style> como caso especial), mas
// pro propósito de embeddings (texto visível pra busca semântica) é suficiente.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

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

// A coluna agent_knowledge_chunks.embedding é vector(1536), mas o
// text-embedding-3-large devolve 3072 dimensões por padrão. Sem pedir
// `dimensions` explicitamente, TODO insert de chunk falhava por incompatibi-
// lidade de dimensão -- e como o erro do insert era ignorado, o documento
// era marcado "ready" com zero conteúdo indexado. A Base de Conhecimento
// inteira ficava muda, sem nenhum sinal de erro. Precisa bater com o
// vector(1536) da migration 20260723000001 e com a busca em
// agent-sds-qualify/index.ts::retrieveKbContext.
const EMBEDDING_DIMS = 1536;

async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "text-embedding-3-large", input: text, dimensions: EMBEDDING_DIMS }),
  });
  if (!res.ok) throw new Error(`embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const vetor = data.data[0].embedding as number[];
  if (vetor.length !== EMBEDDING_DIMS) {
    throw new Error(`embedding veio com ${vetor.length} dimensões, esperado ${EMBEDDING_DIMS}`);
  }
  return vetor;
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

    if (fileBlob.size > MAX_FILE_BYTES) {
      throw new Error(`arquivo muito grande (${(fileBlob.size / 1024 / 1024).toFixed(1)}MB) — máx 50MB`);
    }

    const ext = (doc.file_name as string).split(".").pop()?.toLowerCase();
    let rawText = "";

    if (ext === "txt" || ext === "csv") {
      rawText = await fileBlob.text();
    } else if (ext === "json") {
      const raw = await fileBlob.text();
      try {
        rawText = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        rawText = raw; // não é JSON válido — indexa como texto cru mesmo assim
      }
    } else if (ext === "html" || ext === "htm") {
      rawText = stripHtml(await fileBlob.text());
    } else if (ext === "pdf") {
      const buf = new Uint8Array(await fileBlob.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = text;
    } else {
      throw new Error(`extração para .${ext} não implementada — só .txt, .csv, .json, .html e .pdf por enquanto`);
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
    // Documento sem texto extraível (PDF só de imagem, arquivo vazio) não é
    // sucesso: antes virava "ready" com 0 chunks e o agente seguia sem saber
    // de nada, enquanto a tela mostrava tudo certo.
    if (chunks.length === 0) {
      throw new Error("nenhum texto extraível encontrado no arquivo (PDF apenas de imagem? arquivo vazio?)");
    }

    for (const content of chunks) {
      const embedding = await embed(content, openaiKey);
      // O erro do insert PRECISA ser checado: era ignorado, então falha de
      // dimensão/permissão passava batido e o documento era dado como pronto.
      const { error: chunkErr } = await db.from("agent_knowledge_chunks").insert({
        document_id: doc.id,
        company_id: doc.company_id,
        content,
        embedding,
      });
      if (chunkErr) throw new Error(`falha ao gravar chunk: ${chunkErr.message}`);
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
