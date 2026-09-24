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
 * O que o navegador LEMBRA, ou nulo se a pessoa nunca escolheu.
 *
 * O try/catch não é zelo excessivo: em janela anônima, com dados de site
 * bloqueados ou dentro de um iframe de terceiro, o simples ACESSO ao
 * localStorage levanta exceção, e sem isto a tela de login não desenharia.
 */
export function temaSalvo(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

/**
 * As telas de antes do login. A lista mora aqui, e não no App.tsx, porque quem
 * precisa dela roda ANTES do React (ver `temaInicial`).
 */
const ROTAS_DE_ENTRADA = ["/login", "/register", "/verify-2fa", "/reset-password"];

/**
 * O tema para começar, quando ninguém escolheu ainda.
 *
 * O padrão NÃO é o mesmo em toda parte, e é de propósito (dono, 24/09/2026):
 * as telas de entrada abrem no ESCURO, o app abre no claro. A entrada é a
 * vitrine, e o cartão com a luz girando é o que ela tem para mostrar; o app é
 * onde se trabalha o dia inteiro, e mudar o padrão dele viraria uma troca de
 * aparência para quem nunca pediu nada.
 *
 * Quem já escolheu tem a escolha respeitada nos dois lados: isto só decide o
 * primeiro encontro.
 */
export function temaInicial(): Tema {
  const escolhido = temaSalvo();
  if (escolhido) return escolhido;
  const naEntrada = ROTAS_DE_ENTRADA.some(r => location.pathname.startsWith(r));
  return naEntrada ? "dark" : "light";
}

/** O tema em vigor, com um padrão de quem pergunta. */
export function lerTemaLocal(padrao: Tema = "light"): Tema {
  return temaSalvo() ?? padrao;
}

/**
 * Aplica no documento e, por padrão, lembra para o próximo carregamento.
 *
 * `lembrar: false` existe para o boot: o padrão escuro da tela de entrada é uma
 * APRESENTAÇÃO, não uma escolha da pessoa. Se ele fosse gravado, bastaria abrir
 * o login uma vez para o app inteiro nascer escuro depois -- e ninguém teria
 * pedido isso.
 */
export function aplicarTema(tema?: Tema, lembrar = true): void {
  const escuro = tema === "dark";
  document.documentElement.classList.toggle("dark", escuro);
  if (!lembrar) return;
  try {
    localStorage.setItem(CHAVE_TEMA, escuro ? "dark" : "light");
  } catch {
    /* sem armazenamento: vale só nesta aba, que é melhor do que não trocar */
  }
}
