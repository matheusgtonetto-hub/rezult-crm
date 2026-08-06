// Rezult CRM — Agent Response Runner Edge Function
// Processa respostas do agente atrasadas pelo "Delay de Resposta" (aba
// Configurações). Não duplica a lógica de resposta -- só re-invoca
// agent-sds-qualify internamente (com x-bypass-delay) quando o debounce
// vence, reaproveitando 100% do pipeline já existente (resolver lead,
// montar prompt, loop de tools, tudo). Acionado por pg_cron a cada minuto.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

interface PendingRow {
  id: string;
  company_id: string;
  phone: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfg } = await supabase.from("automation_runner_config").select("key, value");
  const cfgMap = Object.fromEntries((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const automationSecret = cfgMap.automation_secret ?? "";
  const supabaseUrl = cfgMap.supabase_url ?? Deno.env.get("SUPABASE_URL") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!automationSecret || auth !== `Bearer ${automationSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const agentSecret = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";

  const { data: due, error } = await supabase
    .from("agent_pending_response")
    .select("id, company_id, phone")
    .eq("status", "pending")
    .lte("respond_at", new Date().toISOString());
  if (error) return json({ error: error.message }, 500);

  const summary: Record<string, unknown>[] = [];
  for (const row of (due ?? []) as PendingRow[]) {
    try {
      // Deleta antes de chamar -- se uma nova mensagem chegar durante o
      // processamento, ela recria a linha (nova rodada de debounce) em vez
      // de colidir com esta execução.
      await supabase.from("agent_pending_response").delete().eq("id", row.id);
      const res = await fetch(`${supabaseUrl}/functions/v1/agent-sds-qualify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": agentSecret,
          "x-bypass-delay": "true",
        },
        body: JSON.stringify({ companyId: row.company_id, phone: row.phone }),
      });
      summary.push({ id: row.id, ok: res.ok, status: res.status });
    } catch (e) {
      console.error(`[agent-response-runner] ${row.id} falhou:`, e);
      summary.push({ id: row.id, error: String(e) });
    }
  }

  return json({ ok: true, processed: summary.length, summary });
});
