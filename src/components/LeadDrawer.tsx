import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessageCircle, Trophy, XCircle, StickyNote, ArrowRightLeft,
  PlusCircle, CheckSquare, CalendarDays, Phone, Mail, RefreshCw,
  Briefcase, ChevronRight, ExternalLink, Pencil,
  FileText, Image, Download, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { ActivityType, LeadOrigin } from "@/data/mockData";

interface Props {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

type DetailsTab = "perfil" | "endereco" | "campos";
type HistoryTab = "historico" | "atividades" | "negocios" | "arquivos" | "atendimentos";

// Campo editável inline — clique para editar, blur/Enter para salvar
function InlineField({
  label, value, onSave, type = "text", options,
}: {
  label: string;
  value?: string | null;
  onSave: (v: string) => void;
  type?: "text" | "email" | "tel";
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? "");
  const inputRef              = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { setDraft(value ?? ""); }, [value]);
  useEffect(() => { if (editing) (inputRef.current as HTMLInputElement)?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== (value ?? "")) onSave(draft);
  };

  return (
    <div className="group">
      <span style={{ fontSize: 10, color: "#AAA", display: "block", marginBottom: 2 }}>{label}</span>
      {editing ? (
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
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
            style={{ width: "100%", border: "1px solid #128A68", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", background: "#FFF", color: "#111" }}
          />
        )
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "text", padding: "4px 0", minHeight: 22, borderBottom: "1px solid transparent" }}
          className="hover:border-b-[#E0E0E0]"
        >
          <span style={{ fontSize: 13, color: draft ? "#222" : "#BBBBBB", fontStyle: draft ? "normal" : "italic" }}>
            {draft || `+ ${label}`}
          </span>
          <Pencil size={11} color="#BBBBBB" className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
}

function colorFromName(name: string): string {
  const palette = ["#128A68","#378ADD","#F59E0B","#8B5CF6","#EF4444","#0EA5E9","#EC4899","#14B8A6"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}

const ACT_META: Record<ActivityType, { color: string; bg: string; label: string; Icon: typeof StickyNote }> = {
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
};

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface LeadFile {
  id: string; name: string; size: number; mimeType: string;
  storagePath: string; uploadedBy: string; createdAt: string;
}
interface WaFile {
  id: string; name: string; type: "image" | "document";
  fromMe: boolean; senderName: string | null; createdAt: string; body: string;
}
interface WaConv {
  id: string; name: string; phone: string; preview: string | null;
  last_msg_at: string | null; finished: boolean; read: boolean;
}

function phoneVariants(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("55") ? [d, d.slice(2)] : [d, `55${d}`];
}

export function LeadDrawer({ leadId, open, onClose }: Props) {
  const {
    leads, updateLead, pipelines, teamMembers,
    addActivity, updateTask,
    tasks: allTasks,
    markLeadWon,
    customFieldGroups,
    addLead, nextDealNumber,
  } = useCRM();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [detailsTab, setDetailsTab] = useState<DetailsTab>("perfil");
  const [historyTab, setHistoryTab]  = useState<HistoryTab>("historico");
  const [newNote, setNewNote]         = useState("");
  const [notesOpen, setNotesOpen]     = useState(true);

  // Novo negócio
  const [showNewDeal, setShowNewDeal]       = useState(false);
  const [newDealPipeline, setNewDealPipeline] = useState("");
  const [newDealStage, setNewDealStage]       = useState("");
  const [newDealCreating, setNewDealCreating] = useState(false);

  // Arquivos
  const [leadFiles, setLeadFiles]   = useState<LeadFile[]>([]);
  const [waFiles,   setWaFiles]     = useState<WaFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // Atendimentos
  const [convs, setConvs]           = useState<WaConv[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);

  // Deriva lead ANTES dos hooks restantes (sem early return ainda)
  const lead = leadId ? leads[leadId] : null;
  const leadPhone = lead?.whatsapp ?? "";

  // Carrega arquivos ao abrir aba — hook ANTES do early return
  const loadFiles = useCallback(async () => {
    if (!user || !leadId || !lead) return;
    setFilesLoading(true);
    const [{ data: fData }, { data: wData }] = await Promise.all([
      supabase.from("lead_files").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
      (() => {
        const [p1, p2] = phoneVariants(leadPhone);
        return supabase.from("whatsapp_messages").select("id,body,type,from_me,sender_name,created_at,momment")
          .eq("owner_id", user.id).in("type", ["image","document"])
          .or(`phone.eq.${p1},phone.eq.${p2}`)
          .order("momment", { ascending: false }).limit(50);
      })(),
    ]);
    setLeadFiles((fData ?? []).map((r: any) => ({
      id: r.id, name: r.name, size: r.size, mimeType: r.mime_type,
      storagePath: r.storage_path, uploadedBy: r.uploaded_by, createdAt: r.created_at,
    })));
    setWaFiles((wData ?? []).map((r: any) => ({
      id: r.id, name: r.body ?? "arquivo", type: r.type,
      fromMe: r.from_me, senderName: r.sender_name, createdAt: r.created_at ?? String(r.momment),
      body: r.body ?? "",
    })));
    setFilesLoading(false);
  }, [user, leadId, leadPhone, lead]);

  // Carrega conversas ao abrir aba — hook ANTES do early return
  const loadConvs = useCallback(async () => {
    if (!user || !lead) return;
    setConvsLoading(true);
    const [p1, p2] = phoneVariants(leadPhone);
    const { data } = await supabase.from("whatsapp_conversations").select("id,name,phone,preview,last_msg_at,finished,read")
      .eq("owner_id", user.id).or(`phone.eq.${p1},phone.eq.${p2}`)
      .order("last_msg_at", { ascending: false });
    setConvs((data ?? []) as WaConv[]);
    setConvsLoading(false);
  }, [user, leadPhone, lead]);

  useEffect(() => {
    if (historyTab === "arquivos") loadFiles();
    if (historyTab === "atendimentos") loadConvs();
  }, [historyTab, loadFiles, loadConvs]);

  // Early return DEPOIS de todos os hooks
  if (!leadId || !lead) return null;

  const pipeline = pipelines.find(p => p.id === lead.pipelineId);
  const stage    = pipeline?.columns.find(c => c.id === lead.stage);
  const initials = lead.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const color    = colorFromName(lead.name);
  const tasks    = allTasks.filter(t => t.leadId === leadId);

  // Negócios relacionados: todos os leads com o mesmo telefone ou e-mail
  const phoneNorm = lead.whatsapp?.replace(/\D/g, "") ?? "";
  const relatedLeads = Object.values(leads).filter(l => {
    if (!l.whatsapp) return false;
    const lp = l.whatsapp.replace(/\D/g, "");
    const samePhone = lp === phoneNorm || (phoneNorm.startsWith("55") ? lp === phoneNorm.slice(2) : `55${lp}` === phoneNorm);
    const sameEmail = !!(lead.email && l.email && lead.email === l.email);
    return samePhone || sameEmail;
  });

  const newDealPipelineObj = pipelines.find(p => p.id === newDealPipeline);

  const createDeal = async () => {
    if (!newDealPipeline || !newDealStage) return;
    setNewDealCreating(true);
    await addLead({
      ...lead,
      id: undefined as unknown as string,
      dealNumber: nextDealNumber(),
      pipelineId: newDealPipeline,
      stage: newDealStage,
      dealStatus: "open",
      activities: [{
        id: `a-${Date.now()}`,
        date: new Date().toISOString(),
        type: "created",
        description: `Negócio criado a partir do contato ${lead.name}.`,
      }],
    });
    toast.success("Negócio criado com sucesso!");
    setShowNewDeal(false);
    setNewDealPipeline("");
    setNewDealStage("");
    setNewDealCreating(false);
  };

  const downloadFile = async (f: LeadFile) => {
    const { data } = await supabase.storage.from("lead-files").createSignedUrl(f.storagePath, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Erro ao gerar link de download");
  };

  const sortedActs = [...lead.activities].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const saveNote = () => {
    if (!newNote.trim()) return;
    addActivity(leadId, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString(),
      type: "note",
      description: newNote.trim(),
    });
    setNewNote("");
    toast.success("Comentário salvo!");
  };

  // ── Styles helpers ──────────────────────────────────────────────────
  const tab = (active: boolean) => ({
    fontSize: 12 as const, fontWeight: 600 as const,
    color: active ? "#128A68" : "#888",
    padding: "10px 12px",
    background: "none" as const, border: "none" as const, cursor: "pointer" as const,
    borderBottom: active ? "2px solid #128A68" : "2px solid transparent",
    transition: "color 0.15s",
  });

  const historyTabStyle = (active: boolean) => ({
    fontSize: 13 as const, fontWeight: 600 as const,
    color: active ? "#128A68" : "#888",
    padding: "0 0 12px",
    background: "none" as const, border: "none" as const, cursor: "pointer" as const,
    borderBottom: active ? "2px solid #128A68" : "2px solid transparent",
  });

  const ORIGINS: LeadOrigin[] = ["Instagram","Facebook Ads","Meta Ads","Google Ads","TikTok Ads","LinkedIn Ads","YouTube Ads","Email Marketing","Orgânico","WhatsApp","Evento","Indicação","Site","Outro"];

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent
        side="right"
        className="p-0 border-l border-[#E8E8E8] overflow-hidden"
        style={{ width: "min(95vw, 1020px)", maxWidth: "none", boxShadow: "-4px 0 40px rgba(0,0,0,0.08)" }}
      >
        <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#FFF" }}>

          {/* ══════════════ LEFT: Profile ══════════════ */}
          <div style={{ width: 290, flexShrink: 0, borderRight: "1px solid #F0F0F0", overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* Avatar + name */}
            <div style={{ padding: "28px 20px 18px", background: "linear-gradient(135deg,#128A6808 0%,#FFF 100%)", borderBottom: "1px solid #F0F0F0", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: color, color: "#FFF", fontSize: 26, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}>
                {initials}
              </div>
              <h2 style={{ fontWeight: 700, fontSize: 15, color: "#111", lineHeight: 1.3 }}>{lead.name}</h2>
              {lead.company && <p style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{lead.company}</p>}

              {/* Tags */}
              {lead.tags && lead.tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", marginTop: 10 }}>
                  {lead.tags.map(t => (
                    <span key={t} style={{ background: "#128A6818", color: "#128A68", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 100 }}>{t}</span>
                  ))}
                </div>
              )}

              {/* Pipeline / Stage */}
              {stage && (
                <span style={{ display: "inline-block", marginTop: 8, fontSize: 10, fontWeight: 600, color: "#888", background: "#F5F5F5", padding: "3px 10px", borderRadius: 100 }}>
                  {pipeline?.name} · {stage.title}
                </span>
              )}

              {/* Responsible */}
              {lead.responsible && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: color, color: "#FFF", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {lead.responsible[0]}
                  </div>
                  <span style={{ fontSize: 12, color: "#555" }}>{lead.responsible}</span>
                </div>
              )}

              {/* Value */}
              {!!lead.value && (
                <p style={{ fontSize: 13, fontWeight: 700, color: "#128A68", marginTop: 8 }}>{formatBRL(lead.value)}</p>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                <button
                  onClick={() => { onClose(); navigate(`/pipeline/lead/${leadId}`); }}
                  style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "#128A68", border: "1px solid #128A6830", borderRadius: 8, padding: "7px 0", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                >
                  <ExternalLink size={11} /> Ver completo
                </button>
                <button
                  onClick={() => { markLeadWon(leadId); toast.success("Negócio ganho!"); onClose(); }}
                  style={{ flex: 1, fontSize: 11, fontWeight: 600, color: "#FFF", border: "none", borderRadius: 8, padding: "7px 0", background: "#128A68", cursor: "pointer" }}
                >
                  ✓ Ganho
                </button>
              </div>
            </div>

            {/* Notes */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #F0F0F0" }}>
              <button
                onClick={() => setNotesOpen(v => !v)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: notesOpen ? 8 : 0 }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.5 }}>Notas</span>
                <ChevronRight size={13} color="#AAA" style={{ transform: notesOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }} />
              </button>
              {notesOpen && (
                <textarea
                  value={lead.notes}
                  onChange={e => updateLead(leadId, { notes: e.target.value })}
                  placeholder="Adicionar notas..."
                  style={{ width: "100%", border: "1px solid #E8E8E8", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#333", resize: "vertical", minHeight: 72, outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }}
                />
              )}
            </div>

            {/* Details tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #F0F0F0", padding: "0 4px" }}>
              <button style={tab(detailsTab === "perfil")}    onClick={() => setDetailsTab("perfil")}>Perfil</button>
              <button style={tab(detailsTab === "endereco")}  onClick={() => setDetailsTab("endereco")}>Endereço</button>
              <button style={tab(detailsTab === "campos")}    onClick={() => setDetailsTab("campos")}>Campos</button>
            </div>

            <div style={{ padding: "14px 16px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {detailsTab === "perfil" && <>
                <InlineField label="Nome"      value={lead.name}      onSave={v => updateLead(leadId, { name: v })} />
                <InlineField label="Empresa"   value={lead.company}   onSave={v => updateLead(leadId, { company: v })} />
                <InlineField label="E-mail"    value={lead.email}     onSave={v => updateLead(leadId, { email: v })} type="email" />
                <InlineField label="Telefone"  value={lead.whatsapp}  onSave={v => updateLead(leadId, { whatsapp: v })} type="tel" />
                <InlineField label="Documento" value={lead.document}  onSave={v => updateLead(leadId, { document: v } as any)} />
                <InlineField label="Origem"    value={lead.origin}    onSave={v => updateLead(leadId, { origin: v as LeadOrigin })} options={ORIGINS} />
                <InlineField label="Site"      value={lead.site}      onSave={v => updateLead(leadId, { site: v })} />
              </>}

              {detailsTab === "endereco" && <>
                <InlineField label="CEP"         value={lead.zipCode}      onSave={v => updateLead(leadId, { zipCode: v })} />
                <InlineField label="Endereço"    value={lead.address}      onSave={v => updateLead(leadId, { address: v })} />
                <InlineField label="Número"      value={lead.addrNumber}   onSave={v => updateLead(leadId, { addrNumber: v })} />
                <InlineField label="Complemento" value={lead.complement}   onSave={v => updateLead(leadId, { complement: v })} />
                <InlineField label="Bairro"      value={lead.neighborhood} onSave={v => updateLead(leadId, { neighborhood: v })} />
                <InlineField label="Cidade"      value={lead.city}         onSave={v => updateLead(leadId, { city: v })} />
                <InlineField label="Estado"      value={lead.state}        onSave={v => updateLead(leadId, { state: v })} />
                <InlineField label="País"        value={lead.country}      onSave={v => updateLead(leadId, { country: v })} />
              </>}

              {detailsTab === "campos" && (() => {
                const allItems = customFieldGroups.flatMap(g => g.items);
                if (allItems.length === 0) return <p style={{ fontSize: 12, color: "#AAA", fontStyle: "italic" }}>Nenhum campo adicional configurado</p>;
                return (
                  <>
                    {allItems.map(f => (
                      <InlineField
                        key={f.id}
                        label={f.label}
                        value={lead.customFieldValues?.[f.id]}
                        onSave={v => {
                          const next = { ...(lead.customFieldValues ?? {}), [f.id]: v };
                          updateLead(leadId, { customFieldValues: next });
                        }}
                      />
                    ))}
                  </>
                );
              })()}
            </div>
          </div>

          {/* ══════════════ RIGHT: History ══════════════ */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* History tabs */}
            <div style={{ padding: "16px 20px 0", borderBottom: "1px solid #F0F0F0", display: "flex", gap: 20, flexShrink: 0 }}>
              {(["historico","atividades","negocios","arquivos","atendimentos"] as HistoryTab[]).map(k => (
                <button key={k} style={historyTabStyle(historyTab === k)} onClick={() => setHistoryTab(k)}>
                  {{ historico:"Histórico", atividades:"Atividades", negocios:"Negócios", arquivos:"Arquivos", atendimentos:"Atendimentos" }[k]}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

              {/* ── HISTÓRICO ── */}
              {historyTab === "historico" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Histórico</h3>
                      <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Veja o histórico do seu lead</p>
                    </div>
                  </div>

                  {/* Add comment */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                    <input
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveNote()}
                      placeholder="Adicionar comentário..."
                      style={{ flex: 1, border: "1px solid #E8E8E8", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", color: "#111", background: "#FAFAFA" }}
                    />
                    <button
                      onClick={saveNote}
                      disabled={!newNote.trim()}
                      style={{ fontSize: 12, fontWeight: 600, color: "#FFF", background: newNote.trim() ? "#128A68" : "#CCC", border: "none", borderRadius: 8, padding: "9px 18px", cursor: newNote.trim() ? "pointer" : "default", transition: "background 0.15s" }}
                    >
                      Salvar
                    </button>
                  </div>

                  {/* Timeline */}
                  {sortedActs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                      <StickyNote size={32} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                      <p style={{ fontSize: 13 }}>Nenhum histórico registrado</p>
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <div style={{ position: "absolute", left: 15, top: 16, bottom: 0, width: 2, background: "#F0F0F0" }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {sortedActs.map(act => {
                          const m = ACT_META[act.type] ?? ACT_META.note;
                          const Icon = m.Icon;
                          return (
                            <div key={act.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0" }}>
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", zIndex: 1, border: "2.5px solid #FFF", boxShadow: "0 0 0 1.5px #E8E8E8" }}>
                                <Icon size={13} />
                              </div>
                              <div style={{ flex: 1, background: "#FAFAFA", border: "1px solid #F0F0F0", borderRadius: 10, padding: "10px 14px" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                  <p style={{ fontSize: 13, color: "#111", lineHeight: 1.4, flex: 1 }}>{act.description}</p>
                                  <span style={{ fontSize: 11, color: "#AAA", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDate(act.date)}</span>
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
              )}

              {/* ── ATIVIDADES ── */}
              {historyTab === "atividades" && (
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "#111", marginBottom: 16 }}>Atividades</h3>
                  {tasks.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                      <CheckSquare size={32} style={{ margin: "0 auto 10px", opacity: 0.3 }} />
                      <p style={{ fontSize: 13 }}>Nenhuma atividade registrada</p>
                    </div>
                  ) : tasks.map(t => (
                    <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", border: "1px solid #F0F0F0", borderRadius: 10, marginBottom: 8, background: "#FAFAFA" }}>
                      <Checkbox
                        checked={t.status === "Concluída"}
                        onCheckedChange={() => updateTask(t.id, { status: t.status === "Concluída" ? "Pendente" : "Concluída" })}
                        className="rounded-full"
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, color: t.status === "Concluída" ? "#AAA" : "#111", textDecoration: t.status === "Concluída" ? "line-through" : "none" }}>{t.title}</p>
                        {t.dueDate && <p style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{new Date(t.dueDate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>}
                      </div>
                      {t.status === "Concluída" && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#22C55E", background: "#DCFCE7", padding: "2px 8px", borderRadius: 100 }}>Concluída</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── NEGÓCIOS ── */}
              {historyTab === "negocios" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Negócios</h3>
                      <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{relatedLeads.length} negócio{relatedLeads.length !== 1 ? "s" : ""} encontrado{relatedLeads.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={() => {
                        const first = pipelines[0];
                        setNewDealPipeline(first?.id ?? "");
                        setNewDealStage(first?.columns[0]?.id ?? "");
                        setShowNewDeal(v => !v);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: showNewDeal ? "#888" : "#128A68", border: `1px solid ${showNewDeal ? "#E0E0E0" : "#128A6830"}`, borderRadius: 8, padding: "6px 14px", background: "transparent", cursor: "pointer" }}
                    >
                      <PlusCircle size={13} />
                      {showNewDeal ? "Cancelar" : "Novo negócio"}
                    </button>
                  </div>

                  {/* Formulário inline de novo negócio */}
                  {showNewDeal && (
                    <div style={{ border: "1px solid #128A6830", borderRadius: 12, padding: "16px", marginBottom: 16, background: "#F9FFF9" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 12 }}>Criar negócio para <span style={{ color: "#128A68" }}>{lead.name}</span></p>

                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Pipeline</label>
                        <select
                          value={newDealPipeline}
                          onChange={e => {
                            setNewDealPipeline(e.target.value);
                            const p = pipelines.find(p => p.id === e.target.value);
                            setNewDealStage(p?.columns[0]?.id ?? "");
                          }}
                          style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", background: "#FFF", color: "#111" }}
                        >
                          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Etapa</label>
                        <select
                          value={newDealStage}
                          onChange={e => setNewDealStage(e.target.value)}
                          style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", background: "#FFF", color: "#111" }}
                        >
                          {(newDealPipelineObj?.columns ?? []).map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={createDeal}
                        disabled={!newDealPipeline || !newDealStage || newDealCreating}
                        style={{ width: "100%", padding: "9px", background: (!newDealPipeline || !newDealStage || newDealCreating) ? "#CCC" : "#128A68", color: "#FFF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (!newDealPipeline || !newDealStage || newDealCreating) ? "default" : "pointer", transition: "background 0.15s" }}
                      >
                        {newDealCreating ? "Criando…" : "✓ Criar negócio"}
                      </button>
                    </div>
                  )}
                  {relatedLeads.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                      <Briefcase size={32} style={{ margin: "0 auto 10px", opacity: 0.25 }} />
                      <p style={{ fontSize: 13 }}>Nenhum negócio encontrado</p>
                    </div>
                  ) : relatedLeads.map(l => {
                    const lPipeline = pipelines.find(p => p.id === l.pipelineId);
                    const lStage    = lPipeline?.columns.find(c => c.id === l.stage);
                    const isWon     = l.dealStatus === "won";
                    const isLost    = l.dealStatus === "lost";
                    const statusColor = isWon ? "#22C55E" : isLost ? "#EF4444" : "#128A68";
                    const statusBg    = isWon ? "#DCFCE7" : isLost ? "#FEE2E2" : "#E6F5F0";
                    const statusLabel = isWon ? "Ganho" : isLost ? "Perdido" : "Em aberto";
                    return (
                      <div
                        key={l.id}
                        onClick={() => { onClose(); navigate(`/pipeline/lead/${l.id}`); }}
                        style={{ border: "1px solid #F0F0F0", borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer", background: l.id === leadId ? "#F9FFF9" : "#FAFAFA", borderLeft: l.id === leadId ? "3px solid #128A68" : "1px solid #F0F0F0", transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F0F9F6")}
                        onMouseLeave={e => (e.currentTarget.style.background = l.id === leadId ? "#F9FFF9" : "#FAFAFA")}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#128A68" }}>#{l.dealNumber}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>{l.name}</span>
                              {l.id === leadId && <span style={{ fontSize: 9, fontWeight: 700, color: "#888", background: "#F0F0F0", padding: "1px 6px", borderRadius: 100 }}>ESTE</span>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {lPipeline && (
                                <span style={{ fontSize: 11, color: "#555", background: "#F5F5F5", padding: "2px 8px", borderRadius: 100 }}>
                                  {lPipeline.name}
                                </span>
                              )}
                              {lStage && (
                                <span style={{ fontSize: 11, color: "#555", background: lStage.color + "20", padding: "2px 8px", borderRadius: 100 }}>
                                  {lStage.title}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            {!!l.value && <p style={{ fontSize: 13, fontWeight: 700, color: "#128A68" }}>{formatBRL(l.value)}</p>}
                            <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, background: statusBg, padding: "2px 8px", borderRadius: 100, display: "inline-block", marginTop: 4 }}>{statusLabel}</span>
                          </div>
                        </div>
                        {l.responsible && (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0F0F0" }}>
                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: colorFromName(l.responsible), color: "#FFF", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {l.responsible[0]}
                            </div>
                            <span style={{ fontSize: 11, color: "#666" }}>{l.responsible}</span>
                            {l.entryDate && <span style={{ fontSize: 11, color: "#AAA", marginLeft: "auto" }}>{new Date(l.entryDate).toLocaleDateString("pt-BR")}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── ARQUIVOS ── */}
              {historyTab === "arquivos" && (
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: 15, color: "#111", marginBottom: 16 }}>Arquivos</h3>
                  {filesLoading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 8, color: "#AAA" }}>
                      <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                      <span style={{ fontSize: 13 }}>Carregando arquivos…</span>
                    </div>
                  ) : leadFiles.length === 0 && waFiles.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                      <FileText size={32} style={{ margin: "0 auto 10px", opacity: 0.25 }} />
                      <p style={{ fontSize: 13 }}>Nenhum arquivo encontrado</p>
                    </div>
                  ) : (
                    <>
                      {leadFiles.length > 0 && (
                        <>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Enviados manualmente</p>
                          {leadFiles.map(f => (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #F0F0F0", borderRadius: 10, marginBottom: 8, background: "#FAFAFA" }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#EBF3FC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {f.mimeType?.startsWith("image") ? <Image size={18} color="#378ADD" /> : <FileText size={18} color="#378ADD" />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, color: "#111", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</p>
                                <p style={{ fontSize: 11, color: "#AAA" }}>{f.size ? `${(f.size / 1024).toFixed(0)} KB` : ""} · {fmtDate(f.createdAt)}</p>
                              </div>
                              <button onClick={() => downloadFile(f)} style={{ padding: "6px", background: "none", border: "none", cursor: "pointer", color: "#128A68", borderRadius: 6 }}>
                                <Download size={15} />
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      {waFiles.length > 0 && (
                        <>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 8px" }}>Do WhatsApp</p>
                          {waFiles.map(f => (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #F0F0F0", borderRadius: 10, marginBottom: 8, background: "#FAFAFA" }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#E6F5F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {f.type === "image" ? <Image size={18} color="#128A68" /> : <FileText size={18} color="#128A68" />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{f.type === "image" ? "Imagem" : "Documento"}</p>
                                <p style={{ fontSize: 11, color: "#AAA" }}>{f.fromMe ? "Enviado" : "Recebido"} · {fmtDate(f.createdAt)}</p>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── ATENDIMENTOS ── */}
              {historyTab === "atendimentos" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>Atendimentos</h3>
                      <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Conversas no WhatsApp</p>
                    </div>
                    <button
                      onClick={() => { onClose(); navigate("/multiatendimento"); }}
                      style={{ fontSize: 11, fontWeight: 600, color: "#128A68", border: "1px solid #128A6830", borderRadius: 8, padding: "5px 12px", background: "transparent", cursor: "pointer" }}
                    >
                      Abrir chat
                    </button>
                  </div>
                  {convsLoading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 8, color: "#AAA" }}>
                      <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
                      <span style={{ fontSize: 13 }}>Carregando atendimentos…</span>
                    </div>
                  ) : convs.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                      <MessageCircle size={32} style={{ margin: "0 auto 10px", opacity: 0.25 }} />
                      <p style={{ fontSize: 13 }}>Nenhuma conversa encontrada</p>
                      <p style={{ fontSize: 12, color: "#AAA", marginTop: 4 }}>As conversas aparecem após o primeiro contato no Multiatendimento</p>
                    </div>
                  ) : convs.map(c => (
                    <div
                      key={c.id}
                      onClick={() => { onClose(); navigate("/multiatendimento", { state: { openConvId: c.id } }); }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid #F0F0F0", borderRadius: 12, marginBottom: 8, background: "#FAFAFA", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F0F9F6")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#FAFAFA")}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: colorFromName(c.name || "?"), color: "#FFF", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {(c.name || "?")[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.phone}</p>
                          {c.last_msg_at && <span style={{ fontSize: 11, color: "#AAA", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDate(c.last_msg_at)}</span>}
                        </div>
                        {c.preview && <p style={{ fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{c.preview}</p>}
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: c.finished ? "#AAA" : "#128A68", background: c.finished ? "#F5F5F5" : "#E6F5F0", padding: "2px 8px", borderRadius: 100 }}>
                            {c.finished ? "Arquivado" : "Em aberto"}
                          </span>
                          {!c.read && <span style={{ fontSize: 10, fontWeight: 700, color: "#FFF", background: "#128A68", padding: "2px 8px", borderRadius: 100 }}>Nova</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
