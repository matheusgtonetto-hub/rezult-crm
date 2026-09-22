import { useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Pede a próxima página quando o fim da lista aparece na tela.
 *
 * Um elemento fino no fim da coluna do funil. Quando ele entra no campo de
 * visão -- ou seja, quando a pessoa rolou até o último card --, `aoAlcancar`
 * dispara e a leva seguinte é buscada. Substituiu o botão "Carregar mais", que
 * obrigava um clique a cada leva.
 *
 * ─── Por que `IntersectionObserver`, e não um ouvinte de scroll ──────────────
 *
 * Um `onScroll` dispara dezenas de vezes por gesto e obriga a medir posição e
 * altura a cada disparo, no mesmo quadro em que o navegador está rolando. O
 * observer avisa quando o alvo cruza a borda, e fora da linha do scroll.
 *
 * Ele também respeita o recorte dos ancestrais: numa coluna com rolagem
 * própria, o sentinela só conta como visível quando aparece DENTRO da coluna.
 * É por isso que não precisa receber qual é o contêiner rolável.
 *
 * ─── Duas armadilhas que este componente resolve ────────────────────────────
 *
 * 1. **O nó trocado.** A primeira versão criava o observer num `useEffect` e o
 *    funil re-renderiza muito (arrastar, filtrar, contadores): quando o React
 *    trocava o nó do sentinela, o observer seguia observando o ANTIGO, já fora
 *    do documento -- que nunca volta a intersectar nada. A coluna carregava uma
 *    leva e parava. Aqui quem manda é o nó, por callback ref: a cada troca, o
 *    observer velho é desconectado e um novo observa o atual.
 *
 * 2. **O sentinela que continua visível.** Depois de carregar, a lista cresceu
 *    mas o sentinela segue no fim e ainda à vista. O observer não avisa de
 *    novo, porque não houve NOVA interseção -- e a rolagem longa travaria a
 *    cada leva. Por isso, ao fim de cada busca, o observer é reconectado: a
 *    primeira observação de um alvo já visível dispara na hora.
 *
 * O guard de "já estou buscando" é lido de um ref dentro do disparo. Sem ele, o
 * sentinela pediria a página seguinte, e a seguinte, até o fim da coluna -- o
 * oposto de paginar. Quando a coluna termina, quem chama simplesmente não
 * renderiza o sentinela.
 *
 * `rootMargin` de 120px pede a leva um pouco ANTES de o fim aparecer, para o
 * card seguinte já estar lá quando a pessoa chegar nele.
 */
export function SentinelaDeScroll({
  aoAlcancar,
  carregando,
  rotulo = "Carregando mais…",
}: {
  aoAlcancar: () => void;
  /** Busca em voo: o disparo é ignorado enquanto verdadeiro. */
  carregando: boolean;
  /** O que aparece enquanto a leva vem. */
  rotulo?: string;
}) {
  /**
   * Os valores mais recentes, em refs: o observer é criado quando o nó aparece
   * e viveria com a primeira versão deles.
   */
  const chamar = useRef(aoAlcancar);
  const emVoo = useRef(carregando);
  chamar.current = aoAlcancar;
  emVoo.current = carregando;

  const no = useRef<HTMLDivElement | null>(null);
  const observador = useRef<IntersectionObserver | null>(null);

  const conectar = useCallback(() => {
    observador.current?.disconnect();
    if (!no.current) return;
    observador.current = new IntersectionObserver(
      entradas => {
        if (entradas[0]?.isIntersecting && !emVoo.current) chamar.current();
      },
      { rootMargin: "120px" },
    );
    observador.current.observe(no.current);
  }, []);

  const ref = useCallback((el: HTMLDivElement | null) => {
    no.current = el;
    conectar();
  }, [conectar]);

  // Ao fim de cada busca, reavalia: se o sentinela continua à vista, a leva
  // seguinte já pode ser pedida (ver armadilha 2, acima).
  useEffect(() => {
    if (!carregando) conectar();
  }, [carregando, conectar]);

  // Um observer vivo depois da desmontagem segura o nó na memória e pode
  // disparar numa coluna que já não existe.
  useEffect(() => () => observador.current?.disconnect(), []);

  return (
    /*
     * A altura é FIXA (28px), com ou sem busca em voo.
     *
     * Se ela mudasse ao aparecer o ícone, a lista cresceria alguns pixels no
     * exato momento em que a pessoa está no fim do scroll -- e o conteúdo
     * empurrando por baixo do dedo é justo o que se está tentando evitar aqui.
     */
    <div
      ref={ref}
      className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
      style={{ height: 28 }}
      aria-live="polite"
    >
      {carregando && (
        <>
          <Loader2 size={13} className="animate-spin" />
          <span>{rotulo}</span>
        </>
      )}
    </div>
  );
}
