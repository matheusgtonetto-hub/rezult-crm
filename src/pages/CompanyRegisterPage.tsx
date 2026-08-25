import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useProfile } from "@/context/ProfileContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FundoDoCrm } from "@/components/FundoDoCrm";
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
 * Respostas para "Você já usou um CRM antes?".
 *
 * "Uso planilhas" fica no meio de propósito: não é um não (a pessoa já organiza
 * o processo dela) nem um sim (nunca viu um funil, nem automação). É o grupo
 * mais comum entre quem chega, e o que mais muda o tipo de introdução que
 * deveria receber.
 */
const EXPERIENCIAS_COM_CRM = ["Não, nunca usei CRM", "Uso planilhas", "Sim, já usei um CRM"];

/**
 * Portes oferecidos na etapa "Sobre a sua empresa".
 *
 * Vai para `companies.company_size`: quantas pessoas a empresa TEM. Não
 * confundir com FAIXAS_DE_USUARIOS logo abaixo, que é quantas vão USAR o
 * Rezult. Uma agência de 40 pessoas com 6 no comercial responde "De 21 a 50
 * funcionários" aqui e "6-15" lá, e as duas respostas estão certas.
 *
 * Sete opções com frase inteira ("De 11 a 20 funcionários"), então lista
 * suspensa: em caixas lado a lado cada rótulo quebraria em três linhas.
 */
const PORTES_DE_EMPRESA = [
  "Somente eu",
  "De 2 a 5 funcionários",
  "De 6 a 10 funcionários",
  "De 11 a 20 funcionários",
  "De 21 a 50 funcionários",
  "De 51 a 100 funcionários",
  "+101 funcionários",
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
 * Vão para `profiles.goals` (text[]) exatamente como estão escritas aqui.
 * Mudar um rótulo depois cria um valor novo convivendo com o antigo nas linhas
 * já gravadas, então a troca teria que vir com um UPDATE junto.
 */
const OBJETIVOS = [
  "Aumentar minhas vendas",
  "Ter mais gestão de processos comerciais",
  "Implementar processos comerciais na empresa",
  "Relatórios avançados pra tomada de decisão",
  "Busco ajuda para organizar minha operação",
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

const COUNTRIES = [
  { value: "BR", label: "Brasil",          flag: "🇧🇷" },
  { value: "US", label: "Estados Unidos",  flag: "🇺🇸" },
  { value: "PT", label: "Portugal",        flag: "🇵🇹" },
  { value: "AR", label: "Argentina",       flag: "🇦🇷" },
  { value: "MX", label: "México",          flag: "🇲🇽" },
  { value: "CO", label: "Colômbia",        flag: "🇨🇴" },
  { value: "CL", label: "Chile",           flag: "🇨🇱" },
  { value: "UY", label: "Uruguai",         flag: "🇺🇾" },
  { value: "PE", label: "Peru",            flag: "🇵🇪" },
  { value: "GB", label: "Reino Unido",     flag: "🇬🇧" },
  { value: "DE", label: "Alemanha",        flag: "🇩🇪" },
  { value: "FR", label: "França",          flag: "🇫🇷" },
  { value: "ES", label: "Espanha",         flag: "🇪🇸" },
  { value: "IT", label: "Itália",          flag: "🇮🇹" },
];

const STEP_META = [
  // `{email}` é trocado pelo e-mail da conta na hora de renderizar. Fica como
  // marcador aqui, e não montado lá embaixo, para toda a escrita das etapas
  // continuar morando num lugar só.
  { title: "Sobre você",                          subtitle: "Você está se inscrevendo como {email}", sideLabel: "Sobre você" },
  { title: "Sobre a sua empresa",                 subtitle: "Conte-nos um pouco sobre a sua empresa.", sideLabel: "Sua empresa" },
  { title: "Seus objetivos",                      subtitle: "Marque tudo que se aplica ao seu momento.", sideLabel: "Seus objetivos" },
  { title: "Onde sua empresa está localizada?",   subtitle: "Informe o endereço completo para personalizar sua experiência.", sideLabel: "Endereço" },
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
      navigate("/dashboard", { replace: true });
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
  const [ddiPessoal, setDdiPessoal]       = useState("+55");
  const [personalPhone, setPersonalPhone] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [expectedUsers, setExpectedUsers] = useState("");

  // Não é mais perguntado na tela: a etapa de contato virou "Seus objetivos".
  // O estado fica porque a empresa continua nascendo com o e-mail da conta, que
  // é o que a cobrança usa e o que Configurações > Empresa mostra.
  const [companyEmail, setCompanyEmail] = useState("");

  const [niche, setNiche] = useState("");
  const [goals, setGoals] = useState<string[]>([]);

  const [country, setCountry]           = useState("BR");
  const [zipCode, setZipCode]           = useState("");
  const [address, setAddress]           = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity]                 = useState("");
  const [uf, setUf]                     = useState("");
  const [number, setNumber]             = useState("");
  const [complement, setComplement]     = useState("");
  const [loadingCep, setLoadingCep]     = useState(false);

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

  const handleCepChange = async (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
    setZipCode(formatted);
    if (clean.length === 8 && country === "BR") {
      setLoadingCep(true);
      try {
        const res  = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setAddress(data.logradouro  ?? "");
          setNeighborhood(data.bairro ?? "");
          setCity(data.localidade     ?? "");
          setUf(data.uf               ?? "");
        }
      } catch { /* manual fill */ }
      setLoadingCep(false);
    }
  };

  const handleNext = () => {
    // Ligado antes das checagens: se alguma barrar, os campos vazios da etapa
    // já se marcam junto com o toast. Se todas passarem, o `avancar` logo
    // abaixo desliga de novo.
    setTentouAvancar(true);
    if (step === 1) {
      if (!fullName.trim())    { toast.error("Informe seu nome."); return; }
      if (!jobTitle)           { toast.error("Selecione seu cargo."); return; }
      if (!crmExperience)      { toast.error("Informe se você já usou um CRM."); return; }
      if (!personalPhone.trim()) { toast.error("Informe seu telefone."); return; }
      avancar(2);
    } else if (step === 2) {
      if (!companyName.trim()) { toast.error("Informe o nome da empresa."); return; }
      if (!niche)              { toast.error("Selecione o segmento da empresa."); return; }
      if (!companySize)        { toast.error("Selecione o porte da empresa."); return; }
      if (!expectedUsers)      { toast.error("Informe quantas pessoas usarão o Rezult."); return; }
      avancar(3);
    } else if (step === 3) {
      if (goals.length === 0) { toast.error("Marque ao menos um objetivo."); return; }
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
    if (!zipCode.trim())        { toast.error("Informe o CEP.");        return; }
    if (!address.trim())        { toast.error("Informe o endereço.");   return; }
    if (!number.trim())         { toast.error("Informe o número.");     return; }
    if (!neighborhood.trim())   { toast.error("Informe o bairro.");     return; }
    if (!city.trim())           { toast.error("Informe a cidade.");     return; }
    if (!uf.trim())             { toast.error("Informe o estado (UF)."); return; }

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
      company_size:    companySize,
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
      country,
      zip_code:        zipCode.replace(/\D/g, ""),
      address,
      number,
      complement,
      neighborhood,
      city,
      state:           uf,
      plan:            "silver",
      plan_expires_at: planExpiresAt.toISOString(),
      trial_ends_at:   planExpiresAt.toISOString(),
    }).select("id").single();

    if (error) {
      toast.error(`Erro ao criar empresa: ${error.message}`);
      setSubmitting(false);
      return;
    }

    // Tag padrão criada em toda empresa nova — usada pelo chip "Follow-up" do
    // Multiatendimento e aplicada automaticamente ao agendar um follow up.
    if (newCompany) {
      await supabase.from("tags").insert({
        owner_id: user.id, company_id: newCompany.id, name: "Follow-up", color: "#A32D2D",
      });
    }

    // As respostas de "Sobre você" moram no perfil, não na empresa: são da
    // pessoa, e numa empresa com cinco gente cada uma tem a sua.
    await supabase.from("profiles").update({
      company_name:   companyName.trim(),
      full_name:      fullName.trim(),
      job_title:      jobTitle,
      crm_experience: crmExperience,
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
        setTimeout(() => navigate("/setup"), 200);
      }
    }, 40);
  };

  // ─── Loading screen ───────────────────────────────────────────────────────────
  if (submitting) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "hsl(var(--background))" }}>
        <FundoDoCrm />
        {/* `relative` sobre o fundo fixo: sem posicionamento próprio o conteúdo
            entraria embaixo dele e sumiria atrás do véu. */}
        <div className="relative w-full max-w-[420px] text-center">
          <div className="flex justify-center mb-8">
            <img src="/logo-rezult.png?v=2" alt="Rezult CRM" className="h-10 w-auto" />
          </div>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Estamos preparando sua conta...</h2>
          <p className="text-sm text-muted-foreground mb-8">Isso vai levar apenas alguns segundos.</p>
          <div className="w-full bg-border rounded-full h-2">
            <div className="bg-primary h-2 rounded-full" style={{ width: `${progressVal}%`, transition: "width 40ms linear" }} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">{progressVal}%</p>
        </div>
      </div>
    );
  }

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
            <div className="space-y-[14px]">
              {STEP_META.map((meta, i) => {
                const num = i + 1;
                const isActive = step === num;
                const isDone   = step > num;
                return (
                  <div key={num} className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 border-2",
                      isActive ? "border-primary bg-primary text-white" :
                      isDone   ? "border-primary bg-primary/10 text-primary" :
                                 "border-muted-foreground/30 text-muted-foreground"
                    )}>
                      {num}
                    </div>
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
                  <Label htmlFor="job-title" className="text-[13px] font-normal text-black">
                    Qual cargo descreve melhor sua função?
                  </Label>
                  <div className={cn("relative flex items-center border border-input rounded-[5px] bg-white focus-within:border-primary transition-colors", bordaDePreenchido(jobTitle))}>
                    <select
                      id="job-title"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[13px]"
                    >
                      <option value="" disabled>Selecione</option>
                      {CARGOS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 px-3 py-[9px] pointer-events-none w-full">
                      <span className={cn("text-[13px] truncate", jobTitle ? "text-foreground" : "text-muted-foreground")}>
                        {jobTitle || "Selecione seu cargo"}
                      </span>
                      <ChevronDown size={12} className="text-muted-foreground ml-auto shrink-0" />
                    </div>
                  </div>
                </div>

                <div className="space-y-[3px]">
                  <Label htmlFor="crm-experience" className="text-[13px] font-normal text-black">
                    Você já usou um CRM antes?
                  </Label>
                  {/* Lista suspensa e não caixas lado a lado: as três respostas
                      são frases inteiras ("Não, nunca usei CRM"), e em três
                      colunas cada uma quebraria em duas ou três linhas. */}
                  <div className={cn("relative flex items-center border border-input rounded-[5px] bg-white focus-within:border-primary transition-colors", bordaDePreenchido(crmExperience))}>
                    <select
                      id="crm-experience"
                      value={crmExperience}
                      onChange={(e) => setCrmExperience(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[13px]"
                    >
                      <option value="" disabled>Selecione</option>
                      {EXPERIENCIAS_COM_CRM.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 px-3 py-[9px] pointer-events-none w-full">
                      <span className={cn("text-[13px] truncate", crmExperience ? "text-foreground" : "text-muted-foreground")}>
                        {crmExperience || "Selecione uma opção"}
                      </span>
                      <ChevronDown size={12} className="text-muted-foreground ml-auto shrink-0" />
                    </div>
                  </div>
                </div>

                <div className="space-y-[3px]">
                  <Label className="text-[13px] font-normal text-black">Telefone</Label>
                  {/* Único telefone do cadastro desde que a etapa de contato
                      virou "Seus objetivos". Vai para `profiles.phone` e também
                      preenche `companies.phone`, que é o que a Stripe usa como
                      dado de cobrança. */}
                  <div className={cn("flex items-center border border-input rounded-[5px] focus-within:border-primary transition-colors bg-white", bordaDePreenchido(personalPhone))}>
                    <div className="relative shrink-0">
                      <select
                        value={ddiPessoal}
                        onChange={(e) => setDdiPessoal(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[13px]"
                      >
                        {DDI_OPTIONS.map((o) => (
                          <option key={o.code} value={o.code}>{o.flag} {o.short} {o.code}</option>
                        ))}
                      </select>
                      <div className="px-3 py-[9px] flex items-center gap-1 border-r border-input pointer-events-none">
                        <span className="text-[15px] leading-none">{DDI_OPTIONS.find(o => o.code === ddiPessoal)?.flag}</span>
                        <ChevronDown size={11} className="text-muted-foreground" />
                      </div>
                    </div>
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
                  <div className={cn("relative flex items-center border border-input rounded-[5px] bg-white focus-within:border-primary transition-colors", bordaDePreenchido(niche))}>
                    <select
                      id="company-niche"
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[13px]"
                    >
                      {/* Opção vazia desabilitada: sem ela o campo já nasceria
                          marcado em "E-commerce", e quem não mexesse ficaria
                          indistinguível de quem escolheu E-commerce de verdade. */}
                      <option value="" disabled>Selecione</option>
                      {NICHES.map(({ label }) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 px-3 py-[9px] pointer-events-none w-full">
                      <span className={cn("text-[13px]", niche ? "text-foreground" : "text-muted-foreground")}>
                        {niche || "Selecione o segmento"}
                      </span>
                      <ChevronDown size={12} className="text-muted-foreground ml-auto" />
                    </div>
                  </div>
                </div>

                <div className="space-y-[3px]">
                  <Label htmlFor="company-porte" className="text-[13px] font-normal text-black">
                    Qual o porte da sua empresa?
                  </Label>
                  {/* Lista suspensa como o segmento logo acima: são sete opções
                      com frase inteira ("De 11 a 20 funcionários"), e em caixas
                      lado a lado cada rótulo quebraria em três linhas.

                      Não confundir com a pergunta da faixa verde abaixo: esta é
                      quantas pessoas a empresa TEM, aquela é quantas vão USAR o
                      Rezult. Vão para colunas diferentes, `company_size` e
                      `expected_users`. */}
                  <div className={cn("relative flex items-center border border-input rounded-[5px] bg-white focus-within:border-primary transition-colors", bordaDePreenchido(companySize))}>
                    <select
                      id="company-porte"
                      value={companySize}
                      onChange={(e) => setCompanySize(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[13px]"
                    >
                      <option value="" disabled>Selecione</option>
                      {PORTES_DE_EMPRESA.map((porte) => (
                        <option key={porte} value={porte}>{porte}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 px-3 py-[9px] pointer-events-none w-full">
                      <span className={cn("text-[13px] truncate", companySize ? "text-foreground" : "text-muted-foreground")}>
                        {companySize || "Selecione o porte"}
                      </span>
                      <ChevronDown size={12} className="text-muted-foreground ml-auto shrink-0" />
                    </div>
                  </div>
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
                <div className="space-y-[3px]">
                  <Label className="text-[13px] font-semibold text-black">
                    Quais resultados você busca alcançar com o Rezult?
                  </Label>
                  <p className="block text-[12px] leading-none text-muted-foreground mt-1 mb-[16px]">
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

            {/* ── Step 4 ── */}
            {step === 4 && (
              <div className="space-y-[14px]">
                {/* Linha 1: País + CEP */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-[3px]">
                    <Label className="text-[13px] font-normal text-black">País</Label>
                    <div className="relative flex items-center border border-input rounded-[5px] bg-white focus-within:border-primary transition-colors">
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[13px]"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.flag} {c.label}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2 px-3 py-[9px] pointer-events-none w-full">
                        <span className="text-[15px] leading-none">{COUNTRIES.find(c => c.value === country)?.flag}</span>
                        <span className="text-[13px] text-foreground">{COUNTRIES.find(c => c.value === country)?.label}</span>
                        <ChevronDown size={12} className="text-muted-foreground ml-auto" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-[3px]">
                    <Label htmlFor="zip" className="text-[13px] font-normal text-black">CEP</Label>
                    <div className="relative">
                      <Input
                        id="zip"
                        type="text"
                        placeholder="00000-000"
                        value={zipCode}
                        onChange={(e) => handleCepChange(e.target.value)}
                        className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(zipCode))}
                        maxLength={9}
                      />
                      {loadingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Linha 2: Endereço + Número + Complemento */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                  <div className="space-y-[3px]">
                    <Label htmlFor="address" className="text-[13px] font-normal text-black">Endereço</Label>
                    <Input
                      id="address"
                      type="text"
                      placeholder="Rua, Avenida..."
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(address))}
                    />
                  </div>
                  <div className="space-y-[3px] w-[90px]">
                    <Label htmlFor="number" className="text-[13px] font-normal text-black">Número</Label>
                    <Input
                      id="number"
                      type="text"
                      placeholder="123"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(number))}
                    />
                  </div>
                  <div className="space-y-[3px] w-[120px]">
                    <Label htmlFor="complement" className="text-[13px] font-normal text-black">Complemento</Label>
                    <Input
                      id="complement"
                      type="text"
                      placeholder="Apto, Sala..."
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(complement, true))}
                    />
                  </div>
                </div>

                {/* Linha 3: Bairro + Cidade + UF */}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <div className="space-y-[3px]">
                    <Label htmlFor="neighborhood" className="text-[13px] font-normal text-black">Bairro</Label>
                    <Input
                      id="neighborhood"
                      type="text"
                      placeholder="Bairro"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(neighborhood))}
                    />
                  </div>
                  <div className="space-y-[3px]">
                    <Label htmlFor="city" className="text-[13px] font-normal text-black">Cidade</Label>
                    <Input
                      id="city"
                      type="text"
                      placeholder="São Paulo"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(city))}
                    />
                  </div>
                  <div className="space-y-[3px] w-[70px]">
                    <Label htmlFor="uf" className="text-[13px] font-normal text-black">UF</Label>
                    <Input
                      id="uf"
                      type="text"
                      placeholder="SP"
                      value={uf}
                      onChange={(e) => setUf(e.target.value.toUpperCase())}
                      className={cn("h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary", bordaDePreenchido(uf))}
                      maxLength={2}
                    />
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
              <Button
                type="button"
                onClick={step === TOTAL_DE_ETAPAS ? handleSubmit : handleNext}
                className="h-auto py-[9px] px-5 rounded-[5px] font-semibold"
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
