import { useMemo, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList,
} from "recharts";
import {
  TrendingUp, Users, CheckCircle, DollarSign, Clock, Trophy,
  MessageSquare, ArrowDown, Calendar, Phone, Mail, AlertTriangle,
  Activity as ActivityIcon, ChevronDown, ChevronRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";

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

const ORIGIN_COLORS: Record<string, string> = {
  "Instagram": "#E1306C",
  "Facebook Ads": "#1877F2",
  "Indicação": "#10B981",
  "Site": "#6366F1",
  "Outro": "#94A3B8",
};

export default function DashboardPage() {
  const {
    leads, columns, pipelines, products, teamMembers, memberColors, memberAvatars, tasks, lossReasons,
  } = useCRM();

  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(),
  });
  const [donutMode, setDonutMode] = useState<"value" | "count">("value");
  const [funnelPipelineId, setFunnelPipelineId] = useState<string>("");
  const [funnelResponsible, setFunnelResponsible] = useState<string>("all");

  const allLeads = Object.values(leads);
  const wonLeads = allLeads.filter(l => l.dealStatus === "won");
  const lostLeads = allLeads.filter(l => l.dealStatus === "lost");

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const pct = (n: number, d: number) =>
    d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

  // Normaliza para início e fim do dia no fuso local
  const periodCutoff = new Date(dateRange.from);
  periodCutoff.setHours(0, 0, 0, 0);
  const periodTo = new Date(dateRange.to);
  periodTo.setHours(23, 59, 59, 999);

  // Parseia entryDate (string YYYY-MM-DD) como hora local, não UTC
  // entryDate vazio → retorna null (lead sem data é sempre incluído)
  const parseEntryDate = (d: string) => (d ? new Date(d + "T00:00:00") : null);
  const inPeriod = (d: Date) => d >= periodCutoff && d <= periodTo;

  const periodLeads = useMemo(
    () => allLeads.filter(l => {
      const d = parseEntryDate(l.entryDate);
      return d !== null && inPeriod(d);
    }),
    [allLeads, dateRange],
  );

  const { wonInPeriod, lostInPeriod, revenueInPeriod } = useMemo(() => {
    const wonIds = new Set<string>();
    const lostIds = new Set<string>();
    allLeads.forEach(lead => {
      lead.activities.forEach(act => {
        if (!inPeriod(new Date(act.date))) return;
        if (act.type === "won") wonIds.add(lead.id);
        if (act.type === "lost") lostIds.add(lead.id);
      });
    });
    const w = wonLeads.filter(l => wonIds.has(l.id));
    const lo = lostLeads.filter(l => lostIds.has(l.id));
    return { wonInPeriod: w, lostInPeriod: lo, revenueInPeriod: w.reduce((s, l) => s + l.value, 0) };
  }, [allLeads, wonLeads, lostLeads, dateRange]);

  const monthlyData = useMemo(() => {
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const data = months.map(mes => ({ mes, novos: 0, ganhos: 0, perdidos: 0 }));
    allLeads.forEach(lead => {
      const e = parseEntryDate(lead.entryDate);
      if (e && e >= periodCutoff && e <= periodTo) data[e.getMonth()].novos++;
      lead.activities.forEach(act => {
        const d = new Date(act.date);
        if (d < periodCutoff || d > periodTo) return;
        if (act.type === "won") data[d.getMonth()].ganhos++;
        if (act.type === "lost") data[d.getMonth()].perdidos++;
      });
    });
    return data;
  }, [allLeads, dateRange]);

  const originData = useMemo(() => {
    const map = new Map<string, number>();
    periodLeads.forEach(l => {
      const o = l.origin || "Outro";
      map.set(o, (map.get(o) || 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [periodLeads]);

  const lossReasonData = useMemo(() => {
    const map = new Map<string, number>();
    lostInPeriod.forEach(l => {
      const r = lossReasons.find(x => x.id === l.lossReasonId)?.name || "Sem motivo";
      map.set(r, (map.get(r) || 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [lostInPeriod, lossReasons]);

  const agentPerformance = useMemo(() => {
    return teamMembers.map(m => {
      const ml = periodLeads.filter(l => l.responsible === m);
      const won = ml.filter(l => l.dealStatus === "won");
      const lost = ml.filter(l => l.dealStatus === "lost").length;
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
  }, [periodLeads, teamMembers, memberColors]);

  const donutData = useMemo(() => {
    return teamMembers.map(m => {
      const ml = periodLeads.filter(l => l.responsible === m);
      const value = donutMode === "value" ? ml.reduce((s, l) => s + l.value, 0) : ml.length;
      return { name: m, value, color: memberColors[m] || "#888" };
    }).filter(d => d.value > 0);
  }, [periodLeads, teamMembers, memberColors, donutMode]);

  const barData = useMemo(() => columns.map(c => ({
    name: c.title, leads: c.leadIds.length, fill: c.color,
  })), [columns]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; count: number; value: number }>();
    periodLeads.forEach(l => {
      if (!l.productId) return;
      const p = products.find(x => x.id === l.productId);
      if (!p) return;
      const cur = map.get(p.id) || { name: p.name, count: 0, value: 0 };
      cur.count++; cur.value += l.value;
      map.set(p.id, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [periodLeads, products]);

  const activityStats = useMemo(() => {
    const allActs = allLeads.flatMap(l => l.activities.map(a => ({ ...a, leadName: l.name })));
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

  const tooltip = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--card-border))",
    borderRadius: 8,
    color: "hsl(var(--foreground))",
    fontSize: 12,
  };

  const periodLabel = `${dateRange.from.toLocaleDateString("pt-BR")} – ${dateRange.to.toLocaleDateString("pt-BR")}`;

  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <Tabs defaultValue="negocios" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-3">
          <TabsList className="bg-card border border-card-border rounded-lg">
            <TabsTrigger value="negocios" className="rounded-md">Negócios</TabsTrigger>
            <TabsTrigger value="atividades" className="rounded-md">Atividades</TabsTrigger>
            <TabsTrigger value="funil" className="rounded-md">Funil</TabsTrigger>
          </TabsList>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

        {/* ──────────── NEGÓCIOS ──────────── */}
        <TabsContent value="negocios" className="space-y-4 mt-0">
          {/* KPIs de negócios — todos os pipelines, filtrados pelo período */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Total de negócios",
                value: periodLeads.length,
                sub: fmt(periodLeads.reduce((s, l) => s + l.value, 0)),
                icon: DollarSign,
                color: "text-primary",
              },
              {
                label: "Total de ganhos",
                value: wonInPeriod.length,
                sub: fmt(wonInPeriod.reduce((s, l) => s + l.value, 0)),
                conv: periodLeads.length > 0 ? `${((wonInPeriod.length / periodLeads.length) * 100).toFixed(1)}% taxa de conversão` : null,
                icon: Trophy,
                color: "text-success",
              },
              {
                label: "Total perdidos",
                value: lostInPeriod.length,
                sub: fmt(lostInPeriod.reduce((s, l) => s + l.value, 0)),
                conv: periodLeads.length > 0 ? `${((lostInPeriod.length / periodLeads.length) * 100).toFixed(1)}% taxa de perda` : null,
                icon: TrendingUp,
                color: "text-destructive",
              },
              {
                label: "Total em aberto",
                value: periodLeads.filter(l => !l.dealStatus || l.dealStatus === "open").length,
                sub: fmt(periodLeads.filter(l => !l.dealStatus || l.dealStatus === "open").reduce((s, l) => s + l.value, 0)),
                icon: Clock,
                color: "text-primary",
              },
            ].map(c => (
              <div key={c.label} className="bg-card rounded-xl p-4 border border-card-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{c.label}</span>
                  <c.icon size={15} className={c.color} />
                </div>
                <p className="text-[28px] leading-none font-bold text-foreground">{c.value}</p>
                <p className="text-[12px] text-muted-foreground mt-2">{c.sub}</p>
                {"conv" in c && c.conv && (
                  <p className={`text-[11px] font-semibold mt-1.5 ${c.color}`}>{c.conv}</p>
                )}
              </div>
            ))}
          </div>

          {/* Monthly line */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Evolução no período — {periodLabel}
            </h3>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="novos" name="Novos" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ganhos" name="Ganhos" stroke="#10B981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="perdidos" name="Perdidos" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Origins + Loss reasons */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Origem dos leads</h3>
              {originData.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={originData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} width={90} />
                    <Tooltip contentStyle={tooltip} />
                    <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]}>
                      {originData.map((e, i) => <Cell key={i} fill={ORIGIN_COLORS[e.name] ?? "hsl(var(--primary))"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Motivos de perda</h3>
              {lossReasonData.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum negócio perdido registrado.</p>
              ) : (
                <div className="space-y-3 mt-1">
                  {lossReasonData.map(r => {
                    const p = lostLeads.length > 0 ? (r.value / lostLeads.length * 100).toFixed(0) : 0;
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

          {/* Stage bar + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Leads por etapa (situação atual)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltip} />
                  <Bar dataKey="leads" radius={[4, 4, 0, 0]}>
                    {barData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Por atendente</h3>
                <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                  <button onClick={() => setDonutMode("value")} className={`text-xs px-2.5 py-1 rounded-md transition-colors ${donutMode === "value" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Valor</button>
                  <button onClick={() => setDonutMode("count")} className={`text-xs px-2.5 py-1 rounded-md transition-colors ${donutMode === "count" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Qtd</button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {donutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltip} formatter={(v: number) => donutMode === "value" ? fmt(v) : `${v} negócios`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Agent table */}
          <div className="bg-card border border-card-border rounded-xl p-4">
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

          {/* Top products */}
          {topProducts.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Produtos com mais negócios</h3>
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.count} negócio{p.count > 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-sm font-semibold text-primary">{fmt(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
              <div key={c.label} className="bg-card border border-card-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <c.icon size={15} className={c.color} />
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{c.value}</p>
              </div>
            ))}
          </div>

          {/* By type + Meeting stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Por tipo de atividade</h3>
              {activityStats.byType.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem atividades no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={activityStats.byType}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                    <XAxis dataKey="type" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltip} />
                    <Bar dataKey="count" name="Atividades" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Reuniões no período</h3>
              <div className="space-y-3">
                {[
                  { label: "Agendadas", value: activityStats.meetings, cls: "bg-primary" },
                  { label: "Realizadas", value: activityStats.completedMeetings, cls: "bg-success" },
                  { label: "Não compareceu", value: activityStats.noShows, cls: "bg-destructive" },
                ].map(r => {
                  const p = activityStats.meetings > 0 ? (r.value / activityStats.meetings * 100).toFixed(0) : 0;
                  return (
                    <div key={r.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-foreground">{r.label}</span>
                        <span className="text-muted-foreground">{r.value} ({p}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${r.cls}`} style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {activityStats.noShows > 0 && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-lg flex items-start gap-2">
                  <AlertTriangle size={13} className="text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">
                    {activityStats.noShows} reunião{activityStats.noShows > 1 ? "ões" : ""} sem comparecimento no período.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming meetings + Overdue tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4">
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

            <div className="bg-card border border-card-border rounded-xl p-4">
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
                    const daysLate = Math.floor((new Date().getTime() - new Date(t.dueDate).getTime()) / 86400000);
                    return (
                      <div key={t.id} className="flex items-start gap-3 pb-3 border-b border-card-border last:border-0 last:pb-0">
                        <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                          <Clock size={14} className="text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{t.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.leadName}</p>
                          <p className="text-xs text-destructive mt-0.5">{daysLate} dia{daysLate > 1 ? "s" : ""} atrasada · responsável: {t.responsible || "—"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Recent activities */}
          <div className="bg-card border border-card-border rounded-xl p-4">
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
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-sm text-muted-foreground">Nenhum pipeline encontrado.</div>
          ) : funnelData.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-sm text-muted-foreground">Este pipeline não possui etapas.</div>
          ) : (() => {
            const maxCount = Math.max(...funnelData.map(d => d.count), 1);
            const firstCount = funnelData[0]?.count ?? 0;
            const pLeads = allLeads.filter(l => {
              if (l.pipelineId !== funnelPipeline!.id) return false;
              const d = parseEntryDate(l.entryDate);
              if (d === null || !inPeriod(d)) return false;
              if (funnelResponsible === "all") return true;
              const resps = l.responsibles?.length ? l.responsibles : (l.responsible ? [l.responsible] : []);
              return resps.includes(funnelResponsible);
            });
            const pWon   = pLeads.filter(l => l.dealStatus === "won");
            const pLost  = pLeads.filter(l => l.dealStatus === "lost");
            const pOpen  = pLeads.filter(l => !l.dealStatus || l.dealStatus === "open");
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Total de negócios</span>
                      <DollarSign size={15} className="text-primary" />
                    </div>
                    <p className="text-[28px] leading-none font-bold text-foreground">{pLeads.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pLeads.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Total de ganhos</span>
                      <Trophy size={15} className="text-success" />
                    </div>
                    <p className="text-[28px] leading-none font-bold text-foreground">{pWon.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pWon.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Total perdidos</span>
                      <TrendingUp size={15} className="text-destructive" />
                    </div>
                    <p className="text-[28px] leading-none font-bold text-foreground">{pLost.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pLost.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Total em aberto</span>
                      <Clock size={15} className="text-primary" />
                    </div>
                    <p className="text-[28px] leading-none font-bold text-foreground">{pOpen.length}</p>
                    <p className="text-[12px] text-muted-foreground mt-2">{fmt(pOpen.reduce((s, l) => s + l.value, 0))}</p>
                  </div>
                  <div className="bg-card rounded-xl p-4" style={{ border: "1px solid hsl(var(--card-border))" }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Conversão do funil</span>
                      <TrendingUp size={15} className="text-success" />
                    </div>
                    <p className="text-[28px] leading-none font-bold text-foreground">
                      {firstCount > 0 ? `${((pWon.length / firstCount) * 100).toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-2">{pWon.length} ganhos de {firstCount} MQL</p>
                  </div>
                </div>

                <div className="bg-card border border-card-border rounded-xl p-6">
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
                          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} allowDecimals={false} />
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
                <div className="bg-card border border-card-border rounded-xl p-4">
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
                          const pipelineWon = wonInPeriod.filter(l => l.pipelineId === funnelPipeline!.id).length;
                          const pipelineLost = lostInPeriod.filter(l => l.pipelineId === funnelPipeline!.id).length;
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
  );
}
