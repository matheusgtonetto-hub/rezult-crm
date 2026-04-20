import { useState } from "react";
import {
  Search,
  Bell,
  Settings,
  Mail,
  Clock,
  Folder,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Filter,
  Eye,
  Check,
  MoreHorizontal,
  Paperclip,
  Calendar,
  FolderOpen,
  Smile,
  Mic,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Play,
  CheckCheck,
  MessageSquare,
  Plus,
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

/* ---------- types ---------- */
type Channel = "whatsapp" | "instagram";
type ConvTag = { label: string; color: string };
type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  channel: Channel;
  tags: ConvTag[];
  dealNumber?: string;
  pipeline?: string;
};

type Msg =
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "text"; text: string; date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "audio"; duration: string; date: string; read?: boolean };

/* ---------- mock data ---------- */
const conversations: Conversation[] = [
  { id: "1", name: "Gilberto Gentil", preview: "Oi Gilberto! Só passando para lembrar...", time: "6h", channel: "whatsapp", tags: [{ label: "Follow-up", color: "#F59E0B" }, { label: "Rafael", color: "#8B5CF6" }] },
  { id: "2", name: "Marcia Almeida", preview: "Bom dia Marcia! Sei que a rotina está intensa...", time: "6h", channel: "whatsapp", tags: [{ label: "Follow-up", color: "#F59E0B" }, { label: "Mariana", color: "#EC4899" }] },
  { id: "3", name: "Carlos Andrade", preview: "Oi Carlos! Sua proposta está pronta...", time: "2h", channel: "whatsapp", tags: [{ label: "Proposta", color: "#0F6E56" }, { label: "Carlos", color: "#3B82F6" }], dealNumber: "#1085", pipeline: "Pipeline Comercial" },
  { id: "4", name: "Bruno Lima", preview: "Bruno, conseguiu analisar nossa proposta?", time: "1h", channel: "instagram", tags: [{ label: "Negociação", color: "#0F6E56" }, { label: "Rafael", color: "#8B5CF6" }] },
  { id: "5", name: "Ana Paula Silva", preview: "Ana, tudo bem? Podemos agendar uma call?", time: "3h", channel: "whatsapp", tags: [{ label: "SDR", color: "#06B6D4" }, { label: "Mariana", color: "#EC4899" }] },
  { id: "6", name: "Diego Ferreira", preview: "Diego! Só confirmando nossa reunião...", time: "4h", channel: "whatsapp", tags: [{ label: "Reunião", color: "#F59E0B" }, { label: "Carlos", color: "#3B82F6" }] },
  { id: "7", name: "Fernanda Lima", preview: "Fernanda, segue o contrato conforme...", time: "5h", channel: "instagram", tags: [{ label: "Fechado", color: "#0F6E56" }, { label: "Rafael", color: "#8B5CF6" }] },
  { id: "8", name: "Larissa Andrade", preview: "Oi Larissa! Como posso te ajudar hoje?", time: "7h", channel: "whatsapp", tags: [{ label: "SDR", color: "#06B6D4" }, { label: "Mariana", color: "#EC4899" }] },
];

const messages: Msg[] = [
  { id: "m1", from: "lead", time: "14:06", kind: "audio", duration: "0:16", date: "Ontem" },
  { id: "m2", from: "agent", agent: "Rafael", time: "14:07", kind: "text", text: "Entendido Carlos! No seu caso pode parcelar em até 5x no cartão ou se for em boleto, 3x", date: "Ontem", read: true },
  { id: "m3", from: "lead", time: "15:06", kind: "audio", duration: "0:29", date: "Ontem" },
  { id: "m4", from: "agent", agent: "Rafael", time: "15:54", kind: "text", text: "Vou formalizar para você", date: "Ontem", read: true },
  { id: "m5", from: "agent", agent: "Rafael", time: "16:11", kind: "text", text: "Te envio até amanhã, pedi nosso jurídico para fazer, tudo bem?", date: "Ontem", read: true },
  { id: "m6", from: "lead", time: "16:37", kind: "text", text: "Obrigado", date: "Ontem" },
  { id: "m7", from: "lead", time: "08:19", kind: "text", text: "Bom dia tudo bem?", date: "Hoje" },
  { id: "m8", from: "lead", time: "08:19", kind: "text", text: "Fizeram?", date: "Hoje" },
  { id: "m9", from: "agent", agent: "Rafael", time: "08:45", kind: "text", text: "Bom dia Carlos! Estamos finalizando, te envio ainda hoje até as 14h", date: "Hoje", read: false },
  { id: "m10", from: "agent", agent: "Rafael", time: "08:46", kind: "text", text: "Pode deixar que a gente garante! 👊", date: "Hoje", read: false },
];

/* ---------- subcomponents ---------- */
function ChannelBadge({ channel }: { channel: Channel }) {
  const bg = channel === "whatsapp" ? "#25D366" : "#E1306C";
  return (
    <span
      style={{
        position: "absolute",
        bottom: -2,
        right: -2,
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: bg,
        border: "2px solid #FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: 7,
        fontWeight: 700,
      }}
    >
      {channel === "whatsapp" ? "W" : "I"}
    </span>
  );
}

function Waveform({ light }: { light: boolean }) {
  const heights = [6, 10, 14, 8, 16, 12, 18, 10, 6, 12, 14, 8, 16, 10, 6];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2,
            height: h,
            background: light ? "rgba(255,255,255,0.8)" : "#0F6E56",
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

function AudioBubble({ duration, light }: { duration: string; light: boolean }) {
  const fg = light ? "#FFFFFF" : "#0F6E56";
  const btnBg = light ? "rgba(255,255,255,0.2)" : "#E1F5EE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        style={{
          width: 32, height: 32, borderRadius: "50%",
          background: btnBg, color: fg, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}
      >
        <Play size={14} fill={fg} />
      </button>
      <Waveform light={light} />
      <span style={{ fontSize: 11, color: fg, fontWeight: 500 }}>{duration}</span>
      <button style={{ background: "transparent", border: "none", color: fg, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>1x</button>
    </div>
  );
}

/* ---------- collapsible ---------- */
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
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {open ? <ChevronDown size={14} color="#666" /> : <ChevronRight size={14} color="#666" />}
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{title}</span>
        </div>
        {action}
      </button>
      {open && <div style={{ padding: "0 16px 12px" }}>{children}</div>}
    </div>
  );
}

/* ---------- main page ---------- */
export default function MultiatendimentoPage() {
  const [activeId, setActiveId] = useState<string>("3");
  const [activeFilter, setActiveFilter] = useState<string>("auto");
  const active = conversations.find(c => c.id === activeId);

  const filters = [
    { id: "email", icon: Mail, count: 1 },
    { id: "pending", icon: Clock, count: 1 },
    { id: "folder", icon: Folder, count: 9 },
    { id: "auto", icon: Zap, count: 41, highlight: true },
    { id: "done", icon: CheckCircle2, count: null },
    { id: "alert", icon: AlertTriangle, count: null },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "#FFFFFF" }}>
      {/* COLUNA 1 */}
      <aside style={{ width: 300, minWidth: 300, height: "100vh", borderRight: "0.5px solid #E5E5E5", display: "flex", flexDirection: "column", background: "#FFFFFF" }}>
        {/* Header */}
        <div style={{ padding: "12px 12px 8px", borderBottom: "0.5px solid #F0F0F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", borderRadius: 8, padding: "8px 12px" }}>
              <Search size={14} color="#AAA" />
              <input
                placeholder="Pesquise seus contatos"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111" }}
              />
            </div>
            <Search size={16} color="#AAA" style={{ cursor: "pointer" }} />
            <Bell size={16} color="#AAA" style={{ cursor: "pointer" }} />
            <Settings size={16} color="#AAA" style={{ cursor: "pointer" }} />
          </div>

          {/* filters */}
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {filters.map(f => {
              const Icon = f.icon;
              const isActive = activeFilter === f.id;
              const isHighlight = f.highlight || isActive;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: isHighlight ? "#E1F5EE" : "#F5F5F5",
                    color: isHighlight ? "#0F6E56" : "#666",
                    border: "none", borderRadius: 100, padding: "4px 10px",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Icon size={12} />
                  {f.count !== null && <span>{f.count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* lista */}
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
                  borderLeft: isActive ? "3px solid #0F6E56" : "3px solid transparent",
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
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: "#AAA", flexShrink: 0 }}>{c.time}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#AAA", margin: "2px 0 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.preview}</p>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.tags.slice(0, 2).map((t, i) => (
                      <span key={i} style={{
                        fontSize: 10, fontWeight: 600,
                        background: `${t.color}20`, color: t.color,
                        padding: "2px 6px", borderRadius: 4,
                      }}>
                        {t.label}
                      </span>
                    ))}
                    {c.tags.length > 2 && <span style={{ fontSize: 10, color: "#AAA" }}>+{c.tags.length - 2}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* COLUNA 2 — CHAT */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: "#FAFAFA", minWidth: 0 }}>
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
                <span style={{ fontSize: 12, color: "#0F6E56", cursor: "pointer", fontWeight: 600 }}>{active.dealNumber || "#1085"}</span>
                <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, border: "1px solid #0F6E56", background: "transparent", color: "#0F6E56", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <Eye size={12} /> Marcar como lida
                </button>
                <button style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, border: "1px solid #0F6E56", background: "transparent", color: "#0F6E56", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <Check size={12} /> Finalizar
                </button>
                <MoreHorizontal size={18} color="#AAA" style={{ cursor: "pointer" }} />
              </div>
            </div>

            {/* mensagens */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {(() => {
                const grouped: Record<string, Msg[]> = {};
                messages.forEach(m => {
                  grouped[m.date] = grouped[m.date] || [];
                  grouped[m.date].push(m);
                });
                return Object.entries(grouped).map(([date, msgs]) => (
                  <div key={date}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0" }}>
                      <div style={{ flex: 1, height: 0.5, background: "#E5E5E5" }} />
                      <span style={{ fontSize: 11, color: "#AAA" }}>{date}</span>
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
                            }}>
                              {initials(active.name)}
                            </div>
                          )}
                          <div style={{ maxWidth: "65%" }}>
                            <div style={{ fontSize: 11, color: "#AAA", marginBottom: 2, textAlign: isAgent ? "right" : "left" }}>
                              {isAgent ? `${m.agent} • ${m.time}` : `${active.name} • ${m.time}`}
                            </div>
                            <div
                              style={{
                                padding: "10px 14px",
                                borderRadius: isAgent ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                                background: isAgent ? "#0F6E56" : "#FFFFFF",
                                color: isAgent ? "#FFFFFF" : "#111",
                                border: isAgent ? "none" : "0.5px solid #E5E5E5",
                                fontSize: 14, lineHeight: 1.4,
                                display: "flex", alignItems: "center", gap: 8,
                              }}
                            >
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
                {[Paperclip, Calendar, FolderOpen, Smile, Mic].map((Icon, i) => (
                  <Icon key={i} size={18} color="#AAA" style={{ cursor: "pointer" }} />
                ))}
                <Sparkles size={18} color="#0F6E56" style={{ cursor: "pointer" }} />
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

      {/* COLUNA 3 — PERFIL */}
      <aside style={{ width: 300, minWidth: 300, height: "100vh", borderLeft: "0.5px solid #E5E5E5", overflowY: "auto", background: "#FFFFFF" }}>
        {active && (
          <>
            <div style={{ padding: "16px", borderBottom: "0.5px solid #F0F0F0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: colorFromString(active.name), color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 600,
                }}>
                  {initials(active.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{active.name}</span>
                    <ExternalLink size={12} color="#AAA" style={{ cursor: "pointer" }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#AAA" }}>{active.pipeline || "Pipeline Comercial"}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, color: "#0F6E56", fontWeight: 600 }}>
                <span style={{ cursor: "pointer" }}>+ Adicionar negócio</span>
                <span style={{ color: "#E5E5E5" }}>|</span>
                <span style={{ cursor: "pointer" }}>+ Executar automação</span>
                <span style={{ color: "#E5E5E5" }}>|</span>
                <span style={{ cursor: "pointer" }}>+ Adicionar lista</span>
              </div>
            </div>

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
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                  <span style={{ color: "#AAA" }}>{k}</span>
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
                <div key={f} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                  <span style={{ color: "#AAA" }}>{f}</span>
                  <span style={{ color: "#CCC" }}>—</span>
                </div>
              ))}
            </Section>

            <Section
              title="Qualificação do Lead"
              action={<span style={{ fontSize: 11, color: "#0F6E56", fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}><Plus size={12} /> Adicionar</span>}
            >
              {[
                "O que o lead está buscando?",
                "Qual o ramo da empresa?",
                "O lead é o decisor?",
              ].map(q => (
                <div key={q} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#AAA", marginBottom: 4 }}>{q}</div>
                  <div style={{ height: 32, background: "#F5F5F5", borderRadius: 6 }} />
                </div>
              ))}
            </Section>

            <Section title="Negócio vinculado" defaultOpen>
              <div style={{ border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: colorFromString(active.name), color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 600,
                  }}>
                    {initials(active.name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{active.name}</div>
                    <div style={{ fontSize: 11, color: "#AAA" }}>Sem produto</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Atendente: Rafael Silva</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0F6E56", marginBottom: 4 }}>R$ 3.500,00</div>
                <div style={{ fontSize: 11, color: "#AAA", marginBottom: 8 }}>14/04/2026 • Sem atividades</div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Pipeline Comercial</div>
                <div style={{ height: 4, background: "#F0F0F0", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: "40%", height: "100%", background: "#0F6E56" }} />
                </div>
                <div style={{ fontSize: 11, color: "#0F6E56", fontWeight: 600 }}>{active.dealNumber || "#1085"}</div>
              </div>
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}
