import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { tooltip } from "./useDashboardHelpers";

/**
 * Rosquinha de distribuição, com total no centro e legenda com valores.
 *
 * Nasceu compartilhada de propósito. Os cartões de KPI deste dashboard já
 * tinham sido escritos à mão três vezes e divergido entre si; começar com dois
 * consumidores (motivos de perda e origem dos leads) e um componente só evita
 * repetir aquilo.
 *
 * Por que rosquinha e não pizza cheia: o furo do meio é onde mora o total, que
 * é a primeira pergunta de quem olha uma distribuição ("de quantos estamos
 * falando?"). Numa pizza cheia esse número teria que ir para fora, competindo
 * com a legenda.
 */

/** Paleta de reserva, para conjuntos sem cor própria (ex.: motivos de perda,
 *  que são cadastrados pelo usuário e não têm cor definida). Ordenada para
 *  fatias vizinhas não ficarem parecidas. */
const PALETA = ["#128A68", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#EF4444", "#64748B"];

export interface FatiaDonut {
  nome: string;
  valor: number;
  /** Opcional: sem cor, entra a da paleta na posição do item. */
  cor?: string;
}

interface Props {
  dados: FatiaDonut[];
  /** Palavra sob o número central ("perdidos", "leads"). */
  rotuloCentro: string;
  /**
   * Total do centro. Só passar quando o total do universo for maior que a soma
   * das fatias -- é o caso de listas cortadas no top N, onde somar as fatias
   * daria um número menor que a realidade e o centro mentiria.
   */
  total?: number;
  /** Altura da área do gráfico. */
  altura?: number;
}

export function DonutDistribuicao({ dados, rotuloCentro, total, altura = 190 }: Props) {
  const soma = dados.reduce((s, d) => s + d.valor, 0);
  const totalExibido = total ?? soma;

  const fatias = dados.map((d, i) => ({ ...d, cor: d.cor ?? PALETA[i % PALETA.length] }));

  return (
    <div>
      <div className="relative" style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias}
              dataKey="valor"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              /* Respiro entre fatias: sem ele, duas cores próximas viram um
                 bloco só e some a fronteira entre elas. */
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {fatias.map(f => <Cell key={f.nome} fill={f.cor} />)}
            </Pie>
            <Tooltip contentStyle={tooltip} />
          </PieChart>
        </ResponsiveContainer>

        {/* Centro em HTML, não em <text> do SVG: o texto fica com o mesmo
            antialiasing do resto da página e acompanha os tokens de cor.
            pointer-events-none para não roubar o hover das fatias. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[26px] leading-none font-bold text-foreground tabular-nums">{totalExibido}</span>
          <span className="text-[11px] text-muted-foreground mt-1">{rotuloCentro}</span>
        </div>
      </div>

      {/* Legenda com valor alinhado à direita. Em coluna, e não em linha:
          nomes de motivo de perda e de origem são livres e podem ser longos,
          e em linha eles se atropelariam. */}
      <div className="space-y-2 mt-4">
        {fatias.map(f => (
          <div key={f.nome} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.cor }} />
            <span className="text-foreground truncate">{f.nome}</span>
            <span className="ml-auto text-muted-foreground tabular-nums shrink-0">
              {f.valor}
              <span className="ml-1.5 text-[11px]">
                {soma > 0 ? `${Math.round((f.valor / soma) * 100)}%` : "0%"}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
