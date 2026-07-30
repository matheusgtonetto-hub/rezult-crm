import { useMemo, useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useAuth } from "@/context/AuthContext";
import { usePipelinePermissions } from "@/hooks/usePipelinePermissions";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Trophy,
  XCircle,
  RotateCcw,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Plus,
  MessageSquare,
  Calendar,
  Mail,
  StickyNote,
  ArrowRightLeft,
  PlusCircle,
  Upload,
  FileText,
  Video,
  Trash2,
  Tag as TagIcon,
  Pencil,
  CheckSquare,
  Bold,
  Italic,
  Underline,
  AtSign,
  List,
  ListOrdered,
  Pin,
  Phone,
  MessageCircle,
  RefreshCw,
  Check,
  X,
  CalendarDays,
  Link,
  Download,
  ImageIcon,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { ActivityDialog } from "@/components/ActivityDialog";
import type { ActivitySubmitData } from "@/components/ActivityDialog";
import { toast } from "sonner";
import type { ActivityType } from "@/data/mockData";

type TabKey = "anotacoes" | "atividades" | "email" | "arquivos";

const TABS: { key: TabKey; label: string }[] = [
  { key: "anotacoes", label: "Anotações" },
  { key: "atividades", label: "Atividades" },
  { key: "email", label: "E-mail" },
  { key: "arquivos", label: "Arquivos" },
];

const SECTION_ORDER = ["contato", "qualificacao", "origemTags", "negocio"] as const;
type SectionKey = typeof SECTION_ORDER[number];

const SECTION_TITLES: Record<SectionKey, string> = {
  contato: "Contato",
  qualificacao: "Qualificação",
  origemTags: "Origem e Tags",
  negocio: "Negócio",
};

function daysBetween(a: string, b: string) {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

// ── Avatar do lead (foto real do WhatsApp, com fallback de iniciais) ──────
// Mesmo algoritmo de cor/iniciais e mesmo endpoint de foto usados em
// ConvAvatar/fetchAvatar no Multiatendimento -- duplicado aqui de propósito
// (só isso, não vale acoplar as duas páginas por causa de um avatar).
function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 50%)`;
}
function initialsOf(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

interface WaAvatarCreds {
  provider?: string;
  instanceId: string;
  token: string;
  clientToken?: string | null;
}

// Cloud API (WhatsApp Business oficial da Meta) não expõe foto de perfil de
// contato nenhum -- restrição da própria plataforma, nunca tenta.
async function fetchWhatsappAvatar(phone: string, inst: WaAvatarCreds): Promise<string | undefined> {
  const p = phone.replace(/\D/g, "");
  if (!p || inst.provider === "cloud_api") return undefined;
  try {
    const res = inst.provider === "dapi"
      ? await fetch(
          `https://api.d-api.cloud/api/v1/contacts/${p}/avatar?sessionId=${inst.instanceId}`,
          { headers: { "Authorization": inst.token } }
        )
      : await fetch(
          `https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/profile-picture?phone=${p}`,
          { headers: { "Client-Token": inst.clientToken ?? "" } }
        );
    if (!res.ok) return undefined;
    const json = await res.json() as Record<string, unknown>;
    const body = (json.data ?? json) as Record<string, unknown>;
    return (body.link ?? body.value ?? body.profilePicture ?? body.imgUrl ?? body.url ?? body.avatarUrl ?? body.picture ?? body.avatar) as string | undefined;
  } catch {
    return undefined;
  }
}

function LeadAvatar({ name, avatarUrl, size, onError }: { name: string; avatarUrl?: string; size: number; onError?: () => void }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [avatarUrl]);
  if (avatarUrl && !err) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        // URLs de foto do WhatsApp expiram (param oe=) -- ao falhar, mostra as
        // iniciais e avisa o pai pra tentar buscar uma URL nova.
        onError={() => { setErr(true); onError?.(); }}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: colorFromString(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>
      {initialsOf(name)}
    </div>
  );
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return raw;
}

function formatDocument(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  return raw;
}

type IbgeCity = { nome: string; sigla: string };
let cachedCities: IbgeCity[] = [];
let citiesFetching = false;

const BR_STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;

async function loadIbgeCities(onDone: (cities: IbgeCity[]) => void) {
  if (cachedCities.length > 0) { onDone(cachedCities); return; }
  if (citiesFetching) { const wait = () => cachedCities.length > 0 ? onDone(cachedCities) : setTimeout(wait, 200); wait(); return; }
  citiesFetching = true;
  try {
    const results = await Promise.all(
      BR_STATES.map(uf =>
        fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`)
          .then(r => r.json() as Promise<{ nome: string }[]>)
          .then(data => data.map(m => ({ nome: m.nome, sigla: uf })))
          .catch(() => [] as IbgeCity[])
      )
    );
    cachedCities = results.flat().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  } catch { /* ignora */ }
  citiesFetching = false;
  onDone(cachedCities);
}

function normalizeStr(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function CityField({ value, onSave }: { value?: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery]     = useState(value ?? "");
  const [cities, setCities]   = useState<IbgeCity[]>(cachedCities);
  const [loading, setLoading] = useState(false);
  const [rect, setRect]       = useState<DOMRect | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  // Pré-carrega cidades ao montar para que estejam prontas ao clicar
  useEffect(() => {
    if (cachedCities.length === 0) {
      setLoading(true);
      loadIbgeCities(c => { setCities(c); setLoading(false); });
    }
  }, []);

  useEffect(() => { if (!editing) setQuery(value ?? ""); }, [value, editing]);

  function updateRect() {
    const r = wrapRef.current?.getBoundingClientRect();
    setRect(r ?? null);
  }

  function openEdit() {
    updateRect();
    setEditing(true);
  }

  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.focus());
  }, [editing]);

  // Mantém posição sincronizada com scroll/resize
  useEffect(() => {
    if (!editing) return;
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => { window.removeEventListener("scroll", updateRect, true); window.removeEventListener("resize", updateRect); };
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const handle = (e: MouseEvent) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      if (wrapRef.current?.contains(e.target as Node)) return;
      commit(query);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, query]);

  const normQuery = normalizeStr(query);
  const filtered = query.length >= 2
    ? cities.filter(c => normalizeStr(`${c.nome} ${c.sigla}`).includes(normQuery)).slice(0, 10)
    : [];

  function commit(val: string) {
    setEditing(false);
    setRect(null);
    if (val !== (value ?? "")) onSave(val);
  }

  const hasValue = !!value?.trim();
  const showDrop = editing && query.length >= 2 && rect;

  // Abre para cima se não há espaço abaixo
  const dropTop = rect
    ? (window.innerHeight - rect.bottom < 240 && rect.top > 240 ? rect.top - 244 : rect.bottom + 4)
    : 0;

  return (
    <div ref={wrapRef} className="group">
      <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>Cidade</label>
      {editing ? (
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); updateRect(); }}
          onKeyDown={e => {
            if (e.key === "Enter") { if (filtered.length > 0) commit(`${filtered[0].nome} - ${filtered[0].sigla}`); else commit(query); }
            if (e.key === "Escape") { setQuery(value ?? ""); setEditing(false); setRect(null); }
          }}
          placeholder="Digite o nome da cidade…"
          style={{ width: "100%", border: "1px solid #128A68", borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none", color: "#111", background: "#FFF" }}
        />
      ) : hasValue ? (
        <div
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 cursor-text hover:bg-[#F5F5F5] transition-colors"
          onClick={openEdit}
        >
          <span style={{ fontSize: 13, color: "#111111" }}>{value}</span>
          <Pencil size={12} className="opacity-0 group-hover:opacity-60 transition-opacity" color="#AAAAAA" />
        </div>
      ) : (
        <button onClick={openEdit} className="text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-[#F5F5F5] transition-colors w-full" style={{ fontSize: 12, color: "#AAAAAA", fontStyle: "italic" }}>
          + Adicionar
        </button>
      )}
      {/* Portal: renderiza no document.body, escapa de qualquer CSS containing block */}
      {showDrop && createPortal(
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: dropTop,
            left: rect!.left,
            width: rect!.width,
            background: "#FFF",
            border: "1px solid #E5E5E5",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 99999,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {loading && filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#AAA" }}>Carregando cidades…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#AAA" }}>Nenhuma cidade encontrada</div>
          ) : filtered.map(c => (
            <button
              key={`${c.nome}-${c.sigla}`}
              onMouseDown={e => { e.preventDefault(); commit(`${c.nome} - ${c.sigla}`); }}
              style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "transparent", border: "none", fontSize: 13, color: "#111", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span>{c.nome}</span>
              <span style={{ fontSize: 11, color: "#AAA", fontWeight: 700 }}>{c.sigla}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

type EditableFieldProps = {
  label: string;
  value: string | number | undefined | null;
  onSave: (v: string) => void;
  type?: "text" | "number" | "email" | "date" | "tel";
  placeholder?: string;
  display?: (v: string) => React.ReactNode;
  rightAdornment?: React.ReactNode;
  valueClassName?: string;
  valueStyle?: React.CSSProperties;
};

function EditableField({
  label,
  value,
  onSave,
  type = "text",
  display,
  rightAdornment,
  valueClassName,
  valueStyle,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  const hasValue = value !== undefined && value !== null && String(value).trim() !== "";

  const commit = () => {
    setEditing(false);
    if (draft !== (value == null ? "" : String(value))) onSave(draft);
  };

  return (
    <div className="group">
      <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>{label}</label>
      {editing ? (
        <Input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setDraft(value == null ? "" : String(value)); setEditing(false); }
          }}
          className="h-9 rounded-md text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
        />
      ) : hasValue ? (
        <div
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 cursor-text hover:bg-[#F5F5F5] transition-colors"
          onClick={() => setEditing(true)}
        >
          <span className={valueClassName} style={{ fontSize: 13, color: "#111111", ...valueStyle }}>
            {display ? display(String(value)) : String(value)}
          </span>
          <div className="flex items-center gap-1.5">
            {rightAdornment}
            <Pencil size={12} className="opacity-0 group-hover:opacity-60 transition-opacity" color="#AAAAAA" />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-[#F5F5F5] transition-colors w-full"
          style={{ fontSize: 12, color: "#AAAAAA", fontStyle: "italic" }}
        >
          + Adicionar
        </button>
      )}
    </div>
  );
}

function UtmSection({ lead, updateField }: { lead: import("@/data/mockData").Lead; updateField: (f: string, v: string) => void }) {
  const [open, setOpen] = useState(false);
  const hasAny = !!(lead.utmSource || lead.utmMedium || lead.utmCampaign || lead.utmTerm || lead.utmContent);
  return (
    <>
      <div style={{ borderTop: "1px solid #E5E5E5", margin: "8px 0 4px" }} />
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0" }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#AAA", letterSpacing: 0.5 }}>
          PARÂMETROS UTM{hasAny && !open ? <span style={{ marginLeft: 6, background: "#E1F5EE", color: "#128A68", borderRadius: 100, padding: "1px 6px", fontSize: 10 }}>preenchido</span> : null}
        </span>
        <ChevronDown size={13} color="#AAA" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
      </button>
      {open && (
        <div className="space-y-2 pt-1">
          <EditableField label="utm_source"   value={lead.utmSource}   onSave={v => updateField("utmSource", v)} />
          <EditableField label="utm_medium"   value={lead.utmMedium}   onSave={v => updateField("utmMedium", v)} />
          <EditableField label="utm_campaign" value={lead.utmCampaign} onSave={v => updateField("utmCampaign", v)} />
          <EditableField label="utm_term"     value={lead.utmTerm}     onSave={v => updateField("utmTerm", v)} />
          <EditableField label="utm_content"  value={lead.utmContent}  onSave={v => updateField("utmContent", v)} />
        </div>
      )}
    </>
  );
}

function NewLeadTaskButton({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  if (!open) {
    return (
      <Button size="sm" className="rounded-md h-8" style={{ background: "#128A68", color: "#FFFFFF" }} onClick={() => setOpen(true)}>
        <Plus size={14} className="mr-1" /> Nova tarefa
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { onAdd(title); setTitle(""); setOpen(false); toast.success("Tarefa criada!"); }
          if (e.key === "Escape") { setOpen(false); setTitle(""); }
        }}
        placeholder="Título da tarefa..."
        className="h-8 text-sm rounded-md focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
      />
      <Button size="sm" className="h-8 rounded-md" style={{ background: "#128A68", color: "#FFFFFF" }}
        onClick={() => { onAdd(title); setTitle(""); setOpen(false); toast.success("Tarefa criada!"); }}
      >
        Salvar
      </Button>
    </div>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    leads,
    pipelines,
    moveLead,
    updateLead,
    addActivity,
    updateActivity,
    patchActivity,
    completeActivity,
    uncompleteActivity,
    markNoShow,
    unmarkNoShow,
    deleteActivity,
    pinActivity,
    teamMembers,
    memberColors,
    memberEmails,
    memberAvatars,
    products,
    markLeadWon,
    markLeadLost,
    markLeadOpen,
    lossReasons,
    tasks: allTasks,
    addTask: addTaskToContext,
    updateTask,
    crmTags,
    customFieldGroups,
    updateLeadCustomFieldValues,
  } = useCRM();
  const { openChat } = useFloatingChat();
  const { profile } = useProfile();
  const { getPerms } = usePipelinePermissions();
  const { whatsappConnections } = useCompany();
  const hasActiveWaConnection = whatsappConnections.some(c => c.connected);

  const lead = id ? leads[id] : undefined;
  // Lead sem negócio (pipelineId vazio) não tem pipeline associado — não usar
  // nenhum outro pipeline como fallback, senão a barra de progresso/permissões
  // mostram dados de um negócio que não é deste lead.
  const pipeline = useMemo(
    () => (lead?.pipelineId ? pipelines.find(p => p.id === lead.pipelineId) : undefined),
    [pipelines, lead]
  );
  const pipelinePerms = getPerms(pipeline?.id ?? "");

  // Avatar do lead: busca a foto real do WhatsApp na 1ª conexão ativa da
  // empresa (leads não guardam qual instância/conversa os originou, então
  // não tem como escolher uma instância mais específica que essa). Sem
  // conexão ativa ou sem foto, LeadAvatar cai sozinho pras iniciais.
  const [leadAvatarUrl, setLeadAvatarUrl] = useState<string | undefined>(undefined);
  const leadAvatarRetried = useRef(false);
  useEffect(() => {
    setLeadAvatarUrl(undefined);
    leadAvatarRetried.current = false;
    if (!lead?.whatsapp) return;
    const inst = whatsappConnections.find(c => c.connected && c.active);
    if (!inst) return;
    let cancelled = false;
    fetchWhatsappAvatar(lead.whatsapp, inst).then(url => { if (!cancelled && url) setLeadAvatarUrl(url); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, lead?.whatsapp, whatsappConnections]);
  const refetchLeadAvatar = () => {
    if (leadAvatarRetried.current || !lead?.whatsapp) return;
    leadAvatarRetried.current = true;
    const inst = whatsappConnections.find(c => c.connected && c.active);
    if (!inst) return;
    setLeadAvatarUrl(undefined);
    fetchWhatsappAvatar(lead.whatsapp, inst).then(url => { if (url) setLeadAvatarUrl(url); });
  };

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    contato: true,
    qualificacao: true,
    origemTags: true,
    negocio: true,
  });
  const [tab, setTab] = useState<TabKey>("anotacoes");
  const [newNote, setNewNote] = useState("");
  const [addEmailMode, setAddEmailMode] = useState(false);
  const [newEmailDraft, setNewEmailDraft] = useState("");
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [deletingActivityGcalId, setDeletingActivityGcalId] = useState<string | undefined>();

  const openActivityDialog = () => {
    setEditingActivityId(null);
    setShowActivityDialog(true);
  };

  const openEditActivityDialog = (item: { id: string; title?: string; description?: string; type: ActivityType; scheduledAt?: string; meetLink?: string; durationMinutes?: number; participants?: string[] }) => {
    setEditingActivityId(item.id);
    setShowActivityDialog(true);
  };

  const editingActivity = editingActivityId ? lead?.activities?.find(a => a.id === editingActivityId) : undefined;

  const handleActivitySubmit = (data: ActivitySubmitData) => {
    if (!lead) return;
    if (editingActivityId) {
      patchActivity(lead.id, editingActivityId, {
        title: data.title,
        type: data.type,
        description: data.description,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        durationMinutes: data.durationMinutes,
        contactEmail: data.participants[0] || undefined,
        meetLink: data.meetLink || undefined,
        participants: data.participants.length > 0 ? data.participants : undefined,
      });
      toast.success("Atividade atualizada!");
    } else {
      addActivity(lead.id, {
        date: new Date().toISOString(),
        type: data.type,
        title: data.title,
        description: data.description,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        durationMinutes: data.durationMinutes,
        contactEmail: data.participants[0] || undefined,
        meetLink: data.meetLink || undefined,
        participants: data.participants.length > 0 ? data.participants : undefined,
        gcalEventId: data.gcalEventId,
        userName: profile?.full_name || undefined,
      });
      toast.success("Atividade criada!");
    }
    setShowActivityDialog(false);
    setEditingActivityId(null);
  };

  // ── Arquivos ──────────────────────────────────────────────────────────
  const { user } = useAuth();

  interface UploadedFile { id: string; name: string; size: number; mimeType: string; storagePath: string; uploadedBy: string; createdAt: string; }
  interface WaFile { id: string; name: string; type: "image" | "document"; fromMe: boolean; senderName: string; createdAt: string; }

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [waFiles, setWaFiles] = useState<WaFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!lead?.id || !user) return;
    // Arquivos uploadados manualmente
    supabase.from("lead_files").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false })
      .then(({ data }) => setUploadedFiles((data ?? []).map((r: { id: string; name: string; size: number; mime_type: string; storage_path: string; uploaded_by: string; created_at: string }) => ({
        id: r.id, name: r.name, size: r.size ?? 0, mimeType: r.mime_type ?? "",
        storagePath: r.storage_path, uploadedBy: r.uploaded_by ?? "", createdAt: r.created_at,
      }))));
    // Arquivos do WhatsApp (mensagens com tipo image/document vinculadas pelo telefone)
    if (lead.whatsapp) {
      const phone = lead.whatsapp.replace(/\D/g, "");
      const phoneAlt = phone.startsWith("55") ? phone.slice(2) : `55${phone}`;
      supabase.from("whatsapp_messages")
        .select("id, body, type, from_me, sender_name, created_at, momment")
        .eq("owner_id", user.id)
        .in("type", ["image", "document"])
        .or(`phone.eq.${phone},phone.eq.${phoneAlt}`)
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data }) => setWaFiles((data ?? []).map((r: { id: string; body: string | null; type: string; from_me: boolean; sender_name: string | null; created_at: string | null; momment: number }) => ({
          id: r.id, name: r.body ?? "arquivo",
          type: r.type as "image" | "document",
          fromMe: !!r.from_me,
          senderName: r.sender_name ?? (r.from_me ? "Você" : lead.name),
          createdAt: r.created_at ?? new Date(r.momment).toISOString(),
        }))));
    }
  }, [lead?.id, lead?.whatsapp, user?.id]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !lead || !user) return;
    e.target.value = "";
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${lead.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("lead-files").upload(path, file);
      if (upErr) {
        if (upErr.message?.includes("Bucket not found") || upErr.message?.includes("bucket"))
          toast.error("Bucket 'lead-files' não encontrado. Execute a migração SQL no Supabase.");
        else
          toast.error(`Erro no storage: ${upErr.message}`);
        return;
      }
      const { error: dbErr } = await supabase.from("lead_files").insert({
        owner_id: user.id, lead_id: lead.id,
        name: file.name, size: file.size, mime_type: file.type,
        storage_path: path, uploaded_by: user.email?.split("@")[0] ?? "Você",
      });
      if (dbErr) {
        // Limpa o arquivo do storage se o registro no banco falhou
        await supabase.storage.from("lead-files").remove([path]);
        if (dbErr.message?.includes("relation") || dbErr.code === "42P01")
          toast.error("Tabela 'lead_files' não encontrada. Execute a migração SQL no Supabase.");
        else
          toast.error(`Erro ao salvar: ${dbErr.message}`);
        return;
      }
      // Refresh list
      const { data } = await supabase.from("lead_files").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false });
      setUploadedFiles((data ?? []).map((r: { id: string; name: string; size: number; mime_type: string; storage_path: string; uploaded_by: string; created_at: string }) => ({
        id: r.id, name: r.name, size: r.size ?? 0, mimeType: r.mime_type ?? "",
        storagePath: r.storage_path, uploadedBy: r.uploaded_by ?? "", createdAt: r.created_at,
      })));
      toast.success("Arquivo enviado!");
    } catch (err) {
      toast.error(`Erro ao enviar: ${(err as Error).message}`);
      console.error(err);
    } finally { setUploading(false); }
  }

  async function handleDownloadFile(f: UploadedFile) {
    const { data } = await supabase.storage.from("lead-files").createSignedUrl(f.storagePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Erro ao gerar link de download.");
  }

  async function handleDeleteFile(f: UploadedFile) {
    setDeletingFileId(f.id);
    await supabase.storage.from("lead-files").remove([f.storagePath]);
    await supabase.from("lead_files").delete().eq("id", f.id);
    setUploadedFiles(prev => prev.filter(x => x.id !== f.id));
    setDeletingFileId(null);
    toast.success("Arquivo excluído.");
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const [newNoteActive, setNewNoteActive] = useState(false);
  const newNoteDivRef = useRef<HTMLDivElement | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [pendingStageAdvance, setPendingStageAdvance] = useState<{
    steps: Array<{ colId: string; colTitle: string }>;
    currentStep: number;
    leadId: string;
  } | null>(null);
  const [pendingStageBack, setPendingStageBack] = useState<{
    fromId: string; fromTitle: string;
    toId: string; toTitle: string;
  } | null>(null);
  const editingDivRef = useRef<HTMLDivElement | null>(null);
  const [mentionState, setMentionState] = useState<{ query: string; top: number; left: number; source: "new" | "edit" } | null>(null);

  const detectMention = (source: "new" | "edit") => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { setMentionState(null); return; }
    const range = sel.getRangeAt(0);
    const text = range.startContainer.textContent ?? "";
    const textBefore = text.slice(0, range.startOffset);
    const atIndex = textBefore.lastIndexOf("@");
    if (atIndex === -1 || textBefore.slice(atIndex).includes(" ")) { setMentionState(null); return; }
    const query = textBefore.slice(atIndex + 1);
    const rect = range.getBoundingClientRect();
    setMentionState({ query, top: rect.bottom + 4, left: rect.left, source });
  };

  const insertMention = (name: string) => {
    if (!mentionState) return;
    const ref = mentionState.source === "new" ? newNoteDivRef : editingDivRef;
    ref.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;
    const text = textNode.textContent ?? "";
    const atIndex = text.slice(0, range.startOffset).lastIndexOf("@");
    if (atIndex === -1) return;
    const newRange = document.createRange();
    newRange.setStart(textNode, atIndex);
    newRange.setEnd(textNode, range.startOffset);
    newRange.deleteContents();
    const node = document.createTextNode(`@${name} `);
    newRange.insertNode(node);
    const finalRange = document.createRange();
    finalRange.setStartAfter(node);
    finalRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(finalRange);
    setMentionState(null);
  };

  const startEditing = (noteId: string, html: string) => {
    setEditingNoteId(noteId);
    requestAnimationFrame(() => {
      if (editingDivRef.current) {
        editingDivRef.current.innerHTML = html;
        editingDivRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(editingDivRef.current);
        range.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    });
  };

  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  const checkFormats = () => {
    const cmds = ["bold", "italic", "underline", "insertUnorderedList", "insertOrderedList"];
    const active = new Set(cmds.filter(c => { try { return document.queryCommandState(c); } catch { return false; } }));
    setActiveFormats(active);
  };

  const handleNewNoteKey = () => { checkFormats(); detectMention("new"); };
  const handleEditKey = () => { checkFormats(); detectMention("edit"); };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    checkFormats();
  };
  const [localCustomValues, setLocalCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (lead?.customFieldValues) setLocalCustomValues(lead.customFieldValues);
  }, [lead?.id]);

  const [showWonProductDialog, setShowWonProductDialog] = useState(false);
  const [wonProductId, setWonProductId] = useState<string>("none");
  const [wonCustomValue, setWonCustomValue] = useState<string>("");
  const [showLostReasonDialog, setShowLostReasonDialog] = useState(false);
  const [selectedLossReasonId, setSelectedLossReasonId] = useState<string>("none");

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3" style={{ background: "#F4F6F8" }}>
        <p className="text-sm text-muted-foreground">Lead não encontrado.</p>
        <Button onClick={() => navigate("/pipeline")} variant="outline" className="rounded-lg">
          <ArrowLeft size={14} className="mr-1.5" /> Voltar ao pipeline
        </Button>
      </div>
    );
  }

  // Bug 4: tarefas reais deste lead, não dados hardcoded de outros usuários
  const leadTasks = allTasks.filter(t => t.leadId === id);

  const toggleLeadTask = (taskId: string) => {
    const t = allTasks.find(x => x.id === taskId);
    if (!t) return;
    updateTask(taskId, { status: t.status === "Concluída" ? "Pendente" : "Concluída" });
  };

  const addLeadTask = (title: string) => {
    if (!title.trim() || !id) return;
    addTaskToContext({
      title: title.trim(),
      leadId: id,
      leadName: lead.name,
      responsible: lead.responsible,
      dueDate: new Date().toISOString().split("T")[0] + "T12:00",
      status: "Pendente",
    });
  };

  const respColor = memberColors[lead.responsible] || "#888888";
  const leadResps = lead.responsibles?.length ? lead.responsibles : (lead.responsible ? [lead.responsible] : []);
  const initials = lead.name
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // Detecta se um label de campo é monetário e formata o valor
  const customFieldDisplay = (label: string, fieldType: string) => {
    if (fieldType === "date") return (v: string) => v ? new Date(v).toLocaleDateString("pt-BR") : "";
    if (/orçamento|orcamento|valor|budget|preço|preco|custo/i.test(label)) {
      return (v: string) => {
        const n = Number(v.replace(/[^\d.,]/g, "").replace(",", "."));
        return isNaN(n) || v.trim() === "" ? v : formatBRL(n);
      };
    }
    return undefined;
  };

  const stages = pipeline?.columns ?? [];
  const activeIdx = stages.findIndex(c => c.id === lead.stage);
  const today = new Date().toISOString().split("T")[0];

  const handleStageClick = (stageId: string) => {
    if (stageId === lead.stage) return;
    const fromIdx = stages.findIndex(c => c.id === lead.stage);
    const toIdx   = stages.findIndex(c => c.id === stageId);
    if (fromIdx === -1 || toIdx === -1) return; // lead sem negócio (ou etapa não pertence a este pipeline)
    const fromCol = stages[fromIdx];
    const toCol   = stages[toIdx];
    if (toIdx < fromIdx) {
      setPendingStageBack({ fromId: fromCol.id, fromTitle: fromCol.title, toId: toCol.id, toTitle: toCol.title });
      return;
    }
    const steps = stages.slice(fromIdx, toIdx + 1).map(c => ({ colId: c.id, colTitle: c.title }));
    setPendingStageAdvance({ steps, currentStep: 0, leadId: lead.id });
  };

  const handleConfirmStageAdvance = () => {
    if (!pendingStageAdvance) return;
    const { steps, currentStep, leadId } = pendingStageAdvance;
    const from = steps[currentStep];
    const to   = steps[currentStep + 1];
    moveLead(leadId, from.colId, to.colId, 0);
    addActivity(leadId, {
      date: new Date().toISOString(),
      type: "stage_change",
      description: `Movido de "${from.colTitle}" para "${to.colTitle}".`,
      userName: profile?.full_name || undefined,
    });
    if (currentStep + 1 === steps.length - 1) {
      toast.success(`Etapa alterada para ${to.colTitle}`);
      setPendingStageAdvance(null);
    } else {
      setPendingStageAdvance({ ...pendingStageAdvance, currentStep: currentStep + 1 });
    }
  };

  const handleSaveNote = async () => {
    const html = DOMPurify.sanitize(newNoteDivRef.current?.innerHTML ?? "");
    if (!html.trim() || html === "<br>") return;
    try {
      await addActivity(lead.id, {
        date: new Date().toISOString(),
        type: "note",
        description: html,
        userName: profile?.full_name || undefined,
      });
      if (newNoteDivRef.current) newNoteDivRef.current.innerHTML = "";
      setNewNote("");
      setNewNoteActive(false);
      toast.success("Anotação salva!");
    } catch {
      toast.error("Erro ao salvar anotação. Tente novamente.");
    }
  };

  const applyNewNoteFormat = (cmd: string, val?: string) => {
    if (cmd === "mention") {
      newNoteDivRef.current?.focus();
      document.execCommand("insertText", false, "@");
      detectMention("new");
      return;
    }
    document.execCommand(cmd, false, val);
    checkFormats();
  };

  const toggleSection = (k: string) =>
    setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const updateField = (field: string, value: string | number | string[] | undefined) =>
    updateLead(lead.id, { [field]: value });

  const fmtBRL = (n: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleWon = () => {
    setWonProductId("none");
    if (lead.productId) {
      const prod = products.find(p => p.id === lead.productId);
      const v = prod?.defaultValue ?? lead.value ?? 0;
      setWonCustomValue(v > 0 ? fmtBRL(v) : "");
    } else {
      setWonCustomValue("");
    }
    setShowWonProductDialog(true);
  };

  const handleConfirmWon = async () => {
    let prodName: string | undefined;
    const customVal = parseFloat(wonCustomValue.replace(/\./g, "").replace(",", ".")) || 0;
    let finalValue = lead.value;
    if (wonProductId && wonProductId !== "none") {
      const prod = products.find(p => p.id === wonProductId);
      prodName = prod?.name;
      finalValue = customVal;
      await updateLead(lead.id, { productId: wonProductId, value: finalValue });
    } else if (lead.productId) {
      const prod = products.find(p => p.id === lead.productId);
      prodName = prod?.name;
      finalValue = customVal || lead.value;
      if (finalValue !== lead.value) await updateLead(lead.id, { value: finalValue });
    }
    setShowWonProductDialog(false);
    markLeadWon(lead.id, prodName, finalValue);
    toast.success("Negócio marcado como ganho!");
  };
  const handleLost = () => {
    setSelectedLossReasonId("none");
    setShowLostReasonDialog(true);
  };

  const handleConfirmLost = async () => {
    const reasonName = selectedLossReasonId !== "none"
      ? lossReasons.find(r => r.id === selectedLossReasonId)?.name
      : undefined;
    if (selectedLossReasonId && selectedLossReasonId !== "none") {
      await updateLead(lead.id, { lossReasonId: selectedLossReasonId });
    }
    setShowLostReasonDialog(false);
    markLeadLost(lead.id, reasonName);
    toast.error("Negócio marcado como perdido.");
  };
  const handleReopen = () => {
    markLeadOpen(lead.id);
    toast.success("Negócio reaberto com sucesso.");
  };

  const noteActivities = lead.activities.filter(a => a.type === "note");

  const SCHEDULED_TYPES: ActivityType[] = ["meeting", "call", "whatsapp", "email", "follow_up", "task"];

  const unifiedActivities = [...lead.activities]
    .filter(a => a.type === "note" || a.type === "stage_change" || a.type === "transfer" || a.type === "won" || a.type === "lost" || SCHEDULED_TYPES.includes(a.type))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const tA = new Date(a.date ?? 0).getTime();
      const tB = new Date(b.date ?? 0).getTime();
      return tB - tA;
    });

  const fmtActivityDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "numeric", month: "long",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    const day = get("day");
    const month = get("month").charAt(0).toUpperCase() + get("month").slice(1);
    const h = get("hour");
    const m = get("minute");
    return `${day} de ${month} às ${h}h${m !== "00" ? m : ""}`;
  };

  const fmtScheduledDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d;
  };

  return (
    <>
    <div style={{ background: "#F4F6F8", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* TOPBAR — altura fixa; a página inteira não rola mais, então não
          precisa mais ser sticky (ver CONTENT logo abaixo). */}
      <div
        style={{
          height: 45,
          background: "#FFFFFF",
          borderBottom: "1px solid #EEEEEE",
          flexShrink: 0,
        }}
        className="flex items-center justify-between px-4"
      >
        {/* Esquerda */}
        <button
          onClick={() => navigate("/pipeline")}
          className="flex items-center gap-1.5 text-sm hover:bg-[#F0F0F0] rounded-md px-2 py-1.5 transition-colors"
          style={{ color: "#111111" }}
        >
          <ArrowLeft size={16} />
          <span style={{ fontWeight: 500 }}>{pipeline?.name ?? "Sem negócio"}</span>
        </button>

        {/* Direita */}
        <div className="flex items-center gap-2">
          {/* Botões de status */}
          {lead.dealStatus === "won" || lead.dealStatus === "lost" ? (
            <>
              <div
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-semibold"
                style={
                  lead.dealStatus === "won"
                    ? { background: "#DCFCE7", color: "#128A68" }
                    : { background: "#FEE2E2", color: "#E24B4A" }
                }
              >
                {lead.dealStatus === "won"
                  ? <><Trophy size={12} className="shrink-0" /> Ganho</>
                  : <><XCircle size={12} className="shrink-0" /> Perdido</>}
              </div>
              <Button
                onClick={handleReopen}
                size="sm"
                variant="outline"
                className="rounded-lg font-semibold h-7 text-xs px-2.5 border-card-border"
              >
                <RotateCcw size={12} className="mr-1" /> Reabrir
              </Button>
            </>
          ) : (
            <>
              <button
                onClick={handleWon}
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ background: "#128A68", color: "#FFFFFF", borderRadius: 4, padding: "4px 12px" }}
              >
                Ganho
              </button>
              <button
                onClick={handleLost}
                className="flex items-center gap-1.5 text-xs font-semibold"
                style={{ background: "#E24B4A", color: "#FFFFFF", borderRadius: 4, padding: "4px 12px" }}
              >
                Perdido
              </button>
            </>
          )}

          {/* Divisor */}
          <div className="w-px h-6 bg-[#EEEEEE] mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={pipelinePerms.blockChangeAttendant} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                {leadResps.length === 0 ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: "#AAAAAA" }}>S</div>
                ) : (
                  <div className="flex items-center shrink-0">
                    {leadResps.slice(0, 3).map((name, idx) => {
                      const av = memberAvatars[name];
                      const cl = memberColors[name] ?? "#AAAAAA";
                      return av ? (
                        <img key={name} src={av} alt={name} className="rounded-full object-cover" style={{ width: 28, height: 28, marginLeft: idx > 0 ? -8 : 0, outline: "2px solid hsl(var(--background))" }} />
                      ) : (
                        <div key={name} className="rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ width: 28, height: 28, background: cl, marginLeft: idx > 0 ? -8 : 0, outline: "2px solid hsl(var(--background))" }}>{name[0]}</div>
                      );
                    })}
                    {leadResps.length > 3 && (
                      <div className="rounded-full flex items-center justify-center font-semibold text-[9px]" style={{ width: 28, height: 28, background: "#E5E5E5", color: "#555", marginLeft: -8, outline: "2px solid hsl(var(--background))" }}>+{leadResps.length - 3}</div>
                    )}
                  </div>
                )}
                <div className="flex flex-col items-start leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-foreground">
                      {leadResps.length === 0 ? "Sem responsável" : leadResps.length === 1 ? leadResps[0] : `${leadResps.length} responsáveis`}
                    </span>
                    <ChevronDown size={12} className="text-muted-foreground" />
                  </div>
                  {leadResps.length === 1 && memberEmails[leadResps[0]] && (
                    <span className="text-[10px] text-muted-foreground">{memberEmails[leadResps[0]]}</span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1">
              {leadResps.length > 0 && (
                <DropdownMenuItem
                  onClick={() => updateField("responsibles", [])}
                  className="flex items-center gap-2 text-muted-foreground text-xs mb-1"
                >
                  Limpar responsáveis
                </DropdownMenuItem>
              )}
              {teamMembers.map(m => {
                const selected = leadResps.includes(m);
                return (
                <DropdownMenuItem
                  key={m}
                  onClick={() => {
                    const next = selected ? leadResps.filter(r => r !== m) : [...leadResps, m];
                    updateField("responsibles", next);
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="flex items-center justify-center rounded shrink-0" style={{ width: 14, height: 14, border: selected ? `2px solid ${memberColors[m] || "#128A68"}` : "1.5px solid #CCC", background: selected ? (memberColors[m] || "#128A68") : "transparent" }}>
                    {selected && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  {memberAvatars[m] ? (
                    <img src={memberAvatars[m]} alt={m} className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: memberColors[m] || "#888" }}>{m[0]}</div>
                  )}
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs font-medium" style={{ fontWeight: selected ? 600 : 400 }}>{m}</span>
                    {memberEmails[m] && <span className="text-[10px] text-muted-foreground">{memberEmails[m]}</span>}
                  </div>
                </DropdownMenuItem>
              )})}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-md hover:bg-[#F0F0F0] flex items-center justify-center text-muted-foreground">
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => toast.info("Em breve")}>Duplicar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("Em breve")}>Compartilhar</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                <Trash2 size={14} className="mr-2" /> Arquivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div
        style={{
          height: 60,
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E5E5",
          paddingLeft: 16,
          paddingRight: 16,
          flexShrink: 0,
        }}
        className="grid grid-cols-3 items-center"
      >
        {/* Esquerda — avatar, nome e funil */}
        <div className="flex items-center gap-2 justify-self-start min-w-0">
          <LeadAvatar name={lead.name} avatarUrl={leadAvatarUrl} size={40} onError={refetchLeadAvatar} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="font-bold truncate" style={{ fontSize: 16, color: "#111111" }}>{lead.name}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">#{lead.dealNumber}</span>
            </div>
            <span className="text-[10px] text-muted-foreground truncate">
              {pipeline ? <>{pipeline.name} → {stages[activeIdx]?.title ?? "—"}</> : "Lead sem negócio"}
            </span>
          </div>
        </div>

        {/* Centro — etapas */}
        <div className="flex items-center justify-center" style={{ gap: 3 }}>
          {stages.map((s, idx) => {
            const isActive = idx === activeIdx;
            const isPast = idx < activeIdx;
            const bg = isActive ? "#128A68" : isPast ? "#E1F5EE" : "#F5F5F5";
            const color = isActive ? "#FFFFFF" : isPast ? "#085041" : "#AAAAAA";
            const stageRef = lead.stageEnteredAt ? lead.stageEnteredAt.split("T")[0] : lead.entryDate;
            const days = idx === activeIdx ? daysBetween(stageRef, today) : isPast ? 2 : 0;
            return (
              <button
                key={s.id}
                onClick={() => handleStageClick(s.id)}
                className="flex flex-col items-center justify-center transition-all hover:opacity-80 shrink-0"
              >
                <div
                  style={{
                    background: bg,
                    color,
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "3px 14px",
                    clipPath: "polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%, 7px 50%)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.title}
                </div>
                <span style={{ fontSize: 9, color: "#AAAAAA", marginTop: 2 }}>
                  {days} {days === 1 ? "dia" : "dias"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Direita — vazio para balancear o grid */}
        <div />
      </div>

      {/* CONTENT — abaixo da topbar/etapas (ambas altura fixa, fora deste
          bloco), ocupa o resto da viewport. minHeight: 0 é obrigatório aqui:
          sem isso, um filho de flex nunca encolhe além do conteúdo interno e
          o overflowY:auto das duas colunas simplesmente não faz nada. */}
      <div className="flex gap-4 p-4" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* LEFT COLUMN — Contato/Qualificação/Origem/Tags rolam aqui, isoladas
            do resto da tela. */}
        <aside style={{ width: 300, flexShrink: 0, overflowY: "auto", height: "100%" }} className="space-y-3">
          {SECTION_ORDER.map(key => (
            <section
              key={key}
              style={{
                background: "#FFFFFF",
                borderRadius: 10,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                border: "1px solid #E5E7EB",
              }}
            >
              <button
                onClick={() => toggleSection(key)}
                className="w-full flex items-center justify-between py-2.5 pr-3 hover:bg-[#F0FAF6] transition-colors rounded-t-[10px]"
                style={{ borderLeft: "3px solid #128A68", paddingLeft: 8 }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#128A68", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {SECTION_TITLES[key]}
                </span>
                <ChevronDown
                  size={14}
                  color="#128A68"
                  style={{
                    transform: openSections[key] ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 0.2s",
                  }}
                />
              </button>

              {openSections[key] && (
                <div className="px-3 pb-3 space-y-2.5 border-t" style={{ borderColor: "#E5E7EB" }}>
                  {key === "negocio" && (
                    <div className="pt-2 space-y-2">
                      <EditableField
                        label="Orçamento / Valor"
                        value={lead.value ?? 0}
                        type="number"
                        display={v => formatBRL(Number(v) || 0)}
                        valueStyle={{ color: "#000000", fontWeight: 700, fontSize: 15 }}
                        onSave={v => updateField("value", Number(v.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0)}
                      />
                      <div>
                        <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>Pipeline</label>
                        <p style={{ fontSize: 13, color: "#111111" }}>{pipeline?.name ?? "Sem negócio ainda"}</p>
                      </div>
                      <div>
                        <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>Produto</label>
                        <Select
                          value={lead.productId || "none"}
                          onValueChange={v => {
                            const pid = v === "none" ? undefined : v;
                            const prod = products.find(p => p.id === pid);
                            updateField("productId", pid);
                            updateField("value", prod?.defaultValue ?? 0);
                          }}
                        >
                          <SelectTrigger className="h-9 rounded-md text-sm focus:ring-0 focus:ring-offset-0 focus:border-primary">
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
                      <div>
                        <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>Responsáveis</label>
                        <div className="border rounded-md p-1.5 space-y-0.5 max-h-[110px] overflow-y-auto" style={{ borderColor: "hsl(var(--border))" }}>
                          {teamMembers.map(m => {
                            const sel = leadResps.includes(m);
                            return (
                              <button
                                key={m}
                                type="button"
                                disabled={pipelinePerms.blockChangeAttendant}
                                onClick={() => {
                                  const next = sel ? leadResps.filter(r => r !== m) : [...leadResps, m];
                                  updateField("responsibles", next);
                                }}
                                className="flex items-center gap-2 w-full px-1.5 py-1 rounded text-left hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                <div className="flex items-center justify-center rounded shrink-0" style={{ width: 13, height: 13, border: sel ? `2px solid ${memberColors[m] || "#128A68"}` : "1.5px solid #CCC", background: sel ? (memberColors[m] || "#128A68") : "transparent" }}>
                                  {sel && <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </div>
                                <span className="text-xs truncate" style={{ fontWeight: sel ? 600 : 400 }}>{m}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>Data de entrada</label>
                        <p style={{ fontSize: 13, color: "#111111" }}>
                          {new Date(lead.entryDate).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div>
                        <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>Próxima atividade</label>
                        <p style={{ fontSize: 13, color: "#111111" }}>
                          {(() => {
                            const next = (lead.activities ?? [])
                              .filter(a => a.scheduledAt && !a.completedAt && new Date(a.scheduledAt) > new Date())
                              .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];
                            return next ? new Date(next.scheduledAt!).toLocaleDateString("pt-BR") : "—";
                          })()}
                        </p>
                      </div>
                    </div>
                  )}

                  {key === "contato" && (
                    <div className="pt-2 space-y-2">
                      <EditableField label="Nome completo" value={lead.name} onSave={v => updateField("name", v)} />
                      <EditableField label="Empresa" value={lead.company} onSave={v => updateField("company", v)} />
                      <EditableField
                        label="WhatsApp"
                        value={lead.whatsapp}
                        type="tel"
                        display={v => v ? formatPhone(v) : ""}
                        onSave={v => updateField("whatsapp", v)}
                        rightAdornment={
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (hasActiveWaConnection) {
                                openChat(lead.id);
                              } else {
                                const phone = lead.whatsapp?.replace(/\D/g, "");
                                if (phone) window.open(`https://wa.me/${phone}`, "_blank");
                              }
                            }}
                            className="hover:opacity-80 transition-opacity"
                            aria-label="Abrir chat"
                          >
                            <WhatsAppIcon size={16} />
                          </button>
                        }
                      />
                      {/* Multi-email */}
                      <div>
                        <label className="block mb-1" style={{ fontSize: 12, color: "#128A68", fontWeight: 600 }}>E-mail</label>
                        {(lead.emails ?? (lead.email ? [lead.email] : [])).map((em, idx) => (
                          <div key={idx} className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-[#F5F5F5] transition-colors">
                            <span style={{ fontSize: 13, color: "#111111" }}>{em}</span>
                            <button
                              onClick={() => {
                                const updated = (lead.emails ?? (lead.email ? [lead.email] : [])).filter((_, i) => i !== idx);
                                updateLead(lead.id, { emails: updated, email: updated[0] });
                              }}
                              className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            >
                              <X size={12} color="#AAAAAA" />
                            </button>
                          </div>
                        ))}
                        {addEmailMode ? (
                          <div className="flex items-center gap-1 mt-1">
                            <Input
                              autoFocus
                              type="email"
                              value={newEmailDraft}
                              onChange={e => setNewEmailDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  const em = newEmailDraft.trim().toLowerCase();
                                  if (em) {
                                    const updated = [...(lead.emails ?? (lead.email ? [lead.email] : [])), em];
                                    updateLead(lead.id, { emails: updated, email: updated[0] });
                                  }
                                  setNewEmailDraft("");
                                  setAddEmailMode(false);
                                }
                                if (e.key === "Escape") { setNewEmailDraft(""); setAddEmailMode(false); }
                              }}
                              onBlur={() => { setNewEmailDraft(""); setAddEmailMode(false); }}
                              placeholder="email@exemplo.com"
                              className="h-7 text-xs rounded-md flex-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddEmailMode(true)}
                            className="text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-[#F5F5F5] transition-colors w-full"
                            style={{ fontSize: 12, color: "#AAAAAA", fontStyle: "italic" }}
                          >
                            + Adicionar
                          </button>
                        )}
                      </div>
                      <EditableField label="CPF/CNPJ" value={lead.document} display={v => v ? formatDocument(v) : ""} onSave={v => updateField("document", v)} />
                      <CityField value={lead.city} onSave={v => updateField("city", v)} />
                    </div>
                  )}

                  {key === "qualificacao" && (() => {
                    const defaultGroup = customFieldGroups.find(g => g.isDefault);
                    if (!defaultGroup || defaultGroup.items.length === 0) {
                      return (
                        <p className="text-[11px] text-[#AAAAAA] text-center py-4">
                          Adicione perguntas em Configurações → Campos adicionais.
                        </p>
                      );
                    }
                    return (
                      <div className="pt-2 space-y-2">
                        {defaultGroup.items.map(f => {
                          const val = localCustomValues[f.id] ?? "";
                          const saveValue = async (v: string) => {
                            const next = { ...localCustomValues, [f.id]: v };
                            setLocalCustomValues(next);
                            await updateLeadCustomFieldValues(lead.id, next);
                          };
                          if (f.fieldType === "boolean") {
                            const isYes = val === "Sim";
                            return (
                              <div key={f.id} className="flex items-center justify-between gap-2">
                                <label className="block" style={{ fontSize: 11, color: "#AAAAAA" }}>{f.label}</label>
                                <div className="flex items-center gap-2">
                                  <span style={{ fontSize: 12, color: isYes ? "#128A68" : "#AAAAAA" }}>
                                    {isYes ? "Sim" : "Não"}
                                  </span>
                                  <Switch checked={isYes} onCheckedChange={v => saveValue(v ? "Sim" : "Não")} />
                                </div>
                              </div>
                            );
                          }
                          return (
                            <EditableField
                              key={f.id}
                              label={f.label}
                              value={val}
                              type={f.fieldType === "date" ? "date" : "text"}
                              onSave={saveValue}
                              display={customFieldDisplay(f.label, f.fieldType)}
                            />
                          );
                        })}
                      </div>
                    );
                  })()}

                  {key === "origemTags" && (
                    <>
                      <div className="pt-2">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">Canal</label>
                        <Select value={lead.origin} onValueChange={v => updateField("origin", v)}>
                          <SelectTrigger className="h-9 rounded-md text-sm focus:ring-0 focus:ring-offset-0 focus:border-primary">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Instagram","Facebook Ads","Meta Ads","Google Ads","TikTok Ads","LinkedIn Ads","YouTube Ads","Email Marketing","Orgânico","WhatsApp","Evento","Indicação","Site","Outro"].map(o => (
                              <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <UtmSection lead={lead} updateField={updateField} />

                      <div style={{ borderTop: "1px solid #E5E5E5", margin: "8px 0 4px" }} />

                      <div className="space-y-2">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">Tags</label>
                        <div className="flex flex-wrap gap-1.5">
                          {(lead.tags || []).map(tagName => {
                            const t = crmTags.find(x => x.name === tagName);
                            return (
                              <span
                                key={tagName}
                                className="text-[10px] pl-2 pr-1 py-0.5 rounded-full text-white font-medium inline-flex items-center gap-1"
                                style={{ background: t?.color || "#888" }}
                              >
                                {tagName}
                                <button
                                  type="button"
                                  onClick={() => updateField("tags", (lead.tags || []).filter(x => x !== tagName))}
                                  className="inline-flex items-center justify-center rounded-full transition-colors hover:bg-white/25"
                                  style={{ width: 13, height: 13 }}
                                  aria-label={`Remover tag ${tagName}`}
                                >
                                  <X size={9} />
                                </button>
                              </span>
                            );
                          })}
                          {(!lead.tags || lead.tags.length === 0) && (
                            <span className="text-xs text-muted-foreground italic">Nenhuma tag</span>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-md h-8 text-xs"
                              style={{ borderColor: "#128A68", color: "#128A68" }}
                            >
                              <Plus size={12} className="mr-1" /> Tag
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            {crmTags.length === 0 && (
                              <div className="px-3 py-2 text-xs text-muted-foreground">
                                Crie tags em Configurações.
                              </div>
                            )}
                            {crmTags.map(t => {
                              const has = (lead.tags || []).includes(t.name);
                              return (
                                <DropdownMenuItem
                                  key={t.id}
                                  onClick={() => {
                                    const cur = lead.tags || [];
                                    const next = has ? cur.filter(x => x !== t.name) : [...cur, t.name];
                                    updateField("tags", next);
                                  }}
                                >
                                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: t.color }} />
                                  <span className="flex-1">{t.name}</span>
                                  {has && <span className="text-xs text-primary">✓</span>}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          ))}

          {/* Seções de campos adicionais criados pelo usuário */}
          {customFieldGroups.filter(g => !g.isDefault).map(g => (
            <section
              key={g.id}
              style={{
                background: "#FFFFFF",
                borderRadius: 10,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                border: "1px solid #E5E7EB",
              }}
            >
              <button
                onClick={() => toggleSection(g.id)}
                className="w-full flex items-center justify-between py-2.5 pr-3 hover:bg-[#F0FAF6] transition-colors rounded-t-[10px]"
                style={{ borderLeft: "3px solid #128A68", paddingLeft: 8 }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#128A68", letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {g.name}
                </span>
                <ChevronDown
                  size={14}
                  color="#128A68"
                  style={{
                    transform: openSections[g.id] !== false ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 0.2s",
                  }}
                />
              </button>

              {openSections[g.id] !== false && (
                <div className="px-3 pb-3 space-y-2.5 border-t" style={{ borderColor: "#E5E7EB" }}>
                  {g.items.length === 0 ? (
                    <p className="text-[11px] text-[#AAAAAA] text-center py-4">
                      Adicione perguntas em Configurações → Campos adicionais.
                    </p>
                  ) : (
                    <div className="pt-2 space-y-2">
                      {g.items.map(f => {
                        const val = localCustomValues[f.id] ?? "";
                        const saveValue = async (v: string) => {
                          const next = { ...localCustomValues, [f.id]: v };
                          setLocalCustomValues(next);
                          await updateLeadCustomFieldValues(lead.id, next);
                        };
                        if (f.fieldType === "boolean") {
                          const isYes = val === "Sim";
                          return (
                            <div key={f.id} className="flex items-center justify-between gap-2">
                              <label className="block" style={{ fontSize: 11, color: "#AAAAAA" }}>{f.label}</label>
                              <div className="flex items-center gap-2">
                                <span style={{ fontSize: 12, color: isYes ? "#128A68" : "#AAAAAA" }}>
                                  {isYes ? "Sim" : "Não"}
                                </span>
                                <Switch checked={isYes} onCheckedChange={v => saveValue(v ? "Sim" : "Não")} />
                              </div>
                            </div>
                          );
                        }
                        return (
                          <EditableField
                            key={f.id}
                            label={f.label}
                            value={val}
                            type={f.fieldType === "date" ? "date" : "text"}
                            onSave={saveValue}
                            display={customFieldDisplay(f.label, f.fieldType)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
        </aside>

        {/* RIGHT COLUMN — só esta coluna rola pra ver Anotações/Atividades;
            as Tabs (flexShrink:0) ficam fixas no topo da coluna. */}
        <section
          style={{
            flex: 1,
            background: "#FFFFFF",
            borderRadius: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            border: "1px solid #E5E7EB",
            minWidth: 0,
            marginRight: "clamp(0px, calc((100vw - 960px) * 0.30), 60px)",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 border-b" style={{ borderColor: "#E5E5E5", flexShrink: 0 }}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="px-3 py-3 text-sm transition-colors"
                  style={{
                    color: active ? "#128A68" : "#333333",
                    fontWeight: active ? 600 : 400,
                    borderBottom: active ? "2px solid #128A68" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-4" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {tab === "anotacoes" && (
              <div className="space-y-3">
                <div
                  style={{
                    border: `1px solid ${newNoteActive ? "hsl(var(--primary))" : "#E5E5E5"}`,
                    borderRadius: 10,
                    background: "#FAFAFA",
                    padding: 12,
                    transition: "border-color 0.15s",
                  }}
                >
                  <div
                    ref={newNoteDivRef}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => setNewNoteActive(true)}
                    onKeyDown={e => { if (e.key === "Escape") setMentionState(null); }}
                    onKeyUp={handleNewNoteKey}
                    onMouseUp={handleNewNoteKey}
                    onSelect={handleNewNoteKey}
                    data-placeholder="Escreva uma anotação, @nome..."
                    className="note-content bg-white border border-card-border rounded-md text-sm px-3 py-2 outline-none focus:ring-1 focus:ring-primary empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none"
                    style={{
                      color: "#111111",
                      minHeight: newNoteActive ? 80 : 38,
                      wordBreak: "break-word",
                      transition: "min-height 0.15s",
                    }}
                  />
                  {newNoteActive && (
                    <>
                      <div className="flex items-center justify-between gap-0.5 pt-2 mt-2 border-t border-card-border">
                        <div className="flex items-center gap-0.5">
                        {[
                          { icon: <Bold size={13} />, title: "Negrito", cmd: "bold" },
                          { icon: <Italic size={13} />, title: "Itálico", cmd: "italic" },
                          { icon: <Underline size={13} />, title: "Sublinhado", cmd: "underline" },
                          { icon: <AtSign size={13} />, title: "Mencionar", cmd: "mention" },
                          { icon: <List size={13} />, title: "Lista com marcadores", cmd: "insertUnorderedList" },
                          { icon: <ListOrdered size={13} />, title: "Lista numerada", cmd: "insertOrderedList" },
                        ].map(({ icon, title, cmd }) => {
                          const isActive = activeFormats.has(cmd);
                          return (
                            <button
                              key={title}
                              title={title}
                              onMouseDown={e => { e.preventDefault(); applyNewNoteFormat(cmd); }}
                              className={`flex items-center justify-center rounded transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                              style={{ width: 26, height: 26 }}
                            >
                              {icon}
                            </button>
                          );
                        })}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-md h-7 text-xs"
                            onClick={() => {
                              if (newNoteDivRef.current) newNoteDivRef.current.innerHTML = "";
                              setNewNoteActive(false);
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={handleSaveNote}
                            size="sm"
                            className="rounded-md h-7 text-xs"
                            style={{ background: "hsl(var(--primary))", color: "#FFFFFF" }}
                          >
                            Salvar
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Unified timeline: notes + stage events */}
                {unifiedActivities.map((item, idx) => {
                  const isLast = idx === unifiedActivities.length - 1;
                  if (item.type === "note") {
                    const n = item;
                    const isEditing = editingNoteId === n.id;
                    const toolbarButtons = [
                      { icon: <Bold size={13} />, title: "Negrito", cmd: "bold" },
                      { icon: <Italic size={13} />, title: "Itálico", cmd: "italic" },
                      { icon: <Underline size={13} />, title: "Sublinhado", cmd: "underline" },
                      { icon: <AtSign size={13} />, title: "Mencionar", cmd: "mention" },
                      { icon: <List size={13} />, title: "Lista com marcadores", cmd: "insertUnorderedList" },
                      { icon: <ListOrdered size={13} />, title: "Lista numerada", cmd: "insertOrderedList" },
                    ];
                    return (
                      <div key={n.id} className="flex gap-3 pb-3">
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 22 }}>
                          <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center mt-1.5 flex-shrink-0" style={{ background: "#F5F5F4", border: "1px solid #E5E5E5" }}>
                            <StickyNote size={10} color="#888888" />
                          </div>
                          {!isLast && <div className="w-px flex-1 mt-1.5" style={{ background: "#E5E5E5", minHeight: 12 }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                      <div
                        style={{
                          background: "#FFFBEB",
                          border: "1px solid #FCD34D",
                          borderRadius: 5,
                          padding: 15,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {(() => { const authorName = n.userName ?? lead.responsible; return memberAvatars[authorName] ? (
                            <img src={memberAvatars[authorName]} alt={authorName} className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                              style={{ background: memberColors[authorName] || "#888888" }}
                            >
                              {authorName?.[0] ?? "?"}
                            </div>
                          ); })()}
                          <span className="text-xs font-semibold" style={{ color: "#111111" }}>{n.userName ?? lead.responsible}</span>
                          <span className="text-[11px] text-muted-foreground">{fmtActivityDate(n.date)}</span>
                          {n.pinned && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#D97706" }}>
                              Fixada
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              onClick={() => pinActivity(lead.id, n.id, !n.pinned)}
                              className="flex items-center justify-center rounded-md transition-colors"
                              style={{
                                width: 24, height: 24,
                                background: n.pinned ? "#FEF3C7" : "transparent",
                                color: n.pinned ? "#D97706" : undefined,
                              }}
                              title={n.pinned ? "Desafixar anotação" : "Fixar anotação no topo"}
                            >
                              <Pin size={13} className={n.pinned ? "" : "text-muted-foreground"} style={n.pinned ? { color: "#D97706" } : {}} />
                            </button>
                            <button
                              onClick={() => startEditing(n.id, n.description)}
                              className="flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                              style={{ width: 24, height: 24 }}
                              title="Editar anotação"
                            >
                              <Pencil size={13} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setDeletingNoteId(n.id)}
                              className="flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                              style={{ width: 24, height: 24 }}
                              title="Excluir anotação"
                            >
                              <Trash2 size={13} className="text-destructive" />
                            </button>
                          </div>
                        </div>
                        <div className="border-t border-card-border my-2" />
                        {isEditing ? (
                          <>
                            <div
                              ref={editingDivRef}
                              contentEditable
                              suppressContentEditableWarning
                              onKeyDown={e => { if (e.key === "Escape") setMentionState(null); }}
                              onKeyUp={handleEditKey}
                              onMouseUp={handleEditKey}
                              onSelect={handleEditKey}
                              className="note-content bg-white border border-card-border rounded-md text-sm mt-1 px-3 py-2 min-h-[70px] outline-none focus:ring-1 focus:ring-primary"
                              style={{ color: "#111111", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                            />
                            <div className="flex items-center justify-between pt-2 mt-2 border-t border-card-border">
                              <div className="flex items-center gap-0.5">
                                {toolbarButtons.map(({ icon, title, cmd }) => {
                                  const isActive = activeFormats.has(cmd);
                                  return (
                                    <button
                                      key={title}
                                      title={title}
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        if (cmd === "mention") {
                                          editingDivRef.current?.focus();
                                          document.execCommand("insertText", false, "@");
                                          detectMention("edit");
                                        } else {
                                          applyFormat(cmd);
                                        }
                                      }}
                                      className={`flex items-center justify-center rounded transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                      style={{ width: 26, height: 26 }}
                                    >
                                      {icon}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="rounded-md h-7 text-xs" onClick={() => setEditingNoteId(null)}>
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  className="rounded-md h-7 text-xs"
                                  style={{ background: "hsl(var(--primary))", color: "#FFFFFF" }}
                                  onClick={() => {
                                    const html = DOMPurify.sanitize(editingDivRef.current?.innerHTML ?? "");
                                    if (html.trim()) {
                                      updateActivity(lead.id, n.id, html);
                                      toast.success("Anotação atualizada!");
                                    }
                                    setEditingNoteId(null);
                                  }}
                                >
                                  Salvar
                                </Button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div
                            className="text-sm note-content"
                            style={{ color: "#111111" }}
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(n.description) }}
                          />
                        )}
                      </div>
                        </div>
                      </div>
                    );
                  }

                  // Scheduled activity (meeting, call, whatsapp, email, follow_up)
                  if (SCHEDULED_TYPES.includes(item.type)) {
                    const now = new Date();
                    const scheduledDate = item.scheduledAt ? fmtScheduledDate(item.scheduledAt) : null;
                    const isCompleted = !!item.completedAt;
                    const isNoShow = !!item.noShowAt;
                    const isOverdue = scheduledDate ? (scheduledDate < now && !isCompleted && !isNoShow) : false;
                    const typeLabels: Record<string, string> = {
                      meeting: "Reunião", call: "Ligação", whatsapp: "WhatsApp",
                      email: "E-mail", follow_up: "Follow-up", task: "Tarefa",
                    };
                    const typeIcons: Record<string, typeof CalendarDays> = {
                      meeting: CalendarDays, call: Phone, whatsapp: MessageCircle,
                      email: Mail, follow_up: RefreshCw, task: CheckSquare,
                    };
                    const TypeIcon = typeIcons[item.type] ?? CalendarDays;

                    return (
                      <div key={item.id} className="flex gap-3 pb-3">
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 22 }}>
                          <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center mt-1.5 flex-shrink-0" style={{ background: isCompleted ? "#DCFCE7" : isNoShow ? "#FEF3C7" : isOverdue ? "#FEE2E2" : "#ECFDF5", border: `1px solid ${isCompleted ? "#128A68" : isNoShow ? "#D97706" : isOverdue ? "#E24B4A" : "rgba(18,138,104,0.4)"}` }}>
                            <TypeIcon size={10} color={isCompleted ? "#128A68" : isNoShow ? "#D97706" : isOverdue ? "#E24B4A" : "#128A68"} />
                          </div>
                          {!isLast && <div className="w-px flex-1 mt-1.5" style={{ background: "#E5E5E5", minHeight: 12 }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                      <div
                        className="group"
                        style={{
                          background: item.pinned ? "#FFFBEB" : "#FAFAF7",
                          border: item.pinned
                            ? "1px solid #FCD34D"
                            : isCompleted
                            ? "1.5px solid #128A68"
                            : isNoShow
                            ? "1.5px solid #E24B4A"
                            : isOverdue
                            ? "1.5px solid #FECACA"
                            : "1.5px solid rgba(18, 138, 104, 0.35)",
                          borderRadius: 10, padding: 15,
                        }}
                      >
                        {/* Cabeçalho igual ao das anotações */}
                        <div className="flex items-center gap-2 mb-1">
                          {(() => { const authorName = item.userName ?? lead.responsible; return memberAvatars[authorName] ? (
                            <img
                              src={memberAvatars[authorName]}
                              alt={authorName}
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ background: memberColors[authorName] || "#888888" }}
                            >
                              {authorName?.[0] ?? "?"}
                            </div>
                          ); })()}
                          <span className="text-xs font-semibold" style={{ color: "#111111" }}>{item.userName ?? lead.responsible}</span>
                          <span className="text-[11px] text-muted-foreground"><span className="font-medium">Criado:</span> {fmtActivityDate(item.date)}</span>
                          {item.pinned && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#D97706" }}>
                              Fixada
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            {isCompleted ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mr-1" style={{ background: "#DCFCE7", color: "#128A68" }}>Realizada</span>
                            ) : isNoShow ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mr-1" style={{ background: "#FEF3C7", color: "#D97706" }}>No-show</span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full mr-1" style={{ background: "#F0F0F0", color: "#555555" }}>
                                {typeLabels[item.type] ?? item.type}
                              </span>
                            )}
                            <button
                              onClick={() => pinActivity(lead.id, item.id, !item.pinned)}
                              className="flex items-center justify-center rounded-md transition-colors"
                              style={{ width: 24, height: 24, background: item.pinned ? "#FEF3C7" : "transparent" }}
                              title={item.pinned ? "Desafixar atividade" : "Fixar atividade"}
                            >
                              <Pin size={13} style={{ color: item.pinned ? "#D97706" : "#AAAAAA" }} />
                            </button>
                            <button
                              onClick={() => openEditActivityDialog(item)}
                              className="flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                              style={{ width: 24, height: 24 }}
                              title="Editar atividade"
                            >
                              <Pencil size={13} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => { setDeletingActivityId(item.id); setDeletingActivityGcalId(item.gcalEventId); }}
                              className="flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                              style={{ width: 24, height: 24 }}
                              title="Excluir atividade"
                            >
                              <Trash2 size={13} className="text-destructive" />
                            </button>
                          </div>
                        </div>

                        <div className="border-t border-card-border my-2" />

                        <div className="flex items-start gap-2.5">
                          {/* Círculo de status */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="flex-shrink-0 mt-0.5 transition-all"
                                style={{
                                  width: 18, height: 18, borderRadius: "50%",
                                  border: `2px solid ${isCompleted ? "#128A68" : isNoShow ? "#D97706" : isOverdue ? "#E24B4A" : "#AAAAAA"}`,
                                  background: isCompleted ? "#128A68" : isNoShow ? "#FEF9C3" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                }}
                              >
                                {isCompleted && <Check size={10} color="#FFFFFF" />}
                                {isNoShow && <X size={10} color="#D97706" />}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              {!isCompleted && !isNoShow ? (
                                <>
                                  <DropdownMenuItem onClick={() => completeActivity(lead.id, item.id)} className="text-xs">
                                    <Check size={12} className="mr-2 text-green-600" /> Marcar como realizada
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => markNoShow(lead.id, item.id)} className="text-xs">
                                    <X size={12} className="mr-2 text-amber-600" /> No-show
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => isCompleted ? uncompleteActivity(lead.id, item.id) : unmarkNoShow(lead.id, item.id)}
                                  className="text-xs"
                                >
                                  <RotateCcw size={12} className="mr-2" /> Desfazer
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <div className="flex-1 min-w-0 space-y-1.5">
                            {/* Título */}
                            <p className="text-sm font-semibold" style={{ color: "#111111" }}>{item.title || item.description}</p>
                            {/* Tarefa + Data e hora */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Tarefa</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <TypeIcon size={11} className="text-muted-foreground shrink-0" />
                                  <span className="text-xs" style={{ color: "#111111" }}>{typeLabels[item.type] ?? item.type}</span>
                                </div>
                              </div>
                              {scheduledDate && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Data e hora</p>
                                  <p className="text-xs mt-0.5" style={{ color: "#111111" }}>{fmtActivityDate(item.scheduledAt!)}</p>
                                </div>
                              )}
                            </div>
                            {/* Badge vencida */}
                            {isOverdue && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#E24B4A" }}>Vencida</span>
                              </div>
                            )}
                            {/* Participantes + Link */}
                            {(item.participants?.length || item.meetLink) ? (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Participantes</p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {item.participants && item.participants.length > 0 ? (
                                      <>
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border border-card-border bg-background">
                                          {memberAvatars[item.participants[0]] ? (
                                            <img src={memberAvatars[item.participants[0]]} alt={item.participants[0]} className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                                          ) : (
                                            <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: memberColors[item.participants[0]] ?? "#AAAAAA" }}>
                                              {item.participants[0][0].toUpperCase()}
                                            </div>
                                          )}
                                          <span className="truncate max-w-[80px]">{item.participants[0]}</span>
                                        </div>
                                        {item.participants.length > 1 && (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-card-border hover:bg-muted/80 transition-colors">
                                                +{item.participants.length - 1}
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent align="start" className="w-56 p-2 space-y-1">
                                              <p className="text-[10px] text-muted-foreground font-medium px-1 mb-1.5">Todos os participantes</p>
                                              {item.participants.map(email => (
                                                <div key={email} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-xs">
                                                  {memberAvatars[email] ? (
                                                    <img src={memberAvatars[email]} alt={email} className="w-4 h-4 rounded-full object-cover shrink-0" />
                                                  ) : (
                                                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: memberColors[email] ?? "#AAAAAA" }}>
                                                      {email[0].toUpperCase()}
                                                    </div>
                                                  )}
                                                  <span className="truncate">{email}</span>
                                                </div>
                                              ))}
                                            </PopoverContent>
                                          </Popover>
                                        )}
                                      </>
                                    ) : <span className="text-[10px] text-muted-foreground">—</span>}
                                  </div>
                                </div>
                                {item.meetLink && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Link do Meet / Zoom</p>
                                    <a href={item.meetLink} target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="flex items-center gap-0.5 text-xs mt-0.5"
                                      style={{ color: "hsl(var(--primary))" }}
                                    >
                                      <Link size={10} className="shrink-0" /> <span className="truncate">{item.meetLink}</span>
                                    </a>
                                  </div>
                                )}
                              </div>
                            ) : null}
                            {/* Descrição */}
                            {item.title && item.description && (
                              <div>
                                <p className="text-[10px] text-muted-foreground">Descrição</p>
                                <p className="text-xs mt-0.5 leading-snug" style={{ color: "#111111" }}>{item.description}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                        </div>
                      </div>
                    );
                  }

                  // History entry (stage_change, transfer, won, lost)
                  const meta = item.type === "stage_change"
                    ? { c: "#378ADD", I: ArrowRightLeft }
                    : item.type === "transfer"
                    ? { c: "#8B5CF6", I: ArrowRightLeft }
                    : item.type === "won"
                    ? { c: "#128A68", I: Trophy }
                    : { c: "#E24B4A", I: XCircle };
                  const Icon = meta.I;
                  return (
                    <div key={item.id} className="flex gap-3 pb-3">
                      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 22 }}>
                        <div
                          className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                          style={{ background: meta.c }}
                        >
                          <Icon size={10} color="#FFFFFF" />
                        </div>
                        {!isLast && <div className="w-px flex-1 mt-1.5" style={{ background: "#E5E5E5", minHeight: 12 }} />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="font-medium" style={{ color: "#111111", fontSize: 13 }}>{item.description}</p>
                        <p className="text-muted-foreground mt-0.5" style={{ fontSize: 11 }}>
                          {fmtActivityDate(item.date)}
                          {item.userName && <> · <span className="font-medium">{item.userName}</span></>}
                        </p>
                      </div>
                    </div>
                  );
                })}

                <div className="text-xs italic text-center py-2" style={{ color: "#AAAAAA" }}>
                  {(() => {
                    const d = lead.created_at ? new Date(lead.created_at) : null;
                    if (!d || isNaN(d.getTime())) return "Negócio criado";
                    const fmt = new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit", hour12: false,
                    });
                    const parts = fmt.formatToParts(d);
                    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
                    return `Negócio criado: ${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
                  })()}
                </div>
              </div>
            )}

            {/* Mention dropdown */}
            {mentionState && (() => {
              const filtered = teamMembers.filter(m =>
                m.toLowerCase().includes(mentionState.query.toLowerCase())
              );
              if (filtered.length === 0) return null;
              return (
                <div
                  className="fixed z-50 bg-card border border-card-border rounded-lg shadow-elev-2 py-1 min-w-[180px]"
                  style={{ top: mentionState.top, left: mentionState.left }}
                >
                  {filtered.map(m => (
                    <button
                      key={m}
                      onMouseDown={e => { e.preventDefault(); insertMention(m); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors text-left"
                    >
                      {memberAvatars[m] ? (
                        <img src={memberAvatars[m]} alt={m} className="w-5 h-5 rounded-full object-cover shrink-0" />
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
                          style={{ fontSize: 9, fontWeight: 700, background: memberColors[m] || "#888" }}
                        >
                          {m[0]}
                        </div>
                      )}
                      <span className="text-xs text-foreground">{m}</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {tab === "atividades" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {leadTasks.filter(t => t.status === "Pendente").length} pendente(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="rounded-md h-8 text-xs"
                      style={{ background: "hsl(var(--primary))", color: "#FFFFFF" }}
                      onClick={openActivityDialog}
                    >
                      <Plus size={13} className="mr-1" /> Nova atividade
                    </Button>
                  </div>
                </div>
                {/* Atividades agendadas — card igual às anotações */}
                {lead.activities
                  .filter(a => SCHEDULED_TYPES.includes(a.type))
                  .sort((a, b) => new Date(b.scheduledAt ?? b.date ?? 0).getTime() - new Date(a.scheduledAt ?? a.date ?? 0).getTime())
                  .map(act => {
                    const now = new Date();
                    const scheduledDate = act.scheduledAt ? fmtScheduledDate(act.scheduledAt) : null;
                    const isCompleted = !!act.completedAt;
                    const isNoShow = !!act.noShowAt;
                    const isOverdue = scheduledDate ? (scheduledDate < now && !isCompleted && !isNoShow) : false;
                    const actTypeLabels: Record<string, string> = {
                      meeting: "Reunião", call: "Ligação", whatsapp: "WhatsApp",
                      email: "E-mail", follow_up: "Follow-up", task: "Tarefa",
                    };
                    const actTypeIcons: Record<string, typeof CalendarDays> = {
                      meeting: CalendarDays, call: Phone, whatsapp: MessageCircle,
                      email: Mail, follow_up: RefreshCw, task: CheckSquare,
                    };
                    const ActTypeIcon = actTypeIcons[act.type] ?? CalendarDays;
                    return (
                      <div
                        key={act.id}
                        className="group"
                        style={{
                          background: act.pinned ? "#FFFBEB" : "#FAFAF7",
                          border: act.pinned
                            ? "1px solid #FCD34D"
                            : isCompleted
                            ? "1.5px solid #128A68"
                            : isNoShow
                            ? "1.5px solid #E24B4A"
                            : isOverdue
                            ? "1.5px solid #FECACA"
                            : "1.5px solid rgba(18, 138, 104, 0.35)",
                          borderRadius: 10, padding: 15,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {memberAvatars[lead.responsible] ? (
                            <img src={memberAvatars[lead.responsible]} alt={lead.responsible} className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: respColor }}>
                              {lead.responsible?.[0] ?? "?"}
                            </div>
                          )}
                          <span className="text-xs font-semibold" style={{ color: "#111111" }}>{lead.responsible}</span>
                          <span className="text-[11px] text-muted-foreground"><span className="font-medium">Criado:</span> {fmtActivityDate(act.date)}</span>
                          {act.pinned && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#D97706" }}>
                              Fixada
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-1">
                            {isCompleted ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mr-1" style={{ background: "#DCFCE7", color: "#128A68" }}>Realizada</span>
                            ) : isNoShow ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mr-1" style={{ background: "#FEF3C7", color: "#D97706" }}>No-show</span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full mr-1" style={{ background: "#F0F0F0", color: "#555555" }}>
                                {actTypeLabels[act.type] ?? act.type}
                              </span>
                            )}
                            <button
                              onClick={() => pinActivity(lead.id, act.id, !act.pinned)}
                              className="flex items-center justify-center rounded-md transition-colors"
                              style={{ width: 24, height: 24, background: act.pinned ? "#FEF3C7" : "transparent" }}
                              title={act.pinned ? "Desafixar atividade" : "Fixar atividade"}
                            >
                              <Pin size={13} style={{ color: act.pinned ? "#D97706" : "#AAAAAA" }} />
                            </button>
                            <button
                              onClick={() => openEditActivityDialog(act)}
                              className="flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                              style={{ width: 24, height: 24 }}
                              title="Editar atividade"
                            >
                              <Pencil size={13} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => { setDeletingActivityId(act.id); setDeletingActivityGcalId(act.gcalEventId); }}
                              className="flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                              style={{ width: 24, height: 24 }}
                              title="Excluir atividade"
                            >
                              <Trash2 size={13} className="text-destructive" />
                            </button>
                          </div>
                        </div>
                        <div className="border-t border-card-border my-2" />
                        <div className="flex items-start gap-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="flex-shrink-0 mt-0.5 transition-all"
                                style={{
                                  width: 18, height: 18, borderRadius: "50%",
                                  border: `2px solid ${isCompleted ? "#128A68" : isNoShow ? "#D97706" : isOverdue ? "#E24B4A" : "#AAAAAA"}`,
                                  background: isCompleted ? "#128A68" : isNoShow ? "#D97706" : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                                }}
                              >
                                {isCompleted && <Check size={10} color="#FFFFFF" />}
                                {isNoShow && <X size={10} color="#FFFFFF" />}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-44">
                              {!isCompleted && !isNoShow && (
                                <>
                                  <DropdownMenuItem onClick={() => completeActivity(lead.id, act.id)}>
                                    <Check size={13} className="mr-2 text-green-600" /> Marcar como realizada
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => markNoShow(lead.id, act.id)}>
                                    <X size={13} className="mr-2 text-amber-600" /> No-show
                                  </DropdownMenuItem>
                                </>
                              )}
                              {(isCompleted || isNoShow) && (
                                <DropdownMenuItem onClick={() => isCompleted ? uncompleteActivity(lead.id, act.id) : unmarkNoShow(lead.id, act.id)}>
                                  <RefreshCw size={13} className="mr-2" /> Desfazer
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            {/* Título */}
                            <p className="text-sm font-semibold" style={{ color: "#111111" }}>{act.title || act.description}</p>
                            {/* Tarefa + Data e hora */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Tarefa</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <ActTypeIcon size={11} className="text-muted-foreground shrink-0" />
                                  <span className="text-xs" style={{ color: "#111111" }}>{actTypeLabels[act.type] ?? act.type}</span>
                                </div>
                              </div>
                              {scheduledDate && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Data e hora</p>
                                  <p className="text-xs mt-0.5" style={{ color: "#111111" }}>{fmtActivityDate(act.scheduledAt!)}</p>
                                </div>
                              )}
                            </div>
                            {/* Badge vencida */}
                            {isOverdue && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#E24B4A" }}>Vencida</span>
                              </div>
                            )}
                            {/* Participantes + Link */}
                            {(act.participants?.length || act.meetLink) ? (
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Participantes</p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {act.participants && act.participants.length > 0 ? (
                                      <>
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border border-card-border bg-background">
                                          {memberAvatars[act.participants[0]] ? (
                                            <img src={memberAvatars[act.participants[0]]} alt={act.participants[0]} className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                                          ) : (
                                            <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: memberColors[act.participants[0]] ?? "#AAAAAA" }}>
                                              {act.participants[0][0].toUpperCase()}
                                            </div>
                                          )}
                                          <span className="truncate max-w-[80px]">{act.participants[0]}</span>
                                        </div>
                                        {act.participants.length > 1 && (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-card-border hover:bg-muted/80 transition-colors">
                                                +{act.participants.length - 1}
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent align="start" className="w-56 p-2 space-y-1">
                                              <p className="text-[10px] text-muted-foreground font-medium px-1 mb-1.5">Todos os participantes</p>
                                              {act.participants.map(email => (
                                                <div key={email} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-xs">
                                                  {memberAvatars[email] ? (
                                                    <img src={memberAvatars[email]} alt={email} className="w-4 h-4 rounded-full object-cover shrink-0" />
                                                  ) : (
                                                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: memberColors[email] ?? "#AAAAAA" }}>
                                                      {email[0].toUpperCase()}
                                                    </div>
                                                  )}
                                                  <span className="truncate">{email}</span>
                                                </div>
                                              ))}
                                            </PopoverContent>
                                          </Popover>
                                        )}
                                      </>
                                    ) : <span className="text-[10px] text-muted-foreground">—</span>}
                                  </div>
                                </div>
                                {act.meetLink && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Link do Meet / Zoom</p>
                                    <a href={act.meetLink} target="_blank" rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="flex items-center gap-0.5 text-xs mt-0.5"
                                      style={{ color: "hsl(var(--primary))" }}
                                    >
                                      <Link size={10} className="shrink-0" /> <span className="truncate">{act.meetLink}</span>
                                    </a>
                                  </div>
                                )}
                              </div>
                            ) : null}
                            {/* Descrição */}
                            {act.title && act.description && (
                              <div>
                                <p className="text-[10px] text-muted-foreground">Descrição</p>
                                <p className="text-xs mt-0.5 leading-snug" style={{ color: "#111111" }}>{act.description}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                {leadTasks.length === 0 ? (
                  <div className="text-center py-10 border border-dashed rounded-lg" style={{ borderColor: "#E5E5E5" }}>
                    <p className="text-sm text-muted-foreground">Nenhuma tarefa para este lead</p>
                  </div>
                ) : (
                  leadTasks.map(t => {
                    const done = t.status === "Concluída";
                    const dueLabel = t.dueDate
                      ? new Date(t.dueDate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                      : "";
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
                      >
                        <Checkbox
                          checked={done}
                          onCheckedChange={() => toggleLeadTask(t.id)}
                        />
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                          style={{ background: "#E1F5EE", color: "#128A68" }}
                        >
                          <CheckSquare size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`} style={{ color: done ? undefined : "#111111" }}>
                            {t.title}
                          </p>
                          <p className="text-xs text-muted-foreground">{dueLabel}{dueLabel && " · "}{t.responsible}</p>
                        </div>
                        <Badge
                          className="border-0 text-[10px]"
                          style={{
                            background: done ? "#E1F5EE" : "#FEF3C7",
                            color: done ? "#085041" : "#92400E",
                          }}
                        >
                          {done ? "Concluída" : "Pendente"}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </div>
            )}


            {tab === "email" && (
              <div className="text-center py-16 px-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 mb-4">
                  <Mail size={26} className="text-amber-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">Em breve</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  A integração de e-mail está sendo desenvolvida e será disponibilizada em breve.
                </p>
              </div>
            )}

            {tab === "arquivos" && (
              <div className="space-y-4">
                {/* Upload */}
                <input ref={fileUploadRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" />
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                  style={{ borderColor: uploading ? "#128A68" : "#E5E5E5" }}
                  onClick={() => !uploading && fileUploadRef.current?.click()}
                >
                  <Upload size={24} className="mx-auto mb-2" style={{ color: uploading ? "#128A68" : "#AAAAAA" }} />
                  <p className="text-sm font-medium" style={{ color: "#111111" }}>
                    {uploading ? "Enviando…" : "Clique para enviar um arquivo"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, imagens</p>
                </div>

                {/* Arquivos uploadados */}
                {uploadedFiles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Enviados manualmente</p>
                    <div className="space-y-2">
                      {uploadedFiles.map(f => (
                        <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg group" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
                          <div className="w-9 h-9 rounded-md bg-[#E1F5EE] flex items-center justify-center shrink-0" style={{ color: "#128A68" }}>
                            {f.mimeType.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "#111111" }}>{f.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(f.size)} · {new Date(f.createdAt).toLocaleDateString("pt-BR")} · {f.uploadedBy}
                            </p>
                          </div>
                          <button onClick={() => handleDownloadFile(f)} className="text-muted-foreground hover:text-[#128A68] p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Baixar">
                            <Download size={14} />
                          </button>
                          <button onClick={() => handleDeleteFile(f)} disabled={deletingFileId === f.id} className="text-muted-foreground hover:text-[#E24B4A] p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Excluir">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Arquivos do WhatsApp */}
                {waFiles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Via WhatsApp</p>
                    <div className="space-y-2">
                      {waFiles.map(f => (
                        <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
                          <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: "#F0FDF4", color: "#25D366" }}>
                            {f.type === "image" ? <ImageIcon size={16} /> : <FileText size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "#111111" }}>{f.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(f.createdAt).toLocaleDateString("pt-BR")} · {f.senderName} · {f.fromMe ? "Enviado" : "Recebido"}
                            </p>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: "#E1F5EE", color: "#128A68" }}>WhatsApp</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {uploadedFiles.length === 0 && waFiles.length === 0 && (
                  <div className="text-center py-6">
                    <FileText size={28} className="mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p className="text-sm text-muted-foreground">Nenhum arquivo ainda.</p>
                    <p className="text-xs text-muted-foreground mt-1">Envie um arquivo ou troque mídia pelo WhatsApp.</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </section>
      </div>
    </div>

    {pendingStageAdvance && (() => {
      const pa = pendingStageAdvance;
      const totalMoves = pa.steps.length - 1;
      const currentCol = pa.steps[pa.currentStep];
      const nextCol    = pa.steps[pa.currentStep + 1];
      const finalCol   = pa.steps[pa.steps.length - 1];
      const isSkipping = totalMoves > 1;
      const stepsLeft  = totalMoves - pa.currentStep;
      return (
        <AlertDialog open onOpenChange={open => { if (!open) setPendingStageAdvance(null); }}>
          <AlertDialogContent className="max-w-[380px] p-0 overflow-hidden gap-0">
            {/* Header */}
            <div className="px-5 pt-5 pb-3">
              <AlertDialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                Confirmar avanço de etapa
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {isSkipping ? (
                  <>
                    Mover <strong className="text-foreground font-medium">{lead.name}</strong> para{" "}
                    <strong className="text-foreground font-medium">{nextCol?.colTitle}</strong>
                    {stepsLeft > 1 && <span className="text-muted-foreground/70"> ({stepsLeft} confirmações até {finalCol?.colTitle})</span>}
                    .
                  </>
                ) : (
                  <>
                    Mover <strong className="text-foreground font-medium">{lead.name}</strong> para{" "}
                    <strong className="text-foreground font-medium">{nextCol?.colTitle}</strong>?
                  </>
                )}
              </AlertDialogDescription>
            </div>

            {/* Stepper compacto — de → para */}
            <div className="px-5 pb-4">
              <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 flex items-center gap-2 min-w-0">
                <div className="flex flex-col items-center gap-1 min-w-0 shrink-0 max-w-[120px]">
                  <span className="text-[11px] text-muted-foreground/50 truncate w-full text-center">{currentCol?.colTitle}</span>
                  <span className="block h-[2px] w-full rounded-full bg-muted-foreground/20" />
                </div>
                <ChevronRight className="h-3 w-3 text-primary/60 shrink-0" />
                <div className="flex flex-col items-center gap-1 min-w-0 shrink-0 max-w-[120px]">
                  <span className="text-[11px] text-primary font-semibold truncate w-full text-center">{nextCol?.colTitle}</span>
                  <span className="block h-[2px] w-full rounded-full bg-primary" />
                </div>
                {stepsLeft > 1 && (
                  <>
                    <span className="text-[10px] text-muted-foreground/30 shrink-0">→ ···</span>
                    <div className="flex flex-col items-center gap-1 min-w-0 shrink-0 max-w-[100px]">
                      <span className="text-[11px] text-muted-foreground/30 truncate w-full text-center">{finalCol?.colTitle}</span>
                      <span className="block h-[2px] w-full rounded-full bg-transparent" />
                    </div>
                  </>
                )}
                {totalMoves > 1 && (
                  <span className="ml-auto text-[10px] text-muted-foreground/40 shrink-0 whitespace-nowrap">
                    {pa.currentStep + 1}/{totalMoves}
                  </span>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-muted/20">
              <AlertDialogCancel onClick={() => setPendingStageAdvance(null)} className="h-8 px-3 text-xs">Cancelar</AlertDialogCancel>
              <Button onClick={handleConfirmStageAdvance} size="sm" className="h-8 px-4 text-xs gap-1.5">
                Confirmar <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      );
    })()}

    <AlertDialog open={!!pendingStageBack} onOpenChange={open => { if (!open) setPendingStageBack(null); }}>
      <AlertDialogContent className="max-w-[380px] p-0 overflow-hidden gap-0">
        <div className="px-5 pt-5 pb-3">
          <AlertDialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            Confirmar retrocesso de etapa
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Mover <strong className="text-foreground font-medium">{lead.name}</strong> de volta para{" "}
            <strong className="text-foreground font-medium">{pendingStageBack?.toTitle}</strong>?
          </AlertDialogDescription>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 bg-muted/20">
          <AlertDialogCancel onClick={() => setPendingStageBack(null)} className="h-8 px-3 text-xs">Cancelar</AlertDialogCancel>
          <Button
            size="sm"
            className="h-8 px-4 text-xs"
            onClick={() => {
              if (!pendingStageBack) return;
              moveLead(lead.id, pendingStageBack.fromId, pendingStageBack.toId, 0);
              addActivity(lead.id, {
                date: new Date().toISOString(),
                type: "stage_change",
                description: `Movido de "${pendingStageBack.fromTitle}" para "${pendingStageBack.toTitle}".`,
                userName: profile?.full_name || undefined,
              });
              toast.success(`Etapa alterada para ${pendingStageBack.toTitle}`);
              setPendingStageBack(null);
            }}
          >
            Confirmar
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!deletingNoteId} onOpenChange={open => { if (!open) setDeletingNoteId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tem certeza que deseja excluir esta nota?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeletingNoteId(null)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              if (deletingNoteId) {
                deleteActivity(lead.id, deletingNoteId);
                toast.success("Nota excluída!");
                setDeletingNoteId(null);
              }
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={showLostReasonDialog} onOpenChange={setShowLostReasonDialog}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle size={16} style={{ color: "#E24B4A" }} />
            Motivo da perda
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          Selecione o motivo pelo qual este negócio foi perdido.
        </p>
        {lossReasons.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
            Nenhum motivo cadastrado. Acesse <strong>Configurações → Motivos de perda</strong> para criar.
          </p>
        ) : (
          <Select value={selectedLossReasonId} onValueChange={setSelectedLossReasonId}>
            <SelectTrigger className="rounded-lg focus:ring-0 focus:ring-offset-0 focus:border-primary">
              <SelectValue placeholder="Selecione um motivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Selecione um motivo</SelectItem>
              {lossReasons.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-lg" onClick={() => setShowLostReasonDialog(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="rounded-lg"
            onClick={handleConfirmLost}
          >
            <XCircle size={14} className="mr-1.5" /> Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={showWonProductDialog} onOpenChange={setShowWonProductDialog}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy size={16} style={{ color: "#128A68" }} />
            Confirmar ganho
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Produto */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#555" }}>
              Produto{lead.productId ? "" : " *"}
            </label>
            {lead.productId ? (
              <p className="text-sm px-3 py-2 rounded-lg border border-gray-400 bg-muted text-foreground">
                {products.find(p => p.id === lead.productId)?.name ?? "—"}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  Nenhum produto vinculado. Selecione para registrar o ganho.
                </p>
                <Select
                  value={wonProductId}
                  onValueChange={id => {
                    setWonProductId(id);
                    const prod = products.find(p => p.id === id);
                    setWonCustomValue(prod && prod.defaultValue > 0 ? fmtBRL(prod.defaultValue) : "");
                  }}
                >
                  <SelectTrigger className="rounded-lg border-gray-400 focus:ring-0 focus:ring-offset-0 focus:border-primary">
                    <SelectValue placeholder="Escolha um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione um produto</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.defaultValue > 0 && (
                          <span className="ml-2 text-muted-foreground text-xs">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.defaultValue)}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          {/* Valor da transação — aparece quando produto está selecionado ou já vinculado */}
          {(lead.productId || (wonProductId && wonProductId !== "none")) && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#555" }}>
                Valor da transação
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={wonCustomValue}
                  onChange={e => setWonCustomValue(e.target.value)}
                  onBlur={() => {
                    const n = parseFloat(wonCustomValue.replace(/\./g, "").replace(",", "."));
                    if (!isNaN(n)) setWonCustomValue(fmtBRL(n));
                  }}
                  onFocus={e => e.target.select()}
                  placeholder="0,00"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-400 bg-background text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Valor pré-definido do produto. Altere caso tenha negociado um valor diferente.
              </p>
            </div>
          )}

        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" className="rounded-lg" onClick={() => setShowWonProductDialog(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-lg"
            disabled={!lead.productId && (!wonProductId || wonProductId === "none")}
            style={{ background: "#128A68", color: "#FFFFFF" }}
            onClick={handleConfirmWon}
          >
            <Trophy size={14} className="mr-1.5" />
            Confirmar ganho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Nova / Editar Atividade Dialog */}
    <ActivityDialog
      open={showActivityDialog}
      onClose={() => { setShowActivityDialog(false); setEditingActivityId(null); }}
      onSubmit={handleActivitySubmit}
      isEditing={!!editingActivityId}
      readOnly={!!(editingActivity?.userName && editingActivity.userName !== profile?.full_name)}
      leads={leads}
      teamMembers={teamMembers}
      memberEmails={memberEmails}
      memberAvatars={memberAvatars}
      memberColors={memberColors}
      defaultLead={lead}
      initialValues={editingActivity ? {
        title: editingActivity.title ?? editingActivity.description ?? "",
        type: editingActivity.type,
        scheduledAt: editingActivity.scheduledAt,
        durationMinutes: editingActivity.durationMinutes,
        meetLink: editingActivity.meetLink,
        description: editingActivity.title ? (editingActivity.description ?? "") : "",
        participants: editingActivity.participants,
      } : undefined}
    />

    {/* Confirmar exclusão de atividade */}
    <AlertDialog open={!!deletingActivityId} onOpenChange={v => !v && setDeletingActivityId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir atividade?</AlertDialogTitle>
          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (deletingActivityId) {
                deleteActivity(lead.id, deletingActivityId, deletingActivityGcalId);
                setDeletingActivityId(null);
                setDeletingActivityGcalId(undefined);
                toast.success("Atividade excluída.");
              }
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
