import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { useCRM } from "@/context/CRMContext";
import { LayoutDashboard, Users, CheckSquare, BarChart3, Settings, LogOut } from "lucide-react";

const navItems = [
  { to: "/pipeline", label: "Pipeline", icon: LayoutDashboard },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const { logout } = useCRM();

  return (
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col border-r border-border shrink-0">
      <div className="p-5 border-b border-border">
        <Logo size="md" />
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(item => {
          const active = pathname.startsWith(item.to);
          return (
            <RouterNavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </RouterNavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
          CA
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">Carlos Admin</p>
          <p className="text-xs text-muted-foreground truncate">carlos@rezult.com</p>
        </div>
        <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
