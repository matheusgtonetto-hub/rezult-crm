import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, ChevronDown, ChevronRight, ChevronLeft,
  Play, Zap, Power, Minus, Maximize2, ArrowLeft, ArrowRight,
  Save, Pencil, Copy, Download, Upload, Trash2,
  Briefcase, User, MessageCircle, Instagram, Globe, Settings,
  Calendar, Filter, LayoutGrid, X, CheckCircle2,
  Clock, Shuffle, Bot, Code2, Sliders, Mic, Paperclip, Link2, AlignLeft, HelpCircle, StickyNote, Palette,
  ThumbsUp, ThumbsDown, RotateCcw, ArrowLeftRight, UserPlus, UserMinus, UserX,
  Package, DollarSign, Tag, List, MessageSquare, Sparkles, Building2, ToggleLeft, ToggleRight,
  ShoppingCart, Bell, ExternalLink, Info,
  Mail, Phone, UserCheck, Equal, CreditCard,
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
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useCRM } from "@/context/CRMContext";
import type { Pipeline, Tag as CrmTagType, CustomFieldGroup, Product as ProductType, LossReason as LossReasonType, CrmList as CrmListType } from "@/data/mockData";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerConfig = { categoryId: string; triggerId: string; label: string; description: string; configData?: Record<string, string | boolean | number> };

type ActionNodeType = "mensagem" | "acoes" | "condicoes" | "espera" | "randomizador" | "api" | "campos" | "ia" | "javascript";

type SubBlockType = "mensagem_texto" | "entrada_usuario" | "atraso_tempo" | "mensagem_audio" | "arquivo_anexo" | "arquivo_url";

type SubBlock = {
  id: string;
  type: SubBlockType;
  text?: string;
  delaySeconds?: number;
  fileUrl?: string;
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
type ApiConfig = { method: string; url: string; headers: { key: string; value: string }[]; params: { key: string; value: string }[]; body: string };

type CanvasNode = {
  id: string;
  type: "start" | "note" | ActionNodeType;
  x: number; y: number;
  label: string;
  trigger?: TriggerConfig | null;
  parentId?: string | null;
  errorParentId?: string | null;
  subBlocks?: SubBlock[];
  actionItems?: ActionItem[];
  conditionItems?: ConditionItem[];
  espera?: EsperaConfig;
  randomBranches?: RandomBranch[];
  apiConfig?: ApiConfig;
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
};

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
      { id: "retornar_resultado", label: "Retornar resultado da tool", description: "Define o conteúdo que será retornado como resultado da tool para o agente de IA", icon: Upload },
      { id: "enviar_notificacao", label: "Enviar notificação",          description: "Envia uma notificação para os usuários",                                          icon: Bell },
      { id: "iniciar_automacao",  label: "Iniciar outra automação",     description: "Permite iniciar outra automação passando parâmetros específicos da sessão.",     icon: Link2 },
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

function fmtDate(iso: string) {
  try { return format(parseISO(iso), "d 'de' MMMM 'de' yyyy HH:mm", { locale: ptBR }); }
  catch { return iso; }
}

function fmtDateShort(iso: string) {
  try { return format(parseISO(iso), "d MMM HH:mm", { locale: ptBR }); }
  catch { return iso; }
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AutomacoesPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { pipelines, crmTags, addTag, crmLists, teamMembers, products, lossReasons, customFieldGroups } = useCRM();
  const navigate = useNavigate();

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
  const [newGroup, setNewGroup]         = useState("Automação");
  const [startType, setStartType]       = useState<"blank" | "import" | "model">("blank");
  const [creating, setCreating]         = useState(false);

  // Rename form
  const [renameName, setRenameName]     = useState("");

  // Canvas (editor)
  const [nodes, setNodes]               = useState<CanvasNode[]>([START_NODE]);
  const [trigger, setTrigger]           = useState<TriggerConfig | null>(null);
  const [zoom, setZoom]                 = useState(1);
  const [pan, setPan]                   = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedTriggerCat, setSelectedTriggerCat] = useState(TRIGGER_CATEGORIES[0].id);
  const [saving, setSaving]             = useState(false);
  const [addNodeMenu, setAddNodeMenu]   = useState<{ fromNodeId: string; x: number; y: number; isError?: boolean } | null>(null);
  const [portDragLine, setPortDragLine] = useState<{ x1: number; y1: number; x2: number; y2: number; isError?: boolean } | null>(null);
  const [hoveredInputPort, setHoveredInputPort] = useState<string | null>(null);
  const [portPosMap, setPortPosMap] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedConn, setSelectedConn] = useState<{ nodeId: string; type: "parent" | "error" } | null>(null);
  const [nodeStats, setNodeStats]       = useState<Record<string, { s: number; a: number; e: number }>>({});
  const [nodePanel, setNodePanel]       = useState<string | null>(null);
  const [acoesPickerOpen, setAcoesPickerOpen] = useState(false);
  const [selectedActionPickerCat, setSelectedActionPickerCat] = useState(ACTION_CATEGORIES[0].id);
  const [condicoesPickerOpen, setCondicoesPickerOpen] = useState(false);
  const [selectedCondPickerCat, setSelectedCondPickerCat] = useState(CONDITION_CATEGORIES[0].id);
  const [espePickerOpen, setEspePickerOpen] = useState(false);
  const [selectedEspePickerCat, setSelectedEspePickerCat] = useState("tempo");
  const [triggerPanel, setTriggerPanel] = useState(false);
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
  const portDragRef  = useRef<{ fromNodeId: string; startX: number; startY: number } | null>(null);
  const nodeDragRef  = useRef<{ nodeId: string; startX: number; startY: number; baseX: number; baseY: number; hasDragged: boolean; onSelect: () => void } | null>(null);
  const resizeDragRef = useRef<{ nodeId: string; startX: number; startY: number; baseW: number; baseH: number } | null>(null);
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

  // ── Editor helpers ────────────────────────────────────────────────────────

  const openEditor = useCallback((id: string) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return;
    const flow = auto.flow ?? { nodes: [START_NODE], trigger: null };
    const n = flow.nodes?.length ? flow.nodes : [START_NODE];
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
    // Load execution stats for this automation
    supabase
      .from("automation_logs")
      .select("node_id, status")
      .eq("automation_id", id)
      .limit(5000)
      .then(({ data }) => {
        if (!data) return;
        const stats: Record<string, { s: number; a: number; e: number }> = {};
        for (const row of data) {
          if (!stats[row.node_id]) stats[row.node_id] = { s: 0, a: 0, e: 0 };
          if (row.status === "success") stats[row.node_id].s++;
          else if (row.status === "alert") stats[row.node_id].a++;
          else if (row.status === "error") stats[row.node_id].e++;
        }
        setNodeStats(stats);
      });
  }, [automations]);

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
    const isError = addNodeMenu.isError ?? false;
    const actualParentId = isError
      ? addNodeMenu.fromNodeId.replace(/__error$/, "")
      : addNodeMenu.fromNodeId;
    const newNode: CanvasNode = {
      id: `n${Date.now()}`,
      type: type as ActionNodeType,
      x: addNodeMenu.x,
      y: addNodeMenu.y,
      label,
      parentId: isError ? null : actualParentId,
      errorParentId: isError ? actualParentId : null,
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

  const disconnectNode = (nodeId: string, type: "parent" | "error") => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId
        ? type === "parent" ? { ...n, parentId: null } : { ...n, errorParentId: null }
        : n
    ));
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
          const isError = portDragRef.current.fromNodeId.endsWith("__error");
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
        const realNodeId = isErrorPort ? fromNodeId.replace(/__error$/, "") : fromNodeId;
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
              setNodes(prev => prev.map(n => n.id === targetNodeId ? { ...n, errorParentId: realNodeId } : n));
            } else {
              setNodes(prev => prev.map(n => n.id === targetNodeId ? { ...n, parentId: fromNodeId } : n));
            }
            return;
          }
          const dropX = (e.clientX - rect.left - pan.x) / zoom;
          const dropY = (e.clientY - rect.top - pan.y) / zoom;
          setAddNodeMenu({ fromNodeId, x: dropX, y: dropY, isError: isErrorPort });
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
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(z => Math.max(0.4, Math.min(2, z + delta)));
  };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Informe um nome"); return; }
    if (!user || !company) return;
    if (startType !== "blank") { toast.info("Em breve"); return; }
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
          flow: { nodes: [START_NODE], trigger: null },
        })
        .select()
        .single();
      if (error) throw error;
      const rec = data as AutomationRecord;
      setAutomations(prev => [rec, ...prev]);
      setCreateOpen(false);
      setNewName(""); setNewDesc(""); setNewGroup("Automação"); setStartType("blank");
      toast.success("Automação criada");
      openEditor(rec.id);
    } catch {
      toast.error("Erro ao criar automação");
    } finally {
      setCreating(false);
    }
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
    setUnsavedOpen(false);
    await handleSave();
    pendingLeaveRef.current?.();
    pendingLeaveRef.current = null;
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

  const handleDownload = () => {
    if (!selectedAutomation) return;
    const blob = new Blob([JSON.stringify(selectedAutomation.flow, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${selectedAutomation.name}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleStatClick = useCallback(async (nodeId: string, status: "success" | "alert" | "error") => {
    if (!selectedId) return;
    setLogsPanel({ nodeId });
    setLogsPanelTab(status);
    setLogsPanelLoading(true);
    setLogsPanelEntries([]);
    setLogsPanelSelectedEntry(null);
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
        const flow = JSON.parse(ev.target?.result as string);
        setNodes(flow.nodes ?? [START_NODE]);
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
    const cfg: TriggerConfig = { categoryId: cat.id, triggerId: t.id, label: t.label, description: t.description };
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
      return withBranchRemoved.map(n => n.parentId === portKey ? { ...n, parentId: null } : n);
    });
  };

  const updateRandomBranch = (nodeId: string, branchId: string, data: Partial<RandomBranch>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, randomBranches: (n.randomBranches ?? []).map(b => b.id === branchId ? { ...b, ...data } : b) }
      : n
    ));
  };

  const updateApiConfig = (nodeId: string, config: Partial<ApiConfig>) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, apiConfig: { method: "POST", url: "", headers: [], params: [], body: "", ...(n.apiConfig ?? {}), ...config } }
      : n
    ));
  };

  const updateTriggerConfigData = (key: string, value: string | boolean | number) => {
    setTrigger(prev => prev ? { ...prev, configData: { ...(prev.configData ?? {}), [key]: value } } : prev);
  };

  // ─── SIDEBAR (shared) ────────────────────────────────────────────────────────

  const Sidebar = () => (
    <>
      {!leftCollapsed ? (
        <aside style={{ width: 240, minWidth: 240, background: "#FFFFFF", boxShadow: "1px 0 4px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", position: "relative", zIndex: 2, flexShrink: 0 }}>
          <div style={{ padding: 12, borderBottom: "0.5px solid #E5E5E5" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar automação..."
                style={{ width: "100%", background: "#F9FAFB", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: "8px 32px 8px 30px", fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
              <Power
                size={14}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", cursor: "pointer" }}
                title="Filtrar por estado"
              />
            </div>
            <button
              onClick={() => setCreateOpen(true)}
              style={{ width: "100%", marginTop: 8, background: "hsl(var(--primary))", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}
            >
              <Plus size={14} /> Adicionar automação
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>Carregando...</div>
            ) : filteredGroups.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>Nenhuma automação</div>
            ) : filteredGroups.map(g => {
              const open = openGroups[g.name] ?? false;
              return (
                <div key={g.name}>
                  <button
                    onClick={() => setOpenGroups(s => ({ ...s, [g.name]: !open }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#6B7280", letterSpacing: 0.3 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {g.name}
                    </span>
                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>{g.items.length}</span>
                  </button>
                  {open && g.items.map(item => {
                    const sel = selectedId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => requestLeave(() => openEditor(item.id))}
                        className="group"
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: sel ? "#F0FDF4" : "transparent", borderLeft: sel ? "3px solid hsl(var(--primary))" : "3px solid transparent", cursor: "pointer" }}
                      >
                        <Zap size={14} color="hsl(var(--primary))" />
                        <span style={{ flex: 1, fontSize: 13, color: "#111111", fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </span>
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
              );
            })}
          </div>

          <button
            onClick={() => setLeftCollapsed(true)}
            style={{ position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", background: "#FFFFFF", border: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
          >
            <ChevronLeft size={14} color="#6B7280" />
          </button>
        </aside>
      ) : (
        <button
          onClick={() => setLeftCollapsed(false)}
          style={{ width: 24, height: 60, alignSelf: "center", background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderLeft: "none", borderRadius: "0 8px 8px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <ChevronRight size={14} color="#6B7280" />
        </button>
      )}
    </>
  );

  // ─── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", background: "#F4F6F8", overflow: "hidden" }}>
      {/* Left sidebar — sempre visível */}
      <Sidebar />

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {view === "list" && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "20px 28px 0", background: "#F4F6F8" }}>
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
                  style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: "7px 12px 7px 30px", fontSize: 12, outline: "none", width: 200 }}
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
                <div style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12, minHeight: 260 }}>
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
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "0.5px solid #E5E5E5", borderRadius: 8, background: i === 0 ? "hsl(var(--primary))" : "#FFFFFF", color: i === 0 ? "#FFFFFF" : "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
                      >
                        <Zap size={13} color={i === 0 ? "#FFFFFF" : "hsl(var(--primary))"} />
                        {g.name}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCreateOpen(true)}
                    style={{ marginTop: "auto", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "hsl(var(--primary))", fontSize: 12, fontWeight: 600, padding: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <Plus size={14} /> Criar nova automação
                  </button>
                </div>

                {/* Automation cards */}
                {filteredAutomations.map(auto => (
                  <div key={auto.id} style={{ background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 200 }}>
                    {/* Mini canvas preview */}
                    <div style={{ height: 120, background: "#F8FAFC", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ opacity: 0.15, fontSize: 10, color: "#374151", transform: "scale(0.35)", transformOrigin: "center", pointerEvents: "none", userSelect: "none" }}>
                        <div style={{ background: "#FFFFFF", border: "1px dashed #CCCCCC", borderRadius: 8, padding: "8px 12px", width: 200 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                            <Play size={10} fill="hsl(var(--primary))" color="hsl(var(--primary))" />
                            <span style={{ fontSize: 11, fontWeight: 700 }}>Início</span>
                          </div>
                          {auto.flow?.trigger ? (
                            <div style={{ fontSize: 9, color: "#374151" }}>{auto.flow.trigger.label}</div>
                          ) : (
                            <div style={{ fontSize: 9, color: "#9CA3AF" }}>Sem gatilho</div>
                          )}
                        </div>
                      </div>
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
                        style={{ marginTop: "auto", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "#374151", fontSize: 12, fontWeight: 500, padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
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
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Painel de configuração — coluna no fluxo normal, NÃO absoluto */}
          {/* Trigger config panel */}
          {triggerPanel && !nodePanel && trigger && (
            <TriggerConfigPanel
              trigger={trigger}
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
            <aside style={{ width: 220, minWidth: 220, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 8px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Blocos básicos</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Clique para adicionar ao canvas</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {ACTION_TYPES.slice(0, 7).map(at => {
                  const Icon = at.icon;
                  return (
                    <button key={at.id} onClick={() => {
                      const newNode: CanvasNode = { id: `n${Date.now()}`, type: at.id as ActionNodeType, x: 340 + Math.random() * 60, y: 80 + nodes.length * 30, label: at.label };
                      setNodes(prev => [...prev, newNode]);
                    }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "0.5px solid #F5F5F5" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: `${at.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={14} color={at.color} />
                      </div>
                      <span style={{ fontSize: 13, color: "#374151" }}>{at.label}</span>
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
              updateApiConfig={(config) => updateApiConfig(nodePanel, config)}
            />
          )}

          {nodePanel && nodes.find(n => n.id === nodePanel)?.type === "campos" && (
            <CamposPanel
              node={nodes.find(n => n.id === nodePanel)!}
              onClose={() => setNodePanel(null)}
              onDelete={() => { setNodes(prev => prev.filter(n => n.id !== nodePanel)); setNodePanel(null); }}
              onDuplicate={() => { const n = nodes.find(x => x.id === nodePanel); if (n) setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }]); }}
            />
          )}

          {/* Canvas area — flex: 1, encolhe quando painel está aberto */}
          <section style={{ flex: 1, position: "relative", overflow: "hidden", background: "#F4F6F8", backgroundImage: "radial-gradient(circle, rgba(210,210,210,0.7) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>

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
              { icon: Save,     label: saving ? "Salvando..." : "Salvar",    action: handleSave },
              { icon: Pencil,   label: "Renomear",   action: () => { setRenameName(selectedAutomation.name); setRenameOpen(true); } },
              { icon: Copy,     label: "Duplicar",   action: handleDuplicate },
              { icon: Download, label: "Exportar",   action: handleDownload },
              { icon: Upload,   label: "Importar",   action: () => fileRef.current?.click() },
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
            onDragOver={(e) => e.preventDefault()}
            style={{ position: "absolute", inset: 0, cursor: "grab" }}
          >
            <div style={{ position: "absolute", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
              {/* SVG connection lines */}
              <svg style={{ position: "absolute", top: 0, left: 0, width: 9999, height: 9999, overflow: "visible" }}>
                {nodes.filter(n => n.parentId).map(n => {
                  const parentId = n.parentId!;
                  const parent = nodes.find(p => p.id === parentId);
                  let x1: number, y1: number, stroke = "#CCCCCC";
                  if (parent) {
                    const pp = portPosMap[parentId];
                    x1 = pp?.x ?? (parent.type === "start" ? parent.x + 244 : parent.x + 260);
                    y1 = pp?.y ?? (parent.type === "start" ? parent.y + 158 : parent.y + 110);
                  } else {
                    // Compound port: nodeId_condId or nodeId_branchId
                    const lastUnder = parentId.lastIndexOf("_");
                    if (lastUnder <= 0) return null;
                    const realParentId = parentId.substring(0, lastUnder);
                    const suffix = parentId.substring(lastUnder + 1);
                    const realParent = nodes.find(p => p.id === realParentId);
                    if (!realParent) return null;
                    const pp = portPosMap[parentId];
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
                    } else {
                      return null;
                    }
                  }
                  const x2 = n.x, y2 = n.y + 40;
                  const pathD = `M ${x1} ${y1} C ${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`;
                  const isSel = selectedConn?.nodeId === n.id && selectedConn?.type === "parent";
                  return (
                    <g
                      key={n.id}
                      data-conn-line
                      style={{ cursor: "pointer" }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setSelectedConn(isSel ? null : { nodeId: n.id, type: "parent" }); }}
                    >
                      <path d={pathD} stroke="rgba(0,0,0,0)" strokeWidth={12} fill="none" style={{ pointerEvents: "stroke" }} />
                      <path d={pathD} stroke={isSel ? "#3B82F6" : stroke} strokeWidth={isSel ? 2 : 1.5} fill="none" strokeDasharray="5,4" style={{ pointerEvents: "stroke" }} />
                    </g>
                  );
                })}
                {/* Error connection lines */}
                {nodes.filter(n => n.errorParentId).map(n => {
                  const parent = nodes.find(p => p.id === n.errorParentId);
                  if (!parent) return null;
                  const errKey = `${n.errorParentId}__error`;
                  const pp = portPosMap[errKey];
                  const x1 = pp?.x ?? parent.x + 260;
                  const y1 = pp?.y ?? parent.y + 93;
                  const x2 = n.x, y2 = n.y + 40;
                  const pathD = `M ${x1} ${y1} C ${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`;
                  const isSel = selectedConn?.nodeId === n.id && selectedConn?.type === "error";
                  return (
                    <g
                      key={`err_${n.id}`}
                      data-conn-line
                      style={{ cursor: "pointer" }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); setSelectedConn(isSel ? null : { nodeId: n.id, type: "error" }); }}
                    >
                      <path d={pathD} stroke="rgba(0,0,0,0)" strokeWidth={12} fill="none" style={{ pointerEvents: "stroke" }} />
                      <path d={pathD} stroke="#EF4444" strokeWidth={isSel ? 2.5 : 1.5} fill="none" strokeDasharray="5,4" opacity={isSel ? 1 : 0.7} style={{ pointerEvents: "stroke" }} />
                    </g>
                  );
                })}
                {/* Live drag line */}
                {portDragLine && (
                  <path
                    d={`M ${portDragLine.x1} ${portDragLine.y1} C ${portDragLine.x1 + 60} ${portDragLine.y1} ${portDragLine.x2 - 60} ${portDragLine.y2} ${portDragLine.x2} ${portDragLine.y2}`}
                    stroke={portDragLine.isError ? "#EF4444" : "#378ADD"} strokeWidth={2} fill="none" strokeDasharray="5,4"
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
                  const parentId = n.parentId!;
                  const parent = nodes.find(p => p.id === parentId);
                  if (parent) {
                    const pp = portPosMap[parentId];
                    x1 = pp?.x ?? (parent.type === "start" ? parent.x + 244 : parent.x + 260);
                    y1 = pp?.y ?? (parent.type === "start" ? parent.y + 158 : parent.y + 110);
                  } else {
                    const lastUnder = parentId.lastIndexOf("_");
                    if (lastUnder <= 0) return null;
                    const suffix = parentId.substring(lastUnder + 1);
                    const realParent = nodes.find(p => p.id === parentId.substring(0, lastUnder));
                    if (!realParent) return null;
                    const pp = portPosMap[parentId];
                    if (realParent.type === "condicoes") {
                      const condIdx = (realParent.conditionItems ?? []).findIndex(c => c.id === suffix);
                      x1 = pp?.x ?? realParent.x + 258;
                      y1 = pp?.y ?? realParent.y + 38 + 10 + condIdx * 55 + 44;
                    } else if (realParent.type === "randomizador") {
                      const branches = realParent.randomBranches ?? DEFAULT_BRANCHES;
                      const branchIdx = branches.findIndex(b => b.id === suffix);
                      x1 = pp?.x ?? realParent.x + 290;
                      y1 = pp?.y ?? realParent.y + 110 + branchIdx * 31;
                    } else {
                      return null;
                    }
                  }
                } else {
                  const parent = nodes.find(p => p.id === n.errorParentId);
                  if (!parent) return null;
                  const pp = portPosMap[`${n.errorParentId}__error`];
                  x1 = pp?.x ?? parent.x + 260;
                  y1 = pp?.y ?? parent.y + 93;
                }
                const cx1 = x1 + 60, cy1 = y1, cx2 = x2 - 60, cy2 = y2;
                const mx = (x1 + 3 * cx1 + 3 * cx2 + x2) / 8;
                const my = (y1 + 3 * cy1 + 3 * cy2 + y2) / 8;
                return (
                  <div
                    key={`del_${selectedConn.nodeId}_${selectedConn.type}`}
                    data-conn-line
                    onMouseDown={e => e.stopPropagation()}
                    style={{ position: "absolute", left: mx - 16, top: my - 16, zIndex: 15, pointerEvents: "all" }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); disconnectNode(selectedConn.nodeId, selectedConn.type); }}
                      style={{ width: 32, height: 32, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #FCA5A5", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      title="Desconectar"
                    >
                      <Trash2 size={13} color="#EF4444" />
                    </button>
                  </div>
                );
              })()}

              {/* Nodes */}
              {nodes.map(n => {
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
                if (n.type === "note") return (
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
                );
                return (
                  <ActionNode
                    key={n.id}
                    node={n}
                    selected={selectedNode === n.id}
                    onSelect={() => { setSelectedNode(n.id); setNodePanel(n.id); }}
                    onPortDragStart={(e) => startPortDrag(e, n.id)}
                    onErrorPortDragStart={(e) => startPortDrag(e, `${n.id}__error`)}
                    onConditionPortDragStart={(e, condId) => startPortDrag(e, `${n.id}_${condId}`)}
                    onBranchPortDragStart={(e, branchId) => startPortDrag(e, `${n.id}_${branchId}`)}
                    onDragStart={(e) => onNodeDragStart(e, n.id, () => { setSelectedNode(n.id); setNodePanel(n.id); })}
                    onDelete={() => { setNodes(prev => prev.filter(x => x.id !== n.id)); setSelectedNode(null); if (nodePanel === n.id) setNodePanel(null); if (selectedNode === n.id) setSelectedNode(null); }}
                    onDuplicate={() => setNodes(prev => [...prev, { ...n, id: `n${Date.now()}`, x: n.x + 20, y: n.y + 20 }])}
                    onAddNote={() => setNodes(prev => [...prev, { id: `note${Date.now()}`, type: "note", x: n.x + 300, y: n.y, label: "Anotação", noteText: "", width: 220, height: 140 }])}
                    onOpenAcoesPicker={n.type === "acoes" ? () => { setSelectedNode(n.id); setNodePanel(n.id); setAcoesPickerOpen(true); } : undefined}
                    onOpenCondicoesPicker={n.type === "condicoes" ? () => { setSelectedNode(n.id); setNodePanel(n.id); setCondicoesPickerOpen(true); } : undefined}
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
              {logsPanelPath.length > 0 && logsPanelPath.map((entry, i) => {
                const nd = nodes.find(n => n.id === entry.node_id);
                if (!nd) return null;
                const sColor = entry.status === "success" ? "#16A34A" : entry.status === "alert" ? "#D97706" : "#DC2626";
                const statusLabel = entry.status === "success" ? "Concluído com sucesso" : entry.error_message || (entry.status === "alert" ? "Alerta no bloco" : "Erro no bloco");
                return (
                  <div key={`chip_${i}`} style={{
                    position: "absolute", left: nd.x, top: nd.y - 56,
                    width: 260, background: "#FFFFFF",
                    border: "0.5px solid #E5E5E5",
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
                  style={{ position: "absolute", left: addNodeMenu.x, top: addNodeMenu.y, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 12, padding: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", width: 220, zIndex: 30 }}
                  onClick={e => e.stopPropagation()}
                >
                  {ACTION_TYPES.map(at => {
                    const Icon = at.icon;
                    return (
                      <button
                        key={at.id}
                        onClick={() => handleAddNode(at.id, at.label)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "transparent", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 13, color: "#111111" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <Icon size={16} color={at.color} />
                        {at.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Zoom controls */}
          <div style={{ position: "absolute", right: 16, bottom: 60, display: "flex", flexDirection: "column", gap: 4, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} style={zoomBtn}><Plus size={14} /></button>
            <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} style={zoomBtn}><Minus size={14} /></button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={zoomBtn}><Maximize2 size={14} /></button>
          </div>

          {/* Nav arrows */}
          <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, zIndex: 20 }}>
            <button onClick={() => requestLeave(() => setView("list"))} style={zoomBtn} title="Voltar à lista"><ArrowLeft size={14} /></button>
            <button style={zoomBtn}><ArrowRight size={14} /></button>
          </div>

          {/* Hidden file input for import */}
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />

          {/* ── Logs Panel — painel lateral direito ──────────────────────── */}
          {logsPanel && (
            <div style={{ position: "absolute", top: 0, right: 0, width: 360, height: "100%", background: "#FFFFFF", borderLeft: "0.5px solid #E5E5E5", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)", zIndex: 25, display: "flex", flexDirection: "column" }}>

              {/* Header */}
              <div style={{ padding: "12px 14px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Logs do bloco</span>
                  {logsPanelNode && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Play size={11} fill="hsl(var(--primary))" color="hsl(var(--primary))" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{logsPanelNode.label}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => { setLogsPanel(null); setLogsPanelSelectedEntry(null); }}
                  style={{ width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F3F4F6")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                ><X size={14} /></button>
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
              <div style={{ display: "flex", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
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
              <div style={{ padding: "8px 12px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <User size={12} style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  <select value={logsPanelLeadFilter} onChange={e => setLogsPanelLeadFilter(e.target.value)}
                    style={{ width: "100%", border: "0.5px solid #E5E5E5", borderRadius: 6, padding: "5px 6px 5px 22px", fontSize: 11, background: "#F9FAFB", outline: "none", cursor: "pointer", color: logsPanelLeadFilter ? "#111" : "#9CA3AF", appearance: "none" }}
                  >
                    <option value="">Selecionar lead</option>
                    {logsPanelLeads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <select value={logsPanelPeriod} onChange={e => setLogsPanelPeriod(e.target.value)}
                  style={{ border: "0.5px solid #E5E5E5", borderRadius: 6, padding: "5px 8px", fontSize: 11, background: "#F9FAFB", outline: "none", cursor: "pointer", color: "#374151", flexShrink: 0 }}
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
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Criar nova automação</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label className="text-xs font-medium">Nome</Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome da automação"
                className="mt-1"
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
                className="mt-1 resize-none"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Grupo</Label>
              <Input
                value={newGroup}
                onChange={e => setNewGroup(e.target.value)}
                placeholder="Ex: Automação"
                className="mt-1"
              />
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
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
            <div style={{ width: 160, borderRight: "0.5px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
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
                      {cat.triggers.map(t => (
                        <button
                          key={t.id}
                          onClick={() => handleSelectTrigger(cat, t)}
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.background = "#F0FDF4"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E5E5"; e.currentTarget.style.background = "#FFFFFF"; }}
                        >
                          <ArrowRight size={14} color="hsl(var(--primary))" style={{ marginTop: 1, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{t.label}</div>
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, lineHeight: 1.4 }}>{t.description}</div>
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

      {/* Ações picker */}
      <Dialog open={acoesPickerOpen} onOpenChange={setAcoesPickerOpen}>
        <DialogContent style={{ maxWidth: 620, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", height: 480 }}>
            <div style={{ width: 160, borderRight: "0.5px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
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
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
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
            <div style={{ width: 160, borderRight: "0.5px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
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
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
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
            <div style={{ width: 160, borderRight: "0.5px solid #E5E5E5", padding: "16px 0", overflowY: "auto", flexShrink: 0 }}>
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
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "#FFFFFF", cursor: "pointer", textAlign: "left", transition: "all 0.1s" }}
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
            <Input value={renameName} onChange={e => setRenameName(e.target.value)} className="mt-1" onKeyDown={e => e.key === "Enter" && handleRename()} autoFocus />
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

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const zoomBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, background: "transparent", border: "none",
  color: "#6B7280", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
};

const tcpSelectStyle: React.CSSProperties = {
  width: "100%", border: "0.5px solid #E5E5E5", borderRadius: 6,
  padding: "7px 10px", fontSize: 12, background: "#FFFFFF", outline: "none", cursor: "pointer",
};

const tcpInputStyle: React.CSSProperties = {
  width: "100%", border: "0.5px solid #E5E5E5", borderRadius: 6,
  padding: "7px 10px", fontSize: 12, background: "#FFFFFF", outline: "none", boxSizing: "border-box",
};

const tcpWarning = (text: string) => (
  <div style={{ background: "#FFFBEB", border: "0.5px solid #FCD34D", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>
    <span style={{ fontWeight: 700 }}>⚠ </span>{text}
  </div>
);

// ─── TriggerConfigPanel ────────────────────────────────────────────────────────

function TriggerConfigPanel({ trigger, onClose, onChangeTrigger, updateConfig, pipelines, crmTags, addTag, teamMembers, products, lossReasons, customFieldGroups }: {
  trigger: TriggerConfig;
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
        <button style={{ width: 32, height: 32, borderRadius: 6, background: "#F3F4F6", border: "0.5px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
          style={{ width: "100%", border: "0.5px solid #E5E5E5", borderRadius: 6, padding: "8px 10px", fontSize: 12, resize: "none", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
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

      case "http_webhook":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Url do webhook</div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <div style={{ flex: 1, background: "#F9FAFB", border: "0.5px solid #E5E5E5", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5, wordBreak: "break-all" }}>
                  {`https://api.rezultcrm.com/v1/automations/webhook/${cfg.webhookId ?? "—"}`}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(`https://api.rezultcrm.com/v1/automations/webhook/${cfg.webhookId ?? ""}`).then(() => toast.success("URL copiada"))}
                  style={{ width: 32, height: 32, borderRadius: 6, background: "#F3F4F6", border: "0.5px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >
                  <Copy size={13} color="#6B7280" />
                </button>
              </div>
            </div>
            {tcpWarning("O webhook possui um limite de 60 requisições por minuto. Caso precisar aumentar o limite entre em contato com o suporte.")}
            <SourceBadge />
          </div>
        );

      case "outra_automacao":
        return <SourceBadge />;

      case "mcp_tool":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Nome da tool</div>
              <input type="text" value={(cfg.toolName as string) ?? ""} onChange={e => updateConfig("toolName", e.target.value)} style={tcpInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Descrição da tool</div>
              <input type="text" value={(cfg.toolDesc as string) ?? ""} onChange={e => updateConfig("toolDesc", e.target.value)} style={tcpInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Parâmetro de sessão</div>
              <select value={(cfg.sessionParam as string) ?? "none"} onChange={e => updateConfig("sessionParam", e.target.value)} style={tcpSelectStyle}>
                <option value="none">Nenhum</option>
              </select>
            </div>
            <SourceBadge />
            <button style={{ background: "hsl(var(--primary))", color: "#FFFFFF", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Adicionar parâmetro
            </button>
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
            <div style={{ background: "#F9FAFB", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: "10px 12px" }}>
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
      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "flex-start", gap: 10 }}>
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
      <div style={{ padding: "10px 16px", borderTop: "0.5px solid #E5E5E5" }}>
        <button
          onClick={onChangeTrigger}
          style={{ width: "100%", border: "0.5px solid #E5E5E5", borderRadius: 8, background: "transparent", color: "#6B7280", fontSize: 12, padding: "7px", cursor: "pointer" }}
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
        position: "absolute", left: node.x, top: node.y, width: 260,
        zIndex: 2,
        background: "#FFFFFF",
        border: `${selected ? 2 : 1.5}px dashed ${selected ? "hsl(var(--primary))" : "#CCCCCC"}`,
        borderRadius: 12, padding: 14, cursor: "grab",
        boxShadow: selected ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: "0.5px solid #E5E5E5" }}>
        <Play size={14} fill="hsl(var(--primary))" color="hsl(var(--primary))" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Início</span>
      </div>
      <div style={{ paddingTop: 10 }}>
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
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, paddingTop: 10, borderTop: "0.5px solid #E5E5E5", fontSize: 11 }}>
        <button
          data-action
          onClick={(e) => { e.stopPropagation(); if ((stats?.s ?? 0) > 0) onStatClick?.("success"); }}
          style={{ background: "none", border: "none", padding: "2px 6px", borderRadius: 4, color: "hsl(var(--primary))", fontWeight: 600, cursor: (stats?.s ?? 0) > 0 ? "pointer" : "default", fontSize: 11 }}
          onMouseEnter={e => { if ((stats?.s ?? 0) > 0) e.currentTarget.style.background = "hsl(var(--primary) / 0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
        >{stats?.s ?? 0} Sucessos</button>
        <button
          data-action
          onClick={(e) => { e.stopPropagation(); if ((stats?.a ?? 0) > 0) onStatClick?.("alert"); }}
          style={{ background: "none", border: "none", padding: "2px 6px", borderRadius: 4, color: "#F59E0B", fontWeight: 600, cursor: (stats?.a ?? 0) > 0 ? "pointer" : "default", fontSize: 11 }}
          onMouseEnter={e => { if ((stats?.a ?? 0) > 0) e.currentTarget.style.background = "#FEF3C7"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
        >{stats?.a ?? 0} Alertas</button>
        <button
          data-action
          onClick={(e) => { e.stopPropagation(); if ((stats?.e ?? 0) > 0) onStatClick?.("error"); }}
          style={{ background: "none", border: "none", padding: "2px 6px", borderRadius: 4, color: "#EF4444", fontWeight: 600, cursor: (stats?.e ?? 0) > 0 ? "pointer" : "default", fontSize: 11 }}
          onMouseEnter={e => { if ((stats?.e ?? 0) > 0) e.currentTarget.style.background = "#FEE2E2"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
        >{stats?.e ?? 0} Erros</button>
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
        zIndex: 1,
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
                style={{ position: "absolute", top: 22, right: 0, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 6, display: "flex", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 50 }}
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

function ActionNode({ node, selected, onSelect, onPortDragStart, onErrorPortDragStart, onConditionPortDragStart, onBranchPortDragStart, onDragStart, onDelete, onDuplicate, onAddNote, onOpenAcoesPicker, onOpenCondicoesPicker, removeSubBlock, removeActionItem, removeConditionItem, stats, onStatClick, portDragging, portHovered, onAddRandomBranch, onRemoveRandomBranch }: {
  node: CanvasNode;
  selected: boolean;
  onSelect: () => void;
  onPortDragStart: (e: React.MouseEvent) => void;
  onErrorPortDragStart?: (e: React.MouseEvent) => void;
  onConditionPortDragStart?: (e: React.MouseEvent, condId: string) => void;
  onBranchPortDragStart?: (e: React.MouseEvent, branchId: string) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddNote: () => void;
  onOpenAcoesPicker?: () => void;
  onOpenCondicoesPicker?: () => void;
  removeSubBlock?: (blockId: string) => void;
  removeActionItem?: (itemId: string) => void;
  removeConditionItem?: (itemId: string) => void;
  stats?: { s: number; a: number; e: number };
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
      style={{ position: "absolute", top: -40, right: 0, display: "flex", gap: 4, background: "#FFF", border: "0.5px solid #E5E5E5", borderRadius: 8, padding: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
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
          position: "absolute", left: node.x, top: node.y, width: 270,
          zIndex: 2,
          background: "#FFFFFF",
          border: `${selected ? 2 : 1}px solid ${selected ? "#F97316" : "#E5E5E5"}`,
          borderRadius: 12, cursor: "grab",
          boxShadow: selected ? "0 4px 16px rgba(249,115,22,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {inputPort}
        {selected && toolbar}
        {/* Header */}
        <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
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
        <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 14px", borderTop: "0.5px solid #E5E5E5", fontSize: 11 }}>
          {([
            { key: "success" as const, count: stats?.s ?? 0, color: "#F97316", label: "Sucessos" },
            { key: "alert"   as const, count: stats?.a ?? 0, color: "#F59E0B", label: "Alertas"  },
            { key: "error"   as const, count: stats?.e ?? 0, color: "#EF4444", label: "Erros"    },
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
        style={{ position: "absolute", left: node.x, top: node.y, width: 260, zIndex: 2, background: "#FFFFFF", border: `${selected ? 2 : 1}px solid ${selected ? "#8B5CF6" : "#E5E5E5"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(139,92,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
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
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, paddingTop: 8, borderTop: "0.5px solid #F3F4F6", fontSize: 11 }}>
            <button data-action onClick={(e) => { e.stopPropagation(); if ((stats?.s ?? 0) > 0) onStatClick?.("success"); }}
              style={{ background: "none", border: "none", padding: "2px 6px", borderRadius: 4, color: "hsl(var(--primary))", fontWeight: 600, cursor: (stats?.s ?? 0) > 0 ? "pointer" : "default" }}
              onMouseEnter={e => { if ((stats?.s ?? 0) > 0) e.currentTarget.style.background = "hsl(var(--primary) / 0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >{stats?.s ?? 0}<br /><span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280" }}>Sucessos</span></button>
            <button data-action onClick={(e) => { e.stopPropagation(); if ((stats?.a ?? 0) > 0) onStatClick?.("alert"); }}
              style={{ background: "none", border: "none", padding: "2px 6px", borderRadius: 4, color: "#F59E0B", fontWeight: 600, cursor: (stats?.a ?? 0) > 0 ? "pointer" : "default" }}
              onMouseEnter={e => { if ((stats?.a ?? 0) > 0) e.currentTarget.style.background = "#FEF3C7"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >{stats?.a ?? 0}<br /><span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280" }}>Alertas</span></button>
            <button data-action onClick={(e) => { e.stopPropagation(); if ((stats?.e ?? 0) > 0) onStatClick?.("error"); }}
              style={{ background: "none", border: "none", padding: "2px 6px", borderRadius: 4, color: "#EF4444", fontWeight: 600, cursor: (stats?.e ?? 0) > 0 ? "pointer" : "default" }}
              onMouseEnter={e => { if ((stats?.e ?? 0) > 0) e.currentTarget.style.background = "#FEE2E2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >{stats?.e ?? 0}<br /><span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280" }}>Erros</span></button>
          </div>
        </div>
      </div>
    );
  }

  if (node.type === "espera") {
    const espera = node.espera;
    return (
      <div data-node onMouseDown={onDragStart}
        style={{ position: "absolute", left: node.x, top: node.y, width: 250, zIndex: 2, background: "#FFFFFF", border: `${selected ? 2 : 1}px solid ${selected ? "#3B82F6" : "#E5E5E5"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
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
        style={{ position: "absolute", left: node.x, top: node.y, width: 290, zIndex: 2, background: "#FFFFFF", border: `${selected ? 2 : 1}px solid ${selected ? "#F97316" : "#E5E5E5"}`, borderRadius: 12, cursor: "grab", boxShadow: selected ? "0 4px 16px rgba(249,115,22,0.15)" : "0 1px 4px rgba(0,0,0,0.06)" }}>
        {inputPort}
        {selected && toolbar}
        <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
          <Shuffle size={15} color="#F97316" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>Randomizador</span>
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5, marginBottom: 8 }}>Divida o fluxo em ramificações aleatórias. Clique para adicionar um randomizador:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {branches.map((b, i) => (
              <div key={b.id} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", paddingRight: 22, background: "#F9FAFB", border: "0.5px solid #E5E5E5", borderRadius: 6 }}>
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
          <div style={{ display: "flex", justifyContent: "space-around", marginTop: 8, paddingTop: 8, borderTop: "0.5px solid #E5E5E5", fontSize: 11 }}>
            <button data-action onClick={(e) => { e.stopPropagation(); if ((stats?.s ?? 0) > 0) onStatClick?.("success"); }}
              style={{ background: "none", border: "none", padding: "2px 4px", borderRadius: 4, color: "hsl(var(--primary))", fontWeight: 600, cursor: (stats?.s ?? 0) > 0 ? "pointer" : "default", fontSize: 11 }}
              onMouseEnter={e => { if ((stats?.s ?? 0) > 0) e.currentTarget.style.background = "hsl(var(--primary) / 0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >{stats?.s ?? 0}<br /><span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280" }}>Sucessos</span></button>
            <button data-action onClick={(e) => { e.stopPropagation(); if ((stats?.a ?? 0) > 0) onStatClick?.("alert"); }}
              style={{ background: "none", border: "none", padding: "2px 4px", borderRadius: 4, color: "#F59E0B", fontWeight: 600, cursor: (stats?.a ?? 0) > 0 ? "pointer" : "default", fontSize: 11 }}
              onMouseEnter={e => { if ((stats?.a ?? 0) > 0) e.currentTarget.style.background = "#FEF3C7"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >{stats?.a ?? 0}<br /><span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280" }}>Alertas</span></button>
            <button data-action onClick={(e) => { e.stopPropagation(); if ((stats?.e ?? 0) > 0) onStatClick?.("error"); }}
              style={{ background: "none", border: "none", padding: "2px 4px", borderRadius: 4, color: "#EF4444", fontWeight: 600, cursor: (stats?.e ?? 0) > 0 ? "pointer" : "default", fontSize: 11 }}
              onMouseEnter={e => { if ((stats?.e ?? 0) > 0) e.currentTarget.style.background = "#FEE2E2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >{stats?.e ?? 0}<br /><span style={{ fontSize: 10, fontWeight: 400, color: "#6B7280" }}>Erros</span></button>
          </div>
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
          position: "absolute", left: node.x, top: node.y, width: 240,
          zIndex: 2,
          background: "#FFFFFF",
          border: `${selected ? 2 : 1}px solid ${selected ? "hsl(var(--primary))" : "#E5E5E5"}`,
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
        border: `${selected ? 2 : 1}px solid ${selected ? "#3B82F6" : "#E5E5E5"}`,
        borderRadius: 12, cursor: "grab",
        boxShadow: selected ? "0 4px 16px rgba(59,130,246,0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {inputPort}
      {/* Toolbar above node (shown when selected) */}
      {selected && toolbar}

      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "0.5px solid #E5E5E5", display: "flex", alignItems: "center", gap: 8 }}>
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
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "#F9FAFB", border: "0.5px solid #E5E5E5", borderRadius: 7, fontSize: 12, color: "#374151" }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#6B7280" }}>Caso o contato não responda.</span>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FCA5A5", border: "1.5px solid #EF4444", flexShrink: 0 }} />
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
      <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 14px", borderTop: "0.5px solid #E5E5E5", fontSize: 11 }}>
        {([
          { key: "success" as const, count: stats?.s ?? 0, color: "#3B82F6", label: "Sucessos" },
          { key: "alert"   as const, count: stats?.a ?? 0, color: "#F59E0B", label: "Alertas"  },
          { key: "error"   as const, count: stats?.e ?? 0, color: "#EF4444", label: "Erros"    },
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
        <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
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
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
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
      <div style={{ borderTop: "0.5px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
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
    <input type="text" value={String(cfg[key] ?? "")} onChange={e => set(key, e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" as const }} />
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
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
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
                  <button title="Copiar" style={{ width: 22, height: 22, border: "0.5px solid #E5E5E5", borderRadius: 4, background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Copy size={11} /></button>
                  <button title="Inserir campo variável" style={{ width: 22, height: 22, border: "0.5px solid #3B82F6", borderRadius: 4, background: "#EFF6FF", color: "#3B82F6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{"{}"}</button>
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
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
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
                    style={{ width: 46, border: "0.5px solid #E5E5E5", borderRadius: 5, padding: "4px 6px", fontSize: 12, outline: "none", textAlign: "center", background: "#FFF" }} />
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
      <div style={{ borderTop: "0.5px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
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

function ApiPanel({ node, onClose, onDelete, onDuplicate, updateApiConfig }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  updateApiConfig: (config: Partial<ApiConfig>) => void;
}) {
  const [activeTab, setActiveTab] = useState<"headers" | "params" | "body">("headers");
  const cfg = node.apiConfig ?? { method: "POST", url: "", headers: [], params: [], body: "" };
  const addHeader = () => updateApiConfig({ headers: [...cfg.headers, { key: "", value: "" }] });
  const removeHeader = (i: number) => updateApiConfig({ headers: cfg.headers.filter((_, idx) => idx !== i) });
  const updateHeader = (i: number, key: string, value: string) => {
    const headers = [...cfg.headers]; headers[i] = { key, value }; updateApiConfig({ headers });
  };
  const addParam = () => updateApiConfig({ params: [...cfg.params, { key: "", value: "" }] });
  const removeParam = (i: number) => updateApiConfig({ params: cfg.params.filter((_, idx) => idx !== i) });
  const updateParam = (i: number, key: string, value: string) => {
    const params = [...cfg.params]; params[i] = { key, value }; updateApiConfig({ params });
  };
  return (
    <aside style={{ width: 320, minWidth: 320, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} /> API
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
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Faça chamadas a APIs externas</p>
      </div>
      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <select value={cfg.method} onChange={e => updateApiConfig({ method: e.target.value })}
            style={{ width: 90, padding: "7px 8px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", fontWeight: 600, color: "#3B82F6", cursor: "pointer" }}>
            {["GET", "POST", "PUT", "DELETE", "PATCH"].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={cfg.url} onChange={e => updateApiConfig({ url: e.target.value })}
            placeholder="https://..."
            style={{ flex: 1, padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none" }} />
        </div>
      </div>
      <div style={{ borderBottom: "0.5px solid #E5E5E5", flexShrink: 0, display: "flex" }}>
        {(["headers", "params", "body"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ flex: 1, padding: "8px 4px", border: "none", background: "transparent", borderBottom: `2px solid ${activeTab === tab ? "#3B82F6" : "transparent"}`, fontSize: 12, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? "#3B82F6" : "#6B7280", cursor: "pointer" }}>
            {tab === "headers" ? "Cabeçalho" : tab === "params" ? "Parâmetros" : "Corpo"}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
        {activeTab !== "body" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(activeTab === "headers" ? cfg.headers : cfg.params).map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input value={h.key} onChange={e => activeTab === "headers" ? updateHeader(i, e.target.value, h.value) : updateParam(i, e.target.value, h.value)}
                    placeholder="Chave" style={{ flex: 1, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, outline: "none" }} />
                  <input value={h.value} onChange={e => activeTab === "headers" ? updateHeader(i, h.key, e.target.value) : updateParam(i, h.key, e.target.value)}
                    placeholder="Valor" style={{ flex: 1, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 5, fontSize: 11, outline: "none" }} />
                  <button onClick={() => activeTab === "headers" ? removeHeader(i) : removeParam(i)}
                    style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                  ><X size={11} /></button>
                </div>
              ))}
            </div>
            <button onClick={activeTab === "headers" ? addHeader : addParam}
              style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", border: "0.5px dashed #E5E5E5", borderRadius: 6, background: "transparent", color: "#6B7280", fontSize: 11, cursor: "pointer" }}>
              <Plus size={11} /> {activeTab === "headers" ? "Adicionar cabeçalho" : "Adicionar parâmetro"}
            </button>
          </div>
        )}
        {activeTab === "body" && (
          <textarea value={cfg.body} onChange={e => updateApiConfig({ body: e.target.value })}
            placeholder={'{"chave": "valor"}'}
            style={{ width: "100%", minHeight: 200, padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 11, fontFamily: "monospace", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
        )}
      </div>
    </aside>
  );
}

// ─── CamposPanel ──────────────────────────────────────────────────────────────

function CamposPanel({ node, onClose, onDelete, onDuplicate }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { customFieldGroups } = useCRM();
  const [campo, setCampo] = useState("");
  const [operacao, setOperacao] = useState("");
  const [valor, setValor] = useState("");
  return (
    <aside style={{ width: 300, minWidth: 300, height: "100%", background: "#FFFFFF", boxShadow: "2px 0 12px rgba(0,0,0,0.10)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#111111", padding: 0 }}>
            <ArrowLeft size={16} /> Operações de campos
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
        <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 0" }}>Manipule campos do lead ou negócio</p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Campo</label>
            <select value={campo} onChange={e => setCampo(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", cursor: "pointer" }}>
              <option value="">Selecione um campo...</option>
              <option value="nome">Nome</option>
              <option value="email">Email</option>
              <option value="telefone">Telefone</option>
              <option value="cpf">CPF</option>
              <option value="empresa">Empresa</option>
              <option value="tags">Tags</option>
              <option value="observacoes">Observações</option>
              {customFieldGroups.flatMap(g => g.items.map(item => (
                <option key={item.id} value={item.id}>{g.name} › {item.label}</option>
              )))}

            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Operação</label>
            <select value={operacao} onChange={e => setOperacao(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", cursor: "pointer" }}>
              <option value="">Selecione a operação...</option>
              <option value="definir">Definir valor</option>
              <option value="limpar">Limpar valor</option>
              <option value="incrementar">Incrementar</option>
              <option value="decrementar">Decrementar</option>
              <option value="concatenar">Concatenar</option>
            </select>
          </div>
          {operacao && operacao !== "limpar" && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Valor</label>
              <input value={valor} onChange={e => setValor(e.target.value)}
                placeholder="Valor ou variável {{var}}..."
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              <div style={{ marginTop: 4, fontSize: 10, color: "#9CA3AF" }}>Use {"{{variavel}}"} para inserir variáveis dinâmicas.</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ borderTop: "0.5px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
        <button onClick={() => toast.info("Em breve: múltiplas operações de campo")}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "1px dashed #E5E5E5", borderRadius: 8, background: "#F9FAFB", color: "#22C55E", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F0FDF4"; e.currentTarget.style.borderColor = "#86EFAC"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#E5E5E5"; }}
        >
          <Plus size={13} /> Adicionar operação
        </button>
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
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ flex: 1, height: 34, padding: "0 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", background: "#fff" }}
      />
      <button
        onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); toast.success("Copiado!"); }}
        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", flexShrink: 0 }}
      ><Copy size={12} /></button>
      <button
        onClick={() => toast.info("Variáveis em breve")}
        style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #BFDBFE", background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3B82F6", flexShrink: 0, fontSize: 11, fontWeight: 700 }}
      >{"{}"}</button>
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
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer", color: selectedIds.length === 0 ? "#9CA3AF" : "#374151" }}>
        <span>{selectedIds.length === 0 ? "Selecione as tags" : `${selectedIds.length} tag${selectedIds.length > 1 ? "s" : ""} selecionada${selectedIds.length > 1 ? "s" : ""}`}</span>
        <ChevronDown size={12} style={{ color: "#9CA3AF" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 50, background: "#FFFFFF", border: "0.5px solid #E5E5E5", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", maxHeight: 260 }}>
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

  const PipelineStageSelect = ({ verbAction }: { verbAction: string }) => {
    const selPipeline = pipelines.find(p => p.id === (cfg.pipeline as string));
    const stageOpts = selPipeline
      ? selPipeline.columns.map(c => ({ value: c.id, label: c.title }))
      : pipelines.flatMap(p => p.columns.map(c => ({ value: c.id, label: `${p.name} › ${c.title}` })));
    return (
      <>
        {grp(<>{lbl("Pipeline (opcional)")}
          <AcoesSelect value={(cfg.pipeline as string) ?? ""} onChange={v => { set("pipeline", v); set("etapa", ""); }}
            options={[{ value: "", label: "Todas as pipelines" }, ...pipelines.map(p => ({ value: p.id, label: p.name }))]}
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
      return <PipelineStageSelect verbAction="criado" />;

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
          {grp(<>{lbl("Justificativa")}<textarea value={(cfg.justificativa as string) ?? ""} onChange={e => set("justificativa", e.target.value)} placeholder="Digite a justificativa..." rows={4} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box" }} /></>)}
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
        <textarea value={(cfg.comentario as string) ?? ""} onChange={e => set("comentario", e.target.value)} placeholder="Digite o comentário..." rows={4} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
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
        <textarea value={(cfg.sugestao as string) ?? ""} onChange={e => set("sugestao", e.target.value)} placeholder="Digite a sugestão de resposta..." rows={4} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
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
        <textarea value={(cfg.resultado as string) ?? ""} onChange={e => set("resultado", e.target.value)} placeholder="Digite o conteúdo ou use {{variavel}}..." rows={4} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      </>);

    case "enviar_notificacao":
      return grp(<>
        {lbl("Mensagem da notificação")}
        <textarea value={(cfg.mensagem as string) ?? ""} onChange={e => set("mensagem", e.target.value)} placeholder="Digite a mensagem da notificação..." rows={3} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      </>);

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
        <textarea value={(cfg.descricao as string) ?? ""} onChange={e => set("descricao", e.target.value)} placeholder="Descreva a atividade..." rows={3} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, color: "#111", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
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
        <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
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
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5", flexShrink: 0 }}>
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
      <div style={{ borderTop: "0.5px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
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

function MensagemPanel({ node, onClose, onDelete, onDuplicate, removeSubBlock, updateSubBlock, onAddSubBlock }: {
  node: CanvasNode;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  removeSubBlock: (blockId: string) => void;
  updateSubBlock: (blockId: string, data: Partial<SubBlock>) => void;
  onAddSubBlock: (type: SubBlockType) => void;
}) {
  const hasSubBlocks = (node.subBlocks ?? []).length > 0;
  return (
    <aside style={{ width: 320, minWidth: 320, maxWidth: 320, height: "100%", background: "#FFFFFF", boxShadow: "4px 0 16px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "0.5px solid #E5E5E5" }}>
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

      {/* Conexão */}
      <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #F0F0F0", flexShrink: 0 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Conexão</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select style={{ flex: 1, padding: "7px 10px", border: "0.5px solid #E5E5E5", borderRadius: 8, fontSize: 12, outline: "none", background: "#FFF" }}>
            <option>Selecionar</option>
          </select>
          <button style={{ width: 30, height: 30, borderRadius: 7, border: "0.5px solid #E5E5E5", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={12} style={{ transform: "rotate(180deg)" }} /></button>
          <button style={{ width: 30, height: 30, borderRadius: 7, border: "0.5px solid #E5E5E5", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Settings size={12} /></button>
        </div>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0", lineHeight: 1.4 }}>Deixe em branco para usar a conexão dos blocos anteriores.</p>
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
              <div key={b.id} style={{ marginBottom: 8, border: "0.5px solid #E5E5E5", borderRadius: 10, overflow: "hidden", background: "#FAFAFA" }}>
                {/* Sub-block toolbar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "4px 8px", gap: 2, borderBottom: "0.5px solid #F0F0F0", background: "#F9FAFB" }}>
                  <button onClick={() => removeSubBlock(b.id)} style={{ width: 22, height: 22, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                  ><Trash2 size={11} /></button>
                </div>
                {/* Sub-block content */}
                <div style={{ padding: "10px 12px" }}>
                  {b.type === "mensagem_texto" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 600, color: "#374151" }}><AlignLeft size={13} /> Mensagem de texto</div>
                      <textarea
                        value={b.text ?? ""}
                        onChange={e => updateSubBlock(b.id, { text: e.target.value })}
                        placeholder="Digite a mensagem..."
                        style={{ width: "100%", minHeight: 80, border: "0.5px solid #E5E5E5", borderRadius: 7, padding: "8px 10px", fontSize: 12, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                      />
                    </div>
                  )}
                  {b.type === "entrada_usuario" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#3B82F6" }}><HelpCircle size={13} /> Entrada do usuário</div>
                      <div style={{ padding: "8px 12px", background: "#EFF6FF", border: "0.5px solid #BFDBFE", borderRadius: 8, fontSize: 12, color: "#1D4ED8", textAlign: "center" }}>Resposta do usuário</div>
                    </div>
                  )}
                  {b.type === "atraso_tempo" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Clock size={13} /> Atraso de tempo</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>Atraso de</span>
                        <input
                          type="number" min={0}
                          value={b.delaySeconds ?? 0}
                          onChange={e => updateSubBlock(b.id, { delaySeconds: Number(e.target.value) })}
                          style={{ width: 64, padding: "5px 8px", border: "0.5px solid #E5E5E5", borderRadius: 6, fontSize: 12, outline: "none" }}
                        />
                        <span style={{ fontSize: 12, color: "#6B7280" }}>segundos</span>
                      </div>
                    </div>
                  )}
                  {b.type === "mensagem_audio" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Mic size={13} /> Mensagem de áudio</div>
                      <div style={{ padding: "10px 12px", background: "#F9FAFB", border: "0.5px dashed #D1D5DB", borderRadius: 8, textAlign: "center" }}>
                        <button style={{ padding: "6px 14px", border: "0.5px solid #E5E5E5", borderRadius: 6, background: "#FFF", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, margin: "0 auto" }}>
                          <Mic size={12} /> Iniciar gravação
                        </button>
                      </div>
                    </div>
                  )}
                  {b.type === "arquivo_anexo" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Paperclip size={13} /> Arquivo anexo</div>
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 14, border: "0.5px dashed #D1D5DB", borderRadius: 8, background: "#F9FAFB", cursor: "pointer", fontSize: 11, color: "#6B7280" }}>
                        <Upload size={20} color="#D1D5DB" />
                        Selecionar arquivo
                        <input type="file" style={{ display: "none" }} />
                      </label>
                    </div>
                  )}
                  {b.type === "arquivo_url" && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, fontWeight: 600, color: "#374151" }}><Link2 size={13} /> Arquivo URL Dinâmica</div>
                      <input
                        type="url"
                        value={b.fileUrl ?? ""}
                        onChange={e => updateSubBlock(b.id, { fileUrl: e.target.value })}
                        placeholder="URL do arquivo"
                        style={{ width: "100%", padding: "7px 10px", border: `0.5px solid ${b.fileUrl && !b.fileUrl.startsWith("http") ? "#EF4444" : "#E5E5E5"}`, borderRadius: 7, fontSize: 12, outline: "none", boxSizing: "border-box" }}
                      />
                      {b.fileUrl && !b.fileUrl.startsWith("http") && (
                        <p style={{ fontSize: 11, color: "#EF4444", margin: "4px 0 0" }}>URL informada é inválida</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div style={{ borderTop: "0.5px solid #E5E5E5", padding: "12px 16px", flexShrink: 0 }}>
        <button onClick={() => onAddSubBlock("mensagem_texto")}
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
