/**
 * Links de checkout da Ticto, o caminho do pagamento PARCELADO.
 *
 * A divisão de provedores é: mensal e à vista pela Stripe, parcelado pela Ticto.
 * A Stripe resolve preço com cupom aplicado na sessão; a Ticto não aceita cupom
 * por URL, então o desconto mora na PRÓPRIA OFERTA. Daí a tabela ter duas
 * colunas: a oferta com desconto na primeira cobrança e a de preço cheio.
 *
 * Quem escolhe entre as duas é `ofertaEstaValida`, o mesmo booleano que decide
 * se a tela mostra preço com desconto. É isso que impede a tela de anunciar 50%
 * e mandar para um checkout que cobra o dobro.
 *
 * ── Sobre as ofertas com desconto ──
 *
 * Elas não são "metade do preço". São ofertas normais com o campo "valor
 * diferente na primeira cobrança" preenchido: a primeira sai pela metade e as
 * renovações voltam ao cheio, automaticamente. É o equivalente exato do cupom
 * `once` que a Stripe usa, e foi o que igualou os dois caminhos.
 *
 * ── Manutenção ──
 *
 * Estes códigos também aparecem em `supabase/functions/ticto-webhook`, que
 * traduz o código da oferta em plano ao receber a venda. Oferta nova precisa
 * entrar NOS DOIS lugares: aqui para ser vendida, lá para virar plano ativo.
 */

/**
 * Repetido, e não importado do `SetupPage`: aquele tipo é local da página, e
 * importar de uma página para um módulo de dados inverteria a dependência.
 */
type BillingTab = "mensal" | "semestral" | "anual";

type PlanoDaTicto = "silver" | "platinum" | "emerald";
/** Só os períodos que a Ticto atende: o mensal não é parcelável. */
type PeriodoParcelavel = Extract<BillingTab, "semestral" | "anual">;

/**
 * Em quantas vezes cada período pode ser parcelado.
 *
 * É a Ticto quem define, pelo intervalo de cobrança da oferta: o semestral
 * cobre 6 meses e parcela em 6, o anual cobre 12 e parcela em 12. Os dois foram
 * conferidos no checkout ("6x de R$ 113,40" e "12x de R$ 102,85"), e não
 * deduzidos da regra.
 *
 * Serve só para a tela dizer em quantas vezes dá. O valor de cada parcela é a
 * Ticto que calcula, com juros, e ele aparece no checkout.
 */
export const PARCELAS_POR_PERIODO: Record<PeriodoParcelavel, number> = {
  semestral: 6,
  anual: 12,
};

const OFERTAS: Record<
  PlanoDaTicto,
  Record<PeriodoParcelavel, { comDesconto: string; cheia: string }>
> = {
  silver: {
    semestral: { comDesconto: "OE7995DD8", cheia: "O518B34CF" },
    anual:     { comDesconto: "O44365E05", cheia: "OC1C656D7" },
  },
  platinum: {
    semestral: { comDesconto: "OD167A6C3", cheia: "OAE2EDAC5" },
    anual:     { comDesconto: "O9F1934ED", cheia: "OE87608FC" },
  },
  emerald: {
    semestral: { comDesconto: "O73835BFD", cheia: "OE94B0716" },
    anual:     { comDesconto: "OF062BC73", cheia: "OC5E20E3F" },
  },
};

/**
 * O identificador da empresa viaja no `src`, e não num parâmetro nosso.
 *
 * A Ticto DESCARTA parâmetros que não conhece: um `?company_id=` inventado não
 * volta no postback, e a venda chega sem dono. O `src` está na lista fixa que
 * ela reconhece, ao lado de `sck` e dos `utm_*`, e foi confirmado num pedido de
 * teste.
 *
 * O custo é que o `src` deixa de servir para rastrear origem de tráfego neste
 * link. Como ele nasce dentro do produto, e não de anúncio, a origem já é
 * conhecida -- sobra o `sck` se um dia precisar dos dois.
 */
const PARAMETRO_DA_EMPRESA = "src";

/**
 * Link do checkout parcelado, ou `null` quando não existe.
 *
 * Devolve nulo para o mensal, que a Ticto não atende, e para qualquer
 * combinação sem oferta cadastrada. Quem chama trata o nulo escondendo a opção,
 * em vez de abrir um link quebrado.
 */
export function linkDoParcelado(
  plano: string,
  periodo: BillingTab,
  companyId: string | undefined,
  comDesconto: boolean,
): string | null {
  if (periodo === "mensal") return null;
  const doPlano = OFERTAS[plano as PlanoDaTicto];
  if (!doPlano) return null;
  const par = doPlano[periodo as PeriodoParcelavel];
  if (!par) return null;

  const codigo = comDesconto ? par.comDesconto : par.cheia;
  const url = new URL(`https://payment.ticto.app/${codigo}`);
  if (companyId) url.searchParams.set(PARAMETRO_DA_EMPRESA, companyId);
  return url.toString();
}
