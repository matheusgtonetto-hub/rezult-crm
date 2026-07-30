import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertContact } from "../_shared/contacts.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Nomes de campo que o Facebook Lead Ads usa para cada dado
const NAME_FIELDS  = ["full_name", "name", "nome", "first_name", "last_name"];
const PHONE_FIELDS = ["phone_number", "phone", "telefone", "celular", "whatsapp", "mobile"];
const EMAIL_FIELDS = ["email", "e-mail", "correio"];

// Chaves que representam dados estruturais do payload (não são campos do formulário)
const SYSTEM_KEYS = new Set([
  "name", "full_name", "nome", "first_name", "last_name",
  "phone", "phone_number", "telefone", "celular", "whatsapp", "mobile",
  "email", "e-mail", "correio",
  "pipeline_id", "stage_id", "source", "notes", "tags",
  "field_data", "entry", "object", "id", "leadgen_id", "created_time", "page_id", "adgroup_id", "ad_id", "form_id",
]);

function fieldVal(fields: { name: string; values: string[] }[], keys: string[]): string {
  for (const key of keys) {
    const f = fields.find(f => f.name.toLowerCase() === key);
    if (f?.values?.[0]) return f.values[0];
  }
  return "";
}

// Meta Instant Forms (via Sheets/Make) codifica espaços como underscores nos valores
function normalizeValue(val: string): string {
  return val.replace(/_+/g, " ").trim();
}

interface ExtractedFields {
  name: string;
  phone: string;
  email: string;
  extra: Record<string, string>; // label → valor dos campos adicionais do formulário
}

// Extrai campos do payload independente do formato recebido
function extractFields(payload: Record<string, unknown>): ExtractedFields {
  const extra: Record<string, string> = {};

  // Formato Facebook Lead Ads (field_data array)
  if (Array.isArray(payload.field_data)) {
    const fields = payload.field_data as { name: string; values: string[] }[];
    const firstName = fieldVal(fields, ["first_name"]);
    const lastName  = fieldVal(fields, ["last_name"]);
    const fullName  = fieldVal(fields, ["full_name", "name", "nome"]);
    const name  = fullName || [firstName, lastName].filter(Boolean).join(" ");
    const phone = fieldVal(fields, PHONE_FIELDS);
    const email = fieldVal(fields, EMAIL_FIELDS);

    // Campos extras: tudo que não é nome/telefone/email
    const standardKeys = new Set([...NAME_FIELDS, ...PHONE_FIELDS, ...EMAIL_FIELDS]);
    for (const f of fields) {
      if (!standardKeys.has(f.name.toLowerCase()) && f.values?.[0]) {
        extra[f.name] = normalizeValue(f.values[0]);
      }
    }
    return { name, phone, email, extra };
  }

  // Formato Facebook via Make/n8n (entry[].changes[].value com field_data)
  const entries = payload.entry as { changes?: { value?: { field_data?: { name: string; values: string[] }[] } }[] }[];
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      for (const change of (entry.changes ?? [])) {
        const val = change?.value;
        if (Array.isArray(val?.field_data)) {
          const fields = val.field_data as { name: string; values: string[] }[];
          const firstName = fieldVal(fields, ["first_name"]);
          const lastName  = fieldVal(fields, ["last_name"]);
          const fullName  = fieldVal(fields, ["full_name", "name", "nome"]);
          const name  = fullName || [firstName, lastName].filter(Boolean).join(" ");
          const phone = fieldVal(fields, PHONE_FIELDS);
          const email = fieldVal(fields, EMAIL_FIELDS);
          const standardKeys = new Set([...NAME_FIELDS, ...PHONE_FIELDS, ...EMAIL_FIELDS]);
          for (const f of fields) {
            if (!standardKeys.has(f.name.toLowerCase()) && f.values?.[0]) {
              extra[f.name] = normalizeValue(f.values[0]);
            }
          }
          return { name, phone, email, extra };
        }
      }
    }
  }

  // Formato simples: { name, phone, email, ...outrosCampos }
  const rawName   = String(payload.name ?? payload.full_name ?? payload.nome ?? "").trim();
  const firstName = String(payload.first_name ?? payload.nome ?? "").trim();
  const lastName  = String(payload.last_name  ?? "").trim();
  const name  = rawName || [firstName, lastName].filter(Boolean).join(" ");
  const phone = String(payload.phone ?? payload.phone_number ?? payload.whatsapp ?? payload.telefone ?? payload.celular ?? "").trim();
  const email = String(payload.email ?? payload["e-mail"] ?? "").trim();

  // Captura chaves desconhecidas como campos extras
  for (const [key, val] of Object.entries(payload)) {
    if (!SYSTEM_KEYS.has(key.toLowerCase()) && val !== null && val !== undefined && val !== "") {
      extra[key] = normalizeValue(String(val));
    }
  }

  return { name, phone, email, extra };
}

// Resolve IDs dos custom_field_items para os campos extras recebidos.
// Se um item com aquele label não existir, cria automaticamente num grupo "Dados do Lead".
async function resolveCustomFieldValues(
  db: ReturnType<typeof createClient>,
  ownerId: string,
  extra: Record<string, string>,
): Promise<Record<string, string>> {
  if (Object.keys(extra).length === 0) return {};

  // Busca todos os items existentes do owner
  const { data: existingItems } = await db
    .from("custom_field_items")
    .select("id, label")
    .eq("owner_id", ownerId);

  const itemsByLabel: Record<string, string> = {};
  for (const item of (existingItems ?? []) as { id: string; label: string }[]) {
    itemsByLabel[item.label.toLowerCase()] = item.id;
  }

  // Para labels novos, precisamos de um grupo onde criá-los
  let webhookGroupId: string | null = null;
  const labelsToCreate = Object.keys(extra).filter(l => !itemsByLabel[l.toLowerCase()]);

  if (labelsToCreate.length > 0) {
    // Busca ou cria o grupo "Dados do Lead"
    const { data: existingGroup } = await db
      .from("custom_field_groups")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("name", "Dados do Lead")
      .maybeSingle();

    if (existingGroup) {
      webhookGroupId = existingGroup.id as string;
    } else {
      // Pega a maior posição atual para inserir no final
      const { data: lastGroup } = await db
        .from("custom_field_groups")
        .select("position")
        .eq("owner_id", ownerId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPos = ((lastGroup as { position?: number } | null)?.position ?? -1) + 1;

      const { data: newGroup } = await db
        .from("custom_field_groups")
        .insert({ owner_id: ownerId, name: "Dados do Lead", position: nextPos, is_default: false })
        .select("id")
        .single();
      webhookGroupId = (newGroup as { id: string }).id;
    }

    // Cria os items ausentes
    const { data: createdItems } = await db
      .from("custom_field_items")
      .insert(
        labelsToCreate.map((label, idx) => ({
          owner_id:   ownerId,
          group_id:   webhookGroupId,
          label,
          field_type: "text",
          position:   idx,
        }))
      )
      .select("id, label");

    for (const item of (createdItems ?? []) as { id: string; label: string }[]) {
      itemsByLabel[item.label.toLowerCase()] = item.id;
    }
  }

  // Monta o objeto { item_id: valor }
  const result: Record<string, string> = {};
  for (const [label, value] of Object.entries(extra)) {
    const itemId = itemsByLabel[label.toLowerCase()];
    if (itemId) result[itemId] = value;
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Facebook webhook verification challenge
  const url = new URL(req.url);
  if (req.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge");
    if (challenge) return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
    return json({ ok: true, service: "leads-webhook" });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Aceita x-api-key ou Authorization: Bearer <key> ou query param api_key
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("api_key") ??
    "";

  if (!apiKey) return json({ error: "missing api key" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  console.log("Payload recebido:", JSON.stringify(payload));

  const db = createClient(supabaseUrl, serviceKey);

  // Valida a chave e recupera o company_id
  const { data: keyRow, error: keyErr } = await db
    .from("webhook_api_keys")
    .select("id, company_id, owner_id, active")
    .eq("key", apiKey)
    .maybeSingle();

  if (keyErr || !keyRow) return json({ error: "invalid api key" }, 401);
  if (!keyRow.active) return json({ error: "api key is disabled" }, 403);

  const ownerId = keyRow.owner_id as string;
  // Achado fora do escopo original desta mudança, mas bloqueante pra ela:
  // o insert em `leads` mais abaixo nunca setava company_id (só owner_id) --
  // corrigido aqui porque upsertContact/dedup em contacts precisa desse valor
  // de qualquer forma pra resolver o contato certo.
  const companyId = keyRow.company_id as string;

  // Resolve pipeline e etapa
  let pipelineId = String(payload.pipeline_id ?? "");
  let stageId    = String(payload.stage_id    ?? "");

  if (!pipelineId || !stageId) {
    const { data: pipelines } = await db
      .from("pipelines")
      .select("id, pipeline_columns(id)")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1);

    const first = pipelines?.[0] as { id: string; pipeline_columns?: { id: string }[] } | undefined;
    if (!first) return json({ error: "no pipeline found for this company" }, 422);
    if (!pipelineId) pipelineId = first.id;
    if (!stageId) {
      const cols = (first.pipeline_columns ?? []) as { id: string }[];
      if (!cols.length) return json({ error: "pipeline has no stages" }, 422);
      stageId = cols[0].id;
    }
  }

  // Próximo deal number
  const { data: maxRow } = await db
    .from("leads")
    .select("deal_number")
    .eq("owner_id", ownerId)
    .order("deal_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dealNumber = ((maxRow as { deal_number?: number } | null)?.deal_number ?? 1000) + 1;

  const { name: rawName, phone: rawPhone, email: rawEmail, extra } = extractFields(payload);

  const phone  = rawPhone.replace(/\D/g, "");
  const name   = rawName || phone || "Lead sem nome";
  const email  = rawEmail.trim() || null;
  const source = String(payload.source ?? "Facebook Ads");
  const notes  = String(payload.notes  ?? "").trim();
  const baseTags = Array.isArray(payload.tags) ? (payload.tags as string[]) : [];
  const tags = baseTags.includes("Meta ads") ? baseTags : ["Meta ads", ...baseTags];

  // Resolve campos adicionais → IDs de custom_field_items
  const customFieldValues = await resolveCustomFieldValues(db, ownerId, extra);

  // Resolve/cria o contato (pessoa) antes do negócio -- mesma lógica de
  // dedup por telefone normalizado usada no app (src/lib/contacts.ts).
  const personId = await upsertContact(db, {
    companyId: companyId,
    ownerId:   ownerId,
    name,
    phone:     phone || undefined,
    email:     email ?? undefined,
  });

  const { data: lead, error: insertErr } = await db
    .from("leads")
    .insert({
      owner_id:            ownerId,
      company_id:          companyId,
      deal_number:         dealNumber,
      name,
      whatsapp:            phone,
      phone_ddi:           "+55",
      email:               email ?? null,
      emails:              JSON.stringify(email ? [email] : []),
      pipeline_id:         pipelineId,
      column_id:           stageId,
      value:               0,
      responsible:         "",
      priority:            "Média",
      origin:              source,
      entry_date:          new Date().toISOString().split("T")[0],
      notes,
      tags,
      status:              "open",
      custom_field_values: customFieldValues,
      person_id:           personId ?? null,
    })
    .select("id, deal_number")
    .single();

  if (insertErr) {
    console.error("Insert lead error:", insertErr);
    return json({ error: "failed to create lead", detail: insertErr.message }, 500);
  }

  await db
    .from("webhook_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return json({
    success:      true,
    lead_id:      (lead as { id: string; deal_number: number }).id,
    deal_number:  (lead as { id: string; deal_number: number }).deal_number,
    extra_fields: Object.keys(extra).length,
  }, 201);
});
