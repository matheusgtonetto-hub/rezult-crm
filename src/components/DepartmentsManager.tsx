import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";
import { useCRM } from "@/context/CRMContext";
import { toast } from "sonner";
import { Search, Folder, Pencil, Trash2, X, Check } from "lucide-react";

export interface Department {
  id: string;
  name: string;
  color: string;
  work_hours: string | null;
  attendants: string[];
  created_at: string;
}

// Paleta de 20 cores (igual referência)
const DEPT_COLORS = [
  "#EF4444", "#DC2626", "#F87171", "#F43F5E", "#EC4899", "#F472B6", "#FB923C", "#F97316", "#84CC16", "#22C55E",
  "#14B8A6", "#06B6D4", "#7DD3FC", "#3B82F6", "#6366F1", "#818CF8", "#A855F7", "#D8B4FE", "#6B7280", "#111827",
];

interface ScheduleLite { id: string; name: string }

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
};

interface Props {
  accent?: string;            // cor de destaque (botões/seleção)
  createOpen: boolean;        // controlado pelo host (botão "Criar")
  setCreateOpen: (b: boolean) => void;
}

export default function DepartmentsManager({ accent = "#3B82F6", createOpen, setCreateOpen }: Props) {
  const { company } = useCompany();
  const { teamMembers, memberEmails, memberColors } = useCRM();
  const ownerId = company?.owner_id ?? null;

  const [depts, setDepts] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<ScheduleLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [d, s] = await Promise.all([
      supabase.from("departments").select("*").eq("owner_id", ownerId)
        .order("position", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("work_schedules").select("id, name").eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
    ]);
    if (!d.error && d.data) setDepts(d.data as Department[]);
    if (!s.error && s.data) setSchedules(s.data as ScheduleLite[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const scheduleName = (id: string | null) => schedules.find(s => s.id === id)?.name ?? "—";

  const modalOpen = createOpen || editing !== null;
  const closeModal = () => { setCreateOpen(false); setEditing(null); };

  const filtered = depts.filter(d => !search.trim() || d.name.toLowerCase().includes(search.toLowerCase()));

  async function handleSave(form: { name: string; color: string; work_hours: string; attendants: string[] }) {
    if (!ownerId) return;
    if (!form.name.trim()) { toast.error("Dê um nome ao departamento."); return; }
    if (editing) {
      const { error } = await supabase.from("departments")
        .update({ name: form.name.trim(), color: form.color, work_hours: form.work_hours || null, attendants: form.attendants })
        .eq("id", editing.id);
      if (error) { toast.error("Erro ao salvar o departamento."); return; }
      toast.success("Departamento atualizado.");
    } else {
      const { error } = await supabase.from("departments").insert({
        owner_id: ownerId, company_id: company?.id ?? null,
        name: form.name.trim(), color: form.color, work_hours: form.work_hours || null,
        attendants: form.attendants, position: depts.length,
      });
      if (error) { toast.error("Erro ao criar o departamento."); return; }
      toast.success("Departamento criado.");
    }
    closeModal();
    load();
  }

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("departments").delete().eq("id", deleting.id);
    if (error) { toast.error("Erro ao excluir o departamento."); return; }
    toast.success("Departamento excluído.");
    setDeleting(null);
    load();
  }

  return (
    <div>
      {/* Busca + contagem */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
        <Search size={14} color="#AAA" />
        <input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111", flex: 1 }} />
        <span style={{ fontSize: 12, color: "#AAA" }}>{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {/* Cabeçalho da tabela */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 120px 64px", padding: "6px 4px", borderBottom: "1px solid #EEEEEE", marginBottom: 4 }}>
        {["Departamentos", "Horário de funcionamento", "Data de criação", ""].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
        ))}
      </div>

      {/* Lista / estados */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#CCC", fontSize: 13 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 8 }}>
          <Folder size={32} color="#E5E5E5" />
          <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>{depts.length === 0 ? "Nenhum departamento criado" : "Nenhum resultado"}</p>
          {depts.length === 0 && <p style={{ fontSize: 12, color: "#CCC", margin: 0 }}>Clique em "Criar" para adicionar um departamento</p>}
        </div>
      ) : (
        <div>
          {filtered.map(d => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 180px 120px 64px", alignItems: "center", padding: "12px 4px", borderBottom: "1px solid #F2F2F2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              </div>
              <span style={{ fontSize: 12.5, color: "#666" }}>{scheduleName(d.work_hours)}</span>
              <span style={{ fontSize: 12.5, color: "#666" }}>{fmtDate(d.created_at)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setEditing(d)} title="Editar" style={iconBtn}><Pencil size={14} color="#888" /></button>
                <button onClick={() => setDeleting(d)} title="Excluir" style={iconBtn}><Trash2 size={14} color="#888" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {modalOpen && (
        <DepartmentModal
          accent={accent}
          editing={editing}
          schedules={schedules}
          teamMembers={teamMembers}
          memberEmails={memberEmails}
          memberColors={memberColors}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}

      {/* Confirmação de exclusão */}
      {deleting && (
        <div onClick={() => setDeleting(null)} style={overlay(400)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 14, width: 380, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>Excluir departamento</div>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 18px", lineHeight: 1.5 }}>
              Tem certeza que deseja excluir <strong>{deleting.name}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setDeleting(null)} style={ghostBtn}>Cancelar</button>
              <button onClick={handleDelete} style={{ ...primaryBtn("#EF4444") }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Modal de criação/edição ─────────────────────────────────────────── */
function DepartmentModal({
  accent, editing, schedules, teamMembers, memberEmails, memberColors, onClose, onSave,
}: {
  accent: string;
  editing: Department | null;
  schedules: ScheduleLite[];
  teamMembers: string[];
  memberEmails: Record<string, string>;
  memberColors: Record<string, string>;
  onClose: () => void;
  onSave: (form: { name: string; color: string; work_hours: string; attendants: string[] }) => void;
}) {
  const [tab, setTab] = useState<"config" | "atendentes">("config");
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState(editing?.color ?? DEPT_COLORS[0]);
  const [workHours, setWorkHours] = useState(editing?.work_hours ?? "");
  const [attendants, setAttendants] = useState<string[]>(editing?.attendants ?? []);
  const [agentSearch, setAgentSearch] = useState("");

  const toggleAttendant = (m: string) =>
    setAttendants(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const filteredAgents = teamMembers.filter(m => !agentSearch || m.toLowerCase().includes(agentSearch.toLowerCase()));

  return (
    <div onClick={onClose} style={overlay(350)}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 14, width: 460, maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,0.22)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ padding: "18px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{editing ? "Atualizar departamento" : "Criar departamento"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#AAA" /></button>
        </div>

        {/* tabs (só no editar) */}
        {editing && (
          <div style={{ display: "flex", gap: 6, padding: "12px 20px 0" }}>
            {(["config", "atendentes"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: tab === t ? "#F0F0F0" : "transparent", color: tab === t ? "#111" : "#999" }}>
                {t === "config" ? "Configuração" : "Atendentes"}
              </button>
            ))}
          </div>
        )}

        {/* body */}
        <div style={{ padding: "16px 20px", overflowY: "auto" }}>
          {tab === "config" ? (
            <>
              <label style={lbl}>Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do departamento" autoFocus style={field} />

              <label style={{ ...lbl, marginTop: 16 }}>Horário de funcionamento</label>
              <select value={workHours} onChange={e => setWorkHours(e.target.value)}
                style={{ ...field, cursor: "pointer", color: workHours ? "#111" : "#AAA" }}>
                <option value="">{schedules.length ? "Selecionar" : "Nenhum horário cadastrado"}</option>
                {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {schedules.length === 0 && (
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0" }}>
                  Cadastre em Configurações → Horários de trabalho.
                </p>
              )}

              <label style={{ ...lbl, marginTop: 16 }}>Cor</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 8 }}>
                {DEPT_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: color === c ? "2px solid #111" : "2px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: color === c ? "0 0 0 2px #FFF inset" : "none" }}>
                    {color === c && <Check size={14} color="#FFF" />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Lista de atendentes</span>
                <span style={{ fontSize: 12, color: "#888" }}>{attendants.length} selecionado{attendants.length === 1 ? "" : "s"}</span>
              </div>
              <p style={{ fontSize: 11.5, color: "#999", margin: "0 0 12px", lineHeight: 1.45 }}>
                Escolha os atendentes que poderão acessar este departamento.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "7px 10px", marginBottom: 10 }}>
                <Search size={13} color="#AAA" />
                <input placeholder="Pesquisar..." value={agentSearch} onChange={e => setAgentSearch(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#111", flex: 1 }} />
              </div>
              {filteredAgents.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 0", color: "#BBB", fontSize: 12 }}>Nenhum atendente disponível</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                  {filteredAgents.map(m => {
                    const on = attendants.includes(m);
                    return (
                      <button key={m} onClick={() => toggleAttendant(m)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", background: on ? "#F0F7FF" : "#F9F9F9" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: memberColors[m] || "#9CA3AF", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {m.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m}</div>
                          {memberEmails[m] && <div style={{ fontSize: 10.5, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{memberEmails[m]}</div>}
                        </div>
                        <span style={{ width: 18, height: 18, borderRadius: 5, border: on ? `none` : "1.5px solid #CCC", background: on ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {on && <Check size={12} color="#FFF" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #F0F0F0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={ghostBtn}>Cancelar</button>
          <button onClick={() => onSave({ name, color, work_hours: workHours, attendants })} style={primaryBtn(accent)}>
            {editing ? "Salvar" : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── estilos ─────────────────────────────────────────────────────────── */
const iconBtn: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 5, borderRadius: 6, display: "flex", alignItems: "center" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 };
const field: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid #E5E5E5", borderRadius: 9, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FFF" };
const ghostBtn: React.CSSProperties = { padding: "8px 16px", borderRadius: 9, border: "1px solid #E5E5E5", background: "#FFF", color: "#444", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const primaryBtn = (c: string): React.CSSProperties => ({ padding: "8px 18px", borderRadius: 9, border: "none", background: c, color: "#FFF", fontSize: 13, fontWeight: 600, cursor: "pointer" });
const overlay = (z: number): React.CSSProperties => ({ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: z, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 });
