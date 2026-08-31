import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useProfile } from "@/context/ProfileContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FundoDoCrm } from "@/components/FundoDoCrm";
import { TelaPreparandoConta } from "@/components/TelaPreparandoConta";
import {
  Check,
  ChevronRight,
  ChevronDown,
  ShoppingCart,
  BookOpen,
  Store,
  HeartPulse,
  Scale,
  Megaphone,
  MoreHorizontal,
} from "lucide-react";

const DDI_OPTIONS = [
  { code: "+55", flag: "🇧🇷", short: "BR" },
  { code: "+1",  flag: "🇺🇸", short: "EUA" },
  { code: "+351",flag: "🇵🇹", short: "PT" },
  { code: "+44", flag: "🇬🇧", short: "UK" },
  { code: "+54", flag: "🇦🇷", short: "AR" },
  { code: "+52", flag: "🇲🇽", short: "MX" },
  { code: "+57", flag: "🇨🇴", short: "CO" },
  { code: "+56", flag: "🇨🇱", short: "CL" },
  { code: "+49", flag: "🇩🇪", short: "DE" },
  { code: "+33", flag: "🇫🇷", short: "FR" },
  { code: "+34", flag: "🇪🇸", short: "ES" },
];

/**
 * Cargos oferecidos na etapa "Sobre você".
 *
 * Vai para `profiles.job_title`, que NÃO é `profiles.role`: aquele é permissão
 * dentro do CRM e vale 'admin' em todo mundo hoje. Este é o que a pessoa faz na
 * empresa dela, e não muda acesso nenhum.
 */
const CARGOS = ["Proprietário", "Gerente", "Funcionário", "Estudante, freelancer ou estagiário"];

/**
 * A resposta de "Você já usa um CRM?" que abre o campo "Qual?".
 *
 * Declarada ANTES da lista e usada dentro dela, em vez de apontada por índice
 * (`EXPERIENCIAS_COM_CRM[2]`, como já esteve): reordenar as opções passou a ser
 * seguro. Com o índice, mudar a ordem fazia o campo condicional deixar de
 * aparecer sem erro nenhum surgir -- só alguém abrindo a tela perceberia.
 */
const CRM_JA_USADO = "Sim, já uso um CRM";

/**
 * Respostas para "Você já usa um CRM?".
 *
 * "Uso planilhas e outros" não é um sim nem um não: a pessoa já organiza o
 * processo dela, mas nunca viu funil nem automação. É o grupo mais comum entre
 * quem chega, e o que mais muda o tipo de introdução que deveria receber.
 *
 * Vão para `profiles.crm_experience` exatamente como estão escritas aqui.
 */
const EXPERIENCIAS_COM_CRM = [
  CRM_JA_USADO,
  "Não, nunca usei um CRM",
  "Uso planilhas e outros",
];

/**
 * Quantas pessoas da empresa vão usar o Rezult, na etapa 1.
 *
 * Não é o tamanho da empresa: uma de cinquenta pessoas pode ter cinco no
 * comercial, e são essas cinco que interessam. A coluna no banco se chama
 * `expected_users` justamente para essa diferença não se perder.
 *
 * Faixa, e não número exato, porque é o que a pessoa sabe responder sem parar
 * para contar, e porque quem responde 3 hoje vira 5 no mês seguinte.
 *
 * Os valores vão para o banco exatamente como estão escritos aqui. Mexer num
 * rótulo depois cria uma faixa nova convivendo com a antiga nas linhas velhas,
 * então, se um dia mudar, tem que vir com um UPDATE junto.
 */
const FAIXAS_DE_USUARIOS = ["1", "2-5", "6-15", "16-50", "Mais de 51"];

/**
 * Opções de "Quais resultados você busca alcançar com o Rezult?".
 *
 * Múltipla escolha: quem quer vender mais quase sempre também quer organizar a
 * operação, e obrigar a marcar uma só devolveria uma resposta mais pobre que a
 * realidade.
 *
 * Cada opção aponta para uma ÁREA diferente do produto, e é isso que faz a
 * pergunta valer. A versão anterior tinha três opções que diziam a mesma coisa
 * ("gestão de processos", "implementar processos", "organizar a operação") e
 * uma que todo mundo marcaria ("aumentar minhas vendas"): quem responde marca
 * quase tudo, e uma resposta que quase todos dão para de separar as pessoas,
 * que é a única razão de perguntar.
 *
 * O mapa hoje: 1 e 5 são Multiatendimento e Agentes, 2 é Pipeline, 3 e 4 são
 * Dashboard. Quem marca a 4 tem time; quem marca a 5 tem volume.
 *
 * Vão para `profiles.goals` (text[]) exatamente como estão escritas aqui.
 * Mudar um rótulo depois cria um valor novo convivendo com o antigo nas linhas
 * já gravadas, então a troca teria que vir com um UPDATE junto.
 */
const OBJETIVOS = [
  "Parar de perder lead sem resposta",
  "Organizar meu funil e saber em que pé está cada negócio",
  "Ter previsibilidade de quanto vou vender no mês",
  "Acompanhar o desempenho do meu time",
  "Automatizar o atendimento no WhatsApp",
];

/**
 * Opções de "Qual seu principal ponto de contato com os leads?".
 *
 * Múltipla escolha, apesar do "principal" no singular. A pergunta pede a
 * hierarquia (é isso que separa uma operação de outra), mas nada se ganha
 * impedindo quem usa três canais de dizer que usa três. O texto de apoio na
 * tela é que resolve a tensão: "Marque o principal e outros que também usar".
 *
 * "Ligação telefônica" e "Reunião online" são separadas de propósito. A versão
 * que motivou esta lista tinha "ligação" e "call de vendas", que se sobrepõem
 * -- uma call de vendas É uma ligação, e quem atende por telefone escolheria no
 * chute entre as duas. O que de fato distingue é ligação rápida contra reunião
 * agendada, e é assim que os rótulos estão escritos agora.
 *
 * Instagram e Presencial estão aqui porque o ICP pede: a lista de nichos tem
 * Consultório/Clínica, E-commerce e Prestação de Serviço, e a aquisição roda em
 * Meta. Sem esses dois, parte de quem chega marcaria qualquer coisa.
 *
 * Vai para `companies.channels`. É fato da empresa, não da pessoa: os cinco
 * vendedores dela atendem pelos mesmos canais. Difere de `profiles.goals`, que
 * é o que aquela pessoa específica quer alcançar.
 *
 * WhatsApp em primeiro não é ordem alfabética nem acaso: é o canal que o
 * produto conecta, e quem o marca tem um primeiro passo de onboarding diferente
 * de quem não marca.
 */
const CANAIS_DE_ATENDIMENTO = [
  "WhatsApp",
  "Instagram",
  "Ligação telefônica",
  "Reunião online (Meet, Zoom)",
  "E-mail",
  "Presencial",
];

/**
 * Faixas de leads novos por mês, na etapa "Sobre a sua empresa".
 *
 * Vai para `companies.monthly_leads`. É a pergunta que mede o tamanho da DOR,
 * enquanto porte e usuários previstos medem o tamanho da EMPRESA: uma clínica
 * de 4 pessoas com 300 leads no WhatsApp tem urgência que uma indústria de 60
 * que vende por licitação não tem.
 *
 * A escada é CONTÍNUA de propósito: cada faixa começa onde a anterior terminou
 * mais um. Sobreposição ("251 a 500" com "500 a 1.000") deixa quem tem
 * exatamente 500 escolhendo entre duas certas, e buraco (de 3.000 a 5.000)
 * deixa quem tem 4.000 escolhendo qualquer uma. Nos dois casos entra no banco
 * uma resposta aleatória com cara de resposta, e é justamente esta coluna que
 * decide a quem ligar durante o teste.
 *
 * Esta lista é a fonte da verdade das faixas: o comentário da coluna no banco
 * aponta para cá em vez de repeti-las, porque elas ainda estão sendo calibradas
 * e um comentário desatualizado engana mais do que ajuda.
 */
const FAIXAS_DE_LEADS = [
  "0 a 250 leads",
  "251 a 500 leads",
  "501 a 1.000 leads",
  "1.001 a 3.000 leads",
  "3.001 a 10.000 leads",
  "10.001 a 50.000 leads",
  "+50.000 leads",
];

const NICHES = [
  { label: "E-commerce",               icon: ShoppingCart },
  { label: "Infoproduto",              icon: BookOpen },
  { label: "Software & Tech",           icon: Store },
  { label: "Consultório/Clínica",      icon: HeartPulse },
  { label: "Consultoria/Mentoria",     icon: Scale },
  { label: "Agência de Marketing",     icon: Megaphone },
  { label: "Prestação de Serviço",     icon: Store },
  { label: "Outros",                   icon: MoreHorizontal },
];


const STEP_META = [
  // `{email}` é trocado pelo e-mail da conta na hora de renderizar. Fica como
  // marcador aqui, e não montado lá embaixo, para toda a escrita das etapas
  // continuar morando num lugar só.
  { title: "Sobre você",                          subtitle: "Você está se inscrevendo como {email}", sideLabel: "Sobre você" },
  { title: "Sobre a sua empresa",                 subtitle: "Conte-nos um pouco sobre a sua empresa.", sideLabel: "Sua empresa" },
  { title: "Sua atuação",                         subtitle: "Como sua operação funciona hoje.", sideLabel: "Sua atuação" },
  { title: "Seus objetivos",                      subtitle: "Marque tudo que se aplica ao seu momento.", sideLabel: "Seus objetivos" },
];

/**
 * Quantas etapas o cadastro tem, contadas do próprio STEP_META.
 *
 * Sai daqui e não de um número escrito à mão porque já custou: o contador
 * "1/4", a barra de progresso e o botão final traziam o 4 cravado, e tirar a
 * etapa de nicho deixaria os três mentindo cada um do seu jeito. Etapa nova ou
 * etapa a menos agora é uma linha na lista acima, e o resto acompanha.
 */
const TOTAL_DE_ETAPAS = STEP_META.length;

/** Distância vertical entre uma etapa e outra na lista da lateral, em pixels. */
const ESPACO_ENTRE_ETAPAS = 20;

const formatPhone = (value: string) => {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

type Step = 1 | 2 | 3 | 4;


export default function CompanyRegisterPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company, companyLoading, refetchCompany } = useCompany();
  const { profile } = useProfile();

  // Membro convidado: já tem empresa, não precisa cadastrar
  useEffect(() => {
    if (!companyLoading && company) {
      navigate("/inicio", { replace: true });
    }
  }, [companyLoading, company, navigate]);

  const [step, setStep]               = useState<Step>(1);
  /**
   * Se a pessoa já bateu no "Próximo" com campo faltando nesta etapa.
   *
   * Antes o único aviso era o toast, que aparece num canto, some sozinho e diz
   * QUAL campo falta sem dizer ONDE ele está. Com isto, o campo que falta se
   * marca sozinho, e o aviso fica na tela até ser resolvido.
   *
   * Volta a `false` ao trocar de etapa: a etapa seguinte nasce vazia, e sem o
   * reset ela abriria com todos os campos já em vermelho, cobrando uma resposta
   * que ninguém teve chance de dar ainda.
   */
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [progressVal, setProgressVal] = useState(0);

  // ── Sobre você (etapa 1) ──
  const [fullName, setFullName]           = useState("");
  const [jobTitle, setJobTitle]           = useState("");
  const [crmExperience, setCrmExperience] = useState("");
  const [previousCrm, setPreviousCrm]     = useState("");
  const [ddiPessoal, setDdiPessoal]       = useState("+55");
  const [personalPhone, setPersonalPhone] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [monthlyLeads, setMonthlyLeads] = useState("");
  const [expectedUsers, setExpectedUsers] = useState("");

  // Não é mais perguntado na tela: a etapa de contato virou "Seus objetivos".
  // O estado fica porque a empresa continua nascendo com o e-mail da conta, que
  // é o que a cobrança usa e o que Configurações > Empresa mostra.
  const [companyEmail, setCompanyEmail] = useState("");

  const [niche, setNiche] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);


  useEffect(() => {
    if (user?.email) setCompanyEmail(user.email);
  }, [user?.email]);

  // O nome já foi dado no cadastro da conta; aqui ele chega preenchido, para
  // conferência e correção. `profile?.full_name` primeiro e `user_metadata`
  // como reserva: a linha em `profiles` pode ainda estar sendo criada quando
  // esta tela abre, e o metadata do Auth existe desde o primeiro segundo.
  // O preenchimento acontece UMA vez, e a trava é um ref e não o próprio valor
  // do campo. Com `fullName` na guarda e nas dependências, apagar o campo o
  // zerava, o efeito rodava de novo, via o campo vazio e reescrevia o nome --
  // na prática era impossível apagar. O ref registra "já preenchi" e não muda
  // mais, independente do que a pessoa faça com o texto depois.
  const jaPreencheuNome = useRef(false);
  useEffect(() => {
    if (jaPreencheuNome.current) return;
    const nome = profile?.full_name || (user?.user_metadata?.full_name as string | undefined) || "";
    if (nome) {
      setFullName(nome);
      jaPreencheuNome.current = true;
    }
  }, [profile?.full_name, user?.user_metadata?.full_name]);

  /**
   * Cor da borda do campo, em três estados.
   *
   * Preenchido fica verde, e é o que diz "esta resposta já está dada" depois
   * que o foco sai. Vazio depois de uma tentativa de avançar fica vermelho, e
   * é o que aponta ONDE está o problema -- o toast diz qual campo falta, mas
   * não onde ele fica na tela. Vazio antes de qualquer tentativa não recebe
   * nada, e a borda padrão fica de pé: cobrar resposta de quem ainda nem
   * chegou no campo é ruído, não ajuda.
   *
   * `opcional` existe para o Complemento, o único campo que a validação não
   * exige. Sem ele, o Complemento vazio ficaria vermelho junto com os que
   * realmente faltam, e a pessoa procuraria um erro que não existe.
   */
  const bordaDePreenchido = (valor: string, opcional = false) => {
    if (valor.trim()) return "border-primary";
    if (tentouAvancar && !opcional) return "border-destructive";
    return "";
  };


  const handleNext = () => {
    // Ligado antes das checagens: se alguma barrar, os campos vazios da etapa
    // já se marcam junto com o toast. Se todas passarem, o `avancar` logo
    // abaixo desliga de novo.
    setTentouAvancar(true);
    if (step === 1) {
      if (!fullName.trim())    { toast.error("Informe seu nome."); return; }
      if (!jobTitle)           { toast.error("Selecione seu cargo."); return; }
      if (!crmExperience)      { toast.error("Informe se você já usa um CRM."); return; }
      if (!personalPhone.trim()) { toast.error("Informe seu telefone."); return; }
      avancar(2);
    } else if (step === 2) {
      if (!companyName.trim()) { toast.error("Informe o nome da empresa."); return; }
      if (!niche)              { toast.error("Selecione o segmento da empresa."); return; }
      if (!expectedUsers)      { toast.error("Informe quantas pessoas usarão o Rezult."); return; }
      avancar(3);
    } else if (step === 3) {
      if (channels.length === 0) { toast.error("Marque ao menos um canal de atendimento."); return; }
      if (!monthlyLeads)         { toast.error("Informe quantos leads sua empresa gera por mês."); return; }
      avancar(4);
    }
  };

  /** Troca de etapa e apaga a marcação de erro, que era da etapa que ficou. */
  const avancar = (proxima: Step) => {
    setTentouAvancar(false);
    setStep(proxima);
  };

  const handleBack = () => {
    setTentouAvancar(false);
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleSubmit = async () => {
    if (!user) return;

    setTentouAvancar(true);
    if (goals.length === 0) { toast.error("Marque ao menos um objetivo."); return; }

    setSubmitting(true);

    // Teste grátis: 7 dias com plano pago, sem pedir cartão.
    //
    // Antes eram 2 dias com plano "free", o que não era teste nenhum: como
    // `isFreePlan` já era verdadeiro no primeiro minuto, a pessoa entrava com os
    // limites do gratuito, via a tarja vermelha de upgrade antes de conhecer o
    // produto, e no fim dos 2 dias nada mudava. Nenhuma das empresas que passaram
    // por esse fluxo chegou a cadastrar um único lead.
    //
    // Agora entra como Silver de verdade e, ao vencer sem assinatura, cai para os
    // limites do free por `planoEmVigor`. `trial_ends_at` marca que é teste, para
    // a tela falar em prazo em vez de vender upgrade, e o webhook zera esse campo
    // quando uma assinatura entra.
    const DIAS_DE_TESTE = 7;
    const planExpiresAt = new Date();
    planExpiresAt.setDate(planExpiresAt.getDate() + DIAS_DE_TESTE);

    const { data: newCompany, error } = await supabase.from("companies").insert({
      owner_id:        user.id,
      name:            companyName.trim(),
      expected_users:  expectedUsers,
      // O cadastro deixou de PERGUNTAR e-mail e telefone da empresa quando a
      // etapa de contato virou "Seus objetivos", mas a empresa continua
      // nascendo com os dois preenchidos, agora a partir do que já sabemos: o
      // e-mail da conta e o telefone dado na etapa 1.
      //
      // Isso preserva exatamente o que já acontecia -- nas 10 empresas
      // existentes o e-mail da empresa é igual ao do dono em 10 -- e mantém de
      // pé quem depende desses campos: o `create-checkout-session` usa os dois
      // como dados de cobrança na Stripe, e Configurações > Empresa os mostra.
      // Quem precisar de um e-mail de cobrança diferente troca lá depois.
      email:           companyEmail.trim(),
      phone:           `${ddiPessoal} ${personalPhone}`.trim(),
      niche,
      monthly_leads:   monthlyLeads,
      channels,
      // Endereço saiu do cadastro: eram sete campos entre a pessoa e o produto
      // que ela veio testar, e a Stripe já os coleta no checkout
      // (`billing_address_collection: "required"`), que é o único momento em
      // que eles importam. Continuam editáveis em Configurações > Empresa.
      plan:            "silver",
      plan_expires_at: planExpiresAt.toISOString(),
      trial_ends_at:   planExpiresAt.toISOString(),
    }).select("id").single();

    if (error) {
      toast.error(`Erro ao criar empresa: ${error.message}`);
      setSubmitting(false);
      return;
    }

    // A "Follow-up" era criada aqui, com um `insert` solto. Passou para o
    // gatilho `criar_tags_padrao` no banco, junto com as outras três tags que
    // toda conta nova recebe.
    //
    // Não é só arrumação: aqui a criação dependia de a tela chegar até esta
    // linha. Um erro de rede no meio do cadastro, ou uma empresa criada por
    // outro caminho, nascia sem a tag -- e o chip "Follow-up" do
    // Multiatendimento conta com ela. No banco, ou a tag existe junto com a
    // empresa, ou não existe empresa.
    //
    // Se voltar a criar aqui, a conta nasce com DUAS "Follow-up": não há
    // restrição de unicidade em (company_id, name).

    // As respostas de "Sobre você" moram no perfil, não na empresa: são da
    // pessoa, e numa empresa com cinco gente cada uma tem a sua.
    await supabase.from("profiles").update({
      company_name:   companyName.trim(),
      full_name:      fullName.trim(),
      job_title:      jobTitle,
      crm_experience: crmExperience,
      // Só faz sentido guardar o CRM anterior de quem disse ter usado um. Sem
      // esta guarda, trocar a resposta de "Sim, já usei" para "Uso planilhas"
      // deixaria no banco um CRM anterior que contradiz a própria experiência.
      previous_crm:   crmExperience === CRM_JA_USADO ? (previousCrm.trim() || null) : null,
      goals,
      phone:          `${ddiPessoal} ${personalPhone}`.trim(),
    }).eq("id", user.id);
    refetchCompany();

    let val = 0;
    const interval = setInterval(() => {
      val += 1;
      setProgressVal(val);
      if (val >= 100) {
        clearInterval(interval);
        // `vemDoCadastro` diz à tela de planos que esta é a PRIMEIRA visita, e
        // ela usa isso só para o rótulo do botão de saída: aqui cabe "Começar
        // 7 dias grátis", porque o teste está de fato começando agora. Quem
        // volta depois pela tarja chega sem esta marca e vê "Finalizar".
        //
        // Vai pelo estado da navegação, e não por data ou pelo `localStorage`:
        // data erra quando a pessoa volta no mesmo dia, e `localStorage` erra
        // em outro navegador. O caminho percorrido é o único sinal exato.
        setTimeout(() => navigate("/setup", { state: { vemDoCadastro: true } }), 200);
      }
    }, 40);
  };

  // ─── Loading screen ───────────────────────────────────────────────────────────
  // A mesma tela que a escolha de plano usa enquanto termina de se preparar.
  // Ver TelaPreparandoConta: a continuidade entre as duas é o ponto.
  if (submitting) return <TelaPreparandoConta progresso={progressVal} />;

  // ─── Wizard ───────────────────────────────────────────────────────────────────
  const { title, subtitle: subtituloBruto } = STEP_META[step - 1];

  // A frase com o e-mail é a única que mistura pesos: o texto em regular e só o
  // endereço em 600, para o olho cair nele. As outras seguem inteiras em 600.
  //
  // Sem e-mail na sessão a frase terminaria no vazio ("...se inscrevendo como
  // "). Só chega aqui quem está autenticado, então é rede de segurança, não
  // caso esperado -- mas frase pela metade na primeira tela do cadastro custa
  // mais do que a linha que a evita.
  const temEmail = subtituloBruto.includes("{email}") && !!user?.email;
  // O `split` mantém a frase inteira em STEP_META: aqui fica só a ênfase, não
  // um pedaço do texto reescrito à mão que sairia do lugar na próxima edição.
  const [antesDoEmail, depoisDoEmail] = subtituloBruto.split("{email}");
  const subtitle = temEmail
    ? <>{antesDoEmail}<span className="font-semibold text-foreground">{user!.email}</span>{depoisDoEmail}</>
    : (subtituloBruto.includes("{email}") ? "Conte-nos quem está do outro lado." : subtituloBruto);
  const stepProgress = (step / TOTAL_DE_ETAPAS) * 100;

  return (
    <div className="relative min-h-screen overflow-y-auto flex items-center justify-center px-4 py-10" style={{ background: "hsl(var(--background))" }}>
      {/* O CRM atrás do formulário: quem chega aqui acabou de confirmar o
          e-mail, e ver o produto montado esperando os dados diz "falta pouco"
          melhor do que qualquer frase. Decorativo e inerte -- ver FundoDoCrm. */}
      <FundoDoCrm />
      {/* A sombra é o que separa o cartão do CRM que está atrás: sem ela as
          bordas das colunas do fundo encostam nas do cartão e a leitura embola,
          por mais desfocado que o fundo esteja.
          O `overflow-hidden` é do gradiente que gira na borda e não recorta a
          sombra: box-shadow é desenhada fora da caixa. */}
      <div className="relative w-full max-w-[1000px] rounded-[7px] p-[1px] overflow-hidden shadow-elev-3">
        {/* Rotating border lights */}
        <div
          className="absolute inset-[-100%]"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
            animation: "spin-border 4s linear infinite",
          }}
        />
        <div
          className="absolute inset-[-100%]"
          style={{
            background: "conic-gradient(from 180deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
            animation: "spin-border 4s linear infinite",
          }}
        />

        <div className="relative w-full bg-card rounded-[7px] overflow-hidden flex" style={{ height: 600 }}>
          {/* ── Left sidebar ── */}
          <div className="w-[280px] shrink-0 flex flex-col pl-[35px] pr-[20px] pt-10 pb-10">
            <div className="flex items-center mb-5">
              <img src="/logo-rezult.png?v=2" alt="Rezult CRM" className="h-7 w-auto" />
            </div>

            <h2 className="text-[15px] font-semibold text-foreground mb-1">Finalize seu cadastro</h2>
            <p className="text-[12px] text-muted-foreground leading-snug mb-6">
              Usaremos essas informações para personalizar o Rezult às suas necessidades.
            </p>

            {/* Step list */}
            <div className="flex flex-col" style={{ gap: ESPACO_ENTRE_ETAPAS }}>
              {STEP_META.map((meta, i) => {
                const num = i + 1;
                const isActive = step === num;
                const isDone   = step > num;
                const ehUltima = num === TOTAL_DE_ETAPAS;
                return (
                  <div key={num} className="relative flex items-center gap-2.5">
                    {/* Concluída troca o número pelo visto: depois de feita, o
                        que importa daquela etapa é o estado, não a posição dela
                        na fila. O fundo vira branco para o visto não competir
                        com o círculo cheio da etapa em curso, que é o único que
                        deve puxar o olho. */}
                    <div className={cn(
                      "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 border-2",
                      isActive ? "border-primary bg-primary text-white" :
                      isDone   ? "border-primary bg-card text-primary" :
                                 "border-muted-foreground/30 text-muted-foreground"
                    )}>
                      {isDone ? <Check size={12} strokeWidth={3} /> : num}
                    </div>

                    {/* Trilho que liga esta bolinha à de baixo.
                        Verde de cima para baixo conforme as etapas avançam:
                        pintado é o caminho já percorrido, cinza é o que falta.
                        Quem manda é `isDone`, que vale para a etapa DESTE
                        trecho -- o segmento entre 2 e 3 fica verde quando a
                        etapa 2 terminou, ou seja, no instante em que a pessoa
                        chega na 3.

                        Fica DENTRO da linha da etapa, posicionado a partir do
                        centro do círculo, e não como elemento próprio entre as
                        etapas: assim vai do fim de um círculo ao começo do
                        próximo, acompanhando ESPACO_ENTRE_ETAPAS. A última não
                        tem trilho, porque não há o que ligar depois dela. */}
                    {!ehUltima && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          // 2px nos dois estados, e não só no verde: espessura
                          // que muda no meio do caminho deixa um degrau visível
                          // onde o cinza encontra o verde. Também é a mesma
                          // espessura da borda das bolinhas.
                          "absolute w-0.5 transition-colors",
                          isDone ? "bg-primary" : "bg-muted-foreground/20"
                        )}
                        style={{
                          // 22px de círculo, então o centro está em 11; menos
                          // metade da espessura da linha (1px de 2) para ela
                          // nascer centrada, e não deslocada à direita.
                          left: 10,
                          top: 22,
                          // Exatamente o vão entre uma etapa e outra: é o que
                          // o trilho tem que vencer para encostar na próxima.
                          height: ESPACO_ENTRE_ETAPAS,
                        }}
                      />
                    )}

                    <span className={cn(
                      "text-[12px] leading-tight",
                      isActive ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {meta.sideLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px bg-border my-8 shrink-0" />

          {/* ── Right content ── */}
          <div className="flex-1 flex flex-col pl-[25px] pr-10 pt-10 pb-10 min-w-0">
            {/* Title + counter */}
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-[20px] font-extrabold text-primary">{title}</h1>
              <span className="text-[12px] text-muted-foreground font-medium shrink-0 ml-2">{step}/{TOTAL_DE_ETAPAS}</span>
            </div>

            {/* A frase vem colada no título, e a barra de progresso depois dos
                dois: título e frase são a mesma ideia dita duas vezes, e a
                barra é assunto de navegação. Com a barra no meio, ela cortava a
                frase do título que ela explica.

                A frase fica em regular nas quatro etapas. O peso 600 aqui
                disputava com o título logo acima, que já é 800 e verde -- duas
                linhas grossas seguidas e nenhuma delas manda. Em regular, o
                título chama e a frase explica. O único 600 que sobra é o do
                e-mail da etapa 1, dentro do span, onde ele destaca uma
                informação e não uma linha inteira. */}
            <p className="text-[14px] text-foreground mb-4" style={{ fontWeight: 400 }}>{subtitle}</p>

            {/* Progress bar */}
            <div className="h-[3px] bg-border rounded-full mb-6">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${stepProgress}%` }}
              />
            </div>

            {/* ── Step 1 ── */}
            {step === 1 && (
              <div className="space-y-[14px]">
                <div className="space-y-[3px]">
                  <Label htmlFor="full-name" className="text-[13px] font-normal text-black">Seu nome</Label>
                  {/* Chega preenchido do cadastro da conta, mas editável: é a
                      chance de corrigir o que foi digitado às pressas, e é este
                      nome que aparece como responsável nos negócios depois. */}
                  <Input
                    id="full-name"
                    type="text"
                    placeholder="Seu nome completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(fullName))}
                    autoFocus
                  />
                </div>

                <div className="space-y-[3px]">
                  <Label className="text-[13px] font-normal text-black">Telefone</Label>
                  {/* Único telefone do cadastro desde que a etapa de contato
                      virou "Seus objetivos". Vai para `profiles.phone` e também
                      preenche `companies.phone`, que é o que a Stripe usa como
                      dado de cobrança. */}
                  <div className={cn("flex items-center border border-input rounded-[5px] focus-within:border-primary transition-colors bg-white", bordaDePreenchido(personalPhone))}>
                    {/* O gatilho perde borda, fundo e altura próprios para
                        continuar sendo apenas a parte esquerda do campo de
                        telefone, e não uma caixa dentro de outra. A borda que
                        sobra é a `border-r`, que separa a bandeira do número.

                        `[&>svg]:hidden` esconde o chevron que o SelectTrigger
                        traz de fábrica: o desenho aqui já tem o seu, menor e
                        colado na bandeira. */}
                    <Select value={ddiPessoal} onValueChange={setDdiPessoal}>
                      <SelectTrigger
                        aria-label="Código do país"
                        className="h-auto w-auto shrink-0 border-0 border-r border-input rounded-none bg-transparent px-3 py-[9px] gap-1 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden"
                      >
                        <span className="text-[15px] leading-none">{DDI_OPTIONS.find(o => o.code === ddiPessoal)?.flag}</span>
                        <ChevronDown size={11} className="text-muted-foreground" />
                      </SelectTrigger>
                      <SelectContent>
                        {DDI_OPTIONS.map((o) => (
                          <SelectItem key={o.code} value={o.code}>{o.flag} {o.short} {o.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center flex-1 px-3 gap-1">
                      <span className="text-[13px] text-muted-foreground shrink-0">{ddiPessoal}</span>
                      <input
                        type="tel"
                        placeholder="(11) 99999-9999"
                        value={personalPhone}
                        onChange={(e) => setPersonalPhone(formatPhone(e.target.value))}
                        className="flex-1 text-[13px] outline-none bg-transparent py-[9px] text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-[3px]">
                  <Label htmlFor="job-title" className="text-[13px] font-normal text-black">
                    Qual cargo descreve melhor sua função?
                  </Label>
                  <Select value={jobTitle} onValueChange={setJobTitle}>
                    <SelectTrigger id="job-title" className={cn("h-auto py-[9px] text-[13px] rounded-[5px] border-input focus:ring-0 focus:ring-offset-0 focus:border-primary [&>span]:truncate data-[placeholder]:text-muted-foreground", bordaDePreenchido(jobTitle))}>
                      <SelectValue placeholder="Selecione seu cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARGOS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-[3px]">
                  <Label htmlFor="crm-experience" className="text-[13px] font-normal text-black">
                    Você já usa um CRM?
                  </Label>
                  {/* Lista suspensa e não caixas lado a lado: as três respostas
                      são frases inteiras ("Não, nunca usei CRM"), e em três
                      colunas cada uma quebraria em duas ou três linhas. */}
                  <Select value={crmExperience} onValueChange={setCrmExperience}>
                    <SelectTrigger id="crm-experience" className={cn("h-auto py-[9px] text-[13px] rounded-[5px] border-input focus:ring-0 focus:ring-offset-0 focus:border-primary [&>span]:truncate data-[placeholder]:text-muted-foreground", bordaDePreenchido(crmExperience))}>
                      <SelectValue placeholder="Selecione uma opção" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPERIENCIAS_COM_CRM.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Só aparece para quem disse ter usado um CRM.
                    Quem responde isso está dizendo duas coisas: tem processo
                    montado, e está insatisfeito com alguém. A primeira muda o
                    onboarding, a segunda diz de quem estamos tirando cliente.

                    OPCIONAL, e é o único campo do cadastro que é. Obrigar aqui
                    só produziria resposta inventada, e o nome do concorrente
                    não vale o atrito de travar quem não quer dizer. Por isso
                    também não entra em `bordaDePreenchido` com cobrança: em
                    branco ele fica cinza, nunca vermelho.

                    Sem rótulo próprio e recuado: o campo é continuação da
                    pergunta de cima, não uma pergunta nova. O recuo é o que diz
                    isso antes de qualquer texto -- alinhado com os demais, ele
                    leria como o quinto campo da etapa.

                    A pergunta mora no `placeholder`, e o `aria-label` repete o
                    que ele diz: texto de placeholder some assim que a pessoa
                    digita, e sem o `aria-label` o leitor de tela anunciaria um
                    campo sem nome. */}
                {crmExperience === CRM_JA_USADO && (
                  <div className="ml-4">
                    <Input
                      id="previous-crm"
                      type="text"
                      aria-label="Qual CRM você usava? (opcional)"
                      placeholder="Qual? (opcional)"
                      value={previousCrm}
                      onChange={(e) => setPreviousCrm(e.target.value)}
                      // `rounded-full` e fonte menor que a dos demais (11px
                      // contra os 13px que o Input traz): junto com o recuo, é o
                      // que faz este campo ler como observação pendurada na
                      // pergunta de cima, e não como mais um campo do
                      // formulário.
                      className={cn("h-auto rounded-full text-[11px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(previousCrm, true))}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <div className="space-y-[14px]">
                <div className="space-y-[3px]">
                  <Label htmlFor="company-name" className="text-[13px] font-normal text-black">Nome da empresa</Label>
                  <Input
                    id="company-name"
                    type="text"
                    placeholder="Inclua o nome da sua empresa"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(companyName))}
                    autoFocus
                  />
                </div>

                <div className="space-y-[3px]">
                  <Label htmlFor="company-niche" className="text-[13px] font-normal text-black">
                    Qual o segmento da sua empresa?
                  </Label>
                  {/* Mesmo desenho do dropdown de País, na última etapa: um
                      `select` nativo transparente por cima da aparência
                      desenhada. O nativo é quem abre a lista, e no celular isso
                      vira o seletor do sistema, melhor que qualquer lista
                      customizada em tela pequena.

                      Lista suspensa, e não as oito caixas que isto era quando
                      ocupava uma etapa inteira: aqui o campo divide espaço com
                      outros dois, e oito caixas empurrariam o resto para fora
                      do cartão. */}
                  <Select value={niche} onValueChange={setNiche}>
                    <SelectTrigger id="company-niche" className={cn("h-auto py-[9px] text-[13px] rounded-[5px] border-input focus:ring-0 focus:ring-offset-0 focus:border-primary [&>span]:truncate data-[placeholder]:text-muted-foreground", bordaDePreenchido(niche))}>
                      <SelectValue placeholder="Selecione o segmento" />
                    </SelectTrigger>
                    <SelectContent>
                      {NICHES.map(({ label }) => (
                        <SelectItem key={label} value={label}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Faixa verde clara em volta da pergunta inteira: rótulo,
                    aviso e opções lêem como um bloco só, separado dos dois
                    campos de cima. É o que justifica o aviso estar ali -- fora
                    da faixa ele pareceria valer para a etapa toda. */}
                {/* Sem `space-y` aqui: as duas distâncias deste bloco são
                    diferentes uma da outra, e `space-y` só sabe aplicar a mesma
                    para todos os filhos. Cada uma vem da margem do próprio
                    parágrafo, logo abaixo. */}
                <div className="rounded-[7px] bg-primary/[0.06] px-3 py-3">
                  {/* `block` no rótulo: `<label>` é inline por padrão, e como
                      inline a altura da linha dele passa a ser decidida pelo
                      line-height do bloco em volta, não pelo `leading-none` que
                      ele carrega. Em bloco, a caixa dele mede exatamente os
                      13px da fonte e encosta nas letras. */}
                  <Label className="block text-[13px] font-semibold text-black">
                    Quantas pessoas na sua empresa usarão o Rezult?
                  </Label>
                  {/* Fica ANTES das opções, e não depois: a dúvida que este
                      aviso resolve ("responder 16-50 vai me cobrar por 50
                      assentos?") aparece na hora de escolher, não depois de
                      escolhido. Embaixo das caixas, chegaria tarde.

                      `leading-none` tira a folga que o texto trazia: sem ele o
                      parágrafo herda line-height 1.5 e ganha 3px invisíveis
                      acima e abaixo das letras, que somavam por fora e faziam
                      os espaços na tela não baterem com os do código.

                      Com a folga fora, as duas margens abaixo são exatamente o
                      que aparece: 4px até a pergunta, 16px até as caixas. */}
                  <p className="block text-[12px] leading-none text-muted-foreground mt-1 mb-[16px]">
                    Apenas informativo e não afeta seus convites de usuário
                  </p>
                  {/* Cinco caixas lado a lado, no mesmo padrão da etapa 3, a do
                      nicho, em versão baixa para acompanhar a altura do campo
                      de cima. Com opções curtas, ver as cinco de uma vez deixa
                      a escolha ser comparação em vez de leitura sequencial.

                      Aqui não há bolinha: quem diz o que está escolhido é a
                      caixa inteira, que troca de contorno e ganha fundo. Uma
                      bolinha junto seria o mesmo recado duas vezes.

                      Por baixo são `input type="radio"` de verdade, escondidos
                      só visualmente. O nativo é quem dá a navegação por setas
                      do teclado e o anúncio correto no leitor de tela; um
                      `<button>` com `role="radio"` teria a aparência certa e
                      esse comportamento todo por escrever à mão. Como o input
                      fica invisível, o foco do teclado aparece no `<label>` que
                      o envolve, via `focus-within`. */}
                  <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Quantas pessoas usarão o Rezult">
                    {FAIXAS_DE_USUARIOS.map((faixa) => {
                      const marcada = expectedUsers === faixa;
                      return (
                        <label
                          key={faixa}
                          className={cn(
                            "flex items-center justify-center px-2 py-[9px] rounded-[5px] border text-center cursor-pointer transition-all",
                            "hover:border-primary/60",
                            "focus-within:ring-2 focus-within:ring-primary/30",
                            // Todas as caixas ficam brancas, marcada ou não:
                            // sobre a faixa verde elas precisam ler como caixas,
                            // e não como contornos flutuando no tom. Quem diz o
                            // que está escolhido é o contorno e o texto em
                            // verde, sem trocar o fundo.
                            "bg-card",
                            marcada
                              ? "border-primary text-primary"
                              : "border-gray-300 text-foreground"
                          )}
                        >
                          <input
                            type="radio"
                            name="expected-users"
                            value={faixa}
                            checked={marcada}
                            onChange={() => setExpectedUsers(faixa)}
                            className="sr-only"
                          />
                          {/* A marcada engrossa: junto com o contorno e a cor,
                              é o terceiro sinal da escolha, e o único que
                              sobrevive para quem não distingue o verde. */}
                          <span className={cn("text-[12px] leading-tight", marcada ? "font-semibold" : "font-medium")}>
                            {faixa}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3 ── */}
            {step === 3 && (
              <div className="space-y-[14px]">
                <div>
                  <Label className="block text-[13px] font-semibold text-black">
                    Qual seu principal ponto de contato com os leads?
                  </Label>
                  <p className="block text-[12px] leading-none text-muted-foreground mt-1 mb-[14px]">
                    Marque o principal e outros que também usar
                  </p>

                  {/* Duas colunas: os rótulos são curtos, e empilhados em uma
                      coluna só a etapa ficaria alta demais com o campo de leads
                      logo abaixo. Mesmas caixas de marcação da etapa de
                      objetivos, com `input type="checkbox"` de verdade por
                      baixo. */}
                  <div className="grid grid-cols-2 gap-2">
                    {CANAIS_DE_ATENDIMENTO.map((canal) => {
                      const marcado = channels.includes(canal);
                      return (
                        <label
                          key={canal}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-[12px] rounded-[5px] border cursor-pointer transition-all bg-card",
                            "hover:border-primary/60",
                            "focus-within:ring-2 focus-within:ring-primary/30",
                            marcado ? "border-primary text-primary" : "border-gray-300 text-foreground"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() =>
                              setChannels(atuais =>
                                atuais.includes(canal)
                                  ? atuais.filter(c => c !== canal)
                                  : [...atuais, canal]
                              )
                            }
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              "w-4 h-4 rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                              marcado ? "border-primary bg-primary" : "border-gray-300"
                            )}
                          >
                            {marcado && <Check size={11} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className="text-[13px] leading-tight font-normal">{canal}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-[3px]">
                  <Label htmlFor="monthly-leads" className="text-[13px] font-normal text-black">
                    Quantos leads sua empresa gera por mês?
                  </Label>
                  {/* Vizinha do porte de propósito: as duas parecem a mesma
                      pergunta e não são. Porte é o tamanho da empresa, esta é o
                      tamanho da dor, e é a segunda que diz se aquele cadastro
                      merece um telefonema no dia 2 do teste. */}
                  <Select value={monthlyLeads} onValueChange={setMonthlyLeads}>
                    <SelectTrigger id="monthly-leads" className={cn("h-auto py-[9px] text-[13px] rounded-[5px] border-input focus:ring-0 focus:ring-offset-0 focus:border-primary [&>span]:truncate data-[placeholder]:text-muted-foreground", bordaDePreenchido(monthlyLeads))}>
                      <SelectValue placeholder="Selecione a faixa" />
                    </SelectTrigger>
                    <SelectContent>
                      {FAIXAS_DE_LEADS.map((faixa) => (
                        <SelectItem key={faixa} value={faixa}>{faixa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* ── Step 4 ── */}
            {step === 4 && (
              <div className="space-y-[14px]">
                {/* Sem `space-y` aqui: ele aplica a mesma distância entre todos
                    os filhos, e as duas deste bloco são diferentes. Pior, o
                    seletor dele (`.space-y-...>:not([hidden])~:not([hidden])`)
                    tem especificidade maior que uma classe solta, então ele
                    vencia o `mt-1` do parágrafo em silêncio -- mexer no `mt-1`
                    não fazia efeito nenhum. Com as margens no próprio
                    parágrafo, cada número é a distância que aparece. */}
                <div>
                  {/* `block` no rótulo: `<label>` é inline por padrão, e como
                      inline a altura da linha dele passa a ser decidida pelo
                      line-height do bloco em volta, não pelo `leading-none` que
                      ele carrega. */}
                  <Label className="block text-[13px] font-semibold text-black">
                    Quais resultados você busca alcançar com o Rezult?
                  </Label>
                  {/* `leading-none` pelo mesmo motivo da etapa 2: sem ele o
                      parágrafo herda line-height 1.5 e carrega 3px invisíveis
                      acima e abaixo das letras, e a margem escrita deixa de ser
                      a distância que aparece. Com ele, 4px é 4px e 14px é 14px. */}
                  <p className="block text-[12px] leading-none text-muted-foreground mt-1 mb-[14px]">
                    Marque quantas opções quiser
                  </p>

                  {/* Caixas de marcação empilhadas, e não lado a lado: os cinco
                      rótulos são frases inteiras, e em colunas cada um quebraria
                      em três linhas.

                      Por baixo são `input type="checkbox"` de verdade,
                      escondidos só visualmente. O nativo dá o anúncio correto no
                      leitor de tela ("caixa de seleção, marcada") e a barra de
                      espaço para marcar; um `<div>` com `role="checkbox"` teria
                      a aparência certa e nada disso.

                      É `checkbox` e não `radio` porque as respostas somam: quem
                      quer vender mais quase sempre também quer organizar a
                      operação. */}
                  <div className="space-y-2">
                    {OBJETIVOS.map((objetivo) => {
                      const marcado = goals.includes(objetivo);
                      return (
                        <label
                          key={objetivo}
                          className={cn(
                            "flex items-center gap-2.5 px-3 py-[15px] rounded-[5px] border cursor-pointer transition-all bg-card",
                            "hover:border-primary/60",
                            "focus-within:ring-2 focus-within:ring-primary/30",
                            marcado ? "border-primary text-primary" : "border-gray-300 text-foreground"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() =>
                              setGoals(atuais =>
                                atuais.includes(objetivo)
                                  ? atuais.filter(o => o !== objetivo)
                                  // Acrescenta no fim, e não reordena: a ordem
                                  // gravada passa a contar em que sequência a
                                  // pessoa pensou, que é informação de graça.
                                  : [...atuais, objetivo]
                              )
                            }
                            className="sr-only"
                          />
                          {/* Quadrado e não círculo: é o desenho que diz "dá
                              para marcar mais de um" antes de qualquer texto
                              explicar. */}
                          <span
                            className={cn(
                              "w-4 h-4 rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                              marcado ? "border-primary bg-primary" : "border-gray-300"
                            )}
                          >
                            {marcado && <Check size={11} className="text-white" strokeWidth={3} />}
                          </span>
                          {/* Peso igual marcado ou não: aqui quem diz o que
                              está escolhido é o quadrado preenchido, que é sinal
                              suficiente. Engrossar o texto junto faria as linhas
                              marcadas mudarem de largura e a lista inteira
                              parecer inquieta a cada clique. */}
                          <span className="text-[13px] leading-tight font-normal">
                            {objetivo}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-end gap-2 mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={step === 1}
                className="h-auto py-[9px] px-5 rounded-[5px] font-semibold"
              >
                Voltar
              </Button>
              {/* O botão da última etapa pulsa: é o que faz quem chega na
                  etapa 4 perceber que ali acaba, sem precisar ler o contador.
                  Nas outras ele fica parado, senão o movimento vira ruído de
                  fundo e para de significar qualquer coisa justamente onde
                  deveria significar.

                  Reaproveita a animação que o aviso de plano grátis já usa, em
                  vez de criar uma segunda igual: duas definições do mesmo
                  efeito acabam divergindo, e aí o produto passa a pulsar de
                  dois jeitos diferentes. */}
              <Button
                type="button"
                onClick={step === TOTAL_DE_ETAPAS ? handleSubmit : handleNext}
                className="h-auto py-[9px] px-5 rounded-[5px] font-semibold"
                style={step === TOTAL_DE_ETAPAS
                  ? { animation: "banner-btn-attention 1s ease-in-out infinite" }
                  : undefined}
              >
                {step === TOTAL_DE_ETAPAS ? "Criar conta" : (
                  <span className="flex items-center gap-1">Próximo <ChevronRight size={15} /></span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
