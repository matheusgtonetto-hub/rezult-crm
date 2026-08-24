import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, MessageCircle, Package, Users, Tag, Trophy, Filter, Check, ArrowRight, Sparkles, Coins, Play,
} from "lucide-react";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { useProfile } from "@/context/ProfileContext";
import { TUTORIAIS, type Tutorial } from "@/data/tutoriais";

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
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
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
          <div className="text-right" hidden={aba !== "passos"}>
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
    </div>
  );
}
