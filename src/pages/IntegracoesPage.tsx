import { useState, useEffect, useCallback } from "react";
import { useCRM } from "@/context/CRMContext";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { emitPlanLimit } from "@/lib/planLimitEvent";
import {
  Search, Plus, X, Copy, Check, RefreshCw, Loader2,
  ShoppingBag, ChevronLeft, ToggleLeft, ToggleRight, Trash2, AlertTriangle,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

interface FieldMappings {
  name?: string; company?: string; email?: string;
  phone?: string; phoneDdi?: string;
  externalId?: string;
  productSku?: string; productName?: string; productPrice?: string;
  [key: string]: string | undefined;
}

interface AutomationSettings {
  pipelineId?: string; stageId?: string; tags?: string[];
}

interface Integration {
  id: string; name: string; type: string;
  webhookToken: string; active: boolean;
  fieldMappings: FieldMappings;
  automationSettings: AutomationSettings;
  lastReceivedData?: string;
  createdAt: string;
}

type ConfigTab = "perfil" | "negocios" | "automacao" | "campos";

const INTEGRATION_TYPES = [
  {
    category: "Negócios",
    types: [{
      id: "deal_entry",
      name: "Entrada de Negócios",
      description: "Recebe informações via webhook, permitindo mapear dados para criar leads, associar negócios e adicionar tags automaticamente",
      icon: ShoppingBag,
    }],
  },
];

function webhookUrl(token: string) {
  return `https://app.rezultcrm.com/api/webhook/${token}`;
}

function mapRow(r: Record<string, unknown>): Integration {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as string,
    webhookToken: r.webhook_token as string,
    active: r.active as boolean,
    fieldMappings: (r.field_mappings as FieldMappings) ?? {},
    automationSettings: (r.automation_settings as AutomationSettings) ?? {},
    lastReceivedData: r.last_received_data as string | undefined,
    createdAt: r.created_at as string,
  };
}

// ── FieldSelect ──────────────────────────────────────────────────────────────

function FieldSelect({
  placeholder, value, onChange, keys,
}: { placeholder: string; value?: string; onChange: (v: string) => void; keys: string[] }) {
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: value ? "#111" : "#AAA", background: "#FAFAFA", outline: "none", cursor: "pointer" }}
    >
      <option value="">{placeholder}</option>
      {keys.map(k => <option key={k} value={k}>{k}</option>)}
    </select>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  const { pipelines, crmTags, customFieldGroups } = useCRM();
  const { user } = useAuth();
  const { company } = useCompany();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState("Negócios");

  // Modals
  const [showCreate, setShowCreate]   = useState(false);
  const [createCat, setCreateCat]     = useState("Negócios");
  const [editing, setEditing]         = useState<Integration | null>(null);

  // Edit state
  const [editName, setEditName]               = useState("");
  const [editActive, setEditActive]           = useState(true);
  const [editMappings, setEditMappings]       = useState<FieldMappings>({});
  const [editAutomation, setEditAutomation]   = useState<AutomationSettings>({});
  const [editCustom, setEditCustom]           = useState<Record<string, string>>({});
  const [configTab, setConfigTab]             = useState<ConfigTab>("perfil");
  const [receivedData, setReceivedData]       = useState("");
  const [parsedKeys, setParsedKeys]           = useState<string[]>([]);
  const [dataError, setDataError]             = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [saving, setSaving]                   = useState(false);

  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!user || !company) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("webhook_integrations")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setIntegrations((data ?? []).map(mapRow));
    setLoading(false);
  }, [user, company]);

  useEffect(() => { load(); }, [load]);

  // ── Create ──────────────────────────────────────────────────────────────────
  const [creating, setCreating] = useState(false);

  const createIntegration = async (type: string) => {
    if (!user || !company || creating) return;

    const { PLAN_LIMITS } = await import("@/data/plans");
    const limit = PLAN_LIMITS[company.plan]?.webhooks ?? null;
    if (limit !== null && integrations.length >= limit) {
      emitPlanLimit("integrações");
      return;
    }

    setCreating(true);
    const { data, error } = await supabase.from("webhook_integrations").insert({
      owner_id: user.id,
      company_id: company.id,
      name: "Nova integração",
      type,
      active: true,
      field_mappings: {},
      automation_settings: {},
    }).select().single();
    setCreating(false);
    if (error) {
      if ((error as { code?: string }).code === "42P01") {
        toast.error("Tabela não encontrada. Execute a migration SQL no Supabase primeiro.");
      } else {
        toast.error(`Erro ao criar integração: ${error.message}`);
      }
      return;
    }
    const created = mapRow(data as Record<string, unknown>);
    setIntegrations(prev => [created, ...prev]);
    setShowCreate(false);
    openEdit(created);
  };

  // ── Open Edit ───────────────────────────────────────────────────────────────
  const openEdit = (itg: Integration) => {
    setEditing(itg);
    setEditName(itg.name);
    setEditActive(itg.active);
    setEditMappings(itg.fieldMappings);
    setEditAutomation(itg.automationSettings);
    const customKeys = Object.keys(itg.fieldMappings).filter(k =>
      !["name","company","email","phone","phoneDdi","externalId","productSku","productName","productPrice"].includes(k)
    );
    const cm: Record<string, string> = {};
    customKeys.forEach(k => { cm[k] = itg.fieldMappings[k] ?? ""; });
    setEditCustom(cm);
    const raw = itg.lastReceivedData ?? "";
    setReceivedData(raw);
    setParsedKeys(safeParseKeys(raw));
    setDataError(false);
    setConfigTab("perfil");
    setCopied(false);
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const allMappings = { ...editMappings, ...editCustom };
    const { error } = await supabase.from("webhook_integrations").update({
      name: editName,
      active: editActive,
      field_mappings: allMappings,
      automation_settings: editAutomation,
      last_received_data: receivedData || null,
    }).eq("id", editing.id);
    if (error) { toast.error("Erro ao salvar"); setSaving(false); return; }
    setIntegrations(prev => prev.map(i => i.id === editing.id
      ? { ...i, name: editName, active: editActive, fieldMappings: allMappings, automationSettings: editAutomation, lastReceivedData: receivedData || undefined }
      : i
    ));
    toast.success("Integração salva!");
    setSaving(false);
    setEditing(null);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const remove = async () => {
    if (!editing) return;
    if (!confirm(`Remover a integração "${editing.name}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("webhook_integrations").delete().eq("id", editing.id);
    setIntegrations(prev => prev.filter(i => i.id !== editing.id));
    setEditing(null);
    toast.success("Integração removida.");
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const safeParseKeys = (raw: string): string[] => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return Object.keys(parsed);
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") return Object.keys(parsed[0]);
    } catch { /* ignore parse errors */ }
    return [];
  };

  const handleReceivedData = (val: string) => {
    setReceivedData(val);
    const keys = safeParseKeys(val);
    setParsedKeys(keys);
    setDataError(val.trim().length > 0 && keys.length === 0);
  };

  const copyUrl = (token: string) => {
    navigator.clipboard.writeText(webhookUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setMap = (key: keyof FieldMappings, val: string) =>
    setEditMappings(prev => ({ ...prev, [key]: val || undefined }));

  const setAuto = (key: keyof AutomationSettings, val: unknown) =>
    setEditAutomation(prev => ({ ...prev, [key]: val }));

  const editPipeline = pipelines.find(p => p.id === editAutomation.pipelineId);

  const filtered = integrations.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  const catLabel = (type: string) =>
    INTEGRATION_TYPES.flatMap(c => c.types).find(t => t.id === type)?.name ?? type;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Integrações</h1>
          <p className="text-[14px] font-normal text-muted-foreground mt-0.5">Automações via webhooks</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: "#2563EB", color: "#FFF", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={15} /> Criar
        </button>
      </div>

      {/* Filter + Search */}
      <div className="flex gap-3 mb-6">
        <div style={{ position: "relative", maxWidth: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#AAA" }} />
          <input
            placeholder="Pesquisar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 12px 8px 32px", fontSize: 13, outline: "none", background: "#FFF" }}
          />
        </div>
        <span style={{ fontSize: 13, color: "#888", alignSelf: "center" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Main layout */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Left: category sidebar */}
        <div style={{ width: 180, flexShrink: 0 }}>
          {INTEGRATION_TYPES.map(cat => (
            <button
              key={cat.category}
              onClick={() => setCatFilter(cat.category)}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: catFilter === cat.category ? "#EBF3FC" : "transparent", color: catFilter === cat.category ? "#2563EB" : "#555" }}
            >
              {cat.category}
            </button>
          ))}
        </div>

        {/* Right: integration list */}
        <div style={{ flex: 1 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 8, color: "#AAA" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 13 }}>Carregando…</span>
            </div>
          ) : loadError ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <AlertTriangle size={36} style={{ margin: "0 auto 12px", color: "#F59E0B", opacity: 0.6 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "#888" }}>Erro ao carregar integrações</p>
              <p style={{ fontSize: 13, color: "#AAA", marginTop: 4, marginBottom: 16 }}>
                Execute a migration SQL no Supabase para criar a tabela <code style={{ background: "#F3F4F6", padding: "1px 6px", borderRadius: 4 }}>webhook_integrations</code>
              </p>
              <button
                onClick={load}
                style={{ fontSize: 13, fontWeight: 600, color: "#2563EB", background: "#EBF3FC", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer" }}
              >
                Tentar novamente
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#AAA" }}>
              <ShoppingBag size={36} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "#888" }}>Nenhuma integração encontrada</p>
              <p style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>Configure um webhook para receber leads automaticamente</p>
              <button
                onClick={() => setShowCreate(true)}
                style={{ fontSize: 13, fontWeight: 700, color: "#FFF", background: "#2563EB", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Plus size={15} /> Criar primeiro webhook
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
              {filtered.map(itg => (
                <div
                  key={itg.id}
                  onClick={() => openEdit(itg)}
                  style={{ border: "1px solid #E5E5E5", borderRadius: 12, padding: "16px", background: "#FFF", cursor: "pointer", transition: "box-shadow 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)")}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EBF3FC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ShoppingBag size={20} color="#2563EB" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{itg.name}</p>
                      <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{catLabel(itg.type)}</p>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: itg.active ? "#22C55E" : "#DDD", marginTop: 6, flexShrink: 0 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ CREATE MODAL ═══════════ */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FFF", borderRadius: 16, width: "min(90vw,640px)", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #F0F0F0" }}>
              <h2 style={{ fontWeight: 700, fontSize: 18, color: "#111" }}>Integrações</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}><X size={20} /></button>
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* Category sidebar */}
              <div style={{ width: 160, borderRight: "1px solid #F0F0F0", padding: "12px 8px", flexShrink: 0 }}>
                {INTEGRATION_TYPES.map(cat => (
                  <button
                    key={cat.category}
                    onClick={() => setCreateCat(cat.category)}
                    style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: createCat === cat.category ? "#EBF3FC" : "transparent", color: createCat === cat.category ? "#2563EB" : "#555" }}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>

              {/* Types list */}
              <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
                {INTEGRATION_TYPES.find(c => c.category === createCat)?.types.map(t => (
                  <div
                    key={t.id}
                    onClick={() => !creating && createIntegration(t.id)}
                    style={{ display: "flex", gap: 14, padding: "14px", border: "1px solid #E5E5E5", borderRadius: 12, cursor: creating ? "default" : "pointer", marginBottom: 10, background: "#FAFAFA", opacity: creating ? 0.6 : 1 }}
                    onMouseEnter={e => { if (!creating) { e.currentTarget.style.background = "#EBF3FC"; e.currentTarget.style.borderColor = "#2563EB30"; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#FAFAFA"; e.currentTarget.style.borderColor = "#E5E5E5"; }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EBF3FC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {creating ? <Loader2 size={20} color="#2563EB" style={{ animation: "spin 1s linear infinite" }} /> : <t.icon size={20} color="#2563EB" />}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{t.name}</p>
                      <p style={{ fontSize: 12, color: "#888", marginTop: 3, lineHeight: 1.4 }}>{t.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ EDIT MODAL ═══════════ */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#FFF", borderRadius: 16, width: "min(95vw,980px)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

            {/* Modal Header */}
            <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                  <ShoppingBag size={12} /> {catLabel(editing.type)}
                </p>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>Atualizar integração</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 }}>Integração ativa</span>
                  <button
                    onClick={() => setEditActive(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                  >
                    {editActive
                      ? <div style={{ width: 44, height: 24, borderRadius: 12, background: "#2563EB", position: "relative" }}><div style={{ position: "absolute", right: 2, top: 2, width: 20, height: 20, borderRadius: "50%", background: "#FFF" }} /></div>
                      : <div style={{ width: 44, height: 24, borderRadius: 12, background: "#E0E0E0", position: "relative" }}><div style={{ position: "absolute", left: 2, top: 2, width: 20, height: 20, borderRadius: "50%", background: "#FFF" }} /></div>
                    }
                  </button>
                </div>
                <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}><X size={20} /></button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

              {/* Left: config */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid #F0F0F0" }}>
                <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>

                  {/* Name */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, color: "#555", fontWeight: 600, display: "block", marginBottom: 6 }}>Nome</label>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", background: "#FAFAFA", color: "#111", boxSizing: "border-box" }}
                    />
                  </div>

                  {/* Webhook URL */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, color: "#555", fontWeight: 600, display: "block", marginBottom: 6 }}>Webhook</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        readOnly
                        value={webhookUrl(editing.webhookToken)}
                        style={{ flex: 1, border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 12px", fontSize: 12, background: "#F5F5F5", color: "#555", outline: "none", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}
                      />
                      <button
                        onClick={() => copyUrl(editing.webhookToken)}
                        style={{ padding: "8px 12px", border: "1px solid #E0E0E0", borderRadius: 8, background: "#FFF", cursor: "pointer", color: copied ? "#22C55E" : "#555", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, flexShrink: 0 }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <div style={{ marginTop: 8, background: "#FFF9E6", border: "1px solid #F59E0B30", borderRadius: 8, padding: "8px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <AlertTriangle size={13} color="#F59E0B" style={{ marginTop: 1, flexShrink: 0 }} />
                      <p style={{ fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>O webhook possui um limite de 120 requisições por minuto. Caso precise aumentar o limite entre em contato com o suporte.</p>
                    </div>
                  </div>

                  {/* Config Tabs */}
                  <div style={{ borderBottom: "1px solid #F0F0F0", display: "flex", gap: 0, marginBottom: 16 }}>
                    {(["perfil","negocios","automacao","campos"] as ConfigTab[]).map(t => (
                      <button key={t} onClick={() => setConfigTab(t)} style={{ fontSize: 13, fontWeight: 600, padding: "8px 14px", background: "none", border: "none", cursor: "pointer", color: configTab === t ? "#2563EB" : "#888", borderBottom: configTab === t ? "2px solid #2563EB" : "2px solid transparent" }}>
                        {{ perfil: "Perfil", negocios: "Negócios", automacao: "Automação", campos: "Campos adicionais" }[t]}
                      </button>
                    ))}
                  </div>

                  {/* ── PERFIL TAB ── */}
                  {configTab === "perfil" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#EBF3FC", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <ShoppingBag size={14} color="#2563EB" />
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Identificação</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {([
                          { key: "name" as const, label: "Nome" },
                          { key: "company" as const, label: "Empresa" },
                          { key: "email" as const, label: "Email" },
                        ]).map(f => (
                          <div key={f.key}>
                            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                            <FieldSelect placeholder={`Selecione um campo "${f.label}" para o Lead`} value={editMappings[f.key]} onChange={v => setMap(f.key, v)} keys={parsedKeys} />
                          </div>
                        ))}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>DDI</label>
                            <FieldSelect placeholder="DDI" value={editMappings.phoneDdi} onChange={v => setMap("phoneDdi", v)} keys={parsedKeys} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>Telefone</label>
                            <FieldSelect placeholder='Selecione um campo "Telefone" para o Lead' value={editMappings.phone} onChange={v => setMap("phone", v)} keys={parsedKeys} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── NEGÓCIOS TAB ── */}
                  {configTab === "negocios" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>ID externo do negócio</label>
                        <FieldSelect placeholder='Selecione um campo "ID" para o ID externo do negócio' value={editMappings.externalId} onChange={v => setMap("externalId", v)} keys={parsedKeys} />
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#F0F0F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ShoppingBag size={14} color="#555" />
                          </div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Produto</p>
                        </div>
                        {([
                          { key: "productSku" as const, label: "SKU" },
                          { key: "productName" as const, label: "Nome" },
                          { key: "productPrice" as const, label: "Preço" },
                        ]).map(f => (
                          <div key={f.key} style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                            <FieldSelect placeholder={`Selecione um campo "${f.label}" para o Produto`} value={editMappings[f.key]} onChange={v => setMap(f.key, v)} keys={parsedKeys} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── AUTOMAÇÃO TAB ── */}
                  {configTab === "automacao" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <RefreshCw size={14} color="#8B5CF6" />
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Automação</p>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Pipeline</label>
                          <select
                            value={editAutomation.pipelineId ?? ""}
                            onChange={e => { setAuto("pipelineId", e.target.value || undefined); setAuto("stageId", undefined); }}
                            style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#FAFAFA", color: editAutomation.pipelineId ? "#111" : "#AAA", outline: "none" }}
                          >
                            <option value="">Selecionar pipeline</option>
                            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Etapa</label>
                          <select
                            value={editAutomation.stageId ?? ""}
                            onChange={e => setAuto("stageId", e.target.value || undefined)}
                            disabled={!editAutomation.pipelineId}
                            style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#FAFAFA", color: editAutomation.stageId ? "#111" : "#AAA", outline: "none", opacity: editAutomation.pipelineId ? 1 : 0.5 }}
                          >
                            <option value="">Selecionar</option>
                            {(editPipeline?.columns ?? []).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>Tags (aplicar automaticamente)</label>
                          <select
                            multiple
                            value={editAutomation.tags ?? []}
                            onChange={e => setAuto("tags", Array.from(e.target.selectedOptions, o => o.value))}
                            style={{ width: "100%", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#FAFAFA", outline: "none", minHeight: 80 }}
                          >
                            {crmTags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                          </select>
                          <p style={{ fontSize: 11, color: "#AAA", marginTop: 4 }}>Segure Ctrl para selecionar múltiplas tags</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── CAMPOS ADICIONAIS TAB ── */}
                  {configTab === "campos" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#F0F0F0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Plus size={14} color="#555" />
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Campos adicionais</p>
                      </div>
                      {customFieldGroups.flatMap(g => g.items).length === 0 ? (
                        <p style={{ fontSize: 13, color: "#AAA", fontStyle: "italic" }}>Nenhum campo adicional configurado. Acesse Configurações → Campos adicionais.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {customFieldGroups.flatMap(g => g.items).map(f => (
                            <div key={f.id}>
                              <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 4 }}>{f.label}</label>
                              <FieldSelect
                                placeholder={`Selecione os campos`}
                                value={editCustom[f.id]}
                                onChange={v => setEditCustom(prev => ({ ...prev, [f.id]: v }))}
                                keys={parsedKeys}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: received data */}
              <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Dados recebidos</p>
                    <button
                      onClick={() => { handleReceivedData(receivedData); toast.success("Campos atualizados!"); }}
                      style={{ fontSize: 12, fontWeight: 600, color: "#FFF", background: "#2563EB", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <RefreshCw size={12} /> Receber dados
                    </button>
                  </div>
                  <textarea
                    value={receivedData}
                    onChange={e => handleReceivedData(e.target.value)}
                    placeholder={'Cole aqui um exemplo de JSON para mapear os campos:\n\n{\n  "nome": "João Silva",\n  "telefone": "11999999999",\n  "email": "joao@email.com"\n}'}
                    style={{ flex: 1, border: `1px solid ${dataError ? "#EF4444" : "#E0E0E0"}`, borderRadius: 10, padding: "12px", fontSize: 12, color: "#333", resize: "none", outline: "none", fontFamily: "monospace", lineHeight: 1.5, background: "#FAFAFA" }}
                  />
                  {dataError && (
                    <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>JSON inválido — verifique o formato</p>
                  )}
                  {parsedKeys.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ fontSize: 11, color: "#AAA", marginBottom: 4 }}>Campos detectados:</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {parsedKeys.map(k => (
                          <span key={k} style={{ fontSize: 10, fontWeight: 600, background: "#EBF3FC", color: "#2563EB", padding: "2px 8px", borderRadius: 100 }}>{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: "14px 24px", borderTop: "1px solid #F0F0F0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <button
                onClick={remove}
                style={{ fontSize: 13, fontWeight: 600, color: "#EF4444", background: "#FFF", border: "1px solid #E0E0E0", borderRadius: 8, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
              >
                <Trash2 size={14} /> Remover
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{ fontSize: 13, fontWeight: 700, color: "#FFF", background: saving ? "#AAA" : "#2563EB", border: "none", borderRadius: 8, padding: "8px 24px", cursor: saving ? "default" : "pointer" }}
              >
                {saving ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
