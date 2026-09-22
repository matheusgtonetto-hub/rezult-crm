// Cor e iniciais derivadas de um nome, para avatar sem foto.
//
// Ficam fora de ConvAvatar.tsx porque arquivo de componente que também exporta
// função solta quebra o Fast Refresh do Vite: uma edição na função remonta a
// árvore inteira em vez de trocar o componente no lugar. O próprio eslint avisa,
// e o custo de separar é um arquivo de dez linhas.

/**
 * Cor estável a partir do nome, para avatar de iniciais.
 *
 * ESTA É A ÚNICA CÓPIA do algoritmo. Em 18/09/2026 havia três, com
 * luminosidades diferentes (45%, 50% e 50%), então a mesma pessoa tinha uma cor
 * no pipeline, outra na lista de leads e outra no multiatendimento -- o oposto
 * do que cor por hash existe para fazer.
 *
 * Luminosidade 30%: este tom é FUNDO, com as iniciais por cima. A 50% o pior
 * matiz (amarelo) deixava o branco em 1,9:1; a 30% o pior caso é 4,75:1,
 * medido nos 360 matizes.
 */
export function corDoTexto(texto: string) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 30%)`;
}

/** Mesmo algoritmo, nome que o resto do app já usava. */
export const colorFromString = corDoTexto;

/** Até duas iniciais: "Samantha de Oliveira" vira "SD". */
export function iniciais(nome: string) {
  return nome.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
