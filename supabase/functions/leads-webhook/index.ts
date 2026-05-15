import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (req.method === "GET") return json({ ok: true, service: "leads-webhook" });

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Aceita x-api-key ou Authorization: Bearer <key>
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (!apiKey) return json({ error: "missing api key" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const db = createClient(supabaseUrl, serviceKey);

  // Valida a chave e recupera o company_id
  const { data: keyRow, error: keyErr } = await db
    .from("webhook_api_keys")
    .select("id, company_id, owner_id, active")
    .eq("key", apiKey)
    .maybeSingle();

  if (keyErr || !keyRow) return json({ error: "invalid api key" }, 401);
  if (!keyRow.active) return json({ error: "api key is disabled" }, 403);

  const ownerId   = keyRow.owner_id as string;
  const companyId = keyRow.company_id as string;

  // Resolve pipeline e etapa (usa o informado ou o primeiro disponível)
  let pipelineId = String(payload.pipeline_id ?? "");
  let stageId    = String(payload.stage_id    ?? "");

  if (!pipelineId || !stageId) {
    const { data: pipelines } = await db
      .from("pipelines")
      .select("id, pipeline_columns(id)")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true })
      .limit(1);

    const first = pipelines?.[0] as any;
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

  const dealNumber = ((maxRow as any)?.deal_number ?? 1000) + 1;

  const phone  = String(payload.phone ?? payload.whatsapp ?? "").replace(/\D/g, "");
  const name   = String((payload.name ?? phone) || "Lead sem nome").trim();
  const email  = String(payload.email ?? "").trim() || null;
  const source = String(payload.source ?? "Outro");
  const notes  = String(payload.notes  ?? "").trim();
  const tags   = Array.isArray(payload.tags) ? (payload.tags as string[]) : [];

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

  // Atualiza last_used_at da chave
  await db
    .from("webhook_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return json({ success: true, lead_id: (lead as any).id, deal_number: (lead as any).deal_number }, 201);
});
