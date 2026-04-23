import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { availableTags } from "@/data/mockData";
import { Button } from "@/components/ui/button";
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
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Plus,
  Pin,
  MessageSquare,
  Phone,
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
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { toast } from "sonner";

type TabKey = "anotacoes" | "atividades" | "reunioes" | "email" | "arquivos" | "historico";

const TABS: { key: TabKey; label: string }[] = [
  { key: "anotacoes", label: "Anotações" },
  { key: "atividades", label: "Atividades" },
  { key: "reunioes", label: "Reuniões" },
  { key: "email", label: "E-mail" },
  { key: "arquivos", label: "Arquivos" },
  { key: "historico", label: "Histórico" },
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
    teamMembers,
    memberColors,
    products,
    markLeadWon,
    markLeadLost,
  } = useCRM();
  const { openChat } = useFloatingChat();

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
  const [qualFields, setQualFields] = useState<{ key: string; label: string; value: string }[]>([
    { key: "buscando", label: "O que o lead está buscando?", value: "" },
    { key: "ramo", label: "Qual o ramo da empresa?", value: "" },
    { key: "decisor", label: "O lead é o decisor?", value: "" },
    { key: "orcamento", label: "Orçamento disponível?", value: "" },
    { key: "previsao", label: "Previsão de fechamento?", value: "" },
  ]);
  const [tasks, setTasks] = useState([
    { id: "t1", icon: "phone", title: "Ligação de follow-up", date: "Amanhã 10h", responsible: "Rafael", done: false },
    { id: "t2", icon: "mail", title: "Envio de proposta inicial", date: "14/04 14h", responsible: "Rafael", done: true },
    { id: "t3", icon: "calendar", title: "Reunião de apresentação", date: "22/04 15h", responsible: "Carlos", done: false },
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
      date: today,
      type: "stage_change",
      description: `Movido de "${oldCol?.title}" para "${newCol?.title}".`,
    });
    toast.success(`Etapa alterada para ${newCol?.title}`);
  };

  const handleSaveNote = () => {
    if (!newNote.trim()) return;
    addActivity(lead.id, {
      id: `a-${Date.now()}`,
      date: today,
      type: "note",
      description: newNote.trim(),
    });
    setNewNote("");
    toast.success("Anotação salva!");
  };

  const toggleSection = (k: SectionKey) =>
    setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const updateField = (field: string, value: string | number | undefined) =>
    updateLead(lead.id, { [field]: value });

  const handleWon = () => {
    markLeadWon(lead.id);
    toast.success("Negócio marcado como ganho!");
  };
  const handleLost = () => {
    markLeadLost(lead.id);
    toast.error("Negócio marcado como perdido.");
  };

  // Notes: separate user notes from system notes
  const noteActivities = lead.activities.filter(a => a.type === "note");
  const systemActivities = lead.activities.filter(a => a.type !== "note");

  return (
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

        <div className="absolute left-1/2 -translate-x-1/2 flex items-baseline">
          <span style={{ fontSize: 22, fontWeight: 700, color: "#111111" }}>{lead.name}</span>
          <span style={{ fontSize: 13, color: "#AAAAAA", marginLeft: 8 }}>#{lead.dealNumber}</span>
        </div>

        <div className="flex items-center gap-2">
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
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: respColor }}
            title={lead.responsible}
          >
            {lead.responsible[0]}
          </div>
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
        }}
        className="flex items-center justify-center px-4 overflow-x-auto"
      >
        <div className="flex items-center justify-center" style={{ gap: 4 }}>
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
                      <EditableField
                        label="Valor"
                        value={lead.value}
                        type="number"
                        onSave={v => updateField("value", Number(v))}
                        valueStyle={{ color: "#128A68", fontWeight: 700, fontSize: 16 }}
                        display={v => formatBRL(Number(v))}
                      />
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Pipeline</label>
                        <p style={{ fontSize: 13, color: "#111111" }}>{pipeline.name}</p>
                      </div>
                      <div>
                        <label className="block mb-1" style={{ fontSize: 11, color: "#AAAAAA" }}>Produto</label>
                        <Select
                          value={lead.productId || "none"}
                          onValueChange={v => updateField("productId", v === "none" ? undefined : v)}
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
                            const t = availableTags.find(x => x.name === tagName);
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
                            {availableTags.map(t => {
                              const has = (lead.tags || []).includes(t.name);
                              return (
                                <DropdownMenuItem
                                  key={t.name}
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
                    border: "0.5px solid #E5E5E5",
                    borderRadius: 10,
                    background: "#FAFAFA",
                    padding: 12,
                  }}
                >
                  <Textarea
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Escreva uma anotação, @nome..."
                    className="bg-white border-card-border rounded-md text-sm min-h-[70px]"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{noteActivities.length}/100 notas</span>
                    <Button
                      onClick={handleSaveNote}
                      size="sm"
                      className="rounded-md h-8"
                      style={{ background: "#128A68", color: "#FFFFFF" }}
                    >
                      Salvar
                    </Button>
                  </div>
                </div>

                {/* Mock highlight note */}
                <div
                  style={{
                    background: "#FFFBEB",
                    border: "1px solid #F59E0B",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ background: memberColors["Rafael"] || "#F59E0B" }}
                      >
                        R
                      </div>
                      <span className="text-xs font-semibold" style={{ color: "#111111" }}>Rafael</span>
                      <span className="text-[11px] text-muted-foreground">hoje 15:49</span>
                    </div>
                    <button className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                  <p className="text-sm" style={{ color: "#111111", lineHeight: 1.5 }}>
                    Verificar proposta antes de enviar. Cliente pediu desconto de 10%. Aguardar aprovação do coordenador.
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <button className="hover:text-foreground">Adicionar comentário</button>
                    <button className="hover:text-foreground flex items-center gap-1"><Pin size={11} /> Fixar</button>
                  </div>
                </div>

                {/* User notes */}
                {noteActivities.map(n => (
                  <div
                    key={n.id}
                    style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 10, padding: 12 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ background: respColor }}
                      >
                        {lead.responsible[0]}
                      </div>
                      <span className="text-xs font-semibold" style={{ color: "#111111" }}>{lead.responsible}</span>
                      <span className="text-[11px] text-muted-foreground">{n.date}</span>
                    </div>
                    <p className="text-sm" style={{ color: "#111111" }}>{n.description}</p>
                  </div>
                ))}

                {/* System note example */}
                <div className="text-xs italic text-center py-2" style={{ color: "#AAAAAA" }}>
                  Etapa: Contato Feito → Proposta Enviada · hoje 15:48
                </div>
              </div>
            )}

            {tab === "atividades" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" className="rounded-md h-8" style={{ background: "#128A68", color: "#FFFFFF" }}>
                    <Plus size={14} className="mr-1" /> Nova atividade
                  </Button>
                </div>
                {tasks.map(t => {
                  const Icon = t.icon === "phone" ? Phone : t.icon === "calendar" ? Calendar : t.icon === "mail" ? Mail : MessageSquare;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5" }}
                    >
                      <Checkbox
                        checked={t.done}
                        onCheckedChange={() =>
                          setTasks(prev => prev.map(x => x.id === t.id ? { ...x, done: !x.done } : x))
                        }
                      />
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center"
                        style={{ background: "#E1F5EE", color: "#128A68" }}
                      >
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${t.done ? "line-through text-muted-foreground" : ""}`} style={{ color: t.done ? undefined : "#111111" }}>
                          {t.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.date} · {t.responsible}</p>
                      </div>
                      <Badge
                        className="border-0 text-[10px]"
                        style={{
                          background: t.done ? "#E1F5EE" : "#FEF3C7",
                          color: t.done ? "#085041" : "#92400E",
                        }}
                      >
                        {t.done ? "Concluída" : "Pendente"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "reunioes" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" className="rounded-md h-8" style={{ background: "#128A68", color: "#FFFFFF" }}>
                    <Plus size={14} className="mr-1" /> Agendar reunião
                  </Button>
                </div>
                <div style={{ background: "#E1F5EE", borderRadius: 10, padding: 16 }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-md bg-white flex items-center justify-center" style={{ color: "#128A68" }}>
                      <Calendar size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "#085041" }}>Reunião de fechamento</p>
                      <p className="text-xs mt-0.5" style={{ color: "#085041" }}>22/04/2026 às 15h00 · Carlos Andrade</p>
                      <p className="text-xs mt-0.5" style={{ color: "#085041" }}>Participantes: {lead.name} + atendente</p>
                      <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" variant="outline" className="h-8 rounded-md text-xs" style={{ borderColor: "#128A68", color: "#128A68" }}>
                          <Video size={12} className="mr-1" /> Entrar no Google Meet
                        </Button>
                        <button className="text-xs text-destructive hover:underline">Cancelar reunião</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-xs font-semibold uppercase tracking-wide pt-2" style={{ color: "#AAAAAA" }}>
                  Reuniões anteriores
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5" }}>
                  <Calendar size={16} className="text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: "#111111" }}>Apresentação inicial</p>
                    <p className="text-xs text-muted-foreground">10/04/2026 · 45 min · Rafael</p>
                  </div>
                  <Badge className="border-0 text-[10px]" style={{ background: "#E1F5EE", color: "#085041" }}>Realizada</Badge>
                </div>
              </div>
            )}

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

            {tab === "historico" && (
              <div className="space-y-3">
                <div className="flex gap-1 flex-wrap">
                  {["Todos", "Anotações", "Atividades", "Etapas", "Sistema"].map((f, i) => (
                    <button
                      key={f}
                      className="text-xs px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: i === 0 ? "#128A68" : "#F5F5F5",
                        color: i === 0 ? "#FFFFFF" : "#666",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="relative pl-6 space-y-4">
                  <div className="absolute left-2 top-1 bottom-1 w-px" style={{ background: "#E5E5E5" }} />
                  {[...lead.activities].reverse().map(a => {
                    const meta = a.type === "note" ? { c: "#F59E0B", I: StickyNote }
                      : a.type === "stage_change" ? { c: "#378ADD", I: ArrowRightLeft }
                      : a.type === "won" ? { c: "#128A68", I: Trophy }
                      : a.type === "lost" ? { c: "#E24B4A", I: XCircle }
                      : a.type === "whatsapp" ? { c: "#25D366", I: MessageSquare }
                      : { c: "#AAAAAA", I: PlusCircle };
                    const Icon = meta.I;
                    return (
                      <div key={a.id} className="relative">
                        <div
                          className="absolute -left-[18px] top-0 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: meta.c }}
                        >
                          <Icon size={9} color="#FFFFFF" />
                        </div>
                        <p className="text-sm" style={{ color: "#111111" }}>{a.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(a.date).toLocaleDateString("pt-BR")} · {lead.responsible}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
