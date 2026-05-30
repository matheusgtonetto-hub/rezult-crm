import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import type { Lead, Pipeline } from "@/data/mockData";
import {
  Search, Settings, Mail, Clock, Folder, Zap, CheckCircle2, AlertTriangle,
  Filter, Eye, Check, MoreHorizontal, Paperclip, Calendar as CalendarIcon, FolderOpen,
  Smile, Mic, Sparkles, ExternalLink, ChevronDown, Play, CheckCheck,
  MessageSquare, Plus, ArrowLeft, ArrowRight, Tag, Send, X, UserPlus, ImageIcon, List, CalendarDays, UserCheck,
  type LucideIcon,
} from "lucide-react";
import { ActivityDialog } from "@/components/ActivityDialog";
import type { ActivitySubmitData } from "@/components/ActivityDialog";

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
function phonesMatch(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "");
  const db = b.replace(/\D/g, "");
  if (!da || !db) return false;
  return da.slice(-11) === db.slice(-11);
}
// Retorna par de variantes do telefone para query OR (com e sem "55")
function phoneVariants(raw: string): { local: string; full: string } {
  const d = raw.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) {
    return { local: d.slice(2), full: d };
  }
  return { local: d, full: `55${d}` };
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
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "text";   text: string;                    date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "audio";  duration: string;               date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "image";  src: string; caption?: string;  date: string; read?: boolean }
  | { id: string; from: "lead" | "agent"; agent?: string; time: string; kind: "file";   filename: string;               date: string; read?: boolean }
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
};

type ZApiInstance = { instanceId: string; token: string; clientToken: string; phone: string; label: string };

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

function FilterChip({ Icon, count, isActive, onClick, label }: { Icon: LucideIcon; count: number | null; isActive: boolean; onClick: () => void; label?: string }) {
  const [hovered, setHovered] = useState(false);
  const bg     = isActive ? "#E1F5EE" : "#F5F5F5";
  const fg     = isActive ? "#128A68" : "#535353";
  const border = isActive ? "1px solid #128A68" : "1px solid transparent";
  return (
    <div style={{ position: "relative", display: "inline-flex" }}
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
      <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 4, background: bg, color: fg, border, borderRadius: 100, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        <Icon size={12} />
        {count !== null && <span>{count}</span>}
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

function ConvAvatar({ name, avatarUrl, size, fontSize, style }: { name: string; avatarUrl?: string; size: number; fontSize: number; style?: React.CSSProperties }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [avatarUrl]);
  if (avatarUrl && !err) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setErr(true)}
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
  const navigate = useNavigate();
  const location = useLocation();
  const { leads, pipelines, activePipeline, moveLead, crmTags, addLead, nextDealNumber, updateLead, crmLists, addLeadToList, removeLeadFromList, addActivity, teamMembers, memberEmails, memberAvatars, memberColors } = useCRM();
  const { openedLeadIds } = useFloatingChat();

  const [convList, setConvList] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [convStates, setConvStates] = useState<Record<string, ConvState>>({});
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

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

  async function fetchAvatar(phone: string) {
    const inst = instances[0];
    if (!inst || !phone) return;
    const p = phone.replace(/\D/g, "");
    if (!p || fetchingAvatars.current.has(p) || convAvatars[p]) return;
    fetchingAvatars.current.add(p);
    try {
      const res = await fetch(
        `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/profile-picture?phone=${p}`,
        { headers: { "Client-Token": inst.clientToken } }
      );
      if (!res.ok) return;
      const json = await res.json() as { value?: string };
      if (json.value) setConvAvatars(prev => ({ ...prev, [p]: json.value! }));
    } catch { /* ignore */ }
  }

  // Fetch photos for visible conversations when instances load
  useEffect(() => {
    if (!instances[0] || convList.length === 0) return;
    convList.slice(0, 40).forEach(c => { if (c.phone) fetchAvatar(c.phone); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances.length, convList.length]);

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
  const [selectedAgent, setSelectedAgent]   = useState<string | null>(null);
  const [agentSearch, setAgentSearch]       = useState("");
  const [deptSearch, setDeptSearch]         = useState("");
  const [qmSearch, setQmSearch]             = useState("");

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
  const DEFAULT_CS: ConvState = { messages: [], stageIdx: 0, meeting: null, notes: "", read: true, finished: false, assignedTo: undefined };
  const cs = activeId ? (convStates[activeId] ?? DEFAULT_CS) : null;

  // Etapas reais do pipeline vinculado ao lead ativo.
  // Tenta por ID primeiro (conversas abertas pelo pipeline); se não achar,
  // busca pelo telefone (conversas de backfill com UUID aleatório como id).
  const linkedLead     = activeId ? leads[activeId] : null;
  const linkedLeadByPhone = !linkedLead && active?.phone
    ? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active.phone ?? ""))
    : null;
  const effectiveLead  = linkedLead ?? linkedLeadByPhone ?? null;
  const linkedPipeline = effectiveLead?.pipelineId ? (pipelines ?? []).find(p => p.id === effectiveLead.pipelineId) : null;
  const pipelineCols   = linkedPipeline?.columns ?? [];
  const activeStages   = pipelineCols.length > 0 ? pipelineCols.map(c => c.title) : PIPELINE_STAGES;
  const rawColIdx      = pipelineCols.length > 0 ? pipelineCols.findIndex(c => c.id === effectiveLead?.stage) : -1;
  const activeStageIdx = pipelineCols.length > 0 ? (rawColIdx >= 0 ? rawColIdx : 0) : (cs?.stageIdx ?? 0);

  // ── carregar conversas do Supabase ao iniciar ────────────────────────
  useEffect(() => {
    if (!user) return;

    type DbConvRow = { id: string; name: string; preview: string; last_msg_at: string; channel: Channel; tags: string[] | null; company_name?: string; email?: string; phone?: string; value?: number; pipeline?: string; deal_number?: string };
    const mapRow = (r: DbConvRow): Conversation => ({
      id: r.id, name: r.name, preview: r.preview,
      time: new Date(r.last_msg_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      channel: r.channel as Channel, tags: r.tags ?? [],
      company: r.company_name ?? undefined, email: r.email ?? undefined,
      phone: r.phone ?? undefined, value: r.value ?? undefined,
      pipeline: r.pipeline ?? undefined, dealNumber: r.deal_number ?? undefined,
    });

    type DbStateRow = { stage_idx?: number; meeting_date?: string; meeting_time?: string; meeting_owner?: string; meeting_note?: string; notes?: string; read?: boolean; finished?: boolean };
    const mapState = (r: DbStateRow): ConvState => ({
      messages: [],
      stageIdx: r.stage_idx ?? 0,
      meeting:  r.meeting_date ? { date: r.meeting_date, time: r.meeting_time ?? "", owner: r.meeting_owner ?? "", note: r.meeting_note ?? "" } : null,
      notes:    r.notes ?? "",
      read:     r.read ?? true,
      finished: r.finished ?? false,
      assignedTo: r.assigned_to ?? undefined,
    });

    supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("owner_id", user.id)
      .order("last_msg_at", { ascending: false })
      .then(async ({ data, error }) => {
        if (error) console.error("Erro ao carregar conversas:", error);

        if (data && data.length > 0) {
          // Fix race condition: MERGE com estado existente (não sobrescrever conversas do Pipeline)
          setConvList(prev => {
            const dbIds = new Set(data.map(r => r.id));
            const extra = prev.filter(c => !dbIds.has(c.id)); // conversas só em memória
            return [...data.map(mapRow), ...extra];
          });
          setConvStates(prev => {
            const next: Record<string, ConvState> = { ...prev };
            data.forEach(r => {
              if (!next[r.id]) next[r.id] = mapState(r); // não sobrescreve estado já em memória
            });
            return next;
          });
          return;
        }

        // Backfill: tabela vazia → cria conversas a partir de mensagens existentes
        const { data: msgs } = await supabase
          .from("whatsapp_messages")
          .select("phone, chat_name, sender_name, body, momment, created_at")
          .eq("owner_id", user.id)
          .eq("from_me", false)
          .order("created_at", { ascending: false });

        if (!msgs?.length) return;

        // Agrupa por telefone, pega a mensagem mais recente por contato
        type WaMsgRow = { phone: string; chat_name?: string; sender_name?: string; body?: string; momment?: number; created_at?: string };
        const phoneMap = new Map<string, WaMsgRow>();
        for (const m of msgs) {
          if (!phoneMap.has(m.phone)) phoneMap.set(m.phone, m as WaMsgRow);
        }

        const newConvs: Conversation[] = [];
        const newStates: Record<string, ConvState> = {};
        const dbRows: DbConvRow[] = [];

        for (const [phone, m] of phoneMap) {
          const id = crypto.randomUUID();
          const d = new Date(m.momment ?? m.created_at);
          const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          newConvs.push({ id, name: m.chat_name ?? m.sender_name ?? phone, preview: m.body ?? "", time: timeStr, channel: "whatsapp", tags: [], phone });
          newStates[id] = { messages: [], stageIdx: 0, meeting: null, notes: "", read: false, finished: false };
          dbRows.push({ id, owner_id: user.id, name: m.chat_name ?? m.sender_name ?? phone, phone, channel: "whatsapp", tags: [], preview: m.body ?? "", last_msg_at: d.toISOString(), read: false });
        }

        if (newConvs.length) {
          setConvList(newConvs);
          setConvStates(newStates);
          supabase.from("whatsapp_conversations").insert(dbRows).then(({ error: e }) => {
            if (e) console.error("Backfill erro:", e);
          });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cs?.messages.length]);

  // ── carregar histórico quando muda a conversa ───────────────────────
  useEffect(() => {
    if (!activeId || !active || !user) return;
    const rawPhone = (active.phone ?? "").replace(/\D/g, "");
    // Sempre inclui phone.eq.${activeId} para carregar mensagens de sistema
    // que foram salvas com o ID da conversa como chave (quando não há telefone real)
    const phoneFilter = rawPhone
      ? (() => { const { local, full } = phoneVariants(rawPhone); return `phone.eq.${local},phone.eq.${full},phone.eq.${activeId}`; })()
      : `phone.eq.${activeId}`;

    supabase
      .from("whatsapp_messages")
      .select("*")
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
          if (m.type === "audio")    return { ...base, kind: "audio"  as const, duration: m.body ?? "00:00" };
          if (m.type === "image")    return { ...base, kind: "image"  as const, src: "", caption: m.body ?? "" };
          if (m.type === "document") return { ...base, kind: "file"   as const, filename: m.body ?? "arquivo" };
          return { ...base, kind: "text" as const, text: m.body ?? "" };
        });
        updateCs(activeId, { messages: msgs });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.phone, user?.id]);

  // ── listener global de mensagens recebidas (sem filtro de telefone) ──
  // Trata tanto conversas existentes (phone mismatch de código de país)
  // quanto novas mensagens de números ainda sem conversa no CRM
  useEffect(() => {
    if (!user) return;

    const ch = supabase
      .channel("wamsg-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const m = payload.new as { from_me: boolean; phone?: string; body?: string; chat_name?: string; sender_name?: string; momment?: number; created_at?: string; type?: string };
          if (m.from_me) return; // enviadas já são adicionadas otimisticamente

          const msgPhone = (m.phone ?? "") as string;
          const d = new Date(m.momment ?? m.created_at);
          const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

          // Mensagens de sistema: busca conversa pelo ID direto (phone = conv ID) ou por telefone
          if (m.type === "system") {
            const sysConv = convListRef.current.find(c => c.id === msgPhone || phonesMatch(c.phone ?? "", msgPhone));
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

          // Procura conversa pelo telefone (ignora diferença de código de país)
          const existing = convListRef.current.find(c => phonesMatch(c.phone ?? "", msgPhone));

          if (existing) {
            // Atualiza preview da conversa existente
            setConvList(prev => prev.map(c =>
              c.id === existing.id ? { ...c, preview: m.body ?? "", time: timeStr } : c
            ));
            // Adiciona a mensagem no estado da conversa se já estiver carregada
            setConvStates(prev => {
              const cur = prev[existing.id];
              if (!cur) return prev;
              if (cur.messages.some(x => x.id === m.id)) return prev;
              const newMsg: Msg = { id: m.id, from: "lead", time: timeStr, kind: "text" as const, text: m.body ?? "", date: "Hoje", read: false };
              return { ...prev, [existing.id]: { ...cur, messages: [...cur.messages, newMsg], read: false } };
            });
            // Atualiza preview e timestamp no banco
            supabase.from("whatsapp_conversations").update({
              preview: m.body ?? "", last_msg_at: new Date().toISOString(), read: false,
            }).eq("id", existing.id);
          } else {
            // Cria nova conversa automaticamente para este remetente
            const newId = crypto.randomUUID();
            const newConv: Conversation = {
              id:      newId,
              name:    m.chat_name ?? m.sender_name ?? msgPhone,
              preview: m.body ?? "",
              time:    timeStr,
              channel: "whatsapp" as const,
              tags:    [],
              phone:   msgPhone,
            };
            setConvList(prev => [newConv, ...prev]);
            setConvStates(prev => ({
              ...prev,
              [newId]: { messages: [], stageIdx: 0, meeting: null, notes: "", read: false, finished: false },
            }));
            // Persiste nova conversa no banco
            const uid = m.owner_id as string;
            supabase.from("whatsapp_conversations").insert({
              id: newId, owner_id: uid, name: newConv.name, phone: msgPhone,
              channel: "whatsapp", tags: [], preview: m.body ?? "",
              last_msg_at: new Date().toISOString(), read: false,
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
        id: conv.id, owner_id: user.id, name: conv.name, phone: conv.phone ?? null,
        channel: conv.channel, tags: conv.tags, company_name: conv.company ?? null,
        email: conv.email ?? null, pipeline: conv.pipeline ?? null,
        deal_number: conv.dealNumber ?? null, value: conv.value ?? null,
        preview: conv.preview, stage_idx: cs.stageIdx, notes: cs.notes,
        read: cs.read, finished: cs.finished,
      }, { onConflict: "id", ignoreDuplicates: true });
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
        id: leadId, owner_id: user.id, name: newConv.name, phone: newConv.phone ?? null,
        channel: newConv.channel, tags: newConv.tags, company_name: newConv.company ?? null,
        email: newConv.email ?? null, pipeline: newConv.pipeline ?? null,
        deal_number: newConv.dealNumber ?? null, value: newConv.value ?? null,
        preview: newConv.preview, stage_idx: stageIdx, notes: "", read: true, finished: false,
      }, { onConflict: "id", ignoreDuplicates: true });
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
      const newMsg: Msg = isImage
        ? { id: `m${Date.now()}`, from: "agent", agent: user.email?.split("@")[0] ?? "Você", time: nowTime(), kind: "image", src: URL.createObjectURL(file), caption: file.name, date: "Hoje", read: false }
        : { id: `m${Date.now()}`, from: "agent", agent: user.email?.split("@")[0] ?? "Você", time: nowTime(), kind: "file",  filename: file.name, date: "Hoje", read: false };
      updateCs(activeId, { messages: [...(cs?.messages ?? []), newMsg] });
      // Persiste no banco para histórico futuro
      await supabase.from("whatsapp_messages").insert({
        owner_id:    user.id,
        instance_id: inst.instanceId,
        phone:       cleanPhone,
        from_me:     true,
        body:        file.name,
        type:        isImage ? "image" : "document",
        momment:     Date.now(),
        sender_name: user.email?.split("@")[0] ?? "Você",
      });
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
      // Z-API /send-audio espera base64 puro (sem o prefixo data:audio/...;base64,)
      const dataUri = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
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
      const newMsg: Msg = { id: `m${Date.now()}`, from: "agent", agent: user.email?.split("@")[0] ?? "Você", time: nowTime(), kind: "audio", duration, date: "Hoje", read: false };
      updateCs(activeId, { messages: [...(cs?.messages ?? []), newMsg] });
      // Persiste no banco para histórico futuro
      await supabase.from("whatsapp_messages").insert({
        owner_id:    user.id,
        instance_id: inst.instanceId,
        phone:       cleanPhone,
        from_me:     true,
        body:        duration,
        type:        "audio",
        momment:     Date.now(),
        sender_name: user.email?.split("@")[0] ?? "Você",
      });
      toast.success("Áudio enviado!", { id: "audio-send" });
    } catch (err) {
      toast.error(`Erro ao enviar áudio: ${(err as Error).message}`, { id: "audio-send" });
    }
  }

  function suggestAI() {
    if (!cs || aiLoading || cs.finished) return;
    setAiLoading(true);
    const templates = AI_TEMPLATES[cs.stageIdx] ?? AI_TEMPLATES[0];
    const suggestion = templates[Math.floor(Math.random() * templates.length)];
    setTimeout(() => { setInputValue(suggestion); setAiLoading(false); }, 500);
  }

  async function handleCreateNegocio() {
    if (!active || !user) return;
    const pipeline = (pipelines ?? []).find(p => p.id === negocioPipelineId);
    const firstCol = pipeline?.columns[0];
    if (!pipeline || !firstCol) { toast.error("Escolha um pipeline válido"); return; }
    setNegocioLoading(true);
    const ok = await addLead({
      dealNumber: nextDealNumber(),
      name: negocioName || active.name,
      whatsapp: active.phone ?? "",
      value: parseFloat(negocioValue.replace(/[^\d,]/g, "").replace(",", ".")) || 0,
      responsible: "",
      pipelineId: negocioPipelineId,
      stage: firstCol.id,
      priority: "Média",
      origin: "Outro",
      entryDate: new Date().toISOString().split("T")[0],
      notes: "",
      activities: [],
      tags: [],
    });
    setNegocioLoading(false);
    if (ok) {
      toast.success("Negócio criado com sucesso!");
      setShowNegocioForm(false);
      setNegocioName("");
      setNegocioValue("");
    }
  }

  function handleScheduleSubmit(data: ActivitySubmitData) {
    // ActivityDialog retorna leadId: undefined quando defaultLead foi passado — usar lead vinculado
    const resolvedLeadId = data.leadId ?? (() => {
      if (!active) return undefined;
      const ll = leads[activeId] ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active.phone ?? ""));
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

  // Ao trocar de conversa, sincroniza tags da conversa → lead (backfill)
  useEffect(() => {
    if (!activeId) return;
    const conv = convList.find(c => c.id === activeId);
    if (!conv) return;
    const convTags = conv.tags ?? [];
    if (convTags.length === 0) return;
    const linkedLead = leads[activeId]
      ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", conv.phone ?? ""));
    if (!linkedLead) return;
    const leadTags = linkedLead.tags ?? [];
    const toAdd = convTags.filter(t => !leadTags.includes(t));
    if (toAdd.length > 0) updateLead(linkedLead.id, { tags: [...leadTags, ...toAdd] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function toggleConvTag(tagName: string) {
    if (!activeId || !active) return;

    // Atualiza tags da conversa
    const current = active.tags ?? [];
    const next = current.includes(tagName)
      ? current.filter(t => t !== tagName)
      : [...current, tagName];
    setConvList(prev => prev.map(c => c.id === activeId ? { ...c, tags: next } : c));
    await supabase.from("whatsapp_conversations").update({ tags: next }).eq("id", activeId);

    // Sincroniza tags no lead vinculado (para aparecer no card do pipeline)
    const linkedLead = leads[activeId]
      ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active.phone ?? ""));
    if (linkedLead) {
      const leadTags = linkedLead.tags ?? [];
      const nextLeadTags = leadTags.includes(tagName)
        ? leadTags.filter(t => t !== tagName)
        : [...leadTags, tagName];
      await updateLead(linkedLead.id, { tags: nextLeadTags });
    }
  }

  async function toggleConvList(listId: string) {
    if (!activeId || !active) return;
    const linkedLead = leads[activeId]
      ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active.phone ?? ""));
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
    supabase.from("whatsapp_conversations").update(dbPatch).eq("id", id).then(({ error }) => {
      if (error) console.error("updateCs DB:", error);
    });
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

    // Enviar via Z-API + persistir no Supabase
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

      // Persiste no banco para histórico futuro
      if (user) {
        await supabase.from("whatsapp_messages").insert({
          owner_id:    user.id,
          instance_id: inst.instanceId,
          phone:       cleanPhone,
          from_me:     true,
          body:        text,
          type:        "text",
          momment:     Date.now(),
          sender_name: user.email?.split("@")[0] ?? "Você",
        });
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

  function handleTransfer(memberName: string) {
    if (!activeId || !user) return;
    const fromName = user.email?.split("@")[0] ?? "Você";
    const msgId = crypto.randomUUID();
    const sysText = `Atendimento transferido para ${memberName} por ${fromName}`;
    const sysMsg: Msg = {
      id:   msgId,
      from: "system",
      time: nowTime(),
      kind: "system",
      text: sysText,
      date: "Hoje",
    };

    // Functional update garante que usamos o estado mais recente (evita closure stale)
    setConvStates(prev => {
      const cur = prev[activeId] ?? DEFAULT_CS;
      return { ...prev, [activeId]: { ...cur, assignedTo: memberName, messages: [...cur.messages, sysMsg] } };
    });

    // Persiste assignedTo na conversa
    supabase.from("whatsapp_conversations")
      .update({ assigned_to: memberName })
      .eq("id", activeId)
      .then(({ error }) => { if (error) console.error("updateCs assignedTo:", error); });

    // Atualiza o responsável no lead vinculado (aparece no card do Pipeline)
    const linkedLead = leads[activeId]
      ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active?.phone ?? ""));
    if (linkedLead) {
      updateLead(linkedLead.id, { responsible: memberName });
      // Registra nas anotações do negócio (visível em Detalhes do negócio)
      addActivity(linkedLead.id, {
        type: "note",
        date: new Date().toISOString(),
        description: sysText,
        userName: fromName,
      });
    }

    // Persiste mensagem de sistema no banco para sobreviver a page refresh
    const phoneForSystem = active?.phone?.replace(/\D/g, "") || activeId;
    supabase.from("whatsapp_messages").insert({
      id:          msgId,
      owner_id:    user.id,
      instance_id: instances[0]?.instanceId ?? "system",
      phone:       phoneForSystem,
      from_me:     false,
      body:        sysText,
      type:        "system",
      momment:     Date.now(),
      sender_name: null,
    }).then(({ error }) => {
      if (error) {
        console.error("Erro ao salvar evento de transferência:", error);
        toast.error(`Erro ao salvar histórico: ${error.message}`);
      }
    });

    toast.success(`Atendimento transferido para ${memberName}`);
    setShowTransferDialog(false);
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
    { id: "email",   icon: Mail,          label: "Instagram",      count: convList.filter(c => c.channel === "instagram").length },
    { id: "pending", icon: Clock,         label: "Não lidas",      count: convList.filter(c => !convStates[c.id]?.finished).length },
    { id: "folder",  icon: Folder,        label: "Todas",          count: convList.length },
    { id: "auto",    icon: Zap,           label: "Automações",     count: convList.length },
    { id: "done",    icon: CheckCircle2,  label: "Finalizadas",    count: convList.filter(c => convStates[c.id]?.finished).length },
    { id: "alert",   icon: AlertTriangle, label: "Follow-up",      count: convList.filter(c => c.tags.includes("Follow-up")).length },
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
      <aside style={{ width: 300, minWidth: 300, maxWidth: 300, height: "100vh", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", background: "#FFF", position: "relative", zIndex: 2, overflow: "hidden" }}>
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

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {filters.map(f => (
              <FilterChip key={f.id} Icon={f.icon} count={f.count} label={f.label} isActive={activeFilter === f.id} onClick={() => setActiveFilter(activeFilter === f.id ? "" : f.id)} />
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
                style={{ padding: "12px 16px", borderBottom: "1px solid #F0F0F0", background: isActive ? "#E1F5EE" : "transparent", borderLeft: isActive ? "3px solid #128A68" : "3px solid transparent", cursor: "pointer", display: "flex", gap: 10 }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F9F9F9"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <ConvAvatar name={c.name} avatarUrl={convAvatars[c.phone?.replace(/\D/g, "") ?? ""]} size={36} fontSize={12} />
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
            <div style={{ minHeight: 52, background: "#FFF", borderBottom: "1px solid #E5E5E5", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ConvAvatar name={active.name} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={32} fontSize={11} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{active.name}</div>
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
                          <ConvAvatar name={active.name} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={28} fontSize={10} style={{ marginRight: 8 }} />
                        )}
                        <div style={{ maxWidth: "65%" }}>
                          <div style={{ fontSize: 11, color: "#AAA", marginBottom: 2, textAlign: isAgent ? "right" : "left" }}>
                            {isAgent ? `${m.agent} • ${m.time}` : `${active.name} • ${m.time}`}
                          </div>
                          <div style={{ padding: m.kind === "image" ? 4 : "10px 14px", borderRadius: isAgent ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: isAgent ? "#128A68" : "#FFF", color: isAgent ? "#FFF" : "#111", border: isAgent ? "none" : "1px solid #EEE", boxShadow: isAgent ? "none" : "0 1px 2px rgba(0,0,0,0.06)", fontSize: 14, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
                            {m.kind === "text"  && <><span style={{ flex: 1 }}>{m.text}</span>{isAgent && <CheckCheck size={14} color={m.read ? "#FFF" : "rgba(255,255,255,0.5)"} />}</>}
                            {m.kind === "audio" && <AudioBubble duration={m.duration} light={isAgent} />}
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
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 8, background: isAgent ? "rgba(255,255,255,0.2)" : "#F0F0F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <FolderOpen size={18} color={isAgent ? "#FFF" : "#128A68"} />
                                </div>
                                <span style={{ fontSize: 13, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.filename}</span>
                              </div>
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
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F5F5F5", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                            <FolderOpen size={14} color="#128A68" />
                            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(m as { filename: string }).filename}</span>
                          </div>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); setShowEmoji(false); } }}
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
                <ConvAvatar name={active.name} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={40} fontSize={13} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{active.name}</span>
                    <ExternalLink size={12} color="#AAA" style={{ cursor: "pointer" }} onClick={() => navigate("/leads")} />
                  </div>
                  {/* Tags inline + picker */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 5 }}>
                    {(active.tags ?? []).slice(0, 4).map(tagName => {
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
                    {(active.tags ?? []).length > 4 && (
                      <span style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>+{(active.tags ?? []).length - 4}</span>
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
                                const isActive = (active.tags ?? []).includes(tag.name);
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
                  const linkedLead = leads[activeId]
                    ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active.phone ?? ""));
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
                ><Plus size={12} /> Negócio</button>
                <button
                  onClick={() => toast("Automação: em breve")}
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

              {/* Painel: + Negócio */}
              {showNegocioForm && (
                <div style={{ marginTop: 12, background: "#F9FBFA", border: "1px solid #E5E5E5", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 2 }}>Novo negócio</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#AAA", fontWeight: 600 }}>Nome</label>
                    <input
                      value={negocioName}
                      onChange={e => setNegocioName(e.target.value)}
                      placeholder={active.name}
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
              )}

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
                    if (pipelineCols.length > 0 && linkedLead) moveLead(activeId, linkedLead.stage, pipelineCols[idx].id, 0);
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
              const ll = leads[activeId] ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active.phone ?? ""));
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

            <Section title="Notas">
              <textarea
                placeholder="Adicionar nota..."
                value={effectiveLead ? (effectiveLead.notes ?? "") : cs.notes}
                onChange={e => {
                  if (effectiveLead) {
                    updateLead(effectiveLead.id, { notes: e.target.value });
                  } else {
                    updateCs(activeId, { notes: e.target.value });
                  }
                }}
                style={{ width: "100%", background: "#F5F5F5", borderRadius: 8, padding: 10, border: "none", outline: "none", fontSize: 13, fontFamily: "inherit", minHeight: 80, resize: "vertical" }}
              />
              {(effectiveLead ? effectiveLead.notes : cs.notes) && (
                <div style={{ fontSize: 11, color: "#AAA", marginTop: 4 }}>Salvo automaticamente</div>
              )}
            </Section>

            <Section title="Negócio vinculado" defaultOpen>
              <div style={{ border: "1px solid #E5E5E5", borderRadius: 10, padding: 12, cursor: "pointer" }}
                onClick={() => navigate("/pipeline")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <ConvAvatar name={active.name} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={28} fontSize={10} />
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
                  {settingsTab === "dept" && <button onClick={() => toast.info("Em breve")} style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Criar</button>}
                  {settingsTab === "quick" && <button onClick={() => toast.info("Em breve")} style={{ background: "#128A68", border: "none", color: "#FFF", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Nova mensagem</button>}
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
                        { icon: <List size={15} color="#4285F4" />, title: "Departamento padrão", desc: "As conversas por padrão serão iniciadas nesse departamento", value: cfgDefDept, set: setCfgDefDept, options: [{ v: "", l: "Selecionar" }, ...teamMembers.map(m => ({ v: m, l: m }))] },
                        { icon: <Clock size={15} color="#4285F4" />, title: "Horário de funcionamento", desc: "Defina o horário padrão de funcionamento dos departamentos", value: cfgHorario, set: setCfgHorario, options: [{ v: "", l: "Selecionar" }, { v: "24h", l: "24 horas" }, { v: "comercial", l: "Horário comercial (8h–18h)" }] },
                        { icon: <Mic size={15} color="#4285F4" />, title: "Transcrição de áudios", desc: "Defina quando as mensagens de áudio serão transcritas automaticamente", value: cfgTranscricao, set: setCfgTranscricao, options: [{ v: "desativado", l: "Desativado" }, { v: "sempre", l: "Sempre" }, { v: "atribuido", l: "Apenas quando atribuído" }] },
                      ].map((item, i) => (
                        <div key={i} style={{ background: "#F9FAFB", borderRadius: 12, padding: 14 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#E8F0FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.icon}</div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{item.title}</div>
                              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{item.desc}</div>
                            </div>
                          </div>
                          <select value={item.value} onChange={e => item.set(e.target.value)} style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: item.value ? "#111" : "#AAA", background: "#FFF", outline: "none", cursor: "pointer" }}>
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
                        <MuToggle checked={cfgAssinatura} onChange={() => setCfgAssinatura(p => !p)} />
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
                            { icon: <UserCheck size={13} color="#888" />, label: "Manter atendente na conversa", val: cfgMantAtend, set: setCfgMantAtend },
                            { icon: <Folder size={13} color="#888" />, label: "Manter departamento na conversa", val: cfgMantDept, set: setCfgMantDept },
                          ].map((row, i) => (
                            <div key={i}>
                              {i > 0 && <div style={{ height: 1, background: "#EEEEEE", margin: "8px 0" }} />}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{row.icon}<span style={{ fontSize: 12, color: "#444" }}>{row.label}</span></div>
                                <MuToggle checked={row.val} onChange={() => row.set((p: boolean) => !p)} />
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
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
                      <Search size={14} color="#AAA" />
                      <input placeholder="Pesquisar..." value={deptSearch} onChange={e => setDeptSearch(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111", flex: 1 }} />
                      <span style={{ fontSize: 12, color: "#AAA" }}>0 resultados</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 100px 48px", padding: "6px 0", borderBottom: "1px solid #EEEEEE", marginBottom: 8 }}>
                      {["Departamentos", "Horário de funcionamento", "Data de criação", ""].map((h, i) => (
                        <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 8 }}>
                      <Folder size={32} color="#E5E5E5" />
                      <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>Nenhum departamento criado</p>
                      <p style={{ fontSize: 12, color: "#CCC", margin: 0 }}>Clique em "Criar" para adicionar um departamento</p>
                    </div>
                  </div>
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
                {settingsTab === "quick" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
                      <Search size={14} color="#AAA" />
                      <input placeholder="Pesquisar..." value={qmSearch} onChange={e => setQmSearch(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111", flex: 1 }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 8 }}>
                      <Zap size={32} color="#E5E5E5" />
                      <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>Nenhuma mensagem rápida criada</p>
                      <p style={{ fontSize: 12, color: "#CCC", margin: 0 }}>Clique em "Nova mensagem" para criar uma</p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DIALOG: agendar atividade ────────────────────────────────── */}
      {showScheduleDialog && (() => {
        const linkedLead = active
          ? (leads[activeId] ?? Object.values(leads).find(l => phonesMatch(l.whatsapp ?? "", active.phone ?? "")))
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
