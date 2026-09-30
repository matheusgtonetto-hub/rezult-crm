// deno-lint-ignore-file no-explicit-any

/**
 * A chave que roda a IA do produto. Uma só: a da Rezult.
 *
 * ═══ O que mudou em 30/09/2026 ══════════════════════════════════════════════
 *
 * O produto deixou de ser BYOK. A tela de cadastro de chave saiu de
 * Configurações, a ativação de agente passou a exigir SALDO em vez de chave, e
 * este módulo parou de ler `ai_provider_keys`.
 *
 * O que existia antes era uma bifurcação:
 *
 *   tem saldo  →  chave da REZULT, e o consumo é DEBITADO do saldo
 *   sem saldo  →  chave do CLIENTE, e nada é debitado (ele paga o fornecedor)
 *
 * A segunda metade morreu. Quem não tem saldo não roda IA -- `pode_gastar` já
 * devolvia `sem_saldo` e todos os chamadores já tratavam esse caso, porque ele
 * também acontecia com quem tinha saldo e o esgotou no meio do mês. O caminho
 * do cliente era a exceção, e a exceção virou o caminho único ao contrário:
 * agora é saldo ou nada.
 *
 * ═══ Por que `ai_provider_keys` continua no banco ═══════════════════════════
 *
 * Porque a tabela tem chaves de cliente cadastradas antes da mudança, e apagar
 * dado de cliente não é decisão de refactor. Nada mais LÊ a tabela -- se algum
 * caminho voltar a lê-la, é regressão.
 *
 * ═══ Por que `daRezult` sobrevive ao corte ══════════════════════════════════
 *
 * Ele é hoje sempre `true`, e podia sair. Fica porque é ele que `registrarUso`
 * recebe como `debitar`, em oito pontos de chamada: tirá-lo transformaria uma
 * mudança de política numa varredura em cinco Edge Functions, e a decisão
 * "esta chamada é debitada?" continua sendo uma pergunta legítima do domínio.
 */

export type ChaveDeIa = {
  apiKey: string;
  /**
   * Sempre `true` desde 30/09/2026: toda chamada de IA sai da chave da Rezult
   * e é debitada do saldo. Ver a nota do módulo.
   *
   * Vai direto para `registrarUso({ debitar })`.
   */
  daRezult: boolean;
};

/**
 * A chave da Rezult, que abastece o crédito vendido.
 *
 * `REZULT_OPENAI_API_KEY` é o nome próprio. `OPENAI_API_KEY` fica como segunda
 * opção por compatibilidade: ela já existia nesta base como "fallback de
 * desenvolvimento" e pode estar configurada em produção. Nome próprio é melhor
 * justamente para uma chave de desenvolvimento não virar, por acidente, a
 * chave que cobra a operação inteira.
 */
function chaveDaRezult(): string {
  return Deno.env.get("REZULT_OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
}

/**
 * Resolve a chave de IA de uma empresa.
 *
 * Devolve `null` quando a chamada não pode acontecer -- o chamador decide como
 * reagir, porque a reação certa muda: o agente faz skip silencioso e a
 * sugestão de resposta mostra erro na tela.
 *
 * São dois motivos de `null`, e os dois são falha NOSSA, não do cliente:
 *
 *   1. `provider` diferente de `openai`. O catálogo só vende OpenAI desde
 *      25/09/2026 (ver `IA_ESFORCOS`), e em 30/09/2026 não havia nenhum agente
 *      gravado fora da família `gpt-5.6`. Um `anthropic` chegando aqui é fluxo
 *      antigo que ninguém migrou, e agora ele para em vez de cobrar do cliente.
 *   2. `REZULT_OPENAI_API_KEY` ausente. Antes isso caía na chave do cliente sem
 *      debitar, que era o menos errado quando existia chave de cliente. Não
 *      existe mais: o certo é falhar alto, porque é configuração nossa.
 *
 * O que este módulo NÃO decide é se há saldo. Quem responde isso é
 * `pode_gastar`, e todo chamador já pergunta antes. Separado de propósito: são
 * duas perguntas diferentes ("a chamada pode acontecer?" e "com qual chave?"),
 * e o teto diário derruba a primeira sem mexer na segunda.
 */
export async function resolverChaveDeIa(
  _db: any,
  companyId: string,
  provider: string,
  origem: string,
): Promise<ChaveDeIa | null> {
  if (provider !== "openai") {
    console.error(
      `[${origem}] provedor "${provider}" pedido pela empresa ${companyId}, e o produto so roda openai desde 30/09/2026. ` +
      "Chamada recusada: nao existe mais chave de cliente para cair.",
    );
    return null;
  }

  const daRezult = chaveDaRezult();
  if (!daRezult) {
    console.error(
      `[${origem}] REZULT_OPENAI_API_KEY ausente. A empresa ${companyId} nao roda IA ate isso ser configurado -- ` +
      "nao ha mais chave de cliente como alternativa.",
    );
    return null;
  }

  return { apiKey: daRezult, daRezult: true };
}
