import { useEffect, useState, useCallback, type ComponentType } from "react";
import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ContactRound,
  ChartColumnDecreasing,
  House,
  Cog,
  LogOut,
  Workflow,
  Zap,
  Filter,
  Bell,
  Plus,
  UserCircle,
  BotMessageSquare,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  ExternalLink,
} from "lucide-react";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";
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
  // Aceita tanto ícones do lucide-react quanto o CrmWhatsAppIcon (mesmo
  // contrato de props: size, strokeWidth, className).
  icon: ComponentType<{ size?: string | number; strokeWidth?: string | number; className?: string }>;
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

  // A ordem daqui é a ordem na tela. Cada entrada carrega a própria permissão,
  // então mover uma linha muda só a posição do ícone: quem não tem acesso
  // continua sem ver, e os itens ausentes fecham o vão sozinhos.
  const navItems: NavItem[] = [
    // Sem permissão própria: o Início é a porta de entrada e a trilha de
    // primeiros passos, e esconder isso de alguém seria esconder justamente de
    // quem acabou de chegar.
    { to: "/inicio", label: "Início", icon: House },
    ...(canAny("dashboard:admin", "dashboard:member")
      ? [{ to: "/dashboard", label: "Dashboard", icon: ChartColumnDecreasing }] : []),
    ...(canAny("pipelines:admin", "pipelines:member", "leads:admin", "leads:member", "leads:restricted", "leads:operator")
      ? [{ to: "/pipeline", label: "Pipelines", icon: Filter }] : []),
    ...(canAny("leads:admin", "leads:member", "leads:restricted", "leads:operator")
      ? [{ to: "/leads", label: "Leads", icon: ContactRound }] : []),
    ...(canAny("multiatendimento:admin", "multiatendimento:supervisor", "multiatendimento:attendant")
      ? [{ to: "/multiatendimento", label: "Multiatendimento", icon: CrmWhatsAppIcon }] : []),
    // Disparos é governado por `impulsos`, não por `automacoes`: são duas abas
    // diferentes, e antes as duas liam a mesma permissão. Quem recebia acesso a
    // Automações ganhava Disparos junto, sem ninguém ter marcado isso.
    ...(canAny("impulsos:admin")
      ? [{ to: "/disparos", label: "Disparos", icon: Zap }] : []),
    ...(canAny("automacoes:admin", "automacoes:member")
      ? [{ to: "/automacoes", label: "Automações", icon: Workflow }] : []),
    // Passa a respeitar a permissão, como os itens vizinhos. Antes aparecia
    // para todo mundo, e a permissão criada no convite não teria efeito nenhum.
    //
    // Dono e admin continuam vendo: o `can` devolve verdadeiro para os dois
    // antes de olhar a lista, então ninguém perde acesso ao que já tinha.
    ...(canAny("agentes:admin", "agentes:member")
      ? [{ to: "/agentes", label: "Agentes", icon: BotMessageSquare }] : []),
  ];

  /**
   * Calendário: mora no rodapé, logo acima das notificações.
   *
   * Fora do `navItems` porque a barra separa dois grupos com um traço: em cima,
   * as telas onde se trabalha o funil; embaixo, o que acompanha o dia. Agenda e
   * notificações respondem à mesma pergunta ("o que me espera agora"), e é ali
   * que o olho vai procurar as duas.
   *
   * Continua passando pelo `renderNav`, e não escrito à mão: assim herda o
   * realce de rota ativa, o tooltip e os estados de hover sem uma segunda cópia
   * das mesmas regras para divergir depois.
   */
  const itemCalendario: NavItem = { to: "/calendario", label: "Agenda", icon: CalendarDays };

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
            <Icon size={18} strokeWidth={1.75} className={item.to === "/agentes" ? "glow-agentes" : ""} />
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
          /**
           * 30, e não 100.
           *
           * A barra nunca precisou cobrir a página: o <main> já começa depois
           * dos 52px dela (`marginLeft: 52`), então não há sobreposição. O 100
           * só tinha efeito contra a única coisa que passa por cima dela, a
           * cortina dos diálogos, que é z-50 -- e o resultado era a barra ficar
           * acesa enquanto o resto da tela escurecia.
           *
           * Abaixo de 50 ela volta a escurecer junto. Os menus dela (empresa,
           * notificações, ajuda, usuário) são portais do Radix, então continuam
           * por cima mesmo com a barra mais baixa.
           */
          zIndex: 30,
          overflow: "hidden",
          background: SIDEBAR_BG,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        {/* Marca do Rezult.
            Usa o MESMO arquivo do favicon (/favicon.png), servido de public/,
            em vez de uma cópia importada: são a mesma marca, e duas cópias
            significam trocar a arte em dois lugares e esquecer um.
            A borda saiu porque a imagem já traz a própria moldura arredondada;
            o glow fica, que é o que dava presença ao ícone no fundo escuro. */}
        <img
          src="/favicon.png?v=3"
          alt="Rezult"
          className="glow-rz"
          style={{
            width: 35,
            height: 35,
            borderRadius: 8,
            marginBottom: 8,
            objectFit: "cover",
            display: "block",
          }}
        />

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
          {renderNav(itemCalendario)}
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={itemBase}
                    style={{ ...itemSize, color: helpOpen ? "rgba(255,255,255,0.9)" : ICON_INACTIVE, background: helpOpen ? HOVER_BG : "transparent" }}
                    onMouseEnter={(e) => { if (!helpOpen) { e.currentTarget.style.background = HOVER_BG; e.currentTarget.style.color = "rgba(255,255,255,0.9)"; } }}
                    onMouseLeave={(e) => { if (!helpOpen) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ICON_INACTIVE; } }}
                    aria-label="Tutoriais"
                  >
                    <GraduationCap size={18} strokeWidth={1.75} />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#111111] text-white border-0">
                Tutoriais
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              align="end"
              sideOffset={8}
              className="p-0 w-72 shadow-xl rounded-xl border border-card-border overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-sm font-semibold text-foreground">Tutoriais</p>
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

          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            {/* Tooltip por fora do PopoverTrigger, os dois com `asChild`: cada um
                mescla os próprios handlers no mesmo <button>, então o ícone
                continua abrindo o painel e passa a anunciar o nome como os
                itens de navegação. Numa barra só de ícones, o nome é a única
                coisa que diz o que aquele desenho faz. */}
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#111111] text-white border-0">
                Notificações
              </TooltipContent>
            </Tooltip>
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
