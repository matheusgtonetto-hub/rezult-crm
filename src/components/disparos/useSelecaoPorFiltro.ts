import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Seleção de itens governada por um filtro, com exceções manuais.
 *
 * Existe porque "quem vai receber" é decidido do mesmo jeito em dois lugares
 * (Criar disparo e Executar automação) e uma segunda implementação das mesmas
 * regras divergiria na primeira correção feita só num dos dois.
 *
 * A regra, em uma frase: SEM filtro nada vem marcado; COM filtro vem tudo que
 * ele trouxe.
 *
 * O porquê é a assimetria do erro. Sem filtro, a lista é a base inteira, e
 * começar com tudo marcado significa que um clique distraído em "Executar"
 * manda mensagem para todo mundo -- erro que não tem desfazer, porque a
 * mensagem já saiu. Com filtro, a pessoa acabou de descrever quem ela quer, e
 * obrigá-la a marcar as 200 linhas que ela mesma pediu é trabalho sem
 * propósito.
 *
 * O estado guarda um PADRÃO mais EXCEÇÕES, e não a lista de escolhidos. É o que
 * permite as duas leituras conviverem no mesmo lugar: sem filtro o padrão é
 * "não", e as exceções são quem foi marcado à mão; com filtro o padrão é "sim",
 * e as exceções são quem foi tirado. Guardar os escolhidos obrigaria a remarcar
 * tudo a cada ajuste de filtro.
 */
export interface SelecaoPorFiltro<T> {
  /** Itens efetivamente selecionados, dentro do que o filtro trouxe. */
  selecionados: T[];
  /** Se um item específico está marcado. */
  marcado: (id: string) => boolean;
  /** Marca ou desmarca um item. */
  alternar: (id: string) => void;
  /** true quando todos os itens visíveis estão marcados. */
  todosMarcados: boolean;
  /** Marca ou desmarca todos os visíveis de uma vez. */
  alternarTodos: () => void;
}

export function useSelecaoPorFiltro<T extends { id: string }>(
  /** Itens que o filtro e a busca deixaram passar. */
  itens: T[],
  /** true quando não há nenhum critério ativo. */
  filtroVazio: boolean,
  /** Muda quando o diálogo reabre, para zerar a seleção da sessão anterior. */
  chaveDeReset: unknown,
): SelecaoPorFiltro<T> {
  const [padrao, setPadrao] = useState(false);
  const [excecoes, setExcecoes] = useState<Set<string>>(new Set());

  // Reabrir zera tudo. Sem isto, a seleção da sessão anterior reapareceria numa
  // lista que pode nem ter os mesmos itens.
  useEffect(() => {
    setPadrao(!filtroVazio);
    setExcecoes(new Set());
    // `filtroVazio` de propósito fora das dependências: ele é lido só para o
    // estado inicial, e incluí-lo faria este efeito brigar com o de baixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDeReset]);

  /**
   * Vira o padrão quando o filtro aparece ou some.
   *
   * Só na TRANSIÇÃO, e não a cada render com filtro ativo: ajustar um critério
   * já existente (acrescentar uma tag, mudar a etapa) preserva quem a pessoa
   * tirou da mão. O que zera as exceções é a mudança de regime, porque aí o
   * conjunto de baixo é outro e as exceções antigas não descrevem mais nada.
   */
  const vazioAnterior = useRef(filtroVazio);
  useEffect(() => {
    if (vazioAnterior.current === filtroVazio) return;
    vazioAnterior.current = filtroVazio;
    setPadrao(!filtroVazio);
    setExcecoes(new Set());
  }, [filtroVazio]);

  const marcado = (id: string) => padrao !== excecoes.has(id);

  const selecionados = useMemo(
    () => itens.filter(i => padrao !== excecoes.has(i.id)),
    [itens, padrao, excecoes],
  );

  const alternar = (id: string) => setExcecoes(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const todosMarcados = itens.length > 0 && selecionados.length === itens.length;

  // Alterna DENTRO do que está visível: quem está fora do filtro ou da busca não
  // é assunto deste botão. Por isso vira padrão global mais exceções para os
  // visíveis, em vez de simplesmente inverter o padrão.
  const alternarTodos = () => {
    if (todosMarcados) {
      setPadrao(false);
      setExcecoes(new Set());
    } else {
      setPadrao(true);
      setExcecoes(new Set());
    }
  };

  return { selecionados, marcado, alternar, todosMarcados, alternarTodos };
}
