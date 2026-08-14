// Cor e iniciais derivadas de um nome, para avatar sem foto.
//
// Ficam fora de ConvAvatar.tsx porque arquivo de componente que também exporta
// função solta quebra o Fast Refresh do Vite: uma edição na função remonta a
// árvore inteira em vez de trocar o componente no lugar. O próprio eslint avisa,
// e o custo de separar é um arquivo de dez linhas.

/** Cor estável a partir do nome, para as iniciais não mudarem a cada render. */
export function corDoTexto(texto: string) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 50%)`;
}

/** Até duas iniciais: "Samantha de Oliveira" vira "SD". */
export function iniciais(nome: string) {
  return nome.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
