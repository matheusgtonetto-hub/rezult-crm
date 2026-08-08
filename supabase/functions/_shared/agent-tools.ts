// Ferramentas do CRM que um agente pode chamar, além das ações
// SDS-específicas (qualificar_lead, agendar_reuniao_closer) que continuam
// vivendo em agent-sds-qualify/index.ts. Espelha os `id` de
// src/lib/agent-tools.ts (AGENT_TOOLS) -- os dois precisam ficar em
// sincronia manual (Deno edge functions não importam de src/).
//
// Só os tools com `implemented: true` no registro do frontend têm entrada
// aqui. Convenção: em ferramentas de lead/negócio, `lead_id` é OPCIONAL --
// quando omitido, a ferramenta age sobre o lead da conversa atual
// (ctx.leadId), do mesmo jeito que qualificar_lead/agendar_reuniao_closer já
// fazem hoje. Isso evita o modelo precisar "adivinhar" um UUID na maioria
// dos casos reais (agente sempre está numa conversa de UM lead específico).

// deno-lint-ignore no-explicit-any
type Db = any;

export type ToolCtx = {
  db: Db;
  companyId: string;
  ownerId: string;
  leadId: string;
};

export type ToolResult = { ok: boolean; data?: unknown; error?: string };

export type ToolSchema = {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

// ─── Helpers genéricos (listar/consultar) ───────────────────────────────────

// Tabelas com colunas sensíveis (credenciais) nunca podem ir com select("*")
// pro modelo de IA -- ele não deve ver token/client_token/access_token de
// jeito nenhum, mesmo que nunca repita isso pro lead. Lista explícita de
// colunas seguras por tabela; ausente = "*" (sem dado sensível conhecido).
const SAFE_COLUMNS: Record<string, string> = {
  whatsapp_connections: "id, name, phone, connected, active, provider, created_at",
};

async function genericList(
  db: Db, table: string, companyId: string,
  apply?: (q: Db) => Db, limit = 50, orderBy = "created_at",
): Promise<ToolResult> {
  let q = db.from(table).select(SAFE_COLUMNS[table] ?? "*").eq("company_id", companyId).order(orderBy, { ascending: false }).limit(limit);
  if (apply) q = apply(q);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function genericGet(db: Db, table: string, companyId: string, id: string): Promise<ToolResult> {
  const { data, error } = await db.from(table).select(SAFE_COLUMNS[table] ?? "*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "não encontrado" };
  return { ok: true, data };
}

function resolveLeadId(ctx: ToolCtx, input: Record<string, unknown>): string {
  return (input.lead_id as string | undefined) || ctx.leadId;
}

// ─── Leads ───────────────────────────────────────────────────────────────

async function listarLeads(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const limit = Number(input.limit) || 20;
  const offset = Number(input.offset) || 0;
  let q = ctx.db.from("leads").select("*").eq("company_id", ctx.companyId).order("created_at", { ascending: false });
  if (input.status) q = q.eq("status", input.status as string);
  if (input.responsible) q = q.eq("responsible", input.responsible as string);
  if (input.search) q = q.or(`name.ilike.%${input.search}%,email.ilike.%${input.search}%,whatsapp.ilike.%${input.search}%`);
  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function consultarLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  return genericGet(ctx.db, "leads", ctx.companyId, resolveLeadId(ctx, input));
}

async function criarLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const { data: maxRow } = await ctx.db.from("leads").select("deal_number").eq("owner_id", ctx.ownerId).order("deal_number", { ascending: false }).limit(1).maybeSingle();
  const nextDealNumber = ((maxRow?.deal_number as number | undefined) ?? 1000) + 1;
  const insertRow: Record<string, unknown> = {
    owner_id: ctx.ownerId, company_id: ctx.companyId, status: "open", deal_number: nextDealNumber,
    name: (input.name as string) || "Novo lead (agente)",
    email: input.email ?? null, whatsapp: input.whatsapp ?? null, company: input.company_name ?? null,
    origin: input.origin ?? null,
    tags: Array.isArray(input.tags) ? input.tags : [],
    address: input.address ?? null, city: input.city ?? null, state: input.state ?? null, zip_code: input.zip_code ?? null,
  };
  const { data, error } = await ctx.db.from("leads").insert(insertRow).select("id, deal_number, name").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function atualizarLeadInfo(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "email", "whatsapp", "company", "value", "priority", "origin"]) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "nenhum campo pra atualizar" };
  const { error } = await ctx.db.from("leads").update(patch).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function atualizarLeadEndereco(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const patch: Record<string, unknown> = {};
  for (const k of ["address", "addr_number", "complement", "neighborhood", "city", "state", "zip_code", "country"]) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "nenhum campo pra atualizar" };
  const { error } = await ctx.db.from("leads").update(patch).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function atualizarLeadContatos(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const patch: Record<string, unknown> = {};
  for (const k of ["email", "whatsapp", "phone_ddi"]) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "nenhum campo pra atualizar" };
  const { error } = await ctx.db.from("leads").update(patch).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function atualizarLeadNotas(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const { error } = await ctx.db.from("leads").update({ notes: input.notes ?? "" }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function definirCampoAdicionalLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const fieldKey = input.field_key as string;
  if (!fieldKey) return { ok: false, error: "field_key é obrigatório" };
  const { data: lead } = await ctx.db.from("leads").select("custom_field_values").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  const current = (lead?.custom_field_values as Record<string, unknown>) ?? {};
  const { error } = await ctx.db.from("leads").update({ custom_field_values: { ...current, [fieldKey]: input.value } }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function atualizarAtendenteLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const atendente = input.atendente_user_id as string;
  if (!atendente) return { ok: false, error: "atendente_user_id é obrigatório" };
  const { error } = await ctx.db.from("leads").update({ responsible: atendente, responsibles: [atendente] }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function listarNegociosDoLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const { data: lead } = await ctx.db.from("leads").select("person_id, contact_id").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  const personId = lead?.person_id ?? lead?.contact_id;
  if (!personId) return { ok: true, data: [] };
  const { data, error } = await ctx.db.from("leads").select("id, name, status, value, pipeline_id, column_id, deal_number").eq("company_id", ctx.companyId).or(`person_id.eq.${personId},contact_id.eq.${personId}`);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function tagOp(ctx: ToolCtx, input: Record<string, unknown>, add: boolean): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const tagName = input.tag as string;
  if (!tagName) return { ok: false, error: "tag é obrigatório" };
  const { data: lead } = await ctx.db.from("leads").select("tags").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  const current: string[] = (lead?.tags as string[]) ?? [];
  const next = add ? [...new Set([...current, tagName])] : current.filter((t) => t !== tagName);
  const { error } = await ctx.db.from("leads").update({ tags: next }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Negócios (mesma tabela leads) ─────────────────────────────────────────

async function criarNegocio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  if (!input.pipeline_id || !input.column_id) return { ok: false, error: "pipeline_id e column_id são obrigatórios" };
  const { data: maxRow } = await ctx.db.from("leads").select("deal_number").eq("owner_id", ctx.ownerId).order("deal_number", { ascending: false }).limit(1).maybeSingle();
  const nextDealNumber = ((maxRow?.deal_number as number | undefined) ?? 1000) + 1;
  const insertRow = {
    owner_id: ctx.ownerId, company_id: ctx.companyId, status: "open", deal_number: nextDealNumber,
    name: (input.name as string) || "Novo negócio (agente)",
    pipeline_id: input.pipeline_id, column_id: input.column_id,
    value: input.value ?? null, product_id: input.product_id ?? null,
  };
  const { data, error } = await ctx.db.from("leads").insert(insertRow).select("id, deal_number, name").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function listarNegociosPorEstagio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  if (!input.column_id) return { ok: false, error: "column_id é obrigatório" };
  return genericList(ctx.db, "leads", ctx.companyId, (q) => q.eq("column_id", input.column_id as string));
}

async function listarNegociosPorAtendente(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  if (!input.atendente_user_id) return { ok: false, error: "atendente_user_id é obrigatório" };
  return genericList(ctx.db, "leads", ctx.companyId, (q) => q.eq("responsible", input.atendente_user_id as string));
}

// Pipeline do negócio da conversa -- mesma convenção do lead_id opcional: o
// agente não tem como adivinhar UUID de pipeline, e exigir isso deixava as
// ferramentas de funil inutilizáveis na prática.
async function resolvePipelineId(ctx: ToolCtx, input: Record<string, unknown>): Promise<string | null> {
  if (typeof input.pipeline_id === "string" && input.pipeline_id) return input.pipeline_id;
  const { data: lead } = await ctx.db.from("leads").select("pipeline_id")
    .eq("id", resolveLeadId(ctx, input)).eq("company_id", ctx.companyId).maybeSingle();
  return (lead?.pipeline_id as string | undefined) ?? null;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function moverNegocioEstagio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const pipelineId = await resolvePipelineId(ctx, input);
  if (!pipelineId) return { ok: false, error: "negócio sem funil definido" };

  // Aceita o NOME da etapa ("Em andamento"), não só o UUID: o modelo enxerga
  // a conversa, não o banco. Antes exigia column_id em UUID, que ele não
  // tinha como descobrir -- então dizia ao lead que "não conseguia mover".
  const alvo = String(input.column_id ?? input.etapa ?? "").trim();
  if (!alvo) return { ok: false, error: "informe a etapa de destino (nome ou id)" };

  let columnId: string | null = UUID_RE.test(alvo) ? alvo : null;
  if (!columnId) {
    const { data: colunas } = await ctx.db.from("pipeline_columns")
      .select("id, title").eq("pipeline_id", pipelineId).eq("company_id", ctx.companyId);
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const achada = (colunas ?? []).find((c: { title: string }) => norm(c.title) === norm(alvo))
      ?? (colunas ?? []).find((c: { title: string }) => norm(c.title).includes(norm(alvo)));
    if (!achada) {
      const disponiveis = (colunas ?? []).map((c: { title: string }) => c.title).join(", ");
      return { ok: false, error: `etapa "${alvo}" não existe neste funil. Etapas disponíveis: ${disponiveis}` };
    }
    columnId = achada.id as string;
  }

  const { error } = await ctx.db.from("leads")
    .update({ column_id: columnId, pipeline_id: pipelineId })
    .eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function ganharNegocio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const { error } = await ctx.db.from("leads").update({ status: "won" }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function perderNegocio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const patch: Record<string, unknown> = { status: "lost" };
  if (input.loss_reason_id) patch.loss_reason_id = input.loss_reason_id;
  const { error } = await ctx.db.from("leads").update(patch).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function atualizarProdutoNegocio(ctx: ToolCtx, input: Record<string, unknown>, remove: boolean): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const { error } = await ctx.db.from("leads").update({ product_id: remove ? null : (input.product_id ?? null) }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function atualizarTotalNegocio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  if (input.value === undefined) return { ok: false, error: "value é obrigatório" };
  const { error } = await ctx.db.from("leads").update({ value: input.value }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Conversas ──────────────────────────────────────────────────────────

function phoneVariantsLocal(raw: string): string[] {
  let core = String(raw ?? "").replace(/\D/g, "");
  if (core.length > 11 && core.startsWith("55")) core = core.slice(2);
  if (core.length === 11 && core[2] === "9") core = core.slice(0, 2) + core.slice(3);
  if (core.length < 10) return [String(raw ?? "").replace(/\D/g, "")].filter(Boolean);
  const ddd = core.slice(0, 2);
  const eight = core.slice(-8);
  const with9 = `${ddd}9${eight}`;
  return [...new Set([core, with9, `55${core}`, `55${with9}`])];
}

async function listarConversas(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  return genericList(ctx.db, "whatsapp_conversations", ctx.companyId, (q) => q, Number(input.limit) || 20);
}

async function consultarConversaPorLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const { data: lead } = await ctx.db.from("leads").select("whatsapp").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  const phone = lead?.whatsapp as string | undefined;
  if (!phone) return { ok: false, error: "lead sem telefone" };
  // `.limit(1)` e não `.maybeSingle()`: o mesmo contato pode ter mais de uma
  // linha em whatsapp_conversations (formatos de telefone diferentes, ou
  // instância nova depois de reconectar o WhatsApp). Com maybeSingle isso
  // virava erro em vez de devolver a conversa.
  const { data, error } = await ctx.db.from("whatsapp_conversations").select("*").eq("company_id", ctx.companyId).in("phone", phoneVariantsLocal(phone)).order("last_msg_at", { ascending: false }).limit(1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data?.[0] ?? null };
}

async function buscarOuCriarConversaTelefone(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const phone = input.phone as string;
  if (!phone) return { ok: false, error: "phone é obrigatório" };
  // `.limit(1)`: com maybeSingle, um contato que já tivesse 2 conversas
  // devolvia erro -> `existing` ficava nulo -> esta tool criava MAIS uma
  // conversa duplicada em cima das que já existiam.
  const { data: existingRows } = await ctx.db.from("whatsapp_conversations").select("*").eq("owner_id", ctx.ownerId).in("phone", phoneVariantsLocal(phone)).order("last_msg_at", { ascending: false }).limit(1);
  const existing = existingRows?.[0];
  if (existing) return { ok: true, data: existing };
  const { data: created, error } = await ctx.db.from("whatsapp_conversations").insert({
    owner_id: ctx.ownerId, company_id: ctx.companyId, phone,
    name: (input.name as string) || phone, channel: "whatsapp", tags: [], read: true,
  }).select("*").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: created };
}

async function listarMensagensConversa(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const phone = input.phone as string;
  if (!phone) return { ok: false, error: "phone é obrigatório" };
  const { data, error } = await ctx.db.from("whatsapp_messages").select("from_me, body, type, created_at")
    .eq("company_id", ctx.companyId).in("phone", phoneVariantsLocal(phone))
    .order("created_at", { ascending: false }).limit(Number(input.limit) || 30);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ─── Registro: schemas (pro modelo) ────────────────────────────────────────

const str = { type: "string" };
const num = { type: "number" };

export const TOOL_SCHEMAS: ToolSchema[] = [
  { id: "listar_leads", name: "listar_leads", description: "Lista leads com filtros opcionais e paginação", input_schema: { type: "object", properties: { status: str, responsible: str, search: str, limit: num, offset: num } } },
  { id: "consultar_lead", name: "consultar_lead", description: "Recupera um lead específico pelo ID (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "criar_lead", name: "criar_lead", description: "Cria um novo lead no CRM", input_schema: { type: "object", properties: { name: str, email: str, whatsapp: str, company_name: str, origin: str, tags: { type: "array", items: str }, address: str, city: str, state: str, zip_code: str }, required: ["name"] } },
  { id: "atualizar_lead_info", name: "atualizar_lead_info", description: "Atualiza informações básicas de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, name: str, email: str, whatsapp: str, company: str, value: num, priority: str, origin: str } } },
  { id: "atualizar_lead_endereco", name: "atualizar_lead_endereco", description: "Atualiza o endereço de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, address: str, addr_number: str, complement: str, neighborhood: str, city: str, state: str, zip_code: str, country: str } } },
  { id: "atualizar_lead_contatos", name: "atualizar_lead_contatos", description: "Atualiza os contatos (email/whatsapp) de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, email: str, whatsapp: str, phone_ddi: str } } },
  { id: "atualizar_lead_notas", name: "atualizar_lead_notas", description: "Atualiza as notas de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, notes: str }, required: ["notes"] } },
  { id: "definir_campo_adicional_lead", name: "definir_campo_adicional_lead", description: "Define o valor de um campo adicional de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, field_key: str, value: str }, required: ["field_key", "value"] } },
  { id: "atualizar_atendente_lead", name: "atualizar_atendente_lead", description: "Atualiza o atendente responsável de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, atendente_user_id: str }, required: ["atendente_user_id"] } },
  { id: "listar_negocios_do_lead", name: "listar_negocios_do_lead", description: "Lista outros negócios do mesmo contato do lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "adicionar_tag_lead", name: "adicionar_tag_lead", description: "Adiciona uma tag a um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, tag: str }, required: ["tag"] } },
  { id: "remover_tag_lead", name: "remover_tag_lead", description: "Remove uma tag de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, tag: str }, required: ["tag"] } },

  { id: "criar_negocio", name: "criar_negocio", description: "Cria um novo negócio/oportunidade no pipeline do CRM", input_schema: { type: "object", properties: { name: str, pipeline_id: str, column_id: str, value: num, product_id: str }, required: ["pipeline_id", "column_id"] } },
  { id: "listar_negocios_por_estagio", name: "listar_negocios_por_estagio", description: "Lista negócios de um estágio específico do pipeline", input_schema: { type: "object", properties: { column_id: str }, required: ["column_id"] } },
  { id: "listar_negocios_por_atendente", name: "listar_negocios_por_atendente", description: "Lista negócios atribuídos a um atendente específico", input_schema: { type: "object", properties: { atendente_user_id: str }, required: ["atendente_user_id"] } },
  { id: "mover_negocio_estagio", name: "mover_negocio_estagio", description: "Move um negócio para outra etapa do funil (padrão: o lead da conversa atual). Informe o NOME da etapa em `etapa` — o funil do negócio é descoberto sozinho.", input_schema: { type: "object", properties: { lead_id: str, etapa: { type: "string", description: 'Nome da etapa de destino, ex: "Em andamento". Use listar_etapas_pipeline se não souber os nomes.' }, column_id: str, pipeline_id: str }, required: [] } },
  { id: "ganhar_negocio", name: "ganhar_negocio", description: "Marca um negócio como ganho (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "perder_negocio", name: "perder_negocio", description: "Marca um negócio como perdido (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, loss_reason_id: str } } },
  { id: "atualizar_atendente_negocio", name: "atualizar_atendente_negocio", description: "Atualiza o atendente responsável de um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, atendente_user_id: str }, required: ["atendente_user_id"] } },
  { id: "adicionar_produto_negocio", name: "adicionar_produto_negocio", description: "Associa um produto a um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, product_id: str }, required: ["product_id"] } },
  { id: "remover_produto_negocio", name: "remover_produto_negocio", description: "Remove o produto de um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "atualizar_total_negocio", name: "atualizar_total_negocio", description: "Atualiza o valor total de um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, value: num }, required: ["value"] } },

  { id: "listar_conversas", name: "listar_conversas", description: "Lista conversas recentes da empresa", input_schema: { type: "object", properties: { limit: num } } },
  { id: "consultar_conversa_por_lead", name: "consultar_conversa_por_lead", description: "Recupera a conversa de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "buscar_ou_criar_conversa_telefone", name: "buscar_ou_criar_conversa_telefone", description: "Busca uma conversa pelo telefone ou cria uma nova", input_schema: { type: "object", properties: { phone: str, name: str }, required: ["phone"] } },
  { id: "listar_mensagens_conversa", name: "listar_mensagens_conversa", description: "Lista as mensagens mais recentes de uma conversa por telefone", input_schema: { type: "object", properties: { phone: str, limit: num }, required: ["phone"] } },
];

// Entidades de catálogo com padrão idêntico listar/consultar — evita repetir
// 20 funções quase iguais. `table` é o nome real no banco.
const CATALOG_ENTITIES: { entity: string; table: string; listId: string; getId: string; label: string; orderBy?: string }[] = [
  { entity: "produtos",      table: "products",            listId: "listar_produtos",           getId: "consultar_produto",           label: "produto" },
  { entity: "tags",          table: "tags",                 listId: "listar_tags",               getId: "consultar_tag",               label: "tag" },
  { entity: "listas",        table: "lists",                listId: "listar_listas",             getId: "consultar_lista",             label: "lista" },
  // custom_field_items não tem created_at -- ordena por position.
  { entity: "campos",        table: "custom_field_items",   listId: "listar_campos_adicionais",  getId: "consultar_campo_adicional",   label: "campo adicional", orderBy: "position" },
  { entity: "pipelines",     table: "pipelines",            listId: "listar_pipelines",           getId: "",                            label: "pipeline" },
  { entity: "motivos_perda", table: "loss_reasons",         listId: "listar_motivos_perda",       getId: "consultar_motivo_perda",      label: "motivo de perda" },
  { entity: "horarios",      table: "work_schedules",       listId: "listar_horarios_trabalho",   getId: "consultar_horario_trabalho",  label: "horário de trabalho" },
  { entity: "departamentos", table: "departments",          listId: "listar_departamentos",       getId: "consultar_departamento",      label: "departamento" },
  { entity: "conexoes",      table: "whatsapp_connections", listId: "listar_conexoes",             getId: "consultar_conexao",           label: "conexão" },
];

for (const c of CATALOG_ENTITIES) {
  TOOL_SCHEMAS.push({ id: c.listId, name: c.listId, description: `Lista ${c.label}s disponíveis`, input_schema: { type: "object", properties: { limit: num } } });
  if (c.getId) TOOL_SCHEMAS.push({ id: c.getId, name: c.getId, description: `Recupera um(a) ${c.label} específico(a) pelo ID`, input_schema: { type: "object", properties: { id: str }, required: ["id"] } });
}
TOOL_SCHEMAS.push(
  { id: "listar_grupos_pipeline", name: "listar_grupos_pipeline", description: "Lista os grupos de pipeline disponíveis", input_schema: { type: "object", properties: {} } },
  { id: "listar_etapas_pipeline", name: "listar_etapas_pipeline", description: "Lista as etapas do funil. Sem parâmetros, usa o funil do negócio da conversa atual.", input_schema: { type: "object", properties: { pipeline_id: str }, required: [] } },
  { id: "listar_atendentes", name: "listar_atendentes", description: "Lista os atendentes (membros) da empresa", input_schema: { type: "object", properties: {} } },
  { id: "consultar_atendente", name: "consultar_atendente", description: "Recupera um atendente específico pelo ID", input_schema: { type: "object", properties: { user_id: str }, required: ["user_id"] } },
);

// ─── Dispatcher ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
export async function executeRegistryTool(ctx: ToolCtx, toolId: string, input: Record<string, unknown>): Promise<ToolResult> {
  switch (toolId) {
    case "listar_leads": return listarLeads(ctx, input);
    case "consultar_lead": return consultarLead(ctx, input);
    case "criar_lead": return criarLead(ctx, input);
    case "atualizar_lead_info": return atualizarLeadInfo(ctx, input);
    case "atualizar_lead_endereco": return atualizarLeadEndereco(ctx, input);
    case "atualizar_lead_contatos": return atualizarLeadContatos(ctx, input);
    case "atualizar_lead_notas": return atualizarLeadNotas(ctx, input);
    case "definir_campo_adicional_lead": return definirCampoAdicionalLead(ctx, input);
    case "atualizar_atendente_lead": return atualizarAtendenteLead(ctx, input);
    case "listar_negocios_do_lead": return listarNegociosDoLead(ctx, input);
    case "adicionar_tag_lead": return tagOp(ctx, input, true);
    case "remover_tag_lead": return tagOp(ctx, input, false);

    case "criar_negocio": return criarNegocio(ctx, input);
    case "listar_negocios_por_estagio": return listarNegociosPorEstagio(ctx, input);
    case "listar_negocios_por_atendente": return listarNegociosPorAtendente(ctx, input);
    case "mover_negocio_estagio": return moverNegocioEstagio(ctx, input);
    case "ganhar_negocio": return ganharNegocio(ctx, input);
    case "perder_negocio": return perderNegocio(ctx, input);
    case "atualizar_atendente_negocio": return atualizarAtendenteLead(ctx, input);
    case "adicionar_produto_negocio": return atualizarProdutoNegocio(ctx, input, false);
    case "remover_produto_negocio": return atualizarProdutoNegocio(ctx, input, true);
    case "atualizar_total_negocio": return atualizarTotalNegocio(ctx, input);

    case "listar_conversas": return listarConversas(ctx, input);
    case "consultar_conversa_por_lead": return consultarConversaPorLead(ctx, input);
    case "buscar_ou_criar_conversa_telefone": return buscarOuCriarConversaTelefone(ctx, input);
    case "listar_mensagens_conversa": return listarMensagensConversa(ctx, input);

    case "listar_grupos_pipeline": return genericList(ctx.db, "pipeline_groups", ctx.companyId);
    case "listar_etapas_pipeline": {
      // pipeline_id opcional: cai no funil do negócio da conversa. Exigir o
      // UUID travava o agente -- ele não tem de onde tirar esse id.
      const pid = await resolvePipelineId(ctx, input);
      if (!pid) return { ok: false, error: "negócio sem funil definido" };
      return genericList(ctx.db, "pipeline_columns", ctx.companyId, (q) => q.eq("pipeline_id", pid), 50, "position");
    }
    case "listar_atendentes": {
      const { data, error } = await ctx.db.rpc("get_company_members", { p_company_id: ctx.companyId });
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "consultar_atendente": {
      const { data, error } = await ctx.db.rpc("get_company_members", { p_company_id: ctx.companyId });
      if (error) return { ok: false, error: error.message };
      const found = (data ?? []).find((m: { user_id: string }) => m.user_id === input.user_id);
      return found ? { ok: true, data: found } : { ok: false, error: "não encontrado" };
    }
  }

  const catalog = CATALOG_ENTITIES.find((c) => c.listId === toolId || c.getId === toolId);
  if (catalog) {
    if (toolId === catalog.listId) return genericList(ctx.db, catalog.table, ctx.companyId, undefined, Number(input.limit) || 50, catalog.orderBy ?? "created_at");
    return genericGet(ctx.db, catalog.table, ctx.companyId, input.id as string);
  }

  return { ok: false, error: `ferramenta "${toolId}" ainda não implementada` };
}
