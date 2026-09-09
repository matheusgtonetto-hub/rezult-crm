/**
 * Pede ao `AppLayout` que abra o cartão de planos.
 *
 * Mesmo padrão do `billing-blocked`, com uma diferença de intenção: aquele
 * anuncia que uma AÇÃO FOI BARRADA, e por isso vem acompanhado do aviso "seu
 * teste terminou, seus dados continuam aqui". Este é um pedido explícito -- a
 * pessoa clicou num botão que promete abrir os planos --, e um aviso explicando
 * por que a janela abriu seria responder uma pergunta que ninguém fez.
 *
 * Evento, e não uma prop descendo pela árvore: quem chama (a tarja flutuante,
 * fixa no canto) e quem desenha (o `AppLayout`) estão em ramos diferentes, e o
 * cartão precisa abrir por cima de qualquer tela.
 */
export function emitAbrirOferta() {
  window.dispatchEvent(new CustomEvent("abrir-oferta"));
}
