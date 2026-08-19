// Mesmo padrão do plan-limit: quem barra a ação não sabe desenhar tela, e o
// AppLayout é quem escuta e mostra o aviso.
export function emitBillingBlocked() {
  window.dispatchEvent(new CustomEvent("billing-blocked"));
}
