import { useMemo } from "react";
import type { Lead } from "@/data/mockData";
import { fmt } from "./useDashboardHelpers";
import { DonutDistribuicao } from "./DonutDistribuicao";

const ORIGIN_COLORS: Record<string, string> = {
  "Instagram": "#E1306C",
  "Facebook Ads": "#1877F2",
  "Indicação": "#10B981",
  "Site": "#6366F1",
  "Outro": "#94A3B8",
};

interface OriginPanelProps {
  periodLeads: Lead[];
}

export function OriginPanel({ periodLeads }: OriginPanelProps) {
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

  return (
    <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
      {/* Sem ramo de "vazio" aqui: as duas rosquinhas se desenham zeradas
          sozinhas, com anel cinza e zero no centro. Um ramo separado para o
          período sem dado fazia o painel trocar de forma e de altura conforme o
          filtro de data, e quem olhava tinha que reencontrar onde ele estava. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 lg:divide-x lg:divide-card-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Origem dos leads</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-4">De onde vêm seus clientes</p>
            {/* Rosquinha no lugar das barras deitadas: origem é repartição de um
                todo ("de onde vieram os leads"), e a rosquinha mostra a proporção
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
                extra: conversao(o.winRate),
              }))}
              rotuloCentro={periodLeads.length === 1 ? "lead" : "leads"}
              colunas={{ valor: "Quantidade", extra: "Conversão" }}
            />
          </div>

          {/* Segunda rosquinha: receita, não contagem.
              A primeira responde "de onde vieram os leads"; esta responde "de
              onde veio o dinheiro". São perguntas diferentes e costumam ter
              respostas diferentes -- o canal que mais traz volume raramente é o
              que mais traz receita, e é justamente essa divergência que o painel
              mostra de relance quando as duas ficam lado a lado.

              As duas com o gráfico à esquerda: em colunas lado a lado, os dois
              anéis alinhados na mesma altura e no mesmo eixo tornam a comparação
              direta -- é ali que se vê o canal que traz volume mas não traz
              dinheiro.

              Aparece mesmo sem receita nenhuma, zerada: período sem venda é uma
              resposta, e escondê-la deixaria o painel torto, com uma coluna só. */}
          <div className="lg:pl-8">
              <h3 className="text-sm font-semibold text-foreground">Receita por origem</h3>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">De onde vem sua receita</p>
              <DonutDistribuicao
                dados={originData
                  .filter(o => o.revenue > 0)
                  .map(o => ({
                    nome: o.name,
                    valor: o.revenue,
                    cor: ORIGIN_COLORS[o.name],
                    extra: conversao(o.winRate),
                  }))}
                rotuloCentro="em vendas"
                formatarValor={fmt}
                colunas={{ valor: "Receita", extra: "Conversão" }}
              />
          </div>
        </div>
    </div>
  );
}
