// Rezult CRM — Agent Business Hours Runner Edge Function
// Retoma conversas que o agente deixou sem resposta por causa do gate de
// "horário de atendimento" (aba Configurações, ver isWithinBusinessHours em
// agent-sds-qualify/index.ts). Esse gate só barra a resposta na hora --
// não agenda nada. Sem este runner, uma conversa que só recebeu 1 mensagem
// fora do horário e nunca mais escreveu ficaria sem resposta pra sempre.
//
// Roda a cada minuto (mesma granularidade dos outros runners de agente) e,
// pra cada agente SDS ativo com horário de atendimento restrito e
// atualmente DENTRO da janela, varre os negócios (leads) com a tag "Agente"
// cuja última mensagem é do lead (from_me=false) e já tem pelo menos
// STALE_MS de idade -- esse buffer evita corrida com o caminho normal
// (webhook em tempo real), que já responde em segundos quando está tudo ok.
// Uma vez que o agente responde, a última mensagem vira from_me=true e o
// negócio some da varredura sozinho -- não precisa de tabela de estado.
//
// Trava contra corrida entre ticks: antes de invocar, reivindica o telefone
// inserindo em agent_business_hours_claims (unique company_id+phone) -- se
// outro tick já reivindicou (ainda em voo), o INSERT falha por conflito e
// este tick pula a conversa. A claim é liberada (deletada) assim que a
// chamada ao agente termina, e claims órfãs (function que crashou antes de
// liberar) são limpas no início de cada execução (mais de 2 minutos).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

// Espelho de BehaviorConfig (só os campos usados aqui) -- agent-sds-qualify/
// index.ts tem a versão completa. Deno não importa de src/, mantém manual.
type BehaviorConfig = {
  fuso_horario?: string;
  horario_atendimento_ativo?: boolean;
  horario_atendimento_inicio?: string;
  horario_atendimento_fim?: string;
  horario_atendimento_dias?: string[];
};

// Mesmo mapeamento de agent-sds-qualify/index.ts (WEEKDAY_EN_TO_PT) --
// dia da semana NO FUSO do agente, via Intl (getUTCDay() não serve, pode
// divergir perto da meia-noite).
const WEEKDAY_EN_TO_PT: Record<string, string> = {
  Sun: "Domingo", Mon: "Segunda", Tue: "Terça", Wed: "Quarta", Thu: "Quinta", Fri: "Sexta", Sat: "Sábado",
};
function currentWeekdayPt(timezone: string): string {
  const en = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  return WEEKDAY_EN_TO_PT[en] ?? "Segunda";
}

// Mesma lógica de agent-sds-qualify/index.ts (isWithinBusinessHours) --
// duplicada porque Deno edge functions não compartilham código fora de
// _shared/, e essa é pequena o suficiente pra não valer a extração.
function isWithinBusinessHours(cfg: BehaviorConfig): boolean {
  if (!cfg.horario_atendimento_ativo) return false; // sem restrição, não há o que "retomar"
  const timezone = cfg.fuso_horario || "America/Sao_Paulo";
  if (cfg.horario_atendimento_dias !== undefined && !cfg.horario_atendimento_dias.includes(currentWeekdayPt(timezone))) {
    return false;
  }
  const nowHHMM = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23", hour: "2-digit", minute: "2-digit",
  }).format(new Date());
  const inicio = cfg.horario_atendimento_inicio || "00:00";
  const fim = cfg.horario_atendimento_fim || "23:59";
  return nowHHMM >= inicio && nowHHMM <= fim;
}

// Mesmas variantes de telefone usadas em agent-sds-qualify/index.ts --
// whatsapp_conversations.phone e whatsapp_messages.phone não têm formato
// consistente entre si (com/sem 55, com/sem o 9º dígito).
function normalizeBrPhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}
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

const STALE_MS = 3 * 60 * 1000;

interface AgentRow {
  id: string;
  company_id: string;
  behavior_config: BehaviorConfig | null;
  activation_tag: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Só o cron (segredo do motor) pode acionar esta function -- mesmo padrão
  // de agent-response-runner/agent-followup-runner.
  const { data: cfg } = await supabase.from("automation_runner_config").select("key, value");
  const cfgMap = Object.fromEntries((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const automationSecret = cfgMap.automation_secret ?? "";
  const supabaseUrl = cfgMap.supabase_url ?? Deno.env.get("SUPABASE_URL") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!automationSecret || auth !== `Bearer ${automationSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const agentSecret = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";

  // Autolimpeza de claims órfãs -- se uma invocação anterior crashou antes
  // de liberar a claim, ela não pode travar essa conversa pra sempre. 2min
  // é folga generosa acima do que uma resposta normal do agente leva.
  await supabase
    .from("agent_business_hours_claims")
    .delete()
    .lt("claimed_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());

  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id, company_id, behavior_config, activation_tag")
    .eq("type", "SDS")
    .eq("active", true);
  if (agentsError) return json({ error: agentsError.message }, 500);

  const dueAgents = ((agents ?? []) as AgentRow[]).filter((a) => isWithinBusinessHours(a.behavior_config ?? {}));

  const summary: Record<string, unknown>[] = [];
  for (const agent of dueAgents) {
    // leads.tags é a fonte real da verdade (mesmo motivo de
    // agent-sds-qualify/index.ts::hasAgentTag) -- whatsapp_conversations.tags
    // só reflete isso quando alguém abre a conversa no Multiatendimento,
    // então tag adicionada por automação ou pelo card do Pipeline nunca
    // chegava lá.
    const { data: taggedLeads } = await supabase
      .from("leads")
      .select("whatsapp, tags")
      .eq("company_id", agent.company_id)
      // Tag de ativação DESTE agente, não a string fixa: cada agente tem a
      // sua (agents.activation_tag), e com "Agente" cravado aqui um agente de
      // tag própria nunca retomaria conversa na abertura do expediente.
      .contains("tags", [String(agent.activation_tag ?? "Agente")])
      .not("whatsapp", "is", null);

    for (const lead of taggedLeads ?? []) {
      const phone = String(lead.whatsapp ?? "");
      const variants = phoneVariants(phone);
      if (!variants.length) continue;

      const { data: lastMsg } = await supabase
        .from("whatsapp_messages")
        .select("from_me, created_at")
        .eq("company_id", agent.company_id)
        .in("phone", variants)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastMsg || lastMsg.from_me) continue; // já respondida, ou sem histórico

      const ageMs = Date.now() - new Date(lastMsg.created_at as string).getTime();
      if (ageMs < STALE_MS) continue; // pode estar em processamento pelo caminho normal agora

      // Trava: só um tick por vez processa cada telefone. Conflito de
      // unique(company_id, phone) = outro tick já está com essa conversa.
      const { error: claimError } = await supabase
        .from("agent_business_hours_claims")
        .insert({ company_id: agent.company_id, phone });
      if (claimError) continue; // já reivindicada por outro tick em voo

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/agent-sds-qualify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": agentSecret,
            "x-bypass-delay": "true",
          },
          body: JSON.stringify({ companyId: agent.company_id, phone }),
        });
        summary.push({ agent_id: agent.id, phone, ok: res.ok, status: res.status });
      } catch (e) {
        console.error(`[agent-business-hours-runner] ${agent.id}/${phone} falhou:`, e);
        summary.push({ agent_id: agent.id, phone, error: String(e) });
      } finally {
        await supabase
          .from("agent_business_hours_claims")
          .delete()
          .eq("company_id", agent.company_id)
          .eq("phone", phone);
      }
    }
  }

  return json({ ok: true, processed: summary.length, summary });
});
