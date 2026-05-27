// Rezult CRM — Automation Runner Edge Function
// Executa automações em resposta a eventos do banco de dados.
// Chamado pelos triggers PostgreSQL via pg_net.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TriggerPayload {
  trigger_type: string;
  company_id: string;
  lead_id: string;
  context: {
    tag_ids_added?: string[];
    tag_ids_removed?: string[];
    old_column_id?: string;
    new_column_id?: string;
    pipeline_id?: string;
    old_responsible?: string;
    new_responsible?: string;
    loss_reason_id?: string;
    parent_automation_id?: string;
  };
}

interface TriggerConfig {
  categoryId: string;
  triggerId: string;
  label: string;
  description: string;
  configData?: Record<string, string | boolean | number>;
}

interface ActionItem {
  id: string;
  categoryId: string;
  actionId: string;
  label: string;
  config?: Record<string, string | boolean | number>;
}

interface CanvasNode {
  id: string;
  type: string;
  trigger?: TriggerConfig | null;
  actionItems?: ActionItem[];
}

interface AutomationFlow {
  nodes: CanvasNode[];
  trigger: TriggerConfig | null;
}

interface AutomationRecord {
  id: string;
  name: string;
  flow: AutomationFlow;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("AUTOMATION_SECRET");
  const auth = req.headers.get("Authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: TriggerPayload;
  try {
    payload = (await req.json()) as TriggerPayload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const { trigger_type, company_id, lead_id } = payload;
  if (!trigger_type || !company_id || !lead_id) {
    return new Response("Missing required fields", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: automations, error } = await supabase
    .from("automations")
    .select("id, name, flow")
    .eq("company_id", company_id)
    .eq("active", true);

  if (error) {
    console.error("Failed to load automations:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: { id: string; name: string; status: string; error?: string }[] = [];

  for (const automation of (automations as AutomationRecord[] ?? [])) {
    const flow = automation.flow;
    const trigger = flow?.trigger;
    if (!trigger || trigger.triggerId !== trigger_type) continue;
    if (!await matchesTriggerConfig(supabase, trigger, payload)) continue;

    try {
      await executeFlow(supabase, flow, payload);
      results.push({ id: automation.id, name: automation.name, status: "ok" });
    } catch (err) {
      console.error(`Automation ${automation.id} (${automation.name}) failed:`, err);
      results.push({ id: automation.id, name: automation.name, status: "error", error: String(err) });
    }
  }

  console.log(`[${trigger_type}] lead=${lead_id} matched=${results.length}`);
  return Response.json({ trigger_type, lead_id, matched: results.length, results });
});

// ─── Trigger filter matching ──────────────────────────────────────────────────

async function matchesTriggerConfig(
  supabase: SupabaseClient,
  trigger: TriggerConfig,
  payload: TriggerPayload,
): Promise<boolean> {
  const cfg = trigger.configData ?? {};

  switch (trigger.triggerId) {
    case "tag_adicionada": {
      const cfgTagIds = splitIds(cfg.tags as string);
      if (!cfgTagIds.length) return true;
      const tagsAdded = payload.context.tag_ids_added ?? [];
      if (cfgTagIds.some((t) => tagsAdded.includes(t))) return true;
      // leads.tags stores names — resolve IDs to names and compare
      const { data: rows } = await supabase.from("tags").select("name").in("id", cfgTagIds);
      const names = (rows ?? []).map((r: { name: string }) => r.name);
      return names.some((n: string) => tagsAdded.includes(n));
    }
    case "tag_removida": {
      const cfgTagIds = splitIds(cfg.tags as string);
      if (!cfgTagIds.length) return true;
      const tagsRemoved = payload.context.tag_ids_removed ?? [];
      if (cfgTagIds.some((t) => tagsRemoved.includes(t))) return true;
      const { data: rows } = await supabase.from("tags").select("name").in("id", cfgTagIds);
      const names = (rows ?? []).map((r: { name: string }) => r.name);
      return names.some((n: string) => tagsRemoved.includes(n));
    }
    case "neg_movido": {
      const cfgStage = cfg.stage as string;
      if (!cfgStage) return true;
      return payload.context.new_column_id === cfgStage;
    }
    case "atend_atribuido": {
      const cfgAtend = cfg.atendente as string;
      if (!cfgAtend) return true;
      return payload.context.new_responsible === cfgAtend;
    }
    case "atend_retirado": {
      const cfgAtend = cfg.atendente as string;
      if (!cfgAtend) return true;
      return payload.context.old_responsible === cfgAtend;
    }
    default:
      return true;
  }
}

// ─── Flow execution ───────────────────────────────────────────────────────────

async function executeFlow(
  supabase: SupabaseClient,
  flow: AutomationFlow,
  payload: TriggerPayload,
) {
  // Execute action nodes in canvas order
  const actionNodes = (flow.nodes ?? []).filter((n) => n.type === "acoes");
  for (const node of actionNodes) {
    for (const item of (node.actionItems ?? [])) {
      await executeAction(supabase, item, payload);
    }
  }
}

// ─── Action execution ─────────────────────────────────────────────────────────

async function executeAction(
  supabase: SupabaseClient,
  item: ActionItem,
  payload: TriggerPayload,
) {
  const cfg = item.config ?? {};
  const { lead_id, company_id } = payload;

  switch (item.actionId) {
    // ── Negócios ──────────────────────────────────────────────────────────────

    case "mover_etapa":
    case "criar_negocio":
    case "duplicar_negocio": {
      const columnId = cfg.etapa as string;
      if (!columnId) return;
      const update: Record<string, unknown> = { column_id: columnId };
      if (cfg.pipeline) update.pipeline_id = cfg.pipeline;
      await supabase.from("leads").update(update).eq("id", lead_id);
      break;
    }

    case "ganhar_negocio": {
      await supabase.from("leads").update({ status: "won" }).eq("id", lead_id);
      break;
    }

    case "restaurar_negocio": {
      await supabase.from("leads").update({ status: "open" }).eq("id", lead_id);
      break;
    }

    case "perder_negocio": {
      const update: Record<string, unknown> = { status: "lost" };
      if (cfg.motivo && cfg.motivo !== "outro") update.loss_reason_id = cfg.motivo;
      await supabase.from("leads").update(update).eq("id", lead_id);
      break;
    }

    case "transf_atend_neg":
    case "transf_atend_lead": {
      const atendente = cfg.atendente as string;
      if (!atendente) return;
      await supabase.from("leads").update({
        responsible: atendente,
        responsibles: [atendente],
      }).eq("id", lead_id);
      break;
    }

    case "remover_atend_neg":
    case "remover_atend_lead": {
      await supabase.from("leads").update({
        responsible: "",
        responsibles: [],
      }).eq("id", lead_id);
      break;
    }

    case "add_produto_neg": {
      const productId = cfg.produto as string;
      if (!productId) return;
      await supabase.from("leads").update({ product_id: productId }).eq("id", lead_id);
      break;
    }

    case "rem_produto_neg": {
      await supabase.from("leads").update({ product_id: null }).eq("id", lead_id);
      break;
    }

    case "remover_negocio": {
      await supabase.from("leads").delete().eq("id", lead_id);
      break;
    }

    // ── Leads ─────────────────────────────────────────────────────────────────

    case "adicionar_tags": {
      const tagIds = splitIds(cfg.tags as string);
      if (!tagIds.length) return;
      // leads.tags stores names, not UUIDs — resolve before merging
      const { data: tagRows } = await supabase.from("tags").select("name").in("id", tagIds);
      const tagNames = (tagRows ?? []).map((r: { name: string }) => r.name);
      if (!tagNames.length) return;
      const { data: lead } = await supabase.from("leads").select("tags").eq("id", lead_id).single();
      const current = (lead?.tags as string[]) ?? [];
      const merged = [...new Set([...current, ...tagNames])];
      await supabase.from("leads").update({ tags: merged }).eq("id", lead_id);
      break;
    }

    case "remover_tags": {
      const tagIds = splitIds(cfg.tags as string);
      if (!tagIds.length) return;
      // leads.tags stores names, not UUIDs — resolve before filtering
      const { data: tagRows } = await supabase.from("tags").select("name").in("id", tagIds);
      const tagNames = (tagRows ?? []).map((r: { name: string }) => r.name);
      if (!tagNames.length) return;
      const { data: lead } = await supabase.from("leads").select("tags").eq("id", lead_id).single();
      const current = (lead?.tags as string[]) ?? [];
      await supabase.from("leads").update({
        tags: current.filter((t) => !tagNames.includes(t)),
      }).eq("id", lead_id);
      break;
    }

    case "adicionar_listas": {
      const listId = cfg.lista as string;
      if (!listId) return;
      await supabase.from("list_leads")
        .upsert({ list_id: listId, lead_id }, { onConflict: "list_id,lead_id" });
      break;
    }

    case "remover_listas": {
      const listId = cfg.lista as string;
      if (!listId) return;
      await supabase.from("list_leads")
        .delete()
        .eq("list_id", listId)
        .eq("lead_id", lead_id);
      break;
    }

    case "comentario_lead": {
      const comentario = cfg.comentario as string;
      if (!comentario) return;
      const { data: lead } = await supabase.from("leads").select("owner_id").eq("id", lead_id).single();
      await supabase.from("activities").insert({
        owner_id: lead?.owner_id,
        lead_id,
        type: "note",
        description: comentario,
        date: new Date().toISOString(),
        user_name: "Automação",
      });
      break;
    }

    case "deletar_lead": {
      await supabase.from("leads").delete().eq("id", lead_id);
      break;
    }

    // ── Atividades ────────────────────────────────────────────────────────────

    case "criar_atividade": {
      const titulo = cfg.titulo as string;
      if (!titulo) return;
      const { data: lead } = await supabase.from("leads").select("owner_id").eq("id", lead_id).single();
      const tipoMap: Record<string, string> = {
        reuniao: "meeting",
        ligacao: "call",
        email: "email",
        tarefa: "task",
        outro: "note",
      };
      await supabase.from("activities").insert({
        owner_id: lead?.owner_id,
        lead_id,
        type: tipoMap[cfg.tipo as string] ?? "note",
        title: titulo,
        description: (cfg.descricao as string) ?? "",
        date: new Date().toISOString(),
        user_name: "Automação",
      });
      break;
    }

    // ── Sistema ───────────────────────────────────────────────────────────────

    case "iniciar_automacao": {
      const automacaoId = cfg.automacao_id as string;
      if (!automacaoId) return;
      // Load and execute the target automation directly (no HTTP round-trip)
      const { data: targetAuto } = await supabase
        .from("automations")
        .select("id, name, flow")
        .eq("id", automacaoId)
        .eq("company_id", company_id)
        .eq("active", true)
        .single();
      if (targetAuto) {
        console.log(`Iniciando sub-automação: ${(targetAuto as AutomationRecord).name}`);
        await executeFlow(supabase, (targetAuto as AutomationRecord).flow, payload);
      }
      break;
    }

    default:
      console.log(`Action "${item.actionId}" não tem handler — ignorada`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitIds(val: string | undefined): string[] {
  return (val ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
