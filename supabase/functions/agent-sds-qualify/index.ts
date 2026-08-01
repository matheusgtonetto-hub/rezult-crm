import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWa, type ZapiCreds } from "../_shared/whatsapp-send.ts";

// Agente SDS: qualifica leads no multiatendimento com objetivo FIXO de
// agendar reunião qualificada pro time de closers. Disparado pelos webhooks
// de WhatsApp (zapi-webhook/dapi-webhook/cloud-api-webhook) após uma
// mensagem inbound ser salva. meta-webhook é Instagram — fora de escopo.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Objetivo e metodologia FIXOS — definidos pelo Rezult, não vêm do banco,
// não são editáveis pelo cliente. Isso é a IP do produto.
const SDS_METHODOLOGY = `
Você é o agente SDS (Sales Development Specialist) do Rezult CRM.
Seu único objetivo é: qualificar o lead E agendar uma reunião com o time de closers.
Filosofia: melhor perder um lead cedo do que perder um deal tarde — não force
reunião com quem não é ICP. Faça perguntas de descoberta antes de oferecer horário.
Nunca revele preço antes de entender a dor do lead.

IMPORTANTE: você não tem outro canal de resposta além das tools. Toda mensagem
que o lead deve receber PRECISA ser enviada via enviar_mensagem — nunca responda
só com texto solto, isso não chega ao lead.
`.trim();

const TOOLS = [
  {
    name: "qualificar_lead",
    description: "Registra o resultado da qualificação do lead com score e motivo.",
    input_schema: {
      type: "object",
      properties: {
        score: { type: "number" },
        qualificado: { type: "boolean" },
        motivo: { type: "string" },
      },
      required: ["score", "qualificado", "motivo"],
    },
  },
  {
    name: "agendar_reuniao_closer",
    description: "Agenda reunião no calendário do closer responsável, quando o lead está qualificado e aceitou um horário.",
    input_schema: {
      type: "object",
      properties: {
        start_datetime: { type: "string", description: "formato YYYY-MM-DDTHH:mm:ss, horário de Brasília" },
        duration_minutes: { type: "number" },
      },
      required: ["start_datetime"],
    },
  },
  {
    name: "mover_pipeline",
    description: "Move o negócio para outra etapa do funil.",
    input_schema: {
      type: "object",
      properties: { coluna_id: { type: "string" } },
      required: ["coluna_id"],
    },
  },
  {
    name: "enviar_mensagem",
    description: "Envia a próxima mensagem para o lead no WhatsApp.",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" } },
      required: ["texto"],
    },
  },
  {
    name: "escalar_humano",
    description: "Passa a conversa para um atendente humano.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
];

// ─── Resolução de telefone brasileiro (portado de MultiatendimentoPage.tsx) ─
function normalizeBrPhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}
function phonesMatch(a: string, b: string): boolean {
  const na = normalizeBrPhone(a);
  const nb = normalizeBrPhone(b);
  if (na.length < 10 || nb.length < 10) return false;
  return na.slice(-10) === nb.slice(-10);
}
// Todas as variantes plausíveis de como o telefone pode estar salvo (com/sem
// 55, com/sem o 9º dígito) — usado pra buscar histórico com IN em vez de
// igualdade exata, já que whatsapp_messages.phone e leads.whatsapp não têm
// formato consistente entre si (confirmado com dado real).
function phoneVariants(raw: string): string[] {
  const core = normalizeBrPhone(raw);
  if (core.length < 10) {
    const d = (raw ?? "").replace(/\D/g, "");
    return d ? [d] : [];
  }
  const ddd = core.slice(0, 2);
  const eight = core.slice(-8);
  const with9 = `${ddd}9${eight}`;
  return [...new Set([core, with9, `55${core}`, `55${with9}`])];
}

// ─── Resolução telefone → lead ──────────────────────────────────────────────
// Os 3 webhooks (zapi/dapi/cloud_api) só têm phone + company_id disponíveis
// no momento em que a mensagem chega — não existe conversationId confiável
// nesse ponto do fluxo (whatsapp_conversations não é gravada por eles).
async function resolveLead(
  db: ReturnType<typeof createClient>,
  companyId: string,
  phone: string,
): Promise<Record<string, unknown> | null> {
  const { data: candidates } = await db
    .from("leads")
    .select("*")
    .eq("company_id", companyId)
    .not("whatsapp", "is", null);
  return (candidates ?? []).find((l) => phonesMatch(String(l.whatsapp ?? ""), phone)) ?? null;
}

// ─── Tag "Agente" na conversa: liga/desliga o agente POR conversa, em cima do
// liga/desliga por empresa que já existe em `agents.active`. Sem a tag, o
// agente fica desligado nessa conversa mesmo com a empresa toda habilitada --
// V1 do handoff manual (usuário adiciona a tag pra "transferir" a conversa
// pro agente cuidar). upsertConversationForMessage já roda antes desta
// function ser chamada (ver dapi/zapi/cloud-api-webhook), então a linha de
// whatsapp_conversations pra este telefone já existe nesse ponto.
async function hasAgentTag(
  db: ReturnType<typeof createClient>,
  companyId: string,
  phone: string,
): Promise<boolean> {
  const { data: conversations } = await db
    .from("whatsapp_conversations")
    .select("phone, tags")
    .eq("company_id", companyId)
    .not("phone", "is", null);
  return (conversations ?? []).some((c) =>
    phonesMatch(String(c.phone ?? ""), phone) && ((c.tags as string[] | null) ?? []).includes("Agente")
  );
}

// ─── Seleção de closer (menor carga nos últimos 7 dias, com Google conectado) ─
async function pickAvailableCloser(
  db: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
): Promise<{ userId: string } | null> {
  const { data: closers } = await db
    .from("agent_closers")
    .select("user_id")
    .eq("agent_id", agentId)
    .eq("company_id", companyId);
  if (!closers?.length) return null;

  const eligible: string[] = [];
  for (const c of closers) {
    const { data: token } = await db
      .from("google_oauth_tokens")
      .select("id")
      .eq("user_id", c.user_id as string)
      .maybeSingle();
    if (token) eligible.push(c.user_id as string);
  }
  if (!eligible.length) return null;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const counts = await Promise.all(
    eligible.map(async (userId) => {
      const { count } = await db
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("owner_id", userId)
        .eq("type", "meeting")
        .gte("scheduled_at", sevenDaysAgo);
      return { userId, count: count ?? 0 };
    }),
  );
  counts.sort((a, b) => a.count - b.count);
  return { userId: counts[0].userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const internalSecret = req.headers.get("x-internal-secret") ?? "";
  const configuredSecret = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";
  if (configuredSecret === "" || internalSecret !== configuredSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { companyId?: string; phone?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { companyId, phone } = body;
  if (!companyId || !phone) return json({ error: "missing_params" }, 400);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  // ⚠️ Service role BYPASSA o RLS (is_member_of) — diferente de chamadas do
  // browser. Por isso TODA query abaixo filtra company_id manualmente no
  // código, já que o banco não vai fazer esse isolamento sozinho aqui.

  const lead = await resolveLead(db, companyId, phone);
  if (!lead) return json({ skipped: "lead_not_resolved" }, 200);
  const leadId = lead.id as string;

  // Chave de IA: exige a chave própria da empresa (BYOK). Sem fallback pra uma
  // chave global — se a empresa desativar/apagar a própria chave com o agente
  // ainda ligado, o correto é parar de atuar, não passar a consumir cota de
  // uma chave compartilhada com outras empresas.
  const { data: companyKey } = await db
    .from("ai_provider_keys")
    .select("api_key")
    .eq("company_id", companyId)
    .eq("provider", "anthropic")
    .eq("active", true)
    .maybeSingle();
  const apiKey = companyKey?.api_key || "";
  if (!apiKey) return json({ skipped: "no_company_api_key" }, 200);

  const { data: agent } = await db
    .from("agents")
    .select("id, model, custom_context")
    .eq("company_id", companyId)
    .eq("type", "SDS")
    .eq("active", true)
    .single();
  if (!agent) return json({ skipped: "no_active_agent" }, 200);

  // Gate por conversa: mesmo com o agente ativo pra empresa, só atua nas
  // conversas que o usuário marcou explicitamente com a tag "Agente".
  if (!(await hasAgentTag(db, companyId, phone))) return json({ skipped: "no_agent_tag" }, 200);

  const { data: messages } = await db
    .from("whatsapp_messages")
    .select("from_me, body")
    .eq("company_id", companyId)
    .in("phone", phoneVariants(String(lead.whatsapp ?? "")))
    .order("created_at", { ascending: false })
    .limit(30);

  const transcript = (messages ?? []).reverse()
    .map((m) => `${m.from_me ? "Atendente" : "Lead"}: ${m.body}`)
    .join("\n");

  const system = `${SDS_METHODOLOGY}\n\n${agent.custom_context ?? ""}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: agent.model ?? "claude-opus-4-8",
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages: [{ role: "user", content: `Conversa até agora:\n${transcript}` }],
    }),
  });

  if (!res.ok) {
    console.error("[agent-sds-qualify] Anthropic error:", res.status, await res.text());
    return json({ error: "ai_request_failed" }, 502);
  }

  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const toolCalls = (data.content ?? []).filter((b: any) => b.type === "tool_use");

  const actions: string[] = [];
  for (const call of toolCalls) {
    await executeAgentTool(db, call, { companyId, leadId, agentId: agent.id as string, lead });
    actions.push(call.name);
  }

  return json({ ok: true, actions });
});

// deno-lint-ignore no-explicit-any
async function executeAgentTool(
  db: ReturnType<typeof createClient>,
  call: any,
  ctx: { companyId: string; leadId: string; agentId: string; lead: Record<string, unknown> },
) {
  const input = call.input ?? {};

  switch (call.name) {
    case "qualificar_lead": {
      const currentCustom = (ctx.lead.custom_field_values as Record<string, unknown>) ?? {};
      const currentTags = (ctx.lead.tags as string[]) ?? [];
      const newTags = new Set(currentTags.filter((t) => t !== "SDS: Qualificado" && t !== "SDS: Não qualificado"));
      newTags.add(input.qualificado ? "SDS: Qualificado" : "SDS: Não qualificado");
      await db.from("leads").update({
        custom_field_values: { ...currentCustom, sds_score: input.score, sds_motivo: input.motivo },
        tags: Array.from(newTags),
      }).eq("id", ctx.leadId).eq("company_id", ctx.companyId);
      break;
    }

    case "agendar_reuniao_closer": {
      const closer = await pickAvailableCloser(db, ctx.companyId, ctx.agentId);
      if (!closer) {
        // ninguém disponível — escala pra humano em vez de falhar silenciosamente
        await executeAgentTool(db, { name: "escalar_humano", input: { motivo: "Nenhum closer com Google Calendar conectado disponível" } }, ctx);
        break;
      }

      const duration = Number(input.duration_minutes) || 60;
      const calRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
        },
        body: JSON.stringify({
          title: `Reunião — ${ctx.lead.name ?? "Lead"}`,
          description: "Agendado automaticamente pelo agente SDS.",
          start_datetime: input.start_datetime,
          duration_minutes: duration,
          create_meet: true,
          company_id: ctx.companyId,
          user_id: closer.userId,
        }),
      });

      if (!calRes.ok) {
        console.error("[agent-sds-qualify] google-calendar-event falhou:", await calRes.text());
        break;
      }
      const calData = await calRes.json();

      await db.from("activities").insert({
        company_id: ctx.companyId,
        owner_id: closer.userId,
        lead_id: ctx.leadId,
        type: "meeting",
        title: `Reunião — ${ctx.lead.name ?? "Lead"}`,
        // -03:00 explícito: google-calendar-event grava no Google como
        // America/Sao_Paulo: sem o offset aqui, o Postgres assumiria UTC e o
        // horário salvo no CRM ficaria 3h errado em relação ao Google Calendar.
        scheduled_at: `${input.start_datetime}-03:00`,
        duration_minutes: duration,
        meet_link: calData.meet_link ?? null,
        gcal_event_id: calData.event_id ?? null,
        description: "Agendado automaticamente pelo agente SDS.",
      });
      break;
    }

    case "mover_pipeline": {
      await db.from("leads").update({ column_id: input.coluna_id }).eq("id", ctx.leadId).eq("company_id", ctx.companyId);
      break;
    }

    case "enviar_mensagem": {
      const { data: conn } = await db
        .from("whatsapp_connections")
        .select("provider, instance_id, token, client_token")
        .eq("company_id", ctx.companyId)
        .eq("connected", true)
        .maybeSingle();
      if (!conn) break;

      const creds: ZapiCreds = {
        instanceId: String(conn.instance_id),
        token: String(conn.token),
        clientToken: conn.client_token ? String(conn.client_token) : null,
        provider: (["dapi", "cloud_api"].includes(String(conn.provider)) ? String(conn.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
      };
      const phone = String(ctx.lead.whatsapp ?? "");
      await sendWa(creds, { kind: "text", phone, message: String(input.texto ?? "") });
      // owner_id é NOT NULL aqui também — mesmo padrão do automation-runner,
      // usa o responsável do lead.
      await db.from("whatsapp_messages").insert({
        company_id: ctx.companyId,
        owner_id: ctx.lead.owner_id as string,
        instance_id: creds.instanceId,
        phone,
        from_me: true,
        body: input.texto,
        type: "text",
      });
      break;
    }

    case "escalar_humano": {
      // owner_id é NOT NULL em activities — usa o responsável já atribuído ao lead
      await db.from("activities").insert({
        company_id: ctx.companyId,
        owner_id: ctx.lead.owner_id as string,
        lead_id: ctx.leadId,
        type: "note",
        title: "Agente SDS escalou pra atendimento humano",
        description: String(input.motivo ?? "sem motivo informado"),
      });
      break;
    }
  }
}
