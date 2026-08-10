import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWa, sendTyping, clearTyping, type ZapiCreds } from "../_shared/whatsapp-send.ts";
import { TOOL_SCHEMAS, executeRegistryTool, type ToolCtx, type ToolResult } from "../_shared/agent-tools.ts";

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

NUNCA INVENTE FATO SOBRE A EMPRESA. Endereço, cidade, formação, preço, prazo,
horário, serviço oferecido, forma de pagamento: só afirme o que estiver nas
instruções da empresa ou na Base de Conhecimento deste prompt. Dado que veio do
LEAD (cidade dele, idade dele, respostas de formulário) é dado DELE, nunca seu —
não repita como se fosse informação da empresa. Se perguntarem algo que você não
tem, diga que vai confirmar e trate na reunião, ou use escalar_humano. Uma
resposta inventada que soa plausível é pior que não responder: o lead toma
decisão em cima dela.
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
        start_datetime: { type: "string", description: "formato YYYY-MM-DDTHH:mm:ss, no fuso informado em DATA E HORA DE AGORA. Confira o ano antes de enviar." },
        // Sem e-mail o convite do Google não tem para onde ir. A maioria dos
        // leads chega por WhatsApp e nunca informou e-mail, então o agente
        // precisa pedir na conversa -- e é aqui que ele devolve o valor,
        // sem depender de outra ferramenta estar habilitada.
        email: { type: "string", description: "E-mail do lead, para enviar o convite da reunião. Se o contexto disser que o lead não tem e-mail cadastrado, PERGUNTE antes de agendar e envie aqui. Fica salvo no cadastro." },
        // Sem descrição, o modelo inventava a duração (num teste real mandou
        // 50 min com 30 configurados). Omitir faz cair na duração padrão da
        // aba Configurações -- que é o que o usuário configurou pra valer.
        duration_minutes: { type: "number", description: "Opcional. NÃO envie este campo: a duração padrão configurada pela empresa é aplicada automaticamente. Só envie se o próprio lead pedir explicitamente outra duração." },
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
    // Sem isso o agente remarcava mas não cancelava: diante de "não vou
    // conseguir mais", ele dizia que cancelou e o horário continuava
    // ocupado na agenda do vendedor -- e o lembrete da reunião ainda
    // dispararia depois, para um encontro que ninguém mais esperava.
    name: "cancelar_reuniao",
    description: "Cancela a reunião já marcada com este lead. Use SOMENTE quando ele desmarcar sem dar outro horário. Se ele disser qualquer data ou hora nova (\"pode ser amanhã 8h\", \"consegue remarcar para sexta\", \"muda pras 14h\"), NÃO chame esta tool: chame agendar_reuniao_closer direto, que move o evento existente. Cancelar e criar de novo dispara um e-mail de \"Evento cancelado\" para o lead antes do convite novo, o que parece que a reunião caiu. Depois de cancelar de verdade, SEMPRE ofereça um novo horário na mesma mensagem — nunca encerre o assunto.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "O que o lead disse — fica registrado para o vendedor." } },
      required: ["motivo"],
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

// ─── Prompt e tools dinâmicos (aba Perfil "Objetivo" + aba "Ferramentas") ───
// Só entra em ação quando o agente tem objectives configurado (opt-in via
// UI nova). Agentes criados antes disso têm objectives=[] e continuam no
// caminho legado (SDS_METHODOLOGY + TOOLS fixos acima) -- zero risco de
// regressão pra quem já está em produção.
const DYNAMIC_BASE_INTRO = `
Você é o agente de atendimento do Rezult CRM, configurado pela empresa pra atuar nesta conversa de WhatsApp.
IMPORTANTE: você não tem outro canal de resposta além das tools. Toda mensagem que
o lead deve receber PRECISA ser enviada via enviar_mensagem — nunca responda só
com texto solto, isso não chega ao lead.

NUNCA INVENTE FATO SOBRE A EMPRESA. Endereço, cidade, formação, preço, prazo,
horário, serviço oferecido, forma de pagamento: só afirme o que estiver nas
instruções da empresa ou na Base de Conhecimento deste prompt. Dado que veio do
LEAD (cidade dele, idade dele, respostas de formulário) é dado DELE, nunca seu —
não repita como se fosse informação da empresa. Se perguntarem algo que você não
tem, diga que vai confirmar e trate na reunião, ou use escalar_humano. Uma
resposta inventada que soa plausível é pior que não responder: o lead toma
decisão em cima dela.
`.trim();

const OBJECTIVE_PROMPTS: Record<string, string> = {
  // O escopo é FECHADO nos campos configurados. A versão anterior mandava
  // "fazer perguntas de descoberta" e "avaliar se o lead é bom encaixe", o
  // que era um convite pro modelo inventar entrevista própria: num teste
  // real, com os campos já respondidos num formulário, ele ignorou o
  // agendamento e começou a investigar a vida do lead. Qualificar aqui é
  // COLETAR os campos que a empresa configurou, nada além disso.
  qualificar: `OBJETIVO — Qualificar: reunir os campos de qualificação configurados pela empresa. Esses campos são o escopo COMPLETO da qualificação.

Regras, nesta ordem:
1. NÃO invente perguntas fora desses campos. Nada de entrevista, diagnóstico, investigação de contexto ou "me conta mais sobre você". Se não é um dos campos configurados, não é sua pergunta.
2. Se a informação de um campo JÁ apareceu (formulário, mensagem anterior, cadastro do lead), ela está coletada. Confirme em UMA frase curta e registre com qualificar_lead. Nunca pergunte de novo o que o lead já respondeu.
3. Pergunte apenas os campos que ainda faltam, de forma direta e natural.
4. Assim que todos os campos estiverem coletados, a qualificação ACABOU. Registre com qualificar_lead e siga para o próximo objetivo na MESMA resposta, sem esperar o lead pedir. Não prolongue a conversa procurando mais contexto.
5. Nunca revele preço antes de entender a necessidade do lead.`,
  agendar: "OBJETIVO — Agendar Reunião: assim que a qualificação estiver completa (ou se ela não for um objetivo deste agente), ofereça horário e agende com agendar_reuniao_closer. Não fique esperando um sinal extra de interesse nem crie etapas intermediárias: proponha o horário. Melhor perder um lead cedo do que perder um deal tarde, então não force reunião com quem claramente não é o público certo.",
  atendimento: "OBJETIVO — Atendimento: tire dúvidas e explique sobre a empresa usando o material de referência (Base de Conhecimento) informado abaixo. Se a resposta não estiver no material, seja honesto e ofereça escalar_humano em vez de inventar informação.",
};

function buildDynamicSystemPrompt(
  objectives: string[],
  customContext: string,
  kbContext: string,
  objectiveInstructions: Record<string, string>,
): string {
  const blocks = [DYNAMIC_BASE_INTRO];

  // Os objetivos são uma ESTEIRA, não uma lista de temas. Sem dizer isso, o
  // modelo tratava cada objetivo como assunto independente e ficava preso no
  // primeiro, alongando a conversa em vez de avançar. O que a empresa não
  // configurou não é trabalho do agente: sem essa frase ele preenchia os
  // buracos com etapas próprias.
  const nomes = objectives.filter((o) => OBJECTIVE_PROMPTS[o]);
  if (nomes.length) {
    blocks.push(
      `SEUS OBJETIVOS, NESTA ORDEM: ${nomes.join(" -> ")}.\n` +
      `Trabalhe um de cada vez e avance assim que o atual estiver cumprido, sem esperar o lead pedir. ` +
      `Estes são os ÚNICOS objetivos desta conversa: não crie etapas próprias entre eles nem depois do último.`,
    );
  }

  for (const o of objectives) {
    const base = OBJECTIVE_PROMPTS[o];
    if (!base) continue;
    const extra = objectiveInstructions[o]?.trim();
    // Instrução específica do objetivo (definida pelo usuário na aba Perfil)
    // some ao prompt fixo daquele objetivo -- não se mistura com o
    // customContext geral (aba Instruções), que se aplica ao agente inteiro.
    blocks.push(extra ? `${base}\nInstruções específicas definidas pelo usuário pra esse objetivo: ${extra}` : base);
  }
  if (kbContext) blocks.push(`BASE DE CONHECIMENTO (material da empresa — use pra responder com precisão):\n${kbContext}`);
  if (customContext) blocks.push(customContext);
  return blocks.join("\n\n");
}

// O agente conhecia só os RÓTULOS dos campos de qualificação (pelo schema da
// tool), nunca os valores já gravados no card. Com isso ele não tinha como
// saber o que faltava: ou repetia pergunta já respondida, ou inventava
// pergunta nova pra "ter o que conversar". Este bloco entrega o estado real,
// campo a campo, pra decisão virar determinística.
function buildQualificationState(
  qualFields: { id: string; label: string }[],
  lead: Record<string, unknown>,
): string {
  if (!qualFields.length) return "";
  const valores = (lead.custom_field_values as Record<string, unknown> | null) ?? {};
  const linhas = qualFields.map((f) => {
    const v = valores[f.id];
    const preenchido = v !== undefined && v !== null && String(v).trim() !== "";
    return preenchido ? `- ${f.label}: JÁ PREENCHIDO ("${String(v)}")` : `- ${f.label}: FALTANDO`;
  });
  const faltando = qualFields.filter((f) => {
    const v = valores[f.id];
    return v === undefined || v === null || String(v).trim() === "";
  });
  const fecho = faltando.length === 0
    ? "Todos os campos já estão preenchidos. A qualificação está CONCLUÍDA: não pergunte nada dela de novo, confirme em uma frase curta e siga direto para o próximo objetivo."
    : `Faltam ${faltando.length} campo(s). Pergunte SOMENTE esses. Se a resposta de algum já apareceu na conversa (inclusive em texto de formulário), registre com qualificar_lead em vez de perguntar.`;
  return `ESTADO DA QUALIFICAÇÃO (campos configurados pela empresa — escopo completo):\n${linhas.join("\n")}\n${fecho}`;
}

type AnthropicToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

// qualificar_lead ganha 1 propriedade por campo adicional selecionado na aba
// Perfil (chave = id do custom_field_items, igual ao que
// definir_campo_adicional_lead/MultiatendimentoPage.tsx já usam pra ler
// leads.custom_field_values -- assim o card do lead mostra o valor direto,
// sem precisar de tradução de chave em lugar nenhum).
function buildQualificarLeadTool(qualFields: { id: string; label: string }[]): AnthropicToolDef {
  const properties: Record<string, unknown> = {
    score: { type: "number" },
    qualificado: { type: "boolean" },
    motivo: { type: "string" },
  };
  for (const f of qualFields) {
    properties[f.id] = { type: "string", description: `Valor mapeado durante a conversa para o campo "${f.label}"` };
  }
  return {
    name: "qualificar_lead",
    description: "Registra o resultado da qualificação do lead com score, motivo, e os campos adicionais mapeados na conversa.",
    input_schema: { type: "object", properties, required: ["score", "qualificado", "motivo"] },
  };
}

function buildDynamicTools(objectives: string[], enabledTools: string[], qualFields: { id: string; label: string }[]): AnthropicToolDef[] {
  const tools: AnthropicToolDef[] = [];
  const byName = (n: string) => TOOLS.find((t) => t.name === n);
  tools.push(byName("enviar_mensagem")!, byName("escalar_humano")!);
  if (objectives.includes("qualificar")) tools.push(buildQualificarLeadTool(qualFields));
  if (objectives.includes("agendar")) tools.push(byName("agendar_reuniao_closer")!, byName("cancelar_reuniao")!);
  for (const toolId of enabledTools) {
    const schema = TOOL_SCHEMAS.find((s) => s.id === toolId);
    if (schema) tools.push({ name: schema.name, description: schema.description, input_schema: schema.input_schema });
  }
  return tools;
}

// Busca semântica na Base de Conhecimento do agente (RAG). Precisa de chave
// OpenAI pro embedding mesmo quando o modelo de chat escolhido é Claude --
// mesmo modelo de embedding usado no upload (agent-kb-ingest).
async function retrieveKbContext(
  db: ReturnType<typeof createClient>,
  agentId: string,
  companyId: string,
  query: string,
): Promise<string> {
  if (!query.trim()) return "";
  const { data: openaiKeyRow } = await db
    .from("ai_provider_keys")
    .select("api_key")
    .eq("company_id", companyId)
    .eq("provider", "openai")
    .eq("active", true)
    .maybeSingle();
  const openaiKey = openaiKeyRow?.api_key || Deno.env.get("OPENAI_API_KEY") || "";
  if (!openaiKey) return "";

  try {
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
      // `dimensions: 1536` é obrigatório: a coluna embedding e a função
      // match_agent_knowledge_chunks são vector(1536), e o
      // text-embedding-3-large devolve 3072 por padrão. Sem isso a busca
      // falhava por incompatibilidade de dimensão e o catch abaixo devolvia
      // "" -- ou seja, o agente respondia como se a Base de Conhecimento
      // estivesse vazia. Tem que casar com agent-kb-ingest/index.ts.
      body: JSON.stringify({ model: "text-embedding-3-large", input: query, dimensions: 1536 }),
    });
    if (!embRes.ok) {
      console.error("[agent-sds-qualify] embeddings error:", embRes.status, await embRes.text());
      return "";
    }
    const embData = await embRes.json();
    const queryEmbedding = embData.data[0].embedding;
    const { data: chunks, error } = await db.rpc("match_agent_knowledge_chunks", {
      query_embedding: queryEmbedding, match_agent_id: agentId, match_count: 5,
    });
    if (error || !chunks?.length) return "";
    // Agrupa por KB e prefixa com nome+descrição uma vez só -- a descrição
    // (aba "Configurações" da KB) é a instrução de quando usar aquele
    // material, então o modelo precisa ver isso junto do conteúdo, não só o
    // texto solto dos chunks.
    // deno-lint-ignore no-explicit-any
    const byKb = new Map<string, { description: string | null; parts: string[] }>();
    // deno-lint-ignore no-explicit-any
    for (const c of chunks as any[]) {
      const key = c.kb_name ?? "Base de Conhecimento";
      if (!byKb.has(key)) byKb.set(key, { description: c.kb_description ?? null, parts: [] });
      byKb.get(key)!.parts.push(c.content as string);
    }
    return [...byKb.entries()]
      .map(([name, { description, parts }]) =>
        `[${name}]${description ? ` — ${description}` : ""}\n${parts.join("\n---\n")}`)
      .join("\n\n");
  } catch (err) {
    console.error("[agent-sds-qualify] retrieveKbContext falhou:", err);
    return "";
  }
}

// ─── Comportamento (aba "Comportamento") ────────────────────────────────────
// Camada independente dos Objetivos/Ferramentas -- aplica em cima de
// QUALQUER agente, legado ou dinâmico. behavior_config vem vazio por padrão
// ({}), então nenhum toggle muda comportamento até a empresa mexer na aba.
type BehaviorConfig = {
  finalizar_conversa?: boolean;
  transferir_responsavel?: boolean;
  estilo_comunicacao?: "normal" | "formal" | "descontraida";
  // Quem o agente É na conversa. Sem isso ele oscilava sozinho: numa mesma
  // conversa dizia "vocês podem explorar" (falando do profissional em
  // terceira pessoa, como se fosse um intermediário) e logo depois falava
  // como se fosse a própria clínica. O lead não sabia com quem estava
  // falando. "propria" = é o profissional/empresa, primeira pessoa.
  // "equipe" = é alguém do time falando EM NOME do profissional.
  persona_voz?: "propria" | "equipe";
  usar_emojis?: boolean;
  assinar_nome?: boolean;
  dividir_mensagens?: boolean;
  dividir_mensagens_palavras?: number;
  followup_ativo?: boolean;
  followup_max_tentativas?: number;
  followup_intervalo_valor?: number;
  followup_intervalo_unidade?: "minutos" | "horas";
  followup_transferir_automacao?: boolean;
  followup_automacao_id?: string | null;
  // Aba Configurações
  delay_resposta_minutos?: number;
  mensagens_consideradas?: number;
  limite_interacoes?: number;
  saudacao_automatica?: boolean;
  restringir_topicos?: boolean;
  topicos_permitidos?: string;
  topicos_restritos?: string;
  // Aba Perfil (objetivo Qualificar) -- ids de custom_field_items (de
  // qualquer grupo de Campos Adicionais) que o agente deve mapear e
  // preencher no card do lead.
  campos_qualificacao?: string[];
  // Aba Perfil -- instruções específicas por objetivo (chave = id do
  // objetivo), somam ao prompt fixo daquele objetivo.
  objective_instructions?: Record<string, string>;
  // Aba Closers -- configurações globais de agendamento do agente (não por
  // closer individual, ao contrário de agent_closer_availability).
  fuso_horario?: string; // IANA, ex. "America/Sao_Paulo" -- default se vazio
  duracao_reuniao_minutos?: number;
  intervalo_entre_reunioes?: boolean;
  intervalo_minutos?: number;
  // undefined = true (preserva o comportamento de sempre, pra agentes
  // criados antes desse toggle existir). false = agenda só em "activities"
  // (calendário do Rezult), sem exigir google_oauth_tokens do vendedor e
  // sem chamar google-calendar-event -- ver pickAvailableCloser/
  // agendar_reuniao_closer abaixo.
  google_calendar_ativo?: boolean;
  incluir_google_meet?: boolean;
  confirmar_antes_criar_evento?: boolean;
  // Aba Configurações -- janela de horário (HH:mm, no fuso de fuso_horario)
  // e dias da semana em que o agente responde mensagens. Desativado =
  // responde a qualquer hora, todo dia. horario_atendimento_dias undefined
  // = todos os dias (mesmo comportamento de antes dos dias existirem).
  horario_atendimento_ativo?: boolean;
  horario_atendimento_inicio?: string;
  horario_atendimento_fim?: string;
  horario_atendimento_dias?: string[];
  // Lembrete de reunião (aba Perfil, objetivo Agendar): dois avisos antes
  // do encontro, um distante e um próximo.
  lembrete_reuniao_ativo?: boolean;
  lembrete_1_valor?: number;
  lembrete_1_unidade?: "minutos" | "horas";
  lembrete_2_valor?: number;
  lembrete_2_unidade?: "minutos" | "horas";
};

// Mesmo mapeamento de dia da semana usado no resto do arquivo (WEEKDAY_PT),
// mas via Intl com timezone explícito -- getUTCDay() não serve aqui porque
// precisamos do dia da semana NO FUSO do agente, que pode diferir do dia em
// UTC perto da meia-noite.
const WEEKDAY_EN_TO_PT: Record<string, string> = {
  Sun: "Domingo", Mon: "Segunda", Tue: "Terça", Wed: "Quarta", Thu: "Quinta", Fri: "Sexta", Sat: "Sábado",
};
function currentWeekdayPt(timezone: string): string {
  const en = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  return WEEKDAY_EN_TO_PT[en] ?? "Segunda";
}

// Gate de horário de atendimento (aba Configurações): fora da janela/dias
// configurados, o agente fica em silêncio -- mesmo padrão dos outros gates
// desta function (sem chave de API, sem tag "Agente", etc.), sem mensagem
// automática. Comparação lexicográfica de "HH:mm" (mesmo padrão já usado em
// weekdayAndTimeFromNaiveDatetime/pickAvailableCloser) -- não cobre janelas
// que cruzam a meia-noite (ex. 22:00-06:00), só o caso comum de janela no
// mesmo dia (ex. 08:00-21:00).
function isWithinBusinessHours(cfg: BehaviorConfig): boolean {
  if (!cfg.horario_atendimento_ativo) return true;
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

// O modelo não tem relógio: sem receber a data de hoje explicitamente, ele
// "chuta" a partir do treinamento dele e interpreta "amanhã"/"semana que
// vem" com anos de diferença (num teste real, marcou 11/06/2025 quando hoje
// era 07/08/2026). Como start_datetime é wall-clock SEM fuso (ver
// weekdayAndTimeFromNaiveDatetime), a referência precisa vir no MESMO fuso
// configurado na aba Configurações -- senão perto da meia-noite o dia dança.
const WEEKDAY_EN_TO_PT_FULL: Record<string, string> = {
  Sunday: "domingo", Monday: "segunda-feira", Tuesday: "terça-feira", Wednesday: "quarta-feira",
  Thursday: "quinta-feira", Friday: "sexta-feira", Saturday: "sábado",
};
function buildNowContext(cfg: BehaviorConfig): string {
  const timeZone = cfg.fuso_horario || "America/Sao_Paulo";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", weekday: "long",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  const diaSemana = WEEKDAY_EN_TO_PT_FULL[p.weekday] ?? p.weekday;
  return [
    `DATA E HORA DE AGORA: ${diaSemana}, ${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute} (fuso ${timeZone}).`,
    `Use SEMPRE essa referência para interpretar "hoje", "amanhã", "essa semana", "segunda que vem" etc.`,
    `Nunca agende no passado. Ao preencher start_datetime (formato YYYY-MM-DDTHH:mm:ss), use este mesmo fuso e confira o ano.`,
  ].join(" ");
}

const ESTILO_PROMPTS: Record<string, string> = {
  formal: "Tom de comunicação: formal e profissional -- evite gírias, trate o lead com cordialidade e precisão.",
  descontraida: "Tom de comunicação: descontraído e próximo -- pode usar linguagem mais informal e leve, sem perder o profissionalismo.",
};

function buildBehaviorPromptExtra(cfg: BehaviorConfig, agentName: string, nomeEmpresa = ""): string {
  const lines: string[] = [];

  // Pessoa do discurso — precisa vir cedo e explícita, senão o modelo
  // alterna sozinho entre "eu atendo" e "vocês vão conversar" na mesma
  // conversa, e o lead não entende se fala com o profissional ou com um
  // intermediário.
  const empresa = nomeEmpresa || "a empresa";
  if (cfg.persona_voz === "equipe") {
    lines.push(`QUEM VOCÊ É: você faz parte da equipe de ${empresa} e fala EM NOME do profissional, nunca como ele. Use terceira pessoa ao se referir ao atendimento dele ("ela vai te receber", "a agenda dela", "o trabalho dela") e primeira pessoa só para o que VOCÊ faz aqui na conversa ("eu te ajudo a marcar", "posso verificar"). Ao se apresentar, deixe claro que é da equipe.`);
  } else {
    lines.push(`QUEM VOCÊ É: você é ${empresa} falando diretamente com o cliente. Use SEMPRE a primeira pessoa para o atendimento ("eu te atendo", "minha agenda", "vou te receber", "no meu trabalho"). NUNCA se refira ao profissional em terceira pessoa nem diga "vocês vão conversar" — quem vai conversar com o lead é você.`);
  }

  if (cfg.estilo_comunicacao && ESTILO_PROMPTS[cfg.estilo_comunicacao]) lines.push(ESTILO_PROMPTS[cfg.estilo_comunicacao]);
  // Travessão é entrega imediata de texto gerado por IA: ninguém digita "—"
  // no WhatsApp. Vírgula, ponto, dois-pontos e parênteses dão conta.
  lines.push("NUNCA use travessão (— ou –) nas mensagens. Prefira vírgula, ponto, dois-pontos ou parênteses. Escreva como alguém digitando no WhatsApp, não como texto publicado.");
  lines.push(cfg.usar_emojis ? "Pode usar emojis nas mensagens, com moderação." : "Não use emojis nas mensagens.");
  // Nome no TOPO em negrito, não no rodapé: no WhatsApp o nome no fim
  // parecia assinatura de e-mail, e com a mensagem dividida ele só aparecia
  // na última parte -- ou seja, o contato lia tudo sem saber quem falava.
  // `*texto*` é o negrito do WhatsApp.
  if (cfg.assinar_nome && agentName) {
    lines.push(`Comece a resposta com *${agentName}* sozinho na primeira linha, e o conteúdo nas linhas seguintes. Se a resposta for dividida em várias mensagens, apenas a PRIMEIRA leva o nome — as demais vão direto ao conteúdo.`);
  }
  if (cfg.finalizar_conversa) lines.push("Quando a conversa chegar a uma conclusão natural (objetivo atingido ou lead se despediu), use a tool finalizar_conversa.");
  if (cfg.transferir_responsavel) lines.push("Quando identificar que cumpriu seu objetivo nesta conversa, use a tool transferir_responsavel para passar o lead pra um humano dar continuidade.");
  if (cfg.restringir_topicos) {
    if (cfg.topicos_permitidos?.trim()) lines.push(`RESTRIÇÃO DE TÓPICOS — Você só pode falar sobre: ${cfg.topicos_permitidos.trim()}.`);
    if (cfg.topicos_restritos?.trim()) lines.push(`RESTRIÇÃO DE TÓPICOS — Nunca fale sobre: ${cfg.topicos_restritos.trim()}. Se o cliente perguntar, redirecione educadamente sem entrar no assunto.`);
  }
  if (cfg.confirmar_antes_criar_evento) lines.push("Antes de chamar agendar_reuniao_closer, confirme dia e horário com o lead em uma mensagem separada e só chame a tool depois que ele confirmar explicitamente -- nunca agende direto na primeira menção de horário.");
  return lines.join("\n");
}

const FINALIZAR_CONVERSA_TOOL: AnthropicToolDef = {
  name: "finalizar_conversa",
  description: "Encerra a conversa quando ela chegou a uma conclusão natural.",
  input_schema: { type: "object", properties: { motivo: { type: "string" } } },
};
const TRANSFERIR_RESPONSAVEL_TOOL: AnthropicToolDef = {
  name: "transferir_responsavel",
  description: "Transfere a conversa pra um atendente humano continuar, porque o objetivo do agente nela já foi cumprido.",
  input_schema: { type: "object", properties: { motivo: { type: "string" } } },
};

// ─── Modelo multi-provedor (Claude/Anthropic e GPT/OpenAI) ──────────────────
// O tipo de agente é sempre SDS (metodologia fixa acima), mas o modelo de IA
// por trás é escolhido pela empresa na aba "Modelos". Detecta o provedor pelo
// prefixo do id do modelo — mesma convenção usada em AutomacoesPage.tsx
// (IA_MODELS): ids "gpt-*" são OpenAI, o resto é Anthropic.
type AiProvider = "openai" | "anthropic";
function providerForModel(model: string): AiProvider {
  return model.startsWith("gpt-") ? "openai" : "anthropic";
}

function toOpenAiTools(tools: AnthropicToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

// Executa uma tool chamada pelo modelo e devolve resultado — sempre um
// objeto (nunca void), porque o loop precisa mandar isso de volta pro
// modelo continuar a conversa (ex: "listar_leads" só é útil se o modelo vir
// o resultado antes de responder).
type ToolDispatcher = (name: string, input: Record<string, unknown>) => Promise<ToolResult>;

const MAX_TOOL_TURNS = 6;

type LoopUsage = { inputTokens: number; outputTokens: number };
// `finalText` é o texto que o modelo escreveu na última volta, quando parou
// de pedir tools. Ele NÃO chega ao lead sozinho: o único canal é a tool
// enviar_mensagem. Antes esse texto era descartado em silêncio -- num teste
// real o agente registrou a qualificação e escreveu a resposta como texto, e
// o lead não recebeu absolutamente nada. Agora ele volta pra quem chamou,
// que usa como rede de segurança.
type LoopResult = { actions: string[] | null; usage: LoopUsage; success: boolean; finalText: string };

// deno-lint-ignore no-explicit-any
function textoDosBlocos(content: any): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  // deno-lint-ignore no-explicit-any
  return content.filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("\n").trim();
}

// "success" alimenta a taxa de sucesso (aba Performance): true só quando a
// chamada ao modelo não falhou (actions !== null) E nenhuma tool devolveu
// { ok: false } nesse turno (ex: enviar_mensagem sem conexão de WhatsApp).
// deno-lint-ignore no-explicit-any
function toolFailed(result: any): boolean {
  return !!result && typeof result === "object" && result.ok === false;
}

// Loop Anthropic: manda mensagens, se vier tool_use executa e devolve
// tool_result, repete até o modelo não pedir mais tools ou bater o limite.
async function runAnthropicLoop(
  apiKey: string, model: string, system: string, transcript: string,
  tools: AnthropicToolDef[], dispatch: ToolDispatcher,
): Promise<LoopResult> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: `Conversa até agora:\n${transcript}` }];
  const actions: string[] = [];
  const usage: LoopUsage = { inputTokens: 0, outputTokens: 0 };
  let anyToolFailed = false;
  let finalText = "";
  let esgotouRodadas = true;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system, tools, messages }),
    });
    if (!res.ok) {
      console.error("[agent-sds-qualify] Anthropic error:", res.status, await res.text());
      return { actions: actions.length > 0 ? actions : null, usage, success: false, finalText };
    }
    const data = await res.json();
    usage.inputTokens += Number(data.usage?.input_tokens) || 0;
    usage.outputTokens += Number(data.usage?.output_tokens) || 0;
    // deno-lint-ignore no-explicit-any
    const toolUseBlocks = (data.content ?? []).filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) { finalText = textoDosBlocos(data.content); esgotouRodadas = false; break; }

    messages.push({ role: "assistant", content: data.content });
    // deno-lint-ignore no-explicit-any
    const toolResults = [];
    for (const block of toolUseBlocks) {
      const result = await dispatch(block.name, block.input ?? {});
      if (toolFailed(result)) anyToolFailed = true;
      actions.push(block.name);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Estourar o teto de rodadas não pode custar a resposta ao lead. Com muitas
  // tools de CRM habilitadas o modelo gasta as rodadas consultando e
  // executando, e antes disso a função terminava sem nunca falar com o lead:
  // reunião remarcada no Google e no CRM, e do lado de lá silêncio total.
  // Aqui a última palavra é forçada a ser uma mensagem.
  if (esgotouRodadas && !actions.includes("enviar_mensagem")) {
    console.warn("[agent-sds-qualify] teto de rodadas de tools atingido sem enviar_mensagem — forçando a mensagem final");
    const ferramentaEnvio = tools.find((t) => t.name === "enviar_mensagem");
    if (ferramentaEnvio) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model, max_tokens: 1024, system, messages,
          tools: [ferramentaEnvio],
          tool_choice: { type: "tool", name: "enviar_mensagem" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        usage.inputTokens += Number(data.usage?.input_tokens) || 0;
        usage.outputTokens += Number(data.usage?.output_tokens) || 0;
        // deno-lint-ignore no-explicit-any
        for (const block of (data.content ?? []).filter((b: any) => b.type === "tool_use")) {
          const result = await dispatch(block.name, block.input ?? {});
          if (toolFailed(result)) anyToolFailed = true;
          actions.push(block.name);
        }
      } else {
        console.error("[agent-sds-qualify] falha ao forçar mensagem final:", res.status, await res.text());
      }
    }
  }

  return { actions, usage, success: !anyToolFailed, finalText };
}

// Loop OpenAI: mesma ideia, formato de mensagens diferente (tool_calls +
// role="tool").
async function runOpenAiLoop(
  apiKey: string, model: string, system: string, transcript: string,
  tools: AnthropicToolDef[], dispatch: ToolDispatcher,
): Promise<LoopResult> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: `Conversa até agora:\n${transcript}` },
  ];
  const actions: string[] = [];
  const usage: LoopUsage = { inputTokens: 0, outputTokens: 0 };
  let anyToolFailed = false;
  let finalText = "";
  let esgotouRodadas = true;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      // reasoning_effort: "none" é OBRIGATÓRIO aqui. A família GPT-5.x liga
      // raciocínio por padrão, e a própria OpenAI recusa a chamada:
      // "Function tools with reasoning_effort are not supported ... in
      // /v1/chat/completions. To use function tools, use /v1/responses or set
      // reasoning_effort to 'none'." Como a ÚNICA forma do agente falar com o
      // lead é a tool enviar_mensagem, sem isso todo agente com modelo GPT
      // ficava 100% mudo -- e em silêncio: erro 400 na primeira chamada, zero
      // tokens, nenhuma linha em agent_usage_log, nada no WhatsApp.
      // Alternativa (maior): migrar este loop pra /v1/responses, que suporta
      // tools COM raciocínio.
      body: JSON.stringify({ model, messages, tools: toOpenAiTools(tools), reasoning_effort: "none" }),
    });
    if (!res.ok) {
      const detalhe = await res.text();
      console.error("[agent-sds-qualify] OpenAI error:", res.status, detalhe);
      return { actions: actions.length > 0 ? actions : null, usage, success: false, finalText };
    }
    const data = await res.json();
    usage.inputTokens += Number(data.usage?.prompt_tokens) || 0;
    usage.outputTokens += Number(data.usage?.completion_tokens) || 0;
    const msg = data.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls ?? [];
    if (toolCalls.length === 0) { finalText = textoDosBlocos(msg?.content); esgotouRodadas = false; break; }

    messages.push(msg);
    // deno-lint-ignore no-explicit-any
    for (const call of toolCalls as any[]) {
      const input = JSON.parse(call.function.arguments || "{}");
      const result = await dispatch(call.function.name, input);
      if (toolFailed(result)) anyToolFailed = true;
      actions.push(call.function.name as string);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  // Mesma trava do loop Anthropic: teto de rodadas não pode virar silêncio.
  if (esgotouRodadas && !actions.includes("enviar_mensagem")) {
    console.warn("[agent-sds-qualify] teto de rodadas de tools atingido sem enviar_mensagem — forçando a mensagem final");
    const ferramentaEnvio = tools.find((t) => t.name === "enviar_mensagem");
    if (ferramentaEnvio) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, messages, reasoning_effort: "none",
          tools: toOpenAiTools([ferramentaEnvio]),
          tool_choice: { type: "function", function: { name: "enviar_mensagem" } },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        usage.inputTokens += Number(data.usage?.prompt_tokens) || 0;
        usage.outputTokens += Number(data.usage?.completion_tokens) || 0;
        // deno-lint-ignore no-explicit-any
        for (const call of (data.choices?.[0]?.message?.tool_calls ?? []) as any[]) {
          const result = await dispatch(call.function.name, JSON.parse(call.function.arguments || "{}"));
          if (toolFailed(result)) anyToolFailed = true;
          actions.push(call.function.name as string);
        }
      } else {
        console.error("[agent-sds-qualify] falha ao forçar mensagem final:", res.status, await res.text());
      }
    }
  }

  return { actions, usage, success: !anyToolFailed, finalText };
}

// Espelho de IA_MODEL_PRICING (src/lib/ai-models.ts) -- Deno não importa de
// src/, então mantém os dois em sincronia manualmente se os preços mudarem.
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-sonnet-5":           { inputPer1M: 3,   outputPer1M: 15 },
  "claude-opus-5":             { inputPer1M: 15,  outputPer1M: 75 },
  "gpt-5.6-luna":               { inputPer1M: 0.4,  outputPer1M: 1.6 },
  "gpt-5.6-terra":              { inputPer1M: 2.5,  outputPer1M: 10 },
  "gpt-5.6-sol":                { inputPer1M: 12,   outputPer1M: 48 },
};

// Grava 1 linha de custo por invocação do loop -- alimenta "Valor gasto em
// $" na aba Performance. Não bloqueia o fluxo principal se falhar.
async function logAgentUsage(
  db: ReturnType<typeof createClient>,
  agentId: string,
  companyId: string,
  model: string,
  usage: LoopUsage,
  leadId: string,
  success: boolean,
): Promise<void> {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return;
  const pricing = MODEL_PRICING[model] ?? { inputPer1M: 0, outputPer1M: 0 };
  const costUsd = (usage.inputTokens / 1_000_000) * pricing.inputPer1M + (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
  await db.from("agent_usage_log").insert({
    agent_id: agentId,
    company_id: companyId,
    model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_usd: Number(costUsd.toFixed(4)),
    lead_id: leadId,
    success,
  });
}

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
// Divide uma mensagem longa em partes de até `maxWords` palavras, quebrando
// em fim de parágrafo/frase quando possível pra não cortar no meio de uma
// ideia. Usado pelo toggle "Dividir mensagens longas" (aba Comportamento).
// Teto de mensagens por resposta. Sem isso, uma resposta longa com limite
// baixo virava rajada (num teste real: 8 mensagens em 8 segundos) -- padrão
// que provedores de WhatsApp tratam como spam e que pode custar o BANIMENTO
// do número da empresa. Passando do teto, aumenta o tamanho de cada parte em
// vez de multiplicar a quantidade de mensagens.
// Era 5 quando o objetivo do teto era conter RAJADA (8 mensagens em 8
// segundos, padrão que provedor de WhatsApp trata como spam). Com o ritmo de
// digitação atual as partes já saem espaçadas de 5 a 30 segundos, então o
// risco de rajada acabou -- e um teto baixo passou a atrapalhar: ele
// contrariava o número de palavras que o próprio usuário configurou,
// forçando mensagens maiores do que ele pediu. Agora o teto serve só como
// trava contra caso absurdo (resposta gigante virando 30 mensagens).
const MAX_PARTES_MENSAGEM = 10;

function contaPalavras(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Ritmo de digitação ─────────────────────────────────────────────────────
// Regra do produto: 1 segundo por palavra com MAIS DE 5 LETRAS. Palavras
// curtas ("de", "para", "com") não contam -- são as longas que dão a
// sensação de alguém realmente escrevendo.
//
// Os dois tetos existem por motivos diferentes:
//  - por parte: o indicador do WhatsApp precisa ser renovado a cada ~10s
//    (ver aguardarDigitando); acima de meio minuto numa única mensagem a
//    espera passa de "humano" para "abandonado".
//  - total: edge function tem limite de tempo de execução. Sem esse teto,
//    uma resposta longa dividida em várias partes poderia estourar o limite
//    e a função morrer NO MEIO do envio, deixando a conversa pela metade.
const TETO_DIGITACAO_PARTE_MS = 30_000;
const TETO_DIGITACAO_TOTAL_MS = 90_000;
// Piso: mesmo um "Ok!" leva 5s de digitação. Resposta instantânea entrega
// que é robô -- ninguém lê a mensagem, pensa e digita em meio segundo.
const PISO_DIGITACAO_MS = 5_000;

function tempoDigitacao(texto: string): number {
  const longas = texto.trim().split(/\s+/)
    .filter((p) => p.replace(/[^\p{L}\p{N}]/gu, "").length > 5).length;
  return Math.max(PISO_DIGITACAO_MS, Math.min(TETO_DIGITACAO_PARTE_MS, 500 + longas * 1000));
}

// Espera mantendo o "digitando" vivo: a D-API aceita no máximo 15s por
// chamada, então uma pausa longa precisa ser renovada em fatias, senão o
// indicador some no meio e o contato acha que a conversa morreu.
async function aguardarDigitando(
  creds: ZapiCreds, phone: string, totalMs: number,
): Promise<void> {
  const FATIA_MS = 8000;
  let restante = totalMs;
  while (restante > 0) {
    const agora = Math.min(FATIA_MS, restante);
    await sendTyping(creds, phone, agora + 2000); // margem pra não piscar
    await new Promise<void>((r) => setTimeout(r, agora));
    restante -= agora;
  }
}

function splitLongMessage(text: string, maxWords: number): string[] {
  const total = contaPalavras(text);
  if (total <= maxWords) return [text];

  // Corta em fim de frase/parágrafo, nunca no meio de uma ideia. Antes isso
  // cortava a cada N palavras na régua ("...o valor da consulta é" / "R$ 200
  // e o retorno...") e o split(/\s+/).join(" ") ainda achatava as quebras de
  // linha. Frase única maior que o alvo vai inteira -- melhor uma parte
  // grande do que uma frase partida ao meio.
  const blocos = text
    .split(/(?<=[.!?…])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const montar = (alvo: number): string[] => {
    const out: string[] = [];
    let atual = "";
    for (const bloco of blocos) {
      const candidato = atual ? `${atual} ${bloco}` : bloco;
      if (atual && contaPalavras(candidato) > alvo) {
        out.push(atual);
        atual = bloco;
      } else {
        atual = candidato;
      }
    }
    if (atual) out.push(atual);
    return out;
  };

  // O teto precisa ser verificado DE FATO, não estimado. Antes eu calculava
  // o tamanho médio necessário (total / teto) e confiava nele -- só que,
  // como frases inteiras nunca são partidas, duas frases de 25 palavras já
  // estouram um alvo de 41 e cada uma vira uma parte. Num teste real isso
  // gerou 8 mensagens com o teto valendo 5. Agora afrouxa o alvo até o
  // número de partes realmente caber.
  let alvo = maxWords;
  let parts = montar(alvo);
  for (let i = 0; i < 8 && parts.length > MAX_PARTES_MENSAGEM; i++) {
    alvo = Math.ceil(alvo * 1.4);
    parts = montar(alvo);
  }
  return parts.length ? parts : [text];
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

// ─── Tag "Agente" no negócio: liga/desliga o agente POR negócio, em cima do
// liga/desliga por empresa que já existe em `agents.active`. Sem a tag, o
// agente fica desligado nesse negócio mesmo com a empresa toda habilitada --
// handoff manual (usuário/automação adiciona a tag pra "transferir" o
// negócio pro agente cuidar).
//
// A tag é checada em leads.tags (não em whatsapp_conversations.tags) porque
// leads é a fonte real da verdade -- é ali que a automação ("Adicionar
// tags") e o dropdown de tags do card no Pipeline gravam. Checar
// whatsapp_conversations era o bug: aquela tabela só fica sincronizada com
// leads.tags via um efeito que roda no navegador dentro do Multiatendimento
// (e só quando alguém abre aquela conversa específica) -- então tag
// adicionada por automação ou pelo card do Pipeline nunca chegava lá, e o
// agente ficava mudo mesmo com a tag visível no negócio.
function hasAgentTag(lead: Record<string, unknown>): boolean {
  return ((lead.tags as string[] | null) ?? []).includes("Agente");
}

// ─── Seleção de closer (menor carga nos últimos 7 dias, com Google conectado) ─
// Mesmo shape de WorkDay/WorkInterval do src/components/WorkSchedulesManager.tsx
// (dia da semana em português, ex. "Segunda") -- usado tanto na Aba
// "Closers" (disponibilidade por agente) quanto aqui pra filtrar quem pode
// receber a reunião no horário pedido.
type WorkInterval = { start: string; end: string };
type WorkDay = { day: string; active: boolean; intervals: WorkInterval[] };
const WEEKDAY_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// start_datetime chega como wall-clock America/Sao_Paulo sem offset (mesma
// convenção do resto do arquivo -- ver comentário no INSERT de "activities"
// logo abaixo). Extrai dia da semana/hora só a partir dos dígitos, sem
// passar pelo parser de Date (que reinterpretaria como UTC no runtime do
// Deno e daria dia/hora errados).
function weekdayAndTimeFromNaiveDatetime(datetime: string): { weekday: string; hhmm: string } | null {
  const m = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m;
  const weekdayIdx = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
  return { weekday: WEEKDAY_PT[weekdayIdx], hhmm: `${hh}:${mi}` };
}

// Offset UTC (ex. "-03:00") de um fuso IANA num instante -- via Intl (ICU
// embutido no Deno) em vez de tabela hardcoded, então lida certo com
// horário de verão nos fusos que o observam. Usado pra converter o
// start_datetime naive (wall-clock no fuso configurado na aba Closers) em
// timestamptz real antes de gravar/comparar contra "activities".
function tzOffsetString(timeZone: string, at: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const diffMinutes = Math.round((asIfUtc - at.getTime()) / 60_000);
  const sign = diffMinutes < 0 ? "-" : "+";
  const abs = Math.abs(diffMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

async function pickAvailableCloser(
  db: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
  startDatetime?: string,
  durationMinutes = 60,
  cfg: BehaviorConfig = {},
  // Reagendamento: mantém o MESMO vendedor da reunião que está sendo movida
  // (o lead já foi apresentado a ele), desde que continue passando em todos
  // os filtros. `excludeActivityId` tira a própria reunião antiga da conta de
  // conflitos -- senão ela bloqueava horários próximos ao dela mesma.
  preferUserId?: string,
  excludeActivityId?: string,
): Promise<{ userId: string } | null> {
  const { data: closers } = await db
    .from("agent_closers")
    .select("user_id")
    .eq("agent_id", agentId)
    .eq("company_id", companyId);
  if (!closers?.length) return null;

  // Com Google Calendar desligado (aba Vendedores), agenda só no calendário
  // do Rezult -- não faz sentido exigir google_oauth_tokens do vendedor
  // nesse modo. undefined = true (agentes de antes desse toggle continuam
  // exigindo Google, sem mudança de comportamento).
  const googleRequired = cfg.google_calendar_ativo !== false;

  let eligible: string[] = [];
  if (googleRequired) {
    for (const c of closers) {
      // `.limit(1)` em vez de `.maybeSingle()`: reconectar o Google pode
      // deixar mais de uma linha de token pro mesmo usuário, e o maybeSingle
      // devolvia ERRO nesse caso (não a primeira linha) -- o closer era
      // tratado como "sem Google conectado" e o agendamento caía direto em
      // escalar_humano, mesmo com o Calendar conectado e funcionando.
      //
      // O filtro por empresa tem que ser o MESMO de google-calendar-event
      // (token da empresa, ou legado sem empresa). Sem isso os dois
      // discordavam: aqui o closer passava por ter Google em QUALQUER
      // empresa, e na hora de criar o evento voltava "google_not_connected"
      // -- o agente já tinha prometido o horário pro lead e só então falhava.
      const { data: tokens } = await db
        .from("google_oauth_tokens")
        .select("id")
        .eq("user_id", c.user_id as string)
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .limit(1);
      if (tokens?.length) eligible.push(c.user_id as string);
    }
  } else {
    eligible = closers.map((c) => c.user_id as string);
  }
  if (!eligible.length) return null;

  // Aba Integrações > Calendar: toggle por (agente, vendedor) -- default
  // enabled=true no frontend quando o vendedor tem Google Calendar conectado
  // (mesmo default aqui: sem linha em agent_calendar_connections = habilitado).
  // Só exclui quando a empresa desligou explicitamente esse vendedor pra
  // ESTE agente -- outro agente pode ter o mesmo vendedor habilitado.
  const { data: calendarRows } = await db
    .from("agent_calendar_connections")
    .select("user_id, enabled")
    .eq("agent_id", agentId)
    .eq("company_id", companyId)
    .in("user_id", eligible);
  const calendarDisabled = new Set(
    (calendarRows ?? []).filter((r) => r.enabled === false).map((r) => r.user_id as string),
  );
  if (calendarDisabled.size) eligible = eligible.filter((userId) => !calendarDisabled.has(userId));
  if (!eligible.length) return null;

  // Filtra por disponibilidade declarada na aba Closers, se houver. Closer
  // sem disponibilidade configurada pra esse agente é tratado como "sem
  // restrição" -- preserva o comportamento anterior pra quem nunca abriu
  // essa aba nova (ex. agentes já em produção antes dessa feature existir).
  const parsed = startDatetime ? weekdayAndTimeFromNaiveDatetime(startDatetime) : null;
  if (parsed) {
    const { data: availRows } = await db
      .from("agent_closer_availability")
      .select("user_id, days")
      .eq("agent_id", agentId)
      .in("user_id", eligible);
    const availByUser = new Map((availRows ?? []).map((r) => [r.user_id as string, r.days as WorkDay[]]));
    eligible = eligible.filter((userId) => {
      const days = availByUser.get(userId);
      if (!days?.length) return true;
      const day = days.find((d) => d.day === parsed.weekday);
      if (!day?.active) return false;
      return day.intervals.some((iv) => parsed.hhmm >= iv.start && parsed.hhmm <= iv.end);
    });
  }
  if (!eligible.length) return null;

  // Conflito de agenda. Roda SEMPRE que há horário pedido -- antes só rodava
  // com o toggle "Intervalo entre reuniões" ligado, e o comentário anterior
  // afirmava que sem ele a ordenação por menor carga evitava choque exato.
  // Não evita: a ordenação escolhe QUAL vendedor entre vários, e com um
  // vendedor só ele é sempre devolvido, ocupado ou não. Com o toggle
  // desligado (o padrão) o agente marcava em cima de reunião existente.
  //
  // O toggle passa a controlar apenas a FOLGA entre reuniões, que é o que ele
  // sempre prometeu na tela. Sobreposição direta é bloqueada de qualquer jeito.
  if (startDatetime) {
    const bufferMs = cfg.intervalo_entre_reunioes ? (Number(cfg.intervalo_minutos) || 15) * 60_000 : 0;
    const timezone = cfg.fuso_horario || "America/Sao_Paulo";
    const offset = tzOffsetString(timezone, new Date(`${startDatetime}Z`));
    const startMs = new Date(`${startDatetime}${offset}`).getTime();
    const endMs = startMs + durationMinutes * 60_000;
    const dayMs = 24 * 60 * 60_000;

    let busyQuery = db
      .from("activities")
      .select("id, owner_id, scheduled_at, duration_minutes")
      .eq("company_id", companyId)
      .eq("type", "meeting")
      .in("owner_id", eligible)
      .gte("scheduled_at", new Date(startMs - dayMs).toISOString())
      .lte("scheduled_at", new Date(endMs + dayMs).toISOString());
    if (excludeActivityId) busyQuery = busyQuery.neq("id", excludeActivityId);
    const { data: busyRows } = await busyQuery;

    const busyByUser = new Map<string, { start: number; end: number }[]>();
    for (const row of busyRows ?? []) {
      const uid = row.owner_id as string;
      const s = new Date(row.scheduled_at as string).getTime();
      const e = s + (Number(row.duration_minutes) || 60) * 60_000;
      if (!busyByUser.has(uid)) busyByUser.set(uid, []);
      busyByUser.get(uid)!.push({ start: s, end: e });
    }
    eligible = eligible.filter((userId) => {
      const busy = busyByUser.get(userId);
      if (!busy?.length) return true;
      return busy.every((b) => endMs + bufferMs <= b.start || startMs - bufferMs >= b.end);
    });
  }
  if (!eligible.length) return null;

  // Continuidade no reagendamento vence o balanceamento de carga: se o
  // vendedor da reunião original segue elegível no horário novo, é ele.
  if (preferUserId && eligible.includes(preferUserId)) return { userId: preferUserId };

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

// Resumo em texto da disponibilidade dos vendedores, pro prompt. Sem isso o
// agente ofertava horário no escuro ("consigo amanhã às 9h ou 10h") e só
// descobria que o vendedor não atendia naquele dia DEPOIS que o lead
// escolhia -- aí a ferramenta recusava e a conversa travava. Com a janela à
// vista, ele já propõe horário que dá pra cumprir.
async function buildAvailabilityContext(
  db: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
  cfg: BehaviorConfig,
): Promise<string> {
  const { data: closers } = await db
    .from("agent_closers").select("user_id").eq("agent_id", agentId).eq("company_id", companyId);
  if (!closers?.length) return "";

  const { data: rows } = await db
    .from("agent_closer_availability")
    .select("days")
    .eq("agent_id", agentId)
    .in("user_id", closers.map((c) => c.user_id as string));
  if (!rows?.length) return "";

  // União das janelas de todos os vendedores: se QUALQUER um atende, o
  // horário é ofertável (a escolha de quem atende é do pickAvailableCloser).
  const porDia = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const d of ((row.days as WorkDay[] | null) ?? [])) {
      if (!d?.active || !d.intervals?.length) continue;
      if (!porDia.has(d.day)) porDia.set(d.day, new Set());
      for (const iv of d.intervals) porDia.get(d.day)!.add(`${iv.start}-${iv.end}`);
    }
  }
  if (!porDia.size) return "";

  const linhas = WEEKDAY_PT
    .filter((dia) => porDia.has(dia))
    .map((dia) => `${dia}: ${[...porDia.get(dia)!].join(", ")}`);

  // Horários já ocupados. Sem isso o agente conhecia a janela de atendimento
  // mas não a agenda: oferecia um horário cheio, o lead aceitava, e só então
  // a reserva era recusada -- com o lead já achando que tinha marcado.
  const timezone = cfg.fuso_horario || "America/Sao_Paulo";
  const agora = new Date();
  const { data: ocupadas } = await db
    .from("activities")
    .select("scheduled_at, duration_minutes")
    .eq("company_id", companyId)
    .eq("type", "meeting")
    .in("owner_id", closers.map((c) => c.user_id as string))
    .gte("scheduled_at", agora.toISOString())
    .lte("scheduled_at", new Date(agora.getTime() + 21 * 24 * 60 * 60_000).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(40);

  let blocoOcupado = "";
  if (ocupadas?.length) {
    const fmt = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone, weekday: "short", day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
    const itens = ocupadas.map((r) => {
      const inicio = new Date(r.scheduled_at as string);
      const fim = new Date(inicio.getTime() + (Number(r.duration_minutes) || 60) * 60_000);
      const hFim = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(fim);
      return `${fmt.format(inicio)} até ${hFim}`;
    });
    blocoOcupado = `\n\nHORÁRIOS JÁ OCUPADOS (não ofereça nenhum destes, nem horário que se sobreponha a eles): ${itens.join(" | ")}.`;
  }

  return `DISPONIBILIDADE PARA AGENDAMENTO (fuso do agente) — ${linhas.join(" | ")}. Ofereça SOMENTE horários dentro dessas janelas; em qualquer outro dia ou horário não há atendimento. Se o lead pedir algo fora, diga que não há disponibilidade e proponha as opções válidas mais próximas.${blocoOcupado}`;
}

// ─── Conexão de WhatsApp usada pelo agente ──────────────────────────────────
// aba "Integrações" (agent_whatsapp_connections) declara quais linhas de
// WhatsApp este agente pode usar. Com pelo menos 1 linha vinculada, o envio
// FICA RESTRITO a elas -- nunca escolhe outra linha "aleatória" da empresa.
// Sem nenhum vínculo (agente criado antes dessa aba existir, ou que nunca
// configurou Integrações), mantém o comportamento anterior: qualquer linha
// conectada da empresa. `.limit(1)` em vez de `.maybeSingle()` -- empresa com
// 2+ linhas conectadas simultâneas não pode quebrar o envio inteiro.
async function resolveOutboundConnection(
  db: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
): Promise<{ provider: string; instance_id: string; token: string; client_token: string | null } | null> {
  const { data: assigned } = await db
    .from("agent_whatsapp_connections")
    .select("connection_id")
    .eq("agent_id", agentId)
    .eq("company_id", companyId)
    .eq("enabled", true);
  const assignedIds = (assigned ?? []).map((r) => r.connection_id as string);

  let query = db
    .from("whatsapp_connections")
    .select("provider, instance_id, token, client_token")
    .eq("company_id", companyId)
    .eq("connected", true);
  if (assignedIds.length) query = query.in("id", assignedIds);

  const { data: rows } = await query.limit(1);
  return (rows?.[0] as { provider: string; instance_id: string; token: string; client_token: string | null } | undefined) ?? null;
}

// ─── Saudação automática ─────────────────────────────────────────────────────
// Enviada direto (sem passar pelo modelo/loop de tools) na primeira mensagem
// de uma conversa nova -- por isso não conta como "interação da IA" pro
// limite configurado em Configurações.
async function sendGreeting(
  db: ReturnType<typeof createClient>,
  companyId: string,
  agentId: string,
  lead: Record<string, unknown>,
  agentName: string,
  cfg: BehaviorConfig,
): Promise<void> {
  const conn = await resolveOutboundConnection(db, companyId, agentId);
  if (!conn) return;

  const creds: ZapiCreds = {
    instanceId: String(conn.instance_id),
    token: String(conn.token),
    clientToken: conn.client_token ? String(conn.client_token) : null,
    provider: (["dapi", "cloud_api"].includes(String(conn.provider)) ? String(conn.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
  };
  const phone = String(lead.whatsapp ?? "");
  const firstName = String(lead.name ?? "").split(" ")[0];
  const emoji = cfg.usar_emojis ? " 👋" : "";
  const signature = cfg.assinar_nome && agentName ? ` Aqui é ${agentName}.` : "";
  const text = firstName
    ? `Olá, ${firstName}!${signature} Como posso te ajudar hoje?${emoji}`
    : `Olá!${signature} Como posso te ajudar hoje?${emoji}`;

  // A saudação também passa pelo indicador de digitando -- é a PRIMEIRA
  // impressão do contato, seria estranho justo ela aparecer do nada.
  await sendTyping(creds, phone, 1500);
  await new Promise<void>((r) => setTimeout(r, 1500));

  await sendWa(creds, { kind: "text", phone, message: text });
  await db.from("whatsapp_messages").insert({
    company_id: companyId,
    owner_id: lead.owner_id as string,
    instance_id: creds.instanceId,
    phone,
    from_me: true,
    body: text,
    type: "text",
  });
}

// ─── Seleção de agente por linha de WhatsApp ────────────────────────────────
// Entre os agentes SDS ativos da empresa, escolhe qual deve responder esta
// mensagem, respeitando a aba Integrações (agent_whatsapp_connections):
//   1. Agente com vínculo EXPLÍCITO pra esta linha (connectionId) vence.
//   2. Sem vínculo explícito pra essa linha, cai pro agente sem NENHUM
//      vínculo configurado (comportamento anterior a essa aba existir).
//   3. Chamada sem connectionId (runners que não sabem a linha, ex.
//      agent-business-hours-runner): mesma prioridade, mas sem filtrar por
//      linha -- se houver 2+ agentes todos vinculados e nenhum "genérico",
//      usa o primeiro de forma determinística (limitação conhecida: runners
//      não carregam contexto de linha hoje).
// deno-lint-ignore no-explicit-any
async function pickAgentForConnection(
  db: ReturnType<typeof createClient>,
  companyId: string,
  candidates: any[],
  connectionId: string | null,
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const { data: assignments } = await db
    .from("agent_whatsapp_connections")
    .select("agent_id, connection_id")
    .eq("company_id", companyId)
    .in("agent_id", candidates.map((a) => a.id as string))
    .eq("enabled", true);

  const assignedAgentIds = new Set((assignments ?? []).map((r) => r.agent_id as string));
  const unassigned = candidates.filter((a) => !assignedAgentIds.has(a.id as string));

  if (connectionId) {
    const specificAgentId = (assignments ?? [])
      .find((r) => r.connection_id === connectionId)?.agent_id as string | undefined;
    if (specificAgentId) return candidates.find((a) => a.id === specificAgentId) ?? null;
    return unassigned[0] ?? null;
  }

  return unassigned[0] ?? candidates[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Duas causas MUITO diferentes davam o mesmo "unauthorized" antes, o que
  // tornava impossível distinguir "chamada indevida" de "segredo não
  // configurado no servidor" -- neste segundo caso o agente fica mudo pra
  // TODA a base, sem nenhum sinal. Agora cada uma tem seu próprio código e
  // a de configuração grita no log.
  const internalSecret = req.headers.get("x-internal-secret") ?? "";
  const configuredSecret = Deno.env.get("AGENT_INTERNAL_SECRET") ?? "";
  if (configuredSecret === "") {
    console.error("[agent-sds-qualify] AGENT_INTERNAL_SECRET não está configurado no projeto — o agente não responde a NINGUÉM até isso ser definido (Supabase > Edge Functions > Secrets).");
    return json({ error: "server_secret_not_configured" }, 503);
  }
  if (internalSecret !== configuredSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { companyId?: string; phone?: string; instanceId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { companyId, phone, instanceId } = body;
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

  // O lead acabou de mandar mensagem -- qualquer ciclo de follow-up
  // automático pendente pra ele perde o sentido (não está mais em silêncio).
  // Roda sempre, independente dos gates abaixo (agente ativo, chave, tag).
  //
  // Só que nem toda execução vem de mensagem do lead: follow-up e lembrete
  // são disparados por cron. Sem esta condição, a PRÓPRIA tentativa de
  // follow-up cancelava o ciclo que a originou -- o runner então gravava
  // attempt_count e next_attempt_at numa linha já cancelada, e o tick
  // seguinte não a encontrava mais. Resultado: o follow-up parava sempre na
  // tentativa 1, nunca chegando ao máximo configurado, sem nenhum erro.
  const veioDeMensagemDoLead = !req.headers.get("x-followup-attempt") && !req.headers.get("x-lembrete-reuniao");
  if (veioDeMensagemDoLead) {
    await db.from("agent_followup_state").update({ status: "cancelado" }).eq("lead_id", leadId).eq("status", "ativo");
  }

  // Uma empresa pode ter mais de 1 agente SDS ativo simultâneo, cada um
  // escopado a uma linha de WhatsApp diferente via agent_whatsapp_connections
  // (aba Integrações) -- por isso não dá mais pra usar .single() aqui: com
  // 2+ agentes ativos essa chamada quebraria a função inteira.
  const { data: activeAgents } = await db
    .from("agents")
    .select("id, name, model, custom_context, objectives, enabled_tools, behavior_config")
    .eq("company_id", companyId)
    .eq("type", "SDS")
    .eq("active", true);
  if (!activeAgents?.length) return json({ skipped: "no_active_agent" }, 200);

  let inboundConnectionId: string | null = null;
  if (instanceId) {
    const { data: inboundConn } = await db
      .from("whatsapp_connections")
      .select("id")
      .eq("company_id", companyId)
      .eq("instance_id", instanceId)
      .maybeSingle();
    inboundConnectionId = (inboundConn?.id as string | undefined) ?? null;
  }

  const agent = await pickAgentForConnection(db, companyId, activeAgents, inboundConnectionId);
  if (!agent) return json({ skipped: "connection_not_assigned_to_any_agent" }, 200);

  const behaviorConfig: BehaviorConfig = (agent.behavior_config as BehaviorConfig) ?? {};

  // Gate por negócio ANTES de qualquer agendamento de trabalho futuro: sem a
  // tag "Agente" não há nada a fazer com essa mensagem. Ficava depois do
  // bloco de delay, então toda mensagem de qualquer lead NÃO marcado (a
  // maioria absoluta, numa base real) criava uma linha em
  // agent_pending_response e uma reinvocação da function minutos depois, só
  // pra ser descartada aqui.
  if (!hasAgentTag(lead)) return json({ skipped: "no_agent_tag" }, 200);

  // Delay de Resposta (com debounce): em vez de responder na hora, agenda
  // pra daqui a N minutos. Toda mensagem nova do lead durante a janela
  // reescreve o horário (upsert por company_id+phone) -- só responde depois
  // que o lead ficar quieto pelo intervalo inteiro. agent-response-runner
  // reinvoca esta mesma function com x-bypass-delay quando vence.
  const delayMinutos = Number(behaviorConfig.delay_resposta_minutos) || 0;
  const bypassDelay = req.headers.get("x-bypass-delay") === "true";
  // >0 quando quem chamou foi o agent-followup-runner: o lead ficou em
  // silêncio e esta execução é a N-ésima cutucada.
  const followupAttempt = Number(req.headers.get("x-followup-attempt") ?? "") || 0;
  // Preenchido pelo agent-meeting-reminder-runner: esta execução é o
  // lembrete de uma reunião que está chegando (traz o horário dela).
  const lembreteReuniao = req.headers.get("x-lembrete-reuniao") ?? "";
  if (delayMinutos > 0 && !bypassDelay) {
    await db.from("agent_pending_response").upsert({
      company_id: companyId, phone, status: "pending",
      respond_at: new Date(Date.now() + delayMinutos * 60_000).toISOString(),
    }, { onConflict: "company_id,phone" });
    return json({ skipped: "delayed", respond_at_in_minutes: delayMinutos }, 200);
  }

  const model = (agent.model as string) || "claude-sonnet-5";
  const provider = providerForModel(model);

  // Chave de IA: exige a chave própria da empresa (BYOK) do provedor do
  // modelo escolhido na aba "Modelos". Sem fallback pra outro provedor ou pra
  // uma chave global — se a empresa trocar de modelo sem ter a chave daquele
  // provedor cadastrada, o correto é parar de atuar, não quebrar silenciosamente.
  const { data: companyKey } = await db
    .from("ai_provider_keys")
    .select("api_key")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .eq("active", true)
    .maybeSingle();
  const apiKey = companyKey?.api_key || "";
  if (!apiKey) return json({ skipped: "no_company_api_key" }, 200);

  // Conversa finalizada = atendimento encerrado, o agente não responde mais.
  // Vale tanto pra tool finalizar_conversa quanto pro botão "Finalizar" do
  // Multiatendimento. Antes, finalizar não segurava nada: o contador zerava e
  // o agente voltava a atender na mensagem seguinte como se fosse um
  // atendimento novo. Pra retomar, é o botão "Reabrir" no Multiatendimento
  // (ou remover/recolocar a tag). Fica ANTES da chamada ao modelo, então
  // conversa encerrada não gera custo de IA.
  const { data: convStatus } = await db
    .from("whatsapp_conversations")
    .select("finished")
    .eq("company_id", companyId)
    .in("phone", phoneVariants(String(lead.whatsapp ?? "")))
    .order("last_msg_at", { ascending: false })
    .limit(1);
  if (convStatus?.[0]?.finished === true) return json({ skipped: "conversation_finished" }, 200);

  // Gate de horário de atendimento (aba Configurações) -- roda de novo a
  // cada reinvocação com x-bypass-delay, então uma resposta atrasada que só
  // sairia fora da janela também é barrada aqui.
  if (!isWithinBusinessHours(behaviorConfig)) return json({ skipped: "outside_business_hours" }, 200);

  // Nome da empresa: usado na pessoa do discurso ("você É a empresa" vs
  // "você fala em nome dela") e no título das reuniões.
  const { data: empresaAtual } = await db.from("companies").select("name").eq("id", companyId).maybeSingle();
  const nomeEmpresa = String(empresaAtual?.name ?? "").trim();

  const messageWindow = Number(behaviorConfig.mensagens_consideradas) || 30;
  const { data: messages } = await db
    .from("whatsapp_messages")
    .select("from_me, body, created_at, phone")
    .eq("company_id", companyId)
    .in("phone", phoneVariants(String(lead.whatsapp ?? "")))
    .order("created_at", { ascending: false })
    .limit(messageWindow);

  // `messages` vem do banco em ordem DECRESCENTE (mais nova primeiro).
  // O transcript precisa da ordem cronológica, mas `.reverse()` altera o
  // array no lugar -- por isso a cópia: sem ela, todo mundo que lesse
  // `messages` depois daqui pegaria a ordem invertida sem perceber (era
  // exatamente o que quebrava a busca na Base de Conhecimento, que acabava
  // pesquisando pela mensagem MAIS ANTIGA da janela em vez da atual).
  const cronologicas = [...(messages ?? [])].reverse();
  const transcript = cronologicas
    .map((m) => `${m.from_me ? "Atendente" : "Lead"}: ${m.body}`)
    .join("\n");

  // Há quanto tempo o lead está calado. Sem isso o agente escreve "faz um
  // tempo que não conversamos" depois de 2 minutos de silêncio.
  // Telefone COMO O WHATSAPP CONHECE, tirado da mensagem real que chegou
  // pelo webhook -- não do cadastro. leads.whatsapp costuma estar sem o
  // código do país completo ("55996635570" em vez de "555596635570"): pra
  // ENVIAR mensagem a D-API normaliza e funciona, mas o endpoint de presença
  // monta o JID ao pé da letra e o "digitando" ia parar em outro chat
  // (respondia success, e o contato nunca via nada).
  const telefoneWhats = ((messages ?? [])[0]?.phone as string | undefined)
    || String(lead.whatsapp ?? "");

  const ultimaDoLead = (messages ?? []).find((m) => !m.from_me)?.created_at as string | undefined;
  const silencioMin = ultimaDoLead
    ? Math.max(0, Math.round((Date.now() - new Date(ultimaDoLead).getTime()) / 60_000))
    : null;
  const silencioTexto = silencioMin === null ? null
    : silencioMin < 60 ? `${silencioMin} minuto(s)`
    : silencioMin < 1440 ? `${Math.round(silencioMin / 60)} hora(s)`
    : `${Math.round(silencioMin / 1440)} dia(s)`;

  // Saudação automática: primeira mensagem desta conversa (ninguém do lado
  // do agente/atendente respondeu ainda). Não passa pelo modelo -- é texto
  // fixo, então não conta como interação da IA.
  const isFirstMessageEver = (messages ?? []).length <= 1 && !(messages ?? []).some((m) => m.from_me);
  if (behaviorConfig.saudacao_automatica && isFirstMessageEver) {
    await sendGreeting(db, companyId, agent.id as string, lead, (agent.name as string) ?? "", behaviorConfig);
  }

  // Limite de interações da IA por atendimento: ao atingir o limite, a
  // PRÓXIMA mensagem do cliente ainda gera 1 resposta -- mas restrita a se
  // despedir e encerrar/transferir (nunca continuar o atendimento normal).
  const limiteInteracoes = Number(behaviorConfig.limite_interacoes) || 0;
  if (limiteInteracoes > 0) {
    // Conversa mais recente do telefone. `.order().limit(1)` em vez de
    // `.maybeSingle()`: o mesmo contato pode ter mais de uma linha em
    // whatsapp_conversations (formatos diferentes de telefone, ou instâncias
    // diferentes depois de reconectar o WhatsApp -- reconectar sempre gera um
    // instance_id novo). Com 2+ linhas o maybeSingle devolvia ERRO, o count
    // virava 0 e o limite de interações NUNCA era atingido.
    const { data: convRows } = await db
      .from("whatsapp_conversations")
      .select("ai_interaction_count")
      .eq("company_id", companyId)
      .in("phone", phoneVariants(String(lead.whatsapp ?? "")))
      .order("last_msg_at", { ascending: false })
      .limit(1);
    const count = (convRows?.[0]?.ai_interaction_count as number | undefined) ?? 0;

    if (count >= limiteInteracoes) {
      const canTransfer = !!behaviorConfig.transferir_responsavel;
      const canFinalize = !!behaviorConfig.finalizar_conversa;
      if (!canTransfer && !canFinalize) {
        // Nem transferir nem finalizar ativos -- IA para de responder em silêncio.
        return json({ skipped: "interaction_limit_silent" }, 200);
      }
      const closingTool = canTransfer ? TRANSFERIR_RESPONSAVEL_TOOL : FINALIZAR_CONVERSA_TOOL;
      const closingSystem = [
        DYNAMIC_BASE_INTRO,
        `IMPORTANTE: você atingiu o limite de respostas nesta conversa. Nesta mensagem, despeça-se cordialmente do cliente e, em seguida, chame OBRIGATORIAMENTE a tool ${closingTool.name}.`,
        buildBehaviorPromptExtra(behaviorConfig, (agent.name as string) ?? "", nomeEmpresa),
      ].filter(Boolean).join("\n\n");
      const closingCtx: { companyId: string; leadId: string; agentId: string; lead: Record<string, unknown>; behaviorConfig: BehaviorConfig } =
        { companyId, leadId, agentId: agent.id as string, lead, behaviorConfig };
      const closingDispatch: ToolDispatcher = (name, input) => executeAgentTool(db, { name, input }, closingCtx);
      const closingResult = provider === "openai"
        ? await runOpenAiLoop(apiKey, model, closingSystem, transcript, [TOOLS.find((t) => t.name === "enviar_mensagem")!, closingTool], closingDispatch)
        : await runAnthropicLoop(apiKey, model, closingSystem, transcript, [TOOLS.find((t) => t.name === "enviar_mensagem")!, closingTool], closingDispatch);
      await logAgentUsage(db, agent.id as string, companyId, model, closingResult.usage, leadId, closingResult.success);
      if (closingResult.actions === null) return json({ error: "ai_request_failed" }, 502);
      // Mesma rede de segurança do fluxo principal: texto sem envio = lead
      // sem receber nada. Aqui dói mais ainda, porque esta é a ÚLTIMA
      // mensagem antes do agente se calar por limite de interações.
      if (!closingResult.actions.includes("enviar_mensagem") && closingResult.finalText) {
        console.warn(`[agent-sds-qualify] mensagem de encerramento veio em texto sem enviar_mensagem (lead ${leadId}) — enviando o texto como resgate`);
        await closingDispatch("enviar_mensagem", { texto: closingResult.finalText });
      }
      return json({ ok: true, actions: closingResult.actions, interaction_limit_reached: true });
    }
  }

  // Compat: agentes criados antes da aba "Perfil"/Objetivos ter sido
  // introduzida têm objectives=[] e continuam no comportamento fixo antigo
  // -- zero mudança de comportamento pra quem já está em produção. O
  // caminho novo (dinâmico) só entra quando a empresa marcou pelo menos um
  // objetivo de propósito.
  const objectives = (agent.objectives as string[] | null) ?? [];
  const enabledTools = (agent.enabled_tools as string[] | null) ?? [];
  const legacy = objectives.length === 0;

  let system: string;
  let tools: AnthropicToolDef[];
  if (legacy) {
    system = `${SDS_METHODOLOGY}\n\n${agent.custom_context ?? ""}`;
    tools = TOOLS;
  } else {
    let kbContext = "";
    if (objectives.includes("atendimento")) {
      // `messages` está em ordem decrescente, então o primeiro !from_me é a
      // pergunta MAIS RECENTE do lead -- que é o que deve guiar a busca.
      const lastLeadMsg = (messages ?? []).find((m) => !m.from_me)?.body as string | undefined;
      kbContext = await retrieveKbContext(db, agent.id as string, companyId, lastLeadMsg || transcript);
    }
    let qualFields: { id: string; label: string }[] = [];
    if (objectives.includes("qualificar") && behaviorConfig.campos_qualificacao?.length) {
      const { data: fieldsData } = await db
        .from("custom_field_items")
        .select("id, label")
        .in("id", behaviorConfig.campos_qualificacao)
        .eq("company_id", companyId);
      qualFields = (fieldsData ?? []) as { id: string; label: string }[];
    }
    system = buildDynamicSystemPrompt(objectives, agent.custom_context ?? "", kbContext, behaviorConfig.objective_instructions ?? {});
    const estadoQualificacao = buildQualificationState(qualFields, lead);
    if (estadoQualificacao) system = `${system}\n\n${estadoQualificacao}`;
    tools = buildDynamicTools(objectives, enabledTools, qualFields);
  }

  // Data/hora de agora entra em TODO agente (legado e dinâmico) -- sem isso
  // o modelo agenda em datas inventadas. Fica antes do resto do prompt pra
  // não competir com instruções longas de Base de Conhecimento.
  system = `${buildNowContext(behaviorConfig)}\n\n${system}`;
  // Agente legado (objectives vazio) também agenda -- a metodologia SDS fixa
  // inclui marcar reunião -- então ele precisa da disponibilidade igual.
  if (legacy || objectives.includes("agendar")) {
    const disponibilidade = await buildAvailabilityContext(db, companyId, agent.id as string, behaviorConfig);
    if (disponibilidade) system = `${system}\n\n${disponibilidade}`;

    // A maior parte dos leads chega por WhatsApp e nunca informou e-mail
    // (na base real do primeiro cliente, 81% estavam sem). Sem e-mail o
    // convite do Google não chega em ninguém e o lead fica só com a
    // mensagem solta -- o que aumenta o não-comparecimento.
    const temEmail = typeof lead.email === "string" && lead.email.includes("@");
    system = temEmail
      ? `${system}\n\nO lead já tem e-mail cadastrado: o convite da reunião será enviado automaticamente. Não peça o e-mail de novo.`
      : `${system}\n\nESTE LEAD NÃO TEM E-MAIL CADASTRADO. Antes de confirmar qualquer agendamento, peça o e-mail dele explicando que é para enviar o convite da reunião. Depois envie esse e-mail no campo "email" da tool agendar_reuniao_closer. Se ele recusar informar, agende assim mesmo e avise que o combinado fica pelo WhatsApp.`;
  }
  if (silencioTexto) {
    system = `${system}\n\nO lead está sem responder há ${silencioTexto}. Calibre o tom por esse intervalo: poucos minutos NÃO são "faz tempo que não falamos". Só trate como reaproximação depois de dias.`;
  }
  // O agente É o atendimento. Prometer "vou te passar pra um atendente" sem
  // de fato transferir cria uma expectativa que nunca se cumpre -- o lead
  // fica esperando alguém que não vem. Se alguém perguntar diretamente se é
  // um robô, deve responder com honestidade; o que não pode é anunciar uma
  // transferência que não vai acontecer.
  // Regra sobre COMPORTAMENTO, não sobre palavras. A primeira versão listava
  // termos proibidos ("atendente", "equipe", "transferência") e o modelo
  // apenas reformulou: "posso encaminhar pra uma pessoa responsável" -- e não
  // chamou tool nenhuma. Promessa vazia: o lead espera um retorno que nunca
  // vem, porque ninguém foi notificado.
  system = `${system}\n\nVocê é quem está atendendo este lead, do início ao fim. NUNCA prometa, ofereça nem insinue que alguém vai responder, retornar, verificar, confirmar ou resolver algo depois — em NENHUMA formulação (vale para "encaminho pra alguém", "uma pessoa responsável te responde", "vou verificar e te retorno", "o time confirma com você", etc.). Diante de algo que você não sabe, existem só dois caminhos válidos: (a) chamar a tool de escalar/transferir AGORA, nesta mesma resposta — e aí sim você pode avisar que está passando para uma pessoa; ou (b) dizer com honestidade que não tem essa informação e seguir com o que está ao seu alcance. Se o lead perguntar diretamente se está falando com uma pessoa ou com IA, responda com sinceridade.

NUNCA exponha bastidores ao lead. Ele é um cliente, não um operador do sistema: não fale de CRM, cadastro, etapa/funil, ferramenta, sistema, registro, base de conhecimento nem do que você "consegue" ou "não consegue" fazer por dentro. O que acontece nos bastidores acontece em silêncio. Se algo não for possível, resolva pelo lado dele ("vou confirmar isso com você na conversa de segunda") sem descrever o motivo técnico. E se o lead pedir algo interno (mover cadastro, mudar etapa, registrar dado), execute se tiver a ferramenta e confirme em linguagem humana — "anotado", "já deixei registrado aqui" — NUNCA repetindo o jargão nem descrevendo a operação. Isso vale mesmo que o próprio lead use esses termos: não devolva "movi seu cadastro para a etapa X"; devolva algo como "perfeito, já está tudo certo por aqui".`;

  // Comportamento é uma camada independente de Objetivos/Ferramentas --
  // aplica em cima do legado ou do dinâmico igualmente.
  const behaviorExtra = buildBehaviorPromptExtra(behaviorConfig, (agent.name as string) ?? "", nomeEmpresa);
  if (behaviorExtra) system = `${system}\n\n${behaviorExtra}`;
  if (behaviorConfig.finalizar_conversa) tools = [...tools, FINALIZAR_CONVERSA_TOOL];
  if (behaviorConfig.transferir_responsavel) tools = [...tools, TRANSFERIR_RESPONSAVEL_TOOL];

  // Follow-up: em vez de um texto fixo (que saía idêntico em toda tentativa
  // e ignorava o que já tinha sido conversado), o próprio agente escreve a
  // cutucada com o histórico à vista e no tom configurado.
  // Lembrete de reunião: o agente escreve a confirmação com o histórico à
  // vista, em vez de um texto genérico. Objetivo é confirmar presença e dar
  // uma saída fácil pra remarcar -- lead que não responde some no dia.
  if (lembreteReuniao) {
    const tz = behaviorConfig.fuso_horario || "America/Sao_Paulo";
    const quando = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz, weekday: "long", day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(lembreteReuniao));

    // O link vem da reunião, não do histórico. A instrução antiga era "se
    // houver link no histórico, repita o link" -- e o link nunca esteve lá,
    // porque o agente também não o enviava na confirmação. Resultado: lembrete
    // sem link nenhum, que é justamente o que a pessoa precisa na hora.
    const { data: reuniaoLembrete } = await db
      .from("activities")
      .select("meet_link")
      .eq("lead_id", leadId)
      .eq("company_id", companyId)
      .eq("type", "meeting")
      .eq("scheduled_at", lembreteReuniao)
      .limit(1);
    const linkLembrete = (reuniaoLembrete?.[0]?.meet_link as string | undefined) ?? null;

    // "hoje" ou "amanhã" calculado em código, não deixado para o modelo. Num
    // lembrete real das 07:00 ele disse "nossa consulta é AMANHÃ" sobre uma
    // reunião que era duas horas depois, no mesmo dia: copiou a expressão do
    // follow-up da noite anterior, que estava certa quando foi escrita.
    const diaNaTz = (d: Date) => new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    const diasDeDiferenca = Math.round(
      (Date.parse(diaNaTz(new Date(lembreteReuniao))) - Date.parse(diaNaTz(new Date()))) / 86_400_000,
    );
    const referenciaDia = diasDeDiferenca === 0 ? "HOJE"
      : diasDeDiferenca === 1 ? "AMANHÃ"
      : `daqui a ${diasDeDiferenca} dias`;

    system = `${system}\n\nCONTEXTO DESTA EXECUÇÃO: esta é uma mensagem de LEMBRETE da reunião marcada para ${quando}. Ela acontece ${referenciaDia} — use exatamente essa referência de dia e NÃO copie "hoje"/"amanhã" de mensagens anteriores suas, que foram escritas em outro dia. Escreva UMA mensagem curta lembrando do encontro e pedindo uma confirmação simples ("consegue confirmar?"). ${
      linkLembrete
        ? `Inclua o link da videochamada em texto: ${linkLembrete}. Nada além disso: no lembrete a pessoa precisa do horário e do link, não de explicação sobre o serviço.`
        : `Esta reunião não tem link de vídeo — não invente nenhum nem prometa enviar depois.`
    } Ofereça remarcar caso não dê mais — sem cobrar nem pressionar. Não recomece a apresentação e não repita textualmente mensagens anteriores suas. Envie pela tool enviar_mensagem.`;
  }

  if (followupAttempt > 0) {
    system = `${system}\n\nCONTEXTO DESTA EXECUÇÃO: o lead parou de responder e esta é a tentativa de reengajamento nº ${followupAttempt}. Escreva UMA mensagem curta retomando algo concreto da conversa acima (o assunto que ficou pendente, um horário já combinado, uma pergunta que ele não terminou de fazer). Não repita textualmente nenhuma mensagem sua anterior, não se reapresente e não invente informação que não esteja na conversa. Se já houver reunião marcada, apenas reforce que está de pé. Nesta mensagem NÃO ofereça transferir para outra pessoa nem prometa retorno de terceiros: o objetivo é só reabrir a conversa. Envie a mensagem pela tool enviar_mensagem.`;
  }

  const toolCtx: ToolCtx = { db, companyId, ownerId: String(lead.owner_id ?? ""), leadId };
  const LEGACY_TOOL_NAMES = new Set(["qualificar_lead", "agendar_reuniao_closer", "mover_pipeline", "cancelar_reuniao", "enviar_mensagem", "escalar_humano", "finalizar_conversa", "transferir_responsavel"]);
  const dispatch: ToolDispatcher = async (name, input) => {
    if (LEGACY_TOOL_NAMES.has(name)) {
      return await executeAgentTool(db, { name, input }, { companyId, leadId, agentId: agent.id as string, lead, behaviorConfig, followupAttempt, telefoneWhats, lembreteReuniao });
    }
    return await executeRegistryTool(toolCtx, name, input);
  };

  // "Digitando..." começa AGORA, antes de chamar o modelo -- não só na hora
  // de mandar a mensagem. O modelo leva ~8s pensando; com o indicador só no
  // fim, o contato via 8 segundos de silêncio, um piscar de 2s e a mensagem
  // aparecendo -- na prática, indicador nenhum. Agora ele vê "digitando"
  // logo depois de mandar a mensagem dele, como numa conversa de verdade.
  // Best-effort: se falhar, o fluxo segue igual (ver sendTyping).
  {
    const connPreview = await resolveOutboundConnection(db, companyId, agent.id as string);
    if (connPreview) {
      await sendTyping({
        instanceId: String(connPreview.instance_id),
        token: String(connPreview.token),
        clientToken: connPreview.client_token ? String(connPreview.client_token) : null,
        provider: (["dapi", "cloud_api"].includes(String(connPreview.provider)) ? String(connPreview.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
      // 10s cobre o tempo típico do modelo (~8s) sem sobrar demais. O que
      // realmente evita o indicador "sobrando" é o clearTyping no fim do
      // envio -- este número é só o teto enquanto ele pensa.
      }, telefoneWhats, 10000);
    }
  }

  const result = provider === "openai"
    ? await runOpenAiLoop(apiKey, model, system, transcript, tools, dispatch)
    : await runAnthropicLoop(apiKey, model, system, transcript, tools, dispatch);
  await logAgentUsage(db, agent.id as string, companyId, model, result.usage, leadId, result.success);
  if (result.actions === null) return json({ error: "ai_request_failed" }, 502);

  // Rede de segurança: o modelo pode encerrar o turno escrevendo em TEXTO em
  // vez de chamar enviar_mensagem. O prompt proíbe, mas proibição no prompt
  // não é garantia -- e quando acontece o lead simplesmente não recebe nada,
  // sem erro em lugar nenhum (num teste real o agente registrou a
  // qualificação inteira e ficou mudo). Se o turno terminou com texto e sem
  // nenhum envio, esse texto vira a mensagem.
  let resgatou = false;
  if (!result.actions.includes("enviar_mensagem") && result.finalText) {
    console.warn(`[agent-sds-qualify] modelo respondeu em texto sem chamar enviar_mensagem (lead ${leadId}) — enviando o texto como resgate`);
    await dispatch("enviar_mensagem", { texto: result.finalText });
    resgatou = true;
  }

  return json({ ok: true, actions: result.actions, texto_resgatado: resgatou });
});

// deno-lint-ignore no-explicit-any
async function executeAgentTool(
  db: ReturnType<typeof createClient>,
  call: any,
  ctx: { companyId: string; leadId: string; agentId: string; lead: Record<string, unknown>; behaviorConfig?: BehaviorConfig; followupAttempt?: number; telefoneWhats?: string; lembreteReuniao?: string },
): Promise<ToolResult> {
  const input = call.input ?? {};

  switch (call.name) {
    case "qualificar_lead": {
      const currentCustom = (ctx.lead.custom_field_values as Record<string, unknown>) ?? {};
      const currentTags = (ctx.lead.tags as string[]) ?? [];
      const newTags = new Set(currentTags.filter((t) => t !== "SDS: Qualificado" && t !== "SDS: Não qualificado"));
      newTags.add(input.qualificado ? "SDS: Qualificado" : "SDS: Não qualificado");

      // Campos além de score/qualificado/motivo são os ids de
      // custom_field_items selecionados na aba Perfil (schema dinâmico —
      // ver buildQualificarLeadTool) -- caem direto no card do lead.
      //
      // A chave PRECISA ser validada: antes era gravada exatamente como o
      // modelo mandasse, e num teste real ele devolveu
      // "Você ja fez ou faz terapia?\n03c9d2d0-..." (rótulo + id) em vez do
      // id puro. O valor era salvo numa chave que a tela não procura -- o
      // agente dizia "registrei", o campo aparecia vazio, e o JSON do lead
      // ia acumulando lixo. Aqui: aceita o id exato, ou resgata o UUID de
      // dentro de uma chave deformada; qualquer outra coisa é descartada.
      const idsValidos = new Set((ctx.behaviorConfig?.campos_qualificacao ?? []));
      const extraFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (key === "score" || key === "qualificado" || key === "motivo") continue;
        let campoId: string | null = idsValidos.has(key) ? key : null;
        if (!campoId) {
          const achado = key.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
          if (achado && idsValidos.has(achado[0])) campoId = achado[0];
        }
        if (campoId) extraFields[campoId] = value;
        else console.warn(`[agent-sds-qualify] qualificar_lead devolveu campo desconhecido, descartado: ${key}`);
      }

      await db.from("leads").update({
        custom_field_values: { ...currentCustom, sds_score: input.score, sds_motivo: input.motivo, ...extraFields },
        tags: Array.from(newTags),
      }).eq("id", ctx.leadId).eq("company_id", ctx.companyId);
      return { ok: true };
    }

    case "agendar_reuniao_closer": {
      // Config de agendamento vem da aba Vendedores -- todas opcionais, com
      // fallback pro comportamento anterior (São Paulo, 60min, Meet sempre).
      const cfg = ctx.behaviorConfig ?? {};
      const timezone = cfg.fuso_horario || "America/Sao_Paulo";
      const duration = Number(input.duration_minutes) || Number(cfg.duracao_reuniao_minutos) || 60;
      const createMeet = cfg.incluir_google_meet ?? true;
      // undefined = true (agentes de antes desse toggle continuam exigindo
      // Google, sem mudança de comportamento) -- ver pickAvailableCloser.
      const googleRequired = cfg.google_calendar_ativo !== false;

      // Reagendamento: se já existe reunião FUTURA desse lead, o lead está
      // movendo ela -- não é uma segunda reunião. Antes o agente sempre
      // inseria uma nova, deixando a antiga órfã no CRM e no Google Calendar
      // ("reunião fantasma"): o vendedor via duas, o balanceamento de carga
      // contava as duas, e o intervalo entre reuniões bloqueava horários que
      // na verdade estavam livres.
      const { data: futuras } = await db
        .from("activities")
        .select("id, owner_id, gcal_event_id")
        .eq("company_id", ctx.companyId)
        .eq("lead_id", ctx.leadId)
        .eq("type", "meeting")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1);
      const remarcar = futuras?.[0] ?? null;

      // Padrão de nome do evento: "<empresa do negócio ou nome do lead> <>
      // <empresa dona do CRM>". Ex.: "Matheus Tonetto <> Consultório
      // Samantha". Antes era "Reunião — Fulano", que na agenda do vendedor
      // não dizia de qual lado vinha cada parte.
      const { data: empresaRow } = await db
        .from("companies").select("name").eq("id", ctx.companyId).maybeSingle();
      // E-mail informado agora na conversa entra no cadastro do lead (só
      // preenche se estiver vazio -- nunca sobrescreve um e-mail já existente
      // com o que o modelo entendeu de ouvido).
      const emailInformado = typeof input.email === "string" && input.email.includes("@")
        ? input.email.trim() : "";
      const emailAtual = typeof ctx.lead.email === "string" && ctx.lead.email.includes("@")
        ? ctx.lead.email : "";
      let emailConvite = emailAtual;
      if (!emailAtual && emailInformado) {
        await db.from("leads").update({ email: emailInformado })
          .eq("id", ctx.leadId).eq("company_id", ctx.companyId);
        emailConvite = emailInformado;
      }

      const ladoLead = String(ctx.lead.company || ctx.lead.name || "Lead").trim();
      const ladoEmpresa = String(empresaRow?.name ?? "").trim();
      const tituloReuniao = ladoEmpresa ? `${ladoLead} <> ${ladoEmpresa}` : ladoLead;

      const closer = await pickAvailableCloser(
        db, ctx.companyId, ctx.agentId, input.start_datetime as string | undefined, duration, cfg,
        remarcar?.owner_id as string | undefined,
        remarcar?.id as string | undefined,
      );
      if (!closer) {
        // ninguém disponível (sem Google conectado quando exigido, fora da
        // janela de disponibilidade declarada, ou sem folga suficiente na
        // agenda) — escala pra humano em vez de falhar silenciosamente
        const motivo = googleRequired
          ? "Nenhum closer disponível nesse horário (conectado ao Google Calendar, dentro da janela liberada e sem conflito de agenda)"
          : "Nenhum closer disponível nesse horário (dentro da janela liberada e sem conflito de agenda)";
        // Escala pro humano, mas devolve FALHA pro modelo. Antes retornava o
        // resultado do escalar_humano, que é { ok: true } -- o modelo lia
        // "deu certo" e anunciava pro lead "remarquei para domingo às 18h",
        // sem que reunião nenhuma existisse. O lead ficava esperando um
        // encontro que não estava na agenda de ninguém.
        await executeAgentTool(db, { name: "escalar_humano", input: { motivo } }, ctx);
        return {
          ok: false,
          error: `NÃO FOI AGENDADO. ${motivo}. Não diga ao lead que a reunião foi marcada ou remarcada: ela não foi. Explique que esse horário não está disponível e ofereça horários dentro da disponibilidade informada no seu contexto.`,
        };
      }

      // Offset calculado a partir do fuso configurado (default São Paulo):
      // sem ele aqui, o Postgres assumiria UTC e o horário salvo no CRM
      // ficaria errado.
      const offset = tzOffsetString(timezone, new Date(`${input.start_datetime}Z`));
      const scheduledAt = `${input.start_datetime}${offset}`;

      // Google Calendar desligado (aba Vendedores): agenda só no calendário
      // do Rezult (activities) -- sem chamar google-calendar-event, sem
      // link de vídeo automático.
      if (!googleRequired) {
        const semGoogle = {
          company_id: ctx.companyId,
          owner_id: closer.userId,
          lead_id: ctx.leadId,
          type: "meeting",
          title: tituloReuniao,
          scheduled_at: scheduledAt,
          duration_minutes: duration,
          meet_link: null,
          gcal_event_id: null,
          description: "Agendado automaticamente pelo agente SDS.",
          // Sem Google não sai convite, mas o card ainda precisa mostrar com
          // quem é a reunião.
          participants: emailConvite ? [emailConvite] : null,
        };
        if (remarcar) {
          await db.from("activities").update(semGoogle).eq("id", remarcar.id);
        } else {
          await db.from("activities").insert(semGoogle);
        }
        return {
          ok: true,
          orientacao: `Reunião ${remarcar ? "remarcada" : "marcada"}. Confirme ao lead nesta mesma resposta com dia e horário. Esta reunião NÃO tem link de vídeo: não prometa nenhum.`,
          data: { meet_link: null, remarcada: !!remarcar },
        };
      }

      // E-mail da conta Google do vendedor -- é a agenda onde o evento nasce,
      // e não necessariamente o e-mail de login dele no CRM.
      const { data: tokenCloser } = await db
        .from("google_oauth_tokens")
        .select("email")
        .eq("user_id", closer.userId)
        .or(`company_id.eq.${ctx.companyId},company_id.is.null`)
        .order("company_id", { ascending: false, nullsFirst: false })
        .limit(1);
      const emailVendedor = (tokenCloser?.[0]?.email as string | undefined) ?? null;
      const convidados = [...new Set([emailConvite, emailVendedor].filter((e): e is string => !!e))];

      const calRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
        },
        body: JSON.stringify({
          // Com event_id a google-calendar-event faz PATCH no evento que já
          // existe (move o horário) em vez de criar outro -- é isso que evita
          // a reunião fantasma na agenda do vendedor. Só reusa quando o
          // vendedor continua o mesmo; se mudou, o evento antigo é de outra
          // pessoa e precisa mesmo de um evento novo.
          ...(remarcar?.gcal_event_id && remarcar.owner_id === closer.userId
            ? { event_id: remarcar.gcal_event_id }
            : {}),
          title: tituloReuniao,
          description: "Agendado automaticamente pelo agente SDS.",
          start_datetime: input.start_datetime,
          duration_minutes: duration,
          create_meet: createMeet,
          timezone,
          company_id: ctx.companyId,
          user_id: closer.userId,
          // O lead precisa ser CONVIDADO, não só constar no título: sem isso
          // o evento nascia sem participante nenhum, então ele não recebia
          // convite, nem lembrete, nem o link do Meet na própria agenda --
          // só a mensagem solta no WhatsApp. Lead sem e-mail cadastrado
          // segue como antes (evento só na agenda do vendedor).
          //
          // O vendedor entra junto: o evento é criado COM o token dele, então
          // ele é o organizador, e organizador não aparece na lista de
          // convidados. O lead recebia um convite onde ele era o único
          // participante, sem nem saber com quem ia falar.
          ...(convidados.length ? { attendees: convidados } : {}),
        }),
      });

      if (!calRes.ok) {
        const detail = await calRes.text();
        console.error("[agent-sds-qualify] google-calendar-event falhou:", detail);
        return { ok: false, error: `falha ao agendar: ${detail.slice(0, 200)}` };
      }
      const calData = await calRes.json();

      const linhaReuniao = {
        company_id: ctx.companyId,
        owner_id: closer.userId,
        lead_id: ctx.leadId,
        type: "meeting",
        title: tituloReuniao,
        scheduled_at: scheduledAt,
        duration_minutes: duration,
        meet_link: calData.meet_link ?? null,
        gcal_event_id: calData.event_id ?? null,
        description: "Agendado automaticamente pelo agente SDS.",
        // Mesmo campo que o ActivityDialog grava quando um humano marca:
        // sem ele o card da atividade no CRM não mostrava convidado nenhum,
        // e o vendedor não tinha como saber se o convite tinha ido.
        participants: convidados.length ? convidados : null,
      };
      if (remarcar) {
        await db.from("activities").update(linhaReuniao).eq("id", remarcar.id);
      } else {
        await db.from("activities").insert(linhaReuniao);
      }
      // A orientação vai NO RESULTADO da tool, não no prompt: é o que o
      // modelo lê ao compor a resposta. Sem ela ele confirmava o horário e
      // dizia "te enviei o convite por e-mail", sem o link -- e quem não abre
      // e-mail ficava sem saber por onde entrar.
      const orientacao = calData.meet_link
        ? `Reunião ${remarcar ? "remarcada" : "marcada"}. Confirme ao lead nesta mesma resposta com dia, horário E o link da videochamada em texto: ${calData.meet_link}. O link precisa aparecer na mensagem do WhatsApp, não basta dizer que foi por e-mail.`
        : `Reunião ${remarcar ? "remarcada" : "marcada"}. Confirme ao lead nesta mesma resposta com dia e horário. Não prometa link de vídeo: esta reunião não tem.`;
      return { ok: true, orientacao, data: { meet_link: calData.meet_link ?? null, remarcada: !!remarcar } };
    }

    case "cancelar_reuniao": {
      const { data: futuras } = await db
        .from("activities")
        .select("id, owner_id, gcal_event_id, scheduled_at")
        .eq("company_id", ctx.companyId)
        .eq("lead_id", ctx.leadId)
        .eq("type", "meeting")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1);
      const reuniao = futuras?.[0];
      if (!reuniao) {
        return { ok: false, error: "não há reunião futura marcada com este lead. NÃO diga que cancelou." };
      }

      // Apaga do Google primeiro: se falhar, o evento continua na agenda do
      // vendedor e cancelar só no CRM daria uma falsa sensação de resolvido
      // -- o vendedor seguiria com o horário bloqueado.
      if (reuniao.gcal_event_id) {
        const delRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": Deno.env.get("AGENT_INTERNAL_SECRET") ?? "",
          },
          body: JSON.stringify({
            event_id: reuniao.gcal_event_id,
            company_id: ctx.companyId,
            user_id: reuniao.owner_id,
          }),
        });
        if (!delRes.ok) {
          const detalhe = await delRes.text();
          console.error("[agent-sds-qualify] google-calendar-delete falhou:", detalhe);
          return { ok: false, error: `não foi possível cancelar na agenda: ${detalhe.slice(0, 160)}. NÃO diga ao lead que está cancelado.` };
        }
      }

      // Lembretes pendentes somem junto (ON DELETE CASCADE cuidaria disso,
      // mas o registro fica explícito aqui) e a reunião sai do CRM.
      await db.from("agent_meeting_reminders").delete().eq("activity_id", reuniao.id);
      await db.from("activities").delete().eq("id", reuniao.id).eq("company_id", ctx.companyId);

      await db.from("activities").insert({
        company_id: ctx.companyId,
        owner_id: reuniao.owner_id ?? (ctx.lead.owner_id as string),
        lead_id: ctx.leadId,
        type: "note",
        title: "Reunião cancelada pelo lead (via agente)",
        description: String(input.motivo ?? "sem motivo informado"),
      });
      // A orientação vai no RESULTADO da tool, não só na descrição dela: o
      // modelo lê isso no meio da execução, quando ainda está decidindo o que
      // escrever. Sem isso ele cancelava e encerrava o assunto ("Cancelei a
      // conversa de hoje.") -- e um lead que já tinha horário marcado ia
      // embora sem ninguém tentar trazer de volta.
      return {
        ok: true,
        orientacao: "Reunião cancelada. AGORA, nesta mesma resposta, ofereça remarcar: pergunte o que fica melhor e sugira horários concretos dentro da disponibilidade informada no seu contexto. Não encerre a conversa.",
      };
    }

    case "mover_pipeline": {
      await db.from("leads").update({ column_id: input.coluna_id }).eq("id", ctx.leadId).eq("company_id", ctx.companyId);
      return { ok: true };
    }

    case "enviar_mensagem": {
      const conn = await resolveOutboundConnection(db, ctx.companyId, ctx.agentId);
      if (!conn) return { ok: false, error: "nenhuma conexão de WhatsApp disponível para este agente" };

      const creds: ZapiCreds = {
        instanceId: String(conn.instance_id),
        token: String(conn.token),
        clientToken: conn.client_token ? String(conn.client_token) : null,
        provider: (["dapi", "cloud_api"].includes(String(conn.provider)) ? String(conn.provider) : "zapi") as "zapi" | "dapi" | "cloud_api",
      };
      const phone = String(ctx.lead.whatsapp ?? "");
      const cfg = ctx.behaviorConfig ?? {};
      const fullText = String(input.texto ?? "");
      const parts = cfg.dividir_mensagens ? splitLongMessage(fullText, Number(cfg.dividir_mensagens_palavras) || 20) : [fullText];

      // Calcula o tempo de cada parte e, se o total estourar o orçamento,
      // comprime todas proporcionalmente -- melhor uma conversa um pouco
      // mais rápida do que a function ser morta no meio do envio.
      const temposBrutos = parts.map((p) => tempoDigitacao(p));
      const somaBruta = temposBrutos.reduce((a, b) => a + b, 0);
      const fator = somaBruta > TETO_DIGITACAO_TOTAL_MS ? TETO_DIGITACAO_TOTAL_MS / somaBruta : 1;
      const tempos = temposBrutos.map((t) => Math.round(t * fator));

      const telefonePresenca = ctx.telefoneWhats || phone;

      for (let i = 0; i < parts.length; i++) {
        // "Digitando..." antes de CADA parte, pelo tempo proporcional ao
        // texto dela: o contato vê o indicador e a mensagem chega quando ele
        // para, igual a uma pessoa escrevendo.
        await aguardarDigitando(creds, telefonePresenca, tempos[i]);

        await sendWa(creds, { kind: "text", phone, message: parts[i] });
        // owner_id é NOT NULL aqui também — mesmo padrão do automation-runner,
        // usa o responsável do lead.
        await db.from("whatsapp_messages").insert({
          company_id: ctx.companyId,
          owner_id: ctx.lead.owner_id as string,
          instance_id: creds.instanceId,
          phone,
          from_me: true,
          body: parts[i],
          type: "text",
        });
      }

      // Encerra o "digitando" assim que a última parte sai. Sem isso o
      // indicador ficava rodando até o timer expirar e, numa resposta curta,
      // o contato via a mensagem chegar com o "digitando" ainda ativo --
      // parecia que vinha mais coisa.
      await clearTyping(creds, ctx.telefoneWhats || phone);

      // Follow-up automático: toda mensagem real do agente reinicia o
      // relógio de silêncio -- se o lead não responder no intervalo
      // configurado, agent-followup-runner assume a partir daqui.
      //
      // Quando ESTA execução já é o follow-up (chamada pelo runner), não
      // rearma nada: quem controla tentativa e próximo horário nesse caso é
      // o runner. Sem essa guarda, cada follow-up zeraria o contador de
      // tentativas e o lead seria cutucado para sempre.
      if (cfg.followup_ativo && !ctx.followupAttempt && !ctx.lembreteReuniao) {
        const unitMs = cfg.followup_intervalo_unidade === "horas" ? 3_600_000 : 60_000;
        const intervalMs = (Number(cfg.followup_intervalo_valor) || 30) * unitMs;
        await db.from("agent_followup_state").upsert({
          agent_id: ctx.agentId, company_id: ctx.companyId, lead_id: ctx.leadId, phone,
          attempt_count: 0, next_attempt_at: new Date(Date.now() + intervalMs).toISOString(), status: "ativo",
        }, { onConflict: "agent_id,lead_id" });
      }

      // Conta como 1 interação da IA neste atendimento, independente de ter
      // sido dividida em várias partes (aba Configurações > "Limite de
      // interações"). Atualiza direto por incremento -- evita race entre
      // select e update se o webhook disparar duas vezes rápido.
      // Conversa mais recente (mesmo motivo do gate de limite lá em cima:
      // pode haver mais de uma linha pro mesmo telefone, e maybeSingle
      // errava em vez de escolher uma -- o contador nunca subia).
      {
        const { data: convRows } = await db.from("whatsapp_conversations").select("id, ai_interaction_count").eq("company_id", ctx.companyId).in("phone", phoneVariants(phone)).order("last_msg_at", { ascending: false }).limit(1);
        const conv = convRows?.[0];
        if (conv?.id) await db.from("whatsapp_conversations").update({ ai_interaction_count: ((conv.ai_interaction_count as number | undefined) ?? 0) + 1 }).eq("id", conv.id);
      }

      return { ok: true };
    }

    case "finalizar_conversa": {
      // Atualiza TODAS as linhas do telefone (não só uma): o mesmo contato
      // pode ter conversas duplicadas, e antes o maybeSingle errava nesse
      // caso e a conversa nunca era marcada como finalizada.
      await db.from("whatsapp_conversations")
        .update({ finished: true, ai_interaction_count: 0 })
        .eq("company_id", ctx.companyId)
        .in("phone", phoneVariants(String(ctx.lead.whatsapp ?? "")));
      return { ok: true };
    }

    case "transferir_responsavel": {
      // Remove a tag "Agente" de leads.tags -- é essa tabela que hasAgentTag
      // checa (fonte real da verdade), então é isso que de fato desliga o
      // agente pra esse negócio a partir daqui. Também remove de
      // whatsapp_conversations.tags pra manter o filtro "Agente" do
      // Multiatendimento coerente (mesmo padrão dual que a UI de lá usa) --
      // e deixa uma nota pro humano que assumir entender o motivo.
      const currentLeadTags = (ctx.lead.tags as string[] | null) ?? [];
      const nextLeadTags = currentLeadTags.filter((t) => t !== "Agente");
      await db.from("leads").update({ tags: nextLeadTags }).eq("id", ctx.leadId).eq("company_id", ctx.companyId);

      // Todas as linhas do telefone (mesmo motivo de finalizar_conversa) --
      // cada uma tem sua própria lista de tags, então filtra uma a uma.
      const { data: convRows } = await db.from("whatsapp_conversations").select("id, tags").eq("company_id", ctx.companyId).in("phone", phoneVariants(String(ctx.lead.whatsapp ?? "")));
      for (const conv of convRows ?? []) {
        const nextConvTags = ((conv.tags as string[] | null) ?? []).filter((t) => t !== "Agente");
        await db.from("whatsapp_conversations").update({ tags: nextConvTags, ai_interaction_count: 0 }).eq("id", conv.id);
      }
      await db.from("activities").insert({
        company_id: ctx.companyId,
        owner_id: ctx.lead.owner_id as string,
        lead_id: ctx.leadId,
        type: "note",
        title: "Agente transferiu a conversa — objetivo concluído",
        description: String(input.motivo ?? "sem motivo informado"),
      });
      return { ok: true };
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
      return { ok: true };
    }

    default:
      return { ok: false, error: `tool "${call.name}" desconhecida` };
  }
}
