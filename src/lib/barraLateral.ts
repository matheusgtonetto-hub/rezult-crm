// Se a barra lateral está recolhida, e onde isso fica guardado.
//
// `localStorage` porque é preferência de quem está olhando, não dado da
// empresa: cada pessoa, em cada navegador, escolhe a sua. Leitura e escrita
// dentro de try/catch -- em janela anônima ou com armazenamento bloqueado o
// acesso lança erro, e aí vale o padrão.
//
// O PADRÃO é RECOLHIDA (dono, 29/09/2026). Era aberta, e a diferença aparece
// em quem entra pela primeira vez: a barra aberta come 248px da largura útil
// antes de a pessoa ter escolhido qualquer coisa. Recolhida, ela come 55px, e
// quem quiser os rótulos abre uma vez -- a escolha fica gravada.
//
// Mora aqui, e não no `AppLayout`, porque há dois lugares que desenham a barra:
// o app de verdade e a réplica desfocada atrás da tela de planos
// (`FundoDoCrmAoVivo`). A réplica precisa mostrar a barra do jeito que a pessoa
// deixou, senão o fundo não parece o CRM dela.

const CHAVE = "rezult:barra-recolhida";

export function lerBarraRecolhida(): boolean {
  try {
    const guardado = localStorage.getItem(CHAVE);
    // AUSENTE é diferente de "0". Antes os dois caíam em `=== "1"` e viravam
    // `false`, então quem nunca clicou e quem clicou para abrir eram tratados
    // igual -- e não dava para mudar o padrão sem mexer em quem já escolheu.
    // Agora ausente cai no padrão e "0" continua sendo a escolha de abrir.
    return guardado === null ? true : guardado === "1";
  } catch {
    return true;
  }
}

export function gravarBarraRecolhida(recolhida: boolean) {
  try { localStorage.setItem(CHAVE, recolhida ? "1" : "0"); } catch { /* sem armazenamento: só não lembra */ }
}

/** O valor de `--barra-largura` para cada estado, lido dos tokens de layout. */
export const larguraDaBarra = (recolhida: boolean) =>
  recolhida ? "var(--rail-w)" : "var(--sidebar-w-expanded)";
