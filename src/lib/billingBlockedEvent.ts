// Mesmo padrão do plan-limit: quem barra a ação não sabe desenhar tela, e o
// AppLayout é quem escuta e mostra o aviso.

/**
 * Último disparo, para não repetir o aviso em rajada.
 *
 * Uma importação de planilha tenta gravar linha por linha, e cada uma barrada
 * chamaria isto -- seriam dezenas de avisos empilhados para um único "sua conta
 * está bloqueada". Meio segundo de janela basta: o cartão de planos já está
 * aberto, e o segundo aviso não acrescenta nada.
 */
let ultimoAviso = 0;
const JANELA_MS = 500;

export function emitBillingBlocked() {
  const agora = Date.now();
  if (agora - ultimoAviso < JANELA_MS) return;
  ultimoAviso = agora;
  window.dispatchEvent(new CustomEvent("billing-blocked"));
}
