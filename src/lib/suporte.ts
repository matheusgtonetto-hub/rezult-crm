// O canal de atendimento do Rezult, num lugar só.
//
// Estes dois valores já existiam, escritos dentro da `InicioPage`, com um
// comentário que explicava exatamente por que estavam em constante: "é um dado
// de negócio que muda (número novo, atendimento por outro time) e quem for
// trocar precisa achá-lo sem ler a tela inteira".
//
// O raciocínio continua valendo, e é ele que trouxe os valores para cá quando
// o botão de Suporte apareceu na barra superior (29/09/2026). Deixar uma
// segunda cópia lá derrubaria justamente a razão de eles serem constantes: na
// troca do número, um dos dois botões continuaria mandando a pessoa para o
// atendimento antigo, e sem erro nenhum para avisar.

/** WhatsApp do suporte, só dígitos, no formato que o wa.me espera. */
export const WHATSAPP_SUPORTE = "554891160449";

/** Mensagem que já vai digitada, para o atendente saber de onde veio o contato. */
export const MENSAGEM_SUPORTE = "Olá! Preciso de ajuda com o Rezult CRM.";

/**
 * O endereço pronto para o `href`.
 *
 * Existe para o `encodeURIComponent` não ficar por conta de cada chamador: a
 * mensagem tem acento e ponto de exclamação, e um esquecimento aqui não
 * quebraria a tela -- abriria o WhatsApp com o texto truncado, que é o tipo de
 * defeito que só aparece quando um cliente reclama.
 */
export const linkDoSuporte = () =>
  `https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(MENSAGEM_SUPORTE)}`;
