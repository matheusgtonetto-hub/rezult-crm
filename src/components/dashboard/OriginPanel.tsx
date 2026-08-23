import { useMemo } from "react";
import type { Lead } from "@/data/mockData";
import { fmt, ORIGIN_COLORS } from "./useDashboardHelpers";
import { DonutDistribuicao } from "./DonutDistribuicao";

interface OriginPanelProps {
  periodLeads: Lead[];
  /**
   * Classes aplicadas a CADA um dos dois cards (ex.: `lg:col-span-3`).
   *
   * Vai nos cards, e não num contêiner em volta: eles são itens diretos da
   * grade de quem chama, e é assim que esticam até a altura da linha. Uma div
   * envolvente também posicionaria, mas os cards de dentro ficariam mais baixos
   * que o painel vizinho.
   *
   * Uma classe só para os dois porque eles são gêmeos: larguras diferentes
   * entre "Origem dos negócios" e "Receita por origem" sugeririam que um importa
   * mais que o outro, quando são a mesma pergunta em duas grandezas.
   */
  className?: string;
}

/** Card dos dois painéis. Igual ao dos demais painéis do dashboard. */
const CARD = "bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5";

/**
 * Origem dos negócios e Receita por origem, dois cards irmãos.
 *
 * Retorna um Fragment, e não um card só com divisória: assim cada um vira item
 * direto da grade de quem chama, e as duas leituras ficam em pé de igualdade
 * com o painel de perdas ao lado. Dentro de um card único, elas pareceriam duas
 * metades de uma coisa só, e o vizinho, uma coisa inteira.
 *
 * Continuam no mesmo componente porque partilham `originData`: separá-las em
 * dois componentes faria a mesma varredura de leads acontecer duas vezes, e
 * abriria espaço para as duas divergirem no cálculo de conversão.
 */
export function OriginPanel({ periodLeads, className = "" }: OriginPanelProps) {
  const originData = useMemo(() => {
    const map = new Map<string, { name: string; count: number; won: number; lost: number; revenue: number }>();
    periodLeads.forEach(l => {
      const o = l.origin || "Outro";
      const cur = map.get(o) || { name: o, count: 0, won: 0, lost: 0, revenue: 0 };
      cur.count++;
      if (l.dealStatus === "won") { cur.won++; cur.revenue += l.value; }
      if (l.dealStatus === "lost") cur.lost++;
      map.set(o, cur);
    });
    return [...map.values()]
      .map(o => ({
        ...o,
        // Conversão sobre negócios ENCERRADOS (ganhos + perdidos), não sobre o
        // total: leads ainda em aberto não perderam nem ganharam, e contá-los no
        // denominador faria toda origem parecer pior do que é enquanto o
        // pipeline não fecha.
        winRate: (o.won + o.lost) > 0 ? (o.won / (o.won + o.lost)) * 100 : null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [periodLeads]);

  // Traço quando nada encerrou: "0%" ali seria mentira, porque afirma que a
  // origem tentou e não converteu, quando na verdade ainda não houve desfecho.
  const conversao = (taxa: number | null) => (taxa === null ? "—" : `${taxa.toFixed(0)}%`);

  // Sem ramo de "vazio" em nenhum dos dois: as rosquinhas se desenham zeradas
  // sozinhas, com anel cinza e zero no centro. Um ramo separado para o período
  // sem dado fazia o painel trocar de forma e de altura conforme o filtro de
  // data, e quem olhava tinha que reencontrar onde ele estava.
  return (
    <>
      <div className={`${CARD} ${className}`}>
        <h3 className="text-sm font-semibold text-foreground">Origem dos negócios</h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">De onde vêm seus clientes</p>
        {/* Rosquinha no lugar das barras deitadas: origem é repartição de um
            todo ("de onde vieram os negócios"), e a rosquinha mostra a proporção
            de cada fatia sem o leitor ter que comparar comprimentos de barra.
            O total no centro responde antes de tudo de quantos se fala.

            As cores vêm de ORIGIN_COLORS, que é a cor da própria marca de
            cada canal (rosa do Instagram, azul do Facebook). A paleta de
            reserva do componente só entra para origens fora dessa lista. */}
        <DonutDistribuicao
          dados={originData.map(o => ({
            nome: o.name,
            valor: o.count,
            cor: ORIGIN_COLORS[o.name],
            extras: [conversao(o.winRate)],
          }))}
          rotuloCentro={periodLeads.length === 1 ? "negócio" : "negócios"}
          colunas={{ valor: "Quantidade", extras: ["Conversão"] }}
          empilhado
        />
      </div>

      {/* Segunda rosquinha: receita, não contagem.
          A primeira responde "de onde vieram os negócios"; esta responde "de onde
          veio o dinheiro". São perguntas diferentes e costumam ter respostas
          diferentes -- o canal que mais traz volume raramente é o que mais traz
          receita, e é justamente essa divergência que salta aos olhos com os
          dois lado a lado.

          Aparece mesmo sem receita nenhuma, zerada: período sem venda é uma
          resposta, e escondê-la deixaria um buraco na linha de painéis. */}
      <div className={`${CARD} ${className}`}>
        <h3 className="text-sm font-semibold text-foreground">Receita por origem</h3>
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">De onde vem sua receita</p>
        <DonutDistribuicao
          dados={originData
            .filter(o => o.revenue > 0)
            .map(o => ({
              nome: o.name,
              valor: o.revenue,
              cor: ORIGIN_COLORS[o.name],
              extras: [conversao(o.winRate)],
            }))}
          rotuloCentro="em vendas"
          formatarValor={fmt}
          colunas={{ valor: "Receita", extras: ["Conversão"] }}
          empilhado
        />
      </div>
    </>
  );
}
