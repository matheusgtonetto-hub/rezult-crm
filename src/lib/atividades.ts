// A aparência de cada tipo de atividade na linha do tempo do negócio.
//
// ESTA É A ÚNICA CÓPIA. Em 18/09/2026 este mapa existia idêntico, palavra por
// palavra, em `MultiatendimentoPage.tsx` e em `LeadDrawer.tsx`. É a mesma
// linha do tempo mostrada em dois lugares, então divergir era questão de tempo.
//
// ─── Por que a cor mudou ──────────────────────────────────────────────────────
//
// O mapa antigo dava uma cor a cada um dos doze tipos, e isso trazia dois
// problemas medidos:
//
// 1. Três dos dez pares reprovavam o mínimo de 3:1 de componente de UI, que é
//    o que vale para um glifo de 13px: "ganho" e "ligação" em `#22C55E` sobre
//    `#DCFCE7` davam 2,07:1, e "e-mail" em `#F59E0B` sobre `#FEF3C7` dava
//    1,93:1. Ícone que não se vê não informa o tipo.
//
// 2. A mesma cor significava coisas diferentes: verde era "ganho" E "ligação",
//    roxo era "follow-up" E "transferência", azul era "reunião" E "etapa
//    alterada". Cor que aponta para dois sentidos não aponta para nenhum.
//
// A saída não é achar doze cores acessíveis. É lembrar que **cada tipo já tem
// um ícone próprio**, e que o ícone é quem carrega a categoria. A cor fica com
// o que ela sabe dizer sozinha: desfecho.
//
//   ganho      → verde da marca      (é o sucesso, e a matriz não admite um segundo verde)
//   perdido    → vermelho do sistema
//   whatsapp   → verde da marca      (cor de canal, exceção sancionada da seção 3.10)
//   os outros  → neutro              (o ícone diz qual é)
//
// Medido depois da troca: 4,69:1 no neutro, 4,30:1 no verde, 5,91:1 no
// vermelho. Nenhum par abaixo de 3:1.

import {
  ArrowLeftRight, ArrowRightLeft, CalendarDays, CheckSquare, Mail,
  MessageCircle, Phone, PlusCircle, RefreshCw, StickyNote, Trophy, XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType } from "@/data/mockData";

/** Tinta do glifo e fundo do círculo. Token, porque isto só vive em CSS. */
type AparenciaDeAtividade = { color: string; bg: string; label: string; Icon: LucideIcon };

const NEUTRO = { color: "var(--text-muted)", bg: "var(--neutral-100)" };
const VERDE = { color: "var(--accent-700)", bg: "var(--accent-50)" };
const VERMELHO = { color: "var(--danger-fg)", bg: "var(--danger-bg)" };

export const ACT_META: Record<ActivityType, AparenciaDeAtividade> = {
  note:         { ...NEUTRO,   label: "Anotação",       Icon: StickyNote },
  stage_change: { ...NEUTRO,   label: "Etapa alterada", Icon: ArrowRightLeft },
  whatsapp:     { ...VERDE,    label: "WhatsApp",       Icon: MessageCircle },
  won:          { ...VERDE,    label: "Ganho",          Icon: Trophy },
  lost:         { ...VERMELHO, label: "Perdido",        Icon: XCircle },
  created:      { ...NEUTRO,   label: "Criado",         Icon: PlusCircle },
  meeting:      { ...NEUTRO,   label: "Reunião",        Icon: CalendarDays },
  call:         { ...NEUTRO,   label: "Ligação",        Icon: Phone },
  email:        { ...NEUTRO,   label: "E-mail",         Icon: Mail },
  follow_up:    { ...NEUTRO,   label: "Follow-up",      Icon: RefreshCw },
  task:         { ...NEUTRO,   label: "Tarefa",         Icon: CheckSquare },
  transfer:     { ...NEUTRO,   label: "Transferência",  Icon: ArrowLeftRight },
};
