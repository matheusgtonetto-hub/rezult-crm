/**
 * Chaves do cache de consulta (react-query).
 *
 * Toda consulta e toda invalidação passam por aqui, em vez de escrever o array
 * da chave na mão em cada arquivo. O motivo é prático: chave escrita à mão
 * erra, e chave errada não quebra nada visivelmente. Ela só faz o cache não
 * encontrar o que já tinha, ou a invalidação não alcançar o que deveria, e o
 * sintoma aparece depois como "às vezes a tela não atualiza".
 *
 * ── A hierarquia é o que permite invalidar em camadas ──
 *
 * As chaves são construídas por prefixo, do mais geral para o mais específico:
 *
 *   ["leads", empresa]                                → tudo da empresa
 *   ["leads", empresa, "coluna", colunaId]            → uma coluna do funil
 *   ["leads", empresa, "coluna", colunaId, pagina]    → uma página dela
 *
 * O react-query casa por prefixo. Invalidar `colunaDoKanban` sem a página
 * atinge todas as páginas daquela coluna; invalidar `daEmpresa` atinge o funil
 * inteiro. É isso que evita o padrão preguiçoso de limpar o cache todo a cada
 * escrita, que devolveria o problema de rede que este cache existe para evitar.
 *
 * ── Por que a empresa entra em toda chave ──
 *
 * O mesmo usuário troca de empresa sem recarregar a página. Sem o id da empresa
 * na chave, o cache da anterior seria servido para a seguinte, e a pessoa veria
 * os leads da empresa errada até a revalidação chegar.
 */

export const chaves = {
  leads: {
    /** Raiz de tudo que é lead numa empresa. Invalidar aqui derruba o resto. */
    daEmpresa: (empresaId: string) => ["leads", empresaId] as const,

    /** Uma coluna do kanban, todas as páginas. */
    colunaDoKanban: (empresaId: string, colunaId: string) =>
      ["leads", empresaId, "coluna", colunaId] as const,

    /** Uma página específica de uma coluna. */
    paginaDaColuna: (empresaId: string, colunaId: string, pagina: number) =>
      ["leads", empresaId, "coluna", colunaId, pagina] as const,

    /** Contagem de cards de uma coluna, separada da lista: ela muda com o
     *  total, não com a fatia carregada, e o cabeçalho precisa do número real. */
    totalDaColuna: (empresaId: string, colunaId: string) =>
      ["leads", empresaId, "coluna", colunaId, "total"] as const,

    /** A lista de /leads, com o recorte de busca e filtros que a gerou. */
    lista: (empresaId: string, recorte: Record<string, unknown>) =>
      ["leads", empresaId, "lista", recorte] as const,

    /** Um lead pelo id, para as telas de detalhe. */
    porId: (empresaId: string, leadId: string) =>
      ["leads", empresaId, "id", leadId] as const,
  },

  contatos: {
    daEmpresa: (empresaId: string) => ["contatos", empresaId] as const,
    lista: (empresaId: string, recorte: Record<string, unknown>) =>
      ["contatos", empresaId, "lista", recorte] as const,
  },

  /** Números agregados do dashboard e do início. Ficam fora de `leads` porque
   *  são calculados no banco e não invalidam junto com um card que se moveu. */
  metricas: {
    daEmpresa: (empresaId: string) => ["metricas", empresaId] as const,
    doPeriodo: (empresaId: string, de: string, ate: string) =>
      ["metricas", empresaId, de, ate] as const,
  },
} as const;
