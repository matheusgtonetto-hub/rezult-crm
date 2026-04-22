import { useState } from "react";
import { toast } from "sonner";
import {
  Search, Bell, Settings, Mail, Clock, Folder, Zap, CheckCircle2, AlertTriangle,
  Filter, Eye, Check, MoreHorizontal, Paperclip, Calendar as CalendarIcon, FolderOpen,
  Smile, Mic, Sparkles, ExternalLink, ChevronDown, ChevronRight, Play, CheckCheck,
  MessageSquare, Plus, ArrowLeft, ArrowRight, Tag,
} from "lucide-react";

/* ---------- helpers ---------- */
function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 50%)`;
}
function initials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/* tag color presets (Rezult palette) */
const TAG_STYLES: Record<string, { bg: string; fg: string }> = {
  Rafael:     { bg: "#E1F5EE", fg: "#128A68" },
  Mariana:    { bg: "#EDE9FE", fg: "#534AB7" },
  Carlos:     { bg: "#FEF3C7", fg: "#854F0B" },
  SDR:        { bg: "#F5F5F5", fg: "#666666" },
  "Follow-up":{ bg: "#FEE2E2", fg: "#A32D2D" },
  Proposta:   { bg: "#DBEAFE", fg: "#185FA5" },
  Negociação: { bg: "#F3E8FF", fg: "#6D28D9" },
  Reunião:    { bg: "#FEF3C7", fg: "#854F0B" },
  Fechado:    { bg: "#E1F5EE", fg: "#128A68" },
};
function tagStyle(label: string) {
  return TAG_STYLES[label] || { bg: "#F5F5F5", fg: "#666666" };
}

/* ---------- types ---------- */
type Channel = "whatsapp" | "instagram";
type Conversation = {
  id: string; name: string; preview: string; time: string;
  channel: Channel; tags: string[]; dealNumber?: string; pipeline?: string;
};
type Msg =
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "text"; text: string; date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "audio"; duration: string; date: string; read?: boolean };

/* ---------- mock data ---------- */
const conversations: Conversation[] = [
  { id: "1", name: "Gilberto Gentil", preview: "Oi Gilberto! Só passando para lembrar...", time: "6h", channel: "whatsapp", tags: ["Follow-up", "Rafael"] },
  { id: "2", name: "Marcia Almeida",  preview: "Bom dia Marcia! Sei que a rotina está intensa...", time: "6h", channel: "whatsapp", tags: ["Follow-up", "Mariana"] },
  { id: "3", name: "Carlos Andrade",  preview: "Oi Carlos! Sua proposta está pronta...", time: "2h", channel: "whatsapp", tags: ["Proposta", "Carlos"], dealNumber: "#1085", pipeline: "Pipeline Comercial" },
  { id: "4", name: "Bruno Lima",      preview: "Bruno, conseguiu analisar nossa proposta?", time: "1h", channel: "instagram", tags: ["Negociação", "Rafael"] },
  { id: "5", name: "Ana Paula Silva", preview: "Ana, tudo bem? Podemos agendar uma call?", time: "3h", channel: "whatsapp", tags: ["SDR", "Mariana"] },
  { id: "6", name: "Diego Ferreira",  preview: "Diego! Só confirmando nossa reunião...", time: "4h", channel: "whatsapp", tags: ["Reunião", "Carlos"] },
  { id: "7", name: "Fernanda Lima",   preview: "Fernanda, segue o contrato conforme...", time: "5h", channel: "instagram", tags: ["Fechado", "Rafael"] },
  { id: "8", name: "Larissa Andrade", preview: "Oi Larissa! Como posso te ajudar hoje?", time: "7h", channel: "whatsapp", tags: ["SDR", "Mariana"] },
];

const messages: Msg[] = [
  { id: "m1", from: "lead",  time: "14:06", kind: "audio", duration: "0:16", date: "Ontem" },
  { id: "m2", from: "agent", agent: "Rafael", time: "14:07", kind: "text", text: "Entendido Carlos! No seu caso pode parcelar em até 5x no cartão ou se for em boleto, 3x", date: "Ontem", read: true },
  { id: "m3", from: "lead",  time: "15:06", kind: "audio", duration: "0:29", date: "Ontem" },
  { id: "m4", from: "agent", agent: "Rafael", time: "15:54", kind: "text", text: "Vou formalizar para você", date: "Ontem", read: true },
  { id: "m5", from: "agent", agent: "Rafael", time: "16:11", kind: "text", text: "Te envio até amanhã, pedi nosso jurídico para fazer, tudo bem?", date: "Ontem", read: true },
  { id: "m6", from: "lead",  time: "16:37", kind: "text", text: "Obrigado", date: "Ontem" },
  { id: "m7", from: "lead",  time: "08:19", kind: "text", text: "Bom dia tudo bem?", date: "Hoje" },
  { id: "m8", from: "lead",  time: "08:19", kind: "text", text: "Fizeram?", date: "Hoje" },
  { id: "m9", from: "agent", agent: "Rafael", time: "08:45", kind: "text", text: "Bom dia Carlos! Estamos finalizando, te envio ainda hoje até as 14h", date: "Hoje", read: false },
  { id: "m10", from: "agent", agent: "Rafael", time: "08:46", kind: "text", text: "Pode deixar que a gente garante! 👊", date: "Hoje", read: false },
];

const PIPELINE_STAGES = ["Novo Lead", "Contato Feito", "Proposta Enviada", "Negociação", "Fechado", "Perdido"];

/* ---------- subcomponents ---------- */
function ChannelBadge({ channel }: { channel: Channel }) {
  if (channel === "whatsapp") {
    return (
      <span style={{
        position: "absolute", bottom: -2, right: -2,
        borderRadius: "50%", border: "2px solid #FFFFFF",
        background: "#FFFFFF", lineHeight: 0,
      }}>
        <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#25D366" />
          <path fill="#FFFFFF" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        </svg>
      </span>
    );
  }
  return (
    <span style={{
      position: "absolute", bottom: -2, right: -2, width: 14, height: 14,
      borderRadius: "50%", background: "#E1306C", border: "2px solid #FFFFFF",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontSize: 7, fontWeight: 700,
    }}>
      I
    </span>
  );
}

function Waveform({ light }: { light: boolean }) {
  const heights = [6, 10, 14, 8, 16, 12, 18, 10, 6, 12, 14, 8, 16, 10, 6];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          width: 2, height: h,
          background: light ? "rgba(255,255,255,0.5)" : "#128A68",
          opacity: light ? 1 : 0.4,
          borderRadius: 1,
        }} />
      ))}
    </div>
  );
}

function AudioBubble({ duration, light }: { duration: string; light: boolean }) {
  const fg = light ? "#FFFFFF" : "#128A68";
  const btnBg = light ? "rgba(255,255,255,0.3)" : "#128A68";
  const btnFg = "#FFFFFF";
  const wrapBg = light ? "transparent" : "#F5F5F5";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: wrapBg, padding: light ? 0 : "6px 10px", borderRadius: 10 }}>
      <button style={{
        width: 32, height: 32, borderRadius: "50%",
        background: btnBg, color: btnFg, border: "none",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
      }}>
        <Play size={14} fill={btnFg} />
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
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#F9F9F9")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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

/* ---------- filter chip ---------- */
function FilterChip({ Icon, count, isActive, isHighlight, onClick }: { Icon: any; count: number | null; isActive: boolean; isHighlight: boolean; onClick: () => void }) {
  let bg = "#F5F5F5", fg = "#666666", border = "1px solid transparent";
  if (isHighlight && !isActive) { bg = "#128A68"; fg = "#FFFFFF"; }
  if (isActive) { bg = "#E1F5EE"; fg = "#128A68"; border = "1px solid #128A68"; }
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 4,
      background: bg, color: fg, border, borderRadius: 100,
      padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
    }}>
      <Icon size={12} />
      {count !== null && <span>{count}</span>}
    </button>
  );
}

/* ---------- main page ---------- */
export default function MultiatendimentoPage() {
  const [activeId, setActiveId] = useState<string>("3");
  const [activeFilter, setActiveFilter] = useState<string>("auto");
  const active = conversations.find(c => c.id === activeId);

  // Pipeline stage state
  const [stageIdx, setStageIdx] = useState(2); // Proposta Enviada
  const advance = () => {
    if (stageIdx < PIPELINE_STAGES.length - 1) {
      const next = stageIdx + 1;
      setStageIdx(next);
      toast.success(`Lead movido para ${PIPELINE_STAGES[next]} ✓`);
    }
  };
  const back = () => {
    if (stageIdx > 0) {
      const prev = stageIdx - 1;
      setStageIdx(prev);
      toast(`Lead voltou para ${PIPELINE_STAGES[prev]}`);
    }
  };
  const selectStage = (s: string) => {
    const idx = PIPELINE_STAGES.indexOf(s);
    if (idx >= 0 && idx !== stageIdx) {
      setStageIdx(idx);
      toast.success(`Lead movido para ${s} ✓`);
    }
  };

  // Meeting state
  const [meetingForm, setMeetingForm] = useState(false);
  const [meeting, setMeeting] = useState<{ date: string; time: string; owner: string; note: string } | null>(null);
  const [mDate, setMDate] = useState("");
  const [mTime, setMTime] = useState("");
  const [mOwner, setMOwner] = useState("Rafael");
  const [mNote, setMNote] = useState("");

  const filters = [
    { id: "email", icon: Mail, count: 1 },
    { id: "pending", icon: Clock, count: 1 },
    { id: "folder", icon: Folder, count: 9 },
    { id: "auto", icon: Zap, count: 41, highlight: true },
    { id: "done", icon: CheckCircle2, count: null },
    { id: "alert", icon: AlertTriangle, count: null },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "#F4F6F8" }}>
      {/* COLUNA 1 — LISTA */}
      <aside style={{ width: 300, minWidth: 300, height: "100vh", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", background: "#FFFFFF", position: "relative", zIndex: 2 }}>
        <div style={{ padding: "12px 12px 8px", borderBottom: "0.5px solid #F0F0F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 12px" }}>
              <Search size={14} color="#AAA" />
              <input
                placeholder="Pesquise seus contatos"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111" }}
              />
            </div>
            <Bell size={16} color="#AAA" style={{ cursor: "pointer" }} />
            <Settings size={16} color="#AAA" style={{ cursor: "pointer" }} />
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {filters.map(f => (
              <FilterChip
                key={f.id}
                Icon={f.icon}
                count={f.count}
                isActive={activeFilter === f.id}
                isHighlight={!!f.highlight}
                onClick={() => setActiveFilter(f.id)}
              />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.map(c => {
            const isActive = c.id === activeId;
            return (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "0.5px solid #F0F0F0",
                  background: isActive ? "#E1F5EE" : "transparent",
                  borderLeft: isActive ? "3px solid #128A68" : "3px solid transparent",
                  cursor: "pointer",
                  display: "flex", gap: 10,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#F9F9F9"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: colorFromString(c.name), color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {initials(c.name)}
                  </div>
                  <ChannelBadge channel={c.channel} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: isActive ? 700 : 600,
                      color: isActive ? "#128A68" : "#111",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                    }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: "#AAA", flexShrink: 0 }}>{c.time}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#AAA", margin: "2px 0 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.preview}</p>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.tags.slice(0, 2).map((t, i) => {
                      const s = tagStyle(t);
                      return (
                        <span key={i} style={{
                          fontSize: 10, fontWeight: 600,
                          background: s.bg, color: s.fg,
                          padding: "2px 6px", borderRadius: 4,
                        }}>{t}</span>
                      );
                    })}
                    {c.tags.length > 2 && <span style={{ fontSize: 10, color: "#AAA" }}>+{c.tags.length - 2}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* COLUNA 2 — CHAT */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: "#F4F6F8", minWidth: 0 }}>
        {active ? (
          <>
            {/* header */}
            <div style={{ height: 52, background: "#FFFFFF", borderBottom: "0.5px solid #E5E5E5", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: colorFromString(active.name), color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600,
                }}>
                  {initials(active.name)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{active.name}</div>
                  <div style={{ fontSize: 11, color: "#AAA", display: "flex", alignItems: "center", gap: 4 }}>
                    <Filter size={10} />
                    {active.pipeline || "Pipeline Comercial"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 12, color: "#128A68", border: "1px solid #128A68",
                  borderRadius: 100, padding: "4px 10px", fontWeight: 600, cursor: "pointer",
                }}>{active.dealNumber || "#1085"}</span>
                <ChatHeaderBtn icon={Eye} label="Marcar como lida" />
                <ChatHeaderBtn icon={Check} label="Finalizar" />
                <MoreHorizontal size={18} color="#AAA" style={{ cursor: "pointer" }} />
              </div>
            </div>

            {/* mensagens */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {(() => {
                const grouped: Record<string, Msg[]> = {};
                messages.forEach(m => { (grouped[m.date] ||= []).push(m); });
                return Object.entries(grouped).map(([date, msgs]) => (
                  <div key={date}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
                      <div style={{ flex: 1, height: 0.5, background: "#E5E5E5" }} />
                      <span style={{
                        fontSize: 11, color: "#AAA", background: "#F5F5F5",
                        borderRadius: 100, padding: "3px 12px",
                      }}>{date}</span>
                      <div style={{ flex: 1, height: 0.5, background: "#E5E5E5" }} />
                    </div>
                    {msgs.map(m => {
                      const isAgent = m.from === "agent";
                      return (
                        <div key={m.id} style={{ display: "flex", justifyContent: isAgent ? "flex-end" : "flex-start", marginBottom: 12 }}>
                          {!isAgent && (
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: colorFromString(active.name), color: "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 600, marginRight: 8, flexShrink: 0,
                            }}>{initials(active.name)}</div>
                          )}
                          <div style={{ maxWidth: "65%" }}>
                            <div style={{ fontSize: 11, color: "#AAA", marginBottom: 2, textAlign: isAgent ? "right" : "left" }}>
                              {isAgent ? `${m.agent} • ${m.time}` : `${active.name} • ${m.time}`}
                            </div>
                            <div style={{
                              padding: "10px 14px",
                              borderRadius: isAgent ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                              background: isAgent ? "#128A68" : "#FFFFFF",
                              color: isAgent ? "#FFFFFF" : "#111",
                              border: isAgent ? "none" : "0.5px solid #EEEEEE",
                              boxShadow: isAgent ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                              fontSize: 14, lineHeight: 1.4,
                              display: "flex", alignItems: "center", gap: 8,
                            }}>
                              {m.kind === "text" ? (
                                <span style={{ flex: 1 }}>{m.text}</span>
                              ) : (
                                <AudioBubble duration={m.duration} light={isAgent} />
                              )}
                              {isAgent && m.kind === "text" && (
                                <CheckCheck size={14} color={m.read ? "#FFFFFF" : "rgba(255,255,255,0.5)"} />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>

            {/* rodapé */}
            <div style={{ background: "#FFFFFF", borderTop: "0.5px solid #E5E5E5", padding: "8px 16px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
                {[Paperclip, CalendarIcon, FolderOpen, Smile, Mic].map((Icon, i) => (
                  <Icon key={i} size={18} color="#AAA" style={{ cursor: "pointer" }} />
                ))}
                <span title="Sugestão de resposta" style={{
                  background: "#E1F5EE", borderRadius: 6, padding: 4,
                  display: "inline-flex", cursor: "pointer",
                }}>
                  <Sparkles size={16} color="#128A68" />
                </span>
                <Smile size={18} color="#AAA" style={{ cursor: "pointer" }} />
              </div>
              <input
                placeholder="Mensagem..."
                style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 14, color: "#111", padding: "4px 0", fontFamily: "inherit" }}
              />
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

      {/* COLUNA 3 — PERFIL + GESTÃO */}
      <aside style={{ width: 300, minWidth: 300, height: "100vh", borderLeft: "0.5px solid #E5E5E5", overflowY: "auto", background: "#FFFFFF" }}>
        {active && (
          <>
            {/* HEADER */}
            <div style={{ padding: "16px", borderBottom: "0.5px solid #F0F0F0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: colorFromString(active.name), color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700,
                }}>{initials(active.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{active.name}</span>
                    <ExternalLink size={12} color="#AAA" style={{ cursor: "pointer" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "#AAA" }}>Andrade & Cia</span>
                </div>
              </div>

              {/* AÇÕES RÁPIDAS */}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {[
                  { icon: Plus, label: "Negócio" },
                  { icon: Zap, label: "Automação" },
                  { icon: Tag, label: "Lista" },
                ].map(({ icon: Icon, label }) => (
                  <button key={label} style={{
                    flex: 1, background: "#F5F5F5", border: "none",
                    borderRadius: 8, padding: "6px 10px", color: "#128A68",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}>
                    <Icon size={12} /> {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ETAPA NO PIPELINE */}
            <div style={{ padding: "16px", borderBottom: "0.5px solid #F0F0F0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 6 }}>ETAPA ATUAL</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{PIPELINE_STAGES[stageIdx]}</div>
              <div style={{ fontSize: 12, color: "#AAA", marginBottom: 14 }}>Pipeline Comercial</div>

              {/* progress dots */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ position: "absolute", top: "50%", left: 5, right: 5, height: 2, background: "#E5E5E5", transform: "translateY(-50%)" }} />
                <div style={{
                  position: "absolute", top: "50%", left: 5,
                  width: `calc(${(stageIdx / (PIPELINE_STAGES.length - 1)) * 100}% - 10px)`,
                  height: 2, background: "#128A68", transform: "translateY(-50%)",
                }} />
                {PIPELINE_STAGES.map((_, i) => {
                  let bg = "#E5E5E5";
                  if (i < stageIdx) bg = "rgba(18,138,104,0.3)";
                  if (i === stageIdx) bg = "#128A68";
                  return <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: bg, position: "relative", zIndex: 1 }} />;
                })}
              </div>

              {/* stage buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={back}
                  disabled={stageIdx === 0}
                  style={{
                    flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8,
                    padding: "8px", color: "#666", fontSize: 12, fontWeight: 600,
                    cursor: stageIdx === 0 ? "not-allowed" : "pointer",
                    opacity: stageIdx === 0 ? 0.4 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                ><ArrowLeft size={12} /> Voltar</button>
                <button
                  onClick={advance}
                  disabled={stageIdx === PIPELINE_STAGES.length - 1}
                  style={{
                    flex: 1, background: "#128A68", border: "none", borderRadius: 8,
                    padding: "8px", color: "#FFF", fontSize: 12, fontWeight: 600,
                    cursor: stageIdx === PIPELINE_STAGES.length - 1 ? "not-allowed" : "pointer",
                    opacity: stageIdx === PIPELINE_STAGES.length - 1 ? 0.4 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                >Avançar <ArrowRight size={12} /></button>
              </div>

              <div style={{ fontSize: 11, color: "#AAA", marginTop: 12, marginBottom: 4 }}>ou escolha a etapa diretamente</div>
              <select
                value={PIPELINE_STAGES[stageIdx]}
                onChange={(e) => selectStage(e.target.value)}
                style={{
                  width: "100%", border: "1px solid #E5E5E5", borderRadius: 8,
                  padding: "8px 12px", fontSize: 13, color: "#111",
                  background: "#FFF", outline: "none", cursor: "pointer",
                }}
              >
                {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* AGENDAR REUNIÃO */}
            <div style={{ padding: "16px", borderBottom: "0.5px solid #F0F0F0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 8 }}>PRÓXIMA ATIVIDADE</div>

              {meeting ? (
                <div style={{ background: "#F9FBFA", border: "0.5px solid #E5E5E5", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <CalendarIcon size={16} color="#128A68" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{meeting.date} às {meeting.time}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Responsável: {meeting.owner}</div>
                  <span style={{
                    display: "inline-block", background: "#E1F5EE", color: "#128A68",
                    fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, marginBottom: 8,
                  }}>Reunião agendada</span>
                  {meeting.note && <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{meeting.note}</div>}
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => setMeetingForm(true)} style={{ background: "transparent", border: "none", color: "#666", fontSize: 11, cursor: "pointer", padding: 0 }}>Remarcar</button>
                    <button onClick={() => { setMeeting(null); toast("Reunião cancelada"); }} style={{ background: "transparent", border: "none", color: "#A32D2D", fontSize: 11, cursor: "pointer", padding: 0 }}>Cancelar</button>
                  </div>
                </div>
              ) : !meetingForm ? (
                <>
                  <div style={{ fontSize: 12, color: "#AAA", marginBottom: 8 }}>Sem atividades agendadas</div>
                  <button
                    onClick={() => setMeetingForm(true)}
                    style={{
                      background: "#E1F5EE", border: "none", color: "#128A68",
                      borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                    }}
                  ><Plus size={12} /> Agendar reunião</button>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} style={inputStyle} />
                  <input type="time" value={mTime} onChange={(e) => setMTime(e.target.value)} style={inputStyle} />
                  <select value={mOwner} onChange={(e) => setMOwner(e.target.value)} style={inputStyle}>
                    <option>Rafael</option><option>Mariana</option><option>Carlos</option>
                  </select>
                  <textarea
                    placeholder="Observação..."
                    value={mNote}
                    onChange={(e) => setMNote(e.target.value)}
                    style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => { setMeetingForm(false); setMDate(""); setMTime(""); setMNote(""); }}
                      style={{ background: "transparent", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#666", cursor: "pointer" }}
                    >Cancelar</button>
                    <button
                      onClick={() => {
                        if (!mDate || !mTime) { toast.error("Informe data e hora"); return; }
                        setMeeting({ date: mDate, time: mTime, owner: mOwner, note: mNote });
                        setMeetingForm(false);
                        toast.success("Reunião agendada ✓");
                      }}
                      style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >Agendar</button>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÕES EXPANSÍVEIS */}
            <Section title="Perfil" defaultOpen>
              {[
                ["Nome", "Carlos Andrade"],
                ["E-mail", "carlos@andrade.com"],
                ["Telefone", "+55 (11) 99999-9999"],
                ["Empresa", "Andrade & Cia"],
                ["Site", "www.andrade.com.br"],
                ["Documento", "—"],
                ["Data de Nascimento", "—"],
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
                style={{ width: "100%", background: "#F5F5F5", borderRadius: 8, padding: 10, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", minHeight: 80, resize: "vertical" }}
              />
            </Section>

            <Section title="Endereço">
              {["CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "Estado"].map(f => (
                <div key={f} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                  <span style={{ fontSize: 12, color: "#AAA" }}>{f}</span>
                  <span style={{ color: "#CCC" }}>—</span>
                </div>
              ))}
            </Section>

            <Section
              title="Qualificação do Lead"
              action={<span style={{ fontSize: 11, color: "#128A68", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}><Plus size={12} /> Adicionar</span>}
            >
              {["O que o lead está buscando?", "Qual o ramo da empresa?", "O lead é o decisor?"].map(q => (
                <div key={q} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#AAA", marginBottom: 4 }}>{q}</div>
                  <div style={{ height: 32, background: "#F5F5F5", borderRadius: 6 }} />
                </div>
              ))}
            </Section>

            <Section title="Negócio vinculado" defaultOpen>
              <div style={{ border: "0.5px solid #E5E5E5", borderRadius: 10, padding: 12, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: colorFromString(active.name), color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600,
                  }}>{initials(active.name)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{active.name}</div>
                    <div style={{ fontSize: 11, color: "#AAA" }}>Sem produto</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Atendente: Rafael Silva</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#128A68", marginBottom: 4 }}>R$ 3.500,00</div>
                <div style={{ fontSize: 11, color: "#AAA", marginBottom: 8 }}>14/04/2026 • Sem atividades</div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Pipeline Comercial</div>
                <div style={{ height: 4, background: "#F0F0F0", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${((stageIdx + 1) / PIPELINE_STAGES.length) * 100}%`, height: "100%", background: "#128A68" }} />
                </div>
                <div style={{ fontSize: 11, color: "#128A68", fontWeight: 600 }}>{active.dealNumber || "#1085"}</div>
              </div>
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #E5E5E5",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "#111",
  background: "#FFF",
  outline: "none",
  width: "100%",
};

/* ---------- chat header button with hover ---------- */
function ChatHeaderBtn({ icon: Icon, label }: { icon: any; label: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 100,
        border: `1px solid ${hover ? "#128A68" : "#E5E5E5"}`,
        background: "transparent",
        color: hover ? "#128A68" : "#111",
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}
