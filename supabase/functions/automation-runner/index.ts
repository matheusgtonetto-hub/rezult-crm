// Rezult CRM — Automation Runner Edge Function
// Executa automações em resposta a eventos do banco de dados.
// Chamado pelos triggers PostgreSQL via pg_net.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// Deve espelhar o tipo LeadOrigin (src/data/mockData.ts) e a constraint leads_origin_check do banco
const VALID_LEAD_ORIGINS = ["Instagram", "Facebook Ads", "Google Ads", "Meta Ads", "TikTok Ads", "LinkedIn Ads", "YouTube Ads", "Email Marketing", "Orgânico", "WhatsApp", "Evento", "Indicação", "Site", "Outro"];

// Remove acentos e normaliza para comparação
const stripAccents = (x: string) =>
  x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Sinônimos → origem canônica. Palavras-chave com >=4 chars casam por substring;
// abreviações curtas (fb, ig, yt…) casam apenas como token isolado, evitando falsos positivos.
const ORIGIN_SYNONYMS: Array<[string, string[]]> = [
  ["Google Ads",      ["google", "adwords", "gads"]],
  ["Meta Ads",        ["meta"]],
  ["Facebook Ads",    ["facebook", "fb", "face"]],
  ["Instagram",       ["instagram", "insta", "ig"]],
  ["TikTok Ads",      ["tiktok", "tik tok"]],
  ["LinkedIn Ads",    ["linkedin", "linked in"]],
  ["YouTube Ads",     ["youtube", "you tube"]],
  ["Email Marketing", ["email", "e-mail", "mkt"]],
  ["WhatsApp",        ["whatsapp", "whats", "wpp", "zap"]],
  ["Orgânico",        ["organico", "organic", "seo"]],
  ["Evento",          ["evento", "event", "webinar", "feira"]],
  ["Indicação",       ["indicacao", "referral", "referencia", "indica"]],
  ["Site",            ["site", "website", "web", "landing"]],
];

// Recebe um valor arbitrário de origem e devolve a opção pré-definida mais adequada.
// Retorna null para valor vazio/ausente (deixa quem chama decidir — ex: usar default do banco).
function normalizeOrigin(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = stripAccents(s);

  // 1. Match exato (ignorando caixa/acento) com uma opção canônica
  for (const v of VALID_LEAD_ORIGINS) {
    if (stripAccents(v) === n) return v;
  }

  // 2. Match por sinônimo/palavra-chave
  const tokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  const hit = (kw: string) => {
    const k = stripAccents(kw);
    return k.length >= 4 ? n.includes(k) : tokens.includes(k);
  };
  for (const [canon, kws] of ORIGIN_SYNONYMS) {
    if (kws.some(hit)) return canon;
  }

  // 3. Sem correspondência → Outro
  return "Outro";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TriggerPayload {
  trigger_type: string;
  company_id: string;
  lead_id: string;
  // Execução manual direcionada: quando presente, apenas esta automação é executada
  // (usado pelo gatilho lead_manual disparado da UI). Opcional e retrocompatível.
  automation_id?: string;
  context: {
    tag_ids_added?: string[];
    tag_ids_removed?: string[];
    old_column_id?: string;
    new_column_id?: string;
    pipeline_id?: string;
    old_responsible?: string;
    new_responsible?: string;
    loss_reason_id?: string;
    parent_automation_id?: string;
    changed_fields?: Record<string, unknown>;
    // Saídas de datasources (ex: analise_telefone → "phone-1") persistidas entre nós,
    // para que {{phone-1.phone}} fique disponível em nós posteriores ao parse
    datasources?: Record<string, Record<string, string>>;
    // Respostas capturadas pelo bloco "Entrada do usuário" → {{var_name}}
    user_inputs?: Record<string, string>;
  };
}

interface TriggerConfig {
  categoryId: string;
  triggerId: string;
  label: string;
  description: string;
  configData?: Record<string, string | boolean | number>;
}

interface ActionItem {
  id: string;
  categoryId: string;
  actionId: string;
  label: string;
  config?: Record<string, string | boolean | number>;
}

interface ConditionItem {
  id: string;
  categoryId: string;
  conditionId: string;
  label: string;
  config?: Record<string, string | boolean | number>;
}

interface EsperaConfig {
  type: "intervalo_semana" | "minutos" | "dias" | "horas" | "segundos" | "dia_horario" | "usuario_parou";
  days?: string[];
  startTime?: string;
  endTime?: string;
  timezone?: string;
  amount?: number;
  dateField?: string;
  dateStartTime?: string;
  dateEndTime?: string;
  dateTimezone?: string;
}

interface ApiRequest {
  id: string;
  name: string;
  type: "json" | "file";
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  params: { key: string; value: string }[];
  body: string;
  responseHeaders: { key: string; value: string }[];
}

interface ApiConfig {
  requests: ApiRequest[];
}

// Ações do bloco de IA (BYOK). O resultado vira datasource {{outputVar.resposta}}.
interface IaAction {
  id: string;
  type: "assistente_chat" | "gerar_texto" | "invocar_agente" | "transcricao_audio" | "intencao" | "sentimento" | "extrator_params";
  provider: "openai" | "anthropic" | "google";
  model: string;
  outputVar: string;
  instructions?: string;
  audioSource?: string;
  language?: string;
  intencoes?: { id: string; nome: string; detalhes?: string; exemplos?: string }[];
  sentimentos?: { id: string; nome: string; detalhes?: string }[];
  parametros?: { id: string; nome: string; tipo: string; info?: string }[];
  agentId?: string;
  maxTokens?: number;
}

interface FieldOpMapeamento {
  id: string;
  type: "mapeamento";
  fieldKey: string;
  fieldLabel: string;
  value: string;
}

interface FieldOpAnaliseTel {
  id: string;
  type: "analise_telefone";
  phone: string;
  datasourceName: string;
  datasourceColor: string;
  defaultCountry: string;
}

type FieldOperation = FieldOpMapeamento | FieldOpAnaliseTel;

interface RandomBranch {
  id: string;
  label: string;
  percentage: number;
}

// Sub-blocos do nó "mensagem" (espelha o tipo SubBlock da UI em AutomacoesPage.tsx)
interface SubBlock {
  id: string;
  type: "mensagem_texto" | "entrada_usuario" | "atraso_tempo" | "mensagem_audio" | "arquivo_anexo" | "arquivo_url";
  text?: string;
  delaySeconds?: number;
  fileUrl?: string;
  fileName?: string;
  splitMessages?: boolean;
  buttons?: { id: string; label: string }[];
  varName?: string;
  timeoutAmount?: number;
  timeoutUnit?: "minutos" | "horas" | "dias";
}

interface CanvasNode {
  id: string;
  type: string;
  trigger?: TriggerConfig | null;
  actionItems?: ActionItem[];
  conditionItems?: ConditionItem[];
  randomBranches?: RandomBranch[];
  espera?: EsperaConfig;
  apiConfig?: ApiConfig;
  iaActions?: IaAction[];
  fieldOps?: FieldOperation[];
  subBlocks?: SubBlock[];
  connectionId?: string; // conexão (whatsapp_connections) escolhida no bloco Mensagem
  parentId?: string | null;        // legacy
  errorParentId?: string | null;   // legacy
  parentIds?: string[];            // current format (array)
  errorParentIds?: string[];       // current format (array)
  timeoutParentIds?: string[];     // saída "não respondeu" do bloco Entrada do usuário
}

interface PendingRecord {
  id: string;
  company_id: string;
  automation_id: string;
  lead_id: string;
  node_ids: string[];
  trigger_payload: TriggerPayload;
  resume_after: string;
  resume_sub_index?: number | null; // retomar o nó Mensagem a partir deste sub-bloco (Atraso de tempo)
}

interface AutomationFlow {
  nodes: CanvasNode[];
  trigger: TriggerConfig | null;
}

interface AutomationRecord {
  id: string;
  name: string;
  company_id: string;
  owner_id: string;
  flow: AutomationFlow;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Webhook mode: POST /automation-runner/webhook/<automationId> ──────────
  const url = new URL(req.url);
  const webhookMatch = url.pathname.match(/\/webhook\/([a-f0-9-]{36})$/i);
  if (webhookMatch) {
    return await handleWebhook(supabase, req, webhookMatch[1]);
  }

  // ── MCP Tool trigger: POST /automation-runner/mcp-trigger ─────────────────
  const mcpTriggerMatch = url.pathname.match(/\/mcp-trigger(?:\/)?$/i);
  if (mcpTriggerMatch) {
    return await handleMcpTrigger(supabase, req);
  }

  // ── Resume por resposta: POST /automation-runner/resume-reply ─────────────
  // Chamado pelo zapi-webhook quando o contato responde ("Entrada do usuário").
  // Autentica no gateway pela service key; o segredo vai no corpo e é conferido.
  const resumeReplyMatch = url.pathname.match(/\/resume-reply(?:\/)?$/i);
  if (resumeReplyMatch) {
    return await handleResumeReply(supabase, req);
  }

  // ── Execução manual: autenticada pelo JWT do usuário (chamada da UI) ──────
  // Gatilho "lead_manual" — não usa o AUTOMATION_SECRET (que não pode ir ao browser).
  const manualMatch = url.pathname.match(/\/manual(?:\/)?$/i);
  if (manualMatch) {
    return await handleManual(supabase, req);
  }

  // ── Modo normal: requer autenticação por secret ───────────────────────────
  const secret = Deno.env.get("AUTOMATION_SECRET");
  const auth = req.headers.get("Authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // ── Resume mode: chamado pelo pg_cron para continuar automações pausadas ──
  if (body.resume === true) {
    return await handleResume(supabase);
  }

  // ── Trigger mode normal ────────────────────────────────────────────────────
  const payload = body as unknown as TriggerPayload;
  if (!payload.trigger_type || !payload.company_id || !payload.lead_id) {
    return new Response("Missing required fields", { status: 400 });
  }
  return await runTrigger(supabase, payload);
});

// Executa as automações ativas que casam com o gatilho do payload.
// Se payload.automation_id estiver presente, executa apenas aquela automação.
async function runTrigger(supabase: SupabaseClient, payload: TriggerPayload): Promise<Response> {
  if (!payload.context) payload.context = {};
  const { trigger_type, company_id, lead_id, automation_id } = payload;

  const { data: automations, error } = await supabase
    .from("automations")
    .select("id, name, flow")
    .eq("company_id", company_id)
    .eq("active", true);

  if (error) {
    console.error("Failed to load automations:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; name: string; status: string; error?: string }[] = [];

  for (const automation of (automations as AutomationRecord[] ?? [])) {
    // Execução manual direcionada: ignora todas exceto a automação escolhida
    if (automation_id && automation.id !== automation_id) continue;
    const flow = automation.flow;
    const trigger = flow?.trigger;
    if (!trigger || trigger.triggerId !== trigger_type) continue;
    if (!await matchesTriggerConfig(supabase, trigger, payload)) continue;

    try {
      await executeFlow(supabase, flow, payload, automation.id);
      results.push({ id: automation.id, name: automation.name, status: "ok" });
    } catch (err) {
      console.error(`Automation ${automation.id} (${automation.name}) failed:`, err);
      results.push({ id: automation.id, name: automation.name, status: "error", error: String(err) });
    }
  }

  console.log(`[${trigger_type}] lead=${lead_id} matched=${results.length}`);
  return Response.json({ trigger_type, lead_id, matched: results.length, results });
}

// Execução manual disparada pela UI (gatilho lead_manual). Autentica pelo JWT do
// usuário e autoriza apenas dono ou membro da empresa antes de executar.
async function handleManual(supabase: SupabaseClient, req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return new Response("Unauthorized", { status: 401 });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return new Response("Unauthorized", { status: 401 });

  let body: { company_id?: string; lead_id?: string; automation_id?: string };
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  const { company_id, lead_id, automation_id } = body;
  if (!company_id || !lead_id || !automation_id) {
    return new Response("Missing required fields", { status: 400 });
  }

  // Autorização: dono da empresa ou membro
  const { data: comp } = await supabase.from("companies").select("owner_id").eq("id", company_id).maybeSingle();
  let allowed = comp?.owner_id === user.id;
  if (!allowed) {
    const { data: mem } = await supabase.from("company_members").select("id").eq("company_id", company_id).eq("user_id", user.id).maybeSingle();
    allowed = !!mem;
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const payload: TriggerPayload = { trigger_type: "lead_manual", company_id, lead_id, automation_id, context: {} };
  return await runTrigger(supabase, payload);
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

async function handleWebhook(
  supabase: SupabaseClient,
  req: Request,
  webhookId: string,
): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // O webhookId é o próprio id da automação
  const { data: automation, error: autoErr } = await supabase
    .from("automations")
    .select("id, name, flow, company_id, owner_id")
    .eq("id", webhookId)
    .eq("active", true)
    .single();

  if (autoErr || !automation) {
    return Response.json({ error: "Webhook not found or automation inactive" }, { status: 404, headers: corsHeaders });
  }

  const flow = (automation as AutomationRecord).flow;
  const automationId = (automation as AutomationRecord).id;
  const companyId = (automation as AutomationRecord).company_id;
  const ownerId = (automation as AutomationRecord).owner_id;

  // Lê o body da requisição
  let webhookBody: Record<string, unknown> = {};
  try {
    webhookBody = (await req.json()) as Record<string, unknown>;
  } catch { /* body vazio ou não-JSON é aceito */ }

  // Persiste o último payload para exibição no canvas (sem await — não bloqueia)
  supabase.from("automations").update({ last_webhook_payload: webhookBody }).eq("id", automationId).then(() => {});

  // Identifica o lead pelo body em CASCATA (lead_id → email → telefone). Antes era um
  // else-if mutuamente exclusivo: um cliente que voltava com e-mail novo mas mesmo telefone
  // não casava (email presente porém sem match parava a busca) → lead DUPLICADO. Agora, se o
  // e-mail não casar, ainda tentamos o telefone.
  let lead_id: string | null = null;

  if (webhookBody.lead_id) {
    lead_id = String(webhookBody.lead_id);
  }

  if (!lead_id && webhookBody.email) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("owner_id", ownerId)
      .ilike("email", String(webhookBody.email)) // e-mail é case-insensitive
      .maybeSingle();
    lead_id = lead?.id ?? null;
  }

  if (!lead_id) {
    // Os payloads enviam o número em `whatsapp`, `telefone` ou `phone`. O lead guarda o
    // número JÁ normalizado (+55DDDNUMERO). Normaliza o valor recebido do mesmo jeito
    // (parsePhoneNumber) e também tenta o valor cru, para casar independente de formatação.
    const rawPhone = (webhookBody.whatsapp ?? webhookBody.telefone ?? webhookBody.phone) as string | undefined;
    if (rawPhone) {
      const parsed = parsePhoneNumber(String(rawPhone), "BR");
      const candidates = [...new Set([parsed.phone, String(rawPhone)].filter(Boolean))];
      for (const cand of candidates) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("whatsapp", cand)
          .maybeSingle();
        if (lead?.id) { lead_id = lead.id; break; }
      }
    }
  }

  // Se não há lead, o fluxo ainda roda — dados do formulário ficam disponíveis
  // como variáveis {{gatilho.CAMPO}} (ex: {{gatilho.email}}, {{gatilho.nome}})
  const resolvedLeadId = lead_id ?? "";

  const payload: TriggerPayload = {
    trigger_type: "http_webhook",
    company_id: companyId,
    lead_id: resolvedLeadId,
    context: { changed_fields: webhookBody, webhook_owner_id: ownerId },
  };

  try {
    await executeFlow(supabase, flow, payload, automationId);
    return Response.json({ ok: true, lead_id, automation_id: automationId }, { headers: corsHeaders });
  } catch (err) {
    console.error(`Webhook automation ${automationId} failed:`, err);
    return Response.json({ error: String(err) }, { status: 500, headers: corsHeaders });
  }
}

// ─── MCP Tool trigger handler ─────────────────────────────────────────────────

async function handleMcpTrigger(supabase: SupabaseClient, req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch { /* empty body */ }

  const { tool_name, company_id, lead_id, arguments: toolArgs } = body as {
    tool_name?: string;
    company_id?: string;
    lead_id?: string;
    arguments?: Record<string, unknown>;
  };

  if (!tool_name || !company_id) {
    return Response.json({ error: "tool_name e company_id são obrigatórios" }, { status: 400, headers: corsHeaders });
  }

  const { data: automations, error: autoErr } = await supabase
    .from("automations")
    .select("id, name, flow")
    .eq("company_id", company_id)
    .eq("active", true);

  if (autoErr) {
    return Response.json({ error: autoErr.message }, { status: 500, headers: corsHeaders });
  }

  const matching = (automations as AutomationRecord[] ?? []).filter((auto) => {
    const trigger = auto.flow?.trigger;
    if (!trigger || trigger.triggerId !== "mcp_tool") return false;
    const cfgToolName = (trigger.configData?.toolName as string) ?? "";
    return !cfgToolName || cfgToolName === tool_name;
  });

  if (!matching.length) {
    return Response.json({ error: `Nenhuma automação ativa encontrada para tool: ${tool_name}` }, { status: 404, headers: corsHeaders });
  }

  const resolvedLeadId = lead_id ?? "";
  const payload: TriggerPayload = {
    trigger_type: "mcp_tool",
    company_id,
    lead_id: resolvedLeadId,
    context: {
      changed_fields: { tool_name, ...(toolArgs ?? {}) },
    },
  };

  const results: { id: string; name: string; status: string; error?: string }[] = [];
  for (const auto of matching) {
    try {
      await executeFlow(supabase, auto.flow, payload, auto.id);
      results.push({ id: auto.id, name: auto.name, status: "ok" });
    } catch (err) {
      console.error(`MCP tool automation ${auto.id} failed:`, err);
      results.push({ id: auto.id, name: auto.name, status: "error", error: String(err) });
    }
  }

  console.log(`[mcp_tool] tool=${tool_name} company=${company_id} matched=${results.length}`);
  return Response.json({ ok: true, tool_name, matched: results.length, results }, { headers: corsHeaders });
}

// ─── Resume handler ───────────────────────────────────────────────────────────

interface AwaitingRecord {
  id: string;
  company_id: string;
  automation_id: string;
  lead_id: string | null;
  owner_id: string;
  phone: string;
  node_id: string;
  var_name: string;
  resume_node_ids: string[];
  trigger_payload: TriggerPayload;
  expires_at: string | null;
}

// Retomada do bloco "Entrada do usuário" quando o contato responde (zapi-webhook).
async function handleResumeReply(
  supabase: SupabaseClient,
  req: Request,
): Promise<Response> {
  let input: { awaiting_id?: string; text?: string; secret?: string };
  try {
    input = (await req.json()) as typeof input;
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Autorização: o segredo do motor vai no corpo (o gateway já validou a service key)
  const secret = Deno.env.get("AUTOMATION_SECRET");
  if (!secret || input.secret !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const awaitingId = input.awaiting_id;
  if (!awaitingId) return Response.json({ error: "awaiting_id obrigatório" }, { status: 400 });

  const { data: row } = await supabase
    .from("automation_awaiting_reply")
    .select("*")
    .eq("id", awaitingId)
    .maybeSingle();
  if (!row) return Response.json({ ok: true, skipped: "not found" });

  const awaiting = row as AwaitingRecord;
  // Deleta primeiro para evitar dupla retomada
  await supabase.from("automation_awaiting_reply").delete().eq("id", awaitingId);

  const { data: automation } = await supabase
    .from("automations")
    .select("id, name, flow")
    .eq("id", awaiting.automation_id)
    .eq("company_id", awaiting.company_id)
    .eq("active", true)
    .single();
  if (!automation) return Response.json({ ok: true, skipped: "automation inactive" });

  // Injeta a resposta capturada → disponível como {{var_name}} nos próximos nós
  const payload = awaiting.trigger_payload;
  payload.context = payload.context ?? {};
  payload.context.user_inputs = {
    ...(payload.context.user_inputs ?? {}),
    [awaiting.var_name]: String(input.text ?? ""),
  };

  await executeFlow(
    supabase,
    (automation as AutomationRecord).flow,
    payload,
    awaiting.automation_id,
    awaiting.resume_node_ids,
  );
  return Response.json({ ok: true, resumed: awaiting.automation_id });
}

async function handleResume(supabase: SupabaseClient): Promise<Response> {
  const now = new Date().toISOString();

  // Esperas de resposta expiradas (contato não respondeu no prazo): se houver
  // saída "Caso o contato não responda" conectada, retoma o fluxo por ela.
  {
    const { data: expired } = await supabase
      .from("automation_awaiting_reply")
      .select("id, company_id, automation_id, trigger_payload, timeout_node_ids")
      .lt("expires_at", now);
    const expiredRows = (expired ?? []) as {
      id: string; company_id: string; automation_id: string;
      trigger_payload: TriggerPayload; timeout_node_ids: string[] | null;
    }[];
    if (expiredRows.length > 0) {
      // Deleta antes de processar para evitar dupla retomada
      await supabase.from("automation_awaiting_reply").delete().in("id", expiredRows.map((r) => r.id));
      for (const row of expiredRows) {
        const timeoutIds = row.timeout_node_ids ?? [];
        if (timeoutIds.length === 0) continue; // sem saída conectada: só descarta
        try {
          const { data: automation } = await supabase
            .from("automations")
            .select("id, name, flow")
            .eq("id", row.automation_id)
            .eq("company_id", row.company_id)
            .eq("active", true)
            .single();
          if (automation) {
            await executeFlow(
              supabase,
              (automation as AutomationRecord).flow,
              row.trigger_payload,
              automation.id,
              timeoutIds,
            );
          }
        } catch (err) {
          console.error(`Failed to resume timeout branch ${row.id}:`, err);
        }
      }
    }
  }

  const { data: pending, error } = await supabase
    .from("automation_pending")
    .select("*")
    .lte("resume_after", now);

  if (error) {
    console.error("Failed to load pending automations:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return Response.json({ resumed: 0 });
  }

  // Deleta primeiro para evitar dupla execução caso o job rode em paralelo
  const ids = (pending as PendingRecord[]).map((p) => p.id);
  await supabase.from("automation_pending").delete().in("id", ids);

  const results: { id: string; status: string; error?: string }[] = [];

  for (const item of pending as PendingRecord[]) {
    try {
      const { data: automation } = await supabase
        .from("automations")
        .select("id, name, flow")
        .eq("id", item.automation_id)
        .eq("company_id", item.company_id)
        .eq("active", true)
        .single();

      if (!automation) {
        results.push({ id: item.id, status: "skipped", error: "Automation not found or inactive" });
        continue;
      }

      const resumeCtx = (item.resume_sub_index != null && item.node_ids.length > 0)
        ? { nodeId: item.node_ids[0], subIndex: item.resume_sub_index }
        : undefined;
      await executeFlow(
        supabase,
        (automation as AutomationRecord).flow,
        item.trigger_payload,
        automation.id,
        item.node_ids,
        resumeCtx,
      );
      results.push({ id: item.id, status: "ok" });
    } catch (err) {
      console.error(`Failed to resume pending ${item.id}:`, err);
      results.push({ id: item.id, status: "error", error: String(err) });
    }
  }

  console.log(`[resume] processed=${pending.length}`);
  return Response.json({ resumed: pending.length, results });
}

// ─── Trigger filter matching ──────────────────────────────────────────────────

async function matchesTriggerConfig(
  supabase: SupabaseClient,
  trigger: TriggerConfig,
  payload: TriggerPayload,
): Promise<boolean> {
  const cfg = trigger.configData ?? {};

  switch (trigger.triggerId) {
    case "neg_criado": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if (cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "neg_movido": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if (cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "neg_ganho":
    case "neg_restaurado": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if ((cfg.scope as string) === "Etapa" && cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "neg_perdido": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if ((cfg.scope as string) === "Etapa" && cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "tag_adicionada": {
      const cfgTagIds = splitIds(cfg.tags as string);
      if (!cfgTagIds.length) return true;
      const tagsAdded = payload.context.tag_ids_added ?? [];
      if (cfgTagIds.some((t) => tagsAdded.includes(t))) return true;
      const { data: rows } = await supabase.from("tags").select("name").in("id", cfgTagIds).eq("company_id", payload.company_id);
      const names = (rows ?? []).map((r: { name: string }) => r.name);
      return names.some((n: string) => tagsAdded.includes(n));
    }
    case "tag_removida": {
      const cfgTagIds = splitIds(cfg.tags as string);
      if (!cfgTagIds.length) return true;
      const tagsRemoved = payload.context.tag_ids_removed ?? [];
      if (cfgTagIds.some((t) => tagsRemoved.includes(t))) return true;
      const { data: rows } = await supabase.from("tags").select("name").in("id", cfgTagIds).eq("company_id", payload.company_id);
      const names = (rows ?? []).map((r: { name: string }) => r.name);
      return names.some((n: string) => tagsRemoved.includes(n));
    }
    case "atend_atribuido": {
      const cfgAtend = cfg.atendente as string;
      if (!cfgAtend) return true;
      return payload.context.new_responsible === cfgAtend;
    }
    case "atend_retirado": {
      const cfgAtend = cfg.atendente as string;
      if (!cfgAtend) return true;
      return payload.context.old_responsible === cfgAtend;
    }
    case "campo_alterado": {
      const field = cfg.field as string;
      if (!field) return true;
      const changedFields = (payload.context.changed_fields ?? {}) as Record<string, unknown>;

      let fieldChanged = field in changedFields;
      let newValue: unknown = changedFields[field];

      if (!fieldChanged) {
        const customVals = (changedFields["custom_field_values"] ?? {}) as Record<string, unknown>;
        if (field in customVals) {
          fieldChanged = true;
          newValue = customVals[field];
        }
      }

      if (!fieldChanged) return false;
      if ((cfg.mode as string) !== "specific") return true;
      return String(newValue ?? "") === String(cfg.value ?? "");
    }
    case "outra_automacao": {
      const requiredOrigin = cfg.automacao_id as string;
      if (!requiredOrigin) return true;
      return payload.context.parent_automation_id === requiredOrigin;
    }

    case "mcp_tool":
      return true;

    default:
      return true;
  }
}

// ─── Flow execution (BFS) ─────────────────────────────────────────────────────

async function executeFlow(
  supabase: SupabaseClient,
  flow: AutomationFlow,
  payload: TriggerPayload,
  automationId: string,
  startNodeIds?: string[], // fornecido ao retomar de automation_pending
  resumeContext?: { nodeId: string; subIndex: number }, // retoma um nó Mensagem a partir de um sub-bloco (Atraso de tempo)
) {
  const { company_id } = payload;
  // logLeadId é lido do payload a cada uso — assim captura o lead criado mid-flow
  const getLogLeadId = () => payload.lead_id || null;
  const allNodes: CanvasNode[] = flow.nodes ?? [];

  const children = new Map<string, CanvasNode[]>();
  const errorChildren = new Map<string, CanvasNode[]>();
  const timeoutChildren = new Map<string, CanvasNode[]>();

  for (const n of allNodes) {
    // Support both legacy parentId (string) and new parentIds (array)
    const pIds = (n.parentIds && n.parentIds.length > 0)
      ? n.parentIds
      : (n.parentId ? [n.parentId] : []);
    for (const pid of pIds) {
      const arr = children.get(pid) ?? [];
      arr.push(n);
      children.set(pid, arr);
    }
    // Support both legacy errorParentId (string) and new errorParentIds (array)
    const epIds = (n.errorParentIds && n.errorParentIds.length > 0)
      ? n.errorParentIds
      : (n.errorParentId ? [n.errorParentId] : []);
    for (const epid of epIds) {
      const arr = errorChildren.get(epid) ?? [];
      arr.push(n);
      errorChildren.set(epid, arr);
    }
    // Saída "não respondeu" (timeout do Entrada do usuário)
    for (const tpid of (n.timeoutParentIds ?? [])) {
      const arr = timeoutChildren.get(tpid) ?? [];
      arr.push(n);
      timeoutChildren.set(tpid, arr);
    }
  }

  let initialQueue: CanvasNode[];

  if (startNodeIds && startNodeIds.length > 0) {
    // Retomando de um nó de espera — pular start
    initialQueue = allNodes.filter((n) => startNodeIds.includes(n.id));
  } else {
    // Início normal — logar start node
    const startNode = allNodes.find((n) => n.type === "start");
    if (startNode) {
      await supabase.from("automation_logs").insert({
        automation_id: automationId,
        company_id,
        lead_id: getLogLeadId(),
        node_id: startNode.id,
        status: "success",
      });
    }
    initialQueue = [...(children.get(startNode?.id ?? "") ?? [])];
  }

  const queue: CanvasNode[] = [...initialQueue];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift()!;

    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === "note" || node.type === "start") continue;

    // ── Ações ──────────────────────────────────────────────────────────────
    if (node.type === "acoes") {
      let successCount = 0;
      const errorMessages: string[] = [];

      for (const item of (node.actionItems ?? [])) {
        try {
          await executeAction(supabase, item, payload, automationId);
          successCount++;
        } catch (err) {
          errorMessages.push(String(err));
          console.error(`[node ${node.id}] action ${item.actionId} failed:`, err);
        }
      }

      if (successCount > 0 || errorMessages.length > 0) {
        const status = errorMessages.length > 0
          ? (successCount > 0 ? "alert" : "error")
          : "success";
        await supabase.from("automation_logs").insert({
          automation_id: automationId,
          company_id,
          lead_id: getLogLeadId(),
          node_id: node.id,
          status,
          error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null,
        });
      }

      if (errorMessages.length > 0) {
        const errNext = errorChildren.get(node.id) ?? [];
        if (errNext.length > 0) {
          queue.push(...errNext);
          continue;
        }
      }
      queue.push(...(children.get(node.id) ?? []));

    // ── Condições ──────────────────────────────────────────────────────────
    } else if (node.type === "condicoes") {
      const { allPassed, passedCondIds } = await evaluateConditionNode(supabase, node, payload);

      await supabase.from("automation_logs").insert({
        automation_id: automationId,
        company_id,
        lead_id: getLogLeadId(),
        node_id: node.id,
        status: allPassed ? "success" : "alert",
      });

      for (const condId of passedCondIds) {
        const individualNext = children.get(`${node.id}_${condId}`) ?? [];
        queue.push(...individualNext);
      }

      if (allPassed) {
        queue.push(...(children.get(node.id) ?? []));
      } else {
        queue.push(...(errorChildren.get(node.id) ?? []));
      }

    // ── Espera ─────────────────────────────────────────────────────────────
    } else if (node.type === "espera") {
      const esp = node.espera;
      const nextNodes = children.get(node.id) ?? [];

      if (esp) {
        const delay = getEsperaDelay(esp);

        if (delay.type === "inline") {
          // Curto o suficiente para esperar inline (≤ 90 s)
          await new Promise<void>((r) => setTimeout(r, delay.ms));
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id: getLogLeadId(),
            node_id: node.id, status: "success",
          });
          queue.push(...nextNodes);

        } else if (delay.type === "scheduled" && nextNodes.length > 0) {
          // Insere na fila de pendentes — pg_cron retomará depois
          const { error: insErr } = await supabase.from("automation_pending").insert({
            company_id,
            automation_id: automationId,
            lead_id: payload.lead_id || null,
            node_ids: nextNodes.map((n) => n.id),
            trigger_payload: payload,
            resume_after: delay.resumeAfter.toISOString(),
          });
          if (insErr) {
            console.error(`[node ${node.id}] failed to schedule wait:`, insErr);
            // Em caso de falha ao agendar, continua normalmente
            queue.push(...nextNodes);
          }
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id: getLogLeadId(),
            node_id: node.id, status: "success",
          });
          // NÃO enfileira filhos — serão processados quando retomado

        } else {
          // "immediate" (já está na janela) ou nenhum filho
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id: getLogLeadId(),
            node_id: node.id, status: "success",
          });
          queue.push(...nextNodes);
        }
      } else {
        // Nó sem config de espera — passa direto
        queue.push(...nextNodes);
      }

    // ── API ────────────────────────────────────────────────────────────────
    } else if (node.type === "api") {
      const requests = node.apiConfig?.requests ?? [];

      if (requests.length === 0) {
        await supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id: getLogLeadId(),
          node_id: node.id, status: "success",
        });
        queue.push(...(children.get(node.id) ?? []));
      } else {
        const { data: leadData } = await supabase.from("leads").select("*").eq("id", payload.lead_id).single();
        const vars = await buildVarContext(supabase, leadData as Record<string, unknown> | null, payload);

        let allSuccess = true;
        const errors: string[] = [];

        for (const req of requests) {
          try {
            const rawUrl = interpolate(req.url, vars);
            if (!rawUrl) { errors.push(`${req.name}: URL vazia`); allSuccess = false; continue; }

            const urlObj = new URL(rawUrl);
            for (const { key, value } of (req.params ?? [])) {
              if (key) urlObj.searchParams.set(interpolate(key, vars), interpolate(value, vars));
            }

            const hdrs: Record<string, string> = {};
            for (const { key, value } of (req.headers ?? [])) {
              if (key) hdrs[interpolate(key, vars)] = interpolate(value, vars);
            }

            let body: BodyInit | undefined;
            if (req.type === "json" && req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
              body = interpolate(req.body, vars);
              if (!hdrs["Content-Type"] && !hdrs["content-type"]) {
                hdrs["Content-Type"] = "application/json";
              }
            }

            const resp = await fetch(urlObj.toString(), { method: req.method, headers: hdrs, body });
            if (!resp.ok) {
              errors.push(`${req.name}: HTTP ${resp.status} ${resp.statusText}`);
              allSuccess = false;
            }
          } catch (err) {
            errors.push(`${req.name}: ${String(err)}`);
            allSuccess = false;
          }
        }

        if (allSuccess) {
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id: getLogLeadId(),
            node_id: node.id, status: "success",
          });
          queue.push(...(children.get(node.id) ?? []));
        } else {
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id: getLogLeadId(),
            node_id: node.id, status: "error",
            error_message: errors.join("; "),
          });
          queue.push(...(errorChildren.get(node.id) ?? []));
        }
      }

    // ── Campos ─────────────────────────────────────────────────────────────
    } else if (node.type === "campos") {
      const ops = node.fieldOps ?? [];

      if (ops.length === 0) {
        await supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id: getLogLeadId(),
          node_id: node.id, status: "success",
        });
        queue.push(...(children.get(node.id) ?? []));
      } else {
        const currentLeadId = payload.lead_id;
        const leadData = currentLeadId
          ? ((await supabase.from("leads").select("*").eq("id", currentLeadId).single()).data as Record<string, unknown> | null)
          : null;
        const vars = await buildVarContext(supabase, leadData, payload);

        const leadUpdate: Record<string, unknown> = {};
        const customUpdate: Record<string, unknown> = {};
        const prodUpdate: Record<string, unknown> = {};
        const errors: string[] = [];

        for (const op of ops) {
          try {
            if (op.type === "analise_telefone") {
              const rawPhone = interpolate(op.phone ?? "", vars);
              const parsed = parsePhoneNumber(rawPhone, op.defaultCountry ?? "BR");
              // Persiste no contexto para nós posteriores (buildVarContext expõe phone-1.*)
              const dsStore = (payload.context.datasources ??= {});
              dsStore[op.datasourceName] = parsed;
              for (const [k, v] of Object.entries(parsed)) {
                vars[`${op.datasourceName}.${k}`] = v;
              }
            } else {
              const resolved = interpolate(op.value, vars);
              if (op.fieldKey.startsWith("lead.")) {
                leadUpdate[op.fieldKey.substring(5)] = resolved;
              } else if (op.fieldKey.startsWith("campo_lead.") || op.fieldKey.startsWith("campo_neg.") || op.fieldKey.startsWith("campo_empresa.")) {
                const dotIdx = op.fieldKey.indexOf(".");
                customUpdate[op.fieldKey.substring(dotIdx + 1)] = resolved;
              } else if (op.fieldKey.startsWith("prod.")) {
                prodUpdate[op.fieldKey.substring(5)] = resolved;
              }
            }
          } catch (err) {
            errors.push(`${op.type === "mapeamento" ? op.fieldLabel : op.datasourceName}: ${String(err)}`);
          }
        }

        if (Object.keys(leadUpdate).length > 0 || Object.keys(customUpdate).length > 0) {
          const updateData: Record<string, unknown> = { ...leadUpdate };
          // origin tem CHECK constraint no banco. Mapeia o valor recebido para a opção
          // pré-definida mais adequada (ex: "Google" → "Google Ads"). Sem isso, um origin
          // fora da lista aborta o UPDATE inteiro e nenhum campo do nó persiste.
          if (updateData.origin !== undefined) {
            const o = normalizeOrigin(updateData.origin);
            if (o) updateData.origin = o; else delete updateData.origin; // vazio: não sobrescreve
          }
          if (Object.keys(customUpdate).length > 0) {
            const existing = (leadData?.custom_field_values ?? {}) as Record<string, unknown>;
            updateData.custom_field_values = { ...existing, ...customUpdate };
          }

          if (currentLeadId) {
            // Lead existente — atualiza
            const { error: updateErr } = await supabase.from("leads").update(updateData).eq("id", currentLeadId);
            if (updateErr) errors.push(updateErr.message);
          } else {
            // Sem lead — armazena dados staged para que o bloco "Criar negócio" possa usar
            (payload.context as Record<string, unknown>).staged_lead_data = updateData;
          }
        }

        if (Object.keys(prodUpdate).length > 0) {
          const productId = leadData?.product_id;
          if (productId) {
            const { error: prodErr } = await supabase.from("products").update(prodUpdate).eq("id", productId as string);
            if (prodErr) errors.push(prodErr.message);
          }
        }

        const newLogLeadId = payload.lead_id || null;
        const status = errors.length > 0 ? "error" : "success";
        // newLogLeadId pode ser o lead recém-criado por um bloco anterior na mesma execução
        await supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id: newLogLeadId,
          node_id: node.id, status,
          error_message: errors.length > 0 ? errors.join("; ") : null,
        });

        if (errors.length > 0) {
          const errNext = errorChildren.get(node.id) ?? [];
          if (errNext.length > 0) { queue.push(...errNext); continue; }
        }
        queue.push(...(children.get(node.id) ?? []));
      }

    // ── IA ───────────────────────────────────────────────────────────────────
    } else if (node.type === "ia") {
      const actions = node.iaActions ?? [];
      const leadData = payload.lead_id
        ? ((await supabase.from("leads").select("*").eq("id", payload.lead_id).single()).data as Record<string, unknown> | null)
        : null;
      const vars = await buildVarContext(supabase, leadData, payload);
      // Transcrição da conversa do lead (quando houver telefone), p/ ações "com base na conversa".
      let conversa = await buildConversationContext(supabase, company_id, (leadData?.whatsapp as string) || (leadData?.phone as string) || "");

      const errors: string[] = [];
      let ranAny = false;
      let tokensTotal = 0;
      const dsStore = (payload.context.datasources ??= {});
      const branchTargets: string[] = []; // portas de saída a disparar (intenção/sentimento)

      for (const action of actions) {
        try {
          if (action.type === "assistente_chat" || action.type === "gerar_texto") {
            const { text, tokens } = await runIaTextAction(supabase, company_id, action, vars, conversa);
            dsStore[action.outputVar || "ia"] = { resposta: text };
            tokensTotal += tokens;
            ranAny = true;

          } else if (action.type === "intencao") {
            const opts = (action.intencoes ?? []).filter((o) => (o.nome ?? "").trim());
            const { id: matchedId, tokens } = await runIaClassify(supabase, company_id, action, vars, conversa, opts);
            const matched = opts.find((o) => o.id === matchedId);
            dsStore[action.outputVar || "ia"] = { intencao: matched?.nome ?? "nenhuma", id: matched?.id ?? "" };
            branchTargets.push(matchedId ? `${node.id}_${matchedId}` : `${node.id}_${action.id}-none`);
            tokensTotal += tokens;
            ranAny = true;

          } else if (action.type === "sentimento") {
            const opts = (action.sentimentos ?? []).filter((o) => (o.nome ?? "").trim());
            const { id: matchedId, tokens } = await runIaClassify(supabase, company_id, action, vars, conversa, opts);
            const matched = opts.find((o) => o.id === matchedId);
            dsStore[action.outputVar || "ia"] = { sentimento: matched?.nome ?? "" };
            if (matchedId) branchTargets.push(`${node.id}_${matchedId}`);
            tokensTotal += tokens;
            ranAny = true;

          } else if (action.type === "extrator_params") {
            const { obj, tokens } = await runIaExtractParams(supabase, company_id, action, vars, conversa);
            dsStore[action.outputVar || "ia"] = obj;
            tokensTotal += tokens;
            ranAny = true;

          } else if (action.type === "transcricao_audio") {
            const text = await runIaTranscription(supabase, company_id, action,
              (leadData?.whatsapp as string) || (leadData?.phone as string) || "");
            dsStore[action.outputVar || "ia"] = { texto: text };
            // Acrescenta a transcrição ao contexto para ações seguintes no mesmo nó
            if (text) conversa = conversa ? `${conversa}\nCliente (áudio): ${text}` : `Cliente (áudio): ${text}`;
            ranAny = true;

          } else {
            // Invocar Agente — depende do cadastro de Agentes (Em breve)
            errors.push(`Ação "${action.type}" ainda não é executada pelo motor`);
          }
        } catch (err) {
          errors.push(`${action.outputVar}: ${String(err instanceof Error ? err.message : err)}`);
          console.error(`[node ${node.id}] IA action ${action.type} failed:`, err);
        }
      }

      const status = errors.length > 0 ? (ranAny ? "alert" : "error") : "success";
      await supabase.from("automation_logs").insert({
        automation_id: automationId, company_id, lead_id: getLogLeadId(),
        node_id: node.id, status,
        error_message: errors.length > 0 ? errors.join("; ") : null,
        tokens: tokensTotal > 0 ? tokensTotal : null,
      });

      if (errors.length > 0 && !ranAny) {
        const errNext = errorChildren.get(node.id) ?? [];
        if (errNext.length > 0) { queue.push(...errNext); continue; }
      }
      // Saídas de ramificação (intenção/sentimento) + "Próximo passo" geral
      for (const t of branchTargets) queue.push(...(children.get(t) ?? []));
      queue.push(...(children.get(node.id) ?? []));

    // ── Randomizador ───────────────────────────────────────────────────────
    } else if (node.type === "randomizador") {
      const branches: RandomBranch[] = node.randomBranches ?? [
        { id: "a", label: "A", percentage: 25 },
        { id: "b", label: "B", percentage: 25 },
        { id: "c", label: "C", percentage: 25 },
        { id: "d", label: "D", percentage: 25 },
      ];

      const total = branches.reduce((sum, b) => sum + (b.percentage ?? 0), 0);
      const rand = Math.random() * (total > 0 ? total : 100);

      let selectedBranchId: string | null = null;
      let cumulative = 0;
      for (const branch of branches) {
        cumulative += branch.percentage ?? 0;
        if (rand < cumulative) {
          selectedBranchId = branch.id;
          break;
        }
      }
      if (!selectedBranchId && branches.length > 0) {
        selectedBranchId = branches[branches.length - 1].id;
      }

      await supabase.from("automation_logs").insert({
        automation_id: automationId, company_id, lead_id: getLogLeadId(),
        node_id: node.id, status: "success",
      });

      if (selectedBranchId) {
        queue.push(...(children.get(`${node.id}_${selectedBranchId}`) ?? []));
      }

    // ── Mensagem (WhatsApp via Z-API) ────────────────────────────────────────
    } else if (node.type === "mensagem") {
      const subBlocks = node.subBlocks ?? [];
      // Retoma a sequência a partir de um sub-bloco específico (após um Atraso de tempo longo)
      const startIdx = (resumeContext && resumeContext.nodeId === node.id)
        ? Math.max(0, Math.min(resumeContext.subIndex, subBlocks.length))
        : 0;

      // Sem sub-blocos configurados: nada a enviar, segue o fluxo
      if (subBlocks.length === 0) {
        await supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id: getLogLeadId(),
          node_id: node.id, status: "success",
        });
        queue.push(...(children.get(node.id) ?? []));
        continue;
      }

      const currentLeadId = payload.lead_id;
      const leadData = currentLeadId
        ? ((await supabase.from("leads").select("*").eq("id", currentLeadId).single()).data as Record<string, unknown> | null)
        : null;

      const rawPhone = String((leadData?.whatsapp ?? leadData?.phone) ?? "").replace(/\D/g, "");
      const ownerId = (leadData?.owner_id as string | undefined) ?? null;

      // Falhas "duras" → roteia para o ramo de erro do nó
      const hardError = (msg: string) => {
        return supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id: getLogLeadId(),
          node_id: node.id, status: "error", error_message: msg,
        });
      };

      // Resolve as credenciais de envio. Prioridade: conexão escolhida no bloco
      // (Configurações → Conexão / whatsapp_connections); se em branco, usa a
      // conexão Z-API padrão da empresa (companies.zapi_*).
      let creds: ZapiCreds | null = null;

      if (node.connectionId) {
        const { data: connRow } = await supabase
          .from("whatsapp_connections")
          .select("provider, instance_id, token, client_token, connected, owner_id")
          .eq("id", node.connectionId)
          .maybeSingle();
        const conn = connRow as Record<string, unknown> | null;
        // Isolamento por dono: nunca usar conexão de outro tenant
        if (!conn || (ownerId && conn.owner_id !== ownerId)) {
          await hardError("Conexão selecionada não encontrada");
          queue.push(...(errorChildren.get(node.id) ?? []));
          continue;
        }
        if (!conn.connected || !conn.instance_id || !conn.token) {
          await hardError("Conexão selecionada está desconectada");
          queue.push(...(errorChildren.get(node.id) ?? []));
          continue;
        }
        creds = {
          instanceId: String(conn.instance_id),
          token: String(conn.token),
          clientToken: conn.client_token ? String(conn.client_token) : null,
          provider: String(conn.provider) === "dapi" ? "dapi" : "zapi",
        };
      } else {
        const { data: companyData } = await supabase
          .from("companies")
          .select("zapi_instance_id, zapi_token, zapi_client_token, zapi_connected")
          .eq("id", company_id)
          .maybeSingle();
        const zapi = companyData as Record<string, unknown> | null;
        if (!zapi?.zapi_connected || !zapi?.zapi_instance_id || !zapi?.zapi_token) {
          await hardError("Nenhuma conexão de WhatsApp selecionada e a empresa não tem conexão padrão");
          queue.push(...(errorChildren.get(node.id) ?? []));
          continue;
        }
        creds = {
          instanceId: String(zapi.zapi_instance_id),
          token: String(zapi.zapi_token),
          clientToken: zapi.zapi_client_token ? String(zapi.zapi_client_token) : null,
          provider: "zapi",
        };
      }

      if (!rawPhone) {
        await hardError("Lead sem telefone/WhatsApp para envio");
        queue.push(...(errorChildren.get(node.id) ?? []));
        continue;
      }

      const vars = await buildVarContext(supabase, leadData, payload);

      const errors: string[] = [];
      const skipped: string[] = [];
      let sentCount = 0;
      let paused = false;       // entrada_usuario: aguarda resposta do contato
      let pausedTimer = false;  // atraso_tempo longo: agendado para retomar este nó

      for (let i = startIdx; i < subBlocks.length; i++) {
        const sb = subBlocks[i];
        try {
          if (sb.type === "mensagem_texto") {
            const message = interpolate(sb.text ?? "", vars);
            const buttons = (sb.buttons ?? [])
              .map((bt) => String(bt.label ?? "").trim())
              .filter(Boolean);
            if (!message.trim() && buttons.length === 0) { skipped.push("mensagem de texto vazia"); continue; }

            // "Quebrar mensagens?": cada parágrafo (linha em branco) vira um envio separado
            const parts = sb.splitMessages
              ? message.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
              : [message];
            if (parts.length === 0) parts.push(message);

            for (let i = 0; i < parts.length; i++) {
              const isLast = i === parts.length - 1;
              // Botões (se houver) vão anexados à última parte, via send-button-list
              if (isLast && buttons.length > 0) {
                await sendWa(creds, { kind: "buttons", phone: rawPhone, message: parts[i], buttons });
              } else {
                await sendWa(creds, { kind: "text", phone: rawPhone, message: parts[i] });
              }
              // Persiste no histórico de conversas (mesma tabela do multiatendimento)
              await supabase.from("whatsapp_messages").insert({
                owner_id: leadData?.owner_id ?? null, instance_id: creds.instanceId,
                phone: rawPhone, from_me: true, body: parts[i], type: "text",
              });
              // Pequeno intervalo entre partes para preservar a ordem de entrega
              if (!isLast) await new Promise<void>((r) => setTimeout(r, 600));
            }
            sentCount++;

          } else if (sb.type === "atraso_tempo") {
            // Atraso entre mensagens. Sem limite: ≤ 90 s espera inline (simula
            // digitação); acima disso agenda no automation_pending e retoma este
            // mesmo nó a partir do próximo sub-bloco (pg_cron).
            const secs = Math.max(0, Number(sb.delaySeconds ?? 0));
            if (secs <= 90) {
              if (secs > 0) await new Promise<void>((r) => setTimeout(r, secs * 1000));
            } else {
              const { error: insErr } = await supabase.from("automation_pending").insert({
                company_id,
                automation_id: automationId,
                lead_id: payload.lead_id || null,
                node_ids: [node.id],
                resume_sub_index: i + 1,
                trigger_payload: payload,
                resume_after: new Date(Date.now() + secs * 1000).toISOString(),
              });
              if (insErr) {
                // Falha ao agendar: degrada para continuar imediatamente (não trava o fluxo)
                console.error(`[node ${node.id}] failed to schedule atraso_tempo:`, insErr);
              } else {
                pausedTimer = true;
                break;
              }
            }

          } else if (sb.type === "arquivo_url" || sb.type === "arquivo_anexo" || sb.type === "mensagem_audio") {
            const fileUrl = interpolate(sb.fileUrl ?? "", vars).trim();
            if (!fileUrl) { skipped.push(`${sb.type}: sem URL de arquivo`); continue; }
            let msgType = "document";
            if (sb.type === "mensagem_audio") {
              await sendWa(creds, { kind: "audio", phone: rawPhone, url: fileUrl });
              msgType = "audio";
            } else {
              const ext = (fileUrl.split("?")[0].split(".").pop() ?? "").toLowerCase();
              const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext);
              if (isImage) {
                await sendWa(creds, { kind: "image", phone: rawPhone, url: fileUrl });
                msgType = "image";
              } else {
                await sendWa(creds, { kind: "document", phone: rawPhone, url: fileUrl, fileName: sb.fileName ?? `arquivo.${ext || "pdf"}`, ext });
              }
            }
            await supabase.from("whatsapp_messages").insert({
              owner_id: leadData?.owner_id ?? null, instance_id: creds.instanceId,
              phone: rawPhone, from_me: true, body: sb.fileName ?? fileUrl, type: msgType,
              media_url: fileUrl, // URL pública para reprodução/preview no Multiatendimento
            });
            sentCount++;

          } else if (sb.type === "entrada_usuario") {
            // PAUSA o fluxo: registra a espera pela resposta do contato. Quando a
            // mensagem chegar (zapi-webhook → resume_reply), o motor retoma a
            // partir dos filhos deste nó, com {{var_name}} preenchido.
            const varName = String(sb.varName ?? "").trim() || "resposta";
            const nextNodes = children.get(node.id) ?? [];
            const timeoutNodes = timeoutChildren.get(node.id) ?? [];
            // Prazo de espera configurável (padrão: 24 h se não definido)
            const unitMs = sb.timeoutUnit === "minutos" ? 60_000
              : sb.timeoutUnit === "dias" ? 86_400_000
              : 3_600_000; // horas
            const timeoutMs = sb.timeoutAmount && sb.timeoutAmount > 0
              ? sb.timeoutAmount * unitMs
              : 24 * 60 * 60 * 1000;
            await supabase.from("automation_awaiting_reply").insert({
              company_id,
              automation_id: automationId,
              lead_id: payload.lead_id || null,
              owner_id: ownerId,
              phone: rawPhone,
              node_id: node.id,
              var_name: varName,
              resume_node_ids: nextNodes.map((n) => n.id),
              timeout_node_ids: timeoutNodes.map((n) => n.id),
              trigger_payload: payload,
              expires_at: new Date(Date.now() + timeoutMs).toISOString(),
            });
            paused = true;
            break; // não processa sub-blocos seguintes; serão retomados no resume
          }
        } catch (err) {
          errors.push(`${sb.type}: ${String(err)}`);
        }
      }

      // Atraso de tempo longo: já agendado no automation_pending. Não loga nem
      // enfileira filhos — o nó será retomado e logado quando concluir.
      if (pausedTimer) continue;

      // Status: erro só se nada foi enviado e houve falha; alerta se houve skip/erro parcial.
      // Quando o nó PAUSOU aguardando resposta (Entrada do usuário), registra como
      // "alert" com nota clara — senão o nó apareceria como concluído ("success")
      // mesmo estando só à espera, confundindo a leitura do log.
      const noteMsgs = [...errors, ...skipped];
      const status = paused
        ? "alert"
        : (sentCount === 0 && errors.length > 0)
          ? "error"
          : (noteMsgs.length > 0 ? "alert" : "success");
      const logNote = paused
        ? ["Aguardando resposta do contato", ...noteMsgs].join("; ")
        : (noteMsgs.length > 0 ? noteMsgs.join("; ") : null);
      await supabase.from("automation_logs").insert({
        automation_id: automationId, company_id, lead_id: getLogLeadId(),
        node_id: node.id, status,
        error_message: logNote,
      });

      // Pausado aguardando resposta: NÃO enfileira filhos (serão processados no resume)
      if (paused) continue;

      if (status === "error") {
        queue.push(...(errorChildren.get(node.id) ?? []));
      } else {
        queue.push(...(children.get(node.id) ?? []));
      }

    // ── Outros ─────────────────────────────────────────────────────────────
    } else {
      queue.push(...(children.get(node.id) ?? []));
    }
  }
}

// ─── Z-API (WhatsApp) helper ──────────────────────────────────────────────────

interface ZapiCreds {
  instanceId: string;      // Z-API: instância · D-API: sessionId
  token: string;           // Z-API: token da instância · D-API: API Key da conta
  clientToken: string | null;
  provider?: "zapi" | "dapi"; // default: "zapi"
}

// Mensagem de WhatsApp em formato agnóstico de provedor. sendWa() traduz para
// a API do provedor correto (Z-API ou D-API) a partir de creds.provider.
type WaMsg =
  | { kind: "text"; phone: string; message: string }
  | { kind: "buttons"; phone: string; message: string; buttons: string[] }
  | { kind: "audio"; phone: string; url: string }
  | { kind: "image"; phone: string; url: string }
  | { kind: "document"; phone: string; url: string; fileName: string; ext: string };

async function sendWa(creds: ZapiCreds, msg: WaMsg): Promise<void> {
  if (creds.provider === "dapi") { await sendDapi(creds, msg); return; }
  // Z-API (comportamento original, byte-a-byte)
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

// D-API: base https://api.d-api.cloud, auth por header Authorization: <API_KEY>,
// corpo { sessionId, to, ... }. Botões não têm endpoint próprio → viram texto.
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

// Executa o bloco de IA: lê a chave do provedor (BYOK) da empresa, interpola o
// prompt com as variáveis do contexto e chama a API do provedor escolhido.
// Busca a chave ativa do provedor de IA (BYOK) da empresa.
async function getAiKey(
  supabase: SupabaseClient,
  companyId: string,
  provider: string,
): Promise<string> {
  const { data } = await supabase
    .from("ai_provider_keys")
    .select("api_key, active")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .maybeSingle();
  const row = data as { api_key?: string; active?: boolean } | null;
  if (!row?.api_key) throw new Error(`Nenhuma chave de API cadastrada para ${provider}. Configure em Configurações → Chaves de API.`);
  if (row.active === false) throw new Error(`A chave de API do ${provider} está desativada.`);
  return row.api_key;
}

// Chamada genérica ao provedor de IA. Retorna o texto da resposta + tokens consumidos.
async function callAiProvider(
  provider: string,
  apiKey: string,
  model: string,
  system: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ text: string; tokens: number }> {
  if (provider === "openai") {
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: userPrompt });
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 }),
    });
    if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
    const data = await resp.json();
    return { text: String(data?.choices?.[0]?.message?.content ?? "").trim(), tokens: Number(data?.usage?.total_tokens ?? 0) };
  }

  if (provider === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: [{ role: "user", content: userPrompt }] }),
    });
    if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
    const data = await resp.json();
    const parts = Array.isArray(data?.content) ? data.content : [];
    const text = parts.filter((p: { type?: string }) => p.type === "text").map((p: { text?: string }) => p.text ?? "").join("").trim();
    return { text, tokens: Number(data?.usage?.input_tokens ?? 0) + Number(data?.usage?.output_tokens ?? 0) };
  }

  // google (gemini)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
    }),
  });
  if (!resp.ok) throw new Error(`Google HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  return { text, tokens: Number(data?.usageMetadata?.totalTokenCount ?? 0) };
}

// Monta a transcrição recente da conversa de WhatsApp do lead (filtrada pelo dono do
// tenant para não vazar entre empresas). Vazio quando não há telefone/mensagens.
async function buildConversationContext(
  supabase: SupabaseClient,
  companyId: string,
  phone: string,
): Promise<string> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  const { data: comp } = await supabase.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  const ownerId = (comp as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return "";
  const last8 = digits.slice(-8);
  const { data: msgs } = await supabase
    .from("whatsapp_messages")
    .select("body, type, from_me, created_at, phone")
    .eq("owner_id", ownerId)
    .ilike("phone", `%${last8}`)
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = ((msgs ?? []) as { body?: string; type?: string; from_me?: boolean }[]).reverse();
  const lines = rows.map((m) => {
    const who = m.from_me ? "Atendente" : "Cliente";
    const content = m.type === "audio" ? "[áudio]" : m.type === "image" ? "[imagem]" : m.type === "document" ? "[documento]" : (m.body ?? "");
    return content.trim() ? `${who}: ${content}` : "";
  }).filter(Boolean);
  return lines.join("\n");
}

// Ações de IA de texto: "Assistente de chat" e "Gere um texto com base na conversa".
async function runIaTextAction(
  supabase: SupabaseClient,
  companyId: string,
  action: IaAction,
  vars: Record<string, string>,
  conversa: string,
): Promise<{ text: string; tokens: number }> {
  const apiKey = await getAiKey(supabase, companyId, action.provider);
  const instr = interpolate(action.instructions ?? "", vars).trim();
  if (!instr && !conversa) throw new Error("Ação de IA sem instruções");
  const system = action.type === "assistente_chat"
    ? "Você é um assistente de atendimento ao cliente. Responda de forma cordial, objetiva e útil, em português, com base na conversa e nas instruções."
    : "Você gera texto conforme as instruções, em português, usando a conversa como contexto quando fornecida.";
  const userPrompt = [
    conversa ? `Conversa atual:\n${conversa}` : "",
    instr ? `Instruções:\n${instr}` : "",
  ].filter(Boolean).join("\n\n");
  const maxTokens = action.maxTokens && action.maxTokens > 0 ? action.maxTokens : 500;
  return await callAiProvider(action.provider, apiKey, action.model, system, userPrompt, maxTokens);
}

// Extrai o primeiro objeto JSON de um texto possivelmente "sujo" (markdown, prosa).
function parseFirstJson(raw: string): Record<string, unknown> | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
}

// Classificação (Intenção/Sentimento): a IA escolhe a opção que melhor corresponde à
// conversa e devolve o id dela (ou null se nenhuma). Usado para rotear ramificações.
async function runIaClassify(
  supabase: SupabaseClient,
  companyId: string,
  action: IaAction,
  vars: Record<string, string>,
  conversa: string,
  options: { id: string; nome: string; detalhes?: string; exemplos?: string }[],
): Promise<{ id: string | null; tokens: number }> {
  if (options.length === 0) return { id: null, tokens: 0 };
  const apiKey = await getAiKey(supabase, companyId, action.provider);
  const kind = action.type === "sentimento" ? "sentimento" : "intenção";
  const list = options.map((o) =>
    `- id="${o.id}" | nome="${o.nome}"${o.detalhes ? ` | quando: ${o.detalhes}` : ""}${(o as { exemplos?: string }).exemplos ? ` | exemplos: ${(o as { exemplos?: string }).exemplos}` : ""}`
  ).join("\n");
  const extra = interpolate(action.instructions ?? "", vars).trim();
  const system = `Você é um classificador de ${kind}. Analise a conversa e escolha a ÚNICA opção que melhor corresponde. Responda APENAS com JSON válido no formato {"id":"<id da opção escolhida>"}. Se nenhuma corresponder, responda {"id":"none"}.`;
  const userPrompt = [
    conversa ? `Conversa:\n${conversa}` : "Conversa: (sem mensagens)",
    `Opções de ${kind}:\n${list}`,
    extra ? `Considere também: ${extra}` : "",
  ].filter(Boolean).join("\n\n");
  const { text: raw, tokens } = await callAiProvider(action.provider, apiKey, action.model, system, userPrompt, 60);
  const parsed = parseFirstJson(raw);
  const id = parsed?.id ? String(parsed.id) : "none";
  if (id === "none" || !options.some((o) => o.id === id)) return { id: null, tokens };
  return { id, tokens };
}

// Extrator de parâmetros: a IA devolve um JSON com cada parâmetro pedido. Cada chave
// fica disponível para os blocos seguintes como {{<outputVar>.<nome>}}.
async function runIaExtractParams(
  supabase: SupabaseClient,
  companyId: string,
  action: IaAction,
  vars: Record<string, string>,
  conversa: string,
): Promise<{ obj: Record<string, string>; tokens: number }> {
  const params = (action.parametros ?? []).filter((p) => (p.nome ?? "").trim());
  if (params.length === 0) return { obj: {}, tokens: 0 };
  const apiKey = await getAiKey(supabase, companyId, action.provider);
  const list = params.map((p) => `- "${p.nome}" (tipo: ${p.tipo})${p.info ? `: ${p.info}` : ""}`).join("\n");
  const extra = interpolate(action.instructions ?? "", vars).trim();
  const system = `Você extrai informações estruturadas de uma conversa. Responda APENAS com JSON válido cujas chaves são EXATAMENTE os nomes dos parâmetros pedidos. Use null quando o valor não estiver presente na conversa. Não invente dados.`;
  const userPrompt = [
    conversa ? `Conversa:\n${conversa}` : "Conversa: (sem mensagens)",
    `Parâmetros a extrair:\n${list}`,
    extra ? `Considere também: ${extra}` : "",
  ].filter(Boolean).join("\n\n");
  const { text: raw, tokens } = await callAiProvider(action.provider, apiKey, action.model, system, userPrompt, 400);
  const parsed = parseFirstJson(raw);
  if (!parsed) return { obj: {}, tokens };
  // Mantém apenas as chaves pedidas (evita campos extras alucinados) e normaliza p/ string
  const out: Record<string, string> = {};
  for (const p of params) {
    const v = parsed[p.nome];
    out[p.nome] = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return { obj: out, tokens };
}

// Transcrição de áudio (Whisper / OpenAI). Busca os áudios da conversa do lead em
// whatsapp_messages (media_url) e transcreve. Requer chave da OpenAI cadastrada.
async function runIaTranscription(
  supabase: SupabaseClient,
  companyId: string,
  action: IaAction,
  phone: string,
): Promise<string> {
  const apiKey = await getAiKey(supabase, companyId, "openai");
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  const { data: comp } = await supabase.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  const ownerId = (comp as { owner_id?: string } | null)?.owner_id;
  if (!ownerId) return "";
  const last8 = digits.slice(-8);
  const { data: msgs } = await supabase
    .from("whatsapp_messages")
    .select("media_url, type, created_at, phone")
    .eq("owner_id", ownerId)
    .eq("type", "audio")
    .ilike("phone", `%${last8}`)
    .order("created_at", { ascending: false })
    .limit(action.audioSource === "ultimo" ? 1 : 8);
  const urls = ((msgs ?? []) as { media_url?: string }[]).map((m) => m.media_url).filter((u): u is string => !!u).reverse();
  if (urls.length === 0) return "";

  const language = action.language && action.language !== "auto" ? action.language : undefined;
  const texts: string[] = [];
  for (const url of urls) {
    try {
      const audioResp = await fetch(url);
      if (!audioResp.ok) continue;
      const blob = await audioResp.blob();
      const form = new FormData();
      form.append("file", blob, "audio.ogg");
      form.append("model", "whisper-1");
      if (language) form.append("language", language);
      const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: form,
      });
      if (!tr.ok) { console.error(`Whisper HTTP ${tr.status}: ${(await tr.text().catch(() => "")).slice(0, 200)}`); continue; }
      const data = await tr.json();
      const t = String(data?.text ?? "").trim();
      if (t) texts.push(t);
    } catch (err) {
      console.error("Transcrição de áudio falhou:", err);
    }
  }
  return texts.join("\n");
}

async function sendZapi(
  creds: ZapiCreds,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<void> {
  const url = `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/${endpoint}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (creds.clientToken) headers["Client-Token"] = creds.clientToken;

  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Z-API ${endpoint} HTTP ${resp.status}: ${detail.slice(0, 200)}`);
  }
}

// ─── API helpers ─────────────────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? "");
}

function parsePhoneNumber(raw: string, defaultCountry = "BR"): Record<string, string> {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { ddi: "", phone: "", nationalNumber: "", internacionalNumber: "" };

  let ddi = "";
  let nationalDigits = digits;

  if (defaultCountry === "BR") {
    if (digits.startsWith("55") && digits.length >= 12) {
      ddi = "55";
      nationalDigits = digits.slice(2);
    } else if (digits.length >= 10) {
      ddi = "55";
      nationalDigits = digits;
    }
  }

  const fullPhone = ddi ? `+${ddi}${nationalDigits}` : `+${nationalDigits}`;

  if (ddi === "55" && nationalDigits.length >= 10) {
    const areaCode = nationalDigits.slice(0, 2);
    const local = nationalDigits.slice(2);

    const formattedLocal = local.length === 9
      ? `${local.slice(0, 5)}-${local.slice(5)}`
      : local.length === 8
        ? `${local.slice(0, 4)}-${local.slice(4)}`
        : local;

    const intlLocal = local.length === 9
      ? `${local.slice(0, 5)} ${local.slice(5)}`
      : local.length === 8
        ? `${local.slice(0, 4)} ${local.slice(4)}`
        : local;

    return {
      ddi,
      phone: fullPhone,
      nationalNumber: `(${areaCode}) ${formattedLocal}`,
      internacionalNumber: `+${ddi} ${areaCode} ${intlLocal}`,
    };
  }

  return { ddi, phone: fullPhone, nationalNumber: nationalDigits, internacionalNumber: fullPhone };
}

async function buildVarContext(
  supabase: SupabaseClient,
  lead: Record<string, unknown> | null,
  payload: TriggerPayload,
): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {};
  if (lead) {
    for (const [k, v] of Object.entries(lead)) {
      ctx[`campo.${k}`] = String(v ?? "");
      ctx[`lead.${k}`] = String(v ?? "");
    }
    // Produto vinculado ao lead
    const productId = lead.product_id as string | null;
    if (productId) {
      const { data: prod } = await supabase
        .from("products")
        .select("name, sku, default_value")
        .eq("id", productId)
        .single();
      if (prod) {
        const p = prod as Record<string, unknown>;
        ctx["prod.name"]          = String(p.name          ?? "");
        ctx["prod.sku"]           = String(p.sku           ?? "");
        ctx["prod.default_value"] = String(p.default_value ?? "");
      }
    }
    // Campos adicionais (custom_field_values) — mesmos valores expostos sob os
    // três prefixos do seletor (lead / negócio / empresa).
    const cfv = (lead.custom_field_values ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(cfv)) {
      const sv = String(v ?? "");
      ctx[`campo_lead.${k}`]    = sv;
      ctx[`campo_neg.${k}`]     = sv;
      ctx[`campo_empresa.${k}`] = sv;
    }
  }
  ctx["gatilho.tipo"]       = payload.trigger_type;
  ctx["gatilho.lead_id"]    = payload.lead_id;
  ctx["gatilho.empresa_id"] = payload.company_id;
  // Campos do body do webhook disponíveis como {{gatilho.CAMPO}} (ex: {{gatilho.email}})
  const bodyFields = (payload.context.changed_fields ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(bodyFields)) {
    ctx[`gatilho.${k}`] = String(v ?? "");
  }
  // Saídas de datasources persistidas (ex: analise_telefone → phone-1.phone, phone-1.ddi…)
  const datasources = payload.context.datasources ?? {};
  for (const [dsName, fields] of Object.entries(datasources)) {
    for (const [k, v] of Object.entries(fields)) {
      ctx[`${dsName}.${k}`] = String(v ?? "");
    }
  }
  // Respostas do bloco "Entrada do usuário" → {{var_name}}
  const userInputs = payload.context.user_inputs ?? {};
  for (const [k, v] of Object.entries(userInputs)) {
    ctx[k] = String(v ?? "");
  }
  return ctx;
}

// Mantido por compatibilidade com chamadas síncronas internas
function buildApiVarContext(lead: Record<string, unknown> | null, payload: TriggerPayload): Record<string, string> {
  const ctx: Record<string, string> = {};
  if (lead) {
    for (const [k, v] of Object.entries(lead)) {
      ctx[`campo.${k}`] = String(v ?? "");
      ctx[`lead.${k}`] = String(v ?? "");
    }
  }
  ctx["gatilho.tipo"]       = payload.trigger_type;
  ctx["gatilho.lead_id"]    = payload.lead_id;
  ctx["gatilho.empresa_id"] = payload.company_id;
  return ctx;
}

// ─── Espera delay calculator ──────────────────────────────────────────────────

type EsperaDelay =
  | { type: "inline"; ms: number }
  | { type: "scheduled"; resumeAfter: Date }
  | { type: "immediate" };

function getEsperaDelay(espera: EsperaConfig): EsperaDelay {
  const now = new Date();

  switch (espera.type) {
    case "segundos": {
      const ms = (espera.amount ?? 5) * 1000;
      // ≤ 90 s: espera inline dentro da Edge Function
      if (ms <= 90_000) return { type: "inline", ms };
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + ms) };
    }

    case "minutos":
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 5) * 60_000) };

    case "horas":
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 1) * 3_600_000) };

    case "dias":
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 1) * 86_400_000) };

    case "intervalo_semana": {
      const days = espera.days ?? ["seg", "ter", "qua", "qui", "sex"];
      const startTime = espera.startTime ?? "00:00";
      const endTime = espera.endTime ?? "23:59";
      const tzName = (espera.timezone ?? "America/Sao_Paulo (BRT)").split(" ")[0];
      const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

      const isInWindow = (d: Date): boolean => {
        try {
          const inTz = new Date(d.toLocaleString("en-US", { timeZone: tzName }));
          const dayName = DAY_NAMES[inTz.getDay()];
          if (!days.includes(dayName)) return false;
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          const mins = inTz.getHours() * 60 + inTz.getMinutes();
          return mins >= sh * 60 + sm && mins <= eh * 60 + em;
        } catch { return false; }
      };

      if (isInWindow(now)) return { type: "immediate" };

      // Procura próxima janela válida (minuto a minuto, até 7 dias)
      const check = new Date(now.getTime() + 60_000);
      for (let i = 0; i < 7 * 24 * 60; i++) {
        if (isInWindow(check)) return { type: "scheduled", resumeAfter: new Date(check) };
        check.setTime(check.getTime() + 60_000);
      }
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + 3_600_000) };
    }

    case "dia_horario": {
      const tzName = (espera.dateTimezone ?? "America/Sao_Paulo (BRT)").split(" ")[0];
      const startTime = espera.dateStartTime ?? "00:00";

      if (espera.dateField) {
        try {
          const [h, m] = startTime.split(":").map(Number);
          // Tenta interpretar dateField como data ISO (YYYY-MM-DD ou ISO completo)
          const base = new Date(espera.dateField.trim());
          if (!isNaN(base.getTime())) {
            // Ajusta para meia-noite no fuso e aplica o horário configurado
            const dateStr = base.toLocaleDateString("en-CA", { timeZone: tzName }); // YYYY-MM-DD
            const target = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
            if (!isNaN(target.getTime()) && target > now) {
              return { type: "scheduled", resumeAfter: target };
            }
          }
        } catch { /* fall through */ }
      }
      // Data inválida ou no passado → executa imediatamente
      return { type: "immediate" };
    }

    case "usuario_parou":
      // Espera N segundos de inatividade — usa amount como duração
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 30) * 1000) };

    default:
      return { type: "immediate" };
  }
}

// ─── Condition node evaluation ────────────────────────────────────────────────

async function evaluateConditionNode(
  supabase: SupabaseClient,
  condNode: CanvasNode,
  payload: TriggerPayload,
): Promise<{ allPassed: boolean; passedCondIds: string[] }> {
  const conditions = condNode.conditionItems ?? [];

  if (!conditions.length) return { allPassed: true, passedCondIds: [] };

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", payload.lead_id)
    .single();

  if (!lead) return { allPassed: false, passedCondIds: [] };

  // Interpola os templates do config ({{gatilho.email}}, {{phone-1.phone}}, {{lead.x}}…)
  // ANTES de comparar — sem isso, condições como com_email/com_telefone comparavam o valor
  // do lead contra a string literal "{{gatilho.email}}" e davam sempre FALSE. As ações já
  // interpolam (executeAction); aqui alinhamos as condições ao mesmo comportamento.
  const vars = await buildVarContext(supabase, lead as Record<string, unknown>, payload);

  let allPassed = true;
  const passedCondIds: string[] = [];

  for (const cond of conditions) {
    const interpCfg: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cond.config ?? {})) {
      interpCfg[k] = typeof v === "string" ? interpolate(v, vars) : v;
    }
    const interpCond = { ...cond, config: interpCfg };
    const passed = await checkCondition(supabase, interpCond, lead as Record<string, unknown>, payload);
    if (passed) {
      passedCondIds.push(cond.id);
    } else {
      allPassed = false;
    }
  }

  return { allPassed, passedCondIds };
}

async function checkCondition(
  supabase: SupabaseClient,
  cond: ConditionItem,
  lead: Record<string, unknown>,
  payload: TriggerPayload,
): Promise<boolean> {
  const cfg = cond.config ?? {};
  const { conditionId: id, categoryId: catRaw } = cond;
  // neg_pipeline/neg_etapa pertencem à lógica "leads", mas flows antigos ou importados
  // (DataCrazy) podem tê-los salvo com categoryId "negocios". Sem normalizar, cairiam no
  // `default: return true` do bloco negócios → condição sempre TRUE → "Criar negócio" nunca roda.
  const cat = (id === "neg_pipeline" || id === "neg_etapa") ? "leads" : catRaw;

  // ── Negócios ──────────────────────────────────────────────────────────────
  if (cat === "negocios") {
    switch (id) {
      case "pos_atend": {
        const atend = cfg.atendente as string;
        if (!atend) return !!(lead.responsible || (lead.responsibles as string[] ?? []).length > 0);
        return lead.responsible === atend || ((lead.responsibles as string[]) ?? []).includes(atend);
      }
      case "sem_atend":
        return !lead.responsible && ((lead.responsibles as string[]) ?? []).length === 0;
      case "ganho":
        return lead.status === "won";
      case "perdido":
        return lead.status === "lost";
      case "pendente":
        return lead.status === "open";
      case "pos_produto": {
        const prodId = cfg.produto_id as string;
        const sku = cfg.sku as string;
        if (prodId) return lead.product_id === prodId;
        if (sku) {
          const { data: prod } = await supabase
            .from("products").select("id").eq("sku", sku).eq("company_id", payload.company_id).maybeSingle();
          return !!(prod && lead.product_id === (prod as Record<string, unknown>).id);
        }
        return !!lead.product_id;
      }
      case "com_id_externo": {
        const extId = cfg.id_externo as string;
        if (!extId) return !!lead.external_id;
        return lead.external_id === extId;
      }
      case "campo_adicional": {
        const campoId = cfg.campo_id as string;
        const tipo = cfg.tipo_comparacao as string;
        const valor = String(cfg.valor ?? "");
        const customVals = ((lead.custom_field_values ?? {}) as Record<string, unknown>);
        const fieldVal = String(customVals[campoId] ?? "");
        if (tipo === "contem") return fieldVal.toLowerCase().includes(valor.toLowerCase());
        return fieldVal === valor;
      }
      default: return true;
    }
  }

  // ── Leads ─────────────────────────────────────────────────────────────────
  if (cat === "leads") {
    switch (id) {
      case "existente": return true;
      case "neg_pipeline": {
        const pipelineId = cfg.pipeline_id as string;
        if (!pipelineId) return !!(lead.pipeline_id) && !!(lead.column_id);
        // Lead está no pipeline correto E já tem etapa atribuída (não foi criado agora pelo criar_lead)
        if (lead.pipeline_id === pipelineId) return !!(lead.column_id);
        // Search for any negócio of this contact in the specified pipeline
        const bodyFields = (payload.context.changed_fields ?? {}) as Record<string, unknown>;
        const searchEmail = (lead.email as string | null) ?? (bodyFields.email as string | null);
        const searchPhone = (lead.whatsapp as string | null) ?? (lead.phone as string | null)
          ?? (bodyFields.whatsapp as string | null) ?? (bodyFields.telefone as string | null);
        if (searchEmail) {
          const { data } = await supabase.from("leads").select("id")
            .eq("company_id", payload.company_id).eq("pipeline_id", pipelineId).eq("email", searchEmail).maybeSingle();
          if (data) return true;
        }
        if (searchPhone) {
          const { data } = await supabase.from("leads").select("id")
            .eq("company_id", payload.company_id).eq("pipeline_id", pipelineId).eq("whatsapp", searchPhone).maybeSingle();
          if (data) return true;
        }
        return false;
      }
      case "neg_etapa": {
        const etapaId = cfg.etapa_id as string;
        if (!etapaId) return !!(lead.column_id);
        if (lead.column_id === etapaId) return true;
        // Search for any negócio of this contact in the specified stage
        const bodyFields = (payload.context.changed_fields ?? {}) as Record<string, unknown>;
        const searchEmail = (lead.email as string | null) ?? (bodyFields.email as string | null);
        const searchPhone = (lead.whatsapp as string | null) ?? (lead.phone as string | null)
          ?? (bodyFields.whatsapp as string | null) ?? (bodyFields.telefone as string | null);
        if (searchEmail) {
          const { data } = await supabase.from("leads").select("id")
            .eq("company_id", payload.company_id).eq("column_id", etapaId).eq("email", searchEmail).maybeSingle();
          if (data) return true;
        }
        if (searchPhone) {
          const { data } = await supabase.from("leads").select("id")
            .eq("company_id", payload.company_id).eq("column_id", etapaId).eq("whatsapp", searchPhone).maybeSingle();
          if (data) return true;
        }
        return false;
      }
      case "com_email": {
        const email = cfg.email as string;
        if (!email) return !!(lead.email);
        // E-mail é case-insensitive por convenção; normaliza para evitar falso-negativo.
        return String(lead.email ?? "").trim().toLowerCase() === email.trim().toLowerCase();
      }
      case "com_nome": {
        const nome = cfg.nome as string;
        const leadName = String(lead.title ?? lead.name ?? "");
        if (!nome) return !!leadName;
        return leadName === nome;
      }
      case "com_telefone": {
        const tel = cfg.telefone as string;
        // O número pode estar em `phone` ou `whatsapp` (leads de webhook usam whatsapp).
        // Compara só os dígitos para tolerar formatação (+55 11 98877-4760 vs +5511988774760).
        const onlyDigits = (x: unknown) => String(x ?? "").replace(/\D/g, "");
        const leadPhones = [lead.phone, lead.whatsapp];
        if (!tel) return leadPhones.some((p) => onlyDigits(p) !== "");
        const t = onlyDigits(tel);
        return t !== "" && leadPhones.some((p) => onlyDigits(p) === t);
      }
      case "com_cpf": {
        const cpf = cfg.cpf as string;
        if (!cpf) return !!(lead.cpf);
        return lead.cpf === cpf;
      }
      case "pos_tag": {
        const tagIds = splitIds(cfg.tag_ids as string);
        const leadTags = (lead.tags as string[]) ?? [];
        if (!tagIds.length) return leadTags.length > 0;
        const { data: tagRows } = await supabase.from("tags").select("name").in("id", tagIds).eq("company_id", payload.company_id);
        const tagNames = (tagRows ?? []).map((r: { name: string }) => r.name);
        return tagNames.some((n: string) => leadTags.includes(n));
      }
      case "pos_atend": {
        const atend = cfg.atendente as string;
        if (!atend) return !!(lead.responsible || ((lead.responsibles as string[]) ?? []).length > 0);
        return lead.responsible === atend || ((lead.responsibles as string[]) ?? []).includes(atend);
      }
      case "campo_adicional": {
        const campoId = cfg.campo_id as string;
        const tipo = cfg.tipo_comparacao as string;
        const valor = String(cfg.valor ?? "");
        const customVals = ((lead.custom_field_values ?? {}) as Record<string, unknown>);
        const fieldVal = String(customVals[campoId] ?? "");
        if (tipo === "contem") return fieldVal.toLowerCase().includes(valor.toLowerCase());
        return fieldVal === valor;
      }
      default: return true;
    }
  }

  // ── Campos ────────────────────────────────────────────────────────────────
  if (cat === "campos") {
    const parametro = cfg.parametro as string;
    const valor = String(cfg.valor ?? "");
    let fieldVal = "";

    if (parametro === "lead.id") fieldVal = String(lead.id ?? "");
    else if (parametro === "lead.name") fieldVal = String(lead.title ?? lead.name ?? "");
    else if (parametro === "lead.email") fieldVal = String(lead.email ?? "");
    else if (parametro === "lead.phone") fieldVal = String(lead.phone ?? "");
    else if (parametro === "lead.cpf") fieldVal = String(lead.cpf ?? "");
    else if (parametro === "lead.source") fieldVal = String(lead.source ?? "");
    else if (parametro === "negocio.id") fieldVal = String(lead.id ?? "");
    else if (parametro === "negocio.name") fieldVal = String(lead.title ?? lead.name ?? "");
    else if (parametro === "negocio.value") fieldVal = String(lead.value ?? "");
    else if (parametro === "negocio.status") fieldVal = String(lead.status ?? "");
    else if (parametro?.startsWith("custom.")) {
      const customId = parametro.substring(7);
      const customVals = ((lead.custom_field_values ?? {}) as Record<string, unknown>);
      fieldVal = String(customVals[customId] ?? "");
    }

    switch (id) {
      case "campo_igual": return fieldVal === valor;
      case "campo_contem": return fieldVal.toLowerCase().includes(valor.toLowerCase());
      case "campo_pos_valor": return fieldVal !== "" && fieldVal !== "null" && fieldVal !== "undefined";
      case "campo_entre": {
        const num = parseFloat(fieldVal);
        const min = parseFloat(String(cfg.valor_min ?? ""));
        const max = parseFloat(String(cfg.valor_max ?? ""));
        if (isNaN(num) || isNaN(min) || isNaN(max)) return false;
        return num >= min && num <= max;
      }
      default: return true;
    }
  }

  // ── Tempo ─────────────────────────────────────────────────────────────────
  if (cat === "tempo" && id === "intervalo_tempo") {
    const timezone = String(cfg.timezone ?? "America/Sao_Paulo");
    const dias = String(cfg.dias ?? "seg,ter,qua,qui,sex").split(",").filter(Boolean);
    const horaInicio = String(cfg.hora_inicio ?? "00:00");
    const horaFim = String(cfg.hora_fim ?? "23:59");

    try {
      const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
      const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
      const dayName = DAY_NAMES[nowInTz.getDay()];
      if (!dias.includes(dayName)) return false;

      const [startH, startM] = horaInicio.split(":").map(Number);
      const [endH, endM] = horaFim.split(":").map(Number);
      const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch {
      return true;
    }
  }

  return true;
}

// ─── Action execution ─────────────────────────────────────────────────────────

async function executeAction(
  supabase: SupabaseClient,
  item: ActionItem,
  payload: TriggerPayload,
  currentAutomationId?: string,
) {
  const { lead_id, company_id } = payload;

  // Resolve variáveis {{...}} em todos os campos de config string
  const { data: leadDataForVars } = await supabase.from("leads").select("*").eq("id", lead_id).single();
  const vars = await buildVarContext(supabase, leadDataForVars as Record<string, unknown> | null, payload);
  const rawCfg = item.config ?? {};
  const cfg: Record<string, string | boolean | number> = {};
  for (const [k, v] of Object.entries(rawCfg)) {
    cfg[k] = typeof v === "string" ? interpolate(v, vars) : v;
  }

  switch (item.actionId) {
    case "mover_etapa":
    case "duplicar_negocio": {
      const columnId = cfg.etapa as string;
      if (!columnId) return;
      const update: Record<string, unknown> = { column_id: columnId };
      if (cfg.pipeline) update.pipeline_id = cfg.pipeline;
      await supabase.from("leads").update(update).eq("id", lead_id);
      break;
    }

    case "criar_lead": {
      // Se já existe lead, não cria novo (comportamento descrito no bloco)
      if (lead_id) return;

      const ctxLead = payload.context as Record<string, unknown>;
      const stagedLead = (ctxLead.staged_lead_data as Record<string, unknown>) ?? {};

      const { data: companyRowLead } = await supabase
        .from("companies")
        .select("owner_id")
        .eq("id", company_id)
        .single();
      const ownerIdLead = (companyRowLead as Record<string, unknown> | null)?.owner_id as string | null ?? null;

      // Calcula próximo deal_number da empresa
      const { data: maxRow } = await supabase
        .from("leads")
        .select("deal_number")
        .eq("owner_id", ownerIdLead ?? "")
        .order("deal_number", { ascending: false })
        .limit(1)
        .single();
      const nextDealNumber = ((maxRow as { deal_number?: number } | null)?.deal_number ?? 1000) + 1;

      const insertLead: Record<string, unknown> = {
        ...stagedLead,
        owner_id: ownerIdLead,
        company_id: company_id,
        status: "open",
        deal_number: nextDealNumber,
      };
      if (!insertLead.name) insertLead.name = "Novo lead (webhook)";
      {
        const o = normalizeOrigin(insertLead.origin);
        if (o) insertLead.origin = o; else delete insertLead.origin; // vazio: usa default do banco
      }

      // pipeline_id é NOT NULL — busca o primeiro pipeline da empresa se não fornecido
      // column_id é deixado null intencionalmente: criar_negocio (próximo bloco) atribuirá a etapa correta
      if (!insertLead.pipeline_id && ownerIdLead) {
        const { data: firstPipeline } = await supabase
          .from("pipelines")
          .select("id")
          .eq("owner_id", ownerIdLead)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
        if (firstPipeline) {
          insertLead.pipeline_id = (firstPipeline as { id: string }).id;
        }
      }

      console.log("[criar_lead] Inserindo:", JSON.stringify(insertLead));
      const { data: createdLead, error: createLeadErr } = await supabase
        .from("leads")
        .insert(insertLead)
        .select("id")
        .single();
      if (createLeadErr) {
        console.error("[criar_lead] Erro:", createLeadErr.message);
        throw new Error(createLeadErr.message);
      }
      if (createdLead) payload.lead_id = (createdLead as { id: string }).id;
      return;
    }

    case "criar_negocio": {
      const columnId = cfg.etapa as string;
      const pipelineId = cfg.pipeline as string;

      if (!lead_id) {
        // Nenhum lead ainda — cria usando dados preparados pelo bloco Campos (se houver)
        const ctx = payload.context as Record<string, unknown>;
        const staged = (ctx.staged_lead_data as Record<string, unknown>) ?? {};

        // Usa company.owner_id para que o lead apareça corretamente no CRM
        const { data: companyRow } = await supabase
          .from("companies")
          .select("owner_id")
          .eq("id", company_id)
          .single();
        const ownerIdForNew = (companyRow as Record<string, unknown> | null)?.owner_id as string | null ?? null;

        const insertData: Record<string, unknown> = {
          ...staged,
          owner_id: ownerIdForNew,
          company_id: company_id,
          status: "open",
        };
        if (columnId) insertData.column_id = columnId;
        if (pipelineId) insertData.pipeline_id = pipelineId;
        if (!insertData.name) insertData.name = "Novo lead (webhook)";
        {
          const o = normalizeOrigin(insertData.origin);
          if (o) insertData.origin = o; else delete insertData.origin; // vazio: usa default do banco
        }

        console.log("[criar_negocio] Tentando criar lead:", JSON.stringify(insertData));
        const { data: created, error: createErr } = await supabase
          .from("leads")
          .insert(insertData)
          .select("id")
          .single();
        if (createErr) {
          console.error("[criar_negocio] Erro ao criar lead:", createErr.message);
          throw new Error(createErr.message);
        }
        if (created) payload.lead_id = (created as { id: string }).id;
        return;
      }

      // Lead existente — move para a etapa/pipeline configurados
      if (!columnId && !pipelineId) return;
      const update: Record<string, unknown> = {};
      if (pipelineId) update.pipeline_id = pipelineId;
      let finalColumnId = columnId;
      if (!finalColumnId && pipelineId) {
        const { data: firstCol } = await supabase
          .from("pipeline_columns")
          .select("id")
          .eq("pipeline_id", pipelineId)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
        finalColumnId = (firstCol as { id: string } | null)?.id ?? "";
      }
      if (finalColumnId) update.column_id = finalColumnId;
      if (Object.keys(update).length > 0) {
        await supabase.from("leads").update(update).eq("id", lead_id);
      }
      break;
    }

    case "ganhar_negocio": {
      await supabase.from("leads").update({ status: "won" }).eq("id", lead_id);
      break;
    }

    case "restaurar_negocio": {
      await supabase.from("leads").update({ status: "open" }).eq("id", lead_id);
      break;
    }

    case "perder_negocio": {
      const update: Record<string, unknown> = { status: "lost" };
      if (cfg.motivo && cfg.motivo !== "outro") update.loss_reason_id = cfg.motivo;
      await supabase.from("leads").update(update).eq("id", lead_id);
      break;
    }

    case "transf_atend_neg":
    case "transf_atend_lead": {
      const atendente = cfg.atendente as string;
      if (!atendente) return;
      await supabase.from("leads").update({
        responsible: atendente,
        responsibles: [atendente],
      }).eq("id", lead_id);
      break;
    }

    case "remover_atend_neg":
    case "remover_atend_lead": {
      await supabase.from("leads").update({
        responsible: "",
        responsibles: [],
      }).eq("id", lead_id);
      break;
    }

    case "add_produto_neg": {
      const productId = cfg.produto as string;
      if (!productId) return;
      await supabase.from("leads").update({ product_id: productId }).eq("id", lead_id);
      break;
    }

    case "rem_produto_neg": {
      await supabase.from("leads").update({ product_id: null }).eq("id", lead_id);
      break;
    }

    case "remover_negocio": {
      await supabase.from("leads").delete().eq("id", lead_id);
      break;
    }

    case "adicionar_tags": {
      const tagIds = splitIds(cfg.tags as string);
      if (!tagIds.length) return;
      // Escopo por empresa: um id de tag de OUTRA empresa (resíduo de import/cópia)
      // jamais pode ser resolvido aqui — senão o nome vaza e vira tag "fantasma" no lead.
      const { data: tagRows } = await supabase.from("tags").select("name").in("id", tagIds).eq("company_id", company_id);
      const tagNames = (tagRows ?? []).map((r: { name: string }) => r.name);
      if (!tagNames.length) return;
      const { data: lead } = await supabase.from("leads").select("tags").eq("id", lead_id).single();
      const current = (lead?.tags as string[]) ?? [];
      const merged = [...new Set([...current, ...tagNames])];
      await supabase.from("leads").update({ tags: merged }).eq("id", lead_id);
      break;
    }

    case "remover_tags": {
      const tagIds = splitIds(cfg.tags as string);
      if (!tagIds.length) return;
      const { data: tagRows } = await supabase.from("tags").select("name").in("id", tagIds).eq("company_id", company_id);
      const tagNames = (tagRows ?? []).map((r: { name: string }) => r.name);
      if (!tagNames.length) return;
      const { data: lead } = await supabase.from("leads").select("tags").eq("id", lead_id).single();
      const current = (lead?.tags as string[]) ?? [];
      await supabase.from("leads").update({
        tags: current.filter((t) => !tagNames.includes(t)),
      }).eq("id", lead_id);
      break;
    }

    case "adicionar_listas": {
      const listId = cfg.lista as string;
      if (!listId) return;
      await supabase.from("list_leads")
        .upsert({ list_id: listId, lead_id }, { onConflict: "list_id,lead_id" });
      break;
    }

    case "remover_listas": {
      const listId = cfg.lista as string;
      if (!listId) return;
      await supabase.from("list_leads")
        .delete()
        .eq("list_id", listId)
        .eq("lead_id", lead_id);
      break;
    }

    case "comentario_lead": {
      const comentario = cfg.comentario as string;
      if (!comentario) return;
      const { data: lead } = await supabase.from("leads").select("owner_id").eq("id", lead_id).single();
      await supabase.from("activities").insert({
        owner_id: lead?.owner_id,
        company_id,
        lead_id,
        type: "note",
        description: comentario,
        date: new Date().toISOString(),
        user_name: "Automação",
      });
      break;
    }

    case "deletar_lead": {
      await supabase.from("leads").delete().eq("id", lead_id);
      break;
    }

    case "criar_atividade": {
      const titulo = cfg.titulo as string;
      if (!titulo) return;
      const { data: lead } = await supabase.from("leads").select("owner_id").eq("id", lead_id).single();
      const tipoMap: Record<string, string> = {
        reuniao: "meeting",
        ligacao: "call",
        email: "email",
        tarefa: "task",
        outro: "note",
      };
      await supabase.from("activities").insert({
        owner_id: lead?.owner_id,
        company_id,
        lead_id,
        type: tipoMap[cfg.tipo as string] ?? "note",
        title: titulo,
        description: (cfg.descricao as string) ?? "",
        date: new Date().toISOString(),
        user_name: "Automação",
      });
      break;
    }

    case "enviar_notificacao": {
      const mensagem = cfg.mensagem as string;
      if (!mensagem) return;
      await supabase.from("notifications").insert({
        company_id,
        lead_id,
        message: mensagem,
        read: false,
      });
      break;
    }

    case "iniciar_automacao": {
      const automacaoId = cfg.automacao_id as string;
      if (!automacaoId) return;
      const { data: targetAuto } = await supabase
        .from("automations")
        .select("id, name, flow")
        .eq("id", automacaoId)
        .eq("company_id", company_id)
        .eq("active", true)
        .single();
      if (targetAuto) {
        const subPayload: TriggerPayload = {
          ...payload,
          trigger_type: "outra_automacao",
          context: {
            ...payload.context,
            parent_automation_id: currentAutomationId,
          },
        };
        console.log(`Iniciando sub-automação: ${(targetAuto as AutomationRecord).name}`);
        await executeFlow(supabase, (targetAuto as AutomationRecord).flow, subPayload, (targetAuto as AutomationRecord).id);
      }
      break;
    }

    case "enviar_evento_meta": {
      const integrationId = cfg.integration_id as string | undefined;
      let metaQuery = supabase
        .from("meta_integrations")
        .select("pixel_id, access_token, active")
        .eq("company_id", company_id)
        .eq("active", true);
      if (integrationId) {
        metaQuery = metaQuery.eq("id", integrationId);
      }
      const { data: metaInt } = await metaQuery.maybeSingle();

      if (!metaInt) {
        console.log(`[enviar_evento_meta] Integração Meta Ads não encontrada ou inativa${integrationId ? ` (id: ${integrationId})` : ""} para empresa ${company_id}`);
        break;
      }

      const sha256Hex = async (text: string): Promise<string> => {
        if (!text) return "";
        const encoded = new TextEncoder().encode(text);
        const hash = await crypto.subtle.digest("SHA-256", encoded);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
      };

      const rawEmail = String(leadDataForVars?.email ?? "").toLowerCase().trim();
      const rawPhone = String((leadDataForVars?.whatsapp ?? leadDataForVars?.phone) ?? "").replace(/\D/g, "");

      const eventName = cfg.event_name === "custom"
        ? String(cfg.custom_event_name ?? "Lead").trim() || "Lead"
        : String(cfg.event_name ?? "Lead").trim() || "Lead";

      const userData: Record<string, string[]> = {};
      if (rawEmail) userData.em = [await sha256Hex(rawEmail)];
      if (rawPhone) userData.ph = [await sha256Hex(rawPhone)];

      const customData: Record<string, unknown> = { currency: "BRL" };
      const eventValueRaw = parseFloat(String(cfg.event_value ?? ""));
      if (!isNaN(eventValueRaw) && eventValueRaw > 0) customData.value = eventValueRaw;

      const metaBody = {
        data: [{
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: "crm",
          user_data: userData,
          custom_data: customData,
        }],
        access_token: (metaInt as Record<string, unknown>).access_token as string,
      };

      const pixelId = (metaInt as Record<string, unknown>).pixel_id as string;
      const metaResp = await fetch(
        `https://graph.facebook.com/v18.0/${pixelId}/events`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metaBody) },
      );
      const metaResult = await metaResp.json() as Record<string, unknown>;
      if (!metaResp.ok) {
        console.error(`[enviar_evento_meta] Erro na CAPI: ${JSON.stringify(metaResult)}`);
      } else {
        console.log(`[enviar_evento_meta] Evento "${eventName}" enviado para pixel ${pixelId}. events_received: ${metaResult.events_received}`);
      }
      break;
    }

    default:
      console.log(`Action "${item.actionId}" não tem handler — ignorada`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitIds(val: string | undefined): string[] {
  return (val ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
