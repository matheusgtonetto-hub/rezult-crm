// Ponte do frontend para o envio compartilhado.
//
// sendWa não usa nada exclusivo do Deno (recebe as credenciais por parâmetro e
// só chama fetch), então a mesma implementação serve o navegador e as edge
// functions. Mesmo arranjo de telefone.ts, conversas.ts e respostaEnvio.ts.
//
// NOTA sobre o que ainda não passa por aqui: os envios de texto das duas telas
// de chat continuam com os três ramos de provedor escritos inline. Eles usam
// fetchWithRetry, e sendWa não repete tentativa -- unificar exigiria decidir se
// repetir um envio que falhou é seguro (pode duplicar mensagem se a primeira
// tiver saído e só a resposta ter se perdido). Fica para uma rodada dedicada,
// não de carona no encaminhar.
export { sendWa, type ZapiCreds, type WaMsg } from "../../supabase/functions/_shared/whatsapp-send.ts";
