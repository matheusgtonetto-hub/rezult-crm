import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { deltaPct, usePriorPeriod } from "@/components/dashboard/useDashboardHelpers";
import type { DateRangeValue } from "@/components/ui/date-range-picker";

/**
 * Aba "Multiatendimento" do Dashboard.
 *
 * Lê a tabela `atendimentos`, que é o episódio de atendimento (começa, alguém
 * pega, termina), separado do contato e do negócio. Antes dela nada disso era
 * mensurável: a conversa era uma linha só, sem começo nem fim, e "quantos
 * atendimentos tivemos em julho" não tinha resposta possível.
 *
 * Duas naturezas de número convivem aqui, e a distinção é sinalizada no
 * subtítulo de cada cartão porque misturá-las em silêncio é o erro clássico
 * deste tipo de painel:
 *
 *   NO PERÍODO -> respeita o filtro de data da página, com variação contra o
 *                 período anterior, igual ao resto do Dashboard.
 *   AGORA      -> retrato do instante. "Quantos estão esperando alguém" não faz
 *                 sentido recortado por mês, então não leva variação.
 */

interface Atendimento {
  status: string;
  aberto_em: string;
  fechado_em: string | null;
  primeira_entrada_em: string | null;
  primeira_resposta_em: string | null;
  primeira_resposta_humana_em: string | null;
  responsavel: string | null;
  reaberturas: number;
}

/** Mediana, não média: um atendimento esquecido por dias distorce a média e faz
 *  o painel mentir sobre o dia a dia do time. */
function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

function duracao(minutos: number | null): string {
  if (minutos === null) return "—";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = minutos / 60;
  if (h < 24) return `${h.toFixed(1).replace(".", ",")} h`;
  return `${(h / 24).toFixed(1).replace(".", ",")} d`;
}

const minutosEntre = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / 60000;

export function MultiatendimentoPanel({ dateRange }: { dateRange: DateRangeValue }) {
  const { company } = useCompany();
  const [linhas, setLinhas] = useState<Atendimento[] | null>(null);
  const { priorFrom, priorTo } = usePriorPeriod(dateRange);

  useEffect(() => {
    if (!company?.id) return;
    let vivo = true;
    supabase
      .from("atendimentos")
      .select("status, aberto_em, fechado_em, primeira_entrada_em, primeira_resposta_em, primeira_resposta_humana_em, responsavel, reaberturas")
      .eq("company_id", company.id)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { console.error("[dashboard] atendimentos:", error); setLinhas([]); return; }
        setLinhas((data ?? []) as Atendimento[]);
      });
    return () => { vivo = false; };
  }, [company?.id]);

  const m = useMemo(() => {
    if (!linhas) return null;

    const de = new Date(dateRange.from); de.setHours(0, 0, 0, 0);
    const ate = new Date(dateRange.to);  ate.setHours(23, 59, 59, 999);
    const dentro = (iso: string, ini: Date, fim: Date) => {
      const d = new Date(iso);
      return d >= ini && d <= fim;
    };

    const noPeriodo = linhas.filter(a => dentro(a.aberto_em, de, ate));
    const anterior  = linhas.filter(a => dentro(a.aberto_em, priorFrom, priorTo));

    const resumo = (lista: Atendimento[]) => ({
      total:        lista.length,
      finalizados:  lista.filter(a => a.status === "finalizado").length,
      comResposta:  lista.filter(a => a.primeira_resposta_em).length,
      soAgente:     lista.filter(a => a.primeira_resposta_em && !a.primeira_resposta_humana_em).length,
      // Escalou: o robô respondeu primeiro e depois uma pessoa entrou.
      escalaram:    lista.filter(a => a.primeira_resposta_em && a.primeira_resposta_humana_em
                      && new Date(a.primeira_resposta_em) < new Date(a.primeira_resposta_humana_em)).length,
      reabertos:    lista.filter(a => a.reaberturas > 0).length,
      // A base é a mensagem DO CONTATO, não a abertura. Numa conversa que nós
      // iniciamos, medir da abertura contaria como demora nossa o tempo que ELE
      // levou para responder -- num teste real deu 130 min contra 10 reais.
      // Quando o contato inicia, as duas coincidem e nada muda.
      ate1a:        mediana(lista.filter(a => a.primeira_resposta_em)
                      .map(a => minutosEntre(a.primeira_entrada_em ?? a.aberto_em, a.primeira_resposta_em!))),
      ate1aHumana:  mediana(lista.filter(a => a.primeira_resposta_humana_em)
                      .map(a => minutosEntre(a.primeira_entrada_em ?? a.aberto_em, a.primeira_resposta_humana_em!))),
      ateFechar:    mediana(lista.filter(a => a.fechado_em)
                      .map(a => minutosEntre(a.aberto_em, a.fechado_em!))),
    });

    return {
      atual: resumo(noPeriodo),
      antes: resumo(anterior),
      // Retrato do instante, sem recorte de período.
      aguardandoAgora: linhas.filter(a => a.status === "aguardando").length,
      emAbertoAgora:   linhas.filter(a => a.status === "em_atendimento").length,
      // Por atendente, só os do período e só quem tem responsável. Atendimento
      // sem responsável não vira linha "(sem responsável)": isso encheria a
      // tabela com o resto e esconderia a leitura que interessa, que é comparar
      // pessoas entre si.
      porAtendente: Object.entries(
        noPeriodo.reduce<Record<string, { total: number; finalizados: number; tempos: number[] }>>((acc, a) => {
          if (!a.responsavel) return acc;
          const r = acc[a.responsavel] ??= { total: 0, finalizados: 0, tempos: [] };
          r.total += 1;
          if (a.status === "finalizado") r.finalizados += 1;
          if (a.primeira_resposta_humana_em) r.tempos.push(minutosEntre(a.primeira_entrada_em ?? a.aberto_em, a.primeira_resposta_humana_em));
          return acc;
        }, {})
      )
        .map(([nome, v]) => ({ nome, total: v.total, finalizados: v.finalizados, mediana: mediana(v.tempos) }))
        .sort((a, b) => b.total - a.total),
    };
  }, [linhas, dateRange, priorFrom, priorTo]);

  if (!m) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl p-4 border border-gray-200 h-[104px] animate-pulse" />
        ))}
      </div>
    );
  }

  const { atual, antes } = m;
  const pctAgente = atual.comResposta > 0
    ? Math.round((atual.soAgente / atual.comResposta) * 100)
    : 0;

  // Tempo que ENCURTA é melhoria, então a variação entra com o sinal trocado:
  // "-20%" numa espera é bom, e mostrar isso em vermelho ensinaria o contrário.
  const deltaTempo = (agora: number | null, antes_: number | null) =>
    agora === null || antes_ === null ? null : deltaPct(antes_, agora);

  return (
    <div className="space-y-4">
      {/* Volume ----------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total de atendimentos"
          value={atual.total}
          sub="abertos no período"
          deltaPct={deltaPct(atual.total, antes.total)}
        />
        <KpiCard
          label="Atendimentos finalizados"
          value={atual.finalizados}
          sub="dos abertos no período"
          deltaPct={deltaPct(atual.finalizados, antes.finalizados)}
        />
        {/* Os subtítulos dizem "resposta do time" e não "atendente", que era o
            texto anterior. Estes dois números medem se ALGUÉM DO TIME JÁ
            RESPONDEU -- é o que o gatilho grava em `status`. Quem "pegou" a
            conversa é outra coisa: é o clique em "Iniciar atendimento", que o
            chip do Multiatendimento conta. As duas leituras são legítimas e
            diferentes (59 sem resposta contra 32 sem clique), então o texto
            precisa nomear cada uma pelo que ela é; senão o operador vê dois
            números para a mesma pergunta e conclui que um deles está quebrado. */}
        <KpiCard
          label="Em aberto"
          value={m.emAbertoAgora}
          sub="agora, já respondidos pelo time"
        />
        <KpiCard
          label="Aguardando"
          value={m.aguardandoAgora}
          sub="agora, sem resposta do time"
        />
      </div>

      {/* Tempos e agente -------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Até a 1ª resposta"
          value={duracao(atual.ate1a)}
          sub="mediana, qualquer origem"
          deltaPct={deltaTempo(atual.ate1a, antes.ate1a)}
        />
        <KpiCard
          label="Até resposta humana"
          value={duracao(atual.ate1aHumana)}
          sub="mediana, só o time"
          deltaPct={deltaTempo(atual.ate1aHumana, antes.ate1aHumana)}
        />
        <KpiCard
          label="Até finalizar"
          value={duracao(atual.ateFechar)}
          // Os finalizados anteriores a 15/08/2026 não guardam data de
          // fechamento: a origem era um booleano sem carimbo. Dizer isso é
          // melhor que um traço mudo e muito melhor que um zero, que mentiria.
          sub={atual.ateFechar === null
            ? "só a partir dos fechamentos de agora"
            : "mediana, da abertura ao fim"}
          deltaPct={deltaTempo(atual.ateFechar, antes.ateFechar)}
        />
        <KpiCard
          label="Resolvidos sem o time"
          value={atual.comResposta > 0 ? `${pctAgente}%` : "—"}
          sub={atual.comResposta > 0
            ? `${atual.soAgente} de ${atual.comResposta} com resposta`
            : "nenhum atendimento respondido"}
          // Sem nenhuma resposta no período o valor é "—", e uma variação ao
          // lado de um traço não quer dizer nada.
          deltaPct={atual.comResposta > 0 ? deltaPct(atual.soAgente, antes.soAgente) : undefined}
        />
      </div>

      {/* Escalonamento e reabertura --------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Escalaram para humano"
          value={atual.escalaram}
          sub="o agente atendeu e uma pessoa entrou depois"
          deltaPct={deltaPct(atual.escalaram, antes.escalaram)}
        />
        <KpiCard
          label="Taxa de reabertura"
          value={atual.finalizados > 0 ? `${Math.round((atual.reabertos / atual.finalizados) * 100)}%` : "—"}
          // Reabertura alta costuma significar atendente fechando cedo demais,
          // e é o tipo de coisa que só aparece medindo. Os históricos contam
          // zero: antes de 15/08 reabrir não deixava rastro.
          sub={atual.finalizados > 0
            ? `${atual.reabertos} voltaram depois de finalizados`
            : "nenhum finalizado no período"}
          deltaPct={atual.finalizados > 0 ? deltaPct(atual.reabertos, antes.reabertos) : undefined}
        />
      </div>

      {/* Por atendente ---------------------------------------------------- */}
      <div className="bg-card border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Por atendente</h3>
        {m.porAtendente.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum atendimento com responsável no período.
          </p>
        ) : (
          <div className="space-y-3">
            {m.porAtendente.map(a => (
              <div key={a.nome} className="flex items-center justify-between gap-4">
                <span className="text-xs text-foreground truncate flex-1">{a.nome}</span>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {a.finalizados} de {a.total} finalizados
                </span>
                <span className="text-xs font-semibold text-foreground tabular-nums w-20 text-right">
                  {duracao(a.mediana)}
                </span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">
              Tempo é a mediana até a resposta humana daquele atendente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
