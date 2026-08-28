import { useState, useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PLANS, type PlanDefinition } from "@/data/plans";
import { STRIPE_PRICES } from "@/data/stripePrices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { pixelTrack } from "@/lib/metaPixel";
import { FundoDoCrmAoVivo } from "@/components/FundoDoCrmAoVivo";
// A regra da oferta mora fora desta tela porque não é dela: é do produto, e
// vale igual em qualquer lugar que mostre preço com desconto.
import {
  DESCONTO_DA_OFERTA as DESCONTO,
  ofertaEstaValida,
  comDesconto,
  emNumero,
  emReais,
} from "@/data/ofertaDePrimeiraContratacao";
import { TelaPreparandoConta } from "@/components/TelaPreparandoConta";
import { BalaoDoTour } from "@/components/BalaoDoTour";
import {
  Check,
  ChevronDown,
  CircleCheck,
} from "lucide-react";

type Step = 1;
type BillingTab = "mensal" | "semestral" | "anual";

type PlanKey = keyof typeof STRIPE_PRICES;

const BILLING_TAB_TO_PERIOD: Record<BillingTab, "monthly" | "semiannual" | "annual"> = {
  mensal:    "monthly",
  semestral: "semiannual",
  anual:     "annual",
};

/**
 * Paleta do site (rezult-site/styles.css), portada para os cartões de plano.
 *
 * Os valores estão em constantes e não em classes do Tailwind porque não são
 * do tema do app: o CRM é claro, e este bloco é uma ilha escura dentro dele.
 * Usar `bg-card` ou `text-foreground` aqui traria as cores do app de volta e
 * quebraria a semelhança com o site, que é o ponto.
 *
 * Verde diferente do `--primary` do CRM de propósito: no fundo escuro do site
 * o #00E599 é o que dá o contraste, e o #128A68 do app sumiria.
 */
const SITE = {
  // O preto do site é mais escuro que a superfície dos cartões, e é essa
  // diferença que faz os três se destacarem do fundo em vez de sumirem nele.
  fundo:       "#05080A",
  superficie:  "#0C1115",
  superficie2: "#131A1E",
  verde:       "#00E599",
  sobreVerde:  "#04140D",
  texto:       "#F4F6F4",
  textoSuave:  "#D1D1D1",
  textoFraco:  "rgba(244, 246, 244, 0.38)",
  borda:       "rgba(255, 255, 255, 0.15)",
  bordaSuave:  "rgba(0, 229, 153, 0.20)",
  bordaAtiva:  "rgba(0, 229, 153, 0.45)",
  // 0.18 é o `--glow-soft` do site, usado no brilho das sombras, nas pílulas e
  // também no topo do degradê do cartão em destaque. O site usa 0.06 lá, um véu
  // quase imperceptível; aqui o verde é mais presente de propósito, porque os
  // cartões são menores e o degradê fraco praticamente desaparecia.
  brilhoSuave: "rgba(0, 229, 153, 0.18)",
  // O brilho da moldura do card, nos dois sentidos. O site usa 0.45 no `--glow`
  // dos elementos primários; aqui é 0.35, porque a moldura acende para dentro
  // também e o valor cheio esverdeava demais o preto por baixo dos cartões.
  // Não confundir com o `brilhoSuave` (0.18), que é véu.
  brilhoVerde: "rgba(0, 229, 153, 0.35)",
  // O `--red: #EF4444` do site, nos preços antigos riscados. Vermelho marca o
  // que a pessoa NÃO vai pagar.
  vermelho:    "#EF4444",
  // Verde fechado do selo da oferta. Escolhido por duas razões, não por gosto:
  //
  // 1. Precisa ser claramente mais escuro que o #00E599 do botão "7 Dias
  //    grátis" logo ao lado, senão os dois blocos verdes competem e nenhum
  //    ganha. Este é dois degraus abaixo, e a diferença lê de longe.
  //
  // 2. O texto do selo é branco, e branco sobre o #00E599 do botão dá 1.66:1,
  //    ilegível. Sobre este verde dá 5.48:1, acima do 4.5:1 que a WCAG pede
  //    para texto normal. O botão passa porque o texto dele é escuro; o selo
  //    não teria essa saída sem um verde fechado.
  verdeFechado: "#047857",
} as const;

/**
 * Escala do seletor de período, sendo 1 o tamanho exato do site.
 *
 * Governa os vãos e os preenchimentos internos. A largura, a fonte e o
 * preenchimento vertical dos botões saíram dela e viraram constantes próprias,
 * conforme cada um precisou ser calibrado sem arrastar os outros junto.
 *
 * O raio fica fora da conta: em 100px o trilho já é uma pílula perfeita em
 * qualquer largura, e escalar isso não mudaria nada.
 *
 * 0.9 encolhe 10%, 0.8 encolhe 20%. Abaixo de 0.75 a fonte do selo cai de 10px
 * para menos de 8, que é onde ela deixa de ser legível.
 */
/**
 * Brilho atrás do cartão inteiro. Mesma medida dos balões, 80px de raio a 70%,
 * mas em BRANCO -- o dos balões é verde.
 *
 * A diferença de cor separa os dois planos em vez de igualá-los: o balão acende
 * na cor da marca e o cartão só clareia atrás dele, então quem está na frente
 * continua sendo o balão. Verde nos dois, os brilhos se somariam na borda e
 * virariam uma mancha só.
 */
const BRILHO_DO_CARTAO = "0 0 80px rgba(255, 255, 255, 0.70)";

const ESCALA_DO_SELETOR = 0.9;

/** Aplica a escala e arredonda, porque meio pixel de padding não existe. */
const esc = (valor: number) => Math.round(valor * ESCALA_DO_SELETOR);

/**
 * Preenchimento vertical dos botões do seletor, em pixels.
 *
 * Fora da escala de propósito: ele é o único jeito de encolher o seletor só na
 * altura sem estreitar os 270px de largura, e cada ponto aqui tira 2px do
 * trilho inteiro. No site esse valor é 9, igual ao horizontal; aqui os dois se
 * separaram porque a altura precisava ceder e a largura não.
 */
const PADDING_VERTICAL_DO_BOTAO = 5;

/**
 * Fonte do rótulo dos botões do seletor, em pixels.
 *
 * Também fora da escala, e pelo mesmo motivo do preenchimento acima: encolher
 * a letra pela escala estreitaria o trilho junto. A escala em 0.9 daria 13px;
 * aqui é 12, um ponto abaixo.
 *
 * O selo de desconto NÃO acompanha: em 9px ele já é o menor texto do card, e
 * cair para 8 é onde ele deixa de ser lido e vira mancha.
 */
const FONTE_DO_BOTAO = 12;

/**
 * Largura do seletor de período, em pixels.
 *
 * Fora da escala, como o preenchimento e a fonte acima. O site usa 300px, e
 * aqui eram 270 (300 × 0.9); com a saída do selo de desconto ao lado de cada
 * período, sobrou espaço dentro dos botões e a caixa pôde estreitar sem os
 * rótulos encostarem nas bordas.
 *
 * O piso é o rótulo mais longo: "Semestral" em 12px pede uns 70px de botão, e
 * são três botões mais os vãos. Abaixo de ~215px ele começa a espremer.
 */
const LARGURA_DO_SELETOR = 230;

/**
 * Os dois passos do balão de boas-vindas desta tela.
 *
 * A ordem resolve um medo antes de fazer uma oferta. Quem acaba de criar conta
 * e cai numa tabela de preços conclui que os "7 dias grátis" eram isca; o
 * primeiro passo desarma isso apontando para o próprio botão de teste, que é a
 * saída. Só com a pessoa sabendo que pode sair é que o segundo passo fala em
 * desconto.
 *
 * O passo 2 só existe quando há promoção de verdade: com `DESCONTO` em 0 ele sai
 * da lista e o balão vira de um passo só. Prometer cupom por escrito e cobrar
 * cheio no checkout é bem pior do que um preço riscado, porque aqui a promessa
 * está em palavras.
 *
 * "condição de primeira contratação" no lugar de "nunca mais": se um dia sair
 * e-mail de recuperação com os mesmos 50%, a segunda frase vira mentira que o
 * cliente pega, e a primeira continua verdadeira.
 */
/**
 * Trecho em negrito dentro da descrição de um passo.
 *
 * 600, o mesmo peso do título do balão. Em 500 sobre o cinza da descrição o
 * destaque quase não se lia, e o objetivo aqui é que a promessa salte da frase.
 */
const Forte = ({ children }: { children: ReactNode }) => (
  <span style={{ fontWeight: 600 }}>{children}</span>
);

/**
 * A frase do cupom. Uma constante, e não a mesma string escrita duas vezes: ela
 * aparece no alto do cartão e dentro do balão do passo 2, e o efeito depende de
 * serem IDÊNTICAS -- é o que faz a segunda ser reconhecida como a primeira.
 * Duas cópias soltas divergiriam na primeira edição de texto.
 */
const TITULO_DA_OFERTA = "Oferta Exclusiva - 50% OFF";

const PASSOS_DO_TOUR = [
  {
    ancora: "teste" as const,
    // Escrito em caixa normal de propósito: quem passa para maiúsculas é o CSS
    // do balão, e o `rotulo` que vai para o leitor de tela sai desta mesma
    // frase -- em maiúsculas na origem, ele soletraria letra por letra.
    titulo: "7 dias grátis ativos",
    rotulo: "7 dias grátis ativos",
    // Negrito nos trechos que carregam a promessa. O resto fica em 400: se a
    // frase inteira engrossasse, nada nela se destacaria.
    texto: (
      <>
        Você já pode usar o <Forte>Rezult CRM</Forte> por <Forte>7 dias grátis</Forte>,{" "}
        <Forte>sem pagar nada</Forte>. Escolher um dos planos agora é opcional.
      </>
    ),
  },
  ...(DESCONTO > 0 ? [{
    // `ancora` aqui não posiciona nada: este balão fica centralizado no cartão.
    // Ela sobreviveu porque ainda diz QUEM continua nítido enquanto o passo
    // roda -- o selo e a frase ao lado dele, que são a oferta que o balão
    // apresenta. Sem isso o passo falaria de um desconto que ninguém vê.
    ancora: "selo" as const,
    // O título é o próprio selo, e não um texto que fala sobre ele. A pessoa
    // acabou de ver aquele cupom no alto do cartão; repetir a peça idêntica
    // dentro do balão diz "é DESTE que estou falando" sem precisar da frase.
    // A pulsação vem para cá enquanto este passo roda -- ver o botão de teste,
    // que a devolve. É a mesma animação, então os dois nunca parecem duas coisas
    // diferentes tentando chamar atenção.
    titulo: (
      <div className="pulso-botao">
        <SeloDaOferta texto={TITULO_DA_OFERTA} como="p" tamanho={17} />
      </div>
    ),
    rotulo: TITULO_DA_OFERTA,
    // Dois negritos, e não três: o que ela ganhou e até quando. Com metade da
    // frase destacada, nada se destaca.
    //
    // A urgência mudou de natureza junto com a regra da oferta. Era "decida
    // neste segundo", que só funciona enquanto a tela está aberta e some quando
    // a pessoa fecha a aba. Agora é um prazo que corre por sete dias e continua
    // valendo dentro do produto, depois de ela já ter visto o CRM funcionando.
    //
    // Saiu "condição única": com prazo de sete dias, a frase se contradizia.
    texto: (
      <>
        Você ganhou um <Forte>cupom de 50% de desconto</Forte>, válido em qualquer plano:
        mensal, semestral ou anual. Ele vale durante os seus <Forte>7 dias de teste</Forte> e
        some quando eles acabarem.
      </>
    ),
  }] : []),
];

/** Onde guardar que esta conta já viu o passo a passo. */
/**
 * Quanto o bloco de planos desfoca enquanto a sequência de balões roda.
 *
 * A sequência existe para a pessoa ler duas informações antes de olhar preço:
 * que o teste já está ativo, e que o desconto só vale agora. Com os planos
 * legíveis atrás, o olho vai para os números primeiro e os balões viram
 * obstáculo. Desfocados, eles deixam de competir e viram a recompensa de
 * terminar -- o desfoque sai no fim e os planos aparecem.
 *
 * O valor foi calibrado no olho, e a escala não é linear: por volta de 5px o
 * bloco lê como cartão fora de foco e os preços grandes ainda se adivinham;
 * dos 15 aos 18 nada se lê mas as três colunas continuam contáveis; dos 30 em
 * diante some também a estrutura, ao custo de o bloco virar mancha de cor.
 */
/**
 * Tamanho de projeto do cartão. Cada fonte, respiro e altura de linha lá dentro
 * foi calibrado contra estes dois números, e o conteúdo não sobra: a altura é
 * fixa justamente para uma linha nova não empurrar as outras para fora.
 *
 * Por isso a tela pequena reduz o cartão INTEIRO em vez de reagrupar o que há
 * dentro. Um layout que se reorganiza abriria mão da calibragem toda; a
 * redução proporcional preserva o desenho e só muda a distância do olho.
 *
 * A altura conta os 650px do miolo mais 1px de moldura de cada lado.
 */
const LARGURA_DO_CARD = 980;
const ALTURA_DO_CARD = 652;
/** Folga mínima até a borda da janela, igual ao `py-10` da página. */
const RESPIRO_DA_JANELA = 40;

const DESFOQUE_DO_TOUR = 2;

/**
 * Como a pessoa quer pagar um plano de mais de um mês.
 *
 * Existe só para semestral e anual. No mensal a cobrança já é uma por mês, e
 * "parcelar" um mês não quer dizer nada -- por isso o mensal pula esta escolha
 * e entra direto na confirmação.
 */
type FormaDePagamento = "avista" | "parcelado";

/**
 * O parcelado sai pela Ticto, que ainda não está integrada.
 *
 * Enquanto isto for `false`, a escolha do parcelado é aceita normalmente e o
 * bloqueio acontece só no "Confirmar", com um aviso de que ainda não está
 * disponível. Não é o ideal para produção: quem escolheu já se decidiu, e
 * descobrir ali que não dá queima a venda no pior momento. É aceitável agora
 * porque a Ticto entra em seguida.
 *
 * Ao integrar: virar `true` e preencher `abrirCheckoutTicto`. Nada mais no
 * fluxo precisa mudar.
 */
const TICTO_DISPONIVEL = false;

const chaveDoTour = (companyId: string) => `rz_tour_planos_${companyId}`;

// A etapa de convidar membro saiu: quem acabou de criar a conta ainda não sabe
// o que é o produto, e convidar time antes de conhecer é pedir um favor a quem
// não tem o que mostrar. O convite continua em Configurações > Empresa > Equipe.
const STEP_META = [
  {
    title: TITULO_DA_OFERTA,
    subtitle: "",
  },
];

const SETUP_PLAN_TOTALS: Record<string, { semestral: string; anual: string }> = {
  silver:   { semestral: "R$ 1.209,00",  anual: "R$ 1.989,00"  },
  platinum: { semestral: "R$ 2.035,00",  anual: "R$ 3.352,00"  },
  emerald:  { semestral: "R$ 3.810,00",  anual: "R$ 6.272,00"  },
};


/**
 * Recursos de cada plano, na divisão que o site usa.
 *
 * `forte` é o pedaço em negrito, `resto` é o que vem depois em cinza, e o
 * primeiro item de cada plano leva o brilho verde -- é assim em
 * rezult-site/planos.html, onde só o primeiro item ganha o `em-shine-text`.
 * Os dois últimos itens não têm negrito nenhum, também como lá.
 *
 * Os textos são os do site, palavra por palavra, inclusive sem o ponto final
 * que a versão anterior desta tela usava. Duas telas que vendem o mesmo plano
 * não deveriam descrevê-lo com palavras diferentes.
 */
interface Recurso {
  forte?: string;
  resto?: string;
  brilho?: boolean;
}

const SETUP_PLAN_FEATURES: Record<string, Recurso[]> = {
  silver: [
    { forte: "4 usuários",    resto: "no sistema", brilho: true },
    { forte: "5 mil leads",   resto: "com controle de tags" },
    { forte: "8 automações",  resto: "para interações com leads" },
    { forte: "3 conexões",    resto: "WhatsApp" },
    { forte: "5 pipelines",   resto: "com até 8 etapas" },
    { forte: "3 integrações", resto: "via Webhook" },
    { resto: "Acesso à API e MCP" },
    { resto: "Dashboards detalhados da operação" },
  ],
  platinum: [
    { forte: "15 usuários",    resto: "no sistema", brilho: true },
    { forte: "100 mil leads",  resto: "com controle de tags" },
    { forte: "20 automações",  resto: "para interações com leads" },
    { forte: "10 conexões",    resto: "WhatsApp" },
    { forte: "20 pipelines",   resto: "com até 15 etapas" },
    { forte: "15 integrações", resto: "via Webhook" },
    { resto: "Acesso à API e MCP" },
    { resto: "Dashboards detalhados da operação" },
  ],
  emerald: [
    { forte: "Usuários ilimitados",    resto: "no sistema", brilho: true },
    { forte: "Leads ilimitados",       resto: "com controle de tags" },
    { forte: "Automações ilimitadas" },
    { forte: "Conexões ilimitadas",    resto: "WhatsApp" },
    { forte: "Pipelines ilimitadas",   resto: "com até 25 etapas" },
    { forte: "Integrações ilimitadas", resto: "via Webhook" },
    { resto: "Acesso à API e MCP" },
    { resto: "Dashboards detalhados da operação" },
  ],
};

/**
 * Selo da oferta, no topo do card.
 *
 * Duas caixas, uma dentro da outra: a de fora é o campo verde fechado, a de
 * dentro é a linha tracejada branca. É o desenho de cupom -- o tracejado sugere
 * recorte, e recorte sugere que aquilo é destacável e tem prazo.
 *
 * O tracejado precisa de DUAS caixas porque ele tem que flutuar dentro do
 * campo, com margem dos dois lados. Uma borda tracejada aplicada direto no
 * campo colorido ficaria na beirada dele, sem a moldura de cor em volta, e o
 * efeito de cupom se perderia.
 *
 * O respiro interno é curto de propósito (3px em cima e embaixo, 10 nas
 * laterais): o texto quase encosta no tracejado, que é o que faz o selo parecer
 * apertado e urgente em vez de uma caixa com texto dentro.
 */
/**
 * O cupom da oferta. Aparece duas vezes: no alto do cartão, onde é o título da
 * tela, e dentro do balão do passo 2, onde é a mesma oferta sendo apresentada.
 *
 * `como` existe por causa dessa segunda vez. O do alto é o `h1` da página, e
 * duplicar um `h1` quebraria a estrutura de títulos para quem navega por leitor
 * de tela -- a cópia entra como parágrafo, com o visual idêntico e sem disputar
 * o posto.
 */
function SeloDaOferta({
  texto,
  como: Marcacao = "h1",
  tamanho = 16,
}: {
  texto: string;
  como?: "h1" | "p";
  /** Corpo da fonte. A cópia dentro do balão pede um pouco mais que a do topo. */
  tamanho?: number;
}) {
  return (
    // Uma camada só. Eram duas, e a de dentro existia para segurar a moldura
    // tracejada; sem ela, sobrava um elemento sem função.
    //
    // O respiro de 8 por 15 é a soma dos que havia antes -- 4 de fora, 1 de
    // moldura e 3 ou 10 de dentro. Mantém o selo do mesmo tamanho, para ele não
    // encolher junto com a linha que saiu.
    <div
      className="shrink-0 rounded-[7px]"
      style={{ background: SITE.verdeFechado, padding: "8px 15px" }}
    >
      <Marcacao
        className="font-bold whitespace-nowrap"
        style={{ fontSize: tamanho, color: "#FFFFFF", letterSpacing: "0.01em" }}
      >
        {texto}
      </Marcacao>
    </div>
  );
}

export default function SetupPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { company, companyLoading, isFreePlan, isTrialing } = useCompany();
  const { user } = useAuth();

  useEffect(() => {
    if (companyLoading) return;
    // Quem está em teste grátis tem plano pago e cairia neste desvio, indo direto
    // para o dashboard sem passar pelo onboarding, que é justamente onde a
    // assinatura é oferecida. O desvio existe para quem JÁ assinou.
    if (company && !isFreePlan && !isTrialing) {
      navigate("/dashboard", { replace: true });
    }
  }, [companyLoading, company, isFreePlan, isTrialing, navigate]);



  useEffect(() => {
    pixelTrack("ViewContent", { content_name: "Planos" });
  }, []);


  /**
   * Semestral por padrão, e não mensal.
   *
   * É o meio da escada: quem chega vendo o semestral tem o anual à direita como
   * "um passo além" e o mensal à esquerda como "um passo atrás". Abrindo no
   * mensal, os outros dois só existem para quem for procurar, e o preço que a
   * pessoa vê primeiro é o mais alto por mês.
   */
  const [billingTab, setBillingTab]   = useState<BillingTab>("semestral");
  const [confirmPlan, setConfirmPlan] = useState<PlanKey | null>(null);
  /**
   * `null` enquanto a pessoa ainda não escolheu como pagar. É esse nulo que faz
   * o diálogo mostrar a escolha em vez da confirmação -- os dois passos moram
   * no mesmo diálogo, e não em dois, para a pessoa não ver uma janela fechar e
   * outra abrir no meio de uma decisão de compra.
   */
  const [formaDePagamento, setFormaDePagamento] = useState<FormaDePagamento | null>(null);
  const [confirming, setConfirming]   = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [planConfirmed, setPlanConfirmed] = useState(false);
  /**
   * Qual passo do balão está no ar. TRÊS estados, e a distinção entre eles é o
   * que impede a tela de aparecer pela metade:
   *
   *   undefined -> ainda não sei (a empresa não chegou)
   *   null      -> sei, e não mostra (já foi visto)
   *   0..n      -> mostra este passo
   *
   * Antes eram dois, com `null` fazendo os dois primeiros papéis ao mesmo
   * tempo. Como o render não distinguia "não sei" de "não mostra", ele pintava
   * a versão sem balão enquanto a consulta da empresa ainda estava no ar -- e a
   * pessoa via o cartão de planos nítido antes de o desfoque e o balão
   * entrarem. O terceiro estado é o que dá ao render como esperar.
   */
  const [passoDoTour, setPassoDoTour] = useState<number | null | undefined>(undefined);

  /**
   * Quanto o cartão precisa encolher para caber na janela. Nunca passa de 1: em
   * tela grande ele fica no tamanho de projeto, e sobra espaço em volta.
   *
   * Cobre o zoom do navegador junto com o redimensionamento, e de graça: dar
   * zoom muda o tamanho da janela em pixels de CSS, que é exatamente o que esta
   * conta lê. Não existe caso separado para tratar.
   */
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const medir = () => setEscala(Math.min(
      1,
      (window.innerWidth - RESPIRO_DA_JANELA * 2) / LARGURA_DO_CARD,
      (window.innerHeight - RESPIRO_DA_JANELA * 2) / ALTURA_DO_CARD,
    ));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  /**
   * A Oferta de Primeira Contratação vale para esta empresa?
   *
   * Antes esta tela assumia que sim, porque só era vista logo depois do
   * cadastro. Deixou de ser verdade no momento em que a oferta ganhou prazo: um
   * link salvo, uma aba esquecida aberta ou uma volta no décimo dia traziam a
   * pessoa de novo para cá, e ela via 50% que o checkout não aplicaria.
   *
   * A mesma pergunta é feita pelo `create-checkout-session` antes de mandar o
   * cupom. Os dois usam a regra de `ofertaEstaValida`, e é isso que impede a
   * tela de prometer o que a cobrança não cumpre.
   */
  const ofertaAtiva = ofertaEstaValida(company?.trial_ends_at);

  /** Preço com desconto quando a oferta vale; o cheio quando não vale. */
  const precoDaOferta = (precoCheio: string) =>
    ofertaAtiva ? comDesconto(precoCheio) : precoCheio;

  /**
   * Os passos do balão que fazem sentido agora. O da oferta some fora da janela:
   * apresentar um desconto que não existe mais é pior do que não apresentar
   * nada.
   */
  const passosDoTour = PASSOS_DO_TOUR.filter(p => ofertaAtiva || p.ancora !== "selo");

  useEffect(() => {
    // Sem a empresa não dá para decidir: a chave do `localStorage` leva o id
    // dela. Sai do efeito SEM decidir, e a tela segue esperando.
    if (companyLoading) return;
    // `localStorage` e não coluna no banco: a informação é "esta pessoa já viu
    // isto neste navegador", não um fato da empresa. Se um dia importar saber
    // QUEM viu, aí sim vira coluna.
    const jaViu = !!company?.id && !!localStorage.getItem(chaveDoTour(company.id));
    // Todo caminho decide alguma coisa, inclusive os de falha. Um `return` mudo
    // aqui deixaria a tela presa no carregamento para sempre.
    setPassoDoTour(!company?.id || jaViu || passosDoTour.length === 0 ? null : 0);
    // `passosDoTour.length` entra porque a quantidade de passos depende de a
    // oferta estar valendo, e isso muda com a empresa. Vai o número, e não a
    // lista: a lista é recriada a cada render e reexecutaria o efeito à toa.
  }, [companyLoading, company?.id, passosDoTour.length]);

  const avancarTour = () => {
    setPassoDoTour(atual => {
      if (typeof atual !== "number") return atual;
      const proximo = atual + 1;
      if (proximo < passosDoTour.length) return proximo;
      if (company?.id) localStorage.setItem(chaveDoTour(company.id), "1");
      return null;
    });
  };

  /**
   * Volta um passo. Não tem o par do `avancarTour`, que marca a sequência como
   * vista ao terminar: voltar nunca conclui nada, então não escreve no
   * `localStorage`.
   */
  const voltarTour = () =>
    setPassoDoTour(atual => (typeof atual === "number" && atual > 0 ? atual - 1 : atual));

  const passoAtual = typeof passoDoTour === "number" ? passosDoTour[passoDoTour] : null;

  /**
   * Desfoque de tour para um pedaço da tela, com uma exceção: o que o balão do
   * momento aponta continua nítido.
   *
   * A exceção não é só estética. O balão nasce DENTRO do elemento que aponta,
   * para se posicionar em relação a ele -- e `filter` desfoca todos os filhos,
   * então desfocar o alvo desfocaria o próprio balão junto.
   */
  const desfoqueDoTour = (ehOAlvo: boolean) =>
    passoAtual && !ehOAlvo ? `blur(${DESFOQUE_DO_TOUR}px)` : undefined;

  /** Classe da transição da revelação, usada em todo bloco que desfoca. */
  const REVELACAO = "motion-safe:transition-[filter] motion-safe:duration-500";

  /** Qual cartão está sob o mouse, para acender a borda dele. */
  const [planoSobMouse, setPlanoSobMouse] = useState<string | null>(null);


  const handleSelectPlan = (planKey: PlanKey) => {
    setConfirmPlan(planKey);
    // O mensal não passa pela escolha: já é uma cobrança por mês.
    setFormaDePagamento(billingTab === "mensal" ? "avista" : null);
  };

  const fecharConfirmacao = () => {
    setConfirmPlan(null);
    setFormaDePagamento(null);
  };

  /**
   * Checkout parcelado, pela Ticto. Ainda não existe.
   *
   * Fica como função própria, e vazia, de propósito: o lugar da integração é
   * este, e o `TICTO_DISPONIVEL` acima é o interruptor. Sem isso, a integração
   * futura teria que caçar onde entrar no meio do fluxo do Stripe.
   */
  const abrirCheckoutTicto = () => {
    toast.info("Pagamento parcelado estará disponível em breve.");
  };

  const handleConfirmPlan = async () => {
    if (!user || !company || !confirmPlan) return;

    // Parcelado é outro provedor, outro checkout. Sai antes de tocar no Stripe.
    if (formaDePagamento === "parcelado") {
      abrirCheckoutTicto();
      return;
    }

    setConfirming(true);

    const priceId = STRIPE_PRICES[confirmPlan][BILLING_TAB_TO_PERIOD[billingTab]];
    pixelTrack("InitiateCheckout", { content_name: confirmPlan, content_category: "subscription" });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          priceId,
          companyId:     company.id,
          userId:        user.id,
          userEmail:     user.email ?? "",
          planName:      confirmPlan,
          billingPeriod: BILLING_TAB_TO_PERIOD[billingTab],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Erro ao criar sessão de pagamento.");
      window.open(data.url, "_blank");
      fecharConfirmacao();
      setPlanConfirmed(true);
      setSuccessOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar checkout.");
    } finally {
      setConfirming(false);
    }
  };

  const { title, subtitle } = STEP_META[0];

  const getPlanPrice = (plan: PlanDefinition) => {
    if (billingTab === "mensal")    return plan.pricing.mensal;
    if (billingTab === "semestral") return plan.pricing.semestral;
    return plan.pricing.anual;
  };

  /**
   * Quanto a promoção tira do que se paga no ciclo escolhido.
   *
   * Antes esta pílula mostrava a economia do PERÍODO (quanto o anual poupa em
   * relação a pagar mensal). Aquela conta estava certa, mas não existe no
   * mensal: escolher mensal economiza zero em relação a mensal, e por isso o
   * cartão ficava sem pílula naquela aba.
   *
   * Medindo a promoção, os três períodos têm o que mostrar e a pílula significa
   * a mesma coisa em todos. E não duplica informação: a vantagem de escolher um
   * período mais longo já está nos selos -15% e -30% do seletor logo acima.
   *
   * O valor é sempre sobre o ciclo que a pessoa vai pagar -- um mês no mensal,
   * seis no semestral, doze no anual -- que é o mesmo ciclo do "De X por Y" na
   * linha abaixo do preço.
   */
  const getPlanSave = (plan: PlanDefinition) => {
    if (!ofertaAtiva || DESCONTO <= 0) return null;
    const cicloCheio = billingTab === "mensal"
      ? plan.pricing.mensal
      : SETUP_PLAN_TOTALS[plan.key]?.[billingTab as "semestral" | "anual"];
    if (!cicloCheio) return null;
    return emReais(emNumero(cicloCheio) * DESCONTO);
  };

  /**
   * Nada é pintado antes de a tela inteira ter o que mostrar.
   *
   * Sem este portão a montagem acontecia em três tempos, e a pessoa via cada um
   * deles: o fundo do CRM, depois o cartão com os três planos nítidos, e só
   * então o desfoque com o balão por cima. Rápido, mas visível -- e nesses
   * milésimos ela já tinha lido os preços que o passo a passo existe para
   * apresentar depois.
   *
   * Espera por ESTADO, e não por tempo. Um `setTimeout` mais longo seria um
   * chute contra uma latência que varia: curto demais e a montagem em três
   * tempos volta na conexão ruim, longo demais e todo mundo espera à toa.
   *
   * Segura também o desvio de quem já assinou, logo acima, que tinha o mesmo
   * defeito: a pessoa via o cartão de planos aparecer antes de ser mandada para
   * o painel.
   */
  if (companyLoading || passoDoTour === undefined) {
    return <TelaPreparandoConta progresso={100} />;
  }

  return (
    <>
      {/* A conta já existe aqui, então o fundo é o CRM de verdade dela, e não
          a réplica que o cadastro usa. Ver FundoDoCrmAoVivo. */}
      <div className="relative min-h-screen overflow-y-auto flex items-center justify-center px-4 py-10" style={{ background: "hsl(var(--background))" }}>
        <FundoDoCrmAoVivo />
        {/* 980 × 650. Altura FIXA, então o card não cresce com o conteúdo: cada
            linha nova nos planos precisa caber nos 594px úteis que sobram
            depois do respiro interno, ou some. Se um dia apertar de novo, o
            conserto duradouro é trocar por `minHeight` e deixar o card se
            ajustar sozinho. */}
        {/* O brilho mora AQUI, e não no card preto lá dentro.
            Este invólucro tem `overflow-hidden` para recortar o gradiente que
            gira, e esse recorte apara também a sombra de qualquer filho -- a
            box-shadow do card interno era removida inteira antes de aparecer.
            Na caixa de fora nada a recorta.

            Mesma cor da linha da borda, o #00E599 do botão, na opacidade que o
            site usa nos elementos primários. */}
          {/* Caixa que reserva o espaço do cartão JÁ reduzido.

              `transform: scale` encolhe o desenho mas não o espaço que ele
              ocupa: sozinho, o cartão continuaria empurrando 980x652 de layout,
              e a página ganharia barra de rolagem por causa de um vazio. Esta
              caixa existe só para contar ao layout o tamanho de verdade. */}
          <div style={{ width: LARGURA_DO_CARD * escala, height: ALTURA_DO_CARD * escala }}>
            <div
              className="relative rounded-[16px] p-[1px] overflow-hidden"
              style={{
                width: LARGURA_DO_CARD,
                height: ALTURA_DO_CARD,
                transform: `scale(${escala})`,
                transformOrigin: "top left",
                boxShadow: BRILHO_DO_CARTAO,
              }}
            >
            {/* Rotating border light */}
            <div
              className="absolute inset-[-100%]"
              style={{
                background: "conic-gradient(from 0deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
                animation: "spin-border 4s linear infinite",
              }}
            />

            <div
              className="relative w-full rounded-[15px] overflow-hidden flex"
              style={{
                height: 650,
                background: SITE.fundo,
                // Linha no mesmo #00E599 do botão "7 Dias grátis". O brilho
                // dela sai para os dois lados: para FORA fica no invólucro (aqui
                // ele seria recortado pelo `overflow-hidden` de lá), e para
                // DENTRO fica neste `inset`, que a moldura projeta sobre o preto.
                //
                // O `inset` sobrevive ao `overflow-hidden` deste elemento porque
                // sombra interna é pintada dentro da própria caixa, não fora
                // dela. Ela fica atrás dos cartões de plano e só aparece nas
                // margens, que é onde a moldura precisa parecer acesa.
                //
                // O invólucro tem 15+1 de raio para acompanhar este: raios iguais
                // nos dois deixariam o gradiente aparecendo em excesso nos
                // cantos, onde a curva de fora é mais fechada que a de dentro.
                border: `1px solid ${SITE.verde}`,
                boxShadow: `inset 0 0 50px ${SITE.brilhoVerde}`,
              }}
            >
              {/* Véu do passo a passo: escurece o card e deixa só o elemento
                  apontado aceso, que é o que faz o balão parecer estar mostrando
                  algo em vez de apenas flutuando por cima.

                  `absolute` dentro do card e não `fixed` na tela: o fundo do CRM
                  atrás já está desfocado e com véu próprio, e escurecer tudo de
                  novo apagaria a sensação de que a conta existe ali atrás.

                  O véu NÃO fecha ao clique. Ele barra os cliques no card atrás,
                  mas quem avança é o botão do balão -- clicar fora sumia com o
                  passo por acidente, e a pessoa perdia a informação sem ter lido.
                  A saída deliberada continua no X do balão. */}
              {passoAtual && (
                <div
                  className="absolute inset-0 z-40"
                  style={{ background: "rgba(0,0,0,0.30)" }}
                />
              )}

              {/* O balão da oferta fica no centro do cartão, e não colado no
                  selo como o do teste fica no botão.

                  É o que a peça pede: o passo 1 aponta uma saída, e balão junto
                  do botão é o que amarra os dois; o passo 2 não aponta coisa
                  nenhuma, ele apresenta. Centralizado, ele lê como recado da
                  tela inteira.

                  Fora do selo também no DOM, e isso destrava o que antes era
                  obrigatório: enquanto o balão era filho dele, desfocar o selo
                  desfocaria o balão junto, porque `filter` pega os filhos.
                  Agora a nitidez do selo é escolha, não imposição -- e continua
                  escolhida, pelo motivo anotado em PASSOS_DO_TOUR.

                  `pointer-events-none` na moldura que ocupa o cartão inteiro e
                  `auto` só no balão: sem isso a moldura viraria uma tampa
                  invisível sobre tudo. */}
              {passoAtual?.ancora === "selo" && typeof passoDoTour === "number" && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                {/* Sobe 35px do centro exato. Por `transform`, e não por
                    margem: margem entraria na conta do `items-center` e o
                    deslocamento sairia pela metade, além de mudar o espaço que
                    o balão ocupa. Aqui ele só é desenhado mais acima. */}
                <div className="pointer-events-auto" style={{ transform: "translateY(-35px)" }}>
                    <BalaoDoTour
                      passo={passoDoTour + 1}
                      total={passosDoTour.length}
                      titulo={passoAtual.titulo}
                      rotulo={passoAtual.rotulo}
                      texto={passoAtual.texto}
                      aoAvancar={avancarTour}
                      aoVoltar={passoDoTour > 0 ? voltarTour : undefined}
                      folga={20}
                      folgaDoTexto={10}
                      respiroSuperior={24}
                      espacoAteOFilete={17}
                    />
                  </div>
                </div>
              )}

              {/* ── Right content ── */}
              <div className="flex-1 flex flex-col px-10 pt-8 pb-6 min-w-0">
                {/* Título à esquerda e a saída à direita, na mesma linha.
                    O botão estava no rodapé, depois dos três planos, onde ele
                    competia com os "Escolher plano" -- quatro botões seguidos, e
                    o único que NÃO leva ao pagamento era o último. Aqui em cima
                    ele fica claramente fora da comparação, que é o que ele é: a
                    saída de quem prefere olhar o produto antes de decidir.

                    Sem contador de etapas nem barra de progresso: com uma etapa,
                    um diria "1/1" e a outra estaria sempre cheia. */}
                <div className="flex items-center gap-3 mb-1">
                  {/* Envolve o selo para o balão poder nascer colado nele.
                      `z-50` só no passo dele: fora disso o elemento não precisa
                      subir de camada, e subir sem motivo cria empilhamento que
                      atrapalha o resto da tela.

                      `pointer-events-none` junto com o `z-50`: subir de camada
                      tira o elemento de baixo do véu, e com ele o bloqueio de
                      cliques que o véu faz. Sem isto, o destaque acabaria
                      LIBERANDO o que devia estar travado. O balão volta a
                      receber cliques por conta própria, logo abaixo. */}
                  {/* Selo e frase somem juntos fora da janela da oferta. É a
                      mesma peça: o cupom diz O QUE é, a linha ao lado diz por
                      quanto tempo. Um sem o outro anunciaria uma promoção sem
                      prazo, ou um prazo sem promoção. */}
                  {ofertaAtiva && (
                    <div
                      className={cn("relative", REVELACAO)}
                      style={{ filter: desfoqueDoTour(false) }}
                    >
                      <SeloDaOferta texto={title} />
                    </div>
                  )}

                  {/* Ao lado do selo, e não dentro dele: o selo diz O QUE é a
                      oferta, esta linha diz POR QUANTO TEMPO. Duas frases dentro
                      do mesmo cupom tirariam dele a cara de etiqueta.

                      Branco, e não o cinza dos textos de apoio, porque é
                      argumento de venda e não observação de rodapé.

                      `truncate` com `min-w-0`: numa janela estreita esta frase
                      encolhe primeiro, preservando o selo e o botão, que são os
                      dois elementos com função. */}
                  {/* Acompanha o selo no desfoque, e não a linha inteira: as
                      duas frases são um bloco só de argumento, e nítida ao lado
                      de um selo borrado esta linha viraria a única coisa legível
                      da tela -- justamente a menos importante das duas. */}
                  {ofertaAtiva && (
                    <p
                      className={cn("text-[12px] min-w-0 truncate", REVELACAO)}
                      style={{ color: SITE.texto, filter: desfoqueDoTour(false) }}
                    >
                      Oferta válida por somente 7 dias.
                    </p>
                  )}

                  <div
                    className={cn(
                      "relative shrink-0 ml-auto",
                      REVELACAO,
                      passoAtual?.ancora === "teste" && "z-50 pointer-events-none"
                    )}
                    style={{ filter: desfoqueDoTour(passoAtual?.ancora === "teste") }}
                  >
                    <button
                      type="button"
                      onClick={() => navigate("/dashboard")}
                      // `rounded-[7px]`: o mesmo raio do selo da oferta do outro lado da
                      // linha. Os dois são os blocos verdes do topo, e cantos
                      // diferentes faziam parecer que vieram de telas diferentes.
                      // Pulsa só no passo DELE. A regra da tela inteira é que o
                      // movimento fica onde está a pergunta do momento: no
                      // passo 1 a pergunta é este botão, no passo 2 passa para
                      // o selo dentro do balão, e no fim vai para os três
                      // botões de plano. Nunca em dois lugares ao mesmo tempo.
                      //
                      // A pulsação e o `hover:-translate-y` se excluem porque
                      // disputam o mesmo `transform`: com as duas, uma anula a
                      // outra e o botão fica travado no meio do caminho.
                      className={cn(
                        "brilho-botao-verde h-auto py-[10px] px-4 rounded-[7px] text-[13px] font-semibold transition-all",
                        passoAtual?.ancora === "teste" ? "pulso-botao" : "hover:-translate-y-[2px]"
                      )}
                      style={{ background: SITE.verde, color: SITE.sobreVerde }}
                    >
                      {planConfirmed ? "Acessar" : "Começar 7 dias grátis"}
                    </button>
                    {/* Diagonal inferior esquerda do botão: `right-full` encosta a
                        direita do balão na esquerda do botão, `top-full` põe o topo
                        dele na base do botão. É a proximidade que faz a ligação
                        entre os dois -- não há bico apontando. */}
                    {passoAtual?.ancora === "teste" && typeof passoDoTour === "number" && (
                      <div className="absolute right-full top-full mr-2 mt-2 pointer-events-auto">
                        <BalaoDoTour
                          passo={passoDoTour + 1}
                          total={passosDoTour.length}
                          titulo={passoAtual.titulo}
                          rotulo={passoAtual.rotulo}
                          texto={passoAtual.texto}
                          aoAvancar={avancarTour}
                          aoVoltar={passoDoTour > 0 ? voltarTour : undefined}
                        />
                      </div>
                    )}
                  </div>
                </div>


                {/* ── Planos ── */}
                {(
                  // A saída do desfoque é a revelação, então ela é animada e não
                  // seca. `motion-safe` porque quem pediu menos movimento no
                  // sistema recebe o corte direto, sem transição.
                  //
                  // O desfoque para AQUI, e não sobe para o cartão inteiro, por
                  // causa da linha de cima: o selo e o botão são os dois alvos
                  // que os balões destacam, e destaque em cima de borrão não
                  // destaca nada.
                  <div className={cn("mt-1", REVELACAO)} style={{ filter: desfoqueDoTour(false) }}>
                    {/* Billing tabs */}
                    {/* Seletor idêntico ao `.price-toggle` do site: 300px de
                        largura, cantos de 100px, fundo #131A1E, borda verde a
                        20%, botões de 14px em `flex: 1`. A ordem também é a de
                        lá, Mensal primeiro.

                        Sem o selo de desconto que o site tem ao lado de cada
                        período: lá ele mostra -15% e -30%, o desconto do período,
                        e aqui a promoção de 50% valia para os três, o que deixava
                        os três selos iguais e sem função.

                        O único desvio é o espaço abaixo: no site são 56px, que
                        ali separam o seletor do resto da página. Dentro de um
                        card de 650px isso custaria altura demais, então ficou em
                        24px. */}
                    <div
                      className="flex items-center mx-auto mb-6"
                      style={{
                        width: LARGURA_DO_SELETOR,
                        gap: esc(3),
                        padding: esc(4),
                        borderRadius: 100,
                        background: SITE.superficie2,
                        border: `1px solid ${SITE.bordaSuave}`,
                      }}
                    >
                      {(["mensal", "semestral", "anual"] as BillingTab[]).map((tab) => {
                        const ativa = billingTab === tab;
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setBillingTab(tab)}
                            className="flex flex-1 items-center justify-center capitalize transition-all"
                            style={{
                              fontSize: FONTE_DO_BOTAO,
                              fontWeight: ativa ? 600 : 500,
                              padding: `${PADDING_VERTICAL_DO_BOTAO}px ${esc(9)}px`,
                              gap: esc(4),
                              borderRadius: 100,
                              background: ativa ? SITE.verde : undefined,
                              color: ativa ? SITE.sobreVerde : SITE.textoSuave,
                            }}
                          >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                          </button>
                        );
                      })}
                    </div>

                    {/* Cartões no visual do site (rezult-site/planos.html):
                        fundo escuro, borda clara, preço grande e lista com o
                        visto verde. O que NÃO veio do site é o destino do clique
                        -- lá o botão manda para /register, aqui ele abre a
                        confirmação e o checkout da conta que já existe. Os
                        valores continuam saindo de PLANS e SETUP_PLAN_TOTALS,
                        que são os do app. */}
                    <div className="grid grid-cols-3 gap-3 pt-4">
                      {PLANS.map((plan) => {
                        const save = getPlanSave(plan);
                        const destaque = !!plan.badge;
                        return (
                          <div
                            key={plan.key}
                            // O hover é o do site (`.pcard:hover`): sobe 4px e a
                            // borda acende em verde. Vem por estado e não por
                            // classe porque a borda mora no `style` -- uma classe
                            // `hover:border-*` do Tailwind não venceria o inline.
                            onMouseEnter={() => setPlanoSobMouse(plan.key)}
                            onMouseLeave={() => setPlanoSobMouse(null)}
                            className="relative flex flex-col rounded-[16px] p-5 transition-all duration-200"
                            style={{
                              background: destaque
                                ? `linear-gradient(180deg, ${SITE.brilhoSuave}, ${SITE.superficie} 40%)`
                                : SITE.superficie,
                              border: `1px solid ${destaque || planoSobMouse === plan.key ? SITE.bordaAtiva : SITE.borda}`,
                              boxShadow: destaque
                                ? `0 30px 70px rgba(0,0,0,0.4), 0 0 60px ${SITE.brilhoSuave}`
                                : undefined,
                              transform: planoSobMouse === plan.key ? "translateY(-4px)" : undefined,
                            }}
                          >
                            {destaque && (
                              <span
                                className="absolute -top-[11px] left-1/2 -translate-x-1/2 text-[11px] font-semibold px-3 py-[4px] rounded-full whitespace-nowrap"
                                style={{ background: SITE.verde, color: SITE.sobreVerde, letterSpacing: "0.04em" }}
                              >
                                {plan.badge}
                              </span>
                            )}

                            <div className="flex items-center gap-1.5 min-w-0">
                              <h3 className="text-[20px] font-semibold shrink-0" style={{ color: SITE.texto, letterSpacing: "-0.02em" }}>
                                {plan.name}
                              </h3>
                              {save && (
                                <span
                                  className="inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5 truncate"
                                  style={{ background: SITE.brilhoSuave, color: SITE.verde }}
                                >
                                  <span className="truncate">Economize {save}</span>
                                </span>
                              )}
                            </div>

                            {/* 2px, e não os 12 de `mt-3` que havia aqui. O nome
                                do plano e o preço são a mesma informação dita em
                                duas linhas, então colam. O respiro grande fica
                                embaixo (`mb-4`), separando o preço do botão, que
                                é onde a divisão realmente existe. */}
                            <div className="mt-[2px] mb-4">
                              {/* O preço cheio, acima do promocional. Só aparece
                                  quando há desconto: com DESCONTO em 0 ele
                                  mostraria o mesmo valor duas vezes.

                                  Margem NEGATIVA: eram 2px de `mb-0.5`, e tirar
                                  5px daí exige puxar 3px para dentro. A folga que
                                  sobra vem da caixa de linha do texto de 16px, que
                                  carrega 4px invisíveis abaixo das letras -- é
                                  nela que a margem negativa come, sem encostar uma
                                  linha na outra. */}
                              {ofertaAtiva && DESCONTO > 0 && (
                                <p className="text-[16px] font-medium -mb-[3px]" style={{ color: SITE.vermelho }}>
                                  de {getPlanPrice(plan)}
                                </p>
                              )}
                              <div className="flex items-baseline gap-1 flex-wrap">
                                {/* "de X" na linha de cima e "por Y" aqui: as duas
                                    formam uma frase só, quebrada em duas linhas
                                    para o valor novo poder ser grande. */}
                                {ofertaAtiva && DESCONTO > 0 && (
                                  <span className="text-[13px]" style={{ color: SITE.textoFraco }}>por</span>
                                )}
                                <span className="text-[26px] font-semibold" style={{ color: SITE.texto, letterSpacing: "-0.04em" }}>
                                  {precoDaOferta(getPlanPrice(plan))}
                                </span>
                                <span className="text-[13px]" style={{ color: SITE.textoFraco }}>/mês</span>
                                {/* 9px e preenchimento estreito para caber na mesma
                                    linha do preço em qualquer período: "Semestral"
                                    ao lado de "R$ 317,50" é a combinação mais
                                    larga do card. O `flex-wrap` do contêiner fica
                                    como rede de segurança -- se em algum zoom não
                                    couber, ela desce em vez de ser cortada. */}
                                <span
                                  className="text-[9px] font-semibold px-1.5 py-[3px] rounded-full ml-auto capitalize shrink-0"
                                  style={{ background: SITE.brilhoSuave, color: SITE.verde, letterSpacing: "0.02em" }}
                                >
                                  {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}
                                </span>
                              </div>
                              {/* O preço acima é sempre por mês, inclusive no
                                  semestral e no anual. Sem esta linha, quem
                                  escolhe anual vê "R$ 166/mês" e pode entrar no
                                  checkout esperando ser cobrado de 166 em 166. */}
                              {/* Tudo no mesmo cinza: o vermelho e o verde que
                                  havia aqui repetiam o destaque que o "de X / por
                                  Y" logo acima já faz em tamanho grande. Duas
                                  linhas gritando a mesma coisa cancelavam uma à
                                  outra. O risco fica, porque separa o valor
                                  antigo do novo sem precisar de cor. */}
                              {(() => {
                                const total = billingTab !== "mensal"
                                  ? SETUP_PLAN_TOTALS[plan.key]?.[billingTab as "semestral" | "anual"]
                                  : null;
                                return (
                                  <div className="flex items-center gap-2 mt-1 min-w-0">
                                    {/* O cupom da Stripe é de duração `once`:
                                        desconta a PRIMEIRA fatura e só ela.
                                        Como a fatura do semestral cobre seis
                                        meses e a do anual cobre doze, nesses
                                        dois o ciclo inteiro mostrado ali sai
                                        pela metade, e a linha do total já conta
                                        essa história certa.

                                        No mensal a fatura é de um mês, então
                                        "R$ 118,50/mês" lá em cima vale só para
                                        a primeira. Sem esta ressalva, a segunda
                                        cobrança chega ao dobro e a pessoa se
                                        sente enganada -- no exato momento em
                                        que ela decide se fica. */}
                                    <p className="text-[11px] min-w-0 truncate" style={{ color: SITE.textoFraco }}>
                                      {total
                                        ? (ofertaAtiva
                                            ? <>de <s>{total}</s> por {comDesconto(total)}</>
                                            : <>Total de {total} por ciclo</>)
                                        : (ofertaAtiva
                                            ? "Desconto na 1ª mensalidade. Depois, cobrança recorrente."
                                            : "Cobrança mensal recorrente")}
                                    </p>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Botão acima da lista, como no site: quem já decidiu
                                não precisa varrer oito linhas para chegar nele.

                                O rótulo carrega o período ("Escolher plano
                                Anual") porque é a última coisa lida antes de o
                                card sumir e a confirmação abrir -- é a chance de
                                a pessoa notar que estava na aba errada. Qual
                                plano é, o título do cartão logo acima já diz. */}
                            {/* Os três pulsam juntos, no mesmo ritmo e em fase:
                                como a animação sai de uma declaração só, os três
                                começam no mesmo instante e sobem e descem
                                alinhados. Fora de fase eles pareceriam três
                                coisas separadas piscando. A animação mora numa
                                classe (`.pulso-botao`) justamente por isso: em
                                `style` de linha, o React a reescreve a cada
                                renderização e os irmãos saem de compasso.

                                Sem `hover:-translate-y`: a animação já é dona do
                                `transform`, e as duas juntas fariam uma cancelar
                                a outra. Reaproveita a `banner-btn-attention` do
                                aviso de plano grátis e do cadastro, que já
                                respeita `prefers-reduced-motion` no index.css. */}
                            <button
                              type="button"
                              onClick={() => handleSelectPlan(plan.key as PlanKey)}
                              // A pulsação só liga quando a sequência acaba. Ela
                            // existe para puxar o olho para a escolha do plano,
                            // e enquanto o balão está no ar a escolha ainda não
                            // é a pergunta -- três botões pulsando atrás de um
                            // texto disputam com ele em vez de esperar a vez.
                            //
                            // Os três alternam no mesmo render, então continuam
                            // entrando em compasso quando a animação começa.
                            className={cn(
                              "w-full rounded-[12px] py-[9px] text-[13px] font-semibold",
                              !passoAtual && "pulso-botao"
                            )}
                              style={destaque
                                ? { background: SITE.verde, color: SITE.sobreVerde, boxShadow: `0 8px 30px ${SITE.brilhoSuave}` }
                                : { background: SITE.superficie2, color: SITE.texto, border: `1px solid ${SITE.borda}` }}
                            >
                              Escolher plano {billingTab.charAt(0).toUpperCase() + billingTab.slice(1)}
                            </button>

                            <ul className="flex flex-col gap-[9px] mt-4">
                              {(SETUP_PLAN_FEATURES[plan.key] ?? []).map((recurso) => (
                                // O item em destaque é um ponto maior que os
                                // demais. Sai do mesmo `brilho` que já lhe dá a
                                // cor animada, então tamanho e efeito não podem
                                // se separar por engano: o item destacado é
                                // destacado nas duas coisas ou em nenhuma.
                                <li
                                  key={`${recurso.forte ?? ""}${recurso.resto ?? ""}`}
                                  className={cn(
                                    "flex items-start gap-2 leading-[1.45]",
                                    recurso.brilho ? "text-[15px]" : "text-[12px]"
                                  )}
                                  style={{ color: SITE.textoSuave }}
                                >
                                  <Check size={14} strokeWidth={2.5} className="mt-[1px] shrink-0" style={{ color: SITE.verde }} />
                                  <span>
                                    {recurso.forte && (
                                      <b
                                        className={recurso.brilho ? "texto-brilho" : undefined}
                                        style={{ fontWeight: 600, color: recurso.brilho ? undefined : SITE.texto }}
                                      >
                                        {recurso.forte}
                                      </b>
                                    )}
                                    {recurso.forte && recurso.resto ? " " : ""}
                                    {recurso.resto}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmação da escolha de plano ──

          Duas telas dentro do MESMO diálogo, decididas por `formaDePagamento`:
          nula, aparece a escolha de como pagar; preenchida, aparece o resumo.
          Duas janelas separadas fariam uma fechar e outra abrir no meio de uma
          decisão de compra, e cada troca dessas é uma chance de desistir. */}
      <Dialog open={!!confirmPlan} onOpenChange={v => { if (!v) fecharConfirmacao(); }}>
        <DialogContent className="max-w-[400px] rounded-[7px] bg-white">
          {confirmPlan && (() => {
            const plan = PLANS.find(p => p.key === confirmPlan)!;
            // Com desconto, como no cartão: se o diálogo mostrasse o preço
            // cheio, a pessoa veria um valor no card e outro maior no passo
            // seguinte, e desistiria achando que foi enganada.
            const price = precoDaOferta(getPlanPrice(plan));
            const totalCheio = billingTab !== "mensal"
              ? SETUP_PLAN_TOTALS[confirmPlan]?.[billingTab as "semestral" | "anual"]
              : null;
            const total = totalCheio ? precoDaOferta(totalCheio) : null;
            const periodo = billingTab.charAt(0).toUpperCase() + billingTab.slice(1);

            // ── Passo 1: como pagar (só semestral e anual) ──
            if (formaDePagamento === null) {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-[16px]">Como você prefere pagar?</DialogTitle>
                  </DialogHeader>
                  <p className="text-[13px] text-muted-foreground">
                    {plan.name} — {periodo}, total de{" "}
                    <span className="font-semibold text-foreground">{total}</span>.
                  </p>
                  <div className="flex flex-col gap-2 pt-1">
                    {/* Sem cor diferente entre as duas: aqui não existe opção
                        errada, só caminhos diferentes para a mesma compra, e
                        destacar uma empurraria a escolha em vez de deixá-la ser
                        feita. */}
                    <button
                      type="button"
                      onClick={() => setFormaDePagamento("avista")}
                      className="text-left rounded-[5px] border border-gray-200 px-4 py-3 transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <p className="text-[13px] font-semibold text-foreground">À vista</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Uma cobrança única de {total}, no cartão ou Pix.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormaDePagamento("parcelado")}
                      className="text-left rounded-[5px] border border-gray-200 px-4 py-3 transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <p className="text-[13px] font-semibold text-foreground">Parcelado</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Divida o valor em parcelas no cartão de crédito.
                      </p>
                    </button>
                  </div>
                  <div className="pt-2">
                    <Button variant="outline" onClick={fecharConfirmacao} className="w-full rounded-[5px]">
                      Cancelar
                    </Button>
                  </div>
                </>
              );
            }

            // ── Passo 2: resumo e saída para o checkout ──
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-[16px]">Confirmar seleção de plano</DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-3">
                  <div className="flex items-center justify-between py-3 border-y border-gray-100">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{plan.name} — {periodo}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {price}/mês
                        {billingTab !== "mensal" && (formaDePagamento === "avista" ? " · à vista" : " · parcelado")}
                      </p>
                    </div>
                    {total && (
                      <p className="text-[12px] text-muted-foreground">
                        Total: <span className="font-semibold text-foreground">{total}</span>
                      </p>
                    )}
                  </div>
                  {/* A segunda frase é a contrapartida do desconto: a
                      assinatura não tem mais período grátis, então quem contrata
                      no primeiro dia troca o que sobrava de teste pelos 50%. Sem
                      dizer isso aqui, a pessoa é cobrada achando que o teste
                      continuava correndo. */}
                  <p className="text-[12px] text-muted-foreground">
                    O checkout será aberto em uma nova aba para concluir o pagamento.
                    A cobrança acontece agora e o seu teste grátis se encerra.
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  {/* Voltar, e não Cancelar, quando houve uma escolha antes:
                      quem errou a forma de pagamento quer trocá-la, não sair. */}
                  <Button
                    variant="outline"
                    onClick={() => (billingTab === "mensal" ? fecharConfirmacao() : setFormaDePagamento(null))}
                    className="flex-1 rounded-[5px]"
                  >
                    {billingTab === "mensal" ? "Cancelar" : "Voltar"}
                  </Button>
                  <Button onClick={handleConfirmPlan} disabled={confirming} className="flex-1 rounded-[5px]">
                    {confirming ? "Aguarde..." : "Confirmar"}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Success dialog ── */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-[400px] rounded-[7px] bg-white text-center">
          <div className="flex flex-col items-center py-4 gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CircleCheck size={36} className="fill-primary stroke-white" />
            </div>
            <div>
              <h2 className="text-[18px] font-bold text-foreground">Parabéns!</h2>
              <p className="text-[15px] text-foreground mt-1 leading-snug" style={{ fontWeight: 500 }}>
                Seu plano foi selecionado com sucesso.
              </p>
              <p className="text-[13px] text-muted-foreground mt-2 leading-snug">
                Após finalizar o pagamento clique em "Concluir", aguarde alguns segundos e atualize a página para conferir as alterações.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
