// Rezult CRM — Agent Meeting Reminder Runner Edge Function
// Manda o lembrete da reunião marcada pelo agente. Em negócio de
// agendamento o prejuízo não está na captação, está no não comparecimento:
// entre marcar na terça e a reunião na sexta, o lead esfria e ninguém fala
// com ele.
//
// São DOIS lembretes por reunião (um distante e um próximo), com a
// antecedência de cada um configurada na aba Perfil.
//
// Este runner NÃO escreve a mensagem: ele só decide QUANDO cutucar e delega
// a redação e o envio ao agent-sds-qualify, que tem o histórico da conversa,
// o tom configurado, a linha de WhatsApp certa e o indicador de digitando.
// Mesmo padrão do agent-response-runner e do agent-followup-runner.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

type BehaviorConfig = {
  fuso_horario?: string;
  lembrete_reuniao_ativo?: boolean;
  lembrete_1_valor?: number;
  lembrete_1_unidade?: "minutos" | "horas";
  lembrete_2_valor?: number;
  lembrete_2_unidade?: "minutos" | "horas";
};

interface AgentRow {
  id: string;
  company_id: string;
  behavior_config: BehaviorConfig | null;
  activation_tag: string | null;
}

function antecedenciaMs(valor: number | undefined, unidade: string | undefined): number | null {
  const n = Number(valor);
  if (!n || n <= 0) return null;
  return n * (unidade === "horas" ? 3_600_000 : 60_000);
}

// Trava de madrugada: lembrete é hora certa e por isso NÃO respeita o
// horário de atendimento -- mas acordar o cliente às 3h destrói mais do que
// o lembrete salva. Entre 22h e 7h (no fuso do agente) o envio espera; como
// o cron roda a cada minuto, ele sai sozinho às 7h. A exceção é a reunião
// que acontece dentro da própria madrugada: aí o lembrete é urgente e vai.
function ehMadrugada(timezone: string): boolean {
  const hora = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23", hour: "2-digit",
  }).format(new Date()));
  return hora >= 22 || hora < 7;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cfgRows } = await supabase.from("automation_runner_config").select("key, value");
  const cfgMap = Object.fromEntries((cfgRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  const automationSecret = cfgMap.automation_secret ?? "";
  const supabaseUrl = cfgMap.supabase_url ?? Deno.env.get("SUPABASE_URL") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!automationSecret || auth !== `Bearer ${automationSecret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, company_id, behavior_config, activation_tag")
    .eq("type", "SDS")
    .eq("active", true);
  if (error) return json({ error: error.message }, 500);

  const agora = Date.now();
  const summary: Record<string, unknown>[] = [];

  for (const agent of ((agents ?? []) as AgentRow[])) {
    const cfg = agent.behavior_config ?? {};
    if (!cfg.lembrete_reuniao_ativo) continue;

    const janelas = [
      { indice: 1, ms: antecedenciaMs(cfg.lembrete_1_valor, cfg.lembrete_1_unidade) },
      { indice: 2, ms: antecedenciaMs(cfg.lembrete_2_valor, cfg.lembrete_2_unidade) },
    ].filter((j) => j.ms !== null) as { indice: number; ms: number }[];
    if (!janelas.length) continue;

    const timezone = cfg.fuso_horario || "America/Sao_Paulo";
    const maiorJanela = Math.max(...janelas.map((j) => j.ms));

    // Reuniões futuras dentro do maior alcance de lembrete. Só as criadas
    // pelo agente: reunião marcada à mão pelo vendedor não é assunto dele.
    const { data: reunioes } = await supabase
      .from("activities")
      .select("id, lead_id, scheduled_at")
      .eq("company_id", agent.company_id)
      .eq("type", "meeting")
      .eq("description", "Agendado automaticamente pelo agente SDS.")
      .gt("scheduled_at", new Date(agora).toISOString())
      .lte("scheduled_at", new Date(agora + maiorJanela).toISOString());

    for (const reuniao of reunioes ?? []) {
      const inicioMs = new Date(reuniao.scheduled_at as string).getTime();
      const faltaMs = inicioMs - agora;

      // Qual lembrete cabe agora: o de menor antecedência entre os que já
      // venceram. Se o de 24h passou sem enviar (agente estava desligado),
      // não faz sentido mandar "é amanhã" faltando 1h -- vale o mais preciso.
      const devidos = janelas.filter((j) => faltaMs <= j.ms).sort((a, b) => a.ms - b.ms);
      if (!devidos.length) continue;

      // Madrugada: segura, exceto se a reunião for dentro das próximas 2h.
      if (ehMadrugada(timezone) && faltaMs > 2 * 3_600_000) continue;

      // Gate da tag: se o negócio foi transferido pra um humano, quem cuida
      // do lembrete é ele. Consistente com todos os outros gates do agente.
      // Usa a tag de ativação DESTE agente (agents.activation_tag): com a
      // string fixa "Agente", agente com tag própria nunca mandaria lembrete.
      const { data: lead } = await supabase
        .from("leads").select("whatsapp, tags")
        .eq("id", reuniao.lead_id as string).eq("company_id", agent.company_id).maybeSingle();
      const tags = (lead?.tags as string[] | null) ?? [];
      if (!tags.includes(String(agent.activation_tag ?? "Agente"))) continue;
      const phone = String(lead?.whatsapp ?? "");
      if (!phone) continue;

      for (const janela of devidos) {
        // O INSERT é a trava: se outro tick já reivindicou este lembrete,
        // falha por unique(activity_id, indice) e este pula.
        const { error: claimErr } = await supabase
          .from("agent_meeting_reminders")
          .insert({ activity_id: reuniao.id, company_id: agent.company_id, indice: janela.indice });
        if (claimErr) continue;

        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/agent-sds-qualify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
              "x-bypass-delay": "true",
              "x-lembrete-reuniao": String(reuniao.scheduled_at),
            },
            body: JSON.stringify({ companyId: agent.company_id, phone }),
          });
          const payload = await res.json().catch(() => ({})) as { skipped?: string };
          // Não atuou (conversa finalizada, agente sem chave, etc.): libera a
          // trava pra tentar de novo no próximo tick, senão o lembrete se
          // perde por causa de um bloqueio temporário.
          if (payload?.skipped) {
            await supabase.from("agent_meeting_reminders")
              .delete().eq("activity_id", reuniao.id).eq("indice", janela.indice);
          }
          summary.push({ reuniao: reuniao.id, indice: janela.indice, skipped: payload?.skipped ?? null });
        } catch (e) {
          console.error(`[agent-meeting-reminder-runner] ${reuniao.id} falhou:`, e);
          await supabase.from("agent_meeting_reminders")
            .delete().eq("activity_id", reuniao.id).eq("indice", janela.indice);
        }
        break; // um lembrete por reunião por tick
      }
    }
  }

  return json({ ok: true, processed: summary.length, summary });
});
