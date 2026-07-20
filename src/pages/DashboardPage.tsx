import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList, ReferenceLine,
} from "recharts";
import {
  TrendingUp, Users, CheckCircle, DollarSign, Clock, Trophy,
  MessageSquare, ArrowDown, Calendar, Phone, Mail, AlertTriangle,
  Activity as ActivityIcon, ChevronDown, ChevronRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { OriginPanel } from "@/components/dashboard/OriginPanel";
import { UtmAttributionPanel } from "@/components/dashboard/UtmAttributionPanel";
import { TagPerformancePanel } from "@/components/dashboard/TagPerformancePanel";
import { NoNextActionPanel } from "@/components/dashboard/NoNextActionPanel";
import { StageVelocityPanel } from "@/components/dashboard/StageVelocityPanel";
import { fmt, parseEntryDate, tooltip, deltaPct, usePriorPeriod } from "@/components/dashboard/useDashboardHelpers";

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

  // periodLeads e priorPeriodLeads classificados numa única passada sobre allLeads
  // (evita duas iterações .filter() completas quando o objetivo é só comparar os dois períodos).
  const { periodLeads, priorPeriodLeads } = useMemo(() => {
    const cur: typeof allLeads = [];
    const prior: typeof allLeads = [];
    allLeads.forEach(l => {
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
    type Bucket = { key: string; mes: string; novos: number; ganhos: number; perdidos: number };
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
          const cur = map.get(key) || { key, mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0 };
          cur.novos++;
          map.set(key, cur);
        }
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (d < periodCutoff || d > periodTo) return;
          const h = d.getHours();
          const key = String(h).padStart(2, "0");
          const cur = map.get(key) || { key, mes: `${h}h`, novos: 0, ganhos: 0, perdidos: 0 };
          if (act.type === "won") cur.ganhos++;
          if (act.type === "lost") cur.perdidos++;
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
        map.set(key, { key, mes: `${cursor.getDate()}/${cursor.getMonth() + 1}`, novos: 0, ganhos: 0, perdidos: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      allLeads.forEach(lead => {
        const e = parseEntryDate(lead.entryDate);
        if (e && e >= periodCutoff && e <= periodTo) {
          const key = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (bucket) bucket.novos++;
        }
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (d < periodCutoff || d > periodTo) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (!bucket) return;
          if (act.type === "won") bucket.ganhos++;
          if (act.type === "lost") bucket.perdidos++;
        });
      });

    } else {
      // ── MESES: sempre 12 buckets mensais ──
      const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      const cursor = new Date(periodCutoff);
      cursor.setDate(1);
      for (let i = 0; i < 12; i++) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        map.set(key, { key, mes: `${monthNames[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, novos: 0, ganhos: 0, perdidos: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      allLeads.forEach(lead => {
        const e = parseEntryDate(lead.entryDate);
        if (e && e >= periodCutoff && e <= periodTo) {
          const key = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (bucket) bucket.novos++;
        }
        lead.activities.forEach(act => {
          const d = new Date(act.date);
          if (d < periodCutoff || d > periodTo) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const bucket = map.get(key);
          if (!bucket) return;
          if (act.type === "won") bucket.ganhos++;
          if (act.type === "lost") bucket.perdidos++;
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

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Tabs defaultValue="negocios" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-3">
          <TabsList className="bg-card border border-gray-200 rounded-lg">
            <TabsTrigger value="negocios" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Negócios</TabsTrigger>
            <TabsTrigger value="times" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Times</TabsTrigger>
            <TabsTrigger value="atividades" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Atividades</TabsTrigger>
            <TabsTrigger value="funil" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-white">Funil</TabsTrigger>
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
              return [
                {
                  label: "Total de negócios",
                  value: periodLeads.length,
                  sub: fmt(periodLeads.reduce((s, l) => s + l.value, 0)),
                  delta: deltaPct(periodLeads.length, priorPeriodLeads.length),
                },
                {
                  label: "Total em vendas",
                  value: wonInPeriod.length,
                  sub: fmt(wonInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: deltaPct(wonInPeriod.length, wonPrior.length),
                },
                {
                  label: "Total perdidos",
                  value: lostInPeriod.length,
                  sub: fmt(lostInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: deltaPct(lostInPeriod.length, lostPrior.length),
                },
                {
                  label: "Total em aberto",
                  value: openInPeriod.length,
                  sub: fmt(openInPeriod.reduce((s, l) => s + l.value, 0)),
                  delta: deltaPct(openInPeriod.length, openPrior.length),
                },
              ];
            })().map(c => (
              <KpiCard
                key={c.label}
                label={c.label}
                value={c.value}
                sub={c.sub}
                deltaPct={c.delta}
              />
            ))}
          </div>

          {/* Monthly line */}
          <div className="bg-card border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Resultado no período</h3>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#128A68" }} />Novos</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#10B981" }} />Ganhos</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#EF4444" }} />Perdidos</span>
              </div>
            </div>
            {monthlyData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Nenhum dado no período selecionado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={monthlyData}>
                  <defs>
                    <filter id="m-shadow-novos" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#128A68" floodOpacity="0.20" />
                    </filter>
                    <filter id="m-shadow-ganhos" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#10B981" floodOpacity="0.20" />
                    </filter>
                    <filter id="m-shadow-perdidos" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#EF4444" floodOpacity="0.20" />
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="0" stroke="hsl(var(--card-border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltip} />
                  <Line type="monotone" dataKey="novos" name="Novos" stroke="#128A68" strokeWidth={1.5} dot={{ r: 1.5, fill: "#128A68" }} activeDot={{ r: 5 }} style={{ filter: "url(#m-shadow-novos)" }} animationEasing="ease-out" animationDuration={800} />
                  <Line type="monotone" dataKey="ganhos" name="Ganhos" stroke="#10B981" strokeWidth={1.5} dot={{ r: 1.5, fill: "#10B981" }} activeDot={{ r: 5 }} style={{ filter: "url(#m-shadow-ganhos)" }} animationEasing="ease-out" animationDuration={800} />
                  <Line type="monotone" dataKey="perdidos" name="Perdidos" stroke="#EF4444" strokeWidth={1.5} dot={{ r: 1.5, fill: "#EF4444" }} activeDot={{ r: 5 }} style={{ filter: "url(#m-shadow-perdidos)" }} animationEasing="ease-out" animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Hourly results */}
          <div className="bg-card border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Resultados por horário</h3>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#128A68" }} />Novos</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#10B981" }} />Ganhos</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#EF4444" }} />Perdidos</span>
              </div>
            </div>
            {hourlyData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Nenhum dado no período selecionado.</p>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={hourlyData}>
                  <defs>
                    <filter id="h-shadow-novos" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#128A68" floodOpacity="0.20" />
                    </filter>
                    <filter id="h-shadow-ganhos" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#10B981" floodOpacity="0.20" />
                    </filter>
                    <filter id="h-shadow-perdidos" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#EF4444" floodOpacity="0.20" />
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="0" stroke="hsl(var(--card-border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltip} />
                  <Line type="monotone" dataKey="novos" name="Novos" stroke="#128A68" strokeWidth={1.5} dot={{ r: 1.5, fill: "#128A68" }} activeDot={{ r: 5 }} style={{ filter: "url(#h-shadow-novos)" }} animationEasing="ease-out" animationDuration={800} />
                  <Line type="monotone" dataKey="ganhos" name="Ganhos" stroke="#10B981" strokeWidth={1.5} dot={{ r: 1.5, fill: "#10B981" }} activeDot={{ r: 5 }} style={{ filter: "url(#h-shadow-ganhos)" }} animationEasing="ease-out" animationDuration={800} />
                  <Line type="monotone" dataKey="perdidos" name="Perdidos" stroke="#EF4444" strokeWidth={1.5} dot={{ r: 1.5, fill: "#EF4444" }} activeDot={{ r: 5 }} style={{ filter: "url(#h-shadow-perdidos)" }} animationEasing="ease-out" animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <UtmAttributionPanel periodLeads={periodLeads} />

          {/* Origins + Loss reasons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OriginPanel periodLeads={periodLeads} />

            <div className="bg-card border border-gray-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Motivos de perda</h3>
              {lossReasonData.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum negócio perdido registrado.</p>
              ) : (
                <div className="space-y-3 mt-1">
                  {lossReasonData.map(r => {
                    const p = lostInPeriod.length > 0 ? (r.value / lostInPeriod.length * 100).toFixed(0) : 0;
                    return (
                      <div key={r.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-foreground truncate max-w-[180px]">{r.name}</span>
                          <span className="text-muted-foreground">{r.value} ({p}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-destructive rounded-full" style={{ width: `${p}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>


          {/* Top products */}
          <div className="bg-card border border-gray-200 rounded-xl p-4">
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
              return [
                { label: "Atendentes ativos", value: String(totalAgents) },
                { label: "Vendas no período", value: String(totalWon) },
                { label: "Perdidos no período", value: String(totalLost) },
                { label: "Conversão do time", value: closed > 0 ? `${(totalWon / closed * 100).toFixed(1)}%` : "—" },
              ].map(k => (
                <KpiCard key={k.label} label={k.label} value={k.value} />
              ));
            })()}
          </div>

          {/* Top SDR + Top Closer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top SDR */}
            <div className="bg-card border border-gray-200 rounded-xl p-5">
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
            <div className="bg-card border border-gray-200 rounded-xl p-5">
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
              <div className="bg-card border border-gray-200 rounded-xl p-5">
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
            <div className="bg-card border border-gray-200 rounded-xl p-4">
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
            {[
              { label: "Total no período", value: activityStats.total, icon: MessageSquare, color: "text-primary" },
              { label: "Reuniões realizadas", value: activityStats.completedMeetings, icon: CheckCircle, color: "text-success" },
              { label: "Ligações", value: activityStats.calls, icon: Phone, color: "text-foreground" },
              { label: "E-mails", value: activityStats.emails, icon: Mail, color: "text-primary" },
            ].map(c => (
              <div key={c.label} className="bg-card border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <c.icon size={15} className={c.color} />
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{c.value}</p>
              </div>
            ))}
          </div>

          {/* By type */}
          <div className="bg-card border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Por tipo de atividade</h3>
            {activityStats.byType.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem atividades no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={activityStats.byType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                  <XAxis dataKey="type" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltip} />
                  <Bar dataKey="count" name="Atividades" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Upcoming meetings + Overdue tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-gray-200 rounded-xl p-4">
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

            <div className="bg-card border border-gray-200 rounded-xl p-4">
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
          <div className="bg-card border border-gray-200 rounded-xl p-4">
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
            <div className="bg-card border border-gray-200 rounded-xl p-8 text-center text-sm text-muted-foreground">Nenhum pipeline encontrado.</div>
          ) : funnelData.length === 0 ? (
            <div className="bg-card border border-gray-200 rounded-xl p-8 text-center text-sm text-muted-foreground">Este pipeline não possui etapas.</div>
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
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-muted-foreground font-medium">Total de negócios</span>
                      <DollarSign size={15} className="text-primary" />
                    </div>
                    <p className="text-2xl leading-none font-bold text-foreground">{pLeads.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pLeads.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-muted-foreground font-medium">Total em vendas</span>
                      <Trophy size={15} className="text-success" />
                    </div>
                    <p className="text-2xl leading-none font-bold text-foreground">{pWon.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pWon.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-muted-foreground font-medium">Total perdidos</span>
                      <TrendingUp size={15} className="text-destructive" />
                    </div>
                    <p className="text-2xl leading-none font-bold text-foreground">{pLost.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pLost.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-muted-foreground font-medium">Total em aberto</span>
                      <Clock size={15} className="text-primary" />
                    </div>
                    <p className="text-2xl leading-none font-bold text-foreground">{pOpen.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pOpen.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-muted-foreground font-medium">Conversão do funil</span>
                      <TrendingUp size={15} className="text-success" />
                    </div>
                    <p className="text-2xl leading-none font-bold text-foreground">
                      {firstCount > 0 ? `${((pWon.length / firstCount) * 100).toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-2">{pWon.length} ganhos de {firstCount} MQL</p>
                  </div>
                </div>

                <div className="bg-card border border-gray-200 rounded-xl p-6">
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

                    const renderTick = (props: { x: number; y: number; payload?: { value: unknown }; index: number }) => {
                      const { x, y, payload, index } = props;
                      const entry = chartData[index];
                      const countLabel = entry?.isGanhos ? pWon.length : (funnelData[index]?.count ?? 0);
                      const isGanhos = entry?.isGanhos;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text x={0} y={0} dy={14} textAnchor="middle" fill={isGanhos ? "#10B981" : "hsl(var(--muted-foreground))"} fontSize={11} fontWeight={isGanhos ? "600" : "400"}>
                            {payload.value}
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
                            const id = e?.activePayload?.[0]?.payload?.stageId;
                            if (id) setExpandedStage(prev => prev === id ? null : id);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                          <XAxis dataKey="name" tick={renderTick} axisLine={false} tickLine={false} height={48} />
                          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip
                            contentStyle={tooltip}
                            formatter={(v: number) => [`${v} lead${v !== 1 ? "s" : ""}`, "Leads"]}
                          />
                          <Bar dataKey="leads" radius={[4, 4, 0, 0]}>
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
                <div className="bg-card border border-gray-200 rounded-xl p-4">
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
