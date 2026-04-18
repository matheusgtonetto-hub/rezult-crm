import { useMemo, useState } from "react";
import { useCRM } from "@/context/CRMContext";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, Users, CheckCircle, DollarSign, XCircle, Clock, Trophy, MessageSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Period = "7d" | "30d" | "90d" | "year";

export default function DashboardPage() {
  const { leads, columns, pipelines, products, teamMembers, memberColors, tasks } = useCRM();
  const [period, setPeriod] = useState<Period>("30d");
  const [donutMode, setDonutMode] = useState<"value" | "count">("value");

  const allLeads = Object.values(leads);

  const isWon = (stage: string) => /fechado|ganho|recuperado/i.test(stage);
  const isLost = (stage: string) => /perdido/i.test(stage);

  const wonLeads = allLeads.filter(l => isWon(l.stage));
  const lostLeads = allLeads.filter(l => isLost(l.stage));
  const openLeads = allLeads.filter(l => !isWon(l.stage) && !isLost(l.stage));

  const totalValue = allLeads.reduce((s, l) => s + l.value, 0);
  const wonValue = wonLeads.reduce((s, l) => s + l.value, 0);
  const lostValue = lostLeads.reduce((s, l) => s + l.value, 0);
  const openValue = openLeads.reduce((s, l) => s + l.value, 0);

  const conversionRate = (wonLeads.length + lostLeads.length) > 0
    ? ((wonLeads.length / (wonLeads.length + lostLeads.length)) * 100).toFixed(1)
    : "0";

  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const cards = [
    { label: "Total de Negócios", value: allLeads.length, sub: formatCurrency(totalValue), icon: DollarSign, color: "text-foreground" },
    { label: "Ganhos", value: wonLeads.length, sub: formatCurrency(wonValue), icon: Trophy, color: "text-success" },
    { label: "Perdidos", value: lostLeads.length, sub: formatCurrency(lostValue), icon: XCircle, color: "text-destructive" },
    { label: "Em aberto", value: openLeads.length, sub: formatCurrency(openValue), icon: Clock, color: "text-primary" },
  ];

  const summaryCards = [
    { label: "Leads Ativos", value: openLeads.length, icon: Users },
    { label: "Fechados", value: wonLeads.length, icon: CheckCircle },
    { label: "Conversão", value: `${conversionRate}%`, icon: TrendingUp },
    { label: "Receita Prevista", value: formatCurrency(openValue), icon: DollarSign },
  ];

  // Bar: leads by stage in active pipeline
  const barData = columns.map(c => ({ name: c.title, leads: c.leadIds.length, fill: c.color }));

  // Line: closed over time (mock by month)
  const lineData = useMemo(() => {
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return months.map((m, i) => ({
      mes: m,
      ganhos: Math.max(0, Math.round(2 + Math.sin(i / 1.5) * 3 + (i === 3 ? wonLeads.length : 0))),
    }));
  }, [wonLeads.length]);

  // Donut by responsible
  const donutData = useMemo(() => {
    return teamMembers.map(member => {
      const memberLeads = allLeads.filter(l => l.responsible === member);
      const value = donutMode === "value"
        ? memberLeads.reduce((s, l) => s + l.value, 0)
        : memberLeads.length;
      return { name: member, value, color: memberColors[member] || "#888" };
    }).filter(d => d.value > 0);
  }, [allLeads, teamMembers, memberColors, donutMode]);

  // Top products
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; count: number; value: number }>();
    allLeads.forEach(l => {
      if (!l.productId) return;
      const p = products.find(x => x.id === l.productId);
      if (!p) return;
      const cur = map.get(p.id) || { name: p.name, count: 0, value: 0 };
      cur.count += 1;
      cur.value += l.value;
      map.set(p.id, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [allLeads, products]);

  // Top agents
  const topAgents = useMemo(() => {
    return teamMembers.map(m => {
      const mLeads = allLeads.filter(l => l.responsible === m);
      return {
        name: m,
        count: mLeads.length,
        won: mLeads.filter(l => isWon(l.stage)).length,
        value: mLeads.reduce((s, l) => s + l.value, 0),
        color: memberColors[m] || "#888",
      };
    }).sort((a, b) => b.value - a.value);
  }, [allLeads, teamMembers, memberColors]);

  // Activities aggregated
  const activitiesData = useMemo(() => {
    const all = allLeads.flatMap(l => l.activities.map(a => ({ ...a, lead: l.name })));
    const byType = new Map<string, number>();
    all.forEach(a => byType.set(a.type, (byType.get(a.type) || 0) + 1));
    return {
      total: all.length,
      byType: [...byType.entries()].map(([type, count]) => ({ type, count })),
      recent: all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
    };
  }, [allLeads]);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "0.5px solid hsl(var(--card-border))",
    borderRadius: 8,
    color: "hsl(var(--foreground))",
    fontSize: 12,
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Período:</span>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
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

      <Tabs defaultValue="negocios" className="space-y-6">
        <TabsList className="bg-card border border-card-border rounded-lg">
          <TabsTrigger value="negocios" className="rounded-md">Negócios</TabsTrigger>
          <TabsTrigger value="atividades" className="rounded-md">Atividades</TabsTrigger>
        </TabsList>

        <TabsContent value="negocios" className="space-y-6 mt-0">
          {/* 4 main cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map(c => (
              <div key={c.label} className="bg-card border border-card-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <c.icon size={18} className={c.color} />
                  <span className="text-xs text-muted-foreground">{c.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryCards.map(s => (
              <div key={s.label} className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-3">
                <s.icon size={18} className="text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold text-foreground">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Leads por etapa</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="leads" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Negócios por atendente</h3>
                <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => setDonutMode("value")}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${donutMode === "value" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >Valor</button>
                  <button
                    onClick={() => setDonutMode("count")}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${donutMode === "count" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >Quantidade</button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => donutMode === "value" ? formatCurrency(v) : `${v} negócios`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Negócios fechados ao longo do ano</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="ganhos" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top products + top agents */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Produtos com mais negócios</h3>
              {topProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum produto vinculado a negócios ainda.</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.count} negócio{p.count > 1 ? "s" : ""}</p>
                      </div>
                      <span className="text-sm font-semibold text-primary">{formatCurrency(p.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Atendentes com mais negócios</h3>
              <div className="space-y-3">
                {topAgents.map((a, i) => (
                  <div key={a.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white" style={{ backgroundColor: a.color }}>
                      {a.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.count} negócios · {a.won} ganhos</p>
                    </div>
                    <span className="text-sm font-semibold text-primary">{formatCurrency(a.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="atividades" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={18} className="text-primary" />
                <span className="text-xs text-muted-foreground">Total de atividades</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{activitiesData.total}</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={18} className="text-success" />
                <span className="text-xs text-muted-foreground">Tarefas concluídas</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{tasks.filter(t => t.status === "Concluída").length}</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={18} className="text-primary" />
                <span className="text-xs text-muted-foreground">Tarefas pendentes</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{tasks.filter(t => t.status === "Pendente").length}</p>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy size={18} className="text-success" />
                <span className="text-xs text-muted-foreground">Negócios fechados</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{wonLeads.length}</p>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Atividades por tipo</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={activitiesData.byType}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--card-border))" />
                <XAxis dataKey="type" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Atividades recentes</h3>
            <div className="space-y-3">
              {activitiesData.recent.map(a => (
                <div key={a.id} className="flex items-start gap-3 pb-3 border-b border-card-border last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <MessageSquare size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.lead} · {a.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
