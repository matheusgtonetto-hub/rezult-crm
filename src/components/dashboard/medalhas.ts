// As medalhas de pódio dos rankings do dashboard.
//
// ESTA É A ÚNICA CÓPIA. Em 18/09/2026 havia duas, e a divergência não era de
// gosto: o `UtmAttributionPanel` usava degradês metálicos com uma justificativa
// escrita sobre contraste, e o `DashboardPage` usava `bg-yellow-500`,
// `bg-gray-400` e `bg-amber-600` do Tailwind, com o número em branco. Medido,
// esse segundo conjunto dava 1,92:1, 2,54:1 e 3,19:1. O número do pódio era o
// texto menos legível da tela.
//
// ─── Por que tom claro com tinta escura, e não o contrário ───────────────────
//
// A tentativa anterior foi um degradê que descia do metal claro para um tom
// escuro do mesmo metal, apostando que "é essa metade que sustenta o número".
// A conta não fecha: a ponta escura do ouro (`#B8860B`) dá 3,25:1 com branco e
// a da prata (`#78828F`) dá 3,90:1. Só o bronze passava. E num degradê o texto
// atravessa as duas metades, então quem manda é a pior delas.
//
// Ouro, prata e bronze são METAIS CLAROS. Forçá-los a aceitar texto branco é
// escurecê-los até deixarem de parecer metal (o ouro vira oliva em `#96690A`).
// A saída é a mesma regra que o sistema já usa para o emerald na decisão D2:
// superfície clara pede tinta charcoal.
//
//   ouro   `#F2CE63` com charcoal = 8,80:1
//   prata  `#CBD0D7` com charcoal = 8,65:1
//   bronze `#D48F55` com charcoal = 5,02:1
//
// Some junto o degradê, e com ele o ponto cego da varredura de contraste, que
// lê `linear-gradient` como fundo transparente e mede contra o pai.

/** Ouro, prata e bronze, nesta ordem. Tom chapado, o claro de cada metal. */
export const MEDALHAS = ["#F2CE63", "#CBD0D7", "#D48F55"] as const;

/**
 * Fundo da quarta posição em diante: o verde fechado da marca (`--accent-700`).
 *
 * Hex e não token porque em parte dos usos ele vai para `background` de um
 * elemento que o `tintaSobre` também mede, e porque acompanha as medalhas, que
 * são dado de apresentação. Com o número branco dá 4,52:1.
 */
export const VERDE_DEMAIS = "#008762";

/** A tinta do número, medida pela luminância do fundo. */
export { tintaSobre as tintaDaMedalha } from "@/lib/contraste";
