import { createClient } from "@supabase/supabase-js";
import { protegerConstrutor } from "@/lib/bloqueioDeEscrita";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const clienteBruto = createClient(url, key);

/**
 * O cliente do Supabase, com um filtro no `from()`.
 *
 * Com a conta em modo somente leitura, `insert`, `update`, `upsert` e `delete`
 * nas tabelas travadas pelo RLS deixam de ir ao servidor e viram o aviso na
 * tela. Ver `src/lib/bloqueioDeEscrita.ts` para o porquê e para a lista.
 *
 * A troca é aqui, e não em cada chamada, porque este é o único lugar por onde
 * TODAS elas passam -- inclusive as que ainda não foram escritas.
 *
 * Tudo o mais segue direto: `auth`, `storage`, `rpc`, `channel`, e as leituras.
 */

/**
 * Métodos já amarrados, guardados por nome.
 *
 * `bind` devolve uma função NOVA a cada chamada. Sem este cache,
 * `supabase.rpc` seria um valor diferente a cada leitura, e qualquer lista de
 * dependências de hook que o contivesse dispararia em todo render.
 */
const metodosAmarrados = new Map<string | symbol, unknown>();

export const supabase = new Proxy(clienteBruto, {
  get(alvo, prop) {
    if (prop === "from") {
      return (tabela: string) => protegerConstrutor(tabela, alvo.from(tabela));
    }
    // `Reflect.get` SEM receptor: `functions` é um getter que lê `this.headers`
    // e `this.fetch`, e passar o proxy como `this` faria cada acesso interno
    // dele voltar por esta armadilha. Lendo contra o cliente original, o getter
    // roda exatamente como rodaria sem o proxy.
    const valor = Reflect.get(alvo, prop);
    if (typeof valor !== "function") return valor;
    if (!metodosAmarrados.has(prop)) metodosAmarrados.set(prop, valor.bind(alvo));
    return metodosAmarrados.get(prop);
  },
});
