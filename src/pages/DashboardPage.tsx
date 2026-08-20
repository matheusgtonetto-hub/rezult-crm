import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  TrendingUp, Users, CheckCircle, Clock, Trophy,
  MessageSquare, ArrowDown, Calendar, Phone, Mail, AlertTriangle,
  Activity as ActivityIcon, ChevronDown, ChevronRight, Briefcase, XCircle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DonutDistribuicao } from "@/components/dashboard/DonutDistribuicao";
import { OriginPanel } from "@/components/dashboard/OriginPanel";
import { UtmAttributionPanel } from "@/components/dashboard/UtmAttributionPanel";
import { TagPerformancePanel } from "@/components/dashboard/TagPerformancePanel";
import { NoNextActionPanel } from "@/components/dashboard/NoNextActionPanel";
import { StageVelocityPanel } from "@/components/dashboard/StageVelocityPanel";
import { MultiatendimentoPanel } from "@/components/dashboard/MultiatendimentoPanel";
import { fmt, parseEntryDate, tooltip, usePriorPeriod, variacao, meioDoPeriodo } from "@/components/dashboard/useDashboardHelpers";

const ACTIVITY_LABELS: Record<string, string> = {
  stage_change: "Mudança de etapa",
  note: "Nota",
  whatsapp: "WhatsApp",
  won: "Ganho",
  lost: "Perdido",
  created: "Criado",
  meeting: "Reunião",
  call: "Ligação",
  follow_up: "Follow-up",
  task: "Tarefa",
  email: "E-mail",
};

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
  { chave: "novos",    chaveValor: "novosValor",    nome: "Novos",    cor: "#128A68", id: "area-novos" },
  { chave: "ganhos",   chaveValor: "ganhosValor",   nome: "Ganhos",   cor: "#10B981", id: "area-ganhos" },
  { chave: "perdidos", chaveValor: "perdidosValor", nome: "Perdidos", cor: "#EF4444", id: "area-perdidos" },
] as const;

/** Eixo Y em dinheiro precisa ser curto, senão "R$ 1.610,00" come a largura do
 *  gráfico em cada marca. Mil vira "k", milhão vira "M". */
const fmtCurto = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000   ? `R$ ${Math.round(v / 1_000)}k`
  : `R$ ${v}`;

export default function DashboardPage() {
  const {
    leads, pipelines, products, teamMembers, memberColors, memberAvatars, tasks, lossReasons, crmTags,
  } = useCRM();

  const [dateRange, setDateRange] = useState<DateRangeValue>(() => ({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date(),
  }));
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

  const hourlyData = useMemo(() => {
    type HBucket = { key: string; mes: string; novos: number; ganhos: number; perdidos: number };
    const map = new Map<number, HBucket>();

    allLeads.forEach(lead => {
      const e = lead.created_at ? new Date(lead.created_at) : parseEntryDate(lead.entryDate);
      if (e && e >= periodCutoff && e <= periodTo) {
        const h = e.getHours();
        const cur = map.get(h) || { key: String(h).padStart(2, "0"), mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0 };
        cur.novos++;
        map.set(h, cur);
      }
      lead.activities.forEach(act => {
        const d = new Date(act.date);
        if (d < periodCutoff || d > periodTo) return;
        const h = d.getHours();
        const cur = map.get(h) || { key: String(h).padStart(2, "0"), mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0 };
        if (act.type === "won") cur.ganhos++;
        if (act.type === "lost") cur.perdidos++;
        map.set(h, cur);
      });
    });

    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [allLeads, dateRange]);

  const lossReasonData = useMemo(() => {
    const map = new Map<string, number>();
    lostInPeriod.forEach(l => {
      const r = lossReasons.find(x => x.id === l.lossReasonId)?.name || "Sem motivo";
      map.set(r, (map.get(r) || 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
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

  const donutData = useMemo(() => {
    return teamMembers.map(m => {
      const ml = leadsForMember(periodLeads, m);
      const value = donutMode === "value" ? ml.reduce((s, l) => s + l.value, 0) : ml.length;
      return { name: m, value, color: memberColors[m] || "#888" };
    }).filter(d => d.value > 0);
  }, [periodLeads, teamMembers, memberColors, donutMode]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; count: number; value: number }>();
    products.forEach(p => map.set(p.id, { name: p.name, count: 0, value: 0 }));
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
    const byType = new Map<string, number>();
    inPeriod.forEach(a => byType.set(a.type, (byType.get(a.type) || 0) + 1));
    const meetings = inPeriod.filter(a => a.type === "meeting");
    const now = new Date();
    const upcoming = allActs
      .filter(a => a.type === "meeting" && a.scheduledAt && !a.completedAt && !a.noShowAt && new Date(a.scheduledAt) > now)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
      .slice(0, 5);
    const recent = [...inPeriod]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

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
      total: inPeriod.length,
      meetings: meetings.length,
      completedMeetings: meetings.filter(a => a.completedAt).length,
      noShows: meetings.filter(a => a.noShowAt).length,
      calls: inPeriod.filter(a => a.type === "call").length,
      emails: inPeriod.filter(a => a.type === "email").length,
      notes: inPeriod.filter(a => a.type === "note").length,
      byType: [...byType.entries()]
        .map(([type, count]) => ({ type: ACTIVITY_LABELS[type] ?? type, count }))
        .sort((a, b) => b.count - a.count),
      upcoming,
      recent,
      topSchedulers,
      topCompleters,
    };
  }, [allLeads, dateRange]);

  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return tasks
      .filter(t => t.status !== "Concluída" && t.dueDate && t.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [tasks]);

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

  /** Séries ligadas no gráfico por horário. Começa com as três. */
  const [seriesHorario, setSeriesHorario] = useState<string[]>(() => AREAS_NEGOCIOS.map(a => a.chave));
  const alternarSerieHorario = (chave: string) =>
    setSeriesHorario(atual =>
      atual.includes(chave)
        // A última ligada não desliga: gráfico sem nenhuma série é uma grade
        // vazia, um beco sem saída visual. Sempre sobra pelo menos uma curva.
        ? (atual.length === 1 ? atual : atual.filter(c => c !== chave))
        : [...atual, chave]
    );
  const areasHorario = AREAS_NEGOCIOS.filter(a => seriesHorario.includes(a.chave));

  return (
    // p-[30px]: 30px não existe na escala do Tailwind (p-6 é 24, p-8 é 32),
    // então vai como valor arbitrário mesmo.
    <div className="p-[30px] max-w-[1400px] mx-auto">
      <Tabs defaultValue="negocios" className="space-y-6">
      {/* Header */}
      {/* items-start, e não items-center: com o subtítulo, o bloco de título
          ficou mais alto que as abas, e centralizar deixaria as abas flutuando
          na altura do meio em vez de alinhadas ao "Dashboard". */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          {/* 23px é valor arbitrário: a escala do Tailwind pula de 20 (text-xl)
              para 24 (text-2xl). */}
          <h1 className="text-[23px] font-semibold text-foreground">Dashboard</h1>
          {/* 14px, e não os 12px dos subtítulos de painel: este acompanha o
              título da página inteira, que é maior, e no corpo menor ficaria
              desproporcional embaixo dos 23px do "Dashboard". */}
          <p className="text-sm text-muted-foreground mt-0.5">Desempenho geral do seu negócio</p>
        </div>
        <div className="flex items-center gap-3">
          <TabsList className="bg-card border border-gray-200 rounded-lg">
            <TabsTrigger value="negocios" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Negócios</TabsTrigger>
            <TabsTrigger value="multiatendimento" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Multiatendimento</TabsTrigger>
            <TabsTrigger value="atividades" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Atividades</TabsTrigger>
            <TabsTrigger value="funil" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Funil</TabsTrigger>
            <TabsTrigger value="times" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Times</TabsTrigger>
          </TabsList>
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

              // Séries dos sparklines. Saem do monthlyData, que é o mesmo dado do
              // gráfico grande logo abaixo -- assim o mini gráfico do cartão e a
              // curva do painel nunca contam histórias diferentes.
              //
              // "Em aberto" não tem série própria: é o que entrou menos o que
              // fechou, e por isso é calculado aqui em vez de inventar um campo.
              const serieNovos    = monthlyData.map(m => m.novos);
              const serieGanhos   = monthlyData.map(m => m.ganhos);
              const seriePerdidos = monthlyData.map(m => m.perdidos);
              const serieAbertos  = monthlyData.map(m => Math.max(0, m.novos - m.ganhos - m.perdidos));

              return [
                {
                  label: "Total de negócios",
                  value: periodLeads.length,
                  sub: fmt(periodLeads.reduce((s, l) => s + l.value, 0)),
                  delta: compara(periodLeads, priorPeriodLeads, porEntrada),
                  icone: Briefcase,
                  tom: "primary" as const,
                  serie: serieNovos,
                },
                {
                  label: "Total em vendas",
                  value: wonInPeriod.length,
                  sub: fmt(wonInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: compara(wonInPeriod, wonPrior, porFechamento("won")),
                  icone: Trophy,
                  tom: "success" as const,
                  serie: serieGanhos,
                },
                {
                  label: "Total perdidos",
                  value: lostInPeriod.length,
                  sub: fmt(lostInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: compara(lostInPeriod, lostPrior, porFechamento("lost")),
                  icone: XCircle,
                  tom: "danger" as const,
                  serie: seriePerdidos,
                },
                {
                  label: "Total em aberto",
                  value: openInPeriod.length,
                  sub: fmt(openInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: compara(openInPeriod, openPrior, porEntrada),
                  icone: Clock,
                  tom: "amber" as const,
                  serie: serieAbertos,
                },
              ];
            })().map(c => (
              <KpiCard
                key={c.label}
                label={c.label}
                value={c.value}
                sub={c.sub}
                variacao={c.delta}
                icone={c.icone}
                tom={c.tom}
                serie={c.serie}
                // Nos cartões de negócio o dinheiro é a resposta e a contagem é
                // o detalhe, então o valor sobe para o destaque e o número desce.
                destaqueNoSub
                // Com o dinheiro em destaque, o número embaixo precisa dizer de
                // que ele é contagem. Os quatro cartões contam negócios: os
                // ganhos, os perdidos e os abertos são todos negócios, em
                // situações diferentes.
                sufixo={c.value === 1 ? "negócio" : "negócios"}
              />
            ))}
          </div>

          {/* Monthly line */}
          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">Resultado no período</h3>
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
                    contentStyle={tooltip}
                    formatter={metricaPeriodo === "receita" ? ((v: number) => fmt(v)) : undefined}
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

          {/* Hourly results */}
          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Resultados por horário</h3>
              {/* Legenda que também filtra: clicar liga e desliga a série no
                  gráfico. Desligada, a bolinha fica oca e o texto esmaece, então
                  dá para ver de relance o que está fora sem abrir nada. */}
              <div className="flex items-center gap-1">
                {AREAS_NEGOCIOS.map(a => {
                  const ativa = seriesHorario.includes(a.chave);
                  const ultima = ativa && seriesHorario.length === 1;
                  return (
                    <button
                      key={a.chave}
                      onClick={() => alternarSerieHorario(a.chave)}
                      aria-pressed={ativa}
                      title={ultima ? "Pelo menos uma série precisa ficar visível" : ativa ? `Ocultar ${a.nome}` : `Mostrar ${a.nome}`}
                      className={`flex items-center gap-1.5 text-xs rounded-md px-2 py-1 transition-colors ${
                        ativa ? "text-foreground" : "text-muted-foreground/50"
                      } ${ultima ? "cursor-default" : "cursor-pointer hover:bg-muted/60"}`}
                    >
                      {/* Mesma caixa de seleção do "Visualizando como" da
                          pipeline: quadrado com marca de confirmação, pintado na
                          cor da série. Reaproveitar o padrão que já existe no
                          app evita duas gramáticas de seleção convivendo.

                          A cor fica na caixa, e não numa bolinha separada, então
                          um único elemento diz as duas coisas: qual série é e se
                          ela está no gráfico. */}
                      <span
                        className="flex items-center justify-center rounded shrink-0"
                        style={{
                          width: 14,
                          height: 14,
                          border: ativa ? `2px solid ${a.cor}` : "1.5px solid #CCCCCC",
                          background: ativa ? a.cor : "transparent",
                        }}
                      >
                        {ativa && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      {a.nome}
                    </button>
                  );
                })}
              </div>
            </div>
            {hourlyData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Nenhum dado no período selecionado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                {/* Mesmo tratamento do gráfico mensal. Os gradientes têm ids
                    próprios (sufixo -h): dois <linearGradient> com o mesmo id na
                    página fazem o segundo herdar o primeiro. */}
                <AreaChart data={hourlyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    {areasHorario.map(a => (
                      <linearGradient key={a.id} id={`${a.id}-h`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={a.cor} stopOpacity={0.24} />
                        <stop offset="100%" stopColor={a.cor} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
                  <Tooltip contentStyle={tooltip} />
                  {areasHorario.map(a => (
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
            )}
          </div>

          {/* Origem logo abaixo do gráfico por horário e em largura cheia. As
              duas rosquinhas dele ficam lado a lado internamente, senão a
              legenda de cada uma esticaria por mais de mil pixels de vazio. */}
          <OriginPanel periodLeads={periodLeads} />

          <UtmAttributionPanel periodLeads={periodLeads} />

          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Motivos de perda</h3>
            {/* Sem ramo de "vazio": período sem perda desenha o anel cinza com
                zero no centro, que é a resposta. Escondê-lo fazia o painel sumir
                e a página inteira pular de altura ao trocar o filtro de data.

                `total` explícito: lossReasonData é cortado no top 6, então somar
                as fatias daria menos que o total de perdidos e o número do centro
                mentiria sempre que houvesse um 7º motivo. */}
            <DonutDistribuicao
              dados={lossReasonData.map(r => ({ nome: r.name, valor: r.value }))}
              rotuloCentro={lostInPeriod.length === 1 ? "perdido" : "perdidos"}
              total={lostInPeriod.length}
            />
          </div>


          {/* Top products */}
          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Produtos mais vendidos</h3>
            {topProducts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum produto cadastrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-card-border text-xs text-muted-foreground">
                      <th className="text-left pb-2 font-medium">Produto</th>
                      <th className="text-center pb-2 font-medium">Número de vendas</th>
                      <th className="text-center pb-2 font-medium">Receita gerada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {topProducts.map(p => (
                      <tr key={p.name} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 font-medium text-foreground">{p.name}</td>
                        <td className="py-2.5 text-center text-muted-foreground">{p.count}</td>
                        <td className="py-2.5 text-center font-semibold text-primary">
                          {p.value > 0 ? fmt(p.value) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                { label: "Atendentes ativos",   value: String(totalAgents), icone: Users,      tom: "primary" as const },
                { label: "Vendas no período",   value: String(totalWon),    icone: Trophy,     tom: "success" as const },
                { label: "Perdidos no período", value: String(totalLost),   icone: XCircle,    tom: "danger" as const },
                { label: "Conversão do time",   value: closed > 0 ? `${(totalWon / closed * 100).toFixed(1)}%` : "—", icone: TrendingUp, tom: "amber" as const },
              ].map(k => (
                <KpiCard key={k.label} label={k.label} value={k.value} icone={k.icone} tom={k.tom} />
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
              {activityStats.topSchedulers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma reunião agendada no período.</p>
              ) : (
                <div className="border border-card-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/40 border-b border-card-border">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Usuário</th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Agendamentos</th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Reuniões ocorridas</th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Conversão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
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
              )}
            </div>

            {/* Top Closer */}
            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Top Closer</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Reuniões realizadas e conversão em vendas</p>
              </div>
              {activityStats.topCompleters.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma venda registrada no período.</p>
              ) : (
                <div className="border border-card-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/40 border-b border-card-border">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Usuário</th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Reuniões Realizadas</th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-r border-card-border">Vendas</th>
                        <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Conversão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
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
              )}
            </div>
          </div>

          <StageVelocityPanel periodLeads={periodLeads} pipelines={pipelines} />

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
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Reuniões no período</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Desempenho e conversão das reuniões agendadas</p>
                  </div>
                  {meetings === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhuma reunião no período</span>
                  )}
                </div>

                {meetings > 0 && (
                  <>
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
                    {userRows.length > 0 && (
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
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* Tabela de desempenho */}
          <div>
            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Desempenho dos vendedores</h3>
              {agentPerformance.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem atendentes cadastrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-xs text-muted-foreground">
                        <th className="text-left pb-2 font-medium">Atendente</th>
                        <th className="text-right pb-2 font-medium">Total</th>
                        <th className="text-right pb-2 font-medium">Ganhos</th>
                        <th className="text-right pb-2 font-medium">Perdidos</th>
                        <th className="text-right pb-2 font-medium">Conversão</th>
                        <th className="text-right pb-2 font-medium">Ticket médio</th>
                        <th className="text-right pb-2 font-medium">Receita</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {agentPerformance.map(a => (
                        <tr key={a.name} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ backgroundColor: a.color }}>{a.name[0]}</div>
                              <span className="text-foreground font-medium truncate max-w-[120px]">{a.name}</span>
                            </div>
                          </td>
                          <td className="text-right py-2.5 text-muted-foreground">{a.total}</td>
                          <td className="text-right py-2.5 text-success font-medium">{a.won}</td>
                          <td className="text-right py-2.5 text-destructive">{a.lost}</td>
                          <td className="text-right py-2.5 font-medium text-foreground">{a.convRate}{a.convRate !== "—" ? "%" : ""}</td>
                          <td className="text-right py-2.5 text-foreground">{fmt(a.avgTicket)}</td>
                          <td className="text-right py-2.5 font-semibold text-foreground">{fmt(a.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </TabsContent>

        {/* ──────────── ATIVIDADES ──────────── */}
        <TabsContent value="atividades" className="space-y-4 mt-0">
          {/* Mini KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Terceiro conjunto de cartões que estava escrito à mão (Funil e
                Times eram os outros). Aqui o ícone ficava à esquerda do rótulo,
                não no quadrado tingido, e "Ligações" usava text-foreground, uma
                cor que nenhum outro cartão do dashboard usa. Passa a sair do
                mesmo componente. */}
            {[
              { label: "Total no período",    value: activityStats.total,             icone: MessageSquare, tom: "primary" as const },
              { label: "Reuniões realizadas", value: activityStats.completedMeetings, icone: CheckCircle,   tom: "success" as const },
              { label: "Ligações",            value: activityStats.calls,             icone: Phone,         tom: "amber" as const },
              { label: "E-mails",             value: activityStats.emails,            icone: Mail,          tom: "primary" as const },
            ].map(c => (
              <KpiCard key={c.label} label={c.label} value={c.value} icone={c.icone} tom={c.tom} />
            ))}
          </div>

          {/* By type */}
          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Por tipo de atividade</h3>
            {activityStats.byType.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem atividades no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={activityStats.byType} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  {/* Grade só horizontal, como nos gráficos de área: em barra a
                      linha vertical duplica a própria barra. */}
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" vertical={false} />
                  <XAxis dataKey="type" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
                  <Tooltip contentStyle={tooltip} cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }} />
                  <Bar dataKey="count" name="Atividades" fill="#128A68" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Upcoming meetings + Overdue tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Próximas reuniões</h3>
              {activityStats.upcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma reunião agendada.</p>
              ) : (
                <div className="space-y-3">
                  {activityStats.upcoming.map(a => (
                    <div key={a.id} className="flex items-start gap-3 pb-3 border-b border-card-border last:border-0 last:pb-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Calendar size={14} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{a.title || a.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.leadName}</p>
                        {a.scheduledAt && (
                          <p className="text-xs text-primary mt-0.5">
                            {new Date(a.scheduledAt).toLocaleDateString("pt-BR")} às {new Date(a.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                Tarefas atrasadas
                {overdueTasks.length > 0 && (
                  <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full font-semibold">{overdueTasks.length}</span>
                )}
              </h3>
              {overdueTasks.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-success">
                  <CheckCircle size={14} />
                  <span>Nenhuma tarefa atrasada.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {overdueTasks.map(t => {
                    const daysLate = Math.max(0, Math.floor((new Date().getTime() - new Date(t.dueDate + "T00:00:00").getTime()) / 86400000));
                    return (
                      <div key={t.id} className="flex items-start gap-3 pb-3 border-b border-card-border last:border-0 last:pb-0">
                        <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                          <Clock size={14} className="text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{t.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.leadName}</p>
                          <p className="text-xs text-destructive mt-0.5">{daysLate === 0 ? "Venceu hoje" : `${daysLate} dia${daysLate > 1 ? "s" : ""} atrasada`} · responsável: {t.responsible || "—"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent activities */}
          <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Atividades recentes</h3>
            {activityStats.recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem atividades no período.</p>
            ) : (
              <div className="space-y-3">
                {activityStats.recent.map(a => (
                  <div key={a.id} className="flex items-start gap-3 pb-3 border-b border-card-border last:border-0 last:pb-0">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <MessageSquare size={13} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{a.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.leadName} · {new Date(a.date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                      {ACTIVITY_LABELS[a.type] ?? a.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <NoNextActionPanel allLeads={allLeads} />
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
                  {/* Mesmos cartões da aba Negócios, agora pelo componente e não
                      escritos à mão: eram cinco blocos duplicados que já tinham
                      divergido no visual (ícone solto contra ícone em quadrado
                      tingido) e na escolha de cor.

                      A hierarquia de cada aba fica como estava: aqui a contagem é
                      o número grande e o dinheiro é o detalhe, o inverso de
                      Negócios. Isso é decisão de conteúdo, não de estilo, então
                      não mexo nela junto com o acerto visual. */}
                  <KpiCard label="Total de negócios" value={pLeads.length} sub={fmt(pLeads.reduce((s, l) => s + l.value, 0))} icone={Briefcase} tom="primary" />
                  <KpiCard label="Total em vendas"   value={pWon.length}   sub={fmt(pWon.reduce((s, l) => s + l.value, 0))}   icone={Trophy}    tom="success" />
                  <KpiCard label="Total perdidos"    value={pLost.length}  sub={fmt(pLost.reduce((s, l) => s + l.value, 0))}  icone={XCircle}   tom="danger" />
                  <KpiCard label="Total em aberto"   value={pOpen.length}  sub={fmt(pOpen.reduce((s, l) => s + l.value, 0))}  icone={Clock}     tom="amber" />
                  <KpiCard
                    label="Conversão do funil"
                    value={firstCount > 0 ? `${((pWon.length / firstCount) * 100).toFixed(1)}%` : "—"}
                    sub={`${pWon.length} ganhos de ${firstCount} MQL`}
                    icone={TrendingUp}
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

                <StageVelocityPanel funnelPipeline={funnelPipeline} allLeads={allLeads} funnelResponsible={funnelResponsible} />
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
