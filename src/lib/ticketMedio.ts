import { normalizarTelefoneBr } from "@/lib/telefone";
import type { Lead } from "@/data/mockData";

/**
 * Identidade da PESSOA por trás de um negócio.
 *
 * O ticket médio é por pessoa, não por negócio: um cliente que comprou três
 * vezes tem três linhas em `leads`, e a média tem que enxergar as três como uma
 * só. `personId` quando existe; senão o telefone normalizado, que é o que
 * sobra para amarrar registros importados sem contato vinculado.
 *
 * Produtor e consumidor usam ESTA função. Antes cada lado montava a chave à sua
 * maneira (um por `contactId`, o outro por `lead.id`), e só funcionava por
 * acidente enquanto ninguém tinha compra repetida -- uma bomba com o pino
 * puxado esperando o primeiro cliente recorrente.
 */
export const chaveDaPessoa = (l: { personId?: string; whatsapp?: string }): string | null =>
  l.personId ?? (l.whatsapp ? normalizarTelefoneBr(l.whatsapp) || null : null);

export interface TicketDaPessoa {
  avg: number;
  total: number;
  count: number;
}

/**
 * Ticket médio, total e número de compras, por pessoa.
 *
 * Só negócios GANHOS e com valor entram na conta: negócio em aberto é aposta,
 * perdido é dinheiro que não veio, e zerado costuma ser cadastro sem preço
 * preenchido -- os três puxariam a média para baixo sem descrever venda
 * nenhuma.
 *
 * Mora aqui, e não na página, porque a lista de leads e o passo "Selecionar
 * leads" do disparo mostram o mesmo número. Calculado nos dois lugares, o
 * primeiro critério que mudasse num deles faria a mesma pessoa aparecer com
 * tickets diferentes em duas telas do mesmo produto.
 */
export function ticketPorPessoa(leads: Record<string, Lead>): Record<string, TicketDaPessoa> {
  const valores: Record<string, number[]> = {};
  Object.values(leads).forEach(l => {
    if (l.dealStatus !== "won" || l.value <= 0) return;
    const chave = chaveDaPessoa(l);
    if (!chave) return;
    (valores[chave] ??= []).push(l.value);
  });

  const resultado: Record<string, TicketDaPessoa> = {};
  Object.entries(valores).forEach(([chave, vals]) => {
    const total = vals.reduce((a, b) => a + b, 0);
    resultado[chave] = { avg: total / vals.length, total, count: vals.length };
  });
  return resultado;
}
