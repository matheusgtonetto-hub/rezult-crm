// Ponte do frontend para a lógica de conversa que já existe do lado do Deno.
//
// Mesmo arranjo de src/lib/telefone.ts, e pela mesma razão: o arquivo real mora
// em supabase/functions/_shared porque as edge functions precisam alcançá-lo por
// caminho relativo no deploy. Ele não usa nenhuma API exclusiva do Deno (recebe
// o cliente Supabase por parâmetro e chama crypto.randomUUID, que o navegador
// também tem), então roda igual nos dois lados.
//
// Reexport puro. A alternativa seria reescrever a mesma regra no cliente, que é
// exatamente o que a Fase 0 passou uma sessão inteira desfazendo: previewLabelFor
// já vivia duplicado aqui e lá, com um comentário no lado Deno dizendo "espelha
// MultiatendimentoPage.tsx" -- que é a forma educada de dizer "vai divergir".
export {
  upsertConversationForMessage,
  previewLabelFor,
} from "../../supabase/functions/_shared/upsert-conversation.ts";
