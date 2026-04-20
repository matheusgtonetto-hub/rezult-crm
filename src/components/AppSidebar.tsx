import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import {
  Users,
  CheckSquare,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  Zap,
  KanbanSquare,
  Sparkles,
  Bell,
  HelpCircle,
  Plus,
  RefreshCw,
  UserCircle,
  Bot,
  CreditCard,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  to: string;
  label: string;
  icon: typeof BarChart3;
  locked?: boolean;
  badge?: "IA" | "Em breve";
};

const navItems: NavItem[] = [
  { to: "/pilot", label: "Pilot", icon: Sparkles, badge: "IA" },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/pipeline", label: "Pipelines", icon: KanbanSquare },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/multiatendimento", label: "Multiatendimento", icon: MessageSquare, locked: true },
  { to: "/automacoes", label: "Automações", icon: Zap, locked: true },
  { to: "/agentes", label: "Agentes", icon: Bot, badge: "IA" },
  { to: "/rezult-pay", label: "Rezult Pay", icon: CreditCard },
];

function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 45%)`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const COMPANY = { name: "Rezult Demo", plan: "Plano Professional" };
const USER = { name: "Carlos Admin", email: "carlos@rezult.com" };

const SIDEBAR_BG = "#0F6E56";
const ICON_INACTIVE = "rgba(255,255,255,0.5)";
const ICON_ACTIVE = "#FFFFFF";
const HOVER_BG = "rgba(255,255,255,0.1)";
const ACTIVE_BG = "rgba(255,255,255,0.15)";

export function AppSidebar() {
  const { pathname } = useLocation();
  const { logout } = useCRM();

  // 40x40 clickable area, 10px radius, centered
  const itemBase =
    "w-10 h-10 flex items-center justify-center rounded-[10px] transition-colors duration-200 relative";

  const renderNav = (item: NavItem) => {
    const active = pathname.startsWith(item.to);
    const Icon = item.icon;

    if (item.locked) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>
            <div
              className={`${itemBase} cursor-not-allowed`}
              style={{ color: ICON_INACTIVE, opacity: 0.3 }}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span
                className="absolute -top-0.5 -right-0.5 rounded-[3px] flex items-center justify-center font-semibold leading-none px-1"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 7,
                  height: 10,
                }}
              >
                EM BREVE
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-[#111111] text-white border-0">
            {item.label} · Em breve
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Tooltip key={item.to}>
        <TooltipTrigger asChild>
          <RouterNavLink
            to={item.to}
            className={itemBase}
            style={{
              background: active ? ACTIVE_BG : "transparent",
              color: active ? ICON_ACTIVE : ICON_INACTIVE,
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = HOVER_BG;
                e.currentTarget.style.color = "rgba(255,255,255,0.9)";
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = ICON_INACTIVE;
              }
            }}
          >
            <Icon size={18} strokeWidth={1.75} />
            {item.badge === "IA" && (
              <span
                className="absolute -top-0.5 -right-0.5 rounded-full flex items-center justify-center font-bold leading-none"
                style={{
                  width: 14,
                  height: 14,
                  fontSize: 7,
                  background: "#FFFFFF",
                  color: "#0F6E56",
                }}
              >
                IA
              </span>
            )}
          </RouterNavLink>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-[#111111] text-white border-0">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  const settingsActive = pathname.startsWith("/configuracoes");

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="flex flex-col items-center shrink-0"
        style={{
          width: 52,
          minWidth: 52,
          maxWidth: 52,
          minHeight: "100vh",
          background: SIDEBAR_BG,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        {/* Logo RZ */}
        <div
          className="flex items-center justify-center text-[13px] font-bold tracking-tight"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1.5px solid rgba(255,255,255,0.5)",
            color: "#FFFFFF",
            marginBottom: 8,
          }}
          aria-label="Rezult"
        >
          RZ
        </div>

        {/* Company icon */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center justify-center text-white text-[11px] font-bold tracking-tight hover:opacity-90 transition-opacity"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: colorFromString(COMPANY.name),
                border: "1.5px solid rgba(255,255,255,0.3)",
                marginBottom: 16,
              }}
              aria-label="Empresa"
            >
              {initials(COMPANY.name)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                style={{ background: colorFromString(COMPANY.name) }}
              >
                {initials(COMPANY.name)}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{COMPANY.name}</span>
                <span className="text-xs text-muted-foreground font-normal">{COMPANY.plan}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <RefreshCw size={14} className="mr-2" /> Trocar empresa
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Plus size={14} className="mr-2" /> Adicionar empresa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          style={{
            width: 28,
            height: 1,
            background: "rgba(255,255,255,0.15)",
            marginBottom: 8,
          }}
        />

        {/* Main navigation */}
        <nav
          className="flex flex-col items-center"
          style={{ gap: 4, flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", width: "100%", alignItems: "center" }}
        >
          {navItems.map(renderNav)}
        </nav>

        {/* Footer */}
        <div className="flex flex-col items-center" style={{ gap: 4, paddingTop: 8 }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={itemBase}
                style={{ color: ICON_INACTIVE }}
                onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ICON_INACTIVE; }}
              >
                <Bell size={18} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#111111] text-white border-0">Notificações</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={itemBase}
                style={{ color: ICON_INACTIVE }}
                onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ICON_INACTIVE; }}
              >
                <HelpCircle size={18} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#111111] text-white border-0">Ajuda</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <RouterNavLink
                to="/configuracoes"
                className={itemBase}
                style={{
                  background: settingsActive ? ACTIVE_BG : "transparent",
                  color: settingsActive ? ICON_ACTIVE : ICON_INACTIVE,
                }}
                onMouseEnter={(e) => {
                  if (!settingsActive) {
                    e.currentTarget.style.background = HOVER_BG;
                    e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!settingsActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = ICON_INACTIVE;
                  }
                }}
              >
                <Settings size={18} strokeWidth={1.75} />
              </RouterNavLink>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#111111] text-white border-0">Configurações</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center text-[10px] font-bold hover:opacity-90 transition-opacity"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#FFFFFF",
                  color: "#0F6E56",
                  marginTop: 4,
                }}
                aria-label="Usuário"
              >
                {initials(USER.name)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm font-semibold">{USER.name}</span>
                <span className="text-xs text-muted-foreground font-normal">{USER.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserCircle size={14} className="mr-2" /> Meu perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut size={14} className="mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
