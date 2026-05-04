import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useProfile } from "@/context/ProfileContext";
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
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { toast } from "sonner";
import type { ActivityType } from "@/data/mockData";

type TabKey = "anotacoes" | "atividades" | "reunioes" | "email" | "arquivos";

const TABS: { key: TabKey; label: string }[] = [
  { key: "anotacoes", label: "Anotações" },
  { key: "atividades", label: "Atividades" },
  { key: "reunioes", label: "Reuniões" },
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
  } = useCRM();
  const { openChat } = useFloatingChat();
  const { profile } = useProfile();

  const lead = id ? leads[id] : undefined;
  const pipeline = useMemo(
    () => pipelines.find(p => p.id === lead?.pipelineId) || activePipeline,
    [pipelines, lead, activePipeline]
  );

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    contato: true,
    qualificacao: true,
    origemTags: true,
    negocio: true,
  });
  const [tab, setTab] = useState<TabKey>("anotacoes");
  const [newNote, setNewNote] = useState("");
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
  const [qualFields, setQualFields] = useState<{ key: string; label: string; value: string }[]>([
    { key: "buscando", label: "O que o lead está buscando?", value: "" },
    { key: "ramo", label: "Qual o ramo da empresa?", value: "" },
    { key: "decisor", label: "O lead é o decisor?", value: "" },
    { key: "orcamento", label: "Orçamento disponível?", value: "" },
    { key: "previsao", label: "Previsão de fechamento?", value: "" },
  ]);

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

  const toggleSection = (k: SectionKey) =>
    setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const updateField = (field: string, value: string | number | undefined) =>
    updateLead(lead.id, { [field]: value });

  const [showWonProductDialog, setShowWonProductDialog] = useState(false);
  const [wonProductId, setWonProductId] = useState<string>("none");
  const [showLostReasonDialog, setShowLostReasonDialog] = useState(false);
  const [selectedLossReasonId, setSelectedLossReasonId] = useState<string>("none");

  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    title: "",
    type: "meeting" as ActivityType,
    scheduledAt: "",
    dur: "60",
  });

  const handleWon = () => {
    if (!lead.productId) {
      setWonProductId("none");
      setShowWonProductDialog(true);
      return;
    }
    const prod = products.find(p => p.id === lead.productId);
    markLeadWon(lead.id, prod?.name, lead.value);
    toast.success("Negócio marcado como ganho!");
  };

  const handleConfirmWon = async () => {
    let prodName: string | undefined;
    let finalValue = lead.value;
    if (wonProductId && wonProductId !== "none") {
      const prod = products.find(p => p.id === wonProductId);
      prodName = prod?.name;
      finalValue = prod?.defaultValue ?? lead.value;
      await updateLead(lead.id, { productId: wonProductId, value: finalValue });
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

  const unifiedActivities = [...lead.activities]
    .filter(a => a.type === "note" || a.type === "stage_change" || a.type === "won" || a.type === "lost")
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const fmtActivityDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
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
        <button
          onClick={() => navigate("/pipeline")}
          className="flex items-center gap-1.5 text-sm hover:bg-[#F0F0F0] rounded-md px-2 py-1.5 transition-colors"
          style={{ color: "#111111" }}
        >
          <ArrowLeft size={16} />
          <span style={{ fontWeight: 500 }}>{pipeline.name}</span>
        </button>


        <div className="flex items-center gap-2">
          {lead.dealStatus === "won" || lead.dealStatus === "lost" ? (
            <>
              <div
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-semibold"
                style={
                  lead.dealStatus === "won"
                    ? { background: "#DCFCE7", color: "#128A68" }
                    : { background: "#FEE2E2", color: "#E24B4A" }
                }
              >
                {lead.dealStatus === "won"
                  ? <><Trophy size={13} className="shrink-0" /> Ganho</>
                  : <><XCircle size={13} className="shrink-0" /> Perdido</>}
              </div>
              <Button
                onClick={handleReopen}
                size="sm"
                variant="outline"
                className="rounded-lg font-semibold h-8 border-card-border"
              >
                <RotateCcw size={13} className="mr-1" /> Reabrir
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleWon}
                size="sm"
                className="rounded-lg font-semibold h-8"
                style={{ background: "#128A68", color: "#FFFFFF" }}
              >
                <Trophy size={14} className="mr-1" /> Ganho
              </Button>
              <Button
                onClick={handleLost}
                variant="destructive"
                size="sm"
                className="rounded-lg font-semibold h-8"
              >
                <XCircle size={14} className="mr-1" /> Perdido
              </Button>
            </>
          )}
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
          height: 64,
          background: "#FFFFFF",
          borderBottom: "0.5px solid #E5E5E5",
          paddingLeft: 25,
          paddingRight: 16,
        }}
        className="flex items-center overflow-x-auto gap-4"
      >
        <div className="flex flex-col shrink-0">
          <div className="flex items-baseline gap-1.5">
            <span style={{ fontSize: 18, fontWeight: 700, color: "#111111" }}>{lead.name}</span>
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>#{lead.dealNumber}</span>
          </div>
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            {pipeline.name} → {stages[activeIdx]?.title ?? "—"}
          </span>
        </div>
        <div className="flex items-center flex-1 justify-center" style={{ gap: 4 }}>
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
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 22px",
                    clipPath:
                      "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.title}
                </div>
                <span style={{ fontSize: 10, color: "#AAAAAA", marginTop: 4 }}>
                  {days} {days === 1 ? "dia" : "dias"}
                </span>
              </button>
            );
          })}
        </div>
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
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Valor</label>
                        <p style={{ color: "#128A68", fontWeight: 700, fontSize: 16 }}>
                          {formatBRL(products.find(p => p.id === lead.productId)?.defaultValue ?? 0)}
                        </p>
                      </div>
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
                      <EditableField label="E-mail" value={lead.email} type="email" onSave={v => updateField("email", v)} />
                      <EditableField label="CPF/CNPJ" value={(lead as any).document} onSave={v => updateField("document" as any, v)} />
                      <EditableField label="Cidade/Estado" value={(lead as any).location} onSave={v => updateField("location" as any, v)} />
                      <EditableField label="LinkedIn" value={(lead as any).linkedin} onSave={v => updateField("linkedin" as any, v)} />
                    </div>
                  )}

                  {key === "qualificacao" && (
                    <>
                      <div className="pt-2 space-y-2">
                        {qualFields.map(f => {
                          if (f.key === "decisor") {
                            const isYes = f.value === "Sim";
                            return (
                              <div key={f.key} className="flex items-center justify-between gap-2">
                                <label className="block" style={{ fontSize: 11, color: "#AAAAAA" }}>{f.label}</label>
                                <div className="flex items-center gap-2">
                                  <span style={{ fontSize: 12, color: isYes ? "#128A68" : "#AAAAAA" }}>
                                    {isYes ? "Sim" : "Não"}
                                  </span>
                                  <Switch
                                    checked={isYes}
                                    onCheckedChange={(v) =>
                                      setQualFields(prev => prev.map(p => p.key === f.key ? { ...p, value: v ? "Sim" : "Não" } : p))
                                    }
                                  />
                                </div>
                              </div>
                            );
                          }
                          const fieldType: "date" | "text" = f.key === "previsao" ? "date" : "text";
                          return (
                            <EditableField
                              key={f.key}
                              label={f.label}
                              value={f.value}
                              type={fieldType}
                              onSave={v =>
                                setQualFields(prev => prev.map(p => p.key === f.key ? { ...p, value: v } : p))
                              }
                              display={fieldType === "date" ? (v => new Date(v).toLocaleDateString("pt-BR")) : undefined}
                            />
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-md h-8 text-xs mt-2"
                        style={{ borderColor: "#128A68", color: "#128A68" }}
                        onClick={() => {
                          const k = `custom-${Date.now()}`;
                          setQualFields(prev => [...prev, { key: k, label: "Novo campo", value: "" }]);
                        }}
                      >
                        <Plus size={12} className="mr-1" /> Adicionar campo
                      </Button>
                    </>
                  )}

                  {key === "origemTags" && (
                    <>
                      <div className="pt-2">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">Canal</label>
                        <Select value={lead.origin} onValueChange={v => updateField("origin", v)}>
                          <SelectTrigger className="h-9 rounded-md text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"].map(o => (
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
                      <EditableField
                        label="UTM source"
                        value={(lead as any).utmSource}
                        onSave={v => updateField("utmSource" as any, v)}
                      />

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
        </aside>

        {/* RIGHT COLUMN */}
        <section
          style={{
            flex: 1,
            background: "#FFFFFF",
            borderRadius: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            minWidth: 0,
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
                {unifiedActivities.map(item => {
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
                      <div
                        key={n.id}
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
                              aria-label="Editar anotação"
                            >
                              <Pencil size={13} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => setDeletingNoteId(n.id)}
                              className="flex items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                              style={{ width: 24, height: 24 }}
                              aria-label="Excluir anotação"
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
                    <div key={item.id} className="flex items-start gap-3 py-1">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: meta.c }}
                      >
                        <Icon size={10} color="#FFFFFF" />
                      </div>
                      <div className="flex-1 min-w-0">
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
                  <NewLeadTaskButton onAdd={addLeadTask} />
                </div>
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

            {tab === "reunioes" && (() => {
              const scheduled = lead.activities
                .filter(a => a.scheduledAt)
                .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());

              const typeStyle: Record<string, { bg: string; color: string }> = {
                meeting:   { bg: "#DBEAFE", color: "#1D4ED8" },
                call:      { bg: "#D1FAE5", color: "#065F46" },
                follow_up: { bg: "#FEF3C7", color: "#92400E" },
                task:      { bg: "#EDE9FE", color: "#5B21B6" },
              };
              const typeLabel: Record<string, string> = {
                meeting: "Reunião", call: "Call", follow_up: "Follow-up", task: "Tarefa",
              };

              return (
                <div className="space-y-3">
                  {!showMeetingForm ? (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="rounded-md h-8 text-xs"
                        style={{ background: "hsl(var(--primary))", color: "#FFFFFF" }}
                        onClick={() => setShowMeetingForm(true)}
                      >
                        <Plus size={13} className="mr-1" /> Agendar atividade
                      </Button>
                    </div>
                  ) : (
                    <div style={{ border: "0.5px solid hsl(var(--primary))", borderRadius: 10, padding: 14, background: "#FAFAFA" }}>
                      <p className="text-xs font-semibold mb-3" style={{ color: "#111111" }}>Nova atividade agendada</p>
                      <div className="space-y-2.5">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Título *</label>
                          <Input
                            placeholder="Ex: Call de alinhamento"
                            className="h-8 text-sm"
                            value={meetingForm.title}
                            onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Tipo</label>
                            <Select value={meetingForm.type} onValueChange={v => setMeetingForm(f => ({ ...f, type: v as ActivityType }))}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="meeting">Reunião</SelectItem>
                                <SelectItem value="call">Call</SelectItem>
                                <SelectItem value="follow_up">Follow-up</SelectItem>
                                <SelectItem value="task">Tarefa</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Duração</label>
                            <Select value={meetingForm.dur} onValueChange={v => setMeetingForm(f => ({ ...f, dur: v }))}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 min</SelectItem>
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="60">1 hora</SelectItem>
                                <SelectItem value="120">2 horas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Data e hora *</label>
                          <Input
                            type="datetime-local"
                            className="h-8 text-sm"
                            value={meetingForm.scheduledAt}
                            onChange={e => setMeetingForm(f => ({ ...f, scheduledAt: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs rounded-md"
                          onClick={() => { setShowMeetingForm(false); setMeetingForm({ title: "", type: "meeting", scheduledAt: "", dur: "60" }); }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs rounded-md"
                          style={{ background: "hsl(var(--primary))", color: "#FFFFFF" }}
                          onClick={() => {
                            if (!meetingForm.title.trim() || !meetingForm.scheduledAt) {
                              toast.error("Preencha título e data/hora.");
                              return;
                            }
                            addActivity(lead.id, {
                              type: meetingForm.type,
                              description: meetingForm.title,
                              title: meetingForm.title,
                              date: new Date().toISOString(),
                              scheduledAt: new Date(meetingForm.scheduledAt).toISOString(),
                              durationMinutes: Number(meetingForm.dur),
                            });
                            toast.success("Atividade agendada!");
                            setShowMeetingForm(false);
                            setMeetingForm({ title: "", type: "meeting", scheduledAt: "", dur: "60" });
                          }}
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  )}

                  {scheduled.length === 0 ? (
                    <div className="text-center py-10 border border-dashed rounded-lg" style={{ borderColor: "#E5E5E5" }}>
                      <Calendar size={28} className="mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">Nenhuma atividade agendada para este lead</p>
                    </div>
                  ) : (
                    scheduled.map(a => {
                      const s = new Date(a.scheduledAt!);
                      const st = typeStyle[a.type] ?? { bg: "#F3F4F6", color: "#374151" };
                      const lbl = typeLabel[a.type] ?? a.type;
                      const isPast = s < new Date();
                      const durMin = a.durationMinutes ?? 60;
                      const durLabel = durMin >= 60 ? `${durMin / 60}h` : `${durMin} min`;
                      return (
                        <div
                          key={a.id}
                          className="flex items-start gap-3 p-3 rounded-lg"
                          style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", opacity: isPast ? 0.6 : 1 }}
                        >
                          <div
                            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                            style={st}
                          >
                            <Calendar size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: "#111111" }}>{a.title ?? a.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {fmtActivityDate(a.scheduledAt!)} · {durLabel}
                            </p>
                          </div>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                            style={st}
                          >
                            {lbl}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}

            {tab === "email" && (
              <div className="text-center py-16">
                <Mail size={36} className="mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground mb-3">Nenhum e-mail trocado com este lead</p>
                <Button size="sm" className="rounded-md" style={{ background: "#128A68", color: "#FFFFFF" }}>
                  <Plus size={14} className="mr-1" /> Enviar e-mail
                </Button>
              </div>
            )}

            {tab === "arquivos" && (
              <div className="space-y-3">
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                  style={{ borderColor: "#E5E5E5" }}
                >
                  <Upload size={24} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium" style={{ color: "#111111" }}>Arraste arquivos ou clique</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, imagens</p>
                </div>
                {[
                  { name: "Proposta_Carlos_Andrade.pdf", size: "2.4MB", date: "14/04", who: "Rafael" },
                  { name: "Contrato_modelo.docx", size: "180KB", date: "12/04", who: "Rafael" },
                ].map(f => (
                  <div key={f.name} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5" }}>
                    <div className="w-9 h-9 rounded-md bg-[#E1F5EE] flex items-center justify-center" style={{ color: "#128A68" }}>
                      <FileText size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: "#111111" }}>{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.size} · {f.date} · {f.who}</p>
                    </div>
                    <button className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                ))}
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

    <Dialog open={showWonProductDialog} onOpenChange={setShowWonProductDialog}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy size={16} style={{ color: "#128A68" }} />
            Selecione o produto para fechar o ganho
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          É necessário vincular um produto antes de marcar o negócio como ganho.
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
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-lg" onClick={() => setShowWonProductDialog(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-lg"
            disabled={!wonProductId || wonProductId === "none"}
            style={{ background: "#128A68", color: "#FFFFFF" }}
            onClick={handleConfirmWon}
          >
            <Trophy size={14} className="mr-1.5" /> Confirmar ganho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
