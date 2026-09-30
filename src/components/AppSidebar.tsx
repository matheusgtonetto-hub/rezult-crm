import { Fragment, type ComponentType, type ReactNode } from "react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { useProfile } from "@/context/ProfileContext";
import { useCompany } from "@/context/CompanyContext";
import { colorFromString, iniciais } from "@/lib/iniciais";
import { tintaSobre } from "@/lib/contraste";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMensagensNaoLidas } from "@/hooks/useMensagensNaoLidas";
import {
  CalendarDays,
  ContactRound,
  LayoutDashboard,
  House,
  Workflow,
  Zap,
  Filter,
  BotMessageSquare,
  Cog,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Moon,
  Plus,
  Sun,
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

/**
 * A altura do bloco da seta de recolher, e o respiro dentro dele.
 *
 * Existem como constantes porque DUAS partes do layout dependem delas: o bloco
 * da seta, que só aparece com a barra recolhida, e o vão abaixo da marca, que
 * cresce exatamente o mesmo tanto quando ela não está. Com os números soltos no
 * JSX, mexer num e esquecer o outro faz o menu pular ao alternar a barra -- e
 * foi o que aconteceu em 29/09/2026.
 */
const RESPIRO_DA_SETA = 3;
const ALTURA_DA_SETA = 20 + RESPIRO_DA_SETA * 2;

/**
 * O espaço ANTES do bloco da seta, com a barra recolhida.
 *
 * Sem ele a seta nascia colada na barra superior: media ao vivo em 29/09/2026
 * deu 3px entre a régua do topo e o ícone -- e os 3px eram só o respiro de
 * dentro do próprio bloco, não uma folga.
 *
 * O valor iguala a folga que já existia ABAIXO da seta, entre ela e o logo da
 * empresa (12px): 9 aqui mais os 3 do respiro fecham os mesmos 12. A seta fica
 * centrada entre as duas coisas em vez de encostada numa delas.
 */
const MARGEM_ACIMA_DA_SETA = 12 - RESPIRO_DA_SETA;

/**
 * O espaço TOTAL que a seta ocupa quando a barra está recolhida.
 *
 * É esta soma, e não a altura do ícone, que o vão abaixo da marca precisa
 * devolver quando a barra abre -- senão o menu pula ao alternar. Existe como
 * uma constante só para não haver duas parcelas que alguém possa atualizar
 * pela metade, que foi o erro cometido mais cedo hoje.
 */
const ESPACO_DA_SETA = MARGEM_ACIMA_DA_SETA + ALTURA_DA_SETA;

/** O espaço entre a marca e o primeiro item do menu. */
const VAO_ANTES_DO_MENU = 12;

/**
 * `sobreposta`: a barra deixa de ocupar uma coluna e vira uma GAVETA por cima
 * do conteúdo, aberta pelo botão da barra superior.
 *
 * É o modo de celular. A régua de 55px custa 14% da largura de um telefone, e
 * numa tela de conversa isso é a diferença entre ler a mensagem e ler meia
 * mensagem. Como gaveta ela não custa nada enquanto está fechada, e quando abre
 * vem com os rótulos -- num telefone não há tooltip de mouse para explicar um
 * ícone solto.
 */
export function AppSidebar({ recolhida, aoAlternar, sobreposta = false, aberta = false, aoFechar, mostrarAgenda = false }: {
  recolhida: boolean;
  aoAlternar: () => void;
  sobreposta?: boolean;
  aberta?: boolean;
  aoFechar?: () => void;
  /**
   * A Agenda mora na barra SUPERIOR. Quando a faixa aperta ela sai de lá, e
   * este menu é quem a recebe -- senão a tela ficaria inalcançável.
   *
   * Vem de fora, e não de `sobreposta`, porque os dois não coincidem: numa
   * janela estreita no computador a barra já enxuga, mas a lateral continua
   * sendo coluna e não gaveta. Amarrar à gaveta deixaria a Agenda sem casa
   * exatamente nesse caso.
   */
  mostrarAgenda?: boolean;
}) {
  const { pathname } = useLocation();
  const { canAny } = usePermissions();
  const { tema, alternarTema } = useProfile();
  const { company, availableCompanies, setSelectedCompany } = useCompany();
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
      ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
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
    // A Agenda mora na barra SUPERIOR. Ela entra aqui só quando de lá saiu,
    // por falta de espaço -- tirar da barra sem devolver em algum lugar seria
    // perder a tela, não economizar espaço. Ver `mostrarAgenda`.
    ...(mostrarAgenda ? [{ to: "/calendario", label: "Agenda", icon: CalendarDays }] : []),
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
  // Some na gaveta: ali ele recolheria para a régua de ícones DENTRO de uma
  // gaveta sobreposta, que não é estado nenhum. Quem abre a gaveta a fecha pela
  // cortina ou escolhendo para onde ir.
  const botaoDeRecolher = sobreposta ? null : dica(
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

  /**
   * Alternar entre claro e escuro.
   *
   * Botão, e não link: não leva a lugar nenhum, age na hora. Por isso nunca
   * fica em estado "ativo" -- o realce emerald dos vizinhos quer dizer "é aqui
   * que você está", e aqui não há um "aqui".
   *
   * O ícone mostra PARA ONDE se vai, não onde se está: no claro aparece a lua
   * (clique e escurece), no escuro aparece o sol. É a leitura que todo mundo já
   * tem de outros aplicativos, e o rótulo da dica diz a mesma coisa por
   * extenso, para quem lê o ícone ao contrário.
   */
  const botaoDeTema = () => {
    const escuro = tema === "dark";
    const rotulo = escuro ? "Tema claro" : "Tema escuro";
    const Icone = escuro ? Sun : Moon;
    return comDicaSeRecolhida(
      rotulo,
      <button
        type="button"
        onClick={alternarTema}
        aria-label={rotulo}
        className={`${ITEM_BASE} ${disposicao} ${ITEM_REPOUSO} w-full`}
      >
        <Icone size={18} strokeWidth={1.75} className="shrink-0" />
        {!recolhida && <span className="flex-1 min-w-0 truncate text-sm text-left">{rotulo}</span>}
      </button>,
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      {/* A cortina da gaveta. Fecha ao toque, que é como se sai de uma gaveta
          em qualquer app de celular, e escurece o conteúdo para deixar claro
          que ele está atrás e não ao lado. */}
      {sobreposta && aberta && (
        <div
          onClick={aoFechar}
          aria-hidden
          style={{ position: "fixed", top: "var(--topbar-h)", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 45 }}
        />
      )}
      <aside
        className="flex flex-col"
        aria-label="Navegação principal"
        style={{
          // Como gaveta ela tem largura PRÓPRIA, e não a `--barra-largura`:
          // aquela está em zero no modo celular, justamente para o conteúdo
          // ficar com a tela inteira.
          width: sobreposta ? "var(--sidebar-w-expanded)" : "var(--barra-largura)",
          ...(sobreposta ? {
            transform: aberta ? "translateX(0)" : "translateX(-100%)",
            transition: "transform var(--dur-normal) var(--ease-out)",
            // 46: por cima do conteúdo e da cortina (45), e ainda abaixo da
            // cortina dos diálogos (50), para um diálogo aberto continuar
            // mandando na tela.
            zIndex: 46,
            boxShadow: "8px 0 40px rgba(0,0,0,0.18)",
          } : {}),
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
          /* 30: acima do conteúdo, abaixo da cortina dos diálogos (z-50).
             Na gaveta este valor é sobrescrito acima. */
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
            CRM"; RECOLHIDA, desce para o bloco abaixo. Ao lado do logo na régua
            da barra fechada ela empurraria a marca para fora do centro, que foi
            a reclamação do dono em 21/09 -- e é por isso que o lugar não é o
            mesmo nos dois estados. */}
        {/* Recolhida, a seta fica ACIMA do logo da empresa (dono, 29/09/2026).
            Expandida, ela segue no fim da linha da marca, depois do nome.

            Os dois lugares existem porque na régua de 55px a seta ao LADO do
            logo empurraria a marca para fora do centro -- foi a reclamação do
            dono em 21/09, e é a mesma razão de antes, só que agora o destino é
            em cima e não embaixo. */}
        {recolhida && (
          <div
            className="shrink-0 flex items-center justify-center"
            style={{
              height: ALTURA_DA_SETA,
              marginTop: MARGEM_ACIMA_DA_SETA,
              paddingTop: RESPIRO_DA_SETA,
              paddingBottom: RESPIRO_DA_SETA,
            }}
          >
            {botaoDeRecolher}
          </div>
        )}

        <div
          className={`flex shrink-0 items-center ${recolhida ? "justify-center" : "justify-between gap-2"}`}
          /* Expandida, o recuo é o MESMO que centra o logo na régua recolhida:
             (--rail-w - 30) / 2. Era `px-4`, e o logo pulava 4px para a direita
             ao abrir a barra -- com a marca do produto fixa logo acima, o
             desencontro ficava visível. À direita segue 16px, que é o respiro
             da seta de recolher. */
          style={{
            height: "var(--topbar-h)",
            paddingLeft: recolhida ? undefined : "calc((var(--rail-w) - 30px) / 2)",
            paddingRight: recolhida ? undefined : 16,
          }}
        >
          {/* ── A EMPRESA, e não mais a marca do produto ────────────────────
              Trocaram de lugar em 29/09/2026 (dono): a marca do produto subiu
              para a barra superior e aqui entrou o logo da empresa, clicável
              para trocar -- como era antes de 19/09.

              A divisão que isso desenha: o topo diz onde você está (sempre
              Rezult CRM) e esta coluna diz por qual empresa você está olhando.
              Só o segundo muda, e só o segundo é clicável. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Empresa: ${company?.name ?? "—"}. Clique para trocar`}
                title={company?.name ?? undefined}
                className="flex items-center gap-2.5 min-w-0 rounded-lg outline-none cursor-pointer
                           hover:opacity-80 transition-opacity focus-visible:ring-2 focus-visible:ring-[color:var(--border-accent)]"
              >
                <span
                  className="shrink-0 flex items-center justify-center overflow-hidden text-[12px] font-bold"
                  style={{
                    width: 30, height: 30, borderRadius: 8,
                    // Sem logo, a inicial sobre uma cor derivada do nome. A
                    // tinta vem de `tintaSobre` porque a cor sorteada pode ser
                    // clara: texto branco fixo reprovaria o contraste em parte
                    // da paleta.
                    background: company?.logo_url ? "transparent" : colorFromString(company?.name ?? "R"),
                    color: tintaSobre(colorFromString(company?.name ?? "R")),
                  }}
                >
                  {company?.logo_url
                    ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" />
                    : iniciais(company?.name ?? "R")}
                </span>
                {!recolhida && (
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="text-sm font-semibold text-[color:var(--text-heading)] truncate whitespace-nowrap">
                      {company?.name ?? "—"}
                    </span>
                    <ChevronsUpDown size={13} className="shrink-0 text-[color:var(--icon-default)]" />
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {availableCompanies
                .filter((c) => c.id !== company?.id)
                .map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => setSelectedCompany(c)} className="cursor-pointer">
                    <span
                      className="w-4 h-4 rounded flex items-center justify-center text-[12px] font-bold overflow-hidden shrink-0 mr-2"
                      style={{ background: c.logo_url ? "transparent" : colorFromString(c.name), color: tintaSobre(colorFromString(c.name)) }}
                    >
                      {c.logo_url ? <img src={c.logo_url} alt="" className="w-full h-full object-cover" /> : iniciais(c.name)}
                    </span>
                    <span className="truncate">{c.name}</span>
                  </DropdownMenuItem>
                ))}
              {/* Com uma empresa só, a lista acima fica vazia e o menu teria
                  apenas "Adicionar empresa". A régua separaria de nada, então
                  só aparece quando há para onde trocar. */}
              {availableCompanies.filter((c) => c.id !== company?.id).length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild className="cursor-pointer">
                <a href="/company-register">
                  <Plus size={14} className="mr-2" /> Adicionar empresa
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!recolhida && botaoDeRecolher}
        </div>

        {/* A régua abaixo do logo da empresa (dono, 29/09/2026).
            Recuada dos dois lados, e não de borda a borda: o recuo é o MESMO
            que posiciona o logo, então a linha começa exatamente onde ele
            começa em vez de cortar a barra inteira. `flex` não a encolhe. */}
        <div
          className="shrink-0 border-t border-[color:var(--border-default)]"
          style={{
            marginLeft: "calc((var(--rail-w) - 30px) / 2)",
            marginRight: "calc((var(--rail-w) - 30px) / 2)",
          }}
        />

        {/*
          O vão que sobrou embaixo.

          O bloco existe nos DOIS estados, com a mesma altura, mesmo vazio.
          Somado ao cabeçalho, ele mantém 80px acima do menu independente do
          estado -- sem isso os ícones subiriam 32px ao abrir a barra e
          desceriam ao fechar, dançando a cada clique (dono, 22/09/2026).

          A seta saiu daqui em 29/09/2026: com a barra recolhida ela passou a
          ficar ACIMA do logo da empresa, a pedido do dono. Este bloco continua
          porque é ele que COMPENSA a altura dela: onde a seta não está, este
          bloco cresce exatamente o que ela ocuparia.

              recolhida   ESPACO_DA_SETA + marca +              VAO
              expandida               0  + marca + ESPACO_DA_SETA + VAO

          A conta é feita pelo código, e não à mão, porque à mão ela já saiu
          errada: na primeira tentativa a seta entrou em cima e este bloco ficou
          com 32px nos dois estados, somando 112 contra 80 -- o menu pularia
          32px a cada clique. Agora mudar a altura da seta ajusta os dois lados
          sozinho.

          Sem régua: a separação entre a assinatura e a navegação é o espaço. A
          barra já tem duas linhas por perto, a da superior rente ao topo e a
          da direita.
        */}
        <div className="shrink-0" style={{ height: recolhida ? 0 : ESPACO_DA_SETA, marginBottom: VAO_ANTES_DO_MENU }} />

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
          {/* Tema acima de Configurações (dono, 23/09/2026): é preferência de
              aparência, vizinha de assunto, e fica no mesmo canto fixo. */}
          <div className="flex flex-col gap-0.5">
            {botaoDeTema()}
            {renderNav({ to: "/configuracoes", label: "Configurações", icon: Cog })}
          </div>
        </div>

            </aside>
    </TooltipProvider>
  );
}
