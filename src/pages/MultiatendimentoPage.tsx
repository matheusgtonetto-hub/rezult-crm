import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import type { Lead, Pipeline } from "@/data/mockData";
import {
  Search, Bell, Settings, Mail, Clock, Folder, Zap, CheckCircle2, AlertTriangle,
  Filter, Eye, Check, MoreHorizontal, Paperclip, Calendar as CalendarIcon, FolderOpen,
  Smile, Mic, Sparkles, ExternalLink, ChevronDown, Play, CheckCheck,
  MessageSquare, Plus, ArrowLeft, ArrowRight, Tag, Send, X, UserPlus,
} from "lucide-react";

/* ── helpers ──────────────────────────────────────────────────────────── */
function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 50%)`;
}
function initials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
function nowTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const TAG_STYLES: Record<string, { bg: string; fg: string }> = {
  Rafael:      { bg: "#E1F5EE", fg: "#128A68" },
  Mariana:     { bg: "#EDE9FE", fg: "#534AB7" },
  Carlos:      { bg: "#FEF3C7", fg: "#854F0B" },
  SDR:         { bg: "#F5F5F5", fg: "#535353" },
  "Follow-up": { bg: "#FEE2E2", fg: "#A32D2D" },
  Proposta:    { bg: "#DBEAFE", fg: "#185FA5" },
  Negociação:  { bg: "#F3E8FF", fg: "#6D28D9" },
  Reunião:     { bg: "#FEF3C7", fg: "#854F0B" },
  Fechado:     { bg: "#E1F5EE", fg: "#128A68" },
};
const tagStyle = (label: string) => TAG_STYLES[label] || { bg: "#F5F5F5", fg: "#535353" };

/* ── types ────────────────────────────────────────────────────────────── */
type Channel = "whatsapp" | "instagram";

type Conversation = {
  id: string; name: string; preview: string; time: string;
  channel: Channel; tags: string[]; dealNumber?: string; pipeline?: string;
  company?: string; email?: string; phone?: string; value?: number;
};

type Msg =
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "text"; text: string; date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "audio"; duration: string; date: string; read?: boolean };

type Meeting = { date: string; time: string; owner: string; note: string };

type ConvState = {
  messages: Msg[];
  stageIdx: number;
  meeting: Meeting | null;
  notes: string;
  read: boolean;
  finished: boolean;
};

type ZApiInstance = { instanceId: string; token: string; clientToken: string; phone: string; label: string };

/* ── mock data ────────────────────────────────────────────────────────── */
const PIPELINE_STAGES = ["Novo Lead", "Contato Feito", "Proposta Enviada", "Negociação", "Fechado", "Perdido"];

function makeInitialConvStates(): Record<string, ConvState> {
  return {};
}

/* ── sub-components ───────────────────────────────────────────────────── */
function ChannelBadge({ channel }: { channel: Channel }) {
  if (channel === "whatsapp") {
    return (
      <span style={{ position: "absolute", bottom: -2, right: -2, borderRadius: "50%", border: "2px solid #FFF", background: "#FFF", lineHeight: 0 }}>
        <svg viewBox="0 0 24 24" width={12} height={12}><circle cx="12" cy="12" r="12" fill="#25D366" /><path fill="#FFF" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></svg>
      </span>
    );
  }
  return (
    <span style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: "#E1306C", border: "2px solid #FFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 7, fontWeight: 700 }}>I</span>
  );
}

function Waveform({ light }: { light: boolean }) {
  const heights = [6, 10, 14, 8, 16, 12, 18, 10, 6, 12, 14, 8, 16, 10, 6];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
      {heights.map((h, i) => <div key={i} style={{ width: 2, height: h, background: light ? "rgba(255,255,255,0.5)" : "#128A68", opacity: light ? 1 : 0.4, borderRadius: 1 }} />)}
    </div>
  );
}

function AudioBubble({ duration, light }: { duration: string; light: boolean }) {
  const [playing, setPlaying] = useState(false);
  const fg = light ? "#FFF" : "#128A68";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: light ? "transparent" : "#F5F5F5", padding: light ? 0 : "6px 10px", borderRadius: 10 }}>
      <button
        onClick={() => setPlaying(p => !p)}
        style={{ width: 32, height: 32, borderRadius: "50%", background: light ? "rgba(255,255,255,0.3)" : "#128A68", color: "#FFF", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <Play size={14} fill="#FFF" />
      </button>
      <Waveform light={light} />
      <span style={{ fontSize: 11, color: fg, fontWeight: 500 }}>{duration}</span>
      <button style={{ background: "transparent", border: "none", color: fg, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>1x</button>
    </div>
  );
}

function Section({ title, children, defaultOpen = false, action }: { title: string; children: React.ReactNode; defaultOpen?: boolean; action?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "0.5px solid #F0F0F0" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#F9F9F9")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ChevronDown size={14} color="#AAA" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{title}</span>
        </div>
        {action}
      </button>
      {open && <div style={{ padding: "0 16px 12px" }}>{children}</div>}
    </div>
  );
}

function FilterChip({ Icon, count, isActive, onClick }: { Icon: any; count: number | null; isActive: boolean; onClick: () => void }) {
  const bg     = isActive ? "#E1F5EE" : "#F5F5F5";
  const fg     = isActive ? "#128A68" : "#535353";
  const border = isActive ? "1px solid #128A68" : "1px solid transparent";
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 4, background: bg, color: fg, border, borderRadius: 100, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
      <Icon size={12} />
      {count !== null && <span>{count}</span>}
    </button>
  );
}

function ChatHeaderBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 100, border: `1px solid ${hover ? "#128A68" : "#E5E5E5"}`, background: "transparent", color: hover ? "#128A68" : "#111", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

/* ── main page ─────────────────────────────────────────────────────────── */
export default function MultiatendimentoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { leads, pipelines, activePipeline } = useCRM();
  const { openedLeadIds } = useFloatingChat();

  const [convList, setConvList] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [convStates, setConvStates] = useState<Record<string, ConvState>>(makeInitialConvStates);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // nova conversa
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");

  // meeting form state (ephemeral)
  const [meetingFormFor, setMeetingFormFor] = useState<string | null>(null);
  const [mDate, setMDate] = useState("");
  const [mTime, setMTime] = useState("");
  const [mOwner, setMOwner] = useState("Rafael");
  const [mNote, setMNote] = useState("");

  // Z-API instances
  const [instances, setInstances] = useState<ZApiInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [instanceOpen, setInstanceOpen] = useState(false);

  // scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const active   = convList.find(c => c.id === activeId);
  const cs       = activeId ? convStates[activeId] : null;

  // auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cs?.messages.length]);

  // load Z-API instances
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`rzlt_zapi_${user.id}`);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.connected && d.instanceId) {
          const inst: ZApiInstance = {
            instanceId: d.instanceId,
            token: d.token ?? "",
            clientToken: d.clientToken ?? "",
            phone: d.phone || d.instanceId,
            label: d.phone ? `Z-API · ${d.phone}` : `Z-API · ${d.instanceId.slice(0, 8)}…`,
          };
          setInstances([inst]);
          setSelectedInstance(inst.instanceId);
        }
      }
    } catch { /* ignore */ }
  }, [user?.id]);

  // ── sincroniza chats abertos pelo Pipeline → multi-atendimento ───────
  useEffect(() => {
    if (!openedLeadIds.length) return;
    const allPipelines = pipelines ?? [];
    setConvList(prev => {
      let updated = [...prev];
      for (const leadId of openedLeadIds) {
        if (updated.find(c => c.id === leadId)) continue;
        const lead = leads[leadId];
        if (!lead) continue;
        const pipelineName = allPipelines.find(p => p.id === lead.pipelineId)?.name ?? "Pipeline Comercial";
        updated = [{
          id: leadId,
          name: lead.name,
          preview: "Conversa iniciada pelo Pipeline",
          time: "agora",
          channel: "whatsapp" as const,
          tags: lead.tags ?? [],
          company: lead.company ?? "—",
          email: lead.email ?? "—",
          phone: lead.whatsapp ?? "—",
          value: lead.value ?? 0,
          pipeline: pipelineName,
          dealNumber: `#${lead.dealNumber}`,
        }, ...updated];
      }
      return updated;
    });
    setConvStates(prev => {
      const next = { ...prev };
      for (const leadId of openedLeadIds) {
        if (!next[leadId]) {
          next[leadId] = { messages: [], stageIdx: 1, meeting: null, notes: "", read: true, finished: false };
        }
      }
      return next;
    });
  }, [openedLeadIds, leads, pipelines]);

  // ── nova conversa a partir de lead do pipeline ───────────────────────
  function startConversationWithLead(leadId: string) {
    const lead = leads[leadId];
    if (!lead) return;

    // se já existe conversa para esse lead, só ativa
    const existing = convList.find(c => c.id === leadId);
    if (existing) {
      setActiveId(leadId);
      setNewConvOpen(false);
      setLeadSearch("");
      return;
    }

    // encontra o nome da coluna (etapa) do lead
    const allPipelines = pipelines ?? [];
    let stageIdx = 1;
    for (const p of allPipelines) {
      const colIdx = (p.columns ?? []).findIndex(col => col.id === lead.stage);
      if (colIdx >= 0) {
        const fraction = colIdx / Math.max((p.columns.length - 1), 1);
        stageIdx = Math.round(fraction * (PIPELINE_STAGES.length - 1));
        break;
      }
    }

    const pipelineName = allPipelines.find(p => p.id === lead.pipelineId)?.name
      ?? activePipeline?.name
      ?? "Pipeline Comercial";

    const newConv: Conversation = {
      id: leadId,
      name: lead.name,
      preview: "Nova conversa iniciada",
      time: "agora",
      channel: "whatsapp",
      tags: lead.tags ?? [],
      company: lead.company ?? "—",
      email: lead.email ?? "—",
      phone: lead.whatsapp ?? "—",
      value: lead.value ?? 0,
      pipeline: pipelineName,
      dealNumber: `#${lead.dealNumber}`,
    };

    setConvList(prev => [newConv, ...prev]);
    setConvStates(prev => ({
      ...prev,
      [leadId]: { messages: [], stageIdx, meeting: null, notes: "", read: true, finished: false },
    }));
    setActiveId(leadId);
    setNewConvOpen(false);
    setLeadSearch("");
    toast.success(`Conversa iniciada com ${lead.name}`);
  }

  // ── conv state helpers ──────────────────────────────────────────────
  function updateCs(id: string, patch: Partial<ConvState>) {
    setConvStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function sendMessage() {
    if (!inputValue.trim() || !activeId) return;
    const text = inputValue.trim();
    const msg: Msg = {
      id: `m${Date.now()}`,
      from: "agent",
      agent: user?.email?.split("@")[0] ?? "Você",
      time: nowTime(),
      kind: "text",
      text,
      date: "Hoje",
      read: false,
    };
    updateCs(activeId, { messages: [...(cs?.messages ?? []), msg] });
    setInputValue("");

    // Enviar via Z-API se houver instância e telefone do contato
    const inst = instances.find(i => i.instanceId === selectedInstance);
    const contactPhone = active?.phone;
    if (inst?.token && contactPhone) {
      const cleanPhone = contactPhone.replace(/\D/g, "");
      try {
        const res = await fetch(
          `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/send-text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(inst.clientToken ? { "Client-Token": inst.clientToken } : {}),
            },
            body: JSON.stringify({ phone: cleanPhone, message: text }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`Erro ao enviar mensagem: ${(err as { message?: string }).message ?? res.status}`);
        }
      } catch {
        toast.error("Falha ao enviar mensagem via WhatsApp");
      }
    }
  }

  function markAsRead(id: string) {
    updateCs(id, { read: true });
    toast.success("Conversa marcada como lida");
  }

  function finishConv(id: string) {
    updateCs(id, { finished: true, read: true });
    toast.success("Conversa finalizada ✓");
  }

  function saveMeeting() {
    if (!meetingFormFor) return;
    if (!mDate || !mTime) { toast.error("Informe data e hora"); return; }
    updateCs(meetingFormFor, { meeting: { date: mDate, time: mTime, owner: mOwner, note: mNote } });
    setMeetingFormFor(null);
    setMDate(""); setMTime(""); setMNote("");
    toast.success("Reunião agendada ✓");
  }

  function cancelMeeting(id: string) {
    updateCs(id, { meeting: null });
    toast("Reunião cancelada");
  }

  // ── filter ──────────────────────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    let list = convList;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q));
    }
    switch (activeFilter) {
      case "email":   list = list.filter(c => c.channel === "instagram"); break;
      case "pending": list = list.filter(c => !convStates[c.id]?.finished); break;
      case "done":    list = list.filter(c => convStates[c.id]?.finished); break;
      case "alert":   list = list.filter(c => c.tags.includes("Follow-up")); break;
    }
    return list;
  }, [searchQuery, activeFilter, convStates, convList]);

  const filters = [
    { id: "email",   icon: Mail,          count: convList.filter(c => c.channel === "instagram").length },
    { id: "pending", icon: Clock,         count: convList.filter(c => !convStates[c.id]?.finished).length },
    { id: "folder",  icon: Folder,        count: convList.length },
    { id: "auto",    icon: Zap,           count: convList.length },
    { id: "done",    icon: CheckCircle2,  count: convList.filter(c => convStates[c.id]?.finished).length },
    { id: "alert",   icon: AlertTriangle, count: convList.filter(c => c.tags.includes("Follow-up")).length },
  ];

  // ── grouped messages ────────────────────────────────────────────────
  const groupedMessages = useMemo(() => {
    const groups: Record<string, Msg[]> = {};
    (cs?.messages ?? []).forEach(m => { (groups[m.date] ||= []).push(m); });
    return Object.entries(groups);
  }, [cs?.messages]);

  return (
    <div
      style={{ display: "flex", height: "100vh", width: "100%", background: "#F4F6F8" }}
      onClick={() => { if (instanceOpen) setInstanceOpen(false); if (moreMenuOpen) setMoreMenuOpen(false); }}
    >
      {/* ── COLUNA 1 — LISTA ─────────────────────────────────────────── */}
      <aside style={{ width: 300, minWidth: 300, height: "100vh", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", background: "#FFF", position: "relative", zIndex: 2 }}>
        <div style={{ padding: "12px 12px 8px", borderBottom: "0.5px solid #F0F0F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 12px" }}>
              <Search size={14} color="#AAA" />
              <input
                placeholder="Pesquise seus contatos"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111" }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 0 }}>
                  <X size={12} color="#AAA" />
                </button>
              )}
            </div>
            <button
              onClick={() => setNewConvOpen(true)}
              title="Nova conversa"
              style={{ background: "#128A68", border: "none", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <UserPlus size={14} color="#FFF" />
            </button>
            <Bell
              size={16} color="#AAA" style={{ cursor: "pointer" }}
              onClick={() => toast("Nenhuma notificação nova")}
            />
            <Settings
              size={16} color="#AAA" style={{ cursor: "pointer" }}
              onClick={() => navigate("/configuracoes")}
            />
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {filters.map(f => (
              <FilterChip key={f.id} Icon={f.icon} count={f.count} isActive={activeFilter === f.id} onClick={() => setActiveFilter(activeFilter === f.id ? "" : f.id)} />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredConversations.length === 0 && (
            <div style={{ padding: "40px 16px", textAlign: "center" }}>
              <MessageSquare size={32} color="#E5E5E5" style={{ margin: "0 auto 8px" }} />
              {convList.length === 0 ? (
                <>
                  <p style={{ fontSize: 13, color: "#AAA", marginBottom: 4 }}>Nenhuma conversa ainda</p>
                  <p style={{ fontSize: 12, color: "#CCC", marginBottom: 12 }}>Clique no botão acima para iniciar uma conversa com um lead do pipeline</p>
                  <button
                    onClick={() => setNewConvOpen(true)}
                    style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >+ Nova conversa</button>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "#AAA" }}>Nenhuma conversa encontrada</p>
              )}
            </div>
          )}
          {filteredConversations.map(c => {
            const isActive = c.id === activeId;
            const cState = convStates[c.id];
            const unread = !cState?.read;
            return (
              <div
                key={c.id}
                onClick={() => { setActiveId(c.id); updateCs(c.id, { read: true }); }}
                style={{ padding: "12px 16px", borderBottom: "0.5px solid #F0F0F0", background: isActive ? "#E1F5EE" : "transparent", borderLeft: isActive ? "3px solid #128A68" : "3px solid transparent", cursor: "pointer", display: "flex", gap: 10 }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F9F9F9"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: colorFromString(c.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>
                    {initials(c.name)}
                  </div>
                  <ChannelBadge channel={c.channel} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: unread ? 700 : 600, color: isActive ? "#128A68" : "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: "#AAA" }}>{c.time}</span>
                      {unread && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#128A68" }} />}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: unread ? "#535353" : "#AAA", fontWeight: unread ? 500 : 400, margin: "2px 0 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.preview}</p>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.tags.slice(0, 2).map((t, i) => {
                      const s = tagStyle(t);
                      return <span key={i} style={{ fontSize: 10, fontWeight: 600, background: s.bg, color: s.fg, padding: "2px 6px", borderRadius: 4 }}>{t}</span>;
                    })}
                    {c.tags.length > 2 && <span style={{ fontSize: 10, color: "#AAA" }}>+{c.tags.length - 2}</span>}
                    {cState?.finished && <span style={{ fontSize: 10, fontWeight: 600, background: "#E1F5EE", color: "#128A68", padding: "2px 6px", borderRadius: 4 }}>✓ Finalizada</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── COLUNA 2 — CHAT ──────────────────────────────────────────── */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: "#F4F6F8", minWidth: 0 }}>
        {active && cs ? (
          <>
            {/* header */}
            <div style={{ minHeight: 52, background: "#FFF", borderBottom: "0.5px solid #E5E5E5", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: colorFromString(active.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {initials(active.name)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{active.name}</div>
                  <div style={{ fontSize: 11, color: "#AAA", display: "flex", alignItems: "center", gap: 4 }}>
                    <Filter size={10} />
                    {active.pipeline || "Pipeline Comercial"}
                  </div>

                  {/* WhatsApp instance selector */}
                  <div style={{ position: "relative", marginTop: 4 }}>
                    <button
                      onClick={e => { e.stopPropagation(); setInstanceOpen(o => !o); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, background: instances.length > 0 ? "#E1F5EE" : "#F5F5F5", border: "none", borderRadius: 100, padding: "3px 8px 3px 6px", cursor: "pointer", outline: "none" }}
                    >
                      <svg viewBox="0 0 24 24" width={12} height={12} style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="12" fill={instances.length > 0 ? "#25D366" : "#CCC"} />
                        <path fill="#FFF" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                      </svg>
                      <span style={{ fontSize: 11, fontWeight: 600, color: instances.length > 0 ? "#128A68" : "#AAA" }}>
                        {instances.length > 0 ? (instances.find(i => i.instanceId === selectedInstance)?.label ?? instances[0].label) : "Sem instância conectada"}
                      </span>
                      <ChevronDown size={10} color={instances.length > 0 ? "#128A68" : "#AAA"} />
                    </button>
                    {instanceOpen && (
                      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#FFF", border: "0.5px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 220, zIndex: 50, overflow: "hidden" }}>
                        {instances.length > 0 ? (
                          <>
                            <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "#AAA", fontWeight: 700, letterSpacing: 0.5 }}>INSTÂNCIAS CONECTADAS</div>
                            {instances.map(inst => (
                              <button key={inst.instanceId} onClick={() => { setSelectedInstance(inst.instanceId); setInstanceOpen(false); }}
                                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: selectedInstance === inst.instanceId ? "#E1F5EE" : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                                onMouseEnter={e => { if (selectedInstance !== inst.instanceId) e.currentTarget.style.background = "#F9F9F9"; }}
                                onMouseLeave={e => { if (selectedInstance !== inst.instanceId) e.currentTarget.style.background = "transparent"; }}
                              >
                                <svg viewBox="0 0 24 24" width={14} height={14}><circle cx="12" cy="12" r="12" fill="#25D366" /><path fill="#FFF" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></svg>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: selectedInstance === inst.instanceId ? "#128A68" : "#111" }}>{inst.label}</div>
                                  <div style={{ fontSize: 10, color: "#AAA" }}>Z-API</div>
                                </div>
                                {selectedInstance === inst.instanceId && <CheckCircle2 size={14} color="#128A68" style={{ marginLeft: "auto" }} />}
                              </button>
                            ))}
                            <div style={{ borderTop: "0.5px solid #F0F0F0", padding: "8px 12px" }}>
                              <button onClick={() => { setInstanceOpen(false); navigate("/configuracoes"); }} style={{ background: "transparent", border: "none", fontSize: 11, color: "#128A68", fontWeight: 600, cursor: "pointer", padding: 0 }}>+ Gerenciar conexões</button>
                            </div>
                          </>
                        ) : (
                          <div style={{ padding: 16 }}>
                            <p style={{ fontSize: 12, color: "#111", fontWeight: 600, marginBottom: 4 }}>Nenhuma instância conectada</p>
                            <p style={{ fontSize: 11, color: "#AAA", marginBottom: 10 }}>Conecte um número em Configurações → Conexões.</p>
                            <button onClick={() => { setInstanceOpen(false); navigate("/configuracoes"); }} style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Ir para Conexões</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#128A68", border: "1px solid #128A68", borderRadius: 100, padding: "4px 10px", fontWeight: 600, cursor: "pointer" }}>
                  {active.dealNumber || `#${active.id.slice(0, 4).toUpperCase()}`}
                </span>
                <ChatHeaderBtn icon={Eye} label="Marcar como lida" onClick={() => markAsRead(activeId)} />
                <ChatHeaderBtn
                  icon={Check}
                  label={cs.finished ? "Reabrir" : "Finalizar"}
                  onClick={() => {
                    if (cs.finished) { updateCs(activeId, { finished: false }); toast("Conversa reaberta"); }
                    else finishConv(activeId);
                  }}
                />
                <div style={{ position: "relative" }}>
                  <button
                    onClick={e => { e.stopPropagation(); setMoreMenuOpen(o => !o); }}
                    style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 4 }}
                  >
                    <MoreHorizontal size={18} color="#AAA" />
                  </button>
                  {moreMenuOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", right: 0, background: "#FFF", border: "0.5px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 160, zIndex: 50, overflow: "hidden" }}>
                      {[
                        { label: "Transferir", action: () => toast("Funcionalidade em breve") },
                        { label: "Arquivar", action: () => { updateCs(activeId, { finished: true }); toast("Conversa arquivada"); setMoreMenuOpen(false); } },
                        { label: "Abrir perfil", action: () => { navigate("/leads"); setMoreMenuOpen(false); } },
                      ].map(item => (
                        <button key={item.label} onClick={item.action}
                          style={{ width: "100%", display: "block", padding: "10px 14px", background: "transparent", border: "none", textAlign: "left", fontSize: 13, color: "#111", cursor: "pointer" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >{item.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* mensagens */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {cs.messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                  <MessageSquare size={40} color="#E5E5E5" />
                  <p style={{ fontSize: 13, color: "#AAA" }}>Nenhuma mensagem ainda</p>
                  <p style={{ fontSize: 12, color: "#CCC" }}>Envie uma mensagem para iniciar a conversa</p>
                </div>
              )}
              {groupedMessages.map(([date, msgs]) => (
                <div key={date}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
                    <div style={{ flex: 1, height: 0.5, background: "#E5E5E5" }} />
                    <span style={{ fontSize: 11, color: "#AAA", background: "#F5F5F5", borderRadius: 100, padding: "3px 12px" }}>{date}</span>
                    <div style={{ flex: 1, height: 0.5, background: "#E5E5E5" }} />
                  </div>
                  {msgs.map(m => {
                    const isAgent = m.from === "agent";
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: isAgent ? "flex-end" : "flex-start", marginBottom: 12 }}>
                        {!isAgent && (
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: colorFromString(active.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, marginRight: 8, flexShrink: 0 }}>
                            {initials(active.name)}
                          </div>
                        )}
                        <div style={{ maxWidth: "65%" }}>
                          <div style={{ fontSize: 11, color: "#AAA", marginBottom: 2, textAlign: isAgent ? "right" : "left" }}>
                            {isAgent ? `${m.agent} • ${m.time}` : `${active.name} • ${m.time}`}
                          </div>
                          <div style={{ padding: "10px 14px", borderRadius: isAgent ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: isAgent ? "#128A68" : "#FFF", color: isAgent ? "#FFF" : "#111", border: isAgent ? "none" : "0.5px solid #EEE", boxShadow: isAgent ? "none" : "0 1px 2px rgba(0,0,0,0.06)", fontSize: 14, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
                            {m.kind === "text" ? <span style={{ flex: 1 }}>{m.text}</span> : <AudioBubble duration={m.duration} light={isAgent} />}
                            {isAgent && m.kind === "text" && <CheckCheck size={14} color={m.read ? "#FFF" : "rgba(255,255,255,0.5)"} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* rodapé */}
            <div style={{ background: "#FFF", borderTop: "0.5px solid #E5E5E5", padding: "8px 16px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
                {[Paperclip, CalendarIcon, FolderOpen, Smile, Mic].map((Icon, i) => (
                  <Icon key={i} size={18} color="#AAA" style={{ cursor: "pointer" }} onClick={() => toast("Funcionalidade em breve")} />
                ))}
                <span title="Sugestão de resposta" onClick={() => toast("Sugestão IA em breve")} style={{ background: "#E1F5EE", borderRadius: 6, padding: 4, display: "inline-flex", cursor: "pointer" }}>
                  <Sparkles size={16} color="#128A68" />
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={cs.finished ? "Conversa finalizada — reabra para responder" : "Mensagem..."}
                  disabled={cs.finished}
                  style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "#111", padding: "4px 0", fontFamily: "inherit", opacity: cs.finished ? 0.5 : 1 }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputValue.trim() || cs.finished}
                  style={{ background: inputValue.trim() && !cs.finished ? "#128A68" : "#E5E5E5", border: "none", borderRadius: 8, padding: "6px 10px", cursor: inputValue.trim() && !cs.finished ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                >
                  <Send size={16} color={inputValue.trim() && !cs.finished ? "#FFF" : "#AAA"} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <MessageSquare size={64} color="#E5E5E5" />
            <div style={{ fontSize: 16, color: "#AAA" }}>Selecione uma conversa</div>
            <div style={{ fontSize: 13, color: "#CCC" }}>Escolha um contato à esquerda para iniciar o atendimento</div>
          </div>
        )}
      </section>

      {/* ── DIALOG: nova conversa ────────────────────────────────────── */}
      <NewConvDialog
        open={newConvOpen}
        onClose={() => { setNewConvOpen(false); setLeadSearch(""); }}
        leads={leads}
        pipelines={pipelines ?? []}
        onSelect={startConversationWithLead}
      />

      {/* ── COLUNA 3 — PERFIL + GESTÃO ───────────────────────────────── */}
      <aside style={{ width: 300, minWidth: 300, height: "100vh", borderLeft: "0.5px solid #E5E5E5", overflowY: "auto", background: "#FFF" }}>
        {active && cs && (
          <>
            {/* HEADER */}
            <div style={{ padding: "16px", borderBottom: "0.5px solid #F0F0F0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: colorFromString(active.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                  {initials(active.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{active.name}</span>
                    <ExternalLink size={12} color="#AAA" style={{ cursor: "pointer" }} onClick={() => navigate("/leads")} />
                  </div>
                  <span style={{ fontSize: 12, color: "#AAA" }}>{active.company || "—"}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {[{ icon: Plus, label: "Negócio" }, { icon: Zap, label: "Automação" }, { icon: Tag, label: "Lista" }].map(({ icon: Icon, label }) => (
                  <button key={label} onClick={() => toast(`${label}: em breve`)}
                    style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "6px 10px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#F5F5F5")}
                  ><Icon size={12} /> {label}</button>
                ))}
              </div>
            </div>

            {/* ETAPA NO PIPELINE */}
            <div style={{ padding: "16px", borderBottom: "0.5px solid #F0F0F0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 6 }}>ETAPA ATUAL</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{PIPELINE_STAGES[cs.stageIdx]}</div>
              <div style={{ fontSize: 12, color: "#AAA", marginBottom: 14 }}>{active.pipeline || "Pipeline Comercial"}</div>

              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ position: "absolute", top: "50%", left: 5, right: 5, height: 2, background: "#E5E5E5", transform: "translateY(-50%)" }} />
                <div style={{ position: "absolute", top: "50%", left: 5, width: `calc(${(cs.stageIdx / (PIPELINE_STAGES.length - 1)) * 100}% - 10px)`, height: 2, background: "#128A68", transform: "translateY(-50%)" }} />
                {PIPELINE_STAGES.map((_, i) => {
                  let bg = "#E5E5E5";
                  if (i < cs.stageIdx) bg = "rgba(18,138,104,0.3)";
                  if (i === cs.stageIdx) bg = "#128A68";
                  return <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: bg, position: "relative", zIndex: 1 }} />;
                })}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { if (cs.stageIdx > 0) updateCs(activeId, { stageIdx: cs.stageIdx - 1 }); }}
                  disabled={cs.stageIdx === 0}
                  style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "8px", color: "#666", fontSize: 12, fontWeight: 600, cursor: cs.stageIdx === 0 ? "not-allowed" : "pointer", opacity: cs.stageIdx === 0 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                ><ArrowLeft size={12} /> Voltar</button>
                <button onClick={() => { if (cs.stageIdx < PIPELINE_STAGES.length - 1) { const next = cs.stageIdx + 1; updateCs(activeId, { stageIdx: next }); toast.success(`Lead movido para ${PIPELINE_STAGES[next]} ✓`); } }}
                  disabled={cs.stageIdx === PIPELINE_STAGES.length - 1}
                  style={{ flex: 1, background: "#128A68", border: "none", borderRadius: 8, padding: "8px", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: cs.stageIdx === PIPELINE_STAGES.length - 1 ? "not-allowed" : "pointer", opacity: cs.stageIdx === PIPELINE_STAGES.length - 1 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                >Avançar <ArrowRight size={12} /></button>
              </div>

              <div style={{ fontSize: 11, color: "#AAA", marginTop: 12, marginBottom: 4 }}>ou escolha a etapa diretamente</div>
              <select
                value={PIPELINE_STAGES[cs.stageIdx]}
                onChange={e => { const idx = PIPELINE_STAGES.indexOf(e.target.value); if (idx >= 0) { updateCs(activeId, { stageIdx: idx }); toast.success(`Lead movido para ${e.target.value} ✓`); } }}
                style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#111", background: "#FFF", outline: "none", cursor: "pointer" }}
              >
                {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* PRÓXIMA ATIVIDADE */}
            <div style={{ padding: "16px", borderBottom: "0.5px solid #F0F0F0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 8 }}>PRÓXIMA ATIVIDADE</div>

              {cs.meeting ? (
                <div style={{ background: "#F9FBFA", border: "0.5px solid #E5E5E5", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <CalendarIcon size={16} color="#128A68" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{cs.meeting.date} às {cs.meeting.time}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Responsável: {cs.meeting.owner}</div>
                  <span style={{ display: "inline-block", background: "#E1F5EE", color: "#128A68", fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, marginBottom: 8 }}>Reunião agendada</span>
                  {cs.meeting.note && <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{cs.meeting.note}</div>}
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => { setMeetingFormFor(activeId); setMDate(cs.meeting!.date); setMTime(cs.meeting!.time); setMOwner(cs.meeting!.owner); setMNote(cs.meeting!.note); }}
                      style={{ background: "transparent", border: "none", color: "#666", fontSize: 11, cursor: "pointer", padding: 0 }}>Remarcar</button>
                    <button onClick={() => cancelMeeting(activeId)}
                      style={{ background: "transparent", border: "none", color: "#A32D2D", fontSize: 11, cursor: "pointer", padding: 0 }}>Cancelar</button>
                  </div>
                </div>
              ) : meetingFormFor === activeId ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input type="date" value={mDate} onChange={e => setMDate(e.target.value)} style={inputStyle} />
                  <input type="time" value={mTime} onChange={e => setMTime(e.target.value)} style={inputStyle} />
                  <select value={mOwner} onChange={e => setMOwner(e.target.value)} style={inputStyle}>
                    <option>Rafael</option><option>Mariana</option><option>Carlos</option>
                  </select>
                  <textarea placeholder="Observação..." value={mNote} onChange={e => setMNote(e.target.value)}
                    style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "inherit" }} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => { setMeetingFormFor(null); setMDate(""); setMTime(""); setMNote(""); }}
                      style={{ background: "transparent", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#666", cursor: "pointer" }}>Cancelar</button>
                    <button onClick={saveMeeting}
                      style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Agendar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#AAA", marginBottom: 8 }}>Sem atividades agendadas</div>
                  <button onClick={() => setMeetingFormFor(activeId)}
                    style={{ background: "#E1F5EE", border: "none", color: "#128A68", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#c8efe3")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#E1F5EE")}
                  ><Plus size={12} /> Agendar reunião</button>
                </>
              )}
            </div>

            {/* SEÇÕES EXPANSÍVEIS */}
            <Section title="Perfil" defaultOpen>
              {[
                ["Nome",               active.name],
                ["E-mail",             active.email || "—"],
                ["Telefone",           active.phone || "—"],
                ["Empresa",            active.company || "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                  <span style={{ fontSize: 12, color: "#AAA" }}>{k}</span>
                  <span style={{ color: "#111", textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </Section>

            <Section title="Notas">
              <textarea
                placeholder="Adicionar nota..."
                value={cs.notes}
                onChange={e => updateCs(activeId, { notes: e.target.value })}
                style={{ width: "100%", background: "#F5F5F5", borderRadius: 8, padding: 10, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", minHeight: 80, resize: "vertical" }}
              />
              {cs.notes && <div style={{ fontSize: 11, color: "#AAA", marginTop: 4 }}>Salvo automaticamente</div>}
            </Section>

            <Section title="Negócio vinculado" defaultOpen>
              <div style={{ border: "0.5px solid #E5E5E5", borderRadius: 10, padding: 12, cursor: "pointer" }}
                onClick={() => navigate("/pipeline")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: colorFromString(active.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>
                    {initials(active.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{active.name}</div>
                    <div style={{ fontSize: 11, color: "#AAA" }}>{active.company || "Sem empresa"}</div>
                  </div>
                </div>
                {active.value ? (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#128A68", marginBottom: 4 }}>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(active.value)}
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{active.pipeline || "Pipeline Comercial"}</div>
                <div style={{ height: 4, background: "#F0F0F0", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${((cs.stageIdx + 1) / PIPELINE_STAGES.length) * 100}%`, height: "100%", background: "#128A68" }} />
                </div>
                <div style={{ fontSize: 11, color: "#128A68", fontWeight: 600 }}>{active.dealNumber || `#${active.id.padStart(4, "0")}`}</div>
              </div>
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 12px",
  fontSize: 13, color: "#111", background: "#FFF", outline: "none", width: "100%",
};

/* ── Nova conversa dialog ─────────────────────────────────────────────── */
function NewConvDialog({
  open, onClose, leads, pipelines, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  leads: Record<string, Lead>;
  pipelines: Pipeline[];
  onSelect: (leadId: string) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  if (!open) return null;

  const pipelineMap = Object.fromEntries((pipelines ?? []).map(p => [p.id, p.name]));

  const filteredLeads = Object.values(leads)
    .filter(l => !l.dealStatus || l.dealStatus === "open")
    .filter(l => !q.trim() || l.name.toLowerCase().includes(q.toLowerCase()) || (l.company ?? "").toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#FFF", borderRadius: 16, width: 480, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}
      >
        {/* header */}
        <div style={{ padding: "18px 20px 12px", borderBottom: "0.5px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Nova conversa</div>
            <div style={{ fontSize: 12, color: "#AAA", marginTop: 2 }}>Selecione um negócio do pipeline</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#AAA" />
          </button>
        </div>

        {/* search */}
        <div style={{ padding: "12px 20px", borderBottom: "0.5px solid #F0F0F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 12px" }}>
            <Search size={14} color="#AAA" />
            <input
              ref={inputRef}
              placeholder="Buscar por nome ou empresa..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111" }}
            />
            {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 0 }}><X size={12} color="#AAA" /></button>}
          </div>
        </div>

        {/* lista de leads */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredLeads.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <MessageSquare size={32} color="#E5E5E5" style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 13, color: "#AAA" }}>Nenhum negócio encontrado</p>
              <p style={{ fontSize: 12, color: "#CCC", marginTop: 4 }}>Tente outro nome ou crie um lead no Pipeline</p>
            </div>
          )}
          {filteredLeads.map(lead => (
            <button
              key={lead.id}
              onClick={() => onSelect(lead.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {/* avatar */}
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: colorFromString(lead.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {initials(lead.name)}
              </div>

              {/* info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</span>
                  <span style={{ fontSize: 11, color: "#AAA", whiteSpace: "nowrap" }}>#{lead.dealNumber}</span>
                </div>
                <div style={{ display: "flex", align: "center", gap: 8, flexWrap: "wrap" }}>
                  {lead.company && <span style={{ fontSize: 11, color: "#666" }}>{lead.company}</span>}
                  {lead.company && <span style={{ fontSize: 11, color: "#DDD" }}>•</span>}
                  <span style={{ fontSize: 11, color: "#AAA" }}>{pipelineMap[lead.pipelineId] ?? "Pipeline"}</span>
                </div>
              </div>

              {/* valor */}
              {lead.value > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "#128A68", flexShrink: 0 }}>
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.value)}
                </div>
              )}

              {/* ícone seta */}
              <div style={{ flexShrink: 0, color: "#CCC" }}>→</div>
            </button>
          ))}
        </div>

        {/* footer */}
        {filteredLeads.length > 0 && (
          <div style={{ padding: "10px 20px", borderTop: "0.5px solid #F0F0F0", fontSize: 11, color: "#AAA", textAlign: "center" }}>
            {filteredLeads.length} negócio{filteredLeads.length !== 1 ? "s" : ""} encontrado{filteredLeads.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
