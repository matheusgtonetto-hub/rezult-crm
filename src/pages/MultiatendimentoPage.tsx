import { useState, useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import Recorder from "opus-recorder";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useCompany } from "@/context/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { useProfile } from "@/context/ProfileContext";
import { useNomeAtendente } from "@/hooks/useNomeAtendente";
import { corDoNome } from "@/lib/nomeColorido";
import { WhatsappTemplatePicker, type Modelo } from "@/components/WhatsappTemplatePicker";
import type { Lead, Pipeline, LeadOrigin, ActivityType } from "@/data/mockData";
import {
  Search, Settings, Clock, Folder, Zap, CheckCircle2,
  Filter, Eye, Check, MoreHorizontal, Paperclip, Calendar as CalendarIcon, FolderOpen,
  Smile, Mic, Sparkles, ExternalLink, ChevronDown, Play, Pause, CheckCheck, FileText, Reply, Copy, Ban, Forward, CornerUpLeft,
  MessageSquare, MessageCircle, Plus, ArrowLeft, ArrowRight, Tag, Send, X, UserPlus, ImageIcon, List, CalendarDays, UserCheck,
  Download, Pencil, Trash2, Inbox, RefreshCw, BotMessageSquare,
  StickyNote, ArrowRightLeft, Trophy, XCircle, PlusCircle, Phone, Mail, ArrowLeftRight, CheckSquare,
  Bold, Italic, Underline, ListOrdered,
  type LucideIcon,
} from "lucide-react";
import { ActivityDialog } from "@/components/ActivityDialog";
import { FollowupScheduleDialog } from "@/components/FollowupScheduleDialog";
import type { ActivitySubmitData } from "@/components/ActivityDialog";
import DepartmentsManager from "@/components/DepartmentsManager";
import { LeadModal } from "@/components/LeadModal";
import { CreateDealDialog } from "@/components/CreateDealDialog";
import { ExecutarAutomacaoWizard } from "@/components/multiatendimento/ExecutarAutomacaoWizard";
import { upsertContact, type Contact } from "@/lib/contacts";
import { normalizarTelefoneBr, somenteDigitos, telefonesIguais, variantesDeTelefone } from "@/lib/telefone";
import { previewLabelFor } from "@/lib/conversas";
import { EMOJIS } from "@/lib/emojis";
import { enviarArquivoWhatsapp } from "@/lib/enviarArquivoWhatsapp";
import { apagarMensagemWhatsapp } from "@/lib/apagarMensagemWhatsapp";
import { sendWa, type ZapiCreds, type WaMsg } from "@/lib/enviarWhatsapp";
import { extrairIdDaResposta, descreverResposta } from "@/lib/respostaEnvio";
import { fetchWhatsappAvatar } from "@/lib/whatsappAvatar";
import { ConvAvatar } from "@/components/ConvAvatar";
import { MenuDaMensagem, menuAbreParaCima } from "@/components/MenuDaMensagem";
import { corDoTexto, iniciais } from "@/lib/iniciais";
import chatIllustration from "@/assets/chat-ilustration.svg";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

/* ── helpers ──────────────────────────────────────────────────────────── */
function nowTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
// Compara telefones ignorando código do país (55): "28999110664" ≡ "5528999110664"
// Normaliza um telefone BR para o núcleo DDD + 8 dígitos finais, tolerando o
// Lê o id que o provedor atribuiu à mensagem enviada, e registra o formato
// recebido quando não acha. É esse log que revela a estrutura de um provedor
// não documentado -- a D-API não especifica a resposta de sucesso.
async function lerIdDoEnvio(res: Response, provedor: string): Promise<string | null> {
  const corpo = await res.clone().json().catch(() => null);
  const id = extrairIdDaResposta(corpo);
  if (!id) console.warn(`[envio] ${provedor}: id não encontrado na resposta. ${descreverResposta(corpo)}`);
  return id;
}

// Texto legível de uma mensagem, para preview de citação e para o bloco de
// composição. Cada tipo tem a sua forma curta -- imagem sem legenda não vira
// string vazia, vira "🖼️ Imagem".
function textoDaMensagem(m: Msg): string {
  if (m.kind === "text" || m.kind === "system") return m.text;
  if (m.kind === "image") return m.caption || "🖼️ Imagem";
  if (m.kind === "file") return `📎 ${m.filename}`;
  return "🎤 Mensagem de áudio";
}

// Insere mensagem já vinculada à conversa, sem nunca perder a mensagem.
//
// A tela gera o id da conversa no cliente (ver a reconciliação mais abaixo) e
// grava com upsert + ignoreDuplicates. Numa corrida com o realtime, o navegador
// pode acabar segurando um id que não existe em whatsapp_conversations -- e a
// chave estrangeira recusaria o insert inteiro.
//
// Perder a mensagem para preservar o vínculo seria trocar o essencial pelo
// acessório: a mensagem é o fato, o agrupamento é conveniência. Em erro de
// chave estrangeira (23503) regrava sem o vínculo e avisa no console; o
// backfill da migration recupera o vínculo depois.
async function inserirMensagemVinculada(
  payload: Record<string, unknown>,
  conversationId: string | null | undefined,
): Promise<{ error: { message: string; code?: string } | null }> {
  const { error } = await supabase
    .from("whatsapp_messages")
    .insert({ ...payload, conversation_id: conversationId ?? null });
  if (!error) return { error: null };
  if (error.code !== "23503" || !conversationId) return { error };
  console.warn(
    `[multiatendimento] conversa ${conversationId} não existe no banco; mensagem gravada sem vínculo.`,
  );
  return await supabase.from("whatsapp_messages").insert(payload);
}

const TAG_STYLES: Record<string, { bg: string; fg: string }> = {
  Rafael:      { bg: "#E1F5EE", fg: "#128A68" },
  Mariana:     { bg: "#EDE9FE", fg: "#534AB7" },
  Carlos:      { bg: "#FEF3C7", fg: "#854F0B" },
  SDR:         { bg: "#F5F5F5", fg: "#535353" },
  "Follow-up": { bg: "#FEE2E2", fg: "#A32D2D" },
  Agente:      { bg: "#EDE9FE", fg: "#6D28D9" },
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

// Campos comuns a toda mensagem da tela. Antes eram repetidos em cada variante
// da união, o que fazia qualquer campo novo virar cinco edições iguais -- e uma
// esquecida passa despercebida, porque o TypeScript não reclama de campo
// opcional ausente.
type MsgBase = {
  id: string;
  // "agent" aqui significa "nosso lado", não o agente de IA. Quem separa pessoa
  // de robô é o porAgente abaixo.
  from: "lead" | "agent" | "system";
  agent?: string;
  // Enviada pelo agente de IA, não por uma pessoa. Muda o avatar da bolha.
  porAgente?: boolean;
  time: string;
  date: string;
  read?: boolean;
  /**
   * Id da mensagem NO PROVEDOR. É o que se manda para citar, apagar ou
   * encaminhar; o `id` acima é o nosso uuid e não serve para nada disso.
   * Nulo nas mensagens antigas, gravadas antes de a gente guardar esse id.
   */
  messageId?: string | null;
  /** O que esta mensagem cita, quando cita alguma. */
  citacao?: { messageId: string; preview: string } | null;
  /**
   * Quando foi apagada no WhatsApp. A mensagem continua na conversa, com o
   * conteúdo trocado por um aviso -- apagar de verdade destruiria o histórico
   * do atendimento, que é o registro que o CRM existe para guardar.
   */
  apagadaEm?: string | null;
  /**
   * Rótulos dos botões que foram enviados junto desta mensagem.
   *
   * Existem para o ATENDENTE ver o que foi oferecido ao contato -- no
   * WhatsApp o botão é clicável, aqui é registro. Sem isso, a resposta
   * "Agendar consulta inicial" chegava sem contexto nenhum na tela.
   */
  botoes?: string[] | null;
};

type Msg =
  | (MsgBase & { kind: "text";   text: string })
  | (MsgBase & { kind: "audio";  duration: string; src?: string })
  | (MsgBase & { kind: "image";  src: string; caption?: string })
  | (MsgBase & { kind: "file";   filename: string; url?: string })
  | (MsgBase & { kind: "system"; text: string });

// 10 linhas de 20px. Acima disso a caixa rola em vez de continuar crescendo:
// sem teto, uma mensagem longa empurra a conversa inteira para fora da tela.
const ALTURA_MAX_MENSAGEM = 200;

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
  answered?: boolean; // true assim que o atendente envia a 1ª mensagem na conversa (ver bumpPreview)
};

// wabaId só existe na Cloud API, e serve para listar os modelos de mensagem
// aprovados quando a janela de 24h fecha.
type ZApiInstance = { instanceId: string; token: string; clientToken: string; phone: string; label: string; provider: "zapi" | "dapi" | "cloud_api"; wabaId?: string | null };

/* ── emoji list ───────────────────────────────────────────────────────── */

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


// Monta uma mensagem chegada via realtime respeitando o tipo. Antes, toda mensagem
// era renderizada como texto — áudio/imagem/documento não apareciam. Mensagens
// from_me (enviadas por automação, outro membro ou outro dispositivo) entram como
// "agent" com o nome de quem enviou.
function buildIncomingMsg(
  m: { id?: string; body?: string; type?: string; media_url?: string; from_me?: boolean; sender_name?: string; sent_by_agent?: boolean; buttons?: unknown },
  timeStr: string,
): Msg {
  // Os botões acompanham a mensagem também aqui, e não só no carregamento do
  // histórico: sem isto, a mensagem da automação chegava ao vivo sem as opções
  // e elas só apareciam depois de recarregar a tela.
  const botoes = Array.isArray(m.buttons) ? (m.buttons as string[]) : null;
  const base = m.from_me
    ? { id: m.id as string, from: "agent" as const, agent: m.sender_name ?? (m.sent_by_agent ? "Agente" : "Automação"), porAgente: !!m.sent_by_agent, time: timeStr, date: "Hoje", read: true, botoes }
    : { id: m.id as string, from: "lead" as const, time: timeStr, date: "Hoje", read: false, botoes };
  if (m.type === "audio")    return { ...base, kind: "audio" as const, duration: parseAudioDuration(m.body), src: m.media_url ?? undefined };
  if (m.type === "image")    return { ...base, kind: "image" as const, src: m.media_url ?? "", caption: m.body ?? "" };
  if (m.type === "document") return { ...base, kind: "file"  as const, filename: m.body ?? "arquivo", url: m.media_url ?? undefined };
  return { ...base, kind: "text" as const, text: m.body ?? "" };
}

// Linha crua de whatsapp_conversations -> shape usado no estado local. Extraído
// de reloadConversations pra ser reaproveitado também pelo listener realtime
// (waconv-global) -- mesma tradução de campos nos dois lugares, um só dono.
type DbConvRow = { id: string; owner_id?: string; company_id?: string; instance_id?: string; name: string; preview: string; last_msg_at: string; channel: Channel; tags: string[] | null; company_name?: string; email?: string; phone?: string; value?: number; pipeline?: string; deal_number?: string; read?: boolean; contact_id?: string };
function mapConvRow(r: DbConvRow): Conversation {
  return {
    id: r.id, name: r.name, preview: r.preview,
    time: new Date(r.last_msg_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    channel: r.channel as Channel, tags: r.tags ?? [],
    company: r.company_name ?? undefined, email: r.email ?? undefined,
    phone: r.phone ?? undefined, value: r.value ?? undefined,
    pipeline: r.pipeline ?? undefined, dealNumber: r.deal_number ?? undefined,
    instanceId: r.instance_id ?? undefined,
    lastMsgAt: r.last_msg_at ?? undefined,
    contactId: r.contact_id ?? undefined,
  };
}

type DbConvStateRow = { stage_idx?: number; meeting_date?: string; meeting_time?: string; meeting_owner?: string; meeting_note?: string; notes?: string; read?: boolean; finished?: boolean; assigned_to?: string; department_id?: string; answered?: boolean };
function mapConvState(r: DbConvStateRow): Omit<ConvState, "messages"> {
  return {
    stageIdx: r.stage_idx ?? 0,
    meeting:  r.meeting_date ? { date: r.meeting_date, time: r.meeting_time ?? "", owner: r.meeting_owner ?? "", note: r.meeting_note ?? "" } : null,
    notes:    r.notes ?? "",
    read:     r.read ?? true,
    finished: r.finished ?? false,
    assignedTo: r.assigned_to ?? undefined,
    departmentId: r.department_id ?? undefined,
    answered: r.answered ?? false,
  };
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

const LEAD_ORIGINS: LeadOrigin[] = ["Instagram", "Facebook Ads", "Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "YouTube Ads", "Email Marketing", "Orgânico", "WhatsApp", "Evento", "Indicação", "Site", "Outro"];

// Campos da aba Perfil do painel de detalhes (Multiatendimento) -- mesmos 7
// campos e mesma ordem do Perfil em LeadDrawer.tsx (aberto a partir de /leads).
const PROFILE_FIELD_DEFS: { key: string; label: string; type?: "text" | "email" | "tel"; options?: string[] }[] = [
  { key: "nome",      label: "Nome" },
  { key: "empresa",   label: "Empresa" },
  { key: "email",     label: "E-mail", type: "email" },
  { key: "telefone",  label: "Telefone", type: "tel" },
  { key: "documento", label: "Documento" },
  { key: "origem",    label: "Origem", options: LEAD_ORIGINS },
  { key: "site",      label: "Site" },
];

// Mesma timeline de atividades do LeadDrawer.tsx (aba Histórico) -- mesmos
// ícones/cores por tipo, pra ficar idêntico ao que abre em /leads.
const ACT_META: Record<ActivityType, { color: string; bg: string; label: string; Icon: LucideIcon }> = {
  note:         { color: "#666",    bg: "#F5F5F5", label: "Anotação",        Icon: StickyNote },
  stage_change: { color: "#378ADD", bg: "#EBF3FC", label: "Etapa alterada",  Icon: ArrowRightLeft },
  whatsapp:     { color: "#128A68", bg: "#E6F5F0", label: "WhatsApp",        Icon: MessageCircle },
  won:          { color: "#22C55E", bg: "#DCFCE7", label: "Ganho",           Icon: Trophy },
  lost:         { color: "#EF4444", bg: "#FEE2E2", label: "Perdido",         Icon: XCircle },
  created:      { color: "#888",    bg: "#F5F5F5", label: "Criado",          Icon: PlusCircle },
  meeting:      { color: "#378ADD", bg: "#EBF3FC", label: "Reunião",         Icon: CalendarDays },
  call:         { color: "#22C55E", bg: "#DCFCE7", label: "Ligação",         Icon: Phone },
  email:        { color: "#F59E0B", bg: "#FEF3C7", label: "E-mail",          Icon: Mail },
  follow_up:    { color: "#8B5CF6", bg: "#EDE9FE", label: "Follow-up",       Icon: RefreshCw },
  task:         { color: "#666",    bg: "#F5F5F5", label: "Tarefa",          Icon: CheckSquare },
  transfer:     { color: "#8B5CF6", bg: "#EDE9FE", label: "Transferência",   Icon: ArrowLeftRight },
};
const fmtHistDate = (d: string) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Mesmo padrão de click-to-edit do InlineField em LeadDrawer.tsx, reaproveitado
// aqui pras abas Perfil/Endereço/Campos do painel de detalhes do Multiatendimento.
function MuInlineField({ label, value, onSave, type = "text", options }: {
  label: React.ReactNode; value?: string | null; onSave?: (v: string) => void;
  type?: "text" | "email" | "tel"; options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const editable = !!onSave;

  useEffect(() => { setDraft(value ?? ""); }, [value]);
  useEffect(() => { if (editing) (inputRef.current as HTMLInputElement)?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (onSave && draft !== (value ?? "")) onSave(draft);
  };

  return (
    <div>
      <span style={{ fontSize: 10, color: "#AAA", display: "block", marginBottom: 2 }}>{label}</span>
      {editing && editable ? (
        options ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            style={{ width: "100%", border: "1px solid #128A68", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", background: "#FFF", color: "#111" }}
          >
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            style={{ width: "100%", border: "1px solid #128A68", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none" }}
          />
        )
      ) : (
        <div
          onClick={() => editable && setEditing(true)}
          style={{ fontSize: 13, color: value ? "#111" : "#AAA", cursor: editable ? "pointer" : "default", padding: "5px 0" }}
        >
          {value || "—"}
        </div>
      )}
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
      <button onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", width: iconOnly ? undefined : "100%", gap: iconOnly ? 0 : 5, background: "#FFF", border, borderRadius: 5, padding: iconOnly ? 4 : "4px 10px 4px 4px", fontSize: 12, cursor: "pointer" }}>
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


function DealValueField({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? String(value) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value ? String(value) : ""); }, [value]);
  useEffect(() => { if (editing) requestAnimationFrame(() => inputRef.current?.focus()); }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = Number(draft.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
    if (parsed !== value) onSave(parsed);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value ? String(value) : ""); setEditing(false); }
        }}
        className="h-8 rounded-md text-xs focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
      />
    );
  }
  return (
    <div
      className="rounded-md px-2 py-1.5 -mx-2 cursor-text hover:bg-[#F5F5F5] transition-colors"
      onClick={() => setEditing(true)}
      style={{ fontSize: 14, fontWeight: 700, color: value ? "#128A68" : "#AAAAAA" }}
    >
      {value ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value) : "Definir valor"}
    </div>
  );
}

/* ── main page ─────────────────────────────────────────────────────────── */
export default function MultiatendimentoPage() {
  const { user } = useAuth();
  const { company, whatsappConnections } = useCompany();
  const { profile } = useProfile();
  const nomeAtendente = useNomeAtendente();
  // Escopo multi-tenant: todas as conversas/mensagens são da EMPRESA selecionada
  // (owner da empresa), não do usuário logado — que pode ser membro de várias empresas.
  const tenantId = company?.owner_id ?? null;
  const navigate = useNavigate();
  const location = useLocation();
  const { leads, pipelines, activePipeline, moveLead, crmTags, addLead, nextDealNumber, updateLead, crmLists, addLeadToList, removeLeadFromList, addActivity, teamMembers, memberEmails, memberAvatars, memberColors, memberUserIds, currentUserName, products, customFieldGroups } = useCRM();
  const { can, isOwner: isCompanyOwner } = usePermissions();
  const isMuAdmin = isCompanyOwner || can("multiatendimento:admin");
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
  // Filtros que existem hoje. Serve para descartar valor salvo de chip removido:
  // quem estava com o antigo "Follow-up" selecionado tem "alert" no
  // localStorage, e sem esta guarda abriria numa aba que não existe mais, com
  // título "Todas as conversas" e contagem que não bate com nenhum chip aceso.
  const FILTROS_VALIDOS = ["", "not_started", "waiting", "pending", "agente", "done"];
  const [activeFilter, setActiveFilter] = useState<string>(() => {
    try {
      const salvo = localStorage.getItem(activeFilterKey(user?.id, tenantId)) ?? "";
      return FILTROS_VALIDOS.includes(salvo) ? salvo : "";
    } catch { return ""; }
  });
  const [searchQuery, setSearchQuery] = useState("");
  // Rascunho por conversa — cada conversa é uma janela própria (igual WhatsApp
  // Web/celular), então o texto não digitado ainda não pode vazar de uma
  // conversa pra outra ao trocar. Mantém a mesma API de useState (aceita string
  // ou função updater) pra não precisar mexer em nenhum dos call sites.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const inputValue = drafts[activeId] ?? "";
  const setInputValue = (value: string | ((prev: string) => string)) => {
    setDrafts(prev => {
      const cur = prev[activeId] ?? "";
      const next = typeof value === "function" ? (value as (p: string) => string)(cur) : value;
      return { ...prev, [activeId]: next };
    });
  };
  const [convStates, setConvStates] = useState<Record<string, ConvState>>({});

  /** Atendimento aberto da conversa selecionada, para o número no cabeçalho. */
  const [atendimentoAtivo, setAtendimentoAtivo] = useState<{ numero: number; status: string } | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // ── anotação rich-text (mesmo editor contentEditable + toolbar de
  // LeadDetailPage.tsx, sem o @mention -- fora do escopo aqui).
  const notesDivRef = useRef<HTMLDivElement>(null);
  const [notesActive, setNotesActive] = useState(false);
  const [notesActiveFormats, setNotesActiveFormats] = useState<Set<string>>(new Set());
  const checkNoteFormats = () => {
    const cmds = ["bold", "italic", "underline", "insertUnorderedList", "insertOrderedList"];
    const active = new Set(cmds.filter(c => { try { return document.queryCommandState(c); } catch { return false; } }));
    setNotesActiveFormats(active);
  };
  const applyNoteFormat = (cmd: string) => {
    document.execCommand(cmd, false);
    checkNoteFormats();
  };

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
      // Mesma guarda da leitura inicial: descarta chip que não existe mais.
      const filtroSalvo = localStorage.getItem(activeFilterKey(user?.id, tenantId)) ?? "";
      setActiveFilter(FILTROS_VALIDOS.includes(filtroSalvo) ? filtroSalvo : "");
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
  const [runningAutomation, setRunningAutomation] = useState(false);

  // nova conversa
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");


  // Z-API instances
  const [instances, setInstances] = useState<ZApiInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [instanceOpen, setInstanceOpen] = useState(false);

  // Visibilidade de conversas por atendente (multiatendimento_attendant_settings,
  // chaveada por user_id). Configurada por um admin na aba "Atendentes" das
  // configurações. Sem linha pro usuário = defaults (ambas regras desligadas).
  type AttendantVisibility = { allowSeeOthers: boolean; hideUnassigned: boolean };
  const [attendantSettings, setAttendantSettings] = useState<Record<string, AttendantVisibility>>({});
  useEffect(() => {
    if (!company?.id) return;
    supabase.from("multiatendimento_attendant_settings")
      .select("user_id, allow_see_others_convs, hide_unassigned_convs")
      .eq("company_id", company.id)
      .then(({ data, error }) => {
        if (error) { console.error("Erro ao carregar visibilidade de atendentes:", error.message); return; }
        const map: Record<string, AttendantVisibility> = {};
        (data ?? []).forEach(r => {
          map[r.user_id as string] = { allowSeeOthers: !!r.allow_see_others_convs, hideUnassigned: !!r.hide_unassigned_convs };
        });
        setAttendantSettings(map);
      });
  }, [company?.id]);

  // Grava (upsert) a visibilidade de UM atendente -- chamado pelos toggles da
  // aba "Atendentes", só acessível a quem tem multiatendimento:admin (RLS
  // também bloqueia a escrita pra quem não for admin/dono, isso aqui é só a
  // UI já não deixar chegar nesse ponto).
  function saveAttendantSetting(userId: string, patch: Partial<AttendantVisibility>) {
    setAttendantSettings(prev => ({
      ...prev,
      [userId]: { allowSeeOthers: false, hideUnassigned: false, ...prev[userId], ...patch },
    }));
    if (!company?.id) return;
    const next = { allowSeeOthers: false, hideUnassigned: false, ...attendantSettings[userId], ...patch };
    supabase.from("multiatendimento_attendant_settings")
      .upsert({
        company_id: company.id,
        user_id: userId,
        allow_see_others_convs: next.allowSeeOthers,
        hide_unassigned_convs: next.hideUnassigned,
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id,user_id" })
      .then(({ error }) => { if (error) { console.error("saveAttendantSetting:", error.message); toast.error("Erro ao salvar configuração do atendente."); } });
  }

  // ── profile pictures cache ───────────────────────────────────────────
  const [convAvatars, setConvAvatars] = useState<Record<string, string>>({});
  const fetchingAvatars = useRef<Set<string>>(new Set());

  const avatarRetried = useRef<Set<string>>(new Set());

  async function fetchAvatar(phone: string, instanceId?: string, force = false) {
    // Prefere a instância da própria conversa; cai para a primeira conectada.
    const inst = (instanceId && instances.find(i => i.instanceId === instanceId)) || instances[0];
    if (!inst || !phone) return;
    const p = somenteDigitos(phone);
    if (!p || fetchingAvatars.current.has(p) || (!force && convAvatars[p])) return;
    fetchingAvatars.current.add(p);
    try {
      // Transporte em @/lib/whatsappAvatar: a chamada ao provedor e a leitura do
      // campo eram idênticas aqui e lá, e o comentário de lá já dizia isso
      // ("mesmo endpoint/lógica que MultiatendimentoPage já usa"). O que fica
      // nesta página é só o cache e o controle de tentativas, que são dela.
      const url = await fetchWhatsappAvatar(p, inst, force);
      if (url) setConvAvatars(prev => ({ ...prev, [p]: url }));
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
  // idem, pra saber (dentro do listener global) se a mensagem que chegou é da
  // conversa que o atendente está com a janela aberta agora mesmo — se estiver,
  // não deve virar "Aguardando", o atendente já está vendo.
  const activeIdRef    = useRef<string>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

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

  // ── botões "+ Lead" / "+ Negócio" -- reaproveitam os mesmos popups de
  // /leads (LeadModal e o Dialog "Criar negócio" do menu (...) de cada linha,
  // extraído em CreateDealDialog) em vez de um formulário próprio inline.
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [leadModalPrefill, setLeadModalPrefill] = useState<{ name?: string; whatsapp?: string; personId?: string }>({});
  const [dealTargetLead, setDealTargetLead] = useState<Lead | null>(null);
  const [dealContactTarget, setDealContactTarget] = useState<Contact | null>(null);

  // ── dialog de agendamento ────────────────────────────────────────────
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showFollowupDialog, setShowFollowupDialog] = useState(false);

  // ── dialog de transferência ──────────────────────────────────────────
  const [showTransferDialog, setShowTransferDialog] = useState(false);

  // ── painel de detalhes (Perfil/Endereço/Campos), mesmo modelo do LeadDrawer
  const [muDetailsTab, setMuDetailsTab] = useState<"perfil" | "endereco" | "campos">("perfil");
  // ── vincular a negócio existente (quando nenhum negócio resolve pra essa
  // conversa) -- busca por nome entre os leads da empresa, mesmo componente
  // do "Nova conversa" (NewConvDialog), só com outro onSelect.
  const [showLinkExistingDialog, setShowLinkExistingDialog] = useState(false);

  // ── confirmação de troca de etapa -- mesma regra do Pipeline/LeadDetailPage
  // (Voltar/Avançar/dropdown nunca move direto; sempre confirma antes).
  // Avançar pulando várias etapas de uma vez pede uma confirmação por etapa.
  const [pendingStageAdvance, setPendingStageAdvance] = useState<{
    steps: { colId: string; colTitle: string }[];
    currentStep: number;
    leadId: string;
  } | null>(null);
  const [pendingStageBack, setPendingStageBack] = useState<{
    fromId: string; fromTitle: string;
    toId: string; toTitle: string;
  } | null>(null);
  useEffect(() => { setPendingStageAdvance(null); setPendingStageBack(null); }, [activeId]);
  // Citação pendente não sobrevive à troca de conversa: mandar na conversa
  // errada é pior que perder a citação.
  useEffect(() => { setCitando(null); setMenuDaMsg(null); }, [activeId]);

  // Apagar depende do provedor: a Meta não permite apagar mensagem já enviada
  // pela API oficial, em nenhuma circunstância. Não é limitação nossa, então o
  // item aparece cinza com a explicação em vez de sumir.
  const podeApagar = instances.find(i => i.instanceId === selectedInstance)?.provider !== "cloud_api";

// Encaminha para outra conversa: manda pelo provedor da linha DE DESTINO e
  // grava lá. A linha importa: cada conversa pertence a um número, e mandar
  // pelo provedor da conversa de origem entregaria a mensagem de um número que
  // o destinatário não conhece.
  async function encaminharPara(destino: Conversation) {
    const m = encaminhando;
    if (!m || !destino.phone) return;
    const inst = instances.find(i => i.instanceId === destino.instanceId) ?? instances.find(i => i.instanceId === selectedInstance);
    if (!inst?.token) { toast.error("A conexão dessa conversa não está ativa."); return; }

    setEnviandoEncaminho(true);
    try {
      const telefone = destino.phone.replace(/\D/g, "");
      // Mídia vai como mídia, não como o nome do arquivo em texto: encaminhar
      // uma imagem e o contato receber "foto.jpg" seria pior que não encaminhar.
      const carga: WaMsg =
        m.kind === "image" && m.src ? { kind: "image", phone: telefone, url: m.src }
        : m.kind === "file" && m.url ? { kind: "document", phone: telefone, url: m.url, fileName: m.filename, ext: (m.filename.split(".").pop() ?? "pdf").toLowerCase() }
        : m.kind === "audio" && m.src ? { kind: "audio", phone: telefone, url: m.src }
        : { kind: "text", phone: telefone, message: textoDaMensagem(m) };

      const idNoProvedor = await sendWa(inst as ZapiCreds, carga);

      const { error } = await supabase.from("whatsapp_messages").insert({
        owner_id: tenantId,
        company_id: company?.id ?? null,
        instance_id: inst.instanceId,
        phone: telefone,
        from_me: true,
        body: m.kind === "text" || m.kind === "system" ? m.text : m.kind === "file" ? m.filename : m.kind === "image" ? (m.caption ?? "") : m.duration,
        type: m.kind === "system" ? "text" : m.kind,
        media_url: m.kind === "image" ? m.src : m.kind === "file" ? m.url : m.kind === "audio" ? m.src : null,
        momment: Date.now(),
        sender_name: nomeAtendente,
        message_id: idNoProvedor,
        conversation_id: destino.id,
      });
      if (error) {
        console.error("[encaminhar] insert:", error);
        toast.error("Encaminhada, mas não salva no histórico.");
      } else {
        toast.success(`Encaminhada para ${convName(destino)}`);
      }
      setEncaminhando(null);
      setBuscaDestino("");
    } catch (e) {
      toast.error(`Não consegui encaminhar: ${(e as Error).message}`);
    } finally {
      setEnviandoEncaminho(false);
    }
  }

  async function apagarMensagem(m: Msg, paraTodos: boolean) {
    if (!activeId) return;
    const inst = instances.find(i => i.instanceId === selectedInstance);
    // Conexão e id do provedor só são necessários para alcançar o celular do
    // contato. "Para mim" é uma marcação nossa e funciona sem nada disso --
    // inclusive nas mensagens antigas, que nunca tiveram id gravado.
    if (paraTodos && (!inst?.token || !m.messageId || !active?.phone)) return;

    try {
      // "Para mim" não chama o provedor: some daqui e pronto. Além de simples,
      // é o que torna a opção possível na linha oficial, onde apagar no WhatsApp
      // é proibido pela Meta.
      if (paraTodos) {
        await apagarMensagemWhatsapp({ messageId: m.messageId!, telefone: active!.phone!, conexao: inst!, paraTodos });
      }

      const agora = new Date().toISOString();
      // Marca, não remove: o corpo continua no banco e a bolha passa a mostrar o
      // aviso. Apagar a linha destruiria o histórico do atendimento.
      const { error } = await supabase
        .from("whatsapp_messages")
        .update({ deleted_at: agora, deleted_by: nomeAtendente })
        .eq("id", m.id);
      if (error) console.error("[apagar] marcar no banco:", error);

      setConvStates(prev => {
        const atual = prev[activeId];
        if (!atual) return prev;
        return { ...prev, [activeId]: { ...atual, messages: atual.messages.map(mm => mm.id === m.id ? { ...mm, apagadaEm: agora } : mm) } };
      });
      toast.success(paraTodos ? "Mensagem apagada para todos" : "Mensagem apagada");
    } catch (e) {
      toast.error(`Não consegui apagar: ${(e as Error).message}`);
    }
  }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadQuickMessages(); }, [company?.owner_id]);

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
  // Mensagem que está sendo respondida. Fica por conversa: trocar de conversa
  // com uma citação pendente e mandar na conversa errada seria pior que perder
  // a citação.
  const [citando, setCitando]             = useState<Msg | null>(null);
  const [msgSobreMouse, setMsgSobreMouse] = useState<string | null>(null);
  // Menu aberto de uma mensagem. Só um por vez, e fecha ao clicar em qualquer
  // lugar: menu de mensagem que fica preso na tela atrapalha mais que ajuda.
  const [menuDaMsg, setMenuDaMsg]         = useState<string | null>(null);
  // Para qual lado o menu abre. A conversa rola e a mensagem mais recente fica
  // colada no rodapé, então abrir sempre para baixo corta o menu na borda da
  // lista -- que foi exatamente o que apareceu no uso.
  const [menuParaCima, setMenuParaCima]   = useState(false);
  // Mensagem escolhida para encaminhar, aguardando o destino.
  const [encaminhando, setEncaminhando]   = useState<Msg | null>(null);
  const [buscaDestino, setBuscaDestino]   = useState("");
  const [enviandoEncaminho, setEnviandoEncaminho] = useState(false);
  const [showFiles, setShowFiles]         = useState(false);
  const [recording, setRecording]         = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [aiLoading, setAiLoading]         = useState(false);
  const fileInputRef       = useRef<HTMLInputElement>(null);
  const mediaRecorderRef   = useRef<Recorder | null>(null);
  const recordingCancelledRef = useRef(false);
  const recordingTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeRef   = useRef(0); // ref para evitar closure stale no onstop
  // Throttle do indicador "digitando": lastTypingAt evita reenviar "typing" a
  // cada tecla, pauseTimer dispara "paused" depois de alguns segundos parado.
  const typingRef = useRef<{ lastTypingAt: number; pauseTimer: ReturnType<typeof setTimeout> | null }>({ lastTypingAt: 0, pauseTimer: null });

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

  // Uma conversa fica "desconectada" quando o instanceId dela não bate com
  // nenhuma conexão WhatsApp *realmente utilizável* hoje. Não basta a linha
  // existir: connected/active também importam (mesmo critério de `instances`,
  // usado pra decidir quem pode enviar) — a sessão pode cair do lado do
  // celular sem a linha ser apagada (dapi-webhook trata o evento
  // connection.status atualizando só `connected`, sem deletar nada). Instagram
  // usa meta_connections, outro sistema — nunca é considerado desconectado aqui.
  const isConvInstanceConnected = (c: Conversation): boolean => {
    if (c.channel !== "whatsapp") return true;
    return whatsappConnections.some(wc => wc.instanceId === c.instanceId && wc.connected && wc.active);
  };

  // Diferente de isConvInstanceConnected (que só olha connected/active numa
  // linha que ainda existe -- uma queda de sessão temporária, que pode voltar
  // sozinha via dapi-webhook), esta verifica se a PRÓPRIA LINHA em
  // whatsapp_connections ainda existe. Reconectar (wizard em Configurações)
  // nunca reaproveita o instance_id antigo -- sempre gera um novo -- e
  // removeWhatsAppConnection apaga a linha de vez. Então, quando a linha não
  // existe mais, essa conversa nunca mais vai ficar ativa de novo (diferente
  // de connected=false numa linha que ainda existe).
  const isConvInstanceGone = (c: Conversation): boolean => {
    if (c.channel !== "whatsapp" || !c.instanceId) return false;
    return !whatsappConnections.some(wc => wc.instanceId === c.instanceId);
  };

  // Entre candidatos do mesmo contato/telefone, prioriza negócio aberto >
  // negócio fechado > lead solto > primeiro que aparecer. dealStatus sozinho
  // não basta pra distinguir negócio de lead solto: os dois nascem com
  // status "open" por padrão no banco (leads_status_check), só quem tem
  // pipelineId preenchido é de fato um negócio.
  const pickBestLead = (candidates: Lead[]): Lead | undefined =>
    candidates.find(l => l.pipelineId && l.dealStatus === "open")
    ?? candidates.find(l => l.pipelineId)
    ?? candidates[0];

  // Etapas reais do pipeline vinculado ao lead ativo.
  // Resolução robusta do lead vinculado a uma conversa, em ordem de confiabilidade:
  //  1) por ID (conversas abertas pelo pipeline usam o id do lead como id da conversa)
  //  2) por contato (contactId) — quando a conversa já tem um contato vinculado,
  //     prioriza um negócio aberto desse contato (ver pickBestLead)
  //  3) por telefone (conversas de WhatsApp têm UUID aleatório como id)
  //  4) por número do negócio (#deal), quando a conversa guarda um deal_number real
  // Unificada para que a UI e o "atrelar tag/lista/atividade" usem exatamente o mesmo lead.
  const resolveLeadForConv = (conv?: Conversation | null): Lead | null => {
    if (!conv) return null;
    if (leads[conv.id]) return leads[conv.id];
    if (conv.contactId) {
      const byContact = Object.values(leads).filter(l => l.personId === conv.contactId);
      const best = pickBestLead(byContact);
      if (best) return best;
    }
    if (conv.phone) {
      const byPhone = Object.values(leads).filter(l => telefonesIguais(l.whatsapp ?? "", conv.phone ?? ""));
      const best = pickBestLead(byPhone);
      if (best) return best;
    }
    const dn = (conv.dealNumber ?? "").replace(/\D/g, "");
    if (dn) {
      const byDeal = Object.values(leads).find(l => String(l.dealNumber ?? "").replace(/\D/g, "") === dn);
      if (byDeal) return byDeal;
    }
    return null;
  };

  // Visibilidade de uma conversa pro usuário logado. Admin (dono da empresa
  // ou multiatendimento:admin) sempre vê tudo. Senão: conversa é "minha" se
  // eu estiver entre os responsáveis do negócio vinculado, ou se o assignedTo
  // (conversa sem negócio ainda) bater com meu nome -- sempre visível. Se for
  // de outro atendente, depende de allowSeeOthers; sem ninguém atribuído,
  // depende de hideUnassigned (default: continua visível).
  const isConvVisibleToMe = (c: Conversation): boolean => {
    if (isMuAdmin) return true;
    const negocio = resolveLeadForConv(c);
    const assignedTo = convStates[c.id]?.assignedTo;
    const mine = (!!negocio?.pipelineId && (negocio.responsibles ?? []).includes(currentUserName))
      || (!!assignedTo && assignedTo === currentUserName);
    if (mine) return true;
    const mySettings = user ? attendantSettings[user.id] : undefined;
    if (assignedTo) return !!mySettings?.allowSeeOthers;
    return !mySettings?.hideUnassigned;
  };

  const effectiveLead  = resolveLeadForConv(active);
  // Responsável é propriedade exclusiva do negócio (nunca do Lead solto) --
  // hasNegocio distingue "resolveu pra um negócio de verdade" de "resolveu
  // só pro Lead solto", o que effectiveLead sozinho não garante.
  const hasNegocio      = !!effectiveLead?.pipelineId;

  // Perfil/Endereço/Campos (painel de detalhes) -- mesma fonte de dado do
  // Telefone logo abaixo: sem negócio vinculado, só mostra o que já está na
  // conversa (quando existe) e nenhum campo é editável.
  const getProfileFieldValue = (key: string): string | undefined => {
    switch (key) {
      case "nome":      return effectiveLead?.name    || active?.name;
      case "empresa":   return effectiveLead?.company  || active?.company;
      case "email":     return effectiveLead?.email    || active?.email;
      case "telefone":  return effectiveLead?.whatsapp || active?.phone;
      case "documento": return effectiveLead?.document;
      case "origem":    return effectiveLead?.origin;
      case "site":      return effectiveLead?.site;
      default:          return undefined;
    }
  };
  const getProfileFieldOnSave = (key: string): ((v: string) => void) | undefined => {
    if (!hasNegocio || !effectiveLead) return undefined;
    const id = effectiveLead.id;
    switch (key) {
      case "nome":      return v => updateLead(id, { name: v });
      case "empresa":   return v => updateLead(id, { company: v });
      case "email":     return v => updateLead(id, { email: v });
      // Corrige o telefone do NEGÓCIO (leads.whatsapp), nunca o da conversa --
      // conv.phone é o que a busca de histórico usa pra achar as mensagens
      // (phoneVariants sobre whatsapp_messages), então mudar ele faria o
      // histórico já trocado sumir da tela. resolveLeadForConv recalcula o
      // vínculo por telefone a cada render, então salvar aqui já revincula a
      // conversa certa na hora, sem precisar de nenhum passo extra.
      case "telefone":  return v => {
        let digits = v.replace(/\D/g, "");
        if (!digits) { toast.error("Informe um telefone válido."); return; }
        if (!digits.startsWith("55")) digits = "55" + digits;
        updateLead(id, { whatsapp: `+${digits}` });
      };
      case "documento": return v => updateLead(id, { document: v });
      case "origem":    return v => updateLead(id, { origin: v as LeadOrigin });
      case "site":      return v => updateLead(id, { site: v });
      default:          return undefined;
    }
  };
  // Quando há lead vinculado, ele é a fonte da verdade das tags (mesmas em todas as
  // conversas/instâncias do lead); sem lead, usa as tags da própria conversa.
  const convTags       = effectiveLead?.tags ?? active?.tags ?? [];

  // Anotações da conversa → gravadas como atividade "note" no negócio vinculado,
  // ficando visíveis na aba Anotações do card do negócio na pipeline.
  const addNote = () => {
    const html = DOMPurify.sanitize(notesDivRef.current?.innerHTML ?? "");
    if (!html.trim() || html === "<br>") return;
    if (!effectiveLead) {
      toast.error("Esta conversa não está vinculada a um negócio.");
      return;
    }
    addActivity(effectiveLead.id, {
      type: "note",
      date: new Date().toISOString(),
      description: html,
      userName: nomeAtendente,
    });
    if (notesDivRef.current) notesDivRef.current.innerHTML = "";
    setNotesActive(false);
    toast.success("Anotação adicionada ao negócio.");
  };

  const linkedPipeline = effectiveLead?.pipelineId ? (pipelines ?? []).find(p => p.id === effectiveLead.pipelineId) : null;
  const pipelineCols   = linkedPipeline?.columns ?? [];
  const activeStages   = pipelineCols.length > 0 ? pipelineCols.map(c => c.title) : PIPELINE_STAGES;
  const rawColIdx      = pipelineCols.length > 0 ? pipelineCols.findIndex(c => c.id === effectiveLead?.stage) : -1;
  const activeStageIdx = pipelineCols.length > 0 ? (rawColIdx >= 0 ? rawColIdx : 0) : (cs?.stageIdx ?? 0);

  // ── Janela de 24h da Cloud API ───────────────────────────────────────
  // Regra da Meta: passadas 24h da última mensagem DO CLIENTE, o WhatsApp
  // oficial recusa texto livre e só aceita modelo aprovado. Vale só para
  // cloud_api; D-API e Z-API não têm essa restrição.
  //
  // O corte é calculado no banco, não a partir das mensagens já na tela: o
  // tipo Msg guarda só hora e dia formatados para exibição ("14:07", "Hoje"),
  // que não dão para comparar com precisão de 24 horas.
  const [janelaFechaEm, setJanelaFechaEm] = useState<Date | null>(null);
  const [enviandoModelo, setEnviandoModelo] = useState(false);
  // Cresce a caixa conforme o texto. Zera a altura antes de medir, senão o
  // scrollHeight nunca diminui e a caixa fica grande depois de apagar texto.
  const campoMensagemRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = campoMensagemRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, ALTURA_MAX_MENSAGEM) + "px";
  }, [inputValue]);
  const [modelosAbertos, setModelosAbertos] = useState(false);

  useEffect(() => {
    const inst = instances.find(i => i.instanceId === selectedInstance);
    if (!activeId || inst?.provider !== "cloud_api" || !active?.phone || !company?.id) {
      setJanelaFechaEm(null);
      return;
    }
    let cancelado = false;
    (async () => {
      // Por conversation_id, não por variantes de telefone. A janela de 24h é
      // por conversa, e o telefone casava também com mensagens de OUTRA linha
      // do mesmo contato -- o que podia liberar o campo de texto com base numa
      // mensagem que chegou num número diferente daquele em que se vai responder.
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("conversation_id", activeId)
        .eq("from_me", false)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelado) return;
      const ultima = data?.[0]?.created_at as string | undefined;
      setJanelaFechaEm(ultima ? new Date(new Date(ultima).getTime() + 24 * 60 * 60_000) : null);
    })();
    return () => { cancelado = true; };
    // cs?.messages.length entra de propósito: mensagem nova do cliente chegando
    // pelo realtime reabre a janela, e a tela precisa trocar o seletor de
    // modelos pela caixa de texto na hora.
  }, [activeId, selectedInstance, instances, active?.phone, company?.id, cs?.messages.length]);

  const instanciaAtual = instances.find(i => i.instanceId === selectedInstance);
  // Fechada também quando o contato NUNCA escreveu: nesse caso não existe
  // janela para estar aberta, e a Meta recusa texto livre do mesmo jeito.
  const janelaModeloFechada = instanciaAtual?.provider === "cloud_api"
    && !cs?.finished
    && (!janelaFechaEm || janelaFechaEm.getTime() <= Date.now());

  // ── carregar conversas do Supabase (carga inicial + botão atualizar) ─
  const [conversationsRefreshing, setConversationsRefreshing] = useState(false);

  async function reloadConversations() {
    if (!user || !tenantId) return;

    const mapRow = mapConvRow;
    const mapState = (r: DbConvStateRow): ConvState => ({ messages: [], ...mapConvState(r) });

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
      existingRows.map(r => `${r.instance_id ?? ""}|${normalizarTelefoneBr(r.phone ?? "")}`),
    );

    // Agrupa por (instância, telefone normalizado): cada número é uma conversa
    // separada; pega a mensagem mais recente de cada par ainda sem conversa.
    type WaMsgRow = { phone: string; instance_id?: string; type?: string; chat_name?: string; sender_name?: string; body?: string; momment?: number; created_at?: string };
    const convMap = new Map<string, WaMsgRow>();
    for (const m of msgs) {
      if (m.type === "system") continue; // mensagem de sistema não cria conversa
      const key = `${m.instance_id ?? ""}|${normalizarTelefoneBr(m.phone)}`;
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
    // upsert + ignoreDuplicates (não insert puro): essa reconciliação pode
    // rodar ao mesmo tempo que o handler de realtime abaixo tentando criar a
    // mesma conversa (mesmo owner_id+instance_id+phone) — com insert simples,
    // a constraint única faria o lote inteiro falhar; com upsert, só a linha
    // conflitante é ignorada e o resto do lote persiste normalmente.
    supabase.from("whatsapp_conversations")
      .upsert(dbRows, { onConflict: "owner_id,instance_id,phone", ignoreDuplicates: true })
      .then(async ({ error: e }) => {
        if (e) { console.error("Reconciliação de conversas — erro:", e); return; }
        // Vincula as mensagens que motivaram a criação.
        //
        // Sem isto a reconciliação criava a conversa e deixava as mensagens
        // soltas -- o que não incomodava enquanto a tela casava por telefone,
        // mas passa a incomodar muito agora que ela lê por conversation_id: a
        // conversa apareceria na lista e abriria VAZIA.
        //
        // Relê o id em vez de usar o gerado aqui: com ignoreDuplicates, quem
        // perdeu a corrida não teve sua linha inserida, e o id do cliente não
        // corresponde a nada no banco.
        for (const row of dbRows) {
          const variantes = variantesDeTelefone(row.phone);
          if (!variantes.length) continue;
          const { data: conv } = await supabase
            .from("whatsapp_conversations")
            .select("id")
            .eq("owner_id", row.owner_id)
            .eq("instance_id", row.instance_id ?? "")
            .in("phone", variantes)
            .limit(1)
            .maybeSingle();
          if (!conv?.id) continue;
          await supabase
            .from("whatsapp_messages")
            .update({ conversation_id: conv.id })
            .is("conversation_id", null)
            .eq("owner_id", row.owner_id)
            .eq("instance_id", row.instance_id ?? "")
            .in("phone", variantes);
        }
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
      // Descendente + inverter, mesmo motivo do histórico de WhatsApp logo
      // abaixo: ascendente com limite congela a conversa no centésimo recado.
      q.order("sent_at", { ascending: false }).limit(2000).then(({ data }) => {
        if (!data?.length) return;
        const msgs: Msg[] = [...data].reverse().map(m => {
          const d = new Date(m.sent_at);
          const isToday     = d.toDateString() === new Date().toDateString();
          const isYesterday = d.toDateString() === new Date(Date.now() - 86400000).toDateString();
          const dateLabel = isToday ? "Hoje" : isYesterday ? "Ontem" : d.toLocaleDateString("pt-BR");
          const isFromMe = m.direction === "out";
          const base = {
            id:    m.id,
            from:  (isFromMe ? "agent" : "lead") as "agent" | "lead",
            agent: isFromMe ? (nomeAtendente) : undefined,
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
    // Histórico pelo VÍNCULO, não por casamento de telefone.
    //
    // Antes eram três condições empilhadas para dizer "as mensagens desta
    // conversa": owner, instância, e um OR com as quatro variantes do telefone
    // mais o próprio id da conversa (para as mensagens de sistema, que gravam o
    // id na coluna phone). Cada uma dessas era uma chance de errar, e o filtro de
    // instância só era aplicado quando a conversa tinha uma.
    //
    // A equivalência entre as duas formas foi conferida linha a linha antes da
    // troca: 209 de 209 conversas devolvem exatamente o mesmo conjunto.
    // Ordem DESCENDENTE com o limite, e inverte depois.
    //
    // Com `ascending: true` + limit(100), o que vinha eram as 100 mensagens mais
    // ANTIGAS: passando de 100, a conversa congelava para sempre no centésimo
    // recado e nenhuma mensagem nova aparecia mais, nem ao recarregar. Cinco
    // conversas reais já estavam nesse estado quando isso foi descoberto, a
    // maior com 119 mensagens.
    //
    // O teto é 2000 e não 100 porque o limite antigo protegia contra nada: a
    // MAIOR conversa da base tem 119 mensagens e pesa 31 KB (265 bytes por
    // linha, medido). 2000 é 17x isso, ~530 KB, e a lista não é virtualizada,
    // então esse é o ponto em que o render começaria a pesar de verdade.
    //
    // Ele existe só como rede contra dado patológico (um laço de automação
    // gerando dezenas de milhares de mensagens), não como economia. Se um dia
    // for atingido, o corte cai no COMEÇO do histórico, que é o lado certo.
    // Passar disso pede paginação com "carregar mais", não um limite maior.
    // Atendimento da conversa aberta. É o número dele que vai no cabeçalho,
    // não o do negócio: são coisas diferentes e o cabeçalho mostrava a errada.
    // Um contato pode ter dez atendimentos ao longo do tempo e um só negócio,
    // ou negócio nenhum.
    // O mais recente, seja qual for o estado. Filtrar por "não finalizado"
    // faria o número sumir do cabeçalho assim que o atendente finalizasse, e é
    // justamente aí que ele quer conferir qual acabou de fechar.
    supabase
      .from("atendimentos")
      .select("numero, status")
      .eq("conversation_id", activeId)
      .order("aberto_em", { ascending: false })
      .limit(1)
      .then(({ data }) => setAtendimentoAtivo(data?.[0] ?? null));

    supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        if (!data?.length) return;
        const msgs: Msg[] = [...data].reverse().map(m => {
          const d = new Date(m.momment ?? m.created_at);
          const isToday     = d.toDateString() === new Date().toDateString();
          const isYesterday = d.toDateString() === new Date(Date.now() - 86400000).toDateString();
          const dateLabel = isToday ? "Hoje" : isYesterday ? "Ontem" : d.toLocaleDateString("pt-BR");
          const base = {
            id:    m.id,
            from:  (m.from_me ? "agent" : "lead") as "agent" | "lead",
            agent: m.from_me ? (m.sender_name ?? (m.sent_by_agent ? "Agente" : nomeAtendente)) : undefined,
            porAgente: !!m.sent_by_agent,
            messageId: (m.message_id as string | null) ?? null,
            apagadaEm: (m.deleted_at as string | null) ?? null,
            // Retrato gravado na entrada. Preferimos ele ao texto da mensagem
            // original porque nem toda citada existe na nossa base: 707
            // mensagens antigas foram gravadas sem o id do provedor, e uma
            // citação a elas não resolve para linha nenhuma.
            citacao: m.reply_to_message_id
              ? { messageId: m.reply_to_message_id as string, preview: (m.reply_to_preview as string | null) ?? "" }
              : null,
            time:  d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            date:  dateLabel,
            read:  true as const,
            botoes: Array.isArray(m.buttons) ? (m.buttons as string[]) : null,
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
    if (!active?.instanceId || active.instanceId === selectedInstance) return;
    // Só adota a conexão da conversa se ela ainda EXISTE para este usuário.
    //
    // Sem essa checagem, uma conversa criada por uma conexão que não está mais
    // disponível (removida, ou de outra empresa) deixava selectedInstance
    // apontando para o nada: o envio falhava com "número desconectado" e a tela
    // mandava escolher outra conexão, enquanto o cabeçalho já exibia uma
    // conexão válida. Beco sem saída. Caindo na primeira conexão disponível, a
    // conversa continua utilizável.
    const existe = instances.some(i => i.instanceId === active.instanceId);
    setSelectedInstance(existe ? active.instanceId : (instances[0]?.instanceId ?? ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.instanceId, instances]);

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
          const m = payload.new as { id?: string; owner_id?: string; instance_id?: string; from_me: boolean; phone?: string; body?: string; chat_name?: string; sender_name?: string; sent_by_agent?: boolean; momment?: number; created_at?: string; type?: string; media_url?: string };
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
              c.id === msgPhone || (telefonesIguais(c.phone ?? "", msgPhone) && (!c.instanceId || !msgInst || c.instanceId === msgInst))
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
            telefonesIguais(c.phone ?? "", msgPhone) && (!c.instanceId || !msgInst || c.instanceId === msgInst)
          );

          const previewLabel = previewLabelFor(m.type, m.body);
          if (existing) {
            const nowIso = d.toISOString();
            // "Aguardando" só faz sentido se o atendente NÃO está com essa
            // conversa aberta na tela agora — se estiver, ele já está vendo a
            // resposta do lead em tempo real, não precisa de aviso no chip.
            const isActiveConv = existing.id === activeIdRef.current;
            const nextRead = m.from_me ? true : isActiveConv;
            // Atualiza preview, lastMsgAt (ordenação por atividade recente) e time
            setConvList(prev => prev.map(c =>
              c.id === existing.id ? { ...c, preview: previewLabel, time: timeStr, lastMsgAt: nowIso } : c
            ));
            // Adiciona a mensagem no estado da conversa se já estiver carregada
            setConvStates(prev => {
              const cur = prev[existing.id];
              if (!cur) return prev;
              if (cur.messages.some(x => x.id === m.id)) return prev;
              const newMsg: Msg = buildIncomingMsg(m, timeStr);
              return { ...prev, [existing.id]: { ...cur, messages: [...cur.messages, newMsg], read: nextRead } };
            });
            // Atualiza preview, timestamp e lido no banco
            supabase.from("whatsapp_conversations").update({
              preview: previewLabel, last_msg_at: nowIso, read: nextRead,
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
            }).then(async ({ error }) => {
              if (!error) return;
              // 23505 (owner_id+instance_id+phone): outro disparo quase simultâneo
              // desse mesmo handler (2 mensagens chegando a poucos ms uma da outra)
              // já criou a conversa antes desta — reconcilia em cima da que venceu
              // em vez de deixar 2 conversas locais apontando pra 1 só no banco.
              if (error.code === "23505" && msgInst) {
                const { data: winner } = await supabase
                  .from("whatsapp_conversations")
                  .select("*")
                  .eq("owner_id", tenantId)
                  .eq("instance_id", msgInst)
                  .eq("phone", msgPhone)
                  .maybeSingle();
                const winnerId = (winner as { id: string } | null)?.id;
                if (winnerId && winnerId !== newId) {
                  const isActiveConv = winnerId === activeIdRef.current || newId === activeIdRef.current;
                  const nextRead = m.from_me ? true : isActiveConv;
                  setConvList(prev => {
                    const withoutDup = prev.filter(c => c.id !== newId);
                    return withoutDup.map(c => c.id === winnerId ? { ...c, preview: previewLabel, time: timeStr, lastMsgAt: d.toISOString() } : c);
                  });
                  setConvStates(prev => {
                    const { [newId]: _dup, ...rest } = prev;
                    const cur = rest[winnerId];
                    if (!cur || cur.messages.some(x => x.id === m.id)) return rest;
                    const newMsg: Msg = buildIncomingMsg(m, timeStr);
                    return { ...rest, [winnerId]: { ...cur, messages: [...cur.messages, newMsg], read: nextRead } };
                  });
                  setActiveId(prev => prev === newId ? winnerId : prev);
                }
                return;
              }
              console.error("Erro ao persistir nova conversa:", error);
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // ── realtime: metadados de conversas (whatsapp_conversations) ────────
  // wamsg-global (acima) só reage a mensagem nova -- mudanças feitas direto
  // na conversa por OUTRO atendente/aba (tag, responsável, departamento,
  // negócio vinculado, finalizar) nunca chegavam aqui: só apareciam depois de
  // F5 ou clicar em "Atualizar conversas". Espelha o mesmo padrão do
  // wamsg-global, mas ouvindo a tabela de conversas em vez de mensagens.
  useEffect(() => {
    if (!user || !tenantId) return;

    const ch = supabase
      .channel("waconv-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string; owner_id?: string })?.id;
            const oldOwner = (payload.old as { owner_id?: string })?.owner_id;
            if (oldOwner && oldOwner !== tenantId) return;
            if (oldId) setConvList(prev => prev.filter(c => c.id !== oldId));
            return;
          }
          const r = payload.new as DbConvRow;
          if (r.owner_id !== tenantId) return; // só conversas da empresa selecionada

          setConvList(prev => {
            const idx = prev.findIndex(c => c.id === r.id);
            const mapped = mapConvRow(r);
            if (idx === -1) return [mapped, ...prev];
            const next = [...prev];
            next[idx] = { ...next[idx], ...mapped };
            return next;
          });
          setConvStates(prev => {
            const cur = prev[r.id];
            const mapped = mapConvState(r);
            if (!cur) return { ...prev, [r.id]: { messages: [], ...mapped } };
            return { ...prev, [r.id]: { ...cur, ...mapped } }; // preserva cur.messages
          });
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
            const isActiveConv = existing.id === activeIdRef.current;
            const nextRead = isFromMe ? true : isActiveConv;
            setConvList(prev => prev.map(c => c.id === existing.id ? { ...c, preview: previewText, time: timeStr, lastMsgAt: m.sent_at } : c));
            setConvStates(prev => {
              const cur = prev[existing.id];
              if (!cur) return prev;
              if (cur.messages.some(x => x.id === m.id)) return prev;
              const base = {
                id: m.id,
                from: isFromMe ? "agent" as const : "lead" as const,
                agent: isFromMe ? (nomeAtendente) : undefined,
                time: timeStr, date: "Hoje", read: true as const,
              };
              const newMsg: Msg = { ...base, kind: "text" as const, text: m.content ?? "" };
              return { ...prev, [existing.id]: { ...cur, messages: [...cur.messages, newMsg], read: nextRead } };
            });
            if (!isFromMe) {
              supabase.from("whatsapp_conversations").update({ preview: previewText, last_msg_at: m.sent_at, read: nextRead }).eq("id", existing.id);
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
        wabaId:      c.wabaId ?? null,
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

    // Se já existe conversa para esse lead -- pelo próprio id (conversa já
    // iniciada por aqui antes), OU por telefone (uma conversa real já pode
    // existir com um UUID próprio, criada por uma mensagem de fato trocada no
    // WhatsApp antes de qualquer negócio existir) -- só ativa, nunca cria uma
    // segunda linha pro mesmo contato. Sem esse 2º critério, toda vez que o
    // contato já tinha conversado antes de virar negócio, essa função criava
    // uma conversa "fantasma" (id = leadId) duplicando a real.
    const existing = convList.find(c => c.id === leadId)
      ?? (lead.whatsapp
        ? convList.find(c => c.channel === "whatsapp" && telefonesIguais(c.phone ?? "", lead.whatsapp ?? ""))
        : undefined);
    if (existing) {
      setActiveId(existing.id);
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

    // Dígitos puros (sem "+"), igual ao que dapi/zapi/cloud-api-webhook sempre
    // gravam -- lead.whatsapp vem do LeadModal com "+55" na frente, e guardar
    // esse "+" aqui é o que causava o bug: upsertConversationForMessage (usado
    // por todo webhook) casa telefone por igualdade exata de string, então uma
    // mensagem real chegando depois nunca encontrava esta linha e criava outra.
    const cleanLeadPhone = (lead.whatsapp ?? "").replace(/\D/g, "") || undefined;

    const newConv: Conversation = {
      id: leadId,
      name: lead.name,
      preview: "Nova conversa iniciada",
      time: "agora",
      channel: "whatsapp",
      tags: lead.tags ?? [],
      company: lead.company ?? "—",
      email: lead.email ?? "—",
      phone: cleanLeadPhone,
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
      const { mediaUrl, avisoUpload, idNoProvedor } = await enviarArquivoWhatsapp({
        file,
        telefone: cleanPhone,
        conexao: inst,
        userId: user.id,
      });
      if (avisoUpload) toast.error(`Falha ao salvar o arquivo (não será baixável no chat): ${avisoUpload}`);
      const msgId = crypto.randomUUID(); // mesmo id no otimista e no insert (dedupe realtime)
      const newMsg: Msg = isImage
        ? { id: msgId, from: "agent", agent: nomeAtendente, time: nowTime(), kind: "image", src: mediaUrl ?? URL.createObjectURL(file), caption: file.name, date: "Hoje", read: false }
        : { id: msgId, from: "agent", agent: nomeAtendente, time: nowTime(), kind: "file",  filename: file.name, url: mediaUrl ?? undefined, date: "Hoje", read: false };
      updateCs(activeId, { messages: [...(cs?.messages ?? []), newMsg] });
      bumpPreview(activeId, isImage ? "🖼️ Imagem" : `📎 ${file.name}`);
      // Persiste no banco para histórico futuro
      const { error: insErr } = await inserirMensagemVinculada({
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
        sender_name: nomeAtendente,
        message_id:  idNoProvedor,
      }, activeId);
      if (insErr) { console.error("[file] insert:", insErr); toast.error(`Arquivo enviado, mas não salvo no histórico: ${insErr.message}`); }
      toast.success("Arquivo enviado!", { id: "file-send" });
    } catch (err) {
      toast.error(`Erro ao enviar arquivo: ${(err as Error).message}`, { id: "file-send" });
    }
  }

  async function startRecording() {
    if (cs?.finished) return;
    if (!Recorder.isRecordingSupported()) {
      toast.error("Seu navegador não suporta gravação de áudio.");
      return;
    }
    try {
      // Grava direto em Ogg/Opus via WASM (opus-recorder), não MediaRecorder nativo.
      // O MediaRecorder do navegador produz WebM/Opus — a mensagem chega no
      // WhatsApp, mas o app do destinatário recusa tocar ("peça para reenviar"),
      // porque nota de voz só é aceita em Ogg/Opus, mesmo o codec sendo o mesmo.
      const rec = new Recorder({ encoderPath: "/encoderWorker.min.js" });
      recordingCancelledRef.current = false;
      rec.ondataavailable = arrayBuffer => {
        if (recordingCancelledRef.current) return;
        const blob = new Blob([arrayBuffer], { type: "audio/ogg" });
        void sendAudioBlob(blob, recordingTimeRef.current);
      };
      await rec.start();
      mediaRecorderRef.current = rec;
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
      recordingCancelledRef.current = true;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
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
      // Sobe o áudio para o storage → URL pública (reprodução no chat e histórico)
      let mediaUrl: string | null = null;
      try {
        const path = `${user.id}/audio-${Date.now()}.ogg`;
        const { error: upErr } = await supabase.storage.from("automation-media").upload(path, blob, { upsert: true, contentType: "audio/ogg" });
        if (!upErr) {
          mediaUrl = supabase.storage.from("automation-media").getPublicUrl(path).data.publicUrl;
        } else {
          // Sem este upload o áudio fica sem URL pública → não reproduz no chat
          // e aparece como 00:00. Antes o erro era engolido (só console.warn).
          console.error("[audio] upload storage:", upErr);
          toast.error(`Falha ao salvar o áudio (não tocará no chat): ${upErr.message}`);
        }
      } catch (e) { console.error("[audio] upload storage:", e); toast.error(`Falha ao salvar o áudio: ${(e as Error).message}`); }

      // D-API e Cloud API exigem uma URL pública (diferente da Z-API, que aceita
      // base64 direto) — sem o upload acima ter funcionado, não tem como enviar.
      if ((inst.provider === "cloud_api" || inst.provider === "dapi") && !mediaUrl) {
        throw new Error("Falha ao preparar o áudio para envio (upload)");
      }

      if (inst.provider === "cloud_api") {
        // ── Cloud API (Meta) ────────────────────────────────────────────
        const r = await fetch(
          `https://graph.facebook.com/v21.0/${inst.instanceId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${inst.token}` },
            body: JSON.stringify({ messaging_product: "whatsapp", to: cleanPhone, type: "audio", audio: { link: mediaUrl } }),
          }
        );
        if (!r.ok) {
          const errBody = await r.json().catch(() => ({}));
          throw new Error((errBody as { error?: { message?: string } }).error?.message ?? String(r.status));
        }
      } else if (inst.provider === "dapi") {
        // ── D-API ──────────────────────────────────────────────────────
        const r = await fetch(
          `https://api.d-api.cloud/api/v1/messages/send/audio`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": inst.token },
            body: JSON.stringify({ sessionId: inst.instanceId, to: cleanPhone, audio: mediaUrl }),
          }
        );
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          throw new Error(errText.slice(0, 120) || String(r.status));
        }
      } else {
        // ── Z-API /send-audio espera base64 puro (sem o prefixo data:audio/...;base64,) ──
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
      }
      const msgId = crypto.randomUUID(); // mesmo id no otimista e no insert (dedupe realtime)
      const newMsg: Msg = { id: msgId, from: "agent", agent: nomeAtendente, time: nowTime(), kind: "audio", duration, src: mediaUrl ?? undefined, date: "Hoje", read: false };
      updateCs(activeId, { messages: [...(cs?.messages ?? []), newMsg] });
      bumpPreview(activeId, "🎤 Mensagem de áudio");
      // Persiste no banco para histórico futuro
      const { error: insErr } = await inserirMensagemVinculada({
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
        sender_name: nomeAtendente,
      }, activeId);
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
          companyId: company?.id ?? undefined,
        },
      });

      const result = (data ?? {}) as { suggestion?: string; error?: string };
      if (error || result.error) {
        if (result.error === "not_configured") {
          toast.error("Cadastre a chave da Anthropic em Configurações → Chaves de API para usar a sugestão com IA.");
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

  // Botão "+ Lead" / "+ Negócio": abre o mesmo popup usado em /leads --
  // LeadModal quando a conversa ainda não tem nenhum Lead vinculado (com
  // nome/telefone pré-preenchidos e o contato já resolvido/criado via
  // ensureContactForConversation, pra manter o vínculo
  // whatsapp_conversations.contact_id de antes), ou CreateDealDialog quando
  // já existe um Lead solto e falta só o negócio. Não abre nada com negócio
  // já vinculado -- o botão fica desabilitado nesse caso.
  async function handleOpenLeadOrDealPopup() {
    if (!active || !user || hasNegocio) return;
    if (effectiveLead) {
      setDealTargetLead(effectiveLead);
      return;
    }
    const contactId = await ensureContactForConversation(active);
    // LeadModal separa DDI (+55) do número local -- active.phone normalmente
    // já vem com o 55 na frente (mesmo formato salvo pelos webhooks), então
    // precisa tirar daqui, senão o campo local mostra o 55 duplicado.
    const rawPhone = (active.phone ?? "").replace(/\D/g, "");
    const localPhone = rawPhone.length > 11 && rawPhone.startsWith("55") ? rawPhone.slice(2) : rawPhone;
    setLeadModalPrefill({ name: convName(active), whatsapp: localPhone, personId: contactId });
    setShowLeadModal(true);
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

  // Garante a presença de uma tag sem removê-la se já existir (usado pro
  // auto-tagging do Follow up) — mesma lógica dual lead/conversa do
  // toggleConvTag acima, só que idempotente na direção "adicionar".
  async function ensureConvTag(tagName: string) {
    if (!activeId || !active) return;
    const linkedLead = resolveLeadForConv(active);

    if (linkedLead) {
      const leadTags = linkedLead.tags ?? [];
      if (leadTags.includes(tagName)) return;
      const nextTags = [...leadTags, tagName];
      await updateLead(linkedLead.id, { tags: nextTags });
      const siblingIds = convList.filter(c => resolveLeadForConv(c)?.id === linkedLead.id).map(c => c.id);
      const ids = siblingIds.length > 0 ? siblingIds : [activeId];
      setConvList(prev => prev.map(c => ids.includes(c.id) ? { ...c, tags: nextTags } : c));
      await supabase.from("whatsapp_conversations").update({ tags: nextTags }).in("id", ids);
    } else {
      const current = active.tags ?? [];
      if (current.includes(tagName)) return;
      const next = [...current, tagName];
      setConvList(prev => prev.map(c => c.id === activeId ? { ...c, tags: next } : c));
      await supabase.from("whatsapp_conversations").update({ tags: next }).eq("id", activeId);
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
    if ("answered" in meta) dbPatch.answered = meta.answered;
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
      telefonesIguais(c.phone ?? "", active.phone ?? "") &&
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
  // Único ponto por onde passam todos os envios (texto/áudio/imagem/arquivo) —
  // por isso também é aqui que marcamos read:true (chip "Em aberto" = sem
  // mensagem pendente). Não seta answered: sair de "Não iniciadas" é só pelo
  // botão "Iniciar atendimento" (markAsRead) -- responder sozinho não tira a
  // conversa dali, por design.
  function bumpPreview(convId: string, label: string) {
    const now = nowTime();
    const nowIso = new Date().toISOString();
    setConvList(prev => prev.map(c => c.id === convId ? { ...c, preview: label, time: now, lastMsgAt: nowIso } : c));
    // read:true explícito -- a última mensagem passou a ser do atendente, então
    // por definição a conversa não pode continuar em "Aguardando".
    setConvStates(prev => ({ ...prev, [convId]: { ...DEFAULT_CS, ...prev[convId], read: true } }));
    supabase.from("whatsapp_conversations")
      .update({ preview: label, last_msg_at: nowIso, read: true })
      .eq("id", convId)
      .then(({ error }) => { if (error) console.warn("bumpPreview:", error.message); });
  }

  // D-API/Z-API/Cloud API ocasionalmente têm hiccups transitórios do lado
  // deles (ex.: "NATS MQ Provider not ready" — fila interna momentaneamente
  // indisponível) que se resolvem sozinhos em alguns segundos -- confirmado
  // em produção (mesmo erro visto de novo horas depois de resolvido da 1ª
  // vez). 1 tentativa extra com 1.5s não bastava pra cobrir esses casos, então
  // agora são até 2 tentativas extras com backoff crescente (1.5s, 3s) antes
  // de desistir; devolve a última Response (ok ou não) pra quem chama
  // continuar lendo o corpo do erro normalmente.
  async function fetchWithRetry(url: string, opts: RequestInit, retries = 2, baseDelayMs = 1500): Promise<Response> {
    let lastRes: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, baseDelayMs * attempt));
      try {
        const res = await fetch(url, opts);
        if (res.ok) return res;
        lastRes = res;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastRes) return lastRes;
    throw lastErr;
  }

  // Indicador "digitando...". Confirmado por teste direto contra a API
  // (POST /chats/presence, body {sessionId,to,presence:"typing"|"paused"}) que
  // só a D-API expõe isso hoje — Z-API não tem endpoint de envio de presence,
  // e a Cloud API usa outro mecanismo (amarrado ao id de uma mensagem recebida,
  // não um toggle livre), por isso fica de fora por ora. Best-effort: nunca
  // deve travar nem avisar o usuário, é só humanizar a conversa.
  function sendTypingPresence(state: "typing" | "paused") {
    const inst = instances.find(i => i.instanceId === selectedInstance);
    if (inst?.provider !== "dapi" || !inst.token || active?.channel !== "whatsapp" || !active?.phone) return;
    const cleanPhone = active.phone.replace(/\D/g, "");
    fetch(`https://api.d-api.cloud/api/v1/chats/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": inst.token },
      body: JSON.stringify({ sessionId: inst.instanceId, to: cleanPhone, presence: state }),
    }).catch(e => console.warn("sendTypingPresence:", e));
  }

  // Chamado a cada tecla no campo de mensagem. Manda "typing" no máximo 1x a
  // cada 3s (evita martelar a API a cada caractere) e agenda "paused" pra 4s
  // de inatividade — sem isso o "digitando..." ficaria preso na tela do cliente.
  function handleTypingActivity() {
    const t = typingRef.current;
    const now = Date.now();
    if (now - t.lastTypingAt > 3000) {
      t.lastTypingAt = now;
      sendTypingPresence("typing");
    }
    if (t.pauseTimer) clearTimeout(t.pauseTimer);
    t.pauseTimer = setTimeout(() => {
      sendTypingPresence("paused");
      t.lastTypingAt = 0;
    }, 4000);
  }

  async function sendMessage() {
    if (!inputValue.trim() || !activeId) return;
    const text = inputValue.trim();

    // Pré-checagem pro WhatsApp (Instagram usa outro mecanismo de envio, mais
    // abaixo). Sem isso, uma conexão inválida/desconectada fazia a mensagem
    // otimista "aparecer enviada" na tela e sumir ao recarregar — nunca foi de
    // fato enviada nem persistida em whatsapp_messages, e nada avisava o usuário.
    if (active?.channel !== "instagram") {
      if (!active?.phone) {
        toast.error("Não foi possível enviar: esta conversa não tem um telefone associado.");
        return;
      }
      const instCheck = instances.find(i => i.instanceId === selectedInstance);
      if (!instCheck?.token) {
        toast.error(
          instances.length === 0
            ? "Nenhuma conexão WhatsApp está ativa. Conecte um número para continuar."
            : "O número usado nesta conversa está desconectado. Selecione outra conexão para continuar."
        );
        setInstanceOpen(true);
        return;
      }
    }

    // Congela a citação no início do envio. Sem isto, o código depende de o
    // `citando` do closure sobreviver ao setCitando(null) mais abaixo -- o que é
    // verdade em React, mas é sutil demais para deixar implícito num fluxo com
    // três provedores no meio.
    const citada = citando;

    // Mesmo UUID na mensagem otimista e no insert — o listener realtime deduplica
    // por id (sem isso, a própria mensagem voltaria duplicada via realtime).
    const msgId = crypto.randomUUID();
    const msg: Msg = {
      id: msgId,
      from: "agent",
      agent: nomeAtendente,
      time: nowTime(),
      kind: "text",
      text,
      date: "Hoje",
      read: false,
      // A citação precisa aparecer na hora. Sem isto a bolha saía como mensagem
      // comum e só virava resposta depois de recarregar a conversa -- o dado
      // estava certo no banco, mas quem acabou de responder via o contrário.
      citacao: citada?.messageId
        ? { messageId: citada.messageId, preview: textoDaMensagem(citada).slice(0, 300) }
        : null,
    };
    updateCs(activeId, { messages: [...(cs?.messages ?? []), msg] });
    bumpPreview(activeId, text);
    setInputValue("");
    setCitando(null);

    // Mensagem já está saindo — não faz sentido continuar mostrando "digitando".
    if (typingRef.current.pauseTimer) { clearTimeout(typingRef.current.pauseTimer); typingRef.current.pauseTimer = null; }
    typingRef.current.lastTypingAt = 0;
    sendTypingPresence("paused");

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
      // Antes, o histórico era gravado (e a bolha ficava com ✓) mesmo quando a
      // chamada ao provedor falhava — a mensagem nunca chegava ao destinatário
      // mas nada além de um toast passageiro indicava isso, e não havia como
      // saber depois que aquele envio específico tinha falhado. sendOk decide
      // se persistimos de verdade; se não, desfaz a bolha otimista.
      let sendOk = false;
      // Id que o provedor atribui a esta mensagem. Guardar e o que permite
      // citar, apagar e encaminhar depois; ate agora era descartado.
      let idNoProvedor: string | null = null;

      // ── Cloud API (Meta) ────────────────────────────────────────────
      if (inst.provider === "cloud_api") {
        try {
          const res = await fetchWithRetry(
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
                // Citação da Meta. Só entra quando há o que citar; sem o campo
                // o corpo fica idêntico ao de antes.
                ...(citada?.messageId ? { context: { message_id: citando.messageId } } : {}),
              }),
            }
          );
          if (res.ok) {
            sendOk = true;
            idNoProvedor = await lerIdDoEnvio(res, "cloud-api");
          } else {
            const err = await res.json().catch(() => ({}));
            toast.error(`Erro ao enviar mensagem: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
          }
        } catch {
          toast.error("Falha ao enviar mensagem via WhatsApp Cloud API");
        }
      } else if (inst.provider === "dapi") {
        // ── D-API ──────────────────────────────────────────────────────
        try {
          const res = await fetchWithRetry(
            `https://api.d-api.cloud/api/v1/messages/send/text`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": inst.token,
              },
              body: JSON.stringify({
                sessionId: inst.instanceId, to: cleanPhone, text,
                ...(citada?.messageId ? { contextInfo: { stanzaId: citando.messageId } } : {}),
              }),
            }
          );
          if (res.ok) {
            sendOk = true;
            idNoProvedor = await lerIdDoEnvio(res, "d-api");
          } else {
            const err = await res.text().catch(() => "");
            toast.error(`Erro ao enviar mensagem: ${err.slice(0, 120) || res.status}`);
          }
        } catch {
          toast.error("Falha ao enviar mensagem via D-API");
        }
      } else {
        // ── Z-API ──────────────────────────────────────────────────────
        try {
          const res = await fetchWithRetry(
            `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/send-text`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(inst.clientToken ? { "Client-Token": inst.clientToken } : {}),
              },
              body: JSON.stringify({
                phone: cleanPhone, message: text,
                ...(citada?.messageId ? { messageId: citando.messageId } : {}),
              }),
            }
          );
          if (res.ok) {
            sendOk = true;
            idNoProvedor = await lerIdDoEnvio(res, "z-api");
          } else {
            const err = await res.json().catch(() => ({}));
            toast.error(`Erro ao enviar mensagem: ${(err as { message?: string }).message ?? res.status}`);
          }
        } catch {
          toast.error("Falha ao enviar mensagem via WhatsApp");
        }
      }

      if (!sendOk) {
        // Desfaz a bolha otimista — a mensagem nunca saiu, não faz sentido
        // deixá-la na tela com ✓ nem gravar no histórico como se tivesse ido.
        updateCs(activeId, { messages: (cs?.messages ?? []).filter(mm => mm.id !== msgId) });
        return;
      }

      // Persiste no banco para histórico futuro
      if (user) {
        const { error: sendPersistError } = await inserirMensagemVinculada({
          id:          msgId,
          owner_id:    tenantId,
          company_id:  company?.id ?? null,
          instance_id: inst.instanceId,
          phone:       cleanPhone,
          from_me:     true,
          body:        text,
          type:        "text",
          momment:     Date.now(),
          sender_name: nomeAtendente,
          message_id:  idNoProvedor,
          // Guarda a citação também do nosso lado, para a bolha renderizar sem
          // depender de a mensagem citada existir na base.
          reply_to_message_id: citada?.messageId ?? null,
          reply_to_preview: citada ? textoDaMensagem(citada).slice(0, 300) : null,
        }, activeId);
        if (sendPersistError) {
          console.error("[Multiatendimento] Falha ao persistir mensagem enviada:", sendPersistError);
          toast.error("Mensagem enviada, mas houve erro ao salvar no histórico.");
        }
        // Leva o id do provedor para a mensagem que já está na tela. Sem isso a
        // mensagem recém-enviada fica sem o botão de responder até recarregar,
        // porque o botão só aparece em quem tem id.
        if (idNoProvedor) {
          // Forma funcional, não updateCs: o estado que interessa é o de AGORA,
          // não o capturado no início do envio -- entre a bolha otimista e esta
          // linha passou uma ida ao provedor e outra ao banco, e mensagem nova
          // pode ter chegado no meio.
          setConvStates(prev => {
            const atual = prev[activeId];
            if (!atual) return prev;
            return {
              ...prev,
              [activeId]: {
                ...atual,
                messages: atual.messages.map(mm => mm.id === msgId ? { ...mm, messageId: idNoProvedor } : mm),
              },
            };
          });
        }
      }
    }
  }

  // Envio de MODELO, o único caminho possível com a janela de 24h fechada.
  //
  // Espelha o sendMessage de propósito, em vez de reaproveitá-lo: o payload é
  // outro (type: "template", com nome, idioma e componentes) e o corpo que vai
  // para o banco é o texto RESOLVIDO, não o modelo cru. Quem abrir a conversa
  // amanhã precisa ler "sua consulta é terça às 15h", não "{{1}} às {{2}}".
  async function enviarModelo(modelo: Modelo, valores: Record<string, string>, textoResolvido: string) {
    if (!activeId || !active?.phone) return;
    const inst = instances.find(i => i.instanceId === selectedInstance);
    if (!inst?.token) { toast.error("Conexão sem token."); return; }

    // Dígitos como estão, IGUAL aos outros quatro envios desta tela (texto,
    // imagem, áudio, presença). Aqui usava a primeira variante normalizada, que
    // é o núcleo DDD+8 SEM o código do país: a Meta recebia 4891152442 no lugar
    // de 5548991152442 e recusava o envio. Nunca apareceu porque a conta ainda
    // não tinha modelo aprovado para exercitar este caminho.
    const cleanPhone = active.phone.replace(/\D/g, "");
    const msgId = crypto.randomUUID();
    setEnviandoModelo(true);

    try {
      const numeradas = Object.keys(valores).sort((a, b) => Number(a) - Number(b));
      const res = await fetch(`https://graph.facebook.com/v21.0/${inst.instanceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${inst.token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "template",
          template: {
            name: modelo.name,
            language: { code: modelo.language },
            ...(numeradas.length
              ? { components: [{ type: "body", parameters: numeradas.map(n => ({ type: "text", text: valores[n] })) }] }
              : {}),
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Erro ao enviar modelo: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
        return;
      }
      // Modelo é sempre Cloud API, onde o id vem em messages[0].id.
      const idNoProvedor = await lerIdDoEnvio(res, "cloud-api");

      updateCs(activeId, {
        messages: [...(cs?.messages ?? []), {
          id: msgId, from: "agent", agent: nomeAtendente,
          time: nowTime(), kind: "text", text: textoResolvido, date: "Hoje", read: false,
        }],
      });
      bumpPreview(activeId, textoResolvido);

      if (user) {
        const { error } = await inserirMensagemVinculada({
          id: msgId, owner_id: tenantId, company_id: company?.id ?? null,
          instance_id: inst.instanceId, phone: cleanPhone, from_me: true,
          body: textoResolvido, type: "text", momment: Date.now(),
          sender_name: nomeAtendente,
          message_id: idNoProvedor,
        }, activeId);
        if (error) {
          console.error("[Multiatendimento] Falha ao persistir modelo enviado:", error);
          toast.error("Modelo enviado, mas houve erro ao salvar no histórico.");
        }
      }
      // O modelo enviado NÃO reabre a janela: quem reabre é a resposta do
      // cliente. Só a próxima mensagem dele libera o texto livre de novo.
      toast.success("Modelo enviado");
    } catch {
      toast.error("Falha ao enviar o modelo.");
    } finally {
      setEnviandoModelo(false);
    }
  }

  // Iniciar atendimento. Único gatilho que tira uma conversa de "Não
  // iniciadas" -- por design, enviar mensagem (bumpPreview) não faz isso
  // sozinho, só este clique.
  //
  // Escreve nas DUAS camadas de propósito. A conversa guarda `answered`, que é
  // o que os chips leem; o atendimento guarda o status, que é o que o dashboard
  // vai ler. Sem esta linha os dois chegariam ao mesmo estado por caminhos
  // diferentes e poderiam discordar -- e discordância entre duas telas do mesmo
  // produto é impossível de explicar para quem opera.
  async function markAsRead(id: string) {
    updateCs(id, { read: true, answered: true });
    // `answered` acima já some com o botão na hora. Este estado é o que o
    // cabeçalho usa para descrever o atendimento ("#1202 · em aberto"), e sem
    // atualizá-lo o rótulo continuaria dizendo "aguardando alguém pegar"
    // depois do clique, até trocar de conversa.
    if (id === activeIdRef.current) {
      setAtendimentoAtivo(prev => (prev ? { ...prev, status: "em_atendimento" } : prev));
    }
    toast.success("Atendimento iniciado");

    const { error } = await supabase
      .from("atendimentos")
      .update({ status: "em_atendimento" })
      .eq("conversation_id", id)
      .eq("status", "aguardando");
    if (error) console.error("[multiatendimento] iniciar atendimento:", error);
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
      contactId = await upsertContact({
        companyId: company.id,
        ownerId: tenantId,
        name: convName(conv),
        phone: conv.phone,
      });
    }
    if (!contactId) return undefined;

    const sameContact = convList.filter(c => c.channel === "whatsapp" && telefonesIguais(c.phone ?? "", conv.phone ?? ""));
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

    const sameContact = convList.filter(c => c.channel === "whatsapp" && telefonesIguais(c.phone ?? "", conv.phone ?? ""));
    setConvList(prev => prev.map(c => sameContact.some(x => x.id === c.id) ? { ...c, contactId } : c));
    await supabase.from("whatsapp_conversations").update({ contact_id: contactId }).in("id", sameContact.map(c => c.id));
  }

  useEffect(() => {
    if (active) linkContactIfAlreadyKnown(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, convList]);

  // Responsável é propriedade do negócio -- por isso exige um negócio
  // vinculado (hasNegocio) e grava em leads.responsibles, não mais um
  // assigned_to solto por conversa. assigned_to em whatsapp_conversations
  // continua existindo (é o que os chips leem), mas passa a ser só um
  // espelho do responsável do negócio, atualizado em TODAS as conversas
  // desse negócio de uma vez -- antes só a conversa ativa era atualizada.
  /** Nome exibido → id do membro. Comparação normalizada: há nome gravado com
   *  espaço sobrando e com caixa diferente. Null quando não é membro. */
  function idDoMembro(nome: string | null | undefined): string | null {
    const alvo = (nome ?? "").trim().toLowerCase();
    if (!alvo) return null;
    const achado = Object.keys(memberUserIds).find(n => n.trim().toLowerCase() === alvo);
    return achado ? memberUserIds[achado] : null;
  }

  async function handleTransfer(memberNames: string[]) {
    if (!activeId || !user) return;
    const linkedLead = resolveLeadForConv(active);
    if (!linkedLead?.pipelineId) {
      toast.error("Crie um negócio pra essa conversa antes de atribuir um responsável.");
      return;
    }
    const fromName = nomeAtendente;
    const primary = memberNames[0] ?? "";
    const sysText = memberNames.length > 0
      ? `Responsável do negócio atualizado para ${memberNames.join(", ")} por ${fromName}`
      : `Responsável do negócio removido por ${fromName}`;
    const timeStr = nowTime();

    // Conversas-alvo: TODAS as conversas do mesmo negócio (uma por instância). O
    // responsável é do negócio, então todas devem refletir o mesmo valor.
    const targets = convList.filter(c => resolveLeadForConv(c)?.id === linkedLead.id);
    if (active && !targets.some(c => c.id === activeId)) targets.push(active);

    for (const conv of targets) {
      const msgId = crypto.randomUUID();
      const sysMsg: Msg = { id: msgId, from: "system", time: timeStr, kind: "system", text: sysText, date: "Hoje" };
      setConvStates(prev => {
        const cur = prev[conv.id] ?? DEFAULT_CS;
        if (cur.messages.some(x => x.id === msgId)) return prev;
        return { ...prev, [conv.id]: { ...cur, messages: [...cur.messages, sysMsg], assignedTo: primary || undefined } };
      });
      // Persiste com a INSTÂNCIA da conversa — a query de histórico filtra por phone + instance_id.
      const phoneForSystem = (conv.phone ?? "").replace(/\D/g, "") || conv.id;
      inserirMensagemVinculada({
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
      }, conv.id).then(({ error }) => { if (error) console.error("Erro ao salvar evento de transferência:", error); });
      // Grava o id junto do nome: é o id que segura o vínculo quando a pessoa
      // troca o nome em Meu perfil. Sem ele, renomear desligava o atendente de
      // todas as conversas dele.
      supabase.from("whatsapp_conversations")
        .update({ assigned_to: primary || null, assigned_to_user_id: idDoMembro(primary) })
        .eq("id", conv.id)
        .then(({ error }) => { if (error) console.error("handleTransfer assignedTo:", error); });
    }

    // Responsável do negócio + atividade FIXA (evento de sistema, não anotação editável).
    await updateLead(linkedLead.id, { responsibles: memberNames, responsible: primary });
    addActivity(linkedLead.id, {
      type: "transfer",
      date: new Date().toISOString(),
      description: sysText,
      userName: fromName,
    });

    toast.success(memberNames.length > 0 ? `Responsável atualizado: ${memberNames.join(", ")}` : "Responsável removido");
    setShowTransferDialog(false);
  }

  // Cobre o caso em que NENHUM negócio resolve pra essa conversa (nem por id,
  // contato, telefone ou nº do negócio) mas o atendente reconhece, pelo nome/
  // contexto da mensagem, que na verdade é um negócio que já existe no
  // pipeline com outro telefone -- mesma correção manual feita hoje pros 5
  // casos da Samantha, só que buscando o lead certo em vez de já saber o id.
  async function handleLinkExistingLead(leadId: string) {
    if (!active?.phone) return;
    const digits = active.phone.replace(/\D/g, "");
    if (!digits) return;
    await updateLead(leadId, { whatsapp: `+${digits}` });
    toast.success("Negócio vinculado a esta conversa.");
    setShowLinkExistingDialog(false);
  }

  // Ponto único pro Voltar/Avançar/dropdown de etapa -- mesma regra do
  // Pipeline (arrastar card) e do LeadDetailPage (clicar direto na etapa):
  // nunca move na hora, sempre abre confirmação primeiro. Avançar pulando
  // etapas pede uma confirmação por etapa (steps), igual ao board.
  function handleStageClick(colId: string) {
    if (!effectiveLead || pipelineCols.length === 0) return;
    if (colId === effectiveLead.stage) return;
    const fromIdx = pipelineCols.findIndex(c => c.id === effectiveLead.stage);
    const toIdx   = pipelineCols.findIndex(c => c.id === colId);
    if (fromIdx === -1 || toIdx === -1) return;
    const fromCol = pipelineCols[fromIdx];
    const toCol   = pipelineCols[toIdx];
    if (toIdx < fromIdx) {
      setPendingStageBack({ fromId: fromCol.id, fromTitle: fromCol.title, toId: toCol.id, toTitle: toCol.title });
      return;
    }
    const steps = pipelineCols.slice(fromIdx, toIdx + 1).map(c => ({ colId: c.id, colTitle: c.title }));
    setPendingStageAdvance({ steps, currentStep: 0, leadId: effectiveLead.id });
  }

  function handleConfirmStageAdvance() {
    if (!pendingStageAdvance) return;
    const { steps, currentStep, leadId } = pendingStageAdvance;
    const from = steps[currentStep];
    const to   = steps[currentStep + 1];
    moveLead(leadId, from.colId, to.colId, 0);
    addActivity(leadId, {
      date: new Date().toISOString(),
      type: "stage_change",
      description: `Movido de "${from.colTitle}" para "${to.colTitle}".`,
      userName: nomeAtendente,
    });
    if (currentStep + 1 === steps.length - 1) {
      toast.success(`Etapa alterada para ${to.colTitle}`);
      setPendingStageAdvance(null);
    } else {
      setPendingStageAdvance({ ...pendingStageAdvance, currentStep: currentStep + 1 });
    }
  }

  function handleConfirmStageBack() {
    if (!pendingStageBack || !effectiveLead) return;
    moveLead(effectiveLead.id, pendingStageBack.fromId, pendingStageBack.toId, 0);
    addActivity(effectiveLead.id, {
      date: new Date().toISOString(),
      type: "stage_change",
      description: `Movido de "${pendingStageBack.fromTitle}" para "${pendingStageBack.toTitle}".`,
      userName: nomeAtendente,
    });
    toast.success(`Etapa alterada para ${pendingStageBack.toTitle}`);
    setPendingStageBack(null);
  }

  // ── filter ──────────────────────────────────────────────────────────
  // Resolve o lead vinculado à conversa — delega para resolveLeadForConv
  // (mesma resolução usada no resto do arquivo, agora ciente de contactId).
  const convLead = (c: Conversation) => resolveLeadForConv(c) ?? undefined;

  // Fase 3: aplica a visibilidade por atendente só nas listas que aparecem na
  // tela (contadores dos chips, lista principal, "outras conversas do
  // contato"). Operações internas (handleTransfer, sync de tags etc.)
  // continuam usando convList puro -- não faz sentido pular conversas que o
  // usuário atual não pode ver, senão dados de outros atendentes parariam de
  // ser sincronizados corretamente.
  const visibleConvList = useMemo(
    () => convList.filter(c => !isConvInstanceGone(c) && isConvVisibleToMe(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convList, convStates, isMuAdmin, currentUserName, attendantSettings, user, leads, whatsappConnections]
  );

  // Outras conversas do mesmo contato (ex: falou por um número antigo e por um
  // novo). Filtra sobre convList (já carregado inteiro por reloadConversations,
  // com contactId mapeado) em vez de uma query própria — se um dia convList
  // passar a paginar, isso precisa virar um select direto por contact_id.
  const otherContactConvs = useMemo(() => {
    if (!active?.contactId) return [];
    return visibleConvList
      .filter(c => c.contactId === active.contactId && c.id !== active.id)
      .sort((a, b) => (b.lastMsgAt ? new Date(b.lastMsgAt).getTime() : 0) - (a.lastMsgAt ? new Date(a.lastMsgAt).getTime() : 0));
  }, [visibleConvList, active?.contactId, active?.id]);

  const filteredConversations = useMemo(() => {
    let list = visibleConvList;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => convName(c).toLowerCase().includes(q) || (c.phone ?? "").includes(q) || c.preview.toLowerCase().includes(q));
    }
    // "Não iniciadas" -> "Abertas"/"Aguardando" depende de já ter respondido
    // (answered, setado em bumpPreview quando o atendente manda a 1ª mensagem
    // na conversa), não de ter um responsável atribuído (assignedTo depende de
    // ter negócio vinculado -- boa parte das conversas respondidas nunca
    // recebeu um negócio, e ficava presa em "Não iniciadas" pra sempre).
    switch (activeFilter) {
      case "not_started": list = list.filter(c => !convStates[c.id]?.answered && !convStates[c.id]?.finished && isConvInstanceConnected(c)); break;
      case "pending":      list = list.filter(c => !!convStates[c.id]?.answered && !convStates[c.id]?.finished && !!convStates[c.id]?.read && isConvInstanceConnected(c)); break;
      case "waiting":      list = list.filter(c => !!convStates[c.id]?.answered && !convStates[c.id]?.finished && !convStates[c.id]?.read && isConvInstanceConnected(c)); break;
      case "done":         list = list.filter(c => convStates[c.id]?.finished); break;
      case "agente":       list = list.filter(c => c.tags.includes("Agente")); break;
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
  }, [searchQuery, activeFilter, convStates, visibleConvList, leads, whatsappConnections, fltDepts, fltAgents, fltInstances, fltTags, fltPipeline, fltStages, fltWindow, fltDateFrom, fltDateTo, fltOrder]);

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
    // O id acompanha aqui também, senão a atribuição em massa criaria conversas
    // que voltam a perder o atendente quando ele troca o nome no perfil.
    bulkApply(
      { assignedTo: agent },
      { assigned_to: agent, assigned_to_user_id: idDoMembro(agent) },
      `Atendente atribuído a ${selectedConvs.length} conversa(s).`,
    );
    setBulkAction(null);
  };

  const bulkAssignDept = (deptId: string) => {
    const deptName = muDepts.find(d => d.id === deptId)?.name ?? "departamento";
    bulkApply({ departmentId: deptId }, { department_id: deptId }, `Conversas transferidas para ${deptName}.`);
    setBulkAction(null);
  };

  // A busca das automações manuais saiu daqui: quem lista agora é o
  // ExecutarAutomacaoWizard, pela mesma função que a tela de disparos usa
  // (fetchLeadManualAutomations). Mantê-la aqui significava carregar a lista a
  // cada abertura da tela, mesmo sem ninguém clicar em Automação, e ter duas
  // definições de "automação manual" para manter iguais.

  // Executa uma automação manual (lead_manual) nos leads das conversas-alvo
  const runAutomationOnConvs = async (automationId: string) => {
    const convIds = autoModalConvs ?? [];
    const cid = company?.id;
    if (!cid || convIds.length === 0) return;
    setRunningAutomation(true);
    // Duas contagens separadas, e não uma só. Antes, conversa sem negócio e
    // falha na chamada somavam no MESMO contador, e o aviso final culpava
    // "sem negócio vinculado" nos dois casos. Foi o que escondeu por completo
    // um erro de CORS: a automação não rodava, e a tela dizia que o problema
    // era o cadastro do cliente.
    let ok = 0, semNegocio = 0, falhou = 0;
    let ultimoErro = "";
    for (const convId of convIds) {
      const c = convList.find(x => x.id === convId);
      const leadId = c ? convLead(c)?.id : undefined;
      if (!leadId) { semNegocio++; continue; }
      const { error } = await supabase.functions.invoke("automation-runner/manual", {
        body: { company_id: cid, lead_id: leadId, automation_id: automationId },
      });
      if (error) {
        falhou++;
        ultimoErro = error.message ?? String(error);
        console.error("[multiatendimento] automação manual:", error);
      } else { ok++; }
    }
    setRunningAutomation(false);
    setAutoModalConvs(null);
    if (selectionMode) setSelectedConvs([]);
    if (ok > 0) toast.success(`Automação executada em ${ok} conversa(s).`);
    if (semNegocio > 0) toast.error(`${semNegocio} conversa(s) sem negócio vinculado foram ignoradas.`);
    if (falhou > 0) toast.error(`Falha ao executar em ${falhou} conversa(s). ${ultimoErro}`);
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

  // Os rótulos falam a mesma língua do ciclo do atendimento (aguardando →
  // em atendimento → finalizado).
  //
  // "Aguardando" foi renomeado porque colidia: aqui significava "em
  // atendimento, com mensagem não lida", enquanto o status `aguardando` do
  // atendimento significa "ninguém pegou" -- a mesma palavra com sentidos
  // opostos nas duas pontas do mesmo produto. O que cada chip FILTRA não mudou.
  const filters = [
    { id: "not_started", icon: Inbox,         label: "Não iniciadas", count: visibleConvList.filter(c => !convStates[c.id]?.answered && !convStates[c.id]?.finished && isConvInstanceConnected(c)).length,                            color: "#EA580C", colorBg: "#FFF7ED", borderColor: "rgba(255, 94, 21, 0.52)" },
    { id: "waiting",     icon: Clock,         label: "Mensagem nova", count: visibleConvList.filter(c => !!convStates[c.id]?.answered && !convStates[c.id]?.finished && !convStates[c.id]?.read && isConvInstanceConnected(c)).length,  color: "#D97706", colorBg: "#FFFBEB", borderColor: "rgba(246, 176, 54, 0.52)" },
    { id: "pending",     icon: MessageCircle, label: "Em aberto",     count: visibleConvList.filter(c => !!convStates[c.id]?.answered && !convStates[c.id]?.finished && !!convStates[c.id]?.read && isConvInstanceConnected(c)).length, color: "#2563EB", colorBg: "#EFF6FF", borderColor: "rgba(65, 121, 219, 0.52)" },
    { id: "agente",      icon: BotMessageSquare, label: "Agente",      count: visibleConvList.filter(c => c.tags.includes("Agente")).length,                                    color: "#6D28D9", colorBg: "#EDE9FE", borderColor: "rgba(109, 40, 217, 0.52)" },
    { id: "done",        icon: CheckCircle2,  label: "Finalizadas",   count: visibleConvList.filter(c => convStates[c.id]?.finished).length,                                  color: "#128A68", colorBg: "#EAFBF4", borderColor: "rgba(34, 197, 94, 0.6)" },
  ];
  const activeFilterMeta = filters.find(f => f.id === activeFilter);
  const activeFilterTitle = activeFilterMeta?.label ?? "Todas as conversas";
  const activeFilterCount = activeFilterMeta?.count ?? visibleConvList.length;

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
      <aside style={{ width: 350, minWidth: 350, maxWidth: 350, height: "100vh", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#FFF", position: "relative", zIndex: 2, overflow: "hidden" }}>
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

          {/* título do filtro rápido ativo + número/atualizar unificados + Filtros + ⋯ */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#333" }}>
              {activeFilterTitle}
              <button
                onClick={handleRefreshConversations}
                disabled={conversationsRefreshing}
                title="Atualizar conversas"
                style={{ display: "flex", alignItems: "center", gap: 4, background: "#F0F0F0", color: "#888", border: "none", borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "1px 7px", minWidth: 16, textAlign: "center", cursor: conversationsRefreshing ? "default" : "pointer" }}
              >
                {activeFilterCount}
                <RefreshCw size={11} color="#888" className={conversationsRefreshing ? "animate-spin" : undefined} />
              </button>
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

          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {filters.map(f => (
              <FilterChip key={f.id} Icon={f.icon} count={f.count} label={f.label} color={f.color} colorBg={f.colorBg} borderColor={f.borderColor} iconOnly={f.id === "done"} isActive={activeFilter === f.id} onClick={() => setActiveFilter(activeFilter === f.id ? "" : f.id)} />
            ))}
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
              {visibleConvList.length === 0 ? (
                <>
                  <MessageSquare size={32} color="#1A1A1A" style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "Inter", color: "#1A1A1A" }}>Sem conversas iniciadas</p>
                </>
              ) : (
                <>
                  <MessageSquare size={32} color="#E5E5E5" style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 13, color: "#AAA" }}>Nenhuma conversa encontrada</p>
                </>
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
                    {!isConvInstanceConnected(c) && <span style={{ fontSize: 10, fontWeight: 600, background: "#F5F5F5", color: "#888", padding: "2px 6px", borderRadius: 4 }}>Desconectada</span>}
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
                                  <div style={{ fontSize: 10, color: "#AAA" }}>{inst.provider === "cloud_api" ? "WhatsApp Oficial" : inst.provider === "dapi" ? "D-API" : "Z-API"}</div>
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
                {/* Número do ATENDIMENTO, não o do negócio.
                    O cabeçalho mostrava #1388, que é o negócio: são coisas
                    diferentes. Um contato pode ter dez atendimentos ao longo do
                    tempo e um só negócio, ou negócio nenhum. O relatório da
                    Fase 4 fala em atendimento, então é esse número que o
                    atendente precisa enxergar aqui.

                    Só ele: o número do negócio saiu do cabeçalho. Os dois
                    começam em 1001 por empresa, então apareciam como "#1001" e
                    "#1001" lado a lado, e o negócio já tem onde ser visto no
                    painel da direita. */}
                <span
                  title={atendimentoAtivo
                    ? `Atendimento #${atendimentoAtivo.numero} · ${
                        { aguardando: "aguardando alguém pegar",
                          em_atendimento: "em aberto",
                          finalizado: "finalizado" }[atendimentoAtivo.status] ?? atendimentoAtivo.status
                      }`
                    : "Atendimento ainda não aberto"}
                  style={{ fontSize: 12, color: "#128A68", border: "1px solid #128A68", borderRadius: 100, padding: "4px 10px", fontWeight: 600 }}
                >
                  {atendimentoAtivo ? `#${atendimentoAtivo.numero}` : `#${active.id.slice(0, 4).toUpperCase()}`}
                </span>
                {/* "Iniciar atendimento" só aparece enquanto ninguém pegou a
                    conversa. Depois de iniciada, sobra "Finalizar": o par
                    espelha o ciclo do atendimento em vez de oferecer as duas
                    ações sempre.

                    Antes o rótulo era "Marcar como lida", que descrevia o
                    efeito colateral e não o ato. Ele já era, na prática, o
                    único jeito de tirar a conversa de "Não iniciadas".

                    A condição lê `answered`, a MESMA fonte do chip "Não
                    iniciadas". Ler o status do atendimento aqui criava um
                    impasse sem saída: o gatilho do banco promove o atendimento
                    a `em_atendimento` assim que um humano responde, mas
                    responder não mexe em `answered` (sair de "Não iniciadas" é
                    ato explícito, por decisão de produto). Quem respondia sem
                    clicar ficava listado em "Não iniciadas" com o botão que o
                    tiraria dali escondido -- 4 conversas reais nesse estado. */}
                {!cs.answered && !cs.finished && (
                  <ChatHeaderBtn icon={Eye} label="Iniciar atendimento" onClick={() => markAsRead(activeId)} />
                )}
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
                        { label: "Transferir", action: () => {
                          setMoreMenuOpen(false);
                          if (!hasNegocio) { toast.error("Crie um negócio pra essa conversa antes de atribuir um responsável."); return; }
                          setShowTransferDialog(true);
                        } },
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
            <div style={{ position: "relative", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", background: "#FAFAFA" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 0 }}>
                <div className="chat-watermark-badge" style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(16,185,129,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: "rgba(16,185,129,0.32)" }}>
                  RZ
                </div>
              </div>
              <div data-lista-mensagens style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: 16 }}>
              {cs.messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                  <img src={chatIllustration} alt="" style={{ width: 350, marginBottom: 4 }} />
                  <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "Inter", color: "#1A1A1A" }}>Conversas</p>
                  <p style={{ fontSize: 12, fontWeight: 400, fontFamily: "Inter", color: "#1A1A1A" }}>Acompanhe as conversas com seus negócios</p>
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
                        <div style={{ maxWidth: "65%" }}
                             onMouseEnter={() => setMsgSobreMouse(m.id)}
                             onMouseLeave={() => setMsgSobreMouse(null)}>
                          {/* Nome colorido, hora em cinza. O lado direito é
                              compartilhado entre os atendentes e o agente de
                              IA, todos com a mesma bolha verde: a cor do nome
                              é o que deixa ver de relance quem respondeu o quê
                              sem ler nome por nome. Vale igual do lado
                              esquerdo em conversa de grupo. */}
                          <div style={{ fontSize: 11, marginBottom: 2, textAlign: isAgent ? "right" : "left" }}>
                            <span style={{ color: corDoNome(isAgent ? (m.agent ?? "") : convName(active), isAgent ? "atendente" : "cliente"), fontWeight: 600 }}>
                              {isAgent ? m.agent : convName(active)}
                            </span>
                            <span style={{ color: "#AAA" }}> • {m.time}</span>
                          </div>
                          {/* Citação: o que esta mensagem responde. Mostra o
                              retrato gravado na entrada, e não o texto da
                              original -- nem toda citada existe na nossa base. */}
                          {m.citacao && (
                            <div style={{
                              borderLeft: `3px solid ${isAgent ? "rgba(255,255,255,0.55)" : "#128A68"}`,
                              background: isAgent ? "rgba(255,255,255,0.14)" : "#F5F5F5",
                              borderRadius: 8, padding: "6px 10px", marginBottom: 4,
                              fontSize: 12, color: isAgent ? "rgba(255,255,255,0.9)" : "#666",
                              maxWidth: "100%", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
                              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                            }}>
                              {m.citacao.preview || "Mensagem"}
                            </div>
                          )}
                          <div style={{
                            // Espaço à direita reservado para o botão de ação,
                            // que fica sobreposto no canto. Reservado SEMPRE, não
                            // só no hover: aumentar o padding ao passar o mouse
                            // faria o texto reflowar embaixo do cursor, e balão
                            // que muda de forma quando você chega perto é pior
                            // que balão um pouco mais largo.
                            padding: m.kind === "image" ? 4 : "10px 30px 10px 14px", borderRadius: isAgent ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: isAgent ? "#128A68" : "#FFF", color: isAgent ? "#FFF" : "#111", border: isAgent ? "none" : "1px solid #EEE", boxShadow: isAgent ? "none" : "0 1px 2px rgba(0,0,0,0.06)", fontSize: 14, lineHeight: 1.4, display: "flex", alignItems: "flex-end", gap: 8, minWidth: 0, position: "relative" }}>
                            {/* Ação da mensagem, dentro do balão. Ficava do lado
                                de fora e sumia no caminho do mouse: o vão entre
                                o balão e o botão já é área sem hover, então o
                                botão desaparecia justamente quando a pessoa ia
                                clicar nele. Dentro, o hover não se interrompe.

                                Só aparece em mensagem que TEM id do provedor:
                                sem ele não há o que citar. */}
                            {(msgSobreMouse === m.id || menuDaMsg === m.id) && (
                              <button
                                onClick={e => {
                                  if (menuDaMsg === m.id) { setMenuDaMsg(null); return; }
                                  setMenuParaCima(menuAbreParaCima(e.currentTarget));
                                  setMenuDaMsg(m.id);
                                }}
                                data-menu-mensagem
                                title="Opções da mensagem"
                                style={{
                                  position: "absolute", top: 2, right: 4,
                                  width: 20, height: 20, borderRadius: 4, border: "none",
                                  background: isAgent ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.06)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  cursor: "pointer", padding: 0, zIndex: 2,
                                }}
                              >
                                <ChevronDown size={14} color={isAgent ? "#FFF" : "#535353"} />
                              </button>
                            )}
                            <MenuDaMensagem
                              aberto={menuDaMsg === m.id}
                              paraCima={menuParaCima}
                              onFechar={() => setMenuDaMsg(null)}
                              itens={[
                                // Responder exige o id do provedor: sem ele não há o
                                // que citar. Mensagens antigas ficam com as demais.
                                ...(m.messageId ? [{ rotulo: "Responder", icone: <Reply size={14} color="#535353" />, acao: () => setCitando(m) }] : []),
                                { rotulo: "Encaminhar", icone: <Forward size={14} color="#535353" />, acao: () => setEncaminhando(m) },
                                ...(!m.apagadaEm ? [{
                                  rotulo: "Apagar", icone: <Trash2 size={14} color="#B91C1C" />, destrutivo: true,
                                  submenu: [
                                    // "Para mim" não passa pelo provedor, então funciona
                                    // em qualquer linha e em mensagem antiga sem id.
                                    { rotulo: "Apagar para mim", icone: <Trash2 size={14} color="#B91C1C" />, destrutivo: true,
                                      acao: () => apagarMensagem(m, false) },
                                    ...(isAgent && m.messageId ? [{
                                      rotulo: "Apagar para todos", icone: <Trash2 size={14} color={podeApagar ? "#B91C1C" : "#CCC"} />,
                                      destrutivo: true, desabilitado: !podeApagar,
                                      motivo: podeApagar ? undefined : "A API oficial do WhatsApp não permite apagar mensagens já enviadas.",
                                      acao: () => apagarMensagem(m, true),
                                    }] : []),
                                  ],
                                }] : []),
                                { rotulo: "Copiar", icone: <Copy size={14} color="#535353" />, acao: async () => {
                                    // A área de transferência pode recusar (Safari é rígido
                                    // com o gesto, e a API não existe fora de HTTPS). Sem o
                                    // catch a falha seria silenciosa: a pessoa acha que
                                    // copiou e cola outra coisa.
                                    try {
                                      await navigator.clipboard.writeText(textoDaMensagem(m));
                                      toast.success("Mensagem copiada");
                                    } catch {
                                      toast.error("Não consegui copiar. Selecione o texto e use Cmd+C.");
                                    }
                                  } },
                              ]}
                            />
                            {m.apagadaEm ? (
                              <span style={{ fontStyle: "italic", opacity: 0.75, display: "flex", alignItems: "center", gap: 6 }}>
                                <Ban size={13} />Mensagem apagada
                              </span>
                            ) : (<>
                            {m.kind === "text"  && <><span style={{
                              flex: 1,
                              minWidth: 0,
                              // pre-wrap preserva as quebras de linha que a
                              // pessoa digitou: 312 mensagens da base tem \n e
                              // apareciam achatadas numa linha so.
                              whiteSpace: "pre-wrap",
                              // anywhere quebra tambem o que nao tem espaco --
                              // codigo PIX, link longo, hash. Sem isso a bolha
                              // estoura os 65% de largura e o chat inteiro passa
                              // a rolar na horizontal.
                              overflowWrap: "anywhere",
                            }}>{m.text}</span>{isAgent && <CheckCheck size={14} color={m.read ? "#FFF" : "rgba(255,255,255,0.5)"} />}</>}
                            {m.kind === "audio" && <AudioBubble duration={m.duration} src={m.src} light={isAgent} />}
                            {m.kind === "image" && (
                              <div style={{ overflow: "hidden", borderRadius: 12 }}>
                                {m.src ? (
                                  <img src={m.src} alt={m.caption ?? "imagem"} style={{ maxWidth: 220, maxHeight: 180, display: "block", objectFit: "cover" }} />
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px" }}>
                                    <ImageIcon size={18} color={isAgent ? "rgba(255,255,255,0.8)" : "#128A68"} />
                                    <span style={{ fontSize: 13, minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.caption || "Imagem"}</span>
                                  </div>
                                )}
                                {m.src && m.caption && <div style={{
                                  padding: "4px 8px 6px", fontSize: 12,
                                  color: isAgent ? "rgba(255,255,255,0.8)" : "#666",
                                  // Mesmo tratamento da bolha de texto: legenda
                                  // de imagem é texto do cliente também. Existe
                                  // uma de 501 caracteres com quebras na base,
                                  // que aparecia achatada e esticando a bolha.
                                  maxWidth: 220, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
                                }}>{m.caption}</div>}
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
                            </>)}
                          </div>
                          {/* Botões oferecidos com esta mensagem.
                              Aqui eles são REGISTRO, não controle: quem clica é
                              o contato, no WhatsApp dele. Ficam fora da bolha e
                              sem aparência de clicável de propósito -- um botão
                              que o atendente pudesse apertar sugeriria que ele
                              responde no lugar do cliente. */}
                          {!m.apagadaEm && m.botoes && m.botoes.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, width: "100%" }}>
                              {m.botoes.map((rotulo, bi) => (
                                <div key={bi} style={{
                                  fontSize: 12, color: "#128A68", background: "#FFF",
                                  border: "1px solid #D6E9E2", borderRadius: 8,
                                  padding: "6px 10px", textAlign: "center",
                                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                }}>
                                  <CornerUpLeft size={12} />
                                  <span style={{ overflowWrap: "anywhere" }}>{rotulo}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Avatar de quem enviou, do lado direito. O lead já tinha
                            o dele à esquerda; do lado do atendente não havia
                            nenhum, então uma conversa com dois atendentes e o
                            agente era um bloco verde uniforme, e só o nome em
                            letra pequena dizia quem falou.

                            Agente usa o mesmo ícone e a mesma cor roxa do filtro
                            "Agente" da lista de conversas: é a identidade que a
                            tela já usa para ele. Atendente usa a foto do perfil,
                            caindo nas iniciais quando não tem. */}
                        {isAgent && (
                          m.porAgente ? (
                            <div title={m.agent ?? "Agente"} style={{ width: 28, height: 28, borderRadius: "50%", background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 8 }}>
                              <BotMessageSquare size={15} color="#6D28D9" />
                            </div>
                          ) : (
                            <ConvAvatar name={m.agent ?? ""} avatarUrl={m.agent === nomeAtendente ? (profile?.avatar_url ?? undefined) : undefined} size={28} fontSize={10} style={{ marginLeft: 8 }} />
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
              </div>
            </div>

            {/* rodapé */}
            <div style={{ background: "#FFF", borderTop: "1px solid #E5E5E5", padding: "8px 16px", flexShrink: 0, position: "relative" }}>
              {/* painel de emojis */}
              {/* Bloco de composição: mostra o que está sendo respondido, com
                  saída visível. Sem ele a pessoa clica em responder e não tem
                  sinal nenhum de que a próxima mensagem vai sair citando. */}
              {citando && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  margin: "0 16px 8px", padding: "8px 10px",
                  background: "#F5F5F5", borderLeft: "3px solid #128A68", borderRadius: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#128A68", marginBottom: 2 }}>
                      Respondendo {citando.from === "agent" ? (citando.agent ?? "você") : convName(active)}
                    </div>
                    <div style={{
                      fontSize: 12, color: "#666", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>
                      {textoDaMensagem(citando)}
                    </div>
                  </div>
                  <button onClick={() => setCitando(null)} title="Cancelar resposta"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}>
                    <X size={14} color="#888" />
                  </button>
                </div>
              )}

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
                  <Paperclip size={18} color={cs.finished ? "#DDD" : "#128A68"} />
                </span>
                <span title="Arquivos da conversa" onClick={() => { setShowFiles(v => !v); setShowEmoji(false); }} style={{ display: "inline-flex", cursor: "pointer" }}>
                  <FolderOpen size={18} color={cs.finished ? "#DDD" : "#128A68"} />
                </span>
                <span title="Emoji" onClick={() => { if (!cs.finished) { setShowEmoji(v => !v); setShowFiles(false); } }} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                  <Smile size={18} color={cs.finished ? "#DDD" : "#128A68"} />
                </span>
                <span title={recording ? "Gravando… clique para parar" : "Gravar áudio"} onClick={() => { if (!cs.finished) { if (recording) stopRecording(); else startRecording(); } }} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                  <Mic size={18} color={recording ? "#E53E3E" : (cs.finished ? "#DDD" : "#128A68")} />
                </span>
                <button
                  onClick={suggestAI}
                  disabled={cs.finished || aiLoading}
                  title="Sugestão de resposta com IA"
                  style={{ background: "#E1F5EE", borderRadius: 6, padding: 4, display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer", border: "none", opacity: aiLoading ? 0.6 : 1 }}
                >
                  <Sparkles size={16} color="#128A68" style={{ animation: aiLoading ? "spin 1s linear infinite" : "none" }} />
                </button>
                {/* Modelos aprovados da Meta. Só aparece na conexão oficial,
                    porque é a única com a regra de janela de 24h. Fica sempre
                    disponível, não só com a janela fechada: às vezes o
                    atendente quer usar um modelo pronto mesmo podendo escrever
                    livre. */}
                {instanciaAtual?.provider === "cloud_api" && (
                  <div style={{ position: "relative", display: "inline-flex" }}>
                    <span
                      title="Modelos aprovados pela Meta"
                      onClick={() => { setModelosAbertos(v => !v); setShowEmoji(false); setShowFiles(false); setQmPickerOpen(false); }}
                      style={{ display: "inline-flex", cursor: "pointer" }}
                    >
                      <FileText size={18} color={cs.finished ? "#DDD" : "#128A68"} />
                    </span>
                    {modelosAbertos && (
                      <>
                        <div onClick={() => setModelosAbertos(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 340, background: "#FFF", border: "1px solid #EEEEEE", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.16)", zIndex: 41, overflow: "hidden" }}>
                          <div style={{ padding: "12px 14px 10px" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Modelos aprovados</span>
                            <p style={{ fontSize: 11, color: "#888", marginTop: 3, lineHeight: 1.4 }}>
                              {janelaModeloFechada
                                ? "Passaram 24h sem mensagem deste contato. Pelo WhatsApp oficial, só um modelo aprovado pela Meta retoma a conversa."
                                : "Textos aprovados pela Meta. Vão direto ao contato, sem edição."}
                            </p>
                          </div>
                          <div style={{ height: 1, background: "#EEEEEE" }} />
                          <div style={{ padding: 12 }}>
                            <WhatsappTemplatePicker
                              wabaId={instanciaAtual?.wabaId ?? null}
                              token={instanciaAtual?.token ?? ""}
                              enviando={enviandoModelo}
                              onEnviar={(m, v, texto) => { void enviarModelo(m, v, texto).then(() => setModelosAbertos(false)); }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <span title="Mensagens rápidas" onClick={() => { if (!cs.finished) { setQmPickerOpen(v => !v); setShowEmoji(false); setShowFiles(false); } }} style={{ display: "inline-flex", cursor: cs.finished ? "not-allowed" : "pointer" }}>
                    <Zap size={18} color={cs.finished ? "#DDD" : "#128A68"} />
                  </span>
                  {qmPickerOpen && (
                    <>
                      <div onClick={() => setQmPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                      {/* Mesma anatomia do popover de Modelos: cabeçalho com
                          título e contagem, divisória, lista rolável e rodapé
                          com a ação. Sem isso a lista aparecia solta, sem dizer
                          o que era nem o que dava para fazer ali. */}
                      <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 320, background: "#FFF", border: "1px solid #EEEEEE", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.16)", zIndex: 41, overflow: "hidden" }}>
                        <div style={{ padding: "12px 14px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Mensagens rápidas</span>
                            {qmList.length > 0 && (
                              <span style={{ fontSize: 11, color: "#767676", background: "#F5F5F5", borderRadius: 20, padding: "1px 8px" }}>{qmList.length}</span>
                            )}
                          </div>
                          <p style={{ fontSize: 11, color: "#888", marginTop: 3, lineHeight: 1.4 }}>
                            Textos prontos seus. Vão para o campo de digitação e você edita antes de enviar.
                          </p>
                        </div>
                        <div style={{ height: 1, background: "#EEEEEE" }} />

                        <div style={{ maxHeight: 240, overflowY: "auto", padding: 6 }}>
                          {qmList.length === 0 ? (
                            <div style={{ padding: "18px 12px", textAlign: "center", fontSize: 12, color: "#888", lineHeight: 1.5 }}>
                              Nenhuma mensagem rápida ainda.<br />Crie a primeira para responder o de sempre em um clique.
                            </div>
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

                        <div style={{ height: 1, background: "#EEEEEE" }} />
                        {/* Leva direto para a aba certa, já com o formulário
                            aberto: criar uma mensagem rápida é o que a pessoa
                            quer fazer quando percebe que falta uma. */}
                        <button
                          onClick={() => {
                            setQmPickerOpen(false);
                            setSettingsTab("quick");
                            setShowMultiSettings(true);
                            openNewQuickMessage();
                          }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "10px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#128A68" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          <Plus size={13} /> Criar mensagem rápida
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* linha de entrada */}
              {/* Janela fechada: a caixa de texto sai de cena e entra o
                  seletor de modelos. Deixar o campo ali seria convidar o
                  atendente a escrever uma mensagem inteira para receber uma
                  recusa da Meta depois de mandar. */}
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
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, position: "relative" }}>
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
                  {/* Caixa que cresce em vez de campo de uma linha só. Antes
                      o texto rolava na horizontal e o começo da mensagem
                      sumia à esquerda: quem escrevia um parágrafo perdia de
                      vista o que já tinha escrito. Cresce até 10 linhas e daí
                      passa a rolar, para a conversa não ser empurrada para
                      fora da tela por uma mensagem longa. */}
                  <textarea
                    ref={campoMensagemRef}
                    rows={1}
                    value={inputValue}
                    onChange={e => { setInputValue(e.target.value); handleTypingActivity(); }}
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
                    placeholder={
                      cs.finished ? "Conversa finalizada — reabra para responder"
                      : janelaModeloFechada ? "Passaram 24h sem mensagem do contato — use Modelos para retomar"
                      : "Mensagem..."
                    }
                    disabled={cs.finished || janelaModeloFechada}
                    style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, lineHeight: "20px", color: "#111", padding: "4px 0", fontFamily: "inherit", resize: "none", overflowY: "auto", maxHeight: ALTURA_MAX_MENSAGEM, opacity: cs.finished || janelaModeloFechada ? 0.5 : 1 }}
                  />
                  <button
                    onClick={() => { sendMessage(); setShowEmoji(false); }}
                    disabled={!inputValue.trim() || cs.finished || janelaModeloFechada}
                    style={{ background: inputValue.trim() && !cs.finished && !janelaModeloFechada ? "#128A68" : "#E5E5E5", border: "none", borderRadius: 8, padding: "6px 10px", cursor: inputValue.trim() && !cs.finished && !janelaModeloFechada ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}
                  >
                    <Send size={16} color={inputValue.trim() && !cs.finished && !janelaModeloFechada ? "#FFF" : "#AAA"} />
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <img src={chatIllustration} alt="" style={{ width: 260, marginBottom: 4 }} />
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "Inter", color: "#1A1A1A" }}>Selecione uma conversa</div>
            <div style={{ fontSize: 12, fontWeight: 400, fontFamily: "Inter", color: "#1A1A1A" }}>Escolha um contato à esquerda para iniciar o atendimento</div>
          </div>
        )}
      </section>

      {/* Seletor de destino do encaminhar. Lista as conversas com busca, em vez
          de um campo de telefone: encaminhar é para alguém com quem já se fala,
          e digitar número na mão convida a errar um dígito e mandar para
          desconhecido. */}
      {encaminhando && (
        <div
          onClick={() => { setEncaminhando(null); setBuscaDestino(""); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width: 380, maxHeight: "70vh", background: "#FFF", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #EEE" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 8 }}>Encaminhar para</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 10, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {textoDaMensagem(encaminhando)}
              </div>
              <input
                autoFocus
                value={buscaDestino}
                onChange={e => setBuscaDestino(e.target.value)}
                placeholder="Buscar conversa..."
                style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }}
              />
            </div>
            <div style={{ overflowY: "auto", padding: 6 }}>
              {convList
                .filter(c => c.id !== activeId && !!c.phone)
                .filter(c => {
                  const q = buscaDestino.trim().toLowerCase();
                  return !q || convName(c).toLowerCase().includes(q) || (c.phone ?? "").includes(q);
                })
                .slice(0, 60)
                .map(c => (
                  <button
                    key={c.id}
                    disabled={enviandoEncaminho}
                    onClick={() => encaminharPara(c)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", cursor: enviandoEncaminho ? "wait" : "pointer", padding: "8px 10px", borderRadius: 8, textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    <ConvAvatar name={convName(c)} avatarUrl={convAvatars[c.phone?.replace(/\D/g, "") ?? ""]} size={30} fontSize={11} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{convName(c)}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{c.phone}</div>
                    </div>
                  </button>
                ))}
              {convList.filter(c => c.id !== activeId && !!c.phone).length === 0 && (
                <div style={{ padding: 16, fontSize: 13, color: "#888", textAlign: "center" }}>Nenhuma outra conversa para encaminhar.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── DIALOG: nova conversa ────────────────────────────────────── */}
      <NewConvDialog
        open={newConvOpen}
        onClose={() => { setNewConvOpen(false); setLeadSearch(""); }}
        leads={leads}
        pipelines={pipelines ?? []}
        onSelect={startConversationWithLead}
      />

      {/* ── DIALOG: vincular a negócio existente (telefone divergente) ── */}
      <NewConvDialog
        open={showLinkExistingDialog}
        onClose={() => setShowLinkExistingDialog(false)}
        leads={leads}
        pipelines={pipelines ?? []}
        onSelect={handleLinkExistingLead}
        title="Vincular a negócio existente"
        subtitle="O negócio certo já existe, só com outro telefone salvo"
        emptyHint="Tente outro nome, ou crie um negócio novo pelo botão + Lead"
      />

      {/* ── COLUNA 3 — PERFIL + GESTÃO ───────────────────────────────── */}
      {active && cs && (
        <aside style={{ width: 350, minWidth: 350, height: "100vh", borderLeft: "1px solid #E5E5E5", overflowY: "auto", background: "#FFF" }}>
            {/* HEADER */}
            <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ConvAvatar name={convName(active)} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={40} fontSize={13} onError={() => refetchAvatar(active.phone, active.instanceId)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{convName(active)}</span>
                    <ExternalLink size={12} color="#128A68" style={{ cursor: "pointer" }} onClick={() => effectiveLead && navigate(`/pipeline/lead/${effectiveLead.id}`)} />
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
                    {/* Botão "+" (texto quando não há nenhuma tag ainda, senão só o ícone) */}
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
                        style={convTags.length === 0
                          ? { display: "flex", alignItems: "center", gap: 3, height: 18, borderRadius: 100, background: "transparent", border: "1px solid #E0E0E0", padding: "0 8px", cursor: "pointer", color: "#888", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }
                          : { width: 18, height: 18, borderRadius: "50%", background: "#F0F0F0", border: "1px solid #E0E0E0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, color: "#888" }}
                      >
                        <Plus size={10} />
                        {convTags.length === 0 && "Adicionar tag"}
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
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  onClick={handleOpenLeadOrDealPopup}
                  disabled={hasNegocio}
                  title={hasNegocio ? "Esta conversa já tem um negócio aberto vinculado" : undefined}
                  style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "6px 10px", color: hasNegocio ? "#AAA" : "#128A68", fontSize: 12, fontWeight: 600, cursor: hasNegocio ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => { if (!hasNegocio) e.currentTarget.style.background = "#E1F5EE"; }}
                  onMouseLeave={e => { if (!hasNegocio) e.currentTarget.style.background = "#F5F5F5"; }}
                ><Plus size={12} /> {effectiveLead ? "Negócio" : "Lead"}</button>
                <button
                  onClick={() => { if (activeId) setAutoModalConvs([activeId]); }}
                  style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "6px 10px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F5F5F5")}
                ><Zap size={12} /> Automação</button>
                <button
                  onClick={() => setShowFollowupDialog(true)}
                  style={{ flex: 1, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "6px 10px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F5F5F5")}
                ><CalendarDays size={12} /> Follow up</button>
              </div>

              {/* Responsável -- propriedade do negócio, não da conversa. Sem
                  negócio vinculado ainda, não dá pra atribuir (a conversa
                  segue funcionando normalmente nos chips mesmo assim). */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "7px 10px", borderRadius: 8 }}>
                <UserCheck size={13} color="#128A68" />
                <span style={{ fontSize: 12, color: "#666" }}>Responsável:</span>
                {!hasNegocio ? (
                  <span style={{ fontSize: 11, color: "#AAA", flex: 1, fontStyle: "italic" }}>Crie um negócio pra atribuir um responsável</span>
                ) : (effectiveLead?.responsibles?.length ?? 0) > 0 ? (
                  <>
                    <div style={{ display: "flex", flexShrink: 0 }}>
                      {(effectiveLead?.responsibles ?? []).slice(0, 3).map((name, i) =>
                        memberAvatars[name] ? (
                          <img key={name} src={memberAvatars[name]} alt={name} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: "2px solid #F5F5F5", marginLeft: i > 0 ? -6 : 0 }} />
                        ) : (
                          <div key={name} style={{ width: 20, height: 20, borderRadius: "50%", background: memberColors[name] ?? corDoTexto(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, border: "2px solid #F5F5F5", marginLeft: i > 0 ? -6 : 0 }}>
                            {iniciais(name)}
                          </div>
                        )
                      )}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#111", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(effectiveLead?.responsibles ?? []).join(", ")}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "#AAA", flex: 1 }}>Sem responsável</span>
                )}
              </div>
              {hasNegocio && (
                <button
                  onClick={() => setShowTransferDialog(true)}
                  style={{ marginTop: 6, width: "100%", background: "#E1F5EE", border: "none", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 600, color: "#128A68", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#c8efe3")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#E1F5EE")}
                >Transferir responsável</button>
              )}

              {/* Outras conversas deste contato (ex: número antigo x novo) */}
              {active.contactId && otherContactConvs.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 6 }}>OUTRAS CONVERSAS DESTE CONTATO</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {otherContactConvs.map(oc => (
                      <button
                        key={oc.id}
                        onClick={() => { setActiveId(oc.id); updateCs(oc.id, { read: true }); }}
                        style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", textAlign: "left", background: "#F9FBFA", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {whatsappConnections.find(wc => wc.instanceId === oc.instanceId)?.name ?? "Número desconhecido"}
                          </span>
                          <span style={{ fontSize: 10, color: "#AAA", flexShrink: 0 }}>{oc.time}</span>
                        </div>
                        <span style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{previewText(oc)}</span>
                        {!isConvInstanceConnected(oc) && <span style={{ fontSize: 9, fontWeight: 600, color: "#888", marginTop: 2 }}>Desconectada</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* ETAPA NO PIPELINE */}
            <div style={{ padding: "16px", borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, marginBottom: 6 }}>Pipeline &amp; Etapa</div>
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 15, fontWeight: 400, color: "#111" }}>{linkedPipeline?.name || active.pipeline || "—"}</span>
                <span style={{ fontSize: 15, fontWeight: 400, color: "#111" }}> - </span>
                <span style={{ fontSize: 15, fontWeight: 400, color: "#111" }}>{activeStages[activeStageIdx] ?? "—"}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 16 }}>
                {activeStages.map((_, i) => {
                  const isActive = i === activeStageIdx;
                  const isPast = i < activeStageIdx;
                  const bg = isActive ? "#128A68" : isPast ? "#E1F5EE" : "#F5F5F5";
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (pipelineCols.length > 0 && effectiveLead) handleStageClick(pipelineCols[i].id);
                        else updateCs(activeId, { stageIdx: i });
                      }}
                      style={{ flex: 1, height: 16, background: bg, border: "none", padding: 0, cursor: "pointer", clipPath: "polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%, 7px 50%)" }}
                    />
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    if (activeStageIdx > 0) {
                      const newIdx = activeStageIdx - 1;
                      // Sem negócio de verdade vinculado, isso é só o marcador
                      // genérico de 5 pontos (cs.stageIdx) -- não passa por
                      // confirmação, não existe negócio real pra proteger.
                      if (pipelineCols.length > 0 && effectiveLead) handleStageClick(pipelineCols[newIdx].id);
                      else updateCs(activeId, { stageIdx: newIdx });
                    }
                  }}
                  disabled={activeStageIdx === 0}
                  style={{ flex: 1, height: 25, background: "#F5F5F5", border: "none", borderRadius: 8, padding: "0 8px", color: "#666", fontSize: 12, fontWeight: 600, cursor: activeStageIdx === 0 ? "not-allowed" : "pointer", opacity: activeStageIdx === 0 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                ><ArrowLeft size={12} /> Voltar</button>
                <button
                  onClick={() => {
                    if (activeStageIdx < activeStages.length - 1) {
                      const newIdx = activeStageIdx + 1;
                      if (pipelineCols.length > 0 && effectiveLead) {
                        handleStageClick(pipelineCols[newIdx].id);
                      } else {
                        updateCs(activeId, { stageIdx: newIdx });
                        toast.success(`Lead movido para ${activeStages[newIdx]} ✓`);
                      }
                    }
                  }}
                  disabled={activeStageIdx === activeStages.length - 1}
                  style={{ flex: 1, height: 25, background: "#E1F5EE", border: "none", borderRadius: 8, padding: "0 8px", color: "#128A68", fontSize: 12, fontWeight: 600, cursor: activeStageIdx === activeStages.length - 1 ? "not-allowed" : "pointer", opacity: activeStageIdx === activeStages.length - 1 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                  onMouseEnter={e => { if (activeStageIdx !== activeStages.length - 1) e.currentTarget.style.background = "#c8efe3"; }}
                  onMouseLeave={e => (e.currentTarget.style.background = "#E1F5EE")}
                >Avançar <ArrowRight size={12} /></button>
              </div>
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
                <Section title="Atividades" defaultOpen>
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
                        style={{ width: "100%", background: "#E1F5EE", border: "none", color: "#128A68", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#c8efe3")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#E1F5EE")}
                      ><Plus size={12} /> Criar atividade</button>
                    </>
                  )}
                </Section>
              );
            })()}

            {/* PERFIL / ENDEREÇO / CAMPOS -- mesma visualização do LeadDrawer
                (contato aberto em /pipeline/lead). key={activeId} força
                remount ao trocar de conversa, senão um MuInlineField que
                ficou em modo edição vaza pra conversa seguinte. */}
            <div key={activeId} style={{ borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ display: "flex", justifyContent: "flex-start", gap: 4, padding: "10px 16px" }}>
                {(["perfil", "endereco", "campos"] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => setMuDetailsTab(k)}
                    style={{ background: muDetailsTab === k ? "#F0F0F0" : "none", border: "none", borderRadius: 4, cursor: "pointer", padding: "6px 10px", fontSize: 12, fontWeight: 600, color: "#111" }}
                  >{{ perfil: "Perfil", endereco: "Endereço", campos: "Campos" }[k]}</button>
                ))}
              </div>

              <div style={{ padding: "12px 16px 16px" }}>
                {muDetailsTab === "perfil" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {PROFILE_FIELD_DEFS.map(def => (
                      <MuInlineField
                        key={def.key}
                        label={def.label}
                        value={getProfileFieldValue(def.key)}
                        onSave={getProfileFieldOnSave(def.key)}
                        type={def.type}
                        options={def.options}
                      />
                    ))}
                  </div>
                )}

                {muDetailsTab === "endereco" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <MuInlineField label="CEP"         value={effectiveLead?.zipCode}      onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { zipCode: v })) : undefined} />
                    <MuInlineField label="Endereço"    value={effectiveLead?.address}      onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { address: v })) : undefined} />
                    <MuInlineField label="Número"      value={effectiveLead?.addrNumber}   onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { addrNumber: v })) : undefined} />
                    <MuInlineField label="Complemento" value={effectiveLead?.complement}   onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { complement: v })) : undefined} />
                    <MuInlineField label="Bairro"      value={effectiveLead?.neighborhood} onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { neighborhood: v })) : undefined} />
                    <MuInlineField label="Cidade"      value={effectiveLead?.city}         onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { city: v })) : undefined} />
                    <MuInlineField label="Estado"      value={effectiveLead?.state}        onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { state: v })) : undefined} />
                    <MuInlineField label="País"        value={effectiveLead?.country}      onSave={hasNegocio && effectiveLead ? (v => updateLead(effectiveLead.id, { country: v })) : undefined} />
                  </div>
                )}

                {muDetailsTab === "campos" && (() => {
                  const allItems = customFieldGroups.flatMap(g => g.items);
                  if (allItems.length === 0) return <p style={{ fontSize: 12, color: "#AAA", fontStyle: "italic" }}>Nenhum campo adicional configurado</p>;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {allItems.map(f => (
                        <MuInlineField
                          key={f.id}
                          label={f.label}
                          value={effectiveLead?.customFieldValues?.[f.id]}
                          onSave={hasNegocio && effectiveLead ? (v => {
                            const next = { ...(effectiveLead.customFieldValues ?? {}), [f.id]: v };
                            updateLead(effectiveLead.id, { customFieldValues: next });
                          }) : undefined}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <Section title="Anotações" defaultOpen>
              <div style={{ border: `1px solid ${notesActive ? "#128A68" : "#E5E5E5"}`, borderRadius: 10, background: "#FAFAFA", padding: 10, transition: "border-color 0.15s" }}>
                <div
                  ref={notesDivRef}
                  contentEditable={!!effectiveLead}
                  suppressContentEditableWarning
                  onFocus={() => effectiveLead && setNotesActive(true)}
                  onKeyUp={checkNoteFormats}
                  onMouseUp={checkNoteFormats}
                  data-placeholder="Adicionar anotação..."
                  className="empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none"
                  style={{ fontSize: 13, color: "#111", minHeight: notesActive ? 70 : 34, outline: "none", wordBreak: "break-word" }}
                />
                {notesActive && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, paddingTop: 8, marginTop: 8, borderTop: "1px solid #E5E5E5" }}>
                    <div style={{ display: "flex", gap: 2 }}>
                      {[
                        { icon: <Bold size={13} />, title: "Negrito", cmd: "bold" },
                        { icon: <Italic size={13} />, title: "Itálico", cmd: "italic" },
                        { icon: <Underline size={13} />, title: "Sublinhado", cmd: "underline" },
                        { icon: <List size={13} />, title: "Lista com marcadores", cmd: "insertUnorderedList" },
                        { icon: <ListOrdered size={13} />, title: "Lista numerada", cmd: "insertOrderedList" },
                      ].map(({ icon, title, cmd }) => {
                        const isActive = notesActiveFormats.has(cmd);
                        return (
                          <button
                            key={title}
                            title={title}
                            onMouseDown={e => { e.preventDefault(); applyNoteFormat(cmd); }}
                            style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5, border: "none", cursor: "pointer", background: isActive ? "#E1F5EE" : "transparent", color: isActive ? "#128A68" : "#888" }}
                          >{icon}</button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => { if (notesDivRef.current) notesDivRef.current.innerHTML = ""; setNotesActive(false); }}
                        style={{ fontSize: 11, fontWeight: 600, color: "#666", background: "none", border: "1px solid #E5E5E5", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                      >Cancelar</button>
                      <button
                        onClick={addNote}
                        style={{ fontSize: 11, fontWeight: 600, color: "#FFF", background: "#128A68", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                      >Salvar</button>
                    </div>
                  </div>
                )}
              </div>
              {!effectiveLead && (
                <div style={{ fontSize: 11, color: "#C2410C", marginTop: 6 }}>
                  Vincule esta conversa a um negócio para registrar anotações.
                </div>
              )}
            </Section>

            <Section title="Negócio vinculado" defaultOpen>
              {!hasNegocio ? (
                <div style={{ border: "1px dashed #E5E5E5", borderRadius: 10, padding: "16px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#AAA", marginBottom: 10 }}>Este contato não possui negócio vinculado</div>
                  <button
                    onClick={() => setShowLinkExistingDialog(true)}
                    style={{ background: "#E1F5EE", border: "none", color: "#128A68", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >Atrelar negócio existente</button>
                </div>
              ) : (
                // Dados do negócio de verdade (effectiveLead), não da conversa --
                // active.company/value/dealNumber são só o que ficou gravado em
                // whatsapp_conversations no momento em que a linha foi criada,
                // ficam desatualizados assim que o vínculo muda (ex.: depois de
                // "Atrelar negócio existente" a um negócio já existente).
                <div style={{ border: "1px solid #E5E5E5", borderRadius: 10, padding: 12 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}
                    onClick={() => effectiveLead && navigate(`/pipeline/lead/${effectiveLead.id}`)}
                  >
                    <ConvAvatar name={effectiveLead?.name ?? convName(active)} avatarUrl={convAvatars[active.phone?.replace(/\D/g, "") ?? ""]} size={28} fontSize={10} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{effectiveLead?.name ?? convName(active)}</div>
                      <div style={{ fontSize: 11, color: "#AAA" }}>{effectiveLead?.company || "Sem empresa"}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 11, color: "#128A68", fontWeight: 600 }}>Produto</label>
                    <Select
                      value={effectiveLead?.productId || "none"}
                      onValueChange={v => {
                        if (!effectiveLead) return;
                        const pid = v === "none" ? undefined : v;
                        const prod = products.find(p => p.id === pid);
                        updateLead(effectiveLead.id, { productId: pid, value: prod?.defaultValue ?? 0 });
                      }}
                    >
                      <SelectTrigger className="h-8 rounded-md text-xs focus:ring-0 focus:ring-offset-0 focus:border-primary">
                        <SelectValue placeholder="Sem produto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem produto</SelectItem>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 11, color: "#128A68", fontWeight: 600 }}>Valor</label>
                    <DealValueField
                      value={effectiveLead?.value ?? 0}
                      onSave={v => effectiveLead && updateLead(effectiveLead.id, { value: v })}
                    />
                  </div>

                  <div
                    style={{ cursor: "pointer" }}
                    onClick={() => effectiveLead && navigate(`/pipeline/lead/${effectiveLead.id}`)}
                  >
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{linkedPipeline?.name || "—"}</div>
                    <div style={{ height: 4, background: "#F0F0F0", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ width: `${((activeStageIdx + 1) / Math.max(activeStages.length, 1)) * 100}%`, height: "100%", background: "#128A68" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#128A68", fontWeight: 600 }}>{effectiveLead?.dealNumber ? `#${effectiveLead.dealNumber}` : "—"}</div>
                  </div>
                </div>
              )}
            </Section>

            {/* HISTÓRICO -- mesma timeline (comentários + eventos) do
                LeadDrawer.tsx (aba Histórico, aberta a partir de /leads),
                lendo effectiveLead.activities direto -- sem negócio vinculado
                não tem o que mostrar. */}
            <Section title="Histórico" defaultOpen>
              {!effectiveLead ? (
                <p style={{ fontSize: 12, color: "#AAA", fontStyle: "italic" }}>Sem negócio vinculado ainda</p>
              ) : (() => {
                const sortedActs = [...effectiveLead.activities].sort(
                  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                return (
                  <div>
                    {sortedActs.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "24px 0", color: "#AAA" }}>
                        <StickyNote size={26} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                        <p style={{ fontSize: 12 }}>Nenhum histórico registrado</p>
                      </div>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <div style={{ position: "absolute", left: 13, top: 14, bottom: 0, width: 2, background: "#F0F0F0" }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {sortedActs.map(act => {
                            const m = ACT_META[act.type] ?? ACT_META.note;
                            const Icon = m.Icon;
                            return (
                              <div key={act.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0" }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", zIndex: 1, border: "2px solid #FFF", boxShadow: "0 0 0 1.5px #E8E8E8" }}>
                                  <Icon size={12} />
                                </div>
                                <div style={{ flex: 1, background: "#FAFAFA", border: "1px solid #F0F0F0", borderRadius: 10, padding: "9px 12px" }}>
                                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                    {act.type === "note" ? (
                                      <div style={{ fontSize: 12, color: "#111", lineHeight: 1.4, flex: 1 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(act.description) }} />
                                    ) : (
                                      <p style={{ fontSize: 12, color: "#111", lineHeight: 1.4, flex: 1 }}>{act.description}</p>
                                    )}
                                    <span style={{ fontSize: 10, color: "#AAA", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtHistDate(act.date)}</span>
                                  </div>
                                  <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                                    <span style={{ fontSize: 10, color: "#AAA" }}>{m.label}</span>
                                    {act.userName && <><span style={{ fontSize: 10, color: "#DDD" }}>·</span><span style={{ fontSize: 10, color: "#888" }}>{act.userName}</span></>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Section>
        </aside>
      )}

      {/* ── DIALOG: confirmar avanço de etapa (mesma regra do Pipeline) ── */}
      {pendingStageAdvance && (() => {
        const pa = pendingStageAdvance;
        const totalMoves = pa.steps.length - 1;
        const nextCol = pa.steps[pa.currentStep + 1];
        const finalCol = pa.steps[pa.steps.length - 1];
        const stepsLeft = totalMoves - pa.currentStep;
        return (
          <div onClick={() => setPendingStageAdvance(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 16, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
              <div style={{ padding: "18px 20px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#111" }}>
                  <CheckCircle2 size={16} color="#128A68" /> Confirmar avanço de etapa
                </div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 8, lineHeight: 1.5 }}>
                  Mover <strong style={{ color: "#111" }}>{effectiveLead?.name}</strong> para{" "}
                  <strong style={{ color: "#111" }}>{nextCol?.colTitle}</strong>
                  {stepsLeft > 1 && <span style={{ color: "#AAA" }}> ({stepsLeft} confirmações até {finalCol?.colTitle})</span>}
                  .
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid #F0F0F0", padding: "12px 20px", background: "#FAFAFA" }}>
                <button onClick={() => setPendingStageAdvance(null)} style={{ background: "none", border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#666", cursor: "pointer" }}>Cancelar</button>
                <button onClick={handleConfirmStageAdvance} style={{ background: "#128A68", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>Confirmar <ArrowRight size={12} /></button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── DIALOG: confirmar retrocesso de etapa ───────────────────────── */}
      {pendingStageBack && (
        <div onClick={() => setPendingStageBack(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 16, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ padding: "18px 20px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#111" }}>
                <CheckCircle2 size={16} color="#128A68" /> Confirmar retrocesso de etapa
              </div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 8, lineHeight: 1.5 }}>
                Mover <strong style={{ color: "#111" }}>{effectiveLead?.name}</strong> de volta para{" "}
                <strong style={{ color: "#111" }}>{pendingStageBack.toTitle}</strong>?
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid #F0F0F0", padding: "12px 20px", background: "#FAFAFA" }}>
              <button onClick={() => setPendingStageBack(null)} style={{ background: "none", border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#666", cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleConfirmStageBack} style={{ background: "#128A68", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#FFF", cursor: "pointer" }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIALOG: + Lead / + Negócio -- mesmos popups de /leads ───────── */}
      <LeadModal
        open={showLeadModal}
        onClose={() => setShowLeadModal(false)}
        prefill={leadModalPrefill}
        onCreated={contact => setDealContactTarget(contact)}
      />
      <CreateDealDialog lead={dealTargetLead} onClose={() => setDealTargetLead(null)} />
      <CreateDealDialog contact={dealContactTarget} onClose={() => setDealContactTarget(null)} />

      {/* ── DIALOG: transferir atendimento ──────────────────────────── */}
      <TransferDialog
        open={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
        onTransfer={handleTransfer}
        teamMembers={teamMembers}
        memberEmails={memberEmails}
        memberAvatars={memberAvatars}
        memberColors={memberColors}
        currentAssignees={effectiveLead?.responsibles ?? []}
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
              {([
                { tab: "config" as const, label: "Configurações" },
                { tab: "dept" as const, label: "Departamento" },
                // Aba "Atendentes" configura visibilidade de conversas de outros
                // atendentes -- só admin de multiatendimento pode ver/mexer.
                ...(isMuAdmin ? [{ tab: "agents" as const, label: "Atendentes" }] : []),
                { tab: "quick" as const, label: "Mensagens rápidas" },
              ]).map(({ tab, label }) => {
                const active2 = settingsTab === tab;
                return (
                  <button key={tab} onClick={() => setSettingsTab(tab)} style={{ background: active2 ? "#E8F5F0" : "transparent", border: "none", cursor: "pointer", padding: "11px 16px", textAlign: "left", fontSize: 13, fontWeight: active2 ? 600 : 400, color: active2 ? "#128A68" : "#444", borderLeft: active2 ? "3px solid #128A68" : "3px solid transparent", transition: "all 0.15s" }}>
                    {label}
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
                {settingsTab === "agents" && isMuAdmin && (
                  <div style={{ display: "flex", gap: 14, height: 380 }}>
                    {/* lista */}
                    <div style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "7px 10px", marginBottom: 4, flexShrink: 0 }}>
                        <Search size={13} color="#AAA" />
                        <input placeholder="Pesquisar..." value={agentSearch} onChange={e => setAgentSearch(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#111", flex: 1, minWidth: 0 }} />
                      </div>
                      {teamMembers.filter(m => !agentSearch || m.toLowerCase().includes(agentSearch.toLowerCase())).map(m => (
                        <button key={m} onClick={() => setSelectedAgent(m)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", background: selectedAgent === m ? "#E8F5F0" : "#F9F9F9", borderLeft: selectedAgent === m ? "3px solid #128A68" : "3px solid transparent", flexShrink: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: corDoTexto(m), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{iniciais(m)}</div>
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
                            <div style={{ width: 38, height: 38, borderRadius: "50%", background: corDoTexto(selectedAgent), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{iniciais(selectedAgent)}</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{selectedAgent}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{memberEmails[selectedAgent] ?? ""}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Visualização do atendente</div>
                          <div style={{ background: "#D1FAE5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#128A68", marginBottom: 14 }}>
                            O atendente sempre pode ver as conversas atribuídas a ele
                          </div>
                          {(() => {
                            const agentUserId = memberUserIds[selectedAgent];
                            if (!agentUserId) {
                              return <div style={{ fontSize: 12, color: "#AAA" }}>Não foi possível identificar este atendente.</div>;
                            }
                            const agentSettings = attendantSettings[agentUserId] ?? { allowSeeOthers: false, hideUnassigned: false };
                            return ([
                              { key: "allowSeeOthers" as const, label: "Permitir ver conversas de outros atendentes", desc: "Permite o atendente ver as conversas com outros atendentes atribuídos" },
                              { key: "hideUnassigned" as const, label: "Desabilitar conversas sem atendentes", desc: "Não permite ver conversas que não possuem um atendente" },
                            ]).map(item => (
                              <div key={item.key} style={{ padding: "12px 0", borderBottom: "1px solid #EEEEEE", display: "flex", alignItems: "flex-start", gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{item.label}</div>
                                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{item.desc}</div>
                                </div>
                                <MuToggle checked={agentSettings[item.key]} onChange={() => saveAttendantSetting(agentUserId, { [item.key]: !agentSettings[item.key] })} />
                              </div>
                            ));
                          })()}
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
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: corDoTexto(m), color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{iniciais(m)}</div>
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
      {/* Executar automação: mesmo formato do Criar disparo, porque é a mesma
          tarefa (escolher a automação, escolher em quem roda). O popup antigo
          disparava no primeiro clique, sem mostrar em quem ia executar -- com
          a conversa errada selecionada, a mensagem saía para o cliente errado
          e não havia como voltar atrás. */}
      <ExecutarAutomacaoWizard
        open={autoModalConvs !== null}
        onOpenChange={aberto => { if (!aberto) setAutoModalConvs(null); }}
        executando={runningAutomation}
        conversas={(autoModalConvs ?? []).map(id => {
          const c = convList.find(x => x.id === id);
          return {
            id,
            nome: c ? convName(c) : "Conversa",
            telefone: c?.phone ?? undefined,
            temNegocio: !!(c && convLead(c)?.id),
          };
        })}
        onExecutar={runAutomationOnConvs}
      />

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

      {/* ── DIALOG: follow up (agendar envio de mensagem) ─────────────── */}
      {showFollowupDialog && active && tenantId && company && (() => {
        const linkedLead = resolveLeadForConv(active);
        const activeConn = whatsappConnections.find(c => c.connected && c.active);
        return (
          <FollowupScheduleDialog
            open={showFollowupDialog}
            onClose={() => setShowFollowupDialog(false)}
            phone={active.phone ?? ""}
            leadId={linkedLead?.id}
            ownerId={tenantId}
            companyId={company.id}
            connectionId={activeConn?.id}
            createdBy={user?.id}
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
  open, onClose, onTransfer, teamMembers, memberEmails, memberAvatars, memberColors, currentAssignees,
}: {
  open: boolean;
  onClose: () => void;
  onTransfer: (memberNames: string[]) => void;
  teamMembers: string[];
  memberEmails: Record<string, string>;
  memberAvatars: Record<string, string>;
  memberColors: Record<string, string>;
  currentAssignees?: string[];
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>(currentAssignees ?? []);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setSelected(currentAssignees ?? []); setTimeout(() => inputRef.current?.focus(), 50); }
    else setQ("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const filtered = teamMembers.filter(m => !q.trim() || m.toLowerCase().includes(q.toLowerCase()));
  const toggle = (m: string) => setSelected(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

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
              <UserCheck size={16} color="#128A68" /> Responsável do negócio
            </div>
            <div style={{ fontSize: 12, color: "#AAA", marginTop: 2 }}>Selecione um ou mais responsáveis</div>
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
            const isSelected = selected.includes(memberName);
            const avatar = memberAvatars[memberName];
            const color = memberColors[memberName] ?? corDoTexto(memberName);
            const email = memberEmails[memberName] ?? "";
            return (
              <button
                key={memberName}
                onClick={() => toggle(memberName)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: isSelected ? "#F0FBF6" : "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#F5F5F5"; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "#F0FBF6" : "transparent"; }}
              >
                {/* avatar */}
                {avatar ? (
                  <img src={avatar} alt={memberName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {iniciais(memberName)}
                  </div>
                )}

                {/* info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{memberName}</div>
                  {email && <div style={{ fontSize: 11, color: "#AAA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>}
                </div>

                <div style={{ width: 18, height: 18, borderRadius: 5, border: isSelected ? "none" : "1.5px solid #CCC", background: isSelected ? "#128A68" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isSelected && <Check size={12} color="#FFF" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#AAA" }}>{selected.length} selecionado{selected.length !== 1 ? "s" : ""}</span>
          <button
            onClick={() => onTransfer(selected)}
            style={{ background: "#128A68", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 600, color: "#FFF", cursor: "pointer" }}
          >Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Nova conversa dialog ─────────────────────────────────────────────── */
function NewConvDialog({
  open, onClose, leads, pipelines, onSelect,
  title = "Nova conversa", subtitle = "Selecione um negócio do pipeline",
  emptyHint = "Tente outro nome ou crie um lead no Pipeline",
}: {
  open: boolean;
  onClose: () => void;
  leads: Record<string, Lead>;
  pipelines: Pipeline[];
  onSelect: (leadId: string) => void;
  title?: string;
  subtitle?: string;
  emptyHint?: string;
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
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{title}</div>
            <div style={{ fontSize: 12, color: "#AAA", marginTop: 2 }}>{subtitle}</div>
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
              <p style={{ fontSize: 12, color: "#CCC", marginTop: 4 }}>{emptyHint}</p>
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
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: corDoTexto(lead.name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {iniciais(lead.name)}
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
