import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, CalendarDays, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown, ExternalLink, GraduationCap, LogOut, Plus, UserCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import { tintaSobre } from "@/lib/contraste";
import { colorFromString, iniciais } from "@/lib/iniciais";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * A barra superior, no desenho do `Topbar.jsx` do design system.
 *
 * Decisão do dono em 19/09/2026, revendo a D7 da matriz ("sem topbar global").
 * Aqui moram as ferramentas do dia (Agenda, Tutoriais, Notificações) e o menu
 * da pessoa, que saíram da barra lateral: nos dois lugares seria duplicar, e a
 * lateral fica com a navegação entre telas.
 *
 * Configurações fez o caminho de volta em 22/09/2026, a pedido do dono: é uma
 * TELA, como Pipelines ou Leads, e não uma ferramenta de apoio -- passou a
 * morar no pé da barra lateral, separada do menu por uma régua.
 *
 * Do material, fica de fora a BUSCA do centro. O CRM não tem busca global, e um
 * campo que não busca nada seria inventar funcionalidade.
 *
 * ─── Desenho ─────────────────────────────────────────────────────────────────
 *
 *   altura      72px (`--topbar-h`), régua de 1px embaixo, fundo de cartão
 *   altura      48px (`--topbar-h`), mais fina que a lateral: sem texto
 *   esquerda    nada -- a saudação saiu em 21/09/2026, a pedido do dono
 *   direita     botões redondos de 30px com borda, uma régua vertical curta, e
 *               o menu da pessoa (só o avatar; nome e empresa moram dentro)
 *
 * O ponto de notificação é o do material: bolinha `--danger-400` com anel
 * branco. A contagem exata continua no painel que ele abre e no rótulo de
 * acessibilidade.
 */

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  silver: "Plano Silver",
  platinum: "Plano Platinum",
  emerald: "Plano Emerald",
  enterprise: "Plano Enterprise",
};

type NotifLocal = { id: string; title: string; desc: string; to: string };
type NotifBanco = { id: string; message: string; lead_id: string | null; read: boolean; created_at: string };

/** Botão redondo do material (`IconButton`, variante "plain", tamanho md). */
const BOTAO =
  "relative inline-flex items-center justify-center w-[30px] h-[30px] rounded-full border shrink-0 transition-colors outline-none " +
  "focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)]";
const BOTAO_REPOUSO =
  "bg-[color:var(--surface-card)] border-[color:var(--border-default)] text-[color:var(--icon-default)] " +
  "hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-heading)]";
/** Onde a pessoa está: o mesmo emerald de item ativo da barra lateral. */
const BOTAO_ATIVO = "bg-primary border-[color:var(--accent-500)] text-[color:var(--text-on-accent)]";
const BOTAO_ABERTO = "bg-[color:var(--surface-hover)] border-[color:var(--border-strong)] text-[color:var(--text-heading)]";

export function BarraSuperior({ recolhida, aoAlternar }: {
  /** Estado da barra lateral, para a seta apontar o lado certo. */
  recolhida?: boolean;
  /**
   * Abre ou fecha a lateral. Quando ausente (a réplica decorativa da tela de
   * planos), a marca aparece sem o botão -- lá ele não teria o que fazer.
   */
  aoAlternar?: () => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const { company, availableCompanies, setSelectedCompany } = useCompany();
  const email = profile?.email ?? user?.email ?? "";
  const nome = profile?.full_name || email.split("@")[0];

  const [notifAberto, setNotifAberto] = useState(false);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const [googleConectado, setGoogleConectado] = useState<boolean | null>(null);
  const [notifBanco, setNotifBanco] = useState<NotifBanco[]>([]);

  // O id sai do objeto ANTES do efeito: a dependência é ele, e não a empresa
  // inteira. Com `company` na lista, cada recarga do contexto (que devolve um
  // objeto novo com os mesmos dados) refaria a consulta ao Google.
  const empresaId = company?.id;
  useEffect(() => {
    if (!empresaId) return;
    import("@/lib/googleOAuth")
      .then(({ checkGoogleConnection }) => checkGoogleConnection(empresaId))
      .then(conn => setGoogleConectado(!!conn))
      .catch(() => setGoogleConectado(true));
  }, [empresaId]);

  const buscarNotif = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, message, lead_id, read, created_at")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifBanco(data as NotifBanco[]);
  }, []);
  useEffect(() => { buscarNotif(); }, [buscarNotif]);

  const marcarLida = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifBanco(prev => prev.filter(n => n.id !== id));
  }, []);

  const notifLocais: NotifLocal[] = [];
  if (googleConectado === false) {
    notifLocais.push({
      id: "google-cal",
      title: "Vincule seu Google Calendar",
      desc: "Conecte sua agenda para sincronizar eventos e atividades com o CRM.",
      to: "/configuracoes/conexoes",
    });
  }
  const totalNotif = notifLocais.length + notifBanco.length;

  const corDaEmpresa = colorFromString(company?.name ?? "R");

  /** Botão só de ícone precisa dizer o nome: a dica é esse nome. */
  const comDica = (rotulo: string, filho: ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>{filho}</TooltipTrigger>
      <TooltipContent side="bottom" className="bg-[color:var(--surface-inverse)] text-[color:var(--surface-card)] border-0">
        {rotulo}
      </TooltipContent>
    </Tooltip>
  );

  // `size`/`strokeWidth` como `string | number`: é assim que o lucide-react
  // declara, e apertar para `number` faz o TypeScript recusar os próprios
  // ícones da biblioteca.
  const link = (
    para: string,
    rotulo: string,
    Icone: ComponentType<{ size?: string | number; strokeWidth?: string | number }>,
  ) => {
    const ativo = pathname.startsWith(para);
    return comDica(
      rotulo,
      <RouterNavLink to={para} aria-label={rotulo} className={`${BOTAO} ${ativo ? BOTAO_ATIVO : BOTAO_REPOUSO}`}>
        <Icone size={15} strokeWidth={ativo ? 2 : 1.75} />
      </RouterNavLink>,
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      {/*
        A régua de baixo voltou em 22/09/2026, a pedido do dono.
        ────────────────────────────────────────────────────────────────────────
        Ela sumiu em 21/09, quando esta barra e a lateral viraram uma peça em L
        com o canto arredondado. Agora as duas são separadas de novo, e esta
        linha continua na lateral: o cabeçalho da marca tem a MESMA altura desta
        barra e a mesma borda embaixo, então o traço atravessa a tela de ponta a
        ponta, sem emenda visível.
      */}
      <header
        className="flex items-center shrink-0 pl-4 pr-3 bg-[color:var(--surface-card)] border-b border-[color:var(--border-default)]"
        style={{ height: "var(--topbar-h)" }}
      >
        {/*
          A marca, e o botão que abre a lateral.
          ──────────────────────────────────────────────────────────────────────
          O logo morou no topo da barra lateral até 22/09/2026, quando esta
          barra passou a atravessar a tela inteira e a lateral a começar abaixo
          dela: no arranjo novo, o canto superior esquerdo é DESTA barra.

          A seta veio junto pelo mesmo motivo. Ela pousava sobre a linha que
          separava a marca do menu, e essa linha virou a régua desta barra --
          deixá-la lá embaixo seria pendurar o controle no meio da navegação.

          Sem texto ao lado do logo: a barra não carrega texto desde 21/09, por
          decisão do dono.
        */}
        <div className="flex items-center gap-2 shrink-0">
          {/* O MESMO arquivo do favicon, servido de public/: são a mesma marca,
              e duas cópias significam trocar a arte em dois lugares. */}
          <img
            src="/favicon.png?v=4"
            alt="Rezult"
            className="shrink-0 block object-cover"
            style={{ width: 28, height: 28, borderRadius: 7 }}
          />
          {aoAlternar && comDica(
            recolhida ? "Expandir menu" : "Recolher menu",
            <button
              type="button"
              onClick={aoAlternar}
              aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
              aria-expanded={!recolhida}
              className={`${BOTAO} ${BOTAO_REPOUSO}`}
              style={{ width: 24, height: 24 }}
            >
              {recolhida ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
            </button>,
          )}
        </div>
        <div className="flex-1" />

        {/* ── Ferramentas ──────────────────────────────────────────────────── */}
        {/* 10px entre os botões (dono, 21/09/2026). Eram 6px, e com os
            círculos de 30px lado a lado eles liam como um bloco só. */}
        <div className="flex items-center gap-[10px] shrink-0">
          {link("/calendario", "Agenda", CalendarDays)}

          <Popover open={ajudaAberta} onOpenChange={setAjudaAberta}>
            {comDica(
              "Tutoriais",
              <PopoverTrigger asChild>
                <button type="button" aria-label="Tutoriais" className={`${BOTAO} ${ajudaAberta ? BOTAO_ABERTO : BOTAO_REPOUSO}`}>
                  <GraduationCap size={15} strokeWidth={1.75} />
                </button>
              </PopoverTrigger>,
            )}
            <PopoverContent align="end" sideOffset={8} className="p-0 w-72 shadow-xl rounded-xl border border-card-border overflow-hidden">
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-sm font-semibold text-foreground">Tutoriais</p>
              </div>
              <a
                href="https://help.rezultcrm.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setAjudaAberta(false)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors"
              >
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <GraduationCap size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug flex items-center gap-1">
                    Tutoriais <ExternalLink size={12} className="text-muted-foreground" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Acesse tutoriais e aprenda a usar a plataforma
                  </p>
                </div>
              </a>
            </PopoverContent>
          </Popover>

          <Popover open={notifAberto} onOpenChange={setNotifAberto}>
            {comDica(
              "Notificações",
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={totalNotif > 0 ? `Notificações, ${totalNotif} não lidas` : "Notificações"}
                  className={`${BOTAO} ${notifAberto ? BOTAO_ABERTO : BOTAO_REPOUSO}`}
                >
                  <Bell size={15} strokeWidth={1.75} />
                  {totalNotif > 0 && (
                    <span
                      className="absolute rounded-full bg-[color:var(--danger-400)]"
                      style={{ top: 2, right: 3, width: 7, height: 7, border: "1.5px solid var(--surface-card)" }}
                    />
                  )}
                </button>
              </PopoverTrigger>,
            )}
            <PopoverContent align="end" sideOffset={8} className="p-0 w-72 shadow-xl rounded-xl border border-card-border overflow-hidden">
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-sm font-semibold text-foreground">
                  Notificações{totalNotif > 0 && <span className="ml-1 text-muted-foreground font-normal">({totalNotif})</span>}
                </p>
                {totalNotif === 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">Nenhuma notificação no momento.</p>
                )}
              </div>
              {notifLocais.map(n => (
                <button
                  key={n.id}
                  onClick={() => { setNotifAberto(false); navigate(n.to); }}
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
              {notifBanco.map(n => (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors">
                  <div className="mt-0.5 w-7 h-7 rounded-full bg-[color:var(--warning-bg)] flex items-center justify-center shrink-0">
                    <Bell size={14} className="text-[color:var(--warning-fg)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">Automação</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  </div>
                  <button
                    onClick={() => marcarLida(n.id)}
                    className="text-xs text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                    title="Marcar como lida"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </PopoverContent>
          </Popover>

        </div>

        {/* Régua vertical entre as ferramentas e a pessoa, como no material. */}
        {/* 21px de cada lado (`--respiro-marca`). O token nasceu para a régua
            que separava a marca do menu na lateral, que saiu em 22/09/2026 --
            esta é a última que o lê. É margem declarada, e não `gap` do
            contêiner: com o gap, o espaço aqui somaria ao dele e sairia 29px. */}
        <span
          className="w-px h-5 shrink-0 bg-[color:var(--border-default)]"
          style={{ marginLeft: "var(--respiro-marca)", marginRight: "var(--respiro-marca)" }}
        />

        {/* ── Pessoa ───────────────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Usuário"
              className="flex items-center gap-2.5 shrink-0 rounded-full py-1 pl-1 pr-1.5 transition-colors hover:bg-[color:var(--surface-hover)] data-[state=open]:bg-[color:var(--surface-hover)] outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)]"
            >
              <span
                className="flex items-center justify-center text-[11px] font-bold overflow-hidden shrink-0 rounded-full"
                style={{
                  width: 30,
                  height: 30,
                  background: profile?.avatar_url ? "transparent" : "var(--accent-100)",
                  color: "var(--accent-800)",
                }}
              >
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt={nome} className="w-full h-full object-cover rounded-full" />
                  : iniciais(nome || email)}
              </span>
              {/* Nome e e-mail ao lado do avatar (dono, 21/09/2026).
                  11px e 10px: é o corpo que cabe em duas linhas dentro de uma
                  barra de 48px (13 + 12 de caixa, contra 48 de altura). Abaixo
                  do piso de 12px da matriz, e por isso registrado lá como
                  exceção nomeada. O e-mail é longo, então trunca -- a empresa
                  atual e a troca dela seguem no menu que este botão abre. */}
              <span className="text-left leading-tight min-w-0 ml-2">
                <span className="block text-[11px] font-medium text-[color:var(--text-heading)] truncate max-w-[160px]">
                  {nome}
                </span>
                <span className="block text-[10px] text-[color:var(--text-muted)] truncate max-w-[160px]">
                  {email}
                </span>
              </span>
              <ChevronsUpDown size={13} className="shrink-0 ml-1.5 text-[color:var(--icon-default)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-60">
            <DropdownMenuLabel className="flex flex-col">
              <span className="text-sm font-semibold">{nome}</span>
              <span className="text-xs text-muted-foreground font-normal">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* A empresa: trocar e cadastrar outra. Era o ícone da barra
                lateral, que o dono pediu para tirar (19/09). */}
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              <span
                className="w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-bold overflow-hidden shrink-0"
                style={{ background: company?.logo_url ? "transparent" : corDaEmpresa, color: tintaSobre(corDaEmpresa) }}
              >
                {company?.logo_url
                  ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
                  : iniciais(company?.name ?? "R")}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate">{company?.name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {PLAN_LABELS[company?.plan ?? ""] ?? company?.plan ?? "—"}
                </span>
              </span>
            </DropdownMenuLabel>
            {availableCompanies
              .filter(c => c.id !== company?.id)
              .map(c => (
                <DropdownMenuItem key={c.id} onClick={() => setSelectedCompany(c)}>
                  <span
                    className="w-4 h-4 rounded flex items-center justify-center text-[12px] font-bold overflow-hidden shrink-0 mr-2"
                    style={{ background: c.logo_url ? "transparent" : colorFromString(c.name), color: tintaSobre(colorFromString(c.name)) }}
                  >
                    {c.logo_url ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-cover" /> : iniciais(c.name)}
                  </span>
                  <span className="truncate">Trocar para {c.name}</span>
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem asChild>
              <a href="/company-register">
                <Plus size={14} className="mr-2" /> Adicionar empresa
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/configuracoes/perfil")}>
              <UserCircle size={14} className="mr-2" /> Meu perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut size={14} className="mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </TooltipProvider>
  );
}
