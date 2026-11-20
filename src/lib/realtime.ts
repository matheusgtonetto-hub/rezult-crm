import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";

/**
 * Realtime que volta sozinho depois de uma queda e relê o que perdeu.
 *
 * ─── O problema ─────────────────────────────────────────────────────────────
 *
 * O realtime do Supabase só entrega o que acontece com a conexão de pé. Não há
 * fila: um lead criado enquanto a conexão está caída nunca chega à tela. A
 * biblioteca reconecta e assina de novo sozinha, mas não sabe o que perdeu, e
 * as telas não reliam nada. Resultado: o lead e a mensagem só apareciam depois
 * de recarregar a página.
 *
 * E a conexão cai com frequência. Em 20/11/2026 os registros do realtime
 * mostraram o projeto inteiro ficando sem nenhuma conexão três vezes em poucas
 * horas (todas as conexões do dia vinham do Safari), e um lead entrando às
 * 12:53:02 (Brasília) sem ninguém conectado. A aba reconectou às 12:53:56 e
 * abriu outra conexão 21 segundos depois, o que bate com alguém recarregando a
 * página para achar o lead.
 *
 * Aba em segundo plano é a causa mais provável: o navegador segura os timers
 * da página, o sinal de vida da conexão atrasa e ela cai. Há ainda o token de
 * acesso, que o login só renova com a aba visível: se ele vence com a aba
 * escondida, o servidor pode FECHAR o canal, e canal fechado a biblioteca não
 * reabre.
 *
 * ─── O que esta função faz ──────────────────────────────────────────────────
 *
 * 1. Quando o canal volta a ficar assinado depois de uma falha, chama
 *    `recuperar()`, e a tela relê do banco o que mostra. A primeira assinatura
 *    sem falha não conta: a carga inicial da tela já está acontecendo.
 * 2. Canal fechado é recriado, com espera que dobra a cada fechamento seguido
 *    (até um minuto) para não martelar o servidor se ele insistir em fechar.
 * 3. Cada canal nasce com nome único. `supabase.channel(nome)` devolve o canal
 *    que já existe com aquele nome, e um canal removido só sai da lista quando
 *    o servidor confirma a saída. Com nome fixo, a tela que desmontava e
 *    montava de novo nesse intervalo recebia o canal que estava saindo, o
 *    `subscribe()` não fazia nada e ela ficava sem tempo real até o F5.
 */

/** O pedaço do cliente do Supabase que a assinatura usa (o teste passa um falso). */
export interface ClienteDeRealtime {
  channel(nome: string): RealtimeChannel;
  removeChannel(canal: RealtimeChannel): unknown;
}

export interface OpcoesDaAssinatura {
  /** Começo do nome do canal. Ganha um sufixo único a cada canal criado. */
  nome: string;
  /** Pendura os `.on(...)` no canal recebido e devolve o mesmo canal. */
  montar: (canal: RealtimeChannel) => RealtimeChannel;
  /** Relê do banco o que a tela mostra. Chamada quando a assinatura volta depois de uma falha. */
  recuperar: () => void;
}

export const ESPERA_INICIAL_PARA_RECRIAR_MS = 2_000;
export const ESPERA_MAXIMA_PARA_RECRIAR_MS = 60_000;

let canaisCriados = 0;

/** Assina e devolve a função que encerra a assinatura (serve de retorno do useEffect). */
export function assinarComRecuperacao(
  cliente: ClienteDeRealtime,
  { nome, montar, recuperar }: OpcoesDaAssinatura,
): () => void {
  let encerrada = false;
  let canal: RealtimeChannel | null = null;
  let jaAssinou = false;
  let teveFalha = false;
  let espera = ESPERA_INICIAL_PARA_RECRIAR_MS;
  let recriacao: ReturnType<typeof setTimeout> | undefined;

  function criar() {
    recriacao = undefined;
    if (encerrada) return;
    canaisCriados += 1;
    const este = montar(cliente.channel(`${nome}-${canaisCriados}`));
    canal = este;
    este.subscribe(status => {
      // Aviso atrasado de um canal que já foi trocado ou encerrado.
      if (encerrada || canal !== este) return;

      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        const releitura = jaAssinou || teveFalha;
        jaAssinou = true;
        teveFalha = false;
        espera = ESPERA_INICIAL_PARA_RECRIAR_MS;
        if (releitura) {
          try {
            recuperar();
          } catch (erro) {
            console.error(`[realtime] releitura de ${nome} falhou:`, erro);
          }
        }
        return;
      }

      teveFalha = true;
      if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
        canal = null;
        recriacao = setTimeout(criar, espera);
        espera = Math.min(espera * 2, ESPERA_MAXIMA_PARA_RECRIAR_MS);
      }
      // CHANNEL_ERROR e TIMED_OUT: a biblioteca tenta entrar de novo sozinha,
      // e a próxima SUBSCRIBED dispara a releitura.
    });
  }

  criar();

  return () => {
    encerrada = true;
    if (recriacao) clearTimeout(recriacao);
    if (canal) cliente.removeChannel(canal);
    canal = null;
  };
}
