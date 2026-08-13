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
import { variantesDeTelefone } from "./telefone.ts";
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

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const norm = (s: string) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Traduz o nome que o modelo escreveu ("Consulta avulsa") para o uuid da
// linha. É o padrão de TODA ferramenta que precisa de id: o modelo enxerga a
// conversa, não o banco, e não tem de onde tirar um uuid. Quando não acha,
// devolve no próprio erro a lista do que existe -- é o que faz o modelo
// corrigir na mesma resposta em vez de dizer ao lead que "não conseguiu".
//
// Sem isso, cada ferramenta dessas só funcionava se o usuário tivesse marcado
// também a ferramenta de listar correspondente, e ninguém tinha como saber
// disso pela tela.
async function resolverPorNome(
  ctx: ToolCtx, tabela: string, coluna: string, valor: unknown,
  filtro?: (q: Db) => Db,
): Promise<{ id: string; nome: string } | { erro: string }> {
  const bruto = String(valor ?? "").trim();
  let q = ctx.db.from(tabela).select(`id, ${coluna}`).eq("company_id", ctx.companyId);
  if (filtro) q = filtro(q);
  const { data } = await q;
  const linhas = ((data ?? []) as Record<string, string>[]);
  const opcoes = linhas.map((l) => l[coluna]).filter(Boolean);

  if (!bruto) return { erro: `informe qual. Opções: ${opcoes.join(", ") || "nenhuma"}` };
  if (UUID_RE.test(bruto)) {
    const porId = linhas.find((l) => l.id === bruto);
    if (porId) return { id: porId.id, nome: porId[coluna] };
  }
  const achado = linhas.find((l) => norm(l[coluna]) === norm(bruto))
    ?? linhas.find((l) => norm(l[coluna]).includes(norm(bruto)));
  if (achado) return { id: achado.id, nome: achado[coluna] };
  return { erro: `"${bruto}" não existe aqui. Opções: ${opcoes.join(", ") || "nenhuma"}` };
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

// ACRESCENTA à nota, nunca sobrescreve. A versão anterior gravava
// `notes: input.notes` direto: bastava o agente anotar uma frase pra apagar
// tudo que o vendedor tinha escrito no card, sem aviso e sem como recuperar.
// A anotação do agente entra datada e separada, pra quem lê depois saber
// quem escreveu o quê.
async function atualizarLeadNotas(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const texto = String(input.notes ?? "").trim();
  if (!texto) return { ok: false, error: "notes é obrigatório" };
  const { data: lead } = await ctx.db.from("leads").select("notes").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  const atual = String(lead?.notes ?? "").trim();
  const carimbo = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const nova = `[${carimbo} · agente] ${texto}`;
  const { error } = await ctx.db.from("leads")
    .update({ notes: atual ? `${atual}\n\n${nova}` : nova })
    .eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// As chaves de custom_field_values são os UUIDs de custom_field_items, e o
// modelo não tem como adivinhar UUID: ele mandava o nome do campo
// ("profissao"). Como a coluna é jsonb, o banco aceitava a chave inventada
// sem erro, a ferramenta devolvia ok e o card do lead continuava vazio.
// Falha silenciosa completa. Agora aceita o nome OU o id, valida contra os
// campos que existem e devolve a lista quando não acha.
async function definirCampoAdicionalLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const campo = await resolverPorNome(ctx, "custom_field_items", "label", input.field_key ?? input.campo);
  if ("erro" in campo) return { ok: false, error: `campo adicional: ${campo.erro}` };

  const { data: lead } = await ctx.db.from("leads").select("custom_field_values").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  const current = (lead?.custom_field_values as Record<string, unknown>) ?? {};
  const { error } = await ctx.db.from("leads").update({ custom_field_values: { ...current, [campo.id]: input.value } }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { campo: campo.nome } };
}

// `leads.responsible` e `leads.responsibles` guardam NOME de exibição, não
// uuid (conferido na base real: milhares de linhas, nenhum uuid). Gravar o
// user_id aqui deixava o card com um uuid no lugar do nome e o filtro por
// responsável parava de encontrar o lead. Aceita nome ou uuid e sempre grava
// o nome; se não achar ninguém, devolve a lista de quem existe pro modelo
// corrigir em vez de inventar.
async function resolverNomeAtendente(ctx: ToolCtx, valor: string): Promise<{ nome: string | null; disponiveis: string[] }> {
  const { data: membros } = await ctx.db.from("company_members").select("user_id").eq("company_id", ctx.companyId);
  const ids = ((membros ?? []) as { user_id: string }[]).map((m) => m.user_id);
  if (ctx.ownerId && !ids.includes(ctx.ownerId)) ids.push(ctx.ownerId);
  if (!ids.length) return { nome: null, disponiveis: [] };

  const { data: perfis } = await ctx.db.from("profiles").select("id, full_name, email").in("id", ids);
  const pessoas = ((perfis ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => ({ id: p.id, nome: String(p.full_name || p.email || "").trim(), email: String(p.email ?? "").trim() }))
    .filter((p) => p.nome);

  const alvo = valor.trim().toLowerCase();
  const achado = pessoas.find((p) =>
    p.id.toLowerCase() === alvo ||
    p.nome.toLowerCase() === alvo ||
    p.email.toLowerCase() === alvo);
  return { nome: achado?.nome ?? null, disponiveis: pessoas.map((p) => p.nome) };
}

async function atualizarAtendenteLead(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const atendente = String(input.atendente_user_id ?? input.atendente ?? "").trim();
  if (!atendente) return { ok: false, error: "informe o atendente (nome ou id)" };
  const { nome, disponiveis } = await resolverNomeAtendente(ctx, atendente);
  if (!nome) {
    return { ok: false, error: `"${atendente}" não é um atendente desta empresa. Atendentes disponíveis: ${disponiveis.join(", ") || "nenhum"}` };
  }
  const { error } = await ctx.db.from("leads").update({ responsible: nome, responsibles: [nome] }).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { responsavel: nome } };
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

// Tags de sistema aceitas pelo trigger sanitize_lead_tags mesmo sem linha em
// public.tags. Tem que espelhar a lista de lá.
const TAGS_SISTEMA = ["Agente", "SDS: Qualificado", "SDS: Não qualificado"];

async function tagOp(ctx: ToolCtx, input: Record<string, unknown>, add: boolean): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const tagName = String(input.tag ?? "").trim();
  if (!tagName) return { ok: false, error: "tag é obrigatório" };
  const { data: lead } = await ctx.db.from("leads").select("tags, owner_id").eq("id", id).eq("company_id", ctx.companyId).maybeSingle();
  const current: string[] = (lead?.tags as string[]) ?? [];

  // Falha silenciosa que isso corrige: o trigger sanitize_lead_tags APAGA
  // qualquer tag que não exista em public.tags, mas o update volta sem erro.
  // O agente dizia "pronto, já marquei" e o card continuava igual. Agora a
  // tag inexistente vira erro com a lista das que existem, e o modelo escolhe
  // uma de verdade em vez de inventar de novo.
  if (add) {
    const permitidaPorPrefixo = TAGS_SISTEMA.includes(tagName) || tagName.startsWith("Agente: ");
    if (!permitidaPorPrefixo) {
      const { data: existentes } = await ctx.db.from("tags").select("name").eq("owner_id", lead?.owner_id ?? ctx.ownerId);
      const nomes = ((existentes ?? []) as { name: string }[]).map((t) => t.name);
      const igual = nomes.find((n) => n.toLowerCase() === tagName.toLowerCase());
      if (!igual) {
        return { ok: false, error: `a tag "${tagName}" não existe neste CRM e não seria salva. Tags disponíveis: ${nomes.join(", ") || "nenhuma"}` };
      }
      // Usa o nome exato cadastrado: diferença de maiúscula/acento faria o
      // trigger recusar do mesmo jeito.
      input.tag = igual;
    }
  }

  const alvo = String(input.tag ?? tagName).trim();
  const next = add ? [...new Set([...current, alvo])] : current.filter((t) => t !== alvo);
  const { data: atualizado, error } = await ctx.db.from("leads")
    .update({ tags: next }).eq("id", id).eq("company_id", ctx.companyId)
    .select("tags").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { tags: (atualizado?.tags as string[]) ?? next } };
}

// ─── Negócios (mesma tabela leads) ─────────────────────────────────────────

// Exigia pipeline_id E column_id em uuid, dois valores que o modelo não tinha
// de onde tirar: na prática a ferramenta só funcionava se o usuário tivesse
// marcado também listar_pipelines e listar_etapas_pipeline, e ainda assim
// custava duas rodadas de descoberta antes de criar. Agora funil e etapa
// aceitam nome, o funil cai no do negócio da conversa e a etapa cai na
// primeira do funil.
async function criarNegocio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  let pipelineId: string | null = null;
  if (input.pipeline_id ?? input.funil) {
    const funil = await resolverPorNome(ctx, "pipelines", "name", input.pipeline_id ?? input.funil);
    if ("erro" in funil) return { ok: false, error: `funil: ${funil.erro}` };
    pipelineId = funil.id;
  } else {
    pipelineId = await resolvePipelineId(ctx, input);
  }
  if (!pipelineId) return { ok: false, error: "não achei em qual funil criar. Informe o nome do funil." };

  let columnId: string;
  if (input.column_id ?? input.etapa) {
    const etapa = await resolverEtapa(ctx, pipelineId, input.column_id ?? input.etapa);
    if ("erro" in etapa) return { ok: false, error: `etapa: ${etapa.erro}` };
    columnId = etapa.id;
  } else {
    const { data: primeira } = await ctx.db.from("pipeline_columns")
      .select("id").eq("pipeline_id", pipelineId).eq("company_id", ctx.companyId)
      .order("position", { ascending: true }).limit(1);
    const inicial = (primeira ?? [])[0]?.id as string | undefined;
    if (!inicial) return { ok: false, error: "esse funil não tem nenhuma etapa" };
    columnId = inicial;
  }

  let productId: string | null = null;
  if (input.product_id ?? input.produto) {
    const produto = await resolverPorNome(ctx, "products", "name", input.product_id ?? input.produto);
    if ("erro" in produto) return { ok: false, error: `produto: ${produto.erro}` };
    productId = produto.id;
  }

  const { data: maxRow } = await ctx.db.from("leads").select("deal_number").eq("owner_id", ctx.ownerId).order("deal_number", { ascending: false }).limit(1).maybeSingle();
  const nextDealNumber = ((maxRow?.deal_number as number | undefined) ?? 1000) + 1;
  const insertRow = {
    owner_id: ctx.ownerId, company_id: ctx.companyId, status: "open", deal_number: nextDealNumber,
    name: (input.name as string) || "Novo negócio (agente)",
    pipeline_id: pipelineId, column_id: columnId,
    value: input.value ?? null, product_id: productId,
  };
  const { data, error } = await ctx.db.from("leads").insert(insertRow).select("id, deal_number, name").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function listarNegociosPorEstagio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const pipelineId = await resolvePipelineId(ctx, input);
  if (!pipelineId) return { ok: false, error: "negócio sem funil definido" };
  const etapa = await resolverEtapa(ctx, pipelineId, input.column_id ?? input.etapa);
  if ("erro" in etapa) return { ok: false, error: `etapa: ${etapa.erro}` };
  return genericList(ctx.db, "leads", ctx.companyId, (q) => q.eq("column_id", etapa.id));
}

// Filtrava `responsible` pelo uuid do atendente, mas a coluna guarda NOME de
// exibição (2170 leads na base, nenhum uuid). Resultado: a ferramenta sempre
// devolvia lista vazia, e o agente concluía que o vendedor não tinha negócio
// nenhum. Resolve nome ou uuid antes de filtrar.
async function listarNegociosPorAtendente(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const bruto = String(input.atendente_user_id ?? input.atendente ?? "").trim();
  if (!bruto) return { ok: false, error: "informe o atendente (nome ou id)" };
  const { nome, disponiveis } = await resolverNomeAtendente(ctx, bruto);
  if (!nome) {
    return { ok: false, error: `"${bruto}" não é um atendente desta empresa. Atendentes disponíveis: ${disponiveis.join(", ") || "nenhum"}` };
  }
  return genericList(ctx.db, "leads", ctx.companyId, (q) => q.eq("responsible", nome));
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

// Resolve a etapa pelo NOME dentro de um funil. O modelo enxerga a conversa,
// não o banco: exigir column_id em uuid deixava ele dizendo ao lead que "não
// conseguia mover".
function resolverEtapa(ctx: ToolCtx, pipelineId: string, valor: unknown) {
  return resolverPorNome(ctx, "pipeline_columns", "title", valor, (q) => q.eq("pipeline_id", pipelineId));
}

async function moverNegocioEstagio(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  const pipelineId = await resolvePipelineId(ctx, input);
  if (!pipelineId) return { ok: false, error: "negócio sem funil definido" };

  const etapa = await resolverEtapa(ctx, pipelineId, input.column_id ?? input.etapa);
  if ("erro" in etapa) return { ok: false, error: `etapa: ${etapa.erro}` };

  const { error } = await ctx.db.from("leads")
    .update({ column_id: etapa.id, pipeline_id: pipelineId })
    .eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { etapa: etapa.nome } };
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
  // Motivo continua opcional, mas agora vale pelo nome. Só o uuid, ninguém
  // conseguia informar, então na prática todo negócio perdido ia sem motivo.
  const informado = input.loss_reason_id ?? input.motivo;
  if (informado) {
    const motivo = await resolverPorNome(ctx, "loss_reasons", "name", informado);
    if ("erro" in motivo) return { ok: false, error: `motivo de perda: ${motivo.erro}` };
    patch.loss_reason_id = motivo.id;
  }
  const { error } = await ctx.db.from("leads").update(patch).eq("id", id).eq("company_id", ctx.companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function atualizarProdutoNegocio(ctx: ToolCtx, input: Record<string, unknown>, remove: boolean): Promise<ToolResult> {
  const id = resolveLeadId(ctx, input);
  let productId: string | null = null;
  if (!remove) {
    const produto = await resolverPorNome(ctx, "products", "name", input.product_id ?? input.produto);
    if ("erro" in produto) return { ok: false, error: `produto: ${produto.erro}` };
    productId = produto.id;
  }
  const { error } = await ctx.db.from("leads").update({ product_id: productId }).eq("id", id).eq("company_id", ctx.companyId);
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
  const { data, error } = await ctx.db.from("whatsapp_conversations").select("*").eq("company_id", ctx.companyId).in("phone", variantesDeTelefone(phone)).order("last_msg_at", { ascending: false }).limit(1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data?.[0] ?? null };
}

async function buscarOuCriarConversaTelefone(ctx: ToolCtx, input: Record<string, unknown>): Promise<ToolResult> {
  const phone = input.phone as string;
  if (!phone) return { ok: false, error: "phone é obrigatório" };
  // `.limit(1)`: com maybeSingle, um contato que já tivesse 2 conversas
  // devolvia erro -> `existing` ficava nulo -> esta tool criava MAIS uma
  // conversa duplicada em cima das que já existiam.
  const { data: existingRows } = await ctx.db.from("whatsapp_conversations").select("*").eq("owner_id", ctx.ownerId).in("phone", variantesDeTelefone(phone)).order("last_msg_at", { ascending: false }).limit(1);
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
    .eq("company_id", ctx.companyId).in("phone", variantesDeTelefone(phone))
    .order("created_at", { ascending: false }).limit(Number(input.limit) || 30);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ─── Registro: schemas (pro modelo) ────────────────────────────────────────

const str = { type: "string" };
const num = { type: "number" };

// Regra de ouro dos schemas: NENHUMA ferramenta pode exigir um uuid que o
// modelo não tenha como descobrir sozinho. Tudo que aponta para outra tabela
// (etapa, funil, produto, atendente, campo, motivo) aceita o NOME, e a
// ferramenta devolve a lista do que existe quando não acha. Sem isso, cada
// uma dessas só funcionava se o usuário tivesse marcado junto a ferramenta de
// listar correspondente -- dependência invisível na tela.
const nomeOuId = (oQue: string) => ({ type: "string", description: `${oQue}. Pode ser o nome exato; se errar, a resposta traz as opções válidas.` });

export const TOOL_SCHEMAS: ToolSchema[] = [
  { id: "listar_leads", name: "listar_leads", description: "Lista leads com filtros opcionais e paginação", input_schema: { type: "object", properties: { status: str, responsible: str, search: str, limit: num, offset: num } } },
  { id: "consultar_lead", name: "consultar_lead", description: "Recupera um lead específico pelo ID (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "criar_lead", name: "criar_lead", description: "Cria um novo lead no CRM", input_schema: { type: "object", properties: { name: str, email: str, whatsapp: str, company_name: str, origin: str, tags: { type: "array", items: str }, address: str, city: str, state: str, zip_code: str }, required: ["name"] } },
  { id: "atualizar_lead_info", name: "atualizar_lead_info", description: "Atualiza informações básicas de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, name: str, email: str, whatsapp: str, company: str, value: num, priority: str, origin: str } } },
  { id: "atualizar_lead_endereco", name: "atualizar_lead_endereco", description: "Atualiza o endereço de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, address: str, addr_number: str, complement: str, neighborhood: str, city: str, state: str, zip_code: str, country: str } } },
  { id: "atualizar_lead_contatos", name: "atualizar_lead_contatos", description: "Atualiza os contatos (email/whatsapp) de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, email: str, whatsapp: str, phone_ddi: str } } },
  { id: "atualizar_lead_notas", name: "atualizar_lead_notas", description: "Acrescenta uma anotação ao lead, datada e identificada como sua (padrão: o lead da conversa atual). Não apaga o que já estava escrito.", input_schema: { type: "object", properties: { lead_id: str, notes: str }, required: ["notes"] } },
  { id: "definir_campo_adicional_lead", name: "definir_campo_adicional_lead", description: "Preenche um campo adicional do lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, campo: nomeOuId("Campo a preencher"), value: str }, required: ["campo", "value"] } },
  { id: "atualizar_atendente_lead", name: "atualizar_atendente_lead", description: "Troca o atendente responsável de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, atendente: nomeOuId("Atendente que passa a ser responsável") }, required: ["atendente"] } },
  { id: "listar_negocios_do_lead", name: "listar_negocios_do_lead", description: "Lista outros negócios do mesmo contato do lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "adicionar_tag_lead", name: "adicionar_tag_lead", description: "Adiciona uma tag a um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, tag: nomeOuId("Tag a adicionar") }, required: ["tag"] } },
  { id: "remover_tag_lead", name: "remover_tag_lead", description: "Remove uma tag de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, tag: str }, required: ["tag"] } },

  { id: "criar_negocio", name: "criar_negocio", description: "Cria um novo negócio/oportunidade. Sem funil informado, usa o funil do negócio da conversa atual; sem etapa, entra na primeira etapa do funil.", input_schema: { type: "object", properties: { name: str, funil: nomeOuId("Funil onde criar"), etapa: nomeOuId("Etapa onde entrar"), value: num, produto: nomeOuId("Produto associado") } } },
  { id: "listar_negocios_por_estagio", name: "listar_negocios_por_estagio", description: "Lista os negócios que estão numa etapa do funil", input_schema: { type: "object", properties: { etapa: nomeOuId("Etapa a consultar"), pipeline_id: str }, required: ["etapa"] } },
  { id: "listar_negocios_por_atendente", name: "listar_negocios_por_atendente", description: "Lista negócios de um atendente", input_schema: { type: "object", properties: { atendente: nomeOuId("Atendente") }, required: ["atendente"] } },
  { id: "mover_negocio_estagio", name: "mover_negocio_estagio", description: "Move um negócio para outra etapa do funil (padrão: o lead da conversa atual). O funil é descoberto sozinho.", input_schema: { type: "object", properties: { lead_id: str, etapa: nomeOuId('Etapa de destino, ex: "Em andamento"') }, required: ["etapa"] } },
  { id: "ganhar_negocio", name: "ganhar_negocio", description: "Marca um negócio como ganho (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "perder_negocio", name: "perder_negocio", description: "Marca um negócio como perdido (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, motivo: nomeOuId("Motivo da perda, opcional") } } },
  { id: "atualizar_atendente_negocio", name: "atualizar_atendente_negocio", description: "Troca o atendente responsável de um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, atendente: nomeOuId("Atendente que passa a ser responsável") }, required: ["atendente"] } },
  { id: "adicionar_produto_negocio", name: "adicionar_produto_negocio", description: "Associa um produto a um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, produto: nomeOuId("Produto a associar") }, required: ["produto"] } },
  { id: "remover_produto_negocio", name: "remover_produto_negocio", description: "Remove o produto de um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "atualizar_total_negocio", name: "atualizar_total_negocio", description: "Atualiza o valor total de um negócio (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str, value: num }, required: ["value"] } },

  { id: "listar_conversas", name: "listar_conversas", description: "Lista conversas recentes da empresa", input_schema: { type: "object", properties: { limit: num } } },
  { id: "consultar_conversa_por_lead", name: "consultar_conversa_por_lead", description: "Recupera a conversa de um lead (padrão: o lead da conversa atual)", input_schema: { type: "object", properties: { lead_id: str } } },
  { id: "buscar_ou_criar_conversa_telefone", name: "buscar_ou_criar_conversa_telefone", description: "Busca uma conversa pelo telefone ou cria uma nova", input_schema: { type: "object", properties: { phone: str, name: str }, required: ["phone"] } },
  { id: "listar_mensagens_conversa", name: "listar_mensagens_conversa", description: "Lista as mensagens mais recentes de uma conversa por telefone", input_schema: { type: "object", properties: { phone: str, limit: num }, required: ["phone"] } },
];

// Entidades de catálogo: só "listar". O "consultar por ID" que existia para
// cada uma foi aposentado — devolvia a mesma linha que o listar já traz, e
// era justamente o grupo que exigia um uuid impossível de adivinhar. Quem
// precisa de um item específico lê a lista.
const CATALOG_ENTITIES: { entity: string; table: string; listId: string; label: string; orderBy?: string }[] = [
  { entity: "produtos",      table: "products",            listId: "listar_produtos",           label: "produto" },
  { entity: "tags",          table: "tags",                listId: "listar_tags",               label: "tag" },
  { entity: "listas",        table: "lists",               listId: "listar_listas",             label: "lista" },
  // custom_field_items não tem created_at -- ordena por position.
  { entity: "campos",        table: "custom_field_items",  listId: "listar_campos_adicionais",  label: "campo adicional", orderBy: "position" },
  { entity: "pipelines",     table: "pipelines",           listId: "listar_pipelines",          label: "funil" },
  { entity: "motivos_perda", table: "loss_reasons",        listId: "listar_motivos_perda",      label: "motivo de perda" },
  { entity: "horarios",      table: "work_schedules",      listId: "listar_horarios_trabalho",  label: "horário de trabalho" },
  { entity: "departamentos", table: "departments",         listId: "listar_departamentos",      label: "departamento" },
  { entity: "conexoes",      table: "whatsapp_connections", listId: "listar_conexoes",          label: "conexão" },
];

for (const c of CATALOG_ENTITIES) {
  TOOL_SCHEMAS.push({ id: c.listId, name: c.listId, description: `Lista ${c.label}s disponíveis`, input_schema: { type: "object", properties: { limit: num } } });
}
TOOL_SCHEMAS.push(
  { id: "listar_grupos_pipeline", name: "listar_grupos_pipeline", description: "Lista os grupos de pipeline disponíveis", input_schema: { type: "object", properties: {} } },
  { id: "listar_etapas_pipeline", name: "listar_etapas_pipeline", description: "Lista as etapas do funil. Sem parâmetros, usa o funil do negócio da conversa atual.", input_schema: { type: "object", properties: { pipeline_id: str }, required: [] } },
  { id: "listar_atendentes", name: "listar_atendentes", description: "Lista os atendentes (membros) da empresa", input_schema: { type: "object", properties: {} } },
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
  }

  const catalog = CATALOG_ENTITIES.find((c) => c.listId === toolId);
  if (catalog) {
    return genericList(ctx.db, catalog.table, ctx.companyId, undefined, Number(input.limit) || 50, catalog.orderBy ?? "created_at");
  }

  // Agente salvo antes de uma ferramenta ser aposentada continua com o id em
  // enabled_tools. Ele nem chega aqui (sem schema, o modelo não a enxerga),
  // mas se chegar, erra explicado em vez de silenciosamente não fazer nada.
  return { ok: false, error: `a ferramenta "${toolId}" não existe mais` };
}
