/**
 * Rezult CRM — Icon mapping to lucide-react
 *
 * The HTML mockups use a custom 12-icon set drawn at stroke-width 1.6.
 * For the React app, swap them for lucide equivalents (1.75 stroke is the closest match).
 *
 * import { Icon } from "@/components/icon"; <Icon name="pipeline" size={16} />
 */

import {
  // Product nav
  KanbanSquare,
  MessageCircle,
  Bot,
  Workflow,
  BarChart3,
  Plug,
  Users,

  // Lead / data
  Flame,
  Star,
  Phone,
  Mail,
  Building2,
  Clock,
  TrendingUp,

  // Actions
  Plus,
  Filter,
  MoreHorizontal,
  Send,
  Paperclip,
  Smile,
  Check,
  ChevronRight,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Zap,

  // External / sources
  Search,
} from "lucide-react";

import * as React from "react";

// Brand icons (Meta, Google, WhatsApp) aren't in lucide — use simple-icons
// or paste these inline SVGs:

export const MetaIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.5c-.5 1-1.5 1.5-2.5 1.5-1.4 0-2.5-.8-3.5-2.5-1 1.7-2.1 2.5-3.5 2.5-1 0-2-.5-2.5-1.5C4.5 14 4 12.5 4 11s.5-3 1-4c.5-1 1.5-1.5 2.5-1.5C9.4 5.5 10.5 7 12 9c1.5-2 2.6-3.5 4.5-3.5 1 0 2 .5 2.5 1.5.5 1 1 2.5 1 4s-.5 3-1 4z"/>
  </svg>
);

export const GoogleIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 4l3 5h-2v6h-2V9H9l3-5zM4 14h2v4h12v-4h2v6H4v-6z"/>
  </svg>
);

export const WhatsAppIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
);

// =====================================================================
// Mapping: brandbook icon name → lucide / custom component
// =====================================================================
export const ICON_MAP = {
  // Nav
  pipeline:    KanbanSquare,
  inbox:       MessageCircle,
  whatsapp:    WhatsAppIcon,
  agent:       Bot,
  automation:  Workflow,
  reports:     BarChart3,
  connections: Plug,
  team:        Users,

  // Lead / data
  flame:       Flame,
  star:        Star,
  phone:       Phone,
  mail:        Mail,
  building:    Building2,
  clock:       Clock,
  trending:    TrendingUp,
  lead:        Users,

  // Actions
  plus:        Plus,
  filter:      Filter,
  more:        MoreHorizontal,
  send:        Send,
  paperclip:   Paperclip,
  smile:       Smile,
  check:       Check,
  chevronRight:ChevronRight,
  arrowRight:  ArrowRight,
  arrowUp:     ArrowUp,
  arrowDown:   ArrowDown,
  zap:         Zap,
  search:      Search,
  plug:        Plug,

  // External
  meta:        MetaIcon,
  google:      GoogleIcon,
} as const;

export type IconName = keyof typeof ICON_MAP;

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  stroke?: number;
}

export function Icon({ name, size = 16, stroke = 1.75, ...rest }: IconProps) {
  const Cmp = ICON_MAP[name] as React.ComponentType<any>;
  return <Cmp width={size} height={size} strokeWidth={stroke} {...rest} />;
}
