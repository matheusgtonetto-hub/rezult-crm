// deno-lint-ignore-file no-explicit-any

/**
 * Empresa em somente leitura por pagamento em aberto.
 *
 * Os runners rodam com service_role, que ignora RLS por natureza: as políticas
 * `bloqueio_cobranca_*` não os alcançam. Sem esta checagem, uma empresa bloqueada
 * continuaria disparando campanha, automação e resposta de agente, gastando
 * mensagem de WhatsApp e token de IA que ninguém pagou.
 *
 * A regra em si mora no banco (public.empresa_bloqueada) e é consultada por RPC
 * de propósito: duplicar a condição aqui criaria duas verdades que divergem no
 * dia em que a política de cobrança mudar.
 */
export async function empresaBloqueada(
  db: any,
  companyId: string | null | undefined,
): Promise<boolean> {
  if (!companyId) return false;

  const { data, error } = await db.rpc("empresa_bloqueada", { p_company: companyId });

  if (error) {
    // Falha ao ler não pode virar bloqueio: entregar a mais para um inadimplente
    // é bem menos grave do que calar o sistema de quem está pagando em dia.
    console.error("[cobranca] falha ao consultar empresa_bloqueada:", error.message);
    return false;
  }

  return data === true;
}
