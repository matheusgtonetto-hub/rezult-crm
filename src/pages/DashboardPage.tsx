import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCRM } from "@/context/CRMContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowDown, AlertTriangle, ShoppingCart,
  Activity as ActivityIcon,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ROTULO_DA_VISAO, VISOES_DO_DASHBOARD, type VisaoDoDashboard } from "@/components/dashboard/visoesDoDashboard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DonutDistribuicao } from "@/components/dashboard/DonutDistribuicao";
import { OriginPanel } from "@/components/dashboard/OriginPanel";
import { UtmAttributionPanel } from "@/components/dashboard/UtmAttributionPanel";
import { TagPerformancePanel } from "@/components/dashboard/TagPerformancePanel";
import { FunnelChart } from "@/components/ui/funnel-chart";
import { ResultadoResponsavelPanel } from "@/components/dashboard/ResultadoResponsavelPanel";
import { HorariosPanel } from "@/components/dashboard/HorariosPanel";
import { TooltipSeries } from "@/components/dashboard/CaixaTooltip";
import { RankingPanel } from "@/components/dashboard/RankingPanel";
import { MultiatendimentoPanel } from "@/components/dashboard/MultiatendimentoPanel";
import { fmt, parseEntryDate, tooltip, usePriorPeriod, variacao, meioDoPeriodo, ORIGIN_COLORS, PALETA, receitaDoGanho } from "@/components/dashboard/useDashboardHelpers";
import { MEDALHAS, VERDE_DEMAIS, tintaDaMedalha } from "@/components/dashboard/medalhas";
import { TabelaDoPainel, LINHA_CORPO, LINHA_PE } from "@/components/dashboard/TabelaPainel";
import { tintaSobre } from "@/lib/contraste";


/**
 * As três séries da aba Negócios, numa fonte só.
 *
 * Elas apareciam repetidas em seis lugares: as duas legendas e os dois gráficos,
 * cada um com nome, cor e chave escritos à mão. Bastava alguém trocar uma cor
 * num deles para a legenda passar a mentir sobre a curva.
 *
 * `cor` é hexadecimal, e não token do tema, porque quem pinta é o SVG do
 * Recharts, que não resolve `hsl(var(--primary))`. Os valores vêm do Rezult CRM
 * Design System, nos papéis que a seção 3.10 da matriz fixa: o esmeralda 400
 * marca o GANHO, que é o resultado que o painel existe para mostrar; o charcoal
 * fica com "Negócios", que é o universo contra o qual esse resultado se lê (o
 * papel de comparação); e o vermelho de decadência fica na queda.
 */
const AREAS_NEGOCIOS = [
  // `chave` é a contagem; `chaveValor` é o dinheiro do mesmo recorte. O botão
  // Quantidade/Receita só troca qual das duas o gráfico lê.
  // "Negócios", e não "Novos": os três nomes aparecem juntos na legenda e no
  // tooltip, e "Novos" sozinho não dizia novos O QUÊ. Os outros dois já são
  // situações do negócio, então nomear a entrada pelo objeto fecha a frase.
  { chave: "novos",    chaveValor: "novosValor",    nome: "Negócios", cor: "#2D2F33", id: "area-novos" },
  { chave: "ganhos",   chaveValor: "ganhosValor",   nome: "Ganhos",   cor: "#01D8A4", id: "area-ganhos" },
  { chave: "perdidos", chaveValor: "perdidosValor", nome: "Perdidos", cor: "#FD5555", id: "area-perdidos" },
] as const;

/** Cor de cada série pelo NOME, que é a chave com que o Recharts devolve o
 *  ponto olhado. Montado uma vez, fora do componente: é constante. */
const COR_DA_SERIE = Object.fromEntries(AREAS_NEGOCIOS.map(a => [a.nome, a.cor]));

/** Eixo Y em dinheiro precisa ser curto, senão "R$ 1.610,00" come a largura do
 *  gráfico em cada marca. Mil vira "k", milhão vira "M". */
const fmtCurto = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000   ? `R$ ${Math.round(v / 1_000)}k`
  : `R$ ${v}`;

/**
 * Os dias da semana na ordem em que a semana de trabalho acontece.
 *
 * O índice do array é a posição no eixo, não o número que o JavaScript usa:
 * `getDay()` devolve 0 para domingo, e essa é a ordem do calendário de parede,
 * não a de quem vende. Numa distribuição de negócios, sábado e domingo são os
 * dois extremos do gráfico -- juntos numa ponta se lê "o fim de semana é
 * fraco", e com o domingo na outra ponta a mesma informação fica partida.
 *
 * A conversão de um para o outro é `(getDay() + 6) % 7`.
 */
const DIAS_DA_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * O ciclo inteiro zerado, para o painel "Resultados por horário/dia" manter
 * eixo e grade quando o período não tem nenhum movimento.
 *
 * O "Resultado no período" nunca fica vazio de verdade: ele monta os doze meses
 * antes de contar qualquer coisa, então no pior caso desenha os eixos e uma
 * linha rente ao zero. A distribuição por ciclo é o contrário -- só cria o
 * compartimento quando algo cai nele --, e sem nada o gráfico sumia inteiro,
 * dando lugar a uma frase centralizada. Lado a lado, os dois painéis tratavam o
 * mesmo "não há nada" de duas formas diferentes.
 *
 * Aqui os rótulos são reais, e não faixas em branco: 0h–23h e Seg–Dom existem
 * independentemente de ter havido negócio neles. O que o esqueleto afirma é a
 * escala, não o dado.
 */
const CICLO_VAZIO = {
  horas: Array.from({ length: 24 }, (_, h) => ({
    key: String(h).padStart(2, "0"), mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0,
  })),
  dias: DIAS_DA_SEMANA.map((dia, i) => ({
    key: String(i).padStart(2, "0"), mes: dia, novos: 0, ganhos: 0, perdidos: 0,
  })),
};

export default function DashboardPage() {
  const {
    leads, pipelines, products, teamMembers, memberColors, memberAvatars, memberEmails, tasks, lossReasons, crmTags,
  } = useCRM();

  /**
   * Qual visão está no ar.
   *
   * Estado da página, e não do `Tabs`: quem escolhe é o seletor do cabeçalho,
   * que fica fora da árvore de abas. Com `defaultValue` por dentro, o `Tabs`
   * guardaria a escolha num lugar que o cabeçalho não alcança.
   */
  const [visao, setVisao] = useState<VisaoDoDashboard>("negocios");

  const [dateRange, setDateRange] = useState<DateRangeValue>(() => ({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date(),
  }));

  /**
   * O período filtrado, escrito para ser lido: "Seg, 15 jan".
   *
   * Dia da semana e mês cortados em três letras, com o ano em dois dígitos:
   * "Qui, 1 Jan 26".
   *
   * O corte é feito aqui, e não pelo formato do `date-fns`. O `EEE` do pt-BR
   * devolve o nome inteiro ("Quinta"), e o `EEEEEE` devolve duas letras --
   * nenhum dos dois dá as três que o desenho pede. Cortando, o resultado
   * independe de qual abreviação a biblioteca resolve usar na próxima versão.
   *
   * O `replace(".", "")` tira o ponto que algumas formas trazem, que no meio da
   * frase vira sujeira ("qui., 1 jan.").
   *
   * O ano aparece nos dois lados, e não só no fim: um período que atravessa a
   * virada ("Sex, 25 Dez 26 · Ter, 5 Jan 27") precisa dizer de que ano é cada
   * ponta, senão parece que o filtro anda para trás.
   *
   * Um dia só quando início e fim caem na mesma data -- repetir a data inteira
   * dos dois lados do ponto seria dizer a mesma coisa duas vezes.
   */
  const periodoPorExtenso = useMemo(() => {
    const tresLetras = (s: string) => {
      const corte = s.replace(".", "").slice(0, 3);
      return corte.charAt(0).toUpperCase() + corte.slice(1);
    };
    const trecho = (d: Date) =>
      `${tresLetras(format(d, "EEEE", { locale: ptBR }))}, ${format(d, "d")} ` +
      `${tresLetras(format(d, "MMMM", { locale: ptBR }))} ${format(d, "yy")}`;

    const de = trecho(dateRange.from);
    const ate = trecho(dateRange.to);
    // Ponto centralizado (·), e não travessão: ele separa sem sugerir
    // intervalo contínuo, e ocupa menos espaço numa linha que já é longa.
    return de === ate ? de : `${de} · ${ate}`;
  }, [dateRange]);

  const [donutMode, setDonutMode] = useState<"value" | "count">("value");
  const [funnelPipelineId, setFunnelPipelineId] = useState<string>("");
  const [funnelResponsible, setFunnelResponsible] = useState<string>("all");
  const navigate = useNavigate();
  const [drillDialog, setDrillDialog] = useState<{
    open: boolean;
    title: string;
    items: { leadId: string; leadName: string; subtitle: string }[];
  }>({ open: false, title: "", items: [] });

  const allLeads = useMemo(() => Object.values(leads), [leads]);
  const wonLeads = useMemo(() => allLeads.filter(l => l.dealStatus === "won"), [allLeads]);
  const lostLeads = useMemo(() => allLeads.filter(l => l.dealStatus === "lost"), [allLeads]);

  const { dataFrom, dataTo } = useMemo(() => {
    let min: Date | undefined;
    let max: Date | undefined;
    allLeads.forEach(l => {
      const d = l.entryDate ? new Date(l.entryDate + "T00:00:00") : null;
      if (!d || isNaN(d.getTime())) return;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });
    return { dataFrom: min, dataTo: max };
  }, [allLeads]);

  // Normaliza para início e fim do dia no fuso local
  const periodCutoff = new Date(dateRange.from);
  periodCutoff.setHours(0, 0, 0, 0);
  const periodTo = new Date(dateRange.to);
  periodTo.setHours(23, 59, 59, 999);

  const inPeriod = (d: Date) => d >= periodCutoff && d <= periodTo;

  const { priorFrom, priorTo } = usePriorPeriod(dateRange);
  const inPriorPeriod = (d: Date) => d >= priorFrom && d <= priorTo;

  /**
   * Existe período anterior com o que comparar?
   *
   * Não existe quando a janela anterior termina antes do primeiro registro do
   * sistema -- é o que acontece com "Todo histórico", cuja janela anterior cai
   * inteira antes de o CRM ter qualquer dado.
   *
   * Nesse caso a tendência não some: passa a ser medida DENTRO do período,
   * comparando a segunda metade com a primeira. Responde à mesma pergunta
   * ("está subindo ou caindo?") usando só dado que existe, em vez de comparar
   * com um vazio.
   */
  const temPeriodoAnterior = !!dataFrom && priorTo >= dataFrom;
  const meioPeriodo = meioDoPeriodo(periodCutoff, periodTo);
  const naPrimeiraMetade = (d: Date) => d >= periodCutoff && d < meioPeriodo;

  // periodLeads e priorPeriodLeads classificados numa única passada sobre allLeads
  // (evita duas iterações .filter() completas quando o objetivo é só comparar os dois períodos).
  const { periodLeads, priorPeriodLeads } = useMemo(() => {
    const cur: typeof allLeads = [];
    const prior: typeof allLeads = [];
    allLeads.forEach(l => {
      if (!l.pipelineId) return; // Lead sem negócio ainda não conta nas métricas de negócio
      const d = parseEntryDate(l.entryDate);
      if (d === null) return;
      if (inPeriod(d)) cur.push(l);
      else if (inPriorPeriod(d)) prior.push(l);
    });
    return { periodLeads: cur, priorPeriodLeads: prior };
  }, [allLeads, dateRange]);

  const { wonInPeriod, lostInPeriod, revenueInPeriod, wonPrior, lostPrior, revenuePrior } = useMemo(() => {
    const wonIds = new Set<string>();
    const lostIds = new Set<string>();
    const wonPriorIds = new Set<string>();
    const lostPriorIds = new Set<string>();
    allLeads.forEach(lead => {
      lead.activities.forEach(act => {
        const d = new Date(act.date);
        if (inPeriod(d)) {
          if (act.type === "won") wonIds.add(lead.id);
          if (act.type === "lost") lostIds.add(lead.id);
        } else if (inPriorPeriod(d)) {
          if (act.type === "won") wonPriorIds.add(lead.id);
          if (act.type === "lost") lostPriorIds.add(lead.id);
        }
      });
    });
    const w = wonLeads.filter(l => wonIds.has(l.id));
    const lo = lostLeads.filter(l => lostIds.has(l.id));
    const wp = wonLeads.filter(l => wonPriorIds.has(l.id));
    const lp = lostLeads.filter(l => lostPriorIds.has(l.id));
    return {
      wonInPeriod: w, lostInPeriod: lo, revenueInPeriod: w.reduce((s, l) => s + receitaDoGanho(l), 0),
      wonPrior: wp, lostPrior: lp, revenuePrior: wp.reduce((s, l) => s + receitaDoGanho(l), 0),
    };
  }, [allLeads, wonLeads, lostLeads, dateRange]);

  const monthlyData = useMemo(() => {
    // Cada balde guarda a contagem E o dinheiro. Somar os dois no mesmo passo
    // garante que o botão Quantidade/Receita nunca mostre recortes diferentes:
    // é o mesmo lead, no mesmo balde, contado de duas formas.
    type Bucket = {
      key: string; mes: string;
      novos: number; ganhos: number; perdidos: number;
      novosValor: number; ganhosValor: number; perdidosValor: number;
      /**
       * Quais negócios este compartimento já contou, por desfecho.
       *
       * Um negócio ganho, reaberto e ganho de novo tem DUAS atividades de
       * ganho, e o laço somava `lead.value` uma vez por atividade: o mesmo
       * negócio entrava duas vezes na contagem e na receita. Medido no banco em
       * 20/09/2026: 7 negócios em 87 com ganho repetido, inflando a receita de
       * R$ 44.753 para R$ 52.900 (18% a mais).
       *
       * Os conjuntos não saem daqui -- são apagados antes de o dado virar
       * gráfico, logo abaixo.
       */
      ganhosVistos: Set<string>; perdasVistas: Set<string>;
    };
    const map = new Map<string, Bucket>();
    // Compara só a parte de data (sem horário) para não ser afetado pela normalização
    // de periodCutoff (00:00) e periodTo (23:59).
    const fromDay = new Date(dateRange.from); fromDay.setHours(0, 0, 0, 0);
    const toDay   = new Date(dateRange.to);   toDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((toDay.getTime() - fromDay.getTime()) / 86400000);

    if (diffDays === 0) {
      // ── HOJE: apenas horas com atividade registrada ──
      allLeads.forEach(lead => {
        // created_at tem o timestamp real de criação com hora; entryDate é só data (meia-noite)
        const e = lead.created_at ? new Date(lead.created_at) : parseEntryDate(lead.entryDate);
        if (e && e >= periodCutoff && e <= periodTo) {
          const h = e.getHours();
          const key = String(h).padStart(2, "0");
          const cur = map.get(key) || { key, mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0, ganhosVistos: new Set<string>(), perdasVistas: new Set<string>() };
          cur.novos++; cur.novosValor += lead.value;
          map.set(key, cur);
        }
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (d < periodCutoff || d > periodTo) return;
          const h = d.getHours();
          const key = String(h).padStart(2, "0");
          const cur = map.get(key) || { key, mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0, ganhosVistos: new Set<string>(), perdasVistas: new Set<string>() };
          if (act.type === "won" && !cur.ganhosVistos.has(lead.id)) {
            cur.ganhosVistos.add(lead.id); cur.ganhos++; cur.ganhosValor += receitaDoGanho(lead);
          }
          if (act.type === "lost" && !cur.perdasVistas.has(lead.id)) {
            cur.perdasVistas.add(lead.id); cur.perdidos++; cur.perdidosValor += lead.value;
          }
          map.set(key, cur);
        });
      });

    } else if (diffDays <= 31) {
      // ── DIAS: granularidade diária ──
      // Se começa no dia 1, estende até o último dia do mês (Este mês / Mês passado)
      const isMonthStart = periodCutoff.getDate() === 1;
      const displayEnd = isMonthStart
        ? new Date(periodTo.getFullYear(), periodTo.getMonth() + 1, 0)
        : new Date(periodTo);
      displayEnd.setHours(23, 59, 59, 999);
      // Mas nunca além de hoje. A extensão até o fim do mês serve ao "Mês
      // passado", que já terminou; no "Este mês" ela desenhava os dias que ainda
      // não chegaram, rente ao eixo, como se as vendas tivessem parado.
      const fimDeHoje = new Date();
      fimDeHoje.setHours(23, 59, 59, 999);
      if (displayEnd > fimDeHoje) displayEnd.setTime(fimDeHoje.getTime());

      const cursor = new Date(periodCutoff);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= displayEnd) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        map.set(key, { key, mes: `${cursor.getDate()}/${cursor.getMonth() + 1}`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0, ganhosVistos: new Set<string>(), perdasVistas: new Set<string>() });
        cursor.setDate(cursor.getDate() + 1);
      }

      allLeads.forEach(lead => {
        const e = parseEntryDate(lead.entryDate);
        if (e && e >= periodCutoff && e <= periodTo) {
          const key = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (bucket) { bucket.novos++; bucket.novosValor += lead.value; }
        }
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (d < periodCutoff || d > periodTo) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (!bucket) return;
          if (act.type === "won" && !bucket.ganhosVistos.has(lead.id)) {
            bucket.ganhosVistos.add(lead.id); bucket.ganhos++; bucket.ganhosValor += receitaDoGanho(lead);
          }
          if (act.type === "lost" && !bucket.perdasVistas.has(lead.id)) {
            bucket.perdasVistas.add(lead.id); bucket.perdidos++; bucket.perdidosValor += lead.value;
          }
        });
      });

    } else {
      // ── MESES: do primeiro ao último mês DO PERÍODO ──
      //
      // Eram 12 buckets fixos, contados a partir do início do período, sem olhar
      // onde ele termina. Num filtro de 1 Jan a 19 Set, o eixo desenhava até
      // Dez -- três meses no FUTURO, fora do recorte e zerados por construção.
      // O rótulo do cabeçalho dizia uma coisa e o eixo mostrava outra.
      //
      // O eixo agora cobre o período escolhido, nem mais nem menos. Mês dentro
      // do período e sem movimento CONTINUA aparecendo, zerado: ali o zero é o
      // dado ("não houve venda em março"), e apagá-lo esconderia justamente o
      // buraco que a pessoa precisa ver.
      const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

      // As duas pontas são aparadas, e cada uma por um motivo diferente.
      //
      // FIM: nunca além do mês corrente. Um filtro de "este ano" aberto em
      // setembro inclui outubro a dezembro, mas ali não há zero a mostrar -- há
      // futuro. Série temporal não desenha o que ainda não aconteceu.
      //
      // INÍCIO: nunca antes do primeiro registro da conta. Uma conta aberta em
      // maio, num filtro de ano inteiro, desenhava janeiro a abril rente ao eixo
      // -- e ali o zero não é "não vendemos", é "não existíamos". Zero só
      // informa quando havia alguém para produzir o número.
      //
      // O que NÃO é aparado é o meio: mês dentro do período, depois do primeiro
      // registro e sem movimento, continua aparecendo zerado. Ali o zero é o
      // dado, e apagá-lo esconderia o buraco que a pessoa precisa enxergar.
      let primeiroDado: Date | null = null;
      const marcar = (d: Date | null) => {
        if (d && !Number.isNaN(d.getTime()) && (!primeiroDado || d < primeiroDado)) primeiroDado = d;
      };
      allLeads.forEach(lead => {
        marcar(lead.created_at ? new Date(lead.created_at) : parseEntryDate(lead.entryDate));
        // As atividades entram na conta: um lead importado hoje pode carregar um
        // ganho registrado meses atrás, e cortar aquele mês apagaria uma venda
        // que existe.
        lead.activities.forEach(act => marcar(new Date(act.date)));
      });

      const cursor = new Date(periodCutoff);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      if (primeiroDado) {
        const mesDoPrimeiro = new Date((primeiroDado as Date).getFullYear(), (primeiroDado as Date).getMonth(), 1);
        if (mesDoPrimeiro > cursor) { cursor.setTime(mesDoPrimeiro.getTime()); }
      }

      const hoje = new Date();
      const mesCorrente = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimDoPeriodo = new Date(periodTo.getFullYear(), periodTo.getMonth(), 1);
      const ultimoMes = fimDoPeriodo < mesCorrente ? fimDoPeriodo : mesCorrente;

      while (cursor <= ultimoMes) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, { key, mes: `${monthNames[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0, ganhosVistos: new Set<string>(), perdasVistas: new Set<string>() });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      allLeads.forEach(lead => {
        const e = parseEntryDate(lead.entryDate);
        if (e && e >= periodCutoff && e <= periodTo) {
          const key = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (bucket) { bucket.novos++; bucket.novosValor += lead.value; }
        }
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (d < periodCutoff || d > periodTo) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (!bucket) return;
          if (act.type === "won" && !bucket.ganhosVistos.has(lead.id)) {
            bucket.ganhosVistos.add(lead.id); bucket.ganhos++; bucket.ganhosValor += receitaDoGanho(lead);
          }
          if (act.type === "lost" && !bucket.perdasVistas.has(lead.id)) {
            bucket.perdasVistas.add(lead.id); bucket.perdidos++; bucket.perdidosValor += lead.value;
          }
        });
      });
    }

    // Os conjuntos de controle ficam para trás: o gráfico recebe só os números.
    return [...map.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(({ ganhosVistos: _g, perdasVistas: _p, ...dado }) => dado);
  }, [allLeads, dateRange]);

  /**
   * O período repartido nos dois ciclos que se repetem: as horas do dia e os
   * dias da semana.
   *
   * As duas contagens saem da MESMA varredura, e não de dois `useMemo` com o
   * laço escrito duas vezes. É a mesma pergunta ("quando isso acontece?") com
   * dois relógios diferentes, e um negócio criado às 14h de uma terça entra nos
   * dois de uma vez -- separar as varreduras significaria manter duas cópias
   * das mesmas regras de filtro e de tipo de atividade, que podem divergir.
   *
   * Só entram compartimentos com movimento. Um dia sem nada não vira coluna
   * zerada: numa conta que só opera de segunda a sexta, sábado e domingo
   * fixariam duas cavas no gráfico que não dizem nada além de "não trabalhamos".
   */
  const distribuicaoDoCiclo = useMemo(() => {
    type Bucket = { key: string; mes: string; novos: number; ganhos: number; perdidos: number };
    const porHora = new Map<number, Bucket>();
    const porDia = new Map<number, Bucket>();

    const compartimento = (mapa: Map<number, Bucket>, indice: number, rotulo: string) => {
      const atual = mapa.get(indice) || { key: String(indice).padStart(2, "0"), mes: rotulo, novos: 0, ganhos: 0, perdidos: 0 };
      mapa.set(indice, atual);
      return atual;
    };

    const contar = (d: Date, serie: "novos" | "ganhos" | "perdidos") => {
      compartimento(porHora, d.getHours(), `${d.getHours()}h`)[serie]++;
      // `+6 % 7` desloca a semana do domingo para a segunda. Ver DIAS_DA_SEMANA.
      const dia = (d.getDay() + 6) % 7;
      compartimento(porDia, dia, DIAS_DA_SEMANA[dia])[serie]++;
    };

    allLeads.forEach(lead => {
      const e = lead.created_at ? new Date(lead.created_at) : parseEntryDate(lead.entryDate);
      if (e && e >= periodCutoff && e <= periodTo) contar(e, "novos");
      // Um negócio conta UMA vez por desfecho, como no gráfico do período:
      // ganho, reaberto e ganho de novo são duas atividades do mesmo negócio, e
      // contá-las duas vezes inflava a hora (e o dia) em que isso aconteceu.
      let jaGanhou = false;
      let jaPerdeu = false;
      lead.activities.forEach(act => {
        const d = new Date(act.date);
        if (d < periodCutoff || d > periodTo) return;
        if (act.type === "won" && !jaGanhou) { jaGanhou = true; contar(d, "ganhos"); }
        if (act.type === "lost" && !jaPerdeu) { jaPerdeu = true; contar(d, "perdidos"); }
      });
    });

    // Ordena pelo índice numérico do compartimento, que é a ordem do ciclo:
    // 0h→23h e Seg→Dom. Ordenar pelo rótulo colocaria "10h" antes de "9h" e a
    // semana em ordem alfabética.
    const emOrdem = (mapa: Map<number, Bucket>) =>
      [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);

    return { horas: emOrdem(porHora), dias: emOrdem(porDia) };
  }, [allLeads, dateRange]);

  /**
   * Os dois ciclos renomeados para o vocabulário do ranking em barras.
   *
   * Saem da MESMA `distribuicaoDoCiclo` que desenha a curva ao lado. A curva
   * responde "como o dia (ou a semana) se comporta" e o ranking responde "onde
   * o negócio entra" -- perguntas diferentes sobre o mesmo dado. Recalcular por
   * fora abriria espaço para as duas discordarem sobre a mesma hora, lado a
   * lado na mesma linha.
   *
   * Os dois vão inteiros, sem ordenar nem cortar: quem faz isso é o painel, que
   * tem o botão Dias/Horas. Cortar aqui decidiria o ranking antes de saber qual
   * dos dois está apertado.
   *
   * A renomeação existe porque os dois consumidores nomeiam as mesmas colunas de
   * formas diferentes: a curva chama de `mes`/`novos` (herança do gráfico
   * mensal, onde o eixo era mês), e o ranking chama de `rotulo`/`negocios`.
   */
  const rankingDoCiclo = useMemo(() => {
    const renomear = (faixas: typeof distribuicaoDoCiclo.horas) =>
      faixas.map(f => ({
        rotulo: f.mes,
        negocios: f.novos,
        ganhos: f.ganhos,
        perdidos: f.perdidos,
      }));
    return { horas: renomear(distribuicaoDoCiclo.horas), dias: renomear(distribuicaoDoCiclo.dias) };
  }, [distribuicaoDoCiclo]);

  /**
   * Perdas repartidas por origem, com os motivos de cada origem por dentro.
   *
   * Dois níveis de propósito. "Perdemos 40 negócios por preço" é um dado morto:
   * não diz onde agir. "Perdemos 40 por preço, e 32 deles vieram do Facebook
   * Ads" aponta para a campanha. Por isso a origem é quem reparte o anel e o
   * motivo desce para sub-linha, em vez do contrário.
   *
   * Motivos cortados no top 3 por origem, com o resto somado em "Outros
   * motivos". Sem corte, uma conta com 5 origens e 8 motivos cada renderia 45
   * linhas numa coluna de 1/3 da tela. O resto vira uma linha em vez de sumir,
   * senão a soma das sub-linhas não fecharia com o número da origem.
   */
  const lossByOriginData = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; motivos: Map<string, number> }>();
    lostInPeriod.forEach(l => {
      const o = l.origin || "Outro";
      const cur = map.get(o) || { nome: o, total: 0, motivos: new Map<string, number>() };
      cur.total++;
      const r = lossReasons.find(x => x.id === l.lossReasonId)?.name || "Sem motivo";
      cur.motivos.set(r, (cur.motivos.get(r) || 0) + 1);
      map.set(o, cur);
    });
    // Percentual sempre sobre o TOTAL de perdas, nos dois níveis. Se a
    // sub-linha usasse o total da própria origem, a coluna misturaria duas
    // bases e "50%" numa linha e "50%" na de baixo significariam coisas
    // diferentes. Sobre a mesma base, as sub-linhas somam o percentual da mãe.
    const totalPerdas = lostInPeriod.length;
    const fatia = (n: number) => (totalPerdas > 0 ? `${Math.round((n / totalPerdas) * 100)}%` : "—");

    /**
     * Motivos agregados da empresa toda, e a cor fixa de cada um.
     *
     * A cor é atribuída aqui, uma vez, pela ordem global. É o que mantém "Preço
     * alto" da mesma cor no anel agregado e no recorte de uma origem: a paleta
     * de reserva do componente pinta por POSIÇÃO na lista, e a posição de um
     * motivo muda de uma origem para outra.
     */
    const globais = new Map<string, number>();
    lostInPeriod.forEach(l => {
      const r = lossReasons.find(x => x.id === l.lossReasonId)?.name || "Sem motivo";
      globais.set(r, (globais.get(r) || 0) + 1);
    });
    const motivosGlobais = [...globais.entries()]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
    const corDoMotivo = new Map(motivosGlobais.map((m, i) => [m.nome, PALETA[i % PALETA.length]]));

    const porOrigem = [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map(o => {
        const motivos = [...o.motivos.entries()]
          .map(([nome, valor]) => ({ nome, valor, extras: [fatia(valor)], cor: corDoMotivo.get(nome) }))
          .sort((a, b) => b.valor - a.valor);
        const topo = motivos.slice(0, 3);
        const resto = motivos.slice(3).reduce((s, m) => s + m.valor, 0);
        return {
          nome: o.nome,
          valor: o.total,
          extras: [fatia(o.total)],
          cor: ORIGIN_COLORS[o.nome],
          // "Outros motivos" em cinza, e não numa cor da paleta: ele não é um
          // motivo, é a sobra de vários. Uma cor própria o faria parecer o
          // quarto motivo mais comum.
          detalhes: resto > 0
            ? [...topo, { nome: "Outros motivos", valor: resto, extras: [fatia(resto)], cor: "#B4B4B7" }]
            : topo,
        };
      });

    return {
      porOrigem,
      porMotivo: motivosGlobais.map(m => ({ ...m, cor: corDoMotivo.get(m.nome) })),
    };
  }, [lostInPeriod, lossReasons]);

  // Considera responsibles[] (múltiplos responsáveis) quando presente, com fallback para
  // o campo singular responsible — antes só o singular era considerado, o que sub-contava
  // negócios com mais de um responsável. Nota: isso conta receita/negócio uma vez POR
  // responsável (atribuição, não rateio) — um negócio com 2 responsáveis aparece inteiro
  // na linha de cada um, por design, não é bug de soma duplicada.
  const leadsForMember = (ml: typeof periodLeads, m: string) => ml.filter(l => {
    const resps = l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
    return resps.includes(m);
  });

  const agentPerformance = useMemo(() => {
    return teamMembers.map(m => {
      const ml = leadsForMember(periodLeads, m);           // workload: entrou no período
      const won = leadsForMember(wonInPeriod, m);          // ganhos no período (por atividade — igual ao KPI)
      const lost = leadsForMember(lostInPeriod, m).length; // perdidos no período (por atividade — igual ao KPI)
      const totalValue = won.reduce((s, l) => s + receitaDoGanho(l), 0);
      const closed = won.length + lost;
      return {
        name: m,
        total: ml.length,
        won: won.length,
        lost,
        convRate: closed > 0 ? (won.length / closed * 100).toFixed(0) : "—",
        totalValue,
        avgTicket: won.length > 0 ? totalValue / won.length : 0,
        color: memberColors[m] || "#525154",
      };
    }).sort((a, b) => b.totalValue - a.totalValue);
  }, [periodLeads, wonInPeriod, lostInPeriod, teamMembers, memberColors]);

  /**
   * Fatias do painel "Resultado por responsável".
   *
   * Sai de `agentPerformance`, o mesmo cálculo que alimenta a aba Time. Recontar
   * aqui por conta própria faria o dashboard afirmar duas coisas diferentes
   * sobre o mesmo vendedor em duas abas, e a primeira divergência de critério
   * (fechamento por atividade x campo do negócio) mataria a confiança nas duas.
   *
   * Sai daqui com as quatro grandezas cruas, sem escolher qual reparte o anel:
   * essa é decisão do painel, que tem o botão Quantidade/Receita. Formatar ou
   * pré-selecionar aqui obrigaria a página a saber do estado de um botão que
   * vive lá dentro.
   *
   * Quem não apareceu no período de forma nenhuma fica de fora. Uma fileira de
   * zeros para cada membro inativo empurraria para baixo justamente quem vendeu.
   */
  const resultadoPorResponsavel = useMemo(
    () =>
      agentPerformance
        .filter(a => a.won > 0 || a.lost > 0 || a.total > 0)
        .map(a => ({
          nome: a.name,
          // Sem `cor`: quem pinta é o painel, com a rampa da marca por posição
          // no anel. A cor do avatar (hash do nome) continua valendo onde ela
          // IDENTIFICA a pessoa -- avatar, tabela, conversa --, mas no anel ela
          // só separava fatias, e enchia de roxo um dashboard verde.
          negocios: a.total,
          ganhos: a.won,
          perdidos: a.lost,
          receita: a.totalValue,
        })),
    [agentPerformance],
  );

  const donutData = useMemo(() => {
    return teamMembers.map(m => {
      const ml = leadsForMember(periodLeads, m);
      const value = donutMode === "value" ? ml.reduce((s, l) => s + l.value, 0) : ml.length;
      return { name: m, value, color: memberColors[m] || "#525154" };
    }).filter(d => d.value > 0);
  }, [periodLeads, teamMembers, memberColors, donutMode]);

  /*
   * Produtos mais vendidos, com a receita RATEADA entre os itens do negócio.
   *
   * Enquanto era um produto por negócio, somar a receita inteira em cada
   * produto dava certo por acidente. Com dois, isso contaria a mesma venda duas
   * vezes -- o mesmo erro que o gráfico do período tinha.
   *
   * O rateio é pelo peso de cada item, e não pela soma crua: o valor do negócio
   * pode ter sido ajustado à mão (é onde mora o desconto no total), e aí a soma
   * dos itens não bate com o que entrou de fato. Item de R$ 1.000 num negócio
   * fechado a R$ 900 leva R$ 900; se os dois itens valem 1.000 e 500, levam 600
   * e 300.
   *
   * Itens todos zerados (produto cadastrado sem preço) dividem por igual: sem
   * peso nenhum, a alternativa seria jogar a receita toda fora.
   */
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; count: number; value: number }>();
    products.forEach(p => map.set(p.id, { name: p.name, sku: p.sku, count: 0, value: 0 }));

    wonInPeriod.forEach(l => {
      const receita = receitaDoGanho(l);
      const itens = (l.itens ?? []).filter(i => map.has(i.productId));

      // Negócio sem item, mas com o produto no campo espelho: é o que sobrou de
      // antes da tabela de itens existir, e continua contando como uma venda.
      if (itens.length === 0) {
        if (!l.productId || !map.has(l.productId)) return;
        const cur = map.get(l.productId)!;
        cur.count++; cur.value += receita;
        return;
      }

      const pesos = itens.map(i => i.quantidade * i.valorUnitario);
      const total = pesos.reduce((s, v) => s + v, 0);
      itens.forEach((item, i) => {
        const cur = map.get(item.productId)!;
        cur.count++;
        cur.value += total > 0 ? receita * (pesos[i] / total) : receita / itens.length;
      });
    });

    return [...map.values()].sort((a, b) => b.value - a.value || b.count - a.count);
  }, [wonInPeriod, products]);

  const activityStats = useMemo(() => {
    const allActs = allLeads.flatMap(l => l.activities.map(a => ({ ...a, leadName: l.name, leadResponsible: l.responsible ?? "" })));
    const inPeriod = allActs.filter(a => { const d = new Date(a.date); return d >= periodCutoff && d <= periodTo; });
    const meetings = inPeriod.filter(a => a.type === "meeting");

    type DrillItem = { leadId: string; leadName: string; subtitle: string };

    // Reuniões com leadId para drill-down
    const allMeetingRecs = allLeads.flatMap(l =>
      l.activities
        .filter(a => a.type === "meeting")
        .map(a => ({ ...a, leadId: l.id, leadName: l.name, leadResponsible: l.responsible ?? "" }))
    );

    // Top SDR — agendamentos: reuniões criadas no período
    const sdrMap = new Map<string, { scheduled: DrillItem[]; completed: DrillItem[] }>();
    allMeetingRecs.forEach(a => {
      const d = new Date(a.date);
      if (d < periodCutoff || d > periodTo) return;
      const u = a.userName || a.leadResponsible || "Desconhecido";
      const cur = sdrMap.get(u) || { scheduled: [], completed: [] };
      cur.scheduled.push({ leadId: a.leadId, leadName: a.leadName, subtitle: new Date(a.date).toLocaleDateString("pt-BR") });
      sdrMap.set(u, cur);
    });
    // Reuniões ocorridas: completedAt dentro do período
    allMeetingRecs.filter(a => a.completedAt).forEach(a => {
      const d = new Date(a.completedAt!);
      if (d < periodCutoff || d > periodTo) return;
      const u = a.userName || a.leadResponsible || "Desconhecido";
      const cur = sdrMap.get(u) || { scheduled: [], completed: [] };
      cur.completed.push({ leadId: a.leadId, leadName: a.leadName, subtitle: new Date(a.completedAt!).toLocaleDateString("pt-BR") });
      sdrMap.set(u, cur);
    });
    const topSchedulers = [...sdrMap.entries()]
      .map(([name, s]) => ({
        name,
        count: s.scheduled.length,
        completed: s.completed.length,
        convRate: s.scheduled.length > 0 ? Math.round(s.completed.length / s.scheduled.length * 100) : 0,
        scheduledItems: s.scheduled,
        completedItems: s.completed,
      }))
      .sort((a, b) => b.count - a.count);

    // Top Closer — vendas por quem marcou como ganho
    const wonByUserItems = new Map<string, DrillItem[]>();
    allLeads.forEach(l => {
      if (l.dealStatus !== "won") return;
      const wonAct = l.activities.find(a => {
        const d = new Date(a.date);
        return a.type === "won" && d >= periodCutoff && d <= periodTo;
      });
      if (!wonAct) return;
      const u = wonAct.userName || l.responsible || "Desconhecido";
      const arr = wonByUserItems.get(u) || [];
      arr.push({ leadId: l.id, leadName: l.name, subtitle: fmt(l.value) });
      wonByUserItems.set(u, arr);
    });
    // Reuniões realizadas do Closer
    const closerCompletedItems = new Map<string, DrillItem[]>();
    allMeetingRecs.filter(a => a.completedAt).forEach(a => {
      const d = new Date(a.completedAt!);
      if (d < periodCutoff || d > periodTo) return;
      const u = a.completedBy || a.userName || a.leadResponsible || "Desconhecido";
      const arr = closerCompletedItems.get(u) || [];
      arr.push({ leadId: a.leadId, leadName: a.leadName, subtitle: new Date(a.completedAt!).toLocaleDateString("pt-BR") });
      closerCompletedItems.set(u, arr);
    });
    const topCompleters = [...wonByUserItems.entries()]
      .map(([name, wonItems]) => {
        const compItems = closerCompletedItems.get(name) || [];
        return {
          name,
          won: wonItems.length,
          count: compItems.length,
          convRate: compItems.length > 0 ? Math.round(wonItems.length / compItems.length * 100) : 0,
          wonItems,
          completedItems: compItems,
        };
      })
      .sort((a, b) => b.won - a.won);

    return {
      meetings: meetings.length,
      completedMeetings: meetings.filter(a => a.completedAt).length,
      noShows: meetings.filter(a => a.noShowAt).length,
      topSchedulers,
      topCompleters,
    };
  }, [allLeads, dateRange]);

  const funnelPipeline = useMemo(
    () => pipelines.find(p => p.id === funnelPipelineId) || pipelines[0] || null,
    [pipelines, funnelPipelineId],
  );

  const barData = useMemo(() => {
    if (!funnelPipeline) return [];
    return [...funnelPipeline.columns]
      .sort((a, b) => a.position - b.position)
      .map(c => ({
        name: c.title,
        leads: c.leadIds.filter(id => { const l = leads[id]; return l && (!l.dealStatus || l.dealStatus === "open"); }).length,
        fill: c.color,
      }));
  }, [funnelPipeline, leads]);

  const funnelData = useMemo(() => {
    if (!funnelPipeline) return [];
    const stages = [...funnelPipeline.columns].sort((a, b) => a.position - b.position);
    const pipelineLeads = allLeads.filter(l => {
      if (l.pipelineId !== funnelPipeline.id) return false;
      if (funnelResponsible === "all") return true;
      const resps = l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
      return resps.includes(funnelResponsible);
    });
    return stages.map((stage, i) => {
      const entered = new Set<string>();
      if (i === 0) pipelineLeads.forEach(l => { const d = parseEntryDate(l.entryDate); if (d !== null && d >= periodCutoff && d <= periodTo) entered.add(l.id); });
      pipelineLeads.forEach(lead => {
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (act.type !== "stage_change" || d < periodCutoff || d > periodTo) return;
          const m = act.description.match(/para "(.+)"\./);
          if (m && m[1] === stage.title) entered.add(lead.id);
        });
      });
      const wonCount = [...entered].filter(id => leads[id]?.dealStatus === "won").length;
      return { stage, count: entered.size, wonCount };
    });
  }, [funnelPipeline, allLeads, leads, dateRange, funnelResponsible]);

  const periodLabel = `${dateRange.from.toLocaleDateString("pt-BR")} – ${dateRange.to.toLocaleDateString("pt-BR")}`;

  /** O que o gráfico "Resultado no período" mede: quantos negócios ou quanto dinheiro. */
  const [metricaPeriodo, setMetricaPeriodo] = useState<"quantidade" | "receita">("quantidade");

  // Em receita sobra só a linha de Ganhos, porque é a única das três que é
  // dinheiro que entrou. "Novos" em reais seria valor de pipeline, ainda não
  // realizado, e "Perdidos" seria dinheiro que nunca existiu. Desenhar as três
  // sob o rótulo "Receita" faria o gráfico afirmar algo que não aconteceu.
  const areasDoPeriodo = metricaPeriodo === "receita"
    ? AREAS_NEGOCIOS.filter(a => a.chave === "ganhos")
    : AREAS_NEGOCIOS;

  /**
   * Em que relógio o painel "Resultados por horário/dia" lê o período.
   *
   * Nasce em dias, que é a leitura mais grossa das duas. São sete colunas contra
   * vinte e quatro, então a forma da semana se lê de relance, enquanto a curva
   * das horas pede atenção para dizer alguma coisa. E o ranking ao lado já
   * responde por hora: abrir os dois na mesma unidade gastaria metade da linha
   * repetindo o recorte.
   */
  const [cicloDoHorario, setCicloDoHorario] = useState<"horas" | "dias">("dias");
  const cicloEscolhido = cicloDoHorario === "horas" ? distribuicaoDoCiclo.horas : distribuicaoDoCiclo.dias;
  // Sem movimento nenhum, entra o ciclo completo zerado para os eixos ficarem
  // de pé. Ver CICLO_VAZIO.
  const dadosDoCiclo = cicloEscolhido.length > 0 ? cicloEscolhido : CICLO_VAZIO[cicloDoHorario];

  return (
    // Contêiner único: a barra lateral que ficava aqui saiu, e com ela o
    // invólucro `flex` que a punha ao lado do painel. A escolha da visão desceu
    // para um seletor no cabeçalho.
    //
    // O topo tem 40px e os outros três lados, 30px. A assimetria é de propósito:
    // acima do título não há nada, e o respiro maior separa a página da barra do
    // navegador. Nas laterais e embaixo, 30px já bastam porque ali o limite é a
    // sidebar do app ou o fim do conteúdo. Valores arbitrários porque nenhum dos
    // dois existe na escala do Tailwind, que pula de 24 (p-6) para 32 (p-8).
    //
    // Escritos lado a lado, e não como `p-[30px] pt-[40px]`: naquela forma quem
    // vence depende da ordem em que o Tailwind emite as regras, que é detalhe
    // interno dele e não algo para o layout depender.
    //
    // `max-w-7xl` é 1280px, o teto padrão do Tailwind. Deixa 1220px de área útil
    // depois do padding, e é dela que saem as larguras dos painéis: os quatro
    // cartões do topo ficam com ~296px cada e as duas rosquinhas de Origem com
    // ~594px por coluna. Com a barra fora, esses 1220px voltam inteiros para os
    // gráficos.
    // Sem classe de escopo: desde a Onda 0 os tokens do design system são
    // globais (src/index.css), e a ponte `.rz-ds-v3` que existia só aqui foi
    // removida. Ver seção 6 da matriz: token é global ou não é token.
    <div className="pt-[40px] px-[30px] pb-[30px] max-w-7xl mx-auto">
      <Tabs value={visao} onValueChange={v => setVisao(v as VisaoDoDashboard)} className="space-y-6">
      {/* Header em três colunas, e não num `justify-between` de dois lados.

          `1fr auto 1fr` põe o seletor no centro do CABEÇALHO, não no meio do vão
          que sobra entre o título e o período -- e esses dois têm larguras bem
          diferentes ("Performance geral" contra "Multiatendimento", uma data
          curta contra um intervalo). Num `justify-between` com três filhos, o do
          meio andaria para os lados a cada troca de visão.

          As colunas laterais têm a mesma proporção, então o centro é o centro de
          verdade. Abaixo de `md` a grade vira uma coluna só: em tela estreita as
          três peças lado a lado não cabem, e a do meio ficaria espremida.

          `items-start` no desktop porque o bloco do título tem duas linhas
          (nome da visão e período por extenso), e alinhar pelo centro deixaria o
          seletor flutuando na altura do meio em vez de na linha do título. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-start gap-3">
        <div>
          {/* 23px é valor arbitrário: a escala do Tailwind pula de 20 (text-xl)
              para 24 (text-2xl). */}
          {/* Título fixo, e não o rótulo da visão escolhida.

              Ele acompanhava a seleção, e com as abas logo ao lado isso virava
              eco: trocar para "Equipe" trocava o título para "Equipe" também, e
              a mesma palavra aparecia duas vezes na mesma linha. O título passa a
              nomear a TELA, que é o que não muda, e as abas dizem o recorte. */}
          <h1 className="text-[24px] font-semibold text-foreground">Dashboards</h1>
          {/* No lugar do subtítulo fixo ("Desempenho geral do seu negócio"),
              o período que está filtrando. Aquela frase valia para qualquer
              conta em qualquer dia; esta responde a pergunta que a pessoa
              realmente traz ao olhar um número: "de quando é isso?".

              14px, e não os 12px dos subtítulos de painel: acompanha o título da
              página, que é maior. */}
          <p className="text-sm text-muted-foreground mt-0.5">{periodoPorExtenso}</p>
        </div>
        {/* Seletor de visão: as três abas lado a lado, no centro do cabeçalho.

            A escolhida leva o verde CHEIO do item ativo do app (`bg-primary`,
            `--accent-400`) com tinta charcoal, que é a decisão D2: sobre
            emerald a tinta nunca é branca.

            A trilha é BRANCA com `--shadow-xs`, e não cinza. O `bg-muted/40`
            que estava aqui foi escrito quando o canvas do app era branco; desde
            que a D5 tornou o canvas `--bg-app` (#F7F7F7), cinza a 40% sobre
            cinza compunha em #F5F5F5 e dava 1,02:1 -- o controle sumia no
            fundo. A regra passa a ser a mesma da barra lateral: superfície
            clara sobre o canvas cinza, descolada por borda e sombra. Nos
            controles que ficam DENTRO de um cartão branco vale o inverso,
            `--neutral-100` chapado, como sulco.

            A distinção não é só de matiz -- verde escuro contra branco separa
            também por claro e escuro, então continua legível para quem não
            distingue verde de cinza.

            Voltaram a ser abas, e não o menu suspenso: são três, cabem na linha,
            e assim as outras duas ficam à vista. No menu, saber o que existe
            exigia abrir.

            `role="tablist"` com `aria-selected`: para quem ouve a tela, isto
            continua sendo um seletor de abas -- sem os papéis seriam três botões
            soltos, sem indicação de qual está no ar. */}
        <div
          className="flex md:justify-center"
          role="tablist"
          aria-label="Visões do dashboard"
        >
          <div className="inline-flex rounded-lg border border-card-border p-0.5 bg-card shadow-[var(--shadow-xs)]">
            {VISOES_DO_DASHBOARD.map(({ id, Icone }) => {
              const ativa = id === visao;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => setVisao(id)}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    ativa
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {/* O ícone acompanha o texto na mesma cor: com ele sempre
                      verde, as abas inativas ficariam com metade acesa. */}
                  <Icone size={14} className="shrink-0" />
                  {ROTULO_DA_VISAO[id]}
                </button>
              );
            })}
          </div>
        </div>

        {/* O seletor de período vale para as quatro visões, e por isso fica
            fora do menu. `md:justify-self-end` porque a coluna da direita tem
            `1fr`: sem isso ele encostaria no centro em vez da borda. */}
        <div className="md:justify-self-end">
          <DateRangePicker value={dateRange} onChange={setDateRange} dataFrom={dataFrom} dataTo={dataTo} />
        </div>
      </div>

        {/* ──────────── NEGÓCIOS ──────────── */}
        <TabsContent value="negocios" className="space-y-4 mt-0">
          {/* KPIs de negócios — todos os pipelines, filtrados pelo período, com variação vs. período anterior */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(() => {
              const openInPeriod = periodLeads.filter(l => !l.dealStatus || l.dealStatus === "open");
              const openPrior = priorPeriodLeads.filter(l => !l.dealStatus || l.dealStatus === "open");

              /**
               * Escolhe contra o que comparar.
               *
               * Com período anterior, compara com ele. Sem período anterior,
               * compara a segunda metade da janela com a primeira -- e diz
               * isso, para "+30%" não ser lido como comparação com um período
               * que não existe.
               *
               * `dataDe` muda por métrica: negócios entram pela data de
               * entrada, ganhos e perdidos pela data em que foram fechados.
               * Usar a mesma data para todos contaria a venda no mês em que o
               * negócio nasceu, não no mês em que fechou.
               */
              const compara = (
                atual: typeof periodLeads,
                anterior: typeof periodLeads,
                dataDe: (l: typeof periodLeads[number]) => Date | null,
              ) => {
                if (temPeriodoAnterior) return variacao(atual.length, anterior.length, "periodo-anterior");
                let primeira = 0;
                for (const l of atual) {
                  const d = dataDe(l);
                  if (d && naPrimeiraMetade(d)) primeira++;
                }
                return variacao(atual.length - primeira, primeira, "dentro-do-periodo");
              };

              const porEntrada = (l: typeof periodLeads[number]) => parseEntryDate(l.entryDate);
              /** Data em que o negócio foi fechado como ganho/perdido, dentro do período. */
              const porFechamento = (tipo: "won" | "lost") => (l: typeof periodLeads[number]) => {
                for (const act of l.activities) {
                  if (act.type !== tipo) continue;
                  const d = new Date(act.date);
                  if (inPeriod(d)) return d;
                }
                return null;
              };

              return [
                {
                  label: "Total de negócios",
                  // Para onde a seta do canto leva: a lista de Leads com o mesmo
                  // recorte do cartão. `null` = a lista inteira.
                  statusNaLista: null as "won" | "lost" | "open" | null,
                  value: periodLeads.length,
                  sub: fmt(periodLeads.reduce((s, l) => s + l.value, 0)),
                  delta: compara(periodLeads, priorPeriodLeads, porEntrada),
                  tom: "primary" as const,
                },
                {
                  label: "Total em vendas",
                  statusNaLista: "won" as const,
                  value: wonInPeriod.length,
                  sub: fmt(wonInPeriod.reduce((s, l) => s + receitaDoGanho(l), 0)),
                  delta: compara(wonInPeriod, wonPrior, porFechamento("won")),
                  tom: "success" as const,
                },
                {
                  label: "Total perdidos",
                  statusNaLista: "lost" as const,
                  value: lostInPeriod.length,
                  sub: fmt(lostInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: compara(lostInPeriod, lostPrior, porFechamento("lost")),
                  tom: "danger" as const,
                },
                {
                  label: "Total em aberto",
                  statusNaLista: "open" as const,
                  value: openInPeriod.length,
                  sub: fmt(openInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: compara(openInPeriod, openPrior, porEntrada),
                  tom: "amber" as const,
                },
              ];
            })().map(c => (
              <KpiCard
                key={c.label}
                label={c.label}
                value={c.value}
                sub={c.sub}
                variacao={c.delta}
                tom={c.tom}
                // O dinheiro segue em `sub` e a contagem em `value`, como
                // sempre foram. Quem inverteu a ORDEM na tela foi o `KpiCard`,
                // trocando de lugar as duas linhas que desenha -- os dados aqui
                // não mudaram.
                //
                // Sem `icone` e sem `serie`: os quatro cartões desta fileira
                // ficam só com o rótulo, os dois números e a variação. O ícone
                // era decorativo -- o rótulo já diz o que é a métrica. O mini
                // gráfico do rodapé saía do mesmo `monthlyData` da curva grande
                // logo abaixo, então repetia em 44px de altura uma história que
                // o painel inteiro conta em seguida.
                destaqueNoSub
                // O número de negócios precisa dizer de que ele é contagem: os
                // quatro cartões contam negócios, em situações diferentes.
                sufixo={c.value === 1 ? "negócio" : "negócios"}
                // A seta do canto abre a LISTA por trás do número, já filtrada
                // pelo mesmo recorte. Sem o filtro ela largaria a pessoa na
                // lista inteira, obrigando-a a refazer à mão o corte que acabou
                // de clicar.
                aoAbrir={() => navigate(c.statusNaLista ? `/leads?status=${c.statusNaLista}` : "/leads")}
                rotuloDeAbrir={`Ver ${c.label.toLowerCase()} na lista de leads`}
              />
            ))}
          </div>

          {/* A curva do período e a repartição dela por responsável na mesma
              linha: uma diz QUANDO o resultado aconteceu, a outra diz DE QUEM
              ele foi. Separadas em linhas diferentes, cruzar as duas exigia
              rolar a página; lado a lado, um pico na curva e a fatia que o
              produziu ficam no mesmo olhar.

              4/6 para a curva e 2/6 para o anel. A curva é série temporal e é
              onde a largura vira leitura: mais espaço no eixo de datas separa
              os rótulos e alonga a tendência. O anel é quadrado e não ganha
              nada em crescer, mas a tabela embaixo dele precisa de largura
              para o nome do responsável caber, e é isso que o terço garante.

              Grade de 6, e não de 3 (que daria a mesma proporção): 6 divide em
              meios e terços, então dá para reequilibrar a linha em passos de
              1/6 sem trocar a grade de novo. */}
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 lg:col-span-4">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              {/* items-start, e não items-center: com o subtítulo o bloco de
                  texto ficou mais alto que o par de botões, e centralizar
                  deixaria os botões flutuando na altura do meio em vez de
                  alinhados ao título. */}
              <div>
                <h3 className="text-sm font-semibold text-foreground">Resultado no período</h3>
                <p className="text-xs text-muted-foreground mt-0.5">A evolução dos seus negócios no período</p>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {/* Sem legenda aqui. As três séries continuam identificadas no
                    tooltip, que aparece ao passar o mouse e traz nome, cor e
                    valor de cada uma no ponto olhado -- mais informativo que a
                    legenda fixa, que dava só nome e cor. */}
                {/* Quantidade x Receita. Um par de botões e não um dropdown: são
                    só duas opções, e o dropdown esconderia metade da escolha
                    atrás de um clique. Assim as duas ficam visíveis e o estado
                    atual se lê sem abrir nada. */}
                <div className="inline-flex rounded-lg border border-card-border p-0.5 bg-[color:var(--neutral-100)]">
                  {([
                    { id: "quantidade", rotulo: "Quantidade" },
                    { id: "receita",    rotulo: "Receita" },
                  ] as const).map(op => (
                    <button
                      key={op.id}
                      onClick={() => setMetricaPeriodo(op.id)}
                      aria-pressed={metricaPeriodo === op.id}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        metricaPeriodo === op.id
                          ? "bg-card text-foreground shadow-elev-1"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {op.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {monthlyData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Nenhum dado no período selecionado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                {/* Área no lugar de linha: o preenchimento dá volume ao período e
                    é o que separa visualmente "novos" das outras duas séries, que
                    são recortes dentro dele.

                    As sombras (feDropShadow) que existiam aqui saíram: com o
                    degradê embaixo da curva elas viravam borrão, e cada filtro
                    custa um passe de rasterização por série. */}
                <LineChart data={monthlyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  {/* Grade tracejada e só horizontal: linha vertical em série
                      temporal não ajuda a ler valor, só polui. O traço 4 5 e a
                      cor são os do `LineChart` do material. */}
                  <CartesianGrid strokeDasharray="4 5" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} dy={4} />
                  {/* Em receita o eixo vai abreviado (R$ 12k) e mais largo; em
                      quantidade segue inteiro e sem decimal, que é o certo para
                      contagem de negócios. */}
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={metricaPeriodo === "receita" ? 62 : 44}
                    tickFormatter={metricaPeriodo === "receita" ? fmtCurto : undefined}
                  />
                  {/* No tooltip o valor vai por extenso: ali há espaço, e é onde
                      o número exato importa. */}
                  <Tooltip
                    content={
                      <TooltipSeries
                        cores={COR_DA_SERIE}
                        formatarValor={metricaPeriodo === "receita" ? fmt : undefined}
                      />
                    }
                  />
                  {areasDoPeriodo.map(a => (
                    <Line
                      key={a.chave}
                      type="monotone"
                      dataKey={metricaPeriodo === "receita" ? a.chaveValor : a.chave}
                      name={a.nome}
                      stroke={a.cor}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      /* Miolo branco com aro da série, como o material: sobre a
                         linha cheia um ponto sólido some, e o furo branco é o
                         que o faz aparecer. */
                      activeDot={{ r: 5, strokeWidth: 2.5, stroke: a.cor, fill: "#FFFFFF" }}
                      animationEasing="ease-out"
                      animationDuration={800}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <ResultadoResponsavelPanel dados={resultadoPorResponsavel} className="lg:col-span-2" />
          </div>

          {/* Os dois rankings de venda na mesma linha: o que se vendeu e quem
              vendeu. São as duas metades da mesma pergunta, e lado a lado dá
              para ver se a receita vem de um produto forte ou de uma pessoa
              forte. Meio a meio porque nenhum dos dois manda no outro. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RankingPanel
              titulo="Produtos mais vendidos"
              subtitulo="Os produtos mais vendidos na sua empresa"
              colunaNome="Produto"
              colunas={["Número de vendas", "Ticket médio", "Receita gerada"]}
              vazio="Nenhum produto cadastrado."
              linhas={topProducts.map(p => ({
                chave: p.name,
                /* Mesmo quadrado do cadastro em Configurações > Produtos: 32px,
                   canto arredondado, fundo no verde a 10% e o carrinho no verde
                   cheio. Repetir o desenho faz a linha daqui ser reconhecida
                   como o mesmo produto que se cadastrou lá.

                   Ícone, e não foto: produto não tem imagem no cadastro, então
                   este é o retrato que existe. */
                marca: (
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart size={14} className="text-primary" />
                  </span>
                ),
                nome: p.name,
                // Sem o SKU sob o nome (saiu em 20/09/2026, a pedido do dono):
                // ele é código de cadastro, e quem lê um ranking de vendas
                // reconhece o produto pelo NOME. A linha ficou de uma altura só.
                // O campo segue no cadastro do produto, em Configurações.
                valores: [
                  String(p.count),
                  /* Ticket médio POR VENDA deste produto: a receita dele
                     dividida pelas vendas dele. Não é o ticket médio por pessoa
                     que a lista de leads mostra -- lá a média é do cliente, que
                     pode ter comprado três produtos, e aqui é do produto, que
                     foi vendido para três clientes. */
                  p.count > 0 ? fmt(p.value / p.count) : "—",
                  p.value > 0 ? fmt(p.value) : "—",
                ],
                numeros: [p.count, p.count > 0 ? p.value / p.count : 0, p.value],
              }))}
            />

            <RankingPanel
              titulo="Responsáveis com mais vendas"
              subtitulo="Quem mais vendeu na sua empresa"
              colunaNome="Responsável"
              colunas={["Número de vendas", "Ticket médio", "Receita gerada"]}
              vazio="Nenhuma venda no período."
              linhas={agentPerformance
                .filter(a => a.won > 0)
                .map(a => ({
                  chave: a.name,
                  /* Foto quando existe, senão a inicial no círculo da cor do
                     membro -- o mesmo par que a lista de leads e o calendário
                     usam. A cor não é decoração: é a mesma que identifica a
                     pessoa nos outros painéis do dashboard. */
                  marca: memberAvatars[a.name] ? (
                    <img
                      src={memberAvatars[a.name]}
                      alt={a.name}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{ background: a.color, color: tintaSobre(a.color) }}
                    >
                      {a.name[0]?.toUpperCase() ?? "?"}
                    </span>
                  ),
                  nome: a.name,
                  sub: memberEmails[a.name] || undefined,
                  valores: [
                    String(a.won),
                    /* `avgTicket` já vem do `agentPerformance`: é receita
                       dividida por ganhos, e o memo é a mesma fonte que a aba
                       Time lê. */
                    a.avgTicket > 0 ? fmt(a.avgTicket) : "—",
                    a.totalValue > 0 ? fmt(a.totalValue) : "—",
                  ],
                  numeros: [a.won, a.avgTicket, a.totalValue],
                }))}
            />
          </div>

          {/* Três leituras de repartição na mesma linha: de onde vêm os leads,
              de onde vem a receita, e por que os negócios se perdem. Juntas
              porque respondem à mesma pergunta em momentos diferentes do funil,
              e comparar as três de relance é o que dá sentido a cada uma.

              Os dois de origem ocupam 3/5 da linha e o de perdas, 2/5. Perdas
              precisa de mais largura porque a tabela dele tem dois níveis: além
              da origem, os motivos recuados por baixo de cada uma.

              A grade tem 10 colunas, e não 5, para os 3/5 do par dividirem ao
              meio: 3 + 3 + 4. Em 5 colunas, um dos gêmeos ficaria com o dobro do
              outro, sugerindo uma importância que eles não têm um sobre o outro.

              OriginPanel devolve os dois cards num Fragment, então os três aqui
              são itens diretos da mesma grade e esticam juntos até a altura da
              linha. */}
          <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
            <OriginPanel periodLeads={periodLeads} className="lg:col-span-3" />

            <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 lg:col-span-4">
              <h3 className="text-sm font-semibold text-foreground">Motivo de perda por origem</h3>
              <p className="text-xs text-muted-foreground mt-0.5 mb-4">Onde você perde, e por quê</p>
              {/* Sem ramo de "vazio": período sem perda desenha o anel cinza com
                  zero no centro, que é a resposta. Escondê-lo fazia o painel sumir
                  e a página inteira pular de altura ao trocar o filtro de data.

                  `total` explícito mesmo com as fatias somando o total: os
                  motivos são cortados no top 3 por origem, e deixar o centro
                  somar sozinho o deixaria à mercê de qualquer corte futuro.

                  Mesmas cores por origem das duas rosquinhas ao lado, via
                  ORIGIN_COLORS. É o que permite seguir um canal com o olho pelos
                  três painéis da linha.

                  Anel menor que os 190px padrão: aqui a tabela tem dois níveis e
                  fica bem mais alta que as vizinhas. Com o anel no tamanho cheio,
                  o painel passava do dobro da altura dos outros dois da linha.

                  `empilhado` como nos dois vizinhos: anel em cima, tabela
                  embaixo. Lado a lado, o anel deixava uns 100px para a coluna de
                  nome, e os motivos, ainda recuados sob a origem, ficavam com
                  uns 84px -- "Cliente sem orçamento" virava reticências.
                  Embaixo, a tabela recebe a largura inteira do painel.

                  Dois anéis: as MESMAS perdas repartidas por origem e por
                  motivo. Somam o mesmo total de propósito, e é a divergência
                  entre os dois recortes que interessa. Clicar numa origem faz o
                  segundo mostrar os motivos daquela origem. */}
              <DonutDistribuicao
                dados={lossByOriginData.porOrigem}
                rotuloCentro={lostInPeriod.length === 1 ? "perdido" : "perdidos"}
                total={lostInPeriod.length}
                altura={150}
                colunas={{ valor: "Perdas", extras: ["% do total"] }}
                rodape="Por origem"
                anelSecundario={{ dados: lossByOriginData.porMotivo, rodape: "Por motivo" }}
                empilhado
              />
            </div>
          </div>

          <UtmAttributionPanel periodLeads={periodLeads} />

          {/* A curva do dia e o ranking das horas que fecham negócio. Lado a
              lado porque a curva mostra o formato do dia e o ranking diz onde
              agir nele; separados, cruzar os dois exigiria rolar a página.

              O ranking à esquerda e a curva à direita, invertido em relação à
              primeira linha do painel: dois blocos com o mesmo arranjo leem como
              repetição, e alternar o lado faz o olho reparar que a pergunta
              mudou (de QUEM para QUANDO).

              4/6 para a curva e 2/6 para o ranking, as mesmas proporções da
              primeira linha. Aqui embaixo do "Performance por UTM", que ocupa a
              largura inteira, a proporção não tem vizinha imediata para casar --
              ela se mantém porque é a leitura certa para um par curva/ranking, e
              porque repeti-la amarra as duas linhas de gráfico da aba. */}
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <HorariosPanel horas={rankingDoCiclo.horas} dias={rankingDoCiclo.dias} className="lg:col-span-2" />

          {/* Hourly results */}
          <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 lg:col-span-4">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Resultados por horário/dia</h3>
                {/* O subtítulo acompanha o seletor. Ele explica o eixo, e com o
                    texto fixo em "ao longo do dia" o painel diria uma coisa e o
                    gráfico mostraria outra assim que alguém trocasse para Dias. */}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cicloDoHorario === "horas"
                    ? "Como os negócios se distribuem ao longo do dia"
                    : "Como os negócios se distribuem ao longo da semana"}
                </p>
              </div>
              {/* Horas x Dias, no mesmo par de botões do "Quantidade/Receita" do
                  painel de cima. São duas opções, e um dropdown esconderia
                  metade da escolha atrás de um clique; aqui as duas ficam
                  visíveis e o estado atual se lê sem abrir nada.

                  É o único controle do cabeçalho. A legenda que ligava e
                  desligava Negócios/Ganhos/Perdidos saiu daqui: as três séries
                  continuam nomeadas no tooltip, com cor e valor no ponto olhado,
                  que é onde a identificação faz falta -- e o painel de cima já
                  desenha as mesmas três curvas sem legenda nenhuma. */}
              <div className="inline-flex rounded-lg border border-card-border p-0.5 bg-[color:var(--neutral-100)]">
                {([
                  { id: "dias",  rotulo: "Dias" },
                  { id: "horas", rotulo: "Horas" },
                ] as const).map(op => (
                  <button
                    key={op.id}
                    onClick={() => setCicloDoHorario(op.id)}
                    aria-pressed={cicloDoHorario === op.id}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      cicloDoHorario === op.id
                        ? "bg-card text-foreground shadow-elev-1"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {op.rotulo}
                  </button>
                ))}
              </div>
            </div>
            {/* Sem ramo de vazio: o gráfico é desenhado sempre, porque no
                período sem movimento entra o ciclo zerado e os eixos ficam de
                pé, como no "Resultado no período". */}
            <ResponsiveContainer width="100%" height={260}>
                {/* Mesmo tratamento do gráfico mensal. Sem <defs>: com a linha
                    pura não há mais degradê, e com ele foi embora a armadilha
                    dos ids repetidos (dois <linearGradient> com o mesmo id na
                    página fazem o segundo herdar o primeiro). */}
                <LineChart data={dadosDoCiclo} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 5" stroke="var(--border-default)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
                  <Tooltip content={<TooltipSeries cores={COR_DA_SERIE} />} />
                  {AREAS_NEGOCIOS.map(a => (
                    <Line
                      key={a.chave}
                      type="monotone"
                      dataKey={a.chave}
                      name={a.nome}
                      stroke={a.cor}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2.5, stroke: a.cor, fill: "#FFFFFF" }}
                      animationEasing="ease-out"
                      animationDuration={800}
                    />
                  ))}
                </LineChart>
            </ResponsiveContainer>
          </div>
          </div>

          <TagPerformancePanel periodLeads={periodLeads} crmTags={crmTags} />
        </TabsContent>

        {/* ──────────── MULTIATENDIMENTO ──────────── */}
        <TabsContent value="multiatendimento" className="space-y-4 mt-0">
          <MultiatendimentoPanel dateRange={dateRange} />
        </TabsContent>

        {/* ──────────── TIMES ──────────── */}
        <TabsContent value="times" className="space-y-4 mt-0">
          {/* KPIs do time */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(() => {
              const totalAgents = agentPerformance.length;
              const totalWon = agentPerformance.reduce((s, a) => s + a.won, 0);
              const totalLost = agentPerformance.reduce((s, a) => s + a.lost, 0);
              const totalRev = agentPerformance.reduce((s, a) => s + a.totalValue, 0);
              const closed = totalWon + totalLost;
              // Sem sparkline aqui de propósito: são métricas de retrato, tiradas
              // do período inteiro de uma vez. Não existe série mês a mês de
              // "atendentes ativos" ou de "conversão do time" para desenhar, e
              // inventar uma seria decorar o cartão com um dado que não existe.
              return [
                { label: "Atendentes ativos",   value: String(totalAgents), tom: "primary" as const },
                { label: "Vendas no período",   value: String(totalWon),    tom: "success" as const },
                { label: "Perdidos no período", value: String(totalLost),   tom: "danger" as const },
                { label: "Conversão do time",   value: closed > 0 ? `${(totalWon / closed * 100).toFixed(1)}%` : "—", tom: "amber" as const },
              ].map(k => (
                // Mesma escala dos cartões do topo da Performance geral, e sem
                // ícone como lá. O conteúdo fica como estava: são métricas de um
                // número só, sem dinheiro para destacar nem contagem para descer
                // à linha de apoio.
                <KpiCard key={k.label} label={k.label} value={k.value} tom={k.tom} />
              ));
            })()}
          </div>

          {/* Top SDR + Top Closer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top SDR */}
            <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Top SDR</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Agendamentos e conversão por usuário</p>
              </div>
              {/* A tabela é montada mesmo sem ninguém a listar, e o "não há
                  nada" desce para uma linha dentro dela -- o mesmo tratamento
                  dos rankings e do UTM. Trocar a tabela por uma frase solta
                  encolhia o cartão ao lado de um vizinho de altura cheia, e a
                  linha ficava com um painel inteiro de desnível. */}
                <TabelaDoPainel
                  linhas={activityStats.topSchedulers.map((u, i) => ({ ...u, rank: i }))}
                  chave={u => u.name}
                  vazio="Nenhuma reunião agendada no período."
                  inicial={{ coluna: "count", desc: true }}
                  colunas={[
                    { id: "nome", rotulo: "Usuário", alinhar: "esquerda", filtro: u => u.name },
                    { id: "count", rotulo: "Agendamentos", valor: u => u.count },
                    { id: "completed", rotulo: "Reuniões ocorridas", valor: u => u.completed },
                    { id: "convRate", rotulo: "Conversão", valor: u => u.convRate },
                  ]}
                  celulas={u => {
                    // A medalha segue o ranking original da linha, não a posição na tela.
                    const medal = MEDALHAS[u.rank] ?? VERDE_DEMAIS;
                    return (
                      <>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 tabular-nums" style={{ background: medal, color: tintaDaMedalha(medal) }}>{u.rank + 1}</span>
                        <span className="font-medium text-foreground truncate max-w-[100px]">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => setDrillDialog({ open: true, title: `Agendamentos — ${u.name}`, items: u.scheduledItems })} className="font-semibold text-foreground tabular-nums hover:underline cursor-pointer">{u.count}</button>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => setDrillDialog({ open: true, title: `Reuniões ocorridas — ${u.name}`, items: u.completedItems })} className="font-semibold text-success tabular-nums hover:underline cursor-pointer">{u.completed}</button>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums text-success">{u.convRate}%</td>
                      </>
                    );
                  }}
                />
            </div>

            {/* Top Closer */}
            <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Top Closer</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Reuniões realizadas e conversão em vendas</p>
              </div>
              {/* Mesmo tratamento do Top SDR ao lado. Ver o comentário lá. */}
                <TabelaDoPainel
                  linhas={activityStats.topCompleters.map((u, i) => ({ ...u, rank: i }))}
                  chave={u => u.name}
                  vazio="Nenhuma venda registrada no período."
                  inicial={{ coluna: "won", desc: true }}
                  colunas={[
                    { id: "nome", rotulo: "Usuário", alinhar: "esquerda", filtro: u => u.name },
                    { id: "count", rotulo: "Reuniões realizadas", valor: u => u.count },
                    { id: "won", rotulo: "Vendas", valor: u => u.won },
                    { id: "convRate", rotulo: "Conversão", valor: u => u.convRate },
                  ]}
                  celulas={u => {
                    // A medalha segue o ranking original da linha, não a posição na tela.
                    const medal = MEDALHAS[u.rank] ?? VERDE_DEMAIS;
                    return (
                      <>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 tabular-nums" style={{ background: medal, color: tintaDaMedalha(medal) }}>{u.rank + 1}</span>
                        <span className="font-medium text-foreground truncate max-w-[100px]">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => setDrillDialog({ open: true, title: `Reuniões realizadas — ${u.name}`, items: u.completedItems })} className="font-semibold text-foreground tabular-nums hover:underline cursor-pointer">{u.count}</button>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => setDrillDialog({ open: true, title: `Vendas — ${u.name}`, items: u.wonItems })} className="font-semibold text-success tabular-nums hover:underline cursor-pointer">{u.won}</button>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums text-success">{u.convRate}%</td>
                      </>
                    );
                  }}
                />
            </div>
          </div>

          <Dialog open={drillDialog.open} onOpenChange={o => setDrillDialog(d => ({ ...d, open: o }))}>
            <DialogContent className="max-w-md max-h-[70vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-sm">{drillDialog.title} ({drillDialog.items.length})</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto flex-1 -mx-6 px-6">
                {drillDialog.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">Nenhum item encontrado.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {drillDialog.items.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => { setDrillDialog(d => ({ ...d, open: false })); navigate(`/pipeline/lead/${item.leadId}`); }}
                        className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors rounded px-2 -mx-2"
                      >
                        <p className="text-sm text-foreground truncate">{item.leadName}</p>
                        <span className="text-xs text-muted-foreground shrink-0">{item.subtitle}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {(() => {
            const { meetings, completedMeetings, noShows } = activityStats;
            const conclusionRate = meetings > 0 ? Math.round(completedMeetings / meetings * 100) : 0;
            const noShowRate    = meetings > 0 ? Math.round(noShows / meetings * 100) : 0;

            // Tabela unificada por atendente
            const userMap = new Map<string, { scheduled: number; completed: number; noShow: number }>();
            allLeads.flatMap(l => l.activities.map(a => ({ ...a, leadResponsible: l.responsible ?? "" }))).forEach(a => {
              if (a.type !== "meeting") return;
              const d = new Date(a.date);
              if (d < periodCutoff || d > periodTo) return;
              const u = a.userName || a.leadResponsible || "Desconhecido";
              const cur = userMap.get(u) || { scheduled: 0, completed: 0, noShow: 0 };
              cur.scheduled++;
              if (a.completedAt) cur.completed++;
              if (a.noShowAt)    cur.noShow++;
              userMap.set(u, cur);
            });
            const userRows = [...userMap.entries()]
              .map(([name, s]) => ({ name, ...s, rate: s.scheduled > 0 ? Math.round(s.completed / s.scheduled * 100) : 0 }))
              .sort((a, b) => b.scheduled - a.scheduled);

            return (
              <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5">
                {/* Header. Era um `justify-between` com o aviso de vazio no
                    canto direito; sem ele sobrou um lado só, e a divisão em duas
                    caixas deixou de ter o que dividir. */}
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-foreground">Resultado acumulado no período</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Desempenho e conversão das reuniões agendadas</p>
                </div>

                {/* O corpo é montado sempre, e não só quando há reunião.
                    Antes, no período vazio, o painel virava título mais o aviso
                    "Nenhuma reunião no período" no canto -- os três números, a
                    barra e a tabela sumiam de uma vez, e o cartão encolhia a uma
                    tira de duas linhas no meio de vizinhos de altura cheia.

                    Zerado ele ainda informa: os KPIs mostram os zeros que são a
                    resposta certa para o período, e a tabela mantém as colunas
                    de pé, dizendo o que vai aparecer ali assim que houver
                    agendamento. O aviso do cabeçalho saiu porque a linha dentro
                    da tabela já diz a mesma coisa, e no lugar certo. */}
                    {/* KPIs */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {[
                        { label: "Agendadas", value: meetings, sub: "total no período", valueClass: "text-foreground" },
                        { label: "Realizadas", value: completedMeetings, sub: `${conclusionRate}% de conversão`, valueClass: "text-success" },
                        { label: "Não compareceu", value: noShows, sub: `${noShowRate}% de no-show`, valueClass: noShows > 0 ? "text-destructive" : "text-muted-foreground" },
                      ].map(k => (
                        <div key={k.label} className="bg-muted/40 rounded-lg px-4 py-3">
                          <p className="text-[12px] text-muted-foreground font-medium mb-1">{k.label}</p>
                          <p className={`text-2xl font-bold leading-none ${k.valueClass}`}>{k.value}</p>
                          <p className="text-[12px] text-muted-foreground mt-1">{k.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Barra de composição */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-1.5">
                        <span>Taxa de realização</span>
                        <span className="font-semibold text-foreground">{conclusionRate}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                        <div className="h-full bg-success transition-all" style={{ width: `${conclusionRate}%` }} />
                        {noShowRate > 0 && (
                          <div className="h-full bg-destructive transition-all" style={{ width: `${noShowRate}%` }} />
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-success inline-block" />Realizadas</span>
                        {noShowRate > 0 && <span className="flex items-center gap-1 text-[12px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-destructive inline-block" />Não compareceu</span>}
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-muted border border-card-border inline-block" />Pendente</span>
                      </div>
                    </div>

                    {/* Tabela por atendente */}
                      <TabelaDoPainel
                        linhas={userRows}
                        chave={u => u.name}
                        vazio="Nenhuma reunião agendada no período."
                        inicial={{ coluna: "scheduled", desc: true }}
                        colunas={[
                          { id: "nome", rotulo: "Atendente", alinhar: "esquerda", filtro: u => u.name },
                          { id: "scheduled", rotulo: "Agendadas", valor: u => u.scheduled },
                          { id: "completed", rotulo: "Realizadas", valor: u => u.completed },
                          { id: "noShow", rotulo: "No-show", valor: u => u.noShow },
                          { id: "rate", rotulo: "Taxa", valor: u => u.rate },
                        ]}
                        celulas={u => (
                          <>
                                <td className="px-3 py-2.5 font-medium text-foreground truncate max-w-[140px]">{u.name}</td>
                                <td className="px-3 py-2.5 text-center text-muted-foreground">{u.scheduled}</td>
                                <td className="px-3 py-2.5 text-center font-semibold text-success">{u.completed}</td>
                                <td className="px-3 py-2.5 text-center text-destructive">{u.noShow > 0 ? u.noShow : "—"}</td>
                                <td className="px-3 py-2.5 text-right">
                                  <span className={`font-bold tabular-nums ${u.rate >= 70 ? "text-success" : u.rate >= 40 ? "text-[color:var(--warning-fg)]" : "text-destructive"}`}>
                                    {u.rate}%
                                  </span>
                                </td>
                          </>
                        )}
                      />
              </div>
            );
          })()}

        </TabsContent>

        {/* ──────────── FUNIL ──────────── */}
        <TabsContent value="funil" className="space-y-4 mt-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Pipeline:</span>
            <Select value={funnelPipeline?.id ?? ""} onValueChange={setFunnelPipelineId}>
              <SelectTrigger className="w-[220px] h-9 bg-card border-card-border rounded-lg focus:ring-0 focus:ring-offset-0 focus:border-primary">
                <SelectValue placeholder="Selecionar pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {teamMembers.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">Responsável:</span>
                <Select value={funnelResponsible} onValueChange={setFunnelResponsible}>
                  <SelectTrigger className="w-[180px] h-9 bg-card border-card-border rounded-lg focus:ring-0 focus:ring-offset-0 focus:border-primary">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os usuários</SelectItem>
                    {teamMembers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          {!funnelPipeline ? (
            <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 text-center text-sm text-muted-foreground">Nenhum pipeline encontrado.</div>
          ) : funnelData.length === 0 ? (
            <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 text-center text-sm text-muted-foreground">Este pipeline não possui etapas.</div>
          ) : (() => {
            const maxCount = Math.max(...funnelData.map(d => d.count), 1);
            const firstCount = funnelData[0]?.count ?? 0;
            const pipelineResp = (l: typeof allLeads[number]) => {
              if (l.pipelineId !== funnelPipeline!.id) return false;
              if (funnelResponsible === "all") return true;
              const resps = l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
              return resps.includes(funnelResponsible);
            };
            const pLeads = allLeads.filter(l => {
              if (!pipelineResp(l)) return false;
              const d = parseEntryDate(l.entryDate);
              return d !== null && inPeriod(d);
            });
            // Ganhos/perdidos por data de atividade — consistente com KPIs da aba Negócios
            const pWon   = wonInPeriod.filter(pipelineResp);
            const pLost  = lostInPeriod.filter(pipelineResp);
            const pOpen  = pLeads.filter(l => !l.dealStatus || l.dealStatus === "open");
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Mesma hierarquia dos quatro cartões do topo da Performance
                      geral: o dinheiro no centro, em destaque, e a contagem de
                      negócios logo abaixo. Os rótulos são os mesmos nas duas
                      abas, e com as hierarquias trocadas o mesmo "Total em
                      vendas" respondia "quanto entrou" numa e "quantos negócios"
                      na outra.

                      `sufixo` porque o número de baixo precisa dizer de que ele
                      é contagem: os quatro contam negócios, em situações
                      diferentes. */}
                  <KpiCard label="Total de negócios" value={pLeads.length} sub={fmt(pLeads.reduce((s, l) => s + l.value, 0))} tom="primary" destaqueNoSub sufixo={pLeads.length === 1 ? "negócio" : "negócios"} />
                  <KpiCard label="Total em vendas"   value={pWon.length}   sub={fmt(pWon.reduce((s, l) => s + l.value, 0))}   tom="success" destaqueNoSub sufixo={pWon.length === 1 ? "negócio" : "negócios"} />
                  <KpiCard label="Total perdidos"    value={pLost.length}  sub={fmt(pLost.reduce((s, l) => s + l.value, 0))}  tom="danger"  destaqueNoSub sufixo={pLost.length === 1 ? "negócio" : "negócios"} />
                  <KpiCard label="Total em aberto"   value={pOpen.length}  sub={fmt(pOpen.reduce((s, l) => s + l.value, 0))}  tom="amber"   destaqueNoSub sufixo={pOpen.length === 1 ? "negócio" : "negócios"} />
                  {/* O quinto fica na hierarquia inversa, e é o certo para ele:
                      não tem dinheiro para destacar, e a taxa é a resposta. Com
                      a escala unificada isso não abre diferença visual na
                      fileira -- muda o que ocupa o centro, não o tamanho. */}
                  <KpiCard
                    label="Conversão do funil"
                    value={firstCount > 0 ? `${((pWon.length / firstCount) * 100).toFixed(1)}%` : "—"}
                    sub={`${pWon.length} ganhos de ${firstCount} ${firstCount === 1 ? "negócio" : "negócios"}`}
                    tom="success"
                  />
                </div>

                <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1">Leads por etapa no período</h3>
                  <p className="text-xs text-muted-foreground mb-4">Quantos negócios passaram por cada etapa</p>
                  {(() => {
                    const chartData = [
                      ...funnelData.map((row) => ({
                        name: row.stage.title,
                        leads: row.count,
                        stageId: row.stage.id,
                        color: row.stage.color || "hsl(var(--primary))",
                        isGanhos: false,
                      })),
                      {
                        name: "Ganhos",
                        leads: pWon.length,
                        stageId: "ganhos",
                        color: "#008762",
                        isGanhos: true,
                      },
                    ];

                    return (
                      /* Funil no lugar das barras. As barras respondiam "quanto
                         tem em cada etapa"; o funil responde a mesma coisa E
                         mostra o estreitamento entre elas, que é a leitura que
                         interessa num pipeline.

                         `orientation="horizontal"` é o que corre da esquerda
                         para a direita: no componente o nome descreve o EIXO em
                         que as etapas se enfileiram, não o formato de cada uma.

                         Altura fixa de 300px, a mesma do gráfico anterior, para
                         a troca não mexer na altura do painel. Ela também anula
                         o `aspectRatio` que o componente aplica sozinho, que num
                         painel largo deixaria o funil desproporcional. */
                      <FunnelChart
                        data={chartData.map(d => ({
                          label: d.name,
                          value: d.leads,
                          displayValue: String(d.leads),
                          color: d.color,
                        }))}
                        orientation="horizontal"
                        edges="curved"
                        layers={3}
                        style={{ height: 300, aspectRatio: "auto" }}
                      />
                    );
                  })()}
                </div>

                {/* Conversion table */}
                <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Tabela de conversão</h3>
                  {/* A etapa abre na ordem do pipeline e volta a ela pelo cabeçalho
                      "Etapa"; as colunas de número ordenam. "Conv. etapa anterior" é
                      calculada ANTES de ordenar, contra a etapa anterior do pipeline, então
                      não muda de sentido quando a linha troca de lugar na tela.

                      Ganhos e Perdidos ficam presos no pé: são o desfecho do funil, não
                      mais uma etapa dele. */}
                  <TabelaDoPainel
                    linhas={funnelData.map((row, i) => {
                      const prev = funnelData[i - 1];
                      return {
                        ...row,
                        posicao: i,
                        convAnterior: prev && prev.count > 0 ? (row.count / prev.count) * 100 : null,
                        convTotal: firstCount > 0 ? (row.count / firstCount) * 100 : null,
                      };
                    })}
                    chave={row => row.stage.id}
                    inicial={{ coluna: "etapa", desc: false }}
                    colunas={[
                      { id: "etapa", rotulo: "Etapa", alinhar: "esquerda", valor: r => r.posicao, primeiroCrescente: true },
                      { id: "count", rotulo: "Leads entraram", valor: r => r.count },
                      { id: "convAnterior", rotulo: "Conv. etapa anterior", valor: r => r.convAnterior ?? -1 },
                      { id: "convTotal", rotulo: "Conv. desde o início", valor: r => r.convTotal ?? -1 },
                    ]}
                    celulas={row => (
                      <>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.stage.color || "hsl(var(--primary))" }} />
                            <span className="font-medium text-foreground">{row.stage.title}</span>
                          </div>
                        </td>
                        <td className="text-center py-2.5 px-3 tabular-nums font-semibold text-foreground">{row.count}</td>
                        <td className="text-center py-2.5 px-3 tabular-nums text-muted-foreground">{row.convAnterior !== null ? `${row.convAnterior.toFixed(1)}%` : "—"}</td>
                        <td className="text-center py-2.5 px-3 tabular-nums font-medium text-foreground">{row.convTotal !== null ? `${row.convTotal.toFixed(1)}%` : "—"}</td>
                      </>
                    )}
                    pe={(() => {
                      const wonPct = firstCount > 0 ? `${((pWon.length / firstCount) * 100).toFixed(1)}%` : "—";
                      const lostPct = firstCount > 0 ? `${((pLost.length / firstCount) * 100).toFixed(1)}%` : "—";
                      return (
                        <>
                          <tr className={`${LINHA_CORPO} ${LINHA_PE}`}>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-success" />
                                <span className="font-medium text-success">Ganhos</span>
                              </div>
                            </td>
                            <td className="text-center py-2.5 px-3 tabular-nums font-semibold text-success">{pWon.length}</td>
                            <td className="text-center py-2.5 px-3 text-muted-foreground">—</td>
                            <td className="text-center py-2.5 px-3 tabular-nums font-medium text-success">{wonPct}</td>
                          </tr>
                          <tr className={LINHA_CORPO}>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-destructive" />
                                <span className="font-medium text-destructive">Perdidos</span>
                              </div>
                            </td>
                            <td className="text-center py-2.5 px-3 tabular-nums font-semibold text-destructive">{pLost.length}</td>
                            <td className="text-center py-2.5 px-3 text-muted-foreground">—</td>
                            <td className="text-center py-2.5 px-3 tabular-nums font-medium text-destructive">{lostPct}</td>
                          </tr>
                        </>
                      );
                    })()}
                  />
                </div>

              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
