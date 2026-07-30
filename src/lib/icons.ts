/**
 * Bridge: Tabler icons re-exported com os nomes equivalentes do Lucide.
 * Use em componentes novos. Componentes existentes migram gradualmente.
 *
 * MIGRAÇÃO PENDENTE — arquivos que ainda importam de lucide-react:
 *   src/pages/PipelinePage.tsx       — Plus, Search, MoreHorizontal, Pencil, Trash2,
 *                                       Calendar, Tag, Settings, Users, GitBranch,
 *                                       ChevronLeft, ChevronRight, GripVertical,
 *                                       Trophy, XCircle, ChevronDown
 *   src/pages/LeadsPage.tsx          — (verificar importações)
 *   src/pages/SettingsPage.tsx       — (verificar importações)
 *   src/pages/Planos.tsx             — Check, Zap, ArrowLeft, Loader2
 *   src/components/LeadDrawer.tsx    — (verificar importações)
 *   src/components/AppSidebar.tsx    — (verificar importações)
 *   src/components/ui/*              — shadcn usa lucide diretamente
 */

export {
  // Navegação / direção
  IconArrowLeft        as ArrowLeft,
  IconArrowRight       as ArrowRight,
  IconChevronDown      as ChevronDown,
  IconChevronLeft      as ChevronLeft,
  IconChevronRight     as ChevronRight,
  IconChevronUp        as ChevronUp,

  // Ações
  IconCheck            as Check,
  IconCircleCheck      as CheckCircle2,
  IconSquareCheck      as CheckSquare,
  IconPencil           as Pencil,
  IconPlus             as Plus,
  IconRefresh          as RefreshCw,
  IconSearch           as Search,
  IconTrash            as Trash2,
  IconUpload           as Upload,
  IconX                as X,
  IconCircleX          as XCircle,

  // Status / feedback
  IconAlertCircle      as AlertCircle,
  IconLoader2          as Loader2,
  IconBolt             as Zap,

  // Comunicação
  IconMail             as Mail,
  IconMailCheck        as MailCheck,
  IconMessage          as MessageSquare,
  IconMessageCircle    as MessageCircle,
  IconPhone            as Phone,

  // Interface / layout
  IconDots             as MoreHorizontal,
  IconLayoutSidebar    as PanelLeft,
  IconSettings         as Settings,

  // Negócios / dados
  IconBriefcase        as Briefcase,
  IconCalendar         as Calendar,
  IconCalendar         as CalendarDays,
  IconCalendar         as CalendarIcon,
  IconCircle           as Circle,
  IconFileSpreadsheet  as FileSpreadsheet,
  IconFilter           as Filter,
  IconGitBranch        as GitBranch,
  IconGripVertical     as GripVertical,
  IconKey              as KeyRound,
  IconPoint            as Dot,
  IconTag              as Tag,
  IconTag              as TagIcon,
  IconTrophy           as Trophy,
  IconUsers            as Users,
  IconEye              as Eye,
  IconEyeOff           as EyeOff,
} from '@tabler/icons-react';
