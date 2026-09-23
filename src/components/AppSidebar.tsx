import { Fragment, type ComponentType, type ReactNode } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useMensagensNaoLidas } from "@/hooks/useMensagensNaoLidas";
import {
  ContactRound,
  ChartPie,
  House,
  Workflow,
  Zap,
  Filter,
  BotMessageSquare,
  Cog,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  to: string;
  label: string;
  // Aceita tanto ícones do lucide-react quanto o CrmWhatsAppIcon (mesmo
  // contrato de props: size, strokeWidth, className).
  icon: ComponentType<{ size?: string | number; strokeWidth?: string | number; className?: string }>;
  locked?: boolean;
  badge?: "IA" | "Em breve";
  /**
   * Quantidade pendente nesta tela, em bolinha vermelha.
   *
   * Hoje só o Multiatendimento usa: é o número de conversas não lidas que a
   * pessoa pode abrir. Zero não desenha nada -- uma bolinha com "0" é ruído
   * que ensina a ignorar a bolinha.
   */
  contador?: number;
};

/*
 * A barra lateral, no desenho do `Sidebar.jsx` do design system.
 *
 * Aqui mora TUDO que não é conteúdo de tela: a navegação (grupo Menu), as
 * ferramentas do dia (Agenda, Tutoriais, Notificações, Configurações) e o menu
 * da pessoa, no pé.
 *
 * ─── A barra superior existiu por algumas horas em 19/09/2026 ────────────────
 *
 * As ferramentas e a pessoa chegaram a sair daqui para uma barra superior de
 * 72px, do `Topbar.jsx` do material. O dono reverteu no mesmo dia: uma barra só,
 * e a lateral é ela. As ferramentas passaram por um formato de botão redondo na
 * volta, e ele pediu o formato dos vizinhos de novo -- então elas são a MESMA
 * linha da navegação, e o que separa os dois grupos é o rótulo, não o desenho.
 *
 * O que sobra daquela ida e volta, e vale manter: os painéis de Tutoriais e
 * Notificações e o menu da pessoa abrem ancorados na BORDA da barra (ver o
 * `PopoverAnchor` lá embaixo), e não no gatilho, senão cobririam a própria
 * barra.
 *
 * ─── Retrátil ────────────────────────────────────────────────────────────────
 *
 * Aberta tem 248px, com o nome de cada tela ao lado do ícone; recolhida tem
 * 72px, só com os ícones. Quem guarda o estado é o `AppLayout`, porque a
 * largura mexe em várias coisas ao mesmo tempo -- esta barra, a margem do
 * conteúdo e a tarja de plano fixa no rodapé -- e todas leem a mesma variável
 * CSS, `--barra-largura`, que ele define.
 *
 * Os botões de recolher e expandir ficam no topo, nos dois estados. A dica com
 * o nome da tela só aparece recolhida; aberta, o nome já está escrito ao lado.
 *
 * ─── Cores ───────────────────────────────────────────────────────────────────
 *
 * Decisão D6 da matriz: a barra é BRANCA e se separa do conteúdo por uma régua
 * de 1px. Item ativo em emerald com tinta charcoal (7,25:1); em repouso, tinta
 * `--text-muted`; hover em `--surface-hover` com tinta de título. Os estados
 * são classes, e não manipuladores de mouse escrevendo `style.background`: foi
 * esse padrão que deixou botões presos no verde escuro no Multiatendimento.
 *
 * ─── O pé não pode cortar ────────────────────────────────────────────────────
 *
 * A pilha é: cabeçalho (`shrink-0`), navegação (`flex-1 min-h-0`, a única que
 * rola) e, presos embaixo, ferramentas e pessoa (`shrink-0`). Com a altura vindo
 * de `top: 0` + `bottom: 0`, e não de `100vh`, o avatar do pé fica visível
 * mesmo em janela baixa -- era assim que ele aparecia cortado antes.
 */

const ITEM_BASE =
  "relative flex items-center h-10 w-full rounded-lg shrink-0 transition-colors duration-150 outline-none " +
  "focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)]";
const ITEM_REPOUSO =
  "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-heading)]";
const ITEM_ATIVO = "bg-primary text-[color:var(--text-on-accent)] font-medium";

/**
 * Linha com o painel ABERTO (Tutoriais, Notificações). Não é o emerald do item
 * ativo: o ativo diz "a tela é esta", e um painel aberto diz só "este menu está
 * na tela agora". Fica no cinza do hover, que é o mesmo peso do que ele é.
 */
const ITEM_ABERTO = "bg-[color:var(--surface-hover)] text-[color:var(--text-heading)]";

/**
 * A régua que separa a marca do menu.
 *
 * Elemento, e não `border` dos blocos vizinhos: como borda ela ia de ponta a
 * ponta da barra, e o dono pediu recuo nas laterais. O recuo é `mx-3`, o mesmo
 * da navegação, então a linha começa e termina onde começam e terminam as
 * linhas de menu.
 */
/**
 * A régua interna da barra.
 *
 * Sobrou uma só: a que separa o menu de Configurações, no pé. A que ficava
 * abaixo da marca saiu em 22/09/2026, quando o dono pediu ali só o ícone.
 *
 * Sem margem lateral própria -- quem afasta das bordas é o recuo do bloco que
 * a contém, e somar os dois deixaria as réguas da barra com comprimentos
 * diferentes.
 */
const REGUA_BASE = "shrink-0 h-px bg-[color:var(--border-default)]";

/** Rótulo de grupo: caixa alta, 11px, peso 500 (o papel overline do material). */
const OVERLINE =
  "block px-3 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-muted)] whitespace-nowrap";

export function AppSidebar({ recolhida, aoAlternar }: { recolhida: boolean; aoAlternar: () => void }) {
  const { pathname } = useLocation();
  const { canAny } = usePermissions();
  /*
   * As não lidas do Multiatendimento.
   *
   * A conta mora aqui, na barra, e não na tela do Multiatendimento: o ponto do
   * contador é avisar quem está em OUTRA tela. E respeita a mesma visibilidade
   * da lista de conversas -- avisar de mensagem que a pessoa não pode abrir
   * seria mandá-la procurar o que não existe para ela.
   */
  const naoLidas = useMensagensNaoLidas();
  // A ordem daqui é a ordem na tela. Cada entrada carrega a própria permissão,
  // então mover uma linha muda só a posição do ícone: quem não tem acesso
  // continua sem ver, e os itens ausentes fecham o vão sozinhos.
  const navItems: NavItem[] = [
    // Sem permissão própria: o Início é a porta de entrada e a trilha de
    // primeiros passos, e esconder isso de alguém seria esconder justamente de
    // quem acabou de chegar.
    { to: "/inicio", label: "Início", icon: House },
    ...(canAny("dashboard:admin", "dashboard:member")
      ? [{ to: "/dashboard", label: "Dashboard", icon: ChartPie }] : []),
    ...(canAny("pipelines:admin", "pipelines:member", "leads:admin", "leads:member", "leads:restricted", "leads:operator")
      ? [{ to: "/pipeline", label: "Pipelines", icon: Filter }] : []),
    ...(canAny("leads:admin", "leads:member", "leads:restricted", "leads:operator")
      ? [{ to: "/leads", label: "Leads", icon: ContactRound }] : []),
    // Disparos é governado por `impulsos`, não por `automacoes`: são duas abas
    // diferentes, e antes as duas liam a mesma permissão. Quem recebia acesso a
    // Automações ganhava Disparos junto, sem ninguém ter marcado isso.
    ...(canAny("impulsos:admin")
      ? [{ to: "/disparos", label: "Disparos", icon: Zap }] : []),
    ...(canAny("automacoes:admin", "automacoes:member")
      ? [{ to: "/automacoes", label: "Automações", icon: Workflow }] : []),
    // Passa a respeitar a permissão, como os itens vizinhos. Dono e admin
    // continuam vendo: o `can` devolve verdadeiro para os dois antes de olhar a
    // lista, então ninguém perde acesso ao que já tinha.
    ...(canAny("agentes:admin", "agentes:member")
      ? [{ to: "/agentes", label: "Agentes", icon: BotMessageSquare }] : []),
    // Último da lista a pedido do dono (22/09/2026). Estava logo depois de
    // Leads, no meio das telas do funil.
    ...(canAny("multiatendimento:admin", "multiatendimento:supervisor", "multiatendimento:attendant")
      ? [{ to: "/multiatendimento", label: "Multiatendimento", icon: CrmWhatsAppIcon, contador: naoLidas }] : []),
  ];

  /** A dica com o nome de uma tela, só com a barra recolhida. */
  const comDicaSeRecolhida = (rotulo: string, filho: ReactNode) =>
    recolhida ? dica(rotulo, filho) : filho;

  /** A dica de um botão só de ícone, que existe nos dois estados. */
  const dica = (rotulo: string, filho: ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>{filho}</TooltipTrigger>
      <TooltipContent side="right" className="bg-[color:var(--surface-inverse)] text-[color:var(--surface-card)] border-0">
        {rotulo}
      </TooltipContent>
    </Tooltip>
  );

  /** Layout da linha nos dois estados: aberta alinha à esquerda, recolhida centra. */
  const disposicao = recolhida ? "justify-center" : "gap-3 px-3 justify-start";

  /**
   * O botão que abre e fecha a barra.
   *
   * Definido UMA vez porque aparece em dois lugares, conforme o estado: no fim
   * da linha da marca com a barra aberta, e no bloco abaixo dela com a barra
   * fechada. Duas cópias do mesmo botão divergiriam no primeiro ajuste de
   * tamanho ou de cor.
   */
  const botaoDeRecolher = dica(
    recolhida ? "Expandir menu" : "Recolher menu",
    <button
      type="button"
      onClick={aoAlternar}
      aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
      aria-expanded={!recolhida}
      className="shrink-0 flex items-center justify-center rounded-full border border-[color:var(--border-default)] bg-[color:var(--surface-card)] text-[color:var(--icon-default)] transition-colors hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-heading)] outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--ring-focus-color)]"
      style={{ width: 20, height: 20 }}
    >
      {recolhida ? <ChevronsRight size={12} /> : <ChevronsLeft size={12} />}
    </button>,
  );

  const renderNav = (item: NavItem) => {
    const active = pathname.startsWith(item.to);
    const Icon = item.icon;

    if (item.locked) {
      return comDicaSeRecolhida(
        `${item.label} · Em breve`,
        <div className={`${ITEM_BASE} ${disposicao} cursor-not-allowed text-[color:var(--text-muted)] opacity-40`}>
          <Icon size={18} strokeWidth={1.75} className="shrink-0" />
          {!recolhida && <span className="flex-1 min-w-0 truncate text-sm text-left">{item.label}</span>}
          {!recolhida && <span className="text-[11px] font-medium uppercase tracking-[0.08em]">Em breve</span>}
        </div>,
      );
    }

    return comDicaSeRecolhida(
      item.label,
      <RouterNavLink
        to={item.to}
        className={`${ITEM_BASE} ${disposicao} ${active ? ITEM_ATIVO : ITEM_REPOUSO}`}
        onClick={(e) => {
          const navEvent = new CustomEvent("app-navigate", { cancelable: true, detail: { to: item.to } });
          window.dispatchEvent(navEvent);
          if (navEvent.defaultPrevented) e.preventDefault();
        }}
      >
        <Icon size={18} strokeWidth={active ? 2 : 1.75} className="shrink-0" />
        {!recolhida && <span className="flex-1 min-w-0 truncate text-sm text-left">{item.label}</span>}
        {/* Pastilha "IA": aberta vira etiqueta no fim da linha; recolhida, a
            bolinha no canto do ícone. Badge suave do sistema, e sobre o item
            ativo o cinza translúcido do material, para não somar dois verdes. */}
        {item.badge === "IA" && !recolhida && (
          <span
            className="rounded-full px-[7px] py-[2px] text-[11px] font-medium leading-none"
            style={active
              ? { background: "rgba(45,47,51,.14)", color: "var(--text-on-accent)" }
              : { background: "var(--accent-100)", color: "var(--accent-800)" }}
          >
            IA
          </span>
        )}
        {item.badge === "IA" && recolhida && (
          <span
            className="absolute top-0.5 right-2 rounded-full flex items-center justify-center font-bold leading-none"
            style={{ width: 15, height: 15, fontSize: 11, background: "var(--accent-100)", color: "var(--accent-800)" }}
          >
            IA
          </span>
        )}
        {/*
          O contador de não lidas.
          ──────────────────────────────────────────────────────────────────────
          Vermelho de verdade, e não o accent da marca: é o único lugar da barra
          que pede reação imediata, e na cor da casa ele se perderia entre os
          outros realces.

          Aberta, vai no fim da linha, onde a etiqueta "IA" também fica.
          Recolhida, sobe para o canto do ícone: não há linha onde caber.

          Acima de 99 vira "99+". O número é um aviso, não um relatório, e três
          dígitos dentro de 15px viram borrão.
        */}
        {!!item.contador && item.contador > 0 && (
          <span
            aria-label={`${item.contador} ${item.contador === 1 ? "conversa não lida" : "conversas não lidas"}`}
            className={recolhida
              ? "absolute top-0.5 right-1 rounded-full flex items-center justify-center font-bold leading-none"
              : "rounded-full flex items-center justify-center font-bold leading-none shrink-0"}
            style={{
              minWidth: recolhida ? 15 : 18,
              height: recolhida ? 15 : 18,
              padding: "0 4px",
              fontSize: recolhida ? 10 : 11,
              background: "#DC2626",
              color: "#FFFFFF",
            }}
          >
            {item.contador > 99 ? "99+" : item.contador}
          </span>
        )}
      </RouterNavLink>,
    );
  };

  /**
   * Ferramenta que é só um link (Agenda, Configurações).
   *
   * MESMA linha dos itens de navegação -- altura 40, ícone 18, nome ao lado,
   * emerald quando é a tela atual. Elas chegaram a ser botões redondos por
   * algumas horas em 19/09; o dono pediu de volta o formato dos vizinhos.
   */
  const ferramenta = (
    para: string,
    rotulo: string,
    Icone: ComponentType<{ size?: string | number; strokeWidth?: string | number; className?: string }>,
  ) => {
    const ativo = pathname.startsWith(para);
    return comDicaSeRecolhida(
      rotulo,
      <RouterNavLink
        to={para}
        aria-label={rotulo}
        className={`${ITEM_BASE} ${disposicao} ${ativo ? ITEM_ATIVO : ITEM_REPOUSO}`}
      >
        <Icone size={18} strokeWidth={ativo ? 2 : 1.75} className="shrink-0" />
        {!recolhida && <span className="flex-1 min-w-0 truncate text-sm text-left">{rotulo}</span>}
      </RouterNavLink>,
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="flex flex-col"
        aria-label="Navegação principal"
        style={{
          width: "var(--barra-largura)",
          /* Começa ABAIXO da barra superior (dono, 22/09/2026): a régua dela
             atravessa a tela inteira, e esta barra encosta por baixo. Com
             `top: 0` a lateral subiria até o topo e cortaria essa linha em
             duas.

             `top`/`bottom` em vez de `height`: o 100vh pode passar da área
             visível quando a barra do navegador ou o zoom entram na conta, e é
             o pé -- Configurações -- que sai da tela quando isso acontece. */
          position: "fixed",
          top: "var(--topbar-h)",
          left: 0,
          bottom: 0,
          /* 30: acima do conteúdo, abaixo da cortina dos diálogos (z-50). */
          zIndex: 30,
          overflow: "hidden",
          background: "var(--surface-card)",
          /* A régua da direita divide esta barra do conteúdo. Ela vai do topo
             DESTA barra até o pé da tela, e não até o alto da janela: o pedido
             do dono é que a linha vertical pare na régua da barra superior, em
             vez de cruzá-la. Como a barra começa em `--topbar-h`, a borda já
             nasce no lugar certo. */
          borderRight: "1px solid var(--border-default)",
          transition: "width var(--dur-normal) var(--ease-out)",
        }}
      >
        {/* ── A marca ─────────────────────────────────────────────────────────
            Voltou para cá no mesmo dia em que saiu: o dono quer a marca na
            coluna da esquerda, e não na faixa do topo.

            Sem borda embaixo. A linha que separa esta barra do que está acima é
            a régua da barra superior, que já passa rente ao topo daqui --
            somar outra a 48px dela desenharia dois traços paralelos.

            A seta de recolher muda de lugar conforme o estado (dono,
            22/09/2026): ABERTA, ela fica no fim desta linha, depois de "Rezult
            CRM"; RECOLHIDA, desce para o bloco abaixo. Ao lado do logo nos 51px
            da barra fechada ela empurraria a marca para fora do centro, que foi
            a reclamação do dono em 21/09 -- e é por isso que o lugar não é o
            mesmo nos dois estados. */}
        <div
          className={`flex shrink-0 items-center ${recolhida ? "justify-center" : "px-4 justify-between gap-2"}`}
          style={{ height: "var(--topbar-h)" }}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            {/* O MESMO arquivo do favicon, servido de public/: são a mesma
                marca, e duas cópias significam trocar a arte em dois lugares. */}
            <img
              src="/favicon.png?v=4"
              alt="Rezult"
              className="shrink-0 block object-cover"
              style={{ width: 30, height: 30, borderRadius: 8 }}
            />
            {!recolhida && (
              <span className="text-sm font-semibold text-[color:var(--text-heading)] truncate whitespace-nowrap">
                Rezult CRM
              </span>
            )}
          </span>
          {!recolhida && botaoDeRecolher}
        </div>

        {/*
          O lugar da seta quando a barra está RECOLHIDA.

          O bloco existe nos dois estados, com a mesma altura, mesmo aberto --
          quando a seta sobe para o cabeçalho, aqui fica o vão (pedido do dono
          em 22/09/2026). Sem isso o menu inteiro subiria 32px ao abrir a barra
          e desceria ao fechar, e os ícones dançariam a cada clique.

          Sem régua: a linha que já ficou aqui saiu, e a separação entre a
          assinatura e a navegação passou a ser o espaço. A barra já tem duas
          linhas por perto, a da superior rente ao topo e a da direita.
        */}
        <div
          className="shrink-0 flex items-center justify-center"
          style={{ height: 20, marginBottom: 12 }}
        >
          {recolhida && botaoDeRecolher}
        </div>

        {/* ── Menu: as telas de trabalho. A única parte que rola. ──────────────
            Os itens ficam no TOPO, logo abaixo da marca. Centrá-los na altura
            da barra foi testado em 21/09/2026 e o dono voltou atrás: a
            navegação é o primeiro lugar onde o olho procura, e no meio da barra
            ela pendia para longe da marca. */}
        {/* Recolhida, o recuo cai de 12px para 4px de cada lado: com 48px de
            barra, os 12px antigos deixavam 24px para o item, e o retângulo do
            item ativo virava uma faixa vertical mais alta que larga. Com 4px o
            item fica 40x40, quadrado, do tamanho da própria linha. */}
        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-3 ${recolhida ? "px-1" : "px-3"}`}>
          {/* Tinta --text-muted, e não o --text-subtle do material, pela regra 4
              da seção 3.1 (3,44:1 abaixo de 16px). */}
          {!recolhida && <span className={OVERLINE}>Menu</span>}
          <nav className="flex flex-col gap-0.5">
            {navItems.map(item => <Fragment key={item.to}>{renderNav(item)}</Fragment>)}
          </nav>
        </div>

        {/* ── Configurações, no pé da barra ───────────────────────────────────
            Veio da barra superior a pedido do dono (22/09/2026).

            Fica FORA da área que rola: o menu acima cresce com o número de
            telas, e um item de configuração que subisse e descesse junto com a
            navegação seria procurado sempre num lugar diferente. Aqui ele tem
            endereço fixo, o canto inferior.

            Usa o mesmo `renderNav` das telas de trabalho, então ganha de graça
            o realce de ativo, a dica com a barra recolhida e o mesmo tamanho de
            alvo. É navegação como as outras, só que separada por assunto. */}
        <div className={`shrink-0 pb-3 ${recolhida ? "px-1" : "px-3"}`}>
          {/* Sem margem lateral: o recuo do bloco já afasta a linha das
              bordas, e somar os dois deixaria esta régua mais curta que a de
              cima, que é sua par visual. */}
          <div className={`${REGUA_BASE} mb-2`} />
          {renderNav({ to: "/configuracoes", label: "Configurações", icon: Cog })}
        </div>

            </aside>
    </TooltipProvider>
  );
}
