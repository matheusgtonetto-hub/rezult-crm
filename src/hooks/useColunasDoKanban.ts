import { useState, useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { dbToLead } from "@/context/CRMContext";
import { chaves } from "@/lib/chavesDeConsulta";
import type { Lead } from "@/data/mockData";
import type { LeadFilter } from "@/data/disparos";

/**
 * As colunas do kanban, cada uma carregada por página.
 *
 * O funil carregava todos os cards de todas as colunas no login. Na maior conta
 * em produção são 1.240 cards montados de uma vez, dos quais o usuário olha
 * algumas dezenas: ninguém rola 635 cards de uma coluna.
 *
 * ── Por que useQueries, e não um hook por coluna ──
 *
 * O jeito natural seria `useColunaDoKanban(colunaId)` chamado dentro do
 * `colunas.map(...)`. Isso quebra as regras dos hooks: a quantidade de chamadas
 * mudaria quando uma etapa fosse criada ou apagada, e o React exige a mesma
 * ordem de hooks em todo render.
 *
 * A alternativa seria extrair cada coluna num componente próprio, mas a coluna
 * são ~330 linhas de JSX dentro do PipelinePage, e extrair isso é uma cirurgia
 * bem maior que a paginação em si.
 *
 * `useQueries` existe exatamente para "N consultas onde N varia". Uma chamada
 * só, array de tamanho livre.
 *
 * ── Por que a paginação é por janela, e não por cursor ──
 *
 * Carregar mais aumenta o LIMIT e refaz a consulta do começo, em vez de buscar
 * só o pedaço novo. Isso rebusca linhas já vistas, e é de propósito: o
 * `useInfiniteQuery`, que acumularia páginas, não se combina com `useQueries`
 * de forma simples. Num kanban raramente se passa da terceira página, então o
 * desperdício é rebuscar 150 linhas em vez de 50, e em troca o código não
 * precisa gerenciar acumulação nem invalidação de páginas soltas.
 */

const POR_PAGINA = 50;

export type OrdemDoKanban = "recent" | "oldest" | "value" | "name";

interface Parametros {
  empresaId: string;
  pipelineId: string;
  colunaIds: string[];
  filtro?: LeadFilter;
  busca?: string;
  ordem?: OrdemDoKanban;
  /** Desligado enquanto o funil ativo não foi resolvido. */
  ativo?: boolean;
}

export interface DadosDaColuna {
  leads: Lead[];
  /** Quantidade na coluna INTEIRA, não a carregada. Vai no cabeçalho. */
  total: number;
  /** Soma dos valores da coluna INTEIRA. Vai no cabeçalho. */
  valorTotal: number;
  temMais: boolean;
  carregando: boolean;
}

interface LinhaDaFuncao {
  id: string;
  total_geral: number | null;
  total_valor: string | number | null;
  dados: Record<string, unknown>;
}

const VAZIA: DadosDaColuna = { leads: [], total: 0, valorTotal: 0, temMais: false, carregando: true };

export function useColunasDoKanban({
  empresaId, pipelineId, colunaIds,
  filtro = {}, busca = "", ordem = "recent", ativo = true,
}: Parametros) {
  /** Quantas páginas cada coluna já pediu. Ausente significa uma. */
  const [paginas, setPaginas] = useState<Record<string, number>>({});

  // O recorte vira um objeto estável para não recriar as chaves a cada render,
  // o que faria o react-query tratar como consulta nova e buscar de novo.
  const recorte = useMemo(() => ({ filtro, busca, ordem }), [filtro, busca, ordem]);

  const consultas = useQueries({
    queries: colunaIds.map(colunaId => {
      const limite = POR_PAGINA * (paginas[colunaId] ?? 1);
      return {
        queryKey: [...chaves.leads.colunaDoKanban(empresaId, colunaId), recorte, limite],
        enabled: ativo && Boolean(empresaId && pipelineId && colunaId),
        queryFn: async (): Promise<DadosDaColuna> => {
          const { data, error } = await supabase.rpc("buscar_leads_do_funil", {
            p_company_id:  empresaId,
            p_pipeline_id: pipelineId,
            p_column_id:   colunaId,
            p_filtro:      filtro,
            p_busca:       busca || null,
            p_ordem:       ordem,
            p_limite:      limite,
            p_desloc:      0,
            // Sempre true aqui: a janela começa do zero a cada carregamento, e
            // o cabeçalho precisa do total da coluna inteira em toda resposta.
            p_contar:      true,
          });
          if (error) throw error;

          const linhas = (data ?? []) as LinhaDaFuncao[];
          const primeira = linhas[0];
          return {
            // A função não devolve custom_field_values (é 48% do peso da linha
            // e nenhum card usa). O detalhe busca esse campo ao abrir o card.
            leads: linhas.map(l => dbToLead(l.dados, [])),
            total: primeira?.total_geral ?? 0,
            valorTotal: Number(primeira?.total_valor ?? 0),
            // Comparar com o total, e não "veio página cheia": o total é do
            // banco, então isso continua certo mesmo quando a última página
            // vem exatamente cheia.
            temMais: linhas.length < (primeira?.total_geral ?? 0),
            carregando: false,
          };
        },
      };
    }),
  });

  const porColuna = useMemo(() => {
    const mapa: Record<string, DadosDaColuna> = {};
    colunaIds.forEach((colunaId, i) => {
      const c = consultas[i];
      mapa[colunaId] = c?.data ?? { ...VAZIA, carregando: c?.isLoading ?? true };
    });
    return mapa;
  }, [colunaIds, consultas]);

  const carregarMais = useCallback((colunaId: string) => {
    setPaginas(prev => ({ ...prev, [colunaId]: (prev[colunaId] ?? 1) + 1 }));
  }, []);

  return {
    porColuna,
    carregarMais,
    carregando: consultas.some(c => c.isLoading),
    erro: (consultas.find(c => c.error)?.error ?? null) as Error | null,
  };
}
