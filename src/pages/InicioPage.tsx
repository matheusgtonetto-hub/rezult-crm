import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, MessageCircle, Package, Users, Tag, Trophy, Filter, Check, ArrowRight, Sparkles, Coins, Play,
  BookOpen,
} from "lucide-react";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { useProfile } from "@/context/ProfileContext";
import { TUTORIAIS, type Tutorial } from "@/data/tutoriais";
import iconeWhatsApp from "@/assets/whatsapp.png";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";

/**
 * Início: boas-vindas e a trilha de aprendizado da ferramenta.
 *
 * O painel existe para o primeiro dia. Quem entra num CRM vazio vê onze telas e
 * nenhuma pista de por onde começar; aqui a resposta é uma lista curta de
 * missões na ordem em que fazem sentido -- primeiro a empresa existe, depois
 * ela recebe mensagem, depois vende.
 *
 * As missões são DERIVADAS do estado real, e não marcadas à mão. É a diferença
 * entre um checklist e um espelho: ninguém precisa lembrar de riscar nada, e a
 * lista não pode mentir dizendo "pronto" sobre algo que não foi feito. O preço
 * é que nada aqui é editável, o que é o certo para uma trilha de aprendizado.
 */

interface Missao {
  id: string;
  titulo: string;
  descricao: string;
  /** Para onde a pessoa vai quando aceita a missão. */
  para: string;
  /** Pontos que a missão vale. */
  pontos: number;
  feita: boolean;
  Icone: typeof Building2;
}

/**
 * WhatsApp do suporte, só dígitos, no formato que o wa.me espera.
 *
 * Em constante, e não escrito no meio do JSX: é um dado de negócio que muda
 * (número novo, atendimento por outro time) e quem for trocar precisa achá-lo
 * sem ler a tela inteira.
 */
const WHATSAPP_SUPORTE = "554891160449";

/** Mensagem que já vai digitada, para o atendente saber de onde veio o contato. */
const MENSAGEM_SUPORTE = "Olá! Preciso de ajuda com o Rezult CRM.";

/**
 * Verde do ícone do WhatsApp, tirado do próprio arquivo (a cor de 13.736 dos
 * pixels da arte).
 *
 * Fora do token `--primary` de propósito: aqui a cor não é a da marca do
 * Rezult, é a do aplicativo para onde o botão leva, e é ela que faz o botão e o
 * ícone acima dele lerem como a mesma coisa.
 */
const VERDE_WHATSAPP = "#29A71A";

/** Central de artigos. O mesmo destino do botão Tutoriais da barra lateral. */
const CENTRAL_DE_AJUDA = "https://help.rezultcrm.com";

/** Faixas de progresso. O rótulo muda conforme a trilha avança. */
const NIVEIS: { ate: number; nome: string }[] = [
  { ate: 0,   nome: "Primeiros passos" },
  { ate: 40,  nome: "Explorando" },
  { ate: 70,  nome: "Pegando o jeito" },
  { ate: 99,  nome: "Quase lá" },
  { ate: 100, nome: "Time afiado" },
];

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

/**
 * Card de vídeo com a capa e o play, no formato do YouTube.
 *
 * A capa é imagem, não iframe: um iframe por card faria a aba abrir com nove
 * players carregando de uma vez, cada um puxando script e cookie do YouTube
 * antes de alguém decidir assistir. O player só nasce no clique, e é por isso
 * que o `autoplay` entra junto -- sem ele a pessoa clicaria duas vezes para
 * ver o mesmo vídeo.
 */
function CardTutorial({ t }: { t: Tutorial }) {
  const [tocando, setTocando] = useState(false);
  const publicado = !!t.youtubeId;

  return (
    <div className="rounded-lg border border-card-border overflow-hidden bg-card flex flex-col">
      {/* 16:9 fixo: as capas do YouTube têm essa proporção, e deixar a altura
          livre faria cada card de uma linha terminar numa altura diferente. */}
      <div className="relative aspect-video bg-muted">
        {tocando && t.youtubeId ? (
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${t.youtubeId}?autoplay=1&rel=0`}
            title={t.titulo}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => publicado && setTocando(true)}
            disabled={!publicado}
            aria-label={publicado ? `Assistir: ${t.titulo}` : `${t.titulo} (em breve)`}
            className="group absolute inset-0 w-full h-full flex items-center justify-center disabled:cursor-default"
          >
            {t.youtubeId && (
              <img
                src={`https://img.youtube.com/vi/${t.youtubeId}/hqdefault.jpg`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {publicado ? (
              <>
                {/* Véu escuro sob o play: a capa é uma foto qualquer, e sem ele
                    o botão some quando o quadro é claro. */}
                <span className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors" />
                <span className="relative w-12 h-12 rounded-full bg-white/95 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                  <Play size={18} className="text-foreground ml-0.5" fill="currentColor" />
                </span>
              </>
            ) : (
              <span className="relative text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Em breve
              </span>
            )}
          </button>
        )}

        {t.duracao && !tocando && (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
            {t.duracao}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-sm font-semibold text-foreground leading-snug">{t.titulo}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.descricao}</p>
      </div>
    </div>
  );
}

export default function InicioPage() {
  const { leads, pipelines, products, teamMembers, crmTags } = useCRM();
  const { company, whatsappConnections } = useCompany();
  const { profile } = useProfile();

  const primeiroNome = (profile?.full_name ?? "").trim().split(" ")[0];

  /**
   * Aba do painel de baixo.
   *
   * As duas respondem à mesma pergunta -- "como eu aprendo a usar isto" --, uma
   * fazendo e a outra assistindo. Por isso dividem o mesmo painel em vez de
   * virarem duas telas: quem trava numa missão acha o vídeo dela a um clique.
   */
  const [aba, setAba] = useState<"passos" | "tutoriais">("passos");

  const missoes = useMemo<Missao[]>(() => {
    const listaLeads = Object.values(leads);
    return [
      {
        id: "empresa",
        titulo: "Complete os dados da empresa",
        descricao: "Nome, telefone e nicho aparecem nas propostas e nas mensagens que você envia.",
        para: "/configuracoes/empresa",
        pontos: 10,
        feita: !!company?.name && !!company?.phone,
        Icone: Building2,
      },
      {
        id: "whatsapp",
        titulo: "Conecte seu WhatsApp",
        descricao: "É por ele que as conversas entram no CRM e viram negócio.",
        para: "/configuracoes/conexoes",
        pontos: 25,
        feita: whatsappConnections.some(c => c.connected),
        Icone: MessageCircle,
      },
      {
        id: "funil",
        titulo: "Monte seu funil",
        descricao: "As etapas pelas quais um negócio passa até o fechamento.",
        para: "/pipeline",
        pontos: 15,
        feita: pipelines.length > 0,
        Icone: Filter,
      },
      {
        id: "produtos",
        titulo: "Cadastre seus produtos",
        descricao: "Com preço no cadastro, o valor do negócio se preenche sozinho.",
        para: "/configuracoes/produtos",
        pontos: 10,
        feita: products.length > 0,
        Icone: Package,
      },
      {
        id: "tags",
        titulo: "Crie suas tags",
        descricao: "Marque origem, perfil e interesse para filtrar depois.",
        para: "/configuracoes/tags",
        pontos: 10,
        feita: crmTags.length > 0,
        Icone: Tag,
      },
      {
        id: "equipe",
        titulo: "Convide sua equipe",
        descricao: "Cada pessoa com seu acesso, seus negócios e suas conversas.",
        para: "/configuracoes/equipe",
        pontos: 15,
        feita: teamMembers.length > 1,
        Icone: Users,
      },
      {
        id: "negocio",
        titulo: "Crie seu primeiro negócio",
        descricao: "Um card no funil, com valor, responsável e próxima ação.",
        para: "/pipeline",
        pontos: 15,
        feita: listaLeads.some(l => !!l.pipelineId),
        Icone: Sparkles,
      },
      {
        id: "venda",
        titulo: "Ganhe seu primeiro negócio",
        descricao: "Marque como ganho e veja a receita aparecer no dashboard.",
        para: "/pipeline",
        pontos: 20,
        feita: listaLeads.some(l => l.dealStatus === "won"),
        Icone: Trophy,
      },
    ];
  }, [leads, pipelines, products, teamMembers, crmTags, company, whatsappConnections]);

  const feitas = missoes.filter(m => m.feita);
  const pontos = feitas.reduce((s, m) => s + m.pontos, 0);
  const pontosTotais = missoes.reduce((s, m) => s + m.pontos, 0);
  const progresso = pontosTotais > 0 ? Math.round((pontos / pontosTotais) * 100) : 0;
  const nivel = NIVEIS.find(n => progresso <= n.ate) ?? NIVEIS[NIVEIS.length - 1];

  /**
   * A próxima missão é a primeira pendente, na ordem da lista.
   *
   * A ordem não é decorativa: cadastrar produto antes de existir empresa, ou
   * caçar a primeira venda antes de ter funil, são passos fora de hora. Por
   * isso o botão de destaque aponta sempre para o primeiro buraco da trilha, e
   * não para "a missão que vale mais pontos".
   */
  const proxima = missoes.find(m => !m.feita) ?? null;

  return (
    // Mesmo enquadramento do dashboard: 40px no topo, 30px nos outros lados e
    // teto de 1280px, para as duas telas começarem na mesma linha.
    <div className="pt-[40px] px-[30px] pb-[30px] max-w-7xl mx-auto space-y-6">

      {/* ── Boas-vindas ──────────────────────────────────────────────── */}
      <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-6 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {saudacao()}{primeiroNome ? `, ${primeiroNome}` : ""}
          </p>
          <h1 className="text-[23px] font-semibold text-foreground mt-0.5">
            {company?.name ? `Bem-vindo ao ${company.name}` : "Bem-vindo ao Rezult"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Este é o seu ponto de partida. Termine a trilha abaixo e o CRM sai do zero
            configurado do jeito que a sua operação funciona.
          </p>
        </div>

        {/* O logo é o que faz a tela parecer da empresa, e não do produto. Sem
            ele, a inicial no quadrado verde cumpre o mesmo papel. */}
        {company?.logo_url ? (
          <img
            src={company.logo_url}
            alt={company.name ?? "Logo"}
            className="w-16 h-16 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-primary">
              {(company?.name ?? "R")[0].toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* ── Trilha ───────────────────────────────────────────────────── */}
      <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-6">
        {/* Grade de três colunas com as laterais em `1fr`: é isso que deixa as
            abas no centro do PAINEL, e não no meio do espaço que sobra entre o
            título e a pontuação, que têm larguras diferentes. A coluna da
            direita continua ocupando lugar mesmo com a pontuação escondida na
            aba de tutoriais, senão as abas escorregariam ao trocar de aba. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold text-foreground">Tutoriais</h2>
          {/* Abas como botões, no mesmo par que o dashboard usa: são duas
              opções, e um dropdown esconderia metade da escolha atrás de um
              clique. O contador de cada aba vai no rótulo, então dá para ver o
              tamanho do outro lado sem trocar de aba. */}
          <div className="inline-flex rounded-lg border border-card-border p-0.5 bg-muted/40">
            {([
              { id: "passos", rotulo: `Primeiros passos (${feitas.length}/${missoes.length})` },
              { id: "tutoriais", rotulo: `Tutoriais (${TUTORIAIS.length})` },
            ] as const).map(op => (
              <button
                key={op.id}
                onClick={() => setAba(op.id)}
                aria-pressed={aba === op.id}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  aba === op.id
                    ? "bg-card text-foreground shadow-elev-1"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {op.rotulo}
              </button>
            ))}
          </div>

          {/* Pontuação só na trilha: em Tutoriais ela seria um número sem
              relação nenhuma com o que está na tela. */}
          <div className="text-right justify-self-end" hidden={aba !== "passos"}>
            {/* O ícone amarra o número do topo aos "+10" espalhados pelas
                missões, que sem ele seriam só números soltos ao lado de um
                título. */}
            <p className="text-sm font-semibold text-primary tabular-nums flex items-center gap-1.5 justify-end">
              <Coins size={14} />
              {pontos} / {pontosTotais} Pontos
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{nivel.nome}</p>
          </div>
        </div>

        {aba === "passos" && <>

        {/* Barra de progresso: o número diz quanto falta, a barra diz de
            relance. Uma sem a outra deixa metade da resposta de fora. */}
        <div className="h-2 rounded-full bg-muted overflow-hidden mb-6" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full bg-primary rounded-full transition-[width] duration-500"
            style={{ width: `${progresso}%` }}
          />
        </div>

        {/* Atalho para o passo seguinte, para quem não quer escolher. Some
            quando a trilha termina, junto com a razão de existir. */}
        {proxima && (
          <Link
            to={proxima.para}
            className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 px-4 py-3 mb-5 hover:bg-primary/15 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wide text-primary/80">Próximo passo</span>
              <span className="block text-sm font-semibold text-foreground truncate">{proxima.titulo}</span>
            </span>
            <ArrowRight size={16} className="text-primary shrink-0" />
          </Link>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {missoes.map(m => (
            <Link
              key={m.id}
              to={m.para}
              className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                m.feita
                  ? "border-primary/30 bg-primary/[0.04]"
                  : "border-card-border hover:border-primary/40 hover:bg-muted/40"
              }`}
            >
              {/* Concluída troca o ícone do tema pelo visto: o que importa
                  depois de feita é o estado, não o assunto. */}
              <span
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  m.feita ? "bg-primary" : "bg-primary/10"
                }`}
              >
                {m.feita
                  ? <Check size={16} className="text-white" />
                  : <m.Icone size={16} className="text-primary" />}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{m.titulo}</span>
                  <span
                    title={`${m.pontos} pontos`}
                    className={`text-[11px] font-semibold tabular-nums shrink-0 flex items-center gap-0.5 ${m.feita ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <Coins size={11} /> +{m.pontos}
                  </span>
                </span>
                <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">{m.descricao}</span>
              </span>
            </Link>
          ))}
        </div>

        {progresso === 100 && (
          <p className="text-xs text-primary font-medium mt-5 flex items-center gap-1.5">
            <Trophy size={13} /> Trilha completa. Daqui em diante o painel vira o seu resumo do dia.
          </p>
        )}

        </>}

        {aba === "tutoriais" && (
          /* Três por linha no desktop, dois no tablet, um no celular: a capa é
             16:9, e mais de três numa linha de 1220px deixaria cada vídeo com
             uma miniatura pequena demais para se reconhecer o assunto. */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TUTORIAIS.map(t => <CardTutorial key={t.id} t={t} />)}
          </div>
        )}
      </div>

      {/* ── Ajuda ────────────────────────────────────────────────────── */}
      <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Precisa de ajuda?</h2>

        {/* Meio a meio: os dois caminhos valem o mesmo, e dar destaque a um
            deles empurraria todo mundo para lá. Empilha no celular. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-card-border p-5 flex flex-col">
            {/* A marca do WhatsApp, e não um ícone genérico de mensagem: o
                cartão promete atendimento NAQUELE aplicativo, e é o símbolo
                dele que a pessoa reconhece antes de ler o título.

                Sem o quadrado verde-claro por trás, ao contrário do cartão
                vizinho: a arte já vem com fundo próprio, e um fundo sobre o
                outro deixaria uma moldura clara em volta. */}
            <img
              src={iconeWhatsApp}
              alt=""
              className="w-[50px] h-[50px] rounded-lg shrink-0 mb-3"
            />
            <h3 className="text-base font-semibold text-foreground">Suporte Oficial no WhatsApp</h3>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              Fale com nosso time de especialistas, receba ajuda e dicas para usar melhor os
              recursos do Rezult CRM.
            </p>
            {/* `mt-auto` para os botões dos dois cartões ficarem na mesma altura
                mesmo com descrições de tamanhos diferentes. */}
            {/* O `mt-auto` fica num invólucro, e não no próprio botão: aplicado
                nele, a margem empurraria também o fundo verde, e o botão
                cresceria até o pé do cartão em vez de ficar do tamanho do
                texto. */}
            <div className="mt-auto pt-4">
              <a
                href={`https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(MENSAGEM_SUPORTE)}`}
                target="_blank"
                rel="noopener noreferrer"
                // Cor no estilo, e não em classe: `bg-[#29A71A]` funcionaria,
                // mas o hover exigiria uma segunda classe arbitrária com a cor
                // escurecida escrita à mão. Com `filter`, o estado de hover sai
                // da mesma cor, sem um segundo hex para manter em dia.
                className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 transition-[filter] hover:brightness-90"
                style={{ background: VERDE_WHATSAPP, borderRadius: 5 }}
              >
                {/* Mesmo ícone do Multiatendimento na barra lateral, à
                    esquerda do texto: ali ele já significa "conversa de
                    WhatsApp", e repetir o símbolo faz o botão dizer para onde
                    leva antes de a frase ser lida. Herda o branco do texto pelo
                    `currentColor` do próprio componente. */}
                <CrmWhatsAppIcon size={14} /> Falar com suporte
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-card-border p-5 flex flex-col">
            <span className="w-[50px] h-[50px] rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mb-3">
              <BookOpen size={22} className="text-primary" />
            </span>
            <h3 className="text-base font-semibold text-foreground">Central de ajuda</h3>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
              Artigos e passo a passo de cada recurso, para consultar na hora da dúvida sem
              precisar esperar atendimento.
            </p>
            <div className="mt-auto pt-4">
              <a
                href={CENTRAL_DE_AJUDA}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-4 py-2 transition-colors"
                style={{ borderRadius: 5 }}
              >
                <BookOpen size={14} /> Abrir central
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
