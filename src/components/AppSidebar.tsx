import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useCRM } from "@/context/CRMContext";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  Zap,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  locked?: boolean;
};

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/pipeline", label: "Pipelines", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/multiatendimento", label: "Multiatendimento", icon: MessageSquare, locked: true },
  { to: "/automacoes", label: "Automações", icon: Zap, locked: true },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const { logout } = useCRM();

  const renderItem = (item: NavItem) => {
    const active = pathname.startsWith(item.to);
    const baseClasses =
      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors";

    if (item.locked) {
      return (
        <TooltipProvider key={item.to} delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`${baseClasses} text-sidebar-foreground opacity-40 cursor-not-allowed select-none`}
              >
                <item.icon size={18} />
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Em breve
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Em breve</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <RouterNavLink
        key={item.to}
        to={item.to}
        className={`${baseClasses} ${
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        }`}
      >
        <item.icon size={18} />
        {item.label}
      </RouterNavLink>
    );
  };

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col border-r border-sidebar-border shrink-0">
      <div className="p-5 border-b border-sidebar-border">
        <Logo size="md" showIcon />
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(renderItem)}
      </nav>

      <div className="px-3 pb-2">
        <RouterNavLink
          to="/configuracoes"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            pathname.startsWith("/configuracoes")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          }`}
        >
          <Settings size={18} />
          Configurações
        </RouterNavLink>
      </div>

      <div className="p-4 border-t border-sidebar-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
          CA
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">Carlos Admin</p>
          <p className="text-xs text-muted-foreground truncate">carlos@rezult.com</p>
        </div>
        <button
          onClick={logout}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Sair"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
