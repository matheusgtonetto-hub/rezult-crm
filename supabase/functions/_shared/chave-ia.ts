// deno-lint-ignore-file no-explicit-any

/**
 * Quem paga a chamada de IA: a Rezult ou o cliente.
 *
 * ═══ O defeito que este módulo existe para fechar ═══════════════════════════
 *
 * Até 25/09/2026 o débito do saldo acontecia sempre que a empresa tinha conta
 * de crédito, e a chave usada na chamada continuava sendo a DO CLIENTE. Com o
 * checkout no ar, a primeira compra real produziria cobrança dupla: a OpenAI
 * cobrando a chave dele e o nosso saldo caindo pela mesma resposta.
 *
 * Nenhum cliente foi cobrado duas vezes, porque nenhum tinha conta de crédito
 * de verdade. Mas era questão de uma venda.
 *
 * ═══ A regra ════════════════════════════════════════════════════════════════
 *
 *   tem saldo  →  chave da REZULT, e o consumo é DEBITADO do saldo
 *   sem saldo  →  chave do CLIENTE, e nada é debitado (ele paga o fornecedor)
 *
 * As duas metades andam juntas, e é isso que impede a cobrança dupla: quem
 * decide se debita é o MESMO código que decide qual chave usar. Enquanto eram
 * decisões separadas, existia o caminho em que uma dizia sim e a outra também.
 */

export type ChaveDeIa = {
  apiKey: string;
  /**
   * `true` = chave da Rezult, então o consumo sai do saldo comprado.
   * `false` = chave do cliente, então NADA é debitado.
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
 * Resolve a chave de IA de uma empresa, e diz quem paga.
 *
 * Devolve `null` quando não há chave nenhuma utilizável -- o chamador decide
 * como reagir, porque a reação certa muda: o agente faz skip silencioso e a
 * sugestão de resposta mostra erro na tela.
 *
 * @param provider O provedor do modelo escolhido. A chave da Rezult só existe
 *   para `openai`; qualquer outro cai no caminho do cliente, sem débito. Hoje
 *   isso é teórico, porque o produto só oferece OpenAI desde 25/09/2026, mas
 *   existem agentes antigos gravados em Claude.
 */
export async function resolverChaveDeIa(
  db: any,
  companyId: string,
  provider: string,
  origem: string,
): Promise<ChaveDeIa | null> {
  const buscarDoCliente = async (): Promise<string> => {
    const { data } = await db
      .from("ai_provider_keys")
      .select("api_key")
      .eq("company_id", companyId)
      .eq("provider", provider)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    return (data?.api_key as string) || "";
  };

  if (provider !== "openai") {
    const doCliente = await buscarDoCliente();
    return doCliente ? { apiKey: doCliente, daRezult: false } : null;
  }

  /*
   * Saldo positivo é o que define o modelo de cobrança da empresa.
   *
   * Lido diretamente, e não por `pode_gastar`, porque aqui a pergunta é outra:
   * `pode_gastar` responde "deixo a chamada acontecer?" (e cobre teto diário);
   * esta responde "de quem é a conta?". Uma empresa com teto diário atingido
   * segue sendo cliente de crédito, e amanhã volta a gastar do saldo.
   */
  const { data: conta } = await db
    .from("credit_accounts")
    .select("saldo_creditos")
    .eq("company_id", companyId)
    .maybeSingle();

  const temSaldo = !!conta && Number(conta.saldo_creditos) > 0;

  if (temSaldo) {
    const daRezult = chaveDaRezult();
    if (daRezult) return { apiKey: daRezult, daRezult: true };

    /*
     * Tem saldo, e a nossa chave não está configurada.
     *
     * Cai para a chave do cliente SEM debitar. É o menos errado dos caminhos:
     * ele continua atendido, e não paga duas vezes. O prejuízo é nosso -- ele
     * comprou crédito que não foi consumido -- e é o lado certo para o erro
     * cair, porque a falha é de configuração nossa.
     */
    const doCliente = await buscarDoCliente();
    console.error(
      `[${origem}] REZULT_OPENAI_API_KEY ausente e a empresa ${companyId} TEM saldo. ` +
      (doCliente
        ? "Usando a chave do cliente SEM debitar: ele nao paga duas vezes, mas o credito dele nao e consumido."
        : "Sem chave do cliente tambem: a chamada nao acontece."),
    );
    return doCliente ? { apiKey: doCliente, daRezult: false } : null;
  }

  const doCliente = await buscarDoCliente();
  return doCliente ? { apiKey: doCliente, daRezult: false } : null;
}
