/**
 * Oferta de Primeira Contratação: 50% em qualquer plano, enquanto o teste
 * grátis estiver correndo.
 *
 * Este arquivo é a fonte única da regra. Existe porque a oferta aparece em mais
 * de um lugar (a escolha de plano do cadastro, e o que vier depois) e cada lugar
 * precisa dar a MESMA resposta para duas perguntas: a oferta ainda vale para
 * esta empresa, e quanto custa com ela.
 *
 * O risco que ele elimina é específico e caro: uma tela anunciar 50% enquanto o
 * checkout cobra cheio. Isso já aconteceu aqui, quando o desconto existia só na
 * tela e a Stripe não sabia dele. Duas cópias da mesma regra divergem sozinhas
 * com o tempo; uma só, não.
 *
 * ── A outra metade da regra mora fora do frontend ──
 *
 * Quem aplica o desconto de fato é `supabase/functions/create-checkout-session`,
 * que repete esta mesma checagem antes de mandar o cupom para a Stripe. São dois
 * runtimes diferentes e o código não pode ser compartilhado, então a regra está
 * escrita duas vezes de propósito -- e é por isso que ela é UMA LINHA só, sem
 * ramificação nenhuma: quanto mais simples, menos chance de as duas divergirem.
 *
 * Mudou a regra aqui? Mude lá. Os dois arquivos apontam um para o outro.
 */

/** Fração descontada. Precisa bater com o `percent_off` do cupom na Stripe. */
export const DESCONTO_DA_OFERTA = 0.5;

/** Id do cupom correspondente na Stripe, para quem for procurar a outra ponta. */
export const CUPOM_DA_OFERTA = "primeira-contratacao-50";

/**
 * A oferta ainda vale para esta empresa?
 *
 * A janela é o teste grátis: enquanto `trial_ends_at` estiver no futuro, vale.
 * Nula significa que a empresa nunca testou ou já assinou, e em nenhum dos dois
 * casos há oferta de primeira contratação a fazer.
 *
 * Ancorar no teste, e não numa data fixa de campanha, dá a cada cliente os seus
 * próprios sete dias contados de quando ele criou a conta.
 */
export const ofertaEstaValida = (trialEndsAt: string | null | undefined): boolean =>
  !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();

/** "R$ 1.234,56" -> 1234.56 */
export const emNumero = (texto: string) =>
  Number(texto.replace(/[^\d,]/g, "").replace(",", "."));

/** 1234.56 -> "R$ 1.234,56" */
export const emReais = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Aplica o desconto a um preço já formatado.
 *
 * Recebe e devolve texto porque é assim que os preços moram em `PLANS` e em
 * `SETUP_PLAN_TOTALS`. Converter na entrada e formatar na saída mantém um lugar
 * só decidindo o desconto.
 */
export const comDesconto = (precoCheio: string) =>
  emReais(emNumero(precoCheio) * (1 - DESCONTO_DA_OFERTA));
