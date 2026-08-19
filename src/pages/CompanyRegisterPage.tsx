import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
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
  { title: "Bem-vindo!",                          subtitle: "Conte-nos como sua empresa se chamará.", sideLabel: "Nome da empresa" },
  { title: "Como podemos falar com você?",        subtitle: "Informe e-mail e telefone para contato.", sideLabel: "Contato" },
  { title: "Qual é o nicho da sua empresa?",      subtitle: "Selecione um dos nichos abaixo.", sideLabel: "Nicho" },
  { title: "Onde sua empresa está localizada?",   subtitle: "Informe o endereço completo para personalizar sua experiência.", sideLabel: "Endereço" },
];

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

  // Membro convidado: já tem empresa, não precisa cadastrar
  useEffect(() => {
    if (!companyLoading && company) {
      navigate("/dashboard", { replace: true });
    }
  }, [companyLoading, company, navigate]);

  const [step, setStep]               = useState<Step>(1);
  const [submitting, setSubmitting]   = useState(false);
  const [progressVal, setProgressVal] = useState(0);

  const [companyName, setCompanyName] = useState("");

  const [companyEmail, setCompanyEmail] = useState("");
  const [ddi, setDdi]   = useState("+55");
  const [phone, setPhone] = useState("");

  const [niche, setNiche] = useState("");

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
    if (step === 1) {
      if (!companyName.trim()) { toast.error("Informe o nome da empresa."); return; }
      setStep(2);
    } else if (step === 2) {
      if (!companyEmail.trim()) { toast.error("Informe o e-mail da empresa."); return; }
      if (!phone.trim())        { toast.error("Informe o telefone.");           return; }
      setStep(3);
    } else if (step === 3) {
      if (!niche) { toast.error("Selecione um nicho."); return; }
      setStep(4);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleSubmit = async () => {
    if (!user) return;

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
      email:           companyEmail.trim(),
      phone:           `${ddi}${phone}`,
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

    await supabase.from("profiles").update({ company_name: companyName.trim() }).eq("id", user.id);
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
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F2F7F5" }}>
        <div className="w-full max-w-[420px] text-center">
          <div className="flex justify-center mb-8">
            <img src="/logo-rezult.png" alt="Rezult CRM" className="h-10 w-auto" />
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
  const { title, subtitle } = STEP_META[step - 1];
  const stepProgress = (step / 4) * 100;

  return (
    <div className="min-h-screen overflow-y-auto flex items-center justify-center px-4 py-10" style={{ background: "#F2F7F5" }}>
      <div className="relative w-full max-w-[1000px] rounded-[7px] p-[1px] overflow-hidden">
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
              <img src="/logo-rezult.png" alt="Rezult CRM" className="h-7 w-auto" />
            </div>

            <h2 className="text-[15px] font-semibold text-foreground mb-1">Cadastre sua empresa</h2>
            <p className="text-[12px] text-muted-foreground leading-snug mb-6">
              Informe os dados da sua empresa para que possamos deixar tudo arrumado para você.
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
              <h1 className="text-[20px] font-semibold text-foreground">{title}</h1>
              <span className="text-[12px] text-muted-foreground font-medium shrink-0 ml-2">{step}/4</span>
            </div>

            {/* Progress bar */}
            <div className="h-[3px] bg-border rounded-full mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${stepProgress}%` }}
              />
            </div>

            <p className="text-[14px] text-foreground mt-[15px] mb-4" style={{ fontWeight: 600 }}>{subtitle}</p>

            {/* ── Step 1 ── */}
            {step === 1 && (
              <div className="space-y-[3px]">
                <Label htmlFor="company-name" className="text-[13px] font-normal text-black">Nome da empresa</Label>
                <Input
                  id="company-name"
                  type="text"
                  placeholder="Inclua o nome da sua empresa"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNext()}
                  className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                  autoFocus
                />
              </div>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="space-y-[3px]">
                  <Label htmlFor="company-email" className="text-[13px] font-normal text-black">E-mail da empresa</Label>
                  <Input
                    id="company-email"
                    type="email"
                    placeholder="contato@empresa.com"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                  />
                </div>
                <div className="space-y-[3px]">
                  <Label className="text-[13px] font-normal text-black">Telefone</Label>
                  <div className="flex items-center border border-input rounded-[5px] focus-within:border-primary transition-colors bg-white">
                    <div className="relative shrink-0">
                      <select
                        value={ddi}
                        onChange={(e) => setDdi(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[13px]"
                      >
                        {DDI_OPTIONS.map((o) => (
                          <option key={o.code} value={o.code}>{o.flag} {o.short} {o.code}</option>
                        ))}
                      </select>
                      <div className="px-3 py-[9px] flex items-center gap-1 border-r border-input pointer-events-none">
                        <span className="text-[15px] leading-none">{DDI_OPTIONS.find(o => o.code === ddi)?.flag}</span>
                        <ChevronDown size={11} className="text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center flex-1 px-3 gap-1">
                      <span className="text-[13px] text-muted-foreground shrink-0">{ddi}</span>
                      <input
                        type="tel"
                        placeholder="(11) 99999-9999"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        className="flex-1 text-[13px] outline-none bg-transparent py-[9px] text-foreground placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3 ── */}
            {step === 3 && (
              <div className="grid grid-cols-2 gap-2">
                {NICHES.map(({ label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setNiche(label)}
                    className={cn(
                      "flex items-center justify-center px-3 py-[30px] rounded-[7px] border text-center transition-all",
                      "hover:border-primary/60 hover:bg-primary/5",
                      niche === label
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-300 text-foreground"
                    )}
                  >
                    <span className="text-[12px] font-medium leading-tight">{label}</span>
                  </button>
                ))}
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
                        className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                      className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                      className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                      className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                      className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                      className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                      className="h-auto rounded-[5px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                onClick={step === 4 ? handleSubmit : handleNext}
                className="h-auto py-[9px] px-5 rounded-[5px] font-semibold"
              >
                {step === 4 ? "Criar conta" : (
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
