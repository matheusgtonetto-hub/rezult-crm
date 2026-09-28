// deno-lint-ignore-file no-explicit-any

/**
 * A cotação do dólar, buscada no momento do checkout.
 *
 * ═══ Por que na hora, e não numa tabela fixa ════════════════════════════════
 *
 * Decisão do dono em 28/09/2026. Uma tabela de preços em real congela a
 * cotação do dia em que foi escrita, e o reajuste vira algo de que alguém
 * precisa lembrar. Buscando na hora, o preço acompanha o câmbio sozinho e o
 * hedge (secao 6.1 do plano) compra os dólares na mesma cotação da venda.
 *
 * ═══ Por que PTAX, do Banco Central ═════════════════════════════════════════
 *
 * É a cotação oficial, é pública, é de graça e não pede chave -- então não
 * acrescenta uma credencial nem uma fatura ao caminho do pagamento. O preço
 * a pagar é que ela só publica em dia útil, e só depois do fechamento: por
 * isso a busca anda para trás até achar o último dia com cotação.
 *
 * Usar a cotação de ontem não é problema aqui. O multiplicador de aquisição
 * (IOF + spread) e o markup de 30% são folgas muito maiores que a variação de
 * um dia.
 */

/** Quantos dias úteis para trás buscar antes de desistir. */
const DIAS_PARA_TRAS = 7;

/**
 * Idade máxima da cotação guardada, quando o Banco Central está fora.
 *
 * Dois dias cobrem um fim de semana inteiro. Acima disso, preferimos RECUSAR a
 * venda: vender a uma cotação que pode estar muito velha é vender sem saber o
 * preço, e o prejuízo não aparece na hora -- aparece na recarga.
 */
const IDADE_MAXIMA_HORAS = 48;

function formatarData(d: Date): string {
  // A API do BC quer MM-DD-YYYY entre aspas simples.
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

async function buscarNoBancoCentral(): Promise<number | null> {
  for (let i = 0; i < DIAS_PARA_TRAS; i++) {
    const dia = new Date();
    dia.setUTCDate(dia.getUTCDate() - i);
    const url =
      "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia" +
      `(dataCotacao=@dataCotacao)?@dataCotacao='${formatarData(dia)}'&$format=json&$select=cotacaoVenda`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const json = await res.json();
      const venda = Number(json?.value?.[0]?.cotacaoVenda);
      // `cotacaoVenda` e não `cotacaoCompra`: venda é o que se paga para
      // COMPRAR dólar, que é exatamente o que fazemos ao recarregar.
      if (Number.isFinite(venda) && venda > 0) return venda;
    } catch (e) {
      console.error("[cambio] PTAX falhou:", (e as Error).message);
    }
  }
  return null;
}

export type Cotacao = { valor: number; fonte: string };

/**
 * A cotação a usar agora. Lança quando não há valor confiável.
 *
 * Lançar é proposital: o chamador devolve erro e a venda não acontece. A
 * alternativa -- chutar uma cotação -- transforma uma falha visível num
 * prejuízo silencioso que só aparece na recarga do mês seguinte.
 */
export async function cotacaoDoDolar(db: any): Promise<Cotacao> {
  const doBc = await buscarNoBancoCentral();

  if (doBc) {
    // Guarda para servir de rede se o BC cair no próximo checkout. Falha aqui
    // não impede a venda: a cotação boa já está em mãos.
    await db.from("cotacao_dolar").insert({ valor: doBc, fonte: "ptax" })
      .then(({ error }: any) => { if (error) console.error("[cambio] nao gravou a cotacao:", error.message); });
    return { valor: doBc, fonte: "ptax" };
  }

  const { data } = await db
    .from("cotacao_dolar")
    .select("valor, criado_em")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    const horas = (Date.now() - new Date(data.criado_em as string).getTime()) / 3_600_000;
    if (horas <= IDADE_MAXIMA_HORAS) {
      console.warn(`[cambio] Banco Central fora; usando cotacao guardada de ${horas.toFixed(1)}h atras`);
      return { valor: Number(data.valor), fonte: "guardada" };
    }
    throw new Error(`cotacao guardada tem ${horas.toFixed(0)}h, acima do limite de ${IDADE_MAXIMA_HORAS}h`);
  }

  throw new Error("sem cotacao do dolar: Banco Central fora e nada guardado");
}
