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
  Bell,
  HelpCircle,
  Building2,
  Plus,
  RefreshCw,
  UserCircle,
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
};

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/pipeline", label: "Pipelines", icon: KanbanSquare },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/multiatendimento", label: "Multiatendimento", icon: MessageSquare, locked: true },
  { to: "/automacoes", label: "Automações", icon: Zap, locked: true },
];

// Deterministic color from a string (for company avatar)
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

export function AppSidebar() {
  const { pathname } = useLocation();
  const { logout } = useCRM();

  const itemBase =
    "w-10 h-10 flex items-center justify-center rounded-[10px] transition-colors duration-200";

  const renderNav = (item: NavItem) => {
    const active = pathname.startsWith(item.to);
    const Icon = item.icon;

    if (item.locked) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>
            <div className={`${itemBase} text-muted-foreground opacity-35 cursor-not-allowed`}>
              <Icon size={22} strokeWidth={1.75} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">{item.label} · Em breve</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Tooltip key={item.to}>
        <TooltipTrigger asChild>
          <RouterNavLink
            to={item.to}
            className={`${itemBase} ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-[hsl(0_0%_94%)]"
            }`}
          >
            <Icon size={22} strokeWidth={1.75} />
          </RouterNavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  };

  const settingsActive = pathname.startsWith("/configuracoes");

  return (
    <TooltipProvider delayDuration={300}>
      <aside className="w-[60px] min-h-screen bg-sidebar flex flex-col items-center border-r border-sidebar-border shrink-0 py-3 gap-1">
        {/* Rezult logo (RZ) */}
        <div
          className="w-9 h-9 rounded-[10px] border-[1.5px] border-primary text-primary flex items-center justify-center text-[12px] font-bold tracking-tight"
          aria-label="Rezult"
        >
          RZ
        </div>

        <div className="h-px w-8 bg-sidebar-border my-2" />

        {/* Company icon */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-8 h-8 rounded-lg border-[0.5px] border-card-border flex items-center justify-center text-white text-[11px] font-bold tracking-tight hover:opacity-90 transition-opacity"
              style={{ background: colorFromString(COMPANY.name) }}
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

        <div className="h-px w-8 bg-sidebar-border my-2" />

        {/* Main navigation */}
        <nav className="flex-1 flex flex-col items-center gap-1">
          {navItems.map(renderNav)}
        </nav>

        {/* Footer */}
        <div className="flex flex-col items-center gap-1 pt-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button className={`${itemBase} text-muted-foreground hover:bg-[hsl(0_0%_94%)]`}>
                <Bell size={22} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Notificações</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button className={`${itemBase} text-muted-foreground hover:bg-[hsl(0_0%_94%)]`}>
                <HelpCircle size={22} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Ajuda</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <RouterNavLink
                to="/configuracoes"
                className={`${itemBase} ${
                  settingsActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-[hsl(0_0%_94%)]"
                }`}
              >
                <Settings size={22} strokeWidth={1.75} />
              </RouterNavLink>
            </TooltipTrigger>
            <TooltipContent side="right">Configurações</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[11px] font-bold mt-1 hover:opacity-90 transition-opacity"
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
