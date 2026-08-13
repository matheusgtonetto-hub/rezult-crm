import { variantesDeTelefone } from "./telefone.ts";

// Garante que toda mensagem de WhatsApp (recebida via webhook ou enviada por
// automação) tenha uma linha correspondente em whatsapp_conversations,
// independente de existir algum navegador com o Multiatendimento aberto no
// momento. Antes, essa linha só era criada reativamente por um listener
// realtime no cliente — se ninguém estivesse com a tela aberta quando a
// mensagem chegava/saía, a conversa nunca era criada e as mensagens ficavam
// "penduradas" em whatsapp_messages sem aparecer em lugar nenhum no CRM.
// Usado por dapi-webhook, zapi-webhook, cloud-api-webhook e automation-runner.

// Todas as variantes plausíveis de como o telefone pode ter sido salvo (com/sem
// "+", com/sem código do país 55, com/sem o 9º dígito de celular) -- mesmo
// núcleo de normalização usado no cliente (MultiatendimentoPage.tsx) e nos
// webhooks (zapi-webhook, dapi-webhook). Sem isso, uma conversa criada fora de
// um webhook (ex.: "Nova conversa" a partir de um Lead, cujo telefone vem no
// formato "+55...") nunca batia com o telefone limpo (só dígitos) que os
// webhooks sempre usam, e cada mensagem real criava uma segunda conversa.
// A regra de variantes vive em _shared/telefone.ts.

/**
 * Devolve o id da conversa (existente ou recém-criada), ou null quando não
 * conseguiu resolver.
 *
 * Passou a devolver o id na Fase 1 do plano de atendimentos: quem chama insere
 * a mensagem logo depois e grava esse id em whatsapp_messages.conversation_id,
 * para a mensagem NASCER vinculada em vez de depender de casar telefone por
 * texto na hora de ler.
 *
 * Null não é erro do chamador: significa "não sei a que conversa isto pertence".
 * A mensagem ainda deve ser gravada, com conversation_id nulo, porque a mensagem
 * é o fato e o agrupamento é secundário. Perder a mensagem para preservar o
 * vínculo seria trocar o essencial pelo acessório.
 */
// deno-lint-ignore no-explicit-any
export async function upsertConversationForMessage(supabase: any, params: {
  ownerId: string;
  companyId: string | null;
  instanceId: string;
  phone: string;
  name?: string | null;
  preview: string;
  fromMe: boolean;
}): Promise<string | null> {
  const { ownerId, companyId, instanceId, phone, name, preview, fromMe } = params;
  const nowIso = new Date().toISOString();
  // Inbound: fica não-lida (vira "Aguardando" assim que a conversa tiver
  // atendente atribuído). Outbound (nosso lado): sempre lida — última
  // mensagem foi nossa, então por definição não pode estar "aguardando".
  const read = fromMe;

  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("instance_id", instanceId)
    .in("phone", variantesDeTelefone(phone))
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("whatsapp_conversations")
      .update({ preview, last_msg_at: nowIso, read })
      .eq("id", existing.id);
    return existing.id as string;
  }

  // Id gerado aqui, não pelo banco, justamente para poder devolvê-lo sem uma
  // segunda ida ao servidor.
  const novoId = crypto.randomUUID();
  const { error } = await supabase.from("whatsapp_conversations").insert({
    id: novoId,
    owner_id: ownerId,
    company_id: companyId,
    instance_id: instanceId,
    name: name || phone,
    phone,
    channel: "whatsapp",
    tags: [],
    preview,
    last_msg_at: nowIso,
    read,
  });

  if (!error) return novoId;
  if (error.code !== "23505") {
    console.error("upsertConversationForMessage: insert error:", error);
    return null;
  }
  // Corrida: outra chamada concorrente (ou o próprio cliente, com a tela
  // aberta, via seu próprio listener realtime) já criou a linha entre o
  // select e o insert acima — só atualiza a que venceu.
  //
  // Busca por VARIANTES, não por igualdade exata. Quem venceu a corrida pode ter
  // gravado o telefone em outro formato (com 55, sem o nono), e com `.eq` esta
  // consulta não encontrava nada: a conversa ficava sem o preview atualizado e,
  // agora que devolvemos o id, a mensagem nasceria sem vínculo. É o mesmo
  // descuido de formato que o select lá em cima já evitava.
  const { data: winner } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("instance_id", instanceId)
    .in("phone", variantesDeTelefone(phone))
    .limit(1)
    .maybeSingle();
  if (winner?.id) {
    await supabase.from("whatsapp_conversations")
      .update({ preview, last_msg_at: nowIso, read })
      .eq("id", winner.id);
    return winner.id as string;
  }
  return null;
}

// Texto de preview da conversa. Usado pelos webhooks, pelos runners e pelo
// cliente (via src/lib/conversas.ts) -- uma definição só, em vez das duas que
// existiam aqui e em MultiatendimentoPage.tsx com um comentário prometendo que
// não iam divergir.
export function previewLabelFor(type: string | undefined, body: string | null | undefined): string {
  if (type === "audio")    return "🎤 Mensagem de áudio";
  if (type === "image")    return "🖼️ Imagem";
  if (type === "document") return `📎 ${body || "Arquivo"}`;
  return body ?? "";
}

/**
 * Ids das conversas de um telefone, para buscar mensagens pelo VÍNCULO em vez
 * de casar texto na tabela de mensagens.
 *
 * Existe porque casar telefone direto em whatsapp_messages tem três problemas
 * que só pioram com o tamanho da base:
 *
 *   1. formato. Um telefone gravado como "+5555996635570" não casa com nenhuma
 *      das quatro variantes, que são só dígitos. Existe 1 assim na base hoje.
 *   2. colisão. Casar pelos últimos 8 dígitos junta DDDs diferentes: 11 91152442
 *      e 48 91152442 são pessoas diferentes. Hoje não colide, mas a chance
 *      cresce com o quadrado do número de contatos.
 *   3. custo. `ilike '%12345678'` não usa índice, então é varredura completa.
 *
 * A conversa resolve os três: casa uma vez, por núcleo, numa tabela pequena
 * (centenas de linhas), e a partir daí a busca de mensagens é por id indexado.
 */
// deno-lint-ignore no-explicit-any
export async function idsDeConversasPorTelefone(supabase: any, params: {
  ownerId?: string | null;
  companyId?: string | null;
  phone: string;
  instancias?: string[];
}): Promise<string[]> {
  const { ownerId, companyId, phone, instancias } = params;
  const variantes = variantesDeTelefone(phone);
  if (!variantes.length) return [];

  let q = supabase.from("whatsapp_conversations").select("id").in("phone", variantes);
  if (ownerId) q = q.eq("owner_id", ownerId);
  if (companyId) q = q.eq("company_id", companyId);
  if (instancias?.length) q = q.in("instance_id", instancias);

  const { data, error } = await q;
  if (error) {
    console.error("idsDeConversasPorTelefone:", error);
    return [];
  }
  return ((data ?? []) as { id: string }[]).map((c) => c.id);
}
