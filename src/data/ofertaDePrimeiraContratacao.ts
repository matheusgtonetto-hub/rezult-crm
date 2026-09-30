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

/*
 * ─── DESLIGADA em 29/09/2026 (dono) ─────────────────────────────────────────
 *
 * "Remover os 50% de desconto nos primeiros 7 dias, manter o valor normal em
 * todos os planos." A partir daqui todo plano é vendido a preço cheio, em
 * qualquer caminho e a qualquer momento.
 *
 * O arquivo não foi apagado, e nem por preguiça: TODA tela que mostra preço já
 * perguntava a `ofertaEstaValida` antes de descontar, e já tinha o caminho do
 * preço cheio escrito e testado. Desligar no interruptor aciona esse caminho em
 * todas elas de uma vez. Sair arrancando as chamadas seria reescrever seis
 * trechos de renderização de preço para chegar no mesmo lugar, com seis
 * chances de errar um.
 *
 * O que some sozinho com isto: o selo "50% OFF" no cartão de planos, o passo do
 * tour que o apresenta, os preços riscados, e a escolha da oferta com desconto
 * na Ticto (passa a mandar sempre o código `cheia`).
 *
 * O que NÃO some sozinho, e foi mudado à mão: o texto da tarja do teste grátis
 * (`FreePlanBanner`), que anunciava os 50% em string fixa, sem passar por aqui.
 *
 * A outra metade da regra também foi desligada, em
 * `supabase/functions/create-checkout-session` (`OFERTA_LIGADA`). As duas
 * precisam concordar: a tela anunciar preço cheio e a Stripe cobrar metade
 * seria dar o desconto de graça; o contrário seria prometer o que não se cumpre.
 */

/** Fração descontada. Zero enquanto a oferta estiver desligada. */
export const DESCONTO_DA_OFERTA = 0;

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
export const ofertaEstaValida = (_trialEndsAt: string | null | undefined): boolean => false;

/*
 * A regra original, guardada para quem for religar:
 *
 *   !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()
 *
 * Ancorava no teste grátis, e não numa data fixa de campanha, para dar a cada
 * cliente os seus próprios sete dias contados de quando ele criou a conta.
 */

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
