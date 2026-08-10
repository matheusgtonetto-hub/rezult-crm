// Rezult CRM — Google Free/Busy Edge Function
//
// Diz quais intervalos já estão ocupados na agenda Google de cada vendedor.
//
// Por que existe: a checagem de conflito do agente olhava só a tabela
// `activities` do CRM. Compromisso que o vendedor cria direto no Google
// Calendar (médico, almoço, aula, bloqueio pessoal) era invisível, e o agente
// marcava reunião em cima. Quem descobria era o vendedor, na hora.
//
// Chamada só server-to-server pelo agent-sds-qualify, com o segredo interno.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getGoogleAccessToken } from "../_shared/google-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

type Intervalo = { start: string; end: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const configurado = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";
  if (configurado === "") {
    console.error("[google-freebusy] AGENT_INTERNAL_SECRET não configurado — a checagem de agenda do Google fica inativa.");
    return json({ error: "server_secret_not_configured" }, 503);
  }
  if ((req.headers.get("x-internal-secret") ?? "") !== configurado) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { company_id?: string; user_ids?: string[]; time_min?: string; time_max?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { company_id, user_ids = [], time_min, time_max } = body;
  if (!company_id || !user_ids.length || !time_min || !time_max) {
    return json({ error: "missing_params" }, 400);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const ocupados: Record<string, Intervalo[]> = {};
  // Vendedores cuja agenda NÃO pôde ser lida. Quem chama precisa saber a
  // diferença entre "está livre" e "não consegui verificar" — tratar falha
  // como agenda vazia é o que produz reunião marcada em cima de outra.
  const naoVerificados: string[] = [];

  for (const userId of user_ids) {
    const token = await getGoogleAccessToken(db, userId, company_id);
    if (!token.ok) { naoVerificados.push(userId); continue; }

    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ timeMin: time_min, timeMax: time_max, items: [{ id: "primary" }] }),
      });
      if (!res.ok) {
        console.error(`[google-freebusy] consulta falhou para ${userId}:`, res.status, await res.text());
        naoVerificados.push(userId);
        continue;
      }
      const data = await res.json() as { calendars?: Record<string, { busy?: Intervalo[]; errors?: unknown[] }> };
      const agenda = data.calendars?.primary;
      if (agenda?.errors?.length) {
        console.error(`[google-freebusy] Google devolveu erro de calendário para ${userId}:`, JSON.stringify(agenda.errors));
        naoVerificados.push(userId);
        continue;
      }
      ocupados[userId] = agenda?.busy ?? [];
    } catch (e) {
      console.error(`[google-freebusy] exceção para ${userId}:`, e);
      naoVerificados.push(userId);
    }
  }

  return json({ ok: true, busy: ocupados, nao_verificados: naoVerificados });
});
