// Rezult CRM — Agent Followup Runner Edge Function
// Processa o ciclo de follow-up automático de um agente: quando o lead não
// responde depois de um intervalo configurado (aba Comportamento), envia uma
// nova tentativa; depois de esgotar as tentativas, opcionalmente aciona uma
// automação de destino. Acionado por pg_cron a cada minuto.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendWa, type ZapiCreds } from "../_shared/whatsapp-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

interface FollowupStateRow {
  id: string;
  agent_id: string;
  company_id: string;
  lead_id: string;
  phone: string;
  attempt_count: number;
}

type BehaviorConfig = {
  followup_max_tentativas?: number;
  followup_intervalo_valor?: number;
  followup_intervalo_unidade?: "minutos" | "horas";
  followup_transferir_automacao?: boolean;
  followup_automacao_id?: string | null;
  usar_emojis?: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Só o cron (segredo do motor) pode acionar esta função — mesmo padrão do
  // scheduled-followup-runner/disparo-runner.
  const { data: cfg } = await supabase
    .from("automation_runner_config")
    .select("key, value");
  const cfgMap = Object.fromEntries((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const secret = cfgMap.automation_secret ?? "";
  const supabaseUrl = cfgMap.supabase_url ?? Deno.env.get("SUPABASE_URL") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: due, error } = await supabase
    .from("agent_followup_state")
    .select("id, agent_id, company_id, lead_id, phone, attempt_count")
    .eq("status", "ativo")
    .lte("next_attempt_at", new Date().toISOString());
  if (error) return json({ error: error.message }, 500);

  const summary: Record<string, unknown>[] = [];
  for (const row of (due ?? []) as FollowupStateRow[]) {
    try {
      summary.push(await processOne(supabase, row, secret, supabaseUrl));
    } catch (e) {
      console.error(`[agent-followup-runner] ${row.id} falhou:`, e);
      await supabase.from("agent_followup_state").update({ status: "cancelado" }).eq("id", row.id);
      summary.push({ id: row.id, error: String(e) });
    }
  }

  return json({ ok: true, processed: summary.length, summary });
});

async function processOne(
  db: SupabaseClient, row: FollowupStateRow, automationSecret: string, supabaseUrl: string,
): Promise<Record<string, unknown>> {
  const { data: agent } = await db.from("agents").select("behavior_config").eq("id", row.agent_id).maybeSingle();
  const cfg: BehaviorConfig = (agent?.behavior_config as BehaviorConfig) ?? {};
  const maxTentativas = Number(cfg.followup_max_tentativas) || 3;

  if (row.attempt_count >= maxTentativas) {
    await db.from("agent_followup_state").update({ status: "concluido" }).eq("id", row.id);
    if (cfg.followup_transferir_automacao && cfg.followup_automacao_id) {
      // Só automações com gatilho "lead_manual" podem ser acionadas assim —
      // mesma restrição que o botão "Automação" do Multiatendimento já
      // segue (automation-runner/runTrigger exige trigger.triggerId ===
      // trigger_type; não existe atalho pra rodar qualquer automação
      // ignorando o próprio gatilho dela).
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-runner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${automationSecret}` },
        body: JSON.stringify({
          trigger_type: "lead_manual", company_id: row.company_id, lead_id: row.lead_id,
          automation_id: cfg.followup_automacao_id, context: {},
        }),
      });
      if (!res.ok) console.error(`[agent-followup-runner] falha ao acionar automação ${cfg.followup_automacao_id}:`, await res.text());
      return { id: row.id, status: "concluido", automacao_acionada: res.ok };
    }
    return { id: row.id, status: "concluido" };
  }

  const { data: conn } = await db.from("whatsapp_connections").select("provider, instance_id, token, client_token").eq("company_id", row.company_id).eq("connected", true).maybeSingle();
  if (!conn) return { id: row.id, error: "nenhuma conexão de WhatsApp conectada" };

  const { data: lead } = await db.from("leads").select("name, owner_id").eq("id", row.lead_id).maybeSingle();
  const leadName = (lead?.name as string | undefined)?.split(" ")[0] || "";
  const emoji = cfg.usar_emojis ? " 🙂" : "";
  const text = leadName
    ? `Oi ${leadName}! Só passando pra saber se ainda tem interesse em continuar nossa conversa. Fico à disposição!${emoji}`
    : `Oi! Só passando pra saber se ainda tem interesse em continuar nossa conversa. Fico à disposição!${emoji}`;

  const creds: ZapiCreds = {
    instanceId: String(conn.instance_id), token: String(conn.token),
    clientToken: conn.client_token ? String(conn.client_token) : null,
    provider: (["dapi", "cloud_api"].includes(String(conn.provider)) ? String(conn.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
  };
  await sendWa(creds, { kind: "text", phone: row.phone, message: text });
  await db.from("whatsapp_messages").insert({
    company_id: row.company_id, owner_id: lead?.owner_id as string | undefined,
    instance_id: creds.instanceId, phone: row.phone, from_me: true, body: text, type: "text",
  });

  const unitMs = cfg.followup_intervalo_unidade === "horas" ? 3_600_000 : 60_000;
  const intervalMs = (Number(cfg.followup_intervalo_valor) || 30) * unitMs;
  await db.from("agent_followup_state").update({
    attempt_count: row.attempt_count + 1,
    next_attempt_at: new Date(Date.now() + intervalMs).toISOString(),
  }).eq("id", row.id);

  return { id: row.id, status: "enviado", attempt: row.attempt_count + 1 };
}
