import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const STANDARD_KEYS = new Set([
  "name", "company", "email", "phone", "phoneDdi",
  "externalId", "productSku", "productName", "productPrice",
]);

type Req = {
  method: string;
  query: Record<string, string | string[]>;
  body: unknown;
};
type Res = {
  status(code: number): Res;
  json(data: unknown): Res;
  setHeader(key: string, value: string): Res;
  end(): void;
};

function setCors(res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req: Req, res: Res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const token = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token;

  if (!token) {
    return res.status(400).json({ error: "Token ausente" });
  }

  if (!SERVICE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY não configurada");
    return res.status(500).json({ error: "Servidor mal configurado" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── 1. Busca integração pelo token ──────────────────────────────────────────
  const { data: integration, error: intErr } = await supabase
    .from("webhook_integrations")
    .select("*")
    .eq("webhook_token", token)
    .maybeSingle();

  if (intErr || !integration) {
    return res.status(404).json({ error: "Integração não encontrada" });
  }

  if (!integration.active) {
    return res.status(200).json({ received: true, message: "Integração inativa, ignorado" });
  }

  // ── 2. Normaliza o body ─────────────────────────────────────────────────────
  const body: Record<string, unknown> =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)
      : {};

  // Salva dado bruto para debug no painel
  await supabase
    .from("webhook_integrations")
    .update({ last_received_data: JSON.stringify(body, null, 2) })
    .eq("id", integration.id);

  // ── 3. Aplica mapeamento de campos ──────────────────────────────────────────
  const fm: Record<string, string> = integration.field_mappings ?? {};
  const auto: { pipelineId?: string; stageId?: string; tags?: string[] } =
    integration.automation_settings ?? {};

  // Resolve dot-notation paths e arrays (ex: "attendees.0.name", "responses.phone.value")
  function deepGet(obj: unknown, path: string): string {
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
      if (cur === null || cur === undefined) return "";
      if (Array.isArray(cur)) {
        const idx = Number(part);
        cur = isNaN(idx) ? undefined : cur[idx];
      } else if (typeof cur === "object") {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        return "";
      }
    }
    if (cur === null || cur === undefined) return "";
    return String(cur).trim();
  }

  // Normaliza payload Cal.com: extrai campos comuns automaticamente se não houver mapeamento
  function normalizeCal(b: Record<string, unknown>): Record<string, unknown> {
    if (!b.triggerEvent && !b.payload) return b;
    const p = (b.payload ?? b) as Record<string, unknown>;
    const attendee = Array.isArray(p.attendees) ? (p.attendees[0] as Record<string, unknown>) : {};
    const responses = (p.responses ?? {}) as Record<string, { value?: unknown }>;
    const phone =
      String(attendee.phoneNumber ?? "").trim() ||
      String(responses.attendeePhoneNumber?.value ?? "").trim() ||
      String(responses.phone?.value ?? "").trim() ||
      String(responses.whatsapp?.value ?? "").trim() ||
      String(responses.telefone?.value ?? "").trim() ||
      "";
    return {
      ...b,
      _cal_name:  String(attendee.name  ?? responses.name?.value  ?? "").trim(),
      _cal_email: String(attendee.email ?? responses.email?.value ?? "").trim(),
      _cal_phone: phone,
      _cal_notes: String(p.title ?? p.description ?? "").trim(),
      _cal_uid:   String((p as Record<string, unknown>).uid ?? "").trim(),
    };
  }

  const enrichedBody = normalizeCal(body);

  function pick(crmKey: string): string {
    const jsonKey = fm[crmKey];
    if (!jsonKey) return "";
    // Suporta dot-notation para campos aninhados
    return deepGet(enrichedBody, jsonKey);
  }

  // ── 4. Próximo número de negócio ────────────────────────────────────────────
  const { data: maxRow } = await supabase
    .from("leads")
    .select("deal_number")
    .eq("owner_id", integration.owner_id)
    .order("deal_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dealNumber = ((maxRow as { deal_number?: number } | null)?.deal_number ?? 0) + 1;

  // ── 5. Responsável padrão (dono da integração) ──────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", integration.owner_id)
    .maybeSingle();

  const responsible =
    (profile as { full_name?: string; email?: string } | null)?.full_name ||
    (profile as { full_name?: string; email?: string } | null)?.email ||
    "";

  // ── 6. Monta dados do lead ──────────────────────────────────────────────────
  const name     = pick("name")    || "Lead via webhook";
  const phone    = pick("phone");
  const ddi      = pick("phoneDdi") || "55";
  const email    = pick("email")   || null;
  const company  = pick("company") || null;
  // Mapeados na UI (IntegracoesPage.tsx) mas nunca lidos antes -- todo lead
  // criado por webhook nascia com value:0, mesmo vindo de uma venda real
  // (ex: Hotmart/Kiwify notificando compra). Sem isso a métrica "Vendas
  // feitas" da aba Performance dos Agentes nunca teria valor em R$.
  const productSku   = pick("productSku")   || null;
  const productName  = pick("productName")  || null;
  const productPrice = Number(pick("productPrice").replace(",", ".")) || 0;

  // Campos adicionais (custom fields) mapeados
  const customFieldValues: Record<string, string> = {};
  for (const [crmField, jsonKey] of Object.entries(fm)) {
    if (!STANDARD_KEYS.has(crmField) && jsonKey) {
      const val = deepGet(enrichedBody, jsonKey);
      if (val) customFieldValues[crmField] = val;
    }
  }

  // ── 7. Tags finais: as do webhook + as dos agentes vinculados ───────────────
  // Agentes de IA vinculados a esta integração (aba Integrações do agente).
  // A tag de ativação deles entra junto das tags configuradas no webhook: é a
  // tag que aciona o agente num negócio, então marcar o webhook no agente
  // passa a significar "os negócios que entram por aqui são atendidos por
  // mim". Um mecanismo só de roteamento, o mesmo de sempre.
  const { data: agentesVinculados } = await supabase
    .from("agent_webhook_integrations")
    .select("agents!inner(activation_tag, active)")
    .eq("connection_id", integration.id)
    .eq("enabled", true);
  const tagsDeAgente = ((agentesVinculados ?? []) as unknown as { agents: { activation_tag: string | null; active: boolean } }[])
    .filter((r) => r.agents?.active && r.agents.activation_tag)
    .map((r) => r.agents.activation_tag as string);
  const tagsFinais = [...new Set([...(auto.tags ?? []), ...tagsDeAgente])];

  // ── 8. Upsert por ID externo (se mapeado) ───────────────────────────────────
  const externalId = pick("externalId");
  if (externalId) {
    // Verifica se já existe lead com essa origem+externalId via notes tag
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("owner_id", integration.owner_id)
      .ilike("notes", `%[ext:${externalId}]%`)
      .maybeSingle();

    if (existing) {
      // Atualiza lead existente
      await supabase
        .from("leads")
        .update({
          name,
          company,
          whatsapp: phone || undefined,
          phone_ddi: ddi || undefined,
          email,
          // No lead que já existe as tags também precisam trazer a do agente,
          // senão reenviar o mesmo evento tirava o agente de um negócio que
          // ele já estava atendendo.
          tags: tagsFinais.length > 0 ? tagsFinais : undefined,
          ...(productSku || productName ? { product_id: productSku ?? productName } : {}),
          ...(productPrice > 0 ? { value: productPrice } : {}),
        })
        .eq("id", (existing as { id: string }).id);

      await supabase.from("activities").insert({
        owner_id: integration.owner_id,
        lead_id: (existing as { id: string }).id,
        type: "note",
        description: `Lead atualizado via integração "${integration.name}"`,
        date: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        action: "updated",
        leadId: (existing as { id: string }).id,
      });
    }
  }

  // ── 9. Cria novo lead ───────────────────────────────────────────────────────
  const notesExtra = externalId ? `[ext:${externalId}]` : "";

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .insert({
      owner_id:    integration.owner_id,
      // Sem company_id o negócio nasce órfão: some da tela do CRM (que filtra
      // por empresa) e o agente nunca o encontra, porque toda consulta dele é
      // escopada por company_id. Nenhum lead tinha sido criado por aqui ainda,
      // então isso nunca apareceu.
      company_id:  integration.company_id,
      deal_number: dealNumber,
      name,
      company,
      whatsapp:    phone,
      phone_ddi:   ddi,
      email,
      emails:      JSON.stringify(email ? [email] : []),
      pipeline_id: auto.pipelineId || null,
      column_id:   auto.stageId    || null,
      responsible,
      priority:    "Média",
      origin:      "Outro",
      entry_date:  new Date().toISOString().split("T")[0],
      notes:       notesExtra,
      tags:        tagsFinais,
      product_id:  productSku ?? productName,
      value:       productPrice,
      position:    0,
      status:      "open",
    })
    .select("id")
    .single();

  if (leadErr || !lead) {
    console.error("webhook: erro ao inserir lead", leadErr);
    return res.status(500).json({ error: "Falha ao criar lead" });
  }

  const leadId = (lead as { id: string }).id;

  // ── 10. Atividade de criação ─────────────────────────────────────────────────
  await supabase.from("activities").insert({
    owner_id:    integration.owner_id,
    lead_id:     leadId,
    type:        "created",
    description: `Lead criado via integração "${integration.name}"`,
    date:        new Date().toISOString(),
  });

  return res.status(200).json({ success: true, action: "created", leadId });
}
