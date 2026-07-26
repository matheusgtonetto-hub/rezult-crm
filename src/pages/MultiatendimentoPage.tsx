import { useState, useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import fixWebmDuration from "fix-webm-duration";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import type { Lead, Pipeline } from "@/data/mockData";
import {
  Search, Settings, Clock, Folder, Zap, CheckCircle2, AlertTriangle,
  Filter, Eye, Check, MoreHorizontal, Paperclip, Calendar as CalendarIcon, FolderOpen,
  Smile, Mic, Sparkles, ExternalLink, ChevronDown, Play, Pause, CheckCheck,
  MessageSquare, MessageCircle, Plus, ArrowLeft, ArrowRight, Tag, Send, X, UserPlus, ImageIcon, List, CalendarDays, UserCheck,
  Download, Pencil, Trash2, Inbox, RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { ActivityDialog } from "@/components/ActivityDialog";
import type { ActivitySubmitData } from "@/components/ActivityDialog";
import DepartmentsManager from "@/components/DepartmentsManager";

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
// Compara telefones ignorando código do país (55): "28999110664" ≡ "5528999110664"
// Normaliza um telefone BR para o núcleo DDD + 8 dígitos finais, tolerando o
// código do país 55 e o 9º dígito de celular — que o WhatsApp/Z-API às vezes
// entrega sem o 9 (ex.: 553189904484 ↔ 31989904484). Comparar pelos últimos N
// dígitos não basta porque o 9 desloca a contagem.
function normalizeBrPhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // remove código do país
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3); // remove o 9 extra
  return d; // DDD(2) + 8 dígitos
}
function phonesMatch(a: string, b: string): boolean {
  const na = normalizeBrPhone(a);
  const nb = normalizeBrPhone(b);
  if (na.length < 10 || nb.length < 10) return false;
  return na.slice(-10) === nb.slice(-10); // DDD + 8 dígitos
}
// Todas as variantes plausíveis de como o telefone pode estar salvo (com/sem 55,
// com/sem o 9º dígito) — para montar a query OR do histórico de mensagens.
function phoneVariants(raw: string): string[] {
  const core = normalizeBrPhone(raw); // DDD + 8
  if (core.length < 10) {
    const d = (raw ?? "").replace(/\D/g, "");
    return d ? [d] : [];
  }
  const ddd = core.slice(0, 2);
  const eight = core.slice(-8);
  const with9 = `${ddd}9${eight}`; // DDD + 9 + 8 (celular)
  return [...new Set([core, with9, `55${core}`, `55${with9}`])];
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
  instanceId?: string;  // instância (número WhatsApp) à qual a conversa pertence
  lastMsgAt?: string;   // timestamp ISO da última mensagem (para filtros/ordenação)
  contactId?: string;   // contato (pessoa) vinculado — setado ao atribuir atendente
};

type Msg =
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "text";   text: string;                    date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "audio";  duration: string; src?: string; date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "image";  src: string; caption?: string;  date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "file";   filename: string; url?: string;  date: string; read?: boolean }
  | { id: string; from: "system";                          time: string; kind: "system"; text: string;                   date: string };

type Meeting = { date: string; time: string; owner: string; note: string };

type ConvState = {
  messages: Msg[];
  stageIdx: number;
  meeting: Meeting | null;
  notes: string;
  read: boolean;
  finished: boolean;
  assignedTo?: string;
  departmentId?: string;
};

type ZApiInstance = { instanceId: string; token: string; clientToken: string; phone: string; label: string; provider: "zapi" | "dapi" | "cloud_api" };

/* ── emoji list ───────────────────────────────────────────────────────── */
const EMOJIS = [
  "😀","😃","😄","😁","😅","😂","🤣","😊","😍","🥰","😘","😎","🤩","🥳","😇",
  "🤔","😬","😒","😔","😢","😭","😤","😡","🥺","😱","😴","😜","😝","🤯","🫡",
  "👍","👎","👏","🙌","🤝","💪","✌️","🤞","👋","🫶","❤️","🔥","⭐","✅","💯",
  "🎉","🚀","💡","📞","💬","📧","📅","🗓️","📋","✏️","🔔","💰","📊","🏆","🎯",
];

const AI_TEMPLATES: Record<number, string[]> = {
  0: ["Olá! Tudo bem? Estou entrando em contato para conhecer melhor as suas necessidades. Tem alguns minutos?", "Boa tarde! Vi que você demonstrou interesse. Posso apresentar nossa solução?"],
  1: ["Obrigado pelo contato! Para te atender melhor, qual é a sua principal necessidade hoje?", "Que bom falar com você! Pode me contar um pouco mais sobre o seu negócio?"],
  2: ["Olá! Você teve a oportunidade de analisar nossa proposta? Posso esclarecer alguma dúvida?", "Boa tarde! Só passando para verificar se recebeu a proposta e se ficou alguma dúvida."],
  3: ["Tenho uma condição especial disponível somente até esta semana. Podemos fechar agora?", "Que tal agendarmos uma reunião rápida para alinhar os últimos detalhes e finalizar?"],
  4: ["Parabéns! Seja bem-vindo(a)! Agora vou te passar os próximos passos do processo.", "Ótimo fechamento! Já vou encaminhar o contrato para assinatura. Obrigado pela confiança!"],
  5: ["Entendo a sua posição. Posso perguntar o que foi decisivo nesta decisão?", "Que pena não termos chegado a um acordo desta vez. Se mudar de ideia, estou à disposição!"],
};

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

function Waveform({ light, progress = 0 }: { light: boolean; progress?: number }) {
  const heights = [6, 10, 14, 8, 16, 12, 18, 10, 6, 12, 14, 8, 16, 10, 6];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
      {heights.map((h, i) => {
        const played = (i + 1) / heights.length <= progress;
        return <div key={i} style={{ width: 2, height: h, background: light ? "#FFF" : "#128A68", opacity: progress > 0 ? (played ? 1 : 0.35) : (light ? 1 : 0.4), borderRadius: 1, transition: "opacity 0.1s" }} />;
      })}
    </div>
  );
}

// Normaliza a duração do áudio para "MM:SS". Aceita já formatado ("01:23"),
// segundos puros ("83" → "01:23", como o WhatsApp/Z-API entrega no recebido)
// ou vazio quando desconhecido.
function parseAudioDuration(raw?: string | null): string {
  const b = (raw ?? "").trim();
  if (/^\d{1,2}:\d{2}$/.test(b)) return b;
  if (/^\d+$/.test(b)) {
    const s = parseInt(b, 10);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  return "";
}

// Rótulo de pré-visualização (lista de conversas) conforme o tipo da mensagem.
function previewLabelFor(type: string | undefined, body: string | null | undefined): string {
  if (type === "audio")    return "🎤 Mensagem de áudio";
  if (type === "image")    return "🖼️ Imagem";
  if (type === "document") return `📎 ${body || "Arquivo"}`;
  return body ?? "";
}

// Monta uma mensagem chegada via realtime respeitando o tipo. Antes, toda mensagem
// era renderizada como texto — áudio/imagem/documento não apareciam. Mensagens
// from_me (enviadas por automação, outro membro ou outro dispositivo) entram como
// "agent" com o nome de quem enviou.
function buildIncomingMsg(
  m: { id?: string; body?: string; type?: string; media_url?: string; from_me?: boolean; sender_name?: string },
  timeStr: string,
): Msg {
  const base = m.from_me
    ? { id: m.id as string, from: "agent" as const, agent: m.sender_name ?? "Automação", time: timeStr, date: "Hoje", read: true }
    : { id: m.id as string, from: "lead" as const, time: timeStr, date: "Hoje", read: false };
  if (m.type === "audio")    return { ...base, kind: "audio" as const, duration: parseAudioDuration(m.body), src: m.media_url ?? undefined };
  if (m.type === "image")    return { ...base, kind: "image" as const, src: m.media_url ?? "", caption: m.body ?? "" };
  if (m.type === "document") return { ...base, kind: "file"  as const, filename: m.body ?? "arquivo", url: m.media_url ?? undefined };
  return { ...base, kind: "text" as const, text: m.body ?? "" };
}

function AudioBubble({ duration, src, light }: { duration: string; src?: string; light: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const fg = light ? "#FFF" : "#128A68";

  const fmt = (s: number) =>
    (isFinite(s) && s > 0)
      ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`
      : (duration || "00:00");

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => {}); }
    else { a.pause(); setPlaying(false); }
  };

  const progress = dur > 0 ? Math.min(1, cur / dur) : 0;
  // Mostra o tempo decorrido enquanto toca; senão a duração total (ou a legada)
  const label = src ? fmt((playing || cur > 0) ? cur : dur) : (duration || "00:00");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: light ? "transparent" : "#F5F5F5", padding: light ? 0 : "6px 10px", borderRadius: 10 }}>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={e => {
            const a = e.currentTarget;
            if (isFinite(a.duration)) { setDur(a.duration); return; }
            // WebM do MediaRecorder não traz a duração no header → o browser
            // reporta Infinity e o player ficava em 00:00. Truque padrão: seek
            // para um tempo enorme força o cálculo; durationchange entrega o
            // valor real e voltamos ao início.
            const onDur = () => {
              if (isFinite(a.duration) && a.duration > 0) {
                setDur(a.duration);
                a.currentTime = 0;
                a.removeEventListener("durationchange", onDur);
              }
            };
            a.addEventListener("durationchange", onDur);
            a.currentTime = 1e10;
          }}
          onTimeUpdate={e => { const t = e.currentTarget.currentTime; if (isFinite(t) && t < 1e9) setCur(t); }}
          onEnded={() => { setPlaying(false); setCur(0); }}
          style={{ display: "none" }}
        />
      )}
      <button
        onClick={toggle}
        disabled={!src}
        title={src ? (playing ? "Pausar" : "Reproduzir") : "Áudio indisponível"}
        style={{ width: 32, height: 32, borderRadius: "50%", background: light ? "rgba(255,255,255,0.3)" : "#128A68", color: "#FFF", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: src ? "pointer" : "default", flexShrink: 0, opacity: src ? 1 : 0.6 }}
      >
        {playing ? <Pause size={14} fill="#FFF" /> : <Play size={14} fill="#FFF" />}
      </button>
      <Waveform light={light} progress={progress} />
      <span style={{ fontSize: 11, color: fg, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{label}</span>
    </div>
  );
}

function Section({ title, children, defaultOpen = false, action }: { title: string; children: React.ReactNode; defaultOpen?: boolean; action?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid #F0F0F0" }}>
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

function FilterChip({ Icon, count, isActive, onClick, label, color, colorBg, borderColor, iconOnly }: { Icon: LucideIcon; count: number | null; isActive: boolean; onClick: () => void; label?: string; color: string; colorBg: string; borderColor: string; iconOnly?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const border = isActive ? `1px solid ${borderColor}` : "1px solid #E5E5E5";
  return (
    <div style={{ position: "relative", display: "flex", flex: iconOnly ? "0 0 auto" : 1, minWidth: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && label && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#111", color: "#FFF", fontSize: 11, fontWeight: 500,
          padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap", pointerEvents: "none",
          zIndex: 200, boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        }}>
          {label}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            borderWidth: "4px 4px 0", borderStyle: "solid", borderColor: "#111 transparent transparent",
          }} />
        </div>
      )}
      <button onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: iconOnly ? undefined : "100%", gap: iconOnly ? 0 : 5, background: "#FFF", border, borderRadius: 5, padding: iconOnly ? 4 : "4px 10px 4px 4px", fontSize: 12, cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 5, background: colorBg, flexShrink: 0 }}>
          <Icon size={11} color={color} />
        </span>
        {!iconOnly && count !== null && <span style={{ color: "#111", fontWeight: 300 }}>{count}</span>}
      </button>
    </div>
  );
}

function ChatHeaderBtn({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
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

function ConvAvatar({ name, avatarUrl, size, fontSize, style, onError }: { name: string; avatarUrl?: string; size: number; fontSize: number; style?: React.CSSProperties; onError?: () => void }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [avatarUrl]);
  if (avatarUrl && !err) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        // URLs de foto do WhatsApp expiram (param oe=). Ao falhar, avisa o pai para
        // buscar uma URL nova e mostra as iniciais nesse meio-tempo.
        onError={() => { setErr(true); onError?.(); }}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0, ...style }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: colorFromString(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize, fontWeight: 700, flexShrink: 0, ...style }}>
      {initials(name)}
    </div>
  );
}

/* ── main page ─────────────────────────────────────────────────────────── */
export default function MultiatendimentoPage() {
  const { user } = useAuth();
  const { company, whatsappConnections } = useCompany();
  // Escopo multi-tenant: todas as conversas/mensagens são da EMPRESA selecionada
  // (owner da empresa), não do usuário logado — que pode ser membro de várias empresas.
  const tenantId = company?.owner_id ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const { leads, pipelines, activePipeline, moveLead, crmTags, addLead, nextDealNumber, updateLead, crmLists, addLeadToList, removeLeadFromList, addActivity, teamMembers, memberEmails, memberAvatars, memberColors } = useCRM();
  const { openedLeadIds } = useFloatingChat();

  const [convList, setConvList] = useState<Conversation[]>([]);
  // Persistência de navegação (conversa aberta + aba de filtro selecionada),
  // por usuário+empresa — sem isso, sair do Multiatendimento e voltar reseta
  // tudo, mesmo com o dado real (read/finished) já salvo no banco.
  const activeIdKey     = (uid?: string, tid?: string | null) => `rz_multi_active_id_${uid ?? "anon"}_${tid ?? "none"}`;
  const activeFilterKey = (uid?: string, tid?: string | null) => `rz_multi_active_filter_${uid ?? "anon"}_${tid ?? "none"}`;
  const [activeId, setActiveId] = useState<string>(() => {
    try { return localStorage.getItem(activeIdKey(user?.id, tenantId)) ?? ""; } catch { return ""; }
  });
  const [activeFilter, setActiveFilter] = useState<string>(() => {
    try { return localStorage.getItem(activeFilterKey(user?.id, tenantId)) ?? ""; } catch { return ""; }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [convStates, setConvStates] = useState<Record<string, ConvState>>({});
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const activeNavTenantRef = useRef(tenantId);
  useEffect(() => { try { localStorage.setItem(activeIdKey(user?.id, tenantId), activeId); } catch { /* localStorage indisponível */ } }, [activeId, tenantId, user?.id]);
  useEffect(() => { try { localStorage.setItem(activeFilterKey(user?.id, tenantId), activeFilter); } catch { /* localStorage indisponível */ } }, [activeFilter, tenantId, user?.id]);
  useEffect(() => {
    // Troca de empresa: recarrega o estado salvo daquela empresa (ou limpa,
    // se nunca teve) em vez de manter o da empresa anterior.
    if (activeNavTenantRef.current === tenantId) return;
    activeNavTenantRef.current = tenantId;
    try {
      setActiveId(localStorage.getItem(activeIdKey(user?.id, tenantId)) ?? "");
      setActiveFilter(localStorage.getItem(activeFilterKey(user?.id, tenantId)) ?? "");
    } catch { setActiveId(""); setActiveFilter(""); }
  }, [tenantId, user?.id]);

  // ── Filtros avançados (painel lateral) ────────────────────────────────
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [fltDepts, setFltDepts]         = useState<string[]>([]);   // department ids
  const [fltAgents, setFltAgents]       = useState<string[]>([]);   // nomes de atendentes
  const [fltInstances, setFltInstances] = useState<string[]>([]);   // instance ids
  const [fltTags, setFltTags]           = useState<string[]>([]);   // nomes de tags
  const [fltPipeline, setFltPipeline]   = useState<string>("");     // pipeline id ("" = todas)
  const [fltStages, setFltStages]       = useState<string[]>([]);   // column ids da etapa
  const [fltWindow, setFltWindow]       = useState<"all" | "in" | "out">("all");
  const [fltDateFrom, setFltDateFrom]   = useState<string>("");
  const [fltDateTo, setFltDateTo]       = useState<string>("");
  const [fltOrder, setFltOrder]         = useState<"recent" | "old" | "name">("recent");
  const [fltSecOpen, setFltSecOpen]     = useState<Record<string, boolean>>({});

  // ── Seleção / ações em massa ──────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConvs, setSelectedConvs]  = useState<string[]>([]);
  const [bulkMenuOpen, setBulkMenuOpen]    = useState(false);
  const [bulkAction, setBulkAction]        = useState<"agent" | "dept" | null>(null);
  // Execução manual de automação: lista de conversas-alvo (null = modal fechado)
  const [autoModalConvs, setAutoModalConvs] = useState<string[] | null>(null);
  const [manualAutomations, setManualAutomations] = useState<{ id: string; name: string }[]>([]);
  const [runningAutomation, setRunningAutomation] = useState(false);

  // nova conversa
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");


  // Z-API instances
  const [instances, setInstances] = useState<ZApiInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [instanceOpen, setInstanceOpen] = useState(false);

  // ── profile pictures cache ───────────────────────────────────────────
  const [convAvatars, setConvAvatars] = useState<Record<string, string>>({});
  const fetchingAvatars = useRef<Set<string>>(new Set());

  const avatarRetried = useRef<Set<string>>(new Set());

  async function fetchAvatar(phone: string, instanceId?: string, force = false) {
    // Prefere a instância da própria conversa; cai para a primeira conectada.
    const inst = (instanceId && instances.find(i => i.instanceId === instanceId)) || instances[0];
    if (!inst || !phone) return;
    const p = phone.replace(/\D/g, "");
    if (!p || fetchingAvatars.current.has(p) || (!force && convAvatars[p])) return;
    fetchingAvatars.current.add(p);
    try {
      const res = await fetch(
        `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/profile-picture?phone=${p}`,
        { headers: { "Client-Token": inst.clientToken } }
      );
      if (!res.ok) { console.warn("[avatar] Z-API", res.status, await res.text().catch(() => "")); return; }
      const json = await res.json() as Record<string, unknown>;
      // A Z-API retorna a URL em "link"; aceitamos variações por segurança.
      const url = (json.link ?? json.value ?? json.profilePicture ?? json.imgUrl ?? json.url) as string | undefined;
      if (url) setConvAvatars(prev => ({ ...prev, [p]: url }));
      else console.warn("[avatar] sem foto para", p, json);
    } catch (e) {
      console.warn("[avatar] falha ao buscar foto", e);
    } finally {
      // Libera para nova tentativa se ainda não temos a foto (ex.: instância reconectada).
      if (!convAvatars[p]) fetchingAvatars.current.delete(p);
    }
  }

  // Fetch photos for visible conversations when instances load
  useEffect(() => {
    if (!instances[0] || convList.length === 0) return;
    convList.slice(0, 40).forEach(c => { if (c.phone) fetchAvatar(c.phone, c.instanceId); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances.length, convList.length]);

  // A URL da foto do WhatsApp falhou (geralmente expirou): busca uma URL nova,
  // uma única vez por contato, para não entrar em laço se o contato não tiver foto.
  const refetchAvatar = (phone?: string, instanceId?: string) => {
    const p = (phone ?? "").replace(/\D/g, "");
    if (!p || avatarRetried.current.has(p)) return;
    avatarRetried.current.add(p);
    setConvAvatars(prev => { const n = { ...prev }; delete n[p]; return n; });
    fetchingAvatars.current.delete(p);
    fetchAvatar(phone ?? "", instanceId, true);
  };

  // scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // ref para evitar closure stale no handler global de Realtime
  const convListRef    = useRef<Conversation[]>(convList);
  useEffect(() => { convListRef.current = convList; }, [convList]);

  // Abre conversa específica quando navegado a partir do drawer de leads
  useEffect(() => {
    const targetId = (location.state as { openConvId?: string } | null)?.openConvId;
    if (!targetId || convList.length === 0) return;
    const target = convList.find(c => c.id === targetId);
    if (target) {
      setActiveId(targetId);
      updateCs(targetId, { read: true });
      // Limpa o state para não reativar em navegações futuras
      window.history.replaceState({}, "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, convList.length]);

  // ── painel "+ Negócio" ───────────────────────────────────────────────
  const [showNegocioForm, setShowNegocioForm]   = useState(false);
  const [negocioName, setNegocioName]           = useState("");
  const [negocioPipelineId, setNegocioPipelineId] = useState("");
  const [negocioValue, setNegocioValue]         = useState("");
  const [negocioLoading, setNegocioLoading]     = useState(false);

  // ── dialog de agendamento ────────────────────────────────────────────
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);

  // ── dialog de transferência ──────────────────────────────────────────
  const [showTransferDialog, setShowTransferDialog] = useState(false);

  // ── tag picker inline ──────────────────────────────────────────────
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagSearch, setTagSearch]         = useState("");
  const [tagPickerPos, setTagPickerPos]   = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const tagBtnRef    = useRef<HTMLButtonElement>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showTagPicker) return;
    const handle = (e: MouseEvent) => {
      if (
        tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node) &&
        tagBtnRef.current && !tagBtnRef.current.contains(e.target as Node)
      ) {
        setShowTagPicker(false); setTagSearch("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showTagPicker]);

  // ── list picker inline ─────────────────────────────────────────────
  const [showListPicker, setShowListPicker] = useState(false);
  const [listSearch, setListSearch]         = useState("");
  const [listPickerPos, setListPickerPos]   = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const listBtnRef    = useRef<HTMLButtonElement>(null);
  const listPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showListPicker) return;
    const handle = (e: MouseEvent) => {
      if (
        listPickerRef.current && !listPickerRef.current.contains(e.target as Node) &&
        listBtnRef.current && !listBtnRef.current.contains(e.target as Node)
      ) {
        setShowListPicker(false); setListSearch("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showListPicker]);

  // ── settings modal ───────────────────────────────────────────────────
  const [showMultiSettings, setShowMultiSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"config" | "dept" | "agents" | "quick">("config");
  const [cfgDefDept, setCfgDefDept]         = useState("");
  const [cfgHorario, setCfgHorario]         = useState("");
  const [cfgTranscricao, setCfgTranscricao] = useState("desativado");
  const [cfgAssinatura, setCfgAssinatura]   = useState(false);
  const [cfgMantAtend, setCfgMantAtend]     = useState(false);
  const [cfgMantDept, setCfgMantDept]       = useState(false);
  const [muDepts, setMuDepts]               = useState<{ id: string; name: string }[]>([]);
  const [muSchedules, setMuSchedules]       = useState<{ id: string; name: string }[]>([]);

  // Carrega listas (departamentos/horários) + configurações persistidas
  useEffect(() => {
    const oid = company?.owner_id;
    if (!oid) return;
    (async () => {
      const [d, w, s] = await Promise.all([
        supabase.from("departments").select("id, name").eq("owner_id", oid).order("position", { ascending: true }),
        supabase.from("work_schedules").select("id, name").eq("owner_id", oid).order("created_at", { ascending: true }),
        supabase.from("multiatendimento_settings").select("*").eq("owner_id", oid).maybeSingle(),
      ]);
      if (d.data) setMuDepts(d.data as { id: string; name: string }[]);
      if (w.data) setMuSchedules(w.data as { id: string; name: string }[]);
      const st = s.data as Record<string, unknown> | null;
      if (st) {
        setCfgDefDept((st.default_department_id as string) ?? "");
        setCfgHorario((st.work_schedule_id as string) ?? "");
        setCfgTranscricao((st.audio_transcription as string) ?? "desativado");
        setCfgAssinatura(!!st.signature_required);
        setCfgMantAtend(!!st.keep_attendant);
        setCfgMantDept(!!st.keep_department);
      }
    })();
  }, [company?.owner_id]);

  const persistMuSettings = async (patch: Record<string, unknown>) => {
    const oid = company?.owner_id;
    if (!oid) return;
    const { error } = await supabase.from("multiatendimento_settings")
      .upsert({ owner_id: oid, company_id: company?.id ?? null, updated_at: new Date().toISOString(), ...patch }, { onConflict: "owner_id" });
    if (error) toast.error("Erro ao salvar configuração.");
  };
  const [selectedAgent, setSelectedAgent]   = useState<string | null>(null);
  const [agentSearch, setAgentSearch]       = useState("");
  const [deptSearch, setDeptSearch]         = useState("");
  const [deptCreateOpen, setDeptCreateOpen] = useState(false);
  const [qmSearch, setQmSearch]             = useState("");

  // ── mensagens rápidas ─────────────────────────────────────────────────
  type QuickMessage = { id: string; title: string; shortcut: string | null; content: string };
  const [qmList, setQmList]                 = useState<QuickMessage[]>([]);
  const [qmModalOpen, setQmModalOpen]       = useState(false);
  const [qmEditing, setQmEditing]           = useState<QuickMessage | null>(null);
  const [qmTitle, setQmTitle]               = useState("");
  const [qmShortcut, setQmShortcut]         = useState("");
  const [qmContent, setQmContent]           = useState("");
  const [qmSaving, setQmSaving]             = useState(false);
  const [qmPickerOpen, setQmPickerOpen]     = useState(false);

  const loadQuickMessages = async () => {
    const oid = company?.owner_id;
    if (!oid) return;
    const { data } = await supabase.from("quick_messages")
      .select("id, title, shortcut, content")
      .eq("owner_id", oid)
      .order("created_at", { ascending: false });
    if (data) setQmList(data as QuickMessage[]);
  };
  useEffect(() => { loadQuickMessages(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [company?.owner_id]);

  const openNewQuickMessage = () => { setQmEditing(null); setQmTitle(""); setQmShortcut(""); setQmContent(""); setQmModalOpen(true); };
  const openEditQuickMessage = (q: QuickMessage) => { setQmEditing(q); setQmTitle(q.title); setQmShortcut(q.shortcut ?? ""); setQmContent(q.content); setQmModalOpen(true); };

  const saveQuickMessage = async () => {
    const oid = company?.owner_id;
    if (!oid) return;
    if (!qmTitle.trim() || !qmContent.trim()) { toast.error("Preencha o título e a mensagem."); return; }
    setQmSaving(true);
    const payload = {
      title: qmTitle.trim(),
      shortcut: qmShortcut.trim() || null,
      content: qmContent.trim(),
      owner_id: oid,
      company_id: company?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = qmEditing
      ? await supabase.from("quick_messages").update(payload).eq("id", qmEditing.id)
      : await supabase.from("quick_messages").insert(payload);
    setQmSaving(false);
    if (error) { toast.error("Erro ao salvar mensagem rápida."); return; }
    toast.success(qmEditing ? "Mensagem rápida atualizada." : "Mensagem rápida criada.");
    setQmModalOpen(false);
    loadQuickMessages();
  };

  const deleteQuickMessage = async (q: QuickMessage) => {
    const { error } = await supabase.from("quick_messages").delete().eq("id", q.id);
    if (error) { toast.error("Erro ao excluir mensagem rápida."); return; }
    toast.success("Mensagem rápida excluída.");
    setQmList(prev => prev.filter(x => x.id !== q.id));
  };

  const insertQuickMessage = (q: QuickMessage) => {
    setInputValue(prev => (prev.trim() ? `${prev.trimEnd()} ${q.content}` : q.content));
    setQmPickerOpen(false);
  };

  // Autocomplete por atalho: enquanto o texto digitado for só um atalho (ex: "/ola"),
  // sugere as mensagens cujo atalho começa com o que foi digitado.
  const shortcutSuggestions = useMemo<QuickMessage[]>(() => {
    const v = inputValue.trim().toLowerCase();
    if (!v.startsWith("/")) return [];
    return qmList.filter(q => q.shortcut && q.shortcut.toLowerCase().startsWith(v));
  }, [inputValue, qmList]);

  // Expande um atalho substituindo o texto digitado pelo conteúdo da mensagem.
  const expandShortcut = (q: QuickMessage) => { setInputValue(q.content); };

  // ── toolbar states ────────────────────────────────────────────────────
  const [showEmoji, setShowEmoji]         = useState(false);
  const [showFiles, setShowFiles]         = useState(false);
  const [recording, setRecording]         = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [aiLoading, setAiLoading]         = useState(false);
  const fileInputRef       = useRef<HTMLInputElement>(null);
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null);
  const audioChunksRef     = useRef<Blob[]>([]);
  const recordingTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeRef   = useRef(0); // ref para evitar closure stale no onstop

  const active   = convList.find(c => c.id === activeId);
  // Fix: fallback para evitar que cs seja null quando convStates[activeId] ainda não foi carregado
  const DEFAULT_CS: ConvState = { messages: [], stageIdx: 0, meeting: null, notes: "", read: true, finished: false, assignedTo: undefined, departmentId: undefined };
  const cs = activeId ? (convStates[activeId] ?? DEFAULT_CS) : null;

  // Nome de exibição da conversa: prioriza o nome do lead no CRM (por ID ou
  // telefone). Cai para o nome salvo; se for vazio ou "ruim" (ex.: ".", o nome
  // de perfil do WhatsApp do contato), usa o telefone como último recurso.
  const convName = (c: Conversation): string => {
    const lead = resolveLeadForConv(c);
    const nm = (lead?.name ?? c.name ?? "").trim();
    if (nm && nm !== ".") return nm;
    return c.phone ?? c.name ?? "Sem nome";
  };

  // Texto da pré-visualização na lista: usa a última mensagem carregada (rotulando
  // mídia) e cai para o preview salvo; nomes de arquivo de áudio viram rótulo.
  const previewText = (c: Conversation): string => {
    const msgs = convStates[c.id]?.messages;
    const last = msgs && msgs.length ? msgs[msgs.length - 1] : null;
    if (last) {
      if (last.kind === "audio") return "🎤 Mensagem de áudio";
      if (last.kind === "image") return "🖼️ Imagem";
      if (last.kind === "file")  return `📎 ${last.filename ?? "Arquivo"}`;
      if (last.kind === "system" || last.kind === "text") return last.text;
    }
    const p = (c.preview ?? "").trim();
    if (/\.(webm|ogg|mp3|m4a|opus)$/i.test(p)) return "🎤 Mensagem de áudio";
    if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(p)) return "🖼️ Imagem";
    if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar)$/i.test(p)) return `📎 ${p}`;
    return p;
  };

  // Etapas reais do pipeline vinculado ao lead ativo.
  // Resolução robusta do lead vinculado a uma conversa, em ordem de confiabilidade:
  //  1) por ID (conversas abertas pelo pipeline usam o id do lead como id da conversa)
  //  2) por contato (contactId) — quando a conversa já tem um contato vinculado,
  //     prioriza um negócio aberto desse contato; havia mais de um negócio no
  //     mesmo contato, o mais recente aberto ganha
  //  3) por telefone (conversas de WhatsApp têm UUID aleatório como id)
  //  4) por número do negócio (#deal), quando a conversa guarda um deal_number real
  // Unificada para que a UI e o "atrelar tag/lista/atividade" usem exatamente o mesmo lead.
  const resolveLeadForConv = (conv?: Conversation | null): Lead | null => {
    if (!conv) return null;
    if (leads[conv.id]) return leads[conv.id];
    if (conv.contactId) {
      const byContact = Object.values(leads).filter(l => l.personId === conv.contactId);
      if (byContact.length > 0) return byContact.find(l => l.dealStatus === "open") ?? byContact[0];
    }
    if (conv.phone) {
      const byPhone = Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", conv.phone ?? ""));
      if (byPhone) return byPhone;
    }
    const dn = (conv.dealNumber ?? "").replace(/\D/g, "");
    if (dn) {
      const byDeal = Object.values(leads).find(l => String(l.dealNumber ?? "").replace(/\D/g, "") === dn);
      if (byDeal) return byDeal;
    }
    return null;
  };
  const effectiveLead  = resolveLeadForConv(active);
  // Quando há lead vinculado, ele é a fonte da verdade das tags (mesmas em todas as
  // conversas/instâncias do lead); sem lead, usa as tags da própria conversa.
  const convTags       = effectiveLead?.tags ?? active?.tags ?? [];

  // Anotações da conversa → gravadas como atividade "note" no negócio vinculado,
  // ficando visíveis na aba Anotações do card do negócio na pipeline.
  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    if (!effectiveLead) {
      toast.error("Esta conversa não está vinculada a um negócio.");
      return;
    }
    addActivity(effectiveLead.id, {
      type: "note",
      date: new Date().toISOString(),
      description: text,
      userName: user?.email?.split("@")[0] ?? undefined,
    });
    setNoteDraft("");
    toast.success("Anotação adicionada ao negócio.");
  };

  const linkedPipeline = effectiveLead?.pipelineId ? (pipelines ?? []).find(p => p.id === effectiveLead.pipelineId) : null;
  const pipelineCols   = linkedPipeline?.columns ?? [];
  const activeStages   = pipelineCols.length > 0 ? pipelineCols.map(c => c.title) : PIPELINE_STAGES;
  const rawColIdx      = pipelineCols.length > 0 ? pipelineCols.findIndex(c => c.id === effectiveLead?.stage) : -1;
  const activeStageIdx = pipelineCols.length > 0 ? (rawColIdx >= 0 ? rawColIdx : 0) : (cs?.stageIdx ?? 0);

  // ── carregar conversas do Supabase (carga inicial + botão atualizar) ─
  const [conversationsRefreshing, setConversationsRefreshing] = useState(false);

  async function reloadConversations() {
    if (!user || !tenantId) return;

    type DbConvRow = { id: string; owner_id?: string; company_id?: string; instance_id?: string; name: string; preview: string; last_msg_at: string; channel: Channel; tags: string[] | null; company_name?: string; email?: string; phone?: string; value?: number; pipeline?: string; deal_number?: string; read?: boolean; contact_id?: string };
    const mapRow = (r: DbConvRow): Conversation => ({
      id: r.id, name: r.name, preview: r.preview,
      time: new Date(r.last_msg_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      channel: r.channel as Channel, tags: r.tags ?? [],
      company: r.company_name ?? undefined, email: r.email ?? undefined,
      phone: r.phone ?? undefined, value: r.value ?? undefined,
      pipeline: r.pipeline ?? undefined, dealNumber: r.deal_number ?? undefined,
      instanceId: r.instance_id ?? undefined,
      lastMsgAt: r.last_msg_at ?? undefined,
      contactId: r.contact_id ?? undefined,
    });

    type DbStateRow = { stage_idx?: number; meeting_date?: string; meeting_time?: string; meeting_owner?: string; meeting_note?: string; notes?: string; read?: boolean; finished?: boolean; assigned_to?: string; department_id?: string };
    const mapState = (r: DbStateRow): ConvState => ({
      messages: [],
      stageIdx: r.stage_idx ?? 0,
      meeting:  r.meeting_date ? { date: r.meeting_date, time: r.meeting_time ?? "", owner: r.meeting_owner ?? "", note: r.meeting_note ?? "" } : null,
      notes:    r.notes ?? "",
      read:     r.read ?? true,
      finished: r.finished ?? false,
      assignedTo: r.assigned_to ?? undefined,
      departmentId: r.department_id ?? undefined,
    });

    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("owner_id", tenantId)
      .order("last_msg_at", { ascending: false });

    if (error) console.error("Erro ao carregar conversas:", error);

    const existingRows = (data ?? []) as DbConvRow[];

    // Mescla as conversas já persistidas no estado (sem sobrescrever as do Pipeline)
    if (existingRows.length > 0) {
      setConvList(prev => {
        const dbIds = new Set(existingRows.map(r => r.id));
        const extra = prev.filter(c => !dbIds.has(c.id)); // conversas só em memória
        return [...existingRows.map(mapRow), ...extra];
      });
      setConvStates(prev => {
        const next: Record<string, ConvState> = { ...prev };
        existingRows.forEach(r => {
          if (!next[r.id]) next[r.id] = mapState(r); // não sobrescreve estado já em memória
        });
        return next;
      });
    }

    // Reconciliação: cria conversas para números que já mandaram mensagem mas
    // ainda não têm conversa (ex.: mensagens recebidas com a página fechada —
    // o realtime só cria chat se a página estiver aberta no momento). Roda
    // SEMPRE, não só quando a tabela está vazia.
    const { data: msgs } = await supabase
      .from("whatsapp_messages")
      .select("phone, instance_id, type, chat_name, sender_name, body, momment, created_at")
      .eq("owner_id", tenantId)
      .eq("from_me", false)
      .order("created_at", { ascending: false });

    if (!msgs?.length) return;

    // Conversas que já existem, por chave (instância, telefone normalizado)
    const haveKeys = new Set(
      existingRows.map(r => `${r.instance_id ?? ""}|${normalizeBrPhone(r.phone ?? "")}`),
    );

    // Agrupa por (instância, telefone normalizado): cada número é uma conversa
    // separada; pega a mensagem mais recente de cada par ainda sem conversa.
    type WaMsgRow = { phone: string; instance_id?: string; type?: string; chat_name?: string; sender_name?: string; body?: string; momment?: number; created_at?: string };
    const convMap = new Map<string, WaMsgRow>();
    for (const m of msgs) {
      if (m.type === "system") continue; // mensagem de sistema não cria conversa
      const key = `${m.instance_id ?? ""}|${normalizeBrPhone(m.phone)}`;
      if (haveKeys.has(key) || convMap.has(key)) continue;
      convMap.set(key, m as WaMsgRow);
    }

    if (convMap.size === 0) return;

    const newConvs: Conversation[] = [];
    const newStates: Record<string, ConvState> = {};
    const dbRows: DbConvRow[] = [];

    for (const m of convMap.values()) {
      const id = crypto.randomUUID();
      const phone = m.phone;
      const d = new Date(m.momment ?? m.created_at);
      const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      newConvs.push({ id, name: m.chat_name ?? m.sender_name ?? phone, preview: m.body ?? "", time: timeStr, channel: "whatsapp", tags: [], phone, instanceId: m.instance_id ?? undefined });
      newStates[id] = { messages: [], stageIdx: 0, meeting: null, notes: "", read: false, finished: false };
      dbRows.push({ id, owner_id: tenantId, company_id: company?.id ?? undefined, instance_id: m.instance_id ?? undefined, name: m.chat_name ?? m.sender_name ?? phone, phone, channel: "whatsapp", tags: [], preview: m.body ?? "", last_msg_at: d.toISOString(), read: false });
    }

    setConvList(prev => [...newConvs, ...prev]);
    setConvStates(prev => ({ ...newStates, ...prev }));
    supabase.from("whatsapp_conversations").insert(dbRows).then(({ error: e }) => {
      if (e) console.error("Reconciliação de conversas — erro:", e);
    });
  }

  // Botão "atualizar" da nova barra de filtro rápido: força uma nova consulta
  // ao banco (útil se o realtime atrasar ou falhar), sem esperar o realtime.
  async function handleRefreshConversations() {
    setConversationsRefreshing(true);
    try {
      await reloadConversations();
    } finally {
      setConversationsRefreshing(false);
    }
  }

  // ── carregar conversas do Supabase ao iniciar / trocar de empresa ────
  useEffect(() => {
    if (!user || !tenantId) return;
    // Troca de empresa: zera as conversas do tenant anterior antes de recarregar
    setConvList([]);
    setConvStates({});
    reloadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cs?.messages.length]);

  // ── carregar histórico quando muda a conversa ───────────────────────
  useEffect(() => {
    if (!activeId || !active || !user || !tenantId) return;

    // ── Histórico Instagram (meta_messages) ──────────────────────────
    if (active.channel === "instagram") {
      let q = supabase.from("meta_messages").select("*").eq("owner_id", tenantId);
      if (active.instanceId) q = q.eq("connection_id", active.instanceId);
      if (active.phone) q = q.or(`sender_id.eq.${active.phone},recipient_id.eq.${active.phone}`);
      q.order("sent_at", { ascending: true }).limit(100).then(({ data }) => {
        if (!data?.length) return;
        const msgs: Msg[] = data.map(m => {
          const d = new Date(m.sent_at);
          const isToday     = d.toDateString() === new Date().toDateString();
          const isYesterday = d.toDateString() === new Date(Date.now() - 86400000).toDateString();
          const dateLabel = isToday ? "Hoje" : isYesterday ? "Ontem" : d.toLocaleDateString("pt-BR");
          const isFromMe = m.direction === "out";
          const base = {
            id:    m.id,
            from:  (isFromMe ? "agent" : "lead") as "agent" | "lead",
            agent: isFromMe ? (user.email?.split("@")[0] ?? "Você") : undefined,
            time:  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            date:  dateLabel,
            read:  true as const,
          };
          if (m.message_type === "audio")  return { ...base, kind: "audio" as const, duration: "0:00", src: m.media_url ?? undefined };
          if (m.message_type === "image")  return { ...base, kind: "image" as const, src: m.media_url ?? "", caption: m.content ?? "" };
          if (m.message_type === "video" || m.message_type === "file") return { ...base, kind: "file" as const, filename: "arquivo", url: m.media_url ?? undefined };
          return { ...base, kind: "text" as const, text: m.content ?? "" };
        });
        updateCs(activeId, { messages: msgs });
      });
      return;
    }

    // ── Histórico WhatsApp (whatsapp_messages) ───────────────────────
    const rawPhone = (active.phone ?? "").replace(/\D/g, "");
    // Sempre inclui phone.eq.${activeId} para carregar mensagens de sistema
    // que foram salvas com o ID da conversa como chave (quando não há telefone real)
    const phoneFilter = rawPhone
      ? [...phoneVariants(rawPhone).map(v => `phone.eq.${v}`), `phone.eq.${activeId}`].join(",")
      : `phone.eq.${activeId}`;

    let histQuery = supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("owner_id", tenantId);
    // Histórico isolado por instância (número) — não mistura conversas de números diferentes
    if (active.instanceId) histQuery = histQuery.eq("instance_id", active.instanceId);
    histQuery
      .or(phoneFilter)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (!data?.length) return;
        const msgs: Msg[] = data.map(m => {
          const d = new Date(m.momment ?? m.created_at);
          const isToday     = d.toDateString() === new Date().toDateString();
          const isYesterday = d.toDateString() === new Date(Date.now() - 86400000).toDateString();
          const dateLabel = isToday ? "Hoje" : isYesterday ? "Ontem" : d.toLocaleDateString("pt-BR");
          const base = {
            id:    m.id,
            from:  (m.from_me ? "agent" : "lead") as "agent" | "lead",
            agent: m.from_me ? (m.sender_name ?? user.email?.split("@")[0] ?? "Você") : undefined,
            time:  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            date:  dateLabel,
            read:  true as const,
          };
          if (m.type === "system")   return { id: m.id, from: "system" as const, time: base.time, kind: "system" as const, text: m.body ?? "", date: base.date };
          if (m.type === "audio")    return { ...base, kind: "audio"  as const, duration: parseAudioDuration(m.body), src: m.media_url ?? undefined };
          if (m.type === "image")    return { ...base, kind: "image"  as const, src: m.media_url ?? "", caption: m.body ?? "" };
          if (m.type === "document") return { ...base, kind: "file"   as const, filename: m.body ?? "arquivo", url: m.media_url ?? undefined };
          return { ...base, kind: "text" as const, text: m.body ?? "" };
        });
        updateCs(activeId, { messages: msgs });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.phone, active?.instanceId, active?.channel, user?.id]);

  // Mantém a instância (número) da conversa ativa selecionada — ao reabrir a
  // conversa, volta a usar o mesmo número que estava sendo conversado.
  useEffect(() => {
    if (active?.instanceId && active.instanceId !== selectedInstance) {
      setSelectedInstance(active.instanceId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.instanceId]);

  // ── listener global de mensagens recebidas (sem filtro de telefone) ──
  // Trata tanto conversas existentes (phone mismatch de código de país)
  // quanto novas mensagens de números ainda sem conversa no CRM
  useEffect(() => {
    if (!user || !tenantId) return;

    const ch = supabase
      .channel("wamsg-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const m = payload.new as { id?: string; owner_id?: string; instance_id?: string; from_me: boolean; phone?: string; body?: string; chat_name?: string; sender_name?: string; momment?: number; created_at?: string; type?: string; media_url?: string };
          // from_me também é processado: mensagens enviadas por AUTOMAÇÕES (ou por
          // outro membro/dispositivo) chegam só por aqui. Antes eram ignoradas, então
          // o áudio da automação não aparecia ao vivo e o preview da conversa nunca
          // atualizava. As enviadas por ESTE cliente são deduplicadas por id (o
          // insert usa o mesmo UUID da mensagem otimista).
          if (m.owner_id !== tenantId) return; // só mensagens da empresa selecionada

          const msgPhone = (m.phone ?? "") as string;
          const msgInst  = (m.instance_id ?? "") as string;
          const d = new Date(m.momment ?? m.created_at);
          const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

          // Mensagens de sistema: casa por ID direto, ou por telefone E instância (cada
          // instância do mesmo lead é uma conversa separada e recebe seu próprio evento).
          if (m.type === "system") {
            const sysConv = convListRef.current.find(c =>
              c.id === msgPhone || (phonesMatch(c.phone ?? "", msgPhone) && (!c.instanceId || !msgInst || c.instanceId === msgInst))
            );
            if (sysConv) {
              setConvStates(prev => {
                const cur = prev[sysConv.id];
                if (!cur) return prev;
                if (cur.messages.some(x => x.id === m.id)) return prev;
                const sysMsg: Msg = { id: m.id, from: "system" as const, time: timeStr, kind: "system" as const, text: m.body ?? "", date: "Hoje" };
                return { ...prev, [sysConv.id]: { ...cur, messages: [...cur.messages, sysMsg] } };
              });
            }
            return; // nunca cria nova conversa para mensagem de sistema
          }

          // Procura conversa pelo telefone E pela instância (cada número é uma conversa
          // separada). Conversas legadas sem instância casam por telefone.
          const existing = convListRef.current.find(c =>
            phonesMatch(c.phone ?? "", msgPhone) && (!c.instanceId || !msgInst || c.instanceId === msgInst)
          );

          const previewLabel = previewLabelFor(m.type, m.body);
          if (existing) {
            // Atualiza preview da conversa existente
            setConvList(prev => prev.map(c =>
              c.id === existing.id ? { ...c, preview: previewLabel, time: timeStr } : c
            ));
            // Adiciona a mensagem no estado da conversa se já estiver carregada
            setConvStates(prev => {
              const cur = prev[existing.id];
              if (!cur) return prev;
              if (cur.messages.some(x => x.id === m.id)) return prev;
              const newMsg: Msg = buildIncomingMsg(m, timeStr);
              // Mensagem própria (automação/membro) não marca a conversa como não-lida
              return { ...prev, [existing.id]: { ...cur, messages: [...cur.messages, newMsg], read: m.from_me ? cur.read : false } };
            });
            // Atualiza preview e timestamp no banco
            supabase.from("whatsapp_conversations").update({
              preview: previewLabel, last_msg_at: new Date().toISOString(), ...(m.from_me ? {} : { read: false }),
            }).eq("id", existing.id);
          } else {
            // Cria nova conversa automaticamente para este remetente
            const newId = crypto.randomUUID();
            const newConv: Conversation = {
              id:      newId,
              // from_me: sender_name é o AGENTE, não serve como nome da conversa
              name:    m.from_me ? (m.chat_name ?? msgPhone) : (m.chat_name ?? m.sender_name ?? msgPhone),
              preview: previewLabel,
              time:    timeStr,
              channel: "whatsapp" as const,
              tags:    [],
              phone:   msgPhone,
              instanceId: msgInst || undefined,
            };
            setConvList(prev => [newConv, ...prev]);
            setConvStates(prev => ({
              ...prev,
              [newId]: { messages: [buildIncomingMsg(m, timeStr)], stageIdx: 0, meeting: null, notes: "", read: false, finished: false },
            }));
            // Persiste nova conversa no banco
            supabase.from("whatsapp_conversations").insert({
              id: newId, owner_id: tenantId, company_id: company?.id ?? null, instance_id: msgInst || null, name: newConv.name, phone: msgPhone,
              channel: "whatsapp", tags: [], preview: previewLabel,
              last_msg_at: new Date().toISOString(), read: false,
            }).then(({ error }) => {
              if (error) console.error("Erro ao persistir nova conversa:", error);
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // ── realtime: mensagens Instagram (meta_messages) ─────────────────
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel("ig-msg-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meta_messages" },
        (payload) => {
          const m = payload.new as {
            id: string; owner_id: string; connection_id: string;
            sender_id: string; recipient_id: string; direction: string;
            message_type: string; content: string | null; media_url: string | null; sent_at: string;
          };
          if (m.owner_id !== tenantId) return;
          const isFromMe = m.direction === "out";
          const contactId = isFromMe ? m.recipient_id : m.sender_id;
          const d = new Date(m.sent_at);
          const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const previewText = m.content || (m.message_type === "audio" ? "🎤 Mensagem de áudio" : m.message_type === "image" ? "🖼️ Imagem" : "📎 Arquivo");
          const existing = convListRef.current.find(c =>
            c.channel === "instagram" && c.phone === contactId && c.instanceId === m.connection_id
          );
          if (existing) {
            setConvList(prev => prev.map(c => c.id === existing.id ? { ...c, preview: previewText, time: timeStr, lastMsgAt: m.sent_at } : c));
            setConvStates(prev => {
              const cur = prev[existing.id];
              if (!cur) return prev;
              if (cur.messages.some(x => x.id === m.id)) return prev;
              const base = {
                id: m.id,
                from: isFromMe ? "agent" as const : "lead" as const,
                agent: isFromMe ? (user?.email?.split("@")[0] ?? "Você") : undefined,
                time: timeStr, date: "Hoje", read: true as const,
              };
              const newMsg: Msg = { ...base, kind: "text" as const, text: m.content ?? "" };
              return { ...prev, [existing.id]: { ...cur, messages: [...cur.messages, newMsg], read: isFromMe ? cur.read : false } };
            });
            if (!isFromMe) {
              supabase.from("whatsapp_conversations").update({ preview: previewText, last_msg_at: m.sent_at, read: false }).eq("id", existing.id);
            }
          } else if (!isFromMe) {
            // Nova conversa Instagram chegou com a página aberta — busca do banco
            supabase.from("whatsapp_conversations").select("*")
              .eq("owner_id", tenantId).eq("phone", contactId).eq("instance_id", m.connection_id)
              .maybeSingle().then(({ data: conv }) => {
                if (!conv) return;
                const cd = new Date(conv.last_msg_at);
                const newConv: Conversation = {
                  id: conv.id, name: conv.name, preview: conv.preview,
                  time: cd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                  channel: "instagram", tags: conv.tags ?? [],
                  phone: conv.phone ?? undefined, instanceId: conv.instance_id ?? undefined,
                  lastMsgAt: conv.last_msg_at ?? undefined,
                };
                setConvList(prev => prev.some(c => c.id === conv.id) ? prev : [newConv, ...prev]);
                setConvStates(prev => prev[conv.id] ? prev : {
                  ...prev, [conv.id]: { messages: [], stageIdx: 0, meeting: null, notes: "", read: false, finished: false },
                });
              });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // load Z-API instances da tabela whatsapp_connections via CompanyContext
  useEffect(() => {
    const insts: ZApiInstance[] = whatsappConnections
      .filter(c => c.connected && c.active)
      .map(c => ({
        instanceId:  c.instanceId,
        token:       c.token,
        clientToken: c.clientToken ?? "",
        phone:       c.phone ?? c.instanceId,
        label:       c.name,
        provider:    (["dapi", "cloud_api"].includes(c.provider ?? "") ? c.provider : "zapi") as "zapi" | "dapi" | "cloud_api",
      }));
    setInstances(insts);
    setSelectedInstance(prev => {
      if (insts.find(i => i.instanceId === prev)) return prev;
      return insts[0]?.instanceId ?? "";
    });
  }, [whatsappConnections]);

  // ── sincroniza chats abertos pelo Pipeline → multi-atendimento ───────
  useEffect(() => {
    if (!openedLeadIds.length || !user) return;
    const allPipelines = pipelines ?? [];
    const toCreate: Array<{ conv: Conversation; cs: ConvState }> = [];

    setConvList(prev => {
      let updated = [...prev];
      for (const leadId of openedLeadIds) {
        if (updated.find(c => c.id === leadId)) continue;
        const lead = leads[leadId];
        if (!lead) continue;
        const pipelineName = allPipelines.find(p => p.id === lead.pipelineId)?.name ?? "Pipeline Comercial";
        const conv: Conversation = {
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
          instanceId: selectedInstance || undefined,
        };
        const cs: ConvState = { messages: [], stageIdx: 1, meeting: null, notes: "", read: true, finished: false };
        toCreate.push({ conv, cs });
        updated = [conv, ...updated];
      }
      return updated;
    });
    setConvStates(prev => {
      const next = { ...prev };
      for (const { conv, cs } of toCreate) {
        if (!next[conv.id]) next[conv.id] = cs;
      }
      return next;
    });
    // Persiste novas conversas no Supabase
    for (const { conv, cs } of toCreate) {
      supabase.from("whatsapp_conversations").upsert({
        id: conv.id, owner_id: tenantId, company_id: company?.id ?? null, instance_id: conv.instanceId ?? null, name: conv.name, phone: conv.phone ?? null,
        channel: conv.channel, tags: conv.tags, company_name: conv.company ?? null,
        email: conv.email ?? null, pipeline: conv.pipeline ?? null,
        deal_number: conv.dealNumber ?? null, value: conv.value ?? null,
        preview: conv.preview, stage_idx: cs.stageIdx, notes: cs.notes,
        read: cs.read, finished: cs.finished,
      }, { onConflict: "id", ignoreDuplicates: true }).then(({ error }) => {
        if (error) console.error("Erro ao persistir conversa (pipeline):", error);
      });
    }
  }, [openedLeadIds, leads, pipelines, user?.id]);

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
      instanceId: selectedInstance || undefined,
    };

    const newCs: ConvState = { messages: [], stageIdx, meeting: null, notes: "", read: true, finished: false };
    setConvList(prev => [newConv, ...prev]);
    setConvStates(prev => ({ ...prev, [leadId]: newCs }));
    setActiveId(leadId);
    setNewConvOpen(false);
    setLeadSearch("");
    toast.success(`Conversa iniciada com ${lead.name}`);
    if (user) {
      supabase.from("whatsapp_conversations").upsert({
        id: leadId, owner_id: tenantId, company_id: company?.id ?? null, instance_id: newConv.instanceId ?? null, name: newConv.name, phone: newConv.phone ?? null,
        channel: newConv.channel, tags: newConv.tags, company_name: newConv.company ?? null,
        email: newConv.email ?? null, pipeline: newConv.pipeline ?? null,
        deal_number: newConv.dealNumber ?? null, value: newConv.value ?? null,
        preview: newConv.preview, stage_idx: stageIdx, notes: "", read: true, finished: false,
      }, { onConflict: "id", ignoreDuplicates: true }).then(({ error }) => {
        if (error) console.error("Erro ao persistir conversa (nova, via pipeline):", error);
      });
    }
  }

  // ── toolbar helpers ──────────────────────────────────────────────────
  function insertEmoji(emoji: string) {
    setInputValue(v => v + emoji);
    setShowEmoji(false);
  }

  function handleAttachClick() {
    if (cs?.finished) return;
    fileInputRef.current?.click();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId || !active || !user) return;
    e.target.value = "";
    const inst = instances.find(i => i.instanceId === selectedInstance);
    if (!inst?.token || !active.phone || active.phone === "—") {
      toast.error("Nenhuma instância WhatsApp conectada");
      return;
    }
    const cleanPhone = active.phone.replace(/\D/g, "");
    const isImage = file.type.startsWith("image/");
    toast.loading("Enviando arquivo…", { id: "file-send" });
    try {
      // Sobe o arquivo para o storage → URL pública. Sem isso a mensagem ficava
      // sem media_url e, ao recarregar, o arquivo não podia ser baixado no chat.
      let mediaUrl: string | null = null;
      try {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${user.id}/file-${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("automation-media").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
        if (!upErr) {
          mediaUrl = supabase.storage.from("automation-media").getPublicUrl(path).data.publicUrl;
        } else {
          console.error("[file] upload storage:", upErr);
          toast.error(`Falha ao salvar o arquivo (não será baixável no chat): ${upErr.message}`);
        }
      } catch (e) { console.error("[file] upload storage:", e); }

      // BUG FIX: manter URI completa (data:image/jpeg;base64,...) que a Z-API exige
      const dataUri = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      // BUG FIX: send-document exige extensão no path (/send-document/pdf)
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const endpoint = isImage ? "send-image" : `send-document/${ext}`;
      const body = isImage
        ? { phone: cleanPhone, image: dataUri, caption: file.name }
        : { phone: cleanPhone, document: dataUri, fileName: file.name };
      const r = await fetch(
        `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/${endpoint}`,
        { method: "POST", headers: { "Content-Type": "application/json", ...(inst.clientToken ? { "Client-Token": inst.clientToken } : {}) }, body: JSON.stringify(body) }
      );
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error ?? String(r.status));
      }
      const msgId = crypto.randomUUID(); // mesmo id no otimista e no insert (dedupe realtime)
      const newMsg: Msg = isImage
        ? { id: msgId, from: "agent", agent: user.email?.split("@")[0] ?? "Você", time: nowTime(), kind: "image", src: mediaUrl ?? URL.createObjectURL(file), caption: file.name, date: "Hoje", read: false }
        : { id: msgId, from: "agent", agent: user.email?.split("@")[0] ?? "Você", time: nowTime(), kind: "file",  filename: file.name, url: mediaUrl ?? undefined, date: "Hoje", read: false };
      updateCs(activeId, { messages: [...(cs?.messages ?? []), newMsg] });
      bumpPreview(activeId, isImage ? "🖼️ Imagem" : `📎 ${file.name}`);
      // Persiste no banco para histórico futuro
      const { error: insErr } = await supabase.from("whatsapp_messages").insert({
        id:          msgId,
        owner_id:    tenantId,
        company_id:  company?.id ?? null,
        instance_id: inst.instanceId,
        phone:       cleanPhone,
        from_me:     true,
        body:        file.name,
        type:        isImage ? "image" : "document",
        media_url:   mediaUrl,
        momment:     Date.now(),
        sender_name: user.email?.split("@")[0] ?? "Você",
      });
      if (insErr) { console.error("[file] insert:", insErr); toast.error(`Arquivo enviado, mas não salvo no histórico: ${insErr.message}`); }
      toast.success("Arquivo enviado!", { id: "file-send" });
    } catch (err) {
      toast.error(`Erro ao enviar arquivo: ${(err as Error).message}`, { id: "file-send" });
    }
  }

  async function startRecording() {
    if (cs?.finished) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // BUG FIX: usar o MIME type real que o browser suporta, sem forçar ogg
      const mimeType =
        MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")  ? "audio/ogg;codecs=opus"  :
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        // BUG FIX: criar Blob com o MIME type real gravado (não forçar ogg)
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
        await sendAudioBlob(blob, recordingTimeRef.current);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      recordingTimeRef.current = 0;
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime(recordingTimeRef.current);
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setRecording(false);
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    audioChunksRef.current = [];
    recordingTimeRef.current = 0;
    setRecording(false);
    setRecordingTime(0);
  }

  async function sendAudioBlob(blob: Blob, durationSecs: number) {
    if (!activeId || !active || !user) return;
    const inst = instances.find(i => i.instanceId === selectedInstance);
    if (!inst?.token || !active.phone || active.phone === "—") {
      toast.error("Nenhuma instância WhatsApp conectada");
      return;
    }
    const cleanPhone = active.phone.replace(/\D/g, "");
    const duration = `${String(Math.floor(durationSecs / 60)).padStart(2, "0")}:${String(durationSecs % 60).padStart(2, "0")}`;
    toast.loading("Enviando áudio…", { id: "audio-send" });
    try {
      // MediaRecorder gera WebM sem a duração no header → WhatsApp mostra 0:00.
      // Injeta a duração real antes de enviar/armazenar.
      let outBlob = blob;
      if ((blob.type || "").includes("webm") && durationSecs > 0) {
        try { outBlob = await fixWebmDuration(blob, durationSecs * 1000, { logger: false }); }
        catch (e) { console.warn("[audio] fixWebmDuration:", e); }
      }
      // Sobe o áudio para o storage → URL pública (reprodução no chat e histórico)
      let mediaUrl: string | null = null;
      try {
        const ext = (outBlob.type || "").includes("ogg") ? "ogg" : "webm";
        const path = `${user.id}/audio-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("automation-media").upload(path, outBlob, { upsert: true, contentType: outBlob.type || "audio/webm" });
        if (!upErr) {
          mediaUrl = supabase.storage.from("automation-media").getPublicUrl(path).data.publicUrl;
        } else {
          // Sem este upload o áudio fica sem URL pública → não reproduz no chat
          // e aparece como 00:00. Antes o erro era engolido (só console.warn).
          console.error("[audio] upload storage:", upErr);
          toast.error(`Falha ao salvar o áudio (não tocará no chat): ${upErr.message}`);
        }
      } catch (e) { console.error("[audio] upload storage:", e); toast.error(`Falha ao salvar o áudio: ${(e as Error).message}`); }

      // Z-API /send-audio espera base64 puro (sem o prefixo data:audio/...;base64,)
      const dataUri = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(outBlob);
      });
      const base64 = dataUri.split(",")[1]; // strip data URI prefix
      const r = await fetch(
        `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/send-audio`,
        { method: "POST", headers: { "Content-Type": "application/json", ...(inst.clientToken ? { "Client-Token": inst.clientToken } : {}) }, body: JSON.stringify({ phone: cleanPhone, audio: base64 }) }
      );
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error ?? String(r.status));
      }
      const msgId = crypto.randomUUID(); // mesmo id no otimista e no insert (dedupe realtime)
      const newMsg: Msg = { id: msgId, from: "agent", agent: user.email?.split("@")[0] ?? "Você", time: nowTime(), kind: "audio", duration, src: mediaUrl ?? undefined, date: "Hoje", read: false };
      updateCs(activeId, { messages: [...(cs?.messages ?? []), newMsg] });
      bumpPreview(activeId, "🎤 Mensagem de áudio");
      // Persiste no banco para histórico futuro
      const { error: insErr } = await supabase.from("whatsapp_messages").insert({
        id:          msgId,
        owner_id:    tenantId,
        company_id:  company?.id ?? null,
        instance_id: inst.instanceId,
        phone:       cleanPhone,
        from_me:     true,
        body:        duration,
        type:        "audio",
        media_url:   mediaUrl,
        momment:     Date.now(),
        sender_name: user.email?.split("@")[0] ?? "Você",
      });
      if (insErr) { console.error("[audio] insert:", insErr); toast.error(`Áudio enviado, mas não salvo no histórico: ${insErr.message}`); }
      toast.success("Áudio enviado!", { id: "audio-send" });
    } catch (err) {
      toast.error(`Erro ao enviar áudio: ${(err as Error).message}`, { id: "audio-send" });
    }
  }

  async function suggestAI() {
    if (!cs || aiLoading || cs.finished) return;
    setAiLoading(true);
    try {
      // Converte o histórico em texto rotulado para a IA ler o contexto
      const aiMsgs = (cs.messages ?? [])
        .filter(m => m.kind !== "system")
        .map(m => {
          let text = "";
          if (m.kind === "text") text = m.text;
          else if (m.kind === "audio") text = "[mensagem de áudio]";
          else if (m.kind === "image") text = m.caption ? `[imagem] ${m.caption}` : "[imagem]";
          else if (m.kind === "file") text = `[arquivo: ${m.filename}]`;
          return { from: m.from, text };
        })
        .filter(m => m.text);

      if (aiMsgs.length === 0) { toast.info("Sem mensagens na conversa para analisar."); return; }

      const { data, error } = await supabase.functions.invoke("ai-suggest-reply", {
        body: {
          messages: aiMsgs,
          leadName: effectiveLead?.name ?? active?.name ?? undefined,
          stage: activeStages[activeStageIdx] ?? undefined,
          pipeline: linkedPipeline?.name ?? undefined,
        },
      });

      const result = (data ?? {}) as { suggestion?: string; error?: string };
      if (error || result.error) {
        if (result.error === "not_configured") {
          toast.error("IA não configurada. Adicione a chave ANTHROPIC_API_KEY nas Edge Functions do Supabase.");
        } else {
          toast.error("Não foi possível gerar a sugestão. Tente novamente.");
        }
        return;
      }
      if (result.suggestion) setInputValue(result.suggestion);
    } catch {
      toast.error("Não foi possível gerar a sugestão. Tente novamente.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCreateNegocio() {
    if (!active || !user) return;
    const pipeline = (pipelines ?? []).find(p => p.id === negocioPipelineId);
    const firstCol = pipeline?.columns[0];
    if (!pipeline || !firstCol) { toast.error("Escolha um pipeline válido"); return; }
    const linkedLead = resolveLeadForConv(active);
    setNegocioLoading(true);
    const ok = await addLead({
      dealNumber: nextDealNumber(),
      name: negocioName || active.name,
      whatsapp: active.phone ?? "",
      value: parseFloat(negocioValue.replace(/[^\d,]/g, "").replace(",", ".")) || 0,
      responsible: "",
      responsibles: [],
      pipelineId: negocioPipelineId,
      stage: firstCol.id,
      priority: "Média",
      origin: "Outro",
      entryDate: new Date().toISOString().split("T")[0],
      notes: "",
      activities: [],
      tags: active.tags ?? [], // herda as tags já marcadas na conversa
      personId: linkedLead?.personId, // liga ao mesmo contato (multi-negócio)
    });
    setNegocioLoading(false);
    if (ok) {
      toast.success("Negócio criado com sucesso!");
      setShowNegocioForm(false);
      setNegocioName("");
      setNegocioValue("");
    }
  }

  // "+ Lead": cria só a pessoa (sem negócio/pipeline) — mostrado quando a
  // conversa ainda não tem nenhum Lead vinculado. Reaproveita
  // ensureContactForConversation (cria/liga o contato em "contacts") e insere
  // o Lead correspondente em "leads" com pipeline_id nulo.
  async function handleCreateLead() {
    if (!active || !user) return;
    setNegocioLoading(true);
    const contactId = await ensureContactForConversation(active);
    if (!contactId) {
      toast.error("Não foi possível criar o lead.");
      setNegocioLoading(false);
      return;
    }
    const ok = await addLead({
      dealNumber: nextDealNumber(),
      name: negocioName || active.name,
      whatsapp: active.phone ?? "",
      value: 0,
      responsible: "",
      responsibles: [],
      pipelineId: "",
      stage: "",
      priority: "Média",
      origin: "Outro",
      entryDate: new Date().toISOString().split("T")[0],
      notes: "",
      activities: [],
      tags: active.tags ?? [],
      personId: contactId,
    });
    setNegocioLoading(false);
    if (ok) {
      toast.success("Lead criado com sucesso!");
      setShowNegocioForm(false);
      setNegocioName("");
    }
  }

  function handleScheduleSubmit(data: ActivitySubmitData) {
    // ActivityDialog retorna leadId: undefined quando defaultLead foi passado — usar lead vinculado
    const resolvedLeadId = data.leadId ?? (() => {
      if (!active) return undefined;
      const ll = resolveLeadForConv(active);
      return ll?.id;
    })();
    if (!resolvedLeadId) { toast.error("Nenhum negócio vinculado para salvar a atividade."); return; }
    addActivity(resolvedLeadId, {
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
    setShowScheduleDialog(false);
  }

  // Ao trocar de conversa, reconcilia as tags do lead e de TODAS as conversas dele
  // (várias instâncias → mesmo lead). Usa a união para não perder nada; remoções
  // explícitas são propagadas em toggleConvTag.
  useEffect(() => {
    if (!activeId) return;
    const conv = convList.find(c => c.id === activeId);
    if (!conv) return;
    const linkedLead = resolveLeadForConv(conv);
    if (!linkedLead) return;
    const leadTags = linkedLead.tags ?? [];
    const siblings = convList.filter(c => resolveLeadForConv(c)?.id === linkedLead.id);
    const union = Array.from(new Set([...leadTags, ...siblings.flatMap(c => c.tags ?? [])]));
    if (union.length === 0) return;
    // Atualiza o lead se faltam tags
    if (union.length !== leadTags.length) updateLead(linkedLead.id, { tags: union });
    // Espelha nas conversas desatualizadas (estado + banco)
    const staleIds = siblings
      .filter(c => { const t = c.tags ?? []; return t.length !== union.length || union.some(x => !t.includes(x)); })
      .map(c => c.id);
    if (staleIds.length > 0) {
      setConvList(prev => prev.map(c => staleIds.includes(c.id) ? { ...c, tags: union } : c));
      supabase.from("whatsapp_conversations").update({ tags: union }).in("id", staleIds)
        .then(({ error }) => { if (error) console.error("sync tags conversas:", error); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function toggleConvTag(tagName: string) {
    if (!activeId || !active) return;

    const linkedLead = resolveLeadForConv(active);

    if (linkedLead) {
      // O lead é a fonte da verdade: um mesmo lead pode ter várias conversas (uma por
      // instância). As tags vivem no lead e são espelhadas em todas as conversas dele.
      const leadTags = linkedLead.tags ?? [];
      const nextTags = leadTags.includes(tagName)
        ? leadTags.filter(t => t !== tagName)
        : [...leadTags, tagName];
      await updateLead(linkedLead.id, { tags: nextTags });

      // Propaga para todas as conversas vinculadas a este lead (qualquer instância).
      const siblingIds = convList.filter(c => resolveLeadForConv(c)?.id === linkedLead.id).map(c => c.id);
      const ids = siblingIds.length > 0 ? siblingIds : [activeId];
      setConvList(prev => prev.map(c => ids.includes(c.id) ? { ...c, tags: nextTags } : c));
      await supabase.from("whatsapp_conversations").update({ tags: nextTags }).in("id", ids);
    } else {
      // Sem lead vinculado: a tag fica só na conversa.
      const current = active.tags ?? [];
      const next = current.includes(tagName)
        ? current.filter(t => t !== tagName)
        : [...current, tagName];
      setConvList(prev => prev.map(c => c.id === activeId ? { ...c, tags: next } : c));
      await supabase.from("whatsapp_conversations").update({ tags: next }).eq("id", activeId);
      if (!current.includes(tagName)) {
        toast.info("Tag salva na conversa. Crie um negócio para vinculá-la ao lead.");
      }
    }
  }

  async function toggleConvList(listId: string) {
    if (!activeId || !active) return;
    const linkedLead = resolveLeadForConv(active);
    if (!linkedLead) return;
    const list = crmLists.find(l => l.id === listId);
    if (!list) return;
    if (list.leadIds.includes(linkedLead.id)) {
      await removeLeadFromList(listId, linkedLead.id);
    } else {
      await addLeadToList(listId, linkedLead.id);
    }
  }

  // ── conv state helpers ──────────────────────────────────────────────
  function updateCs(id: string, patch: Partial<ConvState>) {
    // Fix: garante estado base completo mesmo quando prev[id] é undefined
    setConvStates(prev => ({ ...prev, [id]: { ...DEFAULT_CS, ...prev[id], ...patch } }));
    // Persiste campos não-mensagem no banco
    const { messages: _, ...meta } = patch;
    if (!user || Object.keys(meta).length === 0) return;
    const dbPatch: Record<string, unknown> = {};
    if ("stageIdx"  in meta) dbPatch.stage_idx     = meta.stageIdx;
    if ("notes"     in meta) dbPatch.notes          = meta.notes;
    if ("read"      in meta) dbPatch.read           = meta.read;
    if ("finished"  in meta) dbPatch.finished       = meta.finished;
    if ("meeting"   in meta) {
      dbPatch.meeting_date  = meta.meeting?.date  ?? null;
      dbPatch.meeting_time  = meta.meeting?.time  ?? null;
      dbPatch.meeting_owner = meta.meeting?.owner ?? null;
      dbPatch.meeting_note  = meta.meeting?.note  ?? null;
    }
    if ("assignedTo" in meta) dbPatch.assigned_to = meta.assignedTo ?? null;
    if ("departmentId" in meta) dbPatch.department_id = meta.departmentId ?? null;
    supabase.from("whatsapp_conversations").update(dbPatch).eq("id", id).then(({ error }) => {
      if (error) console.error("updateCs DB:", error);
    });
  }

  // Troca o número (instância) da conversa ativa. Como cada par (instância,
  // telefone) é uma conversa independente, mudar o número abre o thread daquele
  // lead naquele número — existente ou um novo (vazio) — sem misturar histórico.
  function switchActiveInstance(targetInstanceId: string) {
    setInstanceOpen(false);
    if (!active || !targetInstanceId) return;
    if ((active.instanceId ?? "") === targetInstanceId) { setSelectedInstance(targetInstanceId); return; }

    // Já existe um thread desse lead nesse número?
    const existing = convList.find(c =>
      c.id !== active.id &&
      phonesMatch(c.phone ?? "", active.phone ?? "") &&
      (c.instanceId ?? "") === targetInstanceId,
    );
    if (existing) {
      setActiveId(existing.id);
      setSelectedInstance(targetInstanceId);
      return;
    }

    // Cria um novo thread (vazio) vinculado a esse número, copiando os dados do lead.
    const label = instances.find(i => i.instanceId === targetInstanceId)?.label ?? "novo número";
    const newId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `conv-${Date.now()}`;
    const newConv: Conversation = { ...active, id: newId, preview: "", time: "agora", instanceId: targetInstanceId };
    const newCs: ConvState = { ...DEFAULT_CS, stageIdx: cs?.stageIdx ?? 0 };
    setConvList(prev => [newConv, ...prev]);
    setConvStates(prev => ({ ...prev, [newId]: newCs }));
    setActiveId(newId);
    setSelectedInstance(targetInstanceId);
    toast.success(`Conversa com ${convName(active)} via ${label}`);
    if (user && tenantId) {
      supabase.from("whatsapp_conversations").upsert({
        id: newId, owner_id: tenantId, company_id: company?.id ?? null, instance_id: targetInstanceId, name: newConv.name, phone: newConv.phone ?? null,
        channel: newConv.channel, tags: newConv.tags, company_name: newConv.company ?? null,
        email: newConv.email ?? null, pipeline: newConv.pipeline ?? null,
        deal_number: newConv.dealNumber ?? null, value: newConv.value ?? null,
        preview: "", stage_idx: newCs.stageIdx, notes: "", read: true, finished: false,
      }, { onConflict: "id", ignoreDuplicates: true }).then(({ error }) => {
        if (error) console.error("Erro ao persistir conversa (troca de instância):", error);
      });
    }
  }

  // Atualiza o preview (última mensagem) da conversa na lista e no banco.
  // Antes, só mensagens RECEBIDAS atualizavam o preview, então áudios/arquivos/
  // textos ENVIADOS não viravam a "última mensagem" — a lista ficava presa na
  // última mensagem recebida (ex.: mostrava "teste" mesmo após enviar um áudio).
  function bumpPreview(convId: string, label: string) {
    const now = nowTime();
    setConvList(prev => prev.map(c => c.id === convId ? { ...c, preview: label, time: now } : c));
    supabase.from("whatsapp_conversations")
      .update({ preview: label, last_msg_at: new Date().toISOString() })
      .eq("id", convId)
      .then(({ error }) => { if (error) console.warn("bumpPreview:", error.message); });
  }

  async function sendMessage() {
    if (!inputValue.trim() || !activeId) return;
    const text = inputValue.trim();
    // Mesmo UUID na mensagem otimista e no insert — o listener realtime deduplica
    // por id (sem isso, a própria mensagem voltaria duplicada via realtime).
    const msgId = crypto.randomUUID();
    const msg: Msg = {
      id: msgId,
      from: "agent",
      agent: user?.email?.split("@")[0] ?? "Você",
      time: nowTime(),
      kind: "text",
      text,
      date: "Hoje",
      read: false,
    };
    updateCs(activeId, { messages: [...(cs?.messages ?? []), msg] });
    bumpPreview(activeId, text);
    setInputValue("");

    // ── Envio via Instagram (meta-send-message) ──────────────────────
    if (active?.channel === "instagram") {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${supabaseUrl}/functions/v1/meta-send-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({ connection_id: active.instanceId, recipient_id: active.phone, text }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(`Erro ao enviar mensagem: ${(err as { error?: string }).error ?? res.status}`);
        }
      } catch {
        toast.error("Falha ao enviar mensagem no Instagram");
      }
      return;
    }

    // ── Enviar via WhatsApp (Z-API, D-API ou Cloud API) ──────────────
    const inst = instances.find(i => i.instanceId === selectedInstance);
    const contactPhone = active?.phone;
    if (inst?.token && contactPhone) {
      const cleanPhone = contactPhone.replace(/\D/g, "");

      // ── Cloud API (Meta) ────────────────────────────────────────────
      if (inst.provider === "cloud_api") {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${inst.instanceId}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${inst.token}`,
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: cleanPhone,
                type: "text",
                text: { body: text, preview_url: false },
              }),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            toast.error(`Erro ao enviar mensagem: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
          }
        } catch {
          toast.error("Falha ao enviar mensagem via WhatsApp Cloud API");
        }
      } else if (inst.provider === "dapi") {
        // ── D-API ──────────────────────────────────────────────────────
        try {
          const res = await fetch(
            `https://api.d-api.cloud/api/v1/messages/send/text`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": inst.token,
              },
              body: JSON.stringify({ sessionId: inst.instanceId, to: cleanPhone, text }),
            }
          );
          if (!res.ok) {
            const err = await res.text().catch(() => "");
            toast.error(`Erro ao enviar mensagem: ${err.slice(0, 120) || res.status}`);
          }
        } catch {
          toast.error("Falha ao enviar mensagem via D-API");
        }
      } else {
        // ── Z-API ──────────────────────────────────────────────────────
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

      // Persiste no banco para histórico futuro
      if (user) {
        const { error: sendPersistError } = await supabase.from("whatsapp_messages").insert({
          id:          msgId,
          owner_id:    tenantId,
          company_id:  company?.id ?? null,
          instance_id: inst.instanceId,
          phone:       cleanPhone,
          from_me:     true,
          body:        text,
          type:        "text",
          momment:     Date.now(),
          sender_name: user.email?.split("@")[0] ?? "Você",
        });
        if (sendPersistError) {
          console.error("[Multiatendimento] Falha ao persistir mensagem enviada:", sendPersistError);
          toast.error("Mensagem enviada, mas houve erro ao salvar no histórico.");
        }
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

  function cancelMeeting(id: string) {
    updateCs(id, { meeting: null });
    toast("Reunião cancelada");
  }

  // Garante que a conversa tenha um contato vinculado em "contacts",
  // CRIANDO um novo se preciso (o Lead em si é criado pelo chamador,
  // handleCreateLead). Chamado explicitamente pelo botão "+ Lead" — nunca
  // automaticamente (atribuir atendente não cria nada sozinho). Reaproveita
  // o personId de um lead já vinculado por telefone, ou um contato já
  // existente, antes de criar um novo.
  async function ensureContactForConversation(conv: Conversation): Promise<string | undefined> {
    if (conv.contactId) return conv.contactId;
    if (conv.channel !== "whatsapp" || !conv.phone || !tenantId || !company) return undefined;

    const linkedLead = resolveLeadForConv(conv);
    let contactId = linkedLead?.personId;

    if (!contactId) {
      const { data: found } = await supabase.from("contacts").select("id")
        .eq("company_id", company.id)
        .or(phoneVariants(conv.phone).map(v => `phone.eq.${v}`).join(","))
        .maybeSingle();
      contactId = (found as { id?: string } | null)?.id;
    }
    if (!contactId) {
      const { data: created, error } = await supabase.from("contacts")
        .insert({ company_id: company.id, owner_id: tenantId, name: convName(conv), phone: conv.phone })
        .select("id").single();
      if (error?.code === "23505") {
        // corrida: outro insert venceu — reaproveita a linha existente em vez de duplicar
        const { data: existing } = await supabase.from("contacts").select("id")
          .eq("company_id", company.id)
          .or(phoneVariants(conv.phone).map(v => `phone.eq.${v}`).join(","))
          .maybeSingle();
        contactId = (existing as { id?: string } | null)?.id;
      } else if (error || !created) {
        console.error("ensureContactForConversation:", error);
        return undefined;
      } else {
        contactId = (created as { id: string }).id;
      }
    }
    if (!contactId) return undefined;

    const sameContact = convList.filter(c => c.channel === "whatsapp" && phonesMatch(c.phone ?? "", conv.phone ?? ""));
    setConvList(prev => prev.map(c => sameContact.some(x => x.id === c.id) ? { ...c, contactId } : c));
    await supabase.from("whatsapp_conversations").update({ contact_id: contactId }).in("id", sameContact.map(c => c.id));
    return contactId;
  }

  // Versão passiva: só LIGA a conversa a um Lead já existente (achado por
  // telefone), nunca cria nada. Cobre o caso comum — número já cadastrado via
  // formulário/importação — sem exigir nenhum clique, mantendo
  // whatsapp_conversations.contact_id em dia para o sync de responsável.
  async function linkContactIfAlreadyKnown(conv: Conversation) {
    if (conv.contactId || conv.channel !== "whatsapp" || !conv.phone || !company) return;
    const linkedLead = resolveLeadForConv(conv);
    const contactId = linkedLead?.personId;
    if (!contactId) return;

    const sameContact = convList.filter(c => c.channel === "whatsapp" && phonesMatch(c.phone ?? "", conv.phone ?? ""));
    setConvList(prev => prev.map(c => sameContact.some(x => x.id === c.id) ? { ...c, contactId } : c));
    await supabase.from("whatsapp_conversations").update({ contact_id: contactId }).in("id", sameContact.map(c => c.id));
  }

  useEffect(() => {
    if (active) linkContactIfAlreadyKnown(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, convList]);

  async function handleTransfer(memberName: string) {
    if (!activeId || !user) return;
    const fromName = user.email?.split("@")[0] ?? "Você";
    const sysText = `Atendimento transferido para ${memberName} por ${fromName}`;
    const timeStr = nowTime();

    // Atribuir atendente só atribui atendente — criar o Lead é uma ação
    // explícita separada (botão "+ Lead"), não um efeito colateral daqui.

    // Conversas-alvo: TODAS as conversas do mesmo lead (uma por instância). Assim o
    // evento de transferência aparece no histórico de qualquer instância. Sem lead
    // vinculado, apenas a conversa ativa.
    const linkedLead = resolveLeadForConv(active);
    const targets = linkedLead
      ? convList.filter(c => resolveLeadForConv(c)?.id === linkedLead.id)
      : (active ? [active] : []);
    if (active && !targets.some(c => c.id === activeId)) targets.push(active);

    for (const conv of targets) {
      const msgId = crypto.randomUUID();
      const sysMsg: Msg = { id: msgId, from: "system", time: timeStr, kind: "system", text: sysText, date: "Hoje" };
      // Em memória apenas se a conversa já estiver carregada (a ativa sempre está).
      setConvStates(prev => {
        const cur = prev[conv.id];
        if (!cur) return prev;
        if (cur.messages.some(x => x.id === msgId)) return prev;
        return { ...prev, [conv.id]: { ...cur, messages: [...cur.messages, sysMsg] } };
      });
      // Persiste com a INSTÂNCIA da conversa — a query de histórico filtra por phone + instance_id.
      const phoneForSystem = (conv.phone ?? "").replace(/\D/g, "") || conv.id;
      supabase.from("whatsapp_messages").insert({
        id:          msgId,
        owner_id:    tenantId,
        company_id:  company?.id ?? null,
        instance_id: conv.instanceId ?? "system",
        phone:       phoneForSystem,
        from_me:     false,
        body:        sysText,
        type:        "system",
        momment:     Date.now(),
        sender_name: null,
      }).then(({ error }) => { if (error) console.error("Erro ao salvar evento de transferência:", error); });
    }

    // assignedTo é por conversa: atualiza só a conversa ativa (a que foi transferida).
    setConvStates(prev => {
      const cur = prev[activeId] ?? DEFAULT_CS;
      return { ...prev, [activeId]: { ...cur, assignedTo: memberName } };
    });
    supabase.from("whatsapp_conversations")
      .update({ assigned_to: memberName })
      .eq("id", activeId)
      .then(({ error }) => { if (error) console.error("updateCs assignedTo:", error); });

    // Responsável do lead + atividade FIXA (evento de sistema, não anotação editável).
    if (linkedLead) {
      updateLead(linkedLead.id, { responsible: memberName });
      addActivity(linkedLead.id, {
        type: "transfer",
        date: new Date().toISOString(),
        description: sysText,
        userName: fromName,
      });
    }

    toast.success(`Atendimento transferido para ${memberName}`);
    setShowTransferDialog(false);
  }

  // ── filter ──────────────────────────────────────────────────────────
  // Resolve o lead vinculado à conversa — delega para resolveLeadForConv
  // (mesma resolução usada no resto do arquivo, agora ciente de contactId).
  const convLead = (c: Conversation) => resolveLeadForConv(c) ?? undefined;

  const filteredConversations = useMemo(() => {
    let list = convList;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => convName(c).toLowerCase().includes(q) || (c.phone ?? "").includes(q) || c.preview.toLowerCase().includes(q));
    }
    switch (activeFilter) {
      case "not_started": list = list.filter(c => !convStates[c.id]?.assignedTo && !convStates[c.id]?.finished); break;
      case "pending":      list = list.filter(c => !convStates[c.id]?.finished); break;
      case "waiting":      list = list.filter(c => !convStates[c.id]?.finished && !convStates[c.id]?.read); break;
      case "done":         list = list.filter(c => convStates[c.id]?.finished); break;
      case "alert":        list = list.filter(c => c.tags.includes("Follow-up")); break;
    }

    // ── filtros avançados do painel ──
    if (fltDepts.length)     list = list.filter(c => { const d = convStates[c.id]?.departmentId; return !!d && fltDepts.includes(d); });
    if (fltAgents.length)    list = list.filter(c => { const a = convStates[c.id]?.assignedTo; return !!a && fltAgents.includes(a); });
    if (fltInstances.length) list = list.filter(c => !!c.instanceId && fltInstances.includes(c.instanceId));
    if (fltTags.length)      list = list.filter(c => c.tags.some(t => fltTags.includes(t)));
    if (fltPipeline || fltStages.length) {
      list = list.filter(c => {
        const l = convLead(c);
        if (!l) return false;
        if (fltPipeline && l.pipelineId !== fltPipeline) return false;
        if (fltStages.length && !fltStages.includes(l.stage)) return false;
        return true;
      });
    }
    if (fltWindow !== "all") {
      const DAY = 24 * 60 * 60 * 1000;
      list = list.filter(c => {
        if (!c.lastMsgAt) return fltWindow === "out";
        const within = Date.now() - new Date(c.lastMsgAt).getTime() <= DAY;
        return fltWindow === "in" ? within : !within;
      });
    }
    if (fltDateFrom) list = list.filter(c => c.lastMsgAt && new Date(c.lastMsgAt) >= new Date(fltDateFrom + "T00:00:00"));
    if (fltDateTo)   list = list.filter(c => c.lastMsgAt && new Date(c.lastMsgAt) <= new Date(fltDateTo + "T23:59:59"));

    // ── ordenação ──
    const ts = (c: Conversation) => (c.lastMsgAt ? new Date(c.lastMsgAt).getTime() : 0);
    const sorted = [...list];
    if (fltOrder === "recent")    sorted.sort((a, b) => ts(b) - ts(a));
    else if (fltOrder === "old")  sorted.sort((a, b) => ts(a) - ts(b));
    else if (fltOrder === "name") sorted.sort((a, b) => convName(a).localeCompare(convName(b), "pt-BR"));
    return sorted;
    // leads: convName/convLead resolvem o lead por telefone, então a busca depende deles
  }, [searchQuery, activeFilter, convStates, convList, leads, fltDepts, fltAgents, fltInstances, fltTags, fltPipeline, fltStages, fltWindow, fltDateFrom, fltDateTo, fltOrder]);

  const activeAdvCount =
    (fltDepts.length ? 1 : 0) + (fltAgents.length ? 1 : 0) + (fltInstances.length ? 1 : 0) +
    (fltTags.length ? 1 : 0) + ((fltPipeline || fltStages.length) ? 1 : 0) +
    (fltWindow !== "all" ? 1 : 0) + ((fltDateFrom || fltDateTo) ? 1 : 0);

  const clearAdvancedFilters = () => {
    setFltDepts([]); setFltAgents([]); setFltInstances([]); setFltTags([]);
    setFltPipeline(""); setFltStages([]); setFltWindow("all");
    setFltDateFrom(""); setFltDateTo(""); setFltOrder("recent");
  };

  const toggleInArray = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) =>
    setter(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);

  // ── seleção / ações em massa ──
  const bulkItemStyle = (disabled = false): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
    background: "none", border: "none", padding: "8px 10px", borderRadius: 8,
    fontSize: 13, color: disabled ? "#CCC" : "#333", cursor: disabled ? "not-allowed" : "pointer",
  });

  const toggleConvSelected = (id: string) =>
    setSelectedConvs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const allVisibleSelected = filteredConversations.length > 0 && filteredConversations.every(c => selectedConvs.includes(c.id));
  const toggleSelectAll = () => setSelectedConvs(allVisibleSelected ? [] : filteredConversations.map(c => c.id));

  // Aplica um patch de estado + persiste no banco para todas as conversas selecionadas
  const bulkApply = (patch: Partial<ConvState>, dbPatch: Record<string, unknown>, msg: string) => {
    const ids = [...selectedConvs];
    if (ids.length === 0) return;
    setConvStates(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = { ...DEFAULT_CS, ...next[id], ...patch }; });
      return next;
    });
    supabase.from("whatsapp_conversations").update(dbPatch).in("id", ids).then(({ error }) => {
      if (error) { console.error("bulkApply:", error); toast.error("Erro ao aplicar ação em massa."); return; }
      toast.success(msg);
    });
    setSelectedConvs([]);
  };

  const bulkFinish = () => bulkApply({ finished: true, read: true }, { finished: true, read: true }, `${selectedConvs.length} conversa(s) finalizada(s).`);

  const bulkAssignAgent = (agent: string) => {
    bulkApply({ assignedTo: agent }, { assigned_to: agent }, `Atendente atribuído a ${selectedConvs.length} conversa(s).`);
    setBulkAction(null);
  };

  const bulkAssignDept = (deptId: string) => {
    const deptName = muDepts.find(d => d.id === deptId)?.name ?? "departamento";
    bulkApply({ departmentId: deptId }, { department_id: deptId }, `Conversas transferidas para ${deptName}.`);
    setBulkAction(null);
  };

  // Automações com gatilho de "Execução manual" (lead_manual), ativas
  useEffect(() => {
    const cid = company?.id;
    if (!cid) { setManualAutomations([]); return; }
    (async () => {
      const { data } = await supabase.from("automations").select("id, name, flow").eq("company_id", cid).eq("active", true);
      const list = (data ?? [])
        .filter((a: { flow?: { trigger?: { triggerId?: string } } }) => a.flow?.trigger?.triggerId === "lead_manual")
        .map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }));
      setManualAutomations(list);
    })();
  }, [company?.id]);

  // Executa uma automação manual (lead_manual) nos leads das conversas-alvo
  const runAutomationOnConvs = async (automationId: string) => {
    const convIds = autoModalConvs ?? [];
    const cid = company?.id;
    if (!cid || convIds.length === 0) return;
    setRunningAutomation(true);
    let ok = 0, skipped = 0;
    for (const convId of convIds) {
      const c = convList.find(x => x.id === convId);
      const leadId = c ? convLead(c)?.id : undefined;
      if (!leadId) { skipped++; continue; }
      const { error } = await supabase.functions.invoke("automation-runner/manual", {
        body: { company_id: cid, lead_id: leadId, automation_id: automationId },
      });
      if (error) { skipped++; } else { ok++; }
    }
    setRunningAutomation(false);
    setAutoModalConvs(null);
    if (selectionMode) setSelectedConvs([]);
    if (ok > 0) toast.success(`Automação executada em ${ok} conversa(s).`);
    if (skipped > 0) toast.error(`${skipped} conversa(s) sem negócio vinculado foram ignoradas.`);
  };

  // Seção de checklist (multi-seleção) do painel de filtros
  const renderFilterChecklist = (
    secKey: string, title: string, summary: string,
    options: { value: string; label: string; color?: string }[],
    selected: string[], setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    const open = fltSecOpen[secKey] ?? false;
    return (
      <div style={{ borderBottom: "1px solid #F0F0F0" }}>
        <button onClick={() => setFltSecOpen(p => ({ ...p, [secKey]: !open }))} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: "14px 0", cursor: "pointer" }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{title}</div>
            <div style={{ fontSize: 12, color: selected.length ? "#128A68" : "#AAA", marginTop: 2 }}>{selected.length ? `${selected.length} selecionado(s)` : summary}</div>
          </div>
          <ChevronDown size={16} color="#AAA" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
        {open && (
          <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
            {options.length === 0 && <div style={{ fontSize: 12, color: "#CCC", padding: "4px 0" }}>Nenhum item cadastrado</div>}
            {options.map(o => {
              const on = selected.includes(o.value);
              return (
                <button key={o.value} onClick={() => toggleInArray(setter, o.value)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "7px 8px", borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid " + (on ? "#128A68" : "#CCC"), background: on ? "#128A68" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on && <Check size={11} color="#FFF" />}</div>
                  {o.color && <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const filters = [
    { id: "not_started", icon: Inbox,         label: "Não iniciadas", count: convList.filter(c => !convStates[c.id]?.assignedTo && !convStates[c.id]?.finished).length, color: "#EA580C", colorBg: "#FFF7ED", borderColor: "rgba(255, 94, 21, 0.52)" },
    { id: "waiting",     icon: Clock,         label: "Aguardando",    count: convList.filter(c => !convStates[c.id]?.finished && !convStates[c.id]?.read).length,      color: "#D97706", colorBg: "#FFFBEB", borderColor: "rgba(246, 176, 54, 0.52)" },
    { id: "pending",     icon: MessageCircle, label: "Abertas",       count: convList.filter(c => !convStates[c.id]?.finished).length,                                 color: "#2563EB", colorBg: "#EFF6FF", borderColor: "rgba(65, 121, 219, 0.52)" },
    { id: "alert",       icon: AlertTriangle, label: "Follow-up",     count: convList.filter(c => c.tags.includes("Follow-up")).length,                                color: "#7C3AED", colorBg: "#F5F3FF", borderColor: "rgba(118, 49, 214, 0.52)" },
    { id: "done",        icon: CheckCircle2,  label: "Finalizadas",   count: convList.filter(c => convStates[c.id]?.finished).length,                                  color: "#128A68", colorBg: "#EAFBF4", borderColor: "rgba(34, 197, 94, 0.6)" },
  ];
  const activeFilterMeta = filters.find(f => f.id === activeFilter);
  const activeFilterTitle = activeFilterMeta?.label ?? "Todas as conversas";
  const activeFilterCount = activeFilterMeta?.count ?? convList.length;

  // ── grouped messages ────────────────────────────────────────────────
  const groupedMessages = useMemo(() => {
    const groups: Record<string, Msg[]> = {};
    (cs?.messages ?? []).forEach(m => { (groups[m.date] ||= []).push(m); });
    return Object.entries(groups);
  }, [cs?.messages]);

  return (
    <div
      style={{ display: "flex", height: "100vh", width: "100%", background: "hsl(var(--background))" }}
      onClick={() => { if (instanceOpen) setInstanceOpen(false); if (moreMenuOpen) setMoreMenuOpen(false); if (bulkMenuOpen) setBulkMenuOpen(false); }}
    >
      {/* ── COLUNA 1 — LISTA ─────────────────────────────────────────── */}
      <aside style={{ width: 300, minWidth: 300, maxWidth: 300, height: "100vh", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#FFF", position: "relative", zIndex: 2, overflow: "hidden" }}>
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid #F0F0F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 10px" }}>
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
            <button
              onClick={() => { setShowMultiSettings(true); setSettingsTab("config"); }}
              title="Configurações do multiatendimento"
              style={{ background: "transparent", border: "1px solid #E5E5E5", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <Settings size={14} color="#666" />
            </button>
          </div>

          {/* título do filtro rápido ativo + botão atualizar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#333" }}>
              {activeFilterTitle}
              <span style={{ background: "#F0F0F0", color: "#888", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "1px 7px", minWidth: 16, textAlign: "center" }}>
                {activeFilterCount}
              </span>
            </span>
            <button
              onClick={handleRefreshConversations}
              disabled={conversationsRefreshing}
              title="Atualizar conversas"
              style={{ background: "transparent", border: "1px solid #E5E5E5", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: conversationsRefreshing ? "default" : "pointer", flexShrink: 0 }}
            >
              <RefreshCw size={13} color="#666" className={conversationsRefreshing ? "animate-spin" : undefined} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {filters.map(f => (
              <FilterChip key={f.id} Icon={f.icon} count={f.count} label={f.label} color={f.color} colorBg={f.colorBg} borderColor={f.borderColor} iconOnly={f.id === "done"} isActive={activeFilter === f.id} onClick={() => setActiveFilter(activeFilter === f.id ? "" : f.id)} />
            ))}
          </div>

          {/* barra: Filtros + ações em massa (⋯) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "#888" }}>
              {selectionMode ? `${selectedConvs.length} selecionada${selectedConvs.length === 1 ? "" : "s"}` : `${filteredConversations.length} conversa${filteredConversations.length === 1 ? "" : "s"}`}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => setFilterPanelOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: 5, background: activeAdvCount ? "#E1F5EE" : "transparent", border: "1px solid " + (activeAdvCount ? "#128A68" : "#E5E5E5"), borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: activeAdvCount ? "#128A68" : "#666", cursor: "pointer" }}
              >
                <Filter size={13} /> Filtros
                {activeAdvCount > 0 && <span style={{ background: "#128A68", color: "#FFF", borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "0 5px", minWidth: 16, textAlign: "center" }}>{activeAdvCount}</span>}
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setBulkMenuOpen(v => !v); }}
                  title="Ações em massa"
                  style={{ background: "transparent", border: "1px solid #E5E5E5", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <MoreHorizontal size={16} color="#666" />
                </button>
                {bulkMenuOpen && (
                  <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 220, background: "#FFF", border: "1px solid #EEEEEE", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.16)", zIndex: 50, padding: 6 }}>
                    <button onClick={() => { setSelectionMode(v => { const nv = !v; if (!nv) setSelectedConvs([]); return nv; }); setBulkMenuOpen(false); }} style={bulkItemStyle()}>
                      <Eye size={14} color="#128A68" /> {selectionMode ? "Desabilitar seleção" : "Habilitar seleção"}
                    </button>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em", padding: "8px 10px 4px" }}>Ações em massa</div>
                    {[
                      { key: "finish", icon: <CheckCircle2 size={14} color="#666" />, label: "Finalizar conversas", onClick: () => bulkFinish() },
                      { key: "agent",  icon: <UserCheck size={14} color="#666" />,    label: "Transferir atendente", onClick: () => { setBulkAction("agent"); } },
                      { key: "dept",   icon: <Folder size={14} color="#666" />,       label: "Transferir departamento", onClick: () => { setBulkAction("dept"); } },
                      { key: "auto",   icon: <Zap size={14} color="#666" />,          label: "Executar automação", onClick: () => { setAutoModalConvs([...selectedConvs]); } },
                    ].map(item => {
                      const disabled = !selectionMode || selectedConvs.length === 0;
                      return (
                        <button key={item.key} disabled={disabled} onClick={() => { item.onClick(); setBulkMenuOpen(false); }} style={bulkItemStyle(disabled)}>
                          {item.icon} {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {selectionMode && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "#F8F8F8", borderBottom: "1px solid #EEEEEE", flexShrink: 0 }}>
            <button onClick={toggleSelectAll} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#128A68" }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid " + (allVisibleSelected ? "#128A68" : "#CCC"), background: allVisibleSelected ? "#128A68" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {allVisibleSelected && <Check size={11} color="#FFF" />}
              </div>
              {allVisibleSelected ? "Desmarcar todas" : "Selecionar todas"}
            </button>
            <button onClick={() => { setSelectionMode(false); setSelectedConvs([]); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#888" }}>Sair</button>
          </div>
        )}

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
            const selected = selectedConvs.includes(c.id);
            return (
              <div
                key={c.id}
                onClick={() => { if (selectionMode) { toggleConvSelected(c.id); return; } setActiveId(c.id); updateCs(c.id, { read: true }); }}
                style={{ padding: "12px 16px", borderBottom: "1px solid #F0F0F0", background: (selectionMode && selected) ? "#E8F5F0" : isActive ? "#E1F5EE" : "transparent", borderLeft: isActive ? "3px solid #128A68" : "3px solid transparent", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}
                onMouseEnter={e => { if (!isActive && !(selectionMode && selected)) e.currentTarget.style.background = "#F9F9F9"; }}
                onMouseLeave={e => { if (!isActive && !(selectionMode && selected)) e.currentTarget.style.background = "transparent"; }}
              >
                {selectionMode && (
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: "2px solid " + (selected ? "#128A68" : "#CCC"), background: selected ? "#128A68" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {selected && <Check size={12} color="#FFF" />}
                  </div>
                )}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <ConvAvatar name={convName(c)} avatarUrl={convAvatars[c.phone?.replace(/\D/g, "") ?? ""]} size={36} fontSize={12} onError={() => refetchAvatar(c.phone, c.instanceId)} />
                  <ChannelBadge channel={c.channel} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: unread ? 700 : 600, color: isActive ? "#128A68" : "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{convName(c)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: "#AAA" }}>{c.time}</span>
                      {unread && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#128A68" }} />}
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: unread ? "#535353" : "#AAA", fontWeight: unread ? 500 : 400, margin: "2px 0 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{previewText(c)}</p>
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
      <section style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: "hsl(var(--background))", minWidth: 0 }}>
        {active && cs ? (
          <>
            {/* header */}
            <div style={{ minHeight: 52, background: "#FFF", borderBottom: "1px solid #E5E5E5", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ConvAvatar name={convName(active)} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={32} fontSize={11} onError={() => refetchAvatar(active.phone, active.instanceId)} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{convName(active)}</div>
                  <div style={{ fontSize: 11, color: "#AAA", display: "flex", alignItems: "center", gap: 4 }}>
                    <Filter size={10} />
                    {linkedPipeline?.name || active.pipeline || "Pipeline Comercial"}
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
                      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 220, zIndex: 50, overflow: "hidden" }}>
                        {instances.length > 0 ? (
                          <>
                            <div style={{ padding: "8px 12px 4px", fontSize: 10, color: "#AAA", fontWeight: 700, letterSpacing: 0.5 }}>INSTÂNCIAS CONECTADAS</div>
                            {instances.map(inst => (
                              <button key={inst.instanceId} onClick={() => switchActiveInstance(inst.instanceId)}
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
                            <div style={{ borderTop: "1px solid #F0F0F0", padding: "8px 12px" }}>
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
                    <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", right: 0, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 160, zIndex: 50, overflow: "hidden" }}>
                      {[
                        { label: "Transferir", action: () => { setShowTransferDialog(true); setMoreMenuOpen(false); } },
                        { label: "Arquivar", action: () => { updateCs(activeId, { finished: true }); toast("Conversa arquivada"); setMoreMenuOpen(false); } },
                        { label: "Abrir perfil", action: () => {
                          setMoreMenuOpen(false);
                          const leadId = effectiveLead?.id;
                          if (leadId) navigate(`/pipeline/lead/${leadId}`);
                          else toast.error("Esta conversa não está vinculada a um lead.");
                        } },
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
                    if (m.kind === "system") {
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0" }}>
                          <div style={{ flex: 1, height: 0.5, background: "#E0E0E0" }} />
                          <span style={{ fontSize: 11, color: "#888", background: "#F0F0F0", border: "1px solid #E0E0E0", borderRadius: 100, padding: "4px 12px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                            <UserCheck size={11} color="#888" />
                            {m.text}
                            <span style={{ color: "#BBB", marginLeft: 2 }}>· {m.time}</span>
                          </span>
                          <div style={{ flex: 1, height: 0.5, background: "#E0E0E0" }} />
                        </div>
                      );
                    }
                    const isAgent = m.from === "agent";
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: isAgent ? "flex-end" : "flex-start", marginBottom: 12 }}>
                        {!isAgent && (
                          <ConvAvatar name={convName(active)} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={28} fontSize={10} style={{ marginRight: 8 }} />
                        )}
                        <div style={{ maxWidth: "65%" }}>
                          <div style={{ fontSize: 11, color: "#AAA", marginBottom: 2, textAlign: isAgent ? "right" : "left" }}>
                            {isAgent ? `${m.agent} • ${m.time}` : `${convName(active)} • ${m.time}`}
                          </div>
                          <div style={{ padding: m.kind === "image" ? 4 : "10px 14px", borderRadius: isAgent ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: isAgent ? "#128A68" : "#FFF", color: isAgent ? "#FFF" : "#111", border: isAgent ? "none" : "1px solid #EEE", boxShadow: isAgent ? "none" : "0 1px 2px rgba(0,0,0,0.06)", fontSize: 14, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
                            {m.kind === "text"  && <><span style={{ flex: 1 }}>{m.text}</span>{isAgent && <CheckCheck size={14} color={m.read ? "#FFF" : "rgba(255,255,255,0.5)"} />}</>}
                            {m.kind === "audio" && <AudioBubble duration={m.duration} src={m.src} light={isAgent} />}
                            {m.kind === "image" && (
                              <div style={{ overflow: "hidden", borderRadius: 12 }}>
                                {m.src ? (
                                  <img src={m.src} alt={m.caption ?? "imagem"} style={{ maxWidth: 220, maxHeight: 180, display: "block", objectFit: "cover" }} />
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px" }}>
                                    <ImageIcon size={18} color={isAgent ? "rgba(255,255,255,0.8)" : "#128A68"} />
                                    <span style={{ fontSize: 13 }}>{m.caption || "Imagem"}</span>
                                  </div>
                                )}
                                {m.src && m.caption && <div style={{ padding: "4px 8px 6px", fontSize: 12, color: isAgent ? "rgba(255,255,255,0.8)" : "#666" }}>{m.caption}</div>}
                              </div>
                            )}
                            {m.kind === "file" && (
                              // Com URL, a bolha inteira é um link de download; sem URL
                              // (mensagens antigas, sem media_url) mantém só o visual.
                              m.url ? (
                                <a
                                  href={m.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={m.filename}
                                  title={`Baixar ${m.filename}`}
                                  style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none", cursor: "pointer" }}
                                >
                                  <div style={{ width: 36, height: 36, borderRadius: 8, background: isAgent ? "rgba(255,255,255,0.2)" : "#F0F0F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <Download size={18} color={isAgent ? "#FFF" : "#128A68"} />
                                  </div>
                                  <span style={{ fontSize: 13, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "underline" }}>{m.filename}</span>
                                </a>
                              ) : (
                                <div title="Arquivo indisponível para download" style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 8, background: isAgent ? "rgba(255,255,255,0.2)" : "#F0F0F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <FolderOpen size={18} color={isAgent ? "#FFF" : "#128A68"} />
                                  </div>
                                  <span style={{ fontSize: 13, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.filename}</span>
                                </div>
                              )
                            )}
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
            <div style={{ background: "#FFF", borderTop: "1px solid #E5E5E5", padding: "8px 16px", flexShrink: 0, position: "relative" }}>
              {/* painel de emojis */}
              {showEmoji && (
                <div style={{ position: "absolute", bottom: "100%", left: 16, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", padding: 10, zIndex: 100, width: 280 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {EMOJIS.map(e => (
                      <button key={e} onClick={() => insertEmoji(e)}
                        style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 4px", borderRadius: 6, lineHeight: 1 }}
                        onMouseEnter={ev => (ev.currentTarget.style.background = "#F5F5F5")}
                        onMouseLeave={ev => (ev.currentTarget.style.background = "none")}
                      >{e}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* painel de arquivos da conversa */}
              {showFiles && (
                <div style={{ position: "absolute", bottom: "100%", left: 16, right: 16, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", padding: 16, zIndex: 100 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Arquivos da conversa</span>
                    <button onClick={() => setShowFiles(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><X size={14} color="#AAA" /></button>
                  </div>
                  {cs?.messages.filter(m => m.kind === "image" || m.kind === "file").length === 0 ? (
                    <div style={{ textAlign: "center", color: "#AAA", fontSize: 13, padding: "16px 0" }}>Nenhum arquivo nesta conversa</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {cs.messages.filter(m => m.kind === "image" || m.kind === "file").map(m => (
                        m.kind === "image" ? (
                          <img key={m.id} src={m.src} alt={m.caption} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, cursor: "pointer" }} onClick={() => window.open(m.src)} />
                        ) : (
                          // Com URL, o chip abre/baixa o arquivo; sem URL, só exibe o nome
                          (m as { url?: string }).url ? (
                            <a key={m.id} href={(m as { url?: string }).url} target="_blank" rel="noopener noreferrer" download={(m as { filename: string }).filename} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F5F5F5", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "inherit", textDecoration: "none", cursor: "pointer" }}>
                              <Download size={14} color="#128A68" />
                              <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "underline" }}>{(m as { filename: string }).filename}</span>
                            </a>
                          ) : (
                            <div key={m.id} title="Arquivo indisponível para download" style={{ display: "flex", alignItems: "center", gap: 6, background: "#F5F5F5", borderRadius: 8, padding: "6px 10px", fontSize: 12, opacity: 0.7 }}>
                              <FolderOpen size={14} color="#128A68" />
                              <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(m as { filename: string }).filename}</span>
                            </div>
                          )
                        )
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* input de arquivo (oculto) */}
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" style={{ display: "none" }} onChange={handleFileSelect} />

              {/* toolbar de ações */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
                <span title="Anexar arquivo" onClick={handleAttachClick} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                  <Paperclip size={18} color={cs.finished ? "#DDD" : "#AAA"} />
                </span>
                <span title="Agendar atividade" onClick={() => { if (!cs.finished) { setShowScheduleDialog(true); setShowEmoji(false); setShowFiles(false); } }} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                  <CalendarIcon size={18} color={cs.finished ? "#DDD" : "#AAA"} />
                </span>
                <span title="Arquivos da conversa" onClick={() => { setShowFiles(v => !v); setShowEmoji(false); }} style={{ display: "inline-flex", cursor: "pointer" }}>
                  <FolderOpen size={18} color={showFiles ? "#128A68" : "#AAA"} />
                </span>
                <span title="Emoji" onClick={() => { if (!cs.finished) { setShowEmoji(v => !v); setShowFiles(false); } }} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                  <Smile size={18} color={showEmoji ? "#128A68" : (cs.finished ? "#DDD" : "#AAA")} />
                </span>
                <span title={recording ? "Gravando… clique para parar" : "Gravar áudio"} onClick={() => { if (!cs.finished) { if (recording) stopRecording(); else startRecording(); } }} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                  <Mic size={18} color={recording ? "#E53E3E" : (cs.finished ? "#DDD" : "#AAA")} />
                </span>
                <button
                  onClick={suggestAI}
                  disabled={cs.finished || aiLoading}
                  title="Sugestão de resposta com IA"
                  style={{ background: "#E1F5EE", borderRadius: 6, padding: 4, display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer", border: "none", opacity: aiLoading ? 0.6 : 1 }}
                >
                  <Sparkles size={16} color="#128A68" style={{ animation: aiLoading ? "spin 1s linear infinite" : "none" }} />
                </button>
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <span title="Mensagens rápidas" onClick={() => { if (!cs.finished) { setQmPickerOpen(v => !v); setShowEmoji(false); setShowFiles(false); } }} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                    <Zap size={18} color={qmPickerOpen ? "#128A68" : (cs.finished ? "#DDD" : "#AAA")} />
                  </span>
                  {qmPickerOpen && (
                    <>
                      <div onClick={() => setQmPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 280, maxHeight: 260, overflowY: "auto", background: "#FFF", border: "1px solid #EEEEEE", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.16)", zIndex: 41, padding: 6 }}>
                        {qmList.length === 0 ? (
                          <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "#AAA" }}>Nenhuma mensagem rápida.<br />Crie em Configurações.</div>
                        ) : qmList.map(q => (
                          <button key={q.id} onClick={() => insertQuickMessage(q)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "8px 10px", borderRadius: 8, display: "block" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.title}</span>
                              {q.shortcut && <span style={{ fontSize: 10, fontWeight: 600, color: "#128A68", background: "#E1F5EE", borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>{q.shortcut}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{q.content}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* linha de entrada */}
              {recording ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, height: 36 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E53E3E", animation: "pulse 1s ease-in-out infinite" }} />
                  <span style={{ fontSize: 13, color: "#E53E3E", fontVariantNumeric: "tabular-nums" }}>
                    {String(Math.floor(recordingTime / 60)).padStart(2, "0")}:{String(recordingTime % 60).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 13, color: "#AAA", flex: 1 }}>Gravando áudio…</span>
                  <button onClick={cancelRecording} style={{ background: "none", border: "1px solid #E5E5E5", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#666", cursor: "pointer" }}>Cancelar</button>
                  <button onClick={stopRecording} style={{ background: "#128A68", border: "none", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#FFF", fontWeight: 600, cursor: "pointer" }}>Enviar</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                  {shortcutSuggestions.length > 0 && (
                    <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, width: 300, maxHeight: 220, overflowY: "auto", background: "#FFF", border: "1px solid #EEEEEE", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.16)", zIndex: 41, padding: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 8px 6px" }}>Mensagens rápidas · Tab para inserir</div>
                      {shortcutSuggestions.map(q => (
                        <button key={q.id} onMouseDown={e => { e.preventDefault(); expandShortcut(q); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "8px 10px", borderRadius: 8, display: "block" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "#128A68", background: "#E1F5EE", borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>{q.shortcut}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.title}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{q.content}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => {
                      if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey && shortcutSuggestions.length > 0) {
                        e.preventDefault();
                        const v = inputValue.trim().toLowerCase();
                        const exact = shortcutSuggestions.find(q => q.shortcut?.toLowerCase() === v);
                        expandShortcut(exact ?? shortcutSuggestions[0]);
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); setShowEmoji(false); }
                    }}
                    placeholder={cs.finished ? "Conversa finalizada — reabra para responder" : "Mensagem..."}
                    disabled={cs.finished}
                    style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "#111", padding: "4px 0", fontFamily: "inherit", opacity: cs.finished ? 0.5 : 1 }}
                  />
                  <button
                    onClick={() => { sendMessage(); setShowEmoji(false); }}
                    disabled={!inputValue.trim() || cs.finished}
                    style={{ background: inputValue.trim() && !cs.finished ? "#128A68" : "#E5E5E5", border: "none", borderRadius: 8, padding: "6px 10px", cursor: inputValue.trim() && !cs.finished ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                  >
                    <Send size={16} color={inputValue.trim() && !cs.finished ? "#FFF" : "#AAA"} />
                  </button>
                </div>
              )}
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
      <aside style={{ width: 300, minWidth: 300, height: "100vh", borderLeft: "1px solid #E5E5E5", overflowY: "auto", background: "#FFF" }}>
        {active && cs && (
          <>
            {/* HEADER */}
            <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ConvAvatar name={convName(active)} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={40} fontSize={13} onError={() => refetchAvatar(active.phone, active.instanceId)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{convName(active)}</span>
                    <ExternalLink size={12} color="#AAA" style={{ cursor: "pointer" }} onClick={() => navigate(effectiveLead ? `/leads?lead=${effectiveLead.id}` : "/leads")} />
                  </div>
                  {/* Tags inline + picker */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 5 }}>
                    {convTags.slice(0, 4).map(tagName => {
                      const tag = crmTags.find(t => t.name === tagName);
                      return (
                        <span
                          key={tagName}
                          onClick={() => toggleConvTag(tagName)}
                          style={{ background: tag?.color ? `${tag.color}20` : "#F5F5F5", color: tag?.color || "#666", border: `1px solid ${tag?.color || "#E5E5E5"}`, borderRadius: 100, padding: "2px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          {tagName}
                        </span>
                      );
                    })}
                    {convTags.length > 4 && (
                      <span style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>+{convTags.length - 4}</span>
                    )}
                    {/* Botão "+" */}
                    <div style={{ position: "relative" }}>
                      <button
                        ref={tagBtnRef}
                        onClick={() => {
                          if (!showTagPicker) {
                            const r = tagBtnRef.current?.getBoundingClientRect();
                            if (r) setTagPickerPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                          }
                          setShowTagPicker(v => !v);
                          setTagSearch("");
                        }}
                        style={{ width: 18, height: 18, borderRadius: "50%", background: "#F0F0F0", border: "1px solid #E0E0E0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, color: "#888" }}
                      >
                        <Plus size={10} />
                      </button>

                      {showTagPicker && (
                        <div ref={tagPickerRef} style={{ position: "fixed", top: tagPickerPos.top, right: tagPickerPos.right, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", width: 220, zIndex: 9999, overflow: "hidden" }}>
                          <div style={{ padding: "8px 10px", borderBottom: "1px solid #F0F0F0" }}>
                            <input
                              value={tagSearch}
                              onChange={e => setTagSearch(e.target.value)}
                              placeholder="Pesquisar..."
                              autoFocus
                              style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "#111", background: "transparent" }}
                            />
                          </div>
                          <div style={{ maxHeight: 200, overflowY: "auto" }}>
                            {crmTags
                              .filter(t => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                              .map(tag => {
                                const isActive = convTags.includes(tag.name);
                                return (
                                  <button
                                    key={tag.id}
                                    onClick={() => toggleConvTag(tag.name)}
                                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: isActive ? "#F9FAFB" : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                                  >
                                    {isActive
                                      ? <Check size={13} color="#128A68" />
                                      : <div style={{ width: 13 }} />}
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: tag.color, display: "inline-block", flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, color: "#111", fontWeight: isActive ? 600 : 400 }}>{tag.name}</span>
                                  </button>
                                );
                              })}
                            {crmTags.filter(t => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && (
                              <div style={{ padding: "10px 12px", fontSize: 12, color: "#AAA" }}>Nenhuma tag encontrada</div>
                            )}
                          </div>
                          <div style={{ padding: "8px 12px", borderTop: "1px solid #F0F0F0", textAlign: "right" }}>
                            <button onClick={() => { navigate("/configuracoes"); setShowTagPicker(false); }} style={{ fontSize: 12, color: "#128A68", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
                              Criar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Listas inline + picker */}
                {(() => {
                  const linkedLead = resolveLeadForConv(active);
                  const convLists = crmLists.filter(l => linkedLead && l.leadIds.includes(linkedLead.id));
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 4 }}>
                      {convLists.slice(0, 3).map(lst => (
                        <span
                          key={lst.id}
                          onClick={() => toggleConvList(lst.id)}
                          style={{ background: "#E1F5EE", color: "#128A68", border: "1px solid #128A6820", borderRadius: 100, padding: "2px 7px", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
                        >
                          <List size={9} />{lst.name}
                        </span>
                      ))}
                      {convLists.length > 3 && <span style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>+{convLists.length - 3}</span>}
                      <div style={{ position: "relative" }}>
                        <button
                          ref={listBtnRef}
                          onClick={() => {
                            if (!showListPicker) {
                              const r = listBtnRef.current?.getBoundingClientRect();
                              if (r) setListPickerPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                            }
                            setShowListPicker(v => !v);
                            setListSearch("");
                          }}
                          style={{ width: 18, height: 18, borderRadius: "50%", background: "#F0F0F0", border: "1px solid #E0E0E0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, color: "#888" }}
                        ><Plus size={10} /></button>
                        {showListPicker && (
                          <div ref={listPickerRef} style={{ position: "fixed", top: listPickerPos.top, right: listPickerPos.right, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", width: 220, zIndex: 9999, overflow: "hidden" }}>
                            <div style={{ padding: "8px 10px", borderBottom: "1px solid #F0F0F0" }}>
                              <input
                                value={listSearch}
                                onChange={e => setListSearch(e.target.value)}
                                placeholder="Pesquisar lista..."
                                autoFocus
                                style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "#111", background: "transparent" }}
                              />
                            </div>
                            <div style={{ maxHeight: 200, overflowY: "auto" }}>
                              {crmLists
                                .filter(l => !listSearch || l.name.toLowerCase().includes(listSearch.toLowerCase()))
                                .map(lst => {
                                  const inList = linkedLead ? lst.leadIds.includes(linkedLead.id) : false;
                                  return (
                                    <button
                                      key={lst.id}
                                      onClick={() => toggleConvList(lst.id)}
                                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: inList ? "#F9FAFB" : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                                    >
                                      {inList ? <Check size={13} color="#128A68" /> : <div style={{ width: 13 }} />}
                                      <List size={13} color="#128A68" />
                                      <span style={{ fontSize: 13, color: "#111", fontWeight: inList ? 600 : 400 }}>{lst.name}</span>
                                    </button>
                                  );
                                })}
                              {crmLists.filter(l => !listSearch || l.name.toLowerCase().includes(listSearch.toLowerCase())).length === 0 && (
                                <div style={{ padding: "10px 12px", fontSize: 12, color: "#AAA" }}>Nenhuma lista encontrada</div>
                              )}
                            </div>
                            <div style={{ padding: "8px 12px", borderTop: "1px solid #F0F0F0", textAlign: "right" }}>
                              <button onClick={() => { navigate("/configuracoes"); setShowListPicker(false); }} style={{ fontSize: 12, color: "#128A68", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
                                Criar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => { setShowNegocioForm(v => !v); if (!negocioPipelineId && pipelines?.[0]) setNegocioPipelineId(pipelines[0].id); if (!negocioName) setNegocioName(active.name); }}
                  style={{ flex: 1, background: showNegocioForm ? "#E1F5EE" : "#F5F5F5", border: showNegocioForm ? "1px solid #128A68" : "none", borderRadius: 8, padding: "6px 10px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
                  onMouseLeave={e => (e.currentTarget.style.background = showNegocioForm ? "#E1F5EE" : "#F5F5F5")}
                ><Plus size={12} /> {effectiveLead ? "Negócio" : "Lead"}</button>
                <button
                  onClick={() => { if (activeId) setAutoModalConvs([activeId]); }}
                  style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "6px 10px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F5F5F5")}
                ><Zap size={12} /> Automação</button>
                <button
                  onClick={e => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setListPickerPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                    setShowListPicker(v => !v);
                    setListSearch("");
                  }}
                  style={{ flex: 1, background: showListPicker ? "#E1F5EE" : "#F5F5F5", border: showListPicker ? "1px solid #128A68" : "none", borderRadius: 8, padding: "6px 10px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
                  onMouseLeave={e => (e.currentTarget.style.background = showListPicker ? "#E1F5EE" : "#F5F5F5")}
                ><List size={12} /> Lista</button>
                <button
                  onClick={() => setShowScheduleDialog(true)}
                  style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "6px 10px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F5F5F5")}
                ><CalendarDays size={12} /> Agendar</button>
              </div>

              {/* Atendente responsável */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "7px 10px", background: "#F5F5F5", borderRadius: 8 }}>
                <UserCheck size={13} color="#128A68" />
                <span style={{ fontSize: 12, color: "#666" }}>Atendente:</span>
                {cs.assignedTo ? (
                  <>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: memberColors[cs.assignedTo] ?? colorFromString(cs.assignedTo), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
                      {initials(cs.assignedTo)}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#111", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cs.assignedTo}</span>
                    <button
                      onClick={() => setShowTransferDialog(true)}
                      style={{ background: "none", border: "none", fontSize: 11, color: "#128A68", fontWeight: 600, cursor: "pointer", padding: 0, flexShrink: 0 }}
                    >Transferir</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: "#AAA", flex: 1 }}>Sem atendente</span>
                    <button
                      onClick={() => setShowTransferDialog(true)}
                      style={{ background: "none", border: "none", fontSize: 11, color: "#128A68", fontWeight: 600, cursor: "pointer", padding: 0, flexShrink: 0 }}
                    >Atribuir</button>
                  </>
                )}
              </div>

              {/* Painel: + Negócio / + Lead */}
              {showNegocioForm && (effectiveLead ? (
                <div style={{ marginTop: 12, background: "#F9FBFA", border: "1px solid #E5E5E5", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 2 }}>Novo negócio</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>Nome</label>
                    <input
                      value={negocioName}
                      onChange={e => setNegocioName(e.target.value)}
                      placeholder={convName(active)}
                      style={{ border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", color: "#111", background: "#FFF" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>Pipeline</label>
                    <select
                      value={negocioPipelineId}
                      onChange={e => setNegocioPipelineId(e.target.value)}
                      style={{ border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", color: "#111", background: "#FFF", cursor: "pointer" }}
                    >
                      <option value="">Selecione...</option>
                      {(pipelines ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>Valor (opcional)</label>
                    <input
                      value={negocioValue}
                      onChange={e => setNegocioValue(e.target.value)}
                      placeholder="R$ 0,00"
                      style={{ border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", color: "#111", background: "#FFF" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
                    <button onClick={() => setShowNegocioForm(false)} style={{ background: "transparent", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#666", cursor: "pointer" }}>Cancelar</button>
                    <button
                      onClick={handleCreateNegocio}
                      disabled={negocioLoading || !negocioPipelineId}
                      style={{ background: negocioLoading || !negocioPipelineId ? "#AAA" : "#128A68", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#FFF", cursor: negocioLoading || !negocioPipelineId ? "not-allowed" : "pointer" }}
                    >{negocioLoading ? "Criando…" : "Criar negócio"}</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12, background: "#F9FBFA", border: "1px solid #E5E5E5", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 2 }}>Novo lead</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>Nome</label>
                    <input
                      value={negocioName}
                      onChange={e => setNegocioName(e.target.value)}
                      placeholder={convName(active)}
                      style={{ border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", color: "#111", background: "#FFF" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>Telefone</label>
                    <input
                      value={active.phone ?? ""}
                      readOnly
                      style={{ border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", color: "#666", background: "#F0F0F0" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
                    <button onClick={() => setShowNegocioForm(false)} style={{ background: "transparent", border: "1px solid #E5E5E5", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#666", cursor: "pointer" }}>Cancelar</button>
                    <button
                      onClick={handleCreateLead}
                      disabled={negocioLoading}
                      style={{ background: negocioLoading ? "#AAA" : "#128A68", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#FFF", cursor: negocioLoading ? "not-allowed" : "pointer" }}
                    >{negocioLoading ? "Criando…" : "Criar lead"}</button>
                  </div>
                </div>
              ))}

            </div>

            {/* ETAPA NO PIPELINE */}
            <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 6 }}>ETAPA ATUAL</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{activeStages[activeStageIdx] ?? "—"}</div>
              <div style={{ fontSize: 12, color: "#AAA", marginBottom: 14 }}>{linkedPipeline?.name || active.pipeline || "—"}</div>

              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ position: "absolute", top: "50%", left: 5, right: 5, height: 2, background: "#E5E5E5", transform: "translateY(-50%)" }} />
                <div style={{ position: "absolute", top: "50%", left: 5, width: `calc(${(activeStageIdx / Math.max(activeStages.length - 1, 1)) * 100}% - 10px)`, height: 2, background: "#128A68", transform: "translateY(-50%)" }} />
                {activeStages.map((_, i) => {
                  let bg = "#E5E5E5";
                  if (i < activeStageIdx) bg = "rgba(18,138,104,0.3)";
                  if (i === activeStageIdx) bg = "#128A68";
                  return <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: bg, position: "relative", zIndex: 1 }} />;
                })}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    if (activeStageIdx > 0) {
                      const newIdx = activeStageIdx - 1;
                      if (pipelineCols.length > 0 && effectiveLead) moveLead(effectiveLead.id, effectiveLead.stage, pipelineCols[newIdx].id, 0);
                      updateCs(activeId, { stageIdx: newIdx });
                    }
                  }}
                  disabled={activeStageIdx === 0}
                  style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "8px", color: "#666", fontSize: 12, fontWeight: 600, cursor: activeStageIdx === 0 ? "not-allowed" : "pointer", opacity: activeStageIdx === 0 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                ><ArrowLeft size={12} /> Voltar</button>
                <button
                  onClick={() => {
                    if (activeStageIdx < activeStages.length - 1) {
                      const newIdx = activeStageIdx + 1;
                      if (pipelineCols.length > 0 && effectiveLead) moveLead(effectiveLead.id, effectiveLead.stage, pipelineCols[newIdx].id, 0);
                      updateCs(activeId, { stageIdx: newIdx });
                      toast.success(`Lead movido para ${activeStages[newIdx]} ✓`);
                    }
                  }}
                  disabled={activeStageIdx === activeStages.length - 1}
                  style={{ flex: 1, background: "#128A68", border: "none", borderRadius: 8, padding: "8px", color: "#FFF", fontSize: 12, fontWeight: 600, cursor: activeStageIdx === activeStages.length - 1 ? "not-allowed" : "pointer", opacity: activeStageIdx === activeStages.length - 1 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                >Avançar <ArrowRight size={12} /></button>
              </div>

              <div style={{ fontSize: 11, color: "#AAA", marginTop: 12, marginBottom: 4 }}>ou escolha a etapa diretamente</div>
              <select
                value={activeStages[activeStageIdx] ?? ""}
                onChange={e => {
                  const idx = activeStages.indexOf(e.target.value);
                  if (idx >= 0) {
                    if (pipelineCols.length > 0 && effectiveLead) moveLead(effectiveLead.id, effectiveLead.stage, pipelineCols[idx].id, 0);
                    updateCs(activeId, { stageIdx: idx });
                    toast.success(`Lead movido para ${e.target.value} ✓`);
                  }
                }}
                style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#111", background: "#FFF", outline: "none", cursor: "pointer" }}
              >
                {activeStages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* PRÓXIMA ATIVIDADE */}
            {(() => {
              const ll = resolveLeadForConv(active);
              const now = new Date();
              const nextAct = ll?.activities
                .filter(a => a.scheduledAt && !a.completedAt && !a.noShowAt && new Date(a.scheduledAt) >= now)
                .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];
              const TYPE_LABEL: Record<string, string> = { meeting: "Reunião", call: "Ligação", whatsapp: "WhatsApp", follow_up: "Follow-up", task: "Tarefa" };
              return (
                <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 8 }}>PRÓXIMA ATIVIDADE</div>
                  {nextAct ? (
                    <div style={{ background: "#F9FBFA", border: "1px solid #E5E5E5", borderRadius: 10, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <CalendarIcon size={14} color="#128A68" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
                          {new Date(nextAct.scheduledAt!).toLocaleDateString("pt-BR")} às {new Date(nextAct.scheduledAt!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {nextAct.userName && <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Responsável: {nextAct.userName}</div>}
                      <span style={{ display: "inline-block", background: "#E1F5EE", color: "#128A68", fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, marginBottom: 6 }}>{TYPE_LABEL[nextAct.type] ?? nextAct.type}</span>
                      {nextAct.title && <div style={{ fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 4 }}>{nextAct.title}</div>}
                      {nextAct.description && <div style={{ fontSize: 12, color: "#666" }}>{nextAct.description}</div>}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: "#AAA", marginBottom: 8 }}>Sem atividades agendadas</div>
                      <button
                        onClick={() => setShowScheduleDialog(true)}
                        style={{ background: "#E1F5EE", border: "none", color: "#128A68", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#c8efe3")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#E1F5EE")}
                      ><Plus size={12} /> Agendar atividade</button>
                    </>
                  )}
                </div>
              );
            })()}

            {/* SEÇÕES EXPANSÍVEIS */}
            <Section title="Perfil" defaultOpen>
              {[
                ["Nome",     effectiveLead?.name    || active.name],
                ["E-mail",   effectiveLead?.email   || active.email   || "—"],
                ["Telefone", effectiveLead?.whatsapp || active.phone   || "—"],
                ["Empresa",  effectiveLead?.company || active.company || "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                  <span style={{ fontSize: 12, color: "#AAA" }}>{k}</span>
                  <span style={{ color: "#111", textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </Section>

            <Section title="Anotações">
              <textarea
                placeholder="Adicionar anotação..."
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote(); } }}
                style={{ width: "100%", background: "#F5F5F5", borderRadius: 8, padding: 10, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", minHeight: 80, resize: "vertical" }}
              />
              <button
                onClick={addNote}
                disabled={!noteDraft.trim()}
                style={{ marginTop: 6, width: "100%", padding: "8px 0", borderRadius: 8, border: "none", background: noteDraft.trim() ? "#128A68" : "#E5E5E5", color: noteDraft.trim() ? "#FFF" : "#AAA", fontSize: 13, fontWeight: 600, cursor: noteDraft.trim() ? "pointer" : "default" }}
              >
                Adicionar anotação
              </button>
              {!effectiveLead && (
                <div style={{ fontSize: 11, color: "#C2410C", marginTop: 6 }}>
                  Vincule esta conversa a um negócio para registrar anotações.
                </div>
              )}
              {effectiveLead && (() => {
                const notes = (effectiveLead.activities ?? [])
                  .filter(a => a.type === "note")
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5);
                if (notes.length === 0) return null;
                return (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {notes.map(n => (
                      <div key={n.id} style={{ background: "#FFF", border: "1px solid #EEE", borderRadius: 8, padding: "8px 10px" }}>
                        <div
                          style={{ fontSize: 12, color: "#333", lineHeight: 1.5, wordBreak: "break-word" }}
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(n.description) }}
                        />
                        <div style={{ fontSize: 10, color: "#AAA", marginTop: 4 }}>
                          {n.userName ? `${n.userName} · ` : ""}{new Date(n.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Section>

            <Section title="Negócio vinculado" defaultOpen>
              <div style={{ border: "1px solid #E5E5E5", borderRadius: 10, padding: 12, cursor: "pointer" }}
                onClick={() => navigate("/pipeline")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <ConvAvatar name={convName(active)} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={28} fontSize={10} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{convName(active)}</div>
                    <div style={{ fontSize: 11, color: "#AAA" }}>{active.company || "Sem empresa"}</div>
                  </div>
                </div>
                {active.value ? (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#128A68", marginBottom: 4 }}>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(active.value)}
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{linkedPipeline?.name || active.pipeline || "—"}</div>
                <div style={{ height: 4, background: "#F0F0F0", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${((activeStageIdx + 1) / Math.max(activeStages.length, 1)) * 100}%`, height: "100%", background: "#128A68" }} />
                </div>
                <div style={{ fontSize: 11, color: "#128A68", fontWeight: 600 }}>{active.dealNumber || `#${active.id.padStart(4, "0")}`}</div>
              </div>
            </Section>
          </>
        )}
      </aside>

      {/* ── DIALOG: transferir atendimento ──────────────────────────── */}
      <TransferDialog
        open={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        onTransfer={handleTransfer}
        teamMembers={teamMembers}
        memberEmails={memberEmails}
        memberAvatars={memberAvatars}
        memberColors={memberColors}
        currentAssignee={cs?.assignedTo}
      />

      {/* ── MODAL: configurações multiatendimento ───────────────────── */}
      {showMultiSettings && (
        <div
          onClick={() => setShowMultiSettings(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#FFF", borderRadius: 16, width: 860, height: 570, display: "flex", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.22)" }}
          >
            {/* sidebar */}
            <div style={{ width: 180, background: "#F8F8F8", borderRight: "1px solid #EEEEEE", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid #EEEEEE" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Multiatendimento</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Configurações</div>
              </div>
              {(["config", "dept", "agents", "quick"] as const).map((tab, i) => {
                const labels = ["Configurações", "Departamento", "Atendentes", "Mensagens rápidas"];
                const active2 = settingsTab === tab;
                return (
                  <button key={tab} onClick={() => setSettingsTab(tab)} style={{ background: active2 ? "#E8F5F0" : "transparent", border: "none", cursor: "pointer", padding: "11px 16px", textAlign: "left", fontSize: 13, fontWeight: active2 ? 600 : 400, color: active2 ? "#128A68" : "#444", borderLeft: active2 ? "3px solid #128A68" : "3px solid transparent", transition: "all 0.15s" }}>
                    {labels[i]}
                  </button>
                );
              })}
            </div>

            {/* content */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* header */}
              <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #EEEEEE", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>
                    {settingsTab === "config" ? "Configurações" : settingsTab === "dept" ? "Departamentos" : settingsTab === "agents" ? "Atendentes" : "Mensagens rápidas"}
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {settingsTab === "config" ? "Gerencie as configurações de atendimento" : settingsTab === "dept" ? "Organize suas equipes com departamentos" : settingsTab === "agents" ? "Gerencie os atendentes e suas permissões" : "Crie e gerencie mensagens rápidas"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {settingsTab === "dept" && <button onClick={() => setDeptCreateOpen(true)} style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Criar</button>}
                  {settingsTab === "quick" && <button onClick={openNewQuickMessage} style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Nova mensagem</button>}
                  <button onClick={() => setShowMultiSettings(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#AAA" /></button>
                </div>
              </div>

              {/* body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

                {/* ── Configurações ── */}
                {settingsTab === "config" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {/* coluna esquerda */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        { icon: <List size={15} color="#4285F4" />, title: "Departamento padrão", desc: "As conversas por padrão serão iniciadas nesse departamento",
                          value: cfgDefDept, onChange: (v: string) => { setCfgDefDept(v); persistMuSettings({ default_department_id: v || null }); },
                          options: [{ v: "", l: muDepts.length ? "Selecionar" : "Nenhum departamento cadastrado" }, ...muDepts.map(d => ({ v: d.id, l: d.name }))] },
                        { icon: <Clock size={15} color="#4285F4" />, title: "Horário de funcionamento", desc: "Defina o horário padrão de funcionamento dos departamentos",
                          value: cfgHorario, onChange: (v: string) => { setCfgHorario(v); persistMuSettings({ work_schedule_id: v || null }); },
                          options: [{ v: "", l: muSchedules.length ? "Selecionar" : "Nenhum horário cadastrado" }, ...muSchedules.map(s => ({ v: s.id, l: s.name }))] },
                        { icon: <Mic size={15} color="#4285F4" />, title: "Transcrição de áudios", desc: "Defina quando as mensagens de áudio serão transcritas automaticamente",
                          value: cfgTranscricao, onChange: (v: string) => { setCfgTranscricao(v); persistMuSettings({ audio_transcription: v }); },
                          options: [{ v: "desativado", l: "Desativado" }, { v: "sempre", l: "Sempre" }, { v: "atribuido", l: "Apenas quando atribuído" }] },
                      ].map((item, i) => (
                        <div key={i} style={{ background: "#F9FAFB", borderRadius: 12, padding: 14 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E8F0FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.icon}</div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{item.title}</div>
                              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{item.desc}</div>
                            </div>
                          </div>
                          <select value={item.value} onChange={e => item.onChange(e.target.value)} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: item.value ? "#111" : "#AAA", background: "#FFF", outline: "none", cursor: "pointer" }}>
                            {item.options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>

                    {/* coluna direita */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Assinatura */}
                      <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E8F0FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={15} color="#4285F4" /></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>Assinatura obrigatória</div>
                          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Todas as mensagens serão enviadas com a assinatura do atendente</div>
                        </div>
                        <MuToggle checked={cfgAssinatura} onChange={() => { const nv = !cfgAssinatura; setCfgAssinatura(nv); persistMuSettings({ signature_required: nv }); }} />
                      </div>

                      {/* Informações ao finalizar */}
                      <div style={{ background: "#F9FAFB", borderRadius: 12, padding: 14 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E8F0FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><CheckCircle2 size={15} color="#4285F4" /></div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>Informações ao finalizar</div>
                            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Selecione quais informações serão mantidas na conversa após ser finalizada</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          {[
                            { icon: <UserCheck size={13} color="#888" />, label: "Manter atendente na conversa", val: cfgMantAtend, set: setCfgMantAtend, col: "keep_attendant" },
                            { icon: <Folder size={13} color="#888" />, label: "Manter departamento na conversa", val: cfgMantDept, set: setCfgMantDept, col: "keep_department" },
                          ].map((row, i) => (
                            <div key={i}>
                              {i > 0 && <div style={{ height: 1, background: "#EEEEEE", margin: "8px 0" }} />}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{row.icon}<span style={{ fontSize: 12, color: "#444" }}>{row.label}</span></div>
                                <MuToggle checked={row.val} onChange={() => { const nv = !row.val; row.set(nv); persistMuSettings({ [row.col]: nv }); }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Departamento ── */}
                {settingsTab === "dept" && (
                  <DepartmentsManager accent="#128A68" createOpen={deptCreateOpen} setCreateOpen={setDeptCreateOpen} />
                )}

                {/* ── Atendentes ── */}
                {settingsTab === "agents" && (
                  <div style={{ display: "flex", gap: 14, height: 380 }}>
                    {/* lista */}
                    <div style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "7px 10px", marginBottom: 4, flexShrink: 0 }}>
                        <Search size={13} color="#AAA" />
                        <input placeholder="Pesquisar..." value={agentSearch} onChange={e => setAgentSearch(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#111", flex: 1, minWidth: 0 }} />
                      </div>
                      {teamMembers.filter(m => !agentSearch || m.toLowerCase().includes(agentSearch.toLowerCase())).map(m => (
                        <button key={m} onClick={() => setSelectedAgent(m)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", background: selectedAgent === m ? "#E8F5F0" : "#F9F9F9", borderLeft: selectedAgent === m ? "3px solid #128A68" : "3px solid transparent", flexShrink: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: colorFromString(m), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(m)}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m}</div>
                            {memberEmails[m] && <div style={{ fontSize: 10, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{memberEmails[m]}</div>}
                          </div>
                        </button>
                      ))}
                      {teamMembers.length === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: "#CCC", fontSize: 12 }}>Nenhum atendente</div>}
                    </div>

                    {/* detalhe */}
                    <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 12, padding: 16, overflowY: "auto" }}>
                      {selectedAgent ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #EEEEEE" }}>
                            <div style={{ width: 38, height: 38, borderRadius: "50%", background: colorFromString(selectedAgent), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{initials(selectedAgent)}</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{selectedAgent}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{memberEmails[selectedAgent] ?? ""}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Visualização do atendente</div>
                          <div style={{ background: "#D1FAE5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#128A68", marginBottom: 14 }}>
                            O atendente sempre pode ver as conversas atribuídas a ele
                          </div>
                          {[
                            { label: "Permitir ver conversas de outros atendentes", desc: "Permite o atendente ver as conversas com outros atendentes atribuídos" },
                            { label: "Desabilitar conversas sem atendentes", desc: "Não permite ver conversas que não possuem um atendente" },
                          ].map((item, i) => (
                            <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid #EEEEEE", display: "flex", alignItems: "flex-start", gap: 10 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{item.label}</div>
                                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{item.desc}</div>
                              </div>
                              <MuToggle checked={false} onChange={() => toast.info("Em breve")} />
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                          <UserCheck size={28} color="#E5E5E5" />
                          <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>Selecione um atendente</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Mensagens rápidas ── */}
                {settingsTab === "quick" && (() => {
                  const term = qmSearch.trim().toLowerCase();
                  const filtered = term
                    ? qmList.filter(q =>
                        q.title.toLowerCase().includes(term) ||
                        q.content.toLowerCase().includes(term) ||
                        (q.shortcut ?? "").toLowerCase().includes(term))
                    : qmList;
                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
                        <Search size={14} color="#AAA" />
                        <input placeholder="Pesquisar..." value={qmSearch} onChange={e => setQmSearch(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111", flex: 1 }} />
                      </div>
                      {filtered.length === 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 8 }}>
                          <Zap size={32} color="#E5E5E5" />
                          <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>{qmList.length === 0 ? "Nenhuma mensagem rápida criada" : "Nenhum resultado encontrado"}</p>
                          {qmList.length === 0 && <p style={{ fontSize: 12, color: "#CCC", margin: 0 }}>Clique em "Nova mensagem" para criar uma</p>}
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {filtered.map(q => (
                            <div key={q.id} style={{ background: "#F9FAFB", borderRadius: 12, padding: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{q.title}</span>
                                  {q.shortcut && <span style={{ fontSize: 11, fontWeight: 600, color: "#128A68", background: "#E1F5EE", borderRadius: 6, padding: "1px 7px" }}>{q.shortcut}</span>}
                                </div>
                                <div style={{ fontSize: 12, color: "#888", whiteSpace: "pre-wrap", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{q.content}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                <button title="Editar" onClick={() => openEditQuickMessage(q)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}><Pencil size={15} color="#888" /></button>
                                <button title="Excluir" onClick={() => deleteQuickMessage(q)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex" }}><Trash2 size={15} color="#E53E3E" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: criar/editar mensagem rápida ──────────────────────── */}
      {qmModalOpen && (
        <div
          onClick={() => !qmSaving && setQmModalOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 16, width: 440, boxShadow: "0 24px 80px rgba(0,0,0,0.22)", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #EEEEEE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{qmEditing ? "Editar mensagem rápida" : "Nova mensagem rápida"}</div>
              <button onClick={() => !qmSaving && setQmModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#AAA" /></button>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Título</label>
                <input value={qmTitle} onChange={e => setQmTitle(e.target.value)} placeholder="Ex: Saudação inicial" style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "9px 11px", fontSize: 13, color: "#111", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Atalho <span style={{ color: "#AAA", fontWeight: 400 }}>(opcional)</span></label>
                <input value={qmShortcut} onChange={e => setQmShortcut(e.target.value)} placeholder="Ex: /ola" style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "9px 11px", fontSize: 13, color: "#111", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Mensagem</label>
                <textarea value={qmContent} onChange={e => setQmContent(e.target.value)} placeholder="Digite o conteúdo da mensagem..." rows={4} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "9px 11px", fontSize: 13, color: "#111", outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ padding: "14px 22px 18px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setQmModalOpen(false)} disabled={qmSaving} style={{ background: "none", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#666", cursor: "pointer" }}>Cancelar</button>
              <button onClick={saveQuickMessage} disabled={qmSaving} style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: qmSaving ? "default" : "pointer", opacity: qmSaving ? 0.6 : 1 }}>{qmSaving ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PAINEL: filtros avançados ────────────────────────────────── */}
      {filterPanelOpen && (
        <>
          <div onClick={() => setFilterPanelOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 310 }} />
          <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 380, maxWidth: "90vw", background: "#FFF", boxShadow: "-8px 0 40px rgba(0,0,0,0.15)", zIndex: 311, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #EEEEEE", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>Filtros</div>
              <button onClick={() => setFilterPanelOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#AAA" /></button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 22px" }}>
              {renderFilterChecklist("dept", "Departamentos", "Todos", muDepts.map(d => ({ value: d.id, label: d.name })), fltDepts, setFltDepts)}
              {renderFilterChecklist("agents", "Atendentes", "Todos", teamMembers.map(m => ({ value: m, label: m })), fltAgents, setFltAgents)}
              {renderFilterChecklist("inst", "Instâncias", "Todas", instances.map(i => ({ value: i.instanceId, label: i.label })), fltInstances, setFltInstances)}
              {renderFilterChecklist("tags", "Tags", "Todas", crmTags.map(t => ({ value: t.name, label: t.name, color: t.color })), fltTags, setFltTags)}

              {/* Negócio na etapa */}
              <div style={{ borderBottom: "1px solid #F0F0F0", padding: "14px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 8 }}>Negócio na etapa</div>
                <select value={fltPipeline} onChange={e => { setFltPipeline(e.target.value); setFltStages([]); }} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: fltPipeline ? "#111" : "#888", background: "#FFF", cursor: "pointer", outline: "none" }}>
                  <option value="">Todos os pipelines</option>
                  {(pipelines ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {(() => {
                  const po = (pipelines ?? []).find(p => p.id === fltPipeline);
                  if (!po) return null;
                  return (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                      {po.columns.map(col => {
                        const on = fltStages.includes(col.id);
                        return (
                          <button key={col.id} onClick={() => toggleInArray(setFltStages, col.id)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "7px 8px", borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid " + (on ? "#128A68" : "#CCC"), background: on ? "#128A68" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on && <Check size={11} color="#FFF" />}</div>
                            <span style={{ fontSize: 13, color: "#333" }}>{col.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Janela em atendimento */}
              <div style={{ borderBottom: "1px solid #F0F0F0", padding: "14px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 8 }}>Janela em atendimento</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {([["all", "Todos"], ["in", "Dentro de 24h"], ["out", "Fora de 24h"]] as const).map(([v, l]) => {
                    const on = fltWindow === v;
                    return (
                      <button key={v} onClick={() => setFltWindow(v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "7px 8px", borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                        <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid " + (on ? "#128A68" : "#CCC"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#128A68" }} />}</div>
                        <span style={{ fontSize: 13, color: "#333" }}>{l}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Data da última mensagem */}
              <div style={{ borderBottom: "1px solid #F0F0F0", padding: "14px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 8 }}>Data da última mensagem</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>De</label>
                    <input type="date" value={fltDateFrom} onChange={e => setFltDateFrom(e.target.value)} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 9px", fontSize: 12, color: "#111", outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Até</label>
                    <input type="date" value={fltDateTo} onChange={e => setFltDateTo(e.target.value)} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 9px", fontSize: 12, color: "#111", outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Ordem */}
              <div style={{ padding: "14px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 8 }}>Ordem</div>
                <select value={fltOrder} onChange={e => setFltOrder(e.target.value as "recent" | "old" | "name")} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#111", background: "#FFF", cursor: "pointer", outline: "none" }}>
                  <option value="recent">Mais recentes</option>
                  <option value="old">Mais antigas</option>
                  <option value="name">Nome (A–Z)</option>
                </select>
              </div>
            </div>

            <div style={{ padding: "14px 22px", borderTop: "1px solid #EEEEEE", display: "flex", gap: 10, flexShrink: 0 }}>
              <button onClick={clearAdvancedFilters} style={{ flex: 1, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, color: "#666", cursor: "pointer" }}>Limpar filtros</button>
              <button onClick={() => setFilterPanelOpen(false)} style={{ flex: 1, background: "#128A68", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, color: "#FFF", cursor: "pointer" }}>Aplicar filtros</button>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL: ações em massa (transferir atendente/departamento) ──── */}
      {(bulkAction === "agent" || bulkAction === "dept") && (
        <div onClick={() => setBulkAction(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 16, width: 380, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.22)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEEEEE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{bulkAction === "agent" ? "Transferir atendente" : "Transferir departamento"}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{selectedConvs.length} conversa(s) selecionada(s)</div>
              </div>
              <button onClick={() => setBulkAction(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#AAA" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {bulkAction === "agent" && (teamMembers.length === 0
                ? <div style={{ padding: "20px", textAlign: "center", fontSize: 13, color: "#AAA" }}>Nenhum atendente cadastrado</div>
                : teamMembers.map(m => (
                  <button key={m} onClick={() => bulkAssignAgent(m)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: colorFromString(m), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{initials(m)}</div>
                    <span style={{ fontSize: 13, color: "#111" }}>{m}</span>
                  </button>
                )))}
              {bulkAction === "dept" && (muDepts.length === 0
                ? <div style={{ padding: "20px", textAlign: "center", fontSize: 13, color: "#AAA" }}>Nenhum departamento cadastrado</div>
                : muDepts.map(d => (
                  <button key={d.id} onClick={() => bulkAssignDept(d.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left" }} onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                    <Folder size={16} color="#128A68" />
                    <span style={{ fontSize: 13, color: "#111" }}>{d.name}</span>
                  </button>
                )))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: executar automação (manual) ───────────────────────── */}
      {autoModalConvs !== null && (
        <div onClick={() => !runningAutomation && setAutoModalConvs(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 16, width: 400, maxHeight: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.22)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #EEEEEE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Executar automação</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{autoModalConvs.length} conversa(s) · gatilho de execução manual</div>
              </div>
              <button onClick={() => !runningAutomation && setAutoModalConvs(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#AAA" /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {manualAutomations.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center" }}>
                  <Zap size={28} color="#E5E5E5" style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 13, color: "#AAA", margin: "0 0 4px" }}>Nenhuma automação manual ativa</p>
                  <p style={{ fontSize: 12, color: "#CCC", margin: 0 }}>Crie uma automação com o gatilho "Execução manual da automação por lead ou contato".</p>
                </div>
              ) : manualAutomations.map(a => (
                <button key={a.id} disabled={runningAutomation} onClick={() => runAutomationOnConvs(a.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 12px", background: "none", border: "none", borderRadius: 8, cursor: runningAutomation ? "default" : "pointer", textAlign: "left", opacity: runningAutomation ? 0.6 : 1 }} onMouseEnter={e => { if (!runningAutomation) e.currentTarget.style.background = "#F5F5F5"; }} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Zap size={15} color="#128A68" /></div>
                  <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{a.name}</span>
                </button>
              ))}
            </div>
            {runningAutomation && <div style={{ padding: "10px", textAlign: "center", fontSize: 12, color: "#128A68", borderTop: "1px solid #EEEEEE" }}>Executando…</div>}
          </div>
        </div>
      )}

      {/* ── DIALOG: agendar atividade ────────────────────────────────── */}
      {showScheduleDialog && (() => {
        const linkedLead = active
          ? resolveLeadForConv(active)
          : undefined;
        return (
          <ActivityDialog
            open={showScheduleDialog}
            onClose={() => setShowScheduleDialog(false)}
            onSubmit={handleScheduleSubmit}
            leads={leads}
            teamMembers={teamMembers}
            memberEmails={memberEmails}
            memberAvatars={memberAvatars}
            memberColors={memberColors}
            defaultLead={linkedLead}
          />
        );
      })()}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 12px",
  fontSize: 13, color: "#111", background: "#FFF", outline: "none", width: "100%",
};

/* ── Toggle reutilizável para o modal de config ──────────────────────── */
function MuToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{ width: 42, height: 22, borderRadius: 11, background: checked ? "#128A68" : "#D1D5DB", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
    >
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#FFF", position: "absolute", top: 3, left: checked ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

/* ── Transfer dialog ─────────────────────────────────────────────────── */
function TransferDialog({
  open, onClose, onTransfer, teamMembers, memberEmails, memberAvatars, memberColors, currentAssignee,
}: {
  open: boolean;
  onClose: () => void;
  onTransfer: (memberName: string) => void;
  teamMembers: string[];
  memberEmails: Record<string, string>;
  memberAvatars: Record<string, string>;
  memberColors: Record<string, string>;
  currentAssignee?: string;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  if (!open) return null;

  const filtered = teamMembers.filter(m => !q.trim() || m.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#FFF", borderRadius: 16, width: 420, maxHeight: "60vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}
      >
        {/* header */}
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111", display: "flex", alignItems: "center", gap: 7 }}>
              <UserCheck size={16} color="#128A68" /> Transferir atendimento
            </div>
            <div style={{ fontSize: 12, color: "#AAA", marginTop: 2 }}>Selecione o atendente que receberá esta conversa</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#AAA" />
          </button>
        </div>

        {/* search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #F0F0F0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 12px" }}>
            <Search size={14} color="#AAA" />
            <input
              ref={inputRef}
              placeholder="Buscar atendente..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111" }}
            />
            {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 0 }}><X size={12} color="#AAA" /></button>}
          </div>
        </div>

        {/* lista de membros */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <UserCheck size={28} color="#E5E5E5" style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 13, color: "#AAA" }}>Nenhum atendente encontrado</p>
            </div>
          )}
          {filtered.map(memberName => {
            const isCurrentAssignee = memberName === currentAssignee;
            const avatar = memberAvatars[memberName];
            const color = memberColors[memberName] ?? colorFromString(memberName);
            const email = memberEmails[memberName] ?? "";
            return (
              <button
                key={memberName}
                onClick={() => onTransfer(memberName)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: isCurrentAssignee ? "#F0FBF6" : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => { if (!isCurrentAssignee) e.currentTarget.style.background = "#F5F5F5"; }}
                onMouseLeave={e => { e.currentTarget.style.background = isCurrentAssignee ? "#F0FBF6" : "transparent"; }}
              >
                {/* avatar */}
                {avatar ? (
                  <img src={avatar} alt={memberName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {initials(memberName)}
                  </div>
                )}

                {/* info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{memberName}</div>
                  {email && <div style={{ fontSize: 11, color: "#AAA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>}
                </div>

                {isCurrentAssignee && (
                  <span style={{ fontSize: 11, fontWeight: 600, background: "#E1F5EE", color: "#128A68", padding: "3px 8px", borderRadius: 100, flexShrink: 0 }}>Atual</span>
                )}
              </button>
            );
          })}
        </div>

        {/* footer */}
        <div style={{ padding: "10px 20px", borderTop: "1px solid #F0F0F0", fontSize: 11, color: "#AAA", textAlign: "center" }}>
          {filtered.length} atendente{filtered.length !== 1 ? "s" : ""} disponíve{filtered.length !== 1 ? "is" : "l"}
        </div>
      </div>
    </div>
  );
}

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
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Nova conversa</div>
            <div style={{ fontSize: 12, color: "#AAA", marginTop: 2 }}>Selecione um negócio do pipeline</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#AAA" />
          </button>
        </div>

        {/* search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #F0F0F0" }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
          <div style={{ padding: "10px 20px", borderTop: "1px solid #F0F0F0", fontSize: 11, color: "#AAA", textAlign: "center" }}>
            {filteredLeads.length} negócio{filteredLeads.length !== 1 ? "s" : ""} encontrado{filteredLeads.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
