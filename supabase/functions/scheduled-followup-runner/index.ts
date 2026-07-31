// Rezult CRM — Scheduled Followup Runner Edge Function
// Envia mensagens de WhatsApp avulsas agendadas (tabela scheduled_followups)
// no horário marcado, sem depender de ninguém com o Multiatendimento aberto.
//
// Acionada por pg_cron a cada minuto (Authorization: Bearer <automation_secret>,
// body {}) — varre todas as linhas com status='agendado' e scheduled_at vencido.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendWa, ZapiCreds } from "../_shared/whatsapp-send.ts";
import { upsertConversationForMessage, previewLabelFor } from "../_shared/upsert-conversation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FollowupRow {
  id: string;
  owner_id: string;
  company_id: string;
  phone: string;
  connection_id: string | null;
  message: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Só o cron (segredo do motor) pode acionar esta função — não há modo "UI".
  const { data: cfg } = await supabase
    .from("automation_runner_config")
    .select("key, value")
    .eq("key", "automation_secret");
  const secret = cfg?.[0]?.value ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { data: due, error } = await supabase
    .from("scheduled_followups")
    .select("id, owner_id, company_id, phone, connection_id, message")
    .eq("status", "agendado")
    .lte("scheduled_at", new Date().toISOString());
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  const summary: Record<string, unknown>[] = [];
  for (const row of (due ?? []) as FollowupRow[]) {
    try {
      summary.push(await processFollowup(supabase, row));
    } catch (e) {
      console.error(`scheduled_followup ${row.id} falhou:`, e);
      await supabase.from("scheduled_followups")
        .update({ status: "erro", error_message: String(e) })
        .eq("id", row.id);
      summary.push({ id: row.id, error: String(e) });
    }
  }

  return Response.json({ ok: true, processed: summary.length, summary }, { headers: corsHeaders });
});

async function processFollowup(
  supabase: SupabaseClient, row: FollowupRow,
): Promise<Record<string, unknown>> {
  if (!row.connection_id) {
    await supabase.from("scheduled_followups")
      .update({ status: "erro", error_message: "Nenhuma conexão de WhatsApp associada" })
      .eq("id", row.id);
    return { id: row.id, error: "sem conexão" };
  }

  const { data: connRow } = await supabase
    .from("whatsapp_connections")
    .select("provider, instance_id, token, client_token, connected, owner_id")
    .eq("id", row.connection_id)
    .maybeSingle();
  const conn = connRow as Record<string, unknown> | null;

  // Isolamento por dono: nunca envia usando conexão de outro tenant.
  if (!conn || conn.owner_id !== row.owner_id) {
    await supabase.from("scheduled_followups")
      .update({ status: "erro", error_message: "Conexão não encontrada" })
      .eq("id", row.id);
    return { id: row.id, error: "conexão não encontrada" };
  }
  if (!conn.connected || !conn.instance_id || !conn.token) {
    await supabase.from("scheduled_followups")
      .update({ status: "erro", error_message: "Conexão de WhatsApp está desconectada" })
      .eq("id", row.id);
    return { id: row.id, error: "conexão desconectada" };
  }

  const creds: ZapiCreds = {
    instanceId: String(conn.instance_id),
    token: String(conn.token),
    clientToken: conn.client_token ? String(conn.client_token) : null,
    provider: (["dapi", "cloud_api"].includes(String(conn.provider)) ? String(conn.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
  };

  await sendWa(creds, { kind: "text", phone: row.phone, message: row.message });

  await supabase.from("whatsapp_messages").insert({
    owner_id: row.owner_id,
    instance_id: creds.instanceId,
    phone: row.phone,
    from_me: true,
    body: row.message,
    type: "text",
  });

  try {
    await upsertConversationForMessage(supabase, {
      ownerId: row.owner_id,
      companyId: row.company_id ?? null,
      instanceId: creds.instanceId,
      phone: row.phone,
      preview: previewLabelFor("text", row.message),
      fromMe: true,
    });
  } catch (e) {
    console.error("scheduled-followup-runner: upsertConversationForMessage failed:", e);
  }

  await supabase.from("scheduled_followups")
    .update({ status: "enviado", sent_at: new Date().toISOString() })
    .eq("id", row.id);

  return { id: row.id, ok: true };
}
