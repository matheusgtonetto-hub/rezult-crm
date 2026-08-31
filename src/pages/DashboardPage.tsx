import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCRM } from "@/context/CRMContext";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  Users, ArrowDown, AlertTriangle, ShoppingCart,
  Activity as ActivityIcon, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DashboardSidebar, ROTULO_DA_VISAO, type VisaoDoDashboard } from "@/components/dashboard/DashboardSidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DonutDistribuicao } from "@/components/dashboard/DonutDistribuicao";
import { OriginPanel } from "@/components/dashboard/OriginPanel";
import { UtmAttributionPanel } from "@/components/dashboard/UtmAttributionPanel";
import { TagPerformancePanel } from "@/components/dashboard/TagPerformancePanel";
import { ResultadoResponsavelPanel } from "@/components/dashboard/ResultadoResponsavelPanel";
import { HorariosPanel } from "@/components/dashboard/HorariosPanel";
import { TooltipSeries } from "@/components/dashboard/CaixaTooltip";
import { RankingPanel } from "@/components/dashboard/RankingPanel";
import { MultiatendimentoPanel } from "@/components/dashboard/MultiatendimentoPanel";
import { fmt, parseEntryDate, tooltip, usePriorPeriod, variacao, meioDoPeriodo, ORIGIN_COLORS, PALETA } from "@/components/dashboard/useDashboardHelpers";


/**
 * As três séries da aba Negócios, numa fonte só.
 *
 * Elas apareciam repetidas em seis lugares: as duas legendas e os dois gráficos,
 * cada um com nome, cor e chave escritos à mão. Bastava alguém trocar uma cor
 * num deles para a legenda passar a mentir sobre a curva.
 *
 * `cor` é hexadecimal, e não token do tema, porque quem pinta é o SVG do
 * Recharts, que não resolve `hsl(var(--primary))`. Os valores são os mesmos dos
 * tokens: primária, sucesso e destrutiva.
 */
const AREAS_NEGOCIOS = [
  // `chave` é a contagem; `chaveValor` é o dinheiro do mesmo recorte. O botão
  // Quantidade/Receita só troca qual das duas o gráfico lê.
  // "Negócios", e não "Novos": os três nomes aparecem juntos na legenda e no
  // tooltip, e "Novos" sozinho não dizia novos O QUÊ. Os outros dois já são
  // situações do negócio, então nomear a entrada pelo objeto fecha a frase.
  { chave: "novos",    chaveValor: "novosValor",    nome: "Negócios", cor: "#128A68", id: "area-novos" },
  { chave: "ganhos",   chaveValor: "ganhosValor",   nome: "Ganhos",   cor: "#10B981", id: "area-ganhos" },
  { chave: "perdidos", chaveValor: "perdidosValor", nome: "Perdidos", cor: "#EF4444", id: "area-perdidos" },
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
   * Subiu para um estado da página porque quem escolhe agora é a barra lateral,
   * fora da árvore do `Tabs`. Antes o próprio `Tabs` guardava isso por dentro,
   * com `defaultValue`, e a lista de abas ficava logo ali do lado.
   */
  const [visao, setVisao] = useState<VisaoDoDashboard>("negocios");

  /**
   * Barra aberta ou recolhida, com a escolha guardada no navegador.
   *
   * Chave própria (`dashboard-sidebar-open`), separada da de `/pipeline`: são
   * duas barras diferentes, e quem recolhe uma para ver o board largo não está
   * pedindo a mesma coisa aqui.
   *
   * Nasce fechada abaixo de 768px, onde 240px seriam um terço da tela.
   *
   * `try/catch` porque `localStorage` levanta exceção em janela anônima de
   * alguns navegadores, e uma preferência de layout não pode derrubar a tela.
   */
  const LARGURA_DA_BARRA = 240;
  const [barraAberta, setBarraAberta] = useState(() => {
    if (window.innerWidth < 768) return false;
    try {
      const salvo = localStorage.getItem("dashboard-sidebar-open");
      return salvo === null ? true : salvo === "true";
    } catch { return true; }
  });

  const alternarBarra = useCallback(() => {
    setBarraAberta(atual => {
      const proxima = !atual;
      try { localStorage.setItem("dashboard-sidebar-open", String(proxima)); } catch { /* ignora */ }
      return proxima;
    });
  }, []);

  // Atalho "[", o mesmo de `/pipeline`. Ignorado dentro de campo de texto, onde
  // o colchete é o caractere que a pessoa quis digitar.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "[" && tag !== "INPUT" && tag !== "TEXTAREA") alternarBarra();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alternarBarra]);

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
      wonInPeriod: w, lostInPeriod: lo, revenueInPeriod: w.reduce((s, l) => s + l.value, 0),
      wonPrior: wp, lostPrior: lp, revenuePrior: wp.reduce((s, l) => s + l.value, 0),
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
          const cur = map.get(key) || { key, mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0 };
          cur.novos++; cur.novosValor += lead.value;
          map.set(key, cur);
        }
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (d < periodCutoff || d > periodTo) return;
          const h = d.getHours();
          const key = String(h).padStart(2, "0");
          const cur = map.get(key) || { key, mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0 };
          if (act.type === "won") { cur.ganhos++; cur.ganhosValor += lead.value; }
          if (act.type === "lost") { cur.perdidos++; cur.perdidosValor += lead.value; }
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

      const cursor = new Date(periodCutoff);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= displayEnd) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        map.set(key, { key, mes: `${cursor.getDate()}/${cursor.getMonth() + 1}`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0 });
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
          if (act.type === "won") { bucket.ganhos++; bucket.ganhosValor += lead.value; }
          if (act.type === "lost") { bucket.perdidos++; bucket.perdidosValor += lead.value; }
        });
      });

    } else {
      // ── MESES: sempre 12 buckets mensais ──
      const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const cursor = new Date(periodCutoff);
      cursor.setDate(1);
      for (let i = 0; i < 12; i++) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, { key, mes: `${monthNames[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, novos: 0, ganhos: 0, perdidos: 0, novosValor: 0, ganhosValor: 0, perdidosValor: 0 });
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
          if (act.type === "won") { bucket.ganhos++; bucket.ganhosValor += lead.value; }
          if (act.type === "lost") { bucket.perdidos++; bucket.perdidosValor += lead.value; }
        });
      });
    }

    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
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
      lead.activities.forEach(act => {
        const d = new Date(act.date);
        if (d < periodCutoff || d > periodTo) return;
        if (act.type === "won") contar(d, "ganhos");
        if (act.type === "lost") contar(d, "perdidos");
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
            ? [...topo, { nome: "Outros motivos", valor: resto, extras: [fatia(resto)], cor: "#94A3B8" }]
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
      const totalValue = won.reduce((s, l) => s + l.value, 0);
      const closed = won.length + lost;
      return {
        name: m,
        total: ml.length,
        won: won.length,
        lost,
        convRate: closed > 0 ? (won.length / closed * 100).toFixed(0) : "—",
        totalValue,
        avgTicket: won.length > 0 ? totalValue / won.length : 0,
        color: memberColors[m] || "#888",
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
          cor: a.color,
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
      return { name: m, value, color: memberColors[m] || "#888" };
    }).filter(d => d.value > 0);
  }, [periodLeads, teamMembers, memberColors, donutMode]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; count: number; value: number }>();
    products.forEach(p => map.set(p.id, { name: p.name, sku: p.sku, count: 0, value: 0 }));
    wonInPeriod.forEach(l => {
      if (!l.productId || !map.has(l.productId)) return;
      const cur = map.get(l.productId)!;
      cur.count++; cur.value += l.value;
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
      const leadDetails = [...entered].map(id => ({
        id,
        name: leads[id]?.name ?? "Lead removido",
        responsible: leads[id]?.responsible ?? "",
      }));
      const wonCount = [...entered].filter(id => leads[id]?.dealStatus === "won").length;
      return { stage, count: entered.size, wonCount, leadDetails };
    });
  }, [funnelPipeline, allLeads, leads, dateRange, funnelResponsible]);

  const periodLabel = `${dateRange.from.toLocaleDateString("pt-BR")} – ${dateRange.to.toLocaleDateString("pt-BR")}`;

  const [expandedStage, setExpandedStage] = useState<string | null>(null);
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
    // Valores arbitrários porque nenhum dos dois existe na escala do Tailwind,
    // que pula de 24 (p-6) para 32 (p-8) e de 36 (p-9) para 40... o 40 até
    // existe (p-10), mas fica escrito assim para os dois lados da assimetria
    // serem lidos na mesma unidade.
    //
    // O topo tem 40px e os outros três lados, 30px. A assimetria é de propósito:
    // acima do "Dashboard" não há nada, e o respiro maior separa a página da
    // barra do navegador. Nas laterais e embaixo, 30px já bastam porque ali o
    // limite é a sidebar ou o fim do conteúdo.
    //
    // Escrito lado a lado, e não como `p-[30px] pt-[50px]`: naquela forma quem
    // vence depende da ordem em que o Tailwind emite as regras, que é detalhe
    // interno dele e não algo para o layout depender.
    //
    // max-w-7xl é 1280px, o teto padrão do Tailwind. Deixa 1220px de área útil
    // depois do padding, e é dela que saem as larguras dos painéis: os quatro
    // cartões do topo ficam com ~296px cada e as duas rosquinhas de Origem com
    // ~594px por coluna.
    // Barra lateral e conteúdo lado a lado.
    //
    // A barra é `sticky` em vez de ter rolagem própria: quem rola é o `<main>`
    // do AppLayout, e dar uma segunda área rolável aqui criaria duas barras de
    // rolagem na mesma tela. Assim ela fica parada enquanto o painel passa.
    //
    // O `max-w-7xl` saiu daqui e foi para a coluna do conteúdo: no contêiner de
    // fora ele limitaria a barra e o painel juntos, e o painel perderia 240px de
    // largura -- justo ele, que é onde os gráficos moram.
    // `font-inter` numa raiz só, e não painel a painel: font-family é herdada,
    // então uma declaração aqui alcança título, rótulo, tabela e também o texto
    // dos gráficos, que é SVG e herda a fonte do CSS como qualquer outro nó.
    //
    // O resto do app segue na Geist (`font-sans`, no <body>). A troca alcança
    // tudo aqui dentro porque nenhum descendente redeclara a família: quem fazia
    // isso era o `font-mono` dos parâmetros de UTM, e ele saiu de lá -- herança
    // não vence uma declaração explícita, e aquele trecho ficaria em Geist Mono
    // no meio da página inteira em Inter.
    <div className="flex font-inter">
      {/* A faixa que encolhe é a de FORA; a barra dentro dela mantém os 240px e
          desliza para fora do recorte. Animar a largura da própria barra
          espremeria os rótulos durante a transição. */}
      <div
        className="sticky top-0 h-screen shrink-0 overflow-hidden"
        style={{ width: barraAberta ? LARGURA_DA_BARRA : 0, transition: "width 300ms ease" }}
      >
        <div style={{ width: LARGURA_DA_BARRA, height: "100%" }}>
          <DashboardSidebar ativa={visao} aoEscolher={setVisao} />
        </div>
      </div>

      {/* Puxador colado na borda da barra, que anda junto com ela.

          `sticky` com `top-[30px]`, e não `absolute`: a página inteira rola
          dentro do `<main>`, e no `absolute` ele subiria junto com o conteúdo e
          sumiria da tela na primeira rolagem.

          `h-0` no invólucro para ele não ocupar linha nenhuma no flex -- o botão
          é desenhado para fora, por cima da divisa entre a barra e o painel. */}
      <div className="sticky top-[30px] h-0 z-20 shrink-0">
        <button
          type="button"
          onClick={alternarBarra}
          title={barraAberta ? "Fechar a barra ( [ )" : "Mostrar as visões ( [ )"}
          aria-label={barraAberta ? "Fechar a barra de visões" : "Mostrar a barra de visões"}
          aria-expanded={barraAberta}
          className="w-4 h-8 rounded-r-md bg-primary/60 text-white flex items-center justify-center shadow-sm hover:bg-primary/80 transition-colors"
        >
          {barraAberta ? <ChevronLeft size={11} /> : <ChevronRight size={11} />}
        </button>
      </div>

      <div className="flex-1 min-w-0 pt-[40px] px-[30px] pb-[30px] max-w-7xl mx-auto">
      <Tabs value={visao} onValueChange={v => setVisao(v as VisaoDoDashboard)} className="space-y-6">
      {/* Header */}
      {/* items-start, e não items-center: com o subtítulo, o bloco de título
          ficou mais alto que as abas, e centralizar deixaria as abas flutuando
          na altura do meio em vez de alinhadas ao "Dashboard". */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {/* 23px é valor arbitrário: a escala do Tailwind pula de 20 (text-xl)
              para 24 (text-2xl). */}
          {/* O título é o rótulo da visão escolhida na barra, e nada além dele.
              Fixo, as outras três visões exibiriam um título que não é o delas.

              Saiu o "dashboard" que vinha no fim: com rótulos de uma palavra ele
              completava a frase, mas os nomes cresceram e "Resultado por
              pipeline dashboard" empilha três substantivos sem dizer nada a mais
              -- a pessoa já sabe que está no dashboard, chegou por ele. */}
          <h1 className="text-[23px] font-semibold text-foreground">{ROTULO_DA_VISAO[visao]}</h1>
          {/* No lugar do subtítulo fixo ("Desempenho geral do seu negócio"),
              o período que está filtrando. Aquela frase valia para qualquer
              conta em qualquer dia; esta responde a pergunta que a pessoa
              realmente traz ao olhar um número: "de quando é isso?".

              14px, e não os 12px dos subtítulos de painel: acompanha o título da
              página, que é maior. */}
          <p className="text-sm text-muted-foreground mt-0.5">{periodoPorExtenso}</p>
        </div>
        {/* Sem a fileira de abas, que virou a barra lateral. Sobra o seletor de
            período, que vale para as quatro visões. */}
        <DateRangePicker value={dateRange} onChange={setDateRange} dataFrom={dataFrom} dataTo={dataTo} />
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
                  value: periodLeads.length,
                  sub: fmt(periodLeads.reduce((s, l) => s + l.value, 0)),
                  delta: compara(periodLeads, priorPeriodLeads, porEntrada),
                  tom: "primary" as const,
                },
                {
                  label: "Total em vendas",
                  value: wonInPeriod.length,
                  sub: fmt(wonInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: compara(wonInPeriod, wonPrior, porFechamento("won")),
                  tom: "success" as const,
                },
                {
                  label: "Total perdidos",
                  value: lostInPeriod.length,
                  sub: fmt(lostInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: compara(lostInPeriod, lostPrior, porFechamento("lost")),
                  tom: "danger" as const,
                },
                {
                  label: "Total em aberto",
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
          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 lg:col-span-4">
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
                <div className="inline-flex rounded-lg border border-card-border p-0.5 bg-muted/40">
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
                <AreaChart data={monthlyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    {areasDoPeriodo.map(a => (
                      <linearGradient key={a.id} id={a.id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={a.cor} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={a.cor} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  {/* Grade pontilhada e só horizontal: linha vertical em série
                      temporal não ajuda a ler valor, só polui. */}
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
                  {/* Em receita o eixo vai abreviado (R$ 12k) e mais largo; em
                      quantidade segue inteiro e sem decimal, que é o certo para
                      contagem de negócios. */}
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
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
                    <Area
                      key={a.chave}
                      type="monotone"
                      dataKey={metricaPeriodo === "receita" ? a.chaveValor : a.chave}
                      name={a.nome}
                      stroke={a.cor}
                      strokeWidth={2}
                      fill={`url(#${a.id})`}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                      animationEasing="ease-out"
                      animationDuration={800}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <ResultadoResponsavelPanel dados={resultadoPorResponsavel} className="lg:col-span-2" />
          </div>

          {/* A curva do dia e o ranking das horas que fecham negócio. Lado a
              lado porque a curva mostra o formato do dia e o ranking diz onde
              agir nele; separados, cruzar os dois exigiria rolar a página.

              O ranking à esquerda, ao contrário do anel da linha de cima, que
              fica à direita. O zigue-zague é de propósito: dois blocos com o
              mesmo arranjo um sobre o outro leem como repetição, e alternar o
              lado faz o olho reparar que a pergunta mudou (de QUEM para
              QUANDO).

              4/6 para a curva e 2/6 para o ranking, as mesmas proporções da
              linha de cima, para as duas se lerem como um par. */}
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <HorariosPanel horas={rankingDoCiclo.horas} dias={rankingDoCiclo.dias} className="lg:col-span-2" />

          {/* Hourly results */}
          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 lg:col-span-4">
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
              <div className="inline-flex rounded-lg border border-card-border p-0.5 bg-muted/40">
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
                {/* Mesmo tratamento do gráfico mensal. Os gradientes têm ids
                    próprios (sufixo -h): dois <linearGradient> com o mesmo id na
                    página fazem o segundo herdar o primeiro. */}
                <AreaChart data={dadosDoCiclo} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    {AREAS_NEGOCIOS.map(a => (
                      <linearGradient key={a.id} id={`${a.id}-h`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={a.cor} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={a.cor} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
                  <Tooltip content={<TooltipSeries cores={COR_DA_SERIE} />} />
                  {AREAS_NEGOCIOS.map(a => (
                    <Area
                      key={a.chave}
                      type="monotone"
                      dataKey={a.chave}
                      name={a.nome}
                      stroke={a.cor}
                      strokeWidth={2}
                      fill={`url(#${a.id}-h)`}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
                      animationEasing="ease-out"
                      animationDuration={800}
                    />
                  ))}
                </AreaChart>
            </ResponsiveContainer>
          </div>
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

            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 lg:col-span-4">
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
                sub: p.sku ? `SKU: ${p.sku}` : undefined,
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
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                      style={{ background: a.color }}
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
                }))}
            />
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
            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Top SDR</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Agendamentos e conversão por usuário</p>
              </div>
              {/* A tabela é montada mesmo sem ninguém a listar, e o "não há
                  nada" desce para uma linha dentro dela -- o mesmo tratamento
                  dos rankings e do UTM. Trocar a tabela por uma frase solta
                  encolhia o cartão ao lado de um vizinho de altura cheia, e a
                  linha ficava com um painel inteiro de desnível. */}
                <div className="border border-card-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    {/* Faixa verde do "Performance por UTM": --primary chapado,
                        texto branco, e as réguas entre colunas em branco a 20%.

                        Sem `border-b`: a troca de cor entre a faixa e o corpo
                        branco já é a divisa, e o traço cinza que estava aqui
                        sujava a banda por baixo. Os cantos são recortados pelo
                        `overflow-hidden` da moldura, que já existia. */}
                    <thead>
                      <tr className="bg-primary [&>th]:border-r [&>th]:border-white/20 [&>th:last-child]:border-r-0">
                        <th className="text-left px-3 py-2 font-semibold text-white">Usuário</th>
                        <th className="text-center px-3 py-2 font-semibold text-white">Agendamentos</th>
                        <th className="text-center px-3 py-2 font-semibold text-white">Reuniões ocorridas</th>
                        <th className="text-center px-3 py-2 font-semibold text-white">Conversão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {activityStats.topSchedulers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                            Nenhuma reunião agendada no período.
                          </td>
                        </tr>
                      )}
                      {activityStats.topSchedulers.map((u, i) => {
                        const medal = i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-600" : "bg-muted-foreground/40";
                        return (
                          <tr key={u.name} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 border-r border-card-border">
                              <div className="flex items-center gap-2">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${medal}`}>{i + 1}</span>
                                <span className="font-medium text-foreground truncate max-w-[100px]">{u.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center border-r border-card-border">
                              <button onClick={() => setDrillDialog({ open: true, title: `Agendamentos — ${u.name}`, items: u.scheduledItems })} className="font-semibold text-foreground tabular-nums hover:underline cursor-pointer">{u.count}</button>
                            </td>
                            <td className="px-3 py-2.5 text-center border-r border-card-border">
                              <button onClick={() => setDrillDialog({ open: true, title: `Reuniões ocorridas — ${u.name}`, items: u.completedItems })} className="font-semibold text-success tabular-nums hover:underline cursor-pointer">{u.completed}</button>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold tabular-nums text-success">{u.convRate}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
            </div>

            {/* Top Closer */}
            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Top Closer</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Reuniões realizadas e conversão em vendas</p>
              </div>
              {/* Mesmo tratamento do Top SDR ao lado. Ver o comentário lá. */}
                <div className="border border-card-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    {/* Mesma faixa verde do Top SDR ao lado. Ver o comentário
                        lá: os dois ficam lado a lado na mesma linha, e qualquer
                        diferença de tratamento entre eles lê como desalinho. */}
                    <thead>
                      <tr className="bg-primary [&>th]:border-r [&>th]:border-white/20 [&>th:last-child]:border-r-0">
                        <th className="text-left px-3 py-2 font-semibold text-white">Usuário</th>
                        <th className="text-center px-3 py-2 font-semibold text-white">Reuniões Realizadas</th>
                        <th className="text-center px-3 py-2 font-semibold text-white">Vendas</th>
                        <th className="text-center px-3 py-2 font-semibold text-white">Conversão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {activityStats.topCompleters.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                            Nenhuma venda registrada no período.
                          </td>
                        </tr>
                      )}
                      {activityStats.topCompleters.map((u, i) => {
                        const medal = i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-600" : "bg-muted-foreground/40";
                        return (
                          <tr key={u.name} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 border-r border-card-border">
                              <div className="flex items-center gap-2">
                                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${medal}`}>{i + 1}</span>
                                <span className="font-medium text-foreground truncate max-w-[100px]">{u.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center border-r border-card-border">
                              <button onClick={() => setDrillDialog({ open: true, title: `Reuniões realizadas — ${u.name}`, items: u.completedItems })} className="font-semibold text-foreground tabular-nums hover:underline cursor-pointer">{u.count}</button>
                            </td>
                            <td className="px-3 py-2.5 text-center border-r border-card-border">
                              <button onClick={() => setDrillDialog({ open: true, title: `Vendas — ${u.name}`, items: u.wonItems })} className="font-semibold text-success tabular-nums hover:underline cursor-pointer">{u.won}</button>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold tabular-nums text-success">{u.convRate}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
              <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
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
                          <p className="text-[11px] text-muted-foreground font-medium mb-1">{k.label}</p>
                          <p className={`text-2xl font-bold leading-none ${k.valueClass}`}>{k.value}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">{k.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Barra de composição */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
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
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-success inline-block" />Realizadas</span>
                        {noShowRate > 0 && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-destructive inline-block" />Não compareceu</span>}
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-muted border border-card-border inline-block" />Pendente</span>
                      </div>
                    </div>

                    {/* Tabela por atendente */}
                      <div className="border border-card-border rounded-lg overflow-hidden">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/40 border-b border-card-border">
                              <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Atendente</th>
                              <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Agendadas</th>
                              <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Realizadas</th>
                              <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">No-show</th>
                              <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Taxa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-card-border">
                            {userRows.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                                  Nenhuma reunião agendada no período.
                                </td>
                              </tr>
                            )}
                            {userRows.map(u => (
                              <tr key={u.name} className="hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2.5 font-medium text-foreground truncate max-w-[140px] border-r border-card-border">{u.name}</td>
                                <td className="px-3 py-2.5 text-center text-muted-foreground border-r border-card-border">{u.scheduled}</td>
                                <td className="px-3 py-2.5 text-center font-semibold text-success border-r border-card-border">{u.completed}</td>
                                <td className="px-3 py-2.5 text-center text-destructive border-r border-card-border">{u.noShow > 0 ? u.noShow : "—"}</td>
                                <td className="px-3 py-2.5 text-right">
                                  <span className={`font-bold tabular-nums ${u.rate >= 70 ? "text-success" : u.rate >= 40 ? "text-yellow-500" : "text-destructive"}`}>
                                    {u.rate}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 text-center text-sm text-muted-foreground">Nenhum pipeline encontrado.</div>
          ) : funnelData.length === 0 ? (
            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 text-center text-sm text-muted-foreground">Este pipeline não possui etapas.</div>
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

                <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1">Leads por etapa no período</h3>
                  <p className="text-xs text-muted-foreground mb-4">Clique em uma barra para ver os leads</p>
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
                        color: "#10B981",
                        isGanhos: true,
                      },
                    ];

                    // x e y sao `number | string` desde o Recharts 3. Vao direto
                    // para o translate() do SVG, que aceita os dois.
                    const renderTick = (props: { x: number | string; y: number | string; payload?: { value?: unknown }; index: number }) => {
                      const { x, y, payload, index } = props;
                      const entry = chartData[index];
                      const countLabel = entry?.isGanhos ? pWon.length : (funnelData[index]?.count ?? 0);
                      const isGanhos = entry?.isGanhos;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} dy={14} textAnchor="middle" fill={isGanhos ? "#10B981" : "hsl(var(--muted-foreground))"} fontSize={11} fontWeight={isGanhos ? "600" : "400"}>
                            {String(payload?.value ?? "")}
                          </text>
                          <text x={0} y={0} dy={30} textAnchor="middle" fill={isGanhos ? "#10B981" : "hsl(var(--foreground))"} fontSize={13} fontWeight="bold">
                            {countLabel}
                          </text>
                        </g>
                      );
                    };

                    const renderConvLabel = (props: { x: number; y: number; width: number; height: number; value: number }) => {
                      const { x, y, width, height, value } = props;
                      if (!value || Number(height) < 26) return null;
                      return (
                        <text
                          x={Number(x) + Number(width) / 2}
                          y={Number(y) + Number(height) / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize={11}
                          fontWeight="600"
                        >
                          {value}
                        </text>
                      );
                    };

                    return (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={chartData}
                          margin={{ bottom: 20 }}
                          onClick={e => {
                            // O Recharts 3 tirou activePayload do tipo do evento e
                            // expoe activeIndex. Sai melhor: em vez de cavar
                            // payload[0].payload, le direto a barra clicada em
                            // chartData, que e a mesma fonte que alimenta o grafico.
                            const i = Number(e?.activeIndex);
                            const id = Number.isInteger(i) ? chartData[i]?.stageId : undefined;
                            if (id) setExpandedStage(prev => prev === id ? null : id);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" vertical={false} />
                          <XAxis dataKey="name" tick={renderTick} axisLine={false} tickLine={false} height={48} />
                          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
                          <Tooltip
                            contentStyle={tooltip}
                            cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
                            formatter={(v: number) => [`${v} lead${v !== 1 ? "s" : ""}`, "Leads"]}
                          />
                          <Bar dataKey="leads" radius={[6, 6, 0, 0]} maxBarSize={56}>
                            {chartData.map((entry, i) => (
                              <Cell
                                key={i}
                                fill={entry.color}
                                opacity={expandedStage && expandedStage !== entry.stageId ? 0.35 : 1}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}

                  {/* Lead list for selected stage */}
                  {expandedStage && (() => {
                    const selected = funnelData.find(r => r.stage.id === expandedStage);
                    if (!selected) return null;
                    return (
                      <div className="mt-4 border-t border-card-border pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.stage.color || "hsl(var(--primary))" }} />
                          <span className="text-sm font-semibold text-foreground">{selected.stage.title}</span>
                          <span className="text-xs text-muted-foreground">— {selected.count} lead{selected.count !== 1 ? "s" : ""}</span>
                          <button onClick={() => setExpandedStage(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">fechar</button>
                        </div>
                        {selected.leadDetails.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhum lead encontrado.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {selected.leadDetails.map(l => (
                              <div key={l.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/40">
                                <Users size={12} className="text-muted-foreground shrink-0" />
                                <span className="text-xs text-foreground font-medium truncate">{l.name}</span>
                                {l.responsible && (
                                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{l.responsible}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Conversion table */}
                <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Tabela de conversão</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-card-border text-xs text-muted-foreground">
                          <th className="text-left pb-2 font-medium">Etapa</th>
                          <th className="text-right pb-2 font-medium">Leads entraram</th>
                          <th className="text-right pb-2 font-medium">Conv. etapa anterior</th>
                          <th className="text-right pb-2 font-medium">Conv. desde o início</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {funnelData.map((row, i) => {
                          const prev = funnelData[i - 1];
                          const stepConv = prev && prev.count > 0 ? `${((row.count / prev.count) * 100).toFixed(1)}%` : "—";
                          const totalConv = firstCount > 0 ? `${((row.count / firstCount) * 100).toFixed(1)}%` : "—";
                          return (
                            <tr key={row.stage.id} className="hover:bg-muted/30 transition-colors">
                              <td className="py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.stage.color || "hsl(var(--primary))" }} />
                                  <span className="font-medium text-foreground">{row.stage.title}</span>
                                </div>
                              </td>
                              <td className="text-right py-2.5 font-semibold text-foreground">{row.count}</td>
                              <td className="text-right py-2.5 text-muted-foreground">{stepConv}</td>
                              <td className="text-right py-2.5 font-medium text-foreground">{totalConv}</td>
                            </tr>
                          );
                        })}
                        {(() => {
                          const pipelineWon = pWon.length;
                          const pipelineLost = pLost.length;
                          const wonPct = firstCount > 0 ? `${((pipelineWon / firstCount) * 100).toFixed(1)}%` : "—";
                          const lostPct = firstCount > 0 ? `${((pipelineLost / firstCount) * 100).toFixed(1)}%` : "—";
                          return (
                            <>
                              <tr className="hover:bg-muted/30 transition-colors border-t-2 border-card-border">
                                <td className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-success" />
                                    <span className="font-medium text-success">Ganhos</span>
                                  </div>
                                </td>
                                <td className="text-right py-2.5 font-semibold text-success">{pipelineWon}</td>
                                <td className="text-right py-2.5 text-muted-foreground">—</td>
                                <td className="text-right py-2.5 font-medium text-success">{wonPct}</td>
                              </tr>
                              <tr className="hover:bg-muted/30 transition-colors">
                                <td className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-destructive" />
                                    <span className="font-medium text-destructive">Perdidos</span>
                                  </div>
                                </td>
                                <td className="text-right py-2.5 font-semibold text-destructive">{pipelineLost}</td>
                                <td className="text-right py-2.5 text-muted-foreground">—</td>
                                <td className="text-right py-2.5 font-medium text-destructive">{lostPct}</td>
                              </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
