import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useProfile } from "@/context/ProfileContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
// Select mantido para uso em outras seções
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, User, Tag, Package, X, XCircle, List, FormInput, Building2,
  Clock, Activity, Plug, Link2, KeyRound, Server, HardDrive,
  CheckCircle2, Trash2, Pencil, Plus, Upload, Copy, Eye, EyeOff,
  Phone, Mail, Calendar, MessageSquare, MapPin, Lock, Users, Crown,
  UserPlus, UserMinus, FileText, CreditCard, Check, Zap, Webhook, Globe, ChevronDown,
  Search, ExternalLink, Settings, Settings2, KanbanSquare, Rocket, CalendarDays, Loader2,
  type LucideIcon,
} from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { useSubscription } from "@/hooks/useSubscription";
import { PLANS } from "@/data/plans";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import IntegracoesPage from "./IntegracoesPage";

type SectionId =
  | "perfil" | "empresa" | "planos" | "tags" | "produtos" | "motivos" | "listas" | "campos"
  | "departamentos" | "horarios" | "atividades" | "integracoes"
  | "conexoes" | "api" | "mcp" | "armazenamento";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "perfil",  label: "Meu perfil",          icon: User },
  { id: "planos",  label: "Planos e pagamentos", icon: CreditCard },
  { id: "empresa", label: "Empresa",             icon: Building2 },
  { id: "tags",    label: "Tags",                icon: Tag },
  { id: "produtos", label: "Produtos", icon: Package },
  { id: "motivos", label: "Motivos de perda", icon: XCircle },
  { id: "listas", label: "Listas", icon: List },
  { id: "campos", label: "Campos adicionais", icon: FormInput },
  { id: "departamentos", label: "Departamentos", icon: Building2 },
  { id: "horarios", label: "Horários de trabalho", icon: Clock },
  { id: "atividades", label: "Tipos de atividades", icon: Activity },
  { id: "integracoes", label: "Integrações", icon: Plug },
  { id: "conexoes", label: "Conexões", icon: Link2 },
  { id: "api", label: "Chaves de API", icon: KeyRound },
  { id: "mcp", label: "Servidor MCP", icon: Server },
  { id: "armazenamento", label: "Armazenamento", icon: HardDrive },
];

const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`bg-card border border-card-border rounded-xl p-6 mb-5 ${className}`}>{children}</div>
);

const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-4">
    <h2 className="text-base font-semibold text-foreground">{title}</h2>
    {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
  </div>
);

const ADMIN_ONLY_SECTIONS: SectionId[] = ["planos", "empresa"];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const { logout, products } = useCRM();
  const { isOwner } = useCompany();
  const [pwOpen, setPwOpen] = useState(false);
  const [twoFA, setTwoFA] = useState(false);

  const visibleSections = SECTIONS.filter(s =>
    isOwner || !ADMIN_ONLY_SECTIONS.includes(s.id)
  );

  // Deriva a aba ativa a partir da URL; fallback para "perfil"
  const validIds = SECTIONS.map(s => s.id);
  const rawSection = section as SectionId | undefined;
  const active: SectionId =
    rawSection && validIds.includes(rawSection) && (isOwner || !ADMIN_ONLY_SECTIONS.includes(rawSection))
      ? rawSection
      : "perfil";

  function setActive(id: SectionId) {
    navigate(`/configuracoes/${id}`, { replace: true });
  }

  // Redireciona para /configuracoes/perfil se a URL não tiver seção
  useEffect(() => {
    if (!section) navigate("/configuracoes/perfil", { replace: true });
  }, [section, navigate]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-[200px] bg-card border-r border-card-border flex flex-col shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-[13px] text-muted-foreground hover:bg-muted px-4 py-3 border-b border-card-border"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleSections.map(s => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-2.5 text-[13px] px-4 py-2.5 transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary border-l-[3px] border-primary font-medium pl-[13px]"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <s.icon size={14} />
                {s.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {active === "perfil"  && <PerfilSection setPwOpen={setPwOpen} />}
          {active === "empresa" && <EmpresaSection />}
          {active === "planos"  && <PlanosSection />}
          {active === "tags" && <TagsSection />}
          {active === "produtos" && <ProdutosSection />}
          {active === "motivos" && <MotivosSection />}
          {active === "listas" && <ListasSection />}
          {active === "campos" && <CamposSection />}
          {active === "departamentos" && <DepartamentosSection />}
          {active === "horarios" && <HorariosSection />}
          {active === "atividades" && <AtividadesSection />}
          {active === "integracoes" && <IntegracoesSection />}
          {active === "conexoes" && <ConexoesSection />}
          {active === "api" && <ApiSection />}
          {active === "mcp" && <McpSection />}
          {active === "armazenamento" && <ArmazenamentoSection />}
        </div>
      </div>

      <ChangePasswordDialog open={pwOpen} setOpen={setPwOpen} />
    </div>
  );
}

/* ---------------- PERFIL ---------------- */
function PerfilSection({ setPwOpen }: { setPwOpen: (open: boolean) => void }) {
  const { profile, updateProfile, uploadAvatar, updateTheme } = useProfile();
  const { user, signOut } = useAuth();
  const { company } = useCompany();
  const [name, setName]       = useState(profile?.full_name ?? "");
  const [phone, setPhone]     = useState(maskPhone(profile?.phone ?? ""));
  const [theme, setTheme]     = useState<"light" | "dark">(profile?.theme ?? "light");
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync fields when profile loads asynchronously
  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setPhone(maskPhone(profile.phone ?? ""));
      setTheme(profile.theme ?? "light");
    }
  }, [profile?.id]);

  const handleTheme = async (t: "light" | "dark") => {
    setTheme(t);
    try {
      await updateTheme(t);
    } catch {
      toast.error("Erro ao salvar tema.");
    }
  };

  const initials = (n: string) =>
    n.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const authEmail = user?.email ?? profile?.email ?? "";

  const createdDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "";

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ full_name: name, phone });
      toast.success("Perfil atualizado com sucesso");
    } catch {
      toast.error("Erro ao salvar perfil. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo maior que 2MB."); return; }
    setUploading(true);
    try {
      await uploadAvatar(file);
      toast.success("Foto atualizada!");
    } catch {
      toast.error("Erro ao fazer upload.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <h1 className="text-xl font-semibold text-foreground mb-6">Meu perfil</h1>

      {/* Cabeçalho do perfil */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-semibold shrink-0 overflow-hidden">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
              : initials(name || "?")}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {/* Nome reativo — sempre reflete o full_name salvo em profiles */}
              <h2 className="text-lg font-bold text-foreground">
                {profile?.full_name || "—"}
              </h2>
              <CheckCircle2 size={16} className="text-primary" />
            </div>
            <p className="text-[13px] text-muted-foreground mt-1">{authEmail}</p>
            {createdDate && (
              <p className="text-xs text-muted-foreground mt-1">Conta criada em {createdDate}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="border-card-border text-muted-foreground">
            Sair
          </Button>
        </div>
      </Card>

      {/* Seção Informações */}
      <Card>
        <SectionTitle title="Informações" subtitle="Suas informações de cadastro e login" />
        <div className="grid grid-cols-2 gap-4">

          {/* Nome — salva em profiles */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome completo"
              className="border-card-border"
            />
          </div>

          {/* Telefone — salva em companies */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Telefone</label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>

          {/* E-mail — somente leitura, vem do auth */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-xs text-muted-foreground">E-mail</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock size={11} className="text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="max-w-[220px] text-[12px] leading-relaxed"
                >
                  O e-mail não pode ser alterado pois está vinculado ao seu plano e acesso
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative">
              <Input
                type="email"
                value={authEmail}
                readOnly
                disabled
                className="border-card-border bg-muted/50 text-muted-foreground cursor-not-allowed pr-9"
              />
              <Lock
                size={13}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
              />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Senha</label>
            <Button
              variant="outline"
              onClick={() => setPwOpen(true)}
              className="w-full border-card-border text-muted-foreground justify-start"
            >
              Alterar senha
            </Button>
          </div>
        </div>

        <div className="flex justify-end mt-5 pt-4 border-t border-card-border">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 min-w-[100px]"
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </Card>

      {/* Preferências */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Preferências</p>
            <p className="text-xs text-muted-foreground mt-0.5">Personalize a aparência do app selecionando o tema</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Tema</label>
            <Select value={theme} onValueChange={(v) => handleTheme(v as "light" | "dark")}>
              <SelectTrigger className="border-card-border w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Imagem de perfil */}
      <Card>
        <SectionTitle title="Imagem de perfil" subtitle="Faça o upload da sua imagem de perfil aqui" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white font-semibold shrink-0 overflow-hidden">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
              : initials(name || "?")}
          </div>
          <div
            className="flex-1 border-[1.5px] border-dashed border-card-border rounded-lg p-6 text-center hover:border-primary cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <Upload size={20} className="text-muted-foreground mx-auto mb-1" />
            <p className="text-[13px] text-muted-foreground">{uploading ? "Enviando..." : "Escolher arquivo"}</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF · max 2MB</p>
          </div>
        </div>
      </Card>

      {company && (
        <Card>
          <SectionTitle title="Empresa" subtitle="Empresa vinculada à sua conta" />
          <div className="border border-card-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-primary text-white flex items-center justify-center text-sm font-semibold">
                  {company.name?.[0]?.toUpperCase() ?? "E"}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">{company.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {{"free":"Trial gratuito","pro":"Plano Pro","enterprise":"Plano Enterprise","starter":"Plano Starter"}[company.plan] ?? company.plan}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="border-[#FECACA] bg-[#FEF2F2]">
        <SectionTitle title="Excluir conta" subtitle="Você tem um prazo de 30 dias para poder restaurar sua conta." />
        <Button variant="outline" className="border-[#E24B4A] text-[#E24B4A] hover:bg-[#E24B4A] hover:text-white">
          <Trash2 size={14} className="mr-2" /> Excluir conta
        </Button>
      </Card>
    </TooltipProvider>
  );
}

/* ---------------- EMPRESA ---------------- */
function maskCPF(v: string) {
  return v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskCNPJ(v: string) {
  return v.replace(/\D/g, "").slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function maskCEP(v: string) {
  return v.replace(/\D/g, "").slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : "";
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center h-10 border border-card-border rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary">
      <div className="flex items-center gap-1.5 px-3 h-full bg-muted/50 border-r border-card-border shrink-0 select-none">
        <span className="text-base leading-none">🇧🇷</span>
        <span className="text-sm text-muted-foreground font-medium">+55</span>
      </div>
      <input
        type="tel"
        value={value}
        onChange={e => onChange(maskPhone(e.target.value))}
        placeholder="(11) 99999-0000"
        maxLength={15}
        className="flex-1 px-3 h-full text-sm outline-none bg-white text-foreground placeholder:text-muted-foreground/50"
      />
    </div>
  );
}

function EmpresaSection() {
  const { company, updateCompany, uploadLogo } = useCompany();
  const fileRef = useRef<HTMLInputElement>(null);
  const [empresaTab, setEmpresaTab] = useState<"informacoes" | "equipe">("informacoes");

  const [name,         setName]         = useState("");
  const [email,        setEmail]        = useState("");
  const [niche,        setNiche]        = useState("");
  const [phone,        setPhone]        = useState("");
  const [docType,      setDocType]      = useState<"pj" | "pf">("pj");
  const [document,     setDocument]     = useState("");
  const [zipCode,      setZipCode]      = useState("");
  const [address,      setAddress]      = useState("");
  const [number,       setNumber]       = useState("");
  const [complement,   setComplement]   = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city,         setCity]         = useState("");
  const [state,        setState]        = useState("");
  const [saving,       setSaving]       = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [loadingCep,   setLoadingCep]   = useState(false);

  useEffect(() => {
    if (!company) return;
    setName(company.name ?? "");
    setEmail(company.email ?? "");
    setNiche(company.niche ?? "");
    setPhone(maskPhone(company.phone ?? ""));
    setDocType((company.document_type as "pj" | "pf") ?? "pj");
    setDocument(company.document ?? "");
    setZipCode(company.zip_code ?? "");
    setAddress(company.address ?? "");
    setNumber(company.number ?? "");
    setComplement(company.complement ?? "");
    setNeighborhood(company.neighborhood ?? "");
    setCity(company.city ?? "");
    setState(company.state ?? "");
  }, [company?.id]);

  const handleDocChange = (v: string) => {
    setDocument(docType === "pf" ? maskCPF(v) : maskCNPJ(v));
  };

  const handleCepChange = async (raw: string) => {
    const formatted = maskCEP(raw);
    setZipCode(formatted);
    const clean = raw.replace(/\D/g, "");
    if (clean.length === 8) {
      setLoadingCep(true);
      try {
        const res  = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setAddress(data.logradouro ?? "");
          setNeighborhood(data.bairro ?? "");
          setCity(data.localidade ?? "");
          setState(data.uf ?? "");
        }
      } catch { /* manual fill */ }
      setLoadingCep(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome da empresa é obrigatório."); return; }
    setSaving(true);
    try {
      await updateCompany({
        name: name.trim(),
        email: email.trim(),
        niche: niche.trim(),
        phone: phone.trim(),
        document_type: docType,
        document: document.replace(/\D/g, ""),
        zip_code: zipCode.replace(/\D/g, ""),
        address, number, complement, neighborhood, city, state,
      });
      toast.success("Dados da empresa atualizados!");
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo maior que 2MB."); return; }
    setUploading(true);
    try {
      await uploadLogo(file);
      toast.success("Logo atualizado!");
    } catch {
      toast.error("Erro ao fazer upload do logo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const logoInitial = (company?.name?.[0] ?? "E").toUpperCase();

  const createdDate = company?.created_at
    ? new Date(company.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-6">Empresa</h1>

      {/* Cabeçalho da empresa */}
      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white text-xl font-semibold shrink-0 overflow-hidden">
            {company?.logo_url
              ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain" />
              : logoInitial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{company?.name || "—"}</h2>
              <CheckCircle2 size={16} className="text-primary" />
            </div>
            {company?.email && (
              <p className="text-[13px] text-muted-foreground mt-0.5">{company.email}</p>
            )}
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-2 flex-wrap">
                {company?.niche && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-foreground bg-card text-[11px] font-medium text-foreground">
                    {company.niche}
                  </span>
                )}
                {createdDate && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <Calendar size={12} className="text-muted-foreground shrink-0" />
                    {createdDate}
                  </span>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {(["informacoes", "equipe"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setEmpresaTab(tab)}
                    className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                      empresaTab === tab
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {tab === "informacoes" ? "Informações" : "Equipe"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {empresaTab === "equipe" && <EquipeSection />}

      {empresaTab === "informacoes" && <>

      {/* Informações principais */}
      <Card>
        <SectionTitle title="Informações" subtitle="Principais informações sobre sua empresa" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nome da empresa *</label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="Preencha com o nome da sua empresa" className="border-card-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">E-mail da empresa</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Preencha com o e-mail da sua empresa" className="border-card-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nicho</label>
            <Input value={niche} onChange={e => setNiche(e.target.value)}
              placeholder="Exemplo: Vendas" className="border-card-border" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Telefone</label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>
        </div>
      </Card>

      {/* Logo */}
      <Card>
        <SectionTitle title="Logo da empresa" subtitle="Faça o upload do logotipo da sua empresa aqui" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-white text-2xl font-bold shrink-0 overflow-hidden border border-card-border">
            {company?.logo_url
              ? <img src={company.logo_url} alt="Logo" className="w-full h-full object-contain" />
              : logoInitial}
          </div>
          <div
            className="flex-1 border-[1.5px] border-dashed border-card-border rounded-lg p-6 text-center hover:border-primary cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <Upload size={20} className="text-muted-foreground mx-auto mb-1" />
            <p className="text-[13px] text-muted-foreground">{uploading ? "Enviando..." : "Escolher arquivo"}</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG · max 2MB</p>
          </div>
        </div>
      </Card>

      {/* Documentos */}
      <Card>
        <SectionTitle title="Documentos" subtitle="Cadastre os dados da sua empresa" />
        <div className="space-y-4">
          {/* Tipo de pessoa */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Tipo de Pessoa</label>
            <div className="flex gap-2">
              {(["pj", "pf"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setDocType(t); setDocument(""); }}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                    docType === t
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-muted-foreground border-card-border hover:border-primary"
                  }`}
                >
                  {t === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}
                </button>
              ))}
            </div>
          </div>

          {/* Documento */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {docType === "pj" ? "CNPJ" : "CPF"}
            </label>
            <Input
              value={document}
              onChange={e => handleDocChange(e.target.value)}
              placeholder={docType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
              className="border-card-border"
            />
          </div>
        </div>
      </Card>

      {/* Endereço */}
      <Card>
        <SectionTitle title="Endereço" subtitle="Endereço completo da sua empresa" />
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">CEP</label>
            <div className="relative">
              <Input value={zipCode} onChange={e => handleCepChange(e.target.value)}
                placeholder="00000-000" className="border-card-border" maxLength={9} />
              {loadingCep && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Endereço</label>
            <Input value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Rua, Avenida..." className="border-card-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Número</label>
              <Input value={number} onChange={e => setNumber(e.target.value)}
                placeholder="123" className="border-card-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Complemento</label>
              <Input value={complement} onChange={e => setComplement(e.target.value)}
                placeholder="Apto, Sala..." className="border-card-border" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Bairro</label>
            <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              placeholder="Bairro" className="border-card-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cidade</label>
              <Input value={city} onChange={e => setCity(e.target.value)}
                placeholder="São Paulo" className="border-card-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">UF</label>
              <Input value={state} onChange={e => setState(e.target.value.toUpperCase())}
                placeholder="SP" className="border-card-border" maxLength={2} />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5 pt-4 border-t border-card-border">
          <Button onClick={handleSave} disabled={saving}
            className="bg-primary hover:bg-primary/90 min-w-[100px]">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </Card>

      </>}
    </>
  );
}

/* ---------------- EQUIPE ---------------- */
interface Member {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  permissions: string[];
  is_owner: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  created_at: string;
}

const PERMISSION_GROUPS = [
  {
    id: "pipelines", label: "Pipelines", icon: KanbanSquare,
    description: "Permissões relacionadas à administração de pipelines.",
    options: [
      { id: "pipelines:admin",  label: "Administrador de Pipelines", description: "Permite a criação, modificação, duplicação e configuração de pipelines." },
      { id: "pipelines:member", label: "Membro de Pipelines",        description: "Possibilita a manutenção de negócios na pipeline." },
    ],
  },
  {
    id: "automacoes", label: "Automações", icon: Zap,
    description: "Permissões relacionadas ao fluxo de automações",
    options: [
      { id: "automacoes:admin",  label: "Administrador das Automações", description: "Permite acesso à visualização das automações e a todas as ações relacionadas à elas." },
      { id: "automacoes:member", label: "Membro das Automações",        description: "Permite acesso à visualização das automações" },
    ],
  },
  {
    id: "cadastros", label: "Cadastros auxiliares", icon: Tag,
    description: "Permissões relacionadas aos cadastros auxiliares",
    options: [
      { id: "cadastros:admin",  label: "Administrador de Cadastros Auxiliares", description: "Permite acesso a criação, edição e exclusão dos auxiliares, como: produtos, tags, listas, etc." },
      { id: "cadastros:member", label: "Membro de Cadastros Auxiliares",        description: "Permite acesso à listagem de auxiliares, como: produtos, tags, listas etc." },
    ],
  },
  {
    id: "leads", label: "Leads", icon: Users,
    description: "Permissões relacionadas à gestão de leads.",
    options: [
      { id: "leads:admin",      label: "Administrador de Leads",     description: "Permite acesso à listagem de leads e a todas as ações relacionadas à eles." },
      { id: "leads:operator",   label: "Operador de Leads",          description: "Permite criação e alteração de leads (usar em conjunto com Membro de leads restrito)." },
      { id: "leads:member",     label: "Membro de Leads",            description: "Permite acesso à listagem de leads." },
      { id: "leads:restricted", label: "Membro de Leads (restrito)", description: "Acessa os leads o qual o usuário é responsável e os negócios que o usuário é o atendente responsável." },
    ],
  },
  {
    id: "impulsos", label: "Impulsos", icon: Rocket,
    description: "Permite acesso ao Impulsos.",
    options: [
      { id: "impulsos:admin", label: "Administrador de Boosts", description: "Permite acesso ao Impulsos." },
    ],
  },
  {
    id: "multiatendimento", label: "Multiatendimento", icon: MessageSquare,
    description: "Permissões relacionadas ao multiatendimento",
    options: [
      { id: "multiatendimento:admin",      label: "Administrador de multiatendimento", description: "Permite acesso completo ao multiatendimento, ao dashboard e às configurações, sem limitações." },
      { id: "multiatendimento:supervisor", label: "Supervisor de multiatendimento",    description: "Permite acesso ao multiatendimento e ao dashboard, respeitando as permissões configuradas." },
      { id: "multiatendimento:attendant",  label: "Atendente de multiatendimento",     description: "Permite acesso ao multiatendimento, limitado pelas configurações de permissões." },
    ],
  },
  {
    id: "atividades", label: "Atividades", icon: CalendarDays,
    description: "Permissões relacionadas às atividades.",
    options: [
      { id: "atividades:admin", label: "Administrador de Atividades", description: "Permite acesso ao calendário de atividade de todos atendentes." },
    ],
  },
];

const PERM_MODULE_LABELS: Record<string, string> = {
  pipelines: "Pipelines", automacoes: "Automações", cadastros: "Cadastros",
  leads: "Leads", impulsos: "Impulsos", multiatendimento: "Multi", atividades: "Atividades",
};

function permSummary(permissions: string[]): string {
  const modules = [...new Set(permissions.map(p => p.split(":")[0]))];
  return modules.map(m => PERM_MODULE_LABELS[m] ?? m).join(" · ");
}

function PermissionsEditor({
  permissions, onChange,
}: { permissions: string[]; onChange: (p: string[]) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(PERMISSION_GROUPS.map(g => [g.id, true]))
  );

  const toggle = (permId: string) => {
    const next = permissions.includes(permId)
      ? permissions.filter(p => p !== permId)
      : [...permissions.filter(p => !p.startsWith(permId.split(":")[0] + ":")), permId];
    onChange(next);
  };

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      {PERMISSION_GROUPS.map(group => {
        const Icon = group.icon;
        const isOpen = openGroups[group.id] ?? true;
        const groupSelected = group.options.some(o => permissions.includes(o.id));
        return (
          <div key={group.id} className="border border-card-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenGroups(prev => ({ ...prev, [group.id]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${groupSelected ? "bg-primary/10" : "bg-muted"}`}>
                <Icon size={14} className={groupSelected ? "text-primary" : "text-muted-foreground"} />
              </div>
              <div className="flex-1 text-left">
                <p className={`text-[13px] font-semibold ${groupSelected ? "text-primary" : "text-foreground"}`}>{group.label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{group.description}</p>
              </div>
              <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="divide-y divide-card-border">
                {group.options.map(opt => {
                  const selected = permissions.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${selected ? "bg-primary/10" : "bg-white hover:bg-muted/50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(opt.id)}
                        className="mt-0.5 accent-primary w-4 h-4 shrink-0"
                      />
                      <div>
                        <p className={`text-[13px] font-medium ${selected ? "text-primary" : "text-foreground"}`}>{opt.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{opt.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EquipeSection() {
  const { user } = useAuth();
  const { company } = useCompany();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePerms, setInvitePerms] = useState<string[]>([]);
  const [isAdminInvite, setIsAdminInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const isAdmin = company?.owner_id === user?.id;

  const initials = (n: string) =>
    n.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const loadMembers = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_company_members", { p_company_id: company.id });
    if (error) console.error("[EquipeSection] loadMembers error:", error);
    setMembers(
      ((data ?? []) as { id: string; full_name: string; email: string; avatar_url: string | null; permissions: string[]; is_owner: boolean }[])
        .map(r => ({ id: r.id, full_name: r.full_name, email: r.email, avatar_url: r.avatar_url, permissions: r.permissions ?? [], is_owner: r.is_owner }))
    );
    setLoading(false);
  }, [company?.id]);

  const loadPendingInvites = useCallback(async () => {
    if (!isAdmin || !company?.id) return;
    const { data, error } = await supabase
      .from("company_invites")
      .select("id, email, created_at")
      .eq("company_id", company.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (error) console.error("[EquipeSection] loadPendingInvites error:", error);
    setPendingInvites((data ?? []) as PendingInvite[]);
  }, [isAdmin, company?.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { loadPendingInvites(); }, [loadPendingInvites]);

  const handleAddMember = async () => {
    if (!inviteEmail.trim()) { toast.error("Informe o e-mail do usuário."); return; }
    setInviting(true);
    const permsToSend = isAdminInvite ? ["admin"] : invitePerms;
    const { data, error } = await supabase.rpc("add_member_to_company", {
      member_email: inviteEmail.trim().toLowerCase(),
      member_permissions: permsToSend,
    });
    setInviting(false);

    if (error) {
      console.error("[EquipeSection] add_member_to_company error:", error);
      toast.error(`Erro ao processar convite: ${error.message}`);
      return;
    }

    if (data === "ok") {
      toast.success("Membro adicionado com sucesso!");
      await Promise.all([loadMembers(), loadPendingInvites()]);
    } else if (data === "invited") {
      toast.success("Convite registrado! O acesso será liberado ao criar conta com este e-mail.");
      await loadPendingInvites();
    } else if (data === "no_company") {
      toast.error("Sua conta ainda não está vinculada a uma empresa.");
      return;
    } else {
      toast.error("Resposta inesperada do servidor.");
      return;
    }
    setInviteEmail("");
    setInvitePerms([]);
    setIsAdminInvite(false);
    setAddOpen(false);
  };

  const handleRemove = async (memberId: string) => {
    if (memberId === user?.id) { toast.error("Você não pode remover a si mesmo."); return; }
    setRemoving(memberId);
    const { error } = await supabase.rpc("remove_member_from_company", { member_id: memberId });
    setRemoving(null);
    if (error) { toast.error("Erro ao remover membro."); return; }
    toast.success("Membro removido da equipe.");
    setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const handleCancelInvite = async (email: string) => {
    setCanceling(email);
    const { error } = await supabase.rpc("cancel_company_invite", { invite_email: email });
    setCanceling(null);
    if (error) { toast.error("Erro ao cancelar convite."); return; }
    toast.success("Convite cancelado.");
    setPendingInvites(prev => prev.filter(i => i.email !== email));
  };

  const openEditPermissions = (m: Member) => {
    setEditMember(m);
    setEditPerms(m.permissions);
  };

  const handleSavePermissions = async () => {
    if (!editMember) return;
    setSavingEdit(true);
    const { error } = await supabase.rpc("update_member_permissions", {
      p_member_id: editMember.id,
      p_permissions: editPerms,
    });
    setSavingEdit(false);
    if (error) { toast.error("Erro ao salvar permissões."); return; }
    toast.success("Permissões atualizadas!");
    setMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, permissions: editPerms } : m));
    setEditMember(null);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Equipe</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gerencie os membros vinculados à sua empresa</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setAddOpen(true)} className="bg-primary hover:bg-primary/90">
            <UserPlus size={14} className="mr-1.5" /> Adicionar membro
          </Button>
        )}
      </div>

      {/* Membros ativos */}
      <Card>
        <SectionTitle title="Membros ativos" />
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <Users size={28} className="text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum membro na equipe ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(m => {
              const isSelf = m.id === user?.id;
              const summary = m.is_owner ? null : permSummary(m.permissions);
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 border border-card-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-semibold shrink-0 overflow-hidden">
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
                      : initials(m.full_name || m.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-medium text-foreground truncate">
                        {m.full_name || "—"}
                        {isSelf && <span className="text-muted-foreground font-normal ml-1">(você)</span>}
                      </p>
                      {m.is_owner && (
                        <span className="inline-flex items-center gap-1 bg-[#FFF8E7] text-[#D97706] border border-[#FDE68A] rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0">
                          <Crown size={9} /> Admin
                        </span>
                      )}
                      {!m.is_owner && m.permissions.includes("admin") && (
                        <span className="inline-flex items-center gap-1 bg-[#FFF8E7] text-[#D97706] border border-[#FDE68A] rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0">
                          <Crown size={9} /> Admin
                        </span>
                      )}
                      {!m.is_owner && !m.permissions.includes("admin") && summary && (
                        <span className="text-[10px] text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
                          {summary}
                        </span>
                      )}
                      {!m.is_owner && !m.permissions.includes("admin") && !summary && (
                        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
                          Sem permissões
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                  </div>
                  {isAdmin && !m.is_owner && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditPermissions(m)}
                        className="text-[11px] text-primary hover:underline px-2 py-1"
                        title="Editar permissões"
                      >
                        Editar permissões
                      </button>
                      <button
                        onClick={() => handleRemove(m.id)}
                        disabled={removing === m.id}
                        className="text-muted-foreground/50 hover:text-destructive p-1 transition-colors disabled:opacity-50"
                        title="Remover da equipe"
                      >
                        {removing === m.id
                          ? <div className="w-4 h-4 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                          : <UserMinus size={15} />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!loading && members.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            {members.length} {members.length === 1 ? "membro" : "membros"}
          </p>
        )}
      </Card>

      {/* Convites pendentes */}
      {isAdmin && (
        <Card>
          <SectionTitle
            title="Convites pendentes"
            subtitle="Aguardando o usuário criar uma conta com o e-mail convidado"
          />
          {pendingInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum convite pendente.</p>
          ) : (
            <div className="space-y-2">
              {pendingInvites.map(inv => (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 px-3 py-2.5 border border-card-border rounded-lg bg-muted/50"
                >
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Mail size={14} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-muted-foreground truncate">{inv.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Convidado em {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className="inline-flex items-center bg-[#FFF8E7] text-[#D97706] border border-[#FDE68A] rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0">
                    Aguardando
                  </span>
                  <button
                    onClick={() => handleCancelInvite(inv.email)}
                    disabled={canceling === inv.email}
                    className="text-muted-foreground/50 hover:text-destructive p-1 transition-colors disabled:opacity-50"
                    title="Cancelar convite"
                  >
                    {canceling === inv.email
                      ? <div className="w-4 h-4 rounded-full border-2 border-destructive border-t-transparent animate-spin" />
                      : <XCircle size={15} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Dialog: Adicionar membro */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) { setAddOpen(false); setInviteEmail(""); setInvitePerms([]); setIsAdminInvite(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar membro à equipe</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">E-mail do usuário *</label>
              <Input
                type="email"
                placeholder="joao@empresa.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="border-card-border"
                autoFocus
              />
            </div>

            {/* Toggle admin */}
            <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${isAdminInvite ? "border-[#D97706] bg-[#FFFBEB]" : "border-card-border bg-white hover:bg-muted/50"}`}>
              <input
                type="checkbox"
                checked={isAdminInvite}
                onChange={e => setIsAdminInvite(e.target.checked)}
                className="accent-[#D97706] w-4 h-4 shrink-0"
              />
              <div>
                <p className={`text-[13px] font-semibold ${isAdminInvite ? "text-[#D97706]" : "text-foreground"}`}>
                  <Crown size={12} className="inline mr-1" />
                  Administrador (acesso total)
                </p>
                <p className="text-[11px] text-muted-foreground">Igual ao dono da conta. Vê e gerencia tudo.</p>
              </div>
            </label>

            {/* Grupos de permissão — ocultos se admin */}
            {!isAdminInvite && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Permissões por módulo</p>
                <PermissionsEditor permissions={invitePerms} onChange={setInvitePerms} />
              </>
            )}

            <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-primary leading-relaxed">
                <strong>Já tem conta:</strong> o acesso é liberado imediatamente.<br />
                <strong>Sem conta ainda:</strong> o convite fica registrado e o acesso é liberado automaticamente ao criar a conta com este e-mail.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} className="border-card-border">Cancelar</Button>
            <Button onClick={handleAddMember} disabled={inviting} className="bg-primary hover:bg-primary/90">
              {inviting ? "Processando..." : "Convidar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar permissões */}
      <Dialog open={!!editMember} onOpenChange={v => !v && setEditMember(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar permissões — {editMember?.full_name || editMember?.email}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {/* Toggle admin */}
            <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${editPerms.includes("admin") ? "border-[#D97706] bg-[#FFFBEB]" : "border-card-border bg-white hover:bg-muted/50"}`}>
              <input
                type="checkbox"
                checked={editPerms.includes("admin")}
                onChange={e => setEditPerms(e.target.checked ? ["admin"] : [])}
                className="accent-[#D97706] w-4 h-4 shrink-0"
              />
              <div>
                <p className={`text-[13px] font-semibold ${editPerms.includes("admin") ? "text-[#D97706]" : "text-foreground"}`}>
                  <Crown size={12} className="inline mr-1" />
                  Administrador (acesso total)
                </p>
                <p className="text-[11px] text-muted-foreground">Igual ao dono da conta. Vê e gerencia tudo.</p>
              </div>
            </label>

            {!editPerms.includes("admin") && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Permissões por módulo</p>
                <PermissionsEditor permissions={editPerms} onChange={setEditPerms} />
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditMember(null)} className="border-card-border">Cancelar</Button>
            <Button onClick={handleSavePermissions} disabled={savingEdit} className="bg-primary hover:bg-primary/90">
              {savingEdit ? "Salvando..." : "Salvar permissões"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- PLANOS E PAGAMENTOS ---------------- */
const PLAN_LABELS: Record<string, string> = {
  free:       "Trial gratuito",
  starter:    "Starter",
  essential:  "Essential",
  pro:        "Pro",
};

const PLAN_LIMITS: Record<string, { leads: number | null; members: number | null; connections: number | null; automations: number | null; pipelines: number | null }> = {
  free:      { leads: 500,    members: 1,    connections: 1,  automations: 3,  pipelines: 2  },
  starter:   { leads: 5000,   members: 4,    connections: 3,  automations: 8,  pipelines: 5  },
  essential: { leads: 100000, members: 15,   connections: 10, automations: 20, pipelines: 20 },
  pro:       { leads: null,   members: null, connections: null, automations: null, pipelines: null },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function UsageCard({ label, current, limit, icon }: { label: string; current: number; limit: number | null; icon: React.ReactNode }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((current / limit) * 100));
  const displayLimit = limit === null ? "Ilimitado" : limit.toLocaleString("pt-BR");
  return (
    <div className="bg-white border border-card-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <p className="text-[13px] font-medium text-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground">
        {current.toLocaleString("pt-BR")}
        <span className="text-sm font-normal text-muted-foreground ml-1">/ {displayLimit}</span>
      </p>
      {limit !== null && (
        <Progress value={pct} className="h-1.5 mt-2 [&>div]:bg-primary" />
      )}
    </div>
  );
}

// ── Dados dos planos para o dialog de upgrade ────────────────────────────────

const UPGRADE_PRICES = {
  starter:   { monthly: "price_1Tbp3sHLGbQg56rmYk9RbtKj", semiannual: "price_1Tbp3sHLGbQg56rm6sleoFHK", annual: "price_1Tbp3sHLGbQg56rmuvxhNhoQ" },
  essential: { monthly: "price_1Tbp7lHLGbQg56rmxz4NpynU", semiannual: "price_1Tbp7lHLGbQg56rmnvtsYz4a", annual: "price_1Tbp7lHLGbQg56rmJcvQ4GY5" },
  pro:       { monthly: "price_1TbpAAHLGbQg56rmh1i1HdvY", semiannual: "price_1TbpAAHLGbQg56rmzhs7ffCL", annual: "price_1TbpAAHLGbQg56rmYRFZlZ3I" },
} as const;

type UpgradePlanKey = keyof typeof UPGRADE_PRICES;
type UpgradePeriod  = "monthly" | "semiannual" | "annual";

const UPGRADE_PLAN_INFO = [
  {
    key: "starter" as UpgradePlanKey,
    name: "Starter",
    prices: { monthly: "R$ 237", semiannual: "R$ 1.209", annual: "R$ 1.989" },
    monthlyEquiv: { semiannual: "R$ 201", annual: "R$ 166" },
    features: [
      "Criação e gerenciamento de até 5 pipelines com até 8 etapas.",
      "Criação e gerenciamento de negócios e produtos.",
      "Gerenciamento de até 5 mil leads com controle de tags.",
      "Cadastro de 4 membros na empresa.",
      "8 automações para otimizar interações com leads.",
      "Multiatendimento com até 3 conexões (WhatsApp, Instagram e outros).",
      "3 integrações com Webhooks para conectar outras ferramentas.",
    ],
  },
  {
    key: "essential" as UpgradePlanKey,
    name: "Essential",
    badge: "Mais popular",
    prices: { monthly: "R$ 399", semiannual: "R$ 2.035", annual: "R$ 3.352" },
    monthlyEquiv: { semiannual: "R$ 339", annual: "R$ 279" },
    features: [
      "Criação e gerenciamento de até 20 pipelines com até 15 etapas.",
      "Criação e gerenciamento de negócios e produtos.",
      "Gerenciamento de até 100 mil leads com controle de tags.",
      "Cadastro de 15 membros na empresa.",
      "20 automações para otimizar interações com leads.",
      "Multiatendimento com até 10 conexões (WhatsApp, Instagram e outros).",
      "15 integrações com Webhooks para conectar outras ferramentas.",
      "Dashboards de negócios das pipelines.",
      "Acesso à API para integração com outras ferramentas.",
    ],
  },
  {
    key: "pro" as UpgradePlanKey,
    name: "Pro",
    prices: { monthly: "R$ 747", semiannual: "R$ 3.810", annual: "R$ 6.272" },
    monthlyEquiv: { semiannual: "R$ 635", annual: "R$ 523" },
    features: [
      "Criação e gerenciamento de pipelines ilimitadas com até 25 etapas.",
      "Gerenciamento ilimitado de leads com controle de tags.",
      "Criação e gerenciamento de negócios e produtos.",
      "Cadastro ilimitado de membros na empresa.",
      "Automações ilimitadas para otimizar interações com leads.",
      "Multiatendimento com conexões ilimitadas (WhatsApp, Instagram e outros).",
      "Integrações com Webhooks ilimitadas para conectar outras ferramentas.",
      "Dashboards de negócios das pipelines.",
      "Acesso à API para integração com outras ferramentas.",
    ],
  },
];

const UPGRADE_PERIOD_LABELS: Record<UpgradePeriod, string> = {
  monthly: "Mensal", semiannual: "Semestral", annual: "Anual",
};

const UPGRADE_PERIOD_DISCOUNT: Record<UpgradePeriod, string | null> = {
  monthly: null, semiannual: "-15%", annual: "-30%",
};

// ── PlanosSection ─────────────────────────────────────────────────────────────

function PlanosSection() {
  const { company, whatsappConnections } = useCompany();
  const { user }    = useAuth();
  const { leads, pipelines, teamMembers } = useCRM();
  const { subscription } = useSubscription();

  const planKey = company?.plan ?? "free";
  const planDef = PLANS.find(p => p.key === planKey);
  const limits  = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free;

  const leadsCount     = Object.keys(leads).length;
  const pipelinesCount = pipelines.length;
  const membersCount   = teamMembers.length;

  const [googleConnected, setGoogleConnected]   = useState(false);
  const [automationsCount, setAutomationsCount] = useState(0);
  const [integrationsCount, setIntegrationsCount] = useState(0);

  useEffect(() => {
    import("@/lib/googleOAuth").then(({ checkGoogleConnection }) => {
      checkGoogleConnection().then(c => setGoogleConnected(!!c));
    });
    if (!user) return;
    supabase.from("automations").select("id", { count: "exact", head: true }).eq("owner_id", user.id)
      .then(({ count }) => setAutomationsCount(count ?? 0));
    supabase.from("webhook_integrations").select("id", { count: "exact", head: true }).eq("owner_id", user.id)
      .then(({ count }) => setIntegrationsCount(count ?? 0));
  }, [user]);

  const connectionsCount = whatsappConnections.length + (googleConnected ? 1 : 0);

  const logoInitial = (company?.name?.[0] ?? "E").toUpperCase();

  // ── Gerenciar plano (Stripe Customer Portal) ──────────────────────────────
  const [portalLoading, setPortalLoading] = useState(false);

  const handleManagePlan = async () => {
    if (!company) {
      toast.error("Empresa não encontrada.");
      return;
    }
    setPortalLoading(true);
    try {
      // Query direta — não depende do cache do useSubscription
      const { data: subRow, error: subErr } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id, status")
        .eq("company_id", company.id)
        .not("stripe_customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subErr) {
        console.error("[portal] erro ao buscar subscription:", subErr);
        throw new Error(`Erro ao buscar assinatura: ${subErr.message}`);
      }

      console.log("[portal] subscription encontrada:", subRow);

      const customerId = subRow?.stripe_customer_id as string | null;
      if (!customerId) {
        throw new Error(
          "Nenhuma assinatura Stripe encontrada. Conclua um checkout antes de gerenciar o plano."
        );
      }

      const { data: { session: authSession } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      console.log("[portal] chamando create-portal-session, customerId:", customerId);

      const res = await fetch(`${supabaseUrl}/functions/v1/create-portal-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authSession?.access_token ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
        },
        body: JSON.stringify({ customerId }),
      });

      let responseData: { url?: string; error?: string };
      try {
        responseData = await res.json();
      } catch {
        throw new Error(`Resposta inválida da edge function (HTTP ${res.status})`);
      }

      console.log("[portal] resposta create-portal-session:", res.status, responseData);

      if (!res.ok || !responseData.url) {
        throw new Error(responseData.error ?? `Erro HTTP ${res.status} ao abrir portal.`);
      }

      window.location.href = responseData.url;
    } catch (err) {
      console.error("[portal] erro final:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao abrir portal de pagamento.");
      setPortalLoading(false);
    }
  };

  // ── Upgrade dialog ────────────────────────────────────────────────────────
  const [upgradeOpen,    setUpgradeOpen]    = useState(false);
  const [upgradePeriod,  setUpgradePeriod]  = useState<UpgradePeriod>("monthly");
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);

  const handleSelectPlan = async (planKey: UpgradePlanKey) => {
    if (!user)    { toast.error("Você precisa estar logado."); return; }
    if (!company) { toast.error("Nenhuma empresa encontrada."); return; }
    const priceId = UPGRADE_PRICES[planKey][upgradePeriod];
    setUpgradeLoading(planKey);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authSession?.access_token ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
        },
        body: JSON.stringify({
          priceId,
          companyId:     company.id,
          userId:        user.id,
          userEmail:     user.email ?? "",
          planName:      planKey,
          billingPeriod: upgradePeriod,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Erro ao criar sessão.");
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar checkout.");
      setUpgradeLoading(null);
    }
  };

  return (
    <>
      {/* Cabeçalho */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-stretch">
          {/* Lado esquerdo */}
          <div className="flex flex-col justify-center w-1/2 px-5" style={{ paddingTop: 25, paddingBottom: 25 }}>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CreditCard size={15} className="text-primary" />
              </div>
              <p className="font-semibold text-foreground" style={{ fontSize: 19 }}>Planos e pagamentos</p>
            </div>
            <p className="text-muted-foreground mt-1" style={{ fontSize: 13 }}>Controle seus planos, pagamentos e uso do Rezult CRM</p>
          </div>

          {/* Divisor vertical */}
          <div className="w-px bg-border self-stretch my-4" />

          {/* Lado direito */}
          {company && (
            <div className="flex flex-col justify-center w-1/2 px-5" style={{ paddingTop: 25, paddingBottom: 25 }}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Empresa</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-bold overflow-hidden shrink-0">
                  {company.logo_url
                    ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain" />
                    : logoInitial}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{company.name}</p>
                  {company.email && (
                    <p className="text-xs text-muted-foreground truncate">{company.email}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Plano atual + Benefícios + Uso — bloco único */}
      <Card>
        {/* Plano atual */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-2xl font-bold text-primary">{PLAN_LABELS[planKey] ?? planKey}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="border-card-border text-muted-foreground"
              disabled={portalLoading || !company}
              onClick={handleManagePlan}
            >
              {portalLoading
                ? <><Loader2 size={13} className="animate-spin mr-1.5" />Abrindo...</>
                : "Gerenciar plano"}
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90"
              onClick={() => setUpgradeOpen(true)}
            >
              Upgrade
            </Button>
          </div>
        </div>

        <div className="flex items-stretch gap-0 border border-card-border rounded-xl overflow-hidden mb-6">
          <div className="flex-1 px-4" style={{ paddingTop: 25, paddingBottom: 25 }}>
            <p className="text-[11px] text-muted-foreground mb-1">Renova em</p>
            <p className="text-[13px] font-semibold text-foreground">
              {company?.plan_expires_at ? fmtDate(company.plan_expires_at) : "—"}
            </p>
          </div>
          <div className="w-px bg-border self-stretch" />
          <div className="flex-1 px-4" style={{ paddingTop: 25, paddingBottom: 25 }}>
            <p className="text-[11px] text-muted-foreground mb-1">Valor</p>
            <p className="text-[13px] font-semibold text-foreground">
              {planDef?.pricing.mensal ?? (planKey === "free" ? "Grátis" : "—")}
            </p>
          </div>
          <div className="w-px bg-border self-stretch" />
          <div className="flex-1 px-4" style={{ paddingTop: 25, paddingBottom: 25 }}>
            <p className="text-[11px] text-muted-foreground mb-1">Frequência</p>
            <p className="text-[13px] font-semibold text-foreground">
              {subscription?.billing_period === "semiannual" ? "Semestral"
               : subscription?.billing_period === "annual" ? "Anual"
               : "Mensal"}
            </p>
          </div>
          <div className="w-px bg-border self-stretch" />
          <div className="flex-1 px-4" style={{ paddingTop: 25, paddingBottom: 25 }}>
            <p className="text-[11px] text-muted-foreground mb-1">Método de pagamento</p>
            <div className="flex items-center gap-1.5">
              <CreditCard size={13} className="text-muted-foreground shrink-0" />
              <p className="text-[13px] font-semibold text-foreground">Cartão de crédito</p>
            </div>
          </div>
        </div>

        {/* Benefícios do plano */}
        {planDef && (
          <>
            <div className="border-t border-card-border pt-5 mb-5">
              <p className="text-sm font-semibold text-foreground mb-4">Benefícios do plano</p>
              <div className="grid grid-cols-2 gap-2">
                {planDef.features.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check size={10} className="text-primary" strokeWidth={2.5} />
                    </div>
                    <p className="text-[13px] text-foreground">{f}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Uso do plano */}
        <div className="border-t border-card-border pt-5">
          <div className="grid grid-cols-3 gap-3">
            <UsageCard label="Leads"       current={leadsCount}        limit={limits.leads}       icon={<Users size={14} className="text-primary" />} />
            <UsageCard label="Membros"     current={membersCount}      limit={limits.members}     icon={<Users size={14} className="text-primary" />} />
            <UsageCard label="Pipelines"   current={pipelinesCount}    limit={limits.pipelines}   icon={<Zap   size={14} className="text-primary" />} />
            <UsageCard label="Conexões"    current={connectionsCount}  limit={limits.connections} icon={<Link2 size={14} className="text-primary" />} />
            <UsageCard label="Automações"  current={automationsCount}  limit={limits.automations} icon={<Zap   size={14} className="text-primary" />} />
            <UsageCard label="Integrações" current={integrationsCount} limit={3}                  icon={<Plug  size={14} className="text-primary" />} />
          </div>
        </div>
      </Card>

      {/* ── Dialog de Upgrade ─────────────────────────────────────────────── */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-5xl rounded-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <div className="px-8 pt-7 pb-0 flex flex-col items-center text-center">
            <p className="text-xl font-bold text-foreground">Planos Rezult CRM</p>
            <p className="text-sm text-muted-foreground mt-1">Encontre o plano que atende às suas necessidades!</p>
          </div>

          {/* Toggle de período */}
          <div className="px-8 pt-4 pb-2 flex justify-center">
            <div className="flex gap-0.5 p-1 rounded-xl bg-muted w-fit">
              {(["monthly", "semiannual", "annual"] as UpgradePeriod[]).map((period) => {
                const disc = UPGRADE_PERIOD_DISCOUNT[period];
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setUpgradePeriod(period)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                      upgradePeriod === period
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {UPGRADE_PERIOD_LABELS[period]}
                    {disc && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        {disc}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cards dos planos */}
          <div className="overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-4 px-8 pb-8 pt-2">
            {UPGRADE_PLAN_INFO.map((plan) => {
              const isCurrent  = planKey === plan.key;
              const isLoading  = upgradeLoading === plan.key;

              return (
                <div
                  key={plan.key}
                  className={cn(
                    "relative flex flex-col rounded-xl border-2 p-5 transition-all",
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : plan.badge
                        ? "border-primary bg-primary/[0.02]"
                        : "border-card-border bg-white"
                  )}
                >
                  {/* Badge Mais popular */}
                  {plan.badge && !isCurrent && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      {plan.badge}
                    </span>
                  )}
                  {/* Badge Plano atual */}
                  {isCurrent && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      Plano atual
                    </span>
                  )}

                  <p className="text-sm font-bold text-foreground">{plan.name}</p>

                  {/* Preço */}
                  <div className="mt-3 mb-0.5">
                    <span className="text-2xl font-bold text-foreground">
                      {plan.prices[upgradePeriod]}
                    </span>
                    {upgradePeriod === "monthly" && (
                      <span className="text-xs text-muted-foreground ml-1">/mês</span>
                    )}
                  </div>
                  {upgradePeriod === "monthly" && (
                    <p className="text-[11px] font-medium text-emerald-600 mb-3">cobrança mensal recorrente</p>
                  )}
                  {upgradePeriod === "semiannual" && (
                    <p className="text-[11px] font-medium text-emerald-600 mb-3">
                      semestral · equiv. {plan.monthlyEquiv.semiannual}/mês
                    </p>
                  )}
                  {upgradePeriod === "annual" && (
                    <p className="text-[11px] font-medium text-emerald-600 mb-3">
                      anual · equiv. {plan.monthlyEquiv.annual}/mês
                    </p>
                  )}

                  {/* Features */}
                  <ul className="space-y-1.5 flex-1 mb-4">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Check size={11} className={cn("mt-0.5 shrink-0", isCurrent ? "text-primary" : "text-emerald-600")} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Button size="sm" variant="outline" className="w-full border-primary text-primary" disabled>
                      Plano atual
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className={cn("w-full", plan.badge ? "" : "bg-primary hover:bg-primary/90")}
                      disabled={upgradeLoading !== null}
                      onClick={() => handleSelectPlan(plan.key)}
                    >
                      {isLoading
                        ? <><Loader2 size={13} className="animate-spin mr-1.5" />Aguarde...</>
                        : "Começar 7 dias grátis"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- TAGS ---------------- */
const TAG_COLORS = [
  "#E24B4A", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#22C55E", "#10B981", "#128A68", "#14B8A6", "#06B6D4",
  "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7",
  "#D946EF", "#EC4899", "#F43F5E", "#64748B", "#374151",
];

function TagsSection() {
  const { crmTags, addTag, updateTag, deleteTag, leads } = useCRM();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; description: string; color: string } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const tagLeadCounts = Object.values(leads).reduce<Record<string, number>>((acc, l) => {
    (l.tags ?? []).forEach(t => { acc[t] = (acc[t] ?? 0) + 1; });
    return acc;
  }, {});

  const openNew = () => {
    setEditing(null);
    setName(""); setDescription(""); setColor(TAG_COLORS[0]);
    setModalOpen(true);
  };

  const openEdit = (t: { id: string; name: string; description: string; color: string }) => {
    setEditing(t);
    setName(t.name); setDescription(t.description); setColor(t.color);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Nome é obrigatório."); return; }
    setSaving(true);
    if (editing) {
      await updateTag(editing.id, { name: name.trim(), description, color });
      toast.success("Tag atualizada!");
      setModalOpen(false);
    } else {
      const ok = await addTag(name.trim(), description, color);
      if (ok) {
        toast.success("Tag criada!");
        setModalOpen(false);
      }
    }
    setSaving(false);
  };

  return (
    <>
      <SectionHeader title="Tags" onAdd="+ Nova tag" onClick={openNew} />
      <Card>
        {crmTags.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma tag criada ainda.</p>
        ) : (
          <div className="space-y-2">
            {crmTags.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 border border-card-border rounded-lg">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-foreground font-medium leading-tight">{t.name}</p>
                  {t.description && <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{tagLeadCounts[t.name] ?? 0} leads</span>
                <button onClick={() => openEdit(t)} className="text-muted-foreground hover:text-foreground p-1"><Pencil size={14} /></button>
                <button onClick={() => deleteTag(t.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tag" : "Nova tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome *</label>
              <input
                className="w-full border border-card-border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Urgente"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descrição</label>
              <input
                className="w-full border border-card-border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descrição opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Cor</label>
              <div className="grid grid-cols-10 gap-1.5">
                {TAG_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? `2px solid ${c}` : "none",
                      outlineOffset: "2px",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-muted-foreground">Cor selecionada: <strong>{color}</strong></span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-card-border">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- PRODUTOS ---------------- */
function ProdutosSection() {
  const { products, addProduct, updateProduct, deleteProduct } = useCRM();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; sku: string; defaultValue: number } | null>(null);
  const [name, setName]   = useState("");
  const [sku, setSku]     = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  function openNew() {
    setEditing(null);
    setName(""); setSku(""); setPrice("");
    setModalOpen(true);
  }

  function openEdit(p: { id: string; name: string; sku: string; defaultValue: number }) {
    setEditing(p);
    setName(p.name);
    setSku(p.sku);
    setPrice(p.defaultValue > 0 ? formatCurrency(p.defaultValue) : "");
    setModalOpen(true);
  }

  // Formata centavos inteiros → "R$ 1.500,00"
  function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }

  // Mantém apenas dígitos e converte para valor numérico enquanto digita
  function handlePriceChange(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) { setPrice(""); return; }
    const cents = parseInt(digits, 10);
    const reals = cents / 100;
    setPrice(formatCurrency(reals));
  }

  function parsePriceToNumber(formatted: string) {
    const digits = formatted.replace(/\D/g, "");
    if (!digits) return 0;
    return parseInt(digits, 10) / 100;
  }

  async function handleSave() {
    if (!name.trim())  { toast.error("Nome é obrigatório."); return; }
    if (!sku.trim())   { toast.error("Identificador (SKU) é obrigatório."); return; }
    if (!price)        { toast.error("Preço é obrigatório."); return; }
    const defaultValue = parsePriceToNumber(price);
    if (defaultValue <= 0) { toast.error("Informe um preço válido."); return; }
    setSaving(true);
    if (editing) {
      await updateProduct(editing.id, { name: name.trim(), sku: sku.trim(), defaultValue });
      toast.success("Produto atualizado!");
    } else {
      await addProduct({ name: name.trim(), sku: sku.trim(), defaultValue });
      toast.success("Produto criado!");
    }
    setSaving(false);
    setModalOpen(false);
  }

  return (
    <>
      <SectionHeader title="Produtos" subtitle="Gerencie seus produtos com facilidade" onAdd="+ Novo produto" onClick={openNew} />

      <div className="bg-white border border-card-border rounded-xl overflow-hidden mb-5">
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhum produto cadastrado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-card-border hover:bg-transparent">
                <TableHead className="text-muted-foreground text-xs font-medium">Produto</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Identificador (SKU)</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Preço</TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium">Data de criação</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map(p => (
                <TableRow key={p.id} className="border-card-border hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Package size={14} className="text-primary" />
                      </div>
                      <span className="text-[13px] font-medium text-foreground">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{p.sku || "—"}</TableCell>
                  <TableCell>
                    <span className="text-[13px] font-semibold text-primary">{fmt(p.defaultValue)}</span>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="text-muted-foreground/50 hover:text-muted-foreground p-1 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeletingProductId(p.id)} className="text-muted-foreground/50 hover:text-destructive p-1 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!deletingProductId} onOpenChange={o => !o && setDeletingProductId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir produto?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Esta ação não pode ser desfeita.</p>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-lg border-card-border" onClick={() => setDeletingProductId(null)}>Cancelar</Button>
            <Button variant="destructive" className="rounded-lg" onClick={async () => { await deleteProduct(deletingProductId!); setDeletingProductId(null); }}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome *</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Consultoria mensal"
                autoFocus
                className="border-card-border"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Identificador (SKU) *</label>
              <Input
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="Ex: produto1"
                className="border-card-border"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Preço *</label>
              <Input
                value={price}
                onChange={e => handlePriceChange(e.target.value)}
                placeholder="R$ 0,00"
                inputMode="numeric"
                className="border-card-border"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-card-border">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar produto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- MOTIVOS ---------------- */
function MotivosSection() {
  const { lossReasons, addLossReason, updateLossReason, deleteLossReason } = useCRM();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openNew = () => { setEditingId(null); setMotivo(""); setShowDialog(true); };
  const openEdit = (id: string, name: string) => { setEditingId(id); setMotivo(name); setShowDialog(true); };

  const handleSave = async () => {
    if (!motivo.trim()) { toast.error("Informe o motivo."); return; }
    if (editingId) {
      await updateLossReason(editingId, motivo.trim());
      toast.success("Motivo atualizado.");
    } else {
      const ok = await addLossReason(motivo.trim());
      if (!ok) { toast.error("Erro ao salvar. Verifique se a migração do banco foi executada."); return; }
      toast.success("Motivo criado.");
    }
    setShowDialog(false);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteLossReason(deletingId);
    toast.success("Motivo removido.");
    setDeletingId(null);
  };

  return (
    <>
      <SectionHeader title="Motivos de perda" subtitle="Descubra, organize e gerencie seus motivos de perda" onAdd="+ Novo motivo" onClick={openNew} />
      <Card>
        {lossReasons.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum motivo cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {lossReasons.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 border border-card-border rounded-lg">
                <p className="flex-1 text-[13px] text-foreground">{r.name}</p>
                <button onClick={() => openEdit(r.id, r.name)} className="text-muted-foreground hover:text-foreground p-1"><Pencil size={14} /></button>
                <button onClick={() => setDeletingId(r.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar motivo" : "Novo motivo"}</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              Crie motivos de perda dos seus negócios.
            </p>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Motivo</label>
            <Input
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex: Preço alto"
              className="rounded-lg"
              onKeyDown={e => e.key === "Enter" && handleSave()}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-lg" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button className="rounded-lg bg-primary hover:bg-primary/90" onClick={handleSave}>
              {editingId ? "Salvar" : "Criar motivo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingId} onOpenChange={o => !o && setDeletingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover motivo?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Esta ação não pode ser desfeita.</p>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-lg" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button variant="destructive" className="rounded-lg" onClick={handleDelete}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- LISTAS ---------------- */
function ListasSection() {
  const { crmLists, addList, updateList, deleteList, leads, pipelines } = useCRM();

  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [formName, setFormName]     = useState("");
  const [formDesc, setFormDesc]     = useState("");
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [viewListId, setViewListId] = useState<string | null>(null);

  const viewList  = viewListId ? crmLists.find(l => l.id === viewListId) : null;
  const viewLeads = viewList ? viewList.leadIds.map(id => leads[id]).filter(Boolean) : [];
  function stageName(leadId: string): string {
    const lead = leads[leadId];
    if (!lead) return "";
    for (const p of pipelines) {
      const col = p.columns.find(c => c.id === lead.stage);
      if (col) return `${p.name} › ${col.title}`;
    }
    return "";
  }

  function openCreate() { setEditId(null); setFormName(""); setFormDesc(""); setShowForm(true); }
  function openEdit(l: { id: string; name: string; description: string }) {
    setEditId(l.id); setFormName(l.name); setFormDesc(l.description); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditId(null); setFormName(""); setFormDesc(""); }

  async function handleSave() {
    if (!formName.trim()) { toast.error("Nome da lista é obrigatório."); return; }
    setSaving(true);
    if (editId) {
      await updateList(editId, { name: formName.trim(), description: formDesc.trim() });
      toast.success("Lista atualizada!");
    } else {
      const created = await addList(formName.trim(), formDesc.trim());
      if (created) toast.success("Lista criada!");
    }
    setSaving(false);
    closeForm();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await deleteList(id);
    toast.success("Lista excluída.");
    setDeleting(null);
  }

  return (
    <>
      <SectionHeader title="Listas" onAdd="+ Nova lista" onClick={openCreate} />

      {showForm && (
        <Card className="mb-4">
          <p className="text-sm font-semibold text-foreground mb-3">{editId ? "Editar lista" : "Nova lista"}</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Nome <span className="text-[#E24B4A]">*</span></label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Leads quentes" className="border-card-border" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição <span className="text-muted-foreground font-normal">(opcional)</span></label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Para que serve esta lista?" className="border-card-border" />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" className="border-card-border" onClick={closeForm}>Cancelar</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : editId ? "Salvar" : "Criar"}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        {crmLists.length === 0 ? (
          <div className="py-8 text-center">
            <List size={32} className="text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma lista criada ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Crie listas para organizar seus leads por segmento.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {crmLists.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 border border-card-border rounded-lg group">
                <List size={16} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-foreground font-medium truncate">{l.name}</p>
                  {l.description && <p className="text-xs text-muted-foreground truncate">{l.description}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{l.leadIds.length} lead{l.leadIds.length !== 1 ? "s" : ""}</span>
                <button
                  onClick={() => setViewListId(l.id)}
                  className="text-muted-foreground hover:text-primary p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Ver leads"
                ><Eye size={14} /></button>
                <button
                  onClick={() => openEdit(l)}
                  className="text-muted-foreground hover:text-primary p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                ><Pencil size={14} /></button>
                <button
                  onClick={() => handleDelete(l.id)}
                  disabled={deleting === l.id}
                  className="text-muted-foreground hover:text-destructive p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal: Ver leads da lista */}
      <Dialog open={!!viewListId} onOpenChange={() => setViewListId(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-card-border">
            <div className="flex items-center gap-2">
              <List size={15} className="text-primary" />
              <span className="text-[14px] font-semibold text-foreground">{viewList?.name}</span>
              {viewList?.description && (
                <span className="text-xs text-muted-foreground truncate">{viewList.description}</span>
              )}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto px-5 py-3">
            {viewLeads.length === 0 ? (
              <div className="py-8 text-center">
                <List size={28} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum lead nesta lista.</p>
                <p className="text-xs text-muted-foreground mt-1">Adicione leads pelo Multiatendimento.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {viewLeads.map(lead => (
                  <div key={lead.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-card-border">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: `hsl(${Math.abs(lead.name.split("").reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360} 55% 45%)` }}
                    >
                      {lead.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{lead.name}</p>
                      {stageName(lead.id) && (
                        <p className="text-xs text-muted-foreground truncate">{stageName(lead.id)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-card-border flex justify-end">
            <Button variant="outline" className="border-card-border text-xs h-8" onClick={() => setViewListId(null)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- CAMPOS ---------------- */
function CamposSection() {
  const {
    customFieldGroups,
    addCustomFieldGroup, updateCustomFieldGroup, deleteCustomFieldGroup,
    addCustomFieldItem, updateCustomFieldItem, deleteCustomFieldItem,
  } = useCRM();

  const TYPE_LABEL: Record<string, string> = { text: "Texto", date: "Data", boolean: "Sim/Não" };

  // Expanded groups
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  // Group modal
  const [groupModal, setGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // Item modal
  const [itemModal, setItemModal] = useState(false);
  const [itemGroupId, setItemGroupId] = useState<string>("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemLabel, setItemLabel] = useState("");
  const [itemType, setItemType] = useState<"text" | "date" | "boolean">("text");
  const [savingItem, setSavingItem] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{ groupId: string; itemId: string } | null>(null);

  function openNewGroup() { setEditingGroupId(null); setGroupName(""); setGroupModal(true); }
  function openEditGroup(id: string, name: string) { setEditingGroupId(id); setGroupName(name); setGroupModal(true); }

  async function handleSaveGroup() {
    if (!groupName.trim()) { toast.error("Nome é obrigatório."); return; }
    setSavingGroup(true);
    if (editingGroupId) {
      await updateCustomFieldGroup(editingGroupId, groupName.trim());
      toast.success("Campo atualizado!");
    } else {
      const g = await addCustomFieldGroup(groupName.trim());
      if (!g) { toast.error("Erro ao criar campo."); setSavingGroup(false); return; }
      setExpanded(p => ({ ...p, [g.id]: true }));
      toast.success("Campo criado!");
    }
    setSavingGroup(false); setGroupModal(false);
  }

  function openNewItem(groupId: string) {
    setItemGroupId(groupId); setEditingItemId(null); setItemLabel(""); setItemType("text"); setItemModal(true);
  }
  function openEditItem(groupId: string, id: string, label: string, fieldType: "text" | "date" | "boolean") {
    setItemGroupId(groupId); setEditingItemId(id); setItemLabel(label); setItemType(fieldType); setItemModal(true);
  }

  async function handleSaveItem() {
    if (!itemLabel.trim()) { toast.error("Pergunta é obrigatória."); return; }
    setSavingItem(true);
    if (editingItemId) {
      await updateCustomFieldItem(editingItemId, { label: itemLabel.trim(), fieldType: itemType });
      toast.success("Pergunta atualizada!");
    } else {
      const item = await addCustomFieldItem(itemGroupId, itemLabel.trim(), itemType);
      if (!item) { toast.error("Erro ao criar pergunta."); setSavingItem(false); return; }
      toast.success("Pergunta criada!");
    }
    setSavingItem(false); setItemModal(false);
  }

  return (
    <>
      <SectionHeader
        title="Campos adicionais"
        subtitle="Crie campos personalizados que aparecem no card de cada lead"
        onAdd="+ Novo campo"
        onClick={openNewGroup}
      />

      <div className="space-y-3 mb-5">
        {customFieldGroups.length === 0 && (
          <div className="bg-white border border-card-border rounded-xl px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum campo adicional cadastrado ainda.</p>
          </div>
        )}

        {customFieldGroups.map(g => (
          <div key={g.id} className="bg-white border border-card-border rounded-xl overflow-hidden">
            {/* Header do grupo */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => toggle(g.id)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FormInput size={13} className="text-primary" />
                </div>
                <span className="text-[13px] font-semibold text-foreground">{g.name}</span>
                {g.isDefault && <Badge className="text-[10px] bg-primary/10 text-primary border-0">padrão</Badge>}
                <Badge variant="secondary" className="text-[10px]">{g.items.length} perguntas</Badge>
                <ChevronDown
                  size={14}
                  className="text-muted-foreground ml-auto transition-transform"
                  style={{ transform: expanded[g.id] ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              <button onClick={() => openEditGroup(g.id, g.name)} className="text-muted-foreground/50 hover:text-muted-foreground p-1 transition-colors">
                <Pencil size={14} />
              </button>
              {!g.isDefault && (
                <button onClick={() => setDeletingGroupId(g.id)} className="text-muted-foreground/50 hover:text-destructive p-1 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {/* Perguntas */}
            {expanded[g.id] && (
              <div className="border-t border-card-border">
                {g.items.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma pergunta ainda.</p>
                )}
                {g.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-card-border last:border-b-0 hover:bg-muted/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0 ml-2" />
                    <span className="flex-1 text-[12px] text-foreground">{item.label}</span>
                    <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[item.fieldType]}</Badge>
                    <button
                      onClick={() => openEditItem(g.id, item.id, item.label, item.fieldType)}
                      className="text-muted-foreground/50 hover:text-muted-foreground p-1 transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeletingItem({ groupId: g.id, itemId: item.id })}
                      className="text-muted-foreground/50 hover:text-destructive p-1 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <div className="px-4 py-2.5">
                  <button
                    onClick={() => openNewItem(g.id)}
                    className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    <Plus size={12} /> Adicionar pergunta
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal grupo */}
      <Dialog open={groupModal} onOpenChange={v => !v && setGroupModal(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGroupId ? "Editar campo" : "Novo campo"}</DialogTitle>
          </DialogHeader>
          <div className="py-1">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome do campo *</label>
            <Input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Ex: Financeiro, Qualificação..."
              autoFocus
              className="border-card-border"
              onKeyDown={e => e.key === "Enter" && handleSaveGroup()}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGroupModal(false)} className="border-card-border">Cancelar</Button>
            <Button onClick={handleSaveGroup} disabled={savingGroup} className="bg-primary hover:bg-primary/90">
              {savingGroup ? "Salvando..." : editingGroupId ? "Salvar" : "Criar campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal pergunta */}
      <Dialog open={itemModal} onOpenChange={v => !v && setItemModal(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingItemId ? "Editar pergunta" : "Nova pergunta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pergunta *</label>
              <Input
                value={itemLabel}
                onChange={e => setItemLabel(e.target.value)}
                placeholder="Ex: Qual o orçamento disponível?"
                autoFocus
                className="border-card-border"
                onKeyDown={e => e.key === "Enter" && handleSaveItem()}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de resposta</label>
              <Select value={itemType} onValueChange={(v: "text" | "date" | "boolean") => setItemType(v)}>
                <SelectTrigger className="border-card-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="boolean">Sim/Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setItemModal(false)} className="border-card-border">Cancelar</Button>
            <Button onClick={handleSaveItem} disabled={savingItem} className="bg-primary hover:bg-primary/90">
              {savingItem ? "Salvando..." : editingItemId ? "Salvar" : "Criar pergunta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão de grupo */}
      <Dialog open={!!deletingGroupId} onOpenChange={o => !o && setDeletingGroupId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover campo?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Todas as perguntas dentro deste campo serão removidas. Esta ação não pode ser desfeita.</p>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-card-border" onClick={() => setDeletingGroupId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => { await deleteCustomFieldGroup(deletingGroupId!); toast.success("Campo removido."); setDeletingGroupId(null); }}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão de pergunta */}
      <Dialog open={!!deletingItem} onOpenChange={o => !o && setDeletingItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover pergunta?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Esta ação não pode ser desfeita.</p>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-card-border" onClick={() => setDeletingItem(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => { await deleteCustomFieldItem(deletingItem!.groupId, deletingItem!.itemId); toast.success("Pergunta removida."); setDeletingItem(null); }}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- DEPARTAMENTOS ---------------- */
function DepartamentosSection() {
  const deps = [
    { name: "Comercial", count: 5 },
    { name: "Marketing", count: 2 },
    { name: "Operações", count: 1 },
  ];
  return (
    <>
      <SectionHeader title="Departamentos" onAdd="+ Novo departamento" onClick={() => toast.success("Em breve")} />
      <Card>
        <div className="space-y-2">
          {deps.map(d => (
            <div key={d.name} className="flex items-center gap-3 px-3 py-2.5 border border-card-border rounded-lg">
              <Building2 size={16} className="text-primary" />
              <p className="flex-1 text-[13px] text-foreground font-medium">{d.name}</p>
              <span className="text-xs text-muted-foreground">{d.count} membros</span>
              <button className="text-muted-foreground hover:text-foreground p-1"><Pencil size={14} /></button>
              <button className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------------- HORÁRIOS ---------------- */
function HorariosSection() {
  const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const [schedule, setSchedule] = useState(
    days.map(d => ({ day: d, active: !["Sábado", "Domingo"].includes(d), start: "08:00", end: "18:00" }))
  );
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-6">Horários de trabalho</h1>
      <Card>
        <div className="space-y-3">
          {schedule.map((s, i) => (
            <div key={s.day} className="flex items-center gap-3">
              <Switch
                checked={s.active}
                onCheckedChange={(v) => setSchedule(prev => prev.map((p, idx) => idx === i ? { ...p, active: v } : p))}
              />
              <p className="text-[13px] text-foreground w-24">{s.day}</p>
              <Input
                type="time" value={s.start} disabled={!s.active}
                onChange={e => setSchedule(prev => prev.map((p, idx) => idx === i ? { ...p, start: e.target.value } : p))}
                className="border-card-border w-32"
              />
              <span className="text-xs text-muted-foreground">às</span>
              <Input
                type="time" value={s.end} disabled={!s.active}
                onChange={e => setSchedule(prev => prev.map((p, idx) => idx === i ? { ...p, end: e.target.value } : p))}
                className="border-card-border w-32"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <Button onClick={() => toast.success("Horários salvos!")} className="bg-primary hover:bg-primary/90">Salvar horários</Button>
        </div>
      </Card>
    </>
  );
}

/* ---------------- ATIVIDADES ---------------- */
function AtividadesSection() {
  const tipos = [
    { name: "Ligação", icon: Phone },
    { name: "E-mail", icon: Mail },
    { name: "Reunião", icon: Calendar },
    { name: "WhatsApp", icon: MessageSquare },
    { name: "Visita", icon: MapPin },
  ];
  return (
    <>
      <SectionHeader title="Tipos de atividades" onAdd="+ Novo tipo" onClick={() => toast.success("Em breve")} />
      <Card>
        <div className="space-y-2">
          {tipos.map(t => (
            <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 border border-card-border rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <t.icon size={14} className="text-primary" />
              </div>
              <p className="flex-1 text-[13px] text-foreground font-medium">{t.name}</p>
              <button className="text-muted-foreground hover:text-foreground p-1"><Pencil size={14} /></button>
              <button className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------------- INTEGRAÇÕES ---------------- */
function IntegracoesSection() {
  return <IntegracoesPage />;
}

/* ---------------- CONEXÕES ---------------- */
type ZApiForm = { instanceId: string; token: string; clientToken: string };
type ZApiStep = "select" | "provider" | "tutorial" | "creds" | "qr" | "done";

const CONN_CATEGORIES = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Crie conexões com a plataforma WhatsApp",
    providers: [
      { id: "zapi", name: "Z-API", desc: "Crie uma nova conexão com a API do Z-API", available: true,
        iconBg: "#1A1A1A", Icon: Webhook },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    description: "Crie conexões com a plataforma Instagram",
    providers: [
      { id: "instagram_api", name: "Instagram API", desc: "Crie uma nova conexão com a API do Instagram", available: false,
        iconBg: "#E1306C", Icon: MessageSquare },
    ],
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "Crie conexões com plataformas de agenda",
    providers: [
      { id: "gcal", name: "Google Calendar", desc: "Crie uma nova conexão com o Google Calendar", available: true,
        iconBg: "#4285F4", Icon: Calendar },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    description: "Crie conexões com plataformas financeiras",
    providers: [
      { id: "asaas", name: "Asaas", desc: "Crie uma nova conexão com a API do Asaas", available: false,
        iconBg: "#FF6B35", Icon: CreditCard },
    ],
  },
] as const;

function ConexoesSection() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { company, whatsappConnections, addWhatsAppConnection, updateWhatsAppConnection, removeWhatsAppConnection } = useCompany();

  // Google OAuth state
  const [googleConn, setGoogleConn]           = useState<{ id: string; email: string | null } | null>(null);
  const [googleLoading, setGoogleLoading]     = useState(true);
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false);

  useEffect(() => {
    import("@/lib/googleOAuth").then(({ checkGoogleConnection }) => {
      checkGoogleConnection()
        .then(c => setGoogleConn(c ? { id: c.id, email: c.email } : null))
        .finally(() => setGoogleLoading(false));
    });
  }, []);

  async function handleConnectGoogle() {
    const { initGoogleOAuth } = await import("@/lib/googleOAuth");
    initGoogleOAuth();
  }

  async function handleDisconnectGoogle() {
    setGoogleDisconnecting(true);
    try {
      const { disconnectGoogle } = await import("@/lib/googleOAuth");
      await disconnectGoogle();
      setGoogleConn(null);
      toast.success("Google desconectado.");
    } catch {
      toast.error("Erro ao desconectar o Google.");
    } finally {
      setGoogleDisconnecting(false);
    }
  }

  const [searchConn, setSearchConn] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("whatsapp");

  // dialog state (wizard de nova conexão)
  const [open, setOpen]           = useState(false);
  const [step, setStep]           = useState<ZApiStep>("provider");
  const [tutStep, setTutStep]     = useState(0);
  const [skipTutorial, setSkipTutorial] = useState(() => localStorage.getItem("zapi_skip_tutorial") === "1");
  const [form, setForm]           = useState<ZApiForm>({ instanceId: "", token: "", clientToken: "" });
  const [qrSrc, setQrSrc]         = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [polling, setPolling]     = useState(false);
  const [pollN, setPollN]         = useState(0);

  // manage dialog state (editar conexão existente)
  const [editingConnId, setEditingConnId]         = useState<string | null>(null);
  const [manageTab, setManageTab]                 = useState<"auth" | "intervals" | "config">("auth");
  const [connName, setConnName]                   = useState("");
  const [editForm, setEditForm]                   = useState<ZApiForm>({ instanceId: "", token: "", clientToken: "" });
  const [showInstId, setShowInstId]               = useState(false);
  const [showTok, setShowTok]                     = useState(false);
  const [showClientTok, setShowClientTok]         = useState(false);
  const [autoMin, setAutoMin]                     = useState(3);
  const [autoMax, setAutoMax]                     = useState(15);
  const [agentMin, setAgentMin]                   = useState(0);
  const [agentMax, setAgentMax]                   = useState(2);
  const [typingMin, setTypingMin]                 = useState(0);
  const [typingMax, setTypingMax]                 = useState(1);
  const [typingEnabled, setTypingEnabled]         = useState(false);
  const [listenGroups, setListenGroups]           = useState(false);
  const [restoreMsg, setRestoreMsg]               = useState(false);

  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollNRef      = useRef(0);
  const credsInFlight = useRef<ZApiForm | null>(null);

  // ── Z-API helpers ──────────────────────────────────────────────────
  const zapiBase    = (c: ZApiForm) => `https://api.z-api.io/instances/${c.instanceId}/token/${c.token}`;
  const zapiHeaders = (c: ZApiForm): HeadersInit => ({
    "Content-Type": "application/json",
    ...(c.clientToken ? { "Client-Token": c.clientToken } : {}),
  });

  // Configura o webhook na Z-API para receber mensagens no CRM
  async function configureZapiWebhook(c: ZApiForm): Promise<boolean> {
    const webhookUrl = "https://adhjmwkgyxrpsohufqob.supabase.co/functions/v1/zapi-webhook";
    const base = zapiBase(c);
    const hdrs: HeadersInit = {
      "Content-Type": "application/json",
      ...(c.clientToken ? { "Client-Token": c.clientToken } : {}),
    };

    // PUT update-webhook-received é o endpoint correto para mensagens recebidas
    try {
      const r = await fetch(`${base}/update-webhook-received`, {
        method: "PUT",
        headers: hdrs,
        body: JSON.stringify({ value: webhookUrl }),
      });
      if (r.ok) return true;
    } catch { /* continua */ }

    return false;
  }

  async function fetchQr(c: ZApiForm) {
    setQrLoading(true);
    setQrSrc("");
    try {
      const res  = await fetch(`${zapiBase(c)}/qr-code/image`, { headers: zapiHeaders(c) });
      const data = await res.json();
      if (data.value) {
        setQrSrc(data.value);
      } else {
        toast.error("Não foi possível gerar o QR Code. Verifique as credenciais.");
      }
    } catch {
      toast.error("Erro ao conectar com a Z-API. Confirme o ID e Token da instância.");
    } finally {
      setQrLoading(false);
    }
  }

  async function pollStatus(c: ZApiForm): Promise<{ connected: boolean; phone: string }> {
    try {
      const res  = await fetch(`${zapiBase(c)}/status`, { headers: zapiHeaders(c) });
      const data = await res.json();
      let phone = "";
      if (data.connected) {
        try {
          const pr = await fetch(`${zapiBase(c)}/phone`, { headers: zapiHeaders(c) });
          const pd = await pr.json();
          phone = pd.phone ?? pd.value ?? "";
        } catch { /* optional */ }
      }
      return { connected: !!data.connected, phone };
    } catch {
      return { connected: false, phone: "" };
    }
  }

  function stopPoll() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPolling(false);
  }

  function startPoll(c: ZApiForm) {
    pollNRef.current    = 0;
    credsInFlight.current = c;
    setPollN(0);
    setPolling(true);
    timerRef.current = setInterval(async () => {
      pollNRef.current += 1;
      setPollN(pollNRef.current);
      const result = await pollStatus(credsInFlight.current!);
      if (result.connected) {
        stopPoll();
        const creds = credsInFlight.current!;
        setStep("done");
        toast.success("WhatsApp conectado com sucesso!");

        // Salva na tabela whatsapp_connections
        const newConn = await addWhatsAppConnection({
          name:        connName.trim() || result.phone || "WhatsApp",
          instanceId:  creds.instanceId,
          token:       creds.token,
          clientToken: creds.clientToken || null,
          phone:       result.phone || null,
          connected:   true,
          active:      true,
        });
        setEditingConnId(newConn.id);
        setConnName(newConn.name);
        setEditForm(creds);

        // Configura automaticamente o webhook na Z-API para receber mensagens
        await configureZapiWebhook(creds);
      } else if (pollNRef.current >= 3) {
        stopPoll();
      }
    }, 15_000);
  }

  // ── dialog actions ─────────────────────────────────────────────────
  async function handleGenerateQr() {
    if (!form.instanceId.trim() || !form.token.trim() || !form.clientToken.trim()) {
      toast.error("Preencha o ID da instância, o Token e o Client-Token.");
      return;
    }
    await fetchQr(form);
    setStep("qr");
    startPoll(form);
  }

  async function handleRegenerate() {
    await fetchQr(form);
    startPoll(form);
  }

  async function handleDisconnect() {
    if (!editingConnId) return;
    const conn = whatsappConnections.find(c => c.id === editingConnId);
    if (conn) {
      const creds: ZApiForm = { instanceId: conn.instanceId, token: conn.token, clientToken: conn.clientToken ?? "" };
      try { await fetch(`${zapiBase(creds)}/disconnect`, { method: "DELETE", headers: zapiHeaders(creds) }); } catch { /* ignore */ }
    }
    await removeWhatsAppConnection(editingConnId);
    setEditingConnId(null);
    closeDialog();
    toast.success("Conexão removida.");
  }

  function openDialog() { openNewDialog(); }

  function openManageDialog(connId: string) {
    const conn = whatsappConnections.find(c => c.id === connId);
    if (!conn) return;
    setEditingConnId(connId);
    setConnName(conn.name);
    setEditForm({ instanceId: conn.instanceId, token: conn.token, clientToken: conn.clientToken ?? "" });
    setStep("done");
    setManageTab("auth");
    setShowInstId(false);
    setShowTok(false);
    setShowClientTok(false);
    setOpen(true);
  }

  function openNewDialog() {
    setEditingConnId(null);
    setConnName("");
    setStep("select");
    setSelectedCategory("whatsapp");
    setTutStep(0);
    setForm({ instanceId: "", token: "", clientToken: "" });
    setQrSrc("");
    setPollN(0);
    setOpen(true);
  }

  function closeDialog() {
    stopPoll();
    setOpen(false);
  }

  async function handleUpdate() {
    if (!editingConnId) return;
    if (!editForm.instanceId.trim() || !editForm.token.trim()) {
      toast.error("Preencha o ID da instância e o Token.");
      return;
    }
    try {
      await updateWhatsAppConnection(editingConnId, {
        name:        connName.trim() || "WhatsApp",
        instanceId:  editForm.instanceId,
        token:       editForm.token,
        clientToken: editForm.clientToken || null,
      });
      toast.success("Conexão atualizada com sucesso!");
      closeDialog();
    } catch (err: unknown) {
      toast.error("Erro ao salvar: " + String(err));
    }
  }

  const selectedCat = CONN_CATEGORIES.find(c => c.id === selectedCategory) ?? CONN_CATEGORIES[0];

  const COMING_SOON = [
    { id: "asaas", platform: "Asaas",        category: "Financeiro", domain: "asaas.com",     name: "Cobranças Asaas",    description: "Cobranças, pagamentos e histórico financeiro automatizados integrados ao seu CRM.", iconBg: "#FF6B35", Icon: CreditCard },
    { id: "ig",   platform: "Instagram API", category: "Instagram",  domain: "instagram.com", name: "Instagram Mensagens",description: "Receba e responda mensagens diretas do Instagram diretamente no CRM.", iconBg: "linear-gradient(135deg,#833AB4,#FD1D1D,#F56040)", Icon: MessageSquare },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Conexões</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie suas conexões de comunicação</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-white text-sm" onClick={openNewDialog}>
          Criar
        </Button>
      </div>

      {/* ── Conexões ativas ──────────────────────────────────────────── */}
      {googleLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {whatsappConnections.map(conn => (
            <div key={conn.id} className="bg-white border border-card-border rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${conn.connected ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                  <span className={`text-xs font-medium ${conn.connected ? "text-green-700" : "text-muted-foreground"}`}>
                    {conn.connected ? "Conectado" : "Desconectado"}
                  </span>
                </div>
                <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  z-api.io <ExternalLink size={11} />
                </a>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center shrink-0">
                  <Webhook size={18} color="hsl(var(--background))" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{conn.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{conn.phone || "Z-API"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-card-border mt-auto">
                <button onClick={() => openManageDialog(conn.id)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                  <Settings2 size={14} /> Gerenciar
                </button>
              </div>
            </div>
          ))}
          <div className="bg-white border border-card-border rounded-xl p-5 flex items-center justify-center min-h-[140px]">
            <div className="w-5 h-5 rounded-full border-2 border-[#4285F4] border-t-transparent animate-spin" />
          </div>
        </div>
      ) : (whatsappConnections.length === 0 && !googleConn) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <Link2 size={22} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Nenhuma conexão ativa</p>
          <p className="text-xs text-muted-foreground mb-5">Conecte um serviço para começar a sincronizar dados com o CRM.</p>
          <Button className="bg-primary hover:bg-primary/90 text-white text-sm" onClick={openNewDialog}>
            Criar conexão
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {whatsappConnections.map(conn => (
            <div key={conn.id} className="bg-white border border-card-border rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${conn.connected ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                  <span className={`text-xs font-medium ${conn.connected ? "text-green-700" : "text-muted-foreground"}`}>
                    {conn.connected ? "Conectado" : "Desconectado"}
                  </span>
                </div>
                <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  z-api.io <ExternalLink size={11} />
                </a>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center shrink-0">
                  <Webhook size={18} color="hsl(var(--background))" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{conn.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{conn.phone || "Z-API"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-card-border mt-auto">
                <button onClick={() => openManageDialog(conn.id)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                  <Settings2 size={14} /> Gerenciar
                </button>
              </div>
            </div>
          ))}
          {googleConn && (
            <div className="bg-white border border-card-border rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="font-bold text-green-700" style={{ fontSize: 11.5 }}>Conectado</span>
                </div>
                <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted-foreground hover:text-[#4285F4]" style={{ fontSize: 11.5 }}>
                  calendar.google.com <ExternalLink size={11} />
                </a>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#4285F4" }}>
                  <Calendar size={18} color="#FFF" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">Google Calendar</p>
                  <p className="text-xs text-muted-foreground truncate">{googleConn.email ?? "Agenda"}</p>
                </div>
              </div>
              {(profile?.full_name) && (
                <p className="font-bold text-foreground mb-1" style={{ fontSize: 14 }}>{profile.full_name}</p>
              )}
              <p className="text-muted-foreground/80 mb-3" style={{ fontSize: 11, lineHeight: 1.3 }}>O Google Agenda é um calendário digital gratuito do Google que ajuda você a gerenciar seu tempo, organizar sua rotina e agendar compromissos.</p>
              <div className="flex items-center justify-between pt-3 border-t border-card-border mt-auto">
                <button
                  className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" style={{ gap: "5.2px" }}
                >
                  <Settings size={18} /> Gerenciar
                </button>
                <Switch
                  checked={!googleDisconnecting}
                  onCheckedChange={(checked) => { if (!checked) handleDisconnectGoogle(); }}
                  disabled={googleDisconnecting}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Gerenciar conexão (Dialog separado) ──────────────────────────── */}
      <Dialog open={open && step === "done"} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent style={{ maxWidth: 740, padding: 0, overflow: "hidden" }}>
          <DialogTitle className="sr-only">Gerenciar conexão</DialogTitle>
          <div style={{ display: "flex", height: 540 }}>
            {/* Left sidebar */}
            <div style={{ width: 170, flexShrink: 0, background: "#F7F7F7", borderRight: "1px solid #EEEEEE", display: "flex", flexDirection: "column", padding: 12, gap: 2 }}>
              {[
                { id: "whatsapp", label: "Whatsapp", active: true },
                { id: "instagram", label: "Instagram", active: false },
                { id: "messenger", label: "Messenger", active: false },
                { id: "universal", label: "Universal", active: false, badge: "Beta" },
              ].map(item => (
                <div key={item.id} style={{ padding: "8px 12px", borderRadius: 8, fontSize: 14, fontWeight: item.active ? 600 : 400, color: item.active ? "#111" : "#AAAAAA", background: item.active ? "#FFF" : "transparent", boxShadow: item.active ? "0 1px 3px rgba(0,0,0,0.08)" : "none", display: "flex", alignItems: "center", gap: 6, cursor: item.active ? "default" : "not-allowed" }}>
                  {item.label}
                  {item.badge && <span style={{ fontSize: 10, background: "#E8E8E8", color: "#777", padding: "1px 6px", borderRadius: 999 }}>{item.badge}</span>}
                </div>
              ))}
            </div>

            {/* Right panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              {/* Header */}
              <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #F0F0F0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 20, height: 20, background: "#111", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Webhook size={11} color="#FFF" />
                    </div>
                    <span style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>Z-API</span>
                  </div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111", margin: 0 }}>Atualizar conexão</h2>
                </div>
                <button onClick={closeDialog} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "#AAA" }}>
                  <X size={16} />
                </button>
              </div>

              {/* Connection name */}
              <div style={{ padding: "14px 24px 0" }}>
                <label style={{ fontSize: 13, color: "#535353", fontWeight: 500, display: "block", marginBottom: 6 }}>Nome da conexão</label>
                <Input value={connName} onChange={e => setConnName(e.target.value)} className="border-card-border text-sm" />
              </div>

              {/* Tabs */}
              <div style={{ padding: "0 24px", marginTop: 14, display: "flex", gap: 0, borderBottom: "1px solid #EEEEEE" }}>
                {(["auth", "intervals", "config"] as const).map((tab, i) => {
                  const labels = ["Autenticação", "Intervalos", "Configurações"];
                  return (
                    <button key={tab} onClick={() => setManageTab(tab)} style={{ fontSize: 13, fontWeight: 500, padding: "8px 16px", color: manageTab === tab ? "#128A68" : "#888", borderBottom: manageTab === tab ? "2px solid #128A68" : "2px solid transparent", background: "transparent", border: "none", borderRadius: 0, cursor: "pointer", marginBottom: -1 }}>
                      {labels[i]}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
                {manageTab === "auth" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 13, color: "#535353", fontWeight: 500, display: "block", marginBottom: 6 }}>ID da instância</label>
                      <div style={{ position: "relative" }}>
                        <Input type={showInstId ? "text" : "password"} value={editForm.instanceId} onChange={e => setEditForm(f => ({ ...f, instanceId: e.target.value }))} className="border-card-border font-mono text-sm pr-10" />
                        <button onClick={() => setShowInstId(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#AAA" }}>
                          {showInstId ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: "#535353", fontWeight: 500, display: "block", marginBottom: 6 }}>Token da instância</label>
                      <div style={{ position: "relative" }}>
                        <Input type={showTok ? "text" : "password"} value={editForm.token} onChange={e => setEditForm(f => ({ ...f, token: e.target.value }))} className="border-card-border font-mono text-sm pr-10" />
                        <button onClick={() => setShowTok(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#AAA" }}>
                          {showTok ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: "#535353", fontWeight: 500, display: "block", marginBottom: 4 }}>Token de segurança</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                        <Lock size={12} color="#AAA" />
                        <span style={{ fontSize: 11, color: "#AAA" }}>Acesse a página de Segurança para obter</span>
                      </div>
                      <div style={{ position: "relative" }}>
                        <Input type={showClientTok ? "text" : "password"} value={editForm.clientToken} onChange={e => setEditForm(f => ({ ...f, clientToken: e.target.value }))} className="border-card-border font-mono text-sm pr-10" />
                        <button onClick={() => setShowClientTok(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#AAA" }}>
                          {showClientTok ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {manageTab === "intervals" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { label: "Intervalo de envio das automações", min: autoMin, max: autoMax, setMin: setAutoMin, setMax: setAutoMax, hasToggle: false },
                      { label: "Intervalo de envio dos atendentes", min: agentMin, max: agentMax, setMin: setAgentMin, setMax: setAgentMax, hasToggle: false },
                      { label: 'Intervalo da animação de "Digitando..."', min: typingMin, max: typingMax, setMin: setTypingMin, setMax: setTypingMax, hasToggle: true },
                    ].map((row, i) => (
                      <div key={i} style={{ border: "1px solid #EEEEEE", borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: "#111", margin: 0 }}>{row.label}</p>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                              <span style={{ fontSize: 13, color: "#535353" }}>Entre</span>
                              <input type="number" value={row.min} min={0} onChange={e => row.setMin(Number(e.target.value))} style={{ width: 52, padding: "4px 8px", border: "1px solid #EEEEEE", borderRadius: 6, fontSize: 13, textAlign: "center" }} />
                              <span style={{ fontSize: 13, color: "#535353" }}>e</span>
                              <input type="number" value={row.max} min={0} onChange={e => row.setMax(Number(e.target.value))} style={{ width: 52, padding: "4px 8px", border: "1px solid #EEEEEE", borderRadius: 6, fontSize: 13, textAlign: "center" }} />
                              <span style={{ fontSize: 13, color: "#535353" }}>segundos</span>
                            </div>
                          </div>
                          {row.hasToggle && <Switch checked={typingEnabled} onCheckedChange={setTypingEnabled} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {manageTab === "config" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { label: "Ouvir grupos", desc: "Receber mensagens enviadas em grupos", checked: listenGroups, onChange: setListenGroups, info: false },
                      { label: "Restaurar mensagens", desc: "Recuperar mensagens anteriores à conexão", checked: restoreMsg, onChange: setRestoreMsg, info: true },
                    ].map((item, i) => (
                      <div key={i} style={{ border: "1px solid #EEEEEE", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: "#111", margin: 0 }}>{item.label}</p>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                            <span style={{ fontSize: 12, color: "#888" }}>{item.desc}</span>
                            {item.info && <span title="Pode levar alguns minutos" style={{ cursor: "help", color: "#AAA" }}>ⓘ</span>}
                          </div>
                        </div>
                        <Switch checked={item.checked} onCheckedChange={item.onChange} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: "12px 24px", borderTop: "1px solid #EEEEEE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#AAA" }}>
                  <Lock size={12} />
                  <span>Ao continuar, você concorda com nossos <span style={{ color: "#128A68", cursor: "pointer" }}>Termos de Uso</span></span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="outline" className="border-card-border text-sm h-9" onClick={() => { handleDisconnect(); closeDialog(); }}>Remover</Button>
                  <Button variant="outline" className="border-card-border text-sm h-9" onClick={closeDialog}>Cancelar</Button>
                  <Button className="bg-primary hover:bg-primary/90 text-sm h-9" onClick={handleUpdate}>Finalizar</Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Seleção de provedor (Dialog separado para evitar conflitos de CSS) ── */}
      <Dialog open={open && step === "select"} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent style={{ maxWidth: 640, padding: 0, overflow: "hidden" }}>
          <DialogTitle className="sr-only">Criar conexão</DialogTitle>
          <div style={{ display: "flex", height: 440 }}>
            {/* Left sidebar */}
            <div style={{ width: 160, flexShrink: 0, background: "#F7F7F7", borderRight: "1px solid #EEEEEE", display: "flex", flexDirection: "column", padding: 12, gap: 4 }}>
              {CONN_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  style={{
                    textAlign: "left", padding: "8px 12px", borderRadius: 8, fontSize: 14, fontWeight: 500,
                    background: selectedCategory === c.id ? "rgba(18,138,104,0.1)" : "transparent",
                    color: selectedCategory === c.id ? "#128A68" : "#535353",
                    border: "none", cursor: "pointer",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Right content */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", borderBottom: "1px solid #F0F0F0" }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{selectedCat.label}</p>
                  <p style={{ fontSize: 12, color: "#AAAAAA", marginTop: 2 }}>{selectedCat.description}</p>
                </div>
                <button onClick={closeDialog} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "#AAAAAA" }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedCat.providers.map(prov => {
                  const ProvIcon = prov.Icon;
                  return (
                    <button
                      key={prov.id}
                      onClick={() => {
                        if (!prov.available) { toast("Em breve"); return; }
                        if (prov.id === "zapi") { setOpen(false); setTimeout(() => { setStep(localStorage.getItem("zapi_skip_tutorial") === "1" ? "creds" : "tutorial"); setOpen(true); }, 120); }
                        if (prov.id === "gcal") { closeDialog(); handleConnectGoogle(); }
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: 16,
                        borderRadius: 12, border: `1.5px solid ${prov.available ? "#EEEEEE" : "#EEEEEE"}`,
                        textAlign: "left", background: "transparent", cursor: prov.available ? "pointer" : "not-allowed",
                        opacity: prov.available ? 1 : 0.5,
                      }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: prov.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <ProvIcon size={20} color="#FFF" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{prov.name}</span>
                          {!prov.available && <span style={{ fontSize: 10, background: "#F5F5F5", color: "#AAAAAA", padding: "2px 8px", borderRadius: 999, fontWeight: 500 }}>Em breve</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "#AAAAAA", marginTop: 2 }}>{prov.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Connection Dialog (tutorial / creds / qr / provider) ─────────────────── */}
      <Dialog open={open && step !== "select" && step !== "done"} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-[460px]">

          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare size={15} className="text-primary" /> Conectar WhatsApp
            </DialogTitle>
          </DialogHeader>

          {/* Tutorial Z-API — 2 slides navegáveis */}
          {step === "tutorial" && (
            <>
              {/* Barra de progresso */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16, marginTop: -4 }}>
                <div style={{ height: 3, flex: 1, borderRadius: 99, background: "#128A68" }} />
                <div style={{ height: 3, flex: 1, borderRadius: 99, background: tutStep >= 1 ? "#128A68" : "#EEEEEE", transition: "background 0.2s" }} />
              </div>

              {/* ── Slide 1: ID da Instância e Token ── */}
              {tutStep === 0 && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 2 }}>Onde fica o Instance ID e o Token?</p>
                  <p style={{ fontSize: 12, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
                    Acesse <a href="https://app.z-api.io" target="_blank" rel="noreferrer" style={{ color: "#128A68", fontWeight: 600, textDecoration: "none" }}>app.z-api.io</a>, faça login e clique na sua instância. As credenciais ficam logo na tela principal.
                  </p>

                  {/* Caminho de navegação */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                    {["app.z-api.io", "Instâncias", "Clique na instância"].map((item, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, background: "#E1F5EE", color: "#128A68", fontWeight: 600, padding: "2px 8px", borderRadius: 6 }}>{item}</span>
                        {i < 2 && <span style={{ fontSize: 10, color: "#CCC", fontWeight: 700 }}>›</span>}
                      </span>
                    ))}
                  </div>

                  {/* Mockup visual da tela da instância */}
                  <div style={{ border: "1px solid #E5E5E5", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                    {/* Barra do browser */}
                    <div style={{ background: "#1E1E1E", padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5F57" }} />
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFBD2E" }} />
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#28C840" }} />
                      <span style={{ fontSize: 9, color: "#666", marginLeft: 8, fontFamily: "monospace" }}>app.z-api.io/instances/sua-instancia</span>
                    </div>
                    {/* Conteúdo mockup */}
                    <div style={{ background: "#FFF", padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 12 }}>📱</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>Minha Instância</span>
                        <span style={{ fontSize: 10, background: "#E1F5EE", color: "#128A68", padding: "1px 7px", borderRadius: 99, fontWeight: 600, marginLeft: "auto" }}>Conectada</span>
                      </div>

                      {/* Instance ID */}
                      <div style={{ marginBottom: 10 }}>
                        <p style={{ fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>ID da Instância</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, background: "#E1F5EE", border: "1.5px solid #128A68", borderRadius: 7, padding: "6px 10px", fontSize: 10, fontFamily: "monospace", color: "#128A68", fontWeight: 700 }}>
                            3C1B2A3D4E5F6G7H8I9J...
                          </div>
                          <div style={{ background: "#128A68", borderRadius: 6, padding: "5px 10px", fontSize: 10, color: "#FFF", fontWeight: 600, flexShrink: 0 }}>Copiar</div>
                        </div>
                        <p style={{ fontSize: 9, color: "#128A68", fontWeight: 600, marginTop: 3 }}>👆 Copie este valor</p>
                      </div>

                      {/* Token */}
                      <div>
                        <p style={{ fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Token</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, background: "#E1F5EE", border: "1.5px solid #128A68", borderRadius: 7, padding: "6px 10px", fontSize: 10, fontFamily: "monospace", color: "#128A68", fontWeight: 700 }}>
                            F9G8H7I6J5K4L3M2N1O0...
                          </div>
                          <div style={{ background: "#128A68", borderRadius: 6, padding: "5px 10px", fontSize: 10, color: "#FFF", fontWeight: 600, flexShrink: 0 }}>Copiar</div>
                        </div>
                        <p style={{ fontSize: 9, color: "#128A68", fontWeight: 600, marginTop: 3 }}>👆 Copie este valor também</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── Slide 2: Client-Token ── */}
              {tutStep === 1 && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 2 }}>Onde fica o Client-Token?</p>
                  <p style={{ fontSize: 12, color: "#666", marginBottom: 10, lineHeight: 1.5 }}>
                    O Client-Token é um token de segurança da <strong>sua conta</strong> (não da instância). Fica nas configurações de segurança.
                  </p>

                  {/* Caminho de navegação */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                    {["app.z-api.io", "Seu avatar (topo)", "Segurança", "Token de Segurança da Conta"].map((item, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, background: "#E1F5EE", color: "#128A68", fontWeight: 600, padding: "2px 8px", borderRadius: 6 }}>{item}</span>
                        {i < 3 && <span style={{ fontSize: 10, color: "#CCC", fontWeight: 700 }}>›</span>}
                      </span>
                    ))}
                  </div>

                  {/* Mockup visual da tela de segurança */}
                  <div style={{ border: "1px solid #E5E5E5", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                    {/* Barra do browser */}
                    <div style={{ background: "#1E1E1E", padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5F57" }} />
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFBD2E" }} />
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#28C840" }} />
                      <span style={{ fontSize: 9, color: "#666", marginLeft: 8, fontFamily: "monospace" }}>app.z-api.io/security</span>
                    </div>
                    {/* Conteúdo mockup */}
                    <div style={{ background: "#FFF", padding: "14px 16px" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#111", marginBottom: 4 }}>Token de Segurança da Conta</p>
                      <p style={{ fontSize: 10, color: "#888", marginBottom: 12, lineHeight: 1.4 }}>Adiciona uma camada extra de proteção às suas instâncias.</p>

                      {/* Client-Token field */}
                      <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: 10, color: "#888", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Client-Token</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, background: "#E1F5EE", border: "1.5px solid #128A68", borderRadius: 7, padding: "6px 10px", fontSize: 10, fontFamily: "monospace", color: "#128A68", fontWeight: 700 }}>
                            Bearer A1B2C3D4E5F6G7H8...
                          </div>
                          <div style={{ background: "#128A68", borderRadius: 6, padding: "5px 10px", fontSize: 10, color: "#FFF", fontWeight: 600, flexShrink: 0 }}>Copiar</div>
                        </div>
                        <p style={{ fontSize: 9, color: "#128A68", fontWeight: 600, marginTop: 3 }}>👆 Copie este valor</p>
                      </div>

                      {/* Botão Configurar */}
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#128A68", borderRadius: 8, padding: "6px 14px" }}>
                        <span style={{ fontSize: 11, color: "#FFF", fontWeight: 600 }}>⚙ Configurar Agora</span>
                      </div>
                      <p style={{ fontSize: 9, color: "#E24B4A", fontWeight: 600, marginTop: 6 }}>👆 Se ainda não ativou, clique aqui primeiro</p>
                    </div>
                  </div>
                </>
              )}

              {/* Não mostrar novamente */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 4, marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={skipTutorial}
                  onChange={e => {
                    setSkipTutorial(e.target.checked);
                    if (e.target.checked) localStorage.setItem("zapi_skip_tutorial", "1");
                    else localStorage.removeItem("zapi_skip_tutorial");
                  }}
                  style={{ accentColor: "#128A68", width: 14, height: 14, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: "#888" }}>Não mostrar novamente</span>
              </label>

              <DialogFooter className="mt-4">
                {tutStep === 0 ? (
                  <>
                    <Button variant="outline" className="border-card-border" onClick={closeDialog}>Cancelar</Button>
                    <Button className="bg-primary hover:bg-primary/90" onClick={() => setTutStep(1)}>Próximo →</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" className="border-card-border" onClick={() => setTutStep(0)}>← Anterior</Button>
                    <Button className="bg-primary hover:bg-primary/90" onClick={() => setStep("creds")}>Já tenho as credenciais</Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}

          {/* Step 1 — Provider (now skipped, but kept for back-compat) */}
          {step === "provider" && (
            <>
              <p className="text-xs text-muted-foreground -mt-1 mb-3">Selecione o provedor de integração</p>
              <div
                className="border-[1.5px] border-primary rounded-xl p-4 flex items-center gap-3 cursor-pointer bg-primary/10/20"
                onClick={() => setStep("creds")}
              >
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Webhook size={18} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Z-API</p>
                  <p className="text-xs text-muted-foreground">Instância dedicada via API oficial</p>
                </div>
                <CheckCircle2 size={16} className="text-primary" />
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" className="border-card-border" onClick={closeDialog}>Cancelar</Button>
                <Button className="bg-primary hover:bg-primary/90" onClick={() => setStep("creds")}>Continuar</Button>
              </DialogFooter>
            </>
          )}

          {/* Step 2 — Credentials */}
          {step === "creds" && (
            <>
              <p className="text-xs text-muted-foreground -mt-1 mb-3">
                No painel da <strong>Z-API</strong>, acesse sua instância e copie o ID e o Token.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">ID da Instância <span className="text-[#E24B4A]">*</span></label>
                  <Input
                    placeholder="Ex: 3C1B2A3D4E5F..."
                    value={form.instanceId}
                    onChange={e => setForm(f => ({ ...f, instanceId: e.target.value }))}
                    className="border-card-border font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Token <span className="text-[#E24B4A]">*</span></label>
                  <Input
                    placeholder="Token da instância"
                    value={form.token}
                    onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
                    className="border-card-border font-mono text-sm"
                    type="password"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Client-Token <span className="text-[#E24B4A]">*</span> <span className="text-muted-foreground font-normal">(aba Segurança da Z-API)</span>
                  </label>
                  <Input
                    placeholder="Client-Token da instância"
                    value={form.clientToken}
                    onChange={e => setForm(f => ({ ...f, clientToken: e.target.value }))}
                    className="border-card-border font-mono text-sm"
                    type="password"
                  />
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" className="border-card-border" onClick={() => setStep("tutorial")}>Voltar</Button>
                <Button className="bg-primary hover:bg-primary/90" onClick={handleGenerateQr} disabled={qrLoading}>
                  {qrLoading ? "Gerando..." : "Gerar QR Code"}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Step 3 — QR Code */}
          {step === "qr" && (
            <>
              <p className="text-xs text-muted-foreground -mt-1 mb-3 text-center">
                Abra o WhatsApp → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>
              </p>
              <div className="flex flex-col items-center">
                {qrLoading ? (
                  <div className="w-52 h-52 bg-muted rounded-xl flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">Carregando QR Code...</p>
                  </div>
                ) : qrSrc ? (
                  <img src={qrSrc} alt="QR Code WhatsApp" className="w-52 h-52 rounded-xl border border-card-border object-contain" />
                ) : (
                  <div className="w-52 h-52 bg-[#FEF2F2] rounded-xl flex flex-col items-center justify-center gap-2 p-4">
                    <p className="text-xs text-[#E24B4A] font-medium text-center">Falha ao carregar o QR Code</p>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-card-border" onClick={() => fetchQr(form)}>
                      Tentar novamente
                    </Button>
                  </div>
                )}

                <div className="mt-3 h-8 flex items-center justify-center">
                  {polling && (
                    <p className="text-xs text-muted-foreground">Aguardando leitura do QR… ({pollN}/3)</p>
                  )}
                  {!polling && pollN >= 3 && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-xs text-[#E24B4A]">QR Code expirado.</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-primary text-primary hover:bg-primary hover:text-white" onClick={handleRegenerate}>
                        Gerar novo QR Code
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="mt-3">
                <Button variant="outline" className="border-card-border" onClick={() => { stopPoll(); setStep("creds"); }}>Voltar</Button>
              </DialogFooter>
            </>
          )}

        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- API ---------------- */
const WEBHOOK_URL = "https://adhjmwkgyxrpsohufqob.supabase.co/functions/v1/leads-webhook";

function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "rz_live_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface ApiKey {
  id: string;
  label: string;
  key: string;
  active: boolean;
  created_at: string;
  last_used_at: string | null;
}

function ApiSection() {
  const { company } = useCompany();
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyModal, setNewKeyModal] = useState<{ key: string; label: string } | null>(null);
  const [labelInput, setLabelInput] = useState("Chave padrão");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  const loadKeys = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    const { data } = await supabase
      .from("webhook_api_keys")
      .select("id, label, key, active, created_at, last_used_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    setKeys((data as ApiKey[]) ?? []);
    setLoading(false);
  }, [company]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleGenerate = async () => {
    if (!company || !user) return;
    setGenerating(true);
    const newKey = generateApiKey();
    const { data, error } = await supabase
      .from("webhook_api_keys")
      .insert({ company_id: company.id, owner_id: user.id, key: newKey, label: labelInput || "Chave padrão" })
      .select("id, label, key, active, created_at, last_used_at")
      .single();
    setGenerating(false);
    if (error) { toast.error("Erro ao gerar chave."); return; }
    setKeys(prev => [data as ApiKey, ...prev]);
    setNewKeyModal({ key: newKey, label: (data as ApiKey).label });
    setShowCreateForm(false);
    setLabelInput("Chave padrão");
  };

  const handleToggle = async (k: ApiKey) => {
    const { error } = await supabase
      .from("webhook_api_keys")
      .update({ active: !k.active })
      .eq("id", k.id);
    if (error) { toast.error("Erro ao atualizar chave."); return; }
    setKeys(prev => prev.map(x => x.id === k.id ? { ...x, active: !k.active } : x));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("webhook_api_keys").delete().eq("id", deleteTarget.id);
    if (error) { toast.error("Erro ao remover chave."); return; }
    setKeys(prev => prev.filter(x => x.id !== deleteTarget.id));
    toast.success("Chave removida.");
    setDeleteTarget(null);
  };

  const toggleVisible = (id: string) =>
    setVisibleKeys(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  };

  const curlExample = `curl -X POST ${WEBHOOK_URL} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: SUA_CHAVE_AQUI" \\
  -d '{
    "name": "João Silva",
    "phone": "11999998888",
    "email": "joao@exemplo.com",
    "source": "Site",
    "notes": "Veio pelo formulário de contato"
  }'`;

  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-6">Chaves de API</h1>

      {/* Webhook endpoint */}
      <Card>
        <SectionTitle
          title="Endpoint do Webhook"
          subtitle="Envie leads externos para o Rezult via HTTP POST"
        />
        <div className="flex gap-2 mb-4">
          <Input
            value={WEBHOOK_URL}
            readOnly
            className="border-card-border font-mono text-xs text-muted-foreground"
          />
          <Button
            variant="outline"
            size="icon"
            className="border-card-border shrink-0"
            onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); toast.success("URL copiada!"); }}
          >
            <Copy size={14} />
          </Button>
        </div>

        {/* Campos aceitos */}
        <div className="rounded-lg border border-card-border overflow-hidden mb-4">
          <div className="bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-card-border">
            Campos aceitos no body (JSON)
          </div>
          <div className="divide-y divide-card-border">
            {[
              { field: "name",        type: "string",  req: false, desc: "Nome do lead" },
              { field: "phone",       type: "string",  req: false, desc: "Telefone / WhatsApp (somente números)" },
              { field: "email",       type: "string",  req: false, desc: "E-mail do lead" },
              { field: "pipeline_id", type: "uuid",    req: false, desc: "ID do pipeline (usa o primeiro se omitido)" },
              { field: "stage_id",    type: "uuid",    req: false, desc: "ID da etapa (usa a primeira se omitido)" },
              { field: "source",      type: "string",  req: false, desc: "Origem: Instagram, Facebook Ads, Indicação, Site, Outro" },
              { field: "notes",       type: "string",  req: false, desc: "Observações" },
              { field: "tags",        type: "string[]", req: false, desc: "Lista de tags (nomes)" },
            ].map(r => (
              <div key={r.field} className="grid grid-cols-[120px_80px_1fr] px-3 py-2 text-xs">
                <span className="font-mono text-primary">{r.field}</span>
                <span className="text-muted-foreground">{r.type}</span>
                <span className="text-muted-foreground">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exemplo cURL */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground flex items-center gap-1 select-none">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            Ver exemplo cURL
          </summary>
          <div className="mt-2 bg-[#1A1A2E] rounded-lg p-4 font-mono text-xs text-[#E0E0E0] whitespace-pre overflow-x-auto relative">
            {curlExample}
            <button
              onClick={() => { navigator.clipboard.writeText(curlExample); toast.success("Copiado!"); }}
              className="absolute top-2 right-2 p-1.5 rounded bg-white/10 hover:bg-white/20 text-white"
            >
              <Copy size={12} />
            </button>
          </div>
        </details>
      </Card>

      {/* Chaves */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Suas chaves" subtitle="Cada chave autentica requisições do webhook" />
          {!showCreateForm && (
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 h-8"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus size={13} className="mr-1" /> Nova chave
            </Button>
          )}
        </div>

        {showCreateForm && (
          <div className="flex gap-2 mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <Input
              placeholder="Nome da chave (ex: Site, RD Station)"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              className="border-card-border text-sm h-9"
              onKeyDown={e => e.key === "Enter" && handleGenerate()}
            />
            <Button size="sm" className="bg-primary hover:bg-primary/90 h-9 shrink-0" onClick={handleGenerate} disabled={generating}>
              {generating ? "Gerando..." : "Gerar"}
            </Button>
            <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => setShowCreateForm(false)}>
              Cancelar
            </Button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : keys.length === 0 ? (
          <div className="text-center py-8">
            <KeyRound size={32} className="mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma chave criada ainda.</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Clique em "Nova chave" para começar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map(k => {
              const visible = visibleKeys.has(k.id);
              const masked  = k.key.slice(0, 12) + "••••••••••••••••••••••••";
              return (
                <div key={k.id} className="flex items-center gap-3 p-3 border border-card-border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{k.label}</p>
                    <p className="font-mono text-xs text-muted-foreground truncate mt-0.5">
                      {visible ? k.key : masked}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Criada em {fmtDate(k.created_at)}
                      {k.last_used_at && ` · Último uso ${fmtDate(k.last_used_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleVisible(k.id)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title={visible ? "Ocultar" : "Mostrar"}
                    >
                      {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(k.key); toast.success("Chave copiada!"); }}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title="Copiar"
                    >
                      <Copy size={13} />
                    </button>
                    <Switch
                      checked={k.active}
                      onCheckedChange={() => handleToggle(k)}
                      className="data-[state=checked]:bg-primary scale-75"
                    />
                    <button
                      onClick={() => setDeleteTarget(k)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive"
                      title="Excluir"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal: chave recém-criada */}
      <Dialog open={!!newKeyModal} onOpenChange={v => !v && setNewKeyModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chave criada com sucesso</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Copie e guarde sua chave agora. Por segurança, ela <strong>não será exibida novamente</strong>.
          </p>
          <div className="flex gap-2">
            <Input
              value={newKeyModal?.key ?? ""}
              readOnly
              className="font-mono text-xs border-card-border"
            />
            <Button
              variant="outline"
              size="icon"
              className="border-card-border shrink-0"
              onClick={() => { navigator.clipboard.writeText(newKeyModal?.key ?? ""); toast.success("Copiada!"); }}
            >
              <Copy size={14} />
            </Button>
          </div>
          <DialogFooter className="mt-3">
            <Button className="bg-primary hover:bg-primary/90 w-full" onClick={() => setNewKeyModal(null)}>
              <CheckCircle2 size={14} className="mr-1" /> Entendido, já copiei
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: confirmar exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover chave</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover a chave <strong>{deleteTarget?.label}</strong>?
            Integrações que usam esta chave deixarão de funcionar.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Google Sheets */}
      <GoogleSheetsGuide />
    </>
  );
}

/* ---------------- GOOGLE SHEETS GUIDE ---------------- */
const APPS_SCRIPT = `// ================================================
// Rezult CRM – Integração Google Sheets → Meta Ads
// ================================================
// 1. Conecte seu formulário do Meta ao Google Sheets
//    (Meta Business Suite > Formulários > Integrar > Google Sheets)
// 2. Abra a planilha > Extensões > Apps Script
// 3. Cole este código e salve (Ctrl+S)
// 4. Execute instalarGatilho() UMA VEZ (menu Executar)
// ================================================

const REZULT_API_KEY = 'SUA_CHAVE_AQUI'; // Chave gerada em Configurações > Chaves de API
const REZULT_WEBHOOK = '${WEBHOOK_URL}';
const PIPELINE_ID   = ''; // (opcional) ID do pipeline — vazio = usa o padrão
const STAGE_ID      = ''; // (opcional) ID da etapa  — vazio = usa a primeira

// Sinônimos de colunas aceitos automaticamente
const FIELD_MAP = {
  name:  ['nome completo', 'full_name', 'nome', 'name', 'primeiro nome'],
  phone: ['telefone', 'celular', 'whatsapp', 'phone_number', 'phone', 'número'],
  email: ['email', 'e-mail', 'correio'],
};

function onNovaLinha() {
  try {
    const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                         .map(h => String(h).toLowerCase().trim());
    const row     = sheet.getLastRow();
    if (row < 2) return; // ignora se só tiver cabeçalho
    const values  = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    const rowData = {};
    headers.forEach((h, i) => { rowData[h] = values[i]; });

    const find = (keys) => {
      for (const k of keys) {
        if (rowData[k] !== undefined && String(rowData[k]).trim() !== '') {
          return String(rowData[k]).trim();
        }
      }
      return '';
    };

    const payload = {
      name:   find(FIELD_MAP.name),
      phone:  find(FIELD_MAP.phone).replace(/\\D/g, ''),
      email:  find(FIELD_MAP.email),
      source: 'Facebook Ads',
      tags:   ['Meta Lead Ads'],
    };

    if (PIPELINE_ID) payload.pipeline_id = PIPELINE_ID;
    if (STAGE_ID)    payload.stage_id    = STAGE_ID;

    const resp = UrlFetchApp.fetch(REZULT_WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': REZULT_API_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const result = JSON.parse(resp.getContentText());
    Logger.log(result.success
      ? '✅ Lead criado: ' + result.lead_id
      : '❌ Erro: ' + JSON.stringify(result));
  } catch (err) {
    Logger.log('❌ Erro: ' + err.toString());
  }
}

// Execute esta função UMA VEZ para registrar o gatilho automático
function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onNovaLinha')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  Logger.log('✅ Gatilho instalado! Novos leads serão enviados automaticamente ao Rezult.');
}`;

function GoogleSheetsGuide() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT);
    setCopied(true);
    toast.success("Código copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    {
      n: "1",
      title: "Conecte o formulário ao Google Sheets",
      desc: "No Meta Business Suite, acesse seu formulário instantâneo > Integrar > Google Sheets. O Meta vai criar automaticamente uma planilha com os dados de cada novo lead.",
    },
    {
      n: "2",
      title: "Abra o Apps Script",
      desc: 'Dentro da planilha criada, clique em Extensões > Apps Script. Uma nova aba abrirá com o editor de código.',
    },
    {
      n: "3",
      title: "Cole o código abaixo e configure",
      desc: 'Apague o conteúdo padrão, cole o código, substitua SUA_CHAVE_AQUI pela sua chave de API (gerada acima) e salve (Ctrl+S).',
    },
    {
      n: "4",
      title: "Execute instalarGatilho() uma vez",
      desc: 'No menu do Apps Script, selecione a função instalarGatilho e clique em Executar. A partir daí, cada novo lead do formulário será enviado automaticamente ao Rezult.',
    },
  ];

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#E8F5E9" }}>
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
            <rect x="6" y="4" width="36" height="40" rx="3" fill="#0F9D58" />
            <rect x="12" y="14" width="24" height="3" rx="1.5" fill="white" opacity="0.9" />
            <rect x="12" y="21" width="24" height="3" rx="1.5" fill="white" opacity="0.9" />
            <rect x="12" y="28" width="16" height="3" rx="1.5" fill="white" opacity="0.9" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Integração via Google Sheets</p>
          <p className="text-xs text-muted-foreground mt-0.5">Meta Lead Ads → Google Sheets → Rezult, sem custo adicional</p>
        </div>
        <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#E8F5E9", color: "#0F9D58" }}>
          GRATUITO
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
        Alternativa ao Make: use a integração nativa do Meta com Google Sheets e um pequeno script
        para enviar leads automaticamente ao Rezult assim que o formulário for preenchido.
      </p>

      {/* Steps */}
      <div className="space-y-3 mb-5">
        {steps.map(s => (
          <div key={s.n} className="flex gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5" style={{ background: "#128A68", color: "#fff" }}>
              {s.n}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Apps Script code */}
      <details className="group">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground flex items-center gap-1 select-none mb-2">
          <span className="group-open:hidden">▶</span>
          <span className="hidden group-open:inline">▼</span>
          Ver código do Apps Script
        </summary>
        <div className="relative">
          <div className="bg-[#1A1A2E] rounded-lg p-4 font-mono text-[11px] text-[#E0E0E0] whitespace-pre overflow-x-auto leading-relaxed max-h-80 overflow-y-auto">
            {APPS_SCRIPT}
          </div>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors"
            style={{ background: copied ? "#128A68" : "rgba(255,255,255,0.15)", color: "#fff" }}
          >
            {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      </details>

      <div className="mt-4 rounded-lg p-3 text-xs leading-relaxed" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534" }}>
        <strong>Dica:</strong> O script detecta automaticamente os campos da planilha por sinônimos em português e inglês
        (nome, telefone, e-mail). Se sua planilha usar nomes diferentes, edite o objeto <code className="font-mono bg-green-100 px-1 rounded">FIELD_MAP</code> no código.
      </div>
    </Card>
  );
}

/* ---------------- MCP ---------------- */
function McpSection() {
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-6">Servidor MCP</h1>
      <Card>
        <SectionTitle title="Model Context Protocol" subtitle="Configure conexões MCP para integrar agentes externos com seu CRM" />
        <div className="bg-muted border border-card-border rounded-lg p-4 font-mono text-xs text-muted-foreground">
          mcp://rezult.app/your-workspace
        </div>
        <Button className="mt-4 bg-primary hover:bg-primary/90"><Plus size={14} className="mr-1" /> Configurar servidor</Button>
      </Card>
    </>
  );
}

/* ---------------- ARMAZENAMENTO ---------------- */
function ArmazenamentoSection() {
  const { company } = useCompany();
  const navigate = useNavigate();

  const PLAN_STORAGE: Record<string, { bytes: number; label: string }> = {
    free:      { bytes: 500  * 1024 * 1024,         label: "500 MB" },
    starter:   { bytes: 2   * 1024 * 1024 * 1024,   label: "2 GB"   },
    essential: { bytes: 5   * 1024 * 1024 * 1024,   label: "5 GB"   },
    pro:       { bytes: 20  * 1024 * 1024 * 1024,   label: "20 GB"  },
  };

  const plan = company?.plan ?? "free";
  const planLimit = PLAN_STORAGE[plan] ?? PLAN_STORAGE.free;
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);

  const [loading, setLoading] = useState(true);
  const [filesBytes, setFilesBytes]         = useState(0);
  const [msgsBytes, setMsgsBytes]           = useState(0);
  const [convsBytes, setConvsBytes]         = useState(0);
  const [leadsBytes, setLeadsBytes]         = useState(0);
  const [activitiesBytes, setActivitiesBytes] = useState(0);
  const [automsBytes, setAutomsBytes]       = useState(0);
  const [tasksBytes, setTasksBytes]         = useState(0);
  const [othersBytes, setOthersBytes]       = useState(0);

  useEffect(() => {
    if (!company?.owner_id || !company?.id) return;
    const oid = company.owner_id;

    async function load() {
      try {
        const qCRM = (table: string) =>
          supabase.from(table).select("*", { count: "exact", head: true }).eq("owner_id", oid);

        // Busca IDs de todos os membros da empresa para agregar WhatsApp
        const { data: membersData } = await supabase.rpc("get_company_members", { p_company_id: company.id });
        const memberIds: string[] = (membersData ?? []).map((m: any) => m.id as string);
        const qWA = (table: string) =>
          memberIds.length > 0
            ? supabase.from(table).select("*", { count: "exact", head: true }).in("owner_id", memberIds)
            : supabase.from(table).select("*", { count: "exact", head: true }).eq("owner_id", oid);

        const [
          filesRes, msgsRes, convsRes, leadsRes,
          activitiesRes, automsRes, autoLogsRes, tasksRes,
          tagsRes, productsRes, listsRes, cfRes,
        ] = await Promise.all([
          supabase.from("lead_files").select("size, leads!inner(owner_id)").eq("leads.owner_id", oid),
          qWA("whatsapp_messages"),
          qWA("whatsapp_conversations"),
          qCRM("leads"),
          qCRM("activities"),
          qCRM("automations"),
          qCRM("automation_logs"),
          qCRM("tasks"),
          qCRM("tags"),
          qCRM("products"),
          qCRM("lists"),
          qCRM("custom_field_items"),
        ]);

        setFilesBytes((filesRes.data ?? []).reduce((acc: number, f: any) => acc + (f.size ?? 0), 0));
        setMsgsBytes((msgsRes.count ?? 0) * 512);
        setConvsBytes((convsRes.count ?? 0) * 1024);
        setLeadsBytes((leadsRes.count ?? 0) * 3 * 1024);
        setActivitiesBytes((activitiesRes.count ?? 0) * 1024);
        setAutomsBytes((automsRes.count ?? 0) * 5 * 1024 + (autoLogsRes.count ?? 0) * 512);
        setTasksBytes((tasksRes.count ?? 0) * 512);
        setOthersBytes(
          (tagsRes.count ?? 0) * 256 +
          (productsRes.count ?? 0) * 512 +
          (listsRes.count ?? 0) * 256 +
          (cfRes.count ?? 0) * 512
        );
      } catch {
        // silencioso — mantém zeros
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [company?.owner_id, company?.id]);

  const fmtGB = (b: number) => {
    if (b === 0) return "0 GB";
    const gb = b / (1024 ** 3);
    return `${gb.toFixed(3)} GB`;
  };

  const fmtCat = (bytes: number, pct: number) => {
    if (bytes === 0) return "0 GB • 0%";
    return `${fmtGB(bytes)} • ${pct.toFixed(1)}%`;
  };

  const categories = [
    { label: "Mensagens",          color: "#3B82F6", bytes: msgsBytes        },
    { label: "Conversas",          color: "#06B6D4", bytes: convsBytes       },
    { label: "Arquivos de leads",  color: "#8B5CF6", bytes: filesBytes       },
    { label: "Leads e negócios",   color: "#F97316", bytes: leadsBytes       },
    { label: "Atividades",         color: "#10B981", bytes: activitiesBytes  },
    { label: "Automações",         color: "#EF4444", bytes: automsBytes      },
    { label: "Tarefas",            color: "#F59E0B", bytes: tasksBytes       },
    { label: "Outros registros",   color: "#94A3B8", bytes: othersBytes      },
  ];

  const totalBytes = categories.reduce((s, c) => s + c.bytes, 0);

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Armazenamento</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gerencie o armazenamento da sua conta e contrate armazenamento extra quando necessário</p>
        </div>
        <Button variant="outline" className="text-sm border-card-border shrink-0 ml-4" onClick={() => navigate("/configuracoes/planos")}>
          Gerenciar planos e uso
        </Button>
      </div>

      {/* Resumo do plano */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm text-muted-foreground">Total de armazenamento</span>
          <span className="text-base font-bold text-primary">{planLimit.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-6 border-t border-card-border pt-5">
          <div>
            <p className="text-xs font-semibold text-foreground mb-3">Armazenamento do plano</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Plano contratado</p>
                <p className="text-sm font-semibold text-foreground mt-1">{planName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Limite do plano</p>
                <p className="text-sm font-semibold text-foreground mt-1">{planLimit.label}</p>
              </div>
            </div>
          </div>
          <div className="border-l border-card-border pl-6">
            <p className="text-xs font-semibold text-foreground mb-3">Armazenamento adicional</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Adicional contratado</p>
                <p className="text-sm font-semibold text-foreground mt-1">0 GB</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Frequência</p>
                <p className="text-sm font-semibold text-foreground mt-1">—</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Consumo por categoria */}
      <Card>
        <div className="flex items-baseline justify-between mb-4">
          <p className="text-sm font-semibold text-foreground">Consumo por categoria</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{fmtGB(totalBytes)}</span>
            {" / "}{planLimit.label}
          </p>
        </div>

        {/* Barra segmentada */}
        <div className="h-4 bg-muted rounded-full overflow-hidden flex">
          {loading ? null : categories.map((cat, i) => {
            const pct = planLimit.bytes > 0 ? Math.min(100, (cat.bytes / planLimit.bytes) * 100) : 0;
            if (pct < 0.01) return null;
            const isFirst = categories.findIndex(c => (planLimit.bytes > 0 ? c.bytes / planLimit.bytes * 100 : 0) >= 0.01) === i;
            const lastIdx = [...categories].reverse().findIndex(c => (planLimit.bytes > 0 ? c.bytes / planLimit.bytes * 100 : 0) >= 0.01);
            const isLast = lastIdx >= 0 && categories.length - 1 - lastIdx === i;
            return (
              <div
                key={cat.label}
                style={{
                  width: `${pct}%`,
                  background: cat.color,
                  borderRadius: isFirst && isLast ? "9999px" : isFirst ? "9999px 0 0 9999px" : isLast ? "0 9999px 9999px 0" : undefined,
                }}
              />
            );
          })}
        </div>

        {/* Lista de categorias */}
        <div className="mt-4 divide-y divide-card-border">
          {categories.map(cat => {
            const pct = planLimit.bytes > 0 ? (cat.bytes / planLimit.bytes) * 100 : 0;
            return (
              <div key={cat.label} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                  <span className="text-sm text-foreground">{cat.label}</span>
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">{fmtCat(cat.bytes, pct)}</span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
          <span className="text-muted-foreground">ⓘ</span>
          Arquivos de leads são medidos em tamanho real. Registros de banco (leads, mensagens, atividades) são estimativas por contagem de registros.
        </p>
      </Card>
    </>
  );
}

/* ---------------- helpers ---------------- */
function SectionHeader({ title, subtitle, onAdd, onClick }: { title: string; subtitle?: string; onAdd: string; onClick: () => void }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <Button onClick={onClick} className="bg-primary hover:bg-primary/90"><Plus size={14} className="mr-1" />{onAdd.replace("+ ", "")}</Button>
    </div>
  );
}

function ChangePasswordDialog({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [pw, setPw] = useState("");
  const strength = pw.length === 0 ? 0 : pw.length < 6 ? 1 : pw.length < 10 ? 2 : 3;
  const strengthLabel = ["", "Fraca", "Média", "Forte"][strength];
  const strengthColor = ["", "#E24B4A", "#F59E0B", "#128A68"][strength];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader><DialogTitle>Alterar senha</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Input type="password" placeholder="Senha atual" />
          <Input type="password" placeholder="Nova senha" value={pw} onChange={e => setPw(e.target.value)} />
          <Input type="password" placeholder="Confirmar nova senha" />
          {pw.length > 0 && (
            <div>
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-1 flex-1 rounded-full" style={{ backgroundColor: i <= strength ? strengthColor : "#E5E5E5" }} />
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: strengthColor }}>{strengthLabel}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => { toast.success("Senha alterada!"); setOpen(false); setPw(""); }} className="bg-primary hover:bg-primary/90">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
