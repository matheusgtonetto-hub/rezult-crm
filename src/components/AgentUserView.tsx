import { useState } from "react";
import {
  Sparkles,
  Clock,
  Info,
  X,
  LogIn,
  MessageCircle,
  CheckCircle2,
  CalendarPlus,
  FileEdit,
  ArrowRight,
  Send,
  Repeat,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Role = "SDR" | "Closer";

interface Props {
  role?: Role;
  userName?: string;
}

const SDR_METRICS = [
  { label: "Leads qualificados", value: 8 },
  { label: "Reuniões agendadas", value: 3 },
  { label: "Mensagens WPP", value: 47 },
  { label: "Cards preenchidos", value: 12 },
];

const CLOSER_METRICS = [
  { label: "Calls realizadas", value: 4 },
  { label: "Propostas enviadas", value: 2 },
  { label: "Follow-ups", value: 8 },
  { label: "Negócios avançados", value: 3 },
];

const ACTIVITIES = [
  { time: "09h15", icon: LogIn,        text: "Login no Rezult",                            lead: null },
  { time: "09h22", icon: MessageCircle, text: "Conversa iniciada",                         lead: "Carlos Andrade (WPP)" },
  { time: "10h05", icon: CheckCircle2,  text: "Lead qualificado",                          lead: "Isabela Martins" },
  { time: "10h45", icon: CalendarPlus,  text: "Reunião agendada",                          lead: "João Pereira — 22/04 14h" },
  { time: "11h30", icon: FileEdit,      text: "Card atualizado",                           lead: "Bruno Lima (3 campos)" },
  { time: "14h00", icon: MessageCircle, text: "Conversa iniciada",                         lead: "Diego Ferreira (WPP)" },
  { time: "15h20", icon: ArrowRight,    text: "Lead movido",                               lead: "Carlos Andrade → Proposta Enviada" },
  { time: "16h45", icon: Send,          text: "Proposta enviada",                          lead: "Carlos Andrade" },
  { time: "17h30", icon: Repeat,        text: "Follow-up registrado",                      lead: "Mariana Costa" },
  { time: "18h30", icon: LogOut,        text: "Logout — relatório gerado pelo agente",     lead: null },
];

const WEEK = [
  { day: "Seg", time: "7h20", leads: 10, score: 8.8 },
  { day: "Ter", time: "6h45", leads: 9,  score: 8.1 },
  { day: "Qua", time: "5h30", leads: 6,  score: 6.4 },
  { day: "Qui", time: "7h00", leads: 8,  score: 7.9 },
  { day: "Sex", time: "6h12", leads: 8,  score: 8.2 },
];

const REPORT_SECTIONS = [
  {
    label: "Resumo do dia",
    color: "hsl(var(--muted-foreground))",
    text: "Hoje você ficou ativo por 6h12min no Rezult. Qualificou 8 leads, agendou 3 reuniões e respondeu 47 mensagens no WhatsApp. Sua taxa de qualificação hoje foi de 67% — dentro da meta.",
  },
  {
    label: "Destaques",
    color: "hsl(var(--primary))",
    text: "Carlos Andrade avançou para Proposta Enviada após qualificação completa. Mariana Costa tem reunião confirmada para amanhã às 10h.",
  },
  {
    label: "Pontos de atenção",
    color: "#D97706",
    text: "2 leads estão sem resposta há mais de 3 dias (Bruno Lima e Diego Ferreira). Recomendo abordagem de reativação amanhã cedo.",
  },
  {
    label: "Meta para amanhã",
    color: "#378ADD",
    text: "Sua meta é qualificar 10 leads. Com base no seu ritmo de hoje, você precisará de 7h30min de atividade para atingir.",
  },
];

function scoreColor(score: number | null) {
  if (score === null) return "#E5E5E5";
  if (score >= 9)  return "#0F6E56";
  if (score >= 7)  return "#34C77B";
  if (score >= 5)  return "#F59E0B";
  return "#E24B4A";
}

function useBannerDismissed() {
  const KEY = "agent-monitoring-banner-dismissed";
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  function dismiss() {
    try { localStorage.setItem(KEY, "1"); } catch { /* noop */ }
    setDismissed(true);
  }
  return [dismissed, dismiss] as const;
}

export default function AgentUserView({ role = "SDR", userName = "Carlos Andrade" }: Props) {
  const [bannerDismissed, dismissBanner] = useBannerDismissed();
  const metrics   = role === "SDR" ? SDR_METRICS : CLOSER_METRICS;
  const firstName = userName.split(" ")[0];

  const monthDays = Array.from({ length: 30 }, (_, i) => {
    const dow      = (i + 2) % 7;
    const isWeekend = dow === 0 || dow === 6;
    const score    = isWeekend ? null : parseFloat((Math.random() * 5 + 5).toFixed(1));
    return { day: i + 1, score };
  });

  const mockReports = Array.from({ length: 8 }, (_, i) => {
    const score = parseFloat((Math.random() * 4 + 6).toFixed(1));
    const date  = new Date();
    date.setDate(date.getDate() - i);
    const h = Math.floor(Math.random() * 3 + 5);
    const m = Math.floor(Math.random() * 50);
    return { date, score, time: `${h}h${String(m).padStart(2, "0")}min` };
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[hsl(var(--foreground))] leading-tight">Meu Agente</h1>
        <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-1">
          Acompanhe sua produtividade e os relatórios gerados pelo seu agente
        </p>
      </div>

      {/* Monitoring banner */}
      {!bannerDismissed && (
        <div
          className="mb-5 rounded-[10px] p-[14px] flex items-start gap-3"
          style={{ background: "hsl(var(--info-soft))", border: "1px solid #378ADD" }}
        >
          <Info size={18} color="#378ADD" className="shrink-0 mt-0.5" />
          <p className="flex-1 text-[13px] text-[hsl(var(--info-soft-fg))] leading-relaxed">
            Seu agente monitora sua atividade no Rezult para gerar relatórios de produtividade.
            Gestores recebem resumos diários e semanais. Todas as métricas são baseadas em
            atividades reais na plataforma.
          </p>
          <button
            onClick={dismissBanner}
            className="text-[12px] font-semibold text-[#378ADD] hover:text-[hsl(var(--info-soft-fg))] transition-colors px-2 py-0.5 rounded hover:bg-card/50 shrink-0"
          >
            Entendi
          </button>
          <button onClick={dismissBanner} className="text-[#378ADD] hover:text-[hsl(var(--info-soft-fg))] shrink-0 transition-colors">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-[340px_1fr] gap-6">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-4">

          {/* Meu Agente card */}
          <div className="bg-card border border-[hsl(var(--border))] rounded-xl shadow-elev-1 p-5">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "hsl(var(--success-soft))" }}
              >
                {role === "SDR" || role === "Closer"
                  ? <UserIcon size={22} color="hsl(var(--primary))" />
                  : <Sparkles size={22} color="hsl(var(--primary))" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-[hsl(var(--foreground))] truncate">
                  Agent {role} — {firstName}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{
                      background: role === "SDR" ? "#854F0B" : "#185FA5",
                      color: "#FFF",
                    }}
                  >
                    {role}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-[hsl(var(--primary))]">
                    <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] inline-block" />
                    Ativo
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[12px] text-[hsl(var(--muted-foreground))] mt-3 leading-relaxed">
              Seu supervisor de inteligência comercial
            </p>
          </div>

          {/* Produtividade de Hoje */}
          <div
            className="rounded-xl p-5"
            style={{ background: "hsl(var(--success-soft))", border: "1px solid hsl(var(--primary))" }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} color="hsl(var(--primary))" />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[hsl(var(--primary))]">Produtividade de Hoje</div>
                <div className="text-[11px] text-[hsl(var(--primary))]/70">
                  {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                </div>
              </div>
            </div>

            {/* Tempo ativo */}
            <div className="text-[30px] font-bold text-[hsl(var(--primary))] leading-none">6h 12min</div>
            <div className="text-[12px] text-[hsl(var(--primary))]/80 mt-1">Tempo ativo no Rezult</div>
            <div className="mt-2">
              <Progress value={77} className="h-1.5 bg-card/60" />
              <div className="text-[10px] text-[hsl(var(--primary))]/70 mt-1">Meta diária 8h — 77% atingido</div>
            </div>

            {/* Grid métricas 2x2 */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {metrics.map(m => (
                <div key={m.label} className="bg-card rounded-lg p-2.5">
                  <div className="text-[20px] font-bold text-[hsl(var(--foreground))] leading-none">{m.value}</div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 leading-tight">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Score do dia */}
            <div className="mt-4 bg-card rounded-lg p-3.5 text-center">
              <div className="flex items-baseline justify-center gap-0.5">
                <span className="text-[34px] font-bold leading-none" style={{ color: "hsl(var(--primary))" }}>8.2</span>
                <span className="text-[15px] font-normal" style={{ color: "hsl(var(--muted-foreground))" }}>/10</span>
              </div>
              <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">Score do agente hoje</div>
              <Progress value={82} className="h-1.5 mt-2" />
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div>
          <Tabs defaultValue="hoje">
            <TabsList className="bg-card border border-[hsl(var(--border))] p-1 rounded-lg">
              {[
                { v: "hoje",      l: "Relatório de Hoje" },
                { v: "semana",    l: "Esta Semana" },
                { v: "historico", l: "Histórico" },
              ].map(t => (
                <TabsTrigger
                  key={t.v}
                  value={t.v}
                  className="data-[state=active]:bg-[hsl(var(--muted))] data-[state=active]:text-[hsl(var(--primary))] data-[state=active]:shadow-none text-[13px]"
                >
                  {t.l}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── ABA HOJE ── */}
            <TabsContent value="hoje" className="mt-4 space-y-4">
              {/* Relatório principal */}
              <div
                className="rounded-xl p-5"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
              >
                {/* Header do card */}
                <div className="flex items-start gap-2 mb-5">
                  <Sparkles size={16} color="hsl(var(--primary))" className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-[hsl(var(--foreground))]">
                      Relatório do Agent {role}
                    </div>
                    <div className="text-[12px] text-[hsl(var(--muted-foreground))] mt-0.5">Gerado hoje às 18h30</div>
                  </div>
                  <Badge
                    style={{ background: "hsl(var(--success-soft))", color: "hsl(var(--primary))" }}
                    className="border-0 text-[11px]"
                  >
                    Relatório diário
                  </Badge>
                </div>

                {/* Parágrafos */}
                {REPORT_SECTIONS.map((p, i) => (
                  <div key={p.label} className={i < REPORT_SECTIONS.length - 1 ? "mb-5" : ""}>
                    <div
                      className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
                      style={{ color: p.color }}
                    >
                      {p.label}
                    </div>
                    <p className="text-[13px] text-[hsl(var(--foreground))] leading-relaxed">{p.text}</p>
                  </div>
                ))}
              </div>

              {/* Timeline de atividades */}
              <div className="bg-card border border-[hsl(var(--border))] rounded-xl shadow-elev-1 p-5">
                <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))] mb-4">
                  Atividades registradas hoje
                </h3>
                <div className="space-y-3">
                  {ACTIVITIES.map((a, i) => {
                    const Ico = a.icon;
                    const isLast = i === ACTIVITIES.length - 1;
                    return (
                      <div key={i} className="flex items-start gap-3 relative">
                        {/* Linha vertical da timeline */}
                        {!isLast && (
                          <div
                            className="absolute left-[47px] top-7 bottom-[-12px] w-px"
                            style={{ background: "hsl(var(--muted))" }}
                          />
                        )}
                        <div className="text-[11px] text-[hsl(var(--muted-foreground))] font-mono w-10 shrink-0 pt-1">
                          {a.time}
                        </div>
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10"
                          style={{ background: "hsl(var(--muted))" }}
                        >
                          <Ico size={13} color="hsl(var(--primary))" />
                        </div>
                        <div className="flex-1 text-[13px] text-[hsl(var(--foreground))] pt-1">
                          {a.text}
                          {a.lead && (
                            <>
                              {": "}
                              <button className="text-[hsl(var(--primary))] hover:underline">
                                {a.lead}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* ── ABA SEMANA ── */}
            <TabsContent value="semana" className="mt-4 space-y-4">
              <div className="bg-card border border-[hsl(var(--border))] rounded-xl shadow-elev-1 p-5">
                <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))] mb-4">Score por dia</h3>

                {/* Gráfico de barras */}
                <div className="flex items-end gap-4 h-[160px] pb-6 border-b border-[hsl(var(--border))]">
                  {WEEK.map((d, i) => {
                    const isToday = i === WEEK.length - 1;
                    const hPct    = (d.score / 10) * 100;
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                        <div className="text-[11px] font-semibold" style={{ color: isToday ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>
                          {d.score}
                        </div>
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: `${hPct}%`,
                            background: isToday ? "hsl(var(--primary-hover))" : "hsl(var(--success-soft))",
                          }}
                        />
                        <div className="text-[11px]" style={{ color: isToday ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                          {d.day}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tabela resumo */}
                <table className="w-full mt-4 text-[12px]">
                  <thead>
                    <tr className="text-left text-[hsl(var(--muted-foreground))]">
                      <th className="py-2 font-medium">Dia</th>
                      <th className="py-2 font-medium">Tempo ativo</th>
                      <th className="py-2 font-medium">Leads</th>
                      <th className="py-2 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEEK.map((d, i) => {
                      const isToday = i === WEEK.length - 1;
                      return (
                        <tr key={d.day} className="border-t border-[hsl(var(--border))]">
                          <td className="py-2 font-semibold" style={{ color: isToday ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>{d.day}</td>
                          <td className="py-2 text-[hsl(var(--muted-foreground))]">{d.time}</td>
                          <td className="py-2 text-[hsl(var(--muted-foreground))]">{d.leads}</td>
                          <td className="py-2 font-semibold" style={{ color: scoreColor(d.score) }}>{d.score}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cards de médias */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Tempo médio", value: "6h33", sub: "/dia" },
                  { label: "Leads/dia",   value: "8.2",  sub: "" },
                  { label: "Score médio", value: "7.9",  sub: "/10" },
                ].map(c => (
                  <div
                    key={c.label}
                    className="bg-card border border-[hsl(var(--border))] rounded-xl shadow-elev-1 p-4"
                  >
                    <div className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide">{c.label}</div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-[24px] font-bold text-[hsl(var(--foreground))]">{c.value}</span>
                      {c.sub && <span className="text-[12px] text-[hsl(var(--muted-foreground))]">{c.sub}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── ABA HISTÓRICO ── */}
            <TabsContent value="historico" className="mt-4 space-y-4">
              {/* Calendário */}
              <div className="bg-card border border-[hsl(var(--border))] rounded-xl shadow-elev-1 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))]">Calendário de produtividade</h3>
                  <select className="text-[12px] border border-[hsl(var(--border))] rounded-md px-2 py-1 bg-card text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]">
                    <option>Abril 2026</option>
                    <option>Março 2026</option>
                    <option>Fevereiro 2026</option>
                  </select>
                </div>

                {/* Grid labels */}
                <div className="grid grid-cols-7 gap-1.5 mb-1">
                  {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                    <div key={i} className="text-center text-[10px] text-[hsl(var(--muted-foreground))] font-medium">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {monthDays.map(d => (
                    <div
                      key={d.day}
                      className="aspect-square rounded-md flex flex-col items-center justify-center text-[10px] font-medium cursor-default select-none"
                      style={{
                        background: d.score === null ? "hsl(var(--background))" : scoreColor(d.score),
                        color: d.score === null ? "hsl(var(--muted-foreground))" : "#FFFFFF",
                      }}
                      title={d.score !== null ? `Score ${d.score}` : "Sem atividade"}
                    >
                      <span>{d.day}</span>
                      {d.score !== null && (
                        <span className="text-[8px] opacity-90 leading-none mt-0.5">{d.score}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Legenda */}
                <div className="flex items-center gap-4 mt-4 text-[10px] text-[hsl(var(--muted-foreground))] flex-wrap">
                  {[
                    { c: "#0F6E56", l: "9+" },
                    { c: "#34C77B", l: "7–8.9" },
                    { c: "#F59E0B", l: "5–6.9" },
                    { c: "#E24B4A", l: "< 5" },
                    { c: "#F5F5F5", l: "Sem atividade" },
                  ].map(le => (
                    <div key={le.l} className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded"
                        style={{ background: le.c, border: le.c === "hsl(var(--border))" ? "1px solid hsl(var(--border))" : "none" }}
                      />
                      {le.l}
                    </div>
                  ))}
                </div>
              </div>

              {/* Lista últimos relatórios */}
              <div className="bg-card border border-[hsl(var(--border))] rounded-xl shadow-elev-1 p-5">
                <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))] mb-3">Últimos relatórios</h3>
                <div className="space-y-0">
                  {mockReports.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2.5 border-b border-[hsl(var(--border))] last:border-0"
                    >
                      <div className="text-[12px] text-[hsl(var(--muted-foreground))] w-24 shrink-0">
                        {r.date.toLocaleDateString("pt-BR")}
                      </div>
                      <div className="text-[12px] text-[hsl(var(--muted-foreground))] flex-1">
                        {r.time} ativo
                      </div>
                      <div
                        className="text-[13px] font-semibold w-10 text-right"
                        style={{ color: scoreColor(r.score) }}
                      >
                        {r.score}
                      </div>
                      {r.score >= 9 && (
                        <Badge
                          style={{ background: "hsl(var(--success-soft))", color: "hsl(var(--primary))" }}
                          className="border-0 text-[10px]"
                        >
                          Destaque
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
