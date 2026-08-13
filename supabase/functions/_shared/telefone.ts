// Telefone brasileiro: a chave que liga lead, contato, conversa e mensagem.
//
// Esta é a ÚNICA implementação do assunto no repositório. Antes existiam 14
// cópias espalhadas entre páginas, contextos e edge functions, e duas delas
// divergiam do resto: geravam só duas variantes (com e sem "55") e ignoravam o
// nono dígito do celular. O resultado era invisível na tela e real para o
// usuário, do tipo "os arquivos do WhatsApp não aparecem nesse lead".
//
// O arquivo mora em supabase/functions/_shared porque o Deno precisa dele por
// caminho relativo no deploy. O frontend chega aqui por src/lib/telefone.ts,
// que só reexporta. Não importe nada aqui: o módulo roda no Deno e no
// navegador, então precisa ficar sem dependência.
//
// Vocabulário usado no resto do código:
//   núcleo   → DDD + 8 dígitos, sem país e sem o nono. É a chave de comparação.
//   variante → cada forma plausível de o mesmo número estar gravado no banco.

/** Descarta tudo que não for dígito. Aceita null/undefined sem reclamar. */
export function somenteDigitos(bruto: unknown): string {
  return String(bruto ?? "").replace(/\D/g, "");
}

/**
 * Reduz o número ao núcleo comparável: DDD + 8 dígitos.
 *
 * Duas reduções, nesta ordem, e a ordem importa:
 *
 * 1. Tira o código do país, mas só quando sobra número demais para ser
 *    nacional (mais de 11 dígitos). O guarda existe porque 55 também é o DDD
 *    de Santa Maria e região, no Rio Grande do Sul: "5599998888" é um número
 *    gaúcho completo, não um número de 8 dígitos com país na frente.
 *
 * 2. Tira o nono dígito do celular. A operadora passou a exigir esse 9 em
 *    2013, e a base tem número dos dois jeitos porque cada canal grava de um
 *    jeito. Comparar sem ele é o que faz o mesmo cliente ser uma pessoa só.
 *
 * Número que não parece brasileiro sai só com os dígitos, sem invenção.
 */
export function normalizarTelefoneBr(bruto: unknown): string {
  let d = somenteDigitos(bruto);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}

/**
 * Diz se dois números são a mesma pessoa.
 *
 * Exige 10 dígitos dos dois lados (DDD + 8). Abaixo disso não dá para afirmar
 * nada: "98888" pode ser o final de milhares de números, e responder "sim" aí
 * juntaria conversas de clientes diferentes na mesma thread.
 */
export function telefonesIguais(a: unknown, b: unknown): boolean {
  const na = normalizarTelefoneBr(a);
  const nb = normalizarTelefoneBr(b);
  if (na.length < 10 || nb.length < 10) return false;
  return na.slice(-10) === nb.slice(-10);
}

/**
 * Todas as formas plausíveis de o número estar gravado, para montar consulta
 * com `in` ou `or`.
 *
 * São quatro: núcleo, núcleo com o nono, e as duas com "55" na frente. Cada
 * canal de entrada grava de um jeito, e o histórico tem os quatro formatos
 * convivendo na mesma tabela.
 *
 * Número curto demais volta como veio, sem variante inventada: melhor uma
 * consulta que não acha nada do que uma que acha a conversa de outro cliente.
 */
export function variantesDeTelefone(bruto: unknown): string[] {
  const nucleo = normalizarTelefoneBr(bruto);
  if (nucleo.length < 10) {
    const d = somenteDigitos(bruto);
    return d ? [d] : [];
  }
  const ddd = nucleo.slice(0, 2);
  const oito = nucleo.slice(-8);
  const comNove = `${ddd}9${oito}`;
  return [...new Set([nucleo, comNove, `55${nucleo}`, `55${comNove}`])];
}
