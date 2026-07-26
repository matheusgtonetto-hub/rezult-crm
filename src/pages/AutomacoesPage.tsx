import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, createContext, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronLeft,
  Play, Zap, Power, Minus, Maximize2, ArrowLeft, ArrowRight, Network,
  Save, Pencil, Copy, Download, Upload, Trash2,
  Briefcase, User, MessageCircle, Instagram, Globe, Settings,
  Calendar, Filter, LayoutGrid, X, CheckCircle2,
  Clock, Shuffle, Bot, Code2, Sliders, Mic, Paperclip, Link2, AlignLeft, HelpCircle, StickyNote, Palette,
  ThumbsUp, ThumbsDown, RotateCcw, ArrowLeftRight, UserPlus, UserMinus, UserX,
  Package, DollarSign, Tag, List, MessageSquare, Sparkles, Building2, ToggleLeft, ToggleRight,
  ShoppingCart, Bell, ExternalLink, Info,
  Mail, Phone, UserCheck, Equal, CreditCard,
  Braces, FileDown, Brackets, RefreshCw, Loader2, Square,
  MessageSquareText, Smile, ListChecks, Megaphone,
} from "lucide-react";
import { format, parseISO, subWeeks, subDays, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { emitPlanLimit } from "@/lib/planLimitEvent";
import fixWebmDuration from "fix-webm-duration";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useCRM } from "@/context/CRMContext";
import type { Pipeline, Tag as CrmTagType, CustomFieldGroup, Product as ProductType, LossReason as LossReasonType, CrmList as CrmListType } from "@/data/mockData";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerConfig = { categoryId: string; triggerId: string; label: string; description: string; configData?: Record<string, string | boolean | number> };

type ActionNodeType = "mensagem" | "acoes" | "condicoes" | "espera" | "randomizador" | "api" | "campos" | "ia" | "javascript";

type SubBlockType = "mensagem_texto" | "entrada_usuario" | "atraso_tempo" | "mensagem_audio" | "arquivo_anexo" | "arquivo_url";

type MensagemBotao = { id: string; label: string };

type SubBlock = {
  id: string;
  type: SubBlockType;
  text?: string;
  delaySeconds?: number;
  fileUrl?: string;
  fileName?: string;            // nome original do arquivo (áudio/anexo)
  splitMessages?: boolean;      // "Quebrar mensagens?" — cada parágrafo vira um envio
  buttons?: MensagemBotao[];    // botões de resposta anexados à mensagem de texto
  varName?: string;             // nome da variável para "Entrada do usuário"
  timeoutAmount?: number;       // "Entrada do usuário": tempo de espera pela resposta
  timeoutUnit?: "minutos" | "horas" | "dias"; // unidade do timeout
};

type ActionItem = {
  id: string;
  categoryId: string;
  actionId: string;
  label: string;
  description: string;
  config?: Record<string, string | boolean | number>;
};

type ActionCatItem = { id: string; label: string; description: string; icon: React.ElementType; warning?: boolean };

type ConditionItem = { id: string; categoryId: string; conditionId: string; label: string; config?: Record<string, string | boolean | number> };
type EsperaConfig = {
  type: "intervalo_semana" | "minutos" | "dias" | "horas" | "segundos" | "dia_horario" | "usuario_parou";
  days?: string[];
  startTime?: string;
  endTime?: string;
  timezone?: string;
  amount?: number;
  dateField?: string;
  dateStartTime?: string;
  dateEndTime?: string;
  dateTimezone?: string;
};
type RandomBranch = { id: string; label: string; percentage: number };
type ApiRequest = {
  id: string; name: string; type: "json" | "file";
  method: string; url: string;
  headers: { key: string; value: string }[];
  params: { key: string; value: string }[];
  body: string;
  responseHeaders: { key: string; value: string }[];
};
type ApiConfig = { requests: ApiRequest[] };

// Bloco de IA (BYOK): cada nó contém uma lista de ações de IA. Usa a chave do
// provedor cadastrada em ai_provider_keys. O resultado de cada ação fica disponível
// para os blocos seguintes como {{<outputVar>.resposta}} (ou campos extraídos).
type IaProvider = "openai" | "anthropic" | "google";
type IaActionType = "assistente_chat" | "gerar_texto" | "invocar_agente" | "transcricao_audio" | "intencao" | "sentimento" | "extrator_params";
type IaIntencao = { id: string; nome: string; detalhes?: string; exemplos?: string };
type IaSentimento = { id: string; nome: string; detalhes?: string };
type IaParametro = { id: string; nome: string; tipo: string; info?: string };
type IaAction = {
  id: string;
  type: IaActionType;
  provider: IaProvider;
  model: string;
  outputVar: string;
  instructions?: string;        // assistente_chat, gerar_texto, transcricao, instruções adicionais do agente
  audioSource?: string;         // transcricao_audio
  language?: string;            // transcricao_audio
  intencoes?: IaIntencao[];     // intencao
  sentimentos?: IaSentimento[]; // sentimento
  parametros?: IaParametro[];   // extrator_params
  agentId?: string;             // invocar_agente
  maxTokens?: number;
};

type FieldOpMapeamento     = { id: string; type: "mapeamento";       fieldKey: string; fieldLabel: string; value: string };
type FieldOpLoopArray      = { id: string; type: "loop_array";       datasourceName: string; datasourceColor: string; paramKey: string; paramLabel: string };
type FieldOpAnaliseTel     = { id: string; type: "analise_telefone"; phone: string; datasourceName: string; datasourceColor: string; defaultCountry: string };
type FieldOpFormatacaoData = { id: string; type: "formatacao_data";  date: string; timezone: string; addAmount: number; addUnit: string; datasourceName: string; datasourceColor: string };
type FieldOperation = FieldOpMapeamento | FieldOpLoopArray | FieldOpAnaliseTel | FieldOpFormatacaoData;

type CanvasNode = {
  id: string;
  type: "start" | "note" | ActionNodeType;
  x: number; y: number;
  label: string;
  trigger?: TriggerConfig | null;
  parentId?: string | null;        // legado — migrado para parentIds no carregamento
  errorParentId?: string | null;   // legado — migrado para errorParentIds no carregamento
  parentIds?: string[];            // chaves das portas de saída de origem (azul)
  errorParentIds?: string[];       // IDs dos nós de origem (vermelho — erro)
  timeoutParentIds?: string[];     // IDs dos nós de origem (vermelho — "não respondeu")
  subBlocks?: SubBlock[];
  connectionId?: string;           // conexão (whatsapp_connections) usada pelo bloco Mensagem
  actionItems?: ActionItem[];
  conditionItems?: ConditionItem[];
  espera?: EsperaConfig;
  randomBranches?: RandomBranch[];
  apiConfig?: ApiConfig;
  iaActions?: IaAction[];
  fieldOps?: FieldOperation[];
  noteText?: string;
  noteColorIndex?: number;
  width?: number;
  height?: number;
};

type LogEntry = {
  id: string;
  lead_id: string;
  lead_name: string;
  status: "success" | "alert" | "error";
  created_at: string;
  error_message: string | null;
};

type PathEntry = {
  node_id: string;
  node_label: string;
  node_type: string;
  status: "success" | "alert" | "error";
  created_at: string;
  error_message: string | null;
};

type AutomationRecord = {
  id: string;
  name: string;
  description: string;
  group_name: string;
  active: boolean;
  flow: { nodes: CanvasNode[]; trigger: TriggerConfig | null };
  created_at: string;
  last_webhook_payload?: unknown;
};

// ─── VarPicker context (nodes + custom fields available to VarPicker anywhere) ─

const VarPickerCtx = createContext<{ nodes: CanvasNode[]; customFieldGroups: CustomFieldGroup[]; trigger: TriggerConfig | null; webhookPayload: unknown; refreshWebhookPayload: (() => Promise<void>) | null }>({ nodes: [], customFieldGroups: [], trigger: null, webhookPayload: null, refreshWebhookPayload: null });

// ─── Static data ──────────────────────────────────────────────────────────────

const TRIGGER_CATEGORIES = [
  {
    id: "negocios", label: "Negócios", icon: Briefcase,
    description: "Adicione gatilhos para ações nos seus negócios",
    triggers: [
      { id: "neg_movido",        label: "Negócio movido",                    description: "Quando um negócio é movido para a etapa" },
      { id: "neg_criado",        label: "Negócio criado",                    description: "Quando um negócio é criado em uma etapa." },
      { id: "atend_atribuido",   label: "Atendente atribuído ao negócio",    description: "Quando um atendente é atribuído a um negócio" },
      { id: "atend_retirado",    label: "Atendente retirado do negócio",     description: "Quando um atendente é retirado do negócio" },
      { id: "neg_ganho",         label: "Negócio ganho",                     description: "Quando um negócio é marcado como ganho" },
      { id: "neg_perdido",       label: "Negócio perdido",                   description: "Quando um negócio é marcado como perdido" },
      { id: "neg_restaurado",    label: "Situação do negócio restaurada",    description: "Quando a situação do negócio é restaurada" },
    ],
  },
  {
    id: "leads", label: "Leads", icon: User,
    description: "Adicione gatilhos para ações em leads",
    triggers: [
      { id: "lead_manual",       label: "Execução manual da automação por lead ou contato", description: "Permite executar a automação manualmente a partir de uma seleção ou filtros de leads" },
      { id: "tag_removida",      label: "Tag removida do lead",              description: "Quando uma tag é removida do lead" },
      { id: "tag_adicionada",    label: "Tag adicionada ao lead",            description: "Quando uma tag é adicionada ao lead" },
      { id: "lead_criado",       label: "Lead criado",                       description: "Quando um lead é criado" },
      { id: "lead_qtd_ganhos",   label: "Lead atingir uma quantidade definida de negócios ganhos", description: "Dispara quando o lead alcançar o número especificado de negócios ganhos" },
      { id: "lead_valor_ganhos", label: "Lead ultrapassar um valor definido de negócios ganhos",   description: "Dispara quando o lead ultrapassar o valor especificado de negócios ganhos" },
      { id: "lead_sem_compra",   label: "Lead não realiza compras nos últimos dias",               description: "Dispara quando o lead não realiza compras nos últimos dias" },
    ],
  },
  {
    id: "mensagens", label: "Mensagens", icon: MessageCircle,
    description: "Adicione gatilhos para ações em mensagens",
    triggers: [
      { id: "msg_recebida",      label: "Mensagem recebida",    description: "Quando uma mensagem é recebida" },
      { id: "msg_enviada",       label: "Mensagem enviada",     description: "Quando uma mensagem é enviada" },
      { id: "atend_finalizado",  label: "Atendimento finalizado", description: "Quando um atendimento é finalizado" },
      { id: "atend_iniciado",    label: "Atendimento iniciado", description: "Quando um atendimento é iniciado" },
      { id: "dep_alterado",      label: "Departamento Alterado", description: "Quando um departamento é alterado na conversa" },
    ],
  },
  {
    id: "instagram", label: "Instagram", icon: Instagram,
    description: "Adicione gatilhos para ações no Instagram (exceto mensagens)",
    triggers: [
      { id: "ig_comentario",     label: "Comentário do Instagram recebido",      description: "Quando um comentário do Instagram é recebido" },
      { id: "ig_live",           label: "Comentário em live do Instagram recebido", description: "Quando um comentário em live do Instagram é recebido" },
    ],
  },
  {
    id: "facebook", label: "Facebook", icon: Globe,
    description: "Adicione gatilhos para ações no Facebook (exceto mensagens)",
    triggers: [
      { id: "fb_comentario",     label: "Comentário do Facebook recebido",      description: "Quando um comentário do Facebook é recebido" },
      { id: "fb_live",           label: "Comentário em live do Facebook recebido", description: "Quando um comentário em live do Facebook é recebido" },
    ],
  },
  {
    id: "campos", label: "Campos", icon: LayoutGrid,
    description: "Adicione gatilhos para alterações em campos do sistema ou campos adicionais",
    triggers: [
      { id: "campo_alterado",    label: "Campo alterado", description: "Quando um campo do lead ou negócio é alterado" },
    ],
  },
  {
    id: "http", label: "HTTP", icon: Globe,
    description: "Adicione gatilhos por chamadas HTTP",
    triggers: [
      { id: "http_webhook",      label: "Requisição HTTP (Webhook)", description: "Quando uma requisição HTTP é recebida" },
    ],
  },
  {
    id: "sistema", label: "Sistema", icon: Settings,
    description: "Adicione gatilhos para ações no sistema",
    triggers: [
      { id: "outra_automacao",   label: "Iniciado por outra automação", description: "Quando a automação é iniciada por outra automação" },
      { id: "mcp_tool",          label: "MCP Server Tool",              description: "Trigger acionada quando um agente de IA chama uma tool via MCP" },
      { id: "agendado",          label: "Execução Agendada",            description: "Dispara a automação em um intervalo de tempo fixo" },
    ],
  },
  {
    id: "atividades", label: "Atividades", icon: Calendar,
    description: "Adicione gatilhos para ações em atividades",
    triggers: [
      { id: "atividade_exec",    label: "Atividade executada", description: "Quando uma atividade com automação é executada" },
    ],
  },
];

const ACTION_TYPES = [
  { id: "mensagem",     label: "Mensagem",             icon: MessageCircle, color: "#0EA5E9" },
  { id: "acoes",        label: "Ações",                icon: Zap,           color: "#F97316" },
  { id: "condicoes",    label: "Condições",            icon: Filter,        color: "#8B5CF6" },
  { id: "espera",       label: "Espera",               icon: Clock,         color: "#3B82F6" },
  { id: "randomizador", label: "Randomizador",         icon: Shuffle,       color: "#F97316" },
  { id: "api",          label: "API",                  icon: Globe,         color: "#3B82F6" },
  { id: "campos",       label: "Operações de campos",  icon: Sliders,       color: "#22C55E" },
  { id: "ia",           label: "IA",                   icon: Bot,           color: "#8B5CF6" },
  { id: "javascript",   label: "JavaScript",           icon: Code2,         color: "#3B82F6" },
] as const;

// Blocos disponíveis na paleta porém ainda não executáveis pelo motor — exibidos
// com selo "EM BREVE" e desabilitados (mesmo padrão do gatilho MCP Server Tool).
const COMING_SOON_ACTIONS = new Set<string>(["javascript"]);

// Modelos por provedor de IA (BYOK). Mantém os mais recentes/recomendados de cada um.
const IA_MODELS: Record<IaProvider, { id: string; label: string }[]> = {
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini (rápido e barato)" },
    { id: "gpt-4o",      label: "GPT-4o" },
    { id: "gpt-4.1",     label: "GPT-4.1" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6 (equilibrado)" },
    { id: "claude-opus-4-8",           label: "Claude Opus 4.8 (mais capaz)" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (rápido)" },
  ],
  google: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (rápido)" },
    { id: "gemini-1.5-pro",   label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
};
const IA_PROVIDER_LABELS: Record<IaProvider, string> = {
  openai: "OpenAI (ChatGPT)", anthropic: "Anthropic (Claude)", google: "Google (Gemini)",
};

// Catálogo de ações de IA (picker do bloco de IA). `soon` = exibida mas desabilitada.
// `branch` = a ação gera portas de saída no nó (intenção/sentimento).
const IA_ACTION_TYPES: { id: IaActionType; label: string; desc: string; icon: React.ElementType; soon?: boolean; branch?: boolean }[] = [
  { id: "assistente_chat",  label: "Assistente de chat",            desc: "Gere uma resposta como um assistente com base na conversa atual", icon: MessageCircle },
  { id: "gerar_texto",      label: "Gere um texto com base na conversa", desc: "Gera um texto com base na conversa atual",                    icon: Sparkles },
  { id: "invocar_agente",   label: "Invocar Agente",                desc: "Invoca um agente para processar a conversa atual",                icon: Bot, soon: true },
  { id: "transcricao_audio", label: "Transcrição de áudio",         desc: "Transcreve os áudios do chat para texto",                         icon: Mic },
  { id: "intencao",         label: "Intenção de conversa",          desc: "Identifica a intenção do usuário na conversa atual",              icon: MessageSquareText, branch: true },
  { id: "sentimento",       label: "Sentimento da conversa",        desc: "Identifica o sentimento do usuário na conversa atual",            icon: Smile, branch: true },
  { id: "extrator_params",  label: "Extrator de parâmetros",        desc: "Extrai parâmetros da conversa atual",                             icon: ListChecks },
];
const IA_ACTION_LABEL: Record<IaActionType, string> = Object.fromEntries(IA_ACTION_TYPES.map(a => [a.id, a.label])) as Record<IaActionType, string>;

const ACTION_CATEGORIES: { id: string; label: string; icon: React.ElementType; description: string; actions: ActionCatItem[] }[] = [
  {
    id: "negocios", label: "Negócios", icon: Briefcase,
    description: "Adicione ações em seus negócios",
    actions: [
      { id: "criar_negocio",     label: "Criar negócio",                                            description: "Cria um novo negócio para o lead",                                                           icon: Briefcase },
      { id: "mover_etapa",       label: "Mover negócio de etapa",                                   description: "Move um negócio para outra etapa (da mesma ou de outra pipeline)",                          icon: ArrowLeftRight },
      { id: "ganhar_negocio",    label: "Ganhar negócio",                                           description: "Altere o negócio para ganho",                                                                icon: ThumbsUp },
      { id: "restaurar_negocio", label: "Restaurar negócio",                                        description: "Restaurar status do negócio",                                                                icon: RotateCcw },
      { id: "perder_negocio",    label: "Perder negócio",                                           description: "Altere o negócio para perdido",                                                              icon: ThumbsDown },
      { id: "transf_atend_neg",  label: "Transferir um atendente ao negócio",                       description: "Transfere um atendente ao negócio (substitui o atual caso existir)",                        icon: UserPlus },
      { id: "duplicar_negocio",  label: "Duplicar o negócio",                                       description: "Cria um novo negócio com as mesmas informações do negócio atual",                           icon: Copy },
      { id: "remover_atend_neg", label: "Remover o atendente do negócio",                           description: "Remove o atendente do negócio",                                                              icon: UserMinus },
      { id: "add_produto_neg",   label: "Adicionar um produto ao negócio",                          description: "Adiciona um produto ao negócio",                                                             icon: Package },
      { id: "rem_produto_neg",   label: "Remover um produto do negócio",                            description: "Remove um produto do negócio ou reduz sua quantidade",                                       icon: Package },
      { id: "descontos_neg",     label: "Adicionar descontos, acréscimo, frete e cupom do negócio", description: "Adicionar informações como desconto, acréscimo, frete e cupom ao negócio.",               icon: DollarSign },
      { id: "remover_negocio",   label: "Remover negócio",                                          description: "Remove o negócio",                                                                           icon: Trash2, warning: true },
    ],
  },
  {
    id: "leads", label: "Leads", icon: User,
    description: "Adicione ações em leads",
    actions: [
      { id: "criar_lead",          label: "Criar lead",                      description: "Cria o lead com as informações guardadas nos parâmetros da sessão. Caso o lead já existir, não será criado um novo lead", icon: User },
      { id: "deletar_lead",        label: "Deletar lead",                    description: "Deleta o lead com as informações guardadas nos parâmetros da sessão. Caso não exista um lead, nenhuma ação será realizada",  icon: UserX, warning: true },
      { id: "criar_tags",          label: "Criar tags",                      description: "Crie uma ou mais tags para serem usadas no lead",                                                                             icon: Tag },
      { id: "adicionar_tags",      label: "Adicionar tags",                  description: "Adicione uma ou mais tags ao lead",                                                                                           icon: Tag },
      { id: "remover_tags",        label: "Remover tags",                    description: "Remova uma ou mais tags ao lead",                                                                                             icon: Tag },
      { id: "adicionar_listas",    label: "Adicionar listas",                description: "Adicione uma ou mais listas ao lead",                                                                                         icon: List },
      { id: "remover_listas",      label: "Remover listas",                  description: "Remova uma ou mais listas do lead",                                                                                           icon: List },
      { id: "criar_listas",        label: "Criar listas",                    description: "Crie uma ou mais listas para serem usadas no lead",                                                                           icon: List },
      { id: "comentario_lead",     label: "Adicionar comentário no lead",    description: "Adiciona um comentário no lead",                                                                                              icon: MessageSquare },
      { id: "transf_atend_lead",   label: "Transferir um atendente ao lead", description: "Transferir o atendente responsável do lead",                                                                                  icon: UserPlus },
      { id: "remover_atend_lead",  label: "Remover atendente do lead",       description: "Remover o atendente responsável do lead",                                                                                     icon: UserMinus },
    ],
  },
  {
    id: "mensagens", label: "Mensagens", icon: MessageCircle,
    description: "Adicione ações em mensagens",
    actions: [
      { id: "iniciar_atend",       label: "Iniciar o atendimento",                       description: "Inicia o atendimento da conversa",                             icon: Play },
      { id: "finalizar_atend",     label: "Finalizar o atendimento",                     description: "Finaliza o atendimento da conversa",                           icon: CheckCircle2 },
      { id: "sugestao_resposta",   label: "Adicionar sugestão de resposta",              description: "Adicione uma sugestão de resposta para a conversa",            icon: Sparkles },
      { id: "transf_atend_conv",   label: "Transferir atendente da conversa",            description: "Transfere o atendente da conversa",                            icon: UserPlus },
      { id: "transf_dep",          label: "Transferir departamento da conversa",         description: "Tranfere a conversa para um departamento",                     icon: Building2 },
      { id: "desativar_auto_chat", label: "Desativar as automações de chat na conversa", description: "Desativa as automações de chat para a conversa",               icon: ToggleLeft },
      { id: "ativar_auto_chat",    label: "Ativar as automações de chat na conversa",    description: "Ativa as automações de chat para a conversa",                  icon: ToggleRight },
    ],
  },
  {
    id: "produtos", label: "Produtos", icon: ShoppingCart,
    description: "Adicione ações de produto",
    actions: [
      { id: "criar_produto", label: "Criar produto", description: "Cria um novo produto", icon: ShoppingCart },
    ],
  },
  {
    id: "sistema", label: "Sistema", icon: Settings,
    description: "Adicione ações no sistema",
    actions: [
      { id: "retornar_resultado",  label: "Retornar resultado da tool",   description: "Define o conteúdo que será retornado como resultado da tool para o agente de IA", icon: Upload },
      { id: "enviar_notificacao",  label: "Enviar notificação",           description: "Envia uma notificação para os usuários",                                          icon: Bell },
      { id: "iniciar_automacao",   label: "Iniciar outra automação",      description: "Permite iniciar outra automação passando parâmetros específicos da sessão.",     icon: Link2 },
      { id: "enviar_evento_meta",  label: "Enviar evento para Meta Ads",  description: "Envia um evento de conversão para o Meta Ads via Conversions API. Configure as credenciais em Configurações → Chaves de API.", icon: Megaphone },
    ],
  },
  {
    id: "atividades", label: "Atividades", icon: Calendar,
    description: "Adicione ações para criar atividades",
    actions: [
      { id: "criar_atividade", label: "Criar atividade", description: "Cria uma atividade vinculada a um lead ou negócio", icon: Calendar },
    ],
  },
];

const CONDITION_CATEGORIES: { id: string; label: string; icon: React.ElementType; description: string; conditions: { id: string; label: string; description: string; icon: React.ElementType; warning?: boolean }[] }[] = [
  { id: "negocios", label: "Negócios", icon: Briefcase, description: "Condições baseadas em negócios",
    conditions: [
      { id: "pos_atend",       label: "Negócio possui atendentes",                           description: "Verifica se o negócio possui atendentes",                            icon: UserCheck },
      { id: "sem_atend",       label: "Negócio sem atendentes",                              description: "Verifica se o negócio não possui atendentes",                        icon: UserX },
      { id: "ganho",           label: "Negócio está ganho",                                  description: "Verifica se o negócio está ganho",                                   icon: ThumbsUp },
      { id: "perdido",         label: "Negócio está perdido",                                description: "Verifica se o negócio está perdido",                                 icon: ThumbsDown },
      { id: "pendente",        label: "Negócio está pendente",                               description: "Verifica se o negócio está pendente",                                icon: Clock },
      { id: "pos_produto",     label: "Negócio possui o produto",                            description: "Verifica se o negócio possui um produto",                            icon: Package },
      { id: "com_id_externo",  label: "Negócio com ID externo existente",                    description: "Verifica se o negócio com o ID externo informado existe",            icon: ExternalLink },
      { id: "campo_adicional", label: "Procura se existe um negócio com um campo adicional", description: "Verifica/procura um negócio com o campo adicional informado",        icon: AlignLeft, warning: true },
    ],
  },
  { id: "leads", label: "Leads", icon: User, description: "Condições baseadas em leads",
    conditions: [
      { id: "existente",       label: "Lead existente",                                      description: "Verifica se o lead já está cadastrado",                              icon: User },
      { id: "neg_pipeline",    label: "Lead possui negócio na pipeline",                     description: "Verifica se o lead possui um negócio na pipeline",                   icon: Briefcase },
      { id: "neg_etapa",       label: "Lead possui negócio na etapa",                        description: "Verifica se o lead possui um negócio em uma etapa",                  icon: Briefcase },
      { id: "com_email",       label: "Lead com email existente",                            description: "Verifica se o lead já está cadastrado com um email",                 icon: Mail },
      { id: "com_nome",        label: "Lead com nome existente",                             description: "Verifica se o lead já está cadastrado com um nome",                  icon: User },
      { id: "com_telefone",    label: "Lead com telefone existente",                         description: "Verifica se o lead já está cadastrado com um telefone",              icon: Phone },
      { id: "com_cpf",         label: "Lead com CPF existente",                              description: "Verifica se o lead já está cadastrado com um CPF",                   icon: CreditCard },
      { id: "pos_tag",         label: "Verifica se o lead possui uma tag",                   description: "Verifica se o lead possui uma das tags informadas",                  icon: Tag },
      { id: "pos_atend",       label: "Lead possuir atendente responsável",                  description: "Verifica se o lead possui atendente responsável",                    icon: UserCheck },
      { id: "campo_adicional", label: "Procura se existe um lead com um campo adicional",    description: "Verifica/procura um lead com o campo adicional informado",           icon: AlignLeft, warning: true },
    ],
  },
  { id: "campos", label: "Campos", icon: LayoutGrid, description: "Condições baseadas em valores de campos",
    conditions: [
      { id: "campo_igual",     label: "Campo com valor igual",                               description: "Verifica se um campo possui um valor exatamente igual a um valor específico", icon: Equal },
      { id: "campo_contem",    label: "Campo contém valor",                                  description: "Verifica se um campo contém um valor específico",                    icon: Sliders },
      { id: "campo_pos_valor", label: "Campo possui valor",                                  description: "Verifica se um campo possui um valor",                               icon: CheckCircle2 },
      { id: "campo_entre",     label: "Campo possui um valor entre dois valores",            description: "Verifica se um campo numérico está entre dois valores específicos",   icon: Sliders },
    ],
  },
  { id: "tempo", label: "Tempo", icon: Clock, description: "Condições baseadas em data e hora",
    conditions: [
      { id: "intervalo_tempo", label: "Verifica se a hora atual está em um intervalo de dia/hora", description: "Verifica se a hora atual está dentro dos dias da semana e horários selecionados", icon: Clock },
    ],
  },
  { id: "conversas", label: "Conversas", icon: MessageCircle, description: "Condições baseadas em conversas",
    conditions: [
      { id: "conv_atend",        label: "Conversa possuir atendente responsável",            description: "Verifica se a conversa possui atendente responsável",               icon: UserCheck },
      { id: "conv_finalizada",   label: "Conversa finalizada",                               description: "Verifica se a conversa foi finalizada",                             icon: CheckCircle2 },
      { id: "auto_chat",         label: "Automações de chat estão habilitadas",              description: "Verifica se as automações de chat estão habilitadas para a conversa atual", icon: ToggleRight },
      { id: "conv_departamento", label: "Conversa em departamento",                          description: "Verifica se a conversa está atribuída a um departamento específico", icon: Building2 },
      { id: "janela_aberta",     label: "Janela de conversa está aberta",                    description: "Verifica se a última mensagem recebida está dentro da janela de tempo configurada", icon: Clock },
    ],
  },
  { id: "instagram", label: "Instagram", icon: Instagram, description: "Condições baseadas no Instagram",
    conditions: [
      { id: "ig_seguidor", label: "Seguidor do Instagram", description: "Verifica se o contato é um seguidor do Instagram", icon: Instagram },
    ],
  },
];

const MENSAGEM_CATEGORIES: { id: string; label: string; icon: React.ElementType; description: string; items: { type: SubBlockType; label: string; description: string }[] }[] = [
  { id: "texto",     label: "Texto",     icon: AlignLeft,  description: "Envie mensagens de texto para o contato",         items: [{ type: "mensagem_texto",  label: "Mensagem de texto",    description: "Envie uma mensagem de texto simples para o contato" }] },
  { id: "interacao", label: "Interação", icon: HelpCircle, description: "Aguarde e capture respostas do usuário",           items: [{ type: "entrada_usuario", label: "Entrada do usuário",   description: "Aguarda uma resposta do usuário e armazena como variável" }] },
  { id: "fluxo",     label: "Fluxo",     icon: Clock,      description: "Controle o timing da conversa",                   items: [{ type: "atraso_tempo",    label: "Atraso de tempo",      description: "Adiciona um delay antes do próximo bloco ser executado" }] },
  { id: "midia",     label: "Mídia",     icon: Paperclip,  description: "Envie arquivos e conteúdo de mídia",              items: [
    { type: "mensagem_audio", label: "Mensagem de áudio",    description: "Envie um áudio gravado para o contato" },
    { type: "arquivo_anexo",  label: "Arquivo anexo",         description: "Envie um arquivo anexo para o contato" },
    { type: "arquivo_url",    label: "Arquivo URL Dinâmica",  description: "Envie um arquivo a partir de uma URL dinâmica" },
  ]},
];

const NOTE_COLORS = [
  { bg: "#FEFCE8", header: "#FEF08A", border: "#FDE047", borderSel: "#EAB308", text: "#713F12", headerText: "#854D0E" },
  { bg: "#EFF6FF", header: "#BFDBFE", border: "#93C5FD", borderSel: "#3B82F6", text: "#1E40AF", headerText: "#1D4ED8" },
  { bg: "#F0FDF4", header: "#BBF7D0", border: "#86EFAC", borderSel: "#22C55E", text: "#14532D", headerText: "#166534" },
  { bg: "#FDF2F8", header: "#F9A8D4", border: "#F472B6", borderSel: "#EC4899", text: "#831843", headerText: "#9D174D" },
  { bg: "#FFF7ED", header: "#FED7AA", border: "#FDBA74", borderSel: "#F97316", text: "#7C2D12", headerText: "#9A3412" },
  { bg: "#FAF5FF", header: "#DDD6FE", border: "#C4B5FD", borderSel: "#8B5CF6", text: "#4C1D95", headerText: "#5B21B6" },
];

const START_NODE: CanvasNode = { id: "n1", type: "start", x: 80, y: 80, label: "Início", trigger: null };

// ─── Modelos pré-configurados (opção "Modelo" ao criar automação) ─────────────
// Usam apenas peças genéricas (gatilho + mensagem + espera), sem IDs específicos
// de um tenant (pipeline/etapa/tag), para funcionarem em qualquer empresa. O
// usuário ajusta os textos, a conexão de WhatsApp e os detalhes no editor.
const tplTrigger = (categoryId: string, triggerId: string, label: string, description: string): TriggerConfig =>
  ({ categoryId, triggerId, label, description, configData: {} });
const tplMsg = (id: string, x: number, parentId: string, text: string): CanvasNode =>
  ({ id, type: "mensagem", x, y: 80, label: "Mensagem", parentIds: [parentId], subBlocks: [{ id: `${id}_sb`, type: "mensagem_texto", text, splitMessages: false }] });
const tplWait = (id: string, x: number, parentId: string, espera: EsperaConfig): CanvasNode =>
  ({ id, type: "espera", x, y: 80, label: "Espera", parentIds: [parentId], espera });
const tplStart = (trigger: TriggerConfig): CanvasNode => ({ ...START_NODE, trigger });

const AUTOMATION_TEMPLATES: { id: string; name: string; description: string; group: string; icon: React.ElementType; flow: { nodes: CanvasNode[]; trigger: TriggerConfig } }[] = [
  {
    id: "boas_vindas",
    name: "Boas-vindas a novo lead",
    description: "Recebe automaticamente todo lead novo com uma saudação e uma pergunta de qualificação.",
    group: "Atendimento",
    icon: User,
    flow: (() => {
      const trigger = tplTrigger("leads", "lead_criado", "Lead criado", "Quando um lead é criado");
      return {
        trigger,
        nodes: [
          tplStart(trigger),
          tplMsg("m1", 360, "n1", "Olá! 👋 Que bom ter você por aqui. Sou da equipe e vou te ajudar no que precisar."),
          tplWait("w1", 640, "m1", { type: "minutos", amount: 2 }),
          tplMsg("m2", 920, "w1", "Pra começar, me conta: qual é o seu principal objetivo neste momento?"),
        ],
      };
    })(),
  },
  {
    id: "pos_venda",
    name: "Pós-venda e indicação",
    description: "Agradece o cliente após o negócio ser ganho e, alguns dias depois, pede uma indicação.",
    group: "Relacionamento",
    icon: ThumbsUp,
    flow: (() => {
      const trigger = tplTrigger("negocios", "neg_ganho", "Negócio ganho", "Quando um negócio é marcado como ganho");
      return {
        trigger,
        nodes: [
          tplStart(trigger),
          tplMsg("m1", 360, "n1", "Parabéns pela decisão! 🎉 Estamos muito felizes em ter você com a gente."),
          tplWait("w1", 640, "m1", { type: "dias", amount: 3 }),
          tplMsg("m2", 920, "w1", "Como está sendo sua experiência até aqui? Se conhece alguém que também se beneficiaria, ficaríamos gratos pela indicação. 🙌"),
        ],
      };
    })(),
  },
  {
    id: "resgate_perdido",
    name: "Resgate de negócio perdido",
    description: "Espera 1 dia após um negócio ser perdido e tenta reengajar o lead.",
    group: "Recuperação",
    icon: RotateCcw,
    flow: (() => {
      const trigger = tplTrigger("negocios", "neg_perdido", "Negócio perdido", "Quando um negócio é marcado como perdido");
      return {
        trigger,
        nodes: [
          tplStart(trigger),
          tplWait("w1", 360, "n1", { type: "dias", amount: 1 }),
          tplMsg("m1", 640, "w1", "Olá! Notei que não conseguimos seguir adiante desta vez. Posso te ajudar a esclarecer alguma dúvida ou rever as condições?"),
        ],
      };
    })(),
  },
  {
    id: "followup_proposta",
    name: "Follow-up de proposta",
    description: "Quando o negócio é movido de etapa, aguarda 2 dias e faz um follow-up da proposta.",
    group: "Vendas",
    icon: ArrowLeftRight,
    flow: (() => {
      const trigger = tplTrigger("negocios", "neg_movido", "Negócio movido", "Quando um negócio é movido para a etapa");
      return {
        trigger,
        nodes: [
          tplStart(trigger),
          tplWait("w1", 360, "n1", { type: "dias", amount: 2 }),
          tplMsg("m1", 640, "w1", "Oi! Passando pra saber se você teve a chance de analisar a proposta. Fico à disposição para qualquer dúvida. 😊"),
        ],
      };
    })(),
  },
  {
    id: "lead_formulario_webhook",
    name: "Lead Formulário Webhook",
    description: "Recebe leads de formulário via webhook (HTTP): analisa o telefone, evita duplicar o lead por e-mail/telefone, cria o lead e o negócio e mapeia os campos e UTMs. Ajuste o pipeline/etapa e os campos conforme o seu formulário.",
    group: "Captação",
    icon: Globe,
    flow: {
      trigger: { categoryId: "http", triggerId: "http_webhook", label: "Webhook (HTTP)", description: "", configData: {} },
      nodes: [
        { id: "n1", type: "start", x: -274, y: -103, label: "Início", trigger: { categoryId: "http", triggerId: "http_webhook", label: "Webhook (HTTP)", description: "", configData: {} }, parentIds: [], errorParentIds: [], timeoutParentIds: [] },
        { id: "47f80bdc-6d2d-4cf6-9ebc-b58b8334f5fd", type: "campos", x: 44, y: -99, label: "Operações de campos", parentIds: ["n1"], errorParentIds: [], timeoutParentIds: [], fieldOps: [
          { id: "fo1780949943823", type: "analise_telefone", phone: "{{gatilho.telefone}}", datasourceName: "phone-1", datasourceColor: "#6366F1", defaultCountry: "BR" },
        ] },
        { id: "b91d0749-d26a-405e-bf33-3d7049ee0cfd", type: "condicoes", x: 381, y: -197, label: "Condições", parentIds: ["47f80bdc-6d2d-4cf6-9ebc-b58b8334f5fd"], errorParentIds: [], timeoutParentIds: [], conditionItems: [
          { id: "74abf544-7d1b-41bc-a384-db4f1f50b456", categoryId: "leads", conditionId: "com_email", label: "Lead com email existente", config: { email: "{{gatilho.email}}" } },
        ] },
        { id: "270c139f-2ed7-4f0d-8484-fa02af092d0a", type: "condicoes", x: 422, y: 108, label: "Condições", parentIds: [], errorParentIds: ["b91d0749-d26a-405e-bf33-3d7049ee0cfd"], timeoutParentIds: [], conditionItems: [
          { id: "ci1780961144983", categoryId: "leads", conditionId: "com_telefone", label: "Lead com telefone existente", config: { telefone: "{{phone-1.phone}}" } },
        ] },
        { id: "294778fb-c1a5-4e9c-9013-d8dd9410701a", type: "campos", x: 430, y: 425, label: "Operações de campos", parentIds: [], errorParentIds: ["270c139f-2ed7-4f0d-8484-fa02af092d0a"], timeoutParentIds: [], fieldOps: [
          { id: "092221bd-9823-4b25-81e6-93087451a6dc", type: "mapeamento", fieldKey: "lead.name",     fieldLabel: "Nome do lead", value: "{{gatilho.nome}}" },
          { id: "e56d1c67-a64e-4a03-9054-bdb7ed7ac3af", type: "mapeamento", fieldKey: "lead.email",    fieldLabel: "E-mail",       value: "{{gatilho.email}}" },
          { id: "828ee144-1fbf-433c-8fd9-29a414b9ec67", type: "mapeamento", fieldKey: "lead.whatsapp", fieldLabel: "Telefone",     value: "{{phone-1.phone}}" },
          { id: "3d39a7fe-0209-40c5-bad7-1a9eb7546b72", type: "mapeamento", fieldKey: "lead.origin",   fieldLabel: "Origem",       value: "{{gatilho.origem}}" },
        ] },
        { id: "edcecf8b-a8c2-4340-c185-385389031851", type: "acoes", x: 832, y: 537, label: "Ação", parentIds: ["294778fb-c1a5-4e9c-9013-d8dd9410701a"], errorParentIds: [], timeoutParentIds: [], actionItems: [
          { id: "ai1780949926048", categoryId: "leads", actionId: "criar_lead", label: "Criar lead", description: "Cria o lead com as informações guardadas nos parâmetros da sessão. Caso o lead já exista, não será criado um novo lead" },
        ] },
        { id: "e07410f6-6f3b-4e1a-a102-6a7562c3e195", type: "acoes", x: 1690, y: 66, label: "Ação", parentIds: [], errorParentIds: ["0456935a-642d-426e-9af2-053ba03b9e6f"], timeoutParentIds: [], actionItems: [
          { id: "ai1780950024157", categoryId: "negocios", actionId: "criar_negocio", label: "Criar negócio", description: "Cria um novo negócio para o lead" },
        ] },
        { id: "0456935a-642d-426e-9af2-053ba03b9e6f", type: "condicoes", x: 1682, y: -205, label: "Condições", parentIds: ["n1780960791155"], errorParentIds: [], timeoutParentIds: [], conditionItems: [
          { id: "4366358c-2f41-499c-8bdd-2272f3fa8394", categoryId: "negocios", conditionId: "neg_pipeline", label: "Lead possui negócio no pipeline" },
        ] },
        { id: "n1780960791155", type: "campos", x: 1248, y: -212, label: "Operações de campos", parentIds: ["edcecf8b-a8c2-4340-c185-385389031851", "270c139f-2ed7-4f0d-8484-fa02af092d0a", "b91d0749-d26a-405e-bf33-3d7049ee0cfd_74abf544-7d1b-41bc-a384-db4f1f50b456"], errorParentIds: [], timeoutParentIds: [], fieldOps: [
          { id: "092221bd-9823-4b25-81e6-93087451a6dc", type: "mapeamento", fieldKey: "lead.name",         fieldLabel: "Nome do lead", value: "{{gatilho.nome}}" },
          { id: "e56d1c67-a64e-4a03-9054-bdb7ed7ac3af", type: "mapeamento", fieldKey: "lead.email",        fieldLabel: "E-mail",       value: "{{gatilho.email}}" },
          { id: "828ee144-1fbf-433c-8fd9-29a414b9ec67", type: "mapeamento", fieldKey: "lead.whatsapp",     fieldLabel: "Telefone",     value: "{{phone-1.phone}}" },
          { id: "3d39a7fe-0209-40c5-bad7-1a9eb7546b72", type: "mapeamento", fieldKey: "lead.origin",       fieldLabel: "Origem",       value: "{{gatilho.origem}}" },
          { id: "fo1780960840506", type: "mapeamento", fieldKey: "lead.utm_source",   fieldLabel: "UTM Source",   value: "{{gatilho.utm_source}}" },
          { id: "fo1780960862361", type: "mapeamento", fieldKey: "lead.utm_medium",   fieldLabel: "UTM Medium",   value: "{{gatilho.utm_medium}}" },
          { id: "fo1780960874256", type: "mapeamento", fieldKey: "lead.utm_campaign", fieldLabel: "UTM Campaign", value: "{{gatilho.utm_campaign}}" },
          { id: "fo1780960884458", type: "mapeamento", fieldKey: "lead.utm_term",     fieldLabel: "UTM Term",     value: "{{gatilho.utm_term}}" },
          { id: "fo1780960899397", type: "mapeamento", fieldKey: "lead.utm_content",  fieldLabel: "UTM Content",  value: "{{gatilho.utm_content}}" },
          { id: "fo1780965196258", type: "mapeamento", fieldKey: "lead.company",      fieldLabel: "Empresa",      value: "{{gatilho.empresa}}" },
        ] },
        { id: "note1780950041404", type: "note", x: 363, y: -294, label: "Anotação", width: 818, height: 1087, noteText: "Altere o campo com os dados de entrada do seu Webhook", parentIds: [], errorParentIds: [], timeoutParentIds: [] },
        { id: "note1780950089555", type: "note", x: 1217, y: -287, label: "Anotação", width: 360, height: 528, noteText: "Edite conforme as perguntas do formulário.", noteColorIndex: 1, parentIds: [], errorParentIds: [], timeoutParentIds: [] },
        { id: "note1780950117317", type: "note", x: 1637, y: -285, label: "Anotação", width: 365, height: 648, noteText: "", noteColorIndex: 2, parentIds: [], errorParentIds: [], timeoutParentIds: [] },
      ],
    },
  },
  {
    id: "meta_lead_qualificado",
    name: "Meta Ads · Lead qualificado",
    description: "Envia evento 'Lead' para o Meta Ads quando um negócio é movido de etapa. Configure o pixel em Configurações → Chaves de API.",
    group: "Meta Ads",
    icon: Megaphone,
    flow: (() => {
      const trigger = tplTrigger("negocios", "neg_movido", "Negócio movido", "Quando um negócio é movido para a etapa");
      return {
        trigger,
        nodes: [
          tplStart(trigger),
          { id: "acoes_meta_lead", type: "acoes" as const, x: 360, y: 80, label: "Ação", parentIds: ["n1"], errorParentIds: [], timeoutParentIds: [],
            actionItems: [{ id: "ai_meta_lead", categoryId: "sistema", actionId: "enviar_evento_meta", label: "Enviar evento para Meta Ads", description: "Envia um evento de conversão para o Meta Ads via Conversions API", config: { event_name: "Lead" } }] },
        ],
      };
    })(),
  },
  {
    id: "meta_purchase",
    name: "Meta Ads · Negócio ganho (Purchase)",
    description: "Envia evento 'Purchase' para o Meta Ads quando um negócio é marcado como ganho. Inclui o valor do negócio se disponível.",
    group: "Meta Ads",
    icon: Megaphone,
    flow: (() => {
      const trigger = tplTrigger("negocios", "neg_ganho", "Negócio ganho", "Quando um negócio é marcado como ganho");
      return {
        trigger,
        nodes: [
          tplStart(trigger),
          { id: "acoes_meta_purchase", type: "acoes" as const, x: 360, y: 80, label: "Ação", parentIds: ["n1"], errorParentIds: [], timeoutParentIds: [],
            actionItems: [{ id: "ai_meta_purchase", categoryId: "sistema", actionId: "enviar_evento_meta", label: "Enviar evento para Meta Ads", description: "Envia um evento de conversão para o Meta Ads via Conversions API", config: { event_name: "Purchase" } }] },
        ],
      };
    })(),
  },
];

function buildOrthPath(x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1;
  if (Math.abs(dy) < 2) return `M ${x1} ${y1} H ${x2}`;
  // Vertical segment capped at x2-28 so the path always enters the target from the left
  const vertX = Math.min((x1 + x2) / 2, x2 - 28);
  const sy = dy > 0 ? 1 : -1;
  const s1 = vertX >= x1 ? 1 : -1;
  const rc1 = Math.max(0, Math.min(12, Math.abs(vertX - x1) - 0.5, Math.abs(dy / 2) - 0.5));
  const rc2 = Math.max(0, Math.min(12, Math.abs(x2 - vertX) - 0.5, Math.abs(dy / 2) - 0.5));
  if (rc1 < 0.5 || rc2 < 0.5) return `M ${x1} ${y1} H ${vertX} V ${y2} H ${x2}`;
  return `M ${x1} ${y1} H ${vertX - s1 * rc1} Q ${vertX} ${y1} ${vertX} ${y1 + sy * rc1} V ${y2 - sy * rc2} Q ${vertX} ${y2} ${vertX + rc2} ${y2} H ${x2}`;
}

// ─── DataCrazy .dc → Rezult converter ────────────────────────────────────────

const DC_TRIGGER_MAP: Record<string, { triggerId: string; categoryId: string; label: string }> = {
  "business-created-trigger":       { triggerId: "neg_criado",     categoryId: "negocios", label: "Negócio criado" },
  "business-won-trigger":           { triggerId: "neg_ganho",      categoryId: "negocios", label: "Negócio ganho" },
  "business-lost-trigger":          { triggerId: "neg_perdido",    categoryId: "negocios", label: "Negócio perdido" },
  "business-stage-changed-trigger": { triggerId: "neg_movido",     categoryId: "negocios", label: "Negócio movido" },
  "lead-created-trigger":           { triggerId: "lead_criado",    categoryId: "leads",    label: "Lead criado" },
  "tag-added-trigger":              { triggerId: "tag_adicionada", categoryId: "leads",    label: "Tag adicionada ao lead" },
  "tag-removed-trigger":            { triggerId: "tag_removida",   categoryId: "leads",    label: "Tag removida do lead" },
  "json-http-request-trigger":      { triggerId: "http_webhook",   categoryId: "http",     label: "Webhook (HTTP)" },
};

const DC_CONDITION_MAP: Record<string, { categoryId: string; conditionId: string; label: string }> = {
  "lead-with-phone-exists-condition":         { categoryId: "leads",    conditionId: "com_telefone", label: "Lead com telefone existente" },
  "lead-with-email-exists-condition":         { categoryId: "leads",    conditionId: "com_email",    label: "Lead com email existente" },
  "lead-exists-condition":                   { categoryId: "leads",    conditionId: "existente",    label: "Lead existente" },
  "lead-with-name-exists-condition":          { categoryId: "leads",    conditionId: "com_nome",     label: "Lead com nome existente" },
  "lead-with-tag-condition":                 { categoryId: "leads",    conditionId: "pos_tag",      label: "Lead possui tag" },
  "business-won-condition":                  { categoryId: "negocios", conditionId: "ganho",        label: "Negócio está ganho" },
  "business-lost-condition":                 { categoryId: "negocios", conditionId: "perdido",      label: "Negócio está perdido" },
  "business-pending-condition":              { categoryId: "negocios", conditionId: "pendente",     label: "Negócio está pendente" },
  "business-has-attendant-condition":        { categoryId: "negocios", conditionId: "pos_atend",    label: "Negócio possui atendentes" },
  "lead-has-business-on-pipeline-condition": { categoryId: "leads",    conditionId: "neg_pipeline", label: "Lead possui negócio no pipeline" },
};

const DC_FIELD_PARAM_MAP: Record<string, { fieldKey: string; fieldLabel: string }> = {
  "leadName":        { fieldKey: "lead.name",         fieldLabel: "Nome do lead" },
  "leadEmail":       { fieldKey: "lead.email",         fieldLabel: "E-mail" },
  "leadPhone":       { fieldKey: "lead.whatsapp",      fieldLabel: "Telefone" },
  "leadSource":      { fieldKey: "lead.origin",        fieldLabel: "Origem" },
  "leadCompany":     { fieldKey: "lead.company",       fieldLabel: "Empresa" },
  "leadDocument":    { fieldKey: "lead.document",      fieldLabel: "CPF/CNPJ" },
  "leadBirthDate":   { fieldKey: "lead.birth_date",    fieldLabel: "Data de nascimento" },
  "leadNotes":       { fieldKey: "lead.notes",         fieldLabel: "Notas" },
  "leadSite":        { fieldKey: "lead.site",          fieldLabel: "Site" },
  "leadUtmSource":   { fieldKey: "lead.utm_source",    fieldLabel: "UTM Source" },
  "leadUtmMedium":   { fieldKey: "lead.utm_medium",    fieldLabel: "UTM Medium" },
  "leadUtmCampaign": { fieldKey: "lead.utm_campaign",  fieldLabel: "UTM Campaign" },
  "leadUtmTerm":     { fieldKey: "lead.utm_term",      fieldLabel: "UTM Term" },
  "leadUtmContent":  { fieldKey: "lead.utm_content",   fieldLabel: "UTM Content" },
};

function migrateNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map(n => ({
    ...n,
    parentIds: n.parentIds ?? (n.parentId ? [n.parentId] : []),
    errorParentIds: n.errorParentIds ?? (n.errorParentId ? [n.errorParentId] : []),
    timeoutParentIds: n.timeoutParentIds ?? [],
  }));
}

function convertDcFlow(dc: Record<string, unknown>): { nodes: CanvasNode[]; trigger: TriggerConfig | null } | null {
  if (!Array.isArray(dc.blocks)) return null;
  const blocks = dc.blocks as Record<string, unknown>[];

  // Constrói mapa inverso: childId → { parentId, isError }
  const parentMap = new Map<string, { parentId: string; isError: boolean }>();
  const setParent = (childId: unknown, parentId: string, isError: boolean) => {
    if (typeof childId === "string" && childId && !parentMap.has(childId))
      parentMap.set(childId, { parentId, isError });
  };

  for (const block of blocks) {
    const id = block.id as string;
    const opts = (block.options ?? {}) as Record<string, unknown>;
    setParent(opts.nextBlockId, id, false);
    setParent(opts.errorNextBlockId, id, true);
    if (block.type === "condition") {
      setParent(opts.trueNextBlockId, id, false);
      setParent(opts.falseNextBlockId, id, true);
    }
  }

  const nodes: CanvasNode[] = [];
  let trigger: TriggerConfig | null = null;

  for (const block of blocks) {
    const id = block.id as string;
    const opts = (block.options ?? {}) as Record<string, unknown>;
    const pres = (block.presentation ?? {}) as { x?: number; y?: number };
    const x = pres.x ?? 0;
    const y = pres.y ?? 0;
    const par = parentMap.get(id);
    const parentId    = par && !par.isError ? par.parentId : null;
    const errorParentId = par?.isError ? par.parentId : null;

    if (block.type === "trigger") {
      const dcTriggers = Array.isArray(opts.triggers) ? (opts.triggers as Record<string, unknown>[]) : [];
      const dcT = dcTriggers[0];
      const mapped = dcT ? DC_TRIGGER_MAP[dcT.name as string] : null;
      trigger = mapped
        ? { triggerId: mapped.triggerId, categoryId: mapped.categoryId, label: mapped.label, description: "" }
        : { triggerId: "http_webhook", categoryId: "http", label: String(dcT?.name ?? "Gatilho"), description: "" };
      nodes.push({ id, type: "start", x, y, label: "Início", trigger });

    } else if (block.type === "condition") {
      const dcConds = Array.isArray(opts.conditions) ? (opts.conditions as Record<string, unknown>[]) : [];
      const conditionItems: ConditionItem[] = dcConds.map((c, i) => {
        const mapped = DC_CONDITION_MAP[c.name as string];
        return mapped
          ? { id: String(c.id ?? `ci${i}`), categoryId: mapped.categoryId, conditionId: mapped.conditionId, label: mapped.label }
          : { id: String(c.id ?? `ci${i}`), categoryId: "campos", conditionId: "campo_pos_valor", label: String(c.name ?? `Condição ${i + 1}`) };
      });
      nodes.push({ id, type: "condicoes", x, y, label: "Condições", parentIds: parentId ? [parentId] : [], errorParentIds: errorParentId ? [errorParentId] : [], conditionItems });

    } else if (block.type === "field-operation") {
      const dcFieldOps = Array.isArray(opts.fieldOperations) ? (opts.fieldOperations as Record<string, unknown>[]) : [];
      const fieldOps: FieldOperation[] = dcFieldOps
        .filter(op => (op.name as string) === "set-field-operation")
        .map((op, i) => {
          const opOpts = (op.options ?? {}) as Record<string, unknown>;
          const param  = String(opOpts.parameter ?? "");
          const value  = String(opOpts.value ?? "");
          const addFieldMatch = param.match(/^additional-field\[(.+)\]$/);
          if (addFieldMatch) {
            return { id: String(op.stepId ?? `fo${i}`), type: "mapeamento" as const, fieldKey: `campo_lead.${addFieldMatch[1]}`, fieldLabel: addFieldMatch[1], value };
          }
          const mapped = DC_FIELD_PARAM_MAP[param];
          return { id: String(op.stepId ?? `fo${i}`), type: "mapeamento" as const, fieldKey: mapped?.fieldKey ?? param, fieldLabel: mapped?.fieldLabel ?? param, value };
        });
      nodes.push({ id, type: "campos", x, y, label: "Operações de campos", parentIds: parentId ? [parentId] : [], errorParentIds: errorParentId ? [errorParentId] : [], fieldOps });

    } else {
      const label = block.type === "chat" ? "Mensagem" : block.type === "action" ? "Ação" : String(block.type);
      nodes.push({ id, type: "acoes", x, y, label, parentIds: parentId ? [parentId] : [], errorParentIds: errorParentId ? [errorParentId] : [], actionItems: [] });
    }
  }

  return { nodes, trigger };
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "d 'de' MMMM 'de' yyyy HH:mm", { locale: ptBR }); }
  catch { return iso; }
}

function fmtDateShort(iso: string) {
  try { return format(parseISO(iso), "d MMM HH:mm", { locale: ptBR }); }
  catch { return iso; }
}

// ─── Mini-mapa do fluxo (pré-visualização nos cards da lista) ────────────────
// Cabeçalho de cada nó (ícone + título + cor), espelhando o editor.
const PREVIEW_HEADER: Record<string, { color: string; title: string; icon: React.ElementType }> = {
  start:        { color: "#16A34A", title: "Início",              icon: Play },
  mensagem:     { color: "#0EA5E9", title: "Mensagem",            icon: MessageCircle },
  acoes:        { color: "#F97316", title: "Ação",                icon: Zap },
  condicoes:    { color: "#8B5CF6", title: "Condições",           icon: Filter },
  espera:       { color: "#3B82F6", title: "Espera",              icon: Clock },
  randomizador: { color: "#F97316", title: "Randomizador",        icon: Shuffle },
  api:          { color: "#3B82F6", title: "API",                 icon: Globe },
  campos:       { color: "#22C55E", title: "Operações de campos", icon: Sliders },
  ia:           { color: "#8B5CF6", title: "IA",                  icon: Bot },
  javascript:   { color: "#3B82F6", title: "JavaScript",          icon: Code2 },
};

// Itens exibidos no corpo de cada nó (como no editor): ações, condições, campos,
// blocos de mensagem, resumo da espera, etc.
function previewBodyLines(n: CanvasNode): { icon?: React.ElementType; text: string }[] {
  switch (n.type) {
    case "start": return [{ text: n.trigger?.label ?? "Sem gatilho" }];
    case "acoes": return (n.actionItems ?? []).map(it => {
      const act = ACTION_CATEGORIES.find(c => c.id === it.categoryId)?.actions.find(a => a.id === it.actionId);
      return { icon: act?.icon, text: it.label };
    });
    case "condicoes": return (n.conditionItems ?? []).map(it => ({ text: it.label }));
    case "campos": return (n.fieldOps ?? []).map(op => {
      switch (op.type) {
        case "mapeamento":       return { text: op.fieldLabel || op.fieldKey || "Campo" };
        case "analise_telefone": return { text: "Análise de telefone" };
        case "loop_array":       return { text: "Loop em lista" };
        case "formatacao_data":  return { text: "Formatação de data" };
        default:                 return { text: "Operação" };
      }
    });
    case "mensagem": return (n.subBlocks ?? []).map(sb => {
      switch (sb.type) {
        case "mensagem_texto":  return { text: sb.text?.trim() || "Mensagem de texto" };
        case "entrada_usuario": return { text: "Entrada do usuário" };
        case "atraso_tempo":    return { text: "Atraso" };
        case "mensagem_audio":  return { text: "Áudio" };
        case "arquivo_anexo":   return { text: "Arquivo (anexo)" };
        case "arquivo_url":     return { text: "Arquivo (URL)" };
        default:                return { text: "Bloco" };
      }
    });
    case "espera": {
      const e = n.espera;
      if (!e) return [{ text: "Aguardar" }];
      const txt =
        e.type === "segundos"          ? `Aguardar ${e.amount ?? 0}s` :
        e.type === "minutos"           ? `Aguardar ${e.amount ?? 0} min` :
        e.type === "horas"             ? `Aguardar ${e.amount ?? 0} h` :
        e.type === "dias"              ? `Aguardar ${e.amount ?? 0} dias` :
        e.type === "intervalo_semana"  ? "Intervalo semanal" :
        e.type === "dia_horario"       ? "Data/horário" : "Aguardar resposta";
      return [{ text: txt }];
    }
    case "ia":
      return (n.iaActions ?? []).map(a => ({ text: IA_ACTION_LABEL[a.type] }));
    default: return [];
  }
}

// Miniatura fiel do canvas: nós (ícone + título + itens), notas coloridas e
// conexões ortogonais (mesma buildOrthPath do editor), num SVG que escala via
// viewBox para caber no card. foreignObject permite reusar o HTML/ícones reais.
function FlowPreview({ flow }: { flow: { nodes: CanvasNode[]; trigger: TriggerConfig | null } | null }) {
  const all = flow?.nodes ?? [];
  if (all.length === 0) {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#9CA3AF" }}>
        Automação vazia
      </div>
    );
  }
  const HEADER_H = 40, LINE_H = 26;
  const W = (n: CanvasNode) => n.type === "note" ? (n.width ?? 220) : n.type === "start" ? 248 : 270;
  const H = (n: CanvasNode) => {
    if (n.type === "note") return n.height ?? 140;
    const lines = previewBodyLines(n).length;
    return HEADER_H + (lines > 0 ? lines * LINE_H + 14 : 10);
  };

  const minX = Math.min(...all.map(n => n.x));
  const minY = Math.min(...all.map(n => n.y));
  const maxX = Math.max(...all.map(n => n.x + W(n)));
  const maxY = Math.max(...all.map(n => n.y + H(n)));
  const PAD = 60;
  const vbX = minX - PAD, vbY = minY - PAD;
  const vbW = (maxX - minX) + PAD * 2, vbH = (maxY - minY) + PAD * 2;

  const byId = new Map(all.map(n => [n.id, n]));
  // Portas compostas têm a forma "nodeId_sufixo"; o pai real é o trecho antes do "_".
  const resolveParent = (pid: string): CanvasNode | undefined => {
    const direct = byId.get(pid);
    if (direct) return direct;
    const us = pid.indexOf("_");
    return us > 0 ? byId.get(pid.slice(0, us)) : undefined;
  };
  const edges: { d: string; err: boolean }[] = [];
  for (const n of all) {
    if (n.type === "note") continue;
    const inX = n.x, inY = n.y + 20;
    for (const pid of n.parentIds ?? [])      { const p = resolveParent(pid); if (p) edges.push({ d: buildOrthPath(p.x + W(p), p.y + 20, inX, inY), err: false }); }
    for (const pid of n.errorParentIds ?? []) { const p = resolveParent(pid); if (p) edges.push({ d: buildOrthPath(p.x + W(p), p.y + 20, inX, inY), err: true }); }
  }

  const notes = all.filter(n => n.type === "note");
  const flowNodes = all.filter(n => n.type !== "note");

  return (
    <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {/* Notas (atrás das conexões, como no editor) */}
      {notes.map(n => {
        const c = NOTE_COLORS[n.noteColorIndex ?? 0];
        return (
          <foreignObject key={n.id} x={n.x} y={n.y} width={W(n)} height={H(n)}>
            <div style={{ width: "100%", height: "100%", boxSizing: "border-box", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12, fontSize: 14, lineHeight: 1.4, color: c.text, overflow: "hidden" }}>
              {n.noteText}
            </div>
          </foreignObject>
        );
      })}
      {/* Conexões */}
      {edges.map((e, i) => (
        <path key={i} d={e.d} fill="none" stroke={e.err ? "#FCA5A5" : "#CBD5E1"} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
      {/* Nós */}
      {flowNodes.map(n => {
        const h = PREVIEW_HEADER[n.type] ?? { color: "#9CA3AF", title: n.label, icon: Zap };
        const Icon = h.icon;
        const lines = previewBodyLines(n);
        return (
          <foreignObject key={n.id} x={n.x} y={n.y} width={W(n)} height={H(n)}>
            <div style={{ width: "100%", height: "100%", boxSizing: "border-box", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: lines.length ? "1px solid #EEEEEE" : "none" }}>
                <Icon size={16} color={h.color} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.title}</span>
              </div>
              {lines.length > 0 && (
                <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {lines.map((l, i) => {
                    const LI = l.icon;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", background: `${h.color}12`, border: `1px solid ${h.color}30`, borderRadius: 7, padding: "4px 7px", overflow: "hidden" }}>
                        {LI ? <LI size={12} color={h.color} /> : null}
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </foreignObject>
        );
      })}
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AutomacoesPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { pipelines, crmTags, addTag, crmLists, teamMembers, products, lossReasons, customFieldGroups } = useCRM();
  const navigate = useNavigate();
  const { id: urlId } = useParams<{ id: string }>();

  // Navigation
  const [view, setView]         = useState<"list" | "editor">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Data
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [loading, setLoading]   = useState(true);

  // Sidebar
  const [search, setSearch]             = useState("");
  const [openGroups, setOpenGroups]     = useState<Record<string, boolean>>({});
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // Modals
  const [createOpen, setCreateOpen]     = useState(false);
  const [triggerOpen, setTriggerOpen]   = useState(false);
  const [renameOpen, setRenameOpen]     = useState(false);
  const [deleteOpen, setDeleteOpen]     = useState(false);
  const [listSearch, setListSearch]     = useState("");

  // Create form
  const [newName, setNewName]           = useState("");
  const [newDesc, setNewDesc]           = useState("");
  const [newGroup, setNewGroup]         = useState("");
  const [startType, setStartType]       = useState<"blank" | "import" | "model">("blank");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [creating, setCreating]         = useState(false);
  const [groupDropOpen, setGroupDropOpen] = useState(false);
  const [groupNewInput, setGroupNewInput] = useState("");
  const [groupCreating, setGroupCreating] = useState(false);

  // Rename form
  const [renameName, setRenameName]     = useState("");

  // Rename group inline
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameGroupVal, setRenameGroupVal] = useState("");

  // Canvas (editor)
  const [nodes, setNodes]               = useState<CanvasNode[]>([START_NODE]);
  const [trigger, setTrigger]           = useState<TriggerConfig | null>(null);
  const [zoom, setZoom]                 = useState(1);
  const [pan, setPan]                   = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedTriggerCat, setSelectedTriggerCat] = useState(TRIGGER_CATEGORIES[0].id);
  const [saving, setSaving]             = useState(false);
  const [addNodeMenu, setAddNodeMenu]   = useState<{ fromNodeId: string; x: number; y: number; isError?: boolean; isTimeout?: boolean } | null>(null);
  const [portDragLine, setPortDragLine] = useState<{ x1: number; y1: number; x2: number; y2: number; isError?: boolean } | null>(null);
  const [hoveredInputPort, setHoveredInputPort] = useState<string | null>(null);
  const [portPosMap, setPortPosMap] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedConn, setSelectedConn] = useState<{ nodeId: string; type: "parent" | "error" | "timeout"; fromId: string } | null>(null);
  const [nodeStats, setNodeStats]       = useState<Record<string, { s: number; a: number; e: number; tokAvg?: number }>>({});
  const [nodePanel, setNodePanel]       = useState<string | null>(null);
  const [acoesPickerOpen, setAcoesPickerOpen] = useState(false);
  const [selectedActionPickerCat, setSelectedActionPickerCat] = useState(ACTION_CATEGORIES[0].id);
  const [condicoesPickerOpen, setCondicoesPickerOpen] = useState(false);
  const [selectedCondPickerCat, setSelectedCondPickerCat] = useState(CONDITION_CATEGORIES[0].id);
  const [espePickerOpen, setEspePickerOpen] = useState(false);
  const [selectedEspePickerCat, setSelectedEspePickerCat] = useState("tempo");
  const [iaPickerNode, setIaPickerNode] = useState<string | null>(null);
  const [triggerPanel, setTriggerPanel] = useState(false);
  const [apiPickerTrigger, setApiPickerTrigger] = useState(0);
  const [logsPanel, setLogsPanel] = useState<{ nodeId: string } | null>(null);
  const [logsPanelTab, setLogsPanelTab] = useState<"entraram" | "success" | "alert" | "error">("entraram");

  // Unsaved changes guard
  const [isDirty, setIsDirty]         = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const pendingLeaveRef  = useRef<(() => void) | null>(null);
  const skipDirtyRef     = useRef(false);
  const [logsPanelEntries, setLogsPanelEntries] = useState<LogEntry[]>([]);
  const [logsPanelLoading, setLogsPanelLoading] = useState(false);
  const [logsPanelLeadFilter, setLogsPanelLeadFilter] = useState("");
  const [logsPanelPeriod, setLogsPanelPeriod] = useState("week");
  const [logsPanelSelectedEntry, setLogsPanelSelectedEntry] = useState<{ leadId: string; leadName: string } | null>(null);
  const [logsPanelPath, setLogsPanelPath] = useState<PathEntry[]>([]);
  const [logsPanelPathLoading, setLogsPanelPathLoading] = useState(false);

  const canvasRef    = useRef<HTMLDivElement>(null);
  const panRef       = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const fileRef      = useRef<HTMLInputElement>(null);
  const createFileRef = useRef<HTMLInputElement>(null);
  const portDragRef  = useRef<{ fromNodeId: string; startX: number; startY: number } | null>(null);
  const nodeDragRef  = useRef<{ nodeId: string; startX: number; startY: number; baseX: number; baseY: number; hasDragged: boolean; onSelect: () => void } | null>(null);
  const resizeDragRef = useRef<{ nodeId: string; startX: number; startY: number; baseW: number; baseH: number } | null>(null);
  const wheelThrottleRef = useRef<number>(0);
  // Always-fresh refs to avoid stale closures in mouse event handlers
  const stateRef = useRef({ pan, zoom, nodes });
  stateRef.current = { pan, zoom, nodes };

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar automações");
    else {
      setAutomations((data ?? []) as AutomationRecord[]);
      // Open first group by default
      const groups = [...new Set((data ?? []).map((a: AutomationRecord) => a.group_name))];
      if (groups.length > 0) setOpenGroups({ [groups[0]]: true });
    }
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  // Sync URL with editor state (replaceState to avoid remounting the component)
  useEffect(() => {
    if (view === "editor" && selectedId) {
      window.history.replaceState(null, "", `/automacoes/${selectedId}`);
    } else if (view === "list") {
      window.history.replaceState(null, "", "/automacoes");
    }
  }, [view, selectedId]);

  // Deep-link: open automation when page is loaded directly at /automacoes/:id
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (!urlId || deepLinkHandledRef.current || automations.length === 0) return;
    deepLinkHandledRef.current = true;
    openEditor(urlId);
  }, [urlId, automations]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const groups = useMemo(() => {
    const map: Record<string, AutomationRecord[]> = {};
    automations.forEach(a => {
      if (!map[a.group_name]) map[a.group_name] = [];
      map[a.group_name].push(a);
    });
    return Object.entries(map).map(([name, items]) => ({ name, items }));
  }, [automations]);

  const filteredGroups = useMemo(() =>
    groups.map(g => ({
      ...g,
      items: g.items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    })).filter(g => !search || g.items.length > 0),
  [groups, search]);

  const filteredAutomations = useMemo(() =>
    automations.filter(a => a.name.toLowerCase().includes(listSearch.toLowerCase())),
  [automations, listSearch]);

  const logsPanelNode = logsPanel ? nodes.find(n => n.id === logsPanel.nodeId) ?? null : null;

  const logsPanelLeads = useMemo(() => {
    const seen = new Set<string>();
    return logsPanelEntries.filter(e => { if (seen.has(e.lead_id)) return false; seen.add(e.lead_id); return true; }).map(e => ({ id: e.lead_id, name: e.lead_name }));
  }, [logsPanelEntries]);

  const logsPanelFilteredEntries = useMemo(() => {
    let entries = logsPanelEntries;
    if (logsPanelPeriod !== "all") {
      const cutoff = logsPanelPeriod === "week" ? subWeeks(new Date(), 1) : subDays(new Date(), 30);
      entries = entries.filter(e => { try { return isAfter(parseISO(e.created_at), cutoff); } catch { return true; } });
    }
    if (logsPanelLeadFilter) entries = entries.filter(e => e.lead_id === logsPanelLeadFilter);
    if (logsPanelTab !== "entraram") entries = entries.filter(e => e.status === logsPanelTab);
    return entries;
  }, [logsPanelEntries, logsPanelPeriod, logsPanelLeadFilter, logsPanelTab]);

  const logsPanelTabCounts = useMemo(() => ({
    entraram: logsPanelEntries.length,
    success: logsPanelEntries.filter(e => e.status === "success").length,
    alert: logsPanelEntries.filter(e => e.status === "alert").length,
    error: logsPanelEntries.filter(e => e.status === "error").length,
  }), [logsPanelEntries]);

  const selectedAutomation = automations.find(a => a.id === selectedId) ?? null;

  const refreshWebhookPayload = useCallback(async () => {
    if (!selectedId) return;
    const { data } = await supabase.from("automations").select("last_webhook_payload").eq("id", selectedId).single();
    if (data) setAutomations(prev => prev.map(a => a.id === selectedId ? { ...a, last_webhook_payload: data.last_webhook_payload } : a));
  }, [selectedId]);

  // ── Editor helpers ────────────────────────────────────────────────────────

  // Refs lidos dentro do handler de realtime (evita closures obsoletas sem ressubscrever)
  const logsPanelRef = useRef(logsPanel);
  const logsPanelTabRef = useRef(logsPanelTab);
  useEffect(() => { logsPanelRef.current = logsPanel; }, [logsPanel]);
  useEffect(() => { logsPanelTabRef.current = logsPanelTab; }, [logsPanelTab]);

  // Recarrega os contadores (sucesso/alerta/erro) de TODOS os blocos da automação.
  // Usado ao abrir o editor e a cada nova execução (via realtime / foco / botão atualizar).
  const refreshNodeStats = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("automation_logs")
      .select("node_id, status, tokens")
      .eq("automation_id", id)
      .limit(5000);
    if (!data) return;
    const stats: Record<string, { s: number; a: number; e: number; tokAvg?: number }> = {};
    const tok: Record<string, { sum: number; count: number }> = {};
    for (const row of data) {
      if (!stats[row.node_id]) stats[row.node_id] = { s: 0, a: 0, e: 0 };
      if (row.status === "success") stats[row.node_id].s++;
      else if (row.status === "alert") stats[row.node_id].a++;
      else if (row.status === "error") stats[row.node_id].e++;
      const t = (row as { tokens?: number | null }).tokens;
      if (typeof t === "number" && t > 0) {
        if (!tok[row.node_id]) tok[row.node_id] = { sum: 0, count: 0 };
        tok[row.node_id].sum += t;
        tok[row.node_id].count++;
      }
    }
    for (const [nid, v] of Object.entries(tok)) {
      if (stats[nid] && v.count > 0) stats[nid].tokAvg = v.sum / v.count;
    }
    setNodeStats(stats);
  }, []);

  // Recarrega silenciosamente as entradas do painel de logs aberto (sem resetar a seleção).
  const refreshLogsPanelEntries = useCallback(async (automationId: string, nodeId: string) => {
    const { data: logRows } = await supabase
      .from("automation_logs")
      .select("id, lead_id, status, created_at, error_message")
      .eq("automation_id", automationId)
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!logRows) return;
    const leadIds = [...new Set((logRows as { lead_id: string }[]).map(r => r.lead_id))];
    const { data: leadsData } = leadIds.length
      ? await supabase.from("leads").select("id, name").in("id", leadIds)
      : { data: [] };
    const leadMap = Object.fromEntries(((leadsData ?? []) as { id: string; name: string }[]).map(l => [l.id, l.name]));
    setLogsPanelEntries((logRows as Omit<LogEntry, "lead_name">[]).map(r => ({ ...r, lead_name: leadMap[r.lead_id] ?? "Lead desconhecido" })));
  }, []);

  const openEditor = useCallback((id: string) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return;
    const flow = auto.flow ?? { nodes: [START_NODE], trigger: null };
    const n = migrateNodes(flow.nodes?.length ? flow.nodes : [START_NODE]);
    skipDirtyRef.current = true;
    setNodes(n);
    setTrigger(flow.trigger ?? null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
    setSelectedId(id);
    setNodeStats({});
    setIsDirty(false);
    setView("editor");
    // Carrega os contadores de execução desta automação
    refreshNodeStats(id);
  }, [automations, refreshNodeStats]);

  // ── Logs ao vivo ──────────────────────────────────────────────────────────
  // Assina automation_logs e atualiza contadores + painel aberto a cada execução.
  // Sem isto, os logs ficavam congelados no snapshot do momento em que o editor abriu.
  useEffect(() => {
    if (view !== "editor" || !selectedId) return;
    let timer: number | null = null;
    const channel = supabase
      .channel(`autolog-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "automation_logs", filter: `automation_id=eq.${selectedId}` },
        () => {
          // Debounce: uma execução insere vários logs em sequência → 1 refresh só
          if (timer) clearTimeout(timer);
          timer = window.setTimeout(() => {
            refreshNodeStats(selectedId);
            const lp = logsPanelRef.current;
            if (lp) refreshLogsPanelEntries(selectedId, lp.nodeId);
          }, 350);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [view, selectedId, refreshNodeStats, refreshLogsPanelEntries]);

  // Rede de segurança: se o realtime cair, recarrega ao voltar o foco para a aba.
  useEffect(() => {
    if (view !== "editor" || !selectedId) return;
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      refreshNodeStats(selectedId);
      const lp = logsPanelRef.current;
      if (lp) refreshLogsPanelEntries(selectedId, lp.nodeId);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [view, selectedId, refreshNodeStats, refreshLogsPanelEntries]);

  // ── Canvas interactions ───────────────────────────────────────────────────

  const startPortDrag = (e: React.MouseEvent, fromNodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    portDragRef.current = { fromNodeId, startX: e.clientX, startY: e.clientY };
  };

  const onNodeDragStart = (e: React.MouseEvent, nodeId: string, onSelectFn: () => void) => {
    if ((e.target as HTMLElement).closest("[data-port]")) return;
    if ((e.target as HTMLElement).closest("[data-resize-handle]")) return;
    e.stopPropagation();
    const node = stateRef.current.nodes.find(n => n.id === nodeId);
    if (!node) return;
    nodeDragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, baseX: node.x, baseY: node.y, hasDragged: false, onSelect: onSelectFn };
  };

  const onNodeResizeStart = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const node = stateRef.current.nodes.find(n => n.id === nodeId);
    if (!node) return;
    resizeDragRef.current = { nodeId, startX: e.clientX, startY: e.clientY, baseW: node.width ?? 220, baseH: node.height ?? 140 };
  };

  const handleAddNode = (type: string, label: string) => {
    if (!addNodeMenu) return;
    if (COMING_SOON_ACTIONS.has(type)) return; // blocos "Em breve" não podem ser criados
    const isError = addNodeMenu.isError ?? false;
    const isTimeout = addNodeMenu.isTimeout ?? false;
    const actualParentId = addNodeMenu.fromNodeId.replace(/__(error|timeout)$/, "");
    const newNode: CanvasNode = {
      id: `n${Date.now()}`,
      type: type as ActionNodeType,
      x: addNodeMenu.x,
      y: addNodeMenu.y,
      label,
      parentIds: (isError || isTimeout) ? [] : [actualParentId],
      errorParentIds: isError ? [actualParentId] : [],
      timeoutParentIds: isTimeout ? [actualParentId] : [],
      subBlocks: [],
    };
    setNodes(prev => [...prev, newNode]);
    setAddNodeMenu(null);
  };

  const addSubBlock = (nodeId: string, type: SubBlockType) => {
    const newBlock: SubBlock = { id: `sb${Date.now()}`, type };
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, subBlocks: [...(n.subBlocks ?? []), newBlock] } : n));
  };

  const removeSubBlock = (nodeId: string, blockId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, subBlocks: (n.subBlocks ?? []).filter(b => b.id !== blockId) } : n));
  };

  const updateSubBlock = (nodeId: string, blockId: string, data: Partial<SubBlock>) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, subBlocks: (n.subBlocks ?? []).map(b => b.id === blockId ? { ...b, ...data } : b) } : n));
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-port]")) return;
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    if ((e.target as HTMLElement).closest("[data-conn-line]")) return;
    setSelectedConn(null);
    panRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
    setSelectedNode(null);
    setAddNodeMenu(null);
    setNodePanel(null);
    setTriggerPanel(false);
  };

  const disconnectNode = (nodeId: string, type: "parent" | "error" | "timeout", fromId: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      if (type === "parent")  return { ...n, parentIds: (n.parentIds ?? []).filter(p => p !== fromId) };
      if (type === "timeout") return { ...n, timeoutParentIds: (n.timeoutParentIds ?? []).filter(p => p !== fromId) };
      return { ...n, errorParentIds: (n.errorParentIds ?? []).filter(p => p !== fromId) };
    }));
    setSelectedConn(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Port drag: draw the connecting line
      if (portDragRef.current && canvasRef.current) {
        const { pan, zoom } = stateRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const portEl = canvasRef.current.querySelector(
          `[data-port][data-from-node="${portDragRef.current.fromNodeId}"]`
        ) as HTMLElement | null;
        if (portEl) {
          const portRect = portEl.getBoundingClientRect();
          const x1 = (portRect.left + portRect.width / 2 - rect.left - pan.x) / zoom;
          const y1 = (portRect.top + portRect.height / 2 - rect.top - pan.y) / zoom;
          const x2 = (e.clientX - rect.left - pan.x) / zoom;
          const y2 = (e.clientY - rect.top - pan.y) / zoom;
          // tanto a porta de erro quanto a de "não respondeu" são vermelhas
          const isError = /__(error|timeout)$/.test(portDragRef.current.fromNodeId);
          setPortDragLine({ x1, y1, x2, y2, isError });
        }
        // Detectar hover sobre porta de entrada de nó existente
        const overEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const inputPortEl = overEl?.closest("[data-input-port]") as HTMLElement | null;
        setHoveredInputPort(inputPortEl?.getAttribute("data-node-id") ?? null);
        return;
      }
      // Resize drag: resize a note node
      if (resizeDragRef.current) {
        const { zoom } = stateRef.current;
        const dx = e.clientX - resizeDragRef.current.startX;
        const dy = e.clientY - resizeDragRef.current.startY;
        const nodeId = resizeDragRef.current.nodeId;
        const newW = Math.max(160, resizeDragRef.current.baseW + dx / zoom);
        const newH = Math.max(110, resizeDragRef.current.baseH + dy / zoom);
        setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newW, height: newH } : n));
        return;
      }
      // Node drag: move the node
      if (nodeDragRef.current) {
        const { zoom } = stateRef.current;
        const dx = e.clientX - nodeDragRef.current.startX;
        const dy = e.clientY - nodeDragRef.current.startY;
        if (Math.sqrt(dx * dx + dy * dy) > 4) {
          nodeDragRef.current.hasDragged = true;
          const nodeId = nodeDragRef.current.nodeId;
          const newX = nodeDragRef.current.baseX + dx / zoom;
          const newY = nodeDragRef.current.baseY + dy / zoom;
          setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x: newX, y: newY } : n));
        }
        return;
      }
      if (!panRef.current) return;
      setPan({ x: panRef.current.baseX + e.clientX - panRef.current.startX, y: panRef.current.baseY + e.clientY - panRef.current.startY });
    };
    const onUp = (e: MouseEvent) => {
      // Port drag end: show block selection popup at drop position
      if (portDragRef.current && canvasRef.current) {
        const { pan, zoom, nodes } = stateRef.current;
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = e.clientX - portDragRef.current.startX;
        const dy = e.clientY - portDragRef.current.startY;
        const isDrag = Math.sqrt(dx * dx + dy * dy) > 30;
        const fromNodeId = portDragRef.current.fromNodeId;
        const isErrorPort = fromNodeId.endsWith("__error");
        const isTimeoutPort = fromNodeId.endsWith("__timeout");
        const realNodeId = fromNodeId.replace(/__(error|timeout)$/, "");
        portDragRef.current = null;
        setPortDragLine(null);
        setHoveredInputPort(null);
        if (isDrag) {
          // Verificar se o drop foi sobre uma porta de entrada de nó existente
          const overEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const inputPortEl = overEl?.closest("[data-input-port]") as HTMLElement | null;
          const targetNodeId = inputPortEl?.getAttribute("data-node-id");
          if (targetNodeId && targetNodeId !== realNodeId) {
            if (isErrorPort) {
              setNodes(prev => prev.map(n =>
                n.id === targetNodeId
                  ? { ...n, errorParentIds: [...new Set([...(n.errorParentIds ?? []), realNodeId])] }
                  : n
              ));
            } else if (isTimeoutPort) {
              setNodes(prev => prev.map(n =>
                n.id === targetNodeId
                  ? { ...n, timeoutParentIds: [...new Set([...(n.timeoutParentIds ?? []), realNodeId])] }
                  : n
              ));
            } else {
              setNodes(prev => prev.map(n =>
                n.id === targetNodeId
                  ? { ...n, parentIds: [...new Set([...(n.parentIds ?? []), fromNodeId])] }
                  : n
              ));
            }
            return;
          }
          const dropX = (e.clientX - rect.left - pan.x) / zoom;
          const dropY = (e.clientY - rect.top - pan.y) / zoom;
          setAddNodeMenu({ fromNodeId, x: dropX, y: dropY, isError: isErrorPort, isTimeout: isTimeoutPort });
        } else {
          let fromNode = nodes.find(n => n.id === realNodeId);
          if (!fromNode) {
            // Compound port (e.g. nodeId_condId) — strip suffix to find the real node
            const lastUnder = realNodeId.lastIndexOf("_");
            if (lastUnder > 0) fromNode = nodes.find(n => n.id === realNodeId.substring(0, lastUnder));
          }
          if (fromNode) setAddNodeMenu({ fromNodeId, x: fromNode.x + 322, y: fromNode.y + 50, isError: isErrorPort });
        }
        return;
      }
      // Resize drag end
      if (resizeDragRef.current) {
        resizeDragRef.current = null;
        return;
      }
      // Node drag end: if no real drag occurred, treat as a click (select)
      if (nodeDragRef.current) {
        const { hasDragged, onSelect } = nodeDragRef.current;
        nodeDragRef.current = null;
        if (!hasDragged) onSelect();
        return;
      }
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - wheelThrottleRef.current < 32) return;
    wheelThrottleRef.current = now;

    const { pan, zoom } = stateRef.current;
    const multiplier = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 300 : 1;
    const delta = -(e.deltaY * multiplier) * 0.0025;
    const newZoom = Math.max(0.4, Math.min(2.5, zoom + delta));
    if (newZoom === zoom) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) { setZoom(newZoom); return; }

    // Ponto do canvas sob o cursor (coordenadas canvas)
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const canvasX = (mouseX - pan.x) / zoom;
    const canvasY = (mouseY - pan.y) / zoom;

    // Ajusta pan para manter esse ponto fixo após o zoom
    setZoom(newZoom);
    setPan({ x: mouseX - canvasX * newZoom, y: mouseY - canvasY * newZoom });
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!user || !company) return;
    const { PLAN_LIMITS } = await import("@/data/plans");
    const limit = PLAN_LIMITS[company.plan]?.automations ?? null;
    if (limit !== null && automations.length >= limit) {
      emitPlanLimit("automações");
      return;
    }

    // Define o flow, o nome e o grupo conforme a forma de começar.
    let flow: { nodes: CanvasNode[]; trigger: TriggerConfig | null } = { nodes: [START_NODE], trigger: null };
    let name = newName.trim();
    let group = newGroup.trim();
    if (startType === "model") {
      const tpl = AUTOMATION_TEMPLATES.find(t => t.id === selectedTemplate);
      if (!tpl) { toast.error("Selecione um modelo"); return; }
      // Clona o flow do modelo para não mutar a constante ao editar depois.
      const cloned = JSON.parse(JSON.stringify(tpl.flow)) as { nodes: CanvasNode[]; trigger: TriggerConfig };
      flow = { nodes: sanitizeImportedNodes(cloned.nodes), trigger: cloned.trigger };
      if (!name) name = tpl.name;
      if (!group) group = tpl.group;
    }
    if (!name) { toast.error("Informe um nome"); return; }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("automations")
        .insert({
          owner_id: user.id,
          company_id: company.id,
          name,
          description: newDesc.trim(),
          group_name: group || "Automação",
          active: false,
          flow,
        })
        .select()
        .single();
      if (error) throw error;
      const rec = data as AutomationRecord;
      setAutomations(prev => [rec, ...prev]);
      setCreateOpen(false);
      setNewName(""); setNewDesc(""); setNewGroup(""); setStartType("blank"); setSelectedTemplate(null);
      setGroupDropOpen(false); setGroupCreating(false); setGroupNewInput("");
      toast.success("Automação criada");
      openEditor(rec.id);
    } catch {
      toast.error("Erro ao criar automação");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        let flow: { nodes: CanvasNode[]; trigger: TriggerConfig | null };
        // DataCrazy .dc format
        if (parsed.blocks && Array.isArray(parsed.blocks)) {
          const converted = convertDcFlow(parsed);
          if (!converted) { toast.error("Arquivo DataCrazy inválido"); return; }
          flow = converted;
        // Rezult .json format
        } else if (parsed.nodes && Array.isArray(parsed.nodes)) {
          flow = parsed;
        } else {
          toast.error("Arquivo inválido — formato não reconhecido (.json ou .dc)");
          return;
        }
        if (!user || !company) return;
        setCreating(true);
        try {
          const { data, error } = await supabase
            .from("automations")
            .insert({
              owner_id: user.id,
              company_id: company.id,
              name: newName.trim(),
              description: newDesc.trim(),
              group_name: newGroup.trim() || "Automação",
              active: false,
              flow: { ...flow, nodes: sanitizeImportedNodes(flow.nodes ?? []) },
            })
            .select()
            .single();
          if (error) throw error;
          const rec = data as AutomationRecord;
          setAutomations(prev => [rec, ...prev]);
          setCreateOpen(false);
          setNewName(""); setNewDesc(""); setNewGroup(""); setStartType("blank");
          setGroupDropOpen(false); setGroupCreating(false); setGroupNewInput("");
          toast.success("Automação importada");
          openEditor(rec.id);
        } catch {
          toast.error("Erro ao criar automação");
        } finally {
          setCreating(false);
        }
      } catch {
        toast.error("Arquivo inválido");
      }
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const updatedNodes = nodes.map(n => n.id === "n1" ? { ...n, trigger } : n);
      const { error } = await supabase
        .from("automations")
        .update({ flow: { nodes: updatedNodes, trigger }, updated_at: new Date().toISOString() })
        .eq("id", selectedId);
      if (error) throw error;
      setAutomations(prev => prev.map(a => a.id === selectedId ? { ...a, flow: { nodes: updatedNodes, trigger } } : a));
      setIsDirty(false);
      toast.success("Automação salva");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("automations").update({ active }).eq("id", id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, active } : a));
    toast.success(active ? "Automação ativada" : "Automação desativada");
  };

  const handleRename = async () => {
    if (!renameName.trim() || !selectedId) return;
    const { error } = await supabase.from("automations").update({ name: renameName.trim() }).eq("id", selectedId);
    if (error) { toast.error("Erro ao renomear"); return; }
    setAutomations(prev => prev.map(a => a.id === selectedId ? { ...a, name: renameName.trim() } : a));
    setRenameOpen(false);
    toast.success("Nome atualizado");
  };

  const handleRenameGroup = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    setRenamingGroup(null);
    if (!trimmed || trimmed === oldName) return;
    const { error } = await supabase
      .from("automations")
      .update({ group_name: trimmed })
      .eq("group_name", oldName)
      .eq("company_id", company?.id);
    if (error) { toast.error("Erro ao renomear grupo"); return; }
    setAutomations(prev => prev.map(a => a.group_name === oldName ? { ...a, group_name: trimmed } : a));
    setOpenGroups(prev => {
      const next = { ...prev };
      if (oldName in next) { next[trimmed] = next[oldName]; delete next[oldName]; }
      return next;
    });
    toast.success("Grupo renomeado");
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const { error } = await supabase.from("automations").delete().eq("id", selectedId);
    if (error) { toast.error("Erro ao excluir"); return; }
    setAutomations(prev => prev.filter(a => a.id !== selectedId));
    setDeleteOpen(false);
    setView("list");
    setSelectedId(null);
    toast.success("Automação excluída");
  };

  // ── Unsaved changes guard ─────────────────────────────────────────────────

  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    if (view === "editor" && selectedId) setIsDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, trigger]);

  // Block browser refresh / tab close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && view === "editor") { e.preventDefault(); e.returnValue = "unsaved"; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, view]);

  // Intercepta navegação via sidebar (RouterNavLink) quando há alterações não salvas
  useEffect(() => {
    if (!isDirty || view !== "editor") return;
    const handler = (e: Event) => {
      const to = (e as CustomEvent<{ to: string }>).detail?.to;
      if (!to) return;
      e.preventDefault();
      pendingLeaveRef.current = () => navigate(to);
      setUnsavedOpen(true);
    };
    window.addEventListener("app-navigate", handler);
    return () => window.removeEventListener("app-navigate", handler);
  }, [isDirty, view, navigate]);

  // Rastrear posições das portas de saída para linhas SVG precisas
  useLayoutEffect(() => {
    if (!canvasRef.current || view !== "editor") return;
    const newMap: Record<string, { x: number; y: number }> = {};
    const canvasRect = canvasRef.current.getBoundingClientRect();
    canvasRef.current.querySelectorAll("[data-port]").forEach(el => {
      const key = (el as HTMLElement).getAttribute("data-from-node") ?? "";
      const r = el.getBoundingClientRect();
      newMap[key] = {
        x: (r.left + r.width / 2 - canvasRect.left - pan.x) / zoom,
        y: (r.top  + r.height / 2 - canvasRect.top  - pan.y) / zoom,
      };
    });
    setPortPosMap(prev => {
      for (const k of Object.keys(newMap)) {
        const p = prev[k];
        if (!p || Math.abs(p.x - newMap[k].x) > 0.5 || Math.abs(p.y - newMap[k].y) > 0.5) return newMap;
      }
      if (Object.keys(newMap).length !== Object.keys(prev).length) return newMap;
      return prev;
    });
  }, [nodes, zoom, pan.x, pan.y, view]);

  const handleUnsavedOpenChange = (open: boolean) => {
    setUnsavedOpen(open);
    if (!open) { pendingLeaveRef.current = null; }
  };

  const requestLeave = (action: () => void) => {
    if (isDirty && view === "editor") {
      pendingLeaveRef.current = action;
      setUnsavedOpen(true);
    } else {
      action();
    }
  };

  const handleLeaveWithoutSaving = () => {
    setIsDirty(false);
    setUnsavedOpen(false);
    pendingLeaveRef.current?.();
    pendingLeaveRef.current = null;
  };

  const handleSaveAndLeave = async () => {
    const action = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    setUnsavedOpen(false);
    await handleSave();
    action?.();
  };

  const handleDuplicate = async () => {
    if (!selectedAutomation || !user || !company) return;
    const { data, error } = await supabase
      .from("automations")
      .insert({
        owner_id: user.id,
        company_id: company.id,
        name: `${selectedAutomation.name} (cópia)`,
        description: selectedAutomation.description,
        group_name: selectedAutomation.group_name,
        active: false,
        flow: selectedAutomation.flow,
      })
      .select().single();
    if (error) { toast.error("Erro ao duplicar"); return; }
    setAutomations(prev => [data as AutomationRecord, ...prev]);
    toast.success("Automação duplicada");
  };

  const sanitizeImportedNodes = (importedNodes: CanvasNode[]): CanvasNode[] => {
    const validIds = new Set(customFieldGroups.flatMap(g => g.items.map(i => i.id)));
    const PREFIXES = ["campo_lead.", "campo_neg.", "campo_empresa."];
    return importedNodes.map(node => {
      if (node.type !== "campos" || !node.fieldOps) return node;
      const sanitized = node.fieldOps.map(op => {
        if (op.type !== "mapeamento") return op;
        const m = op as FieldOpMapeamento;
        const prefix = PREFIXES.find(p => m.fieldKey.startsWith(p));
        if (!prefix) return op;
        const id = m.fieldKey.slice(prefix.length);
        if (validIds.has(id)) return op;
        return { ...m, fieldKey: "", fieldLabel: "" };
      });
      return { ...node, fieldOps: sanitized };
    });
  };

  const handleDownload = () => {
    if (!selectedAutomation) return;
    const blob = new Blob([JSON.stringify(selectedAutomation.flow, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${selectedAutomation.name}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddNoteFromToolbar = () => {
    const x = Math.round((-pan.x + 260) / zoom);
    const y = Math.round((-pan.y + 160) / zoom);
    setNodes(prev => [...prev, {
      id: `note${Date.now()}`,
      type: "note",
      x, y,
      label: "Anotação",
      noteText: "",
      width: 220,
      height: 140,
      parentIds: [],
      errorParentIds: [],
    }]);
  };

  const handleStatClick = useCallback(async (nodeId: string, status: "success" | "alert" | "error") => {
    if (!selectedId) return;
    setLogsPanel({ nodeId });
    setLogsPanelTab(status);
    setLogsPanelLoading(true);
    setLogsPanelEntries([]);
    setLogsPanelSelectedEntry(null);
    setLogsPanelPath([]);
    setLogsPanelLeadFilter("");

    const { data: logRows } = await supabase
      .from("automation_logs")
      .select("id, lead_id, status, created_at, error_message")
      .eq("automation_id", selectedId)
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!logRows || logRows.length === 0) { setLogsPanelLoading(false); return; }
    const leadIds = [...new Set((logRows as { lead_id: string }[]).map(r => r.lead_id))];
    const { data: leadsData } = await supabase.from("leads").select("id, name").in("id", leadIds);
    const leadMap = Object.fromEntries(((leadsData ?? []) as { id: string; name: string }[]).map(l => [l.id, l.name]));
    setLogsPanelEntries((logRows as Omit<LogEntry, "lead_name">[]).map(r => ({ ...r, lead_name: leadMap[r.lead_id] ?? "Lead desconhecido" })));
    setLogsPanelLoading(false);
  }, [selectedId]);

  const loadEntryPath = useCallback(async (leadId: string, leadName: string) => {
    if (!selectedId) return;
    setLogsPanelSelectedEntry({ leadId, leadName });
    setLogsPanelPathLoading(true);
    const { data } = await supabase
      .from("automation_logs")
      .select("node_id, status, created_at, error_message")
      .eq("automation_id", selectedId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    const path = ((data ?? []) as { node_id: string; status: "success" | "alert" | "error"; created_at: string; error_message: string | null }[]).map(r => {
      const nd = nodes.find(n => n.id === r.node_id);
      return { ...r, node_label: nd?.label ?? r.node_id, node_type: nd?.type ?? "acoes" };
    });
    setLogsPanelPath(path);
    setLogsPanelPathLoading(false);
  }, [selectedId, nodes]);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        let flow: { nodes: CanvasNode[]; trigger: TriggerConfig | null };
        if (parsed.blocks && Array.isArray(parsed.blocks)) {
          const converted = convertDcFlow(parsed);
          if (!converted) { toast.error("Arquivo DataCrazy inválido"); return; }
          flow = converted;
        } else if (parsed.nodes && Array.isArray(parsed.nodes)) {
          flow = parsed;
        } else {
          toast.error("Arquivo inválido — formato não reconhecido (.json ou .dc)");
          return;
        }
        setNodes(migrateNodes(sanitizeImportedNodes(flow.nodes ?? [START_NODE])));
        setTrigger(flow.trigger ?? null);
        toast.success("Fluxo importado — salve para persistir");
      } catch {
        toast.error("Arquivo inválido");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSelectTrigger = (cat: typeof TRIGGER_CATEGORIES[0], t: typeof TRIGGER_CATEGORIES[0]["triggers"][0]) => {
    const configData: Record<string, string | boolean | number> = {};
    if (t.id === "http_webhook") configData.webhookId = selectedId ?? crypto.randomUUID();
    const cfg: TriggerConfig = { categoryId: cat.id, triggerId: t.id, label: t.label, description: t.description, configData };
    setTrigger(cfg);
    setNodes(prev => prev.map(n => n.id === "n1" ? { ...n, trigger: cfg } : n));
    setTriggerOpen(false);
    setTriggerPanel(true);
    setNodePanel(null);
    toast.success(`Gatilho "${t.label}" adicionado`);
  };

  const addActionItem = (nodeId: string, item: Omit<ActionItem, "id">) => {
    const newItem: ActionItem = { id: `ai${Date.now()}`, ...item };
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, actionItems: [...(n.actionItems ?? []), newItem] } : n));
  };

  const removeActionItem = (nodeId: string, itemId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, actionItems: (n.actionItems ?? []).filter(a => a.id !== itemId) } : n));
  };

  const updateActionItem = (nodeId: string, itemId: string, config: Record<string, string | boolean | number>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, actionItems: (n.actionItems ?? []).map(a => a.id === itemId ? { ...a, config: { ...(a.config ?? {}), ...config } } : a) }
      : n
    ));
  };

  const addConditionItem = (nodeId: string, item: Omit<ConditionItem, "id">) => {
    const newItem: ConditionItem = { id: `ci${Date.now()}`, ...item };
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, conditionItems: [...(n.conditionItems ?? []), newItem] } : n));
  };

  const removeConditionItem = (nodeId: string, itemId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, conditionItems: (n.conditionItems ?? []).filter(c => c.id !== itemId) } : n));
  };

  const updateConditionItem = (nodeId: string, itemId: string, config: Record<string, string | boolean | number>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, conditionItems: (n.conditionItems ?? []).map(c => c.id === itemId ? { ...c, config: { ...(c.config ?? {}), ...config } } : c) }
      : n
    ));
  };

  const updateEspera = (nodeId: string, data: Partial<EsperaConfig>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, espera: { ...(n.espera ?? {} as EsperaConfig), ...data } as EsperaConfig }
      : n
    ));
  };

  const addIaAction = (nodeId: string, type: IaActionType): string => {
    const node = nodes.find(n => n.id === nodeId);
    const idx = (node?.iaActions?.length ?? 0) + 1;
    const newAction: IaAction = {
      id: `ia${Date.now()}`, type, provider: "openai", model: IA_MODELS.openai[0].id, outputVar: `AI-${idx}`,
      ...(type === "intencao" ? { intencoes: [] } : {}),
      ...(type === "sentimento" ? { sentimentos: [] } : {}),
      ...(type === "extrator_params" ? { parametros: [] } : {}),
      ...(type === "transcricao_audio" ? { audioSource: "todos", language: "pt" } : {}),
    };
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, iaActions: [...(n.iaActions ?? []), newAction] } : n));
    return newAction.id;
  };

  const removeIaAction = (nodeId: string, actionId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, iaActions: (n.iaActions ?? []).filter(a => a.id !== actionId) } : n));
  };

  const updateIaAction = (nodeId: string, actionId: string, data: Partial<IaAction>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, iaActions: (n.iaActions ?? []).map(a => a.id === actionId ? { ...a, ...data } : a) }
      : n
    ));
  };

  const addRandomBranch = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    const idx = node?.randomBranches?.length ?? 4;
    const label = String.fromCharCode(65 + idx);
    const newBranch: RandomBranch = { id: `rb${Date.now()}`, label, percentage: 25 };
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, randomBranches: [...(n.randomBranches ?? [{ id:"a",label:"A",percentage:25},{ id:"b",label:"B",percentage:25},{ id:"c",label:"C",percentage:25},{ id:"d",label:"D",percentage:25}]), newBranch] } : n));
  };

  const removeRandomBranch = (nodeId: string, branchId: string) => {
    const portKey = `${nodeId}_${branchId}`;
    setNodes(prev => {
      const withBranchRemoved = prev.map(n => n.id === nodeId
        ? { ...n, randomBranches: (n.randomBranches ?? DEFAULT_BRANCHES).filter(b => b.id !== branchId) }
        : n
      );
      return withBranchRemoved.map(n =>
        (n.parentIds ?? []).includes(portKey)
          ? { ...n, parentIds: (n.parentIds ?? []).filter(p => p !== portKey) }
          : n
      );
    });
  };

  const updateRandomBranch = (nodeId: string, branchId: string, data: Partial<RandomBranch>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, randomBranches: (n.randomBranches ?? []).map(b => b.id === branchId ? { ...b, ...data } : b) }
      : n
    ));
  };

  const addApiRequest = (nodeId: string, req: ApiRequest) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, apiConfig: { requests: [...(n.apiConfig?.requests ?? []), req] } }
      : n
    ));
  };
  const removeApiRequest = (nodeId: string, reqId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, apiConfig: { requests: (n.apiConfig?.requests ?? []).filter(r => r.id !== reqId) } }
      : n
    ));
  };
  const updateApiRequest = (nodeId: string, reqId: string, data: Partial<ApiRequest>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, apiConfig: { requests: (n.apiConfig?.requests ?? []).map(r => r.id === reqId ? { ...r, ...data } : r) } }
      : n
    ));
  };

  const addFieldOp = (nodeId: string, op: FieldOperation) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, fieldOps: [...(n.fieldOps ?? []), op] } : n));
  };
  const removeFieldOp = (nodeId: string, opId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, fieldOps: (n.fieldOps ?? []).filter(o => o.id !== opId) } : n));
  };
  const updateFieldOp = (nodeId: string, opId: string, data: Record<string, unknown>) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, fieldOps: (n.fieldOps ?? []).map(o => o.id === opId ? { ...o, ...data } as FieldOperation : o) } : n));
  };

  const updateTriggerConfigData = (key: string, value: string | boolean | number) => {
    setTrigger(prev => prev ? { ...prev, configData: { ...(prev.configData ?? {}), [key]: value } } : prev);
  };

  // ─── SIDEBAR (shared) ────────────────────────────────────────────────────────

  const Sidebar = () => (
    <>
      {!leftCollapsed ? (
        <aside style={{ width: 240, minWidth: 240, background: "#FFFFFF", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", position: "relative", zIndex: 2, flexShrink: 0 }}>
          <div style={{ padding: 12, borderBottom: "1px solid #E5E5E5" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar automação..."
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #E5E5E5", borderRadius: 8, padding: "8px 32px 8px 30px", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                onFocus={e => { e.currentTarget.style.border = "1px solid hsl(var(--primary))"; }}
                onBlur={e => { e.currentTarget.style.border = "1px solid #E5E5E5"; }}
              />
              <Power
                size={14}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", cursor: "pointer" }}
                title="Filtrar por estado"
              />
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              size="sm"
              className="w-full justify-center rounded-lg bg-primary text-white hover:bg-primary/90 font-semibold mt-2"
            >
              <Plus size={14} className="mr-1.5" /> Adicionar automação
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-[2px] space-y-1">
            {loading ? (
              <p className="px-3 py-4 text-xs text-muted-foreground italic text-center">Carregando...</p>
            ) : filteredGroups.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground italic text-center">Nenhuma automação</p>
            ) : filteredGroups.map(g => {
              const open = openGroups[g.name] ?? true;
              return (
                <div key={g.name}>
                  <button
                    onClick={() => { if (renamingGroup !== g.name) setOpenGroups(s => ({ ...s, [g.name]: !open })); }}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-[#09090b] transition-colors"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {renamingGroup === g.name ? (
                      <input
                        autoFocus
                        value={renameGroupVal}
                        onChange={e => setRenameGroupVal(e.target.value)}
                        onBlur={() => handleRenameGroup(g.name, renameGroupVal)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.currentTarget.blur(); }
                          else if (e.key === "Escape") { setRenamingGroup(null); }
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{
                          fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3,
                          color: "#6B7280", background: "transparent", border: "none",
                          borderBottom: "1.5px solid hsl(var(--primary))", outline: "none",
                          padding: "0 2px", width: "100%",
                        }}
                      />
                    ) : (
                      <span
                        onDoubleClick={e => { e.stopPropagation(); setRenamingGroup(g.name); setRenameGroupVal(g.name); }}
                        title="Duplo clique para renomear"
                        className="cursor-text"
                      >
                        {g.name.charAt(0).toUpperCase() + g.name.slice(1)}
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground/70">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                  </button>

                  {open && (
                    <div className="space-y-[3px] mb-1">
                      {g.items.map(item => {
                        const sel = selectedId === item.id;
                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => requestLeave(() => openEditor(item.id))}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); requestLeave(() => openEditor(item.id)); } }}
                            className={`flex items-center gap-2 px-3 h-[32px] font-normal leading-[16px] border-l-[3px] cursor-pointer ${
                              sel
                                ? "w-[95%] mx-auto bg-primary/10 border-primary pl-[13px] rounded-[4px]"
                                : "w-full border-transparent"
                            }`}
                            style={{ fontFamily: "Inter, sans-serif", fontSize: "14px", fontStyle: "normal", fontWeight: 500, letterSpacing: 0, color: "#09090b" }}
                          >
                            <Network size={14} className={sel ? "text-primary" : ""} />
                            <span className="truncate text-left flex-1">{item.name}</span>
                            <Switch
                              checked={item.active}
                              onCheckedChange={(v) => { toggleActive(item.id, v); }}
                              onClick={(e) => e.stopPropagation()}
                              className="scale-75"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setLeftCollapsed(true)}
            style={{ position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
          >
            <ChevronLeft size={14} color="#6B7280" />
          </button>
        </aside>
      ) : (
        <button
          onClick={() => setLeftCollapsed(false)}
          style={{ width: 24, height: 60, alignSelf: "center", background: "#FFFFFF", border: "1px solid #E5E5E5", borderLeft: "none", borderRadius: "0 8px 8px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <ChevronRight size={14} color="#6B7280" />
        </button>
      )}
    </>
  );

  // ─── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "hsl(var(--background))", overflow: "hidden" }}>
      {/* Left sidebar — sempre visível */}
      {Sidebar()}

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {view === "list" && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "20px 28px 0", background: "hsl(var(--background))" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111111", margin: 0 }}>Fluxo de automações</h1>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <div style={{ display: "flex", gap: 0 }}>
                <button style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#111111", background: "#FFFFFF", border: "none", borderBottom: "2px solid hsl(var(--primary))", cursor: "pointer" }}>
                  Minhas Automações
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                  placeholder="Pesquisar..."
                  style={{ background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: "7px 12px 7px 30px", fontSize: 12, outline: "none", width: 200 }}
                />
              </div>
            </div>
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 28px" }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {/* Create card */}
                <div style={{ background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 260 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#111111" }}>Criar nova automação</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4, lineHeight: 1.5 }}>
                      Crie sua nova automação e aumente seus resultados. Lembre-se, não há limites para sua criatividade.
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {groups.slice(0, 5).map((g, i) => (
                      <button
                        key={g.name}
                        onClick={() => { setNewGroup(g.name); setCreateOpen(true); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid #E5E5E5", borderRadius: 8, background: i === 0 ? "hsl(var(--primary))" : "#FFFFFF", color: i === 0 ? "#FFFFFF" : "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
                      >
                        <Zap size={13} color={i === 0 ? "#FFFFFF" : "hsl(var(--primary))"} />
                        {g.name}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCreateOpen(true)}
                    style={{ marginTop: "auto", border: "1px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "hsl(var(--primary))", fontSize: 12, fontWeight: 600, padding: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Criar nova automação
                  </button>
                </div>

                {/* Automation cards */}
                {filteredAutomations.map(auto => (
                  <div key={auto.id} style={{ background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 200 }}>
                    {/* Mini-mapa do fluxo */}
                    <div style={{ height: 120, background: "#F8FAFC", borderBottom: "1px solid #E5E5E5", position: "relative", overflow: "hidden" }}>
                      <FlowPreview flow={auto.flow} />
                      {auto.active && (
                        <div style={{ position: "absolute", top: 8, right: 8, background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4 }}>
                          Ativo
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auto.name}</div>
                      <button
                        onClick={() => openEditor(auto.id)}
                        style={{ marginTop: "auto", border: "1px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "#374151", fontSize: 12, fontWeight: 500, padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.color = "hsl(var(--primary))"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.color = "#374151"; }}
                      >
                        <ArrowRight size={13} /> Abrir automação
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ── EDITOR VIEW ────────────────────────────────────────────────────── */}
      {view === "editor" && selectedAutomation && (
        <VarPickerCtx.Provider value={{ nodes, customFieldGroups, trigger, webhookPayload: selectedAutomation?.last_webhook_payload ?? null, refreshWebhookPayload }}>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Painel de configuração — coluna no fluxo normal, NÃO absoluto */}
          {/* Trigger config panel */}
          {triggerPanel && !nodePanel && trigger && (
            <TriggerConfigPanel
              trigger={trigger}
              automationId={selectedId ?? undefined}
              companyId={company?.id}
              automations={automations}
              onClose={() => setTriggerPanel(false)}
              onChangeTrigger={() => { setTriggerPanel(false); setTriggerOpen(true); }}
              updateConfig={updateTriggerConfigData}
              pipelines={pipelines}
              crmTags={crmTags}
              addTag={addTag}
              teamMembers={teamMembers}
              products={products}
              lossReasons={lossReasons}
              customFieldGroups={customFieldGroups}
            />
          )}

          {/* Default: Blocos básicos (when no node selected) */}
          {!nodePanel && !triggerPanel && (
            <aside style={{ width: 270, minWidth: 270, height: "80%", background: "#FFFFFF", boxShadow: "2px 0 8px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", marginLeft: 10, alignSelf: "center", border: "1px solid #E5E7EB", borderRadius: 8 }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Blocos básicos</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Arraste para o canvas ou clique para adicionar</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {ACTION_TYPES.map(at => {
                  const Icon = at.icon;
                  const isComingSoon = COMING_SOON_ACTIONS.has(at.id);
                  return (
                    <button key={at.id} disabled={isComingSoon}
                      draggable={!isComingSoon}
                      onDragStart={(e) => {
                        if (isComingSoon) { e.preventDefault(); return; }
                        e.dataTransfer.setData("application/x-block-type", at.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                      if (isComingSoon) return;
                      // Posiciona no centro da viewport atual, com leve cascata diagonal
                      // para que cliques sucessivos não fiquem empilhados no mesmo ponto.
                      const count = nodes.length;
                      const x = Math.round((-pan.x + 300) / zoom) + (count % 6) * 36;
                      const y = Math.round((-pan.y + 140) / zoom) + (count % 6) * 36;
                      const newNode: CanvasNode = { id: `n${Date.now()}`, type: at.id as ActionNodeType, x, y, label: at.label };
                      setNodes(prev => [...prev, newNode]);
                    }}
                      style={{ width: "90%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 16px", background: "transparent", border: "1px dashed #E5E7EB", borderRadius: 5, cursor: isComingSoon ? "default" : "grab", textAlign: "center", opacity: isComingSoon ? 0.6 : 1, margin: "6px auto" }}
                      onMouseEnter={e => { if (!isComingSoon) { e.currentTarget.style.background = "#D1FAE5"; e.currentTarget.style.borderColor = "hsl(163, 77%, 31%)"; e.currentTarget.style.borderRadius = "5px"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={14} color={at.color} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{at.label}</span>
                      {isComingSoon && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", border: "1px solid #DDD6FE", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.03em" }}>EM BREVE</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "mensagem" && (
            <MensagemPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => {
                const n = nodes.find(x => x.id === nodePanel);
                if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]);
              }}
              removeSubBlock={(blockId) => removeSubBlock(nodePanel, blockId)}
              updateSubBlock={(blockId, data) => updateSubBlock(nodePanel, blockId, data)}
              onAddSubBlock={(type) => { addSubBlock(nodePanel, type); }}
              onSetConnection={(connectionId) => setNodes(prev => prev.map(n => n.id === nodePanel ? { ...n, connectionId } : n))}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "acoes" && (
            <AcoesPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => {
                const n = nodes.find(x => x.id === nodePanel);
                if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]);
              }}
              removeActionItem={(itemId) => removeActionItem(nodePanel, itemId)}
              onOpenPicker={() => setAcoesPickerOpen(true)}
              updateActionItem={(itemId, config) => updateActionItem(nodePanel, itemId, config)}
              pipelines={pipelines}
              crmTags={crmTags}
              addTag={addTag}
              crmLists={crmLists}
              teamMembers={teamMembers}
              products={products}
              lossReasons={lossReasons}
              customFieldGroups={customFieldGroups}
              automations={automations}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "condicoes" && (
            <CondicoesPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => { const n = nodes.find(x => x.id === nodePanel); if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]); }}
              removeConditionItem={(itemId) => removeConditionItem(nodePanel, itemId)}
              updateConditionItem={(itemId, config) => updateConditionItem(nodePanel, itemId, config)}
              onOpenPicker={() => setCondicoesPickerOpen(true)}
              pipelines={pipelines}
              crmTags={crmTags}
              teamMembers={teamMembers}
              products={products}
              customFieldGroups={customFieldGroups}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "ia" && (
            <IaPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => { const n = nodes.find(x => x.id === nodePanel); if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]); }}
              updateAction={(actionId, data) => updateIaAction(nodePanel, actionId, data)}
              removeAction={(actionId) => removeIaAction(nodePanel, actionId)}
              onAddAction={() => setIaPickerNode(nodePanel)}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "espera" && (
            <EsperaPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => { const n = nodes.find(x => x.id === nodePanel); if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]); }}
              updateEspera={(data) => updateEspera(nodePanel, data)}
              onOpenPicker={() => setEspePickerOpen(true)}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "randomizador" && (
            <RandomizadorPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => { const n = nodes.find(x => x.id === nodePanel); if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]); }}
              addBranch={() => addRandomBranch(nodePanel)}
              removeBranch={(id) => removeRandomBranch(nodePanel, id)}
              updateBranch={(id, data) => updateRandomBranch(nodePanel, id, data)}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "api" && (
            <ApiPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => { const n = nodes.find(x => x.id === nodePanel); if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]); }}
              addApiRequest={(req) => addApiRequest(nodePanel, req)}
              removeApiRequest={(reqId) => removeApiRequest(nodePanel, reqId)}
              updateApiRequest={(reqId, data) => updateApiRequest(nodePanel, reqId, data)}
              customFieldGroups={customFieldGroups}
              openPickerTrigger={apiPickerTrigger}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "campos" && (
            <CamposPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => { const n = nodes.find(x => x.id === nodePanel); if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]); }}
              addFieldOp={(op) => addFieldOp(nodePanel, op)}
              removeFieldOp={(opId) => removeFieldOp(nodePanel, opId)}
              updateFieldOp={(opId, data) => updateFieldOp(nodePanel, opId, data)}
              customFieldGroups={customFieldGroups}
            />
          )}

          {/* Canvas area — flex: 1, encolhe quando painel está aberto */}
          <section style={{ flex: 1, position: "relative", overflow: "hidden", background: "hsl(var(--background))", backgroundImage: "radial-gradient(circle, rgba(210,210,210,0.7) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>

          {/* Toolbar */}
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "#FFFFFF", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 4, zIndex: 20 }}>
            {/* Active toggle */}
            <button
              onClick={() => toggleActive(selectedAutomation.id, !selectedAutomation.active)}
              title={selectedAutomation.active ? "Desativar" : "Ativar"}
              style={{ width: 32, height: 32, borderRadius: 8, background: selectedAutomation.active ? "#DCFCE7" : "transparent", border: "none", color: selectedAutomation.active ? "#15803D" : "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={e => !selectedAutomation.active && (e.currentTarget.style.background = "#F3F4F6")}
              onMouseLeave={e => !selectedAutomation.active && (e.currentTarget.style.background = "transparent")}
            >
              <Power size={15} />
            </button>
            <div style={{ width: 1, background: "#E5E5E5", height: 20, margin: "0 2px" }} />
            {[
              { icon: Save,       label: saving ? "Salvando..." : "Salvar",    action: handleSave },
              { icon: Pencil,     label: "Renomear",   action: () => { setRenameName(selectedAutomation.name); setRenameOpen(true); } },
              { icon: Copy,       label: "Duplicar",   action: handleDuplicate },
              { icon: StickyNote, label: "Adicionar anotação", action: handleAddNoteFromToolbar },
              { icon: Download,   label: "Exportar",   action: handleDownload },
              { icon: Upload,     label: "Importar",   action: () => fileRef.current?.click() },
            ].map((t, i) => {
              const Icon = t.icon;
              return (
                <button key={i} title={t.label} onClick={t.action}
                  style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Icon size={15} />
                </button>
              );
            })}
            <div style={{ width: 1, background: "#E5E5E5", height: 20, margin: "0 2px" }} />
            <button title="Excluir" onClick={() => setDeleteOpen(true)}
              style={{ width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", color: "#EF4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = "#FEE2E2"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* Automation name badge */}
          <div style={{ position: "absolute", top: 16, left: 16, background: "#FFFFFF", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#374151", zIndex: 20, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedAutomation.name}
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            onMouseDown={onCanvasMouseDown}
            onWheel={onWheel}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={(e) => {
              e.preventDefault();
              const type = e.dataTransfer.getData("application/x-block-type");
              if (!type || COMING_SOON_ACTIONS.has(type)) return;
              const at = ACTION_TYPES.find(a => a.id === type);
              if (!at || !canvasRef.current) return;
              const rect = canvasRef.current.getBoundingClientRect();
              // Converte o ponto solto para coordenadas do canvas (mesma fórmula do pan/zoom).
              // Centraliza o bloco (~260px) no cursor e o desloca para que o cursor caia no topo.
              const x = (e.clientX - rect.left - pan.x) / zoom - 130;
              const y = (e.clientY - rect.top - pan.y) / zoom - 24;
              const newNode: CanvasNode = { id: `n${Date.now()}`, type: at.id as ActionNodeType, x, y, label: at.label };
              setNodes(prev => [...prev, newNode]);
            }}
            style={{ position: "absolute", inset: 0, cursor: "grab" }}
          >
            <div style={{ position: "absolute", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
              {/* Note nodes — rendered before SVG so they appear behind connection lines */}
              {nodes.filter(n => n.type === "note").map(n => (
                <NoteNode
                  key={n.id}
                  node={n}
                  selected={selectedNode === n.id}
                  onDragStart={(e) => onNodeDragStart(e, n.id, () => setSelectedNode(n.id))}
                  onResizeStart={(e) => onNodeResizeStart(e, n.id)}
                  onDelete={() => { setNodes(prev => prev.filter(x => x.id !== n.id)); setSelectedNode(null); }}
                  onUpdateText={(text) => setNodes(prev => prev.map(x => x.id === n.id ? { ...x, noteText: text } : x))}
                  onUpdateColor={(colorIndex) => setNodes(prev => prev.map(x => x.id === n.id ? { ...x, noteColorIndex: colorIndex } : x))}
                />
              ))}

              {/* SVG connection lines */}
              <svg style={{ position: "absolute", top: 0, left: 0, width: 9999, height: 9999, overflow: "visible" }}>
                {nodes.flatMap(n => (n.parentIds ?? []).map(pid => ({ n, pid }))).map(({ n, pid }) => {
                  const parent = nodes.find(p => p.id === pid);
                  let x1: number, y1: number, stroke = "#9CA3AF";
                  if (parent) {
                    const pp = portPosMap[pid];
                    x1 = pp?.x ?? (parent.type === "start" ? parent.x + 244 : parent.x + 260);
                    y1 = pp?.y ?? (parent.type === "start" ? parent.y + 158 : parent.y + 110);
                  } else {
                    // Compound port: nodeId_condId or nodeId_branchId
                    const lastUnder = pid.lastIndexOf("_");
                    if (lastUnder <= 0) return null;
                    const realParentId = pid.substring(0, lastUnder);
                    const suffix = pid.substring(lastUnder + 1);
                    const realParent = nodes.find(p => p.id === realParentId);
                    if (!realParent) return null;
                    const pp = portPosMap[pid];
                    if (realParent.type === "condicoes") {
                      const condIdx = (realParent.conditionItems ?? []).findIndex(c => c.id === suffix);
                      if (condIdx === -1) return null;
                      x1 = pp?.x ?? realParent.x + 258;
                      y1 = pp?.y ?? realParent.y + 38 + 10 + condIdx * 55 + 44;
                      stroke = "#06B6D4";
                    } else if (realParent.type === "randomizador") {
                      const branches = realParent.randomBranches ?? DEFAULT_BRANCHES;
                      const branchIdx = branches.findIndex(b => b.id === suffix);
                      if (branchIdx === -1) return null;
                      x1 = pp?.x ?? realParent.x + 290;
                      y1 = pp?.y ?? realParent.y + 110 + branchIdx * 31;
                      stroke = BRANCH_COLORS[branchIdx % BRANCH_COLORS.length];
                    } else if (realParent.type === "ia") {
                      // Portas de ramificação do bloco de IA (intenção/sentimento + "-none").
                      // A posição exata vem do portPosMap (medido do DOM); fallback aproximado.
                      x1 = pp?.x ?? realParent.x + 287;
                      y1 = pp?.y ?? realParent.y + 90;
                      stroke = suffix.endsWith("-none") ? "#16A34A" : "#06B6D4";
                    } else {
                      return null;
                    }
                  }
                  const x2 = n.x, y2 = n.y + 40;
                  const pathD = buildOrthPath(x1, y1, x2, y2);
                  const isSel = selectedConn?.nodeId === n.id && selectedConn?.type === "parent" && selectedConn?.fromId === pid;
                  return (
                    <g
                      key={`${n.id}_${pid}`}
                      data-conn-line
                      style={{ cursor: "pointer" }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setSelectedConn(isSel ? null : { nodeId: n.id, type: "parent", fromId: pid }); }}
                    >
                      <path d={pathD} stroke="rgba(0,0,0,0)" strokeWidth={14} fill="none" style={{ pointerEvents: "stroke" }} />
                      <path d={pathD} stroke={isSel ? "#3B82F6" : stroke} strokeWidth={isSel ? 2.5 : 2} fill="none" strokeLinecap="round" strokeDasharray="5,5" style={{ pointerEvents: "stroke" }} />
                    </g>
                  );
                })}
                {/* Error connection lines */}
                {nodes.flatMap(n => (n.errorParentIds ?? []).map(epid => ({ n, epid }))).map(({ n, epid }) => {
                  const parent = nodes.find(p => p.id === epid);
                  if (!parent) return null;
                  const errKey = `${epid}__error`;
                  const pp = portPosMap[errKey];
                  const x1 = pp?.x ?? parent.x + 260;
                  const y1 = pp?.y ?? parent.y + 93;
                  const x2 = n.x, y2 = n.y + 40;
                  const pathD = buildOrthPath(x1, y1, x2, y2);
                  const isSel = selectedConn?.nodeId === n.id && selectedConn?.type === "error" && selectedConn?.fromId === epid;
                  return (
                    <g
                      key={`err_${n.id}_${epid}`}
                      data-conn-line
                      style={{ cursor: "pointer" }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setSelectedConn(isSel ? null : { nodeId: n.id, type: "error", fromId: epid }); }}
                    >
                      <path d={pathD} stroke="rgba(0,0,0,0)" strokeWidth={14} fill="none" style={{ pointerEvents: "stroke" }} />
                      <path d={pathD} stroke="#EF4444" strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray="5,5" opacity={isSel ? 1 : 0.75} style={{ pointerEvents: "stroke" }} />
                    </g>
                  );
                })}
                {/* Timeout ("não respondeu") connection lines */}
                {nodes.flatMap(n => (n.timeoutParentIds ?? []).map(tpid => ({ n, tpid }))).map(({ n, tpid }) => {
                  const parent = nodes.find(p => p.id === tpid);
                  if (!parent) return null;
                  const pp = portPosMap[`${tpid}__timeout`];
                  const x1 = pp?.x ?? parent.x + 260;
                  const y1 = pp?.y ?? parent.y + 70;
                  const x2 = n.x, y2 = n.y + 40;
                  const pathD = buildOrthPath(x1, y1, x2, y2);
                  const isSel = selectedConn?.nodeId === n.id && selectedConn?.type === "timeout" && selectedConn?.fromId === tpid;
                  return (
                    <g
                      key={`tmo_${n.id}_${tpid}`}
                      data-conn-line
                      style={{ cursor: "pointer" }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setSelectedConn(isSel ? null : { nodeId: n.id, type: "timeout", fromId: tpid }); }}
                    >
                      <path d={pathD} stroke="rgba(0,0,0,0)" strokeWidth={14} fill="none" style={{ pointerEvents: "stroke" }} />
                      <path d={pathD} stroke="#EF4444" strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray="2,6" opacity={isSel ? 1 : 0.75} style={{ pointerEvents: "stroke" }} />
                    </g>
                  );
                })}
                {/* Live drag line */}
                {portDragLine && (
                  <path
                    d={buildOrthPath(portDragLine.x1, portDragLine.y1, portDragLine.x2, portDragLine.y2)}
                    stroke={portDragLine.isError ? "#EF4444" : "#378ADD"} strokeWidth={2.5} fill="none"
                    strokeLinecap="round" strokeDasharray="5,5"
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </svg>

              {/* Delete button for selected connection */}
              {selectedConn && (() => {
                const n = nodes.find(nd => nd.id === selectedConn.nodeId);
                if (!n) return null;
                let x1: number, y1: number;
                const x2 = n.x, y2 = n.y + 40;
                if (selectedConn.type === "parent") {
                  const fid = selectedConn.fromId;
                  const parent = nodes.find(p => p.id === fid);
                  if (parent) {
                    const pp = portPosMap[fid];
                    x1 = pp?.x ?? (parent.type === "start" ? parent.x + 244 : parent.x + 260);
                    y1 = pp?.y ?? (parent.type === "start" ? parent.y + 158 : parent.y + 110);
                  } else {
                    const lastUnder = fid.lastIndexOf("_");
                    if (lastUnder <= 0) return null;
                    const suffix = fid.substring(lastUnder + 1);
                    const realParent = nodes.find(p => p.id === fid.substring(0, lastUnder));
                    if (!realParent) return null;
                    const pp = portPosMap[fid];
                    if (realParent.type === "condicoes") {
                      const condIdx = (realParent.conditionItems ?? []).findIndex(c => c.id === suffix);
                      x1 = pp?.x ?? realParent.x + 258;
                      y1 = pp?.y ?? realParent.y + 38 + 10 + condIdx * 55 + 44;
                    } else if (realParent.type === "randomizador") {
                      const branches = realParent.randomBranches ?? DEFAULT_BRANCHES;
                      const branchIdx = branches.findIndex(b => b.id === suffix);
                      x1 = pp?.x ?? realParent.x + 290;
                      y1 = pp?.y ?? realParent.y + 110 + branchIdx * 31;
                    } else if (realParent.type === "ia") {
                      x1 = pp?.x ?? realParent.x + 287;
                      y1 = pp?.y ?? realParent.y + 90;
                    } else {
                      return null;
                    }
                  }
                } else if (selectedConn.type === "timeout") {
                  const parent = nodes.find(p => p.id === selectedConn.fromId);
                  if (!parent) return null;
                  const pp = portPosMap[`${selectedConn.fromId}__timeout`];
                  x1 = pp?.x ?? parent.x + 260;
                  y1 = pp?.y ?? parent.y + 70;
                } else {
                  const parent = nodes.find(p => p.id === selectedConn.fromId);
                  if (!parent) return null;
                  const pp = portPosMap[`${selectedConn.fromId}__error`];
                  x1 = pp?.x ?? parent.x + 260;
                  y1 = pp?.y ?? parent.y + 93;
                }
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                return (
                  <div
                    key={`del_${selectedConn.nodeId}_${selectedConn.type}_${selectedConn.fromId}`}
                    data-conn-line
                    onMouseDown={e => e.stopPropagation()}
                    style={{ position: "absolute", left: mx - 16, top: my - 16, zIndex: 15, pointerEvents: "all" }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); disconnectNode(selectedConn.nodeId, selectedConn.type, selectedConn.fromId); }}
                      style={{ width: 32, height: 32, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #FCA5A5", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      title="Desconectar"
                    >
                      <Trash2 size={13} color="#EF4444" />
                    </button>
                  </div>
                );
              })()}

              {/* Start + Action nodes — above connection lines */}
              {nodes.filter(n => n.type !== "note").map(n => {
                if (n.type === "start") return (
                  <StartNode
                    key={n.id}
                    node={{ ...n, trigger: n.id === "n1" ? trigger : n.trigger }}
                    selected={selectedNode === n.id}
                    onSelect={() => setSelectedNode(n.id)}
                    onAddTrigger={() => setTriggerOpen(true)}
                    onTriggerClick={() => { setTriggerPanel(true); setNodePanel(null); setSelectedNode(n.id); }}
                    onRemoveTrigger={() => { setTrigger(null); setTriggerPanel(false); }}
                    onPortDragStart={(e) => startPortDrag(e, n.id)}
                    onDragStart={(e) => onNodeDragStart(e, n.id, () => setSelectedNode(n.id))}
                    stats={nodeStats[n.id]}
                    onStatClick={(status) => handleStatClick(n.id, status)}
                  />
                );
                return (
                  <ActionNode
                    key={n.id}
                    node={n}
                    selected={selectedNode === n.id}
                    onSelect={() => { setSelectedNode(n.id); setNodePanel(n.id); }}
                    onPortDragStart={(e) => startPortDrag(e, n.id)}
                    onErrorPortDragStart={(e) => startPortDrag(e, `${n.id}__error`)}
                    onTimeoutPortDragStart={(e) => startPortDrag(e, `${n.id}__timeout`)}
                    onConditionPortDragStart={(e, condId) => startPortDrag(e, `${n.id}_${condId}`)}
                    onBranchPortDragStart={(e, branchId) => startPortDrag(e, `${n.id}_${branchId}`)}
                    onDragStart={(e) => onNodeDragStart(e, n.id, () => { setSelectedNode(n.id); setNodePanel(n.id); })}
                    onDelete={() => { setNodes(prev => prev.filter(x => x.id !== n.id)); setSelectedNode(null); if (nodePanel === n.id) setNodePanel(null); if (selectedNode === n.id) setSelectedNode(null); }}
                    onDuplicate={() => setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }])}
                    onAddNote={() => setNodes(prev => [...prev, { id: `note${Date.now()}`, type: "note", x: n.x + 300, y: n.y, label: "Anotação", noteText: "", width: 220, height: 140 }])}
                    onOpenAcoesPicker={n.type === "acoes" ? () => { setSelectedNode(n.id); setNodePanel(n.id); setAcoesPickerOpen(true); } : undefined}
                    onOpenCondicoesPicker={n.type === "condicoes" ? () => { setSelectedNode(n.id); setNodePanel(n.id); setCondicoesPickerOpen(true); } : undefined}
                    onOpenApiPicker={n.type === "api" ? () => { setSelectedNode(n.id); setNodePanel(n.id); setApiPickerTrigger(t => t + 1); } : undefined}
                    onOpenIaPicker={n.type === "ia" ? () => { setSelectedNode(n.id); setNodePanel(n.id); setIaPickerNode(n.id); } : undefined}
                    onRemoveApiRequest={n.type === "api" ? (reqId) => removeApiRequest(n.id, reqId) : undefined}
                    onRemoveIaAction={n.type === "ia" ? (actionId) => removeIaAction(n.id, actionId) : undefined}
                    removeSubBlock={n.type === "mensagem" ? (blockId) => removeSubBlock(n.id, blockId) : undefined}
                    removeActionItem={n.type === "acoes" ? (itemId) => removeActionItem(n.id, itemId) : undefined}
                    removeConditionItem={n.type === "condicoes" ? (itemId) => removeConditionItem(n.id, itemId) : undefined}
                    stats={nodeStats[n.id]}
                    onStatClick={(status) => handleStatClick(n.id, status)}
                    portDragging={portDragLine != null ? (portDragLine.isError ? "error" : "normal") : null}
                    portHovered={hoveredInputPort === n.id}
                    onAddRandomBranch={n.type === "randomizador" ? () => addRandomBranch(n.id) : undefined}
                    onRemoveRandomBranch={n.type === "randomizador" ? (branchId) => removeRandomBranch(n.id, branchId) : undefined}
                  />
                );
              })}

              {/* ── Path overlay chips — mostra o caminho do lead no canvas ── */}
              {logsPanel && logsPanelPath.length > 0 && logsPanelPath.map((entry, i) => {
                const nd = nodes.find(n => n.id === entry.node_id);
                if (!nd) return null;
                const sColor = entry.status === "success" ? "#16A34A" : entry.status === "alert" ? "#D97706" : "#DC2626";
                const statusLabel = entry.status === "success" ? "Concluído com sucesso" : entry.error_message || (entry.status === "alert" ? "Alerta no bloco" : "Erro no bloco");
                return (
                  <div key={`chip_${i}`} style={{
                    position: "absolute", left: nd.x, top: nd.y - 56,
                    width: 260, background: "#FFFFFF",
                    border: "1px solid #E5E5E5",
                    borderLeft: `3px solid ${sColor}`,
                    borderRadius: 8,
                    padding: "6px 10px 6px 8px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
                    pointerEvents: "none", zIndex: 6,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: sColor, flexShrink: 0, minWidth: 22, textAlign: "center" }}>{i + 1}°</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#374151", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtDate(entry.created_at)}</div>
                      <div style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>{statusLabel}</div>
                    </div>
                  </div>
                );
              })}

              {/* Add node popup — appears at drop position */}
              {addNodeMenu && (
                <div
                  data-node
                  style={{ position: "absolute", left: addNodeMenu.x, top: addNodeMenu.y, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 12, padding: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", width: 220, zIndex: 30 }}
                  onClick={e => e.stopPropagation()}
                >
                  {ACTION_TYPES.map(at => {
                    const Icon = at.icon;
                    const isComingSoon = COMING_SOON_ACTIONS.has(at.id);
                    return (
                      <button
                        key={at.id}
                        disabled={isComingSoon}
                        onClick={() => { if (!isComingSoon) handleAddNode(at.id, at.label); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: isComingSoon ? "default" : "pointer", textAlign: "left", fontSize: 13, color: "#111111", opacity: isComingSoon ? 0.6 : 1 }}
                        onMouseEnter={e => { if (!isComingSoon) e.currentTarget.style.background = "#F9FAFB"; }}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <Icon size={16} color={at.color} />
                        <span style={{ flex: 1 }}>{at.label}</span>
                        {isComingSoon && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", border: "1px solid #DDD6FE", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.03em" }}>EM BREVE</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Zoom controls */}
          <div style={{ position: "absolute", right: 16, bottom: 60, display: "flex", flexDirection: "column", gap: 4, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
            <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={zoomBtn}><Plus size={14} /></button>
            <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} style={zoomBtn}><Minus size={14} /></button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={zoomBtn}><Maximize2 size={14} /></button>
          </div>

          {/* Nav arrows */}
          <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
            <button onClick={() => requestLeave(() => setView("list"))} style={zoomBtn} title="Voltar à lista"><ArrowLeft size={14} /></button>
            <button style={zoomBtn}><ArrowRight size={14} /></button>
          </div>

          {/* Hidden file input for import */}
          <input ref={fileRef} type="file" accept=".json,.dc" style={{ display: "none" }} onChange={handleImportFile} />

          {/* ── Logs Panel — painel lateral direito ──────────────────────── */}
          {logsPanel && (
            <div style={{ position: "absolute", top: 0, right: 0, width: 360, height: "100%", background: "#FFFFFF", borderLeft: "1px solid #E5E5E5", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", zIndex: 25, display: "flex", flexDirection: "column" }}>

              {/* Header */}
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Logs do bloco</span>
                  {logsPanelNode && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Play size={11} fill="hsl(var(--primary))" color="hsl(var(--primary))" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{logsPanelNode.label}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button onClick={() => { if (selectedId) { refreshNodeStats(selectedId); if (logsPanel) refreshLogsPanelEntries(selectedId, logsPanel.nodeId); } }}
                    title="Atualizar logs"
                    style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F3F4F6")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  ><RefreshCw size={13} /></button>
                  <button onClick={() => { setLogsPanel(null); setLogsPanelSelectedEntry(null); setLogsPanelPath([]); }}
                    style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F3F4F6")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  ><X size={14} /></button>
                </div>
              </div>

              {/* Banner: lead com caminho ativo no canvas */}
              {logsPanelSelectedEntry && (
                <div style={{ padding: "7px 12px", background: "#EFF6FF", borderBottom: "0.5px solid #BFDBFE", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <User size={12} color="#3B82F6" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#1D4ED8", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {logsPanelSelectedEntry.leadName}
                  </span>
                  <button onClick={() => { setLogsPanelSelectedEntry(null); setLogsPanelPath([]); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, color: "#3B82F6", display: "flex", alignItems: "center" }}
                  ><X size={12} /></button>
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
                {([
                  { id: "entraram" as const, label: "Entraram", count: logsPanelTabCounts.entraram },
                  { id: "success" as const, label: "Sucessos", count: logsPanelTabCounts.success },
                  { id: "alert" as const, label: "Alertas", count: logsPanelTabCounts.alert },
                  { id: "error" as const, label: "Erros", count: logsPanelTabCounts.error },
                ] as const).map(tab => {
                  const sel = logsPanelTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setLogsPanelTab(tab.id)}
                      style={{ flex: 1, padding: "9px 4px", background: "transparent", border: "none", borderBottom: sel ? "2px solid hsl(var(--primary))" : "2px solid transparent", color: sel ? "hsl(var(--primary))" : "#6B7280", fontSize: 11, fontWeight: sel ? 700 : 400, cursor: "pointer" }}
                    >{tab.label}</button>
                  );
                })}
              </div>

              {/* Filtros */}
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <User size={12} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  <select value={logsPanelLeadFilter} onChange={e => setLogsPanelLeadFilter(e.target.value)}
                    style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 6, padding: "5px 6px 5px 22px", fontSize: 11, background: "#F9FAFB", outline: "none", cursor: "pointer", color: logsPanelLeadFilter ? "#111" : "#9CA3AF", appearance: "none" }}
                  >
                    <option value="">Selecionar lead</option>
                    {logsPanelLeads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <select value={logsPanelPeriod} onChange={e => setLogsPanelPeriod(e.target.value)}
                  style={{ border: "1px solid #E5E5E5", borderRadius: 6, padding: "5px 8px", fontSize: 11, background: "#F9FAFB", outline: "none", cursor: "pointer", color: "#374151", flexShrink: 0 }}
                >
                  <option value="week">Última semana</option>
                  <option value="month">Último mês</option>
                  <option value="all">Todos</option>
                </select>
              </div>

              {/* Lista */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {logsPanelLoading ? (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "#6B7280", fontSize: 13 }}>Carregando...</div>
                ) : logsPanelFilteredEntries.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Nenhum registro encontrado</div>
                ) : logsPanelFilteredEntries.map((entry, i) => {
                  const isActive = logsPanelSelectedEntry?.leadId === entry.lead_id;
                  const isEntraram = logsPanelTab === "entraram";
                  const sColor = entry.status === "success" ? "#16A34A" : entry.status === "alert" ? "#D97706" : "#DC2626";
                  const EntIcon = isEntraram ? Info : (entry.status === "success" ? CheckCircle2 : entry.status === "alert" ? Bell : X);
                  const entColor = isEntraram ? "#3B82F6" : sColor;
                  const desc = isEntraram
                    ? "Entrou no bloco"
                    : (entry.status === "success" ? "Concluído com sucesso" : entry.error_message || (entry.status === "alert" ? "Alerta no bloco" : "Erro no bloco"));
                  return (
                    <button key={entry.id} onClick={() => loadEntryPath(entry.lead_id, entry.lead_name)}
                      style={{ width: "100%", padding: "11px 14px", background: isActive ? "#EFF6FF" : "transparent", border: "none", borderBottom: "0.5px solid #F5F5F5", borderLeft: isActive ? "2px solid #3B82F6" : "2px solid transparent", textAlign: "left", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F9FAFB"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <EntIcon size={15} color={entColor} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#374151" }}>{fmtDate(entry.created_at)}</div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{desc}</div>
                      </div>
                      {i === 0 && <RotateCcw size={13} color="#9CA3AF" style={{ flexShrink: 0, marginTop: 2 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </section>
        </div>
        </VarPickerCtx.Provider>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={v => { setCreateOpen(v); if (!v) { setNewName(""); setNewDesc(""); setNewGroup(""); setStartType("blank"); setSelectedTemplate(null); setGroupDropOpen(false); setGroupCreating(false); setGroupNewInput(""); } }}>
        <DialogContent className={startType === "model" ? "sm:max-w-[860px]" : "sm:max-w-[480px]"}>
          <DialogHeader>
            <DialogTitle>Criar nova automação</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
          <div style={{ flex: startType === "model" ? "0 0 360px" : 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label className="text-xs font-medium">Nome</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome da automação"
                className="mt-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Descrição</Label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Descrição da automação"
                className="mt-1 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                rows={2}
              />
            </div>
            <div style={{ position: "relative" }}>
              <Label className="text-xs font-medium">Grupo</Label>
              <button
                type="button"
                onClick={() => { setGroupDropOpen(o => !o); setGroupCreating(false); setGroupNewInput(""); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", marginTop: 4, padding: "8px 12px", fontSize: 13,
                  border: "1px solid hsl(var(--border))", borderRadius: 6,
                  background: "hsl(var(--background))", color: newGroup ? "hsl(var(--foreground))" : "#9CA3AF",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span>{newGroup || "Selecione ou crie um grupo"}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#6B7280", flexShrink: 0 }}><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {groupDropOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
                  background: "hsl(var(--background))", border: "1px solid hsl(var(--border))",
                  borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", overflow: "hidden",
                }}>
                  {groups.map(g => (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => { setNewGroup(g.name); setGroupDropOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "9px 14px", fontSize: 13, border: "none", cursor: "pointer",
                        background: newGroup === g.name ? "hsl(var(--accent))" : "transparent",
                        color: "hsl(var(--foreground))", textAlign: "left",
                      }}
                    >
                      {g.name}
                    </button>
                  ))}
                  {groupCreating ? (
                    <div style={{ padding: "8px 10px", borderTop: groups.length > 0 ? "1px solid hsl(var(--border))" : "none", display: "flex", gap: 6 }}>
                      <input
                        autoFocus
                        value={groupNewInput}
                        onChange={e => setGroupNewInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && groupNewInput.trim()) {
                            setNewGroup(groupNewInput.trim());
                            setGroupDropOpen(false);
                            setGroupCreating(false);
                          } else if (e.key === "Escape") {
                            setGroupCreating(false);
                          }
                        }}
                        placeholder="Nome do grupo..."
                        style={{
                          flex: 1, padding: "5px 8px", fontSize: 12,
                          border: "1px solid hsl(var(--border))", borderRadius: 5,
                          background: "hsl(var(--background))", color: "hsl(var(--foreground))", outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (groupNewInput.trim()) {
                            setNewGroup(groupNewInput.trim());
                            setGroupDropOpen(false);
                            setGroupCreating(false);
                          }
                        }}
                        style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 5, background: "hsl(var(--primary))", color: "#fff", cursor: "pointer" }}
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setGroupCreating(true)}
                      style={{
                        display: "block", width: "100%", padding: "9px 14px", fontSize: 13, fontWeight: 600,
                        border: "none", borderTop: groups.length > 0 ? "1px solid hsl(var(--border))" : "none",
                        cursor: "pointer", background: "transparent", color: "hsl(var(--primary))", textAlign: "right",
                      }}
                    >
                      Criar
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs font-medium mb-2 block">Como você deseja começar?</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { id: "blank" as const,  label: "Em branco",  desc: "Comece do zero e crie sua automação personalizada",   icon: LayoutGrid },
                  { id: "import" as const, label: "Importar",   desc: "Importe uma automação existente",                     icon: Upload },
                  { id: "model" as const,  label: "Modelo",     desc: "Use um modelo pré-configurado",                       icon: Copy },
                ].map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStartType(opt.id)}
                      style={{ border: `1.5px solid ${startType === opt.id ? "hsl(var(--primary))" : "#E5E5E5"}`, borderRadius: 10, padding: "10px 8px", background: startType === opt.id ? "hsl(var(--primary) / 0.04)" : "#FFFFFF", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}
                    >
                      <Icon size={18} color={startType === opt.id ? "hsl(var(--primary))" : "#6B7280"} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{opt.label}</span>
                      <span style={{ fontSize: 10, color: "#6B7280", lineHeight: 1.4 }}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {startType === "model" && (
            <div style={{ flex: 1, minWidth: 0, borderLeft: "1px solid hsl(var(--border))", paddingLeft: 18, display: "flex", flexDirection: "column" }}>
              <Label className="text-xs font-medium mb-2 block">Escolha um modelo</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: 380, paddingRight: 4 }}>
                {AUTOMATION_TEMPLATES.map(tpl => {
                  const Icon = tpl.icon;
                  const sel = selectedTemplate === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => { setSelectedTemplate(tpl.id); if (!newName.trim()) setNewName(tpl.name); if (!newDesc.trim()) setNewDesc(tpl.description); }}
                      style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", border: `1.5px solid ${sel ? "hsl(var(--primary))" : "#E5E5E5"}`, borderRadius: 10, padding: "10px 12px", background: sel ? "hsl(var(--primary) / 0.04)" : "#FFFFFF", cursor: "pointer" }}
                    >
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "hsl(var(--primary) / 0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={15} color="hsl(var(--primary))" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111111", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ flex: 1 }}>{tpl.name}</span>
                          {sel && <CheckCircle2 size={14} color="hsl(var(--primary))" />}
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.4, marginTop: 2 }}>{tpl.description}</div>
                        <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4 }}>Gatilho: {tpl.flow.trigger.label} · Grupo: {tpl.group}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (startType === "import") {
                  if (!newName.trim()) { toast.error("Informe um nome"); return; }
                  createFileRef.current?.click();
                } else {
                  handleCreate();
                }
              }}
              disabled={creating}
            >
              {creating ? "Criando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trigger panel */}
      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent style={{ maxWidth: 620, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 480 }}>
            {/* Category list */}
            <div style={{ width: 160, borderRight: "1px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
              <div style={{ padding: "0 12px 12px", fontSize: 13, fontWeight: 600, color: "#111111" }}>Adicionar gatilho</div>
              {TRIGGER_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const sel = selectedTriggerCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedTriggerCat(cat.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: sel ? "#F0FDF4" : "transparent", border: "none", borderLeft: sel ? "2px solid hsl(var(--primary))" : "2px solid transparent", cursor: "pointer", fontSize: 12, color: sel ? "hsl(var(--primary))" : "#374151", fontWeight: sel ? 600 : 400, textAlign: "left" }}
                  >
                    <Icon size={14} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
            {/* Trigger list */}
            <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
              {(() => {
                const cat = TRIGGER_CATEGORIES.find(c => c.id === selectedTriggerCat)!;
                return (
                  <>
                    <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700, color: "#111111" }}>{cat.label}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{cat.description}</div>
                    {trigger && trigger.categoryId === cat.id && (
                      <div style={{ marginBottom: 12, padding: "6px 10px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, fontSize: 11, color: "#15803D", display: "flex", alignItems: "center", gap: 6 }}>
                        <CheckCircle2 size={12} /> Gatilho atual: {trigger.label}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {cat.triggers.map(t => {
                        const isComingSoon = t.id === "mcp_tool";
                        return (
                          <button
                            key={t.id}
                            onClick={() => !isComingSoon && handleSelectTrigger(cat, t)}
                            disabled={isComingSoon}
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "1px solid #E5E5E5", borderRadius: 8, background: isComingSoon ? "#F9FAFB" : "#FFFFFF", cursor: isComingSoon ? "default" : "pointer", textAlign: "left", transition: "all 0.1s", opacity: isComingSoon ? 0.7 : 1 }}
                            onMouseEnter={e => { if (!isComingSoon) { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.background = "#F0FDF4"; } }}
                            onMouseLeave={e => { if (!isComingSoon) { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.background = "#FFFFFF"; } }}
                          >
                            <ArrowRight size={14} color={isComingSoon ? "#9CA3AF" : "hsl(var(--primary))"} style={{ marginTop: 1, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: isComingSoon ? "#6B7280" : "#111111" }}>{t.label}</div>
                                {isComingSoon && (
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", border: "1px solid #DDD6FE", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.03em" }}>EM BREVE</span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{t.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Picker de ações de IA */}
      <Dialog open={!!iaPickerNode} onOpenChange={v => !v && setIaPickerNode(null)}>
        <DialogContent style={{ maxWidth: 620, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 480 }}>
            <div style={{ width: 160, borderRight: "1px solid #E5E5E5", padding: "16px 0", flexShrink: 0 }}>
              <div style={{ padding: "0 12px 12px", fontSize: 13, fontWeight: 600, color: "#111111" }}>Adicionar ação de IA</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderLeft: "2px solid hsl(var(--primary))", background: "#F0FDF4", fontSize: 12, fontWeight: 600, color: "hsl(var(--primary))" }}>
                <MessageCircle size={14} /> Mensagens
              </div>
            </div>
            <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 2 }}>Mensagens</div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>Adicione ações de IA baseadas em mensagens</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {IA_ACTION_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} disabled={t.soon}
                      onClick={() => { if (t.soon || !iaPickerNode) return; const node = iaPickerNode; addIaAction(node, t.id); setNodePanel(node); setIaPickerNode(null); }}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", padding: "11px 12px", border: "1px solid #E5E5E5", borderRadius: 10, background: "#FFF", cursor: t.soon ? "default" : "pointer", opacity: t.soon ? 0.55 : 1 }}
                      onMouseEnter={e => { if (!t.soon) e.currentTarget.style.borderColor = "hsl(var(--primary))"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; }}>
                      <Icon size={16} color="#8B5CF6" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111", display: "flex", alignItems: "center", gap: 6 }}>
                          {t.label}
                          {t.soon && <span style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", border: "1px solid #DDD6FE", borderRadius: 4, padding: "1px 5px" }}>EM BREVE</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{t.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ações picker */}
      <Dialog open={acoesPickerOpen} onOpenChange={setAcoesPickerOpen}>
        <DialogContent style={{ maxWidth: 620, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 480 }}>
            <div style={{ width: 160, borderRight: "1px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
              <div style={{ padding: "0 12px 12px", fontSize: 13, fontWeight: 600, color: "#111111" }}>Adicionar ação</div>
              {ACTION_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const sel = selectedActionPickerCat === cat.id;
                return (
                  <button key={cat.id} onClick={() => setSelectedActionPickerCat(cat.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: sel ? "#FFF7ED" : "transparent", border: "none", borderLeft: sel ? "2px solid #F97316" : "2px solid transparent", cursor: "pointer", fontSize: 12, color: sel ? "#F97316" : "#374151", fontWeight: sel ? 600 : 400, textAlign: "left" }}
                  >
                    <Icon size={14} />{cat.label}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
              {(() => {
                const cat = ACTION_CATEGORIES.find(c => c.id === selectedActionPickerCat)!;
                return (
                  <>
                    <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700, color: "#111111" }}>{cat.label}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{cat.description}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {cat.actions.map(action => {
                        const AIcon = action.icon;
                        return (
                          <button key={action.id}
                            onClick={() => { if (nodePanel) addActionItem(nodePanel, { categoryId: cat.id, actionId: action.id, label: action.label, description: action.description }); setAcoesPickerOpen(false); }}
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "1px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "#F97316"; e.currentTarget.style.background = "#FFF7ED"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.background = "#FFFFFF"; }}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: "#FFF7ED", border: "0.5px solid #FED7AA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                              <AIcon size={14} color="#F97316" />
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{action.label}</span>
                                {action.warning && <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF3C7", color: "#B45309", padding: "1px 6px", borderRadius: 4 }}>Atenção</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{action.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Condições picker */}
      <Dialog open={condicoesPickerOpen} onOpenChange={setCondicoesPickerOpen}>
        <DialogContent style={{ maxWidth: 620, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 480 }}>
            <div style={{ width: 160, borderRight: "1px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
              <div style={{ padding: "0 12px 12px", fontSize: 13, fontWeight: 600, color: "#111111" }}>Adicionar condição</div>
              {CONDITION_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const sel = selectedCondPickerCat === cat.id;
                return (
                  <button key={cat.id} onClick={() => setSelectedCondPickerCat(cat.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: sel ? "#F3F4FF" : "transparent", border: "none", borderLeft: sel ? "2px solid #6366F1" : "2px solid transparent", cursor: "pointer", fontSize: 12, color: sel ? "#6366F1" : "#374151", fontWeight: sel ? 600 : 400, textAlign: "left" }}>
                    <Icon size={14} />{cat.label}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
              {(() => {
                const cat = CONDITION_CATEGORIES.find(c => c.id === selectedCondPickerCat)!;
                return (
                  <>
                    <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700, color: "#111111" }}>{cat.label}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{cat.description}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {cat.conditions.map(cond => {
                        const CondIcon = cond.icon ?? Filter;
                        return (
                          <button key={cond.id}
                            onClick={() => {
                              if (nodePanel) addConditionItem(nodePanel, { categoryId: cat.id, conditionId: cond.id, label: cond.label });
                              setCondicoesPickerOpen(false);
                            }}
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "1px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366F1"; e.currentTarget.style.background = "#F3F4FF"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.background = "#FFFFFF"; }}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: "#F3F4FF", border: "0.5px solid #C7D2FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                              <CondIcon size={14} color="#6366F1" />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#111111", display: "flex", alignItems: "center", gap: 6 }}>
                                {cond.label}
                                {cond.warning && <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FDE68A", borderRadius: 4, padding: "1px 6px" }}>Atenção</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{cond.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Espera picker */}
      <Dialog open={espePickerOpen} onOpenChange={setEspePickerOpen}>
        <DialogContent style={{ maxWidth: 620, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 480 }}>
            <div style={{ width: 160, borderRight: "1px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
              {ESPERA_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const sel = selectedEspePickerCat === cat.id;
                return (
                  <button key={cat.id} onClick={() => setSelectedEspePickerCat(cat.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: sel ? "#EFF6FF" : "transparent", border: "none", borderLeft: sel ? "2px solid #3B82F6" : "2px solid transparent", cursor: "pointer", fontSize: 12, color: sel ? "#3B82F6" : "#374151", fontWeight: sel ? 600 : 400, textAlign: "left" }}>
                    <Icon size={14} />{cat.label}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
              {(() => {
                const cat = ESPERA_CATEGORIES.find(c => c.id === selectedEspePickerCat)!;
                return (
                  <>
                    <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 700, color: "#111111" }}>{cat.label}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{cat.description}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {cat.items.map(item => (
                        <button key={item.id}
                          onClick={() => {
                            if (nodePanel) {
                              const defaults: EsperaConfig = item.id === "intervalo_semana"
                                ? { type: "intervalo_semana", days: ["seg","ter","qua","qui","sex"], startTime: "00:00", endTime: "23:59", timezone: "America/Sao_Paulo (BRT)" }
                                : item.id === "dia_horario"
                                ? { type: "dia_horario", dateField: "", dateStartTime: "00:00", dateEndTime: "23:59", dateTimezone: "America/Sao_Paulo (BRT)" }
                                : item.id === "dias"
                                ? { type: "dias", amount: 1 }
                                : { type: item.id as EsperaConfig["type"], amount: 5 };
                              updateEspera(nodePanel, defaults);
                            }
                            setEspePickerOpen(false);
                          }}
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "1px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.background = "#EFF6FF"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.background = "#FFFFFF"; }}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: "#EFF6FF", border: "0.5px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                            {item.id === "usuario_parou" ? <MessageCircle size={14} color="#3B82F6" /> : <Clock size={14} color="#3B82F6" />}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{item.label}</div>
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename modal */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Renomear automação</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs font-medium">Nome</Label>
            <Input value={renameName} onChange={e => setRenameName(e.target.value)} className="mt-1 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary" onKeyDown={e => e.key === "Enter" && handleRename()} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={handleRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes guard */}
      <AlertDialog open={unsavedOpen} onOpenChange={handleUnsavedOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem alterações não publicadas</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja sair sem salvar ou salvar antes de sair?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleLeaveWithoutSaving}>Sair sem salvar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndLeave}>Salvar e sair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir automação</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A automação "{selectedAutomation?.name}" será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input for create-from-import (outside view conditionals) */}
      <input ref={createFileRef} type="file" accept=".json,.dc" style={{ display: "none" }} onChange={handleCreateImport} />

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const zoomBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none",
  color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

const tcpSelectStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #E5E5E5", borderRadius: 6,
  padding: "7px 10px", fontSize: 12, background: "#FFFFFF", outline: "none", cursor: "pointer",
};

const tcpInputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #E5E5E5", borderRadius: 6,
  padding: "7px 10px", fontSize: 12, background: "#FFFFFF", outline: "none", boxSizing: "border-box",
};

const tcpWarning = (text: string) => (
  <div style={{ background: "#FFFBEB", border: "0.5px solid #FCD34D", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>
    <span style={{ fontWeight: 700 }}>⚠ </span>{text}
  </div>
);

// ─── TriggerConfigPanel ────────────────────────────────────────────────────────

function TriggerConfigPanel({ trigger, automationId, companyId, automations, onClose, onChangeTrigger, updateConfig, pipelines, crmTags, addTag, teamMembers, products, lossReasons, customFieldGroups }: {
  trigger: TriggerConfig;
  automationId?: string;
  companyId?: string;
  automations?: AutomationRecord[];
  onClose: () => void;
  onChangeTrigger: () => void;
  updateConfig: (key: string, value: string | boolean | number) => void;
  pipelines: Pipeline[];
  crmTags: CrmTagType[];
  addTag: (name: string, description: string, color: string) => Promise<boolean>;
  teamMembers: string[];
  products: Product[];
  lossReasons: LossReason[];
  customFieldGroups: CustomFieldGroup[];
}) {
  const cfg = trigger.configData ?? {};

  const InstanceRow = ({ label }: { label: string }) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 6 }}>
        <select value={(cfg.instance as string) ?? ""} onChange={e => updateConfig("instance", e.target.value)} style={{ ...tcpSelectStyle, flex: 1 }}>
          <option value="">Selecionar</option>
        </select>
        <button style={{ width: 32, height: 32, borderRadius: 6, background: "#F3F4F6", border: "1px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ArrowLeftRight size={13} color="#6B7280" />
        </button>
      </div>
    </div>
  );

  const KeywordsBlock = () => (
    <>
      <div>
        <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Tipo da comparação das palavras-chaves</div>
        <select value={(cfg.keywordType as string) ?? "Contém"} onChange={e => updateConfig("keywordType", e.target.value)} style={tcpSelectStyle}>
          <option value="Contém">Contém</option>
          <option value="Igual a">Igual a</option>
          <option value="Começa com">Começa com</option>
          <option value="Termina com">Termina com</option>
          <option value="Regex">Regex</option>
        </select>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 6 }}>
          Palavras-chaves para iniciar a automação. Deixe em branco para iniciar a automação com qualquer mensagem.
        </div>
        <textarea
          value={(cfg.keywords as string) ?? ""}
          onChange={e => updateConfig("keywords", e.target.value)}
          placeholder="Digite palavras-chave..."
          rows={3}
          style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 6, padding: "8px 10px", fontSize: 12, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Indica as condições para iniciar uma nova sessão na automação</div>
        <select value={(cfg.sessionCondition as string) ?? "not_in"} onChange={e => updateConfig("sessionCondition", e.target.value)} style={tcpSelectStyle}>
          <option value="not_in">Iniciar apenas se o contato não estiver atualmente nesta automação</option>
          <option value="always">Sempre iniciar uma nova sessão</option>
          <option value="never">Não iniciar uma nova sessão</option>
        </select>
      </div>
    </>
  );

  const SourceBadge = () => (
    <div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Fonte de dados</div>
      <span style={{ display: "inline-block", background: "#3B82F6", color: "#FFFFFF", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>Api-request-1</span>
    </div>
  );

  const MetricWarning = () => tcpWarning(
    "O gatilho de métrica do lead é processado em background de forma assíncrona, podendo ser executado em horários imprevisíveis, inclusive horas após as alterações nos negócios do sistema. Recomendamos o uso de blocos com condições de espera para o envio de mensagens, garantindo que sejam disparadas no momento adequado."
  );

  const renderBody = () => {
    switch (trigger.triggerId) {

      case "neg_movido":
      case "neg_criado": {
        const stageQuestion = trigger.triggerId === "neg_movido"
          ? "Qual etapa irá iniciar a automação quando um negócio entrar nela?"
          : "Em qual etapa o negócio será criado para iniciar a automação?";
        const selectedPipeline = pipelines.find(p => p.id === (cfg.pipeline as string));
        const availableColumns = selectedPipeline
          ? selectedPipeline.columns
          : pipelines.flatMap(p => p.columns.map(c => ({ ...c, _pipelineName: p.name })));
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Pipeline (opcional)</div>
              <select
                value={(cfg.pipeline as string) ?? ""}
                onChange={e => { updateConfig("pipeline", e.target.value); updateConfig("stage", ""); }}
                style={tcpSelectStyle}
              >
                <option value="">Todas as pipelines</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 8 }}>
                {stageQuestion}
              </div>
              <select value={(cfg.stage as string) ?? ""} onChange={e => updateConfig("stage", e.target.value)} style={tcpSelectStyle}>
                <option value="">Selecionar</option>
                {availableColumns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {"_pipelineName" in col ? `${(col as { _pipelineName: string })._pipelineName} › ${col.title}` : col.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      }

      case "atend_atribuido":
      case "atend_retirado": {
        const atendLabel = trigger.triggerId === "atend_atribuido"
          ? "Selecione o atendente que deseja filtrar a atribuição ao negócio. Deixe em branco para considerar qualquer um."
          : "Selecione o atendente que deseja filtrar a retirada do negócio. Deixe em branco para considerar qualquer um.";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5 }}>{atendLabel}</div>
            <select value={(cfg.atendente as string) ?? ""} onChange={e => updateConfig("atendente", e.target.value)} style={tcpSelectStyle}>
              <option value="">Qualquer atendente</option>
              {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        );
      }

      case "neg_ganho":
      case "neg_perdido":
      case "neg_restaurado": {
        const verb = trigger.triggerId === "neg_ganho" ? "ganho" : trigger.triggerId === "neg_perdido" ? "perdido" : "restaurado";
        const scope = (cfg.scope as string) ?? "Pipeline";
        const scopePipeline = pipelines.find(p => p.id === (cfg.pipeline as string));
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 8 }}>
                Verifica se a automação será iniciada quando o negócio for {verb} na etapa ou na pipeline
              </div>
              <select value={scope} onChange={e => { updateConfig("scope", e.target.value); updateConfig("stage", ""); }} style={tcpSelectStyle}>
                <option value="Pipeline">Pipeline</option>
                <option value="Etapa">Etapa</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 8 }}>
                Informe em qual pipeline que o negócio foi {verb} que irá iniciar a automação. Deixe em branco para qualquer pipeline
              </div>
              <select value={(cfg.pipeline as string) ?? ""} onChange={e => { updateConfig("pipeline", e.target.value); updateConfig("stage", ""); }} style={tcpSelectStyle}>
                <option value="">Qualquer pipeline</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {scope === "Etapa" && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 8 }}>
                  Qual etapa?
                </div>
                <select value={(cfg.stage as string) ?? ""} onChange={e => updateConfig("stage", e.target.value)} style={tcpSelectStyle}>
                  <option value="">Qualquer etapa</option>
                  {(scopePipeline ? scopePipeline.columns : pipelines.flatMap(p => p.columns.map(c => ({ ...c, _pn: p.name })))).map((col) => (
                    <option key={col.id} value={col.id}>
                      {"_pn" in col ? `${(col as { _pn: string })._pn} › ${col.title}` : col.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {trigger.triggerId === "neg_perdido" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#374151" }}>Receber fonte de dados do provedor do negócio</span>
                <Switch checked={!!(cfg.receberFonte)} onCheckedChange={v => updateConfig("receberFonte", v)} className="scale-75" />
              </div>
            )}
          </div>
        );
      }

      case "tag_removida":
      case "tag_adicionada": {
        const tagVerb = trigger.triggerId === "tag_removida" ? "removidas" : "adicionadas";
        const selectedTagIds = ((cfg.tags as string) ?? "").split(",").filter(Boolean);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5 }}>
              Quais as tags que, ao serem {tagVerb}, irão iniciar a automação?
            </div>
            <TagMultiSelect
              selectedIds={selectedTagIds}
              onChange={ids => updateConfig("tags", ids.join(","))}
              crmTags={crmTags}
              addTag={addTag}
            />
          </div>
        );
      }

      case "lead_criado":
      case "lead_manual":
      case "atividade_exec":
        return (
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
            Sem configurações adicionais para este gatilho.
          </div>
        );

      case "lead_qtd_ganhos":
      case "lead_valor_ganhos":
      case "lead_sem_compra": {
        const isQtd = trigger.triggerId === "lead_qtd_ganhos";
        const isValor = trigger.triggerId === "lead_valor_ganhos";
        const label = isQtd ? "Quantidade de negócios ganhos do lead" : isValor ? "Valor total dos negócios ganhos do lead" : "Quantidade de dias sem compras";
        const key = isQtd ? "quantidade" : isValor ? "valor" : "dias";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>{label}</div>
              <input type="number" min={0} value={(cfg[key] as number) ?? 0}
                onChange={e => updateConfig(key, Number(e.target.value))} style={tcpInputStyle} />
            </div>
            <MetricWarning />
          </div>
        );
      }

      case "msg_recebida":
      case "msg_enviada":
      case "atend_finalizado":
      case "atend_iniciado": {
        const isMsg = ["msg_recebida", "msg_enviada"].includes(trigger.triggerId);
        const isSent = trigger.triggerId === "msg_enviada";
        const instanceLabel = "Qual a instância que irá ouvir as mensagens e iniciar a automação?";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <InstanceRow label={instanceLabel} />
            {isMsg && <KeywordsBlock />}
            {isMsg && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#374151" }}>
                    {isSent ? "Monitorar mensagens enviadas em grupos" : "Ouvir mensagens enviadas em grupos"}
                  </span>
                  <Switch checked={!!(cfg.groupMessages)} onCheckedChange={v => updateConfig("groupMessages", v)} className="scale-75" />
                </div>
                {isSent && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#374151" }}>Considerar mensagens agendadas</span>
                    <Switch checked={!!(cfg.scheduledMessages)} onCheckedChange={v => updateConfig("scheduledMessages", v)} className="scale-75" />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#374151" }}>Receber fonte de dados do provedor da mensagem</span>
                  <Switch checked={!!(cfg.receberFonte)} onCheckedChange={v => updateConfig("receberFonte", v)} className="scale-75" />
                </div>
              </>
            )}
          </div>
        );
      }

      case "ig_comentario":
      case "ig_live":
      case "fb_comentario":
      case "fb_live":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <InstanceRow label="Qual a instância que irá ouvir os comentários e iniciar a automação?" />
            <KeywordsBlock />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#374151" }}>Receber fonte de dados do provedor do comentário</span>
              <Switch checked={!!(cfg.receberFonte)} onCheckedChange={v => updateConfig("receberFonte", v)} className="scale-75" />
            </div>
          </div>
        );

      case "dep_alterado":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 8 }}>Qual departamento será monitorado para alterações?</div>
              <select value={(cfg.department as string) ?? ""} onChange={e => updateConfig("department", e.target.value)} style={tcpSelectStyle}>
                <option value="">Selecionar</option>
              </select>
            </div>
            <InstanceRow label="Qual a instância que irá ouvir as mensagens e iniciar a automação?" />
          </div>
        );

      case "campo_alterado":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0369A1", lineHeight: 1.5, marginBottom: 8 }}>Qual campo deseja monitorar?</div>
              <select value={(cfg.field as string) ?? ""} onChange={e => updateConfig("field", e.target.value)} style={tcpSelectStyle}>
                <option value="">Selecionar</option>
                <optgroup label="── Negócio ──">
                  <option value="name">Nome</option>
                  <option value="value">Valor</option>
                  <option value="column_id">Etapa</option>
                  <option value="pipeline_id">Pipeline</option>
                  <option value="responsible">Atendente responsável</option>
                  <option value="status">Status (aberto / ganho / perdido)</option>
                  <option value="origin">Origem</option>
                  <option value="priority">Prioridade</option>
                  <option value="product_id">Produto</option>
                  <option value="tags">Tags</option>
                  <option value="entry_date">Data de entrada</option>
                  <option value="next_follow_up">Próximo follow-up</option>
                  <option value="loss_reason_id">Motivo de perda</option>
                  <option value="notes">Observações</option>
                </optgroup>
                <optgroup label="── Lead / Contato ──">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="site">Site</option>
                  <option value="company">Empresa</option>
                  <option value="document">CPF / Documento</option>
                  <option value="birth_date">Data de nascimento</option>
                  <option value="country">País</option>
                  <option value="zip_code">CEP</option>
                  <option value="address">Endereço</option>
                  <option value="addr_number">Número</option>
                  <option value="complement">Complemento</option>
                  <option value="neighborhood">Bairro</option>
                  <option value="city">Cidade</option>
                  <option value="state">Estado</option>
                </optgroup>
                <optgroup label="── UTMs ──">
                  <option value="utm_source">UTM Source</option>
                  <option value="utm_medium">UTM Medium</option>
                  <option value="utm_campaign">UTM Campaign</option>
                  <option value="utm_term">UTM Term</option>
                  <option value="utm_content">UTM Content</option>
                </optgroup>
                {customFieldGroups.length > 0 && customFieldGroups.map(g => (
                  <optgroup key={g.id} label={`── ${g.name} ──`}>
                    {g.items.map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Modo de disparo</div>
              <select value={(cfg.mode as string) ?? "any"} onChange={e => updateConfig("mode", e.target.value)} style={tcpSelectStyle}>
                <option value="any">Qualquer alteração</option>
                <option value="specific">Para um valor específico</option>
              </select>
            </div>
            {(cfg.mode as string) === "specific" && (() => {
              const field = (cfg.field as string) ?? "";
              const val = (cfg.value as string) ?? "";
              const BR_STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
              const ORIGINS: string[] = ["Instagram","Facebook Ads","Google Ads","Meta Ads","TikTok Ads","LinkedIn Ads","YouTube Ads","Email Marketing","Orgânico","WhatsApp","Evento","Indicação","Site","Outro"];
              const customItem = customFieldGroups.flatMap(g => g.items).find(i => i.id === field);

              let input: React.ReactNode;

              if (["entry_date","next_follow_up","birth_date"].includes(field) || customItem?.fieldType === "date") {
                input = <input type="date" value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle} />;
              } else if (field === "value") {
                input = <input type="number" min={0} step={0.01} placeholder="0,00" value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle} />;
              } else if (field === "document") {
                input = <input type="text" placeholder="000.000.000-00" maxLength={14} value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle} />;
              } else if (field === "zip_code") {
                input = <input type="text" placeholder="00000-000" maxLength={9} value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle} />;
              } else if (field === "origin") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                );
              } else if (field === "priority") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    <option value="Alta">Alta</option>
                    <option value="Média">Média</option>
                    <option value="Baixa">Baixa</option>
                  </select>
                );
              } else if (field === "status") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    <option value="open">Aberto</option>
                    <option value="won">Ganho</option>
                    <option value="lost">Perdido</option>
                  </select>
                );
              } else if (field === "pipeline_id") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                );
              } else if (field === "column_id") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {pipelines.map(p => (
                      <optgroup key={p.id} label={p.name}>
                        {p.columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </optgroup>
                    ))}
                  </select>
                );
              } else if (field === "responsible") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                );
              } else if (field === "tags") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {crmTags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                );
              } else if (field === "product_id") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                );
              } else if (field === "loss_reason_id") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {lossReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                );
              } else if (field === "state") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                );
              } else if (customItem?.fieldType === "boolean") {
                input = (
                  <select value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle}>
                    <option value="">Selecionar</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                );
              } else {
                input = <input type="text" placeholder="Digite o valor..." value={val} onChange={e => updateConfig("value", e.target.value)} style={tcpSelectStyle} />;
              }

              return (
                <div>
                  <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Valor esperado</div>
                  {input}
                </div>
              );
            })()}
          </div>
        );

      case "http_webhook": {
        const webhookUrl = `https://api.rezultcrm.com/webhook/${automationId ?? (cfg.webhookId as string)}`;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>URL do webhook</div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{ flex: 1, background: "#F9FAFB", border: "1px solid #E5E5E5", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5, wordBreak: "break-all" }}>
                  {webhookUrl}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(webhookUrl).then(() => toast.success("URL copiada"))}
                  style={{ width: 32, height: 32, borderRadius: 6, background: "#F3F4F6", border: "1px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >
                  <Copy size={13} color="#6B7280" />
                </button>
              </div>
            </div>
            {tcpWarning("O webhook possui um limite de 60 requisições por minuto. Caso precisar aumentar o limite entre em contato com o suporte.")}
            <SourceBadge />
          </div>
        );
      }

      case "outra_automacao": {
        const outrasAutos = (automations ?? []).filter(a => a.id !== automationId);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#0369A1", fontWeight: 600, marginBottom: 4 }}>Como funciona</div>
              <div style={{ fontSize: 11, color: "#0C4A6E", lineHeight: 1.5 }}>
                Esta automação é iniciada quando outra automação usa a ação <strong>"Iniciar Automação"</strong> apontando para ela.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Restringir à automação (opcional)</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>Deixe em branco para aceitar de qualquer automação.</div>
              <select
                value={(cfg.automacao_id as string) ?? ""}
                onChange={e => updateConfig("automacao_id", e.target.value)}
                style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 6, padding: "6px 8px", fontSize: 12, background: "#FFFFFF", color: "#374151" }}
              >
                <option value="">Qualquer automação</option>
                {outrasAutos.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
        );
      }

      case "mcp_tool":
        return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 16px", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 20 }}>🔌</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111111", marginBottom: 4 }}>MCP Server Tool</div>
              <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.5 }}>
                Este gatilho permite que agentes de IA chamem automações via protocolo MCP.<br />
                <span style={{ color: "#7C3AED", fontWeight: 600 }}>Disponível em breve.</span>
              </div>
            </div>
          </div>
        );

      case "agendado":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Modo</div>
              <select value={(cfg.mode as string) ?? "fixed"} onChange={e => updateConfig("mode", e.target.value)} style={tcpSelectStyle}>
                <option value="fixed">Intervalo fixo</option>
                <option value="cron">Expressão cron</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Intervalo em minutos</div>
              <input type="number" min={15} value={(cfg.interval as number) ?? 60}
                onChange={e => updateConfig("interval", Number(e.target.value))} style={tcpInputStyle} />
            </div>
            {tcpWarning("O intervalo mínimo é de 15 minutos.")}
            <div style={{ background: "#F9FAFB", border: "1px solid #E5E5E5", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#6B7280", display: "flex", alignItems: "center", gap: 6 }}>
                <Calendar size={12} /> Próxima execução
              </div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Não agendado</div>
            </div>
          </div>
        );

      default:
        return <div style={{ fontSize: 12, color: "#6B7280" }}>Sem configurações adicionais.</div>;
    }
  };

  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 8px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <ArrowLeft size={14} color="#6B7280" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", lineHeight: 1.3 }}>{trigger.label}</div>
          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{trigger.description}</div>
        </div>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {renderBody()}
      </div>
      {/* Footer */}
      <div style={{ padding: "10px 16px", borderTop: "1px solid #E5E5E5" }}>
        <button
          onClick={onChangeTrigger}
          style={{ width: "100%", border: "1px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "#6B7280", fontSize: 12, padding: "7px", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.color = "hsl(var(--primary))"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.color = "#6B7280"; }}
        >
          Alterar gatilho
        </button>
      </div>
    </aside>
  );
}

function StartNode({ node, selected, onSelect, onAddTrigger, onTriggerClick, onRemoveTrigger, onPortDragStart, onDragStart, stats, onStatClick }: {
  node: CanvasNode & { trigger?: TriggerConfig | null };
  selected: boolean;
  onSelect: () => void;
  onAddTrigger: () => void;
  onTriggerClick?: () => void;
  onRemoveTrigger?: () => void;
  onPortDragStart: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent) => void;
  stats?: { s: number; a: number; e: number };
  onStatClick?: (status: "success" | "alert" | "error") => void;
}) {
  return (
    <div
      data-node
      onMouseDown={onDragStart}
      style={{
        position: "absolute", left: node.x, top: node.y, width: 280,
        zIndex: 2,
        background: "#FFFFFF",
        border: `1px solid ${selected ? "hsl(var(--primary))" : "#D1D5DB"}`,
        borderRadius: 12, cursor: "grab",
        boxShadow: selected ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 14px 10px", borderBottom: "1px solid #E5E5E5" }}>
        <Play size={14} fill="hsl(var(--primary))" color="hsl(var(--primary))" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Início</span>
      </div>
      <div style={{ padding: "10px 14px 14px" }}>
        {node.trigger ? (
          <div
            style={{ padding: "8px 10px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, marginBottom: 8 }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
              <div
                onClick={(e) => { e.stopPropagation(); onTriggerClick?.(); }}
                style={{ flex: 1, cursor: "pointer" }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "#15803D" }}>{node.trigger.label}</div>
                <div style={{ fontSize: 11, color: "#4ADE80", marginTop: 2 }}>{node.trigger.description}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveTrigger?.(); }}
                title="Remover gatilho"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, color: "#86EFAC", borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.background = "#FEE2E2"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#86EFAC"; e.currentTarget.style.background = "transparent"; }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8, lineHeight: 1.5 }}>
            O gatilho é responsável por acionar a automação. Clique para adicionar um gatilho:
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAddTrigger(); }}
          style={{ width: "100%", border: "1px dashed #CCCCCC", background: "transparent", color: "#6B7280", fontSize: 12, padding: "6px", borderRadius: 6, cursor: "pointer", marginTop: 4 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.color = "hsl(var(--primary))"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#CCCCCC"; e.currentTarget.style.color = "#6B7280"; }}
        >
          {node.trigger ? "Alterar gatilho" : "+ Adicionar gatilho"}
        </button>
        <div style={{ position: "relative", fontSize: 11, color: "#6B7280", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 8 }}>
          <span>Quando o evento ocorrer, então</span>
          <div
            data-port
            data-from-node={node.id}
            title="Arraste para adicionar próximo passo"
            onMouseDown={onPortDragStart}
            style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#378ADD", border: "2px solid #FFFFFF", cursor: "crosshair", boxShadow: "0 0 0 3px rgba(55,138,221,0.25)", zIndex: 3 }}
          />
        </div>
      </div>
      {/* Metrics */}
      <div style={{ display: "flex", justifyContent: "space-around", padding: "5px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
        {([
          { key: "success" as const, count: stats?.s ?? 0, color: "hsl(var(--primary))", label: "Sucessos" },
          { key: "alert"   as const, count: stats?.a ?? 0, color: "hsl(var(--primary))",             label: "Alertas"  },
          { key: "error"   as const, count: stats?.e ?? 0, color: "hsl(var(--primary))",             label: "Erros"    },
        ]).map(({ key, count, color, label }) => (
          <button key={key} data-action onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }}
            style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }}
            onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
            <div style={{ color }}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── NoteNode ─────────────────────────────────────────────────────────────────

function NoteNode({ node, selected, onDragStart, onResizeStart, onDelete, onUpdateText, onUpdateColor }: {
  node: CanvasNode;
  selected: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onUpdateText: (text: string) => void;
  onUpdateColor: (colorIndex: number) => void;
}) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const w = node.width ?? 220;
  const h = node.height ?? 140;
  const c = NOTE_COLORS[node.noteColorIndex ?? 0];

  return (
    <div
      data-node
      onMouseDown={onDragStart}
      style={{
        position: "absolute", left: node.x, top: node.y,
        width: w, height: h,
        background: c.bg,
        border: `1.5px solid ${selected ? c.borderSel : c.border}`,
        borderRadius: 10,
        boxShadow: selected ? `0 4px 16px ${c.borderSel}44` : "0 2px 8px rgba(0,0,0,0.08)",
        display: "flex", flexDirection: "column", cursor: "grab", overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "6px 10px", borderBottom: `0.5px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: c.header }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <StickyNote size={12} color={c.headerText} />
          <span style={{ fontSize: 11, fontWeight: 700, color: c.headerText }}>Anotação</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Color picker button */}
          <div style={{ position: "relative" }}>
            <button
              data-action
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setColorPickerOpen(v => !v); }}
              title="Alterar cor"
              style={{ width: 18, height: 18, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: c.headerText, padding: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = `${c.border}99`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <Palette size={11} />
            </button>
            {colorPickerOpen && (
              <div
                data-action
                onMouseDown={e => e.stopPropagation()}
                style={{ position: "absolute", top: 22, right: 0, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: 6, display: "flex", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 50 }}
              >
                {NOTE_COLORS.map((col, i) => (
                  <button
                    key={i}
                    data-action
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onUpdateColor(i); setColorPickerOpen(false); }}
                    title={`Cor ${i + 1}`}
                    style={{ width: 18, height: 18, borderRadius: "50%", background: col.header, border: `2px solid ${(node.noteColorIndex ?? 0) === i ? col.borderSel : col.border}`, cursor: "pointer", padding: 0, flexShrink: 0 }}
                  />
                ))}
              </div>
            )}
          </div>
          {/* Delete button */}
          <button
            data-action
            onMouseDown={e => e.stopPropagation()}
            onClick={onDelete}
            title="Excluir anotação"
            style={{ width: 18, height: 18, borderRadius: 4, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: c.headerText, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.background = `${c.border}99`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Text area */}
      <textarea
        data-action
        value={node.noteText ?? ""}
        onChange={e => onUpdateText(e.target.value)}
        placeholder="Digite uma anotação..."
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setColorPickerOpen(false); }}
        style={{
          flex: 1, width: "100%", border: "none", background: "transparent",
          fontSize: 12, resize: "none", outline: "none", fontFamily: "inherit",
          color: c.text, padding: "8px 10px", boxSizing: "border-box", lineHeight: 1.5,
        }}
      />

      {/* Resize handle (bottom-right corner) */}
      <div
        data-resize-handle
        onMouseDown={onResizeStart}
        title="Redimensionar"
        style={{ position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 3 }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: "none" }}>
          <path d="M2 10 L10 2 M6 10 L10 6" stroke={c.borderSel} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

// ─── ActionNode ───────────────────────────────────────────────────────────────

const SUB_BLOCK_ICONS: Record<SubBlockType, React.ElementType> = {
  mensagem_texto:  AlignLeft,
  entrada_usuario: HelpCircle,
  atraso_tempo:    Clock,
  mensagem_audio:  Mic,
  arquivo_anexo:   Paperclip,
  arquivo_url:     Link2,
};

const SUB_BLOCK_LABELS: Record<SubBlockType, string> = {
  mensagem_texto:  "Mensagem de texto",
  entrada_usuario: "Entrada do usuário",
  atraso_tempo:    "Atraso de tempo",
  mensagem_audio:  "Mensagem de áudio",
  arquivo_anexo:   "Arquivo anexo",
  arquivo_url:     "Arquivo URL Dinâmica",
};

function ActionNode({ node, selected, onSelect, onPortDragStart, onErrorPortDragStart, onTimeoutPortDragStart, onConditionPortDragStart, onBranchPortDragStart, onDragStart, onDelete, onDuplicate, onAddNote, onOpenAcoesPicker, onOpenCondicoesPicker, onOpenApiPicker, onOpenIaPicker, onRemoveApiRequest, onRemoveIaAction, removeSubBlock, removeActionItem, removeConditionItem, stats, onStatClick, portDragging, portHovered, onAddRandomBranch, onRemoveRandomBranch }: {
  node: CanvasNode;
  selected: boolean;
  onSelect: () => void;
  onPortDragStart: (e: React.MouseEvent) => void;
  onErrorPortDragStart?: (e: React.MouseEvent) => void;
  onTimeoutPortDragStart?: (e: React.MouseEvent) => void;
  onConditionPortDragStart?: (e: React.MouseEvent, condId: string) => void;
  onBranchPortDragStart?: (e: React.MouseEvent, branchId: string) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddNote: () => void;
  onOpenAcoesPicker?: () => void;
  onOpenCondicoesPicker?: () => void;
  onOpenApiPicker?: () => void;
  onOpenIaPicker?: () => void;
  onRemoveApiRequest?: (reqId: string) => void;
  onRemoveIaAction?: (actionId: string) => void;
  removeSubBlock?: (blockId: string) => void;
  removeActionItem?: (itemId: string) => void;
  removeConditionItem?: (itemId: string) => void;
  stats?: { s: number; a: number; e: number; tokAvg?: number };
  onStatClick?: (status: "success" | "alert" | "error") => void;
  portDragging?: "normal" | "error" | null;
  portHovered?: boolean;
  onAddRandomBranch?: () => void;
  onRemoveRandomBranch?: (branchId: string) => void;
}) {
  const at = ACTION_TYPES.find(a => a.id === node.type);
  const Icon = at?.icon ?? Zap;
  const hasUserInput = node.subBlocks?.some(b => b.type === "entrada_usuario");

  // Porta de entrada: sempre visível, muda de cor durante drag ativo
  const inputPort = (
    <div
      data-input-port
      data-node-id={node.id}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "absolute",
        left: -8, top: 32,  // centro em (0, 40) do nó — coincide com endpoint das linhas SVG
        width: 16, height: 16,
        borderRadius: "50%",
        background: portDragging === "error" ? "#FCA5A5" : portDragging === "normal" ? "#93C5FD" : "#FFFFFF",
        border: `2px solid ${portDragging === "error" ? "#EF4444" : portDragging === "normal" ? "#3B82F6" : "#9CA3AF"}`,
        boxShadow: portDragging != null && portHovered
          ? `0 0 0 5px ${portDragging === "error" ? "rgba(239,68,68,0.25)" : "rgba(55,138,221,0.25)"}`
          : "0 1px 3px rgba(0,0,0,0.15)",
        cursor: "crosshair",
        zIndex: 10,
        transition: "background 0.1s, border-color 0.1s, box-shadow 0.1s",
        pointerEvents: "all",
      }}
    />
  );

  const toolbar = (
    <div
      data-action
      onMouseDown={e => e.stopPropagation()}
      style={{ position: "absolute", top: -40, right: 0, display: "flex", gap: 4, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 8, padding: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
    >
      {([
        { Ic: Trash2,     title: "Excluir",    action: onDelete,   hoverBg: "#FEE2E2", hoverColor: "#EF4444" },
        { Ic: Copy,       title: "Duplicar",   action: onDuplicate, hoverBg: "#F3F4F6", hoverColor: "#374151" },
        { Ic: StickyNote, title: "Anotações",  action: onAddNote,  hoverBg: "#FEF9C3", hoverColor: "#854D0E" },
      ] as const).map(({ Ic, title, action, hoverBg, hoverColor }, i) => (
        <button key={i} title={title} onClick={action}
          style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}
          onMouseEnter={e => { e.currentTarget.style.background = hoverBg; (e.currentTarget.style as CSSStyleDeclaration).color = hoverColor; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B7280"; }}
        ><Ic size={13} /></button>
      ))}
    </div>
  );

  if (node.type === "acoes") {
    const hasActions = (node.actionItems ?? []).length > 0;
    return (
      <div
        data-node
        onMouseDown={onDragStart}
        style={{
          position: "absolute", left: node.x, top: node.y, width: 280,
          zIndex: 2,
          background: "#FFFFFF",
          border: `1px solid ${selected ? "#F97316" : "#D1D5DB"}`,
          borderRadius: 12, cursor: "grab",
          boxShadow: selected ? "0 4px 16px rgba(249,115,22,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {inputPort}
        {selected && toolbar}
        {/* Header */}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={16} color="#F97316" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Ação</span>
        </div>
        {/* Body */}
        <div style={{ padding: "10px 14px" }}>
          {hasActions ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {(node.actionItems ?? []).map(item => {
                const catData = ACTION_CATEGORIES.find(c => c.id === item.categoryId);
                const actData = catData?.actions.find(a => a.id === item.actionId);
                const AIcon = actData?.icon ?? Zap;
                return (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "#FFF7ED", border: "0.5px solid #FED7AA", borderRadius: 7, fontSize: 12, color: "#374151" }}>
                    <AIcon size={12} color="#F97316" />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                    {removeActionItem && (
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); removeActionItem(item.id); }}
                        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", color: "#9CA3AF", flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>
              Execute ações no sistema. Clique para adicionar ações:
            </div>
          )}
          <button
            data-action
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onOpenAcoesPicker?.(); }}
            style={{ width: "100%", border: "1px dashed #FED7AA", background: "#FFF7ED", color: "#F97316", fontSize: 12, padding: "7px 0", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.background = "#FFEDD5"; e.currentTarget.style.borderColor = "#F97316"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#FFF7ED"; e.currentTarget.style.borderColor = "#FED7AA"; }}
          >
            <Plus size={13} /> Adicionar ação
          </button>
          {/* Output ports */}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#6B7280" }}>Caso ocorrer erro na execução da ação</span>
              <div
                data-port
                data-from-node={`${node.id}__error`}
                onMouseDown={(e) => { e.stopPropagation(); onErrorPortDragStart?.(e); }}
                title="Arraste para tratar o erro"
                style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#FCA5A5", border: "2px solid #EF4444", cursor: "crosshair", zIndex: 3 }}
              />
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 500 }}>Próximo passo</span>
              <div
                data-port data-from-node={node.id}
                onMouseDown={onPortDragStart}
                style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#93C5FD", border: "2px solid #3B82F6", cursor: "crosshair", zIndex: 3 }}
              />
            </div>
          </div>
        </div>
        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-around", padding: "5px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
          {([
            { key: "success" as const, count: stats?.s ?? 0, color: "hsl(var(--primary))", label: "Sucessos" },
            { key: "alert"   as const, count: stats?.a ?? 0, color: "hsl(var(--primary))", label: "Alertas"  },
            { key: "error"   as const, count: stats?.e ?? 0, color: "hsl(var(--primary))", label: "Erros"    },
          ]).map(({ key, count, color, label }) => (
            <button
              key={key}
              data-action
              onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }}
              style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }}
              onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
              <div style={{ color }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (node.type === "condicoes") {
    const items = node.conditionItems ?? [];
    return (
      <div data-node onMouseDown={onDragStart}
        style={{ position: "absolute", left: node.x, top: node.y, width: 280, zIndex: 2, background: "#FFFFFF", border: `1px solid ${selected ? "#8B5CF6" : "#D1D5DB"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(139,92,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={15} color="#8B5CF6" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Condições</span>
        </div>
        <div style={{ padding: "10px 14px" }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>Faça filtros para seguir caminhos diferentes.<br />Clique para adicionar uma condição:</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map(item => {
                const catData = CONDITION_CATEGORIES.find(c => c.id === item.categoryId);
                const condData = catData?.conditions.find(c => c.id === item.conditionId);
                const CondIcon = condData?.icon ?? Filter;
                return (
                  <div key={item.id}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 5, padding: "5px 8px", background: "#F5F3FF", border: "0.5px solid #DDD6FE", borderRadius: 7, fontSize: 11, color: "#374151" }}>
                      <CondIcon size={10} color="#8B5CF6" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{condData?.label ?? item.label}</div>
                        {condData?.description && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{condData.description}</div>}
                      </div>
                      <button
                        data-action
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); removeConditionItem?.(item.id); }}
                        style={{ width: 16, height: 16, borderRadius: 3, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#C4B5FD", flexShrink: 0, padding: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#C4B5FD")}
                      ><X size={10} /></button>
                    </div>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, marginTop: 3, paddingRight: 8 }}>
                      <span style={{ fontSize: 10, color: "#6B7280" }}>Se esta condição for verdadeira</span>
                      <div data-port data-from-node={`${node.id}_${item.id}`} onMouseDown={e => onConditionPortDragStart?.(e, item.id)}
                        style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: "#A5F3FC", border: "2px solid #06B6D4", cursor: "crosshair", zIndex: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add condition button */}
          <button
            data-action
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onSelect(); onOpenCondicoesPicker?.(); }}
            style={{ width: "100%", marginTop: 8, padding: "7px 0", background: "transparent", border: "1px dashed #DDD6FE", borderRadius: 7, fontSize: 12, color: "#8B5CF6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F5F3FF")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <Plus size={12} /> Adicionar condição
          </button>

          {/* Bottom ports */}
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 10, color: "#6B7280" }}>Todas as condições forem verdadeiras</span>
              <div data-port data-from-node={node.id} onMouseDown={onPortDragStart}
                style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: "#DDD6FE", border: "2px solid #8B5CF6", cursor: "crosshair", zIndex: 3 }} />
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 10, color: "#EF4444" }}>Quando não atender a nenhuma condição</span>
              <div data-port data-from-node={`${node.id}__error`} onMouseDown={e => { e.stopPropagation(); onErrorPortDragStart?.(e); }}
                style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: "#FEE2E2", border: "2px solid #EF4444", cursor: "crosshair", zIndex: 3 }} />
            </div>
          </div>

          {/* Stats */}
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "5px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
          {([
            { key: "success" as const, count: stats?.s ?? 0, color: "hsl(var(--primary))", label: "Sucessos" },
            { key: "alert"   as const, count: stats?.a ?? 0, color: "hsl(var(--primary))",             label: "Alertas"  },
            { key: "error"   as const, count: stats?.e ?? 0, color: "hsl(var(--primary))",             label: "Erros"    },
          ]).map(({ key, count, color, label }) => (
            <button key={key} data-action onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }}
              style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }}
              onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
              <div style={{ color }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (node.type === "espera") {
    const espera = node.espera;
    return (
      <div data-node onMouseDown={onDragStart}
        style={{ position: "absolute", left: node.x, top: node.y, width: 280, zIndex: 2, background: "#FFFFFF", border: `1px solid ${selected ? "#3B82F6" : "#D1D5DB"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={15} color="#3B82F6" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Espera</span>
        </div>
        <div style={{ padding: "10px 14px" }}>
          {espera ? (() => {
            const allItems = ESPERA_CATEGORIES.flatMap(c => c.items);
            const item = allItems.find(i => i.id === espera.type);
            if (!item) return null;
            const ItemIcon = espera.type === "usuario_parou" ? MessageCircle : Clock;
            return (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 8px", background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 7 }}>
                <ItemIcon size={13} color="#3B82F6" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1D4ED8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                </div>
              </div>
            );
          })() : (
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>Espera um determinado tempo para continuar a execução. Adicione um tipo de espera:</div>
          )}
          <div style={{ position: "relative", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
            <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 500 }}>Próximo passo</span>
            <div data-port data-from-node={node.id} onMouseDown={onPortDragStart}
              style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#BFDBFE", border: "2px solid #3B82F6", cursor: "crosshair", zIndex: 3 }} />
          </div>
        </div>
      </div>
    );
  }

  if (node.type === "randomizador") {
    const branches = node.randomBranches ?? DEFAULT_BRANCHES;
    return (
      <div data-node onMouseDown={onDragStart}
        style={{ position: "absolute", left: node.x, top: node.y, width: 280, zIndex: 2, background: "#FFFFFF", border: `1px solid ${selected ? "#F97316" : "#D1D5DB"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(249,115,22,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Shuffle size={15} color="#F97316" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Randomizador</span>
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>Divida o fluxo em ramificações aleatórias. Clique para adicionar um randomizador:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {branches.map((b, i) => (
              <div key={b.id} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", paddingRight: 22, background: "#F9FAFB", border: "1px solid #E5E5E5", borderRadius: 6 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: BRANCH_COLORS[i % BRANCH_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#FFF" }}>{b.label}</span>
                </div>
                <span style={{ flex: 1, fontSize: 11, color: "#374151", fontWeight: 500 }}>{b.label}</span>
                <span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>{b.percentage}%</span>
                {branches.length > 1 && (
                  <button
                    data-action
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onRemoveRandomBranch?.(b.id); }}
                    style={{ width: 16, height: 16, borderRadius: 3, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#D1D5DB", flexShrink: 0, padding: 0, marginRight: 2 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#D1D5DB")}
                  ><X size={10} /></button>
                )}
                <div data-port data-from-node={`${node.id}_${b.id}`} onMouseDown={e => onBranchPortDragStart?.(e, b.id)}
                  style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: BRANCH_COLORS[i % BRANCH_COLORS.length] + "33", border: `2px solid ${BRANCH_COLORS[i % BRANCH_COLORS.length]}`, cursor: "crosshair", zIndex: 3 }} />
              </div>
            ))}
          </div>
          <button
            data-action
            onClick={(e) => { e.stopPropagation(); onAddRandomBranch?.(); onSelect(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8, padding: "7px 0", border: "1px dashed #E5E5E5", borderRadius: 7, background: "transparent", color: "#6B7280", fontSize: 11, fontWeight: 500, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.borderColor = "#9CA3AF"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#E5E5E5"; }}
          >
            <Plus size={11} /> Adicionar ramificação
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "5px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
          {([
            { key: "success" as const, count: stats?.s ?? 0, color: "hsl(var(--primary))", label: "Sucessos" },
            { key: "alert"   as const, count: stats?.a ?? 0, color: "hsl(var(--primary))", label: "Alertas"  },
            { key: "error"   as const, count: stats?.e ?? 0, color: "hsl(var(--primary))", label: "Erros"    },
          ]).map(({ key, count, color, label }) => (
            <button key={key} data-action onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }}
              style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }}
              onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
              <div style={{ color }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (node.type === "ia") {
    const PURPLE = "#8B5CF6";
    const acts = node.iaActions ?? [];
    return (
      <div data-node onMouseDown={onDragStart}
        style={{ position: "absolute", left: node.x, top: node.y, width: 280, zIndex: 2, background: "#FFFFFF", border: `${selected ? 2 : 1}px solid ${selected ? PURPLE : "#E5E5E5"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(139,92,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Bot size={15} color={PURPLE} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>IA</span>
        </div>
        <div style={{ padding: "10px 14px" }}>
          {acts.length === 0 && (
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>Utilize ações com inteligência artificial. Clique para adicionar uma ação com IA:</div>
          )}
          {acts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {acts.map(a => {
                const AIcon = IA_ACTION_TYPES.find(t => t.id === a.type)?.icon ?? Bot;
                return (
                  <div key={a.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F5F3FF", border: "0.5px solid #DDD6FE", borderRadius: 8 }}>
                      <AIcon size={13} color={PURPLE} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{IA_ACTION_LABEL[a.type]}</div>
                        <div style={{ fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{IA_ACTION_TYPES.find(t => t.id === a.type)?.desc}</div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#FFF", background: PURPLE, borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>{a.outputVar}</span>
                      <button
                        data-action
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); onRemoveIaAction?.(a.id); }}
                        title="Remover ação"
                        style={{ width: 16, height: 16, borderRadius: 3, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#C4B5FD", flexShrink: 0, padding: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#C4B5FD")}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                    {a.type === "intencao" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 5 }}>
                        {(a.intencoes ?? []).map((it, i) => (
                          <div key={it.id} style={{ position: "relative", minHeight: 24, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "3px 10px 3px 8px", background: "#ECFEFF", border: "0.5px solid #A5F3FC", borderRadius: 7 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: it.nome.trim() ? "#0E7490" : "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 }}>{it.nome.trim() || `Intenção ${i + 1}`}</span>
                            <div data-port data-from-node={`${node.id}_${it.id}`} onMouseDown={e => onConditionPortDragStart?.(e, it.id)} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%", background: "#A5F3FC", border: "2px solid #06B6D4", cursor: "crosshair", zIndex: 3 }} />
                          </div>
                        ))}
                        <div style={{ position: "relative", minHeight: 24, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "3px 10px 3px 8px", background: "#F0FDF4", border: "0.5px solid #BBF7D0", borderRadius: 7 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#16A34A" }}>Nenhuma intenção encontrada</span>
                          <div data-port data-from-node={`${node.id}_${a.id}-none`} onMouseDown={e => onConditionPortDragStart?.(e, `${a.id}-none`)} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%", background: "#BBF7D0", border: "2px solid #16A34A", cursor: "crosshair", zIndex: 3 }} />
                        </div>
                      </div>
                    )}
                    {a.type === "sentimento" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 5 }}>
                        {(a.sentimentos ?? []).map((s, i) => (
                          <div key={s.id} style={{ position: "relative", minHeight: 24, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, padding: "3px 10px 3px 8px", background: "#ECFEFF", border: "0.5px solid #A5F3FC", borderRadius: 7 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: s.nome.trim() ? "#0E7490" : "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 }}>{s.nome.trim() || `Sentimento ${i + 1}`}</span>
                            <div data-port data-from-node={`${node.id}_${s.id}`} onMouseDown={e => onConditionPortDragStart?.(e, s.id)} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 11, height: 11, borderRadius: "50%", background: "#A5F3FC", border: "2px solid #06B6D4", cursor: "crosshair", zIndex: 3 }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {a.type === "extrator_params" && (a.parametros ?? []).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4, paddingLeft: 2 }}>
                        {(a.parametros ?? []).map(p => (
                          <span key={p.id} style={{ fontSize: 9, fontWeight: 600, color: "#7C3AED", background: "#EDE9FE", border: "0.5px solid #DDD6FE", borderRadius: 4, padding: "1px 6px" }}>{p.nome || "param"}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button data-action onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onOpenIaPicker?.(); }}
            style={{ width: "100%", border: "1px dashed #DDD6FE", background: "#F5F3FF", color: PURPLE, fontSize: 12, padding: "7px 0", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            onMouseEnter={e => (e.currentTarget.style.background = "#EDE9FE")} onMouseLeave={e => (e.currentTarget.style.background = "#F5F3FF")}>
            <Plus size={13} /> Adicionar ação com IA
          </button>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#EF4444" }}>Caso ocorra erro na execução da IA</span>
              <div data-port data-from-node={`${node.id}__error`} onMouseDown={(e) => { e.stopPropagation(); onErrorPortDragStart?.(e); }} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#FCA5A5", border: "2px solid #EF4444", cursor: "crosshair", zIndex: 3 }} />
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: PURPLE, fontWeight: 500 }}>Próximo passo</span>
              <div data-port data-from-node={node.id} onMouseDown={onPortDragStart} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#DDD6FE", border: `2px solid ${PURPLE}`, cursor: "crosshair", zIndex: 3 }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
          <div style={{ textAlign: "center", padding: "4px 8px", flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{stats?.tokAvg ? Math.round(stats.tokAvg).toLocaleString("pt-BR") : "0"}</div>
            <div style={{ color: PURPLE }}>Média Tokens</div>
          </div>
          {([{ key: "success" as const, count: stats?.s ?? 0, color: PURPLE, label: "Sucessos" }, { key: "alert" as const, count: stats?.a ?? 0, color: "#F59E0B", label: "Alertas" }, { key: "error" as const, count: stats?.e ?? 0, color: "#EF4444", label: "Erros" }]).map(({ key, count, color, label }) => (
            <button key={key} data-action onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }} style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }} onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
              <div style={{ color }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (node.type === "api") {
    const apiRequests = node.apiConfig?.requests ?? [];
    return (
      <div data-node onMouseDown={onDragStart} onClick={onSelect}
        style={{ position: "absolute", left: node.x, top: node.y, width: 280, zIndex: 2, background: "#FFFFFF", border: `1px solid ${selected ? "#3B82F6" : "#D1D5DB"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Braces size={15} color="#3B82F6" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>API</span>
        </div>
        <div style={{ padding: "10px 14px" }}>
          {apiRequests.length === 0 && (
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>Faça chamadas a APIs externas para integrar com outros sistemas ou serviços. Clique para adicionar uma chamada de API:</div>
          )}
          {apiRequests.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {apiRequests.map(req => (
                <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 7, fontSize: 11 }}>
                  {req.type === "json" ? <Braces size={12} color="#3B82F6" /> : <FileDown size={12} color="#3B82F6" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{req.type === "json" ? "Requisição HTTP via JSON" : "Requisição de arquivo HTTP"}</div>
                    <div style={{ color: "#3B82F6", fontSize: 10 }}>{req.method} {req.url ? `· ${req.url.substring(0, 20)}${req.url.length > 20 ? "…" : ""}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#3B82F6", background: "#DBEAFE", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>{req.name}</span>
                  <button
                    data-action
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); onRemoveApiRequest?.(req.id); }}
                    title="Remover"
                    style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 3, padding: 0, flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#EF4444"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}
                  ><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
          <button
            data-action onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onSelect(); onOpenApiPicker?.(); }}
            style={{ width: "100%", border: "1px dashed #BFDBFE", background: "#EFF6FF", color: "#3B82F6", fontSize: 12, padding: "7px 0", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.background = "#DBEAFE"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#EFF6FF"; }}
          ><Plus size={13} /> Adicionar API</button>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#6B7280" }}>Caso ocorrer erro no envio da mensagem</span>
              <div data-port data-from-node={`${node.id}__error`} onMouseDown={(e) => { e.stopPropagation(); onErrorPortDragStart?.(e); }} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#FCA5A5", border: "2px solid #EF4444", cursor: "crosshair", zIndex: 3 }} />
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 500 }}>Próximo passo</span>
              <div data-port data-from-node={node.id} onMouseDown={onPortDragStart} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#93C5FD", border: "2px solid #3B82F6", cursor: "crosshair", zIndex: 3 }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "5px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
          {([{ key: "success" as const, count: stats?.s ?? 0, color: "hsl(var(--primary))", label: "Sucessos" }, { key: "alert" as const, count: stats?.a ?? 0, color: "hsl(var(--primary))", label: "Alertas" }, { key: "error" as const, count: stats?.e ?? 0, color: "hsl(var(--primary))", label: "Erros" }]).map(({ key, count, color, label }) => (
            <button key={key} data-action onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }} style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }} onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
              <div style={{ color }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (node.type === "campos") {
    const ops = node.fieldOps ?? [];
    return (
      <div data-node onMouseDown={onDragStart} onClick={onSelect}
        style={{ position: "absolute", left: node.x, top: node.y, width: 280, zIndex: 2, background: "#FFFFFF", border: `1px solid ${selected ? "#22C55E" : "#D1D5DB"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(34,197,94,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Sliders size={15} color="#22C55E" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Operações de campos</span>
        </div>
        <div style={{ padding: "10px 14px" }}>
          {ops.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>
              Realize operações com campos do sistema, campos adicionais ou fontes de dados. Clique para adicionar uma operação de campo:
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {ops.map(op => {
                const dsColor = op.type !== "mapeamento" ? (op as FieldOpLoopArray | FieldOpAnaliseTel | FieldOpFormatacaoData).datasourceColor : undefined;
                const dsName  = op.type !== "mapeamento" ? (op as FieldOpLoopArray | FieldOpAnaliseTel | FieldOpFormatacaoData).datasourceName : undefined;
                const OpIcon  = op.type === "loop_array" ? Brackets : op.type === "analise_telefone" ? Phone : op.type === "formatacao_data" ? Calendar : ArrowLeftRight;
                const opTitle = op.type === "loop_array" ? "Loop de array" : op.type === "analise_telefone" ? "Análise de telefone" : op.type === "formatacao_data" ? "Formatação de data" : (op as FieldOpMapeamento).fieldLabel || "Campo não selecionado";
                const opSub   = op.type === "mapeamento" && (op as FieldOpMapeamento).value ? `= ${(op as FieldOpMapeamento).value}` : null;
                return (
                <div key={op.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 7, fontSize: 11 }}>
                  <OpIcon size={11} color="#22C55E" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opTitle}</div>
                    {opSub && <div style={{ color: "#22C55E", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opSub}</div>}
                  </div>
                  {dsName && <span style={{ fontSize: 9, fontWeight: 700, background: dsColor ?? "#6366F1", color: "#fff", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{dsName}</span>}
                </div>
              );})}

            </div>
          )}
          <button
            data-action onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onSelect(); }}
            style={{ width: "100%", border: "1px dashed #86EFAC", background: "#F0FDF4", color: "#22C55E", fontSize: 12, padding: "7px 0", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.background = "#DCFCE7"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#F0FDF4"; }}
          ><Plus size={13} /> Adicionar mapeamento de campo</button>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#6B7280" }}>Caso ocorrer erro</span>
              <div data-port data-from-node={`${node.id}__error`} onMouseDown={(e) => { e.stopPropagation(); onErrorPortDragStart?.(e); }} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#FCA5A5", border: "2px solid #EF4444", cursor: "crosshair", zIndex: 3 }} />
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 500 }}>Próximo passo</span>
              <div data-port data-from-node={node.id} onMouseDown={onPortDragStart} style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#93C5FD", border: "2px solid #3B82F6", cursor: "crosshair", zIndex: 3 }} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "5px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
          {([{ key: "success" as const, count: stats?.s ?? 0, color: "hsl(var(--primary))", label: "Sucessos" }, { key: "alert" as const, count: stats?.a ?? 0, color: "hsl(var(--primary))", label: "Alertas" }, { key: "error" as const, count: stats?.e ?? 0, color: "hsl(var(--primary))", label: "Erros" }]).map(({ key, count, color, label }) => (
            <button key={key} data-action onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }} style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }} onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
              <div style={{ color }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (node.type !== "mensagem") {
    return (
      <div
        data-node
        onMouseDown={onDragStart}
        style={{
          position: "absolute", left: node.x, top: node.y, width: 280,
          zIndex: 2,
          background: "#FFFFFF",
          border: `1px solid ${selected ? "hsl(var(--primary))" : "#D1D5DB"}`,
          borderRadius: 12, padding: 14, cursor: "grab",
          boxShadow: selected ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {inputPort}
        {selected && toolbar}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: at ? `${at.color}18` : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={15} color={at?.color ?? "#6B7280"} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{node.label}</span>
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>Clique para configurar</div>
        <div
          data-port data-from-node={node.id}
          title="Arraste para adicionar próximo passo"
          onMouseDown={onPortDragStart}
          style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, borderRadius: "50%", background: "#378ADD", border: "2.5px solid #FFF", cursor: "crosshair", boxShadow: "0 0 0 3px rgba(55,138,221,0.25)", zIndex: 5 }}
        />
      </div>
    );
  }

  // ── Mensagem node ────────────────────────────────────────────────────────
  return (
    <div
      data-node
      onMouseDown={onDragStart}
      style={{
        position: "absolute", left: node.x, top: node.y, width: 280,
        zIndex: 2,
        background: "#FFFFFF",
        border: `1px solid ${selected ? "#3B82F6" : "#D1D5DB"}`,
        borderRadius: 12, cursor: "grab",
        boxShadow: selected ? "0 4px 16px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {inputPort}
      {/* Toolbar above node (shown when selected) */}
      {selected && toolbar}

      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle size={16} color="#3B82F6" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Mensagem</span>
      </div>

      {/* Body */}
      <div style={{ padding: "10px 14px" }}>
        {(!node.subBlocks || node.subBlocks.length === 0) ? (
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>
            Envie e receba mensagens. Clique para adicionar uma mensagem:
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {node.subBlocks.map(b => {
              const SBIcon = SUB_BLOCK_ICONS[b.type];
              return (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#F9FAFB", border: "1px solid #E5E5E5", borderRadius: 7, fontSize: 12, color: "#374151" }}>
                  <SBIcon size={12} color="#6B7280" />
                  <span style={{ flex: 1 }}>{b.type === "atraso_tempo" ? `Atraso de ${b.delaySeconds ?? 0} segundos` : SUB_BLOCK_LABELS[b.type]}</span>
                  {removeSubBlock && (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); removeSubBlock(b.id); }}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", color: "#9CA3AF", flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Output ports */}
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {hasUserInput && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
              <span style={{ fontSize: 11, color: "#6B7280" }}>Caso o contato não responda</span>
              <div
                data-port
                data-from-node={`${node.id}__timeout`}
                onMouseDown={(e) => { e.stopPropagation(); onTimeoutPortDragStart?.(e); }}
                title="Arraste para o que fazer se o contato não responder no prazo"
                style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#FCA5A5", border: "2px solid #EF4444", cursor: "crosshair", zIndex: 3 }}
              />
            </div>
          )}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>Caso ocorrer erro no envio da mensagem</span>
            <div
              data-port
              data-from-node={`${node.id}__error`}
              onMouseDown={(e) => { e.stopPropagation(); onErrorPortDragStart?.(e); }}
              title="Arraste para tratar o erro"
              style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#FCA5A5", border: "2px solid #EF4444", cursor: "crosshair", zIndex: 3 }}
            />
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingRight: 8 }}>
            <span style={{ fontSize: 11, color: "#3B82F6", fontWeight: 500 }}>Próximo passo</span>
            <div
              data-port data-from-node={node.id}
              onMouseDown={onPortDragStart}
              style={{ position: "absolute", right: -21, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#93C5FD", border: "2px solid #3B82F6", cursor: "crosshair", zIndex: 3 }}
            />
          </div>
        </div>
      </div>

      {/* Footer metrics */}
      <div style={{ display: "flex", justifyContent: "space-around", padding: "5px 14px", borderTop: "1px solid #E5E5E5", fontSize: 11 }}>
        {([
          { key: "success" as const, count: stats?.s ?? 0, color: "hsl(var(--primary))", label: "Sucessos" },
          { key: "alert"   as const, count: stats?.a ?? 0, color: "hsl(var(--primary))", label: "Alertas"  },
          { key: "error"   as const, count: stats?.e ?? 0, color: "hsl(var(--primary))", label: "Erros"    },
        ]).map(({ key, count, color, label }) => (
          <button
            key={key}
            data-action
            onClick={(e) => { e.stopPropagation(); if (count > 0) onStatClick?.(key); }}
            style={{ background: "none", border: "none", cursor: count > 0 ? "pointer" : "default", textAlign: "center", padding: "4px 8px", borderRadius: 6, flex: 1 }}
            onMouseEnter={e => { if (count > 0) e.currentTarget.style.background = "#F3F4F6"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{count}</div>
            <div style={{ color }}>{label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── CondicoesPanel ──────────────────────────────────────────────────────────

function CondicoesPanel({ node, onClose, onDelete, onDuplicate, removeConditionItem, updateConditionItem, onOpenPicker, pipelines, crmTags, teamMembers, products, customFieldGroups }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  removeConditionItem: (itemId: string) => void;
  updateConditionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
  onOpenPicker: () => void;
  pipelines: Pipeline[];
  crmTags: CrmTagType[];
  teamMembers: string[];
  products: ProductType[];
  customFieldGroups: CustomFieldGroup[];
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = (node.conditionItems ?? []).find(c => c.id === selectedItemId) ?? null;

  if (selectedItemId && selectedItem) {
    const catData = CONDITION_CATEGORIES.find(c => c.id === selectedItem.categoryId);
    const condData = catData?.conditions.find(c => c.id === selectedItem.conditionId);
    return (
      <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
          <button
            onClick={() => setSelectedItemId(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#111111", padding: 0, width: "100%", textAlign: "left" }}
          >
            <ArrowLeft size={15} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{condData?.label ?? selectedItem.label}</span>
            {condData?.warning && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FDE68A", borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>Atenção</span>
            )}
          </button>
          {condData?.description && (
            <p style={{ fontSize: 12, color: "#6B7280", margin: "6px 0 0", paddingLeft: 21 }}>{condData.description}</p>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          <CondicoesConfigContent
            item={selectedItem}
            updateItem={(config) => updateConditionItem(selectedItem.id, config)}
            pipelines={pipelines}
            crmTags={crmTags}
            teamMembers={teamMembers}
            products={products}
            customFieldGroups={customFieldGroups}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} /> Condições
          </button>
          <div style={{ display: "flex", gap: 2 }}>
            {([{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }] as const).map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><Icon size={13} /></button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Defina condições para ramificar o fluxo</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {(node.conditionItems ?? []).length === 0 ? (
          <div style={{ paddingTop: 8, fontSize: 12, color: "#9CA3AF" }}>Nenhuma condição adicionada ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(node.conditionItems ?? []).map(item => {
              const catData = CONDITION_CATEGORIES.find(c => c.id === item.categoryId);
              const condData = catData?.conditions.find(c => c.id === item.conditionId);
              const Icon = condData?.icon ?? Filter;
              return (
                <div key={item.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F5F3FF", border: "0.5px solid #DDD6FE", borderRadius: 8, cursor: "pointer" }}
                  onClick={() => setSelectedItemId(item.id)}
                  onMouseEnter={e => (e.currentTarget.style.background = "#EDE9FE")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F5F3FF")}
                >
                  <Icon size={13} color="#8B5CF6" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{condData?.label ?? item.label}</div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{condData?.description}</div>
                  </div>
                  <ChevronRight size={12} color="#9CA3AF" style={{ flexShrink: 0 }} />
                  <button
                    onClick={e => { e.stopPropagation(); removeConditionItem(item.id); }}
                    style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                  ><X size={11} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ borderTop: "1px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
        <button onClick={onOpenPicker}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "1px dashed #C7D2FE", borderRadius: 8, background: "#F3F4FF", color: "#6366F1", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#E0E7FF"; e.currentTarget.style.borderColor = "#6366F1"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F3F4FF"; e.currentTarget.style.borderColor = "#C7D2FE"; }}
        >
          <Plus size={13} /> Adicionar condição
        </button>
      </div>
    </aside>
  );
}

// ─── CondicoesConfigContent ──────────────────────────────────────────────────

function CondicoesConfigContent({ item, updateItem, pipelines, crmTags, teamMembers, products, customFieldGroups }: {
  item: ConditionItem;
  updateItem: (config: Record<string, string | boolean | number>) => void;
  pipelines: Pipeline[];
  crmTags: CrmTagType[];
  teamMembers: string[];
  products: ProductType[];
  customFieldGroups: CustomFieldGroup[];
}) {
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateItem({ [key]: val });

  const lbl = (text: string) => (
    <label style={{ fontSize: 11, fontWeight: 600, color: "#8B5CF6", display: "block", marginBottom: 4, lineHeight: 1.4 }}>{text}</label>
  );
  const grp = (children: React.ReactNode) => <div style={{ marginBottom: 16 }}>{children}</div>;

  const textInp = (placeholder: string, key: string) => (
    <CamposValueInput
      value={String(cfg[key] ?? "")}
      onChange={v => set(key, v)}
      placeholder={placeholder || undefined}
    />
  );

  const numInp = (placeholder: string, key: string, min?: number) => (
    <input type="number" value={String(cfg[key] ?? "")} onChange={e => set(key, Number(e.target.value))} placeholder={placeholder} min={min}
      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" as const }} />
  );

  const selInp = (key: string, opts: { value: string; label: string }[], placeholder = "Selecionar") => (
    <select value={String(cfg[key] ?? "")} onChange={e => set(key, e.target.value)}
      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", background: "#FFF", boxSizing: "border-box" as const }}>
      <option value="">{placeholder}</option>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const noConfig = <div style={{ fontSize: 12, color: "#9CA3AF", padding: "8px 0" }}>Esta condição não requer configuração.</div>;

  const warningBox = (text: string) => (
    <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 12, color: "#92400E", marginBottom: 16, display: "flex", gap: 8, alignItems: "flex-start" }}>
      <Info size={14} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ lineHeight: 1.5 }}>{text}</span>
    </div>
  );

  const attendantSel = (key: string, hint: string) => (
    <>{lbl(hint)}{selInp(key, teamMembers.map(m => ({ value: m, label: m })))}</>
  );

  const customFields = customFieldGroups.flatMap(g => g.items.map(f => ({ value: f.id, label: `${g.name} — ${f.label}` })));
  const campoAdicionalBlock = (entity: string) => (
    <>
      {warningBox(`Este bloco procura o primeiro ${entity} encontrado com esse valor de campo adicional — se houver mais de um com o mesmo valor, somente o primeiro será retornado. Para verificar o campo do ${entity} atual, utilize as condições de campo.`)}
      {grp(<>{lbl(`Campo adicional para procurar o ${entity}`)}{selInp("campo_id", customFields)}</>)}
      {grp(<>{lbl("Tipo de comparação")}{selInp("tipo_comparacao", [{ value: "igual", label: "Igual" }, { value: "contem", label: "Contém" }])}</>)}
      {grp(<>{lbl(`Valor para comparar no campo adicional`)}{textInp("", "valor")}</>)}
    </>
  );

  const { conditionId: id, categoryId: catId } = item;

  // ── Negócios ──────────────────────────────────────────────────────────────
  if (catId === "negocios") {
    if (id === "pos_atend") return <>{grp(<>{attendantSel("atendente", "Selecione os atendentes que deseja filtrar a atribuição ao negócio. Deixe em branco para considerar qualquer um.")}</>)}</>;
    if (id === "sem_atend" || id === "ganho" || id === "perdido" || id === "pendente") return noConfig;
    if (id === "neg_pipeline") return <>{grp(<>{lbl("Informe em qual pipeline que será procurado pelo negócio do lead")}{selInp("pipeline_id", pipelines.map(p => ({ value: p.id, label: p.name })))}</>)}</>;
    if (id === "neg_etapa") {
      const stages = pipelines.flatMap(p => (p.columns ?? []).map(c => ({ value: c.id, label: `${p.name} → ${c.title}` })));
      return <>{grp(<>{lbl("Informe em qual etapa que será procurado pelo negócio do lead")}{selInp("etapa_id", stages)}</>)}</>;
    }
    if (id === "pos_produto") return (
      <>
        {grp(<>{lbl("Selecione o produto que será verificado no negócio. Deixe em branco para utilizar a busca pelo SKU")}{selInp("produto_id", products.map(p => ({ value: p.id, label: p.name })))}</>)}
        {grp(<>{lbl("Informe o SKU para verificar se o produto existe no negócio")}{textInp("", "sku")}</>)}
      </>
    );
    if (id === "com_id_externo") return <>{grp(<>{lbl("ID externo para procurar o negócio")}{textInp("", "id_externo")}</>)}</>;
    if (id === "campo_adicional") return <>{campoAdicionalBlock("negócio")}</>;
  }

  // ── Leads ─────────────────────────────────────────────────────────────────
  if (catId === "leads") {
    if (id === "existente") return noConfig;
    if (id === "neg_pipeline") return <>{grp(<>{lbl("Informe em qual pipeline que será procurado pelo negócio do lead")}{selInp("pipeline_id", pipelines.map(p => ({ value: p.id, label: p.name })))}</>)}</>;
    if (id === "neg_etapa") {
      const stages = pipelines.flatMap(p => (p.columns ?? []).map(c => ({ value: c.id, label: `${p.name} → ${c.title}` })));
      return <>{grp(<>{lbl("Informe em qual etapa que será procurado pelo negócio do lead")}{selInp("etapa_id", stages)}</>)}</>;
    }
    if (id === "com_email") return <>{grp(<>{lbl("Email")}{textInp("", "email")}</>)}</>;
    if (id === "com_nome") return <>{grp(<>{lbl("Nome")}{textInp("", "nome")}</>)}</>;
    if (id === "com_telefone") return <>{grp(<>{lbl("Telefone")}{textInp("", "telefone")}</>)}</>;
    if (id === "com_cpf") return <>{grp(<>{lbl("CPF")}{textInp("", "cpf")}</>)}</>;
    if (id === "pos_tag") return (
      <>
        {grp(<>
          {lbl("Selecione as tags para verificar se existem no lead")}
          {selInp("tag_ids", crmTags.map(t => ({ value: t.id, label: t.name })), "Selecione as tags")}
        </>)}
        <p style={{ fontSize: 11, color: "#6B7280", marginTop: -8, lineHeight: 1.4 }}>Será verdadeiro se o lead possuir pelo menos uma das tags informadas</p>
      </>
    );
    if (id === "pos_atend") return <>{grp(<>{attendantSel("atendente", "Selecione os atendentes que deseja verificar se são os atendentes responsáveis do lead. Deixe em branco para considerar qualquer um.")}</>)}</>;
    if (id === "campo_adicional") return <>{campoAdicionalBlock("lead")}</>;
    if (id === "pos_campo") return <>{grp(<>{lbl("Campo")}{textInp("Nome do campo", "campo")}</>)}</>;
  }

  // ── Campos ────────────────────────────────────────────────────────────────
  if (catId === "campos") {
    const paramOpts = [
      { value: "lead.id",         label: "ID do lead" },
      { value: "lead.name",       label: "Nome do lead" },
      { value: "lead.email",      label: "Email do lead" },
      { value: "lead.phone",      label: "Telefone do lead" },
      { value: "lead.cpf",        label: "CPF do lead" },
      { value: "lead.source",     label: "Origem do lead" },
      { value: "negocio.id",      label: "ID do negócio" },
      { value: "negocio.name",    label: "Nome do negócio" },
      { value: "negocio.value",   label: "Valor do negócio" },
      { value: "negocio.status",  label: "Status do negócio" },
      ...customFieldGroups.flatMap(g => g.items.map(f => ({ value: `custom.${f.id}`, label: `${g.name}: ${f.label}` }))),
    ];
    const paramField = grp(<>{lbl("Qual parâmetro será utilizado na condicional?")}{selInp("parametro", paramOpts)}</>);

    if (id === "campo_igual") return <>{paramField}{grp(<>{lbl("O valor é igual a")}{textInp("", "valor")}</>)}</>;
    if (id === "campo_contem") return <>{paramField}{grp(<>{lbl("O valor contém")}{textInp("", "valor")}</>)}</>;
    if (id === "campo_pos_valor") return <>{paramField}</>;
    if (id === "campo_entre") return (
      <>
        {paramField}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "end", marginBottom: 8 }}>
          <div>{lbl("está entre")}{numInp("0", "valor_min")}</div>
          <span style={{ fontSize: 12, color: "#6B7280", paddingBottom: 9 }}>e</span>
          <div>{lbl(" ")}{numInp("9999", "valor_max")}</div>
        </div>
        <p style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>valores iguais são considerados como verdadeiros</p>
      </>
    );
  }

  // ── Tempo ─────────────────────────────────────────────────────────────────
  if (catId === "tempo" && id === "intervalo_tempo") {
    const DAYS_CFG = [
      { id: "dom", short: "D" }, { id: "seg", short: "S" }, { id: "ter", short: "T" },
      { id: "qua", short: "Q" }, { id: "qui", short: "Q" }, { id: "sex", short: "S" }, { id: "sab", short: "S" },
    ];
    const selDays = String(cfg["dias"] ?? "seg,ter,qua,qui,sex").split(",").filter(Boolean);
    const toggleDay = (d: string) => {
      const next = selDays.includes(d) ? selDays.filter(x => x !== d) : [...selDays, d];
      set("dias", next.join(","));
    };
    const tzOpts = ["America/Sao_Paulo","America/Manaus","America/Fortaleza","America/Recife","America/Belem","America/Porto_Velho","America/Noronha","UTC"]
      .map(tz => ({ value: tz, label: `${tz.replace("America/", "").replace("_", " ")} (${tz === "UTC" ? "UTC" : tz === "America/Sao_Paulo" ? "BRT" : tz === "America/Manaus" ? "AMT" : tz === "America/Noronha" ? "FNT" : "BR"})` }));
    return (
      <>
        {grp(<>
          {lbl("Dias da semana a serem considerados")}
          <div style={{ display: "flex", gap: 4 }}>
            {DAYS_CFG.map(d => {
              const sel = selDays.includes(d.id);
              return (
                <button key={d.id} onClick={() => toggleDay(d.id)}
                  style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${sel ? "#3B82F6" : "#E5E7EB"}`, background: sel ? "#3B82F6" : "#FFF", color: sel ? "#FFF" : "#6B7280", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  {d.short}
                </button>
              );
            })}
          </div>
        </>)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "end", marginBottom: 16 }}>
          <div>{lbl("Intervalo de horas entre")}<input type="time" value={String(cfg["hora_inicio"] ?? "00:00")} onChange={e => set("hora_inicio", e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" as const }} /></div>
          <span style={{ fontSize: 12, color: "#6B7280", paddingBottom: 9 }}>e</span>
          <div>{lbl(" ")}<input type="time" value={String(cfg["hora_fim"] ?? "23:59")} onChange={e => set("hora_fim", e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" as const }} /></div>
        </div>
        {grp(<>{lbl("Fuso horário")}{selInp("timezone", tzOpts, "America/Sao_Paulo (BRT)")}</>)}
      </>
    );
  }

  // ── Conversas ─────────────────────────────────────────────────────────────
  if (catId === "conversas") {
    if (id === "conv_finalizada" || id === "auto_chat") return noConfig;
    if (id === "conv_atend") return <>{grp(<>{attendantSel("atendente", "Selecione os atendentes que deseja verificar se são os atendentes responsáveis da conversa. Deixe em branco para considerar qualquer um.")}</>)}</>;
    if (id === "conv_departamento") return <>{grp(<>{lbl("Selecione os departamentos que deseja verificar se estão atribuídos à conversa. Deixe em branco para considerar qualquer um.")}{textInp("Selecionar", "departamento")}</>)}</>;
    if (id === "janela_aberta") return <>{grp(<>{lbl("Janela de tempo em horas (padrão: 24)")}{numInp("24", "janela_horas", 1)}</>)}</>;
  }

  // ── Instagram ─────────────────────────────────────────────────────────────
  if (catId === "instagram") return noConfig;

  return noConfig;
}

// ─── EsperaPanel ──────────────────────────────────────────────────────────────

const ESPERA_CATEGORIES = [
  {
    id: "tempo",
    label: "Tempo",
    description: "Adicione espera com base em intervalos de horas",
    icon: Clock,
    items: [
      { id: "intervalo_semana", label: "Espera de um intervalo de hora nos dias da semana", description: "Espera um intervalo de hora nos dias da semana selecionados para continuar a execução." },
      { id: "minutos",          label: "Espera de alguns minutos",                          description: "Espera uma quantidade informada de minutos para continuar a execução" },
      { id: "dias",             label: "Espera de alguns dias",                             description: "Espera uma quantidade informada de dias para continuar a execução" },
      { id: "horas",            label: "Espera de algumas horas",                           description: "Espera uma quantidade informada de horas para continuar a execução" },
      { id: "segundos",         label: "Espera de alguns segundos",                         description: "Espera uma quantidade informada de segundos para continuar a execução" },
      { id: "dia_horario",      label: "Espera o dia/horário",                              description: "Espera um dia e horário para continuar a execução" },
    ],
  },
  {
    id: "mensagens",
    label: "Mensagens",
    description: "Adicione espera com base em mensagens",
    icon: MessageCircle,
    items: [
      { id: "usuario_parou", label: "Usuário parou de responder", description: "Quando o usuário parar de responder" },
    ],
  },
];

const TIMEZONES = [
  "America/Sao_Paulo (BRT)",
  "America/Manaus (AMT)",
  "America/Belem (BRT)",
  "America/Fortaleza (BRT)",
  "America/Recife (BRT)",
  "America/Maceio (BRT)",
  "America/Bahia (BRT)",
  "America/Cuiaba (AMT)",
  "America/Porto_Velho (AMT)",
  "America/Boa_Vista (AMT)",
  "America/Rio_Branco (ACT)",
  "America/Noronha (FNT)",
];

const DAYS_OF_WEEK = [
  { id: "dom", label: "Dom" }, { id: "seg", label: "Seg" }, { id: "ter", label: "Ter" },
  { id: "qua", label: "Qua" }, { id: "qui", label: "Qui" }, { id: "sex", label: "Sex" },
  { id: "sab", label: "Sab" },
];

// ─── Editores das ações de IA com ramificação/extração (Fase 2/3) ──────────────

const IA_ADD_BTN: React.CSSProperties = { width: "100%", border: "1px dashed #DDD6FE", background: "#F5F3FF", color: "#8B5CF6", fontSize: 12, fontWeight: 600, padding: "7px 0", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 };
const IA_ITEM_BOX: React.CSSProperties = { border: "1px solid #E5E5E5", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8, background: "#FFF" };

function IaItemHeader({ index, color, onRemove }: { index: number; color: string; onRemove: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>#{index + 1}</span>
      <button onClick={onRemove} title="Remover" style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center" }}
        onMouseEnter={e => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#EF4444"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// Textarea com botão de VarPicker (insere {{variável}} na posição do cursor).
function IaVarTextarea({ value, onChange, rows = 5, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const [varOpen, setVarOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const insertVar = (v: string) => {
    const ta = taRef.current;
    if (!ta) { onChange((value ?? "") + v); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = (value ?? "").substring(0, s) + v + (value ?? "").substring(e);
    onChange(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); }, 0);
  };
  return (
    <div style={{ position: "relative" }}>
      <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        style={{ width: "100%", padding: "8px 34px 8px 10px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13, color: "#111", outline: "none", boxSizing: "border-box", background: "#FFF", resize: "vertical", fontFamily: "inherit" }} />
      <button type="button" onClick={() => setVarOpen(o => !o)} title="Inserir variável"
        style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 5, border: "1px solid #DDD6FE", background: "#F5F3FF", color: "#8B5CF6", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, lineHeight: 1 }}>
        <Braces size={13} />
      </button>
      {varOpen && <VarPicker onInsert={insertVar} onClose={() => setVarOpen(false)} />}
    </div>
  );
}

// Bloco "Instruções adicionais" reutilizado pelos editores de intenção/sentimento/extrator.
function IaExtraInstructions({ a, updateAction, labelStyle }: { a: IaAction; updateAction: (id: string, data: Partial<IaAction>) => void; labelStyle: React.CSSProperties }) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={labelStyle}>Instruções adicionais (opcional)</label>
      <IaVarTextarea value={a.instructions ?? ""} onChange={(v) => updateAction(a.id, { instructions: v })} rows={3} placeholder="Contexto extra para a IA. Use {{lead.name}}, {{gatilho.x}} ou saídas de outros blocos." />
    </div>
  );
}

function IaIntencaoEditor({ a, updateAction, inputStyle, labelStyle }: { a: IaAction; updateAction: (id: string, data: Partial<IaAction>) => void; inputStyle: React.CSSProperties; labelStyle: React.CSSProperties }) {
  const items = a.intencoes ?? [];
  const set = (next: IaIntencao[]) => updateAction(a.id, { intencoes: next });
  return (
    <div>
      <label style={labelStyle}>Intenções a identificar</label>
      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 8px", lineHeight: 1.4 }}>Cada intenção vira uma saída no bloco. A IA roteia para a que melhor corresponder à conversa.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={it.id} style={IA_ITEM_BOX}>
            <IaItemHeader index={i} color="#8B5CF6" onRemove={() => set(items.filter(x => x.id !== it.id))} />
            <input value={it.nome} onChange={e => set(items.map(x => x.id === it.id ? { ...x, nome: e.target.value } : x))} placeholder="Nome da intenção (ex: Quer comprar)" style={inputStyle} />
            <textarea value={it.detalhes ?? ""} onChange={e => set(items.map(x => x.id === it.id ? { ...x, detalhes: e.target.value } : x))} rows={2} placeholder="Quando essa intenção se aplica" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
            <textarea value={it.exemplos ?? ""} onChange={e => set(items.map(x => x.id === it.id ? { ...x, exemplos: e.target.value } : x))} rows={2} placeholder="Exemplos de frases (opcional)" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        ))}
      </div>
      <button onClick={() => set([...items, { id: `int${Date.now()}`, nome: "", detalhes: "", exemplos: "" }])} style={IA_ADD_BTN}
        onMouseEnter={e => (e.currentTarget.style.background = "#EDE9FE")} onMouseLeave={e => (e.currentTarget.style.background = "#F5F3FF")}>
        <Plus size={13} /> Adicionar intenção
      </button>
      <IaExtraInstructions a={a} updateAction={updateAction} labelStyle={labelStyle} />
      <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Saída disponível como <span style={{ fontFamily: "monospace", color: "#6B7280" }}>{`{{${a.outputVar}.intencao}}`}</span>.</p>
    </div>
  );
}

function IaSentimentoEditor({ a, updateAction, inputStyle, labelStyle }: { a: IaAction; updateAction: (id: string, data: Partial<IaAction>) => void; inputStyle: React.CSSProperties; labelStyle: React.CSSProperties }) {
  const items = a.sentimentos ?? [];
  const set = (next: IaSentimento[]) => updateAction(a.id, { sentimentos: next });
  return (
    <div>
      <label style={labelStyle}>Sentimentos a identificar</label>
      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 8px", lineHeight: 1.4 }}>Cada sentimento vira uma saída no bloco. A IA roteia para o que melhor corresponder.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((s, i) => (
          <div key={s.id} style={IA_ITEM_BOX}>
            <IaItemHeader index={i} color="#06B6D4" onRemove={() => set(items.filter(x => x.id !== s.id))} />
            <input value={s.nome} onChange={e => set(items.map(x => x.id === s.id ? { ...x, nome: e.target.value } : x))} placeholder="Nome do sentimento (ex: Satisfeito)" style={inputStyle} />
            <textarea value={s.detalhes ?? ""} onChange={e => set(items.map(x => x.id === s.id ? { ...x, detalhes: e.target.value } : x))} rows={2} placeholder="Quando esse sentimento se aplica (opcional)" style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
          </div>
        ))}
      </div>
      <button onClick={() => set([...items, { id: `sen${Date.now()}`, nome: "", detalhes: "" }])} style={IA_ADD_BTN}
        onMouseEnter={e => (e.currentTarget.style.background = "#EDE9FE")} onMouseLeave={e => (e.currentTarget.style.background = "#F5F3FF")}>
        <Plus size={13} /> Adicionar sentimento
      </button>
      <IaExtraInstructions a={a} updateAction={updateAction} labelStyle={labelStyle} />
      <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Saída disponível como <span style={{ fontFamily: "monospace", color: "#6B7280" }}>{`{{${a.outputVar}.sentimento}}`}</span>.</p>
    </div>
  );
}

const IA_PARAM_TIPOS = [
  { id: "texto", label: "Texto" },
  { id: "numero", label: "Número" },
  { id: "email", label: "E-mail" },
  { id: "telefone", label: "Telefone" },
  { id: "data", label: "Data" },
  { id: "booleano", label: "Sim/Não" },
];

function IaParamsEditor({ a, updateAction, inputStyle, labelStyle }: { a: IaAction; updateAction: (id: string, data: Partial<IaAction>) => void; inputStyle: React.CSSProperties; labelStyle: React.CSSProperties }) {
  const items = a.parametros ?? [];
  const set = (next: IaParametro[]) => updateAction(a.id, { parametros: next });
  return (
    <div>
      <label style={labelStyle}>Parâmetros a extrair</label>
      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 8px", lineHeight: 1.4 }}>A IA extrai cada valor da conversa. Use o nome como campo do resultado.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((p, i) => (
          <div key={p.id} style={IA_ITEM_BOX}>
            <IaItemHeader index={i} color="#8B5CF6" onRemove={() => set(items.filter(x => x.id !== p.id))} />
            <div style={{ display: "flex", gap: 6 }}>
              <input value={p.nome} onChange={e => set(items.map(x => x.id === p.id ? { ...x, nome: e.target.value } : x))} placeholder="Nome (ex: cidade)" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <select value={p.tipo} onChange={e => set(items.map(x => x.id === p.id ? { ...x, tipo: e.target.value } : x))} style={{ ...inputStyle, flex: "0 0 38%" }}>
                {IA_PARAM_TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <input value={p.info ?? ""} onChange={e => set(items.map(x => x.id === p.id ? { ...x, info: e.target.value } : x))} placeholder="Descrição/instrução (opcional)" style={inputStyle} />
          </div>
        ))}
      </div>
      <button onClick={() => set([...items, { id: `prm${Date.now()}`, nome: "", tipo: "texto", info: "" }])} style={IA_ADD_BTN}
        onMouseEnter={e => (e.currentTarget.style.background = "#EDE9FE")} onMouseLeave={e => (e.currentTarget.style.background = "#F5F3FF")}>
        <Plus size={13} /> Adicionar parâmetro
      </button>
      <IaExtraInstructions a={a} updateAction={updateAction} labelStyle={labelStyle} />
      <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Cada valor fica disponível como <span style={{ fontFamily: "monospace", color: "#6B7280" }}>{`{{${a.outputVar}.nome}}`}</span>.</p>
    </div>
  );
}

const IA_AUDIO_SOURCES = [
  { id: "todos", label: "Todos os áudios da conversa" },
  { id: "ultimo", label: "Apenas o último áudio" },
];
const IA_AUDIO_LANGS = [
  { id: "pt", label: "Português" },
  { id: "auto", label: "Detectar automaticamente" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];

function IaTranscricaoEditor({ a, updateAction, inputStyle, labelStyle }: { a: IaAction; updateAction: (id: string, data: Partial<IaAction>) => void; inputStyle: React.CSSProperties; labelStyle: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>Áudios a transcrever</label>
        <select value={a.audioSource ?? "todos"} onChange={e => updateAction(a.id, { audioSource: e.target.value })} style={inputStyle}>
          {IA_AUDIO_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Idioma</label>
        <select value={a.language ?? "pt"} onChange={e => updateAction(a.id, { language: e.target.value })} style={inputStyle}>
          {IA_AUDIO_LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>Usa a Whisper da OpenAI — requer uma chave da <strong>OpenAI</strong> cadastrada. Resultado em <span style={{ fontFamily: "monospace", color: "#6B7280" }}>{`{{${a.outputVar}.texto}}`}</span>.</p>
    </div>
  );
}

function IaPanel({ node, onClose, onDelete, onDuplicate, updateAction, removeAction, onAddAction }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  updateAction: (actionId: string, data: Partial<IaAction>) => void;
  removeAction: (actionId: string) => void;
  onAddAction: () => void;
}) {
  const actions = node.iaActions ?? [];
  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13, color: "#111", outline: "none", boxSizing: "border-box", background: "#FFF" };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 };

  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} style={{ flexShrink: 0 }} /> <span>Inteligência Artificial</span>
          </button>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {([{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }] as const).map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <Icon size={13} />
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0", lineHeight: 1.4 }}>Ações de IA usando a chave do provedor cadastrada em Configurações → Chaves de API.</p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {actions.length === 0 && (
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>Nenhuma ação de IA ainda. Clique em "Adicionar ação com IA" para começar.</div>
        )}
        {actions.map(a => {
          const Icon = IA_ACTION_TYPES.find(t => t.id === a.type)?.icon ?? Bot;
          const isText = a.type === "assistente_chat" || a.type === "gerar_texto";
          return (
            <div key={a.id} style={{ border: "1px solid #EDE9FE", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 12, background: "#FCFAFF" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon size={15} color="#8B5CF6" />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#111" }}>{IA_ACTION_LABEL[a.type]}</span>
                <button onClick={() => removeAction(a.id)} title="Remover ação" style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#EF4444"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <div>
                <label style={labelStyle}>Modelo de IA</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={a.provider} onChange={e => { const p = e.target.value as IaProvider; updateAction(a.id, { provider: p, model: IA_MODELS[p][0].id }); }} style={{ ...inputStyle, flex: "0 0 38%" }}>
                    {(Object.keys(IA_MODELS) as IaProvider[]).map(p => <option key={p} value={p}>{IA_PROVIDER_LABELS[p]}</option>)}
                  </select>
                  <select value={a.model} onChange={e => updateAction(a.id, { model: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
                    {IA_MODELS[a.provider].map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Fonte de dados com o resultado</label>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#FFF", background: "#8B5CF6", borderRadius: 6, padding: "3px 10px" }}>{a.outputVar}</span>
              </div>
              {isText ? (
                <div>
                  <label style={labelStyle}>{a.type === "assistente_chat" ? "Instruções do assistente" : "Instruções"}</label>
                  <IaVarTextarea value={a.instructions ?? ""} onChange={(v) => updateAction(a.id, { instructions: v })} rows={5} placeholder="Descreva o que a IA deve fazer. Use {{gatilho.nome}}, {{lead.name}} ou saídas de outros blocos." />
                  <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>Resultado disponível como <span style={{ fontFamily: "monospace", color: "#6B7280" }}>{`{{${a.outputVar}.resposta}}`}</span>.</p>
                </div>
              ) : a.type === "intencao" ? (
                <IaIntencaoEditor a={a} updateAction={updateAction} inputStyle={inputStyle} labelStyle={labelStyle} />
              ) : a.type === "sentimento" ? (
                <IaSentimentoEditor a={a} updateAction={updateAction} inputStyle={inputStyle} labelStyle={labelStyle} />
              ) : a.type === "extrator_params" ? (
                <IaParamsEditor a={a} updateAction={updateAction} inputStyle={inputStyle} labelStyle={labelStyle} />
              ) : a.type === "transcricao_audio" ? (
                <IaTranscricaoEditor a={a} updateAction={updateAction} inputStyle={inputStyle} labelStyle={labelStyle} />
              ) : (
                <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>A configuração específica desta ação será liberada em breve.</p>
              )}
            </div>
          );
        })}
        <button onClick={onAddAction}
          style={{ width: "100%", border: "1px dashed #DDD6FE", background: "#F5F3FF", color: "#8B5CF6", fontSize: 13, fontWeight: 600, padding: "10px 0", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          onMouseEnter={e => (e.currentTarget.style.background = "#EDE9FE")} onMouseLeave={e => (e.currentTarget.style.background = "#F5F3FF")}>
          <Plus size={14} /> Adicionar ação com IA
        </button>
      </div>
    </aside>
  );
}

function EsperaPanel({ node, onClose, onDelete, onDuplicate, updateEspera, onOpenPicker }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  updateEspera: (data: Partial<EsperaConfig>) => void;
  onOpenPicker: () => void;
}) {
  const espera = node.espera;
  const allItems = ESPERA_CATEGORIES.flatMap(c => c.items);
  const currentItem = espera ? allItems.find(i => i.id === espera.type) : null;

  const toggleDay = (day: string) => {
    const days = (espera?.days ?? []).includes(day)
      ? (espera?.days ?? []).filter(d => d !== day)
      : [...(espera?.days ?? []), day];
    updateEspera({ days });
  };

  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={espera ? onOpenPicker : onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#111111", padding: 0, maxWidth: 200, overflow: "hidden" }}>
            <ArrowLeft size={16} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentItem ? currentItem.label : "Espera"}</span>
          </button>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            {([{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }] as const).map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><Icon size={13} /></button>
            ))}
          </div>
        </div>
        {currentItem && <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0", lineHeight: 1.4 }}>{currentItem.description}</p>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {/* No type selected — show picker trigger */}
        {!espera && (
          <button onClick={onOpenPicker}
            style={{ width: "100%", padding: "40px 0", border: "1.5px dashed #BFDBFE", borderRadius: 8, background: "#F0F9FF", color: "#3B82F6", fontSize: 13, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "background 0.1s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#DBEAFE")}
            onMouseLeave={e => (e.currentTarget.style.background = "#F0F9FF")}
          >
            <Plus size={20} />
            <span>Adicionar tipo de espera</span>
          </button>
        )}

        {/* intervalo_semana */}
        {espera?.type === "intervalo_semana" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Dias da semana que poderá continuar a execução</label>
              <div style={{ display: "flex", gap: 4 }}>
                {DAYS_OF_WEEK.map(d => {
                  const sel = (espera.days ?? []).includes(d.id);
                  return (
                    <button key={d.id} onClick={() => toggleDay(d.id)}
                      style={{ width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${sel ? "#3B82F6" : "#E5E5E5"}`, background: sel ? "#3B82F6" : "#FFFFFF", color: sel ? "#FFFFFF" : "#6B7280", fontSize: 11, fontWeight: sel ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                      {d.label[0]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Intervalo de horas</label>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>entre</div>
                  <input type="time" value={espera.startTime ?? "00:00"} onChange={e => updateEspera({ startTime: e.target.value })}
                    style={{ width: 110, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>e</div>
                  <input type="time" value={espera.endTime ?? "23:59"} onChange={e => updateEspera({ endTime: e.target.value })}
                    style={{ width: 110, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none" }} />
                </div>
              </div>
              <p style={{ fontSize: 11, color: "#3B82F6", marginTop: 6, lineHeight: 1.4 }}>Será considerado um horário aleatório entre o horário de início e fim</p>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Fuso horário</label>
              <select value={espera.timezone ?? "America/Sao_Paulo (BRT)"} onChange={e => updateEspera({ timezone: e.target.value })}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", background: "#FFFFFF", cursor: "pointer" }}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* minutos */}
        {espera?.type === "minutos" && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Quantos minutos esperar para continuar a execução?</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} value={espera.amount ?? 5} onChange={e => updateEspera({ amount: Number(e.target.value) })}
                style={{ width: 80, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", textAlign: "right" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>minutos</span>
            </div>
          </div>
        )}

        {/* dias */}
        {espera?.type === "dias" && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Quantos dias esperar para continuar a execução?</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} value={espera.amount ?? 1} onChange={e => updateEspera({ amount: Number(e.target.value) })}
                style={{ width: 80, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", textAlign: "right" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>dias</span>
            </div>
          </div>
        )}

        {/* horas */}
        {espera?.type === "horas" && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Quantas horas esperar para continuar a execução?</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} value={espera.amount ?? 5} onChange={e => updateEspera({ amount: Number(e.target.value) })}
                style={{ width: 80, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", textAlign: "right" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>horas</span>
            </div>
          </div>
        )}

        {/* segundos */}
        {espera?.type === "segundos" && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Quantos segundos esperar para continuar a execução?</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} value={espera.amount ?? 5} onChange={e => updateEspera({ amount: Number(e.target.value) })}
                style={{ width: 80, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", textAlign: "right" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>segundos</span>
            </div>
          </div>
        )}

        {/* dia_horario */}
        {espera?.type === "dia_horario" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Data para seguir a automação</label>
              <div style={{ position: "relative" }}>
                <input type="text" placeholder="" value={espera.dateField ?? ""} onChange={e => updateEspera({ dateField: e.target.value })}
                  style={{ width: "100%", padding: "7px 56px 7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 2 }}>
                  <button title="Copiar" style={{ width: 22, height: 22, border: "1px solid #E5E5E5", borderRadius: 4, background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Copy size={11} /></button>
                  <button title="Inserir campo variável" style={{ width: 22, height: 22, border: "0.5px solid #3B82F6", borderRadius: 4, background: "#EFF6FF", color: "#3B82F6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}><Braces size={12} /></button>
                </div>
              </div>
              <p style={{ fontSize: 11, color: "#3B82F6", marginTop: 6, lineHeight: 1.4 }}>Utilize campos adicionais de data, textos no formato ISO 8601 ou textos nos formatos YYYY-MM-DD ou DD/MM/YYYY</p>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>entre</div>
                  <input type="time" value={espera.dateStartTime ?? "00:00"} onChange={e => updateEspera({ dateStartTime: e.target.value })}
                    style={{ width: 110, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>e</div>
                  <input type="time" value={espera.dateEndTime ?? "23:59"} onChange={e => updateEspera({ dateEndTime: e.target.value })}
                    style={{ width: 110, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none" }} />
                </div>
              </div>
              <p style={{ fontSize: 11, color: "#3B82F6", marginTop: 6, lineHeight: 1.4 }}>Será considerado um horário aleatório entre o horário de início e fim</p>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Fuso horário</label>
              <select value={espera.dateTimezone ?? "America/Sao_Paulo (BRT)"} onChange={e => updateEspera({ dateTimezone: e.target.value })}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", background: "#FFFFFF", cursor: "pointer" }}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* usuario_parou */}
        {espera?.type === "usuario_parou" && (
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Tempo em segundos que o usuário parou de responder</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} value={espera.amount ?? 5} onChange={e => updateEspera({ amount: Number(e.target.value) })}
                style={{ width: 80, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", textAlign: "right" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>segundos</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── RandomizadorPanel ────────────────────────────────────────────────────────

const BRANCH_COLORS = ["#3B82F6", "#22C55E", "#F97316", "#8B5CF6", "#EC4899"];

const API_REQUEST_TYPES = [
  { id: "json" as const, label: "Requisição HTTP com comunicação via JSON", description: "Realiza uma requisição HTTP para um endpoint externo, utilizando comunicação em formato JSON", defaultMethod: "POST" },
  { id: "file" as const, label: "Requisição de arquivo HTTP", description: "Realiza uma requisição HTTP para um endpoint externo que retorna um arquivo", defaultMethod: "GET" },
];

type VarField = { key: string; label: string; icon: string; isApiSource?: boolean; sourceName?: string };
type VarCategory = { id: string; label: string; fields: VarField[]; isAdditional?: boolean };

const STATIC_VARIABLE_CATEGORIES: VarCategory[] = [
  { id: "lead", label: "Campos do lead", fields: [
    { key: "lead.id",           label: "ID do lead",           icon: "#" },
    { key: "lead.name",         label: "Nome do lead",         icon: "T" },
    { key: "lead.company",      label: "Empresa do lead",      icon: "T" },
    { key: "lead.email",        label: "E-mail do lead",       icon: "T" },
    { key: "lead.whatsapp",     label: "Telefone do lead",     icon: "T" },
    { key: "lead.document",     label: "CPF/CNPJ do lead",     icon: "T" },
    { key: "lead.birth_date",   label: "Data de nascimento",   icon: "📅" },
    { key: "lead.origin",       label: "Origem do lead",       icon: "T" },
    { key: "lead.notes",        label: "Notas do lead",        icon: "T" },
    { key: "lead.responsible",  label: "Atendente do lead",    icon: "T" },
    { key: "lead.site",         label: "Site do lead",         icon: "T" },
    { key: "lead.country",      label: "País",                 icon: "T" },
    { key: "lead.zip_code",     label: "CEP",                  icon: "T" },
    { key: "lead.address",      label: "Endereço",             icon: "T" },
    { key: "lead.addr_number",  label: "Número",               icon: "T" },
    { key: "lead.complement",   label: "Complemento",          icon: "T" },
    { key: "lead.neighborhood", label: "Bairro",               icon: "T" },
    { key: "lead.city",         label: "Cidade",               icon: "T" },
    { key: "lead.state",        label: "Estado",               icon: "T" },
    { key: "lead.created_at",   label: "Data de criação",      icon: "📅" },
    { key: "lead.entry_date",   label: "Data de entrada",      icon: "📅" },
  ]},
  { id: "negocio", label: "Campos do negócio", fields: [
    { key: "lead.deal_number",   label: "Código do negócio",        icon: "#" },
    { key: "lead.value",         label: "Valor do negócio",         icon: "#" },
    { key: "lead.status",        label: "Status (aberto/ganho/perdido)", icon: "T" },
    { key: "lead.priority",      label: "Prioridade",               icon: "T" },
    { key: "lead.pipeline_id",   label: "ID do pipeline",           icon: "T" },
    { key: "lead.column_id",     label: "ID da etapa",              icon: "T" },
    { key: "lead.next_follow_up",label: "Próximo follow-up",        icon: "📅" },
    { key: "lead.tags",          label: "Tags do negócio",          icon: "T" },
    { key: "lead.product_id",    label: "ID do produto vinculado",  icon: "#" },
    { key: "lead.utm_source",    label: "UTM Source",               icon: "T" },
    { key: "lead.utm_medium",    label: "UTM Medium",               icon: "T" },
    { key: "lead.utm_campaign",  label: "UTM Campaign",             icon: "T" },
    { key: "lead.utm_term",      label: "UTM Term",                 icon: "T" },
    { key: "lead.utm_content",   label: "UTM Content",              icon: "T" },
  ]},
  { id: "produto", label: "Campos do produto", fields: [
    { key: "prod.name",          label: "Nome do produto",  icon: "T" },
    { key: "prod.sku",           label: "SKU do produto",   icon: "T" },
    { key: "prod.default_value", label: "Preço do produto", icon: "#" },
  ]},
  { id: "campos_lead",    label: "Campos adicionais do lead",    fields: [], isAdditional: true },
  { id: "campos_neg",     label: "Campos adicionais do negócio", fields: [], isAdditional: true },
  { id: "campos_empresa", label: "Campos adicionais da empresa", fields: [], isAdditional: true },
  { id: "sistema", label: "Campos do sistema", fields: [
    { key: "gatilho.tipo",       label: "Tipo do gatilho",    icon: "T" },
    { key: "gatilho.lead_id",    label: "ID do lead (gatilho)", icon: "#" },
    { key: "gatilho.empresa_id", label: "ID da empresa",      icon: "#" },
  ]},
  { id: "ia",      label: "Campos de IA",      fields: [] },
  { id: "entrada", label: "Entrada de dados",  fields: [] },
];

// Campos de DESTINO (somente graváveis)
type DestCategory = { id: string; label: string; fields: { key: string; label: string }[]; isAdditional?: boolean };
const DEST_FIELD_CATEGORIES: DestCategory[] = [
  { id: "lead", label: "Campos do lead", fields: [
    { key: "lead.name",         label: "Nome do lead" },
    { key: "lead.company",      label: "Empresa" },
    { key: "lead.email",        label: "E-mail" },
    { key: "lead.whatsapp",     label: "Telefone" },
    { key: "lead.document",     label: "CPF/CNPJ" },
    { key: "lead.birth_date",   label: "Data de nascimento" },
    { key: "lead.origin",       label: "Origem" },
    { key: "lead.notes",        label: "Notas" },
    { key: "lead.responsible",  label: "Atendente responsável" },
    { key: "lead.site",         label: "Site" },
    { key: "lead.country",      label: "País" },
    { key: "lead.zip_code",     label: "CEP" },
    { key: "lead.address",      label: "Endereço" },
    { key: "lead.addr_number",  label: "Número" },
    { key: "lead.complement",   label: "Complemento" },
    { key: "lead.neighborhood", label: "Bairro" },
    { key: "lead.city",         label: "Cidade" },
    { key: "lead.state",        label: "Estado" },
  ]},
  { id: "negocio", label: "Campos do negócio", fields: [
    { key: "lead.value",          label: "Valor do negócio" },
    { key: "lead.status",         label: "Status (aberto/ganho/perdido)" },
    { key: "lead.priority",       label: "Prioridade" },
    { key: "lead.next_follow_up", label: "Próximo follow-up" },
    { key: "lead.utm_source",     label: "UTM Source" },
    { key: "lead.utm_medium",     label: "UTM Medium" },
    { key: "lead.utm_campaign",   label: "UTM Campaign" },
    { key: "lead.utm_term",       label: "UTM Term" },
    { key: "lead.utm_content",    label: "UTM Content" },
  ]},
  { id: "produto", label: "Campos do produto", fields: [
    { key: "prod.name",          label: "Nome do produto" },
    { key: "prod.sku",           label: "SKU" },
    { key: "prod.default_value", label: "Preço padrão" },
  ]},
  { id: "campos_lead",    label: "Campos adicionais do lead",    fields: [], isAdditional: true },
  { id: "campos_neg",     label: "Campos adicionais do negócio", fields: [], isAdditional: true },
  { id: "campos_empresa", label: "Campos adicionais da empresa", fields: [], isAdditional: true },
];

const DEFAULT_BRANCHES: RandomBranch[] = [
  { id: "a", label: "A", percentage: 25 }, { id: "b", label: "B", percentage: 25 },
  { id: "c", label: "C", percentage: 25 }, { id: "d", label: "D", percentage: 25 },
];

function RandomizadorPanel({ node, onClose, onDelete, onDuplicate, addBranch, removeBranch, updateBranch }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  addBranch: () => void;
  removeBranch: (id: string) => void;
  updateBranch: (id: string, data: Partial<RandomBranch>) => void;
}) {
  const branches = node.randomBranches ?? DEFAULT_BRANCHES;
  const total = branches.reduce((s, b) => s + b.percentage, 0);
  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} /> Randomizador
          </button>
          <div style={{ display: "flex", gap: 2 }}>
            {([{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }] as const).map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><Icon size={13} /></button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Modifique as ramificações e seus percentuais</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {total !== 100 && (
          <div style={{ padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 12, color: "#92400E", marginBottom: 10 }}>
            Total: {total}% (deve somar 100%)
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {branches.map((b, i) => {
            const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", minWidth: 16, textAlign: "center" }}>{b.label}</span>
                <input
                  type="range" min={0} max={100} value={b.percentage}
                  onChange={e => updateBranch(b.id, { percentage: Number(e.target.value) })}
                  style={{ flex: 1, height: 6, accentColor: color, cursor: "pointer" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <input type="number" min={0} max={100} value={b.percentage} onChange={e => updateBranch(b.id, { percentage: Number(e.target.value) })}
                    style={{ width: 46, border: "1px solid #E5E5E5", borderRadius: 5, padding: "4px 6px", fontSize: 12, outline: "none", textAlign: "center", background: "#FFF" }} />
                  <span style={{ fontSize: 11, color: "#6B7280" }}>%</span>
                </div>
                {branches.length > 2 && (
                  <button onClick={() => removeBranch(b.id)} style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                  ><X size={11} /></button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ borderTop: "1px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
        <button onClick={addBranch}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "1px dashed #E5E5E5", borderRadius: 8, background: "#F9FAFB", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.borderColor = "#9CA3AF"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#E5E5E5"; }}
        >
          <Plus size={13} /> Adicionar ramificação
        </button>
      </div>
    </aside>
  );
}

// ─── ApiPanel ─────────────────────────────────────────────────────────────────

// Saídas dos blocos de IA como variáveis insertáveis ({{outputVar.campo}}), seguindo o
// que o runner persiste em datasources. Usado tanto em "Campos de IA" quanto em
// "Entrada de dados" (a IA é uma fonte de dados, igual às saídas de API).
function iaOutputFields(nodes: CanvasNode[]): VarField[] {
  return nodes.filter(n => n.type === "ia").flatMap(n =>
    (n.iaActions ?? []).flatMap((a): VarField[] => {
      const out = a.outputVar;
      if (a.type === "assistente_chat" || a.type === "gerar_texto")
        return [{ key: `${out}.resposta`, label: `${out} — resposta`, icon: "T" }];
      if (a.type === "intencao")
        return [
          { key: `${out}.intencao`, label: `${out} — intenção`, icon: "T" },
          { key: `${out}.id`, label: `${out} — id da intenção`, icon: "T" },
        ];
      if (a.type === "sentimento")
        return [{ key: `${out}.sentimento`, label: `${out} — sentimento`, icon: "T" }];
      if (a.type === "transcricao_audio")
        return [{ key: `${out}.texto`, label: `${out} — transcrição`, icon: "T" }];
      if (a.type === "extrator_params")
        return (a.parametros ?? []).filter(p => (p.nome ?? "").trim()).map(p => ({
          key: `${out}.${p.nome}`, label: `${out} — ${p.nome}`, icon: "T" as const,
        }));
      return [];
    })
  );
}

// ── WebhookTree ───────────────────────────────────────────────────────────────

function WebhookTreeNode({ data, path, depth, onSelect, selectedPath }: {
  data: unknown; path: string; depth: number;
  onSelect: (path: string) => void;
  selectedPath: string;
}) {
  const [open, setOpen] = useState(true);
  const indent = depth * 14;

  if (typeof data !== "object" || data === null) {
    const str = String(data);
    const isSelected = selectedPath === path;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <button
          onClick={() => onSelect(path)}
          title="Usar este campo"
          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: isSelected ? "#2563EB" : "#AAA", display: "flex", alignItems: "center" }}
        >
          <Copy size={11} />
        </button>
        <span style={{ fontSize: 11, color: typeof data === "string" ? "#16A34A" : "#EA580C", fontFamily: "monospace", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={str}>
          {typeof data === "string" ? `"${str}"` : str}
        </span>
      </span>
    );
  }

  if (Array.isArray(data)) {
    return (
      <div style={{ paddingLeft: indent }}>
        <button onClick={() => setOpen(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#6B7280", fontFamily: "monospace", padding: "2px 0", display: "flex", alignItems: "center", gap: 3 }}>
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span style={{ color: "#9CA3AF" }}>[{data.length}]</span>
        </button>
        {open && data.slice(0, 10).map((item, i) => (
          <div key={i} style={{ paddingLeft: 12, paddingTop: 2 }}>
            <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{i}: </span>
            <WebhookTreeNode data={item} path={`${path}.${i}`} depth={0} onSelect={onSelect} selectedPath={selectedPath} />
          </div>
        ))}
        {data.length > 10 && <span style={{ paddingLeft: 12, fontSize: 10, color: "#9CA3AF" }}>…+{data.length - 10}</span>}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: indent }}>
      {Object.entries(data as Record<string, unknown>).map(([key, val]) => {
        const full = path ? `${path}.${key}` : key;
        const isObj = typeof val === "object" && val !== null;
        return (
          <div key={key} style={{ paddingTop: 2, paddingBottom: 2 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 3 }}>
              {isObj && (
                <button onClick={() => setOpen(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 0", flexShrink: 0, color: "#9CA3AF", display: "flex", alignItems: "center" }}>
                  {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>
              )}
              <span style={{ fontSize: 11, color: "#0891B2", fontWeight: 500, fontFamily: "monospace", flexShrink: 0 }}>{key}:</span>
              {!isObj && <WebhookTreeNode data={val} path={full} depth={0} onSelect={onSelect} selectedPath={selectedPath} />}
            </div>
            {isObj && open && (
              <div style={{ paddingLeft: 14 }}>
                <WebhookTreeNode data={val} path={full} depth={0} onSelect={onSelect} selectedPath={selectedPath} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WebhookTree({ data, onSelect, selectedPath }: { data: unknown; onSelect: (path: string) => void; selectedPath: string }) {
  return (
    <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", maxHeight: 220, overflowY: "auto" }}>
      <WebhookTreeNode data={data} path="" depth={0} onSelect={onSelect} selectedPath={selectedPath} />
    </div>
  );
}

function VarPicker({ onInsert, onClose }: { onInsert: (val: string) => void; onClose: () => void }) {
  const { nodes, customFieldGroups, trigger, webhookPayload, refreshWebhookPayload } = useContext(VarPickerCtx);
  const [cat, setCat] = useState("lead");
  const [search, setSearch] = useState("");
  const [apiModal, setApiModal] = useState<{ sourceName: string } | null>(null);
  const [apiPath, setApiPath] = useState("");
  const [apiTestResponses, setApiTestResponses] = useState<Record<string, unknown>>({});
  const [apiTestLoading, setApiTestLoading] = useState(false);
  const [refreshingPayload, setRefreshingPayload] = useState(false);

  const handleRefreshPayload = async () => {
    if (!refreshWebhookPayload) return;
    setRefreshingPayload(true);
    await refreshWebhookPayload();
    setRefreshingPayload(false);
  };
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; ready: boolean }>({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const W = 580, H = 340, GAP = 4, MARGIN = 8;
    let left = rect.right - W;
    if (left < MARGIN) left = MARGIN;
    if (left + W > window.innerWidth - MARGIN) left = window.innerWidth - W - MARGIN;
    let top = rect.top - H - GAP;
    if (top < MARGIN) top = rect.bottom + GAP;
    setPos({ top, left, ready: true });
  }, []);

  // Build dynamic categories from context
  const categories = useMemo((): VarCategory[] => {
    return STATIC_VARIABLE_CATEGORIES.map(c => {
      if (c.id === "campos_lead") {
        const fields: VarField[] = customFieldGroups.flatMap(g =>
          g.items.map(i => ({ key: `campo_lead.${i.id}`, label: i.label, icon: i.fieldType === "date" ? "📅" : i.fieldType === "boolean" ? "☑" : "T" }))
        );
        return { ...c, fields };
      }
      if (c.id === "campos_neg") {
        const fields: VarField[] = customFieldGroups.flatMap(g =>
          g.items.map(i => ({ key: `campo_neg.${i.id}`, label: i.label, icon: i.fieldType === "date" ? "📅" : i.fieldType === "boolean" ? "☑" : "T" }))
        );
        return { ...c, fields };
      }
      if (c.id === "campos_empresa") {
        const fields: VarField[] = customFieldGroups.flatMap(g =>
          g.items.map(i => ({ key: `campo_empresa.${i.id}`, label: i.label, icon: i.fieldType === "date" ? "📅" : i.fieldType === "boolean" ? "☑" : "T" }))
        );
        return { ...c, fields };
      }
      if (c.id === "ia") {
        return { ...c, fields: iaOutputFields(nodes) };
      }
      if (c.id === "entrada") {
        const webhookFields: VarField[] = trigger?.triggerId === "http_webhook"
          ? [{ key: "webhook", label: "Api-request-1", icon: "{}", isApiSource: true, sourceName: "webhook" }]
          : [];
        const apiNodes = nodes.filter(n => n.type === "api");
        const apiFields: VarField[] = apiNodes.flatMap(n =>
          (n.apiConfig?.requests ?? []).map(r => ({
            key: `${r.name}`,
            label: r.name,
            icon: "{}",
            isApiSource: true,
            sourceName: r.name,
          }))
        );
        const camposFields: VarField[] = nodes
          .filter(n => n.type === "campos")
          .flatMap(n =>
            (n.fieldOps ?? [])
              .filter(op => op.type !== "mapeamento")
              .map(op => {
                const dsOp = op as FieldOpLoopArray | FieldOpAnaliseTel | FieldOpFormatacaoData;
                return {
                  key: dsOp.datasourceName,
                  label: dsOp.datasourceName,
                  icon: "{}",
                  isApiSource: true as const,
                  sourceName: dsOp.datasourceName,
                };
              })
          );
        return { ...c, fields: [...webhookFields, ...apiFields, ...camposFields, ...iaOutputFields(nodes)] };
      }
      return c;
    });
  }, [nodes, customFieldGroups, trigger]);

  const activeCat = categories.find(c => c.id === cat) ?? categories[0];
  const fields = activeCat.fields.filter(f => !search || f.label.toLowerCase().includes(search.toLowerCase()));

  const handleFieldClick = (f: VarField) => {
    if (f.isApiSource) {
      setApiModal({ sourceName: f.sourceName! });
      setApiPath("");
    } else {
      onInsert(`{{${f.key}}}`);
      onClose();
    }
  };

  const confirmApiPath = () => {
    if (!apiModal) return;
    const prefix = apiModal.sourceName === "webhook" ? "gatilho" : apiModal.sourceName;
    const val = apiPath.trim() ? `{{${prefix}.${apiPath.trim()}}}` : `{{${prefix}}}`;
    onInsert(val);
    onClose();
  };

  const findApiRequestConfig = (sourceName: string): ApiRequest | null => {
    for (const node of nodes) {
      if (node.type === "api") {
        const req = (node.apiConfig?.requests ?? []).find(r => r.name === sourceName);
        if (req) return req;
      }
    }
    return null;
  };

  const findFieldOpSource = (sourceName: string): FieldOperation | null => {
    for (const node of nodes) {
      if (node.type === "campos") {
        const op = (node.fieldOps ?? []).find(
          o => o.type !== "mapeamento" && (o as FieldOpAnaliseTel).datasourceName === sourceName
        );
        if (op) return op as FieldOperation;
      }
    }
    return null;
  };

  const ANALISE_TEL_FIELDS: { key: string; desc: string }[] = [
    { key: "ddi",                desc: "Código do país (ex: 55)" },
    { key: "phone",              desc: "+5511987654321" },
    { key: "nationalNumber",     desc: "(11) 98765-4321" },
    { key: "internacionalNumber",desc: "+55 11 98765-4321" },
  ];

  const activeFieldOp = apiModal ? findFieldOpSource(apiModal.sourceName) : null;

  const testApiRequest = async () => {
    if (!apiModal) return;
    const req = findApiRequestConfig(apiModal.sourceName);
    if (!req) {
      setApiTestResponses(prev => ({ ...prev, [apiModal.sourceName]: { erro: "Configuração não encontrada" } }));
      return;
    }
    setApiTestLoading(true);
    try {
      const cleanUrl = req.url.replace(/\{\{[^}]+\}\}/g, "");
      const urlObj = new URL(cleanUrl);
      for (const { key, value } of (req.params ?? [])) {
        if (key) urlObj.searchParams.set(key, value.replace(/\{\{[^}]+\}\}/g, ""));
      }
      const headers: Record<string, string> = {};
      for (const { key, value } of (req.headers ?? [])) {
        if (key) headers[key] = value.replace(/\{\{[^}]+\}\}/g, "");
      }
      let body: string | undefined;
      if (req.type === "json" && req.body && ["POST", "PUT", "PATCH"].includes(req.method)) {
        body = req.body.replace(/\{\{[^}]+\}\}/g, "");
        if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json";
      }
      const resp = await fetch(urlObj.toString(), { method: req.method, headers, body });
      const text = await resp.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { resposta: text }; }
      setApiTestResponses(prev => ({ ...prev, [apiModal.sourceName]: data }));
    } catch (err) {
      setApiTestResponses(prev => ({ ...prev, [apiModal.sourceName]: { erro: String(err) } }));
    } finally {
      setApiTestLoading(false);
    }
  };

  return (
    <>
      <div ref={pickerRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", width: 580, display: apiModal ? "none" : "flex", overflow: "hidden", opacity: pos.ready ? 1 : 0, pointerEvents: pos.ready ? "all" : "none" }}>
        <div style={{ width: 210, borderRight: "1px solid #E5E7EB", display: "flex", flexDirection: "column", maxHeight: 340 }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar..."
              style={{ width: "100%", padding: "5px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => { setCat(c.id); setSearch(""); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, border: "none", cursor: "pointer", background: cat === c.id ? "#EFF6FF" : "transparent", color: cat === c.id ? "#3B82F6" : "#374151", fontWeight: cat === c.id ? 600 : 400 }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxHeight: 340, position: "relative" }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {fields.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: "#9CA3AF" }}>Nenhum campo disponível</div>
            ) : fields.map(f => (
              <button key={f.key} onClick={() => handleFieldClick(f)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", fontSize: 12, border: "none", cursor: "pointer", background: "transparent", color: "#374151", textAlign: "left" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <span style={{
                  fontSize: f.icon.length > 1 ? 12 : 10,
                  fontWeight: 700,
                  color: f.icon === "#" ? "#F97316" : f.icon === "{}" ? "#3B82F6" : "#6B7280",
                  background: f.icon === "#" ? "#FFF7ED" : f.icon === "{}" ? "#EFF6FF" : "#F3F4F6",
                  borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                }}>{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>
          {activeCat.isAdditional && fields.length === 0 && (
            <div style={{ padding: "8px 14px", borderTop: "1px solid #E5E7EB", textAlign: "right", flexShrink: 0 }}>
              <button
                onClick={() => { onClose(); window.location.hash = "/configuracoes"; toast.info("Acesse Configurações → Campos adicionais para criar campos"); }}
                style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Criar campo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sub-modal: Dado de entrada da api */}
      {apiModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
          onClick={() => setApiModal(null)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Dado de entrada da api</div>
              <button onClick={() => setApiModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={16} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, background: "#EFF6FF", color: "#3B82F6", border: "1px solid #BFDBFE", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>{"{}"}</span>
                Valor selecionado
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>Escreva ou selecione um valor do json</div>
              <input
                autoFocus
                value={apiPath}
                onChange={e => setApiPath(e.target.value)}
                placeholder="Ex: data.name"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #3B82F6", borderRadius: 7, fontSize: 12, outline: "none", boxSizing: "border-box" }}
                onKeyDown={e => { if (e.key === "Enter") confirmApiPath(); }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Dados recebidos</span>
                {activeFieldOp ? null : apiModal.sourceName === "webhook" ? (
                  <button onClick={handleRefreshPayload} disabled={refreshingPayload}
                    style={{ fontSize: 11, padding: "3px 10px", background: refreshingPayload ? "#93C5FD" : "#3B82F6", color: "#fff", border: "none", borderRadius: 5, cursor: refreshingPayload ? "default" : "pointer", fontWeight: 600 }}>
                    {refreshingPayload ? "Atualizando…" : "Atualizar"}
                  </button>
                ) : (
                  <button onClick={testApiRequest} disabled={apiTestLoading}
                    style={{ fontSize: 11, padding: "3px 10px", background: apiTestLoading ? "#93C5FD" : "#3B82F6", color: "#fff", border: "none", borderRadius: 5, cursor: apiTestLoading ? "default" : "pointer", fontWeight: 600 }}>
                    {apiTestLoading ? "Testando…" : "Testar"}
                  </button>
                )}
              </div>
              {activeFieldOp ? (
                activeFieldOp.type === "analise_telefone" ? (
                  <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 7, overflow: "hidden" }}>
                    {ANALISE_TEL_FIELDS.map((f, i) => (
                      <button key={f.key}
                        onClick={() => { onInsert(`{{${(activeFieldOp as FieldOpAnaliseTel).datasourceName}.${f.key}}}`); onClose(); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 12px", background: "transparent", border: "none", borderBottom: i < ANALISE_TEL_FIELDS.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer", textAlign: "left", fontSize: 12 }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#EFF6FF")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <span style={{ fontWeight: 600, color: "#1D4ED8", minWidth: 140, flexShrink: 0 }}>{f.key}</span>
                        <span style={{ color: "#6B7280", fontFamily: "monospace", fontSize: 11 }}>{f.desc}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 7, padding: "10px 14px", fontSize: 12, color: "#166534" }}>
                    Campos disponíveis após a execução do fluxo.
                  </div>
                )
              ) : apiModal.sourceName === "webhook" ? (
                webhookPayload && typeof webhookPayload === "object" && webhookPayload !== null
                  ? <WebhookTree data={webhookPayload} onSelect={path => setApiPath(path)} selectedPath={apiPath} />
                  : (
                  <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 7, padding: "10px 14px", fontSize: 12, color: "#0369A1" }}>
                    Nenhum dado recebido ainda — envie um webhook para ver os campos disponíveis.
                  </div>
                )
              ) : (
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 7, padding: "10px 14px", fontSize: 11, color: apiTestResponses[apiModal.sourceName] ? "#374151" : "#9CA3AF", fontFamily: "monospace", maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {apiTestResponses[apiModal.sourceName]
                    ? JSON.stringify(apiTestResponses[apiModal.sourceName], null, 2)
                    : "Clique em \"Testar\" para ver o retorno da API"}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={confirmApiPath}
                style={{ padding: "8px 20px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MethodDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const methods = ["POST", "GET", "PUT", "PATCH", "DELETE"].filter(m => m.includes(search.toUpperCase()));
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#3B82F6", background: "#fff", cursor: "pointer", minWidth: 90 }}>
        {value} <ChevronDown size={12} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 130, overflow: "hidden" }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #E5E7EB" }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar..." style={{ width: "100%", padding: "4px 6px", border: "1px solid #E5E7EB", borderRadius: 4, fontSize: 11, outline: "none", boxSizing: "border-box" }} />
          </div>
          {methods.map(m => (
            <button key={m} onClick={() => { onChange(m); setOpen(false); setSearch(""); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", fontSize: 12, border: "none", cursor: "pointer", background: "transparent", color: m === value ? "#3B82F6" : "#374151", fontWeight: m === value ? 600 : 400, textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {m === value && <span style={{ color: "#3B82F6", fontSize: 10 }}>✓</span>}
              {m !== value && <span style={{ display: "inline-block", width: 14 }} />}
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [varOpen, setVarOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lines = value.split("\n");
  const insertVar = (v: string) => {
    const ta = taRef.current; if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = value.substring(0, s) + v + value.substring(e);
    onChange(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); }, 0);
  };
  return (
    <div style={{ position: "relative", border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden", background: "#FAFAFA" }}>
      <div style={{ display: "flex", maxHeight: 260 }}>
        <div style={{ padding: "8px 6px", background: "#F3F4F6", borderRight: "1px solid #E5E7EB", minWidth: 28, textAlign: "right", userSelect: "none", overflowY: "hidden" }}>
          {lines.map((_, i) => <div key={i} style={{ fontSize: 11, lineHeight: "20px", color: "#9CA3AF", fontFamily: "monospace" }}>{i + 1}</div>)}
        </div>
        <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} spellCheck={false}
          style={{ flex: 1, padding: "8px 10px", border: "none", outline: "none", resize: "none", fontSize: 12, fontFamily: "monospace", lineHeight: "20px", background: "transparent", minHeight: 120, maxHeight: 260, overflowY: "auto" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 6px", borderTop: "1px solid #E5E7EB", position: "relative" }}>
        <button onClick={() => setVarOpen(o => !o)} title="Inserir variável"
          style={{ width: 24, height: 24, borderRadius: 5, border: "1px solid #3B82F6", background: "#EFF6FF", color: "#3B82F6", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Braces size={13} />
        </button>
        {varOpen && <VarPicker onInsert={insertVar} onClose={() => setVarOpen(false)} />}
      </div>
    </div>
  );
}

function ApiPanel({ node, onClose, onDelete, onDuplicate, addApiRequest, removeApiRequest, updateApiRequest, customFieldGroups: _cfgs, openPickerTrigger }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  addApiRequest: (req: ApiRequest) => void;
  removeApiRequest: (reqId: string) => void;
  updateApiRequest: (reqId: string, data: Partial<ApiRequest>) => void;
  customFieldGroups: CustomFieldGroup[];
  openPickerTrigger?: number;
}) {
  const requests = node.apiConfig?.requests ?? [];
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);

  useEffect(() => {
    if (openPickerTrigger && openPickerTrigger > 0) {
      setShowTypePicker(true);
      setSelectedReqId(null);
    }
  }, [openPickerTrigger]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advTab, setAdvTab] = useState<"headers" | "params" | "body" | "responseHeaders">("headers");
  const [urlVarOpen, setUrlVarOpen] = useState(false);

  const selectedReq = requests.find(r => r.id === selectedReqId) ?? null;

  const handleAddRequest = (type: "json" | "file") => {
    const idx = requests.length + 1;
    const req: ApiRequest = {
      id: `req${Date.now()}`, name: `Api-request-${idx}`, type,
      method: type === "json" ? "POST" : "GET", url: "",
      headers: [], params: [], body: type === "json" ? "{\n\n}" : "",
      responseHeaders: [],
    };
    addApiRequest(req);
    setSelectedReqId(req.id);
    setShowTypePicker(false);
  };

  const upd = (data: Partial<ApiRequest>) => { if (selectedReqId) updateApiRequest(selectedReqId, data); };

  const addKV = (field: "headers" | "params" | "responseHeaders") => {
    if (!selectedReq) return;
    upd({ [field]: [...selectedReq[field], { key: "", value: "" }] });
  };
  const removeKV = (field: "headers" | "params" | "responseHeaders", i: number) => {
    if (!selectedReq) return;
    upd({ [field]: selectedReq[field].filter((_, idx) => idx !== i) });
  };
  const updateKV = (field: "headers" | "params" | "responseHeaders", i: number, key: string, value: string) => {
    if (!selectedReq) return;
    const arr = [...selectedReq[field]]; arr[i] = { key, value }; upd({ [field]: arr });
  };

  const insertUrlVar = (v: string) => { if (!selectedReq) return; upd({ url: selectedReq.url + v }); };

  // ── Left config panel ───────────────────────────────────────────────────────
  const leftPanel = selectedReq ? (
    <div style={{ width: 300, minWidth: 300, display: "flex", flexDirection: "column", borderRight: showAdvanced ? "1px solid #E5E5E5" : "none", height: "100%" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <button onClick={() => { setSelectedReqId(null); setShowAdvanced(false); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#111", padding: 0, marginBottom: 4 }}>
          <ArrowLeft size={15} />{selectedReq.type === "json" ? "Requisição HTTP com comunicação via JSON" : "Requisição de arquivo HTTP"}
        </button>
        <p style={{ fontSize: 11, color: "#6B7280", margin: 0, paddingLeft: 21 }}>{API_REQUEST_TYPES.find(t => t.id === selectedReq.type)?.description}</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>Fonte de dados</div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6", background: "#EFF6FF", borderRadius: 5, padding: "3px 10px" }}>{selectedReq.name}</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>Método</div>
          <select value={selectedReq.method} onChange={e => upd({ method: e.target.value })}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", cursor: "pointer" }}>
            {["POST", "GET", "PUT", "PATCH", "DELETE"].map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>Url da requisição</div>
          <div style={{ position: "relative" }}>
            <textarea value={selectedReq.url} onChange={e => upd({ url: e.target.value })} placeholder="https://..." rows={3}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", resize: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4, position: "relative" }}>
              <button onClick={() => navigator.clipboard?.writeText(selectedReq.url)} title="Copiar"
                style={{ width: 24, height: 24, border: "1px solid #E5E7EB", borderRadius: 4, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
                <Copy size={12} />
              </button>
              <div style={{ position: "relative" }}>
                <button onClick={() => setUrlVarOpen(o => !o)} title="Inserir variável"
                  style={{ width: 24, height: 24, border: "1px solid #3B82F6", borderRadius: 4, background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3B82F6", fontSize: 11, fontWeight: 700 }}>
                  <Braces size={13} />
                </button>
                {urlVarOpen && <VarPicker onInsert={insertUrlVar} onClose={() => setUrlVarOpen(false)} />}
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => setShowAdvanced(true)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#3B82F6", fontSize: 12, fontWeight: 500, padding: 0 }}>
          Configurações avançadas <ChevronRight size={14} />
        </button>
      </div>
    </div>
  ) : (
    <div style={{ width: 300, minWidth: 300, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111", padding: 0 }}>
            <ArrowLeft size={16} /> API
          </button>
          <div style={{ display: "flex", gap: 2 }}>
            {([{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }] as const).map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}><Icon size={13} /></button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Faça chamadas a APIs externas para integrar com outros sistemas ou serviços.</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {requests.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {requests.map(req => (
              <div key={req.id} onClick={() => { setSelectedReqId(req.id); setShowAdvanced(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #BFDBFE", borderRadius: 7, cursor: "pointer", background: "#EFF6FF" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#DBEAFE")} onMouseLeave={e => (e.currentTarget.style.background = "#EFF6FF")}>
                {req.type === "json" ? <Braces size={14} color="#3B82F6" /> : <FileDown size={14} color="#3B82F6" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {req.type === "json" ? "Requisição HTTP com comunicação..." : "Requisição de arquivo HTTP"}
                  </div>
                  <div style={{ fontSize: 11, color: "#3B82F6" }}>{req.method}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#3B82F6", background: "#DBEAFE", borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>{req.name}</span>
                <button onClick={e => { e.stopPropagation(); removeApiRequest(req.id); }}
                  style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")} onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowTypePicker(true)}
          style={{ width: "100%", border: "1px dashed #BFDBFE", background: "#EFF6FF", color: "#3B82F6", fontSize: 12, padding: "8px 0", borderRadius: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          onMouseEnter={e => { e.currentTarget.style.background = "#DBEAFE"; }} onMouseLeave={e => { e.currentTarget.style.background = "#EFF6FF"; }}>
          <Plus size={13} /> Adicionar API
        </button>
      </div>
    </div>
  );

  // ── Advanced config panel ───────────────────────────────────────────────────
  const tabs = selectedReq?.type === "file"
    ? (["headers", "params", "body", "responseHeaders"] as const)
    : (["headers", "params", "body"] as const);

  const advPanel = selectedReq && showAdvanced ? (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Configurações avançadas</div>
      </div>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E5E5", flexShrink: 0, display: "flex", gap: 8, alignItems: "center" }}>
        <MethodDropdown value={selectedReq.method} onChange={v => upd({ method: v })} />
        <div style={{ flex: 1, position: "relative", display: "flex", gap: 4 }}>
          <input value={selectedReq.url} onChange={e => upd({ url: e.target.value })} placeholder="https://..."
            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none" }} />
          <button onClick={() => navigator.clipboard?.writeText(selectedReq.url)} title="Copiar"
            style={{ width: 28, height: 28, border: "1px solid #E5E7EB", borderRadius: 5, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0 }}>
            <Copy size={12} />
          </button>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={() => setUrlVarOpen(o => !o)} title="Inserir variável"
              style={{ width: 28, height: 28, border: "1px solid #3B82F6", borderRadius: 5, background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3B82F6", fontSize: 12, fontWeight: 700 }}>
              <Braces size={13} />
            </button>
            {urlVarOpen && <VarPicker onInsert={insertUrlVar} onClose={() => setUrlVarOpen(false)} />}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setAdvTab(tab as typeof advTab)}
            style={{ flex: 1, padding: "8px 4px", border: "none", background: "transparent", borderBottom: `2px solid ${advTab === tab ? "#3B82F6" : "transparent"}`, fontSize: 12, fontWeight: advTab === tab ? 600 : 400, color: advTab === tab ? "#3B82F6" : "#6B7280", cursor: "pointer" }}>
            {tab === "headers" ? "Cabeçalho" : tab === "params" ? "Parâmetros" : tab === "body" ? "Corpo" : "Resposta do Cabeçalho"}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {advTab === "body" ? (
          <BodyEditor value={selectedReq.body} onChange={v => upd({ body: v })} />
        ) : (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(advTab === "headers" ? selectedReq.headers : advTab === "params" ? selectedReq.params : selectedReq.responseHeaders).map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input value={h.key} onChange={e => updateKV(advTab as "headers" | "params" | "responseHeaders", i, e.target.value, h.value)} placeholder="Chave"
                    style={{ flex: 1, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, outline: "none" }} />
                  <input value={h.value} onChange={e => updateKV(advTab as "headers" | "params" | "responseHeaders", i, h.key, e.target.value)} placeholder="Valor"
                    style={{ flex: 1, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, outline: "none" }} />
                  <button onClick={() => removeKV(advTab as "headers" | "params" | "responseHeaders", i)}
                    style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")} onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}><X size={11} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => addKV(advTab as "headers" | "params" | "responseHeaders")}
              style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", border: "0.5px dashed #E5E5E5", borderRadius: 6, background: "transparent", color: "#6B7280", fontSize: 11, cursor: "pointer" }}>
              <Plus size={11} /> Adicionar
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <aside style={{ width: selectedReq && showAdvanced ? 820 : 300, minWidth: selectedReq && showAdvanced ? 820 : 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "row", flexShrink: 0, overflow: "hidden" }}>
        {leftPanel}
        {advPanel}
      </aside>
      {/* Type picker dialog */}
      <Dialog open={showTypePicker} onOpenChange={setShowTypePicker}>
        <DialogContent style={{ maxWidth: 480, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 280 }}>
            <div style={{ width: 140, borderRight: "1px solid #E5E5E5", padding: "16px 0" }}>
              <div style={{ padding: "0 12px 12px", fontSize: 13, fontWeight: 600, color: "#111" }}>Adicionar API</div>
              <button style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "#EFF6FF", border: "none", borderLeft: "2px solid #3B82F6", cursor: "pointer", fontSize: 12, color: "#3B82F6", fontWeight: 600 }}>
                <Globe size={14} /> HTTP
              </button>
            </div>
            <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {API_REQUEST_TYPES.map(t => (
                <button key={t.id} onClick={() => handleAddRequest(t.id)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer", background: "#fff", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#3B82F6")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}>
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {t.id === "json" ? <Braces size={15} color="#3B82F6" /> : <FileDown size={15} color="#3B82F6" />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 3 }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.4 }}>{t.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── CamposValueInput ────────────────────────────────────────────────────────

function CamposValueInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const insertVar = (v: string) => {
    const el = taRef.current;
    if (el) {
      const s = el.selectionStart ?? value.length;
      const e = el.selectionEnd ?? value.length;
      const next = value.substring(0, s) + v + value.substring(e);
      onChange(next);
      setTimeout(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length); }, 0);
    } else {
      onChange(value + v);
    }
    setVarOpen(false);
  };

  const tokens = useMemo(() => {
    const parts: { type: "text" | "var"; content: string }[] = [];
    const regex = /\{\{([^}]+)\}\}/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(value)) !== null) {
      if (m.index > last) parts.push({ type: "text", content: value.slice(last, m.index) });
      parts.push({ type: "var", content: m[1] });
      last = m.index + m[0].length;
    }
    if (last < value.length) parts.push({ type: "text", content: value.slice(last) });
    return parts;
  }, [value]);

  const varLabel = (key: string) => {
    const dot = key.indexOf(".");
    if (dot < 0) return key;
    return `[${key.slice(0, dot)}] ${key.slice(dot + 1)}`;
  };

  const varColor = (key: string) => {
    if (key.startsWith("gatilho")) return "#22C55E";
    if (key.startsWith("campo_")) return "#F59E0B";
    if (key.startsWith("ia.")) return "#8B5CF6";
    return "#6366F1";
  };

  const sharedBoxStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6,
    fontSize: 12, boxSizing: "border-box", lineHeight: 1.6, minHeight: 62,
  };

  return (
    <div style={{ position: "relative" }}>
      {editing ? (
        <textarea
          ref={taRef}
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => { setTimeout(() => { if (!varOpen) setEditing(false); }, 120); }}
          rows={3}
          style={{ ...sharedBoxStyle, outline: "none", resize: "vertical", border: "1px solid #3B82F6", fontFamily: "inherit" }}
        />
      ) : (
        <div
          onClick={() => { setEditing(true); setTimeout(() => taRef.current?.focus(), 0); }}
          style={{ ...sharedBoxStyle, cursor: "text", display: "flex", flexWrap: "wrap", gap: "4px 3px", alignContent: "flex-start" }}
        >
          {value === "" ? (
            <span style={{ color: "#9CA3AF", fontSize: 12 }}>{placeholder ?? "Digite um valor ou use {} para inserir variável..."}</span>
          ) : tokens.map((t, i) =>
            t.type === "var" ? (
              <span key={i} style={{ background: varColor(t.content), color: "#fff", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600, lineHeight: "18px", display: "inline-flex", alignItems: "center" }}>
                {varLabel(t.content)}
              </span>
            ) : (
              <span key={i} style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#111", lineHeight: "22px" }}>{t.content}</span>
            )
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); toast.success("Copiado!"); }}
          style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0 }}
        ><Copy size={12} /></button>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setEditing(true); setVarOpen(o => !o); }}
            style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #BFDBFE", background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3B82F6", flexShrink: 0, fontSize: 11, fontWeight: 700 }}
          ><Braces size={13} /></button>
          {varOpen && <VarPicker onInsert={insertVar} onClose={() => { setVarOpen(false); }} />}
        </div>
      </div>
    </div>
  );
}

// ─── FieldDestPicker ─────────────────────────────────────────────────────────

function FieldDestPicker({ onSelect, onClose, customFieldGroups }: {
  onSelect: (fieldKey: string, fieldLabel: string) => void;
  onClose: () => void;
  customFieldGroups: import("@/data/mockData").CustomFieldGroup[];
}) {
  const [cat, setCat] = useState("lead");
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; ready: boolean }>({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    const el = pickerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const W = 480, H = 300, GAP = 4, MARGIN = 8;
    let left = rect.left;
    if (left + W > window.innerWidth - MARGIN) left = window.innerWidth - W - MARGIN;
    if (left < MARGIN) left = MARGIN;
    let top = rect.bottom + GAP;
    if (top + H > window.innerHeight - MARGIN) top = rect.top - H - GAP;
    setPos({ top, left, ready: true });
  }, []);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  const categories = useMemo((): DestCategory[] => {
    return DEST_FIELD_CATEGORIES.map(c => {
      if (c.id === "campos_lead") {
        const fields = customFieldGroups.flatMap(g =>
          g.items.map(i => ({ key: `campo_lead.${i.id}`, label: `${g.name}: ${i.label}` }))
        );
        return { ...c, fields };
      }
      if (c.id === "campos_neg") {
        const fields = customFieldGroups.flatMap(g =>
          g.items.map(i => ({ key: `campo_neg.${i.id}`, label: `${g.name}: ${i.label}` }))
        );
        return { ...c, fields };
      }
      if (c.id === "campos_empresa") {
        const fields = customFieldGroups.flatMap(g =>
          g.items.map(i => ({ key: `campo_empresa.${i.id}`, label: `${g.name}: ${i.label}` }))
        );
        return { ...c, fields };
      }
      return c;
    });
  }, [customFieldGroups]);

  const activeCat = categories.find(c => c.id === cat) ?? categories[0];
  const fields = activeCat.fields.filter(f => !search || f.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={pickerRef} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", width: 480, display: "flex", overflow: "hidden", opacity: pos.ready ? 1 : 0, pointerEvents: pos.ready ? "all" : "none" }}>
      <div style={{ width: 180, borderRight: "1px solid #E5E7EB", display: "flex", flexDirection: "column", maxHeight: 300 }}>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar..."
            style={{ width: "100%", padding: "5px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 12, outline: "none", boxSizing: "border-box" as const }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {categories.map(c => (
            <button key={c.id} onClick={() => { setCat(c.id); setSearch(""); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", fontSize: 12, border: "none", cursor: "pointer", background: cat === c.id ? "#F0FDF4" : "transparent", color: cat === c.id ? "#16A34A" : "#374151", fontWeight: cat === c.id ? 600 : 400 }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", maxHeight: 300 }}>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {fields.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: "#9CA3AF" }}>
              {activeCat.isAdditional ? "Nenhum campo adicional criado." : "Nenhum campo disponível"}
            </div>
          ) : fields.map(f => (
            <button key={f.key} onClick={() => { onSelect(f.key, f.label); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", fontSize: 12, border: "none", cursor: "pointer", background: "transparent", color: "#374151", textAlign: "left" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#22C55E", background: "#F0FDF4", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>T</span>
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CamposPanel ─────────────────────────────────────────────────────────────

const OUTROS_OP_TYPES = [
  { type: "loop_array"       as const, Icon: Brackets, label: "Loop de array",       sub: "Itera sobre um array de dados" },
  { type: "analise_telefone" as const, Icon: Phone,    label: "Análise de telefone",  sub: "Analisa um número de telefone" },
  { type: "formatacao_data"  as const, Icon: Calendar, label: "Formatação de data",   sub: "Formatação e manipulação de data" },
];

function CamposPanel({ node, onClose, onDelete, onDuplicate, addFieldOp, removeFieldOp, updateFieldOp, customFieldGroups }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  addFieldOp: (op: FieldOperation) => void;
  removeFieldOp: (opId: string) => void;
  updateFieldOp: (opId: string, data: Record<string, unknown>) => void;
  customFieldGroups: import("@/data/mockData").CustomFieldGroup[];
}) {
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [destPickerOpen, setDestPickerOpen] = useState(false);
  const [paramPickerOpen, setParamPickerOpen] = useState(false);
  const [showOutrasPicker, setShowOutrasPicker] = useState(false);
  const fieldOps = node.fieldOps ?? [];
  const selectedOp = fieldOps.find(o => o.id === selectedOpId) ?? null;

  const nextDsName = (prefix: string) => {
    const count = fieldOps.filter(o => o.type !== "mapeamento" && (o as FieldOpLoopArray).datasourceName?.startsWith(prefix)).length;
    return `${prefix}-${count + 1}`;
  };

  const handleAddMapeamento = () => {
    const op: FieldOpMapeamento = { id: `fo${Date.now()}`, type: "mapeamento", fieldKey: "", fieldLabel: "", value: "" };
    addFieldOp(op);
    setSelectedOpId(op.id);
  };

  const handleAddOutra = (type: "loop_array" | "analise_telefone" | "formatacao_data") => {
    setShowOutrasPicker(false);
    let op: FieldOperation;
    if (type === "loop_array") {
      op = { id: `fo${Date.now()}`, type: "loop_array", datasourceName: nextDsName("array"), datasourceColor: "#6366F1", paramKey: "", paramLabel: "" };
    } else if (type === "analise_telefone") {
      op = { id: `fo${Date.now()}`, type: "analise_telefone", phone: "", datasourceName: nextDsName("phone"), datasourceColor: "#6366F1", defaultCountry: "BR" };
    } else {
      op = { id: `fo${Date.now()}`, type: "formatacao_data", date: "", timezone: "America/Sao_Paulo", addAmount: 0, addUnit: "dias", datasourceName: nextDsName("date"), datasourceColor: "#22C55E" };
    }
    addFieldOp(op);
    setSelectedOpId(op.id);
  };

  const panelHeader = (title: string, subtitle: string, onBack: () => void) => (
    <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
          <ArrowLeft size={16} /> {title}
        </button>
        <div style={{ display: "flex", gap: 2 }}>
          {([{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }] as const).map(({ Icon, action, color, hover }, i) => (
            <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
              onMouseEnter={e => (e.currentTarget.style.background = hover)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            ><Icon size={13} /></button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>{subtitle}</p>
    </div>
  );

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selectedOpId && selectedOp) {
    // ── Mapeamento de campo ──────────────────────────────────────────────────
    if (selectedOp.type === "mapeamento") {
      const op = selectedOp as FieldOpMapeamento;
      return (
        <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
            <button onClick={() => setSelectedOpId(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
              <ArrowLeft size={16} /> Mapeamento de campo
            </button>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Realiza operações de mapeamento de campos (do sistema, fonte de dados,...)</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Campo de destino</label>
                <div style={{ position: "relative" }}>
                  <button
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, background: "#fff", cursor: "pointer", color: op.fieldKey ? "#111" : "#9CA3AF" }}
                    onClick={() => setDestPickerOpen(v => !v)}
                  >
                    <span>{op.fieldLabel || "Selecionar"}</span>
                    <ChevronDown size={12} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                  </button>
                  {destPickerOpen && (
                    <FieldDestPicker
                      customFieldGroups={customFieldGroups}
                      onSelect={(key, label) => { updateFieldOp(op.id, { fieldKey: key, fieldLabel: label }); setDestPickerOpen(false); }}
                      onClose={() => setDestPickerOpen(false)}
                    />
                  )}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Valor que será atribuído ao campo</label>
                <CamposValueInput
                  value={op.value}
                  onChange={v => updateFieldOp(op.id, { value: v })}
                  placeholder="Digite um valor ou use {{variável}}..."
                />
              </div>
            </div>
          </div>
        </aside>
      );
    }

    // ── Loop de array ────────────────────────────────────────────────────────
    if (selectedOp.type === "loop_array") {
      const op = selectedOp as FieldOpLoopArray;
      return (
        <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
            <button onClick={() => setSelectedOpId(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
              <ArrowLeft size={16} /> Loop de array
            </button>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Itera sobre um array de dados</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Fonte de dados</label>
                <span style={{ fontSize: 11, fontWeight: 700, background: op.datasourceColor, color: "#fff", borderRadius: 6, padding: "3px 8px" }}>{op.datasourceName}</span>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Parâmetro</label>
                <div style={{ position: "relative" }}>
                  <button
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, background: "#fff", cursor: "pointer", color: op.paramKey ? "#111" : "#9CA3AF" }}
                    onClick={() => setParamPickerOpen(v => !v)}
                  >
                    <span>{op.paramLabel || "Selecionar"}</span>
                    <ChevronDown size={12} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                  </button>
                  {paramPickerOpen && (
                    <FieldDestPicker
                      customFieldGroups={customFieldGroups}
                      onSelect={(key, label) => { updateFieldOp(op.id, { paramKey: key, paramLabel: label }); setParamPickerOpen(false); }}
                      onClose={() => setParamPickerOpen(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>
      );
    }

    // ── Análise de telefone ──────────────────────────────────────────────────
    if (selectedOp.type === "analise_telefone") {
      const op = selectedOp as FieldOpAnaliseTel;
      return (
        <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
            <button onClick={() => setSelectedOpId(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
              <ArrowLeft size={16} /> Análise de telefone
            </button>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Analisa um número de telefone</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Fonte de dados com o resultado</label>
                <span style={{ fontSize: 11, fontWeight: 700, background: op.datasourceColor, color: "#fff", borderRadius: 6, padding: "3px 8px" }}>{op.datasourceName}</span>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Telefone</label>
                <CamposValueInput
                  value={op.phone}
                  onChange={v => updateFieldOp(op.id, { phone: v })}
                  placeholder="Número de telefone ou {{variável}}..."
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>País padrão</label>
                <select
                  value={op.defaultCountry}
                  onChange={e => updateFieldOp(op.id, { defaultCountry: e.target.value })}
                  style={{ width: "100%", height: 34, padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", background: "#fff", outline: "none" }}
                >
                  <option value="BR">Brasil (BR)</option>
                  <option value="US">Estados Unidos (US)</option>
                  <option value="PT">Portugal (PT)</option>
                  <option value="AR">Argentina (AR)</option>
                </select>
              </div>
            </div>
          </div>
        </aside>
      );
    }

    // ── Formatação de data ───────────────────────────────────────────────────
    if (selectedOp.type === "formatacao_data") {
      const op = selectedOp as FieldOpFormatacaoData;
      return (
        <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
            <button onClick={() => setSelectedOpId(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
              <ArrowLeft size={16} /> Formatação de data
            </button>
            <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Formatação e manipulação de data</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Fonte de dados com o resultado</label>
                <span style={{ fontSize: 11, fontWeight: 700, background: op.datasourceColor, color: "#fff", borderRadius: 6, padding: "3px 8px" }}>{op.datasourceName}</span>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Data</label>
                <CamposValueInput
                  value={op.date}
                  onChange={v => updateFieldOp(op.id, { date: v })}
                  placeholder="Data ou {{variável}}..."
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Fuso horário</label>
                <select
                  value={op.timezone}
                  onChange={e => updateFieldOp(op.id, { timezone: e.target.value })}
                  style={{ width: "100%", height: 34, padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", background: "#fff", outline: "none" }}
                >
                  <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                  <option value="America/Manaus">America/Manaus (AMT)</option>
                  <option value="America/Belem">America/Belem (BRT)</option>
                  <option value="America/Fortaleza">America/Fortaleza (BRT)</option>
                  <option value="America/Recife">America/Recife (BRT)</option>
                  <option value="America/Noronha">America/Noronha (FNT)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Adicionar tempo à data</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    value={op.addAmount}
                    onChange={e => updateFieldOp(op.id, { addAmount: Number(e.target.value) })}
                    style={{ flex: 1, height: 34, padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", background: "#fff", outline: "none" }}
                  />
                  <select
                    value={op.addUnit}
                    onChange={e => updateFieldOp(op.id, { addUnit: e.target.value })}
                    style={{ flex: 1, height: 34, padding: "0 8px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", background: "#fff", outline: "none" }}
                  >
                    <option value="segundos">Segundos</option>
                    <option value="minutos">Minutos</option>
                    <option value="horas">Horas</option>
                    <option value="dias">Dias</option>
                    <option value="semanas">Semanas</option>
                    <option value="meses">Meses</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </aside>
      );
    }
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {panelHeader("Operações de campos", "Realize operações com campos do sistema, campos adicionais ou fontes de dados. Clique para adicionar uma operação de campo:", onClose)}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {fieldOps.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {fieldOps.map(op => {
              const isMap = op.type === "mapeamento";
              const dsColor = !isMap ? (op as FieldOpLoopArray).datasourceColor : undefined;
              const dsName  = !isMap ? (op as FieldOpLoopArray).datasourceName : undefined;
              const OpIcon  = op.type === "loop_array" ? Brackets : op.type === "analise_telefone" ? Phone : op.type === "formatacao_data" ? Calendar : ArrowLeftRight;
              const opTitle = isMap ? ((op as FieldOpMapeamento).fieldLabel || "Selecionar campo") : op.type === "loop_array" ? "Loop de array" : op.type === "analise_telefone" ? "Análise de telefone" : "Formatação de data";
              const opSub   = isMap && (op as FieldOpMapeamento).value ? `= ${(op as FieldOpMapeamento).value}` : null;
              return (
                <div key={op.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8, cursor: "pointer" }}
                  onClick={() => setSelectedOpId(op.id)}
                  onMouseEnter={e => (e.currentTarget.style.background = "#DCFCE7")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#F0FDF4")}
                >
                  <OpIcon size={13} color="#22C55E" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opTitle}</div>
                    {opSub && <div style={{ fontSize: 10, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{opSub}</div>}
                  </div>
                  {dsName && <span style={{ fontSize: 9, fontWeight: 700, background: dsColor, color: "#fff", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{dsName}</span>}
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); removeFieldOp(op.id); }}
                    style={{ width: 18, height: 18, border: "none", background: "transparent", cursor: "pointer", color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 3, padding: 0, flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FEE2E2"; e.currentTarget.style.color = "#EF4444"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9CA3AF"; }}
                  ><X size={11} /></button>
                </div>
              );
            })}
          </div>
        )}
        {fieldOps.length === 0 && (
          <div style={{ fontSize: 12, color: "#9CA3AF", paddingTop: 4, lineHeight: 1.5 }}>Nenhuma operação adicionada ainda.</div>
        )}
      </div>
      <div style={{ borderTop: "1px solid #E5E5E5", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <button onClick={handleAddMapeamento}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "1px dashed #86EFAC", borderRadius: 8, background: "#F9FAFB", color: "#22C55E", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F0FDF4"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F9FAFB"; }}
        >
          <Plus size={13} /> Adicionar mapeamento de campo
        </button>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowOutrasPicker(v => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "1px dashed #E5E5E5", borderRadius: 8, background: "#F9FAFB", color: "#22C55E", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#F0FDF4"; e.currentTarget.style.borderColor = "#86EFAC"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#E5E5E5"; }}
          >
            <Plus size={13} /> Adicionar outra operação de campo
          </button>
          {showOutrasPicker && (
            <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 20, overflow: "hidden" }}>
              {OUTROS_OP_TYPES.map(({ type, Icon: OpIcon, label, sub }) => (
                <button key={type} onClick={() => handleAddOutra(type)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F0FDF4")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <OpIcon size={15} color="#22C55E" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#6B7280" }}>{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── AcoesPanel helpers ───────────────────────────────────────────────────────

function AcoesFieldInput({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [varOpen, setVarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const insertVar = (v: string) => {
    const el = inputRef.current;
    if (!el) { onChange(value + v); return; }
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.substring(0, s) + v + value.substring(e);
    onChange(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length); }, 0);
  };
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", position: "relative" }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, height: 34, padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", background: "#fff" }}
      />
      <button
        onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); toast.success("Copiado!"); }}
        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0 }}
      ><Copy size={12} /></button>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button
          onClick={() => setVarOpen(o => !o)}
          style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #BFDBFE", background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3B82F6", flexShrink: 0, fontSize: 11, fontWeight: 700 }}
        ><Braces size={13} /></button>
        {varOpen && <VarPicker onInsert={insertVar} onClose={() => setVarOpen(false)} />}
      </div>
    </div>
  );
}

function AcoesFieldTextarea({ value, onChange, placeholder, rows = 4 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [varOpen, setVarOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const insertVar = (v: string) => {
    const el = taRef.current;
    if (!el) { onChange(value + v); return; }
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.substring(0, s) + v + value.substring(e);
    onChange(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length); }, 0);
  };
  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ width: "100%", padding: "8px 38px 8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
      />
      <button
        type="button"
        onClick={() => setVarOpen(o => !o)}
        title="Inserir variável"
        style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 6, border: "1px solid #BFDBFE", background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3B82F6", zIndex: 2 }}
      ><Braces size={13} /></button>
      {varOpen && <VarPicker onInsert={insertVar} onClose={() => setVarOpen(false)} />}
    </div>
  );
}

function AcoesSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: "100%", height: 34, padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: value ? "#111" : "#9CA3AF", background: "#fff", outline: "none", cursor: "pointer" }}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── TagMultiSelect ───────────────────────────────────────────────────────────

function TagMultiSelect({ selectedIds, onChange, crmTags, addTag }: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  crmTags: CrmTagType[];
  addTag: (name: string, description: string, color: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const TAG_COLORS = ["#EF4444","#F97316","#EAB308","#22C55E","#14B8A6","#3B82F6","#8B5CF6","#EC4899","#6B7280","#92400E"];
  const filtered = crmTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreateMode(false); }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      {selectedIds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {selectedIds.map(id => {
            const tag = crmTags.find(t => t.id === id);
            if (!tag) return null;
            return (
              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: tag.color ? tag.color + "28" : "#E5E7EB", color: tag.color || "#374151", border: `1px solid ${tag.color || "#D1D5DB"}44`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>
                {tag.name}
                <button onClick={() => onChange(selectedIds.filter(i => i !== id))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", color: "inherit", opacity: 0.7 }}>
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <button onClick={() => { setOpen(v => !v); setCreateMode(false); setSearch(""); }}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer", color: selectedIds.length === 0 ? "#9CA3AF" : "#374151" }}>
        <span>{selectedIds.length === 0 ? "Selecione as tags" : `${selectedIds.length} tag${selectedIds.length > 1 ? "s" : ""} selecionada${selectedIds.length > 1 ? "s" : ""}`}</span>
        <ChevronDown size={12} style={{ color: "#9CA3AF" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", maxHeight: 260 }}>
          {!createMode && (
            <div style={{ padding: "8px 8px 4px" }}>
              <input type="text" placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...tcpInputStyle, fontSize: 11 }} autoFocus />
            </div>
          )}
          {!createMode && (
            <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
              {filtered.length === 0 && <div style={{ padding: "8px 12px", fontSize: 11, color: "#9CA3AF" }}>Nenhuma tag encontrada.</div>}
              {filtered.map(tag => {
                const checked = selectedIds.includes(tag.id);
                return (
                  <div key={tag.id} onClick={() => onChange(checked ? selectedIds.filter(i => i !== tag.id) : [...selectedIds, tag.id])}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", cursor: "pointer", background: checked ? "#EFF6FF" : "transparent" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", background: tag.color ? tag.color + "28" : "#E5E7EB", color: tag.color || "#374151", border: `1px solid ${tag.color || "#D1D5DB"}44`, borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 500 }}>
                      {tag.name}
                    </span>
                    {checked && <CheckCircle2 size={12} style={{ color: "#3B82F6" }} />}
                  </div>
                );
              })}
            </div>
          )}
          {createMode && (
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="text" placeholder="Nome da tag..." value={newName} onChange={e => setNewName(e.target.value)} style={{ ...tcpInputStyle, fontSize: 11 }} autoFocus onKeyDown={e => { if (e.key === "Escape") setCreateMode(false); }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {TAG_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} style={{ width: 18, height: 18, borderRadius: "50%", background: c, flexShrink: 0, border: newColor === c ? "2px solid #111" : "1.5px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setCreateMode(false)} style={{ fontSize: 11, color: "#6B7280", background: "none", border: "none", cursor: "pointer" }}>Cancelar</button>
                <button disabled={!newName.trim() || creating} onClick={async () => {
                  if (!newName.trim() || creating) return;
                  setCreating(true);
                  const ok = await addTag(newName.trim(), "", newColor);
                  setCreating(false);
                  if (ok) { setNewName(""); setCreateMode(false); }
                }} style={{ fontSize: 11, background: "#3B82F6", color: "#FFF", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", opacity: !newName.trim() || creating ? 0.5 : 1 }}>
                  {creating ? "Criando..." : "Criar"}
                </button>
              </div>
            </div>
          )}
          {!createMode && (
            <div style={{ padding: "6px 8px", borderTop: "0.5px solid #F3F4F6", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setCreateMode(true); setSearch(""); setNewName(""); setNewColor("#3B82F6"); }} style={{ fontSize: 11, color: "#3B82F6", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Criar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NegociosConfigForm({ item, updateActionItem, pipelines, teamMembers, products, lossReasons }: {
  item: ActionItem;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
  pipelines: Pipeline[];
  teamMembers: string[];
  products: ProductType[];
  lossReasons: LossReasonType[];
}) {
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateActionItem(item.id, { [key]: val });
  const lbl = (text: string) => (
    <label style={{ fontSize: 11, fontWeight: 600, color: "#F97316", display: "block", marginBottom: 4 }}>{text}</label>
  );
  const grp = (children: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>{children}</div>
  );

  const PipelineStageSelect = ({ verbAction, required = false }: { verbAction: string; required?: boolean }) => {
    const selPipeline = pipelines.find(p => p.id === (cfg.pipeline as string));
    const stageOpts = selPipeline
      ? selPipeline.columns.map(c => ({ value: c.id, label: c.title }))
      : pipelines.flatMap(p => p.columns.map(c => ({ value: c.id, label: `${p.name} › ${c.title}` })));
    return (
      <>
        {grp(<>{lbl(required ? "Pipeline" : "Pipeline (opcional)")}
          <AcoesSelect value={(cfg.pipeline as string) ?? ""} onChange={v => { set("pipeline", v); set("etapa", ""); }}
            placeholder={required ? "Selecione o pipeline..." : undefined}
            options={required
              ? pipelines.map(p => ({ value: p.id, label: p.name }))
              : [{ value: "", label: "Todas as pipelines" }, ...pipelines.map(p => ({ value: p.id, label: p.name }))]}
          />
        </>)}
        {grp(<>{lbl(`Etapa em que o negócio será ${verbAction}`)}
          <AcoesSelect value={(cfg.etapa as string) ?? ""} onChange={v => set("etapa", v)}
            placeholder="Selecione a etapa..." options={stageOpts}
          />
        </>)}
      </>
    );
  };

  switch (item.actionId) {
    case "criar_negocio":
      // Diferente de mover_etapa/duplicar_negocio: "criar negócio" sempre resulta
      // num negócio de verdade, então pipeline+etapa são obrigatórios (validado
      // também no automation-runner, que recusa executar sem os dois).
      return <PipelineStageSelect verbAction="criado" required />;

    case "mover_etapa":
      return <PipelineStageSelect verbAction="movido" />;

    case "ganhar_negocio":
    case "restaurar_negocio":
      return <div style={{ paddingTop: 12, fontSize: 12, color: "#6B7280" }}>Nenhuma configuração adicional necessária.</div>;

    case "perder_negocio":
      return (
        <>
          {grp(<>{lbl("Selecione o motivo")}
            <AcoesSelect value={(cfg.motivo as string) ?? ""} onChange={v => set("motivo", v)} placeholder="Selecione o motivo..."
              options={[...lossReasons.map(lr => ({ value: lr.id, label: lr.name })), { value: "outro", label: "Outro" }]}
            />
          </>)}
          {grp(<>{lbl("Justificativa")}<AcoesFieldTextarea value={(cfg.justificativa as string) ?? ""} onChange={v => set("justificativa", v)} placeholder="Digite a justificativa..." rows={4} /></>)}
        </>
      );

    case "transf_atend_neg":
      return (
        <>
          {grp(<>{lbl("Selecione o atendente")}
            <AcoesSelect value={(cfg.atendente as string) ?? ""} onChange={v => set("atendente", v)} placeholder="Selecione o atendente..."
              options={[{ value: "", label: "Qualquer atendente disponível" }, ...teamMembers.map(m => ({ value: m, label: m }))]}
            />
          </>)}
          {grp(
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E5E7EB" }}>
              <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>Transferir o mesmo atendente como responsável do lead?</span>
              <Switch checked={!!(cfg.transf_responsavel)} onCheckedChange={v => set("transf_responsavel", v)} />
            </div>
          )}
        </>
      );

    case "duplicar_negocio":
      return <PipelineStageSelect verbAction="duplicado" />;

    case "remover_atend_neg":
      return grp(
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E5E7EB" }}>
          <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>Remover o atendente responsável do lead?</span>
          <Switch checked={!!(cfg.remover_responsavel)} onCheckedChange={v => set("remover_responsavel", v)} />
        </div>
      );

    case "add_produto_neg":
      return (
        <>
          {grp(<>{lbl("Selecione o produto")}
            <AcoesSelect value={(cfg.produto as string) ?? ""} onChange={v => set("produto", v)} placeholder="Selecione o produto..."
              options={products.map(p => ({ value: p.id, label: p.name }))}
            />
          </>)}
          {grp(<>{lbl("SKU")}<AcoesFieldInput value={(cfg.sku as string) ?? ""} onChange={v => set("sku", v)} placeholder="SKU do produto..." /></>)}
          {grp(<>{lbl("Quantidade")}<AcoesFieldInput value={(cfg.quantidade as string) ?? ""} onChange={v => set("quantidade", v)} placeholder="Quantidade..." /></>)}
          {grp(<>{lbl("Preço")}<AcoesFieldInput value={(cfg.preco as string) ?? ""} onChange={v => set("preco", v)} placeholder="Preço..." /></>)}
        </>
      );

    case "rem_produto_neg":
      return (
        <>
          {grp(<>{lbl("Selecione o produto")}
            <AcoesSelect value={(cfg.produto as string) ?? ""} onChange={v => set("produto", v)} placeholder="Selecione o produto..."
              options={products.map(p => ({ value: p.id, label: p.name }))}
            />
          </>)}
          {grp(<>{lbl("SKU")}<AcoesFieldInput value={(cfg.sku as string) ?? ""} onChange={v => set("sku", v)} placeholder="SKU do produto..." /></>)}
          {grp(<>{lbl("Quantidade")}<AcoesFieldInput value={(cfg.quantidade as string) ?? ""} onChange={v => set("quantidade", v)} placeholder="Quantidade..." /></>)}
        </>
      );

    case "descontos_neg":
      return (
        <>
          {grp(<>{lbl("Desconto (%)")}<AcoesFieldInput value={(cfg.desconto as string) ?? ""} onChange={v => set("desconto", v)} placeholder="Ex: 10" /></>)}
          {grp(<>{lbl("Acréscimo")}<AcoesFieldInput value={(cfg.acrescimo as string) ?? ""} onChange={v => set("acrescimo", v)} placeholder="Ex: 5.00" /></>)}
          {grp(<>{lbl("Frete")}<AcoesFieldInput value={(cfg.frete as string) ?? ""} onChange={v => set("frete", v)} placeholder="Ex: 15.00" /></>)}
          {grp(<>{lbl("Tipo de frete")}<AcoesFieldInput value={(cfg.tipo_frete as string) ?? ""} onChange={v => set("tipo_frete", v)} placeholder="Ex: PAC, SEDEX..." /></>)}
          {grp(<>{lbl("Cupom")}<AcoesFieldInput value={(cfg.cupom as string) ?? ""} onChange={v => set("cupom", v)} placeholder="Código do cupom..." /></>)}
        </>
      );

    case "remover_negocio":
      return (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FDE68A", borderRadius: 4, padding: "2px 8px" }}>Atenção</span>
          </div>
          <p style={{ fontSize: 12, color: "#92400E", margin: 0 }}>Esta ação removerá o negócio permanentemente. Esta operação não pode ser desfeita.</p>
        </div>
      );

    default:
      return <div style={{ fontSize: 12, color: "#9CA3AF", paddingTop: 8 }}>Configuração não disponível para esta ação.</div>;
  }
}

// ─── LeadsConfigForm ──────────────────────────────────────────────────────────

function LeadsConfigForm({ item, updateActionItem, crmTags, addTag, crmLists, teamMembers }: {
  item: ActionItem;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
  crmTags: CrmTagType[];
  addTag: (name: string, description: string, color: string) => Promise<boolean>;
  crmLists: CrmListType[];
  teamMembers: string[];
}) {
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateActionItem(item.id, { [key]: val });
  const lbl = (text: string) => <label style={{ fontSize: 11, fontWeight: 600, color: "#F97316", display: "block", marginBottom: 4 }}>{text}</label>;
  const grp = (children: React.ReactNode) => <div style={{ marginBottom: 14 }}>{children}</div>;
  const TAG_COLORS = ["#EF4444","#F97316","#EAB308","#22C55E","#14B8A6","#3B82F6","#8B5CF6","#EC4899","#6B7280","#92400E"];

  switch (item.actionId) {
    case "adicionar_tags":
    case "remover_tags": {
      const selectedTagIds = ((cfg.tags as string) ?? "").split(",").filter(Boolean);
      const verb = item.actionId === "adicionar_tags" ? "adicionar" : "remover";
      return grp(<>
        {lbl(`Tags para ${verb} ao lead`)}
        <TagMultiSelect selectedIds={selectedTagIds} onChange={ids => set("tags", ids.join(","))} crmTags={crmTags} addTag={addTag} />
      </>);
    }

    case "criar_tags": {
      const colorVal = (cfg.cor as string) ?? "#3B82F6";
      return (
        <>
          {grp(<>{lbl("Nome da tag")}<AcoesFieldInput value={(cfg.nome as string) ?? ""} onChange={v => set("nome", v)} placeholder="Nome da nova tag..." /></>)}
          {grp(<>
            {lbl("Cor da tag")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TAG_COLORS.map(c => (
                <button key={c} onClick={() => set("cor", c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: colorVal === c ? "2px solid #111" : "1.5px solid transparent", cursor: "pointer", flexShrink: 0 }} />
              ))}
            </div>
          </>)}
        </>
      );
    }

    case "adicionar_listas":
    case "remover_listas": {
      const verb = item.actionId === "adicionar_listas" ? "adicionar" : "remover";
      return grp(<>
        {lbl(`Lista para ${verb} ao lead`)}
        <AcoesSelect value={(cfg.lista as string) ?? ""} onChange={v => set("lista", v)} placeholder="Selecione a lista..."
          options={crmLists.map(l => ({ value: l.id, label: l.name }))}
        />
      </>);
    }

    case "criar_listas":
      return grp(<>{lbl("Nome da lista")}<AcoesFieldInput value={(cfg.nome as string) ?? ""} onChange={v => set("nome", v)} placeholder="Nome da nova lista..." /></>);

    case "comentario_lead":
      return grp(<>
        {lbl("Comentário")}
        <AcoesFieldTextarea value={(cfg.comentario as string) ?? ""} onChange={v => set("comentario", v)} placeholder="Digite o comentário..." rows={4} />
      </>);

    case "transf_atend_lead":
      return grp(<>
        {lbl("Selecione o atendente")}
        <AcoesSelect value={(cfg.atendente as string) ?? ""} onChange={v => set("atendente", v)} placeholder="Selecione o atendente..."
          options={[{ value: "", label: "Qualquer atendente disponível" }, ...teamMembers.map(m => ({ value: m, label: m }))]}
        />
      </>);

    case "criar_lead":
    case "deletar_lead":
    case "remover_atend_lead":
      return <div style={{ paddingTop: 12, fontSize: 12, color: "#6B7280" }}>Nenhuma configuração adicional necessária.</div>;

    default:
      return <div style={{ fontSize: 12, color: "#9CA3AF", paddingTop: 8 }}>Configuração não disponível para esta ação.</div>;
  }
}

// ─── MensagensConfigForm ──────────────────────────────────────────────────────

function MensagensConfigForm({ item, updateActionItem, teamMembers }: {
  item: ActionItem;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
  teamMembers: string[];
}) {
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateActionItem(item.id, { [key]: val });
  const lbl = (text: string) => <label style={{ fontSize: 11, fontWeight: 600, color: "#F97316", display: "block", marginBottom: 4 }}>{text}</label>;
  const grp = (children: React.ReactNode) => <div style={{ marginBottom: 14 }}>{children}</div>;

  switch (item.actionId) {
    case "transf_atend_conv":
      return grp(<>
        {lbl("Selecione o atendente")}
        <AcoesSelect value={(cfg.atendente as string) ?? ""} onChange={v => set("atendente", v)} placeholder="Selecione o atendente..."
          options={[{ value: "", label: "Qualquer atendente disponível" }, ...teamMembers.map(m => ({ value: m, label: m }))]}
        />
      </>);

    case "sugestao_resposta":
      return grp(<>
        {lbl("Texto da sugestão")}
        <AcoesFieldTextarea value={(cfg.sugestao as string) ?? ""} onChange={v => set("sugestao", v)} placeholder="Digite a sugestão de resposta..." rows={4} />
      </>);

    case "transf_dep":
      return grp(<>{lbl("Departamento")}<AcoesFieldInput value={(cfg.departamento as string) ?? ""} onChange={v => set("departamento", v)} placeholder="Nome do departamento..." /></>);

    case "iniciar_atend":
    case "finalizar_atend":
    case "desativar_auto_chat":
    case "ativar_auto_chat":
      return <div style={{ paddingTop: 12, fontSize: 12, color: "#6B7280" }}>Nenhuma configuração adicional necessária.</div>;

    default:
      return <div style={{ fontSize: 12, color: "#9CA3AF", paddingTop: 8 }}>Configuração não disponível para esta ação.</div>;
  }
}

// ─── ProdutosConfigForm ───────────────────────────────────────────────────────

function ProdutosConfigForm({ item, updateActionItem }: {
  item: ActionItem;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
}) {
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateActionItem(item.id, { [key]: val });
  const lbl = (text: string) => <label style={{ fontSize: 11, fontWeight: 600, color: "#F97316", display: "block", marginBottom: 4 }}>{text}</label>;
  const grp = (children: React.ReactNode) => <div style={{ marginBottom: 14 }}>{children}</div>;
  return (
    <>
      {grp(<>{lbl("Nome do produto")}<AcoesFieldInput value={(cfg.nome as string) ?? ""} onChange={v => set("nome", v)} placeholder="Nome do produto..." /></>)}
      {grp(<>{lbl("SKU")}<AcoesFieldInput value={(cfg.sku as string) ?? ""} onChange={v => set("sku", v)} placeholder="SKU do produto..." /></>)}
      {grp(<>{lbl("Valor padrão")}<AcoesFieldInput value={(cfg.valor as string) ?? ""} onChange={v => set("valor", v)} placeholder="Ex: 99.90" /></>)}
    </>
  );
}

// ─── MetaEventConfigForm ──────────────────────────────────────────────────────

function MetaEventConfigForm({ item, updateActionItem }: {
  item: ActionItem;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
}) {
  const { company } = useCompany();
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateActionItem(item.id, { [key]: val });
  const lbl = (text: string) => <label style={{ fontSize: 11, fontWeight: 600, color: "#F97316", display: "block", marginBottom: 4 }}>{text}</label>;
  const grp = (children: React.ReactNode) => <div style={{ marginBottom: 14 }}>{children}</div>;

  const [pixels, setPixels] = useState<{ id: string; name: string; pixel_id: string }[]>([]);

  useEffect(() => {
    if (!company) return;
    supabase
      .from("meta_integrations")
      .select("id, name, pixel_id")
      .eq("company_id", company.id)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!error) setPixels((data ?? []) as { id: string; name: string; pixel_id: string }[]);
      });
  }, [company]);

  return (
    <>
      {grp(<>
        {lbl("Pixel do Meta Ads")}
        {pixels.length === 0 ? (
          <div style={{ fontSize: 11, color: "#EF4444", padding: "8px 10px", border: "1px solid #FCA5A5", borderRadius: 6, background: "#FEF2F2" }}>
            Nenhum pixel cadastrado. Vá em <strong>Configurações → Chaves de API</strong> para adicionar.
          </div>
        ) : (
          <AcoesSelect
            value={(cfg.integration_id as string) ?? ""}
            onChange={v => set("integration_id", v)}
            placeholder="Selecione o pixel..."
            options={pixels.map(p => ({ value: p.id, label: `${p.name} (${p.pixel_id})` }))}
          />
        )}
      </>)}
      {grp(<>
        {lbl("Nome do evento")}
        <AcoesSelect
          value={(cfg.event_name as string) ?? ""}
          onChange={v => set("event_name", v)}
          placeholder="Selecione o evento..."
          options={[
            { value: "Lead",                 label: "Lead (qualificação)" },
            { value: "Purchase",             label: "Purchase (conversão/venda)" },
            { value: "CompleteRegistration", label: "CompleteRegistration" },
            { value: "Schedule",             label: "Schedule (reunião agendada)" },
            { value: "custom",               label: "Personalizado..." },
          ]}
        />
      </>)}
      {cfg.event_name === "custom" && grp(<>
        {lbl("Nome do evento personalizado")}
        <AcoesFieldInput value={(cfg.custom_event_name as string) ?? ""} onChange={v => set("custom_event_name", v)} placeholder="Ex: Qualificado, Reuniao_Agendada..." />
      </>)}
      {grp(<>
        {lbl("Valor monetário (opcional — para Purchase)")}
        <AcoesFieldInput value={(cfg.event_value as string) ?? ""} onChange={v => set("event_value", v)} placeholder="Ex: 97.00 ou {{lead.valor}}" />
      </>)}
      <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.6 }}>
        Email e telefone do lead são hasheados automaticamente (SHA-256) antes do envio.
      </div>
    </>
  );
}

// ─── SistemaConfigForm ────────────────────────────────────────────────────────

function SistemaConfigForm({ item, updateActionItem, automations }: {
  item: ActionItem;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
  automations: AutomationRecord[];
}) {
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateActionItem(item.id, { [key]: val });
  const lbl = (text: string) => <label style={{ fontSize: 11, fontWeight: 600, color: "#F97316", display: "block", marginBottom: 4 }}>{text}</label>;
  const grp = (children: React.ReactNode) => <div style={{ marginBottom: 14 }}>{children}</div>;

  switch (item.actionId) {
    case "iniciar_automacao":
      return grp(<>
        {lbl("Selecione a automação")}
        <AcoesSelect value={(cfg.automacao_id as string) ?? ""} onChange={v => set("automacao_id", v)} placeholder="Selecione a automação..."
          options={automations.map(a => ({ value: a.id, label: a.name }))}
        />
      </>);

    case "retornar_resultado":
      return grp(<>
        {lbl("Conteúdo do resultado")}
        <AcoesFieldTextarea value={(cfg.resultado as string) ?? ""} onChange={v => set("resultado", v)} placeholder="Digite o conteúdo ou use {{variavel}}..." rows={4} />
      </>);

    case "enviar_notificacao":
      return grp(<>
        {lbl("Mensagem da notificação")}
        <AcoesFieldTextarea value={(cfg.mensagem as string) ?? ""} onChange={v => set("mensagem", v)} placeholder="Digite a mensagem da notificação..." rows={3} />
      </>);

    case "enviar_evento_meta":
      return <MetaEventConfigForm item={item} updateActionItem={updateActionItem} />;

    default:
      return <div style={{ fontSize: 12, color: "#9CA3AF", paddingTop: 8 }}>Configuração não disponível para esta ação.</div>;
  }
}

// ─── AtividadesConfigForm ─────────────────────────────────────────────────────

function AtividadesConfigForm({ item, updateActionItem }: {
  item: ActionItem;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
}) {
  const cfg = item.config ?? {};
  const set = (key: string, val: string | boolean | number) => updateActionItem(item.id, { [key]: val });
  const lbl = (text: string) => <label style={{ fontSize: 11, fontWeight: 600, color: "#F97316", display: "block", marginBottom: 4 }}>{text}</label>;
  const grp = (children: React.ReactNode) => <div style={{ marginBottom: 14 }}>{children}</div>;
  return (
    <>
      {grp(<>{lbl("Título da atividade")}<AcoesFieldInput value={(cfg.titulo as string) ?? ""} onChange={v => set("titulo", v)} placeholder="Título da atividade..." /></>)}
      {grp(<>{lbl("Tipo")}
        <AcoesSelect value={(cfg.tipo as string) ?? ""} onChange={v => set("tipo", v)} placeholder="Selecione o tipo..."
          options={[{ value: "reuniao", label: "Reunião" }, { value: "ligacao", label: "Ligação" }, { value: "email", label: "Email" }, { value: "tarefa", label: "Tarefa" }, { value: "outro", label: "Outro" }]}
        />
      </>)}
      {grp(<>
        {lbl("Descrição")}
        <AcoesFieldTextarea value={(cfg.descricao as string) ?? ""} onChange={v => set("descricao", v)} placeholder="Descreva a atividade..." rows={3} />
      </>)}
    </>
  );
}

// ─── AcoesPanel ──────────────────────────────────────────────────────────────

function AcoesPanel({ node, onClose, onDelete, onDuplicate, removeActionItem, onOpenPicker, updateActionItem, pipelines, crmTags, addTag, crmLists, teamMembers, products, lossReasons, customFieldGroups, automations }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  removeActionItem: (itemId: string) => void;
  onOpenPicker: () => void;
  updateActionItem: (itemId: string, config: Record<string, string | boolean | number>) => void;
  pipelines: Pipeline[];
  crmTags: CrmTagType[];
  addTag: (name: string, description: string, color: string) => Promise<boolean>;
  crmLists: CrmListType[];
  teamMembers: string[];
  products: ProductType[];
  lossReasons: LossReasonType[];
  customFieldGroups: CustomFieldGroup[];
  automations: AutomationRecord[];
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = (node.actionItems ?? []).find(a => a.id === selectedItemId) ?? null;

  if (selectedItemId && selectedItem) {
    const catData = ACTION_CATEGORIES.find(c => c.id === selectedItem.categoryId);
    const actData = catData?.actions.find(a => a.id === selectedItem.actionId);
    const isWarning = actData?.warning;
    return (
      <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
          <button
            onClick={() => setSelectedItemId(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#111111", padding: 0, width: "100%", textAlign: "left" }}
          >
            <ArrowLeft size={15} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedItem.label}</span>
            {isWarning && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "#FDE68A", borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>Atenção</span>
            )}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {selectedItem.categoryId === "negocios" && <NegociosConfigForm item={selectedItem} updateActionItem={updateActionItem} pipelines={pipelines} teamMembers={teamMembers} products={products} lossReasons={lossReasons} />}
          {selectedItem.categoryId === "leads" && <LeadsConfigForm item={selectedItem} updateActionItem={updateActionItem} crmTags={crmTags} addTag={addTag} crmLists={crmLists} teamMembers={teamMembers} />}
          {selectedItem.categoryId === "mensagens" && <MensagensConfigForm item={selectedItem} updateActionItem={updateActionItem} teamMembers={teamMembers} />}
          {selectedItem.categoryId === "produtos" && <ProdutosConfigForm item={selectedItem} updateActionItem={updateActionItem} />}
          {selectedItem.categoryId === "sistema" && <SistemaConfigForm item={selectedItem} updateActionItem={updateActionItem} automations={automations} />}
          {selectedItem.categoryId === "atividades" && <AtividadesConfigForm item={selectedItem} updateActionItem={updateActionItem} />}
          {!["negocios","leads","mensagens","produtos","sistema","atividades"].includes(selectedItem.categoryId) && (
            <div style={{ fontSize: 12, color: "#9CA3AF", paddingTop: 8 }}>Configuração não disponível para esta ação.</div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} /> Ações
          </button>
          <div style={{ display: "flex", gap: 2 }}>
            {([{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }] as const).map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><Icon size={13} /></button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Execute ações no sistema</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {(node.actionItems ?? []).length === 0 ? (
          <div style={{ paddingTop: 8, fontSize: 12, color: "#9CA3AF" }}>Nenhuma ação adicionada ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(node.actionItems ?? []).map(item => {
              const catData = ACTION_CATEGORIES.find(c => c.id === item.categoryId);
              const actData = catData?.actions.find(a => a.id === item.actionId);
              const AIcon = actData?.icon ?? Zap;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#FFF7ED", border: "0.5px solid #FED7AA", borderRadius: 8, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FFEDD5")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#FFF7ED")}
                >
                  <AIcon size={13} color="#F97316" />
                  <span style={{ flex: 1, fontSize: 12, color: "#374151" }}>{item.label}</span>
                  <button
                    onClick={e => { e.stopPropagation(); removeActionItem(item.id); }}
                    style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                  ><X size={11} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ borderTop: "1px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
        <button onClick={onOpenPicker}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "1px dashed #FED7AA", borderRadius: 8, background: "#FFF7ED", color: "#F97316", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#FFEDD5"; e.currentTarget.style.borderColor = "#F97316"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#FFF7ED"; e.currentTarget.style.borderColor = "#FED7AA"; }}
        >
          <Plus size={13} /> Adicionar ação
        </button>
      </div>
    </aside>
  );
}

// ─── MensagemPanel ────────────────────────────────────────────────────────────

const MENSAGEM_SUB_BLOCKS: { type: SubBlockType; icon: React.ElementType; color: string }[] = [
  { type: "mensagem_texto",  icon: AlignLeft,  color: "#374151" },
  { type: "entrada_usuario", icon: HelpCircle, color: "#3B82F6" },
  { type: "atraso_tempo",    icon: Clock,      color: "#3B82F6" },
  { type: "mensagem_audio",  icon: Mic,        color: "#6B7280" },
  { type: "arquivo_anexo",   icon: Paperclip,  color: "#374151" },
  { type: "arquivo_url",     icon: Link2,      color: "#3B82F6" },
];

const sbToolBtn: React.CSSProperties = { width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" };

function SubBlockCard({ b, removeSubBlock, updateSubBlock }: {
  b: SubBlock;
  removeSubBlock: (blockId: string) => void;
  updateSubBlock: (blockId: string, data: Partial<SubBlock>) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${b.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("automation-media").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("automation-media").getPublicUrl(path);
      updateSubBlock(b.id, { fileUrl: publicUrl, fileName: file.name });
    } catch (e) {
      console.error("[SubBlockCard] upload:", e);
      toast.error("Erro ao enviar arquivo. Tente novamente.");
    } finally {
      setUploading(false);
    }
  };

  // ── Gravação de áudio no navegador (MediaRecorder) ───────────────────────
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const recStartRef = useRef(0);

  const fmtSecs = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const stopRecTimer = () => {
    if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
  };

  const startRecording = async () => {
    if (!user || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Seu navegador não suporta gravação de áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const prefs = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = prefs.find(t => MediaRecorder.isTypeSupported(t)) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        stopRecTimer();
        if (cancelledRef.current) { cancelledRef.current = false; chunksRef.current = []; return; }
        const type = mr.mimeType || mime || "audio/webm";
        let blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) { toast.error("Nada foi gravado. Tente novamente."); return; }
        // MediaRecorder não grava a duração no header do WebM → players (e o
        // WhatsApp) mostram 0:00. Injeta a duração real no EBML antes de subir.
        const durationMs = Date.now() - recStartRef.current;
        if (type.includes("webm") && durationMs > 0) {
          try { blob = await fixWebmDuration(blob, durationMs, { logger: false }); }
          catch (e) { console.warn("[audio] fixWebmDuration falhou:", e); }
        }
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type });
        await uploadFile(file);
      };
      mediaRecorderRef.current = mr;
      recStartRef.current = Date.now();
      mr.start();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = window.setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch (e) {
      console.error("[audio] getUserMedia:", e);
      toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();
    setRecording(false);
    setRecSecs(0);
  };

  // Cleanup ao desmontar: para timer e libera o microfone
  useEffect(() => () => {
    stopRecTimer();
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") { cancelledRef.current = true; mr.stop(); }
  }, []);

  const addButton = () => updateSubBlock(b.id, { buttons: [...(b.buttons ?? []), { id: `bt${Date.now()}`, label: "" }] });
  const updateButton = (id: string, label: string) => updateSubBlock(b.id, { buttons: (b.buttons ?? []).map(x => x.id === id ? { ...x, label } : x) });
  const removeButton = (id: string) => updateSubBlock(b.id, { buttons: (b.buttons ?? []).filter(x => x.id !== id) });

  return (
    <div style={{ marginBottom: 8, border: "1px solid #E5E5E5", borderRadius: 10, background: "#FAFAFA" }}>
      {/* Sub-block toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "4px 8px", gap: 2, borderBottom: "0.5px solid #F0F0F0", background: "#F9FAFB", position: "relative", borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
        {b.type === "mensagem_texto" && (
          <button onClick={() => setSettingsOpen(o => !o)} title="Configurações" style={sbToolBtn}
            onMouseEnter={e => (e.currentTarget.style.color = "#3B82F6")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
          ><Settings size={11} /></button>
        )}
        <button onClick={() => removeSubBlock(b.id)} style={sbToolBtn}
          onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
          onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
        ><Trash2 size={11} /></button>
        {settingsOpen && (
          <>
            <div onClick={() => setSettingsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div style={{ position: "absolute", top: "100%", right: 6, marginTop: 4, width: 252, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 41, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Configurações da mensagem de texto</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#374151" }}>Quebrar mensagens?</span>
                <button onClick={() => updateSubBlock(b.id, { splitMessages: !b.splitMessages })}
                  style={{ width: 36, height: 20, borderRadius: 100, background: b.splitMessages ? "#3B82F6" : "#D1D5DB", position: "relative", transition: "background 0.15s", flexShrink: 0, border: "none", cursor: "pointer", padding: 0 }}>
                  <span style={{ position: "absolute", top: 2, left: b.splitMessages ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#FFF", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, lineHeight: 1.4 }}>
                Quando ativo, cada parágrafo (separado por linha em branco) é enviado como uma mensagem separada.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Sub-block content */}
      <div style={{ padding: "10px 12px" }}>
        {b.type === "mensagem_texto" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#374151" }}><AlignLeft size={13} /> Mensagem de texto</div>
            <CamposValueInput
              value={b.text ?? ""}
              onChange={v => updateSubBlock(b.id, { text: v })}
              placeholder="Digite a mensagem ou use {} para inserir variável..."
            />
            {/* Botões de resposta da mensagem */}
            {(b.buttons ?? []).length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {(b.buttons ?? []).map(bt => (
                  <div key={bt.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input value={bt.label} onChange={e => updateButton(bt.id, e.target.value)} placeholder="Texto do botão"
                      style={{ flex: 1, padding: "6px 8px", border: "1px solid #E5E5E5", borderRadius: 6, fontSize: 12, outline: "none" }} />
                    <button onClick={() => removeButton(bt.id)} style={sbToolBtn}
                      onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                    ><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addButton}
              style={{ width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", border: "1px dashed #BFDBFE", borderRadius: 8, background: "#EFF6FF", color: "#3B82F6", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#DBEAFE"; e.currentTarget.style.borderColor = "#3B82F6"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#BFDBFE"; }}
            >
              <Plus size={13} /> Adicionar botão
            </button>
          </div>
        )}
        {b.type === "entrada_usuario" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#3B82F6" }}><HelpCircle size={13} /> Entrada do usuário</div>
            <div style={{ padding: "8px 12px", background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, fontSize: 11.5, color: "#1D4ED8", lineHeight: 1.45 }}>
              A automação <strong>pausa e aguarda</strong> a resposta do contato no WhatsApp, e a guarda na variável abaixo.
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", margin: "10px 0 4px" }}>Salvar resposta na variável</label>
            <input
              value={b.varName ?? ""}
              onChange={e => updateSubBlock(b.id, { varName: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
              placeholder="resposta"
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E5E5", borderRadius: 7, fontSize: 12, outline: "none", boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0", lineHeight: 1.4 }}>
              Use depois como <span style={{ fontFamily: "monospace", color: "#6366F1" }}>{`{{${b.varName || "resposta"}}}`}</span>
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", margin: "12px 0 4px" }}>Aguardar resposta por até</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min={1} value={b.timeoutAmount ?? 1}
                onChange={e => updateSubBlock(b.id, { timeoutAmount: Math.max(1, Number(e.target.value)) })}
                style={{ width: 64, padding: "7px 8px", border: "1px solid #E5E5E5", borderRadius: 7, fontSize: 12, outline: "none" }} />
              <select value={b.timeoutUnit ?? "horas"}
                onChange={e => updateSubBlock(b.id, { timeoutUnit: e.target.value as "minutos" | "horas" | "dias" })}
                style={{ flex: 1, padding: "7px 8px", border: "1px solid #E5E5E5", borderRadius: 7, fontSize: 12, outline: "none", background: "#FFF", cursor: "pointer" }}>
                <option value="minutos">minutos</option>
                <option value="horas">horas</option>
                <option value="dias">dias</option>
              </select>
            </div>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0", lineHeight: 1.4 }}>
              Se o contato não responder nesse prazo, o fluxo segue pela saída <span style={{ color: "#EF4444", fontWeight: 600 }}>"Caso o contato não responda"</span>.
            </p>
          </div>
        )}
        {b.type === "atraso_tempo" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Clock size={13} /> Atraso de tempo</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#6B7280" }}>Atraso de</span>
              <input type="number" min={0} value={b.delaySeconds ?? 0}
                onChange={e => updateSubBlock(b.id, { delaySeconds: Number(e.target.value) })}
                style={{ width: 64, padding: "5px 8px", border: "1px solid #E5E5E5", borderRadius: 6, fontSize: 12, outline: "none" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>segundos</span>
            </div>
          </div>
        )}
        {b.type === "mensagem_audio" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Mic size={13} /> Mensagem de áudio</div>
            {b.fileUrl ? (
              <div style={{ padding: "8px 10px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8 }}>
                <audio controls src={b.fileUrl} style={{ width: "100%", height: 34 }} />
                <button onClick={() => updateSubBlock(b.id, { fileUrl: undefined, fileName: undefined })}
                  style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 11, fontWeight: 600 }}>
                  <Trash2 size={11} /> Remover áudio
                </button>
              </div>
            ) : recording ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 8 }}>
                <span className="animate-pulse" style={{ width: 10, height: 10, borderRadius: "50%", background: "#EF4444", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#B91C1C", fontVariantNumeric: "tabular-nums" }}>Gravando… {fmtSecs(recSecs)}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={cancelRecording}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", border: "0.5px solid #E5E5E5", borderRadius: 7, background: "#FFF", color: "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    <X size={11} /> Cancelar
                  </button>
                  <button onClick={stopRecording}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", border: "none", borderRadius: 7, background: "#EF4444", color: "#FFF", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    <Square size={10} fill="#FFF" /> Parar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={startRecording} disabled={uploading}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 0", border: "none", borderRadius: 8, background: uploading ? "#F3F4F6" : "#EF4444", color: uploading ? "#9CA3AF" : "#FFF", fontSize: 12, fontWeight: 600, cursor: uploading ? "default" : "pointer" }}>
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Mic size={15} />}
                  {uploading ? "Enviando…" : "Gravar agora"}
                </button>
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 14, border: "0.5px dashed #D1D5DB", borderRadius: 8, background: "#F9FAFB", cursor: uploading ? "default" : "pointer", fontSize: 11, color: "#6B7280" }}>
                  {uploading ? <Loader2 size={20} color="#9CA3AF" className="animate-spin" /> : <Upload size={20} color="#D1D5DB" />}
                  {uploading ? "Enviando..." : "Selecionar arquivo"}
                  <span style={{ fontSize: 10, color: "#9CA3AF" }}>MP3, OGG, M4A · máx 16MB</span>
                  <input type="file" accept="audio/*" style={{ display: "none" }} disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.currentTarget.value = ""; }} />
                </label>
              </div>
            )}
          </div>
        )}
        {b.type === "arquivo_anexo" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Paperclip size={13} /> Arquivo anexo</div>
            {b.fileUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 8 }}>
                <Paperclip size={13} color="#16A34A" style={{ flexShrink: 0 }} />
                <a href={b.fileUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 12, color: "#166534", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none" }}>{b.fileName || "arquivo"}</a>
                <button onClick={() => updateSubBlock(b.id, { fileUrl: undefined, fileName: undefined })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex", flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                ><Trash2 size={12} /></button>
              </div>
            ) : (
              <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 14, border: "0.5px dashed #D1D5DB", borderRadius: 8, background: "#F9FAFB", cursor: uploading ? "default" : "pointer", fontSize: 11, color: "#6B7280" }}>
                {uploading ? <Loader2 size={20} color="#9CA3AF" className="animate-spin" /> : <Upload size={20} color="#D1D5DB" />}
                {uploading ? "Enviando..." : "Selecionar arquivo"}
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>Imagem, PDF ou documento · máx 16MB</span>
                <input type="file" style={{ display: "none" }} disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.currentTarget.value = ""; }} />
              </label>
            )}
          </div>
        )}
        {b.type === "arquivo_url" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Link2 size={13} /> Arquivo URL Dinâmica</div>
            <CamposValueInput
              value={b.fileUrl ?? ""}
              onChange={v => updateSubBlock(b.id, { fileUrl: v })}
              placeholder="URL do arquivo ou use {{variável}}..."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MensagemPanel({ node, onClose, onDelete, onDuplicate, removeSubBlock, updateSubBlock, onAddSubBlock, onSetConnection }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  removeSubBlock: (blockId: string) => void;
  updateSubBlock: (blockId: string, data: Partial<SubBlock>) => void;
  onAddSubBlock: (type: SubBlockType) => void;
  onSetConnection: (connectionId: string | undefined) => void;
}) {
  const { whatsappConnections } = useCompany();
  const hasSubBlocks = (node.subBlocks ?? []).length > 0;
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  return (
    <aside style={{ width: 320, minWidth: 320, maxWidth: 320, height: "100%", background: "#FFFFFF", boxShadow: "4px 0 16px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E5E5E5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} /> Mensagens
          </button>
          <div style={{ display: "flex", gap: 2 }}>
            {[{ Icon: Trash2, action: onDelete, color: "#EF4444", hover: "#FEE2E2" }, { Icon: Copy, action: onDuplicate, color: "#6B7280", hover: "#F3F4F6" }, { Icon: Download, action: () => {}, color: "#6B7280", hover: "#F3F4F6" }].map(({ Icon, action, color, hover }, i) => (
              <button key={i} onClick={action} style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color }}
                onMouseEnter={e => (e.currentTarget.style.background = hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              ><Icon size={13} /></button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Envie, receba e armazene respostas</p>
      </div>

      {/* Conexão — vinculada às conexões de Configurações → Conexão (whatsapp_connections) */}
      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #F0F0F0", flexShrink: 0 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Conexão</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select
            value={node.connectionId ?? ""}
            onChange={e => onSetConnection(e.target.value || undefined)}
            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 12, outline: "none", background: "#FFF" }}
          >
            <option value="">Selecionar</option>
            {whatsappConnections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.phone ? ` · ${c.phone}` : ""}{c.connected ? "" : " (desconectado)"}
              </option>
            ))}
          </select>
          <a
            href="/configuracoes/conexoes" target="_blank" rel="noopener noreferrer"
            title="Gerenciar conexões em Configurações → Conexão"
            style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid #E5E5E5", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0 }}
          ><Settings size={12} /></a>
        </div>
        {whatsappConnections.length === 0 ? (
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0", lineHeight: 1.4 }}>
            Nenhuma conexão cadastrada. Adicione em <strong>Configurações → Conexão</strong>.
          </p>
        ) : (
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0", lineHeight: 1.4 }}>Deixe em branco para usar a conexão dos blocos anteriores.</p>
        )}
      </div>

      {/* Body: list de tipos disponíveis (estado vazio) OU sub-blocos configurados */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!hasSubBlocks ? (
          <div>
            {MENSAGEM_SUB_BLOCKS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={item.type}>
                  <button
                    onClick={() => onAddSubBlock(item.type)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <Icon size={15} color={item.color} />
                    <span style={{ fontSize: 13, color: "#374151" }}>{SUB_BLOCK_LABELS[item.type]}</span>
                  </button>
                  {idx < MENSAGEM_SUB_BLOCKS.length - 1 && (
                    <div style={{ height: "0.5px", background: "#F0F0F0", margin: "0 16px" }} />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "10px 16px" }}>
            {(node.subBlocks ?? []).map(b => (
              <SubBlockCard key={b.id} b={b} removeSubBlock={removeSubBlock} updateSubBlock={updateSubBlock} />
            ))}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ borderTop: "1px solid #E5E5E5", padding: "12px 16px", flexShrink: 0, position: "relative" }}>
        {addMenuOpen && (
          <>
            {/* clique fora fecha o menu */}
            <div onClick={() => setAddMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div style={{ position: "absolute", bottom: "100%", left: 16, right: 16, marginBottom: 6, background: "#FFFFFF", border: "1px solid #E5E5E5", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden", zIndex: 41 }}>
              {MENSAGEM_SUB_BLOCKS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={item.type}>
                    <button
                      onClick={() => { onAddSubBlock(item.type); setAddMenuOpen(false); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <Icon size={15} color={item.color} />
                      <span style={{ fontSize: 13, color: "#374151" }}>{SUB_BLOCK_LABELS[item.type]}</span>
                    </button>
                    {idx < MENSAGEM_SUB_BLOCKS.length - 1 && (
                      <div style={{ height: "0.5px", background: "#F0F0F0", margin: "0 14px" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        <button onClick={() => setAddMenuOpen(o => !o)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "1px dashed #BFDBFE", borderRadius: 8, background: "#EFF6FF", color: "#3B82F6", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#DBEAFE"; e.currentTarget.style.borderColor = "#3B82F6"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#BFDBFE"; }}
        >
          <Plus size={13} /> Adicionar mensagem
        </button>
      </div>
    </aside>
  );
}
