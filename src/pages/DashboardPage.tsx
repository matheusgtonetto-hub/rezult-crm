import { useCRM } from "@/context/CRMContext";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, CheckCircle, DollarSign } from "lucide-react";

export default function DashboardPage() {
  const { leads, columns } = useCRM();
  const allLeads = Object.values(leads);

  const activeLeads = allLeads.filter(l => l.stage !== "fechado" && l.stage !== "perdido").length;
  const closedLeads = allLeads.filter(l => l.stage === "fechado").length;
  const totalLeads = allLeads.filter(l => l.stage !== "perdido").length;
  const conversionRate = totalLeads > 0 ? ((closedLeads / totalLeads) * 100).toFixed(1) : "0";
  const forecastRevenue = allLeads.filter(l => l.stage !== "fechado" && l.stage !== "perdido").reduce((s, l) => s + l.value, 0);

  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const barData = columns.map(c => ({ name: c.title, leads: c.leadIds.length }));

  const lineData = [
    { day: "01/04", fechados: 0 }, { day: "05/04", fechados: 0 }, { day: "08/04", fechados: 1 },
    { day: "10/04", fechados: 1 }, { day: "12/04", fechados: 1 },
  ];

  const topLeads = [...allLeads].sort((a, b) => b.value - a.value).slice(0, 5);

  const metrics = [
    { label: "Leads Ativos", value: activeLeads, icon: Users, color: "text-primary" },
    { label: "Fechados no Mês", value: closedLeads, icon: CheckCircle, color: "text-success" },
    { label: "Taxa de Conversão", value: `${conversionRate}%`, icon: TrendingUp, color: "text-primary" },
    { label: "Receita Prevista", value: formatCurrency(forecastRevenue), icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="bg-card border border-card-border rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <m.icon size={20} className={m.color} />
              <span className="text-sm text-muted-foreground">{m.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Leads por etapa</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
              <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: "#888", fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 8, color: "#fff" }} />
              <Bar dataKey="leads" fill="#C9A84C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">Leads fechados (últimos 30 dias)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
              <XAxis dataKey="day" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: "#888", fontSize: 11 }} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 8, color: "#fff" }} />
              <Line type="monotone" dataKey="fechados" stroke="#C9A84C" strokeWidth={2} dot={{ fill: "#C9A84C" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Top 5 leads por valor</h3>
        <div className="space-y-3">
          {topLeads.map((lead, i) => (
            <div key={lead.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{lead.name} {lead.company ? `· ${lead.company}` : ""}</p>
                <p className="text-xs text-muted-foreground">{columns.find(c => c.id === lead.stage)?.title}</p>
              </div>
              <span className="text-sm font-semibold text-primary">{formatCurrency(lead.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
