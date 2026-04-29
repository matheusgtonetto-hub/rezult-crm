import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
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
  { label: "Comércio de Vendas",       icon: Store },
  { label: "Clínicas",                 icon: HeartPulse },
  { label: "Escritório de Advogados",  icon: Scale },
  { label: "Agências",                 icon: Megaphone },
  { label: "Outros",                   icon: MoreHorizontal },
];

const COUNTRIES = [
  { value: "BR", label: "Brasil" },
  { value: "US", label: "Estados Unidos" },
  { value: "PT", label: "Portugal" },
  { value: "AR", label: "Argentina" },
  { value: "MX", label: "México" },
  { value: "CO", label: "Colômbia" },
  { value: "CL", label: "Chile" },
  { value: "UY", label: "Uruguai" },
  { value: "PE", label: "Peru" },
  { value: "GB", label: "Reino Unido" },
  { value: "DE", label: "Alemanha" },
  { value: "FR", label: "França" },
  { value: "ES", label: "Espanha" },
  { value: "IT", label: "Itália" },
];

const STEP_META = [
  { title: "Bem-vindo!",                          subtitle: "Conte-nos como sua empresa se chamará." },
  { title: "Como podemos falar com você?",        subtitle: "Informe e-mail e telefone para contato." },
  { title: "Qual é o nicho da sua empresa?",      subtitle: "Selecione um dos nichos abaixo." },
  { title: "Onde sua empresa está localizada?",   subtitle: "Preencha os dados de endereço." },
];

type Step = 1 | 2 | 3 | 4;

export default function CompanyRegisterPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetchCompany } = useCompany();

  const [step, setStep]           = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [progressVal, setProgressVal] = useState(0);

  // Step 1
  const [companyName, setCompanyName] = useState("");

  // Step 2
  const [companyEmail, setCompanyEmail] = useState("");
  const [ddi, setDdi]   = useState("+55");
  const [phone, setPhone] = useState("");

  // Step 3
  const [niche, setNiche] = useState("");

  // Step 4
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
      } catch { /* network error — fields stay empty for manual fill */ }
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

    setSubmitting(true);

    const planExpiresAt = new Date();
    planExpiresAt.setDate(planExpiresAt.getDate() + 2);

    const { error } = await supabase.from("companies").insert({
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
      plan:            "free",
      plan_expires_at: planExpiresAt.toISOString(),
    });

    if (error) {
      console.error("companies insert error:", error);
      toast.error(`Erro ao criar empresa: ${error.message}`);
      setSubmitting(false);
      return;
    }

    supabase
      .from("profiles")
      .update({ company_name: companyName.trim() })
      .eq("id", user.id)
      .then(() => {});

    // Refresh CompanyContext so AppLayout sees the new company immediately
    refetchCompany();

    // Animate 0 → 100% over 4 s (100 ticks × 100 ms)
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

  // ─── Loading screen ──────────────────────────────────────────────────────────
  if (submitting) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: "#F0F4F8" }}
      >
        <div className="w-full max-w-[420px] text-center">
          <div className="flex justify-center mb-8">
            <Logo size="md" showIcon />
          </div>

          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>

          <h2 className="text-xl font-bold text-foreground mb-2">
            Estamos preparando sua conta...
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Isso vai levar apenas alguns segundos.
          </p>

          <div className="w-full bg-border rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${progressVal}%`, transition: "width 40ms linear" }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">{progressVal}%</p>
        </div>
      </div>
    );
  }

  // ─── Wizard ──────────────────────────────────────────────────────────────────
  const { title, subtitle } = STEP_META[step - 1];
  const stepProgress = (step / 4) * 100;

  return (
    <div
      className="min-h-screen flex items-start justify-center px-4 py-10"
      style={{ background: "#F0F4F8" }}
    >
      <div
        className="w-full max-w-[520px] bg-card rounded-2xl overflow-hidden"
        style={{ boxShadow: "0 8px 32px -8px rgba(15,23,42,0.12), 0 2px 8px -2px rgba(15,23,42,0.06)" }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-border">
          <div
            className="h-1 bg-primary transition-all duration-500"
            style={{ width: `${stepProgress}%` }}
          />
        </div>

        <div className="p-10">
          {/* Logo + step counter */}
          <div className="flex items-center justify-between mb-8">
            <Logo size="md" showIcon />
            <span className="text-xs text-muted-foreground font-medium">
              Passo {step} de 4
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-8">{subtitle}</p>

          {/* ── Step 1: Company name ── */}
          {step === 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="company-name" className="text-xs font-medium">
                Nome da empresa
              </Label>
              <Input
                id="company-name"
                type="text"
                placeholder="Ex: Minha Empresa Ltda"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNext()}
                className="h-11 rounded-lg"
                autoFocus
              />
            </div>
          )}

          {/* ── Step 2: Email + phone ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company-email" className="text-xs font-medium">
                  E-mail da empresa
                </Label>
                <Input
                  id="company-email"
                  type="email"
                  placeholder="contato@empresa.com"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  className="h-11 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Telefone</Label>
                <div className="flex gap-2">
                  <select
                    value={ddi}
                    onChange={(e) => setDdi(e.target.value)}
                    className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring shrink-0"
                    style={{ minWidth: 110 }}
                  >
                    {DDI_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.flag} {o.code}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="tel"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11 rounded-lg flex-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Niche grid ── */}
          {step === 3 && (
            <div className="grid grid-cols-2 gap-3">
              {NICHES.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setNiche(label)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-center transition-all",
                    "hover:border-primary/60 hover:bg-primary/5",
                    niche === label
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-foreground"
                  )}
                >
                  <Icon
                    size={22}
                    className={niche === label ? "text-primary" : "text-muted-foreground"}
                  />
                  <span className="text-xs font-medium leading-tight">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 4: Location ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">País</Label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="zip" className="text-xs font-medium">CEP</Label>
                <div className="relative">
                  <Input
                    id="zip"
                    type="text"
                    placeholder="00000-000"
                    value={zipCode}
                    onChange={(e) => handleCepChange(e.target.value)}
                    className="h-11 rounded-lg"
                    maxLength={9}
                  />
                  {loadingCep && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs font-medium">Endereço</Label>
                <Input
                  id="address"
                  type="text"
                  placeholder="Rua, Avenida..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="number" className="text-xs font-medium">Número</Label>
                  <Input
                    id="number"
                    type="text"
                    placeholder="123"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className="h-11 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="complement" className="text-xs font-medium">Complemento</Label>
                  <Input
                    id="complement"
                    type="text"
                    placeholder="Apto, Sala..."
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="h-11 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="neighborhood" className="text-xs font-medium">Bairro</Label>
                <Input
                  id="neighborhood"
                  type="text"
                  placeholder="Bairro"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="h-11 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-xs font-medium">Cidade</Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="São Paulo"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-11 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="uf" className="text-xs font-medium">UF</Label>
                  <Input
                    id="uf"
                    type="text"
                    placeholder="SP"
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    className="h-11 rounded-lg"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="h-11 px-4 rounded-lg"
              >
                <ChevronLeft size={16} className="mr-1" />
                Voltar
              </Button>
            )}
            <Button
              type="button"
              onClick={step === 4 ? handleSubmit : handleNext}
              className="flex-1 h-11 rounded-lg font-semibold"
            >
              {step === 4 ? (
                "Criar conta"
              ) : (
                <>
                  Continuar
                  <ChevronRight size={16} className="ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
