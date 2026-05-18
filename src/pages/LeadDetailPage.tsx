import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useAuth } from "@/context/AuthContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useProfile } from "@/context/ProfileContext";
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

async function loadIbgeCities(onDone: (cities: IbgeCity[]) => void) {
  if (cachedCities.length > 0) { onDone(cachedCities); return; }
  if (citiesFetching) { const wait = () => cachedCities.length > 0 ? onDone(cachedCities) : setTimeout(wait, 200); wait(); return; }
  citiesFetching = true;
  try {
    const res  = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome");
    const data = await res.json() as { nome: string; microrregiao: { mesorregiao: { UF: { sigla: string } } } }[];
    cachedCities = data.map(m => ({ nome: m.nome, sigla: m.microrregiao.mesorregiao.UF.sigla }));
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
      <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Cidade</label>
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
      <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>{label}</label>
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
          className="h-9 rounded-md text-sm"
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
      <div style={{ borderTop: "0.5px solid #E5E5E5", margin: "8px 0 4px" }} />
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
        className="h-8 text-sm rounded-md"
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
    activePipeline,
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
    transferLead,
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

  const lead = id ? leads[id] : undefined;
  const pipeline = useMemo(
    () => pipelines.find(p => p.id === lead?.pipelineId) || activePipeline,
    [pipelines, lead, activePipeline]
  );

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
      .then(({ data }) => setUploadedFiles((data ?? []).map((r: any) => ({
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
        .then(({ data }) => setWaFiles((data ?? []).map((r: any) => ({
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
      setUploadedFiles((data ?? []).map((r: any) => ({
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
    const node = document.createTextNode(`@${name} `);
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
      id: `t-${Date.now()}`,
      title: title.trim(),
      leadId: id,
      leadName: lead.name,
      responsible: lead.responsible,
      dueDate: new Date().toISOString().split("T")[0] + "T12:00",
      status: "Pendente",
    });
  };

  const respColor = memberColors[lead.responsible] || "#888888";
  const initials = lead.name
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const stages = pipeline.columns;
  const activeIdx = stages.findIndex(c => c.id === lead.stage);
  const today = new Date().toISOString().split("T")[0];

  const handleStageClick = (stageId: string) => {
    if (stageId === lead.stage) return;
    const oldCol = stages.find(c => c.id === lead.stage);
    const newCol = stages.find(c => c.id === stageId);
    moveLead(lead.id, lead.stage, stageId, 0);
    addActivity(lead.id, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString(),
      type: "stage_change",
      description: `Movido de "${oldCol?.title}" para "${newCol?.title}".`,
      userName: profile?.full_name || undefined,
    });
    toast.success(`Etapa alterada para ${newCol?.title}`);
  };

  const handleSaveNote = () => {
    const html = newNoteDivRef.current?.innerHTML ?? "";
    if (!html.trim() || html === "<br>") return;
    addActivity(lead.id, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString(),
      type: "note",
      description: html,
    });
    if (newNoteDivRef.current) newNoteDivRef.current.innerHTML = "";
    setNewNote("");
    setNewNoteActive(false);
    toast.success("Anotação salva!");
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

  const updateField = (field: string, value: string | number | undefined) =>
    updateLead(lead.id, { [field]: value });

  const [showWonProductDialog, setShowWonProductDialog] = useState(false);
  const [wonProductId, setWonProductId] = useState<string>("none");
  const [wonTransferPipelineId, setWonTransferPipelineId] = useState<string>("none");
  const [showLostReasonDialog, setShowLostReasonDialog] = useState(false);
  const [selectedLossReasonId, setSelectedLossReasonId] = useState<string>("none");
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveryPipelineId, setRecoveryPipelineId] = useState<string>("");
  const [recoveryColumnId, setRecoveryColumnId] = useState<string>("");


  const handleWon = () => {
    setWonProductId("none");
    setWonTransferPipelineId("none");
    setShowWonProductDialog(true);
  };

  const handleConfirmWon = async () => {
    let prodName: string | undefined;
    let finalValue = lead.value;
    if (wonProductId && wonProductId !== "none") {
      // Produto selecionado agora no dialog
      const prod = products.find(p => p.id === wonProductId);
      prodName = prod?.name;
      finalValue = prod?.defaultValue ?? lead.value;
      await updateLead(lead.id, { productId: wonProductId, value: finalValue });
    } else if (lead.productId) {
      // Produto já estava cadastrado no lead
      const prod = products.find(p => p.id === lead.productId);
      prodName = prod?.name;
      finalValue = lead.value;
    }
    setShowWonProductDialog(false);

    // markLeadWon registra o histórico; transferLead logo depois define dealStatus:"open"
    // para que o card fique ativo no funil de destino (ex: CS).
    markLeadWon(lead.id, prodName, finalValue);

    let transferred = false;
    if (wonTransferPipelineId && wonTransferPipelineId !== "none") {
      const targetPipeline = pipelines.find(p => p.id === wonTransferPipelineId);
      const firstColId = targetPipeline?.columns[0]?.id ?? "";
      if (firstColId) {
        transferLead(lead.id, wonTransferPipelineId, firstColId);
        transferred = true;
      }
    }

    toast.success(
      transferred
        ? `Negócio ganho e transferido para ${pipelines.find(p => p.id === wonTransferPipelineId)?.name ?? "outro funil"}!`
        : "Negócio marcado como ganho!"
    );
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

  const handleOpenRecovery = () => {
    const firstOtherPipeline = pipelines.find(p => p.id !== lead.pipelineId) ?? pipelines[0];
    const pid = firstOtherPipeline?.id ?? lead.pipelineId;
    const firstCol = pipelines.find(p => p.id === pid)?.columns[0]?.id ?? "";
    setRecoveryPipelineId(pid);
    setRecoveryColumnId(firstCol);
    setShowRecoveryDialog(true);
  };

  const handleConfirmRecovery = () => {
    if (!recoveryPipelineId) return;
    const targetPipeline = pipelines.find(p => p.id === recoveryPipelineId);
    const firstColId = targetPipeline?.columns[0]?.id ?? "";
    if (!firstColId) return;
    const targetCol = targetPipeline?.columns[0];
    transferLead(lead.id, recoveryPipelineId, firstColId);
    setShowRecoveryDialog(false);
    addActivity(lead.id, {
      date: new Date().toISOString(),
      type: "stage_change",
      description: `Lead transferido para ${targetPipeline?.name ?? "outro funil"} › ${targetCol?.title ?? ""}`,
    });
    toast.success(`Lead movido para ${targetPipeline?.name ?? "outro funil"}.`);
    navigate("/pipeline");
  };

  const noteActivities = lead.activities.filter(a => a.type === "note");

  const SCHEDULED_TYPES: ActivityType[] = ["meeting", "call", "whatsapp", "email", "follow_up", "task"];

  const unifiedActivities = [...lead.activities]
    .filter(a => a.type === "note" || a.type === "stage_change" || a.type === "won" || a.type === "lost" || SCHEDULED_TYPES.includes(a.type))
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
    <div style={{ background: "#F4F6F8", minHeight: "100vh" }}>
      {/* TOPBAR */}
      <div
        style={{
          height: 60,
          paddingTop: 16,
          paddingBottom: 16,
          background: "#FFFFFF",
          borderBottom: "0.5px solid #EEEEEE",
          position: "sticky",
          top: 0,
          zIndex: 30,
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
          <span style={{ fontWeight: 500 }}>{pipeline.name}</span>
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
                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold"
                style={{ background: "#128A68", color: "#FFFFFF" }}
              >
                <Trophy size={12} /> Ganho
              </button>
              <button
                onClick={handleOpenRecovery}
                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold"
                style={{ background: "#F59E0B", color: "#FFFFFF" }}
              >
                <ArrowRightLeft size={12} /> Recuperação
              </button>
              <button
                onClick={handleLost}
                className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold"
                style={{ background: "#E24B4A", color: "#FFFFFF" }}
              >
                <XCircle size={12} /> Perdido
              </button>
            </>
          )}

          {/* Divisor */}
          <div className="w-px h-6 bg-[#EEEEEE] mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted transition-colors">
                {lead.responsible && memberAvatars[lead.responsible] ? (
                  <img
                    src={memberAvatars[lead.responsible]}
                    alt={lead.responsible}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: lead.responsible ? respColor : "#AAAAAA" }}
                  >
                    {lead.responsible?.[0] ?? "S"}
                  </div>
                )}
                <div className="flex flex-col items-start leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-foreground">{lead.responsible || "Sem responsável"}</span>
                    <ChevronDown size={12} className="text-muted-foreground" />
                  </div>
                  {memberEmails[lead.responsible] && (
                    <span className="text-[10px] text-muted-foreground">{memberEmails[lead.responsible]}</span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {teamMembers.map(m => (
                <DropdownMenuItem
                  key={m}
                  onClick={() => updateField("responsible", m)}
                  className="flex items-center gap-2"
                >
                  {memberAvatars[m] ? (
                    <img
                      src={memberAvatars[m]}
                      alt={m}
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ background: memberColors[m] || "#888" }}
                    >
                      {m[0]}
                    </div>
                  )}
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs font-medium">{m}</span>
                    {memberEmails[m] && (
                      <span className="text-[10px] text-muted-foreground">{memberEmails[m]}</span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
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
          height: 52,
          background: "#FFFFFF",
          borderBottom: "0.5px solid #E5E5E5",
          paddingLeft: 16,
          paddingRight: 16,
        }}
        className="grid grid-cols-3 items-center"
      >
        {/* Esquerda — nome e funil */}
        <div className="flex flex-col justify-self-start min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="font-bold truncate" style={{ fontSize: 16, color: "#111111" }}>{lead.name}</span>
            <span className="text-[11px] text-muted-foreground shrink-0">#{lead.dealNumber}</span>
          </div>
          <span className="text-[10px] text-muted-foreground truncate">
            {pipeline.name} → {stages[activeIdx]?.title ?? "—"}
          </span>
        </div>

        {/* Centro — etapas */}
        <div className="flex items-center justify-center" style={{ gap: 3 }}>
          {stages.map((s, idx) => {
            const isActive = idx === activeIdx;
            const isPast = idx < activeIdx;
            const bg = isActive ? "#128A68" : isPast ? "#E1F5EE" : "#F5F5F5";
            const color = isActive ? "#FFFFFF" : isPast ? "#085041" : "#AAAAAA";
            const days = idx === activeIdx ? daysBetween(lead.entryDate, today) : isPast ? 2 : 0;
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

      {/* CONTENT */}
      <div className="flex gap-4 p-4" style={{ alignItems: "flex-start" }}>
        {/* LEFT COLUMN */}
        <aside style={{ width: 300, flexShrink: 0 }} className="space-y-3">
          {SECTION_ORDER.map(key => (
            <section
              key={key}
              style={{
                background: "#FFFFFF",
                borderRadius: 10,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
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
                <div className="px-3 pb-3 space-y-2.5 border-t" style={{ borderColor: "#F0F0F0" }}>
                  {key === "negocio" && (
                    <div className="pt-2 space-y-2">
                      <EditableField
                        label="Orçamento / Valor"
                        value={lead.value ?? 0}
                        type="number"
                        display={v => formatBRL(Number(v) || 0)}
                        valueStyle={{ color: "#128A68", fontWeight: 700, fontSize: 15 }}
                        onSave={v => updateField("value", Number(v.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0)}
                      />
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Pipeline</label>
                        <p style={{ fontSize: 13, color: "#111111" }}>{pipeline.name}</p>
                      </div>
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Produto</label>
                        <Select
                          value={lead.productId || "none"}
                          onValueChange={v => {
                            const pid = v === "none" ? undefined : v;
                            const prod = products.find(p => p.id === pid);
                            updateField("productId", pid);
                            updateField("value", prod?.defaultValue ?? 0);
                          }}
                        >
                          <SelectTrigger className="h-9 rounded-md text-sm">
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
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Responsável</label>
                        <Select value={lead.responsible} onValueChange={v => updateField("responsible", v)}>
                          <SelectTrigger className="h-9 rounded-md text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {teamMembers.map(m => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Data de entrada</label>
                        <p style={{ fontSize: 13, color: "#111111" }}>
                          {new Date(lead.entryDate).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <EditableField
                        label="Próximo follow-up"
                        value={lead.nextFollowUp}
                        type="date"
                        onSave={v => updateField("nextFollowUp", v)}
                        display={v => new Date(v).toLocaleDateString("pt-BR")}
                      />
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
                            onClick={(e) => { e.stopPropagation(); openChat(lead.id); }}
                            className="hover:opacity-80 transition-opacity"
                            aria-label="Abrir chat"
                          >
                            <WhatsAppIcon size={16} />
                          </button>
                        }
                      />
                      {/* Multi-email */}
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>E-mail</label>
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
                              className="h-7 text-xs rounded-md flex-1"
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
                      <EditableField label="CPF/CNPJ" value={(lead as any).document} display={v => v ? formatDocument(v) : ""} onSave={v => updateField("document" as any, v)} />
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
                              display={f.fieldType === "date" ? (v => v ? new Date(v).toLocaleDateString("pt-BR") : "") : undefined}
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
                          <SelectTrigger className="h-9 rounded-md text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Instagram","Facebook Ads","Meta Ads","Google Ads","TikTok Ads","LinkedIn Ads","YouTube Ads","Email Marketing","Orgânico","WhatsApp","Evento","Indicação","Site","Outro"].map(o => (
                              <SelectItem key={o} value={o}>{o}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Data de entrada</label>
                        <p style={{ fontSize: 13, color: "#111111" }}>
                          {new Date(lead.entryDate).toLocaleDateString("pt-BR")}
                        </p>
                      </div>

                      <UtmSection lead={lead} updateField={updateField} />

                      <div style={{ borderTop: "0.5px solid #E5E5E5", margin: "8px 0 4px" }} />

                      <div className="space-y-2">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">Tags</label>
                        <div className="flex flex-wrap gap-1.5">
                          {(lead.tags || []).map(tagName => {
                            const t = crmTags.find(x => x.name === tagName);
                            return (
                              <span
                                key={tagName}
                                className="text-[10px] px-2 py-0.5 rounded-full text-white font-medium"
                                style={{ background: t?.color || "#888" }}
                              >
                                {tagName}
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
                                    updateField("tags" as any, next as any);
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
                <div className="px-3 pb-3 space-y-2.5 border-t" style={{ borderColor: "#F0F0F0" }}>
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
                            display={f.fieldType === "date" ? (v => v ? new Date(v).toLocaleDateString("pt-BR") : "") : undefined}
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

        {/* RIGHT COLUMN */}
        <section
          style={{
            flex: 1,
            background: "#FFFFFF",
            borderRadius: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            minWidth: 0,
            marginRight: "clamp(0px, calc((100vw - 960px) * 0.30), 60px)",
          }}
        >
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 border-b" style={{ borderColor: "#E5E5E5" }}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="px-3 py-3 text-sm transition-colors"
                  style={{
                    color: active ? "#128A68" : "#AAAAAA",
                    fontWeight: active ? 600 : 500,
                    borderBottom: active ? "2px solid #128A68" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-4">
            {tab === "anotacoes" && (
              <div className="space-y-3">
                <div
                  style={{
                    border: `0.5px solid ${newNoteActive ? "hsl(var(--primary))" : "#E5E5E5"}`,
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
                      <div className="flex items-center gap-0.5 pt-2 mt-2 border-t border-card-border">
                        {[
                          { icon: <Bold size={13} />, title: "Negrito", cmd: "bold" },
                          { icon: <Italic size={13} />, title: "Itálico", cmd: "italic" },
                          { icon: <Underline size={13} />, title: "Sublinhado", cmd: "underline" },
                          { icon: <AtSign size={13} />, title: "Mencionar", cmd: "mention" },
                          { icon: <List size={13} />, title: "Lista com marcadores", cmd: "insertUnorderedList" },
                          { icon: <ListOrdered size={13} />, title: "Lista numerada", cmd: "insertOrderedList" },
                        ].map(({ icon, title, cmd, val }) => {
                          const isActive = activeFormats.has(cmd);
                          return (
                            <button
                              key={title}
                              title={title}
                              onMouseDown={e => { e.preventDefault(); applyNewNoteFormat(cmd, val); }}
                              className={`flex items-center justify-center rounded transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                              style={{ width: 26, height: 26 }}
                            >
                              {icon}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{noteActivities.length}/100 notas</span>
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
                          background: n.pinned ? "#FFFBEB" : "#FAFAF7",
                          border: n.pinned ? "0.5px solid #FCD34D" : "0.5px solid #E5E5E5",
                          borderRadius: 10,
                          padding: 15,
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ background: respColor }}
                          >
                            {lead.responsible[0]}
                          </div>
                          <span className="text-xs font-semibold" style={{ color: "#111111" }}>{lead.responsible}</span>
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
                                {toolbarButtons.map(({ icon, title, cmd, val }) => {
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
                                          applyFormat(cmd, val);
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
                                    const html = editingDivRef.current?.innerHTML ?? "";
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
                            dangerouslySetInnerHTML={{ __html: n.description }}
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
                            ? "0.5px solid #FCD34D"
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
                          {memberAvatars[lead.responsible] ? (
                            <img
                              src={memberAvatars[lead.responsible]}
                              alt={lead.responsible}
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ background: respColor }}
                            >
                              {lead.responsible[0]}
                            </div>
                          )}
                          <span className="text-xs font-semibold" style={{ color: "#111111" }}>{lead.responsible}</span>
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
                              onClick={() => setDeletingActivityId(item.id)}
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

                  // History entry (stage_change, won, lost)
                  const meta = item.type === "stage_change"
                    ? { c: "#378ADD", I: ArrowRightLeft }
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
                        <p className="text-sm font-medium" style={{ color: "#111111" }}>{item.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
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
                            ? "0.5px solid #FCD34D"
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
                              {lead.responsible[0]}
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
                              onClick={() => setDeletingActivityId(act.id)}
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
                        style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5" }}
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
                        <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg group" style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5" }}>
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
                        <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5" }}>
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
            <SelectTrigger className="rounded-lg">
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

    <Dialog open={showRecoveryDialog} onOpenChange={setShowRecoveryDialog}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft size={16} style={{ color: "#F59E0B" }} />
            Transferir para outro funil
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Funil de destino</label>
            <Select
              value={recoveryPipelineId}
              onValueChange={setRecoveryPipelineId}
            >
              <SelectTrigger className="rounded-lg border-card-border">
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setShowRecoveryDialog(false)} className="rounded-lg border-card-border">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmRecovery}
            disabled={!recoveryPipelineId}
            className="rounded-lg"
            style={{ background: "#F59E0B", color: "#FFFFFF" }}
          >
            <ArrowRightLeft size={14} className="mr-1.5" /> Transferir lead
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
              <p className="text-sm px-3 py-2 rounded-lg border border-card-border bg-muted text-foreground">
                {products.find(p => p.id === lead.productId)?.name ?? "—"}
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  Nenhum produto vinculado. Selecione para registrar o ganho.
                </p>
                <Select value={wonProductId} onValueChange={setWonProductId}>
                  <SelectTrigger className="rounded-lg">
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

          {/* Transferência de funil */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "#555" }}>
              Transferir para outro funil{" "}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Encaminhe o cliente ganho para outro funil, como CS ou Onboarding.
            </p>
            <Select value={wonTransferPipelineId} onValueChange={setWonTransferPipelineId}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Manter no funil atual" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Manter no funil atual</SelectItem>
                {pipelines
                  .filter(p => p.id !== lead.pipelineId)
                  .map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {wonTransferPipelineId && wonTransferPipelineId !== "none" && (() => {
              const target = pipelines.find(p => p.id === wonTransferPipelineId);
              const firstCol = target?.columns[0];
              return firstCol ? (
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <span style={{ color: "#128A68" }}>→</span>
                  Entrará em <strong className="text-foreground">{target?.name}</strong> na etapa <strong className="text-foreground">{firstCol.title}</strong>
                </p>
              ) : null;
            })()}
          </div>
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
            {wonTransferPipelineId && wonTransferPipelineId !== "none" ? "Ganho e transferir" : "Confirmar ganho"}
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
                deleteActivity(lead.id, deletingActivityId);
                setDeletingActivityId(null);
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
