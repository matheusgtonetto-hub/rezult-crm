// Rezult CRM -- Agente Operacional
//
// O agente que nasce pronto em toda empresa. Não conversa com ninguém: lê as
// conversas de WhatsApp e mantém o CRM fiel ao que aconteceu nelas (anotação,
// dados do contato, campos adicionais, etapa do funil, tags, produto e valor).
// Não depende de material da empresa, então a metodologia é fixa e mora aqui.
//
// Acionado pelo cron `process-agent-operacional` (ver a migration
// 20260914000002_agente_operacional.sql), autenticado pelo mesmo segredo dos
// outros runners. Processa POR CONVERSA: a fila só vence depois de 10 minutos
// sem mensagem, ou na hora quando o atendimento é finalizado.
//
// Garantias:
//   * nunca envia mensagem (nenhuma ferramenta de envio é oferecida ao modelo);
//   * nunca marca negócio ganho ou perdido;
//   * nunca coloca nem tira tag de ativação de agente, nem as de sistema: quem
//     liga e desliga os agentes que conversam são as automações;
//   * contato com a tag "Operacional: ignorar" fica de fora;
//   * só age sobre o lead desta conversa (lead_id vindo do modelo é descartado).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { empresaBloqueada } from "../_shared/cobranca.ts";
import { executeRegistryTool, TOOL_SCHEMAS, type ToolResult, type ToolSchema } from "../_shared/agent-tools.ts";
import { somenteDigitos } from "../_shared/telefone.ts";
import { registrarUso } from "../_shared/uso.ts";
import { podeGastar } from "../_shared/credito.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Conversas por execução. O cron roda a cada minuto, então o que sobrar vai no próximo. */
const LOTE = 8;
/** Idas e voltas com o modelo por conversa. */
const MAX_RODADAS = 8;
/** Quantas mensagens recentes entram como contexto. */
const MENSAGENS_NA_JANELA = 60;
/** Quanto das notas atuais do lead o modelo vê, para não repetir o que já está lá. */
const NOTAS_NO_CONTEXTO = 1500;

const TAG_IGNORAR = "Operacional: ignorar";
const TAGS_DE_SISTEMA = ["Agente", "SDS: Qualificado", "SDS: Não qualificado", TAG_IGNORAR];

/** Ferramentas do registro compartilhado que o Operacional pode usar. */
const FERRAMENTAS = [
  "atualizar_lead_notas",
  "definir_campo_adicional_lead",
  "atualizar_lead_info",
  "atualizar_lead_contatos",
  "atualizar_lead_endereco",
  "adicionar_tag_lead",
  "remover_tag_lead",
  "mover_negocio_estagio",
  "adicionar_produto_negocio",
  "atualizar_total_negocio",
];

const CRIAR_LEAD: ToolSchema = {
  id: "criar_lead_da_conversa",
  name: "criar_lead_da_conversa",
  description: "Cria o lead deste contato no CRM, já com o telefone da conversa e dentro de um funil. Use só quando ainda não existe lead e a conversa tem interesse comercial.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Nome do contato" },
      email: { type: "string" },
      empresa: { type: "string", description: "Empresa do contato, se informada" },
      funil: { type: "string", description: "Nome do funil. Sem isso, usa o primeiro." },
      etapa: { type: "string", description: "Nome da etapa. Sem isso, usa a primeira do funil." },
    },
    required: ["name"],
  },
};

const METODOLOGIA = `
Você é o Agente Operacional do Rezult CRM desta empresa. Você não conversa com ninguém: nenhuma mensagem sua chega ao contato. Seu trabalho é manter o CRM fiel ao que aconteceu na conversa de WhatsApp, para o time não precisar digitar nada.

Você recebe a conversa com o contato. As mensagens marcadas [NOVA] ainda não foram processadas; as outras são contexto e já foram registradas antes. Registre só o que as mensagens novas trazem de novo.

O que fazer, quando a conversa trouxer o fato:
1. Anotação: com atualizar_lead_notas, registre um resumo curto do que foi novo e relevante para a venda (interesse, necessidade, objeção, o que foi combinado, próximo passo com data se houver). No máximo uma anotação por vez, em até 3 frases. Não repita o que já está nas notas atuais. Saudação, "ok", figurinha ou conversa sem conteúdo não geram anotação.
2. Dados do contato: nome, e-mail, empresa e endereço quando o próprio contato informar (atualizar_lead_info, atualizar_lead_contatos, atualizar_lead_endereco). O nome do lead é o nome da pessoa, e a empresa vai no campo empresa. Atualize o nome quando o contato disser como se chama e o nome atual estiver vazio, for um número de telefone, for igual ao nome da empresa ou for genérico (como "Novo contato"). Nunca troque um nome mais completo por um mais curto.
3. Campos adicionais: preencha os campos da lista cuja resposta apareceu com clareza (definir_campo_adicional_lead). Não troque um valor já preenchido por um menos específico.
4. Etapa do funil: mova (mover_negocio_estagio) só quando a conversa mostrar avanço claro que corresponda ao nome de uma etapa. Não volte etapa sem motivo explícito. Nunca marque ganho ou perdido: isso é decidido pelo pagamento confirmado ou pelo time.
5. Tags: aplique ou remova só tags da lista, quando o nome da tag descrever claramente algo dito na conversa.
6. Produto e valor: associe o produto só quando ele for citado na conversa. Ao associar, pode usar como valor do negócio o preço do produto na lista de produtos. Fora isso, atualize o valor só quando um valor for citado explicitamente.
7. Lead inexistente: se ainda não existe lead e a conversa tem interesse comercial, crie com criar_lead_da_conversa e depois registre o resto. Conversa pessoal, fornecedor, spam ou suporte de quem já é cliente não vira lead.

Regras:
- Só registre o que está escrito na conversa. Nunca deduza, nunca invente, nunca complete com suposição.
- Mensagens do time e do agente de IA valem como o que a empresa disse ou combinou.
- Se uma ferramenta devolver erro com as opções válidas, corrija usando uma delas. Se nenhuma servir, deixe sem registrar.
- Se nada mudou, não chame ferramenta nenhuma e responda apenas: sem alterações.
- Ao terminar, responda em uma linha o que você registrou.
`.trim();


type Fila = {
  id: string;
  company_id: string;
  conversation_id: string;
  processado_ate: string | null;
  ultima_mensagem_em: string;
};

type Mensagem = {
  from_me: boolean;
  body: string | null;
  type: string | null;
  created_at: string;
  sent_by_agent: boolean | null;
  sender_name: string | null;
};

type Dispatch = (nome: string, input: Record<string, unknown>) => Promise<ToolResult>;
type Uso = { entrada: number; saida: number };

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const NOMES_GENERICOS = ["novo contato", "novo lead", "novo negocio", "sem nome", "contato", "lead", "cliente"];

/**
 * Se o nome do lead pode ser trocado pelo nome que a pessoa informou.
 *
 * O nome do lead é o nome da PESSOA; a empresa tem campo próprio, que o card
 * mostra logo abaixo. Então vale corrigir quando o nome atual não é um nome de
 * pessoa: vazio, telefone, igual à empresa (caso real: "Grupo MGT" no lugar de
 * "Matheus") ou genérico. E vale completar ("Matheus" para "Matheus Tonetto").
 * O que nunca acontece é encurtar ou trocar um nome de pessoa por outro.
 */
function podeTrocarNome(atual: string, novo: string, empresa: string): boolean {
  const a = norm(atual);
  const n = norm(novo);
  if (!n || a === n) return false;
  if (!a) return true;
  if (!/[a-z]/.test(a) && somenteDigitos(atual).length >= 8) return true;
  if (norm(empresa) && a === norm(empresa)) return true;
  if (NOMES_GENERICOS.some((g) => a === g || a.startsWith(`${g} `) || a.startsWith(`${g}(`))) return true;
  return n.length > a.length && n.startsWith(a);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfgRows } = await db.from("automation_runner_config").select("key, value");
  const cfg = Object.fromEntries(((cfgRows ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const segredo = cfg.automation_secret ?? "";
  if (!segredo || req.headers.get("Authorization") !== `Bearer ${segredo}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const { data: filas, error } = await db.rpc("operacional_reivindicar", { p_limite: LOTE });
  if (error) {
    console.error("[agent-operacional] falha ao reivindicar a fila:", error.message);
    return json({ error: "fila_indisponivel" }, 500);
  }

  const resultados: Record<string, unknown>[] = [];
  for (const fila of (filas ?? []) as Fila[]) {
    try {
      const r = await processar(db, fila);
      await db.rpc("operacional_concluir", { p_id: fila.id, p_processado_ate: r.processadoAte, p_erro: null });
      resultados.push({ conversa: fila.conversation_id, ...r.resumo });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[agent-operacional] conversa=${fila.conversation_id} erro:`, msg);
      await db.rpc("operacional_concluir", { p_id: fila.id, p_processado_ate: null, p_erro: msg.slice(0, 500) });
      resultados.push({ conversa: fila.conversation_id, erro: msg.slice(0, 200) });
    }
  }

  return json({ processadas: resultados.length, resultados });
});

async function processar(db: Db, fila: Fila): Promise<{ processadoAte: string | null; resumo: Record<string, unknown> }> {
  // Casos em que não há o que fazer: fecha a linha como lida até a última
  // mensagem conhecida, para ela não voltar à fila sozinha.
  const pular = (motivo: string) => ({ processadoAte: fila.ultima_mensagem_em, resumo: { motivo } });

  const { data: agente } = await db.from("agents")
    .select("id, model")
    .eq("company_id", fila.company_id).eq("type", "OPERACIONAL").eq("active", true)
    .limit(1).maybeSingle();
  if (!agente) return pular("agente_desligado");

  if (await empresaBloqueada(db, fila.company_id)) return pular("empresa_bloqueada");

  /*
   * Trava de saldo, no mesmo lugar e no mesmo formato da trava de cobrança
   * acima: antes de resolver a chave, porque montar a chamada de IA para
   * descobrir depois que não há saldo é trabalho jogado fora.
   *
   * `pular` e não `throw`: saldo esgotado não é defeito, é um estado esperado
   * da conta. A fila registra o motivo e segue para o próximo item, e o
   * contato do WhatsApp recebe o mesmo comportamento de fora do horário --
   * o agente não responde e um humano assume. O cliente final NUNCA vê
   * "acabou o crédito" (secao 3 do plano).
   */
  const veredito = await podeGastar(db, fila.company_id, "agent-operacional");
  if (veredito !== "ok") return pular(veredito);

  const model = (agente.model as string) || "gpt-5.6-terra";
  const provedor = model.startsWith("gpt-") ? "openai" : "anthropic";
  // `.limit(1)` e não `.maybeSingle()` puro: chave duplicada viraria erro.
  const { data: chave } = await db.from("ai_provider_keys")
    .select("api_key")
    .eq("company_id", fila.company_id).eq("provider", provedor).eq("active", true)
    .limit(1).maybeSingle();
  if (!chave?.api_key) throw new Error(`empresa sem chave ativa da ${provedor === "openai" ? "OpenAI" : "Anthropic"}`);

  const { data: conversa } = await db.from("whatsapp_conversations")
    .select("id, name, phone, contact_id")
    .eq("id", fila.conversation_id).maybeSingle();
  if (!conversa) return pular("conversa_inexistente");

  const { data: recentes } = await db.from("whatsapp_messages")
    .select("from_me, body, type, created_at, sent_by_agent, sender_name")
    .eq("conversation_id", conversa.id).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(MENSAGENS_NA_JANELA);
  const mensagens = ((recentes ?? []) as Mensagem[]).reverse();
  const corte = fila.processado_ate ? new Date(fila.processado_ate).getTime() : 0;
  const novas = mensagens.filter((m) => new Date(m.created_at).getTime() > corte);
  if (novas.length === 0) return pular("sem_mensagem_nova");
  const processadoAte = novas[novas.length - 1].created_at;

  const { data: leadRows } = await db.rpc("operacional_lead_da_conversa", {
    p_company_id: fila.company_id, p_phone: conversa.phone ?? "",
  });
  // deno-lint-ignore no-explicit-any
  const lead = ((leadRows ?? []) as any[])[0] ?? null;
  if (lead && ((lead.tags as string[] | null) ?? []).includes(TAG_IGNORAR)) {
    return { processadoAte, resumo: { motivo: "ignorado_por_tag" } };
  }

  const [empresaRes, funisRes, etapasRes, camposRes, tagsRes, produtosRes, agentesRes] = await Promise.all([
    db.from("companies").select("owner_id, name").eq("id", fila.company_id).maybeSingle(),
    db.from("pipelines").select("id, name, position").eq("company_id", fila.company_id).order("position"),
    db.from("pipeline_columns").select("id, title, pipeline_id, position").eq("company_id", fila.company_id).order("position"),
    db.from("custom_field_items").select("id, label").eq("company_id", fila.company_id).order("position"),
    db.from("tags").select("name").eq("company_id", fila.company_id),
    db.from("products").select("name, default_value").eq("company_id", fila.company_id).limit(50),
    db.from("agents").select("activation_tag").eq("company_id", fila.company_id).not("activation_tag", "is", null),
  ]);

  const ownerId = empresaRes.data?.owner_id as string | undefined;
  if (!ownerId) return pular("empresa_sem_dono");

  const funis = (funisRes.data ?? []) as { id: string; name: string }[];
  const etapas = (etapasRes.data ?? []) as { id: string; title: string; pipeline_id: string }[];
  const campos = (camposRes.data ?? []) as { id: string; label: string }[];
  const produtos = (produtosRes.data ?? []) as { name: string; default_value: number | null }[];

  // Tags que o Operacional não toca: as de sistema e as de ativação dos agentes
  // que conversam. Elas nem aparecem na lista que o modelo recebe.
  const protegidas = new Set([
    ...TAGS_DE_SISTEMA,
    ...((agentesRes.data ?? []) as { activation_tag: string }[]).map((a) => a.activation_tag),
  ].map(norm));
  const ehProtegida = (tag: unknown) => protegidas.has(norm(tag)) || String(tag ?? "").startsWith("Agente: ");
  const tagsLivres = ((tagsRes.data ?? []) as { name: string }[]).map((t) => t.name).filter((t) => !ehProtegida(t));

  const contexto = montarContexto({
    empresa: String(empresaRes.data?.name ?? ""),
    funis, etapas, campos, produtos, tagsLivres, lead, mensagens, corte,
  });

  let leadId: string | null = (lead?.id as string | undefined) ?? null;
  const acoes: string[] = [];

  const dispatch: Dispatch = async (nome, input) => {
    delete input.lead_id;
    acoes.push(nome);

    if (nome === "criar_lead_da_conversa") {
      if (leadId) return { ok: false, error: "o lead desta conversa já existe; atualize-o em vez de criar outro" };
      const r = await criarLeadDaConversa(db, fila.company_id, ownerId, conversa, funis, etapas, input);
      if (r.ok) leadId = (r.data as { id: string }).id;
      return r;
    }
    if (!FERRAMENTAS.includes(nome)) return { ok: false, error: `ferramenta indisponível: ${nome}` };
    if (!leadId) {
      return { ok: false, error: "ainda não existe lead para este contato. Crie com criar_lead_da_conversa, ou não registre nada se a conversa não for comercial." };
    }
    if ((nome === "adicionar_tag_lead" || nome === "remover_tag_lead") && ehProtegida(input.tag)) {
      return { ok: false, error: "essa tag é controlada pelas automações e pelo time; não mexa nela" };
    }
    // Nome: só troca nos casos de podeTrocarNome. Fora deles o nome sai do
    // pedido e o resto da atualização segue.
    if (nome === "atualizar_lead_info" && input.name !== undefined) {
      const empresaDoLead = String(input.company ?? lead?.company ?? "");
      if (!podeTrocarNome(String(lead?.name ?? ""), String(input.name ?? ""), empresaDoLead)) {
        delete input.name;
        const sobrou = ["email", "whatsapp", "company", "value", "priority", "origin"].some((k) => input[k] !== undefined);
        if (!sobrou) {
          return { ok: false, error: "o nome atual do lead fica como está: só muda quando está vazio, é telefone, é igual à empresa, é genérico ou quando o novo nome completa o atual" };
        }
      }
    }
    return executeRegistryTool({ db, companyId: fila.company_id, ownerId, leadId, autor: "Agente Operacional" }, nome, input);
  };

  const ferramentas = [
    ...(lead ? [] : [CRIAR_LEAD]),
    ...TOOL_SCHEMAS.filter((t) => FERRAMENTAS.includes(t.id)).map(semLeadId),
  ];

  const loop = provedor === "openai" ? loopOpenAi : loopAnthropic;
  const { uso, textoFinal, falhou } = await loop(chave.api_key as string, model, METODOLOGIA, contexto, ferramentas, dispatch);

  await registrarUsoDoAgente(db, agente.id as string, fila.company_id, model, uso, leadId, !falhou);
  console.info(`[agent-operacional] empresa=${fila.company_id} conversa=${conversa.id} lead=${leadId ?? "-"} novas=${novas.length} acoes=${acoes.join(",") || "nenhuma"} resultado="${textoFinal.slice(0, 160)}"`);

  return { processadoAte, resumo: { lead: leadId, novas: novas.length, acoes } };
}

/** O modelo não escolhe o lead: a ferramenta sempre age sobre o lead da conversa. */
function semLeadId(t: ToolSchema): ToolSchema {
  const schema = t.input_schema as { properties?: Record<string, unknown>; required?: string[] };
  const props = { ...(schema.properties ?? {}) };
  delete props.lead_id;
  return { ...t, input_schema: { ...schema, properties: props, required: (schema.required ?? []).filter((r) => r !== "lead_id") } };
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function montarContexto(p: {
  empresa: string;
  funis: { id: string; name: string }[];
  etapas: { id: string; title: string; pipeline_id: string }[];
  campos: { id: string; label: string }[];
  produtos: { name: string; default_value: number | null }[];
  tagsLivres: string[];
  // deno-lint-ignore no-explicit-any
  lead: any;
  mensagens: Mensagem[];
  corte: number;
}): string {
  const blocos: string[] = [];
  if (p.empresa) blocos.push(`EMPRESA: ${p.empresa}`);

  const funis = p.funis.map((f) => {
    const nomes = p.etapas.filter((e) => e.pipeline_id === f.id).map((e) => e.title);
    return `- ${f.name}: ${nomes.join(" > ") || "(sem etapas)"}`;
  });
  blocos.push(`FUNIS E ETAPAS, NA ORDEM:\n${funis.join("\n") || "(nenhum funil)"}`);
  blocos.push(`CAMPOS ADICIONAIS DISPONÍVEIS: ${p.campos.map((c) => c.label).join(", ") || "nenhum"}`);
  blocos.push(`TAGS QUE VOCÊ PODE USAR: ${p.tagsLivres.join(", ") || "nenhuma"}`);
  if (p.produtos.length) {
    blocos.push(`PRODUTOS: ${p.produtos.map((x) => x.default_value != null ? `${x.name} (R$ ${x.default_value})` : x.name).join(", ")}`);
  }

  if (p.lead) {
    const l = p.lead;
    const funil = p.funis.find((f) => f.id === l.pipeline_id)?.name;
    const etapa = p.etapas.find((e) => e.id === l.column_id)?.title;
    const valores = (l.custom_field_values ?? {}) as Record<string, unknown>;
    const preenchidos = p.campos
      .filter((c) => valores[c.id] !== undefined && valores[c.id] !== null && String(valores[c.id]).trim() !== "")
      .map((c) => `${c.label}: ${valores[c.id]}`);
    const notas = String(l.notes ?? "").trim();
    blocos.push([
      "LEAD DESTA CONVERSA:",
      `- nome: ${l.name ?? ""}`,
      `- e-mail: ${l.email ?? ""}`,
      `- empresa: ${l.company ?? ""}`,
      `- valor: ${l.value ?? ""}`,
      `- situação: ${l.status ?? ""}`,
      `- funil e etapa: ${funil ? `${funil} > ${etapa ?? "?"}` : "sem funil"}`,
      `- tags: ${((l.tags as string[] | null) ?? []).join(", ") || "nenhuma"}`,
      `- campos preenchidos: ${preenchidos.join("; ") || "nenhum"}`,
      `- notas atuais: ${notas ? notas.slice(-NOTAS_NO_CONTEXTO) : "nenhuma"}`,
    ].join("\n"));
  } else {
    blocos.push("LEAD DESTA CONVERSA: ainda não existe lead para este contato.");
  }

  const linhas = p.mensagens.map((m) => {
    const nova = new Date(m.created_at).getTime() > p.corte ? " [NOVA]" : "";
    const autor = !m.from_me ? "Contato" : m.sent_by_agent ? "Agente de IA" : `Time${m.sender_name ? ` (${m.sender_name})` : ""}`;
    const texto = String(m.body ?? "").trim() || `[${m.type ?? "mensagem"}]`;
    return `[${dataHora(m.created_at)}]${nova} ${autor}: ${texto}`;
  });
  blocos.push(`CONVERSA:\n${linhas.join("\n")}`);

  return blocos.join("\n\n");
}

async function criarLeadDaConversa(
  db: Db, companyId: string, ownerId: string,
  conversa: { name: string | null; phone: string | null; contact_id: string | null },
  funis: { id: string; name: string }[],
  etapas: { id: string; title: string; pipeline_id: string }[],
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const funil = (input.funil ? funis.find((f) => norm(f.name) === norm(input.funil)) : undefined) ?? funis[0];
  if (!funil) return { ok: false, error: "a empresa não tem nenhum funil" };
  const doFunil = etapas.filter((e) => e.pipeline_id === funil.id);
  const etapa = (input.etapa ? doFunil.find((e) => norm(e.title) === norm(input.etapa)) : undefined) ?? doFunil[0];
  if (!etapa) return { ok: false, error: `o funil "${funil.name}" não tem etapas` };

  const { data: maxRow } = await db.from("leads").select("deal_number")
    .eq("owner_id", ownerId).order("deal_number", { ascending: false }).limit(1).maybeSingle();
  const dealNumber = ((maxRow?.deal_number as number | undefined) ?? 1000) + 1;

  // Mesmo formato dos leads da base: "+55" e os dígitos.
  const digitos = somenteDigitos(conversa.phone);
  const whatsapp = digitos ? `+${digitos.length <= 11 ? `55${digitos}` : digitos}` : null;

  const { data, error } = await db.from("leads").insert({
    owner_id: ownerId,
    company_id: companyId,
    status: "open",
    deal_number: dealNumber,
    name: String(input.name || conversa.name || digitos || "Novo contato").trim(),
    email: input.email ?? null,
    company: input.empresa ?? null,
    whatsapp,
    person_id: conversa.contact_id ?? null,
    pipeline_id: funil.id,
    column_id: etapa.id,
  }).select("id, deal_number, name").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

type ResultadoLoop = { uso: Uso; textoFinal: string; falhou: boolean };

// deno-lint-ignore no-explicit-any
function falhouFerramenta(r: any): boolean {
  return !!r && typeof r === "object" && r.ok === false;
}

async function loopOpenAi(
  apiKey: string, model: string, system: string, contexto: string, ferramentas: ToolSchema[], dispatch: Dispatch,
): Promise<ResultadoLoop> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "system", content: system }, { role: "user", content: contexto }];
  const tools = ferramentas.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const uso: Uso = { entrada: 0, saida: 0 };
  let textoFinal = "";
  let falhou = false;
  let executouAlgo = false;

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      // reasoning_effort "none": com ferramentas, /v1/chat/completions recusa
      // raciocínio ligado na família GPT-5.x (ver agent-sds-qualify).
      body: JSON.stringify({ model, messages, tools, reasoning_effort: "none" }),
    });
    if (!res.ok) {
      const detalhe = (await res.text()).slice(0, 300);
      // Sem nada executado, é falha e a fila tenta de novo. Com algo já gravado,
      // repetir duplicaria a anotação: encerra com o que deu certo.
      if (!executouAlgo) throw new Error(`OpenAI ${res.status}: ${detalhe}`);
      console.error("[agent-operacional] OpenAI falhou no meio:", res.status, detalhe);
      falhou = true;
      break;
    }
    const data = await res.json();
    uso.entrada += Number(data.usage?.prompt_tokens) || 0;
    uso.saida += Number(data.usage?.completion_tokens) || 0;
    const msg = data.choices?.[0]?.message;
    const chamadas = msg?.tool_calls ?? [];
    if (chamadas.length === 0) { textoFinal = String(msg?.content ?? "").trim(); break; }

    messages.push(msg);
    // deno-lint-ignore no-explicit-any
    for (const call of chamadas as any[]) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(call.function.arguments || "{}"); } catch { /* argumento inválido vira objeto vazio */ }
      const resultado = await dispatch(call.function.name, input);
      executouAlgo = true;
      if (falhouFerramenta(resultado)) falhou = true;
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(resultado) });
    }
  }
  return { uso, textoFinal, falhou };
}

async function loopAnthropic(
  apiKey: string, model: string, system: string, contexto: string, ferramentas: ToolSchema[], dispatch: Dispatch,
): Promise<ResultadoLoop> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: contexto }];
  const tools = ferramentas.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const uso: Uso = { entrada: 0, saida: 0 };
  let textoFinal = "";
  let falhou = false;
  let executouAlgo = false;

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system, tools, messages }),
    });
    if (!res.ok) {
      const detalhe = (await res.text()).slice(0, 300);
      if (!executouAlgo) throw new Error(`Anthropic ${res.status}: ${detalhe}`);
      console.error("[agent-operacional] Anthropic falhou no meio:", res.status, detalhe);
      falhou = true;
      break;
    }
    const data = await res.json();
    uso.entrada += Number(data.usage?.input_tokens) || 0;
    uso.saida += Number(data.usage?.output_tokens) || 0;
    // deno-lint-ignore no-explicit-any
    const blocos = (data.content ?? []) as any[];
    const usos = blocos.filter((b) => b.type === "tool_use");
    if (usos.length === 0) {
      textoFinal = blocos.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join(" ").trim();
      break;
    }

    messages.push({ role: "assistant", content: blocos });
    const retornos = [];
    for (const bloco of usos) {
      const resultado = await dispatch(bloco.name, (bloco.input ?? {}) as Record<string, unknown>);
      executouAlgo = true;
      if (falhouFerramenta(resultado)) falhou = true;
      retornos.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(resultado) });
    }
    messages.push({ role: "user", content: retornos });
  }
  return { uso, textoFinal, falhou };
}

/*
 * Registro de uso e débito do crédito, agora no módulo compartilhado.
 *
 * A tabela de preços vivia copiada aqui e em `agent-sds-qualify`, com um
 * comentário pedindo sincronia manual. Saiu para `_shared/uso.ts` quando a
 * varredura de 25/09/2026 mostrou que outros TRÊS pontos chamavam IA sem medir
 * custo nenhum: manter a regra de dinheiro em um lugar só é o que impede o
 * próximo ponto de nascer sem medição.
 */
async function registrarUsoDoAgente(db: Db, agentId: string, companyId: string, model: string, uso: Uso, leadId: string | null, sucesso: boolean) {
  await registrarUso(db, {
    companyId,
    model,
    entrada: uso.entrada,
    saida: uso.saida,
    origem: "agente",
    agentId,
    leadId,
    sucesso,
  });
}
