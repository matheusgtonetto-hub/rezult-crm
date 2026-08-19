// Rezult CRM — Agent Followup Runner Edge Function
// Processa o ciclo de follow-up automático de um agente: quando o lead não
// responde depois de um intervalo configurado (aba Comportamento), pede uma
// nova tentativa ao agente; depois de esgotar as tentativas, opcionalmente
// aciona uma automação de destino. Acionado por pg_cron a cada minuto.
//
// Este runner NÃO escreve nem envia a mensagem: ele só controla o relógio
// (quando cutucar, quantas vezes, quando desistir) e delega a redação e o
// envio ao agent-sds-qualify, que tem o histórico da conversa, o tom
// configurado e a linha de WhatsApp certa. Mesmo padrão do
// agent-response-runner.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { empresaBloqueada } from "../_shared/cobranca.ts";

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
      // Mesma regra do scheduled-followup: empresa bloqueada não dispara, e o
      // estado fica ativo para retomar quando o pagamento entrar.
      if (await empresaBloqueada(supabase, row.company_id)) {
        summary.push({ id: row.id, skipped: "cobranca_bloqueada" });
        continue;
      }
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

  // A cutucada é escrita pelo próprio agente (agent-sds-qualify), não por um
  // texto fixo aqui. Antes, toda tentativa mandava a MESMA frase, sem nenhum
  // contexto da conversa e sem a assinatura/estilo configurados -- duas
  // tentativas seguidas chegavam idênticas pro lead.
  //
  // Passar pelo agente também faz o follow-up herdar todos os gates dele:
  // tag "Agente", conversa finalizada e horário de atendimento. Sem isso, um
  // lead já transferido pra um humano continuava sendo cutucado pelo robô,
  // atropelando o atendente.
  const res = await fetch(`${supabaseUrl}/functions/v1/agent-sds-qualify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
      "x-bypass-delay": "true",
      "x-followup-attempt": String(row.attempt_count + 1),
    },
    body: JSON.stringify({ companyId: row.company_id, phone: row.phone }),
  });
  const payload = await res.json().catch(() => ({})) as { skipped?: string };

  if (payload?.skipped) {
    // Fora do horário de atendimento é só "ainda não": adia a tentativa em
    // vez de desistir dela. Qualquer outro motivo (tag removida, conversa
    // finalizada, agente desligado) significa que o ciclo perdeu o sentido.
    if (payload.skipped === "outside_business_hours") {
      const unitMsRetry = cfg.followup_intervalo_unidade === "horas" ? 3_600_000 : 60_000;
      const retryMs = (Number(cfg.followup_intervalo_valor) || 30) * unitMsRetry;
      await db.from("agent_followup_state")
        .update({ next_attempt_at: new Date(Date.now() + retryMs).toISOString() })
        .eq("id", row.id);
      return { id: row.id, status: "adiado", motivo: payload.skipped };
    }
    await db.from("agent_followup_state").update({ status: "cancelado" }).eq("id", row.id);
    return { id: row.id, status: "cancelado", motivo: payload.skipped };
  }

  const unitMs = cfg.followup_intervalo_unidade === "horas" ? 3_600_000 : 60_000;
  const intervalMs = (Number(cfg.followup_intervalo_valor) || 30) * unitMs;
  await db.from("agent_followup_state").update({
    attempt_count: row.attempt_count + 1,
    next_attempt_at: new Date(Date.now() + intervalMs).toISOString(),
  }).eq("id", row.id);

  return { id: row.id, status: "enviado", attempt: row.attempt_count + 1 };
}
