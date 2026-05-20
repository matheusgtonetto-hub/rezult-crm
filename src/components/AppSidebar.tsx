import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
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
  UserCircle,
  Bot,
  CreditCard,
  CalendarDays,
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
  { to: "/pilot", label: "Pilot", icon: Sparkles, badge: "IA", locked: true },
  { to: "/agentes", label: "Agentes", icon: Bot, badge: "IA", locked: true },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/pipeline", label: "Pipelines", icon: KanbanSquare },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/automacoes", label: "Automações", icon: Zap },
  { to: "/multiatendimento", label: "Multiatendimento", icon: MessageSquare },
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

const PLAN_LABELS: Record<string, string> = {
  free:       "Trial gratuito",
  pro:        "Plano Pro",
  enterprise: "Plano Enterprise",
  starter:    "Plano Starter",
};

const SIDEBAR_BG = "hsl(var(--primary))";
const ICON_INACTIVE = "rgba(255,255,255,0.5)";
const ICON_ACTIVE = "#FFFFFF";
const HOVER_BG = "rgba(255,255,255,0.1)";
const ACTIVE_BG = "rgba(255,255,255,0.15)";

export function AppSidebar() {
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const { company, availableCompanies, setSelectedCompany } = useCompany();
  const userEmail = profile?.email ?? user?.email ?? "";
  const userName = profile?.full_name || userEmail.split("@")[0];

  const itemBase =
    "flex items-center justify-center rounded-[15px] transition-colors duration-200 relative shrink-0";
  const itemSize = { width: 36, height: 36 };

  const renderNav = (item: NavItem) => {
    const active = pathname.startsWith(item.to);
    const Icon = item.icon;

    if (item.locked) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>
            <div
              className={`${itemBase} cursor-not-allowed`}
              style={{ ...itemSize, color: ICON_INACTIVE, opacity: 0.3 }}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span
                className="absolute top-0 right-0 rounded-[3px] flex items-center justify-center font-semibold leading-none whitespace-nowrap"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 5.5,
                  height: 8,
                  padding: "0 2px",
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
              ...itemSize,
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
            <Icon size={18} strokeWidth={1.75} className={item.to === "/pilot" ? "glow-pilot" : item.to === "/agentes" ? "glow-agentes" : ""} />
            {item.badge === "IA" && (
              <span
                className="absolute -top-0.5 -right-0.5 rounded-full flex items-center justify-center font-bold leading-none"
                style={{
                  width: 14,
                  height: 14,
                  fontSize: 7,
                  background: "#FFFFFF",
                  color: "hsl(var(--primary))",
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
        className="flex flex-col items-center"
        style={{
          width: 52,
          minWidth: 52,
          maxWidth: 52,
          position: "fixed",
          top: 8,
          left: 3,
          bottom: 8,
          zIndex: 100,
          overflow: "hidden",
          borderRadius: 16,
          background: SIDEBAR_BG,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        {/* Logo RZ */}
        <div
          className="flex items-center justify-center text-[13px] font-bold tracking-tight glow-rz"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1.5px solid rgba(18,138,104,0.6)",
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
              className="flex items-center justify-center text-white text-[11px] font-bold tracking-tight hover:opacity-90 transition-opacity overflow-hidden"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: company?.logo_url ? "transparent" : colorFromString(company?.name ?? "R"),
                border: "1.5px solid rgba(255,255,255,0.3)",
                marginBottom: 16,
              }}
              aria-label="Empresa"
            >
              {company?.logo_url
                ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
                : initials(company?.name ?? "R")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold overflow-hidden"
                style={{ background: company?.logo_url ? "transparent" : colorFromString(company?.name ?? "R") }}
              >
                {company?.logo_url
                  ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
                  : initials(company?.name ?? "R")}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{company?.name ?? "—"}</span>
                <span className="text-xs text-muted-foreground font-normal">
                  {PLAN_LABELS[company?.plan ?? ""] ?? company?.plan ?? "—"}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableCompanies.length > 1 && (
              <>
                {availableCompanies
                  .filter(c => c.id !== company?.id)
                  .map(c => (
                    <DropdownMenuItem key={c.id} onClick={() => setSelectedCompany(c)}>
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold overflow-hidden shrink-0 mr-2"
                        style={{ background: c.logo_url ? "transparent" : colorFromString(c.name) }}
                      >
                        {c.logo_url
                          ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover" />
                          : initials(c.name)}
                      </div>
                      <span className="truncate">{c.name}</span>
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <a href="/company-register">
                <Plus size={14} className="mr-2" /> Adicionar empresa
              </a>
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
        <div
          style={{
            width: 32,
            height: 1,
            background: "rgba(255,255,255,0.15)",
            margin: "8px 0",
          }}
        />
        <div className="flex flex-col items-center" style={{ gap: 4 }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`${itemBase} cursor-not-allowed relative`}
                style={{ ...itemSize, color: ICON_INACTIVE, opacity: 0.3 }}
              >
                <CreditCard size={18} strokeWidth={1.75} />
                <span
                  className="absolute top-0 right-0 rounded-[3px] flex items-center justify-center font-semibold leading-none whitespace-nowrap"
                  style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontSize: 5.5, height: 8, padding: "0 2px" }}
                >
                  EM BREVE
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#111111] text-white border-0">Rezult Pay · Em breve</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={itemBase}
                style={{ ...itemSize, color: ICON_INACTIVE }}
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
                style={{ ...itemSize, color: ICON_INACTIVE }}
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
                  ...itemSize,
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
                className="flex items-center justify-center text-[10px] font-bold hover:opacity-90 transition-opacity overflow-hidden shrink-0"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: profile?.avatar_url ? "transparent" : "#FFFFFF",
                  color: "hsl(var(--primary))",
                  marginTop: 4,
                }}
                aria-label="Usuário"
              >
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt={userName} className="w-full h-full object-cover rounded-full" />
                  : initials(userName || userEmail)
                }
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm font-semibold">{userName}</span>
                <span className="text-xs text-muted-foreground font-normal">{userEmail}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserCircle size={14} className="mr-2" /> Meu perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut size={14} className="mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
