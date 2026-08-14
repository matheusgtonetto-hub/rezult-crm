// Id da mensagem devolvido pelo provedor no envio.
//
// Até aqui a gente descartava esse id: mandava a mensagem, gravava a linha e
// deixava message_id nulo. São 707 mensagens assim na base, e o custo apareceu
// no primeiro teste de citação -- o cliente respondeu citando uma mensagem que o
// agente tinha enviado, e o id citado não casou com linha nenhuma, porque a
// nossa linha não tinha id.
//
// Guardar esse id é pré-requisito de três coisas: resolver citação para a
// mensagem original, apagar mensagem no WhatsApp (o endpoint pede o id) e
// encaminhar.

/**
 * Procura o id da mensagem na resposta do envio.
 *
 * Cada provedor devolve num lugar, e a documentação da D-API não especifica o
 * formato da resposta de sucesso -- por isso a busca é tolerante e por isso
 * existe o log em `descreverResposta` abaixo: descobrir pelo dado real é mais
 * confiável que adivinhar pelo que a documentação deveria dizer.
 *
 * Formatos conhecidos:
 *   Cloud API ... { messages: [{ id: "wamid.HBg..." }] }
 *   Z-API ....... { messageId | id | zaapId }
 *   D-API ....... não documentado; as formas abaixo cobrem os arranjos usuais
 */
export function extrairIdDaResposta(resposta: unknown): string | null {
  const objeto = (v: unknown): Record<string, unknown> =>
    (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const texto = (v: unknown): string | null =>
    typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : null;

  const raiz = objeto(resposta);
  const data = objeto(raiz.data);
  const key = objeto(raiz.key ?? data.key);
  const primeiraMensagem = objeto(
    Array.isArray(raiz.messages) ? raiz.messages[0]
    : Array.isArray(data.messages) ? data.messages[0]
    : null,
  );

  return (
    texto(primeiraMensagem.id) ??      // Cloud API
    texto(raiz.messageId) ??           // Z-API
    texto(raiz.id) ??
    texto(data.messageId) ??           // D-API, arranjos plausíveis
    texto(data.id) ??
    texto(key.id) ??
    texto(raiz.zaapId) ??              // Z-API, id interno deles
    null
  );
}

/**
 * Resumo curto da resposta, para log quando o id não foi encontrado.
 *
 * Serve para descobrir o formato de um provedor sem precisar de acesso ao
 * ambiente dele: a primeira mensagem enviada revela a estrutura no log da
 * function. Corta o corpo porque log não é lugar de guardar payload inteiro, e
 * mensagem enviada pode conter dado do cliente.
 */
export function descreverResposta(resposta: unknown): string {
  try {
    const s = JSON.stringify(resposta);
    if (!s) return "(resposta vazia)";
    const chaves = typeof resposta === "object" && resposta !== null
      ? Object.keys(resposta as Record<string, unknown>).join(",")
      : "(não é objeto)";
    return `chaves=[${chaves}] corpo=${s.slice(0, 300)}`;
  } catch {
    return "(resposta não serializável)";
  }
}
