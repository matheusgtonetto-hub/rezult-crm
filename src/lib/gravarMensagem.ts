import type { SupabaseClient } from "@supabase/supabase-js";
import { previewLabelFor, upsertConversationForMessage } from "@/lib/conversas";

// Insere mensagem já vinculada à conversa, sem nunca perder a mensagem.
//
// O id da conversa vem da tela. Se ele não existe em whatsapp_conversations
// (conversa iniciada aqui que não chegou a ser gravada, ou id que ficou velho),
// a chave estrangeira recusa o insert (23503).
//
// Antes, a mensagem era regravada SEM vínculo. Ficava solta, a resposta do
// contato criava outra conversa pelo webhook, e o mesmo contato aparecia em
// duas conversas lado a lado. Foi o que aconteceu em 20/11/2026 às 19:05: a
// única mensagem sem conversa dos últimos 30 dias, entre mais de 11 mil.
//
// Agora acha ou cria a conversa DE VERDADE pelo telefone e pela linha, com a
// mesma função dos webhooks e do chat flutuante, e grava a mensagem nela.
// Devolve o id usado; se for outro, quem chamou troca o da tela
// (adotarConversaReal, no Multiatendimento). Vale só para mensagem enviada por
// nós: evento de sistema continua indo sem vínculo. E a mensagem nunca se
// perde: sem conversa achada, grava sem vínculo, como antes.
export async function gravarMensagemVinculada(
  cliente: SupabaseClient,
  payload: Record<string, unknown>,
  conversationId: string | null | undefined,
  nomeDoContato?: string | null,
): Promise<{ error: { message: string; code?: string } | null; conversationId: string | null }> {
  const { error } = await cliente
    .from("whatsapp_messages")
    .insert({ ...payload, conversation_id: conversationId ?? null });
  if (!error) return { error: null, conversationId: conversationId ?? null };
  if (error.code !== "23503" || !conversationId) return { error, conversationId: conversationId ?? null };

  let idReal: string | null = null;
  if (payload.from_me === true && payload.type !== "system") {
    try {
      idReal = await upsertConversationForMessage(cliente, {
        ownerId: String(payload.owner_id ?? ""),
        companyId: (payload.company_id as string | null | undefined) ?? null,
        instanceId: String(payload.instance_id ?? ""),
        phone: String(payload.phone ?? ""),
        name: nomeDoContato ?? null,
        preview: previewLabelFor(payload.type as string | undefined, payload.body as string | null | undefined),
        fromMe: true,
      });
    } catch (e) {
      console.error("[multiatendimento] não consegui achar nem criar a conversa da mensagem:", e);
    }
  }
  if (!idReal) {
    console.warn(
      `[multiatendimento] conversa ${conversationId} não existe no banco; mensagem gravada sem vínculo.`,
    );
  }
  const { error: erroFinal } = await cliente
    .from("whatsapp_messages")
    .insert({ ...payload, conversation_id: idReal });
  return { error: erroFinal, conversationId: idReal };
}
