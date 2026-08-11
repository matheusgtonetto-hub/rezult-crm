import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  User,
  BrainCircuit,
  SlidersHorizontal,
  Users,
  Plug,
  Settings,
  Wrench,
  TrendingUp,
  ArrowRight,
  Check,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Webhook,
  Link2,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { AGENT_TOOLS, AGENT_TOOL_ENTITIES, AGENT_TOOL_CATEGORY_LABELS, AGENT_TOOL_CATEGORY_STYLES, ferramentasRecomendadas } from "@/lib/agent-tools";
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
import { AgentActivationTagPicker } from "@/components/AgentActivationTagPicker";

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
  { v: "configuracoes", l: "Configurações" },
  { v: "comportamento", l: "Comportamento" },
  { v: "closers", l: "Vendedores" },
  { v: "ferramentas", l: "Ferramentas" },
  { v: "integracoes", l: "Integrações" },
  { v: "kb", l: "Base de Conhecimento" },
  { v: "instrucoes", l: "Instruções" },
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
// Andaimes da aba "Instruções". Clicar num chip escreve o título markdown no
// texto; o conteúdo é do usuário.
//
// Por que estas quatro e não Persona/Objetivo/Tom: cada uma cobre algo que NÃO
// tem campo em nenhuma outra aba. Tom e Objetivo têm -- e não são texto, são
// configuração que muda o sistema (estilo define a temperatura do modelo,
// objetivo define quais ferramentas o agente recebe). Um chip convidando a
// escrever sobre eles criaria uma segunda fonte de verdade que perde a briga
// em silêncio, porque o parâmetro já foi enviado antes de o texto ser lido.
//
// Título markdown não é enfeite: as instruções entram cruas no system prompt,
// e seção nomeada melhora a aderência do modelo.
// "Casos específicos" é a regra condicional ("se acontecer X, faça Y"). Não é
// fato da empresa, não é política comercial, não é objeção e não é exemplo, e
// também não cabe nas instruções por objetivo, porque atravessa todos eles.
// Era o único tipo de regra sem casa em lugar nenhum do produto.
// "Sobre os produtos" existe porque não há outra fonte para isso no agente
// mais comum do produto. A tabela `products` guarda nome, sku e valor, sem
// campo de descrição, então listar_produtos entrega uma tabela de preços pelada
// ("Consulta avulsa, 250,00"). E a Base de Conhecimento só é consultada quando
// o objetivo Atendimento está marcado -- um agente que qualifica e agenda nunca
// encosta nela. Sem esta seção, ele não sabe o que a empresa vende.
const SECOES_INSTRUCOES = [
  "Sobre a empresa",
  "Sobre os produtos",
  "Regras de negócio",
  "Objeções comuns",
  "Casos específicos",
  "Exemplos de resposta",
];

// O placeholder mostra as cinco seções preenchidas, não só as duas primeiras:
// o chip escreve o título e deixa o usuário diante de uma linha em branco, e
// título sem exemplo não diz o que se espera embaixo dele. "Objeções comuns"
// e "Casos específicos" são justamente os que ninguém adivinha sozinho.
//
// Os exemplos são deliberadamente sem ramo: quem lê precisa reconhecer a FORMA
// da frase e trocar o conteúdo pelo negócio dele. Exemplo de clínica ensina a
// escrever sobre clínica, e a maior parte de quem monta agente aqui não tem
// uma.
//
// "Exemplos de resposta" vem como PAR (o que o cliente manda / como o agente
// devolve). Uma frase solta ali não é exemplo de resposta, é exemplo de
// abertura, e o modelo aprende muito mais da correspondência pergunta-resposta
// do que de uma frase sem o que a motivou.
const PLACEHOLDER_INSTRUCOES = [
  "Ex:",
  "",
  "# Sobre a empresa",
  "Atendemos clientes em todo o Brasil, presencial e online. Trabalhamos com planos mensais e projetos avulsos.",
  "",
  "# Sobre os produtos",
  "Plano mensal a partir de R$ 300, com acompanhamento incluído. Projeto avulso é orçado conforme o escopo.",
  "",
  "# Regras de negócio",
  "Nunca informe valores antes de entender a necessidade do cliente.",
  "",
  "# Objeções comuns",
  '"Está caro": lembre que a primeira conversa é gratuita e sem compromisso.',
  "",
  "# Casos específicos",
  "Se o contato já for cliente, trate como suporte e não como venda nova.",
  "",
  "# Exemplos de resposta",
  'Cliente: "quanto custa?"',
  'Resposta: "Depende do que você precisa. Me conta rapidinho o seu caso que eu te passo certinho."',
].join("\n");

const DEFAULT_AVATAR = "bot";
function AgentAvatarIcon({ avatar, size = 18 }: { avatar: string | null; size?: number }) {
  const Icon = AGENT_AVATARS[avatar ?? ""] ?? Bot;
  return <Icon size={size} />;
}

type BehaviorConfig = {
  finalizar_conversa?: boolean;
  transferir_responsavel?: boolean;
  // Para QUEM a conversa vai quando o agente transfere. Sem isso a
  // "transferência" só desligava o agente e não entregava a conversa a
  // ninguém.
  transferir_responsavel_user_id?: string | null;
  // Quem recebe a conversa quando o agente escala por não conseguir
  // resolver. Sem ninguém, a escalação vira só uma nota que ninguém lê.
  escalar_humano_user_id?: string | null;
  estilo_comunicacao?: "normal" | "formal" | "descontraida";
  persona_voz?: "propria" | "equipe";
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
  // Delay em SEGUNDOS. A chave antiga (delay_resposta_minutos) ainda é lida
  // pelo backend para agentes criados antes da mudança.
  delay_resposta_segundos?: number;
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
  // fuso_horario também é usado pelo horário de atendimento abaixo (aba
  // Perfil) -- é o mesmo fuso pras duas coisas, não faz sentido pedir 2x.
  fuso_horario?: string;
  duracao_reuniao_minutos?: number;
  intervalo_entre_reunioes?: boolean;
  intervalo_minutos?: number;
  // Desligado = agenda só no calendário do Rezult (activities), sem exigir
  // vendedor com Google conectado nem gerar link de vídeo. Ligado (padrão,
  // preserva o comportamento de sempre) = exige Google Calendar do
  // vendedor, com Meet como sub-opção.
  google_calendar_ativo?: boolean;
  incluir_google_meet?: boolean;
  confirmar_antes_criar_evento?: boolean;
  // Aba Configurações -- janela de horário em que o agente responde
  // mensagens (HH:mm, no fuso de fuso_horario). Desativado = responde a
  // qualquer hora (comportamento de hoje, preservado pra quem não mexer
  // nisso). horario_atendimento_dias = dias da semana em que a janela vale;
  // undefined = todos os dias (mesmo comportamento de antes dos dias
  // existirem como opção).
  horario_atendimento_ativo?: boolean;
  horario_atendimento_inicio?: string;
  horario_atendimento_fim?: string;
  horario_atendimento_dias?: string[];
  lembrete_reuniao_ativo?: boolean;
  lembrete_1_valor?: number;
  lembrete_1_unidade?: "minutos" | "horas";
  lembrete_2_valor?: number;
  lembrete_2_unidade?: "minutos" | "horas";
};

const BEHAVIOR_DEFAULTS: Required<Omit<BehaviorConfig, "campos_qualificacao" | "objective_instructions">> = {
  finalizar_conversa: false,
  transferir_responsavel: false,
  transferir_responsavel_user_id: null,
  escalar_humano_user_id: null,
  estilo_comunicacao: "normal",
  // Padrão: o agente É a empresa. É o caso mais comum (negócio pequeno,
  // profissional solo) e evita a conversa em terceira pessoa que soa como
  // intermediário. Quem tem time atendendo troca para "equipe".
  persona_voz: "propria",
  usar_emojis: false,
  assinar_nome: false,
  // Ligado por padrão: no WhatsApp, bloco de 150+ palavras numa mensagem só
  // parece e-mail e cansa de ler. Gente escreve em mensagens curtas
  // seguidas, e o agente acompanha isso (com "digitando..." entre elas).
  // Quem quiser mensagem única desliga. Só vale pra agente NOVO -- os que já
  // existem mantêm o que está salvo.
  dividir_mensagens: true,
  dividir_mensagens_palavras: 20,
  followup_ativo: false,
  followup_max_tentativas: 3,
  followup_intervalo_valor: 30,
  followup_intervalo_unidade: "minutos",
  followup_transferir_automacao: false,
  followup_automacao_id: null,
  // 20s cobre a maioria das digitações longas sem o agente responder no meio
  // da frase. Não dá para esperar o lead parar de digitar (ver comentário em
  // dapi-webhook), então o delay é o que temos -- e 20 é o ponto em que a
  // conversa ainda parece viva. Quem quiser, muda.
  delay_resposta_segundos: 20,
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
  google_calendar_ativo: true,
  incluir_google_meet: true,
  confirmar_antes_criar_evento: false,
  // Agente novo já nasce restrito a horário comercial. Sem isso ele responde
  // de madrugada e no fim de semana por padrão, o que quase nenhum negócio
  // quer -- e quem quer, desliga. Alterar dali é decisão do usuário.
  horario_atendimento_ativo: true,
  horario_atendimento_inicio: "08:00",
  horario_atendimento_fim: "18:00",
  horario_atendimento_dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
  // Lembrete desligado por padrão, mas com os valores mais usados já
  // preenchidos (24h antes + 1h antes) — quem ligar não precisa pensar.
  lembrete_reuniao_ativo: false,
  lembrete_1_valor: 24,
  lembrete_1_unidade: "horas",
  lembrete_2_valor: 1,
  lembrete_2_unidade: "horas",
};

// Draft único que cobre TODO behavior_config (incluindo campos_qualificacao/
// objective_instructions, de fora do BEHAVIOR_DEFAULTS) -- consolida o que
// antes eram 3 cópias separadas (follow-up/configurações/agendamento) que se
// sobrescreviam entre si ao salvar cada uma isoladamente.
const BEHAVIOR_DRAFT_DEFAULTS: Required<BehaviorConfig> = {
  ...BEHAVIOR_DEFAULTS,
  // Agentes criados antes de a restrição de horário existir não têm essas
  // chaves salvas. Herdar o padrão NOVO aqui faria a tela mostrá-los
  // restritos, e o primeiro "Atualizar agente" gravaria isso -- passariam a
  // ignorar mensagens fora do horário sem ninguém ter pedido. O padrão de
  // criação vale só na criação.
  horario_atendimento_ativo: false,
  horario_atendimento_fim: "21:00",
  horario_atendimento_dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
  // Idem para o delay: agente existente mantém o que tem (0 ou o convertido
  // de minutos), não herda os 20s de agente novo.
  delay_resposta_segundos: 0,
  campos_qualificacao: [],
  objective_instructions: {},
};

const AGENT_TIMEZONES = [
  { value: "America/Noronha", label: "Fernando de Noronha (UTC-2)" },
  { value: "America/Sao_Paulo", label: "Brasília (UTC-3)" },
  { value: "America/Manaus", label: "Manaus (UTC-4)" },
  { value: "America/Rio_Branco", label: "Acre (UTC-5)" },
];

// Recomendação de modelo (passo "Modelo" do wizard de criação e aba
// Modelos) -- regras simples baseadas nas escolhas já feitas nos passos
// anteriores, não é IA nem aprendizado de máquina. Os sinais usados aqui são
// só os campos que realmente entram no prompt/tools que o modelo recebe em
// agent-sds-qualify/index.ts (buildDynamicSystemPrompt, buildBehaviorPromptExtra,
// buildDynamicTools, retrieveKbContext) -- Vendedores e Integrações ficam de
// fora de propósito: confirmado que nenhuma edge function lê
// agent_whatsapp_connections/agent_meta_connections/agent_webhook_integrations/
// agent_calendar_connections, e leads-webhook (Hotmart/Kiwify) roda
// desacoplado do agente, sem tocar no prompt.
type ComplexitySignals = {
  objectives: string[];
  toolCount: number; // enabledTools + finalizar_conversa/transferir_responsavel (cada um vira 1 tool definition a mais)
  customContextLength: number; // aba Instruções
  objectiveInstructionsLength: number; // soma das instruções por objetivo, aba Perfil
  qualFieldsCount: number; // campos_qualificacao, aba Comportamento
  kbDocsCount: number; // documentos habilitados na Base de Conhecimento (só pesa se objetivo "atendimento")
};

type ComplexityFactor = { label: string; weight: number };

function computeComplexityFactors(s: ComplexitySignals): ComplexityFactor[] {
  const factors: ComplexityFactor[] = [];
  if (s.objectives.includes("atendimento")) {
    factors.push({ label: "atendimento com Base de Conhecimento pede mais raciocínio contextual", weight: 2 });
    if (s.kbDocsCount >= 8) factors.push({ label: `Base de Conhecimento extensa (${s.kbDocsCount} documentos)`, weight: 1.5 });
    else if (s.kbDocsCount >= 3) factors.push({ label: `Base de Conhecimento com ${s.kbDocsCount} documentos`, weight: 0.5 });
  }
  if (s.toolCount >= 8) factors.push({ label: `${s.toolCount} ferramentas habilitadas exigem mais capacidade de decisão`, weight: 2 });
  else if (s.toolCount >= 4) factors.push({ label: `${s.toolCount} ferramentas habilitadas`, weight: 1 });
  if (s.customContextLength > 800) factors.push({ label: "instruções longas e detalhadas", weight: 2 });
  else if (s.customContextLength > 300) factors.push({ label: "instruções com bastante conteúdo", weight: 1 });
  if (s.objectiveInstructionsLength > 400) factors.push({ label: "instruções específicas extensas por objetivo", weight: 1 });
  if (s.qualFieldsCount >= 6) factors.push({ label: `mapeamento de ${s.qualFieldsCount} campos de qualificação`, weight: 1.5 });
  else if (s.qualFieldsCount >= 3) factors.push({ label: `mapeamento de ${s.qualFieldsCount} campos de qualificação`, weight: 0.5 });
  return factors;
}

function recommendModel(signals: ComplexitySignals): { modelId: string; reason: string } {
  const factors = computeComplexityFactors(signals);
  const score = factors.reduce((sum, f) => sum + f.weight, 0);

  if (factors.length === 0) {
    return { modelId: "claude-haiku-4-5-20251001", reason: "Fluxo simples -- um modelo mais rápido e barato já é suficiente." };
  }

  const top = [...factors].sort((a, b) => b.weight - a.weight).slice(0, 2).map((f) => f.label).join("; ");
  if (score >= 5) {
    return { modelId: "claude-opus-5", reason: `Configuração com bastante complexidade (${top}) -- vale a capacidade extra do Opus.` };
  }
  if (score <= 1) {
    return { modelId: "claude-haiku-4-5-20251001", reason: "Fluxo simples -- um modelo mais rápido e barato já é suficiente." };
  }
  return { modelId: "claude-sonnet-5", reason: `Equilíbrio entre inteligência e custo, considerando ${top}.` };
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
  // Tag que liga este agente num negócio. O lead com essa tag no card é
  // atendido por ele. Única por empresa (índice no banco).
  activation_tag: string | null;
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
// Padrão ÚNICO de disponibilidade: segunda a sexta, 08:00 às 18:00. Vale
// tanto ao marcar o vendedor quanto ao exibir quem ainda não tem
// configuração salva. Mudar dali é decisão do usuário.
//
// Antes eram duas funções: uma com todos os dias FECHADOS, usada para exibir,
// e outra com segunda a sexta, usada ao selecionar. A tela mostrava tudo
// fechado para quem não tinha configuração, o que significa "o agente não
// marca nada com essa pessoa" -- o oposto da intenção.
const defaultCloserAvailability = (): WorkDay[] =>
  CLOSER_AVAILABILITY_DAYS.map((day) => ({
    day,
    active: day !== "Sábado" && day !== "Domingo",
    intervals: [{ start: "08:00", end: "18:00" }],
  }));

// DOCX fica de fora por enquanto — agent-kb-ingest ainda não tem extração
// pra esse formato (sem biblioteca confirmada compatível com Deno).
// Instruções da empresa entram INTEIRAS no prompt de toda execução do agente,
// então este limite é custo por mensagem, não só espaço de tela. A coluna no
// banco é `text`, sem limite -- o corte sempre foi só aqui.
const LIMITE_INSTRUCOES = 50000;

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
  const [draftActivationTag, setDraftActivationTag] = useState<string | null>(null);
  // tag -> nome do agente que já a usa. Alimenta o seletor, que mostra a tag
  // bloqueada com o nome do dono em vez de escondê-la (esconder faria o
  // usuário procurar uma tag que ele sabe que existe, sem entender o sumiço).
  const tagsOcupadasPorAgente = useMemo(() => {
    const mapa: Record<string, { id: string; name: string }> = {};
    for (const a of agents) if (a.activation_tag) mapa[a.activation_tag] = { id: a.id, name: a.name };
    return mapa;
  }, [agents]);
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
  // Rascunho único de tudo que é campo do agente (fora do wizard, nada disso
  // grava sozinho -- só via "Atualizar agente", ver commitX()/updateAgent()
  // mais abaixo). No wizard, cada handler ainda commita na hora.
  const [objectivesDraft, setObjectivesDraft] = useState<string[]>([]);
  const [behaviorDraft, setBehaviorDraft] = useState<Required<BehaviorConfig>>(BEHAVIOR_DRAFT_DEFAULTS);
  const [enabledToolsDraft, setEnabledToolsDraft] = useState<string[]>([]);
  // Etapa "Ferramentas": o catálogo inteiro fica atrás de um botão. Aberto de
  // saída, ele é uma parede de 70 caixas que faz parecer que o agente precisa
  // de alguma coisa ali -- e não precisa de nenhuma.
  const [verTodasFerramentas, setVerTodasFerramentas] = useState(false);
  // Etapa "Integrações": chip de categoria selecionado. "Todos" mostra a
  // grade inteira, que é o estado em que a etapa abre.
  const [catIntegracao, setCatIntegracao] = useState("Todos");
  const [modelDraft, setModelDraft] = useState("");
  const [manualAutomations, setManualAutomations] = useState<AutomationOption[]>([]);
  // Etapa "Integrações" -- listas de conexões existentes na empresa (não
  // dependem do agente selecionado) + quais delas este agente usa.
  const [whatsappConnections, setWhatsappConnections] = useState<WhatsappConnectionOption[]>([]);
  // Meta segue sendo carregado e salvo, mas hoje não aparece na etapa: a
  // integração de Instagram/Messenger ainda não está pronta. Não apagar a
  // carga junto -- é ela que faz a categoria voltar sem retrabalho.
  const [metaConnections, setMetaConnections] = useState<MetaConnectionOption[]>([]);
  const [webhookIntegrations, setWebhookIntegrations] = useState<WebhookIntegrationOption[]>([]);
  const [agentWhatsappIds, setAgentWhatsappIds] = useState<string[]>([]);
  const [agentMetaIds, setAgentMetaIds] = useState<string[]>([]);
  const [agentWebhookIds, setAgentWebhookIds] = useState<string[]>([]);
  // Calendar não é uma lista de conexões da empresa -- vem dos vendedores
  // com Google Calendar conectado, escolhidos na etapa "Vendedores".
  const [agentCalendarEnabled, setAgentCalendarEnabled] = useState<Record<string, boolean>>({});
  // Baselines (o que já está de fato salvo) dos domínios de lista/relação --
  // closerIds/agentWhatsappIds/etc. acima viram "working state" (o que tá na
  // tela); comparar contra essas cópias é como isAgentDirty sabe o que
  // mudou, e é a partir do diff working-vs-saved que updateAgent() decide o
  // que inserir/apagar/upsertar em cada tabela.
  const [closerIdsSaved, setCloserIdsSaved] = useState<string[]>([]);
  const [closerAvailabilitySaved, setCloserAvailabilitySaved] = useState<Record<string, WorkDay[]>>({});
  const [agentWhatsappIdsSaved, setAgentWhatsappIdsSaved] = useState<string[]>([]);
  const [agentMetaIdsSaved, setAgentMetaIdsSaved] = useState<string[]>([]);
  const [agentWebhookIdsSaved, setAgentWebhookIdsSaved] = useState<string[]>([]);
  const [agentCalendarEnabledSaved, setAgentCalendarEnabledSaved] = useState<Record<string, boolean>>({});

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const loadAgents = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: agentsData }, { data: aiProviders }, { data: membersData }, { data: automationsData }, { data: whatsappData }, { data: metaData }, { data: webhookData }] =
      await Promise.all([
        supabase.from("agents").select("id, type, name, description, avatar, active, model, custom_context, objectives, enabled_tools, behavior_config, activation_tag, activated_at, active_seconds_total, draft").eq("company_id", companyId).order("created_at"),
        // Via RPC, não lendo a tabela: ai_provider_keys é owner-only (o valor
        // da chave não pode vazar pros membros), então um membro lia zero
        // linhas e a tela dizia "cadastre sua chave" com a chave cadastrada.
        // A função devolve só os nomes dos provedores que têm chave ativa.
        supabase.rpc("company_ai_providers", { p_company_id: companyId }),
        supabase.rpc("get_company_members", { p_company_id: companyId }),
        supabase.from("automations").select("id, name, flow").eq("company_id", companyId).eq("active", true),
        supabase.from("whatsapp_connections").select("id, name, phone, provider, connected").eq("company_id", companyId).order("created_at"),
        supabase.from("meta_connections").select("id, provider, page_name, instagram_username, active").eq("company_id", companyId).order("created_at"),
        supabase.from("webhook_integrations").select("id, name, type, active").eq("company_id", companyId).order("created_at"),
      ]);
    setAgents(agentsData ?? []);
    const provedores = new Set(((aiProviders ?? []) as { provider: string }[]).map((p) => p.provider));
    setHasAnthropicKey(provedores.has("anthropic"));
    setHasOpenaiKey(provedores.has("openai"));
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
    setObjectivesDraft(selected?.objectives ?? []);
    // Normaliza o delay antigo (minutos) aqui, e não na exibição: como os
    // padrões já trazem delay_resposta_segundos definido, um `??` na tela
    // nunca dispararia -- o campo mostraria 0 enquanto o backend esperava 60.
    const cfgSalva = selected?.behavior_config ?? {};
    const delayNormalizado = cfgSalva.delay_resposta_segundos !== undefined
      ? cfgSalva.delay_resposta_segundos
      : (cfgSalva.delay_resposta_minutos ?? 0) * 60;
    setBehaviorDraft({ ...BEHAVIOR_DRAFT_DEFAULTS, ...cfgSalva, delay_resposta_segundos: delayNormalizado });
    setEnabledToolsDraft(selected?.enabled_tools ?? []);
    setModelDraft(selected?.model ?? "");
    setDocSearch("");
    setKbSearch("");
    // Filtros de tela não são do agente, são de quem está olhando: trocar de
    // agente com um chip de categoria preso do anterior esconderia conexões
    // sem motivo aparente.
    setCatIntegracao("Todos");
    setVerTodasFerramentas(false);
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
      const closerIdsLoaded = (closersData ?? []).map((c) => c.user_id as string);
      setCloserIds(closerIdsLoaded);
      setCloserIdsSaved(closerIdsLoaded);
      // memberCalendarConnected/memberCalendarEmail NÃO resetam aqui -- é
      // status de conexão do Google Calendar por usuário da empresa, não por
      // agente, então persiste ao trocar de agente (resetar forçaria o efeito
      // de baixo a rebuscar, mas ele só depende de [members, selectedId,
      // companyId] -- sem memberCalendarConnected nos deps ele nunca notaria
      // o reset e ficaria travado em "Verificando..." pra sempre).
      setCloserAvailability({});
      setCloserAvailabilitySaved({});
      setDocs((docsData ?? []) as KnowledgeDoc[]);
      setKbs((kbsData ?? []) as KnowledgeBase[]);
      const waIdsLoaded = (waLinks ?? []).map((r) => r.connection_id as string);
      const metaIdsLoaded = (metaLinks ?? []).map((r) => r.connection_id as string);
      const webhookIdsLoaded = (webhookLinks ?? []).map((r) => r.connection_id as string);
      const calendarLoaded = Object.fromEntries(((calLinks ?? []) as { user_id: string; enabled: boolean }[]).map((r) => [r.user_id, r.enabled]));
      setAgentWhatsappIds(waIdsLoaded);
      setAgentWhatsappIdsSaved(waIdsLoaded);
      setAgentMetaIds(metaIdsLoaded);
      setAgentMetaIdsSaved(metaIdsLoaded);
      setAgentWebhookIds(webhookIdsLoaded);
      setAgentWebhookIdsSaved(webhookIdsLoaded);
      setAgentCalendarEnabled(calendarLoaded);
      setAgentCalendarEnabledSaved(calendarLoaded);
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
      // Nunca deixa "Verificando..." travado pra sempre -- se a edge function
      // ou a query falharem, marca os pendentes como não conectados (com log
      // pra diagnóstico) em vez de silenciosamente não atualizar nada.
      try {
        const { data: statusData, error: statusError } =
          await supabase.functions.invoke("agent-closer-status", { body: { company_id: companyId, user_ids: pending } });
        if (statusError) console.error("[agent-closer-status] erro:", statusError);
        const connectedIds = new Set((statusData?.connected ?? []) as string[]);
        setMemberCalendarConnected((prev) => {
          const next = { ...prev };
          for (const id of pending) next[id] = connectedIds.has(id);
          return next;
        });
        const emailsByUser = (statusData?.emails ?? {}) as Record<string, string>;
        setMemberCalendarEmail((prev) => ({ ...prev, ...emailsByUser }));
      } catch (err) {
        console.error("[agent-closer-status] falha inesperada:", err);
        setMemberCalendarConnected((prev) => {
          const next = { ...prev };
          for (const id of pending) next[id] = false;
          return next;
        });
      }
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

  // Disponibilidade dos vendedores é POR AGENTE, então recarrega sempre que o
  // agente selecionado muda. Antes ela era lida junto com o status do Google,
  // que é por USUÁRIO e fica em cache entre agentes: assim que o status já era
  // conhecido, o efeito saía cedo e a disponibilidade nunca era buscada. A
  // tela caía no padrão (todos os dias DESATIVADOS), parecendo "sem restrição
  // configurada" -- e salvar nesse estado apagava a configuração real,
  // deixando o vendedor sem nenhum dia liberado.
  useEffect(() => {
    if (!selectedId || !companyId || !members.length) return;
    let cancelado = false;
    (async () => {
      const { data, error } = await supabase
        .from("agent_closer_availability")
        .select("user_id, days")
        .eq("agent_id", selectedId)
        .eq("company_id", companyId);
      if (cancelado) return;
      if (error) {
        // Sem os dados reais, NÃO preenche com o padrão: um "Atualizar agente"
        // depois disso gravaria o padrão por cima do que está salvo.
        console.error("[agent_closer_availability] falha ao carregar:", error);
        return;
      }
      const porUsuario = new Map(((data ?? []) as { user_id: string; days: WorkDay[] }[]).map((r) => [r.user_id, r.days]));
      const proximo: Record<string, WorkDay[]> = {};
      for (const m of members) proximo[m.user_id] = porUsuario.get(m.user_id) ?? defaultCloserAvailability();
      setCloserAvailability(proximo);
      setCloserAvailabilitySaved(proximo);
    })();
    return () => { cancelado = true; };
  }, [selectedId, companyId, members]);

  async function createAgent() {
    if (!companyId || !user?.id) return;
    if (!draftName.trim()) { toast.error("Informe o nome do agente"); return; }
    if (!draftActivationTag) { toast.error("Escolha a tag que vai ativar este agente"); return; }
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
        activation_tag: draftActivationTag,
        active: false,
        draft: true,
        // Grava os padrões de comportamento já na criação. Sem isso o agente
        // nascia com behavior_config = {} e a tela mentia: mostrava os
        // toggles nos valores padrão (que vêm de BEHAVIOR_DRAFT_DEFAULTS),
        // enquanto o agente rodava com tudo indefinido -- ou seja, o que o
        // cliente via na aba Comportamento não era o que acontecia na
        // conversa, a menos que ele por acaso mexesse em algum toggle.
        behavior_config: BEHAVIOR_DEFAULTS,
      })
      .select("id, type, name, description, avatar, active, model, custom_context, objectives, enabled_tools, behavior_config, activation_tag, activated_at, active_seconds_total, draft")
      .single();
    if (error || !data) {
      // 23505 = unique_violation do índice (company_id, activation_tag).
      toast.error(error?.code === "23505"
        ? `A tag "${draftActivationTag}" já ativa outro agente. Escolha outra.`
        : "Erro ao criar agente");
      return;
    }
    setAgents((prev) => [...prev, data]);
    setSelectedId(data.id);
    setOpenDialog(false);
    setDraftName("");
    setDraftDescription("");
    setDraftAvatar(DEFAULT_AVATAR);
    setDraftActivationTag(null);
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
  // Sair da tela durante o wizard sem passar por aqui deixava o rascunho vivo
  // no banco: invisível na grade (draft = true) e ainda segurando a tag de
  // ativação, que aparecia como "em uso" por um agente que o usuário não
  // conseguia mais encontrar. Todo ponto que navega para fora usa esta função.
  async function sairDoWizard(destino: string) {
    if (!wizardMode || !selected || !companyId) { navigate(destino); return; }
    if (!window.confirm("Sair agora descarta o agente que você está criando, incluindo a tag reservada para ele. Continuar?")) return;
    const { error } = await supabase.from("agents").delete().eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao descartar o agente em criação"); return; }
    setAgents((prev) => prev.filter((a) => a.id !== selected.id));
    setWizardMode(false);
    setSelectedId(null);
    navigate(destino);
  }

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

  // Commits reais no banco -- só chamados na hora durante o wizard (que
  // continua salvando a cada passo, como sempre) ou em lote por
  // updateAgent() no modo edição. Fora do wizard, os handlers abaixo só
  // atualizam o rascunho local (XDraft) e nunca chamam essas funções direto.
  async function commitObjectives(next: string[]) {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ objectives: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar objetivo"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, objectives: next } : a)));
  }

  async function commitBehavior(next: Required<BehaviorConfig>) {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ behavior_config: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, behavior_config: next } : a)));
  }

  async function commitTools(next: string[]) {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ enabled_tools: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar ferramenta"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, enabled_tools: next } : a)));
  }

  async function toggleObjective(objectiveId: string, checked: boolean) {
    const next = checked
      ? [...objectivesDraft, objectiveId]
      : objectivesDraft.filter((o) => o !== objectiveId);
    setObjectivesDraft(next);
    if (wizardMode) await commitObjectives(next);
    // Sem "Agendar Reunião", a aba Vendedores some -- se o usuário estava
    // nela quando desmarcou o objetivo, cai pro Perfil em vez de ficar numa
    // aba que não existe mais na lista.
    if (objectiveId === "agendar" && !checked && freeTab === "closers") {
      setFreeTab("perfil");
    }
  }

  function updateObjectiveInstructionDraft(objectiveId: string, text: string) {
    setBehaviorDraft((d) => ({ ...d, objective_instructions: { ...d.objective_instructions, [objectiveId]: text } }));
  }

  async function commitObjectiveInstructionIfWizard() {
    if (wizardMode) await commitBehavior(behaviorDraft);
  }

  function toggleQualField(fieldId: string, checked: boolean) {
    const current = behaviorDraft.campos_qualificacao;
    const next = { ...behaviorDraft, campos_qualificacao: checked ? [...current, fieldId] : current.filter((id) => id !== fieldId) };
    setBehaviorDraft(next);
    if (wizardMode) void commitBehavior(next);
  }

  // Andaime da aba "Instruções": escreve o título da seção e deixa o cursor
  // embaixo dele. Clicar de novo num título que já existe leva o cursor até
  // ele em vez de duplicar -- duas seções "# Sobre a empresa" no mesmo prompt
  // é o modelo lendo duas verdades sobre a mesma coisa.
  const instrucoesRef = useRef<HTMLTextAreaElement>(null);
  function inserirSecaoInstrucao(titulo: string) {
    const marcador = `# ${titulo}`;
    const ta = instrucoesRef.current;
    const jaExiste = customContext.indexOf(marcador);
    if (jaExiste >= 0) {
      const fim = jaExiste + marcador.length;
      ta?.focus();
      ta?.setSelectionRange(fim, fim);
      return;
    }
    const base = customContext.trimEnd();
    const texto = base ? `${base}\n\n${marcador}\n` : `${marcador}\n`;
    if (texto.length > LIMITE_INSTRUCOES) return;
    setCustomContext(texto);
    // Depois do render, senão o setSelectionRange cai no valor antigo.
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(texto.length, texto.length);
    });
  }

  function toggleTool(toolId: string, checked: boolean) {
    const next = checked
      ? [...enabledToolsDraft, toolId]
      : enabledToolsDraft.filter((t) => t !== toolId);
    setEnabledToolsDraft(next);
    if (wizardMode) void commitTools(next);
  }

  // Sugestão inicial de ferramentas, aplicada UMA vez por agente, ao chegar
  // na etapa durante a criação, e só quando ele ainda não tem nenhuma
  // marcada. Nunca toca em agente que já existe: quem não marcou nada fez uma
  // escolha, e reaplicar sugestão numa edição ligaria ferramenta pelas costas
  // de quem já rodou o agente em produção.
  const sugestaoFerramentasRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wizardMode || !selected) return;
    const passos = WIZARD_STEPS.filter((s) => s.v !== "closers" || objectivesDraft.includes("agendar"));
    if (passos[wizardStepIndex]?.v !== "ferramentas") return;
    if (sugestaoFerramentasRef.current === selected.id) return;
    sugestaoFerramentasRef.current = selected.id;
    if ((selected.enabled_tools ?? []).length > 0) return;
    const sugeridas = ferramentasRecomendadas(objectivesDraft);
    if (!sugeridas.length) return;
    setEnabledToolsDraft(sugeridas);
    void commitTools(sugeridas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardMode, wizardStepIndex, objectivesDraft, selected]);

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

  async function commitModel(next: string) {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ model: next }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao atualizar modelo"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, model: next } : a)));
  }

  function changeAgentModel(next: string) {
    setModelDraft(next);
    if (wizardMode) {
      void commitModel(next).then(() => toast.success("Modelo atualizado"));
    }
  }

  // Troca a tag de ativação direto do card da grade. O índice único no banco
  // é quem garante a exclusividade -- a checagem local só evita a ida ao
  // servidor no caso óbvio.
  async function salvarTagAtivacao(agent: Agent, tag: string) {
    if (!companyId || tag === agent.activation_tag) return;
    const dono = tagsOcupadasPorAgente[tag];
    if (dono && dono.id !== agent.id) { toast.error(`A tag "${tag}" já ativa o agente "${dono.name}".`); return; }
    const { error } = await supabase.from("agents").update({ activation_tag: tag }).eq("id", agent.id).eq("company_id", companyId);
    if (error) {
      toast.error(error.code === "23505" ? `A tag "${tag}" já ativa outro agente.` : "Não foi possível salvar a tag.");
      return;
    }
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, activation_tag: tag } : a)));
    toast.success("Tag de ativação atualizada");
  }

  // Recebe o agente explicitamente (não só `selected`) pra poder ser chamado
  // tanto do card na grade quanto de dentro da tela de edição.
  async function toggleActive(agent: Agent, next: boolean) {
    if (!companyId) return;
    // Só a chave do provedor DO MODELO escolhido é obrigatória. Antes exigia
    // as duas, então quem assina só a Anthropic (ou só a OpenAI) não
    // conseguia ativar nada -- e ninguém contrata os dois provedores pra
    // usar um.
    if (next) {
      // Consulta na hora, em vez de usar o estado carregado quando a página
      // montou: quem cadastra a chave em Configurações e volta pra cá sem
      // recarregar continuava com a foto velha do banco, e a trava acusava
      // "cadastre sua chave" com a chave já gravada, sem saída.
      const { data: provedoresAgora } = await supabase.rpc("company_ai_providers", { p_company_id: companyId });
      const chaves = new Set(((provedoresAgora ?? []) as { provider: string }[]).map((p) => p.provider));
      setHasAnthropicKey(chaves.has("anthropic"));
      setHasOpenaiKey(chaves.has("openai"));

      const provedorDoModelo = (agent.model ?? "").startsWith("gpt-") ? "openai" : "anthropic";
      if (!chaves.has(provedorDoModelo)) {
        toast.error(
          provedorDoModelo === "anthropic"
            ? "Cadastre sua chave da Anthropic em Configurações antes de ativar o agente."
            : "Cadastre sua chave da OpenAI em Configurações antes de ativar o agente.",
        );
        return;
      }
      if (agent.objectives.length === 0) {
        toast.error("Marque pelo menos 1 objetivo na aba Perfil antes de ativar o agente.");
        return;
      }
      // Sem tag de ativação o agente nunca é acionado por negócio nenhum:
      // ficaria ligado na tela e mudo na prática, sem nada explicando.
      if (!agent.activation_tag) {
        toast.error("Defina a tag de ativação deste agente antes de ativar.");
        return;
      }
      // "Transferir responsável" ligado sem destinatário entregaria a conversa
      // a ninguém: o agente se desliga e o negócio fica órfão, fora da caixa
      // de qualquer atendente.
      if (agent.behavior_config?.transferir_responsavel && !agent.behavior_config?.transferir_responsavel_user_id) {
        toast.error("Escolha para quem o agente transfere a conversa (aba Comportamento) antes de ativar.");
        return;
      }
      // A Base de Conhecimento gera embeddings pela OpenAI mesmo quando o
      // modelo de chat é Claude. Sem essa chave, os documentos existem mas a
      // busca devolve vazio e o agente responde como se não houvesse
      // material nenhum -- em silêncio.
      if (!chaves.has("openai")) {
        const { count } = await supabase
          .from("agent_knowledge_bases")
          .select("id", { count: "exact", head: true })
          .eq("agent_id", agent.id).eq("company_id", companyId);
        if ((count ?? 0) > 0) {
          toast.error("Este agente tem Base de Conhecimento, que usa a OpenAI para indexar. Cadastre a chave da OpenAI em Configurações antes de ativar.");
          return;
        }
      }
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

  // Só usada pelo wizard (commit na hora ao sair do campo de Instruções) --
  // no modo edição, updateAgent() grava o contexto junto com os outros
  // campos escalares num update só.
  async function saveCustomContext() {
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agents").update({ custom_context: customContext }).eq("id", selected.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setAgents((prev) => prev.map((a) => (a.id === selected.id ? { ...a, custom_context: customContext } : a)));
  }

  // Todo toggle/select de Comportamento/Configurações passa por aqui --
  // sempre atualiza o rascunho local; no wizard, também commita na hora
  // (ver commitBehavior). Fora do wizard fica pendente até "Atualizar
  // agente".
  function updateBehaviorConfig(patch: Partial<BehaviorConfig>) {
    const next = { ...behaviorDraft, ...patch };
    setBehaviorDraft(next);
    if (wizardMode) void commitBehavior(next);
  }

  // Botão "Atualizar agente" -- único ponto de gravação do modo edição.
  // Grava os campos escalares do agente num update só, e diffa cada domínio
  // de lista/relação (o que foi adicionado/removido/alterado desde o último
  // save) pra decidir o que inserir/apagar/upsertar em cada tabela. Tudo em
  // paralelo.
  async function updateAgent() {
    if (!selected || !companyId) return;
    setSavingKey("agente");

    const closerAdded = closerIds.filter((id) => !closerIdsSaved.includes(id));
    const closerRemoved = closerIdsSaved.filter((id) => !closerIds.includes(id));
    const waAdded = agentWhatsappIds.filter((id) => !agentWhatsappIdsSaved.includes(id));
    const waRemoved = agentWhatsappIdsSaved.filter((id) => !agentWhatsappIds.includes(id));
    const metaAdded = agentMetaIds.filter((id) => !agentMetaIdsSaved.includes(id));
    const metaRemoved = agentMetaIdsSaved.filter((id) => !agentMetaIds.includes(id));
    const webhookAdded = agentWebhookIds.filter((id) => !agentWebhookIdsSaved.includes(id));
    const webhookRemoved = agentWebhookIdsSaved.filter((id) => !agentWebhookIds.includes(id));
    const calendarChanged = Object.keys(agentCalendarEnabled).filter((id) => agentCalendarEnabled[id] !== agentCalendarEnabledSaved[id]);
    const availabilityChanged = Object.keys(closerAvailability).filter(
      (id) => JSON.stringify(closerAvailability[id]) !== JSON.stringify(closerAvailabilitySaved[id]),
    );

    const writes = [
      supabase.from("agents").update({
        objectives: objectivesDraft,
        behavior_config: behaviorDraft,
        enabled_tools: enabledToolsDraft,
        model: modelDraft,
        custom_context: customContext,
      }).eq("id", selected.id).eq("company_id", companyId),
      ...(closerAdded.length ? [supabase.from("agent_closers").upsert(closerAdded.map((user_id) => ({ agent_id: selected.id, company_id: companyId, user_id })), { onConflict: "agent_id,user_id", ignoreDuplicates: true })] : []),
      ...(closerRemoved.length ? [supabase.from("agent_closers").delete().eq("agent_id", selected.id).in("user_id", closerRemoved)] : []),
      ...(waAdded.length ? [supabase.from("agent_whatsapp_connections").upsert(waAdded.map((connection_id) => ({ agent_id: selected.id, company_id: companyId, connection_id })), { onConflict: "agent_id,connection_id", ignoreDuplicates: true })] : []),
      ...(waRemoved.length ? [supabase.from("agent_whatsapp_connections").delete().eq("agent_id", selected.id).in("connection_id", waRemoved)] : []),
      ...(metaAdded.length ? [supabase.from("agent_meta_connections").upsert(metaAdded.map((connection_id) => ({ agent_id: selected.id, company_id: companyId, connection_id })), { onConflict: "agent_id,connection_id", ignoreDuplicates: true })] : []),
      ...(metaRemoved.length ? [supabase.from("agent_meta_connections").delete().eq("agent_id", selected.id).in("connection_id", metaRemoved)] : []),
      ...(webhookAdded.length ? [supabase.from("agent_webhook_integrations").upsert(webhookAdded.map((connection_id) => ({ agent_id: selected.id, company_id: companyId, connection_id })), { onConflict: "agent_id,connection_id", ignoreDuplicates: true })] : []),
      ...(webhookRemoved.length ? [supabase.from("agent_webhook_integrations").delete().eq("agent_id", selected.id).in("connection_id", webhookRemoved)] : []),
      ...(calendarChanged.length ? [supabase.from("agent_calendar_connections").upsert(calendarChanged.map((user_id) => ({ agent_id: selected.id, company_id: companyId, user_id, enabled: agentCalendarEnabled[user_id] })), { onConflict: "agent_id,user_id" })] : []),
      ...(availabilityChanged.length ? [supabase.from("agent_closer_availability").upsert(availabilityChanged.map((user_id) => ({ agent_id: selected.id, company_id: companyId, user_id, days: closerAvailability[user_id] })), { onConflict: "agent_id,user_id" })] : []),
    ];

    const results = await Promise.all(writes);
    setSavingKey(null);
    if (results.some((r) => r.error)) { toast.error("Erro ao atualizar agente"); return; }

    setAgents((prev) => prev.map((a) => (a.id === selected.id ? {
      ...a,
      objectives: objectivesDraft,
      behavior_config: behaviorDraft,
      enabled_tools: enabledToolsDraft,
      model: modelDraft,
      custom_context: customContext,
    } : a)));
    setCloserIdsSaved(closerIds);
    setAgentWhatsappIdsSaved(agentWhatsappIds);
    setAgentMetaIdsSaved(agentMetaIds);
    setAgentWebhookIdsSaved(agentWebhookIds);
    setAgentCalendarEnabledSaved(agentCalendarEnabled);
    setCloserAvailabilitySaved(closerAvailability);
    toast.success("Agente atualizado");
  }

  // Habilita "Atualizar agente" se qualquer domínio (campos do agente,
  // vendedores + disponibilidade, integrações) tiver mudança pendente desde
  // o último save.
  const isAgentDirty = !!selected && (
    JSON.stringify(objectivesDraft) !== JSON.stringify(selected.objectives) ||
    JSON.stringify(behaviorDraft) !== JSON.stringify({ ...BEHAVIOR_DRAFT_DEFAULTS, ...selected.behavior_config }) ||
    JSON.stringify(enabledToolsDraft) !== JSON.stringify(selected.enabled_tools) ||
    modelDraft !== selected.model ||
    customContext !== (selected.custom_context ?? "") ||
    JSON.stringify([...closerIds].sort()) !== JSON.stringify([...closerIdsSaved].sort()) ||
    JSON.stringify(closerAvailability) !== JSON.stringify(closerAvailabilitySaved) ||
    JSON.stringify([...agentWhatsappIds].sort()) !== JSON.stringify([...agentWhatsappIdsSaved].sort()) ||
    JSON.stringify([...agentMetaIds].sort()) !== JSON.stringify([...agentMetaIdsSaved].sort()) ||
    JSON.stringify([...agentWebhookIds].sort()) !== JSON.stringify([...agentWebhookIdsSaved].sort()) ||
    JSON.stringify(agentCalendarEnabled) !== JSON.stringify(agentCalendarEnabledSaved)
  );

  // No wizard, cada toggle segue commitando na hora (rede primeiro, estado
  // local só muda em caso de sucesso -- igual sempre foi). Fora do wizard,
  // só atualiza o rascunho local; updateAgent() diffa working-vs-saved e
  // decide o que inserir/apagar quando "Atualizar agente" for clicado.
  async function toggleCloser(userId: string, checked: boolean) {
    // Guarda contra clique duplicado (ex. clique no texto do label dispara
    // onCheckedChange 2x em alguns navegadores).
    const alreadyCloser = closerIds.includes(userId);
    if (checked === alreadyCloser) return;
    if (!wizardMode) {
      setCloserIds(checked ? [...closerIds, userId] : closerIds.filter((id) => id !== userId));
      if (checked) await saveCloserAvailability(userId, defaultCloserAvailability());
      return;
    }
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_closers").upsert(
        { agent_id: selected.id, company_id: companyId, user_id: userId },
        { onConflict: "agent_id,user_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao adicionar vendedor"); return; }
      setCloserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      setCloserIdsSaved((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      await saveCloserAvailability(userId, defaultCloserAvailability());
    } else {
      const { error } = await supabase.from("agent_closers").delete().eq("agent_id", selected.id).eq("user_id", userId);
      if (error) { toast.error("Erro ao remover vendedor"); return; }
      setCloserIds((prev) => prev.filter((id) => id !== userId));
      setCloserIdsSaved((prev) => prev.filter((id) => id !== userId));
    }
  }

  // Etapa "Integrações" -- toggles de WhatsApp/Instagram-Messenger/Webhook
  // funcionam igual toggleCloser: linha existe = usado; some = não usado.
  async function toggleAgentWhatsapp(connectionId: string, checked: boolean) {
    if (!wizardMode) {
      setAgentWhatsappIds(checked ? [...agentWhatsappIds, connectionId] : agentWhatsappIds.filter((id) => id !== connectionId));
      return;
    }
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_whatsapp_connections").upsert(
        { agent_id: selected.id, company_id: companyId, connection_id: connectionId },
        { onConflict: "agent_id,connection_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao vincular WhatsApp"); return; }
      setAgentWhatsappIds((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
      setAgentWhatsappIdsSaved((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
    } else {
      const { error } = await supabase.from("agent_whatsapp_connections").delete().eq("agent_id", selected.id).eq("connection_id", connectionId);
      if (error) { toast.error("Erro ao desvincular WhatsApp"); return; }
      setAgentWhatsappIds((prev) => prev.filter((id) => id !== connectionId));
      setAgentWhatsappIdsSaved((prev) => prev.filter((id) => id !== connectionId));
    }
  }

  async function toggleAgentMeta(connectionId: string, checked: boolean) {
    if (!wizardMode) {
      setAgentMetaIds(checked ? [...agentMetaIds, connectionId] : agentMetaIds.filter((id) => id !== connectionId));
      return;
    }
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_meta_connections").upsert(
        { agent_id: selected.id, company_id: companyId, connection_id: connectionId },
        { onConflict: "agent_id,connection_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao vincular conexão"); return; }
      setAgentMetaIds((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
      setAgentMetaIdsSaved((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
    } else {
      const { error } = await supabase.from("agent_meta_connections").delete().eq("agent_id", selected.id).eq("connection_id", connectionId);
      if (error) { toast.error("Erro ao desvincular conexão"); return; }
      setAgentMetaIds((prev) => prev.filter((id) => id !== connectionId));
      setAgentMetaIdsSaved((prev) => prev.filter((id) => id !== connectionId));
    }
  }

  async function toggleAgentWebhook(connectionId: string, checked: boolean) {
    if (!wizardMode) {
      setAgentWebhookIds(checked ? [...agentWebhookIds, connectionId] : agentWebhookIds.filter((id) => id !== connectionId));
      return;
    }
    if (!selected || !companyId) return;
    if (checked) {
      const { error } = await supabase.from("agent_webhook_integrations").upsert(
        { agent_id: selected.id, company_id: companyId, connection_id: connectionId },
        { onConflict: "agent_id,connection_id", ignoreDuplicates: true },
      );
      if (error) { toast.error("Erro ao vincular webhook"); return; }
      setAgentWebhookIds((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
      setAgentWebhookIdsSaved((prev) => (prev.includes(connectionId) ? prev : [...prev, connectionId]));
    } else {
      const { error } = await supabase.from("agent_webhook_integrations").delete().eq("agent_id", selected.id).eq("connection_id", connectionId);
      if (error) { toast.error("Erro ao desvincular webhook"); return; }
      setAgentWebhookIds((prev) => prev.filter((id) => id !== connectionId));
      setAgentWebhookIdsSaved((prev) => prev.filter((id) => id !== connectionId));
    }
  }

  // Calendar já vem com linha pré-existente (efeito de auto-sync acima),
  // então aqui é sempre update do campo enabled, não insert/delete.
  async function toggleAgentCalendar(userId: string, checked: boolean) {
    if (!wizardMode) {
      setAgentCalendarEnabled((prev) => ({ ...prev, [userId]: checked }));
      return;
    }
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agent_calendar_connections").upsert(
      { agent_id: selected.id, company_id: companyId, user_id: userId, enabled: checked },
      { onConflict: "agent_id,user_id" },
    );
    if (error) { toast.error("Erro ao atualizar calendário"); return; }
    setAgentCalendarEnabled((prev) => ({ ...prev, [userId]: checked }));
    setAgentCalendarEnabledSaved((prev) => ({ ...prev, [userId]: checked }));
  }

  async function saveCloserAvailability(userId: string, days: WorkDay[]) {
    setCloserAvailability((prev) => ({ ...prev, [userId]: days }));
    if (!wizardMode) return;
    if (!selected || !companyId) return;
    const { error } = await supabase.from("agent_closer_availability").upsert(
      { agent_id: selected.id, company_id: companyId, user_id: userId, days },
      { onConflict: "agent_id,user_id" },
    );
    if (error) { toast.error("Erro ao salvar disponibilidade"); return; }
    setCloserAvailabilitySaved((prev) => ({ ...prev, [userId]: days }));
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
      // O nome do arquivo NÃO pode ir cru pra chave do Storage: acento,
      // espaço, cedilha e afins fazem o upload falhar. Em português isso é a
      // regra, não a exceção ("Políticas de convênio.txt"), e o erro chegava
      // como um "Erro ao enviar documento" genérico, sem pista nenhuma.
      // O nome original continua preservado na coluna file_name (é ele que
      // aparece na tela e de onde o agent-kb-ingest tira a extensão) --
      // aqui só a chave interna vira ASCII.
      const nomeSeguro = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${companyId}/${crypto.randomUUID()}-${nomeSeguro}`;
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
      // "Erro ao enviar documento" sozinho não dizia NADA: podia ser storage,
      // banco, permissão ou a função de ingestão. Mostra o motivo real, senão
      // o usuário (e o suporte) ficam sem por onde começar.
      console.error("[upload KB]", err);
      const motivo = err instanceof Error ? err.message
        : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message)
        : "";
      toast.error(motivo ? `Erro ao enviar documento: ${motivo}` : "Erro ao enviar documento");
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
                      {/* title: com o estado ocupando a direita da linha, nome
                          longo trunca cedo -- o hover devolve o texto inteiro. */}
                      <p title={a.name} className="text-[14px] font-bold text-[#111111] truncate">{a.name}</p>
                      {a.description && <p title={a.description} className="text-[11px] text-[#767676] truncate">{a.description}</p>}
                    </div>
                    {/* Estado na mesma linha do nome, à direita: é a
                        informação que o usuário procura primeiro ao bater o
                        olho na grade. */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Circle size={8} fill={a.active ? "#128A68" : "#CCCCCC"} color={a.active ? "#128A68" : "#CCCCCC"} />
                      <span className={`text-[11px] font-semibold ${a.active ? "text-[#128A68]" : "text-[#767676]"}`}>{a.active ? "Ativo" : "Inativo"}</span>
                    </div>
                  </div>

                  {/* Objetivos: o que o agente faz de fato. Sem isso, dois
                      agentes com nomes parecidos ficam indistinguíveis na
                      grade e só dá pra saber entrando na edição. */}
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#767676] font-semibold mb-1">Objetivos</p>
                    {a.objectives.length === 0 ? (
                      <span className="text-[12px]" style={{ color: "#E24B4A" }}>Nenhum objetivo definido</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {AGENT_OBJECTIVES.filter((o) => a.objectives.includes(o.id)).map((o) => (
                          <span
                            key={o.id}
                            title={o.description}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-[#128A68]/10 text-[#128A68]"
                          >
                            {o.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#767676] font-semibold mb-1">Tag de ativação</p>
                    <AgentActivationTagPicker
                      value={a.activation_tag}
                      onChange={(tag) => void salvarTagAtivacao(a, tag)}
                      ocupadas={tagsOcupadasPorAgente}
                      agenteAtualId={a.id}
                      placeholder="Definir tag"
                    />
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
              const effectiveWizardSteps = WIZARD_STEPS.filter((s) => s.v !== "closers" || objectivesDraft.includes("agendar"));
              const activeTabValue = wizardMode ? (effectiveWizardSteps[wizardStepIndex]?.v ?? "kb") : freeTab;
              return (
              <Tabs value={activeTabValue} onValueChange={(v) => { if (!wizardMode) setFreeTab(v); }} className="w-full h-full min-h-0 flex overflow-hidden">
                {/* Sidebar esquerda -- avatar/nome no topo, etapas embaixo (numeradas no wizard, abas no modo livre) */}
                <div className="w-[260px] shrink-0 border-r border-[#EEEEEE] overflow-y-auto flex flex-col">
                  <div className="px-4 py-4 border-b border-[#EEEEEE] flex items-center gap-3 shrink-0">
                    <div className="w-10 h-10 rounded-full bg-[#128A68] flex items-center justify-center text-white shrink-0">
                      <AgentAvatarIcon avatar={selected.avatar} size={20} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[14px] font-bold text-[#111111] truncate">{selected.name}</h2>
                      {selected.description && (
                        <p className="text-[11px] text-[#767676] truncate">{selected.description}</p>
                      )}
                    </div>
                  </div>
                  {wizardMode ? (
                    <div className="flex flex-col gap-1 px-3 py-4">
                      {effectiveWizardSteps.map((s, idx) => {
                        const locked = idx > wizardMaxStepReached;
                        return (
                          <button
                            key={s.v}
                            type="button"
                            disabled={locked}
                            onClick={() => { if (!locked) setWizardStepIndex(idx); }}
                            className={`flex items-center gap-2 px-2 py-2 rounded-md text-left ${locked ? "cursor-not-allowed" : "cursor-pointer hover:bg-[#F5F5F5]"}`}
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
                              style={{ color: idx === wizardStepIndex ? "#111111" : locked ? "#CCCCCC" : "#767676", fontWeight: idx === wizardStepIndex ? 600 : 400 }}
                            >
                              {s.l}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <TabsList className="flex flex-col items-stretch bg-transparent p-0 px-3 py-4 gap-1 h-auto">
                      {[
                        { v: "perfil", l: "Perfil", icon: User },
                        { v: "configuracoes", l: "Configurações", icon: Settings },
                        { v: "comportamento", l: "Comportamento", icon: SlidersHorizontal },
                        { v: "closers", l: "Vendedores", icon: Users },
                        { v: "ferramentas", l: "Ferramentas", icon: Wrench },
                        { v: "integracoes", l: "Integrações", icon: Plug },
                        { v: "kb", l: "Base de Conhecimento", icon: Brain },
                        { v: "instrucoes", l: "Instruções", icon: FileText },
                        { v: "modelos", l: "Modelos", icon: BrainCircuit },
                        { v: "performance", l: "Performance", icon: TrendingUp },
                      ].filter((t) => t.v !== "closers" || objectivesDraft.includes("agendar")).map((t) => (
                        <TabsTrigger
                          key={t.v}
                          value={t.v}
                          className="justify-start text-[#767676] data-[state=active]:bg-[#E1F5EE] data-[state=active]:text-[#111111] data-[state=active]:shadow-none rounded-md text-[13px] px-2 py-2 flex items-center gap-2"
                        >
                          <t.icon size={16} className="shrink-0" color={activeTabValue === t.v ? "#111111" : "#767676"} />
                          <span className="flex-1 text-left">{t.l}</span>
                          {activeTabValue === t.v && <ArrowRight size={14} className="shrink-0" color="#128A68" />}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  )}
                </div>

                {/* Coluna direita -- conteúdo da etapa + rodapé (Cancelar/Voltar/Avançar no wizard, Voltar-pra-grade/Atualizar no modo livre) */}
                <div className="flex-1 min-w-0 flex flex-col min-h-0">

                {/* PERFIL */}
                <TabsContent value="perfil" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
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
                      <Button variant="outline" onClick={() => void sairDoWizard("/configuracoes/api")} className="h-7 text-[11px] shrink-0 border-[#991B1B] text-[#991B1B] hover:bg-[#FEE2E2]">
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
                      const checked = objectivesDraft.includes(o.id);
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
                                      onClick={() => void sairDoWizard("/configuracoes/campos")}
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
                                          <label key={f.id} className="flex items-center gap-2 p-2 bg-white border border-[#EEEEEE] rounded cursor-pointer">
                                            <Checkbox
                                              checked={behaviorDraft.campos_qualificacao.includes(f.id)}
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

                              {o.id === "agendar" && (
                                <div className="pt-1 border-t border-[#EEEEEE]">
                                  <div className="flex items-center justify-between pt-2">
                                    <div className="pr-3">
                                      <div className="text-[12px] font-medium text-[#111111]">Lembrete da reunião</div>
                                      <p className="text-[11px] text-[#767676]">
                                        O agente manda uma confirmação antes do horário marcado. Reduz o não comparecimento — entre o agendamento e o dia, o lead esfria.
                                      </p>
                                    </div>
                                    <Switch
                                      checked={behaviorDraft.lembrete_reuniao_ativo ?? false}
                                      onCheckedChange={(v) => updateBehaviorConfig({ lembrete_reuniao_ativo: v })}
                                    />
                                  </div>

                                  {behaviorDraft.lembrete_reuniao_ativo && (
                                    <div className="mt-2 space-y-2">
                                      {([1, 2] as const).map((n) => (
                                        <div key={n} className="flex items-center gap-2 p-2 bg-white border border-[#EEEEEE] rounded">
                                          <span className="text-[11px] text-[#767676] w-[74px] shrink-0">
                                            {n === 1 ? "1º lembrete" : "2º lembrete"}
                                          </span>
                                          <Input
                                            type="number"
                                            min={1}
                                            className="h-8 w-[72px] bg-white text-[12px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                                            value={(n === 1 ? behaviorDraft.lembrete_1_valor : behaviorDraft.lembrete_2_valor) ?? ""}
                                            onChange={(e) => updateBehaviorConfig(
                                              n === 1
                                                ? { lembrete_1_valor: Number(e.target.value) || 0 }
                                                : { lembrete_2_valor: Number(e.target.value) || 0 },
                                            )}
                                          />
                                          <Select
                                            value={(n === 1 ? behaviorDraft.lembrete_1_unidade : behaviorDraft.lembrete_2_unidade) ?? "horas"}
                                            onValueChange={(v) => updateBehaviorConfig(
                                              n === 1
                                                ? { lembrete_1_unidade: v as "minutos" | "horas" }
                                                : { lembrete_2_unidade: v as "minutos" | "horas" },
                                            )}
                                          >
                                            <SelectTrigger className="h-8 w-[110px] bg-white text-[12px] focus:ring-0 focus:ring-offset-0"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="minutos">minutos</SelectItem>
                                              <SelectItem value="horas">horas</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <span className="text-[11px] text-[#767676]">antes da reunião</span>
                                        </div>
                                      ))}
                                      <p className="text-[10px] text-[#767676]">
                                        Deixe um dos campos vazio (ou em 0) para usar só um lembrete.
                                        Entre 22h e 7h o envio espera o amanhecer, para não acordar o cliente, exceto se a reunião for nas 2 horas seguintes.
                                      </p>
                                      {/* Sem este aviso, ligar o toggle e deixar os dois campos zerados
                                          resulta em nenhum lembrete, sem nada na tela indicando isso. */}
                                      {!(Number(behaviorDraft.lembrete_1_valor) > 0) && !(Number(behaviorDraft.lembrete_2_valor) > 0) && (
                                        <p className="text-[11px] text-[#B91C1C] bg-[#FEE2E2] border border-[#FCA5A5] rounded px-2 py-1.5">
                                          Preencha ao menos um dos lembretes, senão nenhum aviso será enviado.
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className={o.id === "qualificar" || o.id === "agendar" ? "pt-1 border-t border-[#EEEEEE]" : ""}>
                                <div className="text-[12px] font-medium text-[#111111] pt-2">Instruções específicas</div>
                                <p className="text-[11px] text-[#767676] mb-1.5">
                                  Regras ou detalhes de como o agente deve executar esse objetivo — soma ao prompt padrão dele, sem se misturar com as instruções gerais do agente.
                                </p>
                                <Textarea
                                  value={behaviorDraft.objective_instructions[o.id] ?? ""}
                                  onChange={(e) => updateObjectiveInstructionDraft(o.id, e.target.value)}
                                  onBlur={() => commitObjectiveInstructionIfWizard()}
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
                  {objectivesDraft.includes("qualificar") && behaviorDraft.campos_qualificacao.length === 0 && (
                    <div className="flex items-start gap-2.5 p-4 bg-[#FEF3C7] rounded-lg">
                      <AlertTriangle size={16} className="text-[#92400E] mt-0.5 shrink-0" />
                      <div className="text-[13px] text-[#92400E]">
                        "Qualificar" precisa de pelo menos 1 pergunta marcada em "Campos que o agente deve mapear" — sem isso o agente não tem o que direcionar na qualificação.
                      </div>
                    </div>
                  )}
                  {objectivesDraft.includes("atendimento") && (
                    <p className="text-[11px] text-[#767676]">
                      "Atendimento" usa os documentos da aba Base de Conhecimento pra responder — envie materiais lá pra esse objetivo funcionar bem.
                    </p>
                  )}
                </TabsContent>

                {/* BASE DE CONHECIMENTO */}
                <TabsContent value="kb" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
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
                <TabsContent value="comportamento" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
                  <div className="border-t border-[#EEEEEE] pt-6 first:border-t-0 first:pt-0">
                    <h3 className="text-[14px] font-semibold text-[#111111] mb-3">Encerramento e transferência</h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                        <div>
                          <div className="text-[13px] font-medium text-[#111111]">Finalizar conversa</div>
                          <div className="text-[11px] text-[#767676]">Permite que o agente encerre a conversa automaticamente.</div>
                        </div>
                        <Switch
                          checked={behaviorDraft.finalizar_conversa ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ finalizar_conversa: v })}
                        />
                      </div>
                      <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[13px] font-medium text-[#111111]">Transferir responsável</div>
                            <div className="text-[11px] text-[#767676]">Permite que o agente transfira o responsável quando identificar que finalizou o objetivo.</div>
                          </div>
                          <Switch
                            checked={behaviorDraft.transferir_responsavel ?? false}
                            onCheckedChange={(v) => updateBehaviorConfig({ transferir_responsavel: v })}
                          />
                        </div>
                        {/* Sem destinatário a transferência não entrega a
                            conversa a ninguém: o agente desliga e o lead fica
                            órfão, sem aparecer na caixa de nenhum atendente. */}
                        {behaviorDraft.transferir_responsavel && (
                          <div className="mt-3 pt-3 border-t border-[#E5E5E5]">
                            <Label className="text-[11px] text-[#767676]">Transferir para</Label>
                            <Select
                              value={behaviorDraft.transferir_responsavel_user_id ?? ""}
                              onValueChange={(v) => updateBehaviorConfig({ transferir_responsavel_user_id: v })}
                            >
                              <SelectTrigger className="mt-1 bg-white h-9 text-[13px]">
                                <SelectValue placeholder="Escolha quem recebe a conversa" />
                              </SelectTrigger>
                              <SelectContent>
                                {members.map((m) => (
                                  <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || m.email}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!behaviorDraft.transferir_responsavel_user_id && (
                              <p className="text-[11px] mt-1" style={{ color: "#E24B4A" }}>
                                Escolha o destinatário. Sem ele, a transferência apenas desliga o agente e o negócio fica sem responsável.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Escalação não é toggle: o agente sempre pode escalar
                          (inclusive automaticamente, quando um agendamento
                          falha). O que faltava era destinatário -- sem ele a
                          escalação virava só uma nota que ninguém lê. */}
                      <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                        <div className="text-[13px] font-medium text-[#111111]">Quando o agente não conseguir resolver</div>
                        <div className="text-[11px] text-[#767676]">
                          O agente escala para uma pessoa quando trava numa dúvida que não sabe responder ou quando um agendamento falha. A conversa vai para a caixa de quem você escolher aqui.
                        </div>
                        <Label className="text-[11px] text-[#767676] mt-3 block">Escalar para</Label>
                        <Select
                          value={behaviorDraft.escalar_humano_user_id ?? ""}
                          onValueChange={(v) => updateBehaviorConfig({ escalar_humano_user_id: v })}
                        >
                          <SelectTrigger className="mt-1 bg-white h-9 text-[13px]">
                            <SelectValue placeholder="Responsável atual do negócio" />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || m.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-[#767676] mt-1">
                          Sem escolha, vai para o responsável que o negócio já tiver. Se o negócio também não tiver responsável, ninguém é avisado.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-6">
                    <div className="flex items-center gap-1.5 mb-3">
                      <h3 className="text-[14px] font-semibold text-[#111111]">Quem o agente é na conversa</h3>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label="Como funciona" className="text-[#767676] hover:text-[#111111] transition-colors">
                            <HelpCircle size={14} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[320px] text-[12px] leading-relaxed">
                          <p className="font-semibold mb-1">Pessoa do discurso</p>
                          <p className="mb-2">
                            <b>Primeira pessoa:</b> o agente fala como se fosse o próprio profissional ou a empresa —
                            “eu te atendo”, “minha agenda”. Indicado para profissional autônomo ou negócio pequeno.
                          </p>
                          <p className="mb-2">
                            <b>Membro do time:</b> o agente fala em nome do profissional —
                            “ela vai te receber”, “a agenda dela” — e se apresenta como parte da equipe.
                            Indicado quando há um time atendendo.
                          </p>
                          <p className="text-[11px] opacity-80">
                            Sem essa definição o agente alterna entre as duas na mesma conversa,
                            e o cliente não entende com quem está falando.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                      <Select
                        value={behaviorDraft.persona_voz ?? "propria"}
                        onValueChange={(v) => updateBehaviorConfig({ persona_voz: v as BehaviorConfig["persona_voz"] })}
                      >
                        <SelectTrigger className="bg-white focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="propria">Primeira pessoa</SelectItem>
                          <SelectItem value="equipe">Membro do time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-6">
                    <h3 className="text-[14px] font-semibold text-[#111111]">Estilo de Comunicação</h3>
                    {/* O estilo também define a temperatura enviada ao modelo
                        (formal = mais previsível). É a mesma dimensão que
                        concorrentes expõem como slider de "temperatura", numa
                        unidade que o cliente não sabe operar. */}
                    <p className="text-[12px] text-[#767676] mb-3">
                      Define o tom das mensagens e o quanto o agente varia a forma de responder. Formal é o mais previsível e consistente entre conversas; descontraída é o mais criativo.
                    </p>
                    <div className="mb-2 p-3 bg-white border border-[#EEEEEE] rounded-lg">
                      <Select
                        value={behaviorDraft.estilo_comunicacao ?? "normal"}
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
                      <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                        <div>
                          <div className="text-[13px] font-medium text-[#111111]">Usar Emojis</div>
                          <div className="text-[11px] text-[#767676]">Permitir uso de emojis nas respostas.</div>
                        </div>
                        <Switch
                          checked={behaviorDraft.usar_emojis ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ usar_emojis: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                        <div>
                          <div className="text-[13px] font-medium text-[#111111]">Assinar nome do agente</div>
                          <div className="text-[11px] text-[#767676]">Assinar nome do agente nas mensagens.</div>
                        </div>
                        <Switch
                          checked={behaviorDraft.assinar_nome ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ assinar_nome: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-[#111111]">Dividir mensagens longas</div>
                          <div className="text-[11px] text-[#767676]">Dividir mensagens muito longas automaticamente.</div>
                          {behaviorDraft.dividir_mensagens && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[11px] text-[#666]">Acima de quantas palavras:</span>
                              <Input
                                type="number"
                                min={10}
                                defaultValue={behaviorDraft.dividir_mensagens_palavras ?? 20}
                                onBlur={(e) => updateBehaviorConfig({ dividir_mensagens_palavras: Number(e.target.value) || 20 })}
                                className="w-20 h-8 text-[12px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                              />
                            </div>
                          )}
                        </div>
                        <Switch
                          checked={behaviorDraft.dividir_mensagens ?? false}
                          onCheckedChange={(v) => updateBehaviorConfig({ dividir_mensagens: v })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-6">
                    <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg mb-3">
                      <div>
                        <div className="text-[13px] font-medium text-[#111111]">Follow-up automático</div>
                        <div className="text-[11px] text-[#767676]">Envia mensagem de acompanhamento quando o cliente não responde.</div>
                      </div>
                      <Switch
                        checked={behaviorDraft.followup_ativo ?? false}
                        onCheckedChange={(v) => updateBehaviorConfig({ followup_ativo: v })}
                      />
                    </div>

                    {behaviorDraft.followup_ativo && (
                      <div className="space-y-4 p-4 border border-[#EEEEEE] rounded-lg">
                        <div>
                          <Label className="text-[12px]">Número de follow-ups</Label>
                          <Input
                            type="number" min={1} max={10}
                            value={behaviorDraft.followup_max_tentativas}
                            onChange={(e) => updateBehaviorConfig({ followup_max_tentativas: Number(e.target.value) || 1 })}
                            className="mt-1 w-28 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                          />
                        </div>
                        <div>
                          <Label className="text-[12px]">Tempo de espera entre os follow-ups</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="number" min={1}
                              value={behaviorDraft.followup_intervalo_valor}
                              onChange={(e) => updateBehaviorConfig({ followup_intervalo_valor: Number(e.target.value) || 1 })}
                              className="w-28 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                            />
                            <Select
                              value={behaviorDraft.followup_intervalo_unidade}
                              onValueChange={(v) => updateBehaviorConfig({ followup_intervalo_unidade: v as "minutos" | "horas" })}
                            >
                              <SelectTrigger className="w-32 focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="minutos">Minutos</SelectItem>
                                <SelectItem value="horas">Horas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                          <div className="text-[13px] font-medium text-[#111111]">
                            Após as tentativas, transferir lead para uma automação
                          </div>
                          <Switch
                            checked={behaviorDraft.followup_transferir_automacao}
                            onCheckedChange={(v) => updateBehaviorConfig({ followup_transferir_automacao: v })}
                          />
                        </div>
                        {behaviorDraft.followup_transferir_automacao && (
                          <div>
                            <Label className="text-[12px]">Automação de destino</Label>
                            <Select
                              value={behaviorDraft.followup_automacao_id ?? ""}
                              onValueChange={(v) => updateBehaviorConfig({ followup_automacao_id: v })}
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
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* CLOSERS */}
                <TabsContent value="closers" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-[14px] font-semibold text-[#111111]">Configurações de agendamento</h3>
                      <p className="text-[12px] text-[#767676]">Regras que valem pra qualquer reunião marcada por esse agente, independente do vendedor.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-3 bg-white border border-[#EEEEEE] rounded-lg">
                      <div>
                        <Label className="text-[12px]">Duração padrão das reuniões (min)</Label>
                        <Input
                          type="number" min={5} step={5}
                          value={behaviorDraft.duracao_reuniao_minutos}
                          onChange={(e) => updateBehaviorConfig({ duracao_reuniao_minutos: Number(e.target.value) || 60 })}
                          className="mt-1 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                      <div>
                        <div className="text-[13px] text-[#111111]">Intervalo entre reuniões</div>
                        <div className="text-[11px] text-[#767676]">Garante uma folga antes e depois de cada reunião já marcada, pra não empilhar compromissos do vendedor sem respiro.</div>
                      </div>
                      <Switch
                        checked={behaviorDraft.intervalo_entre_reunioes}
                        onCheckedChange={(v) => updateBehaviorConfig({ intervalo_entre_reunioes: v })}
                      />
                    </div>
                    {behaviorDraft.intervalo_entre_reunioes && (
                      <div className="pl-3">
                        <Label className="text-[12px]">Intervalo (minutos)</Label>
                        <Input
                          type="number" min={5} step={5}
                          value={behaviorDraft.intervalo_minutos}
                          onChange={(e) => updateBehaviorConfig({ intervalo_minutos: Number(e.target.value) || 15 })}
                          className="mt-1 w-32 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                        />
                      </div>
                    )}

                    <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[13px] text-[#111111]">Google Calendar</div>
                          <div className="text-[11px] text-[#767676]">Exige que o vendedor tenha o Google conectado e cria o evento também no Google Calendar dele. Desligado: a reunião é marcada só no calendário do Rezult, sem exigir Google e sem link de vídeo.</div>
                        </div>
                        <Switch
                          checked={behaviorDraft.google_calendar_ativo}
                          onCheckedChange={(v) => updateBehaviorConfig({ google_calendar_ativo: v })}
                        />
                      </div>
                      {behaviorDraft.google_calendar_ativo ? (
                        <div className="flex items-center justify-between pl-3 border-l-2 border-[#EEEEEE]">
                          <div>
                            <div className="text-[13px] text-[#111111]">Incluir link do Google Meet</div>
                            <div className="text-[11px] text-[#767676]">Adiciona automaticamente um link do Google Meet aos eventos criados.</div>
                          </div>
                          <Switch
                            checked={behaviorDraft.incluir_google_meet}
                            onCheckedChange={(v) => updateBehaviorConfig({ incluir_google_meet: v })}
                          />
                        </div>
                      ) : (
                        <p className="text-[11px] text-[#767676] pl-3 border-l-2 border-[#EEEEEE]">
                          Vendedores sem Google conectado também ficam elegíveis pra receber reuniões — elas aparecem no /calendario do Rezult, sem link de videochamada automático.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                      <div>
                        <div className="text-[13px] text-[#111111]">Confirmar antes de criar eventos</div>
                        <div className="text-[11px] text-[#767676]">O agente pedirá confirmação antes de criar ou modificar eventos.</div>
                      </div>
                      <Switch
                        checked={behaviorDraft.confirmar_antes_criar_evento}
                        onCheckedChange={(v) => updateBehaviorConfig({ confirmar_antes_criar_evento: v })}
                      />
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
                            {checked && connected && (
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#128A68] bg-[#E1F5EE] px-1.5 py-0.5 rounded-full shrink-0">
                                <span className="relative flex h-2 w-2 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#128A68] opacity-75" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#128A68]" />
                                </span>
                                Google Calendar conectado
                              </span>
                            )}
                          </label>

                          {checked && (
                            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[#EEEEEE] mt-1">
                              <div className="pt-2">
                                {connected === undefined ? (
                                  <span className="text-[11px] text-[#767676]">Verificando conexão com Google Calendar...</span>
                                ) : connected ? null : (
                                  <div className="flex items-start gap-2.5 p-2.5 bg-[#FEF3C7] rounded-lg">
                                    <AlertTriangle size={14} className="text-[#92400E] mt-0.5 shrink-0" />
                                    <div className="text-[11px] text-[#92400E]">
                                      {m.full_name || m.email} ainda não conectou o Google Calendar — sem isso o agente não consegue agendar reunião pra essa pessoa. Peça pra ela acessar{" "}
                                      <button onClick={() => void sairDoWizard("/configuracoes/integracoes")} className="underline font-medium">
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
                                  {/* O texto antigo dizia que sem dia marcado o agente
                                      agendava em qualquer horário. É o oposto do que o
                                      backend faz: dia inativo descarta o vendedor naquele
                                      dia, então com todos fechados ele nunca é escolhido. */}
                                  Dias e horários em que {m.full_name || "essa pessoa"} libera a agenda pro agente marcar reunião. Com todos os dias fechados, o agente não consegue marcar nenhuma reunião com {m.full_name || "essa pessoa"}.
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
                <TabsContent value="integracoes" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
                  {(() => {
                    // Mesma linguagem visual de Configurações → Conexões: card
                    // branco com status no topo, ícone colorido e o controle no
                    // rodapé. Antes eram quatro listas empilhadas de checkbox,
                    // uma por canal, e a etapa crescia sem fim conforme a
                    // empresa conectava mais coisa. Os chips substituem os
                    // títulos de seção: a divisão continua existindo, mas filtra
                    // em vez de alongar a página.
                    type CardIntegracao = {
                      chave: string;
                      categoria: string;
                      titulo: string;
                      subtitulo: string;
                      conectado: boolean;
                      usa: boolean;
                      alternar: (v: boolean) => void;
                      icone: React.ReactNode;
                      cor: string;
                    };

                    const cards: CardIntegracao[] = [
                      ...whatsappConnections.map((c) => ({
                        chave: `wa-${c.id}`,
                        categoria: "WhatsApp",
                        titulo: c.name,
                        subtitulo: c.phone || "WhatsApp",
                        conectado: c.connected,
                        usa: agentWhatsappIds.includes(c.id),
                        alternar: (v: boolean) => toggleAgentWhatsapp(c.id, v),
                        icone: <WhatsAppIcon size={20} />,
                        cor: "#FFFFFF",
                      })),
                      // Instagram / Messenger fica de fora enquanto a
                      // integração não está pronta: oferecer a escolha antes da
                      // entrega é prometer atendimento numa página que o agente
                      // ainda não lê. O carregamento das conexões Meta e o
                      // toggleAgentMeta continuam de pé, então voltar é
                      // devolver este bloco e a categoria na lista de chips.
                      // Calendar só aparece pra quem agenda: pra um agente que
                      // não marca reunião, a agenda dos vendedores não muda nada.
                      ...(objectivesDraft.includes("agendar")
                        ? members
                            .filter((m) => memberCalendarConnected[m.user_id])
                            .map((m) => ({
                              chave: `cal-${m.user_id}`,
                              categoria: "Calendar",
                              titulo: memberCalendarEmail[m.user_id] || m.full_name || m.email || m.user_id,
                              subtitulo: "Google Calendar",
                              conectado: true,
                              usa: agentCalendarEnabled[m.user_id] ?? true,
                              alternar: (v: boolean) => toggleAgentCalendar(m.user_id, v),
                              icone: <CalendarDays size={18} color="#FFF" />,
                              cor: "#4285F4",
                            }))
                        : []),
                      ...webhookIntegrations.map((c) => ({
                        chave: `wh-${c.id}`,
                        categoria: "Webhooks",
                        titulo: c.name,
                        subtitulo: "Webhook de entrada",
                        conectado: c.active,
                        usa: agentWebhookIds.includes(c.id),
                        alternar: (v: boolean) => toggleAgentWebhook(c.id, v),
                        icone: <Webhook size={18} color="#FFF" />,
                        cor: "#111111",
                      })),
                    ];

                    // Todo canal suportado aparece como chip, mesmo zerado. Um
                    // chip que só nasce depois de existir conexão esconde o que
                    // o agente é capaz de fazer: quem nunca ligou um WhatsApp
                    // não descobre que podia. Zerado, o chip leva ao lugar onde
                    // se conecta. Calendar é a exceção e some quando o objetivo
                    // "Agendar" está desmarcado, porque aí a agenda dos
                    // vendedores não influencia nada.
                    const categorias = ["WhatsApp", ...(objectivesDraft.includes("agendar") ? ["Calendar"] : []), "Webhooks"];
                    const vazios: Record<string, string> = {
                      "WhatsApp": "Nenhum WhatsApp conectado. Conecte em Configurações → Conexões.",
                      "Calendar": "Nenhum usuário com Google Calendar conectado. Conecte em Configurações → Conexões.",
                      "Webhooks": "Nenhum webhook de entrada configurado. Configure em Configurações → Integrações.",
                      "Todos": "Conecte um WhatsApp ou um webhook em Configurações → Conexões para escolher onde este agente atua.",
                    };
                    // Categoria que deixou de existir (Calendar depois de
                    // desmarcar "Agendar") não pode deixar a grade em branco sem
                    // explicação: volta pra "Todos".
                    const catAtiva = catIntegracao !== "Todos" && !categorias.includes(catIntegracao) ? "Todos" : catIntegracao;
                    const visiveis = catAtiva === "Todos" ? cards : cards.filter((c) => c.categoria === catAtiva);
                    const emUso = cards.filter((c) => c.usa).length;

                    return (
                      <>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-[14px] font-semibold text-[#111111]">Integrações</h3>
                            <p className="text-[12px] text-[#767676]">Escolha em quais conexões já existentes na empresa esse agente atua.</p>
                          </div>
                          {emUso > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#128A68] bg-[#128A68]/10 px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#128A68]" />
                              {emUso} em uso
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {[{ cat: "Todos", n: cards.length }, ...categorias.map((cat) => ({ cat, n: cards.filter((c) => c.categoria === cat).length }))].map(({ cat, n }) => {
                            const ativo = catAtiva === cat;
                            return (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setCatIntegracao(cat)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer border ${
                                  ativo
                                    ? "bg-[#128A68] border-[#128A68] text-white"
                                    : "bg-white border-[#EEEEEE] text-[#111111] hover:border-[#CCCCCC]"
                                }`}
                              >
                                {cat}
                                <span className={ativo ? "text-white/70" : n === 0 ? "text-[#CCCCCC]" : "text-[#767676]"}>{n}</span>
                              </button>
                            );
                          })}
                        </div>

                        {visiveis.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-12 h-12 rounded-xl bg-white border border-[#EEEEEE] flex items-center justify-center mb-4">
                              <Link2 size={22} className="text-[#767676]" />
                            </div>
                            <p className="text-[13px] font-semibold text-[#111111] mb-1">Nada conectado aqui ainda</p>
                            <p className="text-[12px] text-[#767676] max-w-[380px]">{vazios[catAtiva] ?? vazios["Todos"]}</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {visiveis.map((c) => (
                              <div key={c.chave} className="bg-white border border-[#EEEEEE] rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${c.conectado ? "bg-[#128A68]" : "bg-[#767676]/40"}`} />
                                    <span className={`text-[11px] font-medium ${c.conectado ? "text-[#128A68]" : "text-[#767676]"}`}>
                                      {c.conectado ? "Conectado" : "Desconectado"}
                                    </span>
                                  </div>
                                  <span className="text-[10px] uppercase tracking-wide text-[#767676] font-semibold shrink-0 ml-2 truncate">{c.categoria}</span>
                                </div>
                                <div className="flex items-center gap-3 mb-3">
                                  <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-[#EEEEEE]"
                                    style={{ background: c.cor }}
                                  >
                                    {c.icone}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-[#111111] truncate">{c.titulo}</p>
                                    <p className="text-[11px] text-[#767676] truncate">{c.subtitulo}</p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-3 border-t border-[#EEEEEE] mt-auto">
                                  <span className="text-[12px] font-medium text-[#767676]">Usar neste agente</span>
                                  <Switch checked={c.usa} onCheckedChange={c.alternar} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </TabsContent>

                {/* PERFORMANCE */}
                <TabsContent value="performance" className="p-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
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
                <TabsContent value="configuracoes" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Horário de atendimento</h3>
                    <p className="text-[12px] text-[#767676]">
                      Fuso horário do agente e, se quiser, a janela e os dias em que ele responde mensagens no dia a dia.
                    </p>
                  </div>
                  <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg space-y-4">
                    <div className="max-w-[280px]">
                      <Label className="text-[12px]">Fuso horário</Label>
                      <Select
                        value={behaviorDraft.fuso_horario}
                        onValueChange={(v) => updateBehaviorConfig({ fuso_horario: v })}
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
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[13px] text-[#111111]">Restringir horário de atendimento</div>
                        <div className="text-[11px] text-[#767676]">Fora da janela e dos dias abaixo, o agente não responde mensagens. Desligado = responde a qualquer hora, todo dia, como hoje.</div>
                      </div>
                      <Switch
                        checked={behaviorDraft.horario_atendimento_ativo}
                        onCheckedChange={(v) => updateBehaviorConfig({ horario_atendimento_ativo: v })}
                      />
                    </div>
                    {behaviorDraft.horario_atendimento_ativo && (
                      <>
                        <div className="grid grid-cols-2 gap-4 max-w-[280px]">
                          <div>
                            <Label className="text-[12px]">Início</Label>
                            <Input
                              type="time"
                              value={behaviorDraft.horario_atendimento_inicio}
                              onChange={(e) => updateBehaviorConfig({ horario_atendimento_inicio: e.target.value })}
                              className="mt-1 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                            />
                          </div>
                          <div>
                            <Label className="text-[12px]">Fim</Label>
                            <Input
                              type="time"
                              value={behaviorDraft.horario_atendimento_fim}
                              onChange={(e) => updateBehaviorConfig({ horario_atendimento_fim: e.target.value })}
                              className="mt-1 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[12px]">Dias da semana</Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {CLOSER_AVAILABILITY_DAYS.map((day) => {
                              const activeDays = behaviorDraft.horario_atendimento_dias ?? CLOSER_AVAILABILITY_DAYS;
                              const active = activeDays.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    const current = behaviorDraft.horario_atendimento_dias ?? [...CLOSER_AVAILABILITY_DAYS];
                                    const next = active ? current.filter((d) => d !== day) : [...current, day];
                                    updateBehaviorConfig({ horario_atendimento_dias: next });
                                  }}
                                  className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors ${
                                    active ? "bg-[#128A68] border-[#128A68] text-white" : "bg-white border-[#E5E5E5] text-[#767676] hover:bg-[#F5F5F5]"
                                  }`}
                                >
                                  {day.slice(0, 3)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                    <Label className="text-[12px]">Delay de Resposta (segundos)</Label>
                    <Input
                      type="number" min={0}
                      value={behaviorDraft.delay_resposta_segundos}
                      onChange={(e) => updateBehaviorConfig({ delay_resposta_segundos: Number(e.target.value) || 0, delay_resposta_minutos: 0 })}
                      className="mt-1 w-32 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <p className="text-[11px] text-[#767676] mt-1">
                      Espera esse tempo depois da última mensagem do lead antes de começar a responder. Se ele mandar mais mensagens durante a espera, o relógio reinicia e o agente responde uma vez só, considerando todas. 0 = responde na hora.
                    </p>
                    <p className="text-[11px] text-[#767676] mt-1">
                      O tempo de digitação vem depois disso: com 15 segundos aqui, o "digitando..." aparece aos 15 e a primeira mensagem chega por volta dos 20.
                    </p>
                  </div>

                  <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                    <Label className="text-[12px]">Mensagens consideradas no atendimento</Label>
                    <Input
                      type="number" min={1}
                      value={behaviorDraft.mensagens_consideradas}
                      onChange={(e) => updateBehaviorConfig({ mensagens_consideradas: Number(e.target.value) || 30 })}
                      className="mt-1 w-32 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <p className="text-[11px] text-[#767676] mt-1">
                      Quantidade de mensagens recentes da conversa que o agente considera para gerar respostas.
                    </p>
                  </div>

                  <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                    <Label className="text-[12px]">Limite de interações da IA por atendimento</Label>
                    <Input
                      type="number" min={0}
                      value={behaviorDraft.limite_interacoes}
                      onChange={(e) => updateBehaviorConfig({ limite_interacoes: Number(e.target.value) || 0 })}
                      className="mt-1 w-32 bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    <p className="text-[11px] text-[#767676] mt-1">
                      Número máximo de respostas que a IA pode enviar ao cliente em um mesmo atendimento (a saudação automática não conta).
                      Após enviar esse número de respostas, na próxima mensagem do cliente a IA se despede e: se "Transferir responsável" estiver ativo (aba Comportamento) → transfere para um atendente;
                      se apenas "Finalizar conversa" estiver ativo → encerra o atendimento; se ambos estiverem desativados → a IA para de responder silenciosamente.
                      Exemplo: com 3, a IA responde até 3 vezes — na 4ª mensagem do cliente, se despede e transfere/finaliza. 0 = sem limite.
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg">
                    <div>
                      <div className="text-[13px] font-medium text-[#111111]">Saudação automática</div>
                      <div className="text-[11px] text-[#767676]">Na primeira mensagem da conversa, o agente se apresenta antes de entrar no objetivo. Continua sendo uma mensagem só, com o tom e as instruções que você configurou. Desligado, ele já vai direto ao ponto.</div>
                    </div>
                    <Switch
                      checked={behaviorDraft.saudacao_automatica ?? false}
                      onCheckedChange={(v) => updateBehaviorConfig({ saudacao_automatica: v })}
                    />
                  </div>

                  <div className="border-t border-[#EEEEEE] pt-6">
                    <h3 className="text-[14px] font-semibold text-[#111111] mb-3">Restrições</h3>
                    <div className="flex items-center justify-between p-3 bg-white border border-[#EEEEEE] rounded-lg mb-3">
                      <div>
                        <div className="text-[13px] font-medium text-[#111111]">Restringir tópicos</div>
                        <div className="text-[11px] text-[#767676]">Ativar controle de tópicos permitidos/restritos.</div>
                      </div>
                      <Switch
                        checked={behaviorDraft.restringir_topicos ?? false}
                        onCheckedChange={(v) => updateBehaviorConfig({ restringir_topicos: v })}
                      />
                    </div>
                    {behaviorDraft.restringir_topicos && (
                      <div className="space-y-3">
                        <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                          <Label className="text-[12px]">Tópicos Permitidos</Label>
                          <Textarea
                            value={behaviorDraft.topicos_permitidos}
                            onChange={(e) => updateBehaviorConfig({ topicos_permitidos: e.target.value })}
                            placeholder="Ex: preços, agendamento, dúvidas sobre o produto"
                            className="mt-1 min-h-[80px] text-[13px] bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                          />
                        </div>
                        <div className="p-3 bg-white border border-[#EEEEEE] rounded-lg">
                          <Label className="text-[12px]">Tópicos Restritos</Label>
                          <Textarea
                            value={behaviorDraft.topicos_restritos}
                            onChange={(e) => updateBehaviorConfig({ topicos_restritos: e.target.value })}
                            placeholder="Ex: concorrentes, assuntos jurídicos, política"
                            className="mt-1 min-h-[80px] text-[13px] bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                </TabsContent>

                {/* MODELOS */}
                <TabsContent value="modelos" className="p-6 space-y-4 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Modelo de IA</h3>
                    <p className="text-[12px] text-[#767676]">
                      Escolha o modelo que o agente usa para responder e decidir suas ações. Requer a chave da API do provedor correspondente cadastrada em Configurações.
                    </p>
                  </div>
                  {(() => {
                    const complexitySignals: ComplexitySignals = {
                      objectives: objectivesDraft,
                      toolCount: enabledToolsDraft.length + (behaviorDraft.finalizar_conversa ? 1 : 0) + (behaviorDraft.transferir_responsavel ? 1 : 0),
                      customContextLength: customContext.length,
                      objectiveInstructionsLength: Object.values(behaviorDraft.objective_instructions ?? {}).reduce((sum, v) => sum + v.length, 0),
                      qualFieldsCount: (behaviorDraft.campos_qualificacao ?? []).length,
                      kbDocsCount: docs.filter((d) => d.enabled).length,
                    };
                    const rec = recommendModel(complexitySignals);
                    if (rec.modelId === modelDraft) return null;
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
                  <div>
                    {(() => {
                      const complexitySignals: ComplexitySignals = {
                        objectives: objectivesDraft,
                        toolCount: enabledToolsDraft.length + (behaviorDraft.finalizar_conversa ? 1 : 0) + (behaviorDraft.transferir_responsavel ? 1 : 0),
                        customContextLength: customContext.length,
                        objectiveInstructionsLength: Object.values(behaviorDraft.objective_instructions ?? {}).reduce((sum, v) => sum + v.length, 0),
                        qualFieldsCount: (behaviorDraft.campos_qualificacao ?? []).length,
                        kbDocsCount: docs.filter((d) => d.enabled).length,
                      };
                      const recommendedModelId = recommendModel(complexitySignals).modelId;
                      return (
                        <Select value={modelDraft} onValueChange={changeAgentModel}>
                          <SelectTrigger className="bg-white focus:ring-0 focus:ring-offset-0 focus:border-primary"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Anthropic (Claude)</SelectLabel>
                              {IA_MODELS.anthropic.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  <span className="flex items-center gap-2">
                                    <span>{m.label}</span>
                                    <span
                                      className="text-[9px] leading-none font-semibold px-1.5 py-[3px] rounded-full border shrink-0"
                                      style={{
                                        background: IA_COST_STYLES[m.cost].bg,
                                        color: IA_COST_STYLES[m.cost].fg,
                                        borderColor: IA_COST_STYLES[m.cost].border,
                                      }}
                                    >
                                      {IA_COST_LABELS[m.cost]}
                                    </span>
                                    {m.id === recommendedModelId && (
                                      <span
                                        className="flex items-center gap-0.5 text-[9px] leading-none font-semibold px-1.5 py-[3px] rounded-full border shrink-0"
                                        style={{ background: "#E1F5EE", color: "#128A68", borderColor: "#A7E8D0" }}
                                      >
                                        <Check size={9} className="shrink-0" />
                                        Recomendado
                                      </span>
                                    )}
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
                                      className="text-[9px] leading-none font-semibold px-1.5 py-[3px] rounded-full border shrink-0"
                                      style={{
                                        background: IA_COST_STYLES[m.cost].bg,
                                        color: IA_COST_STYLES[m.cost].fg,
                                        borderColor: IA_COST_STYLES[m.cost].border,
                                      }}
                                    >
                                      {IA_COST_LABELS[m.cost]}
                                    </span>
                                    {m.id === recommendedModelId && (
                                      <span
                                        className="flex items-center gap-0.5 text-[9px] leading-none font-semibold px-1.5 py-[3px] rounded-full border shrink-0"
                                        style={{ background: "#E1F5EE", color: "#128A68", borderColor: "#A7E8D0" }}
                                      >
                                        <Check size={9} className="shrink-0" />
                                        Recomendado
                                      </span>
                                    )}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
                  {(() => {
                    const modelProvider = modelDraft.startsWith("gpt-") ? "openai" : "anthropic";
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
                <TabsContent value="ferramentas" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
                  {(() => {
                    // Só entra na lista o que existe de verdade. As caixas
                    // permanentemente cinzas (destrutivas e as ainda não
                    // implementadas) eram 25 das 73 e faziam a etapa parecer
                    // maior e mais obrigatória do que é.
                    const disponiveis = AGENT_TOOLS.filter((t) => t.implemented && t.category !== "destrutiva");
                    const idsRecomendados = ferramentasRecomendadas(objectivesDraft);
                    const recomendadas = disponiveis.filter((t) => idsRecomendados.includes(t.id));
                    const demais = disponiveis.filter((t) => !idsRecomendados.includes(t.id));
                    const marcadasNasDemais = demais.filter((t) => enabledToolsDraft.includes(t.id)).length;

                    const caixa = (t: typeof AGENT_TOOLS[number]) => {
                      const catStyle = AGENT_TOOL_CATEGORY_STYLES[t.category];
                      return (
                        <label
                          key={t.id}
                          className="flex items-start gap-3 p-2.5 border border-[#EEEEEE] rounded-lg cursor-pointer bg-white"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={enabledToolsDraft.includes(t.id)}
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
                            </div>
                            <div className="text-[11px] text-[#767676]">{t.description}</div>
                          </div>
                        </label>
                      );
                    };

                    return (
                      <>
                        <div>
                          <h3 className="text-[14px] font-semibold text-[#111111]">Ferramentas do CRM</h3>
                          <p className="text-[12px] text-[#767676]">
                            Qualificar, agendar e responder o agente já faz sem marcar nada aqui. Estas são as operações
                            extras que ele pode executar no CRM enquanto conversa, como mover o card de etapa ou consultar
                            o catálogo. Cada uma marcada entra no raciocínio dele em toda mensagem, então menos costuma
                            render mais.
                          </p>
                        </div>

                        {recomendadas.length > 0 && (
                          <div>
                            <h4 className="text-[11px] uppercase tracking-wide text-[#767676] font-semibold mb-2">
                              Recomendadas para os objetivos deste agente
                            </h4>
                            <div className="space-y-1.5">{recomendadas.map(caixa)}</div>
                          </div>
                        )}

                        <div>
                          <button
                            type="button"
                            onClick={() => setVerTodasFerramentas((v) => !v)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[#EEEEEE] bg-white text-[13px] font-medium text-[#111111] hover:border-[#CCCCCC] transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-2">
                              {verTodasFerramentas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              Ver todas as ferramentas do CRM ({demais.length})
                            </span>
                            {marcadasNasDemais > 0 && (
                              <span className="text-[11px] font-medium text-[#128A68] bg-[#128A68]/10 px-2 py-0.5 rounded-full">
                                {marcadasNasDemais} marcada{marcadasNasDemais > 1 ? "s" : ""}
                              </span>
                            )}
                          </button>

                          {verTodasFerramentas && (
                            <div className="mt-4 space-y-6">
                              {AGENT_TOOL_ENTITIES.map((entity) => {
                                const doGrupo = demais.filter((t) => t.entity === entity);
                                if (!doGrupo.length) return null;
                                return (
                                  <div key={entity}>
                                    <h4 className="text-[11px] uppercase tracking-wide text-[#767676] font-semibold mb-2">{entity}</h4>
                                    <div className="space-y-1.5">{doGrupo.map(caixa)}</div>
                                  </div>
                                );
                              })}
                              <p className="text-[11px] text-[#767676]">
                                Operações de exclusão e de criação de configuração (funis, campos, departamentos) ainda não
                                estão disponíveis para agentes.
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </TabsContent>

                {/* INSTRUÇÕES */}
                <TabsContent value="instrucoes" className="p-6 space-y-6 mt-0 flex-1 overflow-y-auto min-h-0 bg-[#F5F5F5]">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#111111]">Instruções</h3>
                    <p className="text-[12px] text-[#767676]">
                      O que o agente precisa saber sobre a empresa e sobre como responder. Tom de voz, objetivos e
                      comportamento são configurados nas outras etapas, não aqui.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {SECOES_INSTRUCOES.map((titulo) => {
                      const jaTem = customContext.includes(`# ${titulo}`);
                      return (
                        <button
                          key={titulo}
                          type="button"
                          onClick={() => inserirSecaoInstrucao(titulo)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#EEEEEE] bg-white text-[12px] font-medium text-[#111111] hover:border-[#CCCCCC] transition-colors cursor-pointer"
                        >
                          {jaTem
                            ? <Check size={12} className="text-[#128A68]" />
                            : <Plus size={12} className="text-[#767676]" />}
                          {titulo}
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <Textarea
                      ref={instrucoesRef}
                      value={customContext}
                      onChange={(e) => setCustomContext(e.target.value.slice(0, LIMITE_INSTRUCOES))}
                      onBlur={() => { if (wizardMode) void saveCustomContext(); }}
                      placeholder={PLACEHOLDER_INSTRUCOES}
                      // Alto o bastante para o placeholder inteiro caber: um
                      // exemplo cortado na metade orienta pior que nenhum.
                      className="min-h-[470px] text-[13px] bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                    />
                    {/* Peso em tokens visível a partir de um texto já
                        considerável. Instruções entram inteiras no prompt de
                        toda execução, então o custo é por mensagem trocada --
                        e isso é invisível para quem escreve. Informar, não
                        limitar: quem constrói um agente robusto decide. */}
                    <div className="flex items-center justify-between gap-3 mt-1">
                      <span className="text-[11px] text-[#767676]">
                        {customContext.length > 4000 && (
                          <>Somam cerca de <span className="font-medium text-[#111111]">{Math.round(customContext.length / 4).toLocaleString("pt-BR")} tokens</span> a cada mensagem trocada com cada lead. Material de consulta (tabelas, FAQ, procedimentos) custa menos na Base de Conhecimento, que busca só o trecho relevante.</>
                        )}
                      </span>
                      <span className="text-[11px] text-[#767676] shrink-0">{customContext.length.toLocaleString("pt-BR")} / {LIMITE_INSTRUCOES.toLocaleString("pt-BR")}</span>
                    </div>
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
                      objectivesDraft.length > 0 &&
                      (!objectivesDraft.includes("qualificar") || (behaviorDraft.campos_qualificacao ?? []).length > 0)
                    ) :
                    currentStepValue === "closers" ? closerIds.length > 0 :
                    true;
                  return (
                  <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-[#EEEEEE] shrink-0">
                    <Button
                      variant="outline"
                      onClick={abandonDraftAgent}
                      className="border-[#FCA5A5] text-[#DC2626] hover:bg-[#DC2626] hover:text-white hover:border-[#DC2626] active:bg-[#991B1B] active:border-[#991B1B]"
                    >
                      Cancelar
                    </Button>
                    <div className="flex items-center gap-2">
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
                  </div>
                  );
                })()}
                {!wizardMode && (
                  <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-[#EEEEEE] shrink-0">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (isAgentDirty && !window.confirm("Sair sem salvar? As alterações pendentes serão descartadas.")) return;
                        setView("grid");
                        setSelectedId(null);
                      }}
                      className="border-[#FCA5A5] text-[#DC2626] hover:bg-[#DC2626] hover:text-white hover:border-[#DC2626] active:bg-[#991B1B] active:border-[#991B1B]"
                    >
                      Cancelar
                    </Button>
                    <Button onClick={updateAgent} disabled={savingKey === "agente" || !isAgentDirty} className="bg-[#128A68] hover:bg-[#128A68]/90 text-white">
                      {savingKey === "agente" && <Loader2 size={14} className="animate-spin" />} Atualizar agente
                    </Button>
                  </div>
                )}
                </div>
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
              <Label className="text-[12px]">Tag de ativação</Label>
              <div className="mt-1">
                <AgentActivationTagPicker
                  value={draftActivationTag}
                  onChange={setDraftActivationTag}
                  ocupadas={tagsOcupadasPorAgente}
                  placeholder="Escolher ou criar uma tag"
                />
              </div>
              <p className="text-[11px] text-[#767676] mt-1">
                O agente atende os negócios que tiverem essa tag no card. Cada tag ativa um único agente.
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
  const [meetingsScheduled, setMeetingsScheduled] = useState(0);
  const [meetingsHeld, setMeetingsHeld] = useState(0);
  const [noShowCount, setNoShowCount] = useState(0);
  const [qualified, setQualified] = useState(0);
  const [notQualified, setNotQualified] = useState(0);
  const [costUsd, setCostUsd] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [salesValue, setSalesValue] = useState(0);
  const [conversationsCount, setConversationsCount] = useState(0);
  const [successRate, setSuccessRate] = useState<number | null>(null);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ count: scheduled }, { count: held }, { count: noShow }, { data: leadsData }, { data: usageData }, { data: wonData }] = await Promise.all([
        closerIds.length
          ? supabase.from("activities").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("type", "meeting").in("owner_id", closerIds).gte("scheduled_at", sevenDaysAgo)
          : Promise.resolve({ count: 0 }),
        // "Reuniões realizadas": reuniões marcadas pro time de vendas
        // (mesmo filtro de owner_id/closerIds) que o vendedor de fato marcou
        // como concluída (completed_at preenchido) -- ver CRMContext.tsx:1602.
        closerIds.length
          ? supabase.from("activities").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("type", "meeting").in("owner_id", closerIds).not("completed_at", "is", null).gte("completed_at", sevenDaysAgo)
          : Promise.resolve({ count: 0 }),
        // "Taxa de no-show": leads agendados pra reunião (mesmo filtro acima)
        // que o vendedor marcou como não comparecimento (no_show_at
        // preenchido) -- ver CRMContext.tsx:1664.
        closerIds.length
          ? supabase.from("activities").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("type", "meeting").in("owner_id", closerIds).not("no_show_at", "is", null).gte("no_show_at", sevenDaysAgo)
          : Promise.resolve({ count: 0 }),
        supabase.from("leads").select("tags").eq("company_id", companyId).contains("tags", ["SDS: Qualificado"]),
        // lead_id + success alimentam "Número de conversas" e "Taxa de
        // sucesso" -- 1 linha por invocação do loop de IA (agent-sds-qualify),
        // não por conversa, então agrupa por lead_id em memória abaixo.
        supabase.from("agent_usage_log").select("cost_usd, lead_id, success").eq("agent_id", agentId).gte("created_at", sevenDaysAgo),
        // "Vendas feitas": leads.status='won' da empresa no período -- não é
        // atribuído estritamente a este agente (não existe agent_id em
        // leads hoje), mesma limitação já aceita pra "leads qualificados".
        // stage_entered_at é o proxy disponível pra "quando foi ganho" --
        // leads não tem updated_at, e status='won' normalmente acompanha
        // entrar numa etapa de "Ganho" no pipeline.
        supabase.from("leads").select("value").eq("company_id", companyId).eq("status", "won").gte("stage_entered_at", sevenDaysAgo),
      ]);
      setMeetingsScheduled(scheduled ?? 0);
      setMeetingsHeld(held ?? 0);
      setNoShowCount(noShow ?? 0);
      setQualified((leadsData ?? []).length);
      setCostUsd((usageData ?? []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0));
      setSalesCount((wonData ?? []).length);
      setSalesValue((wonData ?? []).reduce((sum, r) => sum + (Number(r.value) || 0), 0));
      const { data: notQualifiedData } = await supabase.from("leads").select("tags").eq("company_id", companyId).contains("tags", ["SDS: Não qualificado"]);
      setNotQualified((notQualifiedData ?? []).length);

      // "Taxa de sucesso": % das conversas cujas invocações no período foram
      // TODAS sem erro (nenhuma chamada de IA falhou, nenhuma tool devolveu
      // ok:false) -- não é conversão de negócio, é confiabilidade técnica.
      const byLead = new Map<string, boolean>();
      for (const row of usageData ?? []) {
        const leadId = row.lead_id as string | null;
        if (!leadId) continue;
        const ok = row.success !== false;
        byLead.set(leadId, (byLead.get(leadId) ?? true) && ok);
      }
      setConversationsCount(byLead.size);
      setSuccessRate(byLead.size > 0 ? ([...byLead.values()].filter(Boolean).length / byLead.size) * 100 : null);
      setLoading(false);
    })();
  }, [agentId, companyId, closerIds]);

  const noShowRate = meetingsScheduled > 0 ? (noShowCount / meetingsScheduled) * 100 : null;

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-[#767676]" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase text-[#767676]"><CheckCircle2 size={12} /> Reuniões agendadas (7 dias)</div>
          <div className="text-[24px] font-bold text-[#111111] mt-1">{meetingsScheduled}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase text-[#767676]"><CheckCircle2 size={12} /> Reuniões realizadas (7 dias)</div>
          <div className="text-[24px] font-bold text-[#128A68] mt-1">{meetingsHeld}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="text-[11px] uppercase text-[#767676]">Taxa de no-show (7 dias)</div>
          <div className="text-[24px] font-bold text-[#111111] mt-1">{noShowRate === null ? "—" : `${noShowRate.toFixed(0)}%`}</div>
          <div className="text-[10px] text-[#CCCCCC] mt-0.5">{noShowCount} de {meetingsScheduled} agendadas</div>
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
          <div className="text-[11px] uppercase text-[#767676]">Número de conversas (7 dias)</div>
          <div className="text-[24px] font-bold text-[#111111] mt-1">{conversationsCount}</div>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <div className="text-[11px] uppercase text-[#767676]">Taxa de sucesso (7 dias)</div>
          <div className="text-[24px] font-bold text-[#128A68] mt-1">{successRate === null ? "—" : `${successRate.toFixed(0)}%`}</div>
          <div className="text-[10px] text-[#CCCCCC] mt-0.5">conversas sem erro do agente</div>
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
