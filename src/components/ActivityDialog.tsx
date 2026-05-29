import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, Phone, MessageCircle, RefreshCw, Check, X, CalendarPlus, Video, Loader2, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { checkGoogleConnection } from "@/lib/googleOAuth";
import type { ActivityType, Lead } from "@/data/mockData";

// ─── Constants ────────────────────────────────────────────────────────────────

export const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
});

export const SCHED_TYPES: { type: ActivityType; icon: typeof CalendarDays; label: string }[] = [
  { type: "meeting",   icon: CalendarDays,   label: "Reunião"   },
  { type: "call",      icon: Phone,          label: "Ligação"   },
  { type: "whatsapp",  icon: MessageCircle,  label: "WhatsApp"  },
  { type: "follow_up", icon: RefreshCw,      label: "Follow-up" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActivitySubmitData {
  title: string;
  type: ActivityType;
  scheduledAt: string;
  durationMinutes: number;
  participants: string[];
  meetLink: string;
  description: string;
  leadId?: string;
  gcalEventId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ActivitySubmitData) => void;
  onDelete?: () => void;
  isEditing?: boolean;
  readOnly?: boolean;
  onGoToLead?: () => void;
  leads: Record<string, Lead>;
  teamMembers: string[];
  memberEmails: Record<string, string>;
  memberAvatars: Record<string, string>;
  memberColors: Record<string, string>;
  defaultLead?: Lead;
  initialValues?: {
    title?: string;
    type?: ActivityType;
    scheduledAt?: string;
    durationMinutes?: number;
    participants?: string[];
    meetLink?: string;
    description?: string;
    leadId?: string;
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function getNow15() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityDialog({
  open, onClose, onSubmit, onDelete, isEditing = false, readOnly = false, onGoToLead,
  leads, teamMembers, memberEmails, memberAvatars, memberColors,
  defaultLead, initialValues,
}: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ActivityType>("meeting");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(60);
  const [meetLink, setMeetLink] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantInput, setParticipantInput] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [generatingMeet, setGeneratingMeet] = useState(false);
  const [meetEventCreated, setMeetEventCreated] = useState(false);
  const [meetGcalEventId, setMeetGcalEventId] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    checkGoogleConnection().then(conn => {
      setGoogleConnected(!!conn);
      setAddToCalendar(!!conn);
    });
    const { date: nd, time: nt } = getNow15();
    if (initialValues) {
      setTitle(initialValues.title ?? "");
      setType(initialValues.type ?? "meeting");
      if (initialValues.scheduledAt) {
        const d = new Date(initialValues.scheduledAt);
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const dy = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        setDate(`${yr}-${mo}-${dy}`);
        setTime(`${hh}:${mm}`);
      } else {
        setDate(nd);
        setTime(nt);
      }
      setDuration(initialValues.durationMinutes ?? 60);
      setMeetLink(initialValues.meetLink ?? "");
      setMeetEventCreated(false);
      setDescription(initialValues.description ?? "");
      setParticipants(initialValues.participants ?? []);
      const initLeadId = initialValues.leadId ?? "";
      setSelectedLeadId(initLeadId);
      setLeadSearch(initLeadId && leads[initLeadId] ? leads[initLeadId].name : "");
    } else {
      setTitle("");
      setType("meeting");
      setDate(nd);
      setTime(nt);
      setDuration(60);
      setMeetLink("");
      setMeetEventCreated(false);
      setDescription("");
      setParticipants([]);
      setSelectedLeadId("");
      setLeadSearch("");
    }
    setParticipantInput("");
    setDropdownOpen(false);
    setLeadDropdownOpen(false);
    setMeetGcalEventId(undefined);
    setConfirmDelete(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const addParticipant = (email: string) => {
    const e = email.trim();
    if (!e || participants.includes(e)) return;
    setParticipants(prev => [...prev, e]);
  };

  const removeParticipant = (email: string) =>
    setParticipants(prev => prev.filter(e => e !== email));

  const handleGenerateMeetLink = async () => {
    if (!googleConnected || generatingMeet) return;
    setGeneratingMeet(true);
    try {
      const startDt = `${date}T${time}:00`;
      const { data, error } = await supabase.functions.invoke("google-calendar-event", {
        body: {
          title: title.trim() || "Reunião",
          description,
          start_datetime: startDt,
          duration_minutes: duration,
          attendees: participants,
        },
      });
      if (error) throw error;
      if (data?.meet_link) {
        setMeetLink(data.meet_link);
        setMeetEventCreated(true);
        if (data.event_id) setMeetGcalEventId(data.event_id as string);
      } else {
        toast.error("Link do Meet não retornado. Verifique se o Google Calendar está conectado.");
      }
    } catch (err) {
      let errorCode: string | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = await (err as any)?.context?.json?.();
        errorCode = body?.error ?? null;
      } catch { /* ignora */ }

      if (errorCode === "token_refresh_failed" || errorCode === "google_not_connected") {
        toast.error("Sua conexão com o Google expirou. Reconecte em Configurações > Conexões.");
      } else {
        toast.error("Erro ao gerar link do Google Meet. Tente reconectar o Google Calendar nas Configurações.");
      }
    } finally {
      setGeneratingMeet(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !date || !time) return;
    if (!defaultLead && !selectedLeadId) return;

    let gcalEventId: string | undefined = meetGcalEventId;

    // Cria evento no Google Calendar se ainda não foi criado via Meet link
    console.log("[ActivityDialog] handleSubmit - type:", type, "addToCalendar:", addToCalendar, "googleConnected:", googleConnected, "meetEventCreated:", meetEventCreated, "meetGcalEventId:", meetGcalEventId);
    if (type === "meeting" && addToCalendar && googleConnected && !meetEventCreated) {
      const startDt = `${date}T${time}:00`;
      try {
        const { data, error } = await supabase.functions.invoke("google-calendar-event", {
          body: { title: title.trim(), description, start_datetime: startDt, duration_minutes: duration, attendees: participants },
        });
        console.log("[ActivityDialog] google-calendar-event response - data:", data, "error:", error);
        if (!error && data && !data.error) {
          gcalEventId = data.event_id ? (data.event_id as string) : undefined;
          console.log("[ActivityDialog] gcalEventId captured:", gcalEventId);
          toast.success(
            <span>
              Evento criado no Google Calendar.{" "}
              {data.event_link && (
                <a href={data.event_link as string} target="_blank" rel="noopener noreferrer" className="underline">
                  Ver evento
                </a>
              )}
            </span>,
          );
        } else {
          console.error("[ActivityDialog] Falha ao criar evento:", error ?? data);
          toast.error("Não foi possível criar o evento no Google Calendar.");
        }
      } catch (err) {
        console.error("[ActivityDialog] Exceção ao criar evento:", err);
        toast.error("Não foi possível criar o evento no Google Calendar.");
      }
    }
    console.log("[ActivityDialog] gcalEventId final antes do onSubmit:", gcalEventId);

    onSubmit({
      title: title.trim(),
      type,
      scheduledAt: `${date}T${time}`,
      durationMinutes: duration,
      participants,
      meetLink,
      description,
      leadId: defaultLead ? undefined : selectedLeadId,
      gcalEventId,
    });
  };

  const activeLead = defaultLead ?? (selectedLeadId ? leads[selectedLeadId] : undefined);
  const activeLeadEmails = activeLead?.emails?.length ? activeLead.emails : (activeLead?.email ? [activeLead.email] : []);
  const q = participantInput.toLowerCase();
  const showActiveLead = !!activeLead && (
    !q ||
    activeLead.name.toLowerCase().includes(q) ||
    activeLeadEmails.some(e => e.toLowerCase().includes(q))
  );
  const otherLeads = q
    ? Object.values(leads)
        .filter(l => {
          if (l.id === activeLead?.id) return false;
          const lemails = l.emails?.length ? l.emails : (l.email ? [l.email] : []);
          return l.name.toLowerCase().includes(q) || lemails.some(e => e.toLowerCase().includes(q));
        })
        .slice(0, 5)
    : [];
  const filteredTeam = teamMembers.filter(m =>
    !q || m.toLowerCase().includes(q) || (memberEmails[m] ?? "").toLowerCase().includes(q)
  );
  const hasDropdownItems = showActiveLead || otherLeads.length > 0 || filteredTeam.length > 0;
  const leadColor = activeLead ? (memberColors[activeLead.responsible] ?? "#128A68") : "#AAAAAA";
  const canSubmit = !!title.trim() && !!date && !!time && (!!defaultLead || !!selectedLeadId);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-card-border sm:max-w-sm p-5" style={{ borderRadius: 15 }}>
        <DialogHeader className="pb-0">
          <DialogTitle className="text-sm text-foreground">
            {readOnly ? "Detalhes da atividade" : isEditing ? "Editar atividade" : "Nova atividade"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 mt-1">
          {/* Lead picker — somente sem defaultLead (contexto do calendário) */}
          {!defaultLead && (() => {
            const lq = leadSearch.toLowerCase();
            const leadResults = Object.values(leads)
              .filter(l => !lq || l.name.toLowerCase().includes(lq))
              .sort((a, b) => a.name.localeCompare(b.name))
              .slice(0, 6);
            return (
              <div className="relative">
                <label className="text-[11px] text-muted-foreground mb-1 block">Lead *</label>
                <input
                  type="text"
                  placeholder="Buscar lead pelo nome..."
                  value={leadSearch}
                  onChange={e => {
                    if (readOnly) return;
                    setLeadSearch(e.target.value);
                    setSelectedLeadId("");
                  }}
                  onFocus={() => !readOnly && setLeadDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setLeadDropdownOpen(false), 150)}
                  readOnly={readOnly}
                  className="w-full h-8 px-3 text-xs border border-card-border bg-background outline-none"
                  style={{ borderRadius: 15, color: "#000000", cursor: readOnly ? "default" : undefined }}
                />
                {leadDropdownOpen && leadResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-card-border rounded-xl shadow-lg z-50 overflow-hidden max-h-48 overflow-y-auto">
                    {leadResults.map(l => (
                      <button
                        key={l.id}
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          setSelectedLeadId(l.id);
                          setLeadSearch(l.name);
                          setLeadDropdownOpen(false);
                          const lemails = l.emails?.length ? l.emails : (l.email ? [l.email] : []);
                          lemails.forEach(addParticipant);
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 hover:bg-muted transition-colors text-left ${selectedLeadId === l.id ? "bg-muted" : ""}`}
                      >
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ background: memberColors[l.responsible] ?? "#AAAAAA" }}>
                          {l.name[0]}
                        </div>
                        <span className="text-xs truncate" style={{ color: "#111111" }}>{l.name}</span>
                        {selectedLeadId === l.id && <Check size={11} className="ml-auto text-green-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Título */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Título</label>
            <Input
              autoFocus={!readOnly}
              placeholder="Ex: Reunião de apresentação"
              value={title}
              onChange={e => setTitle(e.target.value)}
              readOnly={readOnly}
              className="bg-background border-card-border h-8 text-sm"
              style={{ borderRadius: 15, color: title ? "#000000" : undefined, cursor: readOnly ? "default" : undefined }}
            />
          </div>

          {/* Tarefa */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Tarefa</label>
            <div className="flex gap-1">
              {SCHED_TYPES.map(({ type: t, icon: Icon, label }) => (
                <button
                  key={t}
                  onClick={() => !readOnly && setType(t)}
                  disabled={readOnly && type !== t}
                  className={`flex items-center justify-center gap-0.5 px-1.5 py-1.5 border text-[10px] font-medium transition-all whitespace-nowrap flex-1 ${
                    type === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-card-border hover:border-primary/50 hover:text-foreground bg-background"
                  } ${readOnly ? "cursor-default" : ""}`}
                  style={{ borderRadius: 8 }}
                >
                  <Icon size={11} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Google Calendar — só aparece para Reunião quando conectado e sem Meet link já criado */}
          {type === "meeting" && googleConnected && !readOnly && !meetEventCreated && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setAddToCalendar(p => !p)}
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  addToCalendar ? "bg-primary border-primary" : "border-card-border bg-background"
                }`}
              >
                {addToCalendar && <Check size={10} className="text-primary-foreground" />}
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarPlus size={12} className="text-muted-foreground" />
                <span className="text-xs text-foreground">Adicionar ao Google Calendar</span>
              </div>
            </label>
          )}

          {/* Data + Horário + Duração */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Data</label>
              <button
                type="button"
                onClick={() => {
                  if (readOnly) return;
                  const el = dateInputRef.current;
                  if (!el) return;
                  if (typeof el.showPicker === "function") el.showPicker();
                  else el.click();
                }}
                className="flex items-center gap-1.5 h-8 px-2 border border-card-border bg-background w-full text-left hover:border-primary/50 transition-colors"
                style={{ borderRadius: 15, cursor: readOnly ? "default" : undefined }}
              >
                <CalendarDays size={12} className="text-muted-foreground shrink-0" />
                <span className="text-xs truncate" style={{ color: date ? "#000000" : undefined }}>
                  {date
                    ? new Date(date + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                    : <span className="text-muted-foreground text-[10px]">Selecionar</span>}
                </span>
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="sr-only"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Horário</label>
              <Select value={time} onValueChange={v => !readOnly && setTime(v)} disabled={readOnly}>
                <SelectTrigger className="h-8 text-xs border-card-border bg-background" style={{ borderRadius: 15 }}>
                  <SelectValue placeholder="--:--" />
                </SelectTrigger>
                <SelectContent className="max-h-52 overflow-y-auto">
                  {TIME_SLOTS.map(t => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Duração</label>
              <Select value={String(duration)} onValueChange={v => !readOnly && setDuration(Number(v))} disabled={readOnly}>
                <SelectTrigger className="h-8 text-xs border-card-border bg-background" style={{ borderRadius: 15 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15" className="text-xs">15 min</SelectItem>
                  <SelectItem value="30" className="text-xs">30 min</SelectItem>
                  <SelectItem value="45" className="text-xs">45 min</SelectItem>
                  <SelectItem value="60" className="text-xs">1 hora</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* E-mail / Participantes */}
          <div className="relative">
            <label className="text-[11px] text-muted-foreground mb-1 block">E-mail do contato</label>
            <div
              className="min-h-[34px] flex flex-wrap gap-1 px-2 py-1.5 border border-card-border bg-background"
              style={{ borderRadius: 15, cursor: readOnly ? "default" : "text" }}
              onClick={() => !readOnly && document.getElementById("act-dlg-email-input")?.focus()}
            >
              {participants.map(email => (
                <div key={email} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-card-border shrink-0">
                  <span className="truncate max-w-[160px]">{email}</span>
                  {!readOnly && (
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); removeParticipant(email); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <input
                  id="act-dlg-email-input"
                  type="text"
                  placeholder={participants.length === 0 ? "Selecione ou digite um e-mail..." : ""}
                  value={participantInput}
                  onChange={e => setParticipantInput(e.target.value)}
                  onFocus={() => setDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (participantInput.trim()) {
                        addParticipant(participantInput.trim());
                        setParticipantInput("");
                      }
                    }
                    if (e.key === "Backspace" && !participantInput && participants.length > 0) {
                      removeParticipant(participants[participants.length - 1]);
                    }
                  }}
                  className="flex-1 min-w-[120px] bg-transparent outline-none text-sm"
                  style={{ color: "#000000" }}
                />
              )}
            </div>

            {/* Dropdown de sugestões */}
            {dropdownOpen && hasDropdownItems && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-card-border rounded-xl shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
                {showActiveLead && activeLead && (
                  <>
                    <div className="px-3 pt-2 pb-1">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Lead</p>
                    </div>
                    {activeLeadEmails.length === 0 ? (
                      <div className="flex items-center gap-2 w-full px-3 py-2 opacity-50" style={{ cursor: "not-allowed" }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: leadColor }}>
                          {activeLead.name[0]}
                        </div>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="text-xs font-medium truncate" style={{ color: "#111111" }}>{activeLead.name}</span>
                          <span className="text-[10px]" style={{ color: "#E24B4A" }}>Sem e-mail cadastrado</span>
                        </div>
                      </div>
                    ) : activeLeadEmails.map((em, idx) => (
                      <button
                        key={em}
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          addParticipant(em);
                          setParticipantInput("");
                        }}
                        disabled={participants.includes(em)}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted transition-colors disabled:opacity-40"
                      >
                        {idx === 0 ? (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: leadColor }}>
                            {activeLead.name[0]}
                          </div>
                        ) : (
                          <div className="w-6 h-6 shrink-0" />
                        )}
                        <div className="flex flex-col items-start min-w-0">
                          {idx === 0 && <span className="text-xs font-medium truncate" style={{ color: "#111111" }}>{activeLead.name}</span>}
                          <span className="text-[10px] text-muted-foreground">{em}</span>
                        </div>
                        {participants.includes(em) && <Check size={11} className="ml-auto text-green-600 shrink-0" />}
                      </button>
                    ))}
                  </>
                )}

                {otherLeads.length > 0 && (
                  <>
                    <div className={`px-3 pt-2 pb-1 ${showActiveLead ? "border-t border-card-border" : ""}`}>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Outros leads</p>
                    </div>
                    {otherLeads.map(l => {
                      const val = l.email ?? l.name;
                      const added = participants.includes(val);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            addParticipant(val);
                            setParticipantInput("");
                          }}
                          disabled={added}
                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted transition-colors disabled:opacity-40"
                        >
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: "#AAAAAA" }}>
                            {l.name[0]}
                          </div>
                          <div className="flex flex-col items-start min-w-0">
                            <span className="text-xs font-medium truncate" style={{ color: "#111111" }}>{l.name}</span>
                            {l.email && <span className="text-[10px] text-muted-foreground">{l.email}</span>}
                          </div>
                          {added && <Check size={11} className="ml-auto text-green-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </>
                )}

                {filteredTeam.length > 0 && (
                  <>
                    <div className={`px-3 pt-2 pb-1 ${showActiveLead || otherLeads.length > 0 ? "border-t border-card-border" : ""}`}>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Time</p>
                    </div>
                    {filteredTeam.map(m => {
                      const email = memberEmails[m] ?? m;
                      const added = participants.includes(email);
                      return (
                        <button
                          key={m}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            addParticipant(email);
                            setParticipantInput("");
                          }}
                          disabled={added}
                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted transition-colors disabled:opacity-40"
                        >
                          {memberAvatars[m] ? (
                            <img src={memberAvatars[m]} alt={m} className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: memberColors[m] ?? "#AAAAAA" }}>
                              {m[0]}
                            </div>
                          )}
                          <div className="flex flex-col items-start min-w-0">
                            <span className="text-xs font-medium truncate" style={{ color: "#111111" }}>{m}</span>
                            {memberEmails[m] && <span className="text-[10px] text-muted-foreground">{memberEmails[m]}</span>}
                          </div>
                          {added && <Check size={11} className="ml-auto text-green-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Google Meet link */}
          {type === "meeting" && (
            <div className="space-y-1.5">
              {!readOnly && (
                <div className="relative group">
                  <button
                    type="button"
                    onClick={handleGenerateMeetLink}
                    disabled={!googleConnected || generatingMeet || !!meetLink}
                    title={!googleConnected ? "Conecte o Google Calendar nas Configurações" : undefined}
                    className={`flex items-center gap-2 w-full h-8 px-3 border text-xs font-medium transition-all ${
                      meetLink
                        ? "border-blue-200 bg-blue-50 text-blue-700 cursor-default"
                        : googleConnected
                        ? "border-card-border bg-background text-foreground hover:border-blue-400 hover:text-blue-600"
                        : "border-card-border bg-background text-muted-foreground cursor-not-allowed opacity-60"
                    }`}
                    style={{ borderRadius: 15 }}
                  >
                    {generatingMeet
                      ? <Loader2 size={13} className="animate-spin shrink-0 text-blue-500" />
                      : <Video size={13} className={meetLink ? "text-blue-500 shrink-0" : "text-muted-foreground shrink-0"} />
                    }
                    <span>
                      {generatingMeet
                        ? "Gerando link..."
                        : meetLink
                        ? "Link do Google Meet criado"
                        : "Criar link do Google Meet"}
                    </span>
                    {!googleConnected && (
                      <span className="ml-auto text-[10px] text-muted-foreground">Conectar Google</span>
                    )}
                  </button>
                </div>
              )}
              {meetLink && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100"
                  style={{ borderRadius: 15 }}
                >
                  <Video size={12} className="text-blue-500 shrink-0" />
                  <a
                    href={meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline truncate flex-1"
                  >
                    {meetLink}
                  </a>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => { setMeetLink(""); setMeetEventCreated(false); }}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Descrição</label>
            <Textarea
              placeholder="Detalhes da atividade..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              readOnly={readOnly}
              className="bg-background border-card-border resize-none text-sm min-h-[60px]"
              style={{ borderRadius: 15, color: description ? "#000000" : undefined, cursor: readOnly ? "default" : undefined }}
            />
          </div>
        </div>

        {/* Link para o lead no pipeline */}
        {onGoToLead && (
          <button
            type="button"
            onClick={onGoToLead}
            className="flex items-center justify-center gap-1.5 w-full text-[11px] text-muted-foreground hover:text-primary transition-colors mt-2 py-1"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Ver lead no pipeline
          </button>
        )}

        <DialogFooter className="gap-2 mt-2">
          {readOnly ? (
            <div className="flex w-full gap-2">
              {onDelete && (
                confirmDelete ? (
                  <div className="flex gap-1.5 flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                      className="border-card-border flex-1 text-xs"
                      style={{ borderRadius: 15 }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { onDelete(); onClose(); }}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs"
                      style={{ borderRadius: 15 }}
                    >
                      Confirmar exclusão
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      className="border-red-200 text-red-500 hover:bg-red-50"
                      style={{ borderRadius: 15 }}
                    >
                      <Trash2 size={13} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onClose}
                      className="border-card-border flex-1"
                      style={{ borderRadius: 15 }}
                    >
                      Fechar
                    </Button>
                  </>
                )
              )}
              {!onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="border-card-border w-full"
                  style={{ borderRadius: 15 }}
                >
                  Fechar
                </Button>
              )}
            </div>
          ) : (
            <div className="flex w-full gap-2">
              {onDelete && isEditing && (
                confirmDelete ? (
                  <div className="flex gap-1.5 flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                      className="border-card-border flex-1 text-xs"
                      style={{ borderRadius: 15 }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { onDelete(); onClose(); }}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs"
                      style={{ borderRadius: 15 }}
                    >
                      Confirmar exclusão
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    className="border-red-200 text-red-500 hover:bg-red-50 shrink-0"
                    style={{ borderRadius: 15 }}
                  >
                    <Trash2 size={13} />
                  </Button>
                )
              )}
              {!confirmDelete && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    className="border-card-border flex-1"
                    style={{ borderRadius: 15 }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="flex-1"
                    style={{ borderRadius: 15 }}
                  >
                    <Check size={13} className="mr-1" />
                    {isEditing ? "Salvar alterações" : "Criar atividade"}
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
