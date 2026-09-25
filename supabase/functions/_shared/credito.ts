// deno-lint-ignore-file no-explicit-any

/**
 * O débito do saldo de crédito, para os runners de agente.
 *
 * Mora aqui, e não dentro de cada runner, porque são DOIS hoje
 * (`agent-operacional-runner` e `agent-sds-qualify`) e serão mais quando o
 * automation-runner e o ai-suggest-reply entrarem. Regra de dinheiro copiada é
 * regra que diverge no primeiro ajuste, e divergir aqui significa um caminho
 * cobrando e outro não.
 */

/**
 * Pode gastar? Consultado ANTES de cada chamada de IA.
 *
 * ─── Por que existe, e por que virou urgente ───────────────────────────────
 *
 * O debito acontece DEPOIS da chamada, com o custo real (ver `debitarCredito`).
 * Sozinho, ele registra o prejuizo mas nao o impede: uma automacao em laco
 * queimaria saldo muito abaixo de zero e so seria descoberta pelo extrato.
 *
 * Com o checkout no ar desde o passo 4, ja existe saldo de verdade para
 * queimar, e 13% de margem nao absorve descoberto.
 *
 * ─── O que ela devolve ─────────────────────────────────────────────────────
 *
 *   'ok'          → segue
 *   'sem_saldo'   → nao chama a IA
 *   'teto_diario' → nao chama a IA, o teto do dia foi atingido
 *
 * Empresa SEM conta de credito recebe 'ok': ela usa chave propria e paga o
 * fornecedor direto. E o caso de todas as empresas de hoje, entao ligar isto
 * nao muda nada para elas.
 *
 * ─── Falha aberta, de proposito ────────────────────────────────────────────
 *
 * Se a consulta em si falhar (rede, banco fora), devolve 'ok' e deixa passar.
 * A alternativa seria parar o atendimento de TODO MUNDO -- inclusive de quem
 * usa chave propria e nem depende do nosso saldo -- por causa de uma falha
 * nossa. O custo de errar para o lado permissivo e uma chamada; para o lado
 * restritivo, e o produto inteiro parado.
 */
export type VeredictoDeGasto = "ok" | "sem_saldo" | "teto_diario";

export async function podeGastar(
  db: any,
  companyId: string,
  origem: string,
): Promise<VeredictoDeGasto> {
  if (!companyId) return "ok";

  const { data, error } = await db.rpc("pode_gastar", { p_company_id: companyId });

  if (error) {
    console.error(`[${origem}] pode_gastar falhou, deixando passar:`, error.message, { companyId });
    return "ok";
  }

  const v = String(data ?? "ok");
  if (v !== "ok") {
    console.log(`[${origem}] empresa ${companyId} BLOQUEADA: ${v}`);
  }
  return (v === "sem_saldo" || v === "teto_diario") ? v : "ok";
}

/**
 * Desconta do saldo da empresa o custo real de uma chamada.
 *
 * ─── O que esta função NÃO faz, de propósito ────────────────────────────────
 *
 * Ela não interrompe nada. Se o débito falhar, a resposta ao lead já foi
 * enviada e o custo já aconteceu no fornecedor: derrubar o fluxo aqui não
 * desfaz o gasto, só acrescenta um atendimento quebrado por cima do prejuízo.
 * O que ela faz é deixar rastro alto o suficiente para ser encontrado.
 *
 * ─── Por que não trava a empresa sem conta ─────────────────────────────────
 *
 * `debitar_credito` devolve null para quem não tem conta de crédito -- hoje,
 * todas as empresas, que usam chave própria e pagam direto ao fornecedor.
 * Então esta chamada é inofensiva enquanto ninguém comprou crédito, e passa a
 * valer sozinha assim que a primeira compra criar a conta.
 */
export async function debitarCredito(
  db: any,
  companyId: string,
  usageId: string,
  custoUsd: number,
  origem: string,
): Promise<number | null> {
  if (!custoUsd || custoUsd <= 0) return null;

  const { data, error } = await db.rpc("debitar_credito", {
    p_company_id: companyId,
    p_usage_id: usageId,
    p_custo_usd: custoUsd,
  });

  if (error) {
    // Chave duplicada é o caminho ESPERADO num retry: significa que este mesmo
    // uso já foi debitado, e a restrição do banco fez o trabalho dela. Não é
    // erro, é a idempotência funcionando.
    const repetido = error.code === "23505" || String(error.message ?? "").includes("duplicate key");
    if (repetido) return null;

    console.error(`[${origem}] FALHA AO DEBITAR CRÉDITO (consumo sem débito):`, error.message, {
      companyId,
      usageId,
      custoUsd,
    });
    return null;
  }

  const saldo = data as number | null;

  // Saldo negativo não é erro de programa: o débito registra um gasto que já
  // aconteceu. Mas é sinal de que a trava de entrada deixou passar, e alguém
  // precisa ver isso antes de virar rotina.
  if (saldo !== null && saldo < 0) {
    console.warn(`[${origem}] empresa ${companyId} ficou com saldo negativo: US$ ${saldo}`);
  }

  return saldo;
}
