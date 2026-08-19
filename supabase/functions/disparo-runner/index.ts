// Rezult CRM — Disparo Runner Edge Function
// Executa "disparos" (execução em massa de uma automação sobre leads filtrados),
// em lotes, respeitando o ritmo configurado.
//
// Acionada por:
//  1. pg_cron a cada minuto (Authorization: Bearer <automation_secret>, body {}) —
//     varre todos os disparos ativos (em_andamento) e agendados vencidos.
//  2. UI ao clicar "Iniciar" (JWT do usuário, body { disparo_id }) — processa 1 disparo.
//
// Cada invocação processa UM lote por disparo. O próximo lote é processado na
// próxima passagem do cron, conforme o help: envia o lote, aguarda entrar no fluxo,
// e só então o próximo lote.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { empresaBloqueada } from "../_shared/cobranca.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Rhythm = "normal" | "turbo" | "lento" | "humano";
const RHYTHM_BATCH: Record<Rhythm, number> = { turbo: 40, normal: 25, lento: 12, humano: 3 };
const RHYTHM_DELAY_MS: Record<Rhythm, number> = { turbo: 20, normal: 30, lento: 60, humano: 10000 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DisparoRow {
  id: string; company_id: string; automation_id: string | null; status: string;
  rhythm: Rhythm; scheduled_at: string | null; started_at: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Segredo interno usado para chamar o automation-runner e autenticar o cron.
  const { data: cfg } = await supabase
    .from("automation_runner_config")
    .select("key, value")
    .in("key", ["supabase_url", "automation_secret"]);
  const secret = cfg?.find((c) => c.key === "automation_secret")?.value ?? "";
  const baseUrl = (cfg?.find((c) => c.key === "supabase_url")?.value ?? Deno.env.get("SUPABASE_URL")!).replace(/\/$/, "");

  let body: { disparo_id?: string } = {};
  try { body = await req.json(); } catch { /* corpo vazio (cron) */ }

  const auth = req.headers.get("Authorization") ?? "";
  const isCron = secret && auth === `Bearer ${secret}`;

  // Modo UI: valida JWT e associa ao disparo informado.
  let allowedDisparoId: string | null = null;
  if (!isCron) {
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = await supabase.auth.getUser(jwt);
    if (!userData?.user || !body.disparo_id) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }
    allowedDisparoId = body.disparo_id;
  }

  // Seleciona disparos a processar.
  let query = supabase.from("disparos").select("id, company_id, automation_id, status, rhythm, scheduled_at, started_at");
  if (allowedDisparoId) {
    query = query.eq("id", allowedDisparoId);
  } else if (body.disparo_id) {
    query = query.eq("id", body.disparo_id);
  } else {
    query = query.in("status", ["em_andamento", "agendado"]);
  }
  const { data: disparos, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });

  const summary: Record<string, unknown>[] = [];
  for (const d of (disparos ?? []) as DisparoRow[]) {
    try {
      summary.push(await processDisparo(supabase, d, baseUrl, secret));
    } catch (e) {
      console.error(`disparo ${d.id} falhou:`, e);
      summary.push({ id: d.id, error: String(e) });
    }
  }

  return Response.json({ ok: true, processed: summary.length, summary }, { headers: corsHeaders });
});

async function processDisparo(
  supabase: SupabaseClient, d: DisparoRow, baseUrl: string, secret: string,
): Promise<Record<string, unknown>> {
  // Campanha em massa é o gasto mais caro do sistema. O runner usa service_role,
  // que ignora RLS: sem esta linha uma empresa bloqueada por falta de pagamento
  // continuaria disparando para a base inteira.
  if (await empresaBloqueada(supabase, d.company_id)) {
    return { id: d.id, skipped: "cobranca_bloqueada" };
  }

  // Agendado que venceu → inicia.
  if (d.status === "agendado") {
    if (d.scheduled_at && new Date(d.scheduled_at).getTime() <= Date.now()) {
      await supabase.from("disparos").update({ status: "em_andamento", started_at: d.started_at ?? new Date().toISOString() }).eq("id", d.id);
      d.status = "em_andamento";
    } else {
      return { id: d.id, skipped: "agendado_futuro" };
    }
  }

  if (d.status !== "em_andamento") return { id: d.id, skipped: d.status };
  if (!d.automation_id) {
    await supabase.from("disparos").update({ status: "erro" }).eq("id", d.id);
    return { id: d.id, error: "sem_automacao" };
  }

  const rhythm: Rhythm = (["normal", "turbo", "lento", "humano"].includes(d.rhythm) ? d.rhythm : "normal") as Rhythm;
  const batchSize = RHYTHM_BATCH[rhythm];
  const delayMs = RHYTHM_DELAY_MS[rhythm];

  // Próximo lote: itens ainda não iniciados.
  const { data: batch } = await supabase
    .from("disparo_itens")
    .select("id, lead_id")
    .eq("disparo_id", d.id)
    .eq("status", "nao_iniciado")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (!batch || batch.length === 0) {
    // Nada para iniciar. Se também não há nada em andamento → concluído.
    const { count: remaining } = await supabase
      .from("disparo_itens")
      .select("id", { count: "exact", head: true })
      .eq("disparo_id", d.id)
      .in("status", ["pendente", "em_execucao"]);
    if ((remaining ?? 0) === 0) {
      await supabase.from("disparos").update({ status: "concluido", completed_at: new Date().toISOString() }).eq("id", d.id);
      return { id: d.id, done: true };
    }
    return { id: d.id, waiting: remaining };
  }

  // Marca o lote como "pendente" (enviado, aguardando início).
  const ids = batch.map((b) => b.id);
  await supabase.from("disparo_itens").update({ status: "pendente" }).in("id", ids);

  let ok = 0, err = 0;
  for (const item of batch) {
    await supabase.from("disparo_itens").update({ status: "em_execucao", sent_at: new Date().toISOString() }).eq("id", item.id);
    try {
      const resp = await fetch(`${baseUrl}/functions/v1/automation-runner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          trigger_type: "lead_manual",
          company_id: d.company_id,
          lead_id: item.lead_id,
          automation_id: d.automation_id,
          context: {},
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && (json?.matched ?? 0) > 0) {
        await supabase.from("disparo_itens").update({ status: "concluido", error_message: null }).eq("id", item.id);
        ok++;
      } else {
        const msg = !resp.ok ? `HTTP ${resp.status}` : "Automação inativa ou gatilho não corresponde";
        await supabase.from("disparo_itens").update({ status: "erro", error_message: msg }).eq("id", item.id);
        err++;
      }
    } catch (e) {
      await supabase.from("disparo_itens").update({ status: "erro", error_message: String(e) }).eq("id", item.id);
      err++;
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  // Se não sobrou nenhum item por iniciar, marca concluído.
  const { count: left } = await supabase
    .from("disparo_itens")
    .select("id", { count: "exact", head: true })
    .eq("disparo_id", d.id)
    .in("status", ["nao_iniciado", "pendente", "em_execucao"]);
  if ((left ?? 0) === 0) {
    await supabase.from("disparos").update({ status: "concluido", completed_at: new Date().toISOString() }).eq("id", d.id);
  }

  return { id: d.id, batch: batch.length, ok, err };
}
