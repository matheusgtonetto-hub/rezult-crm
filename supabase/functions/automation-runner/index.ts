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
    changed_fields?: Record<string, unknown>;
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

interface ConditionItem {
  id: string;
  categoryId: string;
  conditionId: string;
  label: string;
  config?: Record<string, string | boolean | number>;
}

interface EsperaConfig {
  type: "intervalo_semana" | "minutos" | "dias" | "horas" | "segundos" | "dia_horario" | "usuario_parou";
  days?: string[];
  startTime?: string;
  endTime?: string;
  timezone?: string;
  amount?: number;
  dateField?: string;
  dateStartTime?: string;
  dateEndTime?: string;
  dateTimezone?: string;
}

interface ApiRequest {
  id: string;
  name: string;
  type: "json" | "file";
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  params: { key: string; value: string }[];
  body: string;
  responseHeaders: { key: string; value: string }[];
}

interface ApiConfig {
  requests: ApiRequest[];
}

interface FieldOperation {
  id: string;
  type: "mapeamento";
  fieldKey: string;
  fieldLabel: string;
  value: string;
}

interface CanvasNode {
  id: string;
  type: string;
  trigger?: TriggerConfig | null;
  actionItems?: ActionItem[];
  conditionItems?: ConditionItem[];
  espera?: EsperaConfig;
  apiConfig?: ApiConfig;
  fieldOps?: FieldOperation[];
  parentId?: string | null;
  errorParentId?: string | null;
}

interface PendingRecord {
  id: string;
  company_id: string;
  automation_id: string;
  lead_id: string;
  node_ids: string[];
  trigger_payload: TriggerPayload;
  resume_after: string;
}

interface AutomationFlow {
  nodes: CanvasNode[];
  trigger: TriggerConfig | null;
}

interface AutomationRecord {
  id: string;
  name: string;
  company_id: string;
  owner_id: string;
  flow: AutomationFlow;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Webhook mode: POST /automation-runner/webhook/<automationId> ──────────
  const url = new URL(req.url);
  const webhookMatch = url.pathname.match(/\/webhook\/([a-f0-9-]{36})$/i);
  if (webhookMatch) {
    return await handleWebhook(supabase, req, webhookMatch[1]);
  }

  // ── Modo normal: requer autenticação ─────────────────────────────────────
  const secret = Deno.env.get("AUTOMATION_SECRET");
  const auth = req.headers.get("Authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // ── Resume mode: chamado pelo pg_cron para continuar automações pausadas ──
  if (body.resume === true) {
    return await handleResume(supabase);
  }

  // ── Trigger mode normal ────────────────────────────────────────────────────
  const payload = body as unknown as TriggerPayload;
  const { trigger_type, company_id, lead_id } = payload;
  if (!trigger_type || !company_id || !lead_id) {
    return new Response("Missing required fields", { status: 400 });
  }

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
      await executeFlow(supabase, flow, payload, automation.id);
      results.push({ id: automation.id, name: automation.name, status: "ok" });
    } catch (err) {
      console.error(`Automation ${automation.id} (${automation.name}) failed:`, err);
      results.push({ id: automation.id, name: automation.name, status: "error", error: String(err) });
    }
  }

  console.log(`[${trigger_type}] lead=${lead_id} matched=${results.length}`);
  return Response.json({ trigger_type, lead_id, matched: results.length, results });
});

// ─── Webhook handler ──────────────────────────────────────────────────────────

async function handleWebhook(
  supabase: SupabaseClient,
  req: Request,
  webhookId: string,
): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // O webhookId é o próprio id da automação
  const { data: automation, error: autoErr } = await supabase
    .from("automations")
    .select("id, name, flow, company_id, owner_id")
    .eq("id", webhookId)
    .eq("active", true)
    .single();

  if (autoErr || !automation) {
    return Response.json({ error: "Webhook not found or automation inactive" }, { status: 404, headers: corsHeaders });
  }

  const flow = (automation as AutomationRecord).flow;
  const automationId = (automation as AutomationRecord).id;
  const companyId = (automation as AutomationRecord).company_id;
  const ownerId = (automation as AutomationRecord).owner_id;

  // Lê o body da requisição
  let webhookBody: Record<string, unknown> = {};
  try {
    webhookBody = (await req.json()) as Record<string, unknown>;
  } catch { /* body vazio ou não-JSON é aceito */ }

  // Tenta identificar o lead pelo body (lead_id, email ou whatsapp)
  let lead_id: string | null = null;

  if (webhookBody.lead_id) {
    lead_id = String(webhookBody.lead_id);
  } else if (webhookBody.email) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("email", String(webhookBody.email))
      .maybeSingle();
    lead_id = lead?.id ?? null;
  } else if (webhookBody.whatsapp) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("company_id", companyId)
      .eq("whatsapp", String(webhookBody.whatsapp))
      .maybeSingle();
    lead_id = lead?.id ?? null;
  }

  // Se não há lead, o fluxo ainda roda — dados do formulário ficam disponíveis
  // como variáveis {{gatilho.CAMPO}} (ex: {{gatilho.email}}, {{gatilho.nome}})
  const resolvedLeadId = lead_id ?? "";

  const payload: TriggerPayload = {
    trigger_type: "http_webhook",
    company_id: companyId,
    lead_id: resolvedLeadId,
    context: { changed_fields: webhookBody },
  };

  try {
    await executeFlow(supabase, flow, payload, automationId);
    return Response.json({ ok: true, lead_id, automation_id: automationId }, { headers: corsHeaders });
  } catch (err) {
    console.error(`Webhook automation ${automationId} failed:`, err);
    return Response.json({ error: String(err) }, { status: 500, headers: corsHeaders });
  }
}

// ─── Resume handler ───────────────────────────────────────────────────────────

async function handleResume(supabase: SupabaseClient): Promise<Response> {
  const now = new Date().toISOString();

  const { data: pending, error } = await supabase
    .from("automation_pending")
    .select("*")
    .lte("resume_after", now);

  if (error) {
    console.error("Failed to load pending automations:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return Response.json({ resumed: 0 });
  }

  // Deleta primeiro para evitar dupla execução caso o job rode em paralelo
  const ids = (pending as PendingRecord[]).map((p) => p.id);
  await supabase.from("automation_pending").delete().in("id", ids);

  const results: { id: string; status: string; error?: string }[] = [];

  for (const item of pending as PendingRecord[]) {
    try {
      const { data: automation } = await supabase
        .from("automations")
        .select("id, name, flow")
        .eq("id", item.automation_id)
        .eq("company_id", item.company_id)
        .eq("active", true)
        .single();

      if (!automation) {
        results.push({ id: item.id, status: "skipped", error: "Automation not found or inactive" });
        continue;
      }

      await executeFlow(
        supabase,
        (automation as AutomationRecord).flow,
        item.trigger_payload,
        automation.id,
        item.node_ids,
      );
      results.push({ id: item.id, status: "ok" });
    } catch (err) {
      console.error(`Failed to resume pending ${item.id}:`, err);
      results.push({ id: item.id, status: "error", error: String(err) });
    }
  }

  console.log(`[resume] processed=${pending.length}`);
  return Response.json({ resumed: pending.length, results });
}

// ─── Trigger filter matching ──────────────────────────────────────────────────

async function matchesTriggerConfig(
  supabase: SupabaseClient,
  trigger: TriggerConfig,
  payload: TriggerPayload,
): Promise<boolean> {
  const cfg = trigger.configData ?? {};

  switch (trigger.triggerId) {
    case "neg_criado": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if (cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "neg_movido": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if (cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "neg_ganho":
    case "neg_restaurado": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if ((cfg.scope as string) === "Etapa" && cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "neg_perdido": {
      if (cfg.pipeline && payload.context.pipeline_id !== cfg.pipeline) return false;
      if ((cfg.scope as string) === "Etapa" && cfg.stage && payload.context.new_column_id !== cfg.stage) return false;
      return true;
    }
    case "tag_adicionada": {
      const cfgTagIds = splitIds(cfg.tags as string);
      if (!cfgTagIds.length) return true;
      const tagsAdded = payload.context.tag_ids_added ?? [];
      if (cfgTagIds.some((t) => tagsAdded.includes(t))) return true;
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
    case "campo_alterado": {
      const field = cfg.field as string;
      if (!field) return true;
      const changedFields = (payload.context.changed_fields ?? {}) as Record<string, unknown>;

      let fieldChanged = field in changedFields;
      let newValue: unknown = changedFields[field];

      if (!fieldChanged) {
        const customVals = (changedFields["custom_field_values"] ?? {}) as Record<string, unknown>;
        if (field in customVals) {
          fieldChanged = true;
          newValue = customVals[field];
        }
      }

      if (!fieldChanged) return false;
      if ((cfg.mode as string) !== "specific") return true;
      return String(newValue ?? "") === String(cfg.value ?? "");
    }
    default:
      return true;
  }
}

// ─── Flow execution (BFS) ─────────────────────────────────────────────────────

async function executeFlow(
  supabase: SupabaseClient,
  flow: AutomationFlow,
  payload: TriggerPayload,
  automationId: string,
  startNodeIds?: string[], // fornecido ao retomar de automation_pending
) {
  const { company_id, lead_id } = payload;
  const allNodes: CanvasNode[] = flow.nodes ?? [];

  const children = new Map<string, CanvasNode[]>();
  const errorChildren = new Map<string, CanvasNode[]>();

  for (const n of allNodes) {
    if (n.parentId) {
      const arr = children.get(n.parentId) ?? [];
      arr.push(n);
      children.set(n.parentId, arr);
    }
    if (n.errorParentId) {
      const arr = errorChildren.get(n.errorParentId) ?? [];
      arr.push(n);
      errorChildren.set(n.errorParentId, arr);
    }
  }

  let initialQueue: CanvasNode[];

  if (startNodeIds && startNodeIds.length > 0) {
    // Retomando de um nó de espera — pular start
    initialQueue = allNodes.filter((n) => startNodeIds.includes(n.id));
  } else {
    // Início normal — logar start node
    const startNode = allNodes.find((n) => n.type === "start");
    if (startNode) {
      await supabase.from("automation_logs").insert({
        automation_id: automationId,
        company_id,
        lead_id,
        node_id: startNode.id,
        status: "success",
      });
    }
    initialQueue = [...(children.get(startNode?.id ?? "") ?? [])];
  }

  const queue: CanvasNode[] = [...initialQueue];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const node = queue.shift()!;

    if (visited.has(node.id)) continue;
    visited.add(node.id);

    if (node.type === "note" || node.type === "start") continue;

    // ── Ações ──────────────────────────────────────────────────────────────
    if (node.type === "acoes") {
      let successCount = 0;
      const errorMessages: string[] = [];

      for (const item of (node.actionItems ?? [])) {
        try {
          await executeAction(supabase, item, payload);
          successCount++;
        } catch (err) {
          errorMessages.push(String(err));
          console.error(`[node ${node.id}] action ${item.actionId} failed:`, err);
        }
      }

      if (successCount > 0 || errorMessages.length > 0) {
        const status = errorMessages.length > 0
          ? (successCount > 0 ? "alert" : "error")
          : "success";
        await supabase.from("automation_logs").insert({
          automation_id: automationId,
          company_id,
          lead_id,
          node_id: node.id,
          status,
          error_message: errorMessages.length > 0 ? errorMessages.join("; ") : null,
        });
      }

      if (errorMessages.length > 0) {
        const errNext = errorChildren.get(node.id) ?? [];
        if (errNext.length > 0) {
          queue.push(...errNext);
          continue;
        }
      }
      queue.push(...(children.get(node.id) ?? []));

    // ── Condições ──────────────────────────────────────────────────────────
    } else if (node.type === "condicoes") {
      const { allPassed, passedCondIds } = await evaluateConditionNode(supabase, node, payload);

      await supabase.from("automation_logs").insert({
        automation_id: automationId,
        company_id,
        lead_id,
        node_id: node.id,
        status: "success",
      });

      for (const condId of passedCondIds) {
        const individualNext = children.get(`${node.id}_${condId}`) ?? [];
        queue.push(...individualNext);
      }

      if (allPassed) {
        queue.push(...(children.get(node.id) ?? []));
      } else {
        queue.push(...(errorChildren.get(node.id) ?? []));
      }

    // ── Espera ─────────────────────────────────────────────────────────────
    } else if (node.type === "espera") {
      const esp = node.espera;
      const nextNodes = children.get(node.id) ?? [];

      if (esp) {
        const delay = getEsperaDelay(esp);

        if (delay.type === "inline") {
          // Curto o suficiente para esperar inline (≤ 90 s)
          await new Promise<void>((r) => setTimeout(r, delay.ms));
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id,
            node_id: node.id, status: "success",
          });
          queue.push(...nextNodes);

        } else if (delay.type === "scheduled" && nextNodes.length > 0) {
          // Insere na fila de pendentes — pg_cron retomará depois
          const { error: insErr } = await supabase.from("automation_pending").insert({
            company_id,
            automation_id: automationId,
            lead_id,
            node_ids: nextNodes.map((n) => n.id),
            trigger_payload: payload,
            resume_after: delay.resumeAfter.toISOString(),
          });
          if (insErr) {
            console.error(`[node ${node.id}] failed to schedule wait:`, insErr);
            // Em caso de falha ao agendar, continua normalmente
            queue.push(...nextNodes);
          }
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id,
            node_id: node.id, status: "success",
          });
          // NÃO enfileira filhos — serão processados quando retomado

        } else {
          // "immediate" (já está na janela) ou nenhum filho
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id,
            node_id: node.id, status: "success",
          });
          queue.push(...nextNodes);
        }
      } else {
        // Nó sem config de espera — passa direto
        queue.push(...nextNodes);
      }

    // ── API ────────────────────────────────────────────────────────────────
    } else if (node.type === "api") {
      const requests = node.apiConfig?.requests ?? [];

      if (requests.length === 0) {
        await supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id,
          node_id: node.id, status: "success",
        });
        queue.push(...(children.get(node.id) ?? []));
      } else {
        const { data: leadData } = await supabase.from("leads").select("*").eq("id", lead_id).single();
        const vars = await buildVarContext(supabase, leadData as Record<string, unknown> | null, payload);

        let allSuccess = true;
        const errors: string[] = [];

        for (const req of requests) {
          try {
            const rawUrl = interpolate(req.url, vars);
            if (!rawUrl) { errors.push(`${req.name}: URL vazia`); allSuccess = false; continue; }

            const urlObj = new URL(rawUrl);
            for (const { key, value } of (req.params ?? [])) {
              if (key) urlObj.searchParams.set(interpolate(key, vars), interpolate(value, vars));
            }

            const hdrs: Record<string, string> = {};
            for (const { key, value } of (req.headers ?? [])) {
              if (key) hdrs[interpolate(key, vars)] = interpolate(value, vars);
            }

            let body: BodyInit | undefined;
            if (req.type === "json" && req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
              body = interpolate(req.body, vars);
              if (!hdrs["Content-Type"] && !hdrs["content-type"]) {
                hdrs["Content-Type"] = "application/json";
              }
            }

            const resp = await fetch(urlObj.toString(), { method: req.method, headers: hdrs, body });
            if (!resp.ok) {
              errors.push(`${req.name}: HTTP ${resp.status} ${resp.statusText}`);
              allSuccess = false;
            }
          } catch (err) {
            errors.push(`${req.name}: ${String(err)}`);
            allSuccess = false;
          }
        }

        if (allSuccess) {
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id,
            node_id: node.id, status: "success",
          });
          queue.push(...(children.get(node.id) ?? []));
        } else {
          await supabase.from("automation_logs").insert({
            automation_id: automationId, company_id, lead_id,
            node_id: node.id, status: "error",
            error_message: errors.join("; "),
          });
          queue.push(...(errorChildren.get(node.id) ?? []));
        }
      }

    // ── Campos ─────────────────────────────────────────────────────────────
    } else if (node.type === "campos") {
      const ops = node.fieldOps ?? [];

      if (ops.length === 0) {
        await supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id,
          node_id: node.id, status: "success",
        });
        queue.push(...(children.get(node.id) ?? []));
      } else {
        const { data: leadData } = await supabase.from("leads").select("*").eq("id", lead_id).single();
        const vars = await buildVarContext(supabase, leadData as Record<string, unknown> | null, payload);

        const leadUpdate: Record<string, unknown> = {};
        const customUpdate: Record<string, unknown> = {};
        const prodUpdate: Record<string, unknown> = {};
        const errors: string[] = [];

        for (const op of ops) {
          try {
            const resolved = interpolate(op.value, vars);
            if (op.fieldKey.startsWith("lead.")) {
              leadUpdate[op.fieldKey.substring(5)] = resolved;
            } else if (op.fieldKey.startsWith("campo_lead.") || op.fieldKey.startsWith("campo_neg.") || op.fieldKey.startsWith("campo_empresa.")) {
              // todos escrevem em custom_field_values do lead (negócio = lead neste CRM)
              const dotIdx = op.fieldKey.indexOf(".");
              customUpdate[op.fieldKey.substring(dotIdx + 1)] = resolved;
            } else if (op.fieldKey.startsWith("prod.")) {
              prodUpdate[op.fieldKey.substring(5)] = resolved;
            }
          } catch (err) {
            errors.push(`${op.fieldLabel}: ${String(err)}`);
          }
        }

        if (Object.keys(leadUpdate).length > 0 || Object.keys(customUpdate).length > 0) {
          const updateData: Record<string, unknown> = { ...leadUpdate };
          if (Object.keys(customUpdate).length > 0) {
            const existing = ((leadData as Record<string, unknown>)?.custom_field_values ?? {}) as Record<string, unknown>;
            updateData.custom_field_values = { ...existing, ...customUpdate };
          }
          const { error: updateErr } = await supabase.from("leads").update(updateData).eq("id", lead_id);
          if (updateErr) errors.push(updateErr.message);
        }

        if (Object.keys(prodUpdate).length > 0) {
          const productId = (leadData as Record<string, unknown>)?.product_id;
          if (productId) {
            const { error: prodErr } = await supabase.from("products").update(prodUpdate).eq("id", productId);
            if (prodErr) errors.push(prodErr.message);
          }
        }

        const status = errors.length > 0 ? "error" : "success";
        await supabase.from("automation_logs").insert({
          automation_id: automationId, company_id, lead_id,
          node_id: node.id, status,
          error_message: errors.length > 0 ? errors.join("; ") : null,
        });

        if (errors.length > 0) {
          const errNext = errorChildren.get(node.id) ?? [];
          if (errNext.length > 0) { queue.push(...errNext); continue; }
        }
        queue.push(...(children.get(node.id) ?? []));
      }

    // ── Outros ─────────────────────────────────────────────────────────────
    } else {
      queue.push(...(children.get(node.id) ?? []));
    }
  }
}

// ─── API helpers ─────────────────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? "");
}

async function buildVarContext(
  supabase: SupabaseClient,
  lead: Record<string, unknown> | null,
  payload: TriggerPayload,
): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {};
  if (lead) {
    for (const [k, v] of Object.entries(lead)) {
      ctx[`campo.${k}`] = String(v ?? "");
      ctx[`lead.${k}`] = String(v ?? "");
    }
    // Produto vinculado ao lead
    const productId = lead.product_id as string | null;
    if (productId) {
      const { data: prod } = await supabase
        .from("products")
        .select("name, sku, default_value")
        .eq("id", productId)
        .single();
      if (prod) {
        const p = prod as Record<string, unknown>;
        ctx["prod.name"]          = String(p.name          ?? "");
        ctx["prod.sku"]           = String(p.sku           ?? "");
        ctx["prod.default_value"] = String(p.default_value ?? "");
      }
    }
    // Campos adicionais (custom_field_values)
    const cfv = (lead.custom_field_values ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(cfv)) {
      ctx[`campo_lead.${k}`] = String(v ?? "");
    }
  }
  ctx["gatilho.tipo"]       = payload.trigger_type;
  ctx["gatilho.lead_id"]    = payload.lead_id;
  ctx["gatilho.empresa_id"] = payload.company_id;
  // Campos do body do webhook disponíveis como {{gatilho.CAMPO}} (ex: {{gatilho.email}})
  const bodyFields = (payload.context.changed_fields ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(bodyFields)) {
    ctx[`gatilho.${k}`] = String(v ?? "");
  }
  return ctx;
}

// Mantido por compatibilidade com chamadas síncronas internas
function buildApiVarContext(lead: Record<string, unknown> | null, payload: TriggerPayload): Record<string, string> {
  const ctx: Record<string, string> = {};
  if (lead) {
    for (const [k, v] of Object.entries(lead)) {
      ctx[`campo.${k}`] = String(v ?? "");
      ctx[`lead.${k}`] = String(v ?? "");
    }
  }
  ctx["gatilho.tipo"]       = payload.trigger_type;
  ctx["gatilho.lead_id"]    = payload.lead_id;
  ctx["gatilho.empresa_id"] = payload.company_id;
  return ctx;
}

// ─── Espera delay calculator ──────────────────────────────────────────────────

type EsperaDelay =
  | { type: "inline"; ms: number }
  | { type: "scheduled"; resumeAfter: Date }
  | { type: "immediate" };

function getEsperaDelay(espera: EsperaConfig): EsperaDelay {
  const now = new Date();

  switch (espera.type) {
    case "segundos": {
      const ms = (espera.amount ?? 5) * 1000;
      // ≤ 90 s: espera inline dentro da Edge Function
      if (ms <= 90_000) return { type: "inline", ms };
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + ms) };
    }

    case "minutos":
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 5) * 60_000) };

    case "horas":
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 1) * 3_600_000) };

    case "dias":
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 1) * 86_400_000) };

    case "intervalo_semana": {
      const days = espera.days ?? ["seg", "ter", "qua", "qui", "sex"];
      const startTime = espera.startTime ?? "00:00";
      const endTime = espera.endTime ?? "23:59";
      const tzName = (espera.timezone ?? "America/Sao_Paulo (BRT)").split(" ")[0];
      const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

      const isInWindow = (d: Date): boolean => {
        try {
          const inTz = new Date(d.toLocaleString("en-US", { timeZone: tzName }));
          const dayName = DAY_NAMES[inTz.getDay()];
          if (!days.includes(dayName)) return false;
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          const mins = inTz.getHours() * 60 + inTz.getMinutes();
          return mins >= sh * 60 + sm && mins <= eh * 60 + em;
        } catch { return false; }
      };

      if (isInWindow(now)) return { type: "immediate" };

      // Procura próxima janela válida (minuto a minuto, até 7 dias)
      const check = new Date(now.getTime() + 60_000);
      for (let i = 0; i < 7 * 24 * 60; i++) {
        if (isInWindow(check)) return { type: "scheduled", resumeAfter: new Date(check) };
        check.setTime(check.getTime() + 60_000);
      }
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + 3_600_000) };
    }

    case "dia_horario": {
      const tzName = (espera.dateTimezone ?? "America/Sao_Paulo (BRT)").split(" ")[0];
      const startTime = espera.dateStartTime ?? "00:00";

      if (espera.dateField) {
        try {
          const [h, m] = startTime.split(":").map(Number);
          // Tenta interpretar dateField como data ISO (YYYY-MM-DD ou ISO completo)
          const base = new Date(espera.dateField.trim());
          if (!isNaN(base.getTime())) {
            // Ajusta para meia-noite no fuso e aplica o horário configurado
            const dateStr = base.toLocaleDateString("en-CA", { timeZone: tzName }); // YYYY-MM-DD
            const target = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
            if (!isNaN(target.getTime()) && target > now) {
              return { type: "scheduled", resumeAfter: target };
            }
          }
        } catch { /* fall through */ }
      }
      // Data inválida ou no passado → executa imediatamente
      return { type: "immediate" };
    }

    case "usuario_parou":
      // Espera N segundos de inatividade — usa amount como duração
      return { type: "scheduled", resumeAfter: new Date(now.getTime() + (espera.amount ?? 30) * 1000) };

    default:
      return { type: "immediate" };
  }
}

// ─── Condition node evaluation ────────────────────────────────────────────────

async function evaluateConditionNode(
  supabase: SupabaseClient,
  condNode: CanvasNode,
  payload: TriggerPayload,
): Promise<{ allPassed: boolean; passedCondIds: string[] }> {
  const conditions = condNode.conditionItems ?? [];

  if (!conditions.length) return { allPassed: true, passedCondIds: [] };

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", payload.lead_id)
    .single();

  if (!lead) return { allPassed: false, passedCondIds: [] };

  let allPassed = true;
  const passedCondIds: string[] = [];

  for (const cond of conditions) {
    const passed = await checkCondition(supabase, cond, lead as Record<string, unknown>, payload);
    if (passed) {
      passedCondIds.push(cond.id);
    } else {
      allPassed = false;
    }
  }

  return { allPassed, passedCondIds };
}

async function checkCondition(
  supabase: SupabaseClient,
  cond: ConditionItem,
  lead: Record<string, unknown>,
  payload: TriggerPayload,
): Promise<boolean> {
  const cfg = cond.config ?? {};
  const { conditionId: id, categoryId: cat } = cond;

  // ── Negócios ──────────────────────────────────────────────────────────────
  if (cat === "negocios") {
    switch (id) {
      case "pos_atend": {
        const atend = cfg.atendente as string;
        if (!atend) return !!(lead.responsible || (lead.responsibles as string[] ?? []).length > 0);
        return lead.responsible === atend || ((lead.responsibles as string[]) ?? []).includes(atend);
      }
      case "sem_atend":
        return !lead.responsible && ((lead.responsibles as string[]) ?? []).length === 0;
      case "ganho":
        return lead.status === "won";
      case "perdido":
        return lead.status === "lost";
      case "pendente":
        return lead.status === "open";
      case "pos_produto": {
        const prodId = cfg.produto_id as string;
        const sku = cfg.sku as string;
        if (prodId) return lead.product_id === prodId;
        if (sku) {
          const { data: prod } = await supabase
            .from("products").select("id").eq("sku", sku).eq("company_id", payload.company_id).maybeSingle();
          return !!(prod && lead.product_id === (prod as Record<string, unknown>).id);
        }
        return !!lead.product_id;
      }
      case "com_id_externo": {
        const extId = cfg.id_externo as string;
        if (!extId) return !!lead.external_id;
        return lead.external_id === extId;
      }
      case "campo_adicional": {
        const campoId = cfg.campo_id as string;
        const tipo = cfg.tipo_comparacao as string;
        const valor = String(cfg.valor ?? "");
        const customVals = ((lead.custom_field_values ?? {}) as Record<string, unknown>);
        const fieldVal = String(customVals[campoId] ?? "");
        if (tipo === "contem") return fieldVal.toLowerCase().includes(valor.toLowerCase());
        return fieldVal === valor;
      }
      default: return true;
    }
  }

  // ── Leads ─────────────────────────────────────────────────────────────────
  if (cat === "leads") {
    switch (id) {
      case "existente": return true;
      case "neg_pipeline": {
        const pipelineId = cfg.pipeline_id as string;
        if (!pipelineId) return !!(lead.pipeline_id);
        return lead.pipeline_id === pipelineId;
      }
      case "neg_etapa": {
        const etapaId = cfg.etapa_id as string;
        if (!etapaId) return !!(lead.column_id);
        return lead.column_id === etapaId;
      }
      case "com_email": {
        const email = cfg.email as string;
        if (!email) return !!(lead.email);
        return lead.email === email;
      }
      case "com_nome": {
        const nome = cfg.nome as string;
        const leadName = String(lead.title ?? lead.name ?? "");
        if (!nome) return !!leadName;
        return leadName === nome;
      }
      case "com_telefone": {
        const tel = cfg.telefone as string;
        if (!tel) return !!(lead.phone);
        return lead.phone === tel;
      }
      case "com_cpf": {
        const cpf = cfg.cpf as string;
        if (!cpf) return !!(lead.cpf);
        return lead.cpf === cpf;
      }
      case "pos_tag": {
        const tagIds = splitIds(cfg.tag_ids as string);
        const leadTags = (lead.tags as string[]) ?? [];
        if (!tagIds.length) return leadTags.length > 0;
        const { data: tagRows } = await supabase.from("tags").select("name").in("id", tagIds);
        const tagNames = (tagRows ?? []).map((r: { name: string }) => r.name);
        return tagNames.some((n: string) => leadTags.includes(n));
      }
      case "pos_atend": {
        const atend = cfg.atendente as string;
        if (!atend) return !!(lead.responsible || ((lead.responsibles as string[]) ?? []).length > 0);
        return lead.responsible === atend || ((lead.responsibles as string[]) ?? []).includes(atend);
      }
      case "campo_adicional": {
        const campoId = cfg.campo_id as string;
        const tipo = cfg.tipo_comparacao as string;
        const valor = String(cfg.valor ?? "");
        const customVals = ((lead.custom_field_values ?? {}) as Record<string, unknown>);
        const fieldVal = String(customVals[campoId] ?? "");
        if (tipo === "contem") return fieldVal.toLowerCase().includes(valor.toLowerCase());
        return fieldVal === valor;
      }
      default: return true;
    }
  }

  // ── Campos ────────────────────────────────────────────────────────────────
  if (cat === "campos") {
    const parametro = cfg.parametro as string;
    const valor = String(cfg.valor ?? "");
    let fieldVal = "";

    if (parametro === "lead.id") fieldVal = String(lead.id ?? "");
    else if (parametro === "lead.name") fieldVal = String(lead.title ?? lead.name ?? "");
    else if (parametro === "lead.email") fieldVal = String(lead.email ?? "");
    else if (parametro === "lead.phone") fieldVal = String(lead.phone ?? "");
    else if (parametro === "lead.cpf") fieldVal = String(lead.cpf ?? "");
    else if (parametro === "lead.source") fieldVal = String(lead.source ?? "");
    else if (parametro === "negocio.id") fieldVal = String(lead.id ?? "");
    else if (parametro === "negocio.name") fieldVal = String(lead.title ?? lead.name ?? "");
    else if (parametro === "negocio.value") fieldVal = String(lead.value ?? "");
    else if (parametro === "negocio.status") fieldVal = String(lead.status ?? "");
    else if (parametro?.startsWith("custom.")) {
      const customId = parametro.substring(7);
      const customVals = ((lead.custom_field_values ?? {}) as Record<string, unknown>);
      fieldVal = String(customVals[customId] ?? "");
    }

    switch (id) {
      case "campo_igual": return fieldVal === valor;
      case "campo_contem": return fieldVal.toLowerCase().includes(valor.toLowerCase());
      case "campo_pos_valor": return fieldVal !== "" && fieldVal !== "null" && fieldVal !== "undefined";
      case "campo_entre": {
        const num = parseFloat(fieldVal);
        const min = parseFloat(String(cfg.valor_min ?? ""));
        const max = parseFloat(String(cfg.valor_max ?? ""));
        if (isNaN(num) || isNaN(min) || isNaN(max)) return false;
        return num >= min && num <= max;
      }
      default: return true;
    }
  }

  // ── Tempo ─────────────────────────────────────────────────────────────────
  if (cat === "tempo" && id === "intervalo_tempo") {
    const timezone = String(cfg.timezone ?? "America/Sao_Paulo");
    const dias = String(cfg.dias ?? "seg,ter,qua,qui,sex").split(",").filter(Boolean);
    const horaInicio = String(cfg.hora_inicio ?? "00:00");
    const horaFim = String(cfg.hora_fim ?? "23:59");

    try {
      const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
      const DAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
      const dayName = DAY_NAMES[nowInTz.getDay()];
      if (!dias.includes(dayName)) return false;

      const [startH, startM] = horaInicio.split(":").map(Number);
      const [endH, endM] = horaFim.split(":").map(Number);
      const currentMinutes = nowInTz.getHours() * 60 + nowInTz.getMinutes();
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } catch {
      return true;
    }
  }

  return true;
}

// ─── Action execution ─────────────────────────────────────────────────────────

async function executeAction(
  supabase: SupabaseClient,
  item: ActionItem,
  payload: TriggerPayload,
) {
  const { lead_id, company_id } = payload;

  // Resolve variáveis {{...}} em todos os campos de config string
  const { data: leadDataForVars } = await supabase.from("leads").select("*").eq("id", lead_id).single();
  const vars = await buildVarContext(supabase, leadDataForVars as Record<string, unknown> | null, payload);
  const rawCfg = item.config ?? {};
  const cfg: Record<string, string | boolean | number> = {};
  for (const [k, v] of Object.entries(rawCfg)) {
    cfg[k] = typeof v === "string" ? interpolate(v, vars) : v;
  }

  switch (item.actionId) {
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

    case "adicionar_tags": {
      const tagIds = splitIds(cfg.tags as string);
      if (!tagIds.length) return;
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

    case "iniciar_automacao": {
      const automacaoId = cfg.automacao_id as string;
      if (!automacaoId) return;
      const { data: targetAuto } = await supabase
        .from("automations")
        .select("id, name, flow")
        .eq("id", automacaoId)
        .eq("company_id", company_id)
        .eq("active", true)
        .single();
      if (targetAuto) {
        console.log(`Iniciando sub-automação: ${(targetAuto as AutomationRecord).name}`);
        await executeFlow(supabase, (targetAuto as AutomationRecord).flow, payload, (targetAuto as AutomationRecord).id);
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
