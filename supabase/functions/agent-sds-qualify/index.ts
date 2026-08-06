import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWa, type ZapiCreds } from "../_shared/whatsapp-send.ts";
import { TOOL_SCHEMAS, executeRegistryTool, type ToolCtx, type ToolResult } from "../_shared/agent-tools.ts";

// Agente SDS: qualifica leads no multiatendimento com objetivo FIXO de
// agendar reunião qualificada pro time de closers. Disparado pelos webhooks
// de WhatsApp (zapi-webhook/dapi-webhook/cloud-api-webhook) após uma
// mensagem inbound ser salva. meta-webhook é Instagram — fora de escopo.

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

// Objetivo e metodologia FIXOS — definidos pelo Rezult, não vêm do banco,
// não são editáveis pelo cliente. Isso é a IP do produto.
const SDS_METHODOLOGY = `
Você é o agente SDS (Sales Development Specialist) do Rezult CRM.
Seu único objetivo é: qualificar o lead E agendar uma reunião com o time de closers.
Filosofia: melhor perder um lead cedo do que perder um deal tarde — não force
reunião com quem não é ICP. Faça perguntas de descoberta antes de oferecer horário.
Nunca revele preço antes de entender a dor do lead.

IMPORTANTE: você não tem outro canal de resposta além das tools. Toda mensagem
que o lead deve receber PRECISA ser enviada via enviar_mensagem — nunca responda
só com texto solto, isso não chega ao lead.
`.trim();

const TOOLS = [
  {
    name: "qualificar_lead",
    description: "Registra o resultado da qualificação do lead com score e motivo.",
    input_schema: {
      type: "object",
      properties: {
        score: { type: "number" },
        qualificado: { type: "boolean" },
        motivo: { type: "string" },
      },
      required: ["score", "qualificado", "motivo"],
    },
  },
  {
    name: "agendar_reuniao_closer",
    description: "Agenda reunião no calendário do closer responsável, quando o lead está qualificado e aceitou um horário.",
    input_schema: {
      type: "object",
      properties: {
        start_datetime: { type: "string", description: "formato YYYY-MM-DDTHH:mm:ss, horário de Brasília" },
        duration_minutes: { type: "number" },
      },
      required: ["start_datetime"],
    },
  },
  {
    name: "mover_pipeline",
    description: "Move o negócio para outra etapa do funil.",
    input_schema: {
      type: "object",
      properties: { coluna_id: { type: "string" } },
      required: ["coluna_id"],
    },
  },
  {
    name: "enviar_mensagem",
    description: "Envia a próxima mensagem para o lead no WhatsApp.",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" } },
      required: ["texto"],
    },
  },
  {
    name: "escalar_humano",
    description: "Passa a conversa para um atendente humano.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
];

// ─── Prompt e tools dinâmicos (aba Perfil "Objetivo" + aba "Ferramentas") ───
// Só entra em ação quando o agente tem objectives configurado (opt-in via
// UI nova). Agentes criados antes disso têm objectives=[] e continuam no
// caminho legado (SDS_METHODOLOGY + TOOLS fixos acima) -- zero risco de
// regressão pra quem já está em produção.
const DYNAMIC_BASE_INTRO = `
Você é o agente de atendimento do Rezult CRM, configurado pela empresa pra atuar nesta conversa de WhatsApp.
IMPORTANTE: você não tem outro canal de resposta além das tools. Toda mensagem que
o lead deve receber PRECISA ser enviada via enviar_mensagem — nunca responda só
com texto solto, isso não chega ao lead.
`.trim();

const OBJECTIVE_PROMPTS: Record<string, string> = {
  qualificar: "OBJETIVO — Qualificar: avalie se o lead é um bom encaixe (ICP) fazendo perguntas de descoberta antes de qualquer oferta. Os campos da tool qualificar_lead indicam quais informações mapear ao longo da conversa (não precisa ser tudo de uma vez, nem na ordem exata) — registre o resultado chamando qualificar_lead. Nunca revele preço antes de entender a dor do lead.",
  agendar: "OBJETIVO — Agendar Reunião: quando o lead estiver qualificado e pronto, ofereça horário e agende com agendar_reuniao_closer. Melhor perder um lead cedo do que perder um deal tarde — não force reunião com quem não é ICP.",
  atendimento: "OBJETIVO — Atendimento: tire dúvidas e explique sobre a empresa usando o material de referência (Base de Conhecimento) informado abaixo. Se a resposta não estiver no material, seja honesto e ofereça escalar_humano em vez de inventar informação.",
};

function buildDynamicSystemPrompt(
  objectives: string[],
  customContext: string,
  kbContext: string,
  objectiveInstructions: Record<string, string>,
): string {
  const blocks = [DYNAMIC_BASE_INTRO];
  for (const o of objectives) {
    const base = OBJECTIVE_PROMPTS[o];
    if (!base) continue;
    const extra = objectiveInstructions[o]?.trim();
    // Instrução específica do objetivo (definida pelo usuário na aba Perfil)
    // some ao prompt fixo daquele objetivo -- não se mistura com o
    // customContext geral (aba Instruções), que se aplica ao agente inteiro.
    blocks.push(extra ? `${base}\nInstruções específicas definidas pelo usuário pra esse objetivo: ${extra}` : base);
  }
  if (kbContext) blocks.push(`BASE DE CONHECIMENTO (material da empresa — use pra responder com precisão):\n${kbContext}`);
  if (customContext) blocks.push(customContext);
  return blocks.join("\n\n");
}

type AnthropicToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

// qualificar_lead ganha 1 propriedade por campo adicional selecionado na aba
// Perfil (chave = id do custom_field_items, igual ao que
// definir_campo_adicional_lead/MultiatendimentoPage.tsx já usam pra ler
// leads.custom_field_values -- assim o card do lead mostra o valor direto,
// sem precisar de tradução de chave em lugar nenhum).
function buildQualificarLeadTool(qualFields: { id: string; label: string }[]): AnthropicToolDef {
  const properties: Record<string, unknown> = {
    score: { type: "number" },
    qualificado: { type: "boolean" },
    motivo: { type: "string" },
  };
  for (const f of qualFields) {
    properties[f.id] = { type: "string", description: `Valor mapeado durante a conversa para o campo "${f.label}"` };
  }
  return {
    name: "qualificar_lead",
    description: "Registra o resultado da qualificação do lead com score, motivo, e os campos adicionais mapeados na conversa.",
    input_schema: { type: "object", properties, required: ["score", "qualificado", "motivo"] },
  };
}

function buildDynamicTools(objectives: string[], enabledTools: string[], qualFields: { id: string; label: string }[]): AnthropicToolDef[] {
  const tools: AnthropicToolDef[] = [];
  const byName = (n: string) => TOOLS.find((t) => t.name === n);
  tools.push(byName("enviar_mensagem")!, byName("escalar_humano")!);
  if (objectives.includes("qualificar")) tools.push(buildQualificarLeadTool(qualFields));
  if (objectives.includes("agendar")) tools.push(byName("agendar_reuniao_closer")!);
  for (const toolId of enabledTools) {
    const schema = TOOL_SCHEMAS.find((s) => s.id === toolId);
    if (schema) tools.push({ name: schema.name, description: schema.description, input_schema: schema.input_schema });
  }
  return tools;
}

// Busca semântica na Base de Conhecimento do agente (RAG). Precisa de chave
// OpenAI pro embedding mesmo quando o modelo de chat escolhido é Claude --
// mesmo modelo de embedding usado no upload (agent-kb-ingest).
async function retrieveKbContext(
  db: ReturnType<typeof createClient>,
  agentId: string,
  companyId: string,
  query: string,
): Promise<string> {
  if (!query.trim()) return "";
  const { data: openaiKeyRow } = await db
    .from("ai_provider_keys")
    .select("api_key")
    .eq("company_id", companyId)
    .eq("provider", "openai")
    .eq("active", true)
    .maybeSingle();
  const openaiKey = openaiKeyRow?.api_key || Deno.env.get("OPENAI_API_KEY") || "";
  if (!openaiKey) return "";

  try {
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-large", input: query }),
    });
    if (!embRes.ok) {
      console.error("[agent-sds-qualify] embeddings error:", embRes.status, await embRes.text());
      return "";
    }
    const embData = await embRes.json();
    const queryEmbedding = embData.data[0].embedding;
    const { data: chunks, error } = await db.rpc("match_agent_knowledge_chunks", {
      query_embedding: queryEmbedding, match_agent_id: agentId, match_count: 5,
    });
    if (error || !chunks?.length) return "";
    // Agrupa por KB e prefixa com nome+descrição uma vez só -- a descrição
    // (aba "Configurações" da KB) é a instrução de quando usar aquele
    // material, então o modelo precisa ver isso junto do conteúdo, não só o
    // texto solto dos chunks.
    // deno-lint-ignore no-explicit-any
    const byKb = new Map<string, { description: string | null; parts: string[] }>();
    // deno-lint-ignore no-explicit-any
    for (const c of chunks as any[]) {
      const key = c.kb_name ?? "Base de Conhecimento";
      if (!byKb.has(key)) byKb.set(key, { description: c.kb_description ?? null, parts: [] });
      byKb.get(key)!.parts.push(c.content as string);
    }
    return [...byKb.entries()]
      .map(([name, { description, parts }]) =>
        `[${name}]${description ? ` — ${description}` : ""}\n${parts.join("\n---\n")}`)
      .join("\n\n");
  } catch (err) {
    console.error("[agent-sds-qualify] retrieveKbContext falhou:", err);
    return "";
  }
}

// ─── Comportamento (aba "Comportamento") ────────────────────────────────────
// Camada independente dos Objetivos/Ferramentas -- aplica em cima de
// QUALQUER agente, legado ou dinâmico. behavior_config vem vazio por padrão
// ({}), então nenhum toggle muda comportamento até a empresa mexer na aba.
type BehaviorConfig = {
  finalizar_conversa?: boolean;
  transferir_responsavel?: boolean;
  estilo_comunicacao?: "normal" | "formal" | "descontraida";
  usar_emojis?: boolean;
  assinar_nome?: boolean;
  dividir_mensagens?: boolean;
  dividir_mensagens_palavras?: number;
  followup_ativo?: boolean;
  followup_max_tentativas?: number;
  followup_intervalo_valor?: number;
  followup_intervalo_unidade?: "minutos" | "horas";
  followup_transferir_automacao?: boolean;
  followup_automacao_id?: string | null;
  // Aba Configurações
  delay_resposta_minutos?: number;
  mensagens_consideradas?: number;
  limite_interacoes?: number;
  saudacao_automatica?: boolean;
  restringir_topicos?: boolean;
  topicos_permitidos?: string;
  topicos_restritos?: string;
  // Aba Perfil (objetivo Qualificar) -- ids de custom_field_items (de
  // qualquer grupo de Campos Adicionais) que o agente deve mapear e
  // preencher no card do lead.
  campos_qualificacao?: string[];
  // Aba Perfil -- instruções específicas por objetivo (chave = id do
  // objetivo), somam ao prompt fixo daquele objetivo.
  objective_instructions?: Record<string, string>;
  // Aba Closers -- configurações globais de agendamento do agente (não por
  // closer individual, ao contrário de agent_closer_availability).
  fuso_horario?: string; // IANA, ex. "America/Sao_Paulo" -- default se vazio
  duracao_reuniao_minutos?: number;
  intervalo_entre_reunioes?: boolean;
  intervalo_minutos?: number;
  incluir_google_meet?: boolean;
  confirmar_antes_criar_evento?: boolean;
};

const ESTILO_PROMPTS: Record<string, string> = {
  formal: "Tom de comunicação: formal e profissional -- evite gírias, trate o lead com cordialidade e precisão.",
  descontraida: "Tom de comunicação: descontraído e próximo -- pode usar linguagem mais informal e leve, sem perder o profissionalismo.",
};

function buildBehaviorPromptExtra(cfg: BehaviorConfig, agentName: string): string {
  const lines: string[] = [];
  if (cfg.estilo_comunicacao && ESTILO_PROMPTS[cfg.estilo_comunicacao]) lines.push(ESTILO_PROMPTS[cfg.estilo_comunicacao]);
  lines.push(cfg.usar_emojis ? "Pode usar emojis nas mensagens, com moderação." : "Não use emojis nas mensagens.");
  if (cfg.assinar_nome && agentName) lines.push(`Assine seu nome ("${agentName}") ao final das mensagens, de forma natural.`);
  if (cfg.finalizar_conversa) lines.push("Quando a conversa chegar a uma conclusão natural (objetivo atingido ou lead se despediu), use a tool finalizar_conversa.");
  if (cfg.transferir_responsavel) lines.push("Quando identificar que cumpriu seu objetivo nesta conversa, use a tool transferir_responsavel para passar o lead pra um humano dar continuidade.");
  if (cfg.restringir_topicos) {
    if (cfg.topicos_permitidos?.trim()) lines.push(`RESTRIÇÃO DE TÓPICOS — Você só pode falar sobre: ${cfg.topicos_permitidos.trim()}.`);
    if (cfg.topicos_restritos?.trim()) lines.push(`RESTRIÇÃO DE TÓPICOS — Nunca fale sobre: ${cfg.topicos_restritos.trim()}. Se o cliente perguntar, redirecione educadamente sem entrar no assunto.`);
  }
  if (cfg.confirmar_antes_criar_evento) lines.push("Antes de chamar agendar_reuniao_closer, confirme dia e horário com o lead em uma mensagem separada e só chame a tool depois que ele confirmar explicitamente -- nunca agende direto na primeira menção de horário.");
  return lines.join("\n");
}

const FINALIZAR_CONVERSA_TOOL: AnthropicToolDef = {
  name: "finalizar_conversa",
  description: "Encerra a conversa quando ela chegou a uma conclusão natural.",
  input_schema: { type: "object", properties: { motivo: { type: "string" } } },
};
const TRANSFERIR_RESPONSAVEL_TOOL: AnthropicToolDef = {
  name: "transferir_responsavel",
  description: "Transfere a conversa pra um atendente humano continuar, porque o objetivo do agente nela já foi cumprido.",
  input_schema: { type: "object", properties: { motivo: { type: "string" } } },
};

// ─── Modelo multi-provedor (Claude/Anthropic e GPT/OpenAI) ──────────────────
// O tipo de agente é sempre SDS (metodologia fixa acima), mas o modelo de IA
// por trás é escolhido pela empresa na aba "Modelos". Detecta o provedor pelo
// prefixo do id do modelo — mesma convenção usada em AutomacoesPage.tsx
// (IA_MODELS): ids "gpt-*" são OpenAI, o resto é Anthropic.
type AiProvider = "openai" | "anthropic";
function providerForModel(model: string): AiProvider {
  return model.startsWith("gpt-") ? "openai" : "anthropic";
}

function toOpenAiTools(tools: AnthropicToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

// Executa uma tool chamada pelo modelo e devolve resultado — sempre um
// objeto (nunca void), porque o loop precisa mandar isso de volta pro
// modelo continuar a conversa (ex: "listar_leads" só é útil se o modelo vir
// o resultado antes de responder).
type ToolDispatcher = (name: string, input: Record<string, unknown>) => Promise<ToolResult>;

const MAX_TOOL_TURNS = 6;

type LoopUsage = { inputTokens: number; outputTokens: number };
type LoopResult = { actions: string[] | null; usage: LoopUsage };

// Loop Anthropic: manda mensagens, se vier tool_use executa e devolve
// tool_result, repete até o modelo não pedir mais tools ou bater o limite.
async function runAnthropicLoop(
  apiKey: string, model: string, system: string, transcript: string,
  tools: AnthropicToolDef[], dispatch: ToolDispatcher,
): Promise<LoopResult> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: `Conversa até agora:\n${transcript}` }];
  const actions: string[] = [];
  const usage: LoopUsage = { inputTokens: 0, outputTokens: 0 };

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system, tools, messages }),
    });
    if (!res.ok) {
      console.error("[agent-sds-qualify] Anthropic error:", res.status, await res.text());
      return { actions: actions.length > 0 ? actions : null, usage };
    }
    const data = await res.json();
    usage.inputTokens += Number(data.usage?.input_tokens) || 0;
    usage.outputTokens += Number(data.usage?.output_tokens) || 0;
    // deno-lint-ignore no-explicit-any
    const toolUseBlocks = (data.content ?? []).filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) break;

    messages.push({ role: "assistant", content: data.content });
    // deno-lint-ignore no-explicit-any
    const toolResults = [];
    for (const block of toolUseBlocks) {
      const result = await dispatch(block.name, block.input ?? {});
      actions.push(block.name);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }
  return { actions, usage };
}

// Loop OpenAI: mesma ideia, formato de mensagens diferente (tool_calls +
// role="tool").
async function runOpenAiLoop(
  apiKey: string, model: string, system: string, transcript: string,
  tools: AnthropicToolDef[], dispatch: ToolDispatcher,
): Promise<LoopResult> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: `Conversa até agora:\n${transcript}` },
  ];
  const actions: string[] = [];
  const usage: LoopUsage = { inputTokens: 0, outputTokens: 0 };

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools: toOpenAiTools(tools) }),
    });
    if (!res.ok) {
      console.error("[agent-sds-qualify] OpenAI error:", res.status, await res.text());
      return { actions: actions.length > 0 ? actions : null, usage };
    }
    const data = await res.json();
    usage.inputTokens += Number(data.usage?.prompt_tokens) || 0;
    usage.outputTokens += Number(data.usage?.completion_tokens) || 0;
    const msg = data.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls ?? [];
    if (toolCalls.length === 0) break;

    messages.push(msg);
    // deno-lint-ignore no-explicit-any
    for (const call of toolCalls as any[]) {
      const input = JSON.parse(call.function.arguments || "{}");
      const result = await dispatch(call.function.name, input);
      actions.push(call.function.name as string);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { actions, usage };
}

// Espelho de IA_MODEL_PRICING (src/lib/ai-models.ts) -- Deno não importa de
// src/, então mantém os dois em sincronia manualmente se os preços mudarem.
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-sonnet-5":           { inputPer1M: 3,   outputPer1M: 15 },
  "claude-opus-5":             { inputPer1M: 15,  outputPer1M: 75 },
  "gpt-5.6-luna":               { inputPer1M: 0.4,  outputPer1M: 1.6 },
  "gpt-5.6-terra":              { inputPer1M: 2.5,  outputPer1M: 10 },
  "gpt-5.6-sol":                { inputPer1M: 12,   outputPer1M: 48 },
};

// Grava 1 linha de custo por invocação do loop -- alimenta "Valor gasto em
// $" na aba Performance. Não bloqueia o fluxo principal se falhar.
async function logAgentUsage(
  db: ReturnType<typeof createClient>,
  agentId: string,
  companyId: string,
  model: string,
  usage: LoopUsage,
): Promise<void> {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return;
  const pricing = MODEL_PRICING[model] ?? { inputPer1M: 0, outputPer1M: 0 };
  const costUsd = (usage.inputTokens / 1_000_000) * pricing.inputPer1M + (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
  await db.from("agent_usage_log").insert({
    agent_id: agentId,
    company_id: companyId,
    model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_usd: Number(costUsd.toFixed(4)),
  });
}

// ─── Resolução de telefone brasileiro (portado de MultiatendimentoPage.tsx) ─
function normalizeBrPhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
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
// Todas as variantes plausíveis de como o telefone pode estar salvo (com/sem
// 55, com/sem o 9º dígito) — usado pra buscar histórico com IN em vez de
// igualdade exata, já que whatsapp_messages.phone e leads.whatsapp não têm
// formato consistente entre si (confirmado com dado real).
// Divide uma mensagem longa em partes de até `maxWords` palavras, quebrando
// em fim de parágrafo/frase quando possível pra não cortar no meio de uma
// ideia. Usado pelo toggle "Dividir mensagens longas" (aba Comportamento).
function splitLongMessage(text: string, maxWords: number): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return [text];
  const parts: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    parts.push(words.slice(i, i + maxWords).join(" "));
  }
  return parts;
}

function phoneVariants(raw: string): string[] {
  const core = normalizeBrPhone(raw);
  if (core.length < 10) {
    const d = (raw ?? "").replace(/\D/g, "");
    return d ? [d] : [];
  }
  const ddd = core.slice(0, 2);
  const eight = core.slice(-8);
  const with9 = `${ddd}9${eight}`;
  return [...new Set([core, with9, `55${core}`, `55${with9}`])];
}

// ─── Resolução telefone → lead ──────────────────────────────────────────────
// Os 3 webhooks (zapi/dapi/cloud_api) só têm phone + company_id disponíveis
// no momento em que a mensagem chega — não existe conversationId confiável
// nesse ponto do fluxo (whatsapp_conversations não é gravada por eles).
async function resolveLead(
  db: ReturnType<typeof createClient>,
  companyId: string,
  phone: string,
): Promise<Record<string, unknown> | null> {
  const { data: candidates } = await db
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .not("whatsapp", "is", null);
  return (candidates ?? []).find((l) => phonesMatch(String(l.whatsapp ?? ""), phone)) ?? null;
}

// ─── Tag "Agente" na conversa: liga/desliga o agente POR conversa, em cima do
// liga/desliga por empresa que já existe em `agents.active`. Sem a tag, o
// agente fica desligado nessa conversa mesmo com a empresa toda habilitada --
// V1 do handoff manual (usuário adiciona a tag pra "transferir" a conversa
// pro agente cuidar). upsertConversationForMessage já roda antes desta
// function ser chamada (ver dapi/zapi/cloud-api-webhook), então a linha de
// whatsapp_conversations pra este telefone já existe nesse ponto.
async function hasAgentTag(
  db: ReturnType<typeof createClient>,
  companyId: string,
  phone: string,
): Promise<boolean> {
  const { data: conversations } = await db
    .from("whatsapp_conversations")
    .select("phone, tags")
    .eq("company_id", companyId)
    .not("phone", "is", null);
  return (conversations ?? []).some((c) =>
    phonesMatch(String(c.phone ?? ""), phone) && ((c.tags as string[] | null) ?? []).includes("Agente")
  );
}

// ─── Seleção de closer (menor carga nos últimos 7 dias, com Google conectado) ─
// Mesmo shape de WorkDay/WorkInterval do src/components/WorkSchedulesManager.tsx
// (dia da semana em português, ex. "Segunda") -- usado tanto na Aba
// "Closers" (disponibilidade por agente) quanto aqui pra filtrar quem pode
// receber a reunião no horário pedido.
type WorkInterval = { start: string; end: string };
type WorkDay = { day: string; active: boolean; intervals: WorkInterval[] };
const WEEKDAY_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// start_datetime chega como wall-clock America/Sao_Paulo sem offset (mesma
// convenção do resto do arquivo -- ver comentário no INSERT de "activities"
// logo abaixo). Extrai dia da semana/hora só a partir dos dígitos, sem
// passar pelo parser de Date (que reinterpretaria como UTC no runtime do
// Deno e daria dia/hora errados).
function weekdayAndTimeFromNaiveDatetime(datetime: string): { weekday: string; hhmm: string } | null {
  const m = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m;
  const weekdayIdx = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  return { weekday: WEEKDAY_PT[weekdayIdx], hhmm: `${hh}:${mi}` };
}

// Offset UTC (ex. "-03:00") de um fuso IANA num instante -- via Intl (ICU
// embutido no Deno) em vez de tabela hardcoded, então lida certo com
// horário de verão nos fusos que o observam. Usado pra converter o
// start_datetime naive (wall-clock no fuso configurado na aba Closers) em
// timestamptz real antes de gravar/comparar contra "activities".
function tzOffsetString(timeZone: string, at: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const diffMinutes = Math.round((asIfUtc - at.getTime()) / 60_000);
  const sign = diffMinutes < 0 ? "-" : "+";
  const abs = Math.abs(diffMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

async function pickAvailableCloser(
  db: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
  startDatetime?: string,
  durationMinutes = 60,
  cfg: BehaviorConfig = {},
): Promise<{ userId: string } | null> {
  const { data: closers } = await db
    .from("agent_closers")
    .select("user_id")
    .eq("agent_id", agentId)
    .eq("company_id", companyId);
  if (!closers?.length) return null;

  let eligible: string[] = [];
  for (const c of closers) {
    const { data: token } = await db
      .from("google_oauth_tokens")
      .select("id")
      .eq("user_id", c.user_id as string)
      .maybeSingle();
    if (token) eligible.push(c.user_id as string);
  }
  if (!eligible.length) return null;

  // Filtra por disponibilidade declarada na aba Closers, se houver. Closer
  // sem disponibilidade configurada pra esse agente é tratado como "sem
  // restrição" -- preserva o comportamento anterior pra quem nunca abriu
  // essa aba nova (ex. agentes já em produção antes dessa feature existir).
  const parsed = startDatetime ? weekdayAndTimeFromNaiveDatetime(startDatetime) : null;
  if (parsed) {
    const { data: availRows } = await db
      .from("agent_closer_availability")
      .select("user_id, days")
      .eq("agent_id", agentId)
      .in("user_id", eligible);
    const availByUser = new Map((availRows ?? []).map((r) => [r.user_id as string, r.days as WorkDay[]]));
    eligible = eligible.filter((userId) => {
      const days = availByUser.get(userId);
      if (!days?.length) return true;
      const day = days.find((d) => d.day === parsed.weekday);
      if (!day?.active) return false;
      return day.intervals.some((iv) => parsed.hhmm >= iv.start && parsed.hhmm <= iv.end);
    });
  }
  if (!eligible.length) return null;

  // Intervalo entre reuniões (aba Closers, opcional): exclui closer que já
  // tem reunião perto demais do horário pedido, contando a folga antes E
  // depois. Sem essa config ligada, preserva o comportamento anterior
  // (só evita choque exato via ordenação por menor carga, sem folga).
  if (startDatetime && cfg.intervalo_entre_reunioes) {
    const bufferMs = (Number(cfg.intervalo_minutos) || 15) * 60_000;
    const timezone = cfg.fuso_horario || "America/Sao_Paulo";
    const offset = tzOffsetString(timezone, new Date(`${startDatetime}Z`));
    const startMs = new Date(`${startDatetime}${offset}`).getTime();
    const endMs = startMs + durationMinutes * 60_000;
    const dayMs = 24 * 60 * 60_000;

    const { data: busyRows } = await db
      .from("activities")
      .select("owner_id, scheduled_at, duration_minutes")
      .eq("company_id", companyId)
      .eq("type", "meeting")
      .in("owner_id", eligible)
      .gte("scheduled_at", new Date(startMs - dayMs).toISOString())
      .lte("scheduled_at", new Date(endMs + dayMs).toISOString());

    const busyByUser = new Map<string, { start: number; end: number }[]>();
    for (const row of busyRows ?? []) {
      const uid = row.owner_id as string;
      const s = new Date(row.scheduled_at as string).getTime();
      const e = s + (Number(row.duration_minutes) || 60) * 60_000;
      if (!busyByUser.has(uid)) busyByUser.set(uid, []);
      busyByUser.get(uid)!.push({ start: s, end: e });
    }
    eligible = eligible.filter((userId) => {
      const busy = busyByUser.get(userId);
      if (!busy?.length) return true;
      return busy.every((b) => endMs + bufferMs <= b.start || startMs - bufferMs >= b.end);
    });
  }
  if (!eligible.length) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const counts = await Promise.all(
    eligible.map(async (userId) => {
      const { count } = await db
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("owner_id", userId)
        .eq("type", "meeting")
        .gte("scheduled_at", sevenDaysAgo);
      return { userId, count: count ?? 0 };
    }),
  );
  counts.sort((a, b) => a.count - b.count);
  return { userId: counts[0].userId };
}

// ─── Saudação automática ─────────────────────────────────────────────────────
// Enviada direto (sem passar pelo modelo/loop de tools) na primeira mensagem
// de uma conversa nova -- por isso não conta como "interação da IA" pro
// limite configurado em Configurações.
async function sendGreeting(
  db: ReturnType<typeof createClient>,
  companyId: string,
  lead: Record<string, unknown>,
  agentName: string,
  cfg: BehaviorConfig,
): Promise<void> {
  const { data: conn } = await db
    .from("whatsapp_connections")
    .select("provider, instance_id, token, client_token")
    .eq("company_id", companyId)
    .eq("connected", true)
    .maybeSingle();
  if (!conn) return;

  const creds: ZapiCreds = {
    instanceId: String(conn.instance_id),
    token: String(conn.token),
    clientToken: conn.client_token ? String(conn.client_token) : null,
    provider: (["dapi", "cloud_api"].includes(String(conn.provider)) ? String(conn.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
  };
  const phone = String(lead.whatsapp ?? "");
  const firstName = String(lead.name ?? "").split(" ")[0];
  const emoji = cfg.usar_emojis ? " 👋" : "";
  const signature = cfg.assinar_nome && agentName ? ` Aqui é ${agentName}.` : "";
  const text = firstName
    ? `Olá, ${firstName}!${signature} Como posso te ajudar hoje?${emoji}`
    : `Olá!${signature} Como posso te ajudar hoje?${emoji}`;

  await sendWa(creds, { kind: "text", phone, message: text });
  await db.from("whatsapp_messages").insert({
    company_id: companyId,
    owner_id: lead.owner_id as string,
    instance_id: creds.instanceId,
    phone,
    from_me: true,
    body: text,
    type: "text",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const internalSecret = req.headers.get("x-internal-secret") ?? "";
  const configuredSecret = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";
  if (configuredSecret === "" || internalSecret !== configuredSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { companyId?: string; phone?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { companyId, phone } = body;
  if (!companyId || !phone) return json({ error: "missing_params" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  // ⚠️ Service role BYPASSA o RLS (is_member_of) — diferente de chamadas do
  // browser. Por isso TODA query abaixo filtra company_id manualmente no
  // código, já que o banco não vai fazer esse isolamento sozinho aqui.

  const lead = await resolveLead(db, companyId, phone);
  if (!lead) return json({ skipped: "lead_not_resolved" }, 200);
  const leadId = lead.id as string;

  // O lead acabou de mandar mensagem -- qualquer ciclo de follow-up
  // automático pendente pra ele perde o sentido (não está mais em silêncio).
  // Roda sempre, independente dos gates abaixo (agente ativo, chave, tag).
  await db.from("agent_followup_state").update({ status: "cancelado" }).eq("lead_id", leadId).eq("status", "ativo");

  const { data: agent } = await db
    .from("agents")
    .select("id, name, model, custom_context, objectives, enabled_tools, behavior_config")
    .eq("company_id", companyId)
    .eq("type", "SDS")
    .eq("active", true)
    .single();
  if (!agent) return json({ skipped: "no_active_agent" }, 200);

  const behaviorConfig: BehaviorConfig = (agent.behavior_config as BehaviorConfig) ?? {};

  // Delay de Resposta (com debounce): em vez de responder na hora, agenda
  // pra daqui a N minutos. Toda mensagem nova do lead durante a janela
  // reescreve o horário (upsert por company_id+phone) -- só responde depois
  // que o lead ficar quieto pelo intervalo inteiro. agent-response-runner
  // reinvoca esta mesma function com x-bypass-delay quando vence.
  const delayMinutos = Number(behaviorConfig.delay_resposta_minutos) || 0;
  const bypassDelay = req.headers.get("x-bypass-delay") === "true";
  if (delayMinutos > 0 && !bypassDelay) {
    await db.from("agent_pending_response").upsert({
      company_id: companyId, phone, status: "pending",
      respond_at: new Date(Date.now() + delayMinutos * 60_000).toISOString(),
    }, { onConflict: "company_id,phone" });
    return json({ skipped: "delayed", respond_at_in_minutes: delayMinutos }, 200);
  }

  const model = (agent.model as string) || "claude-sonnet-5";
  const provider = providerForModel(model);

  // Chave de IA: exige a chave própria da empresa (BYOK) do provedor do
  // modelo escolhido na aba "Modelos". Sem fallback pra outro provedor ou pra
  // uma chave global — se a empresa trocar de modelo sem ter a chave daquele
  // provedor cadastrada, o correto é parar de atuar, não quebrar silenciosamente.
  const { data: companyKey } = await db
    .from("ai_provider_keys")
    .select("api_key")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .eq("active", true)
    .maybeSingle();
  const apiKey = companyKey?.api_key || "";
  if (!apiKey) return json({ skipped: "no_company_api_key" }, 200);

  // Gate por conversa: mesmo com o agente ativo pra empresa, só atua nas
  // conversas que o usuário marcou explicitamente com a tag "Agente".
  if (!(await hasAgentTag(db, companyId, phone))) return json({ skipped: "no_agent_tag" }, 200);

  const messageWindow = Number(behaviorConfig.mensagens_consideradas) || 30;
  const { data: messages } = await db
    .from("whatsapp_messages")
    .select("from_me, body")
    .eq("company_id", companyId)
    .in("phone", phoneVariants(String(lead.whatsapp ?? "")))
    .order("created_at", { ascending: false })
    .limit(messageWindow);

  const transcript = (messages ?? []).reverse()
    .map((m) => `${m.from_me ? "Atendente" : "Lead"}: ${m.body}`)
    .join("\n");

  // Saudação automática: primeira mensagem desta conversa (ninguém do lado
  // do agente/atendente respondeu ainda). Não passa pelo modelo -- é texto
  // fixo, então não conta como interação da IA.
  const isFirstMessageEver = (messages ?? []).length <= 1 && !(messages ?? []).some((m) => m.from_me);
  if (behaviorConfig.saudacao_automatica && isFirstMessageEver) {
    await sendGreeting(db, companyId, lead, (agent.name as string) ?? "", behaviorConfig);
  }

  // Limite de interações da IA por atendimento: ao atingir o limite, a
  // PRÓXIMA mensagem do cliente ainda gera 1 resposta -- mas restrita a se
  // despedir e encerrar/transferir (nunca continuar o atendimento normal).
  const limiteInteracoes = Number(behaviorConfig.limite_interacoes) || 0;
  if (limiteInteracoes > 0) {
    const { data: conv } = await db
      .from("whatsapp_conversations")
      .select("ai_interaction_count")
      .eq("company_id", companyId)
      .in("phone", phoneVariants(String(lead.whatsapp ?? "")))
      .maybeSingle();
    const count = (conv?.ai_interaction_count as number | undefined) ?? 0;

    if (count >= limiteInteracoes) {
      const canTransfer = !!behaviorConfig.transferir_responsavel;
      const canFinalize = !!behaviorConfig.finalizar_conversa;
      if (!canTransfer && !canFinalize) {
        // Nem transferir nem finalizar ativos -- IA para de responder em silêncio.
        return json({ skipped: "interaction_limit_silent" }, 200);
      }
      const closingTool = canTransfer ? TRANSFERIR_RESPONSAVEL_TOOL : FINALIZAR_CONVERSA_TOOL;
      const closingSystem = [
        DYNAMIC_BASE_INTRO,
        `IMPORTANTE: você atingiu o limite de respostas nesta conversa. Nesta mensagem, despeça-se cordialmente do cliente e, em seguida, chame OBRIGATORIAMENTE a tool ${closingTool.name}.`,
        buildBehaviorPromptExtra(behaviorConfig, (agent.name as string) ?? ""),
      ].filter(Boolean).join("\n\n");
      const closingCtx: { companyId: string; leadId: string; agentId: string; lead: Record<string, unknown>; behaviorConfig: BehaviorConfig } =
        { companyId, leadId, agentId: agent.id as string, lead, behaviorConfig };
      const closingDispatch: ToolDispatcher = (name, input) => executeAgentTool(db, { name, input }, closingCtx);
      const closingResult = provider === "openai"
        ? await runOpenAiLoop(apiKey, model, closingSystem, transcript, [TOOLS.find((t) => t.name === "enviar_mensagem")!, closingTool], closingDispatch)
        : await runAnthropicLoop(apiKey, model, closingSystem, transcript, [TOOLS.find((t) => t.name === "enviar_mensagem")!, closingTool], closingDispatch);
      await logAgentUsage(db, agent.id as string, companyId, model, closingResult.usage);
      if (closingResult.actions === null) return json({ error: "ai_request_failed" }, 502);
      return json({ ok: true, actions: closingResult.actions, interaction_limit_reached: true });
    }
  }

  // Compat: agentes criados antes da aba "Perfil"/Objetivos ter sido
  // introduzida têm objectives=[] e continuam no comportamento fixo antigo
  // -- zero mudança de comportamento pra quem já está em produção. O
  // caminho novo (dinâmico) só entra quando a empresa marcou pelo menos um
  // objetivo de propósito.
  const objectives = (agent.objectives as string[] | null) ?? [];
  const enabledTools = (agent.enabled_tools as string[] | null) ?? [];
  const legacy = objectives.length === 0;

  let system: string;
  let tools: AnthropicToolDef[];
  if (legacy) {
    system = `${SDS_METHODOLOGY}\n\n${agent.custom_context ?? ""}`;
    tools = TOOLS;
  } else {
    let kbContext = "";
    if (objectives.includes("atendimento")) {
      const lastLeadMsg = (messages ?? []).find((m) => !m.from_me)?.body as string | undefined;
      kbContext = await retrieveKbContext(db, agent.id as string, companyId, lastLeadMsg || transcript);
    }
    let qualFields: { id: string; label: string }[] = [];
    if (objectives.includes("qualificar") && behaviorConfig.campos_qualificacao?.length) {
      const { data: fieldsData } = await db
        .from("custom_field_items")
        .select("id, label")
        .in("id", behaviorConfig.campos_qualificacao)
        .eq("company_id", companyId);
      qualFields = (fieldsData ?? []) as { id: string; label: string }[];
    }
    system = buildDynamicSystemPrompt(objectives, agent.custom_context ?? "", kbContext, behaviorConfig.objective_instructions ?? {});
    tools = buildDynamicTools(objectives, enabledTools, qualFields);
  }

  // Comportamento é uma camada independente de Objetivos/Ferramentas --
  // aplica em cima do legado ou do dinâmico igualmente.
  const behaviorExtra = buildBehaviorPromptExtra(behaviorConfig, (agent.name as string) ?? "");
  if (behaviorExtra) system = `${system}\n\n${behaviorExtra}`;
  if (behaviorConfig.finalizar_conversa) tools = [...tools, FINALIZAR_CONVERSA_TOOL];
  if (behaviorConfig.transferir_responsavel) tools = [...tools, TRANSFERIR_RESPONSAVEL_TOOL];

  const toolCtx: ToolCtx = { db, companyId, ownerId: String(lead.owner_id ?? ""), leadId };
  const LEGACY_TOOL_NAMES = new Set(["qualificar_lead", "agendar_reuniao_closer", "mover_pipeline", "enviar_mensagem", "escalar_humano", "finalizar_conversa", "transferir_responsavel"]);
  const dispatch: ToolDispatcher = async (name, input) => {
    if (LEGACY_TOOL_NAMES.has(name)) {
      return await executeAgentTool(db, { name, input }, { companyId, leadId, agentId: agent.id as string, lead, behaviorConfig });
    }
    return await executeRegistryTool(toolCtx, name, input);
  };

  const result = provider === "openai"
    ? await runOpenAiLoop(apiKey, model, system, transcript, tools, dispatch)
    : await runAnthropicLoop(apiKey, model, system, transcript, tools, dispatch);
  await logAgentUsage(db, agent.id as string, companyId, model, result.usage);
  if (result.actions === null) return json({ error: "ai_request_failed" }, 502);

  return json({ ok: true, actions: result.actions });
});

// deno-lint-ignore no-explicit-any
async function executeAgentTool(
  db: ReturnType<typeof createClient>,
  call: any,
  ctx: { companyId: string; leadId: string; agentId: string; lead: Record<string, unknown>; behaviorConfig?: BehaviorConfig },
): Promise<ToolResult> {
  const input = call.input ?? {};

  switch (call.name) {
    case "qualificar_lead": {
      const currentCustom = (ctx.lead.custom_field_values as Record<string, unknown>) ?? {};
      const currentTags = (ctx.lead.tags as string[]) ?? [];
      const newTags = new Set(currentTags.filter((t) => t !== "SDS: Qualificado" && t !== "SDS: Não qualificado"));
      newTags.add(input.qualificado ? "SDS: Qualificado" : "SDS: Não qualificado");

      // Campos além de score/qualificado/motivo são os ids de
      // custom_field_items selecionados na aba Perfil (schema dinâmico —
      // ver buildQualificarLeadTool) -- caem direto no card do lead.
      const extraFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (key !== "score" && key !== "qualificado" && key !== "motivo") extraFields[key] = value;
      }

      await db.from("leads").update({
        custom_field_values: { ...currentCustom, sds_score: input.score, sds_motivo: input.motivo, ...extraFields },
        tags: Array.from(newTags),
      }).eq("id", ctx.leadId).eq("company_id", ctx.companyId);
      return { ok: true };
    }

    case "agendar_reuniao_closer": {
      // Config de agendamento vem da aba Closers -- todas opcionais, com
      // fallback pro comportamento anterior (São Paulo, 60min, Meet sempre).
      const cfg = ctx.behaviorConfig ?? {};
      const timezone = cfg.fuso_horario || "America/Sao_Paulo";
      const duration = Number(input.duration_minutes) || Number(cfg.duracao_reuniao_minutos) || 60;
      const createMeet = cfg.incluir_google_meet ?? true;

      const closer = await pickAvailableCloser(db, ctx.companyId, ctx.agentId, input.start_datetime as string | undefined, duration, cfg);
      if (!closer) {
        // ninguém disponível (sem Google conectado, fora da janela de
        // disponibilidade declarada, ou sem folga suficiente na agenda) —
        // escala pra humano em vez de falhar silenciosamente
        return await executeAgentTool(db, { name: "escalar_humano", input: { motivo: "Nenhum closer disponível nesse horário (conectado ao Google Calendar, dentro da janela liberada e sem conflito de agenda)" } }, ctx);
      }

      const calRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
        },
        body: JSON.stringify({
          title: `Reunião — ${ctx.lead.name ?? "Lead"}`,
          description: "Agendado automaticamente pelo agente SDS.",
          start_datetime: input.start_datetime,
          duration_minutes: duration,
          create_meet: createMeet,
          timezone,
          company_id: ctx.companyId,
          user_id: closer.userId,
        }),
      });

      if (!calRes.ok) {
        const detail = await calRes.text();
        console.error("[agent-sds-qualify] google-calendar-event falhou:", detail);
        return { ok: false, error: `falha ao agendar: ${detail.slice(0, 200)}` };
      }
      const calData = await calRes.json();

      // Offset calculado a partir do fuso configurado (default São Paulo):
      // sem ele aqui, o Postgres assumiria UTC e o horário salvo no CRM
      // ficaria errado em relação ao que foi criado no Google Calendar.
      const offset = tzOffsetString(timezone, new Date(`${input.start_datetime}Z`));
      await db.from("activities").insert({
        company_id: ctx.companyId,
        owner_id: closer.userId,
        lead_id: ctx.leadId,
        type: "meeting",
        title: `Reunião — ${ctx.lead.name ?? "Lead"}`,
        scheduled_at: `${input.start_datetime}${offset}`,
        duration_minutes: duration,
        meet_link: calData.meet_link ?? null,
        gcal_event_id: calData.event_id ?? null,
        description: "Agendado automaticamente pelo agente SDS.",
      });
      return { ok: true, data: { meet_link: calData.meet_link ?? null } };
    }

    case "mover_pipeline": {
      await db.from("leads").update({ column_id: input.coluna_id }).eq("id", ctx.leadId).eq("company_id", ctx.companyId);
      return { ok: true };
    }

    case "enviar_mensagem": {
      const { data: conn } = await db
        .from("whatsapp_connections")
        .select("provider, instance_id, token, client_token")
        .eq("company_id", ctx.companyId)
        .eq("connected", true)
        .maybeSingle();
      if (!conn) return { ok: false, error: "nenhuma conexão de WhatsApp conectada" };

      const creds: ZapiCreds = {
        instanceId: String(conn.instance_id),
        token: String(conn.token),
        clientToken: conn.client_token ? String(conn.client_token) : null,
        provider: (["dapi", "cloud_api"].includes(String(conn.provider)) ? String(conn.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
      };
      const phone = String(ctx.lead.whatsapp ?? "");
      const cfg = ctx.behaviorConfig ?? {};
      const fullText = String(input.texto ?? "");
      const parts = cfg.dividir_mensagens ? splitLongMessage(fullText, Number(cfg.dividir_mensagens_palavras) || 80) : [fullText];

      for (let i = 0; i < parts.length; i++) {
        await sendWa(creds, { kind: "text", phone, message: parts[i] });
        // owner_id é NOT NULL aqui também — mesmo padrão do automation-runner,
        // usa o responsável do lead.
        await db.from("whatsapp_messages").insert({
          company_id: ctx.companyId,
          owner_id: ctx.lead.owner_id as string,
          instance_id: creds.instanceId,
          phone,
          from_me: true,
          body: parts[i],
          type: "text",
        });
        if (i < parts.length - 1) await new Promise<void>((r) => setTimeout(r, 600));
      }

      // Follow-up automático: toda mensagem real do agente reinicia o
      // relógio de silêncio -- se o lead não responder no intervalo
      // configurado, agent-followup-runner assume a partir daqui.
      if (cfg.followup_ativo) {
        const unitMs = cfg.followup_intervalo_unidade === "horas" ? 3_600_000 : 60_000;
        const intervalMs = (Number(cfg.followup_intervalo_valor) || 30) * unitMs;
        await db.from("agent_followup_state").upsert({
          agent_id: ctx.agentId, company_id: ctx.companyId, lead_id: ctx.leadId, phone,
          attempt_count: 0, next_attempt_at: new Date(Date.now() + intervalMs).toISOString(), status: "ativo",
        }, { onConflict: "agent_id,lead_id" });
      }

      // Conta como 1 interação da IA neste atendimento, independente de ter
      // sido dividida em várias partes (aba Configurações > "Limite de
      // interações"). Atualiza direto por incremento -- evita race entre
      // select e update se o webhook disparar duas vezes rápido.
      {
        const { data: conv } = await db.from("whatsapp_conversations").select("id, ai_interaction_count").eq("company_id", ctx.companyId).in("phone", phoneVariants(phone)).maybeSingle();
        if (conv?.id) await db.from("whatsapp_conversations").update({ ai_interaction_count: ((conv.ai_interaction_count as number | undefined) ?? 0) + 1 }).eq("id", conv.id);
      }

      return { ok: true };
    }

    case "finalizar_conversa": {
      const { data: conv } = await db.from("whatsapp_conversations").select("id").eq("company_id", ctx.companyId).in("phone", phoneVariants(String(ctx.lead.whatsapp ?? ""))).maybeSingle();
      if (conv?.id) await db.from("whatsapp_conversations").update({ finished: true, ai_interaction_count: 0 }).eq("id", conv.id);
      return { ok: true };
    }

    case "transferir_responsavel": {
      // Remove a tag "Agente" -- o agente para de responder essa conversa a
      // partir daqui (mesmo gate que hasAgentTag já usa) -- e deixa uma nota
      // pro humano que assumir entender o motivo.
      const { data: conv } = await db.from("whatsapp_conversations").select("id, tags").eq("company_id", ctx.companyId).in("phone", phoneVariants(String(ctx.lead.whatsapp ?? ""))).maybeSingle();
      if (conv?.id) {
        const nextTags = ((conv.tags as string[] | null) ?? []).filter((t) => t !== "Agente");
        await db.from("whatsapp_conversations").update({ tags: nextTags, ai_interaction_count: 0 }).eq("id", conv.id);
      }
      await db.from("activities").insert({
        company_id: ctx.companyId,
        owner_id: ctx.lead.owner_id as string,
        lead_id: ctx.leadId,
        type: "note",
        title: "Agente transferiu a conversa — objetivo concluído",
        description: String(input.motivo ?? "sem motivo informado"),
      });
      return { ok: true };
    }

    case "escalar_humano": {
      // owner_id é NOT NULL em activities — usa o responsável já atribuído ao lead
      await db.from("activities").insert({
        company_id: ctx.companyId,
        owner_id: ctx.lead.owner_id as string,
        lead_id: ctx.leadId,
        type: "note",
        title: "Agente SDS escalou pra atendimento humano",
        description: String(input.motivo ?? "sem motivo informado"),
      });
      return { ok: true };
    }

    default:
      return { ok: false, error: `tool "${call.name}" desconhecida` };
  }
}
