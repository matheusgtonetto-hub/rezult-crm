import { useState, useMemo, useRef, useEffect } from "react";
import { useCRM } from "@/context/CRMContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LeadDrawer } from "@/components/LeadDrawer";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import type { ActivityType } from "@/data/mockData";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type CalView = "dia" | "semana" | "mes";

interface CalEvent {
  id: string;
  title: string;
  type: string;
  leadId: string;
  leadName: string;
  scheduledAt: Date;
  durationMinutes: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const HOUR_H = 60; // px por hora
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const PT_DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PT_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DURATION_OPTS = [
  { v: "15",  l: "15 min" },
  { v: "30",  l: "30 min" },
  { v: "60",  l: "1 hora" },
  { v: "120", l: "2 horas" },
];

const TYPE_OPTS: { v: ActivityType; l: string }[] = [
  { v: "meeting",   l: "Reunião" },
  { v: "call",      l: "Call" },
  { v: "follow_up", l: "Follow-up" },
  { v: "task",      l: "Tarefa" },
];

const TYPE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  meeting:   { bg: "#DBEAFE", color: "#1D4ED8", border: "#3B82F6" },
  call:      { bg: "#D1FAE5", color: "#065F46", border: "#10B981" },
  follow_up: { bg: "#FEF3C7", color: "#92400E", border: "#F59E0B" },
  task:      { bg: "#EDE9FE", color: "#5B21B6", border: "#8B5CF6" },
};
const DEFAULT_STYLE = { bg: "#F3F4F6", color: "#374151", border: "#9CA3AF" };

// ─── Helpers de data (sem libs externas) ─────────────────────────────────────

function weekStart(d: Date): Date {
  const r = new Date(d);
  r.setDate(d.getDate() - d.getDay()); // domingo
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ─── Vista Mês ────────────────────────────────────────────────────────────────

interface MonthViewProps {
  cur: Date;
  today: Date;
  events: CalEvent[];
  onEvt: (e: CalEvent) => void;
}

function MonthView({ cur, today, events, onEvt }: MonthViewProps) {
  const ms = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const me = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
  const cs = addDays(ms, -ms.getDay());
  const ce = addDays(me, 6 - me.getDay());

  const days: Date[] = [];
  for (let d = new Date(cs); d <= ce; d = addDays(d, 1)) days.push(new Date(d));

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 12,
        border: "1px solid #E5E5E5",
        overflow: "hidden",
      }}
    >
      {/* Cabeçalho dos dias */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          background: "#FAFAFA",
          borderBottom: "1px solid #E5E5E5",
        }}
      >
        {PT_DAYS_SHORT.map(d => (
          <div
            key={d}
            className="text-center py-2 text-[11px] font-semibold"
            style={{ color: "#888" }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grade de dias */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {days.map(day => {
          const isToday = sameDay(day, today);
          const inMonth = sameMonth(day, cur);
          const dayEvts = events.filter(e => sameDay(e.scheduledAt, day));

          return (
            <div
              key={day.toISOString()}
              style={{
                minHeight: 100,
                padding: "6px 8px",
                borderRight: "1px solid #F0F0F0",
                borderBottom: "1px solid #F0F0F0",
              }}
            >
              <div className="flex justify-end mb-1">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    fontSize: 11,
                    fontWeight: isToday ? 700 : 400,
                    background: isToday ? "hsl(var(--primary))" : "transparent",
                    color: isToday ? "#FFFFFF" : inMonth ? "#111111" : "#CCCCCC",
                  }}
                >
                  {day.getDate()}
                </span>
              </div>

              <div className="space-y-0.5">
                {dayEvts.slice(0, 3).map(evt => {
                  const s = TYPE_STYLE[evt.type] ?? DEFAULT_STYLE;
                  return (
                    <button
                      key={evt.id}
                      onClick={() => onEvt(evt)}
                      className="w-full text-left rounded px-1.5 py-0.5 truncate transition-opacity hover:opacity-75"
                      style={{
                        background: s.bg,
                        color: s.color,
                        fontSize: 10,
                        fontWeight: 500,
                      }}
                    >
                      {pad2(evt.scheduledAt.getHours())}:{pad2(evt.scheduledAt.getMinutes())}{" "}
                      {evt.title}
                    </button>
                  );
                })}
                {dayEvts.length > 3 && (
                  <span className="text-[9px] px-1" style={{ color: "#AAAAAA" }}>
                    +{dayEvts.length - 3} mais
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Vista Semana / Dia (grade de horários) ───────────────────────────────────

interface TimeGridProps {
  view: "semana" | "dia";
  cur: Date;
  today: Date;
  events: CalEvent[];
  onEvt: (e: CalEvent) => void;
  gridRef: React.RefObject<HTMLDivElement>;
}

function TimeGridView({ view, cur, today, events, onEvt, gridRef }: TimeGridProps) {
  const ws = weekStart(cur);
  const days =
    view === "semana"
      ? Array.from({ length: 7 }, (_, i) => addDays(ws, i))
      : [cur];
  const cols = days.length;

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 12,
        border: "1px solid #E5E5E5",
        overflow: "hidden",
        height: "calc(100vh - 148px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Cabeçalho com dias */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `52px repeat(${cols}, 1fr)`,
          background: "#FAFAFA",
          borderBottom: "1px solid #E5E5E5",
          flexShrink: 0,
        }}
      >
        <div />
        {days.map(day => {
          const isToday = sameDay(day, today);
          return (
            <div key={day.toISOString()} className="text-center py-2">
              <div className="text-[11px] font-semibold" style={{ color: "#888" }}>
                {PT_DAYS_SHORT[day.getDay()]}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  margin: "2px auto 0",
                  background: isToday ? "hsl(var(--primary))" : "transparent",
                  color: isToday ? "#FFFFFF" : "#111111",
                  fontWeight: isToday ? 700 : 500,
                  fontSize: 13,
                }}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grade com scroll */}
      <div ref={gridRef} style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `52px repeat(${cols}, 1fr)`,
          }}
        >
          {/* Coluna de horários */}
          <div>
            {HOURS.map(h => (
              <div
                key={h}
                style={{
                  height: HOUR_H,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                  paddingRight: 8,
                  paddingTop: 4,
                  fontSize: 10,
                  color: "#AAAAAA",
                }}
              >
                {pad2(h)}:00
              </div>
            ))}
          </div>

          {/* Colunas de dia */}
          {days.map(day => {
            const isToday = sameDay(day, today);
            const dayEvts = events.filter(e => sameDay(e.scheduledAt, day));

            return (
              <div
                key={day.toISOString()}
                style={{
                  position: "relative",
                  borderLeft: "1px solid #F0F0F0",
                  background: isToday ? "#FAFFFD" : "#FFFFFF",
                  height: HOUR_H * 24,
                }}
              >
                {/* Linhas de hora */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    style={{
                      position: "absolute",
                      top: h * HOUR_H,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: "#F0F0F0",
                    }}
                  />
                ))}

                {/* Eventos */}
                {dayEvts.map(evt => {
                  const h = evt.scheduledAt.getHours();
                  const m = evt.scheduledAt.getMinutes();
                  const top = ((h * 60 + m) / 60) * HOUR_H;
                  const height = Math.max((evt.durationMinutes / 60) * HOUR_H, 22);
                  const s = TYPE_STYLE[evt.type] ?? DEFAULT_STYLE;

                  return (
                    <button
                      key={evt.id}
                      onClick={() => onEvt(evt)}
                      style={{
                        position: "absolute",
                        top,
                        height,
                        left: 3,
                        right: 3,
                        background: s.bg,
                        color: s.color,
                        borderRadius: 6,
                        borderLeft: `3px solid ${s.border}`,
                        padding: "2px 6px",
                        textAlign: "left",
                        overflow: "hidden",
                        fontSize: 11,
                        zIndex: 1,
                        cursor: "pointer",
                        transition: "opacity 0.15s",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "0.82";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          lineHeight: 1.3,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {evt.title}
                      </div>
                      {height >= 36 && (
                        <div style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.3 }}>
                          {pad2(h)}:{pad2(m)} · {evt.leadName}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { leads, addActivity } = useCRM();
  const [view, setView] = useState<CalView>("mes");
  const today = useMemo(() => new Date(), []);
  const [cur, setCur] = useState(() => new Date());
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "meeting" as ActivityType,
    leadId: "",
    scheduledAt: "",
    dur: "60",
  });
  const gridRef = useRef<HTMLDivElement>(null);

  // Rola para as 8h ao mudar de vista semana/dia
  useEffect(() => {
    if (view !== "mes" && gridRef.current) {
      gridRef.current.scrollTop = 8 * HOUR_H;
    }
  }, [view]);

  // Eventos derivados do estado CRM
  const calEvents = useMemo<CalEvent[]>(
    () =>
      Object.values(leads).flatMap(lead =>
        (lead.activities ?? [])
          .filter(a => !!a.scheduledAt)
          .map(a => ({
            id: a.id,
            title: a.title ?? a.description,
            type: a.type,
            leadId: lead.id,
            leadName: lead.name,
            scheduledAt: new Date(a.scheduledAt!),
            durationMinutes: a.durationMinutes ?? 60,
          }))
      ),
    [leads]
  );

  const leadList = useMemo(
    () => Object.values(leads).sort((a, b) => a.name.localeCompare(b.name)),
    [leads]
  );

  const navigate = (dir: 1 | -1) => {
    setCur(d => {
      const r = new Date(d);
      if (view === "mes") r.setMonth(r.getMonth() + dir);
      else if (view === "semana") r.setDate(r.getDate() + dir * 7);
      else r.setDate(r.getDate() + dir);
      return r;
    });
  };

  const periodLabel = () => {
    if (view === "mes") return `${PT_MONTHS[cur.getMonth()]} ${cur.getFullYear()}`;
    if (view === "semana") {
      const ws = weekStart(cur);
      const we = addDays(ws, 6);
      return `${pad2(ws.getDate())} ${PT_MONTHS[ws.getMonth()].slice(0, 3)} – ${pad2(we.getDate())} ${PT_MONTHS[we.getMonth()].slice(0, 3)} ${we.getFullYear()}`;
    }
    return `${pad2(cur.getDate())} de ${PT_MONTHS[cur.getMonth()]} de ${cur.getFullYear()}`;
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.leadId || !form.scheduledAt) {
      toast.error("Preencha título, lead e data/hora.");
      return;
    }
    addActivity(form.leadId, {
      type: form.type,
      description: form.title,
      title: form.title,
      date: new Date().toISOString(),
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      durationMinutes: Number(form.dur),
    });
    toast.success("Atividade agendada!");
    setShowModal(false);
    setForm({ title: "", type: "meeting", leadId: "", scheduledAt: "", dur: "60" });
  };

  return (
    <div
      style={{
        background: "#F4F6F8",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E5E5",
          padding: "14px 24px",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} style={{ color: "hsl(var(--primary))" }} />
            <h1 className="text-base font-semibold" style={{ color: "#111111" }}>
              Calendário
            </h1>
          </div>

          {/* Navegação */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              style={{ width: 28, height: 28 }}
            >
              <ChevronLeft size={15} className="text-muted-foreground" />
            </button>
            <button
              onClick={() => setCur(new Date())}
              className="text-xs px-2.5 py-1 rounded-md border transition-colors hover:bg-muted"
              style={{ borderColor: "#E5E5E5", color: "#555" }}
            >
              Hoje
            </button>
            <button
              onClick={() => navigate(1)}
              className="flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              style={{ width: 28, height: 28 }}
            >
              <ChevronRight size={15} className="text-muted-foreground" />
            </button>
          </div>

          <span className="text-sm font-semibold" style={{ color: "#111111" }}>
            {periodLabel()}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Toggle de vista */}
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: "1px solid #E5E5E5" }}
            >
              {(["dia", "semana", "mes"] as CalView[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="text-xs px-3 py-1.5 transition-colors"
                  style={{
                    background: view === v ? "hsl(var(--primary))" : "#FFFFFF",
                    color: view === v ? "#FFFFFF" : "#555",
                    fontWeight: view === v ? 600 : 400,
                  }}
                >
                  {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>

            <Button
              size="sm"
              className="h-8 rounded-md text-xs"
              style={{ background: "hsl(var(--primary))", color: "#FFFFFF" }}
              onClick={() => setShowModal(true)}
            >
              <Plus size={13} className="mr-1" /> Nova atividade
            </Button>
          </div>
        </div>
      </div>

      {/* Corpo do calendário */}
      <div className="flex-1 p-4 overflow-hidden">
        {view === "mes" && (
          <MonthView
            cur={cur}
            today={today}
            events={calEvents}
            onEvt={e => setDrawerLeadId(e.leadId)}
          />
        )}
        {(view === "semana" || view === "dia") && (
          <TimeGridView
            view={view}
            cur={cur}
            today={today}
            events={calEvents}
            onEvt={e => setDrawerLeadId(e.leadId)}
            gridRef={gridRef}
          />
        )}
      </div>

      <LeadDrawer
        leadId={drawerLeadId}
        open={!!drawerLeadId}
        onClose={() => setDrawerLeadId(null)}
      />

      {/* Modal Nova atividade */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nova atividade</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Título *
              </label>
              <Input
                placeholder="Ex: Reunião de alinhamento"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Tipo
              </label>
              <Select
                value={form.type}
                onValueChange={v => setForm(f => ({ ...f, type: v as ActivityType }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTS.map(o => (
                    <SelectItem key={o.v} value={o.v}>
                      {o.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Lead *
              </label>
              <Select
                value={form.leadId}
                onValueChange={v => setForm(f => ({ ...f, leadId: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecionar lead…" />
                </SelectTrigger>
                <SelectContent>
                  {leadList.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Data e hora *
                </label>
                <Input
                  type="datetime-local"
                  className="h-9 text-sm"
                  value={form.scheduledAt}
                  onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Duração
                </label>
                <Select
                  value={form.dur}
                  onValueChange={v => setForm(f => ({ ...f, dur: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTS.map(o => (
                      <SelectItem key={o.v} value={o.v}>
                        {o.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              style={{ background: "hsl(var(--primary))", color: "#FFFFFF" }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
