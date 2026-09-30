import { useEffect, useState } from "react";

// Quem decide o que é celular neste app, e qual viewport cada tela pede.
//
// ─── Por que NÃO dá para usar media query aqui ───────────────────────────────
//
// O `index.html` declara `width=1100`: o celular monta a página como um desktop
// de 1100px e reduz tudo para caber (ver o comentário lá para o porquê). O
// efeito colateral é que, dentro da página, `max-width: 640px` NUNCA casa num
// iPhone -- a página se acha com 1100px de largura. Toda media query, todo
// `useMediaQuery`, todo `sm:` do Tailwind enxergam 1100.
//
// `screen` não passa por isso: ele descreve o APARELHO, não a página, e não é
// afetado pela meta viewport. É por isso que a decisão mora aqui e não em CSS.
//
// ─── Por que o lado MENOR ────────────────────────────────────────────────────
//
// `screen.width` sozinho não serve: no Android ele troca ao girar o aparelho, e
// no iOS não troca. Um celular deitado sairia como "não é celular" num sistema
// e como celular no outro. O lado menor da tela é o mesmo nas duas orientações
// e nos dois sistemas.
//
// 500px separa telefone de tablet com folga: iPhone Pro Max dá 430, Android
// grande dá 480, iPad mini dá 744. Tablet fica de fora de propósito -- nele o
// layout de 1100 reduzido é perfeitamente legível, e três colunas cabem.

const LADO_MENOR_MAXIMO = 500;

export const VIEWPORT_DO_APP = "width=1100";
/** Para as telas que têm layout próprio de celular. */
export const VIEWPORT_DE_CELULAR = "width=device-width, initial-scale=1";

export function ehTelaDeCelular(): boolean {
  try {
    return Math.min(window.screen.width, window.screen.height) <= LADO_MENOR_MAXIMO;
  } catch {
    // Sem `screen` (ambiente de teste, renderização no servidor) o padrão é
    // desktop: é o layout que já existe, e errar para o lado dele não quebra
    // nada -- errar para o outro entregaria uma tela de celular no computador.
    return false;
  }
}

/**
 * Troca a meta viewport da página.
 *
 * Mudar esta meta em tempo de execução é reconhecido pelo Safari do iOS e pelo
 * Chrome do Android, e é o que permite que UMA rota tenha layout de celular
 * enquanto o resto do app continua sendo a versão de desktop reduzida.
 */
export function aplicarViewport(conteudo: string): void {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta && meta.getAttribute("content") !== conteudo) meta.setAttribute("content", conteudo);
}

/**
 * Reavalia ao girar o aparelho.
 *
 * O valor em si não muda com a rotação -- é o lado menor --, mas o navegador
 * pode remontar a página nesse momento, e um estado que nasceu antes da meta
 * viewport ser aplicada ficaria velho.
 */
export function useTelaDeCelular(): boolean {
  const [celular, setCelular] = useState(ehTelaDeCelular);
  useEffect(() => {
    const reavaliar = () => setCelular(ehTelaDeCelular());
    window.addEventListener("orientationchange", reavaliar);
    window.addEventListener("resize", reavaliar);
    return () => {
      window.removeEventListener("orientationchange", reavaliar);
      window.removeEventListener("resize", reavaliar);
    };
  }, []);
  return celular;
}
