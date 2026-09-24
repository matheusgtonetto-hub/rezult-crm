/**
 * O tema, antes de existir um usuário.
 *
 * Este módulo existe porque a escolha de tema tem DOIS donos, em momentos
 * diferentes da vida da página:
 *
 *   1. Antes do login, e antes do React montar, quem sabe o tema é o navegador.
 *      As telas públicas (login, cadastro, 2FA, redefinir senha) ficam FORA do
 *      `ProfileProvider` -- ver App.tsx --, então lá não existe perfil para
 *      consultar. É o `localStorage` que responde.
 *   2. Depois do login, o perfil no Supabase é a verdade, porque ele atravessa
 *      dispositivos: `ProfileContext` sobrescreve o que estava aqui.
 *
 * Ter as duas partes lendo a MESMA chave por cópia e cola era o caminho curto
 * para elas divergirem no primeiro ajuste. A chave e a forma de aplicar moram
 * aqui, e ninguém mais as escreve.
 */

export type Tema = "light" | "dark";

export const CHAVE_TEMA = "rezult:tema";

/**
 * O tema lembrado pelo navegador.
 *
 * O try/catch não é zelo excessivo: em janela anônima, com dados de site
 * bloqueados ou dentro de um iframe de terceiro, o simples ACESSO ao
 * localStorage levanta exceção, e sem isto a tela de login não desenharia.
 */
export function lerTemaLocal(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Aplica no documento e lembra para o próximo carregamento. */
export function aplicarTema(tema?: Tema): void {
  const escuro = tema === "dark";
  document.documentElement.classList.toggle("dark", escuro);
  try {
    localStorage.setItem(CHAVE_TEMA, escuro ? "dark" : "light");
  } catch {
    /* sem armazenamento: vale só nesta aba, que é melhor do que não trocar */
  }
}
