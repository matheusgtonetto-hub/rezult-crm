import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, MessageCircle, CircleUserRound, Users, Tag, Trophy, Filter, Check, ArrowRight, Sparkles, Play,
  BookOpen,
} from "lucide-react";
import { useCRM } from "@/context/CRMContext";
import { useCompany } from "@/context/CompanyContext";
import { useProfile } from "@/context/ProfileContext";
import { TUTORIAIS, type Tutorial } from "@/data/tutoriais";
import iconeWhatsApp from "@/assets/whatsapp.png";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";
import { toast } from "sonner";

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
  /**
   * Quanto esta missão vale na conta do progresso.
   *
   * Continua existindo depois que a trilha passou a ser medida em porcentagem:
   * as missões não pesam igual -- ganhar o primeiro negócio vale mais que criar
   * uma tag -- e é este número que faz a barra andar mais em umas do que em
   * outras. O que mudou é que ele deixou de aparecer na tela.
   */
  pontos: number;
  feita: boolean;
  Icone: typeof Building2;
  /**
   * Botão que executa o passo, de dois jeitos possíveis.
   *
   * `para` leva a outra tela, quase sempre com um `?abrir=...` que o destino lê
   * para já subir com o diálogo certo aberto.
   *
   * `arquivo` não sai daqui: abre o seletor de arquivos e envia na hora. É o
   * caminho de logo e foto, que não têm diálogo para abrir -- são campos no meio
   * de um formulário.
   *
   * A diferença não é de gosto, é de restrição do navegador. Seletor de arquivo
   * só abre a partir de um clique de verdade; navegar e tentar abri-lo na
   * chegada não funciona, porque ali o efeito roda sozinho, sem o gesto que
   * autoriza. Clicar no botão daqui É esse gesto.
   */
  acao?: {
    rotulo: string;
    /** Para onde ir. Um dos dois campos abaixo precisa vir preenchido. */
    para?: string;
    /** Ou o que enviar, sem sair da tela. */
    arquivo?: "logo" | "foto";
  };
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

/**
 * Azul da Central de ajuda.
 *
 * É o #3B82F6 que o app já usa em mais de cem lugares (tags, marcações, avisos
 * de informação), e não um azul novo: dois azuis parecidos na mesma tela leem
 * como erro de cor, não como distinção.
 *
 * A cor separa os dois cartões pelo destino: verde do WhatsApp leva à conversa,
 * azul leva à leitura. Nenhum dos dois usa o verde da marca, que aqui
 * significaria "ação do Rezult".
 */
const AZUL_CENTRAL = "#3B82F6";

/**
 * O que a conta ganha sem ninguém pedir.
 *
 * Empresa nova nasce com o "Pipeline comercial" (gatilho `criar_funil_padrao`) e
 * com quatro tags (gatilho `criar_tags_padrao`); as três de "Agente"/"SDS:"
 * chegam junto com o primeiro agente publicado. Nada disso foi a pessoa que fez,
 * então nada disso pode marcar o passo como cumprido -- a trilha nasceria pela
 * metade, com dois vistos que ninguém conquistou.
 *
 * A comparação é por NOME, e não pela contagem (`length > 1`). Contar quebra em
 * dois casos reais: quem apaga o padrão e cria o seu fica com um só e o passo
 * volta a ficar pendente; e o número muda sozinho quando o sistema passa a criar
 * outra coisa. Por nome, quem renomeia o padrão também cumpre o passo -- aceito
 * de propósito, já que renomear é uma decisão sobre o próprio funil.
 *
 * Se um padrão novo passar a ser criado, o nome dele entra aqui. Sem isso, o
 * passo correspondente volta a nascer marcado.
 */
const PIPELINE_PADRAO = "Pipeline comercial";
const TAGS_DO_SISTEMA = [
  // Criadas com a empresa, pelo gatilho `criar_tags_padrao`.
  "Follow-up", "Indicação", "Automação", "Agente 01",
  // Criadas com o primeiro agente, pelo gatilho `ensure_agente_tag`.
  "Agente", "SDS: Qualificado", "SDS: Não qualificado",
];

/** Central de artigos. O mesmo destino do botão Tutoriais da barra lateral. */
const CENTRAL_DE_AJUDA = "https://help.rezultcrm.com";

/**
 * Anel de progresso com a porcentagem no meio.
 *
 * Desenhado em SVG, e não com bordas e `rotate`: um arco parcial precisa de
 * `stroke-dasharray`, e é ele que deixa a volta incompleta parar no ponto certo.
 * Com CSS puro o mesmo efeito exige duas metades recortadas e um terceiro
 * elemento para tapar a emenda.
 *
 * ── Como o arco anda ──
 *
 * `strokeDasharray` recebe a volta INTEIRA, então o traço é um risco só do
 * tamanho do círculo. `strokeDashoffset` empurra esse risco para trás na
 * proporção do que falta: em 0% ele sai todo de cena, em 100% fica todo à
 * mostra. Animar o offset dá o preenchimento sem recalcular geometria.
 *
 * O `-rotate-90` existe porque o SVG começa a desenhar às 3 horas. Girando o
 * elemento inteiro, o início vai para o topo, que é de onde se espera que um
 * medidor comece a encher.
 */
function AnelDeProgresso({ valor }: { valor: number }) {
  const TAMANHO = 58;
  const ESPESSURA = 5;
  // O raio desconta metade da espessura de cada lado: o traço é pintado
  // centrado na linha, e sem esse desconto ele vazaria da caixa.
  const raio = (TAMANHO - ESPESSURA) / 2;
  const volta = 2 * Math.PI * raio;

  return (
    <div
      className="relative shrink-0"
      style={{ width: TAMANHO, height: TAMANHO }}
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progresso da trilha"
    >
      <svg width={TAMANHO} height={TAMANHO} className="-rotate-90" aria-hidden>
        <circle
          cx={TAMANHO / 2} cy={TAMANHO / 2} r={raio}
          fill="none" strokeWidth={ESPESSURA} className="stroke-muted"
        />
        <circle
          cx={TAMANHO / 2} cy={TAMANHO / 2} r={raio}
          fill="none" strokeWidth={ESPESSURA} strokeLinecap="round"
          className="stroke-primary motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - valor / 100)}
        />
      </svg>
      {/* `tabular-nums` porque o número troca de largura entre 9% e 100%, e sem
          ele o texto dança dentro do anel a cada missão concluída. */}
      <span className="absolute inset-0 flex items-center justify-center text-[14px] font-bold tabular-nums text-foreground">
        {valor}%
      </span>
    </div>
  );
}

/** Visual único dos botões de ação da trilha, usado pelos dois tipos. */
const CLASSE_DO_BOTAO =
  "inline-flex items-center gap-1.5 mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60";

/**
 * Botão que abre o seletor de arquivos e envia na hora, sem sair da trilha.
 *
 * Para logo e foto não existe diálogo a abrir: são campos de arquivo no meio de
 * um formulário. Navegar até lá e tentar abrir o seletor na chegada não
 * funcionaria -- o navegador só abre esse seletor a partir de um clique de
 * verdade, e um efeito que roda ao montar a tela não é um clique. O clique aqui
 * é, então o seletor abre e a pessoa nem troca de tela.
 *
 * O passo marca sozinho depois do envio: os dois contextos atualizam o próprio
 * estado, e a trilha lê `company.logo_url` e `profile.avatar_url` de lá.
 *
 * O limite de 2MB é o mesmo dos campos em Configurações. Repetido, e não
 * importado: são dois envios independentes, e o valor está escrito por extenso
 * na mensagem que a pessoa lê nos dois lugares.
 */
function BotaoDeArquivo({ tipo, rotulo }: { tipo: "logo" | "foto"; rotulo: string }) {
  const { uploadLogo } = useCompany();
  const { uploadAvatar } = useProfile();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const aoEscolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    // Sai antes de mexer em estado quando a pessoa abre e cancela o seletor.
    if (!arquivo) return;
    if (arquivo.size > 2 * 1024 * 1024) { toast.error("Arquivo maior que 2MB."); return; }
    setEnviando(true);
    try {
      await (tipo === "logo" ? uploadLogo(arquivo) : uploadAvatar(arquivo));
      toast.success(tipo === "logo" ? "Logo atualizado!" : "Foto atualizada!");
    } catch {
      toast.error("Erro ao enviar o arquivo.");
    } finally {
      setEnviando(false);
      // Zera o campo para que escolher O MESMO arquivo de novo dispare o envio.
      // Sem isto, o `change` não acontece na segunda vez e o botão parece morto.
      e.target.value = "";
    }
  };

  return (
    <>
      <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={aoEscolher} />
      <button type="button" onClick={() => entrada.current?.click()} disabled={enviando} className={CLASSE_DO_BOTAO}>
        {enviando ? "Enviando..." : rotulo}
      </button>
    </>
  );
}

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
  const { leads, pipelines, teamMembers, crmTags } = useCRM();
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
  /**
   * `null` significa "a pessoa ainda não escolheu", e não uma terceira aba.
   *
   * É o que permite a aba padrão depender do progresso sem atropelar quem
   * clicou: enquanto for nula, quem decide é a trilha; no primeiro clique ela
   * deixa de ser nula e a escolha da pessoa passa a valer até sair da tela.
   */
  const [aba, setAba] = useState<"passos" | "tutoriais" | null>(null);

  /**
   * A trilha, na ordem em que os passos fazem sentido.
   *
   * A ORDEM é conteúdo: o número que aparece em cada cartão sai da posição no
   * array, então mover um item aqui renumera a tela. Um campo `numero` escrito à
   * mão sairia do lugar na primeira reordenação em que alguém esquecesse de
   * ajustar o resto.
   *
   * A sequência vai do que traz cliente para o que arruma a casa: primeiro o
   * canal por onde eles falam, depois quem atende, depois onde os negócios
   * andam, e só no fim os ajustes de identidade.
   *
   * Os pesos somam 100 de propósito. Como o progresso é mostrado em porcentagem,
   * cada peso passa a ser diretamente quanto aquele passo adianta o anel -- o
   * WhatsApp vale 25%, a foto de perfil vale 10%. Se um passo entrar ou sair, os
   * pesos precisam ser redistribuídos para continuar fechando em 100.
   */
  const missoes = useMemo<Missao[]>(() => {
    const listaLeads = Object.values(leads);
    return [
      {
        id: "logo-empresa",
        titulo: "Adicione o logo da sua empresa",
        descricao: "Ele aparece aqui no painel e é o que deixa o CRM com a cara do seu negócio.",
        para: "/configuracoes/empresa",
        pontos: 10,
        feita: !!company?.logo_url,
        Icone: Building2,
        acao: { rotulo: "Adicionar logo", arquivo: "logo" },
      },
      {
        id: "foto-perfil",
        titulo: "Adicione sua imagem de perfil",
        descricao: "Sua foto identifica quem respondeu cada conversa e quem cuida de cada negócio.",
        para: "/configuracoes/perfil",
        pontos: 10,
        feita: !!profile?.avatar_url,
        Icone: CircleUserRound,
        acao: { rotulo: "Adicionar foto", arquivo: "foto" },
      },
      {
        id: "whatsapp",
        titulo: "Conecte seu WhatsApp",
        descricao: "É por onde as conversas chegam. Sem a linha ligada, o Multiatendimento fica vazio.",
        para: "/configuracoes/conexoes",
        pontos: 25,
        feita: whatsappConnections.some(c => c.connected),
        Icone: MessageCircle,
        acao: { rotulo: "Conectar WhatsApp", para: "/configuracoes/conexoes?abrir=nova-conexao" },
      },
      {
        id: "equipe",
        titulo: "Convide membros do seu time",
        descricao: "Chame quem atende com você e defina o que cada pessoa enxerga e pode fazer.",
        para: "/configuracoes/equipe",
        pontos: 15,
        // `> 1` porque o dono já conta como membro: com `> 0` a missão nasceria
        // concluída e ninguém convidaria ninguém.
        feita: teamMembers.length > 1,
        Icone: Users,
        acao: { rotulo: "Convidar membros", para: "/configuracoes/equipe?abrir=convite" },
      },
      {
        id: "pipeline",
        titulo: "Adicione um novo pipeline",
        descricao: "Monte as etapas que refletem o seu processo de vendas, do primeiro contato ao fechamento.",
        para: "/pipeline",
        pontos: 15,
        feita: pipelines.some(p => p.name.trim() !== PIPELINE_PADRAO),
        Icone: Filter,
        acao: { rotulo: "Nova pipeline", para: "/pipeline?abrir=nova-pipeline" },
      },
      {
        id: "negocio",
        titulo: "Crie seu primeiro Lead/Negócio",
        descricao: "Cadastre um contato, abra o negócio dele e acompanhe a passagem por cada etapa.",
        para: "/pipeline",
        pontos: 15,
        // Lead COM pipeline, e não lead qualquer: o passo é sobre o negócio
        // entrar no funil, que é onde ele passa a ser acompanhado.
        feita: listaLeads.some(l => !!l.pipelineId),
        Icone: Sparkles,
        // Abre o cadastro do contato; ao salvar, ele mesmo encadeia o "Criar
        // negócio". É por isso que o passo fala em Lead E Negócio: são duas
        // janelas em sequência, não duas tarefas.
        acao: { rotulo: "Novo lead", para: "/leads?abrir=novo-lead" },
      },
      {
        id: "tags",
        titulo: "Adicione uma Tag",
        descricao: "Marque leads por origem, interesse ou situação para achar cada grupo depois.",
        para: "/configuracoes/tags",
        pontos: 10,
        feita: crmTags.some(t => !TAGS_DO_SISTEMA.includes(t.name.trim())),
        Icone: Tag,
        acao: { rotulo: "Nova tag", para: "/configuracoes/tags?abrir=nova-tag" },
      },
    ];
  }, [leads, pipelines, teamMembers, crmTags, company, whatsappConnections, profile]);

  const feitas = missoes.filter(m => m.feita);
  const pontos = feitas.reduce((s, m) => s + m.pontos, 0);
  const pontosTotais = missoes.reduce((s, m) => s + m.pontos, 0);
  const progresso = pontosTotais > 0 ? Math.round((pontos / pontosTotais) * 100) : 0;

  /**
   * A próxima missão é a primeira pendente, na ordem da lista.
   *
   * A ordem não é decorativa: cadastrar produto antes de existir empresa, ou
   * caçar a primeira venda antes de ter funil, são passos fora de hora. Por
   * isso o botão de destaque aponta sempre para o primeiro buraco da trilha, e
   * não para "a missão que vale mais pontos".
   */
  const proxima = missoes.find(m => !m.feita) ?? null;

  const trilhaCompleta = progresso === 100;

  /**
   * A aba que está no ar.
   *
   * Com a trilha cumprida, a tela abre nos Tutoriais: a trilha é um guia de
   * primeiro dia, e oito cartões todos com visto não dizem nada de novo a quem
   * já sabe usar o produto. Ela CONTINUA acessível -- muda o padrão, não o
   * acesso, porque conferir o que já foi feito é um motivo legítimo de voltar.
   *
   * Derivado, e não um `setAba` dentro de efeito. O efeito rodaria depois do
   * primeiro render, então a tela piscaria na aba errada antes de se corrigir;
   * e ele também precisaria de uma trava para não desfazer o clique da pessoa a
   * cada nova renderização.
   */
  const abaAtiva = aba ?? (trilhaCompleta ? "tutoriais" : "passos");

  return (
    // Mesmo enquadramento do dashboard: 40px no topo, 30px nos outros lados e
    // teto de 1280px, para as duas telas começarem na mesma linha.
    <div className="pt-[40px] px-[30px] pb-[30px] max-w-7xl mx-auto space-y-6">

      {/* ── Boas-vindas ──────────────────────────────────────────────────
          Duas metades: texto de um lado, ilustração do outro.

          Grade de duas colunas iguais, e não flex: com `1fr 1fr` a divisão sai
          do cartão e não do conteúdo, então o corte fica no mesmo lugar
          independentemente do tamanho do nome da empresa. Num flex, um nome
          longo comeria o espaço da imagem.

          `items-center` põe as duas metades no centro vertical uma da outra: o
          texto ocupa umas três linhas e a imagem 250px, e alinhar pelo topo
          deixaria o texto colado na borda de cima com um vazio embaixo.

          Abaixo de 768px vira uma coluna só, com o texto em cima.

          `py-[50px]` depois do `p-6`: o respiro lateral continua em 24px e só o
          vertical sobe para 50. Vem depois na classe porque o Tailwind resolve
          empate de especificidade pela ordem em que as regras entram no CSS, e
          `py` é mais específico que `p` nesta folha. */}
      <div className="bg-card border border-gray-200 rounded-xl shadow-elev-1 p-6 py-[50px] grid grid-cols-1 md:grid-cols-2 items-center gap-6">
        {/*
          Título e texto mudam com o estado da conta, porque a pergunta que a
          pessoa traz muda.

          Antes era "Bem-vindo ao {empresa}", fixo, com dois defeitos. Repetia o
          cumprimento que a linha logo acima já dá ("Bom dia, Matheus"), e não
          envelhecia: `/inicio` é a tela padrão de todo acesso, então na
          quinquagésima vez o CRM ainda tratava um veterano como visitante.

          Também não vira frase de marketing. Quem lê isto já é cliente, e lê
          todo dia; uma promessa de venda aqui é anúncio para quem já comprou.
        */}
        <div className="min-w-0">
          <p className="text-[16px] text-muted-foreground">
            {saudacao()}{primeiroNome ? `, ${primeiroNome}` : ""}
          </p>
          <h1 className="text-[30px] font-semibold text-foreground mt-0.5 leading-tight">
            {trilhaCompleta ? "Seu CRM está pronto" : "O Rezult CRM está quase pronto..."}
          </h1>
          {/*
            O texto do segundo estado descreve o que ESTÁ na tela: tutoriais e
            suporte. Não promete um resumo do dia, que ainda não existe -- seria
            trocar uma frase envelhecida por uma frase falsa.
          */}
          <p className="text-[15px] text-muted-foreground mt-2 leading-relaxed">
            {trilhaCompleta
              ? "Configuração concluída. Aqui ficam os tutoriais e o suporte, sempre que precisar."
              : "Siga a trilha abaixo e finalize a configuração da sua conta para extrair o melhor da ferramenta."}
          </p>
        </div>

        {/*
          O logo é o que faz a tela parecer da empresa, e não do produto. Sem
          ele, a inicial no quadrado verde cumpre o mesmo papel.

          Este lugar já foi de uma ilustração de produto, que segue guardada em
          `src/assets/banner-inicio.png` para voltar. Ela não está importada, e
          por isso não entra no bundle -- o arquivo só ocupa espaço no
          repositório. Não apague achando que sobrou de alguma limpeza.

          `max-h` em vez de `h`: logo é arquivo de terceiro e vem em qualquer
          tamanho. Com altura fixa, um arquivo pequeno seria esticado e chegaria
          borrado na tela -- e logo borrado passa a impressão de descuido
          justamente na marca do cliente. Assim ele cresce até o teto e para.

          `ml-auto` empurra para a direita da coluna, encostado na borda interna
          do cartão. A folga que sobra vai toda para o meio, entre o logo e o
          texto, que é o que separa visualmente as duas metades.
        */}
        {company?.logo_url ? (
          <img
            src={company.logo_url}
            alt={company.name ?? "Logo"}
            className="max-h-[140px] w-auto max-w-full object-contain ml-auto"
          />
        ) : (
          /* A inicial cresceu junto com a caixa: os 64px de antes eram o certo
             ao lado de um bloco de texto estreito, mas numa metade de cartão
             ficariam perdidos no vazio. */
          <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center ml-auto shrink-0">
            <span className="text-4xl font-bold text-primary">
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
                aria-pressed={abaAtiva === op.id}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  abaAtiva === op.id
                    ? "bg-card text-foreground shadow-elev-1"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {op.rotulo}
              </button>
            ))}
          </div>

          {/* Progresso só na trilha: em Tutoriais ele seria um número sem
              relação nenhuma com o que está na tela. */}
          <div className="flex items-center gap-3 justify-self-end" hidden={abaAtiva !== "passos"}>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">Evolução</p>
              {/* Contagem de passos abaixo do rótulo. A porcentagem no anel diz
                  QUANTO falta; esta linha diz quantas coisas são, que é o que
                  responde "dá para terminar hoje?". */}
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {feitas.length} de {missoes.length} concluídos
              </p>
            </div>
            <AnelDeProgresso valor={progresso} />
          </div>
        </div>

        {abaAtiva === "passos" && <>

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
          {/* Cartão em `div`, e não em `Link` como antes.

              Um `<a>` não pode conter outro elemento clicável: com o botão de
              ação dentro dele, o HTML fica inválido e o clique passa a depender
              de qual navegador está lendo. Quem navega agora é o TÍTULO, que
              virou o link; o resto do cartão é moldura. */}
          {missoes.map(m => (
            <div
              key={m.id}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
                m.feita
                  ? "border-primary/30 bg-primary/[0.04]"
                  : "border-card-border hover:border-primary/40"
              }`}
            >
              {/* Caixa de seleção do passo, no lugar do quadrado colorido que
                  antes guardava o ícone do tema.

                  Ela existe para ser varrida: sete cartões em duas colunas, e a
                  pergunta é "o que ainda falta". Uma caixa vazia ou marcada
                  responde isso na periferia da visão, sem precisar ler nada. O
                  ícone do assunto foi para junto do título, onde ele conta o QUE
                  é o passo em vez de disputar o papel de dizer o ESTADO.

                  Não é um `<input type="checkbox">`: nada aqui se marca à mão --
                  o estado vem do que existe na conta, e uma caixa clicável
                  convidaria a marcar o passo sem ter feito nada.

                  Sem empurrão vertical: o cartão centra os dois lados
                  (`items-center`), então a caixa fica no meio da altura do
                  bloco de texto, e não colada na primeira linha. */}
              <span
                aria-hidden
                className={`w-5 h-5 rounded-[5px] border-2 flex items-center justify-center shrink-0 transition-colors ${
                  m.feita ? "bg-primary border-primary" : "border-card-border"
                }`}
              >
                {m.feita && <Check size={12} className="text-white" strokeWidth={3.5} />}
              </span>

              <span className="min-w-0 flex-1">
                {/* Título em texto, não em link: quem age no cartão é o botão
                    abaixo, e um só caminho por cartão evita a dúvida de qual dos
                    dois leva ao lugar certo.

                    A cor é o estado: verde quando o passo está cumprido, escuro
                    enquanto não está. O ícone do assunto herda essa cor por
                    `currentColor`, então a linha muda junta em vez de trocar de
                    cor em pedaços.

                    `aria-hidden` nos ícones: nenhum acrescenta informação a quem
                    ouve a tela. */}
                <p
                  className={`flex items-center gap-1.5 text-sm font-semibold ${
                    m.feita ? "text-primary" : "text-foreground"
                  }`}
                >
                  <m.Icone size={15} className="shrink-0" aria-hidden />
                  <span className="truncate">{m.titulo}</span>
                  <ArrowRight size={14} aria-hidden className="text-primary shrink-0" />
                </p>
                <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">{m.descricao}</span>

                {/* Botão nos passos que têm ação direta, inclusive depois de
                    cumpridos: um segundo pipeline, mais uma tag ou outro lead
                    continuam sendo coisas que se faz, e esconder o atalho
                    obrigaria a procurar o caminho longo justamente quem já
                    entendeu para que ele serve. */}
                {m.acao?.para && (
                  <Link to={m.acao.para} className={CLASSE_DO_BOTAO}>
                    {m.acao.rotulo}
                  </Link>
                )}
                {m.acao?.arquivo && (
                  <BotaoDeArquivo tipo={m.acao.arquivo} rotulo={m.acao.rotulo} />
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Continua valendo: com a trilha cumprida a aba não some, só deixa de
            ser a padrão, então quem voltar aqui de propósito lê o recado.

            A frase dizia "daqui em diante o painel vira o seu resumo do dia", e
            ele não vira: o que muda ao concluir é a aba padrão passar a ser
            Tutoriais. Era o produto prometendo por escrito algo que não existe.
            Quando houver um resumo de verdade, esta linha é o lugar de anunciá-lo. */}
        {trilhaCompleta && (
          <p className="text-xs text-primary font-medium mt-5 flex items-center gap-1.5">
            <Trophy size={13} /> Trilha completa. O básico está configurado e o CRM já roda com a sua operação.
          </p>
        )}

        </>}

        {abaAtiva === "tutoriais" && (
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
            {/* Fundo no mesmo azul a 12%, para o quadrado acompanhar o botão
                sem competir com ele. */}
            <span
              className="w-[50px] h-[50px] rounded-lg flex items-center justify-center shrink-0 mb-3"
              style={{ background: `${AZUL_CENTRAL}1F` }}
            >
              <BookOpen size={22} style={{ color: AZUL_CENTRAL }} />
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
                // Mesmo tratamento do botão de suporte: cor no estilo e hover
                // por `brightness`, sem um segundo hex escurecido para manter.
                className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 transition-[filter] hover:brightness-90"
                style={{ background: AZUL_CENTRAL, borderRadius: 5 }}
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
