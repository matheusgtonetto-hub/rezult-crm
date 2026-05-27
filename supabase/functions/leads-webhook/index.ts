import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function fieldVal(fields: { name: string; values: string[] }[], keys: string[]): string {
  for (const key of keys) {
    const f = fields.find(f => f.name.toLowerCase() === key);
    if (f?.values?.[0]) return f.values[0];
  }
  return "";
}

// Extrai campos do payload independente do formato recebido
function extractFields(payload: Record<string, unknown>) {
  // Formato Facebook Lead Ads (field_data array)
  // { field_data: [{ name: "full_name", values: ["João"] }, ...] }
  if (Array.isArray(payload.field_data)) {
    const fields = payload.field_data as { name: string; values: string[] }[];
    const firstName = fieldVal(fields, ["first_name"]);
    const lastName  = fieldVal(fields, ["last_name"]);
    const fullName  = fieldVal(fields, ["full_name", "name", "nome"]);
    const name  = fullName || [firstName, lastName].filter(Boolean).join(" ");
    const phone = fieldVal(fields, PHONE_FIELDS);
    const email = fieldVal(fields, EMAIL_FIELDS);
    return { name, phone, email };
  }

  // Formato Facebook via Make/n8n (entry[].changes[].value com field_data)
  // Tenta desempacotar o envelope do Facebook
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
          return { name, phone, email };
        }
      }
    }
  }

  // Formato simples: { name, phone, email } — já funcionava antes
  const rawName = String(payload.name ?? payload.full_name ?? payload.nome ?? "").trim();
  const firstName = String(payload.first_name ?? payload.nome ?? "").trim();
  const lastName  = String(payload.last_name  ?? "").trim();
  const name  = rawName || [firstName, lastName].filter(Boolean).join(" ");
  const phone = String(payload.phone ?? payload.phone_number ?? payload.whatsapp ?? payload.telefone ?? payload.celular ?? "").trim();
  const email = String(payload.email ?? payload["e-mail"] ?? "").trim();
  return { name, phone, email };
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

  const { name: rawName, phone: rawPhone, email: rawEmail } = extractFields(payload);

  const phone  = rawPhone.replace(/\D/g, "");
  const name   = rawName || phone || "Lead sem nome";
  const email  = rawEmail.trim() || null;
  const source = String(payload.source ?? "Facebook Ads");
  const notes  = String(payload.notes  ?? "").trim();
  const baseTags = Array.isArray(payload.tags) ? (payload.tags as string[]) : [];
  const tags = baseTags.includes("Meta ads") ? baseTags : ["Meta ads", ...baseTags];

  const { data: lead, error: insertErr } = await db
    .from("leads")
    .insert({
      owner_id:    ownerId,
      deal_number: dealNumber,
      name,
      whatsapp:    phone,
      phone_ddi:   "+55",
      email:       email ?? null,
      emails:      JSON.stringify(email ? [email] : []),
      pipeline_id: pipelineId,
      column_id:   stageId,
      value:       0,
      responsible: "",
      priority:    "Média",
      origin:      source,
      entry_date:  new Date().toISOString().split("T")[0],
      notes,
      tags,
      status:      "open",
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

  return json({ success: true, lead_id: (lead as { id: string; deal_number: number }).id, deal_number: (lead as { id: string; deal_number: number }).deal_number }, 201);
});
