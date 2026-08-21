import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Lista de opções marcáveis dos filtros: uma por linha, com marcador à esquerda.
 *
 * Substitui a nuvem de chips que se usava antes. O problema da nuvem não era
 * feiura: com rótulos de larguras diferentes, cada linha quebrava num ponto
 * distinto e os nomes longos ("Agente: Consultório Samantha Oliveira") ocupavam
 * uma faixa inteira. O olho não tinha coluna para descer, então achar uma tag
 * virava varredura em zigue-zague, e conferir o que estava marcado exigia
 * reparar em qual chip tinha borda colorida.
 *
 * Em lista, tudo alinha numa coluna só: o marcador ocupa a mesma largura em toda
 * linha, marcado ou não, e é essa reserva de espaço que faz os rótulos caírem
 * todos no mesmo x. Ler o que está selecionado passa a ser correr o olho por uma
 * coluna de marcadores.
 *
 * A busca aparece SEMPRE, mesmo com três opções. Condicioná-la à quantidade
 * fazia painéis irmãos abrirem diferentes -- Tags com campo de busca, Produtos
 * sem -- e a diferença lia como falha, não como economia de espaço. Com ela
 * fixa, todo painel abre igual e o gesto de procurar vale em qualquer um.
 */

export interface OpcaoFiltro {
  /** Valor gravado no filtro. É o que `leadMatchesFilter` compara. */
  valor: string;
  /** Texto mostrado. Pode diferir do valor (id gravado, nome exibido). */
  rotulo: string;
  /** Cor de fundo da pastilha. Sem ela, o rótulo sai como texto puro. */
  cor?: string;
}

export function ListaOpcoes({
  opcoes,
  selecionados,
  onAlternar,
  vazio = "Nenhuma opção.",
  marcador = "pastilha",
  semBusca = false,
  navegacao = false,
}: {
  opcoes: OpcaoFiltro[];
  selecionados: string[] | undefined;
  onAlternar: (valor: string) => void;
  /** Frase quando não há nada a listar. */
  vazio?: string;
  /**
   * Como a cor aparece.
   *
   * "pastilha" pinta o fundo do rótulo, e é o certo para tag: ali a cor É a
   * identidade, e é assim que ela aparece no card do lead. "ponto" põe um
   * círculo antes do texto, para conjuntos onde a cor só distingue um item do
   * outro -- etapa de funil, por exemplo, onde o nome é que importa e um fundo
   * colorido em cada linha viraria arco-íris.
   */
  marcador?: "pastilha" | "ponto";
  /** Esconde a busca. Para colunas curtas que já cabem inteiras na tela. */
  semBusca?: boolean;
  /**
   * A lista escolhe UM item para navegar, e não marca vários para filtrar.
   *
   * Muda o que o item aceso significa. Some o visto, porque não há nada
   * marcado, e o realce vira cinza neutro em vez do verde: verde nos filtros
   * quer dizer "isto está restringindo o resultado", e numa coluna de navegação
   * seria uma promessa falsa.
   */
  navegacao?: boolean;
}) {
  const [busca, setBusca] = useState("");

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return opcoes;
    return opcoes.filter(o => o.rotulo.toLowerCase().includes(q));
  }, [opcoes, busca]);

  if (opcoes.length === 0) {
    return <p className="text-xs text-muted-foreground py-1">{vazio}</p>;
  }

  return (
    <div className="space-y-2">
      {!semBusca && (
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Pesquisar..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">Nada encontrado.</p>
      ) : (
        <div className="-mx-1 max-h-56 overflow-y-auto">
          {visiveis.map(o => {
            const marcada = selecionados?.includes(o.valor) ?? false;
            return (
              <button
                key={o.valor}
                type="button"
                onClick={() => onAlternar(o.valor)}
                className={`w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left transition-colors ${
                  marcada ? (navegacao ? "bg-muted" : "bg-primary/10") : "hover:bg-muted"
                }`}
              >
                {/* O visto ocupa espaço mesmo desmarcado (`invisible`, não
                    condicional): removê-lo do fluxo deslocaria o rótulo 20px a
                    cada clique, e a lista inteira dançaria ao marcar um item.
                    Em navegação ele não existe, e aí o recuo também não faz
                    falta -- não há coluna de marcas para alinhar. */}
                {!navegacao && (
                  <Check size={13} className={`shrink-0 text-primary ${marcada ? "" : "invisible"}`} />
                )}
                {o.cor && marcador === "pastilha" ? (
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full truncate max-w-full"
                    style={{ background: `${o.cor}22`, color: o.cor }}
                  >
                    {o.rotulo}
                  </span>
                ) : (
                  <>
                    {o.cor && (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.cor }} />
                    )}
                    <span className={`text-xs truncate ${marcada && !navegacao ? "text-primary font-medium" : "text-foreground"}`}>
                      {o.rotulo}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
