import { useMemo } from "react";
import type { DateRangeValue } from "@/components/ui/date-range-picker";
import { useTemaAtual } from "@/lib/tema";

export const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Cor de cada canal de origem, a cor da própria marca dele.
 *
 * Mora aqui, e não dentro de um painel, porque três rosquinhas da mesma linha
 * repartem por origem (leads, receita e perdas). Com o mapa duplicado, o mesmo
 * canal podia sair rosa num painel e azul no vizinho, e a comparação entre eles
 * (o canal que traz volume mas não traz dinheiro) deixaria de ser visual.
 *
 * Origem fora desta lista cai na paleta de reserva do DonutDistribuicao.
 */
export const ORIGIN_COLORS: Record<string, string> = {
  "Instagram": "#E1306C",
  "Facebook Ads": "#1877F2",
  "Indicação": "#10B981",
  "Site": "#6366F1",
  "Outro": "#94A3B8",
};

/**
 * Paleta de reserva das rosquinhas, para conjuntos sem cor própria (motivos de
 * perda, por exemplo, que o usuário cadastra e não têm cor definida).
 *
 * Ordenada para fatias vizinhas não ficarem parecidas. O vermelho fica por
 * último de propósito: ele carrega significado de erro no resto do CRM, e numa
 * distribuição neutra a terceira fatia não deve parecer um alerta.
 *
 * Mora aqui, e não no componente, porque quem monta os dados também precisa
 * dela: a cor de reserva é atribuída por POSIÇÃO na lista, então um conjunto
 * que aparece em duas ordens diferentes (motivos no geral e motivos de uma
 * origem) precisa fixar a cor por nome antes de entregar.
 */
/**
 * As cores das fatias e das barras, na ordem em que entram.
 *
 * É a rampa da MARCA, e não o arco-íris de antes (azul, âmbar, roxo, rosa,
 * teal, vermelho), que vinha de um tema genérico e punha um roxo no meio do
 * dashboard. Nenhuma cor de fora do sistema entra.
 *
 * MONOCROMÁTICA desde 08/10/2026, quando a marca deixou de ser o menta. Antes
 * ela alternava verdes e cinzas, e era a troca de MATIZ que separava uma fatia
 * da vizinha. Com um tom só, quem faz esse trabalho sozinho é a LUMINOSIDADE,
 * e por isso a ordem não é a rampa do mais escuro ao mais claro: ela pula de
 * uma ponta à outra a cada passo.
 *
 * Os números entre parênteses são a luminosidade de cada tom. Nenhum par
 * vizinho fica a menos de 29 pontos um do outro, e as três primeiras fatias
 * (as maiores em quase todo painel) abrem com 60 e 39 pontos de distância.
 *
 * Uma consequência honesta da escolha: oito tons de cinza se separam menos que
 * oito matizes. Até a quinta fatia a leitura é limpa; da sexta em diante ela
 * depende mais da legenda do que dependia antes. Painel que precise distinguir
 * oito séries de uma olhada pede outra forma de gráfico, não outra cor.
 *
 * Oito entradas porque é quanto os painéis chegam a pedir (responsáveis, tags,
 * origens); passando disso o índice dá a volta.
 */
const PALETA_CLARA = [
  "#1D1D1D", // (11) a cor da marca
  "#B4B4B7", // (71) neutral-400
  "#525154", // (32) neutral-700
  "#D5D5D5", // (84) neutral-300
  "#3A3A3E", // (23) neutral-800
  "#8A8A8E", // (55) neutral-500
  "#E7E7E7", // (91) neutral-200
  "#6C6C6C", // (42) neutral-600
];

/**
 * A paleta do tema ESCURO: o verde de sempre, intocado.
 *
 * Duas razões, e as duas importam. A virada para charcoal foi só da versão
 * clara, então no escuro a marca continua sendo o menta. E, mais grave, a
 * paleta clara não SOBREVIVE aqui: ela abre em #1D1D1D e o cartão escuro é
 * #1A1D21, três pontos de distância. A maior fatia de cada rosca desenhava
 * preto sobre preto e o gráfico parecia vazado -- foi exatamente o que o dono
 * viu ao trocar de tema em 08/10/2026.
 *
 * É a lista que existia antes da virada, na ordem em que existia.
 */
const PALETA_ESCURA = [
  "#01D8A4", // accent-400, a cor da marca no escuro
  "#2D2F33", // charcoal
  "#00A879", // accent-600
  "#B4B4B7", // neutral-400
  "#00654A", // accent-800
  "#5FE7BE", // accent-300
  "#6C6C6C", // neutral-600
  "#A5F3D9", // accent-200
];

/**
 * A paleta do tema que está na tela.
 *
 * É hook e não constante porque a cor de gráfico não passa por custom
 * property: o Recharts pinta no atributo `fill`, que não aceita `var()`. Quem
 * escolhe o hex é o componente, e para isso ele precisa saber o tema. Ver
 * `useTemaAtual` em src/lib/tema.ts.
 */
export function usePaleta(): string[] {
  return useTemaAtual() === "dark" ? PALETA_ESCURA : PALETA_CLARA;
}

/**
 * A cor da MARCA dentro de um gráfico, uma só, pelo mesmo motivo acima.
 *
 * Usada onde existe uma série só (o traço do KPI, as barras de horário, o
 * fundo da medalha, o "Ganhos" do funil). Charcoal no claro, menta no escuro:
 * é a mesma regra dos tokens, trazida para onde token não chega.
 */
export function useCorDaMarcaNoGrafico(): string {
  return useTemaAtual() === "dark" ? "#01D8A4" : "#1D1D1D";
}

/**
 * A receita de um negócio GANHO.
 *
 * `wonValue` é o valor congelado no momento do fechamento; `value` é o valor
 * atual do negócio, que muda quando alguém edita. Somar `value` fazia a receita
 * de um mês fechado mudar depois -- e, num negócio reaberto e ganho de novo por
 * outro preço, o histórico inteiro passava a mostrar o preço novo.
 *
 * O `??` cobre os negócios ganhos antes de a coluna existir, cujo backfill
 * fotografou o valor vigente. Só use para GANHO: em negócio aberto ou perdido o
 * que vale é `value`.
 */
export const receitaDoGanho = (l: { value: number; wonValue?: number }) => l.wonValue ?? l.value;

export const pct = (n: number, d: number) =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

// Parseia entryDate (string YYYY-MM-DD) como hora local, não UTC.
// entryDate vazio → retorna null (lead sem data é sempre incluído pelo chamador).
export const parseEntryDate = (d: string) => (d ? new Date(d + "T00:00:00") : null);

/**
 * A caixa que segue o ponteiro nos gráficos: ESCURA, como no material.
 *
 * Era branca com borda de 1px, igual ao cartão embaixo dela -- e num painel
 * branco, cheio de linhas claras, ela se confundia com o próprio conteúdo. No
 * `LineChart.jsx` do DS-3 ela é `--surface-inverse` com `--text-inverse`, que é
 * o contraste máximo contra tudo o que o dashboard desenha.
 *
 * Sem borda: sobre fundo claro o escuro já se separa sozinho, e a sombra de
 * sobreposição dá a profundidade.
 */
export const tooltip = {
  backgroundColor: "var(--surface-inverse)",
  border: "none",
  borderRadius: 8,
  color: "var(--text-inverse)",
  fontSize: 12,
  boxShadow: "var(--shadow-overlay)",
};

/**
 * Como um KPI se compara com o período anterior.
 *
 * São quatro respostas diferentes, e tratá-las como um número só era o bug:
 * `deltaPct` devolvia `null` tanto para "cresceu do zero" quanto para "não há
 * o que comparar", e o cartão desenhava um traço nos dois casos. Com "Todo
 * histórico" selecionado o traço aparecia em TODOS os cartões, porque a janela
 * anterior cai antes do primeiro registro que existe no sistema.
 */
/** Contra o que a comparação foi feita. Muda a explicação, não o desenho. */
export type BaseDaVariacao = "periodo-anterior" | "dentro-do-periodo";

export type Variacao =
  | { tipo: "pct"; valor: number; base: BaseDaVariacao }  // dá para comparar: -12,5%, +30%…
  | { tipo: "novo"; base: BaseDaVariacao }                // antes zero, agora tem: alta sem percentual possível
  | { tipo: "estavel"; base: BaseDaVariacao };            // zero dos dois lados: nada a apontar

/**
 * Compara dois números e diz o que aconteceu.
 *
 * Sempre devolve algo desenhável. Um cartão sem indicador nenhum é pior que um
 * indicador modesto: quem olha não sabe se está tudo estável ou se a tela
 * quebrou.
 */
export function variacao(current: number, prior: number, base: BaseDaVariacao = "periodo-anterior"): Variacao {
  if (prior === 0) return current > 0 ? { tipo: "novo", base } : { tipo: "estavel", base };
  return { tipo: "pct", valor: ((current - prior) / prior) * 100, base };
}

/**
 * Divide um período no meio. Usado para medir tendência DENTRO da janela
 * quando não existe período anterior com o que comparar -- o caso de "Todo
 * histórico", cuja janela anterior cai antes do primeiro dado do sistema.
 *
 * Comparar a segunda metade com a primeira responde à mesma pergunta ("está
 * subindo ou caindo?") usando só dado que existe, em vez de comparar com um
 * vazio e concluir qualquer coisa dele.
 */
export function meioDoPeriodo(de: Date, ate: Date): Date {
  return new Date((de.getTime() + ate.getTime()) / 2);
}

// Variação percentual crua, para quem só precisa do número.
// Em cartão, preferir `variacao()`: ela distingue "cresceu do zero" de "não há
// base", distinção que este número não consegue expressar.
export function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? null : 0;
  return ((current - prior) / prior) * 100;
}

// Janela imediatamente anterior ao período selecionado, com a mesma duração.
// Ex.: período 01-15 jan (15 dias) → anterior = 17 dez a 31 dez (15 dias).
export function usePriorPeriod(dateRange: DateRangeValue) {
  return useMemo(() => {
    const from = new Date(dateRange.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.to);
    to.setHours(23, 59, 59, 999);

    const durationMs = to.getTime() - from.getTime();
    const priorTo = new Date(from.getTime() - 1);
    const priorFrom = new Date(priorTo.getTime() - durationMs);

    return { priorFrom, priorTo };
  }, [dateRange]);
}
