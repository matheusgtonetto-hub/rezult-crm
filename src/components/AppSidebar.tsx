import { useEffect, useState, useCallback } from "react";
import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  UserRound,
  LayoutDashboard,
  Cog,
  LogOut,
  MessagesSquare,
  Network,
  Zap,
  Filter,
  Brain,
  Bell,
  Info,
  Plus,
  UserCircle,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  icon: typeof LayoutDashboard;
  locked?: boolean;
  badge?: "IA" | "Em breve";
};

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
  free:     "Free",
  silver:   "Plano Silver",
  platinum: "Plano Platinum",
  emerald:  "Plano Emerald",
  enterprise: "Plano Enterprise",
};

const SIDEBAR_BG = "hsl(var(--primary))";
const ICON_INACTIVE = "rgba(255,255,255,0.5)";
const ICON_ACTIVE = "#FFFFFF";
const HOVER_BG = "rgba(255,255,255,0.1)";
const ACTIVE_BG = "rgba(255,255,255,0.15)";

type SidebarNotif = { id: string; title: string; desc: string; to: string };
type DbNotif = { id: string; message: string; lead_id: string | null; read: boolean; created_at: string };

export function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const { company, availableCompanies, setSelectedCompany } = useCompany();
  const { canAny } = usePermissions();
  const userEmail = profile?.email ?? user?.email ?? "";
  const userName = profile?.full_name || userEmail.split("@")[0];

  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [dbNotifs, setDbNotifs] = useState<DbNotif[]>([]);

  useEffect(() => {
    if (!company) return;
    import("@/lib/googleOAuth")
      .then(({ checkGoogleConnection }) => checkGoogleConnection(company.id))
      .then(conn => setGoogleConnected(!!conn))
      .catch(() => setGoogleConnected(true));
  }, [company?.id]);

  const fetchDbNotifs = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, message, lead_id, read, created_at")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setDbNotifs(data as DbNotif[]);
  }, []);

  useEffect(() => { fetchDbNotifs(); }, [fetchDbNotifs]);

  const markDbNotifRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setDbNotifs(prev => prev.filter(n => n.id !== id));
  }, []);

  const notifications: SidebarNotif[] = [];
  if (googleConnected === false) {
    notifications.push({
      id: "google-cal",
      title: "Vincule seu Google Calendar",
      desc: "Conecte sua agenda para sincronizar eventos e atividades com o CRM.",
      to: "/configuracoes/conexoes",
    });
  }
  const notifCount = notifications.length + dbNotifs.length;

  const navItems: NavItem[] = [
    ...(canAny("dashboard:admin", "dashboard:member")
      ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
    ...(canAny("pipelines:admin", "pipelines:member", "leads:admin", "leads:member", "leads:restricted", "leads:operator")
      ? [{ to: "/pipeline", label: "Pipelines", icon: Filter }] : []),
    ...(canAny("leads:admin", "leads:member", "leads:restricted", "leads:operator")
      ? [{ to: "/leads", label: "Leads", icon: UserRound }] : []),
    { to: "/calendario",       label: "Calendário",       icon: CalendarDays },
    ...(canAny("automacoes:admin", "automacoes:member")
      ? [{ to: "/automacoes", label: "Automações", icon: Network }] : []),
    ...(canAny("automacoes:admin", "automacoes:member")
      ? [{ to: "/disparos", label: "Disparos", icon: Zap }] : []),
    ...(canAny("multiatendimento:admin", "multiatendimento:supervisor", "multiatendimento:attendant")
      ? [{ to: "/multiatendimento", label: "Multiatendimento", icon: MessagesSquare }] : []),
    { to: "/pilot",   label: "Pilot",   icon: Brain,        locked: true },
    { to: "/agentes", label: "Agentes", icon: BrainCircuit, locked: true },
  ];

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
            onClick={(e) => {
              const navEvent = new CustomEvent("app-navigate", { cancelable: true, detail: { to: item.to } });
              window.dispatchEvent(navEvent);
              if (navEvent.defaultPrevented) e.preventDefault();
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
          height: "100vh",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
          overflow: "hidden",
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
          style={{ gap: 4, flex: 1, minHeight: 0, overflowY: "hidden", overflowX: "hidden", width: "100%", alignItems: "center" }}
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
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <button
                className={`${itemBase} relative`}
                style={{ ...itemSize, color: notifOpen ? "rgba(255,255,255,0.9)" : ICON_INACTIVE, background: notifOpen ? HOVER_BG : "transparent" }}
                onMouseEnter={(e) => { if (!notifOpen) { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "rgba(255,255,255,0.9)"; } }}
                onMouseLeave={(e) => { if (!notifOpen) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ICON_INACTIVE; } }}
                aria-label="Notificações"
              >
                <Bell size={18} strokeWidth={1.75} />
                {notifCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full font-bold leading-none"
                    style={{ width: 14, height: 14, fontSize: 8, background: "#EF4444", color: "#fff" }}
                  >
                    {notifCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={8}
              className="p-0 w-72 shadow-xl rounded-xl border border-card-border overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-sm font-semibold text-foreground">Notificações</p>
                {notifCount === 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">Nenhuma notificação no momento.</p>
                )}
              </div>
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => { setNotifOpen(false); navigate(n.to); }}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors text-left"
                >
                  <div className="mt-0.5 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CalendarDays size={14} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.desc}</p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground mt-1 shrink-0" />
                </button>
              ))}
              {dbNotifs.map(n => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors"
                >
                  <div className="mt-0.5 w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <Bell size={14} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">Automação</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  </div>
                  <button
                    onClick={() => markDbNotifRead(n.id)}
                    className="text-xs text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                    title="Marcar como lida"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </PopoverContent>
          </Popover>

          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <button
                className={itemBase}
                style={{ ...itemSize, color: helpOpen ? "rgba(255,255,255,0.9)" : ICON_INACTIVE, background: helpOpen ? HOVER_BG : "transparent" }}
                onMouseEnter={(e) => { if (!helpOpen) { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "rgba(255,255,255,0.9)"; } }}
                onMouseLeave={(e) => { if (!helpOpen) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ICON_INACTIVE; } }}
                aria-label="Ajuda"
              >
                <Info size={18} strokeWidth={1.75} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={8}
              className="p-0 w-72 shadow-xl rounded-xl border border-card-border overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-sm font-semibold text-foreground">Ajuda</p>
              </div>
              <a
                href="https://help.rezultcrm.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setHelpOpen(false)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors"
              >
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <GraduationCap size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug flex items-center gap-1">
                    Tutoriais <ExternalLink size={11} className="text-muted-foreground" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Acesse tutoriais e aprenda a usar a plataforma
                  </p>
                </div>
              </a>
            </PopoverContent>
          </Popover>

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
                <Cog size={18} strokeWidth={1.75} />
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
              <DropdownMenuItem onClick={() => navigate("/configuracoes/perfil")}>
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
