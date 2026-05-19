import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
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

  function pick(crmKey: string): string {
    const jsonKey = fm[crmKey];
    if (!jsonKey) return "";
    const val = body[jsonKey];
    if (val === undefined || val === null) return "";
    return String(val).trim();
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

  // Campos adicionais (custom fields) mapeados
  const customFieldValues: Record<string, string> = {};
  for (const [crmField, jsonKey] of Object.entries(fm)) {
    if (!STANDARD_KEYS.has(crmField) && jsonKey && body[jsonKey] !== undefined) {
      customFieldValues[crmField] = String(body[jsonKey]);
    }
  }

  // ── 7. Upsert por ID externo (se mapeado) ───────────────────────────────────
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
          tags: auto.tags && auto.tags.length > 0 ? auto.tags : undefined,
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

  // ── 8. Cria novo lead ───────────────────────────────────────────────────────
  const notesExtra = externalId ? `[ext:${externalId}]` : "";

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .insert({
      owner_id:    integration.owner_id,
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
      tags:        auto.tags ?? [],
      value:       0,
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

  // ── 9. Atividade de criação ─────────────────────────────────────────────────
  await supabase.from("activities").insert({
    owner_id:    integration.owner_id,
    lead_id:     leadId,
    type:        "created",
    description: `Lead criado via integração "${integration.name}"`,
    date:        new Date().toISOString(),
  });

  return res.status(200).json({ success: true, action: "created", leadId });
}
