import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bot,
  Plus,
  FileText,
  X,
  Circle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Zap,
  Brain,
  Rocket,
  Target,
  Headphones,
  MessageSquare,
  BookOpen,
  Info,
  Lock,
  Settings2,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IA_MODELS, IA_COST_LABELS, IA_COST_STYLES } from "@/lib/ai-models";
import { AGENT_TOOLS, AGENT_TOOL_ENTITIES, AGENT_TOOL_CATEGORY_LABELS, AGENT_TOOL_CATEGORY_STYLES } from "@/lib/agent-tools";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useNavigate, useParams } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { useCRM } from "@/context/CRMContext";

// Objetivo final do agente — múltipla escolha. Substitui o antigo seletor de
// "Tipo": o que o agente faz é definido por isso + pelas ferramentas
// habilitadas, não por um tipo fixo único.
const AGENT_OBJECTIVES = [
  { id: "qualificar",  label: "Qualificar",       description: "Avalia se o lead é um bom encaixe (ICP) e registra o resultado da qualificação." },
  { id: "agendar",     label: "Agendar Reunião",  description: "Marca reunião com um vendedor disponível quando o lead está pronto." },
  { id: "atendimento", label: "Atendimento",      description: "Tira dúvidas e explica sobre a empresa usando a Base de Conhecimento." },
] as const;

// Passo a passo de criação -- o modal de "Novo agente" só pede
// nome/descrição/ícone; objetivo (e o resto do Perfil) é escolhido aqui,
// como 1º passo do wizard de verdade. "closers" só entra se o objetivo
// "Agendar Reunião" foi marcado -- não faz sentido pedir vendedor pra um
// agente que não agenda.
const WIZARD_STEPS: { v: string; l: string }[] = [
  { v: "perfil", l: "Perfil" },
  { v: "kb", l: "Base de Conhecimento" },
  { v: "instrucoes", l: "Instruções" },
  { v: "comportamento", l: "Comportamento" },
  { v: "closers", l: "Vendedores" },
  { v: "integracoes", l: "Integrações" },
  { v: "configuracoes", l: "Configurações" },
  { v: "ferramentas", l: "Ferramentas" },
  { v: "modelos", l: "Modelo" },
];

// Ícones ilustrativos pra atrelar ao agente na criação — meramente visual,
// não afeta comportamento. Chave é salva em agents.avatar.
const AGENT_AVATARS: Record<string, typeof Bot> = {
  bot: Bot,
  sparkles: Sparkles,
  zap: Zap,
  brain: Brain,
  rocket: Rocket,
  target: Target,
  headphones: Headphones,
  message: MessageSquare,
};
const DEFAULT_AVATAR = "bot";
function AgentAvatarIcon({ avatar, size = 18 }: { avatar: string | null; size?: number }) {
  const Icon = AGENT_AVATARS[avatar ?? ""] ?? Bot;
  return <Icon size={size} />;
}

type BehaviorConfig = {
  finalizar_conversa?: boolean;
  transferir_responsavel?: boolean;
  estilo_comunicacao?: "normal" | "formal" | "descontraida";
  usar_emojis?: boolean;
  assinar_nome?: boolean;
  dividir_mensagens?: boolean;
  dividir_mensagens_palavras?: number;
  followup_ativo?: boolean;
  followup_max_tentativas?: number;
  followup_intervalo_valor?: number;
  followup_intervalo_unidade?: "minutos" | "horas";
  followup_transferir_automacao?: boolean;
  followup_automacao_id?: string | null;
  // Aba Configurações
  delay_resposta_minutos?: number;
  mensagens_consideradas?: number;
  limite_interacoes?: number;
  saudacao_automatica?: boolean;
  restringir_topicos?: boolean;
  topicos_permitidos?: string;
  topicos_restritos?: string;
  // ids de custom_field_items (grupo "Qualificação") que o agente deve
  // mapear e preencher no card do lead.
  campos_qualificacao?: string[];
  // Instruções específicas por objetivo (chave = id do objetivo, ex.
  // "qualificar"/"agendar"/"atendimento") -- somam ao prompt fixo daquele
  // objetivo, sem se misturar com o contexto geral da aba Instruções.
  objective_instructions?: Record<string, string>;
  // Aba Closers -- configurações globais de agendamento (não por closer).
  fuso_horario?: string;
  duracao_reuniao_minutos?: number;
  intervalo_entre_reunioes?: boolean;
  intervalo_minutos?: number;
  incluir_google_meet?: boolean;
  confirmar_antes_criar_evento?: boolean;
};

const BEHAVIOR_DEFAULTS: Required<Omit<BehaviorConfig, "campos_qualificacao" | "objective_instructions">> = {
  finalizar_conversa: false,
  transferir_responsavel: false,
  estilo_comunicacao: "normal",
  usar_emojis: false,
  assinar_nome: false,
  dividir_mensagens: false,
  dividir_mensagens_palavras: 80,
  followup_ativo: false,
  followup_max_tentativas: 3,
  followup_intervalo_valor: 30,
  followup_intervalo_unidade: "minutos",
  followup_transferir_automacao: false,
  followup_automacao_id: null,
  delay_resposta_minutos: 0,
  mensagens_consideradas: 30,
  limite_interacoes: 0,
  saudacao_automatica: false,
  restringir_topicos: false,
  topicos_permitidos: "",
  topicos_restritos: "",
  fuso_horario: "America/Sao_Paulo",
  duracao_reuniao_minutos: 60,
  intervalo_entre_reunioes: false,
  intervalo_minutos: 15,
  incluir_google_meet: true,
  confirmar_antes_criar_evento: false,
};

const AGENT_TIMEZONES = [
  { value: "America/Noronha", label: "Fernando de Noronha (UTC-2)" },
  { value: "America/Sao_Paulo", label: "Brasília (UTC-3)" },
  { value: "America/Manaus", label: "Manaus (UTC-4)" },
  { value: "America/Rio_Branco", label: "Acre (UTC-5)" },
];

// Recomendação de modelo (passo "Modelo" do wizard de criação e aba
// Modelos) -- regras simples baseadas nas escolhas já feitas nos passos
// anteriores, não é IA nem aprendizado de máquina.
function recommendModel(objectives: string[], enabledToolsCount: number): { modelId: string; reason: string } {
  if (objectives.includes("atendimento")) {
    return { modelId: "claude-sonnet-5", reason: "Atendimento com Base de Conhecimento pede mais raciocínio contextual pra responder com precisão." };
  }
  if (objectives.length === 1 && objectives.includes("qualificar") && enabledToolsCount < 5) {
    return { modelId: "claude-haiku-4-5-20251001", reason: "Fluxo simples de qualificação -- um modelo mais rápido e barato já é suficiente." };
  }
  return { modelId: "claude-sonnet-5", reason: "Equilíbrio entre inteligência e custo pra conversas de WhatsApp em tempo real." };
}

function findModelLabel(modelId: string): string {
  for (const list of Object.values(IA_MODELS)) {
    const found = list.find((m) => m.id === modelId);
    if (found) return found.label;
  }
  return modelId;
}

type Agent = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  avatar: string | null;
  active: boolean;
  model: string;
  custom_context: string | null;
  objectives: string[];
  enabled_tools: string[];
  behavior_config: BehaviorConfig;
  activated_at: string | null;
  active_seconds_total: number;
  // true enquanto o agente está sendo criado pelo wizard e ainda não foi
  // finalizado ("Criar" no último passo) -- fica invisível na grade de
  // /agentes até virar false. Ver finalizeAgent()/abandonDraftAgent().
  draft: boolean;
};

type AutomationOption = { id: string; name: string };

type KnowledgeDoc = {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "ready" | "error";
  error_detail: string | null;
  created_at: string;
  enabled: boolean;
  knowledge_base_id: string;
};

type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
};

type Member = { user_id: string; full_name: string; email: string; avatar_url: string | null };

type WhatsappConnectionOption = { id: string; name: string; phone: string | null; provider: string; connected: boolean };
type MetaConnectionOption = { id: string; provider: string; page_name: string | null; instagram_username: string | null; active: boolean };
type WebhookIntegrationOption = { id: string; name: string; type: string; active: boolean };

// Mesmo shape de WorkDay/WorkInterval do WorkSchedulesManager (usado em
// Configurações > Horários de trabalho) -- aqui é uma disponibilidade à
// parte, escopada por (agente, closer), não um template nomeado da empresa.
type WorkInterval = { start: string; end: string };
type WorkDay = { day: string; active: boolean; intervals: WorkInterval[] };
const CLOSER_AVAILABILITY_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const defaultCloserAvailability = (): WorkDay[] =>
  CLOSER_AVAILABILITY_DAYS.map((day) => ({ day, active: false, intervals: [{ start: "08:00", end: "18:00" }] }));

// DOCX fica de fora por enquanto — agent-kb-ingest ainda não tem extração
// pra esse formato (sem biblioteca confirmada compatível com Deno).
const SUPPORTED_KB_EXTENSIONS = ["pdf", "txt", "csv", "html", "htm", "json"];

const STATUS_BADGE: Record<KnowledgeDoc["status"], { bg: string; fg: string; label: string }> = {
  pending: { bg: "#F5F5F5", fg: "#666666", label: "Pendente" },
  processing: { bg: "#FEF3C7", fg: "#92400E", label: "Processando" },
  ready: { bg: "#E1F5EE", fg: "#128A68", label: "Pronto" },
  error: { bg: "#FEE2E2", fg: "#991B1B", label: "Erro" },
};

export default function AgentesPage() {
  const { company } = useCompany();
  const { user } = useAuth();
  const { customFieldGroups } = useCRM();
  const navigate = useNavigate();
  const { id: urlId } = useParams<{ id: string }>();
  const companyId = company?.id;

  // "/agentes" (grade de cards) vs "/agentes/:id" (tela cheia) -- mesmo
  // componente, mesmo padrão já usado em AutomacoesPage.tsx: a URL só
  // acompanha via replaceState (não navegação real do router, evita
  // remount), e um efeito com deepLinkHandledRef abre direto no detail
  // quando a página carrega já em /agentes/:id.
  const [view, setView] = useState<"grid" | "detail">("grid");

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [closerIds, setCloserIds] = useState<string[]>([]);
  const [memberCalendarConnected, setMemberCalendarConnected] = useState<Record<string, boolean>>({});
  const [memberCalendarEmail, setMemberCalendarEmail] = useState<Record<string, string>>({});
  const [closerAvailability, setCloserAvailability] = useState<Record<string, WorkDay[]>>({});
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [kbSearch, setKbSearch] = useState("");
  const [kbModalOpen, setKbModalOpen] = useState(false);
  const [kbModalStep, setKbModalStep] = useState<"config" | "arquivos">("config");
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [kbDraftName, setKbDraftName] = useState("");
  const [kbDraftDescription, setKbDraftDescription] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [objectiveInstructionsDraft, setObjectiveInstructionsDraft] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAvatar, setDraftAvatar] = useState(DEFAULT_AVATAR);
  const [freeTab, setFreeTab] = useState("perfil");
  const [wizardMode, setWizardMode] = useState(false);
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardMaxStepReached, setWizardMaxStepReached] = useState(0);
  // Feedback de carregamento nos botões "Salvar" -- chave identifica qual
  // save está em andamento, pra não deixar o usuário sem retorno visual
  // nem clicar duas vezes achando que não funcionou.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [followupDraft, setFollowupDraft] = useState(BEHAVIOR_DEFAULTS);
  const [configDraft, setConfigDraft] = useState(BEHAVIOR_DEFAULTS);
  const [schedulingDraft, setSchedulingDraft] = useState(BEHAVIOR_DEFAULTS);
  const [manualAutomations, setManualAutomations] = useState<AutomationOption[]>([]);
  // Etapa "Integrações" -- listas de conexões existentes na empresa (não
  // dependem do agente selecionado) + quais delas este agente usa.
  const [whatsappConnections, setWhatsappConnections] = useState<WhatsappConnectionOption[]>([]);
  const [metaConnections, setMetaConnections] = useState<MetaConnectionOption[]>([]);
  const [webhookIntegrations, setWebhookIntegrations] = useState<WebhookIntegrationOption[]>([]);
  const [agentWhatsappIds, setAgentWhatsappIds] = useState<string[]>([]);
  const [agentMetaIds, setAgentMetaIds] = useState<string[]>([]);
  const [agentWebhookIds, setAgentWebhookIds] = useState<string[]>([]);
  // Calendar não é uma lista de conexões da empresa -- vem dos vendedores
  // com Google Calendar conectado, escolhidos na etapa "Vendedores".
  const [agentCalendarEnabled, setAgentCalendarEnabled] = useState<Record<string, boolean>>({});

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const loadAgents = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: agentsData }, { data: anthropicKey }, { data: openaiKey }, { data: membersData }, { data: automationsData }, { data: whatsappData }, { data: metaData }, { data: webhookData }] =
      await Promise.all([
        supabase.from("agents").select("id, type, name, description, avatar, active, model, custom_context, objectives, enabled_tools, behavior_config, activated_at, active_seconds_total, draft").eq("company_id", companyId).order("created_at"),
        supabase.from("ai_provider_keys").select("id").eq("company_id", companyId).eq("provider", "anthropic").eq("active", true).maybeSingle(),
        supabase.from("ai_provider_keys").select("id").eq("company_id", companyId).eq("provider", "openai").eq("active", true).maybeSingle(),
        supabase.rpc("get_company_members", { p_company_id: companyId }),
        supabase.from("automations").select("id, name, flow").eq("company_id", companyId).eq("active", true),
        supabase.from("whatsapp_connections").select("id, name, phone, provider, connected").eq("company_id", companyId).order("created_at"),
        supabase.from("meta_connections").select("id, provider, page_name, instagram_username, active").eq("company_id", companyId).order("created_at"),
        supabase.from("webhook_integrations").select("id, name, type, active").eq("company_id", companyId).order("created_at"),
      ]);
    setAgents(agentsData ?? []);
    setHasAnthropicKey(!!anthropicKey);
    setHasOpenaiKey(!!openaiKey);
    setWhatsappConnections((whatsappData ?? []) as WhatsappConnectionOption[]);
    setMetaConnections((metaData ?? []) as MetaConnectionOption[]);
    setWebhookIntegrations((webhookData ?? []) as WebhookIntegrationOption[]);
    // get_company_members devolve a coluna "id" (profiles.id == auth.users.id),
    // não "user_id" -- sem esse mapeamento, m.user_id fica undefined em todo
    // lugar que usa `members` (checkbox de Closers nunca reflete o estado
    // real, e tentar marcar sempre falha com violação de NOT NULL).
    setMembers(
      ((membersData ?? []) as { id: string; full_name: string; email: string; avatar_url: string | null }[]).map((m) => ({
        user_id: m.id,
        full_name: m.full_name,
        email: m.email,
        avatar_url: m.avatar_url,
      })),
    );
    // Só automações com gatilho "lead_manual" podem ser acionadas sob
    // demanda (mesma restrição que o botão "Automação" do Multiatendimento
    // já segue — automation-runner exige trigger.triggerId === trigger_type).
    setManualAutomations(
      ((automationsData ?? []) as { id: string; name: string; flow: { trigger?: { triggerId?: string } } }[])
        .filter((a) => a.flow?.trigger?.triggerId === "lead_manual")
        .map((a) => ({ id: a.id, name: a.name })),
    );
    setSelectedId((prev) => prev ?? (agentsData?.[0]?.id ?? null));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  // Sincroniza a URL com o estado da view (replaceState, não navegação real
  // -- evita remount do componente). Clone do padrão de AutomacoesPage.tsx.
  useEffect(() => {
    if (view === "detail" && selectedId) {
      window.history.replaceState(null, "", `/agentes/${selectedId}`);
    } else if (view === "grid") {
      window.history.replaceState(null, "", "/agentes");
    }
  }, [view, selectedId]);

  // Deep-link: abre direto no detail quando a página carrega em /agentes/:id.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (!urlId || deepLinkHandledRef.current || agents.length === 0) return;
    deepLinkHandledRef.current = true;
    if (agents.some((a) => a.id === urlId)) {
      setSelectedId(urlId);
      setView("detail");
    }
  }, [urlId, agents]);

  // Rede de segurança pra quando o usuário sai sem clicar em "Cancelar"
  // (navega pra outra página do app, fecha a aba) -- refs porque o cleanup
  // só deve rodar no unmount de verdade, não em toda mudança de view/agent.
  const viewRef = useRef(view);
  const selectedRef = useRef(selected);
  useEffect(() => { viewRef.current = view; selectedRef.current = selected; }, [view, selected]);
  useEffect(() => {
    return () => {
      const s = selectedRef.current;
      if (viewRef.current === "detail" && s?.draft) {
        void supabase.from("agents").delete().eq("id", s.id);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedId || !companyId) return;
    setCustomContext(selected?.custom_context ?? "");
    setObjectiveInstructionsDraft(selected?.behavior_config.objective_instructions ?? {});
    setFollowupDraft({ ...BEHAVIOR_DEFAULTS, ...(selected?.behavior_config ?? {}) });
    setConfigDraft({ ...BEHAVIOR_DEFAULTS, ...(selected?.behavior_config ?? {}) });
    setSchedulingDraft({ ...BEHAVIOR_DEFAULTS, ...(selected?.behavior_config ?? {}) });
    setDocSearch("");
    setKbSearch("");
    (async () => {
      const [{ data: closersData }, { data: docsData }, { data: kbsData }, { data: waLinks }, { data: metaLinks }, { data: webhookLinks }, { data: calLinks }] = await Promise.all([
        supabase.from("agent_closers").select("user_id").eq("agent_id", selectedId).eq("company_id", companyId),
        supabase.from("agent_knowledge_documents").select("id, file_name, status, error_detail, created_at, enabled, knowledge_base_id").eq("agent_id", selectedId).eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("agent_knowledge_bases").select("id, name, description, enabled").eq("agent_id", selectedId).eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("agent_whatsapp_connections").select("connection_id").eq("agent_id", selectedId).eq("company_id", companyId).eq("enabled", true),
        supabase.from("agent_meta_connections").select("connection_id").eq("agent_id", selectedId).eq("company_id", companyId).eq("enabled", true),
        supabase.from("agent_webhook_integrations").select("connection_id").eq("agent_id", selectedId).eq("company_id", companyId).eq("enabled", true),
        supabase.from("agent_calendar_connections").select("user_id, enabled").eq("agent_id", selectedId).eq("company_id", companyId),
      ]);
      setCloserIds((closersData ?? []).map((c) => c.user_id as string));
      setMemberCalendarConnected({});
      setCloserAvailability({});
      setDocs((docsData ?? []) as KnowledgeDoc[]);
      setKbs((kbsData ?? []) as KnowledgeBase[]);
      setAgentWhatsappIds((waLinks ?? []).map((r) => r.connection_id as string));
      setAgentMetaIds((metaLinks ?? []).map((r) => r.connection_id as string));
      setAgentWebhookIds((webhookLinks ?? []).map((r) => r.connection_id as string));
      setAgentCalendarEnabled(
        Object.fromEntries(((calLinks ?? []) as { user_id: string; enabled: boolean }[]).map((r) => [r.user_id, r.enabled])),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, companyId]);

  // Status de conexão do Google Calendar (de TODO usuário da empresa, não só
  // closers -- usado tanto no badge "Conectado" da aba Vendedores quanto na
  // lista de Integrações > Calendar) + disponibilidade dos closers.
  useEffect(() => {
    if (!selectedId || !companyId) return;
    const allMemberIds = members.map((m) => m.user_id);
    const pending = allMemberIds.filter((id) => !(id in memberCalendarConnected));
    if (!pending.length) return;
    (async () => {
      const [{ data: statusData }, { data: availData }] = await Promise.all([
        supabase.functions.invoke("agent-closer-status", { body: { company_id: companyId, user_ids: pending } }),
        supabase.from("agent_closer_availability").select("user_id, days").eq("agent_id", selectedId).in("user_id", pending),
      ]);
      const connectedIds = new Set((statusData?.connected ?? []) as string[]);
      setMemberCalendarConnected((prev) => {
        const next = { ...prev };
        for (const id of pending) next[id] = connectedIds.has(id);
        return next;
      });
      const emailsByUser = (statusData?.emails ?? {}) as Record<string, string>;
      setMemberCalendarEmail((prev) => ({ ...prev, ...emailsByUser }));
      const availByUser = new Map(((availData ?? []) as { user_id: string; days: WorkDay[] }[]).map((r) => [r.user_id, r.days]));
      setCloserAvailability((prev) => {
        const next = { ...prev };
        for (const id of pending) next[id] = availByUser.get(id) ?? defaultCloserAvailability();
        return next;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, selectedId, companyId]);

  // Etapa "Integrações" > Calendar: pré-seleciona (enabled=true) o Google
  // Calendar de todo usuário da empresa que estiver conectado -- só grava a
  // linha quando ainda não existe, pra não sobrescrever um "desativei esse
  // calendar" que o usuário já salvou.
  useEffect(() => {
    if (!selectedId || !companyId) return;
    const connectedMemberIds = members.map((m) => m.user_id).filter((id) => memberCalendarConnected[id]);
    const missing = connectedMemberIds.filter((id) => !(id in agentCalendarEnabled));
    if (!missing.length) return;
    (async () => {
      const rows = missing.map((user_id) => ({ agent_id: selectedId, company_id: companyId, user_id, enabled: true }));
      const { error } = await supabase.from("agent_calendar_connections").upsert(rows, { onConflict: "agent_id,user_id", ignoreDuplicates: true });
      if (error) return;
      setAgentCalendarEnabled((prev) => {
        const next = { ...prev };
        for (const id of missing) next[id] = true;
        return next;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, memberCalendarConnected, selectedId, companyId, agentCalendarEnabled]);

  async function createAgent() {
    if (!companyId || !user?.id) return;
    if (!draftName.trim()) { toast.error("Informe o nome do agente"); return; }
    // Tipo não é mais escolhido na criação — só "SDS" existe hoje, e a troca
    // (quando houver mais tipos) acontece na aba "Tipos" do agente já criado.
    const { data, error } = await supabase
      .from("agents")
      .insert({
        company_id: companyId,
        owner_id: user.id,
        type: "SDS",
        name: draftName.trim(),
        description: draftDescription.trim() || null,
        avatar: draftAvatar,
        active: false,
        draft: true,
      })
      .select("id, type, name, description, avatar, active, model, custom_context, objectives, enabled_tools, behavior_config, activated_at, active_seconds_total, draft")
      .single();
    if (error || !data) { toast.error("Erro ao criar agente"); return; }
    setAgents((prev) => [...prev, data]);
    setSelectedId(data.id);
    setOpenDialog(false);
    setDraftName("");
    setDraftDescription("");
    setDraftAvatar(DEFAULT_AVATAR);
    // Objetivo (e o resto do Perfil) não é pedido aqui -- é o 1º passo do
    // próprio wizard. O agente só fica visível na grade quando o wizard é
    // concluído (finalizeAgent) -- até lá, draft=true.
    setView("detail");
    setWizardMode(true);
    setWizardStepIndex(0);
    setWizardMaxStepReached(0);
  }

  // Último passo do wizard ("Criar") -- publica o agente na grade.
  async function finalizeAgent() {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ draft: false }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao criar agente"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, draft: false } : a)));
    toast.success("Agente criado");
    setWizardMode(false);
    setView("grid");
    setSelectedId(null);
  }

  // "Cancelar" durante o wizard de criação -- descarta o rascunho. Cascata
  // já cobre agent_closers/agent_knowledge_bases/agent_usage_log etc. (on
  // delete cascade das migrações anteriores).
  async function abandonDraftAgent() {
    if (!selected || !companyId) return;
    if (!window.confirm("Sair sem salvar? O agente criado até aqui será descartado.")) return;
    const { error } = await supabase.from("agents").delete().eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao descartar"); return; }
    setAgents((prev) => prev.filter((a) => a.id !== selected.id));
    setWizardMode(false);
    setView("grid");
    setSelectedId(null);
  }

  async function toggleObjective(objectiveId: string, checked: boolean) {
    if (!selected || !companyId) return;
    const next = checked
      ? [...selected.objectives, objectiveId]
      : selected.objectives.filter((o) => o !== objectiveId);
    const { error } = await supabase.from("agents").update({ objectives: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar objetivo"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, objectives: next } : a)));
    // Sem "Agendar Reunião", a aba Vendedores some -- se o usuário estava
    // nela quando desmarcou o objetivo, cai pro Perfil em vez de ficar numa
    // aba que não existe mais na lista.
    if (objectiveId === "agendar" && !checked && freeTab === "closers") {
      setFreeTab("perfil");
    }
  }

  async function saveObjectiveInstruction(objectiveId: string) {
    if (!selected || !companyId) return;
    const text = objectiveInstructionsDraft[objectiveId] ?? "";
    const current = selected.behavior_config.objective_instructions ?? {};
    if ((current[objectiveId] ?? "") === text) return;
    const nextInstructions = { ...current, [objectiveId]: text };
    const nextConfig = { ...selected.behavior_config, objective_instructions: nextInstructions };
    const { error } = await supabase.from("agents").update({ behavior_config: nextConfig }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, behavior_config: nextConfig } : a)));
  }

  async function toggleQualField(fieldId: string, checked: boolean) {
    if (!selected || !companyId) return;
    const current = selected.behavior_config.campos_qualificacao ?? [];
    const next = checked ? [...current, fieldId] : current.filter((id) => id !== fieldId);
    const nextConfig = { ...selected.behavior_config, campos_qualificacao: next };
    const { error } = await supabase.from("agents").update({ behavior_config: nextConfig }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, behavior_config: nextConfig } : a)));
  }

  async function toggleTool(toolId: string, checked: boolean) {
    if (!selected || !companyId) return;
    const next = checked
      ? [...selected.enabled_tools, toolId]
      : selected.enabled_tools.filter((t) => t !== toolId);
    const { error } = await supabase.from("agents").update({ enabled_tools: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar ferramenta"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, enabled_tools: next } : a)));
  }

  // Avança o wizard e "destrava" o próximo número no stepper -- é essa
  // função (não um setWizardStepIndex direto) que marca um passo como
  // finalizado, tanto ao clicar Avançar quanto Pular.
  function advanceWizard(stepsLength: number) {
    setWizardStepIndex((i) => {
      const next = Math.min(i + 1, stepsLength - 1);
      setWizardMaxStepReached((m) => Math.max(m, next));
      return next;
    });
  }

  async function changeAgentModel(next: string) {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ model: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar modelo"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, model: next } : a)));
    toast.success("Modelo atualizado");
  }

  // Recebe o agente explicitamente (não só `selected`) pra poder ser chamado
  // tanto do card na grade quanto de dentro da tela de edição.
  async function toggleActive(agent: Agent, next: boolean) {
    if (!companyId) return;
    if (next && !hasAnthropicKey) {
      toast.error("Cadastre sua chave da Anthropic em Configurações antes de ativar o agente.");
      return;
    }
    if (next && !hasOpenaiKey) {
      toast.error("Cadastre sua chave da OpenAI em Configurações antes de ativar o agente.");
      return;
    }
    if (next && agent.objectives.length === 0) {
      toast.error("Marque pelo menos 1 objetivo na aba Perfil antes de ativar o agente.");
      return;
    }
    // "Horas ativas" (aba Performance) = tempo de relógio com o toggle
    // ligado -- ao desligar, acumula o intervalo em active_seconds_total; ao
    // ligar, marca o início de uma nova janela em activated_at.
    const patch: { active: boolean; activated_at?: string | null; active_seconds_total?: number } = { active: next };
    if (next) {
      patch.activated_at = new Date().toISOString();
    } else if (agent.activated_at) {
      const elapsed = Math.floor((Date.now() - new Date(agent.activated_at).getTime()) / 1000);
      patch.active_seconds_total = agent.active_seconds_total + Math.max(0, elapsed);
      patch.activated_at = null;
    }
    const { error } = await supabase.from("agents").update(patch).eq("id", agent.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, ...patch } : a)));
    toast.success(next ? "Agente ativado" : "Agente desativado");
  }

  async function saveCustomContext(opts?: { silent?: boolean }) {
    if (!selected || !companyId) return;
    if (!opts?.silent) setSavingKey("instrucoes");
    const { error } = await supabase.from("agents").update({ custom_context: customContext }).eq("id", selected.id).eq("company_id", companyId);
    if (!opts?.silent) setSavingKey(null);
    if (error) { if (!opts?.silent) toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, custom_context: customContext } : a)));
    if (!opts?.silent) toast.success("Contexto salvo");
  }

  // Toggles/selects de comportamento salvam na hora — só o bloco de
  // follow-up (vários campos juntos) usa botão "Salvar" separado, pra não
  // disparar um update a cada dígito digitado.
  async function updateBehaviorConfig(patch: Partial<BehaviorConfig>) {
    if (!selected || !companyId) return;
    const next = { ...selected.behavior_config, ...patch };
    const { error } = await supabase.from("agents").update({ behavior_config: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, behavior_config: next } : a)));
    // Mantém os 3 drafts em sincronia com toggles que salvam na hora --
    // senão o comparador de "algo mudou?" do botão "Atualizar agente"
    // acusaria mudança pendente por causa de um campo que já foi salvo.
    setFollowupDraft((d) => ({ ...d, ...patch }));
    setConfigDraft((d) => ({ ...d, ...patch }));
    setSchedulingDraft((d) => ({ ...d, ...patch }));
  }

  async function saveFollowupConfig(opts?: { silent?: boolean }) {
    if (!selected || !companyId) return;
    if (!opts?.silent) setSavingKey("followup");
    const next = { ...selected.behavior_config, ...followupDraft };
    const { error } = await supabase.from("agents").update({ behavior_config: next }).eq("id", selected.id).eq("company_id", companyId);
    if (!opts?.silent) setSavingKey(null);
    if (error) { if (!opts?.silent) toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, behavior_config: next } : a)));
    if (!opts?.silent) toast.success("Follow-up salvo");
  }

  async function saveConfigDraft(opts?: { silent?: boolean }) {
    if (!selected || !companyId) return;
    if (!opts?.silent) setSavingKey("configuracoes");
    const next = { ...selected.behavior_config, ...configDraft };
    const { error } = await supabase.from("agents").update({ behavior_config: next }).eq("id", selected.id).eq("company_id", companyId);
    if (!opts?.silent) setSavingKey(null);
    if (error) { if (!opts?.silent) toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, behavior_config: next } : a)));
    if (!opts?.silent) toast.success("Configurações salvas");
  }

  async function saveSchedulingConfig(opts?: { silent?: boolean }) {
    if (!selected || !companyId) return;
    if (!opts?.silent) setSavingKey("agendamento");
    const next = { ...selected.behavior_config, ...schedulingDraft };
    const { error } = await supabase.from("agents").update({ behavior_config: next }).eq("id", selected.id).eq("company_id", companyId);
    if (!opts?.silent) setSavingKey(null);
    if (error) { if (!opts?.silent) toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, behavior_config: next } : a)));
    if (!opts?.silent) toast.success("Configurações de agendamento salvas");
  }

  // Botão "Atualizar agente" (fora do wizard) -- flush de todos os campos
  // que usam draft local + botão "Salvar" próprio (Follow-up, Configurações,
  // Agendamento, Instruções). O resto (toggles, selects, checkboxes) já
  // salva na hora sozinho -- isso é uma rede de segurança pra quem edita
  // um desses blocos e troca de aba sem clicar no "Salvar" específico dele.
  async function updateAgent() {
    if (!selected || !companyId) return;
    setSavingKey("agente");
    await Promise.all([
      saveFollowupConfig({ silent: true }),
      saveConfigDraft({ silent: true }),
      saveSchedulingConfig({ silent: true }),
      saveCustomContext({ silent: true }),
    ]);
    setSavingKey(null);
    toast.success("Agente atualizado");
  }

  // Botão "Atualizar agente" só habilita se algo nos blocos de draft
  // (Follow-up, Configurações, Agendamento, Instruções) realmente diverge
  // do que está salvo -- compara contra a mesma baseline usada pra
  // inicializar os drafts (behavior_config + defaults).
  const behaviorBaseline = { ...BEHAVIOR_DEFAULTS, ...(selected?.behavior_config ?? {}) };
  const isAgentDirty = !!selected && (
    JSON.stringify(followupDraft) !== JSON.stringify(behaviorBaseline) ||
    JSON.stringify(configDraft) !== JSON.stringify(behaviorBaseline) ||
    JSON.stringify(schedulingDraft) !== JSON.stringify(behaviorBaseline) ||
    customContext !== (selected?.custom_context ?? "")
  );

  async function toggleCloser(userId: string, checked: boolean) {
    if (!selected || !companyId) return;
    // Guarda contra clique duplicado (ex. clique no texto do label dispara
    // onCheckedChange 2x em alguns navegadores) -- sem isso, o segundo
    // insert bate na unique (agent_id, user_id) e mostra "Erro ao adicionar
    // closer" mesmo já tendo funcionado da primeira vez.
    const alreadyCloser = closerIds.includes(userId);
    if (checked === alreadyCloser) return;
    if (checked) {
      const { error } = await supabase.from("agent_closers").upsert(
        { agent_id: selected.id, company_id: companyId, user_id: userId },
        { onConflict: "agent_id,user_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao adicionar vendedor"); return; }
      setCloserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    } else {
      const { error } = await supabase.from("agent_closers").delete().eq("agent_id", selected.id).eq("user_id", userId);
      if (error) { toast.error("Erro ao remover vendedor"); return; }
      setCloserIds((prev) => prev.filter((id) => id !== userId));
    }
  }

  // Etapa "Integrações" -- toggles de WhatsApp/Instagram-Messenger/Webhook
  // funcionam igual toggleCloser: linha existe = usado; some = não usado.
  async function toggleAgentWhatsapp(connectionId: string, checked: boolean) {
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_whatsapp_connections").upsert(
        { agent_id: selected.id, company_id: companyId, connection_id: connectionId },
        { onConflict: "agent_id,connection_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao vincular WhatsApp"); return; }
      setAgentWhatsappIds((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
    } else {
      const { error } = await supabase.from("agent_whatsapp_connections").delete().eq("agent_id", selected.id).eq("connection_id", connectionId);
      if (error) { toast.error("Erro ao desvincular WhatsApp"); return; }
      setAgentWhatsappIds((prev) => prev.filter((id) => id !== connectionId));
    }
  }

  async function toggleAgentMeta(connectionId: string, checked: boolean) {
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_meta_connections").upsert(
        { agent_id: selected.id, company_id: companyId, connection_id: connectionId },
        { onConflict: "agent_id,connection_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao vincular conexão"); return; }
      setAgentMetaIds((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
    } else {
      const { error } = await supabase.from("agent_meta_connections").delete().eq("agent_id", selected.id).eq("connection_id", connectionId);
      if (error) { toast.error("Erro ao desvincular conexão"); return; }
      setAgentMetaIds((prev) => prev.filter((id) => id !== connectionId));
    }
  }

  async function toggleAgentWebhook(connectionId: string, checked: boolean) {
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_webhook_integrations").upsert(
        { agent_id: selected.id, company_id: companyId, connection_id: connectionId },
        { onConflict: "agent_id,connection_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao vincular webhook"); return; }
      setAgentWebhookIds((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
    } else {
      const { error } = await supabase.from("agent_webhook_integrations").delete().eq("agent_id", selected.id).eq("connection_id", connectionId);
      if (error) { toast.error("Erro ao desvincular webhook"); return; }
      setAgentWebhookIds((prev) => prev.filter((id) => id !== connectionId));
    }
  }

  // Calendar já vem com linha pré-existente (efeito de auto-sync acima),
  // então aqui é sempre update do campo enabled, não insert/delete.
  async function toggleAgentCalendar(userId: string, checked: boolean) {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agent_calendar_connections").upsert(
      { agent_id: selected.id, company_id: companyId, user_id: userId, enabled: checked },
      { onConflict: "agent_id,user_id" },
    );
    if (error) { toast.error("Erro ao atualizar calendário"); return; }
    setAgentCalendarEnabled((prev) => ({ ...prev, [userId]: checked }));
  }

  async function saveCloserAvailability(userId: string, days: WorkDay[]) {
    if (!selected || !companyId) return;
    setCloserAvailability((prev) => ({ ...prev, [userId]: days }));
    const { error } = await supabase.from("agent_closer_availability").upsert(
      { agent_id: selected.id, company_id: companyId, user_id: userId, days },
      { onConflict: "agent_id,user_id" },
    );
    if (error) toast.error("Erro ao salvar disponibilidade");
  }

  function updateCloserAvailabilityDay(userId: string, dayIdx: number, patch: Partial<WorkDay>) {
    const current = closerAvailability[userId] ?? defaultCloserAvailability();
    return current.map((d, i) => (i === dayIdx ? { ...d, ...patch } : d));
  }

  async function handleUpload(file: File) {
    if (!selected || !companyId || !user?.id || !editingKbId) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !SUPPORTED_KB_EXTENSIONS.includes(ext)) {
      toast.error("Formato não suportado. Use PDF, TXT, CSV, HTML ou JSON.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande — máx. 50MB.");
      return;
    }
    setUploading(true);
    try {
      const path = `${companyId}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("agent-knowledge").upload(path, file);
      if (upErr) throw upErr;

      const { data: docRow, error: insErr } = await supabase
        .from("agent_knowledge_documents")
        .insert({ agent_id: selected.id, company_id: companyId, owner_id: user.id, knowledge_base_id: editingKbId, file_name: file.name, storage_path: path, status: "pending" })
        .select("id, file_name, status, error_detail, created_at, enabled, knowledge_base_id")
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
        const { data: refreshed } = await supabase.from("agent_knowledge_documents").select("id, file_name, status, error_detail, created_at, enabled, knowledge_base_id").eq("id", docRow.id).single();
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

  async function toggleDocEnabled(doc: KnowledgeDoc, checked: boolean) {
    if (!companyId) return;
    const { error } = await supabase.from("agent_knowledge_documents").update({ enabled: checked }).eq("id", doc.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, enabled: checked } : d)));
  }

  function openCreateKbModal() {
    setEditingKbId(null);
    setKbDraftName("");
    setKbDraftDescription("");
    setDocSearch("");
    setKbModalStep("config");
    setKbModalOpen(true);
  }

  function openEditKbModal(kb: KnowledgeBase) {
    setEditingKbId(kb.id);
    setKbDraftName(kb.name);
    setKbDraftDescription(kb.description ?? "");
    setDocSearch("");
    setKbModalStep("arquivos");
    setKbModalOpen(true);
  }

  async function saveKbConfig() {
    if (!selected || !companyId || !user?.id) return;
    if (!kbDraftName.trim()) { toast.error("Informe o nome da base de conhecimento"); return; }

    setSavingKey("kb");
    if (editingKbId) {
      const { error } = await supabase.from("agent_knowledge_bases")
        .update({ name: kbDraftName.trim(), description: kbDraftDescription.trim() || null })
        .eq("id", editingKbId).eq("company_id", companyId);
      setSavingKey(null);
      if (error) { toast.error("Erro ao salvar"); return; }
      setKbs((prev) => prev.map((k) => (k.id === editingKbId ? { ...k, name: kbDraftName.trim(), description: kbDraftDescription.trim() || null } : k)));
    } else {
      const { data, error } = await supabase.from("agent_knowledge_bases")
        .insert({ agent_id: selected.id, company_id: companyId, owner_id: user.id, name: kbDraftName.trim(), description: kbDraftDescription.trim() || null })
        .select("id, name, description, enabled")
        .single();
      setSavingKey(null);
      if (error || !data) { toast.error("Erro ao criar base de conhecimento"); return; }
      setKbs((prev) => [data as KnowledgeBase, ...prev]);
      setEditingKbId(data.id);
    }
    toast.success("Base de conhecimento salva");
    setKbModalStep("arquivos");
  }

  async function toggleKbEnabled(kb: KnowledgeBase, checked: boolean) {
    if (!companyId) return;
    const { error } = await supabase.from("agent_knowledge_bases").update({ enabled: checked }).eq("id", kb.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setKbs((prev) => prev.map((k) => (k.id === kb.id ? { ...k, enabled: checked } : k)));
  }

  async function deleteKb(kb: KnowledgeBase) {
    if (!companyId) return;
    // on delete cascade em agent_knowledge_documents -- apaga os arquivos junto.
    const { error } = await supabase.from("agent_knowledge_bases").delete().eq("id", kb.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao excluir"); return; }
    setKbs((prev) => prev.filter((k) => k.id !== kb.id));
    setDocs((prev) => prev.filter((d) => d.knowledge_base_id !== kb.id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-[#767676]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto h-full flex flex-col">
      {view === "grid" ? (
        <>
          <div className="flex items-start justify-between mb-6 gap-4 shrink-0">
            <div>
              <h1 className="text-[20px] font-bold text-[#111111] leading-tight">Agentes</h1>
              <p className="text-[13px] text-[#767676] mt-1">
                Agentes de IA que atuam sobre seus leads — qualificam, respondem e agendam sozinhos
              </p>
            </div>
            <Button onClick={() => setOpenDialog(true)} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
              <Plus size={16} /> Novo agente
            </Button>
          </div>

          {agents.filter((a) => !a.draft).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <Bot size={64} color="#E5E5E5" />
              <h2 className="text-[20px] font-bold text-[#111111] mt-4">Nenhum agente configurado</h2>
              <p className="text-[13px] text-[#767676] mt-2 max-w-[420px]">
                Crie seu primeiro agente SDS para qualificar leads e agendar reuniões automaticamente no multiatendimento
              </p>
              <Button onClick={() => setOpenDialog(true)} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white mt-6">
                <Plus size={16} /> Criar primeiro agente
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 overflow-y-auto" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {agents.filter((a) => !a.draft).map((a) => (
                <div key={a.id} className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-[#128A68] flex items-center justify-center text-white shrink-0">
                      <AgentAvatarIcon avatar={a.avatar} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-[#111111] truncate">{a.name}</p>
                      {a.description && <p className="text-[11px] text-[#767676] truncate">{a.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Circle size={8} fill={a.active ? "#128A68" : "#CCCCCC"} color={a.active ? "#128A68" : "#CCCCCC"} />
                    <span className={`text-[11px] font-semibold ${a.active ? "text-[#128A68]" : "text-[#767676]"}`}>{a.active ? "Ativo" : "Inativo"}</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-[#EEEEEE] mt-auto">
                    <button
                      onClick={() => { setSelectedId(a.id); setWizardMode(false); setFreeTab("perfil"); setView("detail"); }}
                      className="flex items-center gap-1.5 text-[13px] font-medium text-[#767676] hover:text-[#111111] transition-colors cursor-pointer"
                    >
                      <Settings2 size={14} /> Editar
                    </button>
                    <Switch checked={a.active} onCheckedChange={(v) => toggleActive(a, v)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
          /* Config panel -- tela cheia, sem a coluna de lista ao lado */
          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 flex-1 min-h-0 flex flex-col">
            {!selected ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Bot size={64} color="#E5E5E5" />
                <p className="text-[#767676] text-[14px] mt-4">Selecione um agente para configurar</p>
              </div>
            ) : (() => {
              const effectiveWizardSteps = WIZARD_STEPS.filter((s) => s.v !== "closers" || selected.objectives.includes("agendar"));
              const activeTabValue = wizardMode ? (effectiveWizardSteps[wizardStepIndex]?.v ?? "kb") : freeTab;
              return (
              <Tabs value={activeTabValue} onValueChange={(v) => { if (!wizardMode) setFreeTab(v); }} className="w-full h-full min-h-0 flex flex-col">
                <div className="px-6 pt-5 pb-0 border-b border-[#EEEEEE] shrink-0">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#128A68] flex items-center justify-center text-white shrink-0">
                      <AgentAvatarIcon avatar={selected.avatar} size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-[16px] font-bold text-[#111111]">{selected.name}</h2>
                      {selected.description && (
                        <p className="text-[12px] text-[#767676]">{selected.description}</p>
                      )}
                    </div>
                    {wizardMode && (
                      <Button variant="outline" onClick={abandonDraftAgent} className="h-8 text-[12px] shrink-0">
                        Cancelar
                      </Button>
                    )}
                    {!wizardMode && (
                      <Button
                        variant="outline"
                        onClick={() => toggleActive(selected, !selected.active)}
                        className={`h-8 text-[12px] shrink-0 ${selected.active ? "border-[#FCA5A5] text-[#991B1B] hover:bg-[#FEE2E2]" : "border-[#128A68] text-[#128A68] hover:bg-[#E1F5EE]"}`}
                      >
                        {selected.active ? "Desativar agente" : "Ativar agente"}
                      </Button>
                    )}
                  </div>
                  {wizardMode ? (
                    <div className="pb-4 flex items-center flex-wrap gap-x-1 gap-y-2">
                      {effectiveWizardSteps.map((s, idx) => {
                        const locked = idx > wizardMaxStepReached;
                        return (
                        <div key={s.v} className="flex items-center">
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => { if (!locked) setWizardStepIndex(idx); }}
                            className={`flex items-center gap-1.5 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                              style={
                                idx === wizardStepIndex
                                  ? { background: "#128A68", color: "#FFFFFF" }
                                  : locked
                                  ? { background: "#F5F5F5", color: "#CCCCCC" }
                                  : { background: "#E1F5EE", color: "#128A68" }
                              }
                            >
                              {locked ? <Lock size={10} /> : idx + 1}
                            </span>
                            <span
                              className="text-[12px]"
                              style={{ color: idx === wizardStepIndex ? "#111111" : locked ? "#CCCCCC" : "#AAAAAA", fontWeight: idx === wizardStepIndex ? 600 : 400 }}
                            >
                              {s.l}
                            </span>
                          </button>
                          {idx < effectiveWizardSteps.length - 1 && <div className="w-4 h-px bg-[#EEEEEE] mx-2" />}
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                  <TabsList className="bg-transparent p-0 h-auto gap-1 flex-wrap justify-start">
                    {[
                      { v: "perfil", l: "Perfil" },
                      { v: "kb", l: "Base de Conhecimento" },
                      { v: "instrucoes", l: "Instruções" },
                      { v: "comportamento", l: "Comportamento" },
                      { v: "closers", l: "Vendedores" },
                      { v: "integracoes", l: "Integrações" },
                      { v: "configuracoes", l: "Configurações" },
                      { v: "ferramentas", l: "Ferramentas" },
                      { v: "modelos", l: "Modelos" },
                      { v: "performance", l: "Performance" },
                    ].filter((t) => t.v !== "closers" || selected.objectives.includes("agendar")).map((t, idx) => (
                      <TabsTrigger
                        key={t.v}
                        value={t.v}
                        className="data-[state=active]:bg-[#E1F5EE] data-[state=active]:text-[#128A68] data-[state=active]:shadow-none rounded-md text-[13px] px-3 py-1.5 flex items-center gap-1.5"
                      >
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                          style={
                            activeTabValue === t.v
                              ? { background: "#128A68", color: "#FFFFFF" }
                              : { background: "#E1F5EE", color: "#128A68" }
                          }
                        >
                          {idx + 1}
                        </span>
                        {t.l}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  )}
                </div>

                {/* PERFIL */}
                <TabsContent value="perfil" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  {(!hasAnthropicKey || !hasOpenaiKey) && (
                    <div className="flex items-start gap-2.5 p-4 bg-[#FEE2E2] rounded-lg">
                      <AlertTriangle size={16} className="text-[#991B1B] mt-0.5 shrink-0" />
                      <div className="flex-1 text-[13px] text-[#991B1B]">
                        {!hasAnthropicKey && !hasOpenaiKey
                          ? "Sem chave da Anthropic e da OpenAI cadastradas — o agente não pode ser ativado até você cadastrar as duas em Configurações (OpenAI também é necessária pra upload de documentos na Base de Conhecimento)."
                          : !hasAnthropicKey
                          ? "Sem chave da Anthropic cadastrada — o agente não pode ser ativado até você cadastrar uma em Configurações."
                          : "Sem chave da OpenAI cadastrada — o agente não pode ser ativado até você cadastrar uma em Configurações (também necessária pra upload de documentos na Base de Conhecimento)."}
                      </div>
                      <Button variant="outline" onClick={() => navigate("/configuracoes/api")} className="h-7 text-[11px] shrink-0 border-[#991B1B] text-[#991B1B] hover:bg-[#FEE2E2]">
                        Ir pra Configurações
                      </Button>
                    </div>
                  )}

                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Objetivo do agente</h3>
                    <p className="text-[12px] text-[#767676]">
                      O que esse agente deve fazer nas conversas. Pode marcar mais de um.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {AGENT_OBJECTIVES.map((o) => {
                      const checked = selected.objectives.includes(o.id);
                      return (
                        <div key={o.id} className="bg-white border border-[#EEEEEE] rounded-lg">
                          <label className="flex items-start gap-3 p-3 cursor-pointer">
                            <Checkbox
                              className="mt-0.5"
                              checked={checked}
                              onCheckedChange={(c) => toggleObjective(o.id, c === true)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[#111111]">{o.label}</div>
                              <div className="text-[11px] text-[#767676]">{o.description}</div>
                            </div>
                          </label>

                          {checked && (
                            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#EEEEEE] mt-1">
                              {o.id === "qualificar" && (
                                <>
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="text-[12px] font-medium text-[#111111] pt-2">Campos que o agente deve mapear</div>
                                      <p className="text-[11px] text-[#767676]">
                                        Selecione as perguntas dos campos adicionais já criados que o agente mapear. O agente irá preencher as informações mapeadas diretamente no card do lead.
                                      </p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      onClick={() => navigate("/configuracoes/campos")}
                                      className="h-8 text-[12px] shrink-0 mt-2"
                                    >
                                      Editar campos
                                    </Button>
                                  </div>
                                  {customFieldGroups.every((g) => g.items.length === 0) ? (
                                    <p className="text-[11px] text-[#767676] py-1">
                                      Nenhum campo adicional criado ainda — clique em "Editar campos" pra criar.
                                    </p>
                                  ) : (
                                    customFieldGroups.filter((g) => g.items.length > 0).map((g) => (
                                      <div key={g.id} className="space-y-1.5">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#767676]">{g.name}</div>
                                        {g.items.map((f) => (
                                          <label key={f.id} className="flex items-center gap-2 p-2 bg-[#F5F5F5] rounded cursor-pointer">
                                            <Checkbox
                                              checked={(selected.behavior_config.campos_qualificacao ?? []).includes(f.id)}
                                              onCheckedChange={(c) => toggleQualField(f.id, c === true)}
                                            />
                                            <span className="text-[12px] text-[#111111]">{f.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                    ))
                                  )}
                                </>
                              )}

                              <div className={o.id === "qualificar" ? "pt-1 border-t border-[#EEEEEE]" : ""}>
                                <div className="text-[12px] font-medium text-[#111111] pt-2">Instruções específicas</div>
                                <p className="text-[11px] text-[#767676] mb-1.5">
                                  Regras ou detalhes de como o agente deve executar esse objetivo — soma ao prompt padrão dele, sem se misturar com as instruções gerais do agente.
                                </p>
                                <Textarea
                                  value={objectiveInstructionsDraft[o.id] ?? ""}
                                  onChange={(e) => setObjectiveInstructionsDraft((prev) => ({ ...prev, [o.id]: e.target.value }))}
                                  onBlur={() => saveObjectiveInstruction(o.id)}
                                  placeholder={`Ex: como o agente deve executar "${o.label}" nesse negócio específico`}
                                  className="text-[12px] min-h-[70px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {selected.objectives.includes("qualificar") && (selected.behavior_config.campos_qualificacao ?? []).length === 0 && (
                    <div className="flex items-start gap-2.5 p-4 bg-[#FEF3C7] rounded-lg">
                      <AlertTriangle size={16} className="text-[#92400E] mt-0.5 shrink-0" />
                      <div className="text-[13px] text-[#92400E]">
                        "Qualificar" precisa de pelo menos 1 pergunta marcada em "Campos que o agente deve mapear" — sem isso o agente não tem o que direcionar na qualificação.
                      </div>
                    </div>
                  )}
                  {selected.objectives.includes("atendimento") && (
                    <p className="text-[11px] text-[#767676]">
                      "Atendimento" usa os documentos da aba Base de Conhecimento pra responder — envie materiais lá pra esse objetivo funcionar bem.
                    </p>
                  )}
                </TabsContent>

                {/* BASE DE CONHECIMENTO */}
                <TabsContent value="kb" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Bases de Conhecimento</h3>
                    <p className="text-[12px] text-[#767676]">
                      Gerencie as bases de conhecimento associadas a este agente para fornecer as informações que ele precisa para realizar suas tarefas.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={kbSearch}
                      onChange={(e) => setKbSearch(e.target.value)}
                      placeholder="Buscar bases de conhecimento..."
                      className="flex-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <Button onClick={openCreateKbModal} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                      <Plus size={16} /> Adicionar Conhecimento
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {kbs
                      .filter((k) => k.name.toLowerCase().includes(kbSearch.toLowerCase()))
                      .map((kb) => {
                        const fileCount = docs.filter((d) => d.knowledge_base_id === kb.id).length;
                        return (
                          <div
                            key={kb.id}
                            onClick={() => openEditKbModal(kb)}
                            className="group flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg hover:bg-[#F5F5F5] transition-colors cursor-pointer"
                          >
                            <div className="w-9 h-9 rounded-full bg-[#E1F5EE] flex items-center justify-center text-[#128A68] shrink-0">
                              <BookOpen size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[#111111] truncate">{kb.name}</div>
                              <div className="text-[11px] text-[#767676] truncate">
                                {kb.description || "Sem descrição"} · {fileCount} arquivo{fileCount === 1 ? "" : "s"}
                              </div>
                            </div>
                            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 shrink-0">
                              <Switch checked={kb.enabled} onCheckedChange={(v) => toggleKbEnabled(kb, v)} />
                              <button onClick={() => deleteKb(kb)} className="opacity-0 group-hover:opacity-100 text-[#767676] hover:text-[#E24B4A] transition-opacity">
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {kbs.length === 0 && (
                      <p className="text-[12px] text-[#767676] text-center py-6">Nenhuma base de conhecimento ainda</p>
                    )}
                    {kbs.length > 0 && kbs.filter((k) => k.name.toLowerCase().includes(kbSearch.toLowerCase())).length === 0 && (
                      <p className="text-[12px] text-[#767676] text-center py-6">Nenhuma base encontrada para "{kbSearch}"</p>
                    )}
                  </div>
                </TabsContent>

                {/* COMPORTAMENTO */}
                <TabsContent value="comportamento" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div className="border-t border-[#EEEEEE] pt-6 first:border-t-0 first:pt-0">
                    <h3 className="text-[14px] font-semibold text-[#111111] mb-3">Encerramento e transferência</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                        <div>
                          <div className="text-[13px] font-medium text-[#111111]">Finalizar conversa</div>
                          <div className="text-[11px] text-[#767676]">Permite que o agente encerre a conversa automaticamente.</div>
                        </div>
                        <Switch
                          checked={selected.behavior_config.finalizar_conversa ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ finalizar_conversa: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                        <div>
                          <div className="text-[13px] font-medium text-[#111111]">Transferir responsável</div>
                          <div className="text-[11px] text-[#767676]">Permite que o agente transfira o responsável quando identificar que finalizou o objetivo.</div>
                        </div>
                        <Switch
                          checked={selected.behavior_config.transferir_responsavel ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ transferir_responsavel: v })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-6">
                    <h3 className="text-[14px] font-semibold text-[#111111] mb-3">Estilo de Comunicação</h3>
                    <div className="max-w-[280px] mb-2 p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                      <Select
                        value={selected.behavior_config.estilo_comunicacao ?? "normal"}
                        onValueChange={(v) => updateBehaviorConfig({ estilo_comunicacao: v as BehaviorConfig["estilo_comunicacao"] })}
                      >
                        <SelectTrigger className="bg-white focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="descontraida">Descontraída</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                        <div>
                          <div className="text-[13px] font-medium text-[#111111]">Usar Emojis</div>
                          <div className="text-[11px] text-[#767676]">Permitir uso de emojis nas respostas.</div>
                        </div>
                        <Switch
                          checked={selected.behavior_config.usar_emojis ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ usar_emojis: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                        <div>
                          <div className="text-[13px] font-medium text-[#111111]">Assinar nome do agente</div>
                          <div className="text-[11px] text-[#767676]">Assinar nome do agente nas mensagens.</div>
                        </div>
                        <Switch
                          checked={selected.behavior_config.assinar_nome ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ assinar_nome: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-[#111111]">Dividir mensagens longas</div>
                          <div className="text-[11px] text-[#767676]">Dividir mensagens muito longas automaticamente.</div>
                          {selected.behavior_config.dividir_mensagens && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[11px] text-[#666]">Acima de quantas palavras:</span>
                              <Input
                                type="number"
                                min={10}
                                defaultValue={selected.behavior_config.dividir_mensagens_palavras ?? 80}
                                onBlur={(e) => updateBehaviorConfig({ dividir_mensagens_palavras: Number(e.target.value) || 80 })}
                                className="w-20 h-8 text-[12px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                              />
                            </div>
                          )}
                        </div>
                        <Switch
                          checked={selected.behavior_config.dividir_mensagens ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ dividir_mensagens: v })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-6">
                    <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg mb-3">
                      <div>
                        <div className="text-[13px] font-medium text-[#111111]">Follow-up automático</div>
                        <div className="text-[11px] text-[#767676]">Envia mensagem de acompanhamento quando o cliente não responde.</div>
                      </div>
                      <Switch
                        checked={selected.behavior_config.followup_ativo ?? false}
                        onCheckedChange={(v) => updateBehaviorConfig({ followup_ativo: v })}
                      />
                    </div>

                    {selected.behavior_config.followup_ativo && (
                      <div className="space-y-4 p-4 border border-[#EEEEEE] rounded-lg">
                        <div>
                          <Label className="text-[12px]">Número de follow-ups</Label>
                          <Input
                            type="number" min={1} max={10}
                            value={followupDraft.followup_max_tentativas}
                            onChange={(e) => setFollowupDraft((d) => ({ ...d, followup_max_tentativas: Number(e.target.value) || 1 }))}
                            className="mt-1 w-28 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                          />
                        </div>
                        <div>
                          <Label className="text-[12px]">Tempo de espera entre os follow-ups</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="number" min={1}
                              value={followupDraft.followup_intervalo_valor}
                              onChange={(e) => setFollowupDraft((d) => ({ ...d, followup_intervalo_valor: Number(e.target.value) || 1 }))}
                              className="w-28 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                            />
                            <Select
                              value={followupDraft.followup_intervalo_unidade}
                              onValueChange={(v) => setFollowupDraft((d) => ({ ...d, followup_intervalo_unidade: v as "minutos" | "horas" }))}
                            >
                              <SelectTrigger className="w-32 focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="minutos">Minutos</SelectItem>
                                <SelectItem value="horas">Horas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                          <div className="text-[13px] font-medium text-[#111111]">
                            Após as tentativas, transferir lead para uma automação
                          </div>
                          <Switch
                            checked={followupDraft.followup_transferir_automacao}
                            onCheckedChange={(v) => setFollowupDraft((d) => ({ ...d, followup_transferir_automacao: v }))}
                          />
                        </div>
                        {followupDraft.followup_transferir_automacao && (
                          <div>
                            <Label className="text-[12px]">Automação de destino</Label>
                            <Select
                              value={followupDraft.followup_automacao_id ?? ""}
                              onValueChange={(v) => setFollowupDraft((d) => ({ ...d, followup_automacao_id: v }))}
                            >
                              <SelectTrigger className="mt-1 focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue placeholder="Selecione uma automação" /></SelectTrigger>
                              <SelectContent>
                                {manualAutomations.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {manualAutomations.length === 0 && (
                              <p className="text-[11px] text-[#767676] mt-1">
                                Nenhuma automação com gatilho "Manual" disponível — crie uma em Automações primeiro.
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex justify-end">
                          <Button onClick={() => saveFollowupConfig()} disabled={savingKey === "followup"} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                            {savingKey === "followup" && <Loader2 size={14} className="animate-spin" />} Salvar follow-up
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* CLOSERS */}
                <TabsContent value="closers" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-[14px] font-semibold text-[#111111]">Configurações de agendamento</h3>
                      <p className="text-[12px] text-[#767676]">Regras que valem pra qualquer reunião marcada por esse agente, independente do vendedor.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                      <div>
                        <Label className="text-[12px]">Fuso horário</Label>
                        <Select
                          value={schedulingDraft.fuso_horario}
                          onValueChange={(v) => setSchedulingDraft((d) => ({ ...d, fuso_horario: v }))}
                        >
                          <SelectTrigger className="mt-1 bg-white focus:ring-0 focus:ring-offset-0 focus:border-primary">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AGENT_TIMEZONES.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[12px]">Duração padrão das reuniões (min)</Label>
                        <Input
                          type="number" min={5} step={5}
                          value={schedulingDraft.duracao_reuniao_minutos}
                          onChange={(e) => setSchedulingDraft((d) => ({ ...d, duracao_reuniao_minutos: Number(e.target.value) || 60 }))}
                          className="mt-1 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                      <div>
                        <div className="text-[13px] text-[#111111]">Intervalo entre reuniões</div>
                        <div className="text-[11px] text-[#767676]">Garante uma folga antes e depois de cada reunião já marcada, pra não empilhar compromissos do vendedor sem respiro.</div>
                      </div>
                      <Switch
                        checked={schedulingDraft.intervalo_entre_reunioes}
                        onCheckedChange={(v) => setSchedulingDraft((d) => ({ ...d, intervalo_entre_reunioes: v }))}
                      />
                    </div>
                    {schedulingDraft.intervalo_entre_reunioes && (
                      <div className="pl-3">
                        <Label className="text-[12px]">Intervalo (minutos)</Label>
                        <Input
                          type="number" min={5} step={5}
                          value={schedulingDraft.intervalo_minutos}
                          onChange={(e) => setSchedulingDraft((d) => ({ ...d, intervalo_minutos: Number(e.target.value) || 15 }))}
                          className="mt-1 w-32 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                      <div>
                        <div className="text-[13px] text-[#111111]">Incluir link do Google Meet</div>
                        <div className="text-[11px] text-[#767676]">Adiciona automaticamente um link do Google Meet aos eventos criados.</div>
                      </div>
                      <Switch
                        checked={schedulingDraft.incluir_google_meet}
                        onCheckedChange={(v) => setSchedulingDraft((d) => ({ ...d, incluir_google_meet: v }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                      <div>
                        <div className="text-[13px] text-[#111111]">Confirmar antes de criar eventos</div>
                        <div className="text-[11px] text-[#767676]">O agente pedirá confirmação antes de criar ou modificar eventos.</div>
                      </div>
                      <Switch
                        checked={schedulingDraft.confirmar_antes_criar_evento}
                        onCheckedChange={(v) => setSchedulingDraft((d) => ({ ...d, confirmar_antes_criar_evento: v }))}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={() => saveSchedulingConfig()} disabled={savingKey === "agendamento"} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                        {savingKey === "agendamento" && <Loader2 size={14} className="animate-spin" />} Salvar
                      </Button>
                    </div>
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-4">
                    <h3 className="text-[14px] font-semibold text-[#111111]">Quem recebe as reuniões agendadas</h3>
                    <p className="text-[12px] text-[#767676]">
                      O agente só agenda de fato com quem tem Google Calendar conectado e está dentro da disponibilidade declarada — distribui pelo vendedor com menos reuniões na semana entre os elegíveis.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {members.map((m) => {
                      const checked = closerIds.includes(m.user_id);
                      const connected = memberCalendarConnected[m.user_id];
                      const availability = closerAvailability[m.user_id] ?? defaultCloserAvailability();
                      return (
                        <div key={m.user_id} className="bg-white border border-[#EEEEEE] rounded-lg">
                          <label className="flex items-center gap-3 p-3 cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => toggleCloser(m.user_id, c === true)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] text-[#111111]">{m.full_name || m.email}</div>
                              <div className="text-[11px] text-[#767676]">{m.email}</div>
                            </div>
                          </label>

                          {checked && (
                            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#EEEEEE] mt-1">
                              <div className="pt-2">
                                {connected === undefined ? (
                                  <span className="text-[11px] text-[#767676]">Verificando conexão com Google Calendar...</span>
                                ) : connected ? (
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#128A68] bg-[#E1F5EE] px-2 py-1 rounded-full">
                                    <CheckCircle2 size={12} /> Google Calendar conectado
                                  </span>
                                ) : (
                                  <div className="flex items-start gap-2.5 p-2.5 bg-[#FEF3C7] rounded-lg">
                                    <AlertTriangle size={14} className="text-[#92400E] mt-0.5 shrink-0" />
                                    <div className="text-[11px] text-[#92400E]">
                                      {m.full_name || m.email} ainda não conectou o Google Calendar — sem isso o agente não consegue agendar reunião pra essa pessoa. Peça pra ela acessar{" "}
                                      <button onClick={() => navigate("/configuracoes/integracoes")} className="underline font-medium">
                                        Configurações → Integrações
                                      </button>{" "}
                                      e conectar.
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="text-[12px] font-medium text-[#111111]">Disponibilidade pra esse agente</div>
                                <p className="text-[11px] text-[#767676] mb-1.5">
                                  Dias e horários em que {m.full_name || "essa pessoa"} libera a agenda pro agente marcar reunião. Sem nenhum dia marcado, o agente pode agendar em qualquer horário.
                                </p>
                                <div className="space-y-1">
                                  {availability.map((d, idx) => (
                                    <div key={d.day} className="flex items-center gap-2.5 py-1">
                                      <Switch
                                        checked={d.active}
                                        onCheckedChange={(v) => saveCloserAvailability(m.user_id, updateCloserAvailabilityDay(m.user_id, idx, { active: v }))}
                                      />
                                      <span className={`text-[12px] w-16 shrink-0 ${d.active ? "text-[#111111]" : "text-[#767676]"}`}>{d.day}</span>
                                      {d.active ? (
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="time"
                                            value={d.intervals[0]?.start ?? "08:00"}
                                            onChange={(e) => setCloserAvailability((prev) => ({ ...prev, [m.user_id]: updateCloserAvailabilityDay(m.user_id, idx, { intervals: [{ start: e.target.value, end: d.intervals[0]?.end ?? "18:00" }] }) }))}
                                            onBlur={() => saveCloserAvailability(m.user_id, closerAvailability[m.user_id] ?? availability)}
                                            className="text-[12px] border border-[#E5E5E5] rounded-md px-1.5 py-1 outline-none"
                                          />
                                          <span className="text-[11px] text-[#767676]">às</span>
                                          <input
                                            type="time"
                                            value={d.intervals[0]?.end ?? "18:00"}
                                            onChange={(e) => setCloserAvailability((prev) => ({ ...prev, [m.user_id]: updateCloserAvailabilityDay(m.user_id, idx, { intervals: [{ start: d.intervals[0]?.start ?? "08:00", end: e.target.value }] }) }))}
                                            onBlur={() => saveCloserAvailability(m.user_id, closerAvailability[m.user_id] ?? availability)}
                                            className="text-[12px] border border-[#E5E5E5] rounded-md px-1.5 py-1 outline-none"
                                          />
                                        </div>
                                      ) : (
                                        <span className="text-[11px] text-[#CCCCCC]">Fechado</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {members.length === 0 && (
                      <p className="text-[12px] text-[#767676] text-center py-6">Nenhum membro na equipe ainda</p>
                    )}
                  </div>
                </TabsContent>

                {/* INTEGRAÇÕES */}
                <TabsContent value="integracoes" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Integrações</h3>
                    <p className="text-[12px] text-[#767676]">Escolha em quais conexões já existentes na empresa esse agente atua.</p>
                  </div>

                  <div>
                    <h4 className="text-[11px] uppercase tracking-wide text-[#767676] font-semibold mb-2">WhatsApp</h4>
                    <div className="space-y-1.5">
                      {whatsappConnections.map((c) => (
                        <label key={c.id} className="flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg cursor-pointer">
                          <Checkbox
                            checked={agentWhatsappIds.includes(c.id)}
                            onCheckedChange={(checked) => toggleAgentWhatsapp(c.id, checked === true)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[#111111]">{c.name}{c.phone ? ` — ${c.phone}` : ""}</div>
                          </div>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${c.connected ? "bg-[#E1F5EE] text-[#128A68]" : "bg-[#F5F5F5] text-[#767676]"}`}>
                            {c.connected ? "Conectado" : "Desconectado"}
                          </span>
                        </label>
                      ))}
                      {whatsappConnections.length === 0 && (
                        <p className="text-[12px] text-[#767676] py-3">Nenhum WhatsApp conectado. Conecte em Configurações → Conexões.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[11px] uppercase tracking-wide text-[#767676] font-semibold mb-2">Instagram / Messenger</h4>
                    <div className="space-y-1.5">
                      {metaConnections.map((c) => (
                        <label key={c.id} className="flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg cursor-pointer">
                          <Checkbox
                            checked={agentMetaIds.includes(c.id)}
                            onCheckedChange={(checked) => toggleAgentMeta(c.id, checked === true)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[#111111]">{c.page_name ?? c.instagram_username ?? "Conexão"}</div>
                            <div className="text-[11px] text-[#767676]">{c.provider === "instagram" ? "Instagram" : "Messenger"}</div>
                          </div>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${c.active ? "bg-[#E1F5EE] text-[#128A68]" : "bg-[#F5F5F5] text-[#767676]"}`}>
                            {c.active ? "Conectado" : "Desconectado"}
                          </span>
                        </label>
                      ))}
                      {metaConnections.length === 0 && (
                        <p className="text-[12px] text-[#767676] py-3">Nenhuma página do Instagram/Messenger conectada. Conecte em Configurações → Conexões.</p>
                      )}
                    </div>
                  </div>

                  {selected.objectives.includes("agendar") && (() => {
                    const connectedMemberIds = members.map((m) => m.user_id).filter((id) => memberCalendarConnected[id]);
                    return (
                    <div>
                      <h4 className="text-[11px] uppercase tracking-wide text-[#767676] font-semibold mb-2">Calendar</h4>
                      <div className="space-y-1.5">
                        {connectedMemberIds.map((id) => {
                          const m = members.find((mm) => mm.user_id === id);
                          return (
                            <label key={id} className="flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg cursor-pointer">
                              <Checkbox
                                checked={agentCalendarEnabled[id] ?? true}
                                onCheckedChange={(checked) => toggleAgentCalendar(id, checked === true)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] text-[#111111]">{memberCalendarEmail[id] || m?.full_name || m?.email || id}</div>
                              </div>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-[#E1F5EE] text-[#128A68]">Conectado</span>
                            </label>
                          );
                        })}
                        {connectedMemberIds.length === 0 && (
                          <p className="text-[12px] text-[#767676] py-3">
                            Nenhum usuário com Google Calendar conectado. Conecte em Configurações → Conexões.
                          </p>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  <div>
                    <h4 className="text-[11px] uppercase tracking-wide text-[#767676] font-semibold mb-2">Webhooks de entrada</h4>
                    <div className="space-y-1.5">
                      {webhookIntegrations.map((c) => (
                        <label key={c.id} className="flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg cursor-pointer">
                          <Checkbox
                            checked={agentWebhookIds.includes(c.id)}
                            onCheckedChange={(checked) => toggleAgentWebhook(c.id, checked === true)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[#111111]">{c.name}</div>
                          </div>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${c.active ? "bg-[#E1F5EE] text-[#128A68]" : "bg-[#F5F5F5] text-[#767676]"}`}>
                            {c.active ? "Ativo" : "Inativo"}
                          </span>
                        </label>
                      ))}
                      {webhookIntegrations.length === 0 && (
                        <p className="text-[12px] text-[#767676] py-3">Nenhum webhook de entrada configurado. Configure em Configurações → Integrações.</p>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* PERFORMANCE */}
                <TabsContent value="performance" className="p-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <PerformanceTab
                    agentId={selected.id}
                    companyId={companyId ?? ""}
                    closerIds={closerIds}
                    active={selected.active}
                    activatedAt={selected.activated_at}
                    activeSecondsTotal={selected.active_seconds_total}
                  />
                </TabsContent>

                {/* CONFIGURAÇÕES */}
                <TabsContent value="configuracoes" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div className="p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                    <Label className="text-[12px]">Delay de Resposta (minutos)</Label>
                    <Input
                      type="number" min={0}
                      value={configDraft.delay_resposta_minutos}
                      onChange={(e) => setConfigDraft((d) => ({ ...d, delay_resposta_minutos: Number(e.target.value) || 0 }))}
                      className="mt-1 w-32 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <p className="text-[11px] text-[#767676] mt-1">
                      Espera esse tempo antes de responder — se o lead mandar mais mensagens durante a espera, o relógio reinicia e o agente responde só uma vez, depois que ele parar. 0 = responde na hora.
                    </p>
                  </div>

                  <div className="p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                    <Label className="text-[12px]">Mensagens consideradas no atendimento</Label>
                    <Input
                      type="number" min={1}
                      value={configDraft.mensagens_consideradas}
                      onChange={(e) => setConfigDraft((d) => ({ ...d, mensagens_consideradas: Number(e.target.value) || 30 }))}
                      className="mt-1 w-32 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <p className="text-[11px] text-[#767676] mt-1">
                      Quantidade de mensagens recentes da conversa que o agente considera para gerar respostas.
                    </p>
                  </div>

                  <div className="p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                    <Label className="text-[12px]">Limite de interações da IA por atendimento</Label>
                    <Input
                      type="number" min={0}
                      value={configDraft.limite_interacoes}
                      onChange={(e) => setConfigDraft((d) => ({ ...d, limite_interacoes: Number(e.target.value) || 0 }))}
                      className="mt-1 w-32 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <p className="text-[11px] text-[#767676] mt-1">
                      Número máximo de respostas que a IA pode enviar ao cliente em um mesmo atendimento (a saudação automática não conta).
                      Após enviar esse número de respostas, na próxima mensagem do cliente a IA se despede e: se "Transferir responsável" estiver ativo (aba Comportamento) → transfere para um atendente;
                      se apenas "Finalizar conversa" estiver ativo → encerra o atendimento; se ambos estiverem desativados → a IA para de responder silenciosamente.
                      Exemplo: com 3, a IA responde até 3 vezes — na 4ª mensagem do cliente, se despede e transfere/finaliza. 0 = sem limite.
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                    <div>
                      <div className="text-[13px] font-medium text-[#111111]">Saudação automática</div>
                      <div className="text-[11px] text-[#767676]">Enviar saudação automática ao iniciar conversa.</div>
                    </div>
                    <Switch
                      checked={selected.behavior_config.saudacao_automatica ?? false}
                      onCheckedChange={(v) => updateBehaviorConfig({ saudacao_automatica: v })}
                    />
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-6">
                    <h3 className="text-[14px] font-semibold text-[#111111] mb-3">Restrições</h3>
                    <div className="flex items-center justify-between p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg mb-3">
                      <div>
                        <div className="text-[13px] font-medium text-[#111111]">Restringir tópicos</div>
                        <div className="text-[11px] text-[#767676]">Ativar controle de tópicos permitidos/restritos.</div>
                      </div>
                      <Switch
                        checked={selected.behavior_config.restringir_topicos ?? false}
                        onCheckedChange={(v) => updateBehaviorConfig({ restringir_topicos: v })}
                      />
                    </div>
                    {selected.behavior_config.restringir_topicos && (
                      <div className="space-y-3">
                        <div className="p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                          <Label className="text-[12px]">Tópicos Permitidos</Label>
                          <Textarea
                            value={configDraft.topicos_permitidos}
                            onChange={(e) => setConfigDraft((d) => ({ ...d, topicos_permitidos: e.target.value }))}
                            placeholder="Ex: preços, agendamento, dúvidas sobre o produto"
                            className="mt-1 min-h-[80px] text-[13px] bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                          />
                        </div>
                        <div className="p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                          <Label className="text-[12px]">Tópicos Restritos</Label>
                          <Textarea
                            value={configDraft.topicos_restritos}
                            onChange={(e) => setConfigDraft((d) => ({ ...d, topicos_restritos: e.target.value }))}
                            placeholder="Ex: concorrentes, assuntos jurídicos, política"
                            className="mt-1 min-h-[80px] text-[13px] bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => saveConfigDraft()} disabled={savingKey === "configuracoes"} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                      {savingKey === "configuracoes" && <Loader2 size={14} className="animate-spin" />} Salvar
                    </Button>
                  </div>
                </TabsContent>

                {/* MODELOS */}
                <TabsContent value="modelos" className="p-6 space-y-4 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Modelo de IA</h3>
                    <p className="text-[12px] text-[#767676]">
                      Escolha o modelo que o agente usa para responder e decidir suas ações. Requer a chave da API do provedor correspondente cadastrada em Configurações.
                    </p>
                  </div>
                  {(() => {
                    const rec = recommendModel(selected.objectives, selected.enabled_tools.length);
                    if (rec.modelId === selected.model) return null;
                    return (
                      <div className="flex items-start justify-between gap-3 p-3 bg-[#E1F5EE] rounded-lg">
                        <div className="text-[12px] text-[#128A68]">
                          <span className="font-semibold">Recomendado pra esse agente: {findModelLabel(rec.modelId)}.</span> {rec.reason}
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => changeAgentModel(rec.modelId)}
                          className="h-8 text-[12px] shrink-0 bg-white"
                        >
                          Usar recomendado
                        </Button>
                      </div>
                    );
                  })()}
                  <div className="max-w-[360px] p-3 bg-[#F5F5F5] border border-[#EEEEEE] rounded-lg">
                    <Select value={selected.model} onValueChange={changeAgentModel}>
                      <SelectTrigger className="bg-white focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Anthropic (Claude)</SelectLabel>
                          {IA_MODELS.anthropic.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="flex items-center gap-2">
                                <span>{m.label}</span>
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: IA_COST_STYLES[m.cost].bg, color: IA_COST_STYLES[m.cost].fg }}
                                >
                                  {IA_COST_LABELS[m.cost]}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>OpenAI (ChatGPT)</SelectLabel>
                          {IA_MODELS.openai.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="flex items-center gap-2">
                                <span>{m.label}</span>
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: IA_COST_STYLES[m.cost].bg, color: IA_COST_STYLES[m.cost].fg }}
                                >
                                  {IA_COST_LABELS[m.cost]}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  {(() => {
                    const modelProvider = selected.model.startsWith("gpt-") ? "openai" : "anthropic";
                    const hasKey = modelProvider === "openai" ? hasOpenaiKey : hasAnthropicKey;
                    if (hasKey) return null;
                    return (
                      <div className="flex items-start gap-2.5 p-4 bg-[#FEE2E2] rounded-lg max-w-[360px]">
                        <AlertTriangle size={16} className="text-[#991B1B] mt-0.5 shrink-0" />
                        <div className="text-[13px] text-[#991B1B]">
                          Sem chave da {modelProvider === "openai" ? "OpenAI" : "Anthropic"} cadastrada — cadastre em Configurações para o agente conseguir usar esse modelo.
                        </div>
                      </div>
                    );
                  })()}
                </TabsContent>

                {/* FERRAMENTAS */}
                <TabsContent value="ferramentas" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Ferramentas do CRM</h3>
                    <p className="text-[12px] text-[#767676]">
                      Quais operações do CRM esse agente pode chamar durante a conversa. Ferramentas "Destrutiva" (excluir) ainda não estão liberadas.
                    </p>
                  </div>
                  <div className="flex items-start justify-between gap-3 p-3 bg-[#F5F5F5] rounded-lg">
                    <div className="text-[12px] text-[#666666]">
                      <span className="font-medium text-[#111111]">Quer que o agente saiba de vendas feitas em ferramentas externas</span> (Hotmart, Kiwify, etc.)? Configure um Webhook de entrada em Configurações → Integrações e mapeie os campos de produto/valor — as vendas aparecem automaticamente aqui e na Performance.
                    </div>
                    <Button variant="outline" onClick={() => navigate("/configuracoes/integracoes")} className="h-8 text-[12px] shrink-0">
                      Ir pra Integrações
                    </Button>
                  </div>
                  {AGENT_TOOL_ENTITIES.map((entity) => {
                    const tools = AGENT_TOOLS.filter((t) => t.entity === entity);
                    return (
                      <div key={entity}>
                        <h4 className="text-[11px] uppercase tracking-wide text-[#767676] font-semibold mb-2">{entity}</h4>
                        <div className="space-y-1.5">
                          {tools.map((t) => {
                            const disabled = t.category === "destrutiva" || !t.implemented;
                            const catStyle = AGENT_TOOL_CATEGORY_STYLES[t.category];
                            return (
                              <label
                                key={t.id}
                                className={`flex items-start gap-3 p-2.5 border border-[#EEEEEE] rounded-lg ${
                                  disabled ? "opacity-50 cursor-not-allowed bg-[#FAFAFA]" : "cursor-pointer bg-white"
                                }`}
                              >
                                <Checkbox
                                  className="mt-0.5"
                                  disabled={disabled}
                                  checked={selected.enabled_tools.includes(t.id)}
                                  onCheckedChange={(checked) => toggleTool(t.id, checked === true)}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[13px] font-medium text-[#111111]">{t.label}</span>
                                    <span
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                      style={{ background: catStyle.bg, color: catStyle.fg }}
                                    >
                                      {AGENT_TOOL_CATEGORY_LABELS[t.category]}
                                    </span>
                                    {!t.implemented && t.category !== "destrutiva" && (
                                      <span className="text-[10px] text-[#767676]">(em implementação)</span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[#767676]">{t.description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

                {/* INSTRUÇÕES */}
                <TabsContent value="instrucoes" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Instruções</h3>
                    <p className="text-[12px] text-[#767676]">
                      Defina como o agente deve se comportar, responder e tomar decisões.
                    </p>
                  </div>
                  <div>
                    <Textarea
                      value={customContext}
                      onChange={(e) => setCustomContext(e.target.value.slice(0, 2000))}
                      placeholder="Ex: Use um tom direto e informal. Nossos clientes costumam perguntar sobre X — sempre responda que..."
                      className="min-h-[200px] text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <div className="text-right text-[11px] text-[#767676] mt-1">{customContext.length} / 2000</div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => saveCustomContext()} disabled={savingKey === "instrucoes"} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                      {savingKey === "instrucoes" && <Loader2 size={14} className="animate-spin" />} Salvar
                    </Button>
                  </div>
                </TabsContent>

                {wizardMode && (() => {
                  // Passo a passo de verdade: só libera avançar quando a
                  // etapa atual tem o mínimo preenchido. As demais etapas
                  // (Comportamento, Configurações, Ferramentas, Modelo,
                  // Integrações, KB, Instruções) já vêm com valor padrão
                  // válido, então não têm nada "obrigatório" pra travar.
                  const currentStepValue = effectiveWizardSteps[wizardStepIndex]?.v;
                  const canAdvance =
                    currentStepValue === "perfil" ? (
                      selected.objectives.length > 0 &&
                      (!selected.objectives.includes("qualificar") || (selected.behavior_config.campos_qualificacao ?? []).length > 0)
                    ) :
                    currentStepValue === "closers" ? closerIds.length > 0 :
                    true;
                  return (
                  <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-[#EEEEEE] shrink-0">
                    <Button
                      variant="outline"
                      onClick={() => setWizardStepIndex((i) => Math.max(0, i - 1))}
                      disabled={wizardStepIndex === 0}
                    >
                      Voltar
                    </Button>
                    {wizardStepIndex < effectiveWizardSteps.length - 1 ? (
                      <Button onClick={() => advanceWizard(effectiveWizardSteps.length)} disabled={!canAdvance} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                        Avançar
                      </Button>
                    ) : (
                      <Button onClick={finalizeAgent} disabled={!canAdvance} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                        Criar
                      </Button>
                    )}
                  </div>
                  );
                })()}
                {!wizardMode && (
                  <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-[#EEEEEE] shrink-0">
                    <Button variant="outline" onClick={() => { setView("grid"); setSelectedId(null); }}>
                      ← Voltar pra grade
                    </Button>
                    <Button onClick={updateAgent} disabled={savingKey === "agente" || !isAgentDirty} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                      {savingKey === "agente" && <Loader2 size={14} className="animate-spin" />} Atualizar agente
                    </Button>
                  </div>
                )}
              </Tabs>
              );
            })()}
          </div>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Novo agente</DialogTitle>
            <DialogDescription>Crie um novo agente para organizar seus itens.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[12px]">Nome do agente</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Ex: Agente SDS"
                className="mt-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
            </div>
            <div>
              <Label className="text-[12px]">Descrição</Label>
              <Textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="Ex: Agente que qualifica leads do Instagram"
                className="mt-1 min-h-[70px] text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
              />
              <p className="text-[11px] text-[#767676] mt-1">
                Esse campo é apenas para organização. Não afeta o comportamento da IA.
              </p>
            </div>
            <div>
              <Label className="text-[12px]">Ícone</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {Object.entries(AGENT_AVATARS).map(([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraftAvatar(key)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                      draftAvatar === key
                        ? "bg-[#128A68] text-white"
                        : "bg-[#F5F5F5] text-[#666666] hover:bg-[#EEEEEE]"
                    }`}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#767676] mt-1">Meramente ilustrativo.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={createAgent} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">Criar e continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kbModalOpen} onOpenChange={setKbModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingKbId ? "Editar Base de Conhecimento" : "Criar Base de Conhecimento"}</DialogTitle>
            <DialogDescription>
              Crie sua base de conhecimento navegando pelas abas abaixo preenchendo as informações que vão auxiliar a IA a encontrar as respostas dentro de sua base.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={kbModalStep} onValueChange={(v) => setKbModalStep(v as "config" | "arquivos")}>
            <TabsList className="bg-[#F5F5F5] p-1 h-auto gap-1">
              <TabsTrigger value="config" className="data-[state=active]:bg-white data-[state=active]:shadow-none rounded-md text-[13px] px-3 py-1.5">
                Configurações
              </TabsTrigger>
              <TabsTrigger
                value="arquivos"
                disabled={!editingKbId}
                className="data-[state=active]:bg-white data-[state=active]:shadow-none rounded-md text-[13px] px-3 py-1.5"
              >
                Arquivos {editingKbId ? docs.filter((d) => d.knowledge_base_id === editingKbId).length : 0}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-4 pt-4 mt-0">
              <div>
                <Label className="text-[12px]">Nome</Label>
                <Input
                  value={kbDraftName}
                  onChange={(e) => setKbDraftName(e.target.value)}
                  placeholder="ex: Base de Conhecimento Técnica"
                  className="mt-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[12px]">Descrição</Label>
                  <span className="flex items-center gap-1 text-[11px] text-[#128A68]">
                    <Info size={12} /> Usada como instrução pela IA
                  </span>
                </div>
                <Textarea
                  value={kbDraftDescription}
                  onChange={(e) => setKbDraftDescription(e.target.value)}
                  placeholder="Ex: Use esta KB para responder dúvidas sobre produtos, preços e políticas de devolução..."
                  className="mt-1 min-h-[140px] text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                />
                <p className="text-[11px] text-[#767676] mt-1">
                  Esta descrição é usada como instrução para o agente entender quando e como utilizar esta base de conhecimento. Seja específico sobre o conteúdo e os casos de uso.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={saveKbConfig} disabled={savingKey === "kb"} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                  {savingKey === "kb" && <Loader2 size={14} className="animate-spin" />} Salvar
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="arquivos" className="space-y-4 pt-4 mt-0">
              <div className="flex items-center gap-2">
                <Input
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Buscar arquivos..."
                  className="flex-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                />
                <label>
                  <input
                    type="file"
                    accept=".pdf,.txt,.csv,.html,.htm,.json"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button asChild variant="outline" disabled={uploading} className="cursor-pointer">
                    <span>{uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar arquivo</span>
                  </Button>
                </label>
              </div>

              {(() => {
                const kbDocs = docs
                  .filter((d) => d.knowledge_base_id === editingKbId)
                  .filter((d) => d.file_name.toLowerCase().includes(docSearch.toLowerCase()));
                if (kbDocs.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <FileText size={32} color="#E5E5E5" />
                      <p className="text-[13px] text-[#111111] font-medium mt-3">Nenhum arquivo adicionado</p>
                      <p className="text-[11px] text-[#767676] mt-1">Clique em "Adicionar arquivo" pra fazer upload.</p>
                      <p className="text-[11px] text-[#767676] mt-1">PDF, TXT, CSV, HTML, JSON — máx. 50MB</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {kbDocs.map((d) => {
                      const badge = STATUS_BADGE[d.status];
                      return (
                        <div key={d.id} className="group flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg hover:bg-[#F5F5F5] transition-colors">
                          <Checkbox
                            checked={d.enabled}
                            onCheckedChange={(checked) => toggleDocEnabled(d, checked === true)}
                            title="O agente pode usar este documento"
                          />
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
                          <button onClick={() => deleteDoc(d)} className="opacity-0 group-hover:opacity-100 text-[#767676] hover:text-[#E24B4A] transition-opacity">
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <DialogFooter>
                <Button onClick={() => setKbModalOpen(false)} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">Salvar</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatActiveHours(activeSecondsTotal: number, active: boolean, activatedAt: string | null): string {
  const liveSeconds = active && activatedAt ? Math.max(0, Math.floor((Date.now() - new Date(activatedAt).getTime()) / 1000)) : 0;
  const totalHours = (activeSecondsTotal + liveSeconds) / 3600;
  return totalHours < 10 ? totalHours.toFixed(1) : String(Math.round(totalHours));
}

function PerformanceTab({
  agentId, companyId, closerIds, active, activatedAt, activeSecondsTotal,
}: {
  agentId: string; companyId: string; closerIds: string[];
  active: boolean; activatedAt: string | null; activeSecondsTotal: number;
}) {
  const [loading, setLoading] = useState(true);
  const [meetingsCount, setMeetingsCount] = useState(0);
  const [qualified, setQualified] = useState(0);
  const [notQualified, setNotQualified] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [salesValue, setSalesValue] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ count: meetings }, { data: leadsData }, { data: usageData }, { data: wonData }] = await Promise.all([
        closerIds.length
          ? supabase.from("activities").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("type", "meeting").in("owner_id", closerIds).gte("scheduled_at", sevenDaysAgo)
          : Promise.resolve({ count: 0 }),
        supabase.from("leads").select("tags").eq("company_id", companyId).contains("tags", ["SDS: Qualificado"]),
        supabase.from("agent_usage_log").select("cost_usd").eq("agent_id", agentId).gte("created_at", sevenDaysAgo),
        // "Vendas feitas": leads.status='won' da empresa no período -- não é
        // atribuído estritamente a este agente (não existe agent_id em
        // leads hoje), mesma limitação já aceita pra "leads qualificados".
        // stage_entered_at é o proxy disponível pra "quando foi ganho" --
        // leads não tem updated_at, e status='won' normalmente acompanha
        // entrar numa etapa de "Ganho" no pipeline.
        supabase.from("leads").select("value").eq("company_id", companyId).eq("status", "won").gte("stage_entered_at", sevenDaysAgo),
      ]);
      setMeetingsCount(meetings ?? 0);
      setQualified((leadsData ?? []).length);
      setCostUsd((usageData ?? []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0));
      setSalesCount((wonData ?? []).length);
      setSalesValue((wonData ?? []).reduce((sum, r) => sum + (Number(r.value) || 0), 0));
      const { data: notQualifiedData } = await supabase.from("leads").select("tags").eq("company_id", companyId).contains("tags", ["SDS: Não qualificado"]);
      setNotQualified((notQualifiedData ?? []).length);
      setLoading(false);
    })();
  }, [agentId, companyId, closerIds]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-[#767676]" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase text-[#767676]"><CheckCircle2 size={12} /> Reuniões (7 dias)</div>
          <div className="text-[24px] font-bold text-[#111111] mt-1">{meetingsCount}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="text-[11px] uppercase text-[#767676]">Leads qualificados</div>
          <div className="text-[24px] font-bold text-[#128A68] mt-1">{qualified}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="text-[11px] uppercase text-[#767676]">Não qualificados</div>
          <div className="text-[24px] font-bold text-[#767676] mt-1">{notQualified}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="text-[11px] uppercase text-[#767676]">Valor gasto (7 dias)</div>
          <div className="text-[24px] font-bold text-[#111111] mt-1">${costUsd.toFixed(2)}</div>
          <div className="text-[10px] text-[#CCCCCC] mt-0.5">custo de tokens de IA</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="text-[11px] uppercase text-[#767676]">Horas ativas</div>
          <div className="text-[24px] font-bold text-[#111111] mt-1">{formatActiveHours(activeSecondsTotal, active, activatedAt)}h</div>
          <div className="text-[10px] text-[#CCCCCC] mt-0.5">desde que foi ativado a 1ª vez</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="text-[11px] uppercase text-[#767676]">Vendas feitas (7 dias)</div>
          <div className="text-[24px] font-bold text-[#128A68] mt-1">{salesCount}</div>
          <div className="text-[10px] text-[#CCCCCC] mt-0.5">R$ {salesValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · toda a empresa</div>
        </div>
      </div>
      <p className="text-[11px] text-[#767676]">
        Leads qualificados e vendas feitas contam pra empresa toda no período — ainda não é possível atribuir um negócio a um agente específico.
      </p>
    </div>
  );
}
