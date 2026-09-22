// Se a barra lateral está recolhida, e onde isso fica guardado.
//
// `localStorage` porque é preferência de quem está olhando, não dado da
// empresa: cada pessoa, em cada navegador, escolhe a sua. Leitura e escrita
// dentro de try/catch -- em janela anônima ou com armazenamento bloqueado o
// acesso lança erro, e aí a barra abre aberta, que é o padrão do design system.
//
// Mora aqui, e não no `AppLayout`, porque há dois lugares que desenham a barra:
// o app de verdade e a réplica desfocada atrás da tela de planos
// (`FundoDoCrmAoVivo`). A réplica precisa mostrar a barra do jeito que a pessoa
// deixou, senão o fundo não parece o CRM dela.

const CHAVE = "rezult:barra-recolhida";

export function lerBarraRecolhida(): boolean {
  try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
}

export function gravarBarraRecolhida(recolhida: boolean) {
  try { localStorage.setItem(CHAVE, recolhida ? "1" : "0"); } catch { /* sem armazenamento: só não lembra */ }
}

/** O valor de `--barra-largura` para cada estado, lido dos tokens de layout. */
export const larguraDaBarra = (recolhida: boolean) =>
  recolhida ? "var(--rail-w)" : "var(--sidebar-w-expanded)";
