import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";
import { toast } from "sonner";
import { Search, Clock, Pencil, Trash2, X, Plus } from "lucide-react";

export interface WorkInterval { start: string; end: string }
export interface WorkDay { day: string; active: boolean; intervals: WorkInterval[] }
export interface WorkSchedule { id: string; name: string; days: WorkDay[]; created_at: string }

const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const DAY_FULL: Record<string, string> = {
  Segunda: "Segunda-feira", Terça: "Terça-feira", Quarta: "Quarta-feira",
  Quinta: "Quinta-feira", Sexta: "Sexta-feira", Sábado: "Sábado", Domingo: "Domingo",
};
const defaultDays = (): WorkDay[] =>
  DAYS.map(d => ({ day: d, active: !["Sábado", "Domingo"].includes(d), intervals: [{ start: "08:00", end: "18:00" }] }));

const minutes = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const dayHours = (d: WorkDay) => d.intervals.reduce((s, i) => s + Math.max(0, minutes(i.end) - minutes(i.start)), 0) / 60;

function diasLabel(days: WorkDay[]) {
  const act = days.filter(d => d.active);
  if (act.length === 0) return "—";
  if (act.length === 1) return DAY_FULL[act[0].day];
  return `${DAY_FULL[act[0].day]} - ${DAY_FULL[act[act.length - 1].day]}`;
}
function horariosLabel(days: WorkDay[]) {
  const act = days.filter(d => d.active);
  if (act.length === 0) return "—";
  const sigs = new Set(act.map(d => d.intervals.map(i => `${i.start}-${i.end}`).join(",")));
  const first = act[0];
  if (sigs.size === 1 && first.intervals.length === 1)
    return `${first.intervals[0].start} - ${first.intervals[0].end}`;
  return "Vários horários";
}
function mediaLabel(days: WorkDay[]) {
  const act = days.filter(d => d.active);
  if (act.length === 0) return "0 h/dia";
  const avg = act.reduce((s, d) => s + dayHours(d), 0) / act.length;
  return `${Number(avg.toFixed(1))} h/dia`;
}

interface Props { accent?: string; createOpen: boolean; setCreateOpen: (b: boolean) => void; }

export default function WorkSchedulesManager({ accent = "#2563EB", createOpen, setCreateOpen }: Props) {
  const { company } = useCompany();
  const ownerId = company?.owner_id ?? null;

  const [items, setItems] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<WorkSchedule | null>(null);
  const [deleting, setDeleting] = useState<WorkSchedule | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("work_schedules").select("*").eq("owner_id", ownerId).order("created_at", { ascending: true });
    if (!error && data) setItems(data as WorkSchedule[]);
    setLoading(false);
  }, [ownerId]);
  useEffect(() => { load(); }, [load]);

  const modalOpen = createOpen || editing !== null;
  const closeModal = () => { setCreateOpen(false); setEditing(null); };
  const filtered = items.filter(s => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase()));

  async function handleSave(form: { name: string; days: WorkDay[] }) {
    if (!ownerId) return;
    if (!form.name.trim()) { toast.error("Dê um nome ao horário."); return; }
    if (editing) {
      const { error } = await supabase.from("work_schedules").update({ name: form.name.trim(), days: form.days }).eq("id", editing.id);
      if (error) { toast.error("Erro ao salvar o horário."); return; }
      toast.success("Horário atualizado.");
    } else {
      const { error } = await supabase.from("work_schedules").insert({
        owner_id: ownerId, company_id: company?.id ?? null, name: form.name.trim(), days: form.days,
      });
      if (error) { toast.error("Erro ao criar o horário."); return; }
      toast.success("Horário criado.");
    }
    closeModal(); load();
  }
  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("work_schedules").delete().eq("id", deleting.id);
    if (error) { toast.error("Erro ao excluir o horário."); return; }
    toast.success("Horário excluído."); setDeleting(null); load();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: 10, padding: "8px 12px", marginBottom: 14 }}>
        <Search size={14} color="#AAA" />
        <input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)} style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#111", flex: 1 }} />
        <span style={{ fontSize: 12, color: "#AAA" }}>{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1.2fr 0.9fr 64px", padding: "6px 4px", borderBottom: "1px solid #EEEEEE", marginBottom: 4 }}>
        {["Nome", "Dias", "Horários", "Média diária", ""].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#CCC", fontSize: 13 }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 8 }}>
          <Clock size={32} color="#E5E5E5" />
          <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>{items.length === 0 ? "Nenhum horário criado" : "Nenhum resultado"}</p>
          {items.length === 0 && <p style={{ fontSize: 12, color: "#CCC", margin: 0 }}>Clique em "Criar" para adicionar um horário</p>}
        </div>
      ) : (
        filtered.map(s => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1.2fr 0.9fr 64px", alignItems: "center", padding: "13px 4px", borderBottom: "1px solid #F2F2F2" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{s.name}</span>
            <span style={{ fontSize: 12.5, color: "#444" }}>{diasLabel(s.days)}</span>
            <span style={{ fontSize: 12.5, color: "#444" }}>{horariosLabel(s.days)}</span>
            <span style={{ fontSize: 12.5, color: "#444" }}>{mediaLabel(s.days)}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(s)} title="Editar" style={iconBtn}><Pencil size={14} color="#888" /></button>
              <button onClick={() => setDeleting(s)} title="Excluir" style={iconBtn}><Trash2 size={14} color="#888" /></button>
            </div>
          </div>
        ))
      )}

      {modalOpen && <ScheduleModal accent={accent} editing={editing} onClose={closeModal} onSave={handleSave} />}

      {deleting && (
        <div onClick={() => setDeleting(null)} style={overlay(400)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 14, width: 380, padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 6 }}>Excluir horário</div>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 18px", lineHeight: 1.5 }}>Excluir <strong>{deleting.name}</strong>? Esta ação não pode ser desfeita.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setDeleting(null)} style={ghostBtn}>Cancelar</button>
              <button onClick={handleDelete} style={primaryBtn("#EF4444")}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleModal({ accent, editing, onClose, onSave }: {
  accent: string; editing: WorkSchedule | null; onClose: () => void;
  onSave: (f: { name: string; days: WorkDay[] }) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [days, setDays] = useState<WorkDay[]>(() => {
    if (editing?.days && Array.isArray(editing.days) && editing.days.length) {
      // garante os 7 dias na ordem certa
      return DAYS.map(d => editing.days.find(x => x.day === d) ?? { day: d, active: false, intervals: [{ start: "08:00", end: "18:00" }] });
    }
    return defaultDays();
  });

  const patch = (idx: number, fn: (d: WorkDay) => WorkDay) => setDays(prev => prev.map((d, i) => i === idx ? fn(d) : d));

  return (
    <div onClick={onClose} style={overlay(350)}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 14, width: 540, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{editing ? "Atualizar horário" : "Criar horário"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#AAA" /></button>
        </div>
        <div style={{ padding: "16px 22px", overflowY: "auto" }}>
          <label style={lbl}>Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Horário da Clínica" autoFocus style={field} />

          <label style={{ ...lbl, marginTop: 16 }}>Dias e horários</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {days.map((d, idx) => (
              <div key={d.day} style={{ background: d.active ? "#F9FAFB" : "transparent", border: "1px solid #F0F0F0", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle on={d.active} accent={accent} onClick={() => patch(idx, x => ({ ...x, active: !x.active, intervals: x.intervals.length ? x.intervals : [{ start: "08:00", end: "18:00" }] }))} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: d.active ? "#111" : "#AAA", width: 110 }}>{DAY_FULL[d.day]}</span>
                  {!d.active && <span style={{ fontSize: 12, color: "#BBB" }}>Fechado</span>}
                </div>
                {d.active && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, paddingLeft: 52 }}>
                    {d.intervals.map((iv, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="time" value={iv.start} onChange={e => patch(idx, x => ({ ...x, intervals: x.intervals.map((y, k) => k === j ? { ...y, start: e.target.value } : y) }))} style={timeField} />
                        <span style={{ fontSize: 12, color: "#888" }}>às</span>
                        <input type="time" value={iv.end} onChange={e => patch(idx, x => ({ ...x, intervals: x.intervals.map((y, k) => k === j ? { ...y, end: e.target.value } : y) }))} style={timeField} />
                        {d.intervals.length > 1 && (
                          <button onClick={() => patch(idx, x => ({ ...x, intervals: x.intervals.filter((_, k) => k !== j) }))} style={iconBtn}><Trash2 size={13} color="#C00" /></button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => patch(idx, x => ({ ...x, intervals: [...x.intervals, { start: "08:00", end: "12:00" }] }))}
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: accent, fontSize: 12, fontWeight: 600, padding: "2px 0", width: "fit-content" }}>
                      <Plus size={12} /> Adicionar intervalo
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #F0F0F0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={ghostBtn}>Cancelar</button>
          <button onClick={() => onSave({ name, days })} style={primaryBtn(accent)}>{editing ? "Salvar" : "Criar"}</button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, accent, onClick }: { on: boolean; accent: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: 38, height: 20, borderRadius: 10, background: on ? accent : "#D1D5DB", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
      <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#FFF", position: "absolute", top: 3, left: on ? 21 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

const iconBtn: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 5, borderRadius: 6, display: "flex", alignItems: "center" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 };
const field: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid #E5E5E5", borderRadius: 9, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FFF" };
const timeField: React.CSSProperties = { padding: "6px 8px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 12.5, outline: "none", background: "#FFF" };
const ghostBtn: React.CSSProperties = { padding: "8px 16px", borderRadius: 9, border: "1px solid #E5E5E5", background: "#FFF", color: "#444", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const primaryBtn = (c: string): React.CSSProperties => ({ padding: "8px 18px", borderRadius: 9, border: "none", background: c, color: "#FFF", fontSize: 13, fontWeight: 600, cursor: "pointer" });
const overlay = (z: number): React.CSSProperties => ({ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: z, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 });
