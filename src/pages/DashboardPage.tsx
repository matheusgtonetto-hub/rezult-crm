import { useMemo, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, Users, CheckCircle, DollarSign, Clock, Trophy,
  MessageSquare, ArrowDown, Calendar, Phone, Mail, AlertTriangle,
  Activity as ActivityIcon, ChevronDown, ChevronRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Period = "7d" | "30d" | "90d" | "year";

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
    leads, columns, pipelines, products, teamMembers, memberColors, tasks, lossReasons,
  } = useCRM();

  const [period, setPeriod] = useState<Period>("30d");
  const [donutMode, setDonutMode] = useState<"value" | "count">("value");
  const [funnelPipelineId, setFunnelPipelineId] = useState<string>("");

  const allLeads = Object.values(leads);
  const wonLeads = allLeads.filter(l => l.dealStatus === "won");
  const lostLeads = allLeads.filter(l => l.dealStatus === "lost");

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const pct = (n: number, d: number) =>
    d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

  const periodCutoff = useMemo(() => {
    const now = new Date();
    if (period === "7d") return new Date(now.getTime() - 7 * 86400000);
    if (period === "30d") return new Date(now.getTime() - 30 * 86400000);
    if (period === "90d") return new Date(now.getTime() - 90 * 86400000);
    return new Date(now.getFullYear(), 0, 1);
  }, [period]);

  const periodLeads = useMemo(
    () => allLeads.filter(l => new Date(l.entryDate) >= periodCutoff),
    [allLeads, periodCutoff],
  );

  const { wonInPeriod, lostInPeriod, revenueInPeriod } = useMemo(() => {
    const wonIds = new Set<string>();
    const lostIds = new Set<string>();
    allLeads.forEach(lead => {
      lead.activities.forEach(act => {
        if (new Date(act.date) < periodCutoff) return;
        if (act.type === "won") wonIds.add(lead.id);
        if (act.type === "lost") lostIds.add(lead.id);
      });
    });
    const w = wonLeads.filter(l => wonIds.has(l.id));
    const lo = lostLeads.filter(l => lostIds.has(l.id));
    return { wonInPeriod: w, lostInPeriod: lo, revenueInPeriod: w.reduce((s, l) => s + l.value, 0) };
  }, [allLeads, wonLeads, lostLeads, periodCutoff]);

  const monthlyData = useMemo(() => {
    const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    const year = new Date().getFullYear();
    const data = months.map(mes => ({ mes, novos: 0, ganhos: 0, perdidos: 0 }));
    allLeads.forEach(lead => {
      const e = new Date(lead.entryDate);
      if (e.getFullYear() === year) data[e.getMonth()].novos++;
      lead.activities.forEach(act => {
        const d = new Date(act.date);
        if (d.getFullYear() !== year) return;
        if (act.type === "won") data[d.getMonth()].ganhos++;
        if (act.type === "lost") data[d.getMonth()].perdidos++;
      });
    });
    return data;
  }, [allLeads]);

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
    lostLeads.forEach(l => {
      const r = lossReasons.find(x => x.id === l.lossReasonId)?.name || "Sem motivo";
      map.set(r, (map.get(r) || 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [lostLeads, lossReasons]);

  const agentPerformance = useMemo(() => {
    return teamMembers.map(m => {
      const ml = allLeads.filter(l => l.responsible === m);
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
  }, [allLeads, teamMembers, memberColors]);

  const donutData = useMemo(() => {
    return teamMembers.map(m => {
      const ml = allLeads.filter(l => l.responsible === m);
      const value = donutMode === "value" ? ml.reduce((s, l) => s + l.value, 0) : ml.length;
      return { name: m, value, color: memberColors[m] || "#888" };
    }).filter(d => d.value > 0);
  }, [allLeads, teamMembers, memberColors, donutMode]);

  const barData = useMemo(() => columns.map(c => ({
    name: c.title, leads: c.leadIds.length, fill: c.color,
  })), [columns]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; count: number; value: number }>();
    allLeads.forEach(l => {
      if (!l.productId) return;
      const p = products.find(x => x.id === l.productId);
      if (!p) return;
      const cur = map.get(p.id) || { name: p.name, count: 0, value: 0 };
      cur.count++; cur.value += l.value;
      map.set(p.id, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [allLeads, products]);

  const activityStats = useMemo(() => {
    const allActs = allLeads.flatMap(l => l.activities.map(a => ({ ...a, leadName: l.name })));
    const inPeriod = allActs.filter(a => new Date(a.date) >= periodCutoff);
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
  }, [allLeads, periodCutoff]);

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
    const pipelineLeads = allLeads.filter(l => l.pipelineId === funnelPipeline.id);
    return stages.map((stage, i) => {
      const entered = new Set<string>();
      if (i === 0) pipelineLeads.forEach(l => { if (new Date(l.entryDate) >= periodCutoff) entered.add(l.id); });
      pipelineLeads.forEach(lead => {
        lead.activities.forEach(act => {
          if (act.type !== "stage_change" || new Date(act.date) < periodCutoff) return;
          const m = act.description.match(/para "(.+)"\./);
          if (m && m[1] === stage.title) entered.add(lead.id);
        });
      });
      const leadDetails = [...entered].map(id => ({
        id,
        name: leads[id]?.name ?? "Lead removido",
        responsible: leads[id]?.responsible ?? "",
      }));
      return { stage, count: entered.size, leadDetails };
    });
  }, [funnelPipeline, allLeads, leads, periodCutoff]);

  const tooltip = {
    backgroundColor: "hsl(var(--card))",
    border: "0.5px solid hsl(var(--card-border))",
    borderRadius: 8,
    color: "hsl(var(--foreground))",
    fontSize: 12,
  };

  const periodLabel = { "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", year: "este ano" }[period];

  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Período:</span>
          <Select value={period} onValueChange={v => setPeriod(v as Period)}>
            <SelectTrigger className="w-[160px] h-9 bg-card border-card-border rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Novos leads", value: periodLeads.length, sub: `nos últimos ${periodLabel}`, icon: Users, color: "text-primary" },
          { label: "Ganhos no período", value: wonInPeriod.length, sub: fmt(revenueInPeriod), icon: Trophy, color: "text-success" },
          { label: "Conversão", value: pct(wonInPeriod.length, wonInPeriod.length + lostInPeriod.length), sub: `${lostInPeriod.length} perdidos`, icon: TrendingUp, color: "text-foreground" },
          { label: "Atividades", value: activityStats.total, sub: `${activityStats.meetings} reuniões`, icon: ActivityIcon, color: "text-primary" },
        ].map(c => (
          <div key={c.label} className="bg-card rounded-xl p-4" style={{ border: "0.5px solid hsl(var(--card-border))" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{c.label}</span>
              <c.icon size={15} className={c.color} />
            </div>
            <p className="text-[28px] leading-none font-bold text-foreground">{c.value}</p>
            <p className="text-[12px] text-muted-foreground mt-2">{c.sub}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="negocios" className="space-y-6">
        <TabsList className="bg-card border border-card-border rounded-lg">
          <TabsTrigger value="negocios" className="rounded-md">Negócios</TabsTrigger>
          <TabsTrigger value="atividades" className="rounded-md">Atividades</TabsTrigger>
          <TabsTrigger value="funil" className="rounded-md">Funil</TabsTrigger>
        </TabsList>

        {/* ──────────── NEGÓCIOS ──────────── */}
        <TabsContent value="negocios" className="space-y-4 mt-0">
          {/* Monthly line */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Evolução mensal — {new Date().getFullYear()}
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
            <h3 className="text-sm font-semibold text-foreground mb-4">Desempenho dos atendentes</h3>
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
              <SelectTrigger className="w-[220px] h-9 bg-card border-card-border rounded-lg">
                <SelectValue placeholder="Selecionar pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!funnelPipeline ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-sm text-muted-foreground">Nenhum pipeline encontrado.</div>
          ) : funnelData.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-8 text-center text-sm text-muted-foreground">Este pipeline não possui etapas.</div>
          ) : (() => {
            const maxCount = Math.max(...funnelData.map(d => d.count), 1);
            const firstCount = funnelData[0]?.count ?? 0;
            const lastCount = funnelData[funnelData.length - 1]?.count ?? 0;
            const overallConv = firstCount > 0 ? `${((lastCount / firstCount) * 100).toFixed(1)}%` : "—";
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-card border border-card-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">Entradas no funil</p>
                    <p className="text-2xl font-bold text-foreground">{firstCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{funnelData[0]?.stage.title}</p>
                  </div>
                  <div className="bg-card border border-card-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">Conversão geral</p>
                    <p className="text-2xl font-bold text-foreground">{overallConv}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {funnelData[0]?.stage.title} → {funnelData[funnelData.length - 1]?.stage.title}
                    </p>
                  </div>
                  <div className="bg-card border border-card-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">Chegaram na última etapa</p>
                    <p className="text-2xl font-bold text-foreground">{lastCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{funnelData[funnelData.length - 1]?.stage.title}</p>
                  </div>
                </div>

                <div className="bg-card border border-card-border rounded-xl p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-5">Leads por etapa no período</h3>
                  <div className="space-y-1">
                    {funnelData.map((row, i) => {
                      const prev = funnelData[i - 1];
                      const convPct = prev && prev.count > 0 ? `${((row.count / prev.count) * 100).toFixed(1)}%` : null;
                      const barPct = (row.count / maxCount) * 100;
                      const isExpanded = expandedStage === row.stage.id;
                      return (
                        <div key={row.stage.id}>
                          {convPct !== null && (
                            <div className="flex items-center gap-2 py-1.5 pl-1">
                              <ArrowDown size={12} className="text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground">{convPct} de conversão</span>
                            </div>
                          )}
                          <div
                            className="flex items-center gap-3 cursor-pointer rounded-lg hover:bg-muted/40 px-1 transition-colors"
                            onClick={() => setExpandedStage(isExpanded ? null : row.stage.id)}
                          >
                            <div className="w-[180px] shrink-0 flex items-center gap-2">
                              {isExpanded
                                ? <ChevronDown size={13} className="text-muted-foreground shrink-0" />
                                : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.stage.color || "hsl(var(--primary))" }} />
                              <span className="text-sm text-foreground truncate font-medium">{row.stage.title}</span>
                            </div>
                            <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden">
                              <div
                                className="h-full rounded-lg transition-all duration-500"
                                style={{ width: `${barPct}%`, backgroundColor: row.stage.color || "hsl(var(--primary))", minWidth: row.count > 0 ? "4px" : "0" }}
                              />
                            </div>
                            <div className="w-16 text-right shrink-0">
                              <span className="text-sm font-semibold text-foreground">{row.count}</span>
                              <span className="text-xs text-muted-foreground ml-1">lead{row.count !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="ml-[196px] mt-1 mb-2 space-y-1">
                              {row.leadDetails.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-1">Nenhum lead encontrado.</p>
                              ) : (
                                row.leadDetails.map(l => (
                                  <div key={l.id} className="flex items-center gap-2 py-1 px-2 rounded-md bg-muted/40">
                                    <Users size={12} className="text-muted-foreground shrink-0" />
                                    <span className="text-xs text-foreground font-medium">{l.name}</span>
                                    {l.responsible && (
                                      <span className="text-xs text-muted-foreground ml-auto">{l.responsible}</span>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
