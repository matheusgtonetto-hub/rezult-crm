import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MessageCircle, Trophy, XCircle, StickyNote, ArrowRightLeft,
  PlusCircle, CheckSquare, CalendarDays, Phone, Mail, RefreshCw,
  Briefcase, ChevronRight, ExternalLink, Pencil,
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

export function LeadDrawer({ leadId, open, onClose }: Props) {
  const {
    leads, updateLead, pipelines, teamMembers,
    addActivity, updateTask,
    tasks: allTasks, addTask: addTaskToContext,
    markLeadWon, markLeadLost,
    customFieldGroups,
  } = useCRM();
  const navigate = useNavigate();

  const [detailsTab, setDetailsTab] = useState<DetailsTab>("perfil");
  const [historyTab, setHistoryTab]  = useState<HistoryTab>("historico");
  const [newNote, setNewNote]         = useState("");
  const [notesOpen, setNotesOpen]     = useState(true);

  if (!leadId || !leads[leadId]) return null;
  const lead = leads[leadId];

  const pipeline = pipelines.find(p => p.id === lead.pipelineId);
  const stage    = pipeline?.columns.find(c => c.id === lead.stage);
  const initials = lead.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const color    = colorFromName(lead.name);
  const tasks    = allTasks.filter(t => t.leadId === leadId);

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
                <div style={{ textAlign: "center", padding: "60px 0", color: "#AAA" }}>
                  <Briefcase size={36} style={{ margin: "0 auto 12px", opacity: 0.25 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#888" }}>Negócios vinculados</p>
                  <p style={{ fontSize: 12, color: "#AAA", marginTop: 4 }}>Abra o perfil completo para ver negócios</p>
                  <button
                    onClick={() => { onClose(); navigate(`/pipeline/lead/${leadId}`); }}
                    style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: "#128A68", border: "1px solid #128A6830", borderRadius: 8, padding: "7px 18px", background: "transparent", cursor: "pointer" }}
                  >
                    Ver perfil completo
                  </button>
                </div>
              )}

              {/* ── ARQUIVOS / ATENDIMENTOS ── */}
              {(historyTab === "arquivos" || historyTab === "atendimentos") && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#AAA" }}>
                  <p style={{ fontSize: 13, color: "#AAA" }}>Em breve disponível nesta visualização</p>
                  <button
                    onClick={() => { onClose(); navigate(`/pipeline/lead/${leadId}`); }}
                    style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: "#128A68", border: "1px solid #128A6830", borderRadius: 8, padding: "7px 18px", background: "transparent", cursor: "pointer" }}
                  >
                    Ver perfil completo
                  </button>
                </div>
              )}

            </div>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
