import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Plus,
  Upload,
  FileText,
  X,
  Circle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";

// Só "SDS" existe de verdade hoje. Outros tipos (ex: agente de analytics)
// entram aqui quando forem construídos — não antes.
const AGENT_TYPES = ["SDS"] as const;
type AgentType = (typeof AGENT_TYPES)[number];

type Agent = {
  id: string;
  type: string;
  name: string;
  active: boolean;
  model: string;
  custom_context: string | null;
};

type KnowledgeDoc = {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "ready" | "error";
  error_detail: string | null;
  created_at: string;
};

type Member = { user_id: string; full_name: string; email: string; avatar_url: string | null };

const STATUS_BADGE: Record<KnowledgeDoc["status"], { bg: string; fg: string; label: string }> = {
  pending: { bg: "#F5F5F5", fg: "#666666", label: "Pendente" },
  processing: { bg: "#FEF3C7", fg: "#92400E", label: "Processando" },
  ready: { bg: "#E1F5EE", fg: "#128A68", label: "Pronto" },
  error: { bg: "#FEE2E2", fg: "#991B1B", label: "Erro" },
};

export default function AgentesPage() {
  const { company } = useCompany();
  const { user } = useAuth();
  const companyId = company?.id;

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [closerIds, setCloserIds] = useState<string[]>([]);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [customContext, setCustomContext] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<AgentType>("SDS");

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const loadAgents = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: agentsData }, { data: anthropicKey }, { data: openaiKey }, { data: membersData }] =
      await Promise.all([
        supabase.from("agents").select("id, type, name, active, model, custom_context").eq("company_id", companyId).order("created_at"),
        supabase.from("ai_provider_keys").select("id").eq("company_id", companyId).eq("provider", "anthropic").eq("active", true).maybeSingle(),
        supabase.from("ai_provider_keys").select("id").eq("company_id", companyId).eq("provider", "openai").eq("active", true).maybeSingle(),
        supabase.rpc("get_company_members", { p_company_id: companyId }),
      ]);
    setAgents(agentsData ?? []);
    setHasAnthropicKey(!!anthropicKey);
    setHasOpenaiKey(!!openaiKey);
    setMembers((membersData ?? []) as Member[]);
    setSelectedId((prev) => prev ?? (agentsData?.[0]?.id ?? null));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  useEffect(() => {
    if (!selectedId || !companyId) return;
    setCustomContext(selected?.custom_context ?? "");
    (async () => {
      const [{ data: closersData }, { data: docsData }] = await Promise.all([
        supabase.from("agent_closers").select("user_id").eq("agent_id", selectedId).eq("company_id", companyId),
        supabase.from("agent_knowledge_documents").select("id, file_name, status, error_detail, created_at").eq("agent_id", selectedId).eq("company_id", companyId).order("created_at", { ascending: false }),
      ]);
      setCloserIds((closersData ?? []).map((c) => c.user_id as string));
      setDocs((docsData ?? []) as KnowledgeDoc[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, companyId]);

  async function createAgent() {
    if (!companyId || !user?.id) return;
    if (!draftName.trim()) { toast.error("Informe o nome do agente"); return; }
    const { data, error } = await supabase
      .from("agents")
      .insert({ company_id: companyId, owner_id: user.id, type: draftType, name: draftName.trim(), active: false })
      .select("id, type, name, active, model, custom_context")
      .single();
    if (error || !data) { toast.error("Erro ao criar agente"); return; }
    setAgents((prev) => [...prev, data]);
    setSelectedId(data.id);
    setOpenDialog(false);
    setDraftName("");
    toast.success("Agente criado");
  }

  async function toggleActive(next: boolean) {
    if (!selected || !companyId) return;
    if (next && !hasAnthropicKey) {
      toast.error("Cadastre sua chave da Anthropic em Configurações antes de ativar o agente.");
      return;
    }
    const { error } = await supabase.from("agents").update({ active: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, active: next } : a)));
    toast.success(next ? "Agente ativado" : "Agente desativado");
  }

  async function saveCustomContext() {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ custom_context: customContext }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, custom_context: customContext } : a)));
    toast.success("Contexto salvo");
  }

  async function toggleCloser(userId: string, checked: boolean) {
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_closers").insert({ agent_id: selected.id, company_id: companyId, user_id: userId });
      if (error) { toast.error("Erro ao adicionar closer"); return; }
      setCloserIds((prev) => [...prev, userId]);
    } else {
      const { error } = await supabase.from("agent_closers").delete().eq("agent_id", selected.id).eq("user_id", userId);
      if (error) { toast.error("Erro ao remover closer"); return; }
      setCloserIds((prev) => prev.filter((id) => id !== userId));
    }
  }

  async function handleUpload(file: File) {
    if (!selected || !companyId || !user?.id) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "txt" && ext !== "pdf") {
      toast.error("Só .txt e .pdf são suportados por enquanto.");
      return;
    }
    setUploading(true);
    try {
      const path = `${companyId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("agent-knowledge").upload(path, file);
      if (upErr) throw upErr;

      const { data: docRow, error: insErr } = await supabase
        .from("agent_knowledge_documents")
        .insert({ agent_id: selected.id, company_id: companyId, owner_id: user.id, file_name: file.name, storage_path: path, status: "pending" })
        .select("id, file_name, status, error_detail, created_at")
        .single();
      if (insErr || !docRow) throw insErr;
      setDocs((prev) => [docRow as KnowledgeDoc, ...prev]);

      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      const { error: fnError } = await supabase.functions.invoke("agent-kb-ingest", {
        body: { documentId: docRow.id },
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      });
      if (fnError) throw fnError;

      toast.success("Documento enviado — processando");
      setTimeout(async () => {
        const { data: refreshed } = await supabase.from("agent_knowledge_documents").select("id, file_name, status, error_detail, created_at").eq("id", docRow.id).single();
        if (refreshed) setDocs((prev) => prev.map((d) => (d.id === refreshed.id ? (refreshed as KnowledgeDoc) : d)));
      }, 4000);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao enviar documento");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDoc(doc: KnowledgeDoc) {
    if (!companyId) return;
    await supabase.from("agent_knowledge_documents").delete().eq("id", doc.id).eq("company_id", companyId);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-[#AAAAAA]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[#111111] leading-tight">Agentes</h1>
          <p className="text-[13px] text-[#AAAAAA] mt-1">
            Agentes de IA que atuam sobre seus leads — qualificam, respondem e agendam sozinhos
          </p>
        </div>
        <Button onClick={() => setOpenDialog(true)} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
          <Plus size={16} /> Novo agente
        </Button>
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <Bot size={64} color="#E5E5E5" />
          <h2 className="text-[20px] font-bold text-[#111111] mt-4">Nenhum agente configurado</h2>
          <p className="text-[13px] text-[#AAAAAA] mt-2 max-w-[420px]">
            Crie seu primeiro agente SDS para qualificar leads e agendar reuniões automaticamente no multiatendimento
          </p>
          <Button onClick={() => setOpenDialog(true)} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white mt-6">
            <Plus size={16} /> Criar primeiro agente
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[280px_1fr] gap-6">
          {/* Lista de agentes */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-4">
            <h2 className="text-[11px] uppercase tracking-wide text-[#AAAAAA] font-semibold mb-3">
              Seus agentes
            </h2>
            <div className="space-y-1.5">
              {agents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-left cursor-pointer ${
                    selectedId === a.id ? "border-[#128A68] bg-[#E1F5EE]" : "border-[#EEEEEE] bg-white hover:bg-[#F5F5F5]"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-[#128A68] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                    {a.type}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-[#111111] truncate">{a.name}</span>
                      <Circle size={8} fill={a.active ? "#128A68" : "#CCCCCC"} color={a.active ? "#128A68" : "#CCCCCC"} />
                    </div>
                    <div className="text-[11px] text-[#AAAAAA]">{a.active ? "Ativo" : "Inativo"}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Config panel */}
          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1">
            {!selected ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Bot size={64} color="#E5E5E5" />
                <p className="text-[#AAAAAA] text-[14px] mt-4">Selecione um agente para configurar</p>
              </div>
            ) : (
              <Tabs defaultValue="perfil" className="w-full">
                <div className="px-6 pt-5 pb-0 border-b border-[#EEEEEE]">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-[16px] font-bold text-[#111111]">{selected.name}</h2>
                      <p className="text-[12px] text-[#AAAAAA]">Tipo: {selected.type}</p>
                    </div>
                  </div>
                  <TabsList className="bg-transparent p-0 h-auto gap-1">
                    {[
                      { v: "perfil", l: "Perfil" },
                      { v: "kb", l: "Base de Conhecimento" },
                      { v: "comportamento", l: "Comportamento" },
                      { v: "closers", l: "Closers" },
                      { v: "performance", l: "Performance" },
                    ].map((t) => (
                      <TabsTrigger
                        key={t.v}
                        value={t.v}
                        className="data-[state=active]:bg-[#E1F5EE] data-[state=active]:text-[#128A68] data-[state=active]:shadow-none rounded-md text-[13px] px-3 py-1.5"
                      >
                        {t.l}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {/* PERFIL */}
                <TabsContent value="perfil" className="p-6 space-y-6 mt-0">
                  <div className="flex items-center justify-between p-4 bg-[#F5F5F5] rounded-lg">
                    <div>
                      <div className="text-[13px] font-medium text-[#111111]">Agente ativo</div>
                      <div className="text-[11px] text-[#AAAAAA]">
                        Quando ativo, qualifica leads e responde no multiatendimento automaticamente
                      </div>
                    </div>
                    <Switch checked={selected.active} onCheckedChange={toggleActive} />
                  </div>

                  {!hasAnthropicKey && (
                    <div className="flex items-start gap-2.5 p-4 bg-[#FEE2E2] rounded-lg">
                      <AlertTriangle size={16} className="text-[#991B1B] mt-0.5 shrink-0" />
                      <div className="text-[13px] text-[#991B1B]">
                        Sem chave da Anthropic cadastrada — o agente não pode ser ativado até você cadastrar uma em Configurações.
                      </div>
                    </div>
                  )}
                  {hasAnthropicKey && !hasOpenaiKey && (
                    <div className="flex items-start gap-2.5 p-4 bg-[#FEF3C7] rounded-lg">
                      <AlertTriangle size={16} className="text-[#92400E] mt-0.5 shrink-0" />
                      <div className="text-[13px] text-[#92400E]">
                        Sem chave da OpenAI — o agente funciona normalmente, mas upload de documentos na Base de Conhecimento não vai funcionar até você cadastrar uma.
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-[12px] text-[#666]">Objetivo (fixo)</Label>
                    <p className="text-[13px] text-[#111111] mt-1 p-3 bg-[#F5F5F5] rounded-lg">
                      Qualificar o lead e agendar reunião com o time de closers. Não editável — é a metodologia do agente SDS.
                    </p>
                  </div>
                </TabsContent>

                {/* BASE DE CONHECIMENTO */}
                <TabsContent value="kb" className="p-6 space-y-6 mt-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Materiais de treinamento</h3>
                    <p className="text-[12px] text-[#AAAAAA]">
                      Documentos da empresa, produtos e objeções que o agente vai usar para responder com precisão
                    </p>
                  </div>

                  <label className="block border-2 border-dashed border-[#CCCCCC] rounded-xl p-8 text-center hover:border-[#128A68] hover:bg-[#E1F5EE]/30 transition-colors cursor-pointer">
                    <input
                      type="file"
                      accept=".txt,.pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                        e.target.value = "";
                      }}
                    />
                    {uploading ? (
                      <Loader2 size={32} className="mx-auto text-[#AAAAAA] animate-spin" />
                    ) : (
                      <Upload size={32} className="mx-auto text-[#AAAAAA]" />
                    )}
                    <p className="text-[13px] text-[#111111] font-medium mt-2">
                      {uploading ? "Enviando..." : "Clique para selecionar um arquivo"}
                    </p>
                    <p className="text-[11px] text-[#AAAAAA] mt-1">TXT ou PDF — máx 10MB</p>
                  </label>

                  <div className="space-y-2">
                    {docs.map((d) => {
                      const badge = STATUS_BADGE[d.status];
                      return (
                        <div key={d.id} className="group flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg hover:bg-[#F5F5F5] transition-colors">
                          <FileText size={18} color="#AAAAAA" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[#111111] truncate">{d.file_name}</div>
                            {d.status === "error" && d.error_detail && (
                              <div className="text-[11px] text-[#E24B4A] truncate">{d.error_detail}</div>
                            )}
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0" style={{ background: badge.bg, color: badge.fg }}>
                            {badge.label}
                          </span>
                          <button onClick={() => deleteDoc(d)} className="opacity-0 group-hover:opacity-100 text-[#AAAAAA] hover:text-[#E24B4A] transition-opacity">
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                    {docs.length === 0 && (
                      <p className="text-[12px] text-[#AAAAAA] text-center py-6">Nenhum documento enviado ainda</p>
                    )}
                  </div>
                </TabsContent>

                {/* COMPORTAMENTO */}
                <TabsContent value="comportamento" className="p-6 space-y-6 mt-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Contexto adicional</h3>
                    <p className="text-[12px] text-[#AAAAAA]">
                      Tom de voz e informações específicas do seu negócio — soma com a metodologia do agente, não a substitui
                    </p>
                  </div>
                  <div>
                    <Textarea
                      value={customContext}
                      onChange={(e) => setCustomContext(e.target.value.slice(0, 2000))}
                      placeholder="Ex: Use um tom direto e informal. Nossos clientes costumam perguntar sobre X — sempre responda que..."
                      className="min-h-[200px] text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <div className="text-right text-[11px] text-[#AAAAAA] mt-1">{customContext.length} / 2000</div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveCustomContext} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                      Salvar
                    </Button>
                  </div>
                </TabsContent>

                {/* CLOSERS */}
                <TabsContent value="closers" className="p-6 space-y-4 mt-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Quem recebe as reuniões agendadas</h3>
                    <p className="text-[12px] text-[#AAAAAA]">
                      Só quem tem Google Calendar conectado pode ser selecionado. O agente distribui pelo closer com menos reuniões na semana.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {members.map((m) => (
                      <label key={m.user_id} className="flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg cursor-pointer">
                        <Checkbox
                          checked={closerIds.includes(m.user_id)}
                          onCheckedChange={(checked) => toggleCloser(m.user_id, checked === true)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-[#111111]">{m.full_name || m.email}</div>
                          <div className="text-[11px] text-[#AAAAAA]">{m.email}</div>
                        </div>
                      </label>
                    ))}
                    {members.length === 0 && (
                      <p className="text-[12px] text-[#AAAAAA] text-center py-6">Nenhum membro na equipe ainda</p>
                    )}
                  </div>
                </TabsContent>

                {/* PERFORMANCE */}
                <TabsContent value="performance" className="p-6 mt-0">
                  <PerformanceTab agentId={selected.id} companyId={companyId ?? ""} closerIds={closerIds} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Criar novo agente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[12px]">Nome</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Ex: Agente SDS"
                className="mt-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
            </div>
            <div>
              <Label className="text-[12px]">Tipo</Label>
              <Select value={draftType} onValueChange={(v) => setDraftType(v as AgentType)}>
                <SelectTrigger className="mt-1 focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={createAgent} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PerformanceTab({ agentId, companyId, closerIds }: { agentId: string; companyId: string; closerIds: string[] }) {
  const [loading, setLoading] = useState(true);
  const [meetingsCount, setMeetingsCount] = useState(0);
  const [qualified, setQualified] = useState(0);
  const [notQualified, setNotQualified] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ count: meetings }, { data: leadsData }] = await Promise.all([
        closerIds.length
          ? supabase.from("activities").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("type", "meeting").in("owner_id", closerIds).gte("scheduled_at", sevenDaysAgo)
          : Promise.resolve({ count: 0 }),
        supabase.from("leads").select("tags").eq("company_id", companyId).contains("tags", ["SDS: Qualificado"]),
      ]);
      setMeetingsCount(meetings ?? 0);
      setQualified((leadsData ?? []).length);
      const { data: notQualifiedData } = await supabase.from("leads").select("tags").eq("company_id", companyId).contains("tags", ["SDS: Não qualificado"]);
      setNotQualified((notQualifiedData ?? []).length);
      setLoading(false);
    })();
  }, [agentId, companyId, closerIds]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-[#AAAAAA]" /></div>;
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
        <div className="flex items-center gap-1.5 text-[11px] uppercase text-[#AAAAAA]"><CheckCircle2 size={12} /> Reuniões (7 dias)</div>
        <div className="text-[24px] font-bold text-[#111111] mt-1">{meetingsCount}</div>
      </div>
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
        <div className="text-[11px] uppercase text-[#AAAAAA]">Leads qualificados</div>
        <div className="text-[24px] font-bold text-[#128A68] mt-1">{qualified}</div>
      </div>
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
        <div className="text-[11px] uppercase text-[#AAAAAA]">Não qualificados</div>
        <div className="text-[24px] font-bold text-[#AAAAAA] mt-1">{notQualified}</div>
      </div>
    </div>
  );
}
