import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";
import { ActivityDialog } from "@/components/ActivityDialog";
import type { ActivitySubmitData } from "@/components/ActivityDialog";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { checkGoogleConnection } from "@/lib/googleOAuth";
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
  userName?: string;
  isCompleted: boolean;
  isNoShow: boolean;
  gcalEventId?: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const HOUR_H = 60; // px por hora
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const PT_DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PT_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "110px" }}>
        {days.map(day => {
          const isToday = sameDay(day, today);
          const inMonth = sameMonth(day, cur);
          const dayEvts = events.filter(e => sameDay(e.scheduledAt, day));

          return (
            <div
              key={day.toISOString()}
              style={{
                height: 110,
                overflow: "hidden",
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
                  const now = new Date();
                  const overdue = !evt.isCompleted && !evt.isNoShow && evt.scheduledAt < now;
                  const s = overdue
                    ? { bg: "#FEE2E2", color: "#B91C1C" }
                    : evt.isCompleted
                    ? { bg: "#D1FAE5", color: "#065F46" }
                    : evt.isNoShow
                    ? { bg: "#FEE2E2", color: "#991B1B" }
                    : (TYPE_STYLE[evt.type] ?? DEFAULT_STYLE);
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

  const hasEventsInPeriod = days.some(day => events.some(e => sameDay(e.scheduledAt, day)));

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
        position: "relative",
      }}
    >
      {!hasEventsInPeriod && events.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          <CalendarDays size={32} style={{ color: "#CCCCCC" }} />
          <p style={{ fontSize: 14, color: "#AAAAAA", fontWeight: 500 }}>Nenhuma atividade agendada</p>
          <p style={{ fontSize: 12, color: "#CCCCCC" }}>Clique em "Nova atividade" para agendar uma reunião ou tarefa</p>
        </div>
      )}
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
                  const now = new Date();
                  const overdue = !evt.isCompleted && !evt.isNoShow && evt.scheduledAt < now;
                  const s = overdue
                    ? { bg: "#FEE2E2", color: "#B91C1C", border: "#F87171" }
                    : evt.isCompleted
                    ? { bg: "#D1FAE5", color: "#065F46", border: "#34D399" }
                    : evt.isNoShow
                    ? { bg: "#FEE2E2", color: "#991B1B", border: "#F87171" }
                    : (TYPE_STYLE[evt.type] ?? DEFAULT_STYLE);

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
  const navigate = useNavigate();
  const { leads, addActivity, patchActivity, deleteActivity, teamMembers, memberEmails, memberAvatars, memberColors, crmLoading } = useCRM();
  const { profile } = useProfile();
  const { company } = useCompany();
  const [view, setView] = useState<CalView>("semana");
  const today = useMemo(() => new Date(), []);
  const [cur, setCur] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const [syncing, setSyncing] = useState(false);

  const myName = profile?.full_name ?? "";
  const [selectedUsers, setSelectedUsers] = useState<string[]>(() =>
    profile?.full_name ? [profile.full_name] : []
  );
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const userPickerRef = useRef<HTMLDivElement>(null);

  // Sincroniza seleção inicial quando o profile carrega
  useEffect(() => {
    if (myName && selectedUsers.length === 0) {
      setSelectedUsers([myName]);
    }
  }, [myName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync Google Calendar → CRM: verifica diretamente cada evento e remove os deletados
  const syncFromGoogle = useCallback(async (showToast = false) => {
    if (!company) return;
    const conn = await checkGoogleConnection(company.id);
    if (!conn) return;

    // Coleta todos os gcal_event_ids das atividades carregadas
    const tracked: { leadId: string; activityId: string; gcalEventId: string }[] = [];
    Object.values(leads).forEach(lead => {
      (lead.activities ?? []).forEach(act => {
        if (act.gcalEventId) {
          tracked.push({ leadId: lead.id, activityId: act.id, gcalEventId: act.gcalEventId });
        }
      });
    });

    if (tracked.length === 0) return; // nada para verificar

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { event_ids: tracked.map(t => t.gcalEventId), company_id: company.id },
      });

      if (error || !data?.success) {
        if (showToast) toast.error("Erro ao sincronizar com o Google Calendar.");
        return;
      }

      const deletedIds: string[] = data.deleted_event_ids ?? [];
      if (deletedIds.length === 0) {
        if (showToast) toast.success("Calendário sincronizado. Nenhuma alteração encontrada.");
        return;
      }

      const toDelete = tracked.filter(t => deletedIds.includes(t.gcalEventId));
      toDelete.forEach(({ leadId, activityId }) => deleteActivity(leadId, activityId));

      if (showToast) {
        toast.success(`${toDelete.length} atividade${toDelete.length > 1 ? "s removidas" : " removida"} (deletada${toDelete.length > 1 ? "s" : ""} no Google Calendar).`);
      }
    } catch {
      if (showToast) toast.error("Erro ao sincronizar com o Google Calendar.");
    } finally {
      setSyncing(false);
    }
  }, [leads, deleteActivity, company]);

  // Mantém referência atualizada para não precisar recriar o event listener
  const syncFromGoogleRef = useRef(syncFromGoogle);
  useEffect(() => { syncFromGoogleRef.current = syncFromGoogle; }, [syncFromGoogle]);

  // Auto-sync silencioso ao carregar o calendário
  useEffect(() => {
    if (!crmLoading) syncFromGoogleRef.current(false);
  }, [crmLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync quando o usuário volta para a aba (ex: deletou do Google Calendar em outra aba)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncFromGoogleRef.current(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    if (!userPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (userPickerRef.current && !userPickerRef.current.contains(e.target as Node)) {
        setUserPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userPickerOpen]);

  const toggleUser = (name: string) => {
    setSelectedUsers(prev =>
      prev.includes(name) ? prev.filter(u => u !== name) : [...prev, name]
    );
  };

  // Rola para as 8h ao mudar de vista semana/dia
  useEffect(() => {
    if (view !== "mes" && gridRef.current) {
      gridRef.current.scrollTop = 8 * HOUR_H;
    }
  }, [view]);

  // Todos os eventos com scheduledAt
  const allCalEvents = useMemo<CalEvent[]>(
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
            userName: a.userName,
            isCompleted: !!a.completedAt,
            isNoShow: !!a.noShowAt,
            gcalEventId: a.gcalEventId,
          }))
      ),
    [leads]
  );

  // Filtra por usuários selecionados
  const calEvents = useMemo(() => {
    if (selectedUsers.length === 0) return allCalEvents;
    return allCalEvents.filter(e => {
      if (!e.userName) return selectedUsers.includes(myName);
      return selectedUsers.includes(e.userName);
    });
  }, [allCalEvents, selectedUsers, myName]);

  const navDate = (dir: 1 | -1) => {
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

  const handleActivitySubmit = (data: ActivitySubmitData) => {
    if (editingEvent) {
      patchActivity(editingEvent.leadId, editingEvent.id, {
        type: data.type,
        title: data.title,
        description: data.description,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        durationMinutes: data.durationMinutes,
        meetLink: data.meetLink || undefined,
        participants: data.participants.length > 0 ? data.participants : undefined,
        contactEmail: data.participants[0] || undefined,
      });
      toast.success("Atividade atualizada!");
      setEditingEvent(null);
    } else {
      if (!data.leadId) return;
      addActivity(data.leadId, {
        type: data.type,
        title: data.title,
        description: data.description,
        date: new Date().toISOString(),
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        durationMinutes: data.durationMinutes,
        meetLink: data.meetLink || undefined,
        participants: data.participants.length > 0 ? data.participants : undefined,
        contactEmail: data.participants[0] || undefined,
        gcalEventId: data.gcalEventId,
      });
      toast.success("Atividade agendada!");
      setShowModal(false);
    }
  };

  const handleDeleteEvent = () => {
    if (!editingEvent) return;
    deleteActivity(editingEvent.leadId, editingEvent.id, editingEvent.gcalEventId);
    toast.success("Atividade excluída.");
    setEditingEvent(null);
  };

  return (
    <div
      style={{
        background: "hsl(var(--background))",
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
              onClick={() => navDate(-1)}
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
              onClick={() => navDate(1)}
              className="flex items-center justify-center rounded-md hover:bg-muted transition-colors"
              style={{ width: 28, height: 28 }}
            >
              <ChevronRight size={15} className="text-muted-foreground" />
            </button>
          </div>

          <span className="text-sm font-semibold" style={{ color: "#111111" }}>
            {periodLabel()}
          </span>

          <div className="ml-auto flex items-center gap-3">
            {/* Seletor de usuários */}
            {teamMembers.length > 0 && (
              <div ref={userPickerRef} className="relative flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Agenda de:</span>

                {/* Avatares dos selecionados (máx 5) */}
                <div className="flex items-center" style={{ gap: -4 }}>
                  {selectedUsers.slice(0, 5).map((name, idx) => {
                    const avatar = memberAvatars[name];
                    const color = memberColors[name] ?? "#AAAAAA";
                    return (
                      <div
                        key={name}
                        title={name}
                        style={{
                          marginLeft: idx === 0 ? 0 : -6,
                          zIndex: 5 - idx,
                          position: "relative",
                          outline: `2px solid #FFFFFF`,
                          borderRadius: "50%",
                        }}
                      >
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={name}
                            className="rounded-full object-cover block"
                            style={{ width: 26, height: 26, border: `2px solid ${color}` }}
                          />
                        ) : (
                          <div
                            className="rounded-full flex items-center justify-center text-white font-semibold"
                            style={{ width: 26, height: 26, background: color, fontSize: 10, border: `2px solid ${color}` }}
                          >
                            {name[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {selectedUsers.length > 5 && (
                    <div
                      className="rounded-full flex items-center justify-center font-semibold"
                      style={{
                        width: 26, height: 26,
                        background: "#E5E5E5",
                        color: "#555",
                        fontSize: 10,
                        marginLeft: -6,
                        zIndex: 0,
                        border: "2px solid #FFFFFF",
                      }}
                    >
                      +{selectedUsers.length - 5}
                    </div>
                  )}
                  {selectedUsers.length === 0 && (
                    <span className="text-[11px] text-muted-foreground italic">Nenhum</span>
                  )}
                </div>

                {/* Botão para abrir o dropdown */}
                <button
                  onClick={() => setUserPickerOpen(v => !v)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors hover:bg-muted"
                  style={{
                    borderColor: userPickerOpen ? "hsl(var(--primary))" : "#E5E5E5",
                    color: "#555",
                    background: userPickerOpen ? "hsl(var(--primary) / 0.06)" : "#FFFFFF",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 1 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {/* Dropdown com todos os membros */}
                {userPickerOpen && (
                  <div
                    className="absolute bg-card border border-card-border shadow-lg z-50 overflow-hidden"
                    style={{
                      top: "calc(100% + 8px)",
                      right: 0,
                      width: 230,
                      borderRadius: 12,
                      maxHeight: 320,
                      overflowY: "auto",
                    }}
                  >
                    <div className="px-3 py-2 border-b border-card-border flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Membros do time</span>
                      {selectedUsers.length > 0 && (
                        <button
                          onClick={() => setSelectedUsers([])}
                          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    {teamMembers.map(name => {
                      const selected = selectedUsers.includes(name);
                      const avatar = memberAvatars[name];
                      const color = memberColors[name] ?? "#AAAAAA";
                      const isMe = name === myName;
                      return (
                        <button
                          key={name}
                          onClick={() => toggleUser(name)}
                          className="flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors hover:bg-muted"
                        >
                          {/* Checkbox */}
                          <div
                            className="flex items-center justify-center rounded flex-shrink-0"
                            style={{
                              width: 15, height: 15,
                              border: selected ? `2px solid ${color}` : "1.5px solid #CCCCCC",
                              background: selected ? color : "transparent",
                              transition: "all 0.15s",
                            }}
                          >
                            {selected && (
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </div>

                          {/* Avatar */}
                          {avatar ? (
                            <img src={avatar} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: 24, height: 24 }} />
                          ) : (
                            <div className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0" style={{ width: 24, height: 24, background: color, fontSize: 10 }}>
                              {name[0].toUpperCase()}
                            </div>
                          )}

                          {/* Nome */}
                          <span className="text-xs truncate flex-1" style={{ color: "#111111", fontWeight: selected ? 600 : 400 }}>
                            {name}{isMe ? " (você)" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Separador */}
            {teamMembers.length > 0 && (
              <div style={{ width: 1, height: 20, background: "#E5E5E5" }} />
            )}

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

            <button
              onClick={() => syncFromGoogle(true)}
              disabled={syncing}
              title="Sincronizar com Google Calendar"
              className="flex items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:opacity-50"
              style={{ width: 32, height: 32, borderColor: "#E5E5E5" }}
            >
              <RefreshCw size={14} className={`text-muted-foreground ${syncing ? "animate-spin" : ""}`} />
            </button>

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
        {crmLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {view === "mes" && (
              <MonthView
                cur={cur}
                today={today}
                events={calEvents}
                onEvt={e => setEditingEvent(e)}
              />
            )}
            {(view === "semana" || view === "dia") && (
              <TimeGridView
                view={view}
                cur={cur}
                today={today}
                events={calEvents}
                onEvt={e => setEditingEvent(e)}
                gridRef={gridRef}
              />
            )}
          </>
        )}
      </div>

      <ActivityDialog
        open={showModal || !!editingEvent}
        onClose={() => { setShowModal(false); setEditingEvent(null); }}
        onSubmit={handleActivitySubmit}
        onDelete={editingEvent ? handleDeleteEvent : undefined}
        isEditing={!!editingEvent}
        readOnly={!!editingEvent && (() => {
          const act = leads[editingEvent.leadId]?.activities?.find(a => a.id === editingEvent.id);
          return !!(act?.userName && act.userName !== profile?.full_name);
        })()}
        onGoToLead={editingEvent ? () => {
          setEditingEvent(null);
          navigate(`/pipeline/lead/${editingEvent.leadId}`);
        } : undefined}
        leads={leads}
        teamMembers={teamMembers}
        memberEmails={memberEmails}
        memberAvatars={memberAvatars}
        memberColors={memberColors}
        defaultLead={editingEvent ? leads[editingEvent.leadId] : undefined}
        initialValues={editingEvent ? (() => {
          const act = leads[editingEvent.leadId]?.activities?.find(a => a.id === editingEvent.id);
          return {
            title: act?.title ?? act?.description ?? editingEvent.title,
            type: act?.type ?? (editingEvent.type as ActivityType),
            scheduledAt: act?.scheduledAt ?? editingEvent.scheduledAt.toISOString(),
            durationMinutes: act?.durationMinutes ?? editingEvent.durationMinutes,
            meetLink: act?.meetLink,
            description: act?.title ? (act.description ?? "") : "",
            participants: act?.participants,
            gcalEventId: act?.gcalEventId ?? editingEvent.gcalEventId,
          };
        })() : undefined}
      />
    </div>
  );
}
