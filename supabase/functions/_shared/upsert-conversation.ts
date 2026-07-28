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
function phoneVariants(raw: string): string[] {
  let core = String(raw).replace(/\D/g, "");
  if (core.length > 11 && core.startsWith("55")) core = core.slice(2);
  if (core.length === 11 && core[2] === "9") core = core.slice(0, 2) + core.slice(3);
  if (core.length < 10) return [String(raw).replace(/\D/g, "")].filter(Boolean);
  const ddd = core.slice(0, 2);
  const eight = core.slice(-8);
  const with9 = `${ddd}9${eight}`;
  return [...new Set([core, with9, `55${core}`, `55${with9}`])];
}

// deno-lint-ignore no-explicit-any
export async function upsertConversationForMessage(supabase: any, params: {
  ownerId: string;
  companyId: string | null;
  instanceId: string;
  phone: string;
  name?: string | null;
  preview: string;
  fromMe: boolean;
}): Promise<void> {
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
    .in("phone", phoneVariants(phone))
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("whatsapp_conversations")
      .update({ preview, last_msg_at: nowIso, read })
      .eq("id", existing.id);
    return;
  }

  const { error } = await supabase.from("whatsapp_conversations").insert({
    id: crypto.randomUUID(),
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

  if (!error) return;
  if (error.code !== "23505") {
    console.error("upsertConversationForMessage: insert error:", error);
    return;
  }
  // Corrida: outra chamada concorrente (ou o próprio cliente, com a tela
  // aberta, via seu próprio listener realtime) já criou a linha entre o
  // select e o insert acima — só atualiza a que venceu.
  const { data: winner } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("instance_id", instanceId)
    .eq("phone", phone)
    .maybeSingle();
  if (winner?.id) {
    await supabase.from("whatsapp_conversations")
      .update({ preview, last_msg_at: nowIso, read })
      .eq("id", winner.id);
  }
}

// Espelha src/pages/MultiatendimentoPage.tsx::previewLabelFor — mesmo texto
// de preview usado no cliente, pra não ter dois formatos diferentes.
export function previewLabelFor(type: string | undefined, body: string | null | undefined): string {
  if (type === "audio")    return "🎤 Mensagem de áudio";
  if (type === "image")    return "🖼️ Imagem";
  if (type === "document") return `📎 ${body || "Arquivo"}`;
  return body ?? "";
}
