/*
 * Largura virtual da página, por rota.
 *
 * O `index.html` declara `width=1100` em vez de `width=device-width`, porque o
 * app em si não cabe em 390px: com a largura do aparelho, as colunas se
 * atropelavam. Com 1100, o celular monta a página como o desktop e reduz tudo
 * junto. Ver o comentário longo no `<head>` do index.html.
 *
 * O preço disso são as telas de ENTRADA. Login, cadastro, 2FA e redefinição de
 * senha são um cartão de 380px centralizado, que já nasce responsivo. Dentro de
 * uma página de 1100px virtuais, esse cartão ocupa um terço da tela do celular
 * e sai ilegível, que foi o que o dono relatou em 11/10/2026 ("muito pequena").
 *
 * Então a meta passa a ser por rota: aparelho nas telas de entrada, 1100 no
 * app. É a exceção que o próprio comentário do index.html antecipava.
 *
 * Roda ANTES do primeiro quadro (chamada no topo do main.tsx) e a cada troca de
 * rota (efeito em App.tsx). Os dois são necessários: só o primeiro deixaria a
 * meta errada depois de um logout, e só o segundo desenharia um quadro na
 * largura anterior.
 */

const ROTAS_DE_ENTRADA = ["/login", "/register", "/verify-2fa", "/reset-password"];

/** Largura virtual do app. O número vem do piso de conteúdo, ver index.html. */
const LARGURA_DO_APP = "width=1100";
const LARGURA_DO_APARELHO = "width=device-width, initial-scale=1";

export function ehRotaDeEntrada(caminho: string): boolean {
  return ROTAS_DE_ENTRADA.some(rota => caminho === rota || caminho.startsWith(`${rota}/`));
}

export function ajustarViewport(caminho: string): void {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const alvo = ehRotaDeEntrada(caminho) ? LARGURA_DO_APARELHO : LARGURA_DO_APP;
  // Só escreve quando muda: reatribuir a mesma string faz o Safari recalcular o
  // layout da página inteira sem motivo.
  if (meta.getAttribute("content") !== alvo) meta.setAttribute("content", alvo);
}
