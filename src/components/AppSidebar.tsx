import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { BANNER_HEIGHT } from "@/components/FreePlanBanner";
import {
  Users,
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
  { to: "/pilot",           label: "Pilot",           icon: Sparkles,     badge: "IA", locked: true },
  { to: "/agentes",         label: "Agentes",         icon: Bot,          badge: "IA", locked: true },
  { to: "/dashboard",       label: "Dashboard",       icon: BarChart3 },
  { to: "/pipeline",        label: "Pipelines",       icon: KanbanSquare },
  { to: "/leads",           label: "Leads",           icon: Users },
  { to: "/calendario",      label: "Calendário",      icon: CalendarDays },
  { to: "/automacoes",      label: "Automações",      icon: Zap,          locked: true },
  { to: "/multiatendimento",label: "Multiatendimento", icon: MessageSquare },
];

function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 45%)`;
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

const PLAN_LABELS: Record<string, string> = {
  free:       "Trial gratuito",
  pro:        "Plano Pro",
  enterprise: "Plano Enterprise",
  starter:    "Plano Starter",
};

const ICON_INACTIVE = "rgba(255,255,255,0.50)";
const ICON_ACTIVE   = "hsl(var(--primary))";
const ICON_LOCKED   = "rgba(255,255,255,0.22)";

function DockDivider() {
  return (
    <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.11)", margin: "0 6px", flexShrink: 0 }} />
  );
}

export function AppSidebar() {
  const { pathname }                                                            = useLocation();
  const { signOut, user }                                                       = useAuth();
  const { profile }                                                             = useProfile();
  const { company, availableCompanies, setSelectedCompany,
          isFreePlan, planExpired, planDaysLeft }                               = useCompany();

  const showBanner = isFreePlan && !planExpired && planDaysLeft !== null;
  const dockBottom = showBanner ? BANNER_HEIGHT + 12 : 16;

  const userEmail = profile?.email ?? user?.email ?? "";
  const userName  = profile?.full_name || userEmail.split("@")[0];

  const settingsActive = pathname.startsWith("/configuracoes");

  /* ── Item base class (all interactive dock icons) ── */
  const itemCls =
    "relative flex items-center justify-center rounded-xl transition-all duration-200 ease-out";
  const itemSize = 40;

  /* ── Nav item renderer ── */
  const renderNav = (item: NavItem) => {
    const active = pathname.startsWith(item.to);
    const Icon   = item.icon;

    if (item.locked) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>
            <div
              className={`${itemCls} cursor-not-allowed`}
              style={{ width: itemSize, height: itemSize, color: ICON_LOCKED }}
            >
              <Icon size={20} strokeWidth={1.75}
                className={item.to === "/pilot" ? "glow-pilot" : item.to === "/agentes" ? "glow-agentes" : ""} />
              <span
                className="absolute top-0 right-0 rounded-[3px] flex items-center justify-center font-semibold leading-none whitespace-nowrap"
                style={{ background: "rgba(255,255,255,0.13)", color: "rgba(255,255,255,0.45)", fontSize: 5, height: 8, padding: "0 2px" }}
              >
                EM BREVE
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-[#111] text-white border-0">
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
            className={`${itemCls} hover:scale-110`}
            style={{ width: itemSize, height: itemSize, color: active ? ICON_ACTIVE : ICON_INACTIVE }}
          >
            <Icon size={20} strokeWidth={1.75}
              className={item.to === "/pilot" ? "glow-pilot" : item.to === "/agentes" ? "glow-agentes" : ""} />
            {item.badge === "IA" && (
              <span
                className="absolute -top-0.5 -right-0.5 rounded-full flex items-center justify-center font-bold leading-none"
                style={{ width: 13, height: 13, fontSize: 6.5, background: "rgba(255,255,255,0.92)", color: "hsl(var(--primary))" }}
              >
                IA
              </span>
            )}
            {/* Active dot */}
            {active && (
              <span
                className="absolute rounded-full"
                style={{ width: 4, height: 4, bottom: -6, left: "50%", transform: "translateX(-50%)", background: ICON_ACTIVE }}
              />
            )}
          </RouterNavLink>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-[#111] text-white border-0">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Navegação principal"
        style={{
          position:             "fixed",
          bottom:               dockBottom,
          left:                 "50%",
          transform:            "translateX(-50%)",
          zIndex:               200,
          display:              "flex",
          alignItems:           "center",
          gap:                  4,
          padding:              "8px 14px",
          borderRadius:         20,
          background:           "rgba(12, 12, 12, 0.82)",
          backdropFilter:       "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border:               "1px solid rgba(255,255,255,0.09)",
          boxShadow:            "0 8px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)",
          whiteSpace:           "nowrap",
        }}
      >
        {/* ── Logo RZ ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center justify-center text-[12px] font-bold tracking-tight text-white glow-rz shrink-0"
              style={{ width: 30, height: 30, borderRadius: 8, border: "1.5px solid rgba(18,138,104,0.45)" }}
              aria-label="Rezult"
            >
              RZ
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-[#111] text-white border-0">Rezult CRM</TooltipContent>
        </Tooltip>

        {/* ── Empresa ── */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center text-white text-[10px] font-bold overflow-hidden shrink-0 hover:scale-110 transition-transform duration-200"
                  style={{
                    width: 26, height: 26, borderRadius: 7,
                    background: company?.logo_url ? "transparent" : colorFromString(company?.name ?? "R"),
                    border: "1.5px solid rgba(255,255,255,0.18)",
                  }}
                  aria-label="Empresa"
                >
                  {company?.logo_url
                    ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
                    : initials(company?.name ?? "R")}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-[#111] text-white border-0">{company?.name ?? "Empresa"}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold overflow-hidden shrink-0"
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

        <DockDivider />

        {/* ── Navegação principal ── */}
        {navItems.map(renderNav)}

        <DockDivider />

        {/* ── Rezult Pay (em breve) ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`${itemCls} cursor-not-allowed`}
              style={{ width: itemSize, height: itemSize, color: ICON_LOCKED }}
            >
              <CreditCard size={20} strokeWidth={1.75} />
              <span
                className="absolute top-0 right-0 rounded-[3px] flex items-center justify-center font-semibold leading-none whitespace-nowrap"
                style={{ background: "rgba(255,255,255,0.13)", color: "rgba(255,255,255,0.45)", fontSize: 5, height: 8, padding: "0 2px" }}
              >
                EM BREVE
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-[#111] text-white border-0">Rezult Pay · Em breve</TooltipContent>
        </Tooltip>

        {/* ── Notificações ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${itemCls} hover:scale-110`}
              style={{ width: itemSize, height: itemSize, color: ICON_INACTIVE }}
            >
              <Bell size={20} strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-[#111] text-white border-0">Notificações</TooltipContent>
        </Tooltip>

        {/* ── Ajuda ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`${itemCls} hover:scale-110`}
              style={{ width: itemSize, height: itemSize, color: ICON_INACTIVE }}
            >
              <HelpCircle size={20} strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-[#111] text-white border-0">Ajuda</TooltipContent>
        </Tooltip>

        {/* ── Configurações ── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <RouterNavLink
              to="/configuracoes"
              className={`${itemCls} hover:scale-110`}
              style={{ width: itemSize, height: itemSize, color: settingsActive ? ICON_ACTIVE : ICON_INACTIVE }}
            >
              <Settings size={20} strokeWidth={1.75} />
              {settingsActive && (
                <span
                  className="absolute rounded-full"
                  style={{ width: 4, height: 4, bottom: -6, left: "50%", transform: "translateX(-50%)", background: ICON_ACTIVE }}
                />
              )}
            </RouterNavLink>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-[#111] text-white border-0">Configurações</TooltipContent>
        </Tooltip>

        {/* ── Avatar / usuário ── */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0 hover:scale-110 transition-transform duration-200"
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: profile?.avatar_url ? "transparent" : "#FFFFFF",
                    color: "hsl(var(--primary))",
                  }}
                  aria-label="Usuário"
                >
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt={userName} className="w-full h-full object-cover rounded-full" />
                    : initials(userName || userEmail)}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-[#111] text-white border-0">{userName}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="top" align="end" className="w-56">
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
      </nav>
    </TooltipProvider>
  );
}
