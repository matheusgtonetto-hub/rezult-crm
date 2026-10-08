import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, CalendarDays, ChevronRight, ChevronsUpDown, ExternalLink, GraduationCap, LogOut, Menu, Plus, UserCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import { linkDoSuporte } from "@/lib/suporte";
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
 * O LOGO chegou a passar por aqui no mesmo dia, quando esta barra virou a faixa
 * do topo, e voltou para a lateral algumas horas depois, junto com a seta de
 * recolher: o dono quer a marca na coluna da esquerda, com o botão logo abaixo
 * dela. Esta barra ficou só com as ferramentas e a pessoa.
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

/**
 * `aoAbrirMenu`: presente só quando a barra lateral virou gaveta (modo celular).
 * Sem este botão a gaveta não teria como ser aberta, e a navegação do app
 * sumiria por completo na tela que a usa.
 */
export function BarraSuperior({ aoAbrirMenu, compacta = false }: { aoAbrirMenu?: () => void; compacta?: boolean } = {}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const { company, availableCompanies, setSelectedCompany } = useCompany();
  const email = profile?.email ?? user?.email ?? "";
  const nome = profile?.full_name || email.split("@")[0];

  /*
   * `compacta` chega pronto do AppLayout, e não é medido aqui.
   *
   * Começou olhando `telaDeCelular`, que pergunta "o aparelho é um telefone?".
   * O dono abriu o app numa janela de ~380px no Mac: a resposta era NÃO, a
   * faixa renderizava inteira, e "Rezult CRM" ficava por baixo do Suporte. A
   * pergunta certa nunca foi qual aparelho -- é quanto espaço existe, e um
   * celular é só o caso mais comum de pouco espaço.
   *
   * Medir aqui dentro resolveria esta barra e abriria um buraco: a Agenda sai
   * daqui quando aperta, e quem a recebe é a lateral. Se cada uma medisse por
   * si, a Agenda poderia sumir das duas ao mesmo tempo. Por isso quem mede é o
   * pai, uma vez, e entrega a mesma resposta para as duas.
   */

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
      {/* O recuo da esquerda NÃO é um número escolhido: é a conta que centra um
          logo de 30px na régua da barra lateral recolhida.

              (--rail-w - 30) / 2  =  (55 - 30) / 2  =  12,5px

          Com ela, a marca daqui cai no MESMO eixo vertical do logo da empresa
          logo abaixo -- e, de quebra, no mesmo eixo dos ícones do menu, porque
          a barra recolhida centra tudo nessa linha (medido: centro em 27px).

          Escrito como `calc` e não como 12.5px de propósito: se a régua mudar
          de largura, como mudou de 51 para 55 em 27/09/2026, o alinhamento
          acompanha sozinho em vez de quebrar em silêncio. */}
      <header
        className="flex items-center shrink-0 pr-3 bg-[color:var(--surface-card)] border-b border-[color:var(--border-default)]"
        style={{ height: "var(--topbar-h)", paddingLeft: "calc((var(--rail-w) - 30px) / 2)" }}
      >
        {/* ── A marca do produto ─────────────────────────────────────────────
            Voltou para cá em 29/09/2026, a pedido do dono, e agora troca de
            lugar com a empresa: a marca do PRODUTO fica aqui, no topo, e o
            logo da EMPRESA assumiu o alto da barra lateral, com o seletor.

            É a separação certa: o topo diz onde você está (Rezult CRM, sempre
            o mesmo), e a coluna da esquerda diz por qual empresa você está
            olhando (muda, e é clicável).

            Dois pesos na mesma palavra composta: "Rezult" em 600 e "CRM" em
            400 (dono). O `tracking-tight` junta as duas o suficiente para
            lerem como um nome e não como duas palavras soltas. */}
        {aoAbrirMenu && (
          <button
            type="button"
            onClick={aoAbrirMenu}
            aria-label="Abrir menu"
            className={`${BOTAO} ${BOTAO_REPOUSO} mr-2`}
          >
            <Menu size={17} strokeWidth={1.75} />
          </button>
        )}
        {/* `shrink-0` no logo e `truncate` no nome: se por algum motivo a
            faixa apertar mais do que o ponto em que ela enxuga, a marca cede
            espaço truncando em vez de deixar o botão Suporte passar por cima
            dela. Era assim que "Rezult CRM" ficava por baixo do Suporte. */}
        <span className="flex items-center gap-2.5 min-w-0 shrink">
          {/* O MESMO arquivo do favicon, servido de public/: são a mesma marca,
              e duas cópias significam trocar a arte em dois lugares. */}
          <img
            src="/favicon.png?v=5"
            alt="Rezult"
            className="shrink-0 block object-cover"
            style={{ width: 30, height: 30, borderRadius: 8 }}
          />
          {/* O nome escrito sai no modo compacto (celular). O logo ao lado
              diz a mesma coisa em 30px, e era este texto -- somado ao nome e ao
              e-mail do usuário na outra ponta -- que fazia a faixa transbordar
              numa tela de 390px. */}
          {!compacta && (
              /* "Rezult" em 18px e "CRM" em 16px (dono, 08/10/2026). O site
                 usa 20/18 na navbar dele; aqui a faixa divide espaço com o
                 botão Suporte, as ferramentas e o nome do usuário, e o par
                 menor é o que cabe sem apertar os vizinhos.

                 O tamanho do bloco é o do "CRM": as duas palavras dividem o
                 `line-height` herdado daqui, então subir o pai moveria a linha
                 de base das duas juntas. */
              <span className="text-[16px] tracking-tight whitespace-nowrap truncate min-w-0 text-[color:var(--text-heading)]">
              <span className="font-semibold text-[18px]">Rezult</span> <span className="font-normal">CRM</span>
            </span>
          )}
        </span>

        {/* O vão empurra as ferramentas para a direita. */}
        <div className="flex-1" />

        {/* ── Ferramentas ──────────────────────────────────────────────────── */}
        {/* 10px entre os botões (dono, 21/09/2026). Eram 6px, e com os
            círculos de 30px lado a lado eles liam como um bloco só. */}
        <div className="flex items-center gap-[10px] shrink-0">
          {/* ── Suporte, primeiro da fileira (dono, 29/09/2026) ──────────────
              Leva para o WhatsApp do atendimento em aba nova, com a mensagem
              já digitada.

              Fica À ESQUERDA da Agenda, encostado no vão que separa a marca
              das ferramentas: é o único botão com rótulo, e no meio da
              fileira ele partiria os círculos em dois grupos.

              Botão com RÓTULO, no molde do "Ligar agente" da tela inicial
              (`classeDoBotao`, InicioPage): emerald sólido, 12px semibold,
              `rounded-lg`. Primeiro ele saiu como círculo de ícone igual aos
              vizinhos, e o dono pediu botão de verdade -- faz sentido, porque
              os outros quatro são ferramentas do app e este manda a pessoa
              para fora, falar com gente. O rótulo é o que diz isso antes do
              clique; um ícone só dependeria da dica passando o mouse.

              As classes estão escritas aqui e não importadas do `classeDoBotao`
              porque aquele helper carrega `mt-3` (ele vive numa lista de
              tarefas empilhada) e não tem altura fixa. Aqui os 30px são o que
              alinha o botão com os círculos ao lado.

              É `<a>` e não o helper `link()` da barra: aquele monta um
              RouterNavLink, que trataria o wa.me como rota interna do app e
              daria tela em branco.

              `rel="noopener noreferrer"` porque `target="_blank"` dá à página
              aberta uma referência de volta para esta (`window.opener`), e
              esta é uma sessão autenticada. */}
          <a
            href={linkDoSuporte()}
            target="_blank"
            rel="noopener noreferrer"
            className={
              "inline-flex items-center h-[30px] shrink-0 rounded-lg border border-transparent " +
              "bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 " +
              "outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)]"
            }
          >
            Suporte
          </a>

          {/* Agenda e Tutoriais saem no modo compacto (celular).
              Em 390px a faixa levava hambúrguer + logo + Suporte + três ícones
              + avatar, e sobravam 22px de vão entre o logo e as ferramentas:
              tudo lia como um bloco só, colado. Estes dois são os menos usados
              da fileira e os únicos com destino fixo, então são os que podem
              mudar de lugar sem perder nada.

              A Agenda entra na GAVETA do menu (ver AppSidebar). Os Tutoriais
              seguem acessíveis pelo mesmo endereço que este popover abre. */}
          {!compacta && link("/calendario", "Agenda", CalendarDays)}

          {!compacta && <Popover open={ajudaAberta} onOpenChange={setAjudaAberta}>
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
          </Popover>}

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
              {/* No modo compacto sobra só o avatar: ele abre o MESMO menu,
                  que já traz nome, e-mail e a troca de empresa por extenso.
                  Nada se perde, e são uns 180px de volta para a faixa. */}
              {!compacta && (
                <>
                  <span className="text-left leading-tight min-w-0 ml-2">
                    <span className="block text-[11px] font-medium text-[color:var(--text-heading)] truncate max-w-[160px]">
                      {nome}
                    </span>
                    <span className="block text-[10px] text-[color:var(--text-muted)] truncate max-w-[160px]">
                      {email}
                    </span>
                  </span>
                  <ChevronsUpDown size={13} className="shrink-0 ml-1.5 text-[color:var(--icon-default)]" />
                </>
              )}
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
