import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  ArrowLeft, User, Tag, Package, XCircle, List, FormInput, Building2,
  Clock, Activity, Plug, Link2, KeyRound, Server, HardDrive,
  CheckCircle2, Trash2, Pencil, Plus, Upload, Copy, Eye, EyeOff,
  Phone, Mail, Calendar, MessageSquare, MapPin, Lock, Users, Crown,
  UserPlus, UserMinus, FileText, CreditCard, Check, Zap,
} from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { PLANS } from "@/data/plans";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SectionId =
  | "perfil" | "empresa" | "planos" | "tags" | "produtos" | "motivos" | "listas" | "campos"
  | "departamentos" | "horarios" | "atividades" | "integracoes"
  | "conexoes" | "api" | "mcp" | "armazenamento";

const SECTIONS: { id: SectionId; label: string; icon: any }[] = [
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

const Card = ({ children, className = "" }: any) => (
  <div className={`bg-white border-[0.5px] border-[#EEEEEE] rounded-xl p-6 mb-5 ${className}`}>{children}</div>
);

const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-4">
    <h2 className="text-base font-semibold text-[#111111]">{title}</h2>
    {subtitle && <p className="text-xs text-[#AAAAAA] mt-0.5">{subtitle}</p>}
  </div>
);

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout, products } = useCRM();
  const [active, setActive] = useState<SectionId>("perfil");
  const [pwOpen, setPwOpen] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [twoFA, setTwoFA] = useState(false);

  return (
    <div className="flex h-screen bg-[#FAFAFA]">
      {/* Sidebar */}
      <aside className="w-[200px] bg-white border-r-[0.5px] border-[#EEEEEE] flex flex-col shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-[13px] text-[#535353] hover:bg-[#F5F5F5] px-4 py-3 border-b-[0.5px] border-[#EEEEEE]"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
        <nav className="flex-1 overflow-y-auto py-2">
          {SECTIONS.map(s => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-2.5 text-[13px] px-4 py-2.5 transition-colors ${
                  isActive
                    ? "bg-[#E1F5EE] text-[#128A68] border-l-[3px] border-[#128A68] font-medium pl-[13px]"
                    : "text-[#535353] hover:bg-[#F5F5F5]"
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
          {active === "conexoes" && <IntegracoesSection />}
          {active === "api" && <ApiSection showApi={showApi} setShowApi={setShowApi} />}
          {active === "mcp" && <McpSection />}
          {active === "armazenamento" && <ArmazenamentoSection />}
        </div>
      </div>

      <ChangePasswordDialog open={pwOpen} setOpen={setPwOpen} />
    </div>
  );
}

/* ---------------- PERFIL ---------------- */
function PerfilSection({ setPwOpen }: any) {
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
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Meu perfil</h1>

      {/* Cabeçalho do perfil */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-[#128A68] flex items-center justify-center text-white text-2xl font-semibold shrink-0 overflow-hidden">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
              : initials(name || "?")}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {/* Nome reativo — sempre reflete o full_name salvo em profiles */}
              <h2 className="text-lg font-bold text-[#111111]">
                {profile?.full_name || "—"}
              </h2>
              <CheckCircle2 size={16} className="text-[#128A68]" />
            </div>
            <p className="text-[13px] text-[#AAAAAA] mt-1">{authEmail}</p>
            {createdDate && (
              <p className="text-xs text-[#AAAAAA] mt-1">Conta criada em {createdDate}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="border-[#EEEEEE] text-[#535353]">
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
            <label className="text-xs text-[#535353] mb-1 block">Nome</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome completo"
              className="border-[#EEEEEE]"
            />
          </div>

          {/* Telefone — salva em companies */}
          <div>
            <label className="text-xs text-[#535353] mb-1 block">Telefone</label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>

          {/* E-mail — somente leitura, vem do auth */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-xs text-[#535353]">E-mail</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock size={11} className="text-[#AAAAAA] cursor-help" />
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
                className="border-[#EEEEEE] bg-[#FAFAFA] text-[#AAAAAA] cursor-not-allowed pr-9"
              />
              <Lock
                size={13}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#CCCCCC] pointer-events-none"
              />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label className="text-xs text-[#535353] mb-1 block">Senha</label>
            <Button
              variant="outline"
              onClick={() => setPwOpen(true)}
              className="w-full border-[#EEEEEE] text-[#535353] justify-start"
            >
              Alterar senha
            </Button>
          </div>
        </div>

        <div className="flex justify-end mt-5 pt-4 border-t border-[#F5F5F5]">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#128A68] hover:bg-[#128A68]/90 min-w-[100px]"
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </Card>

      {/* Preferências */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#111111]">Preferências</p>
            <p className="text-xs text-[#AAAAAA] mt-0.5">Personalize a aparência do app selecionando o tema</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-[#535353] whitespace-nowrap">Tema</label>
            <Select value={theme} onValueChange={(v) => handleTheme(v as "light" | "dark")}>
              <SelectTrigger className="border-[#EEEEEE] w-32">
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
          <div className="w-16 h-16 rounded-full bg-[#128A68] flex items-center justify-center text-white font-semibold shrink-0 overflow-hidden">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
              : initials(name || "?")}
          </div>
          <div
            className="flex-1 border-[1.5px] border-dashed border-[#EEEEEE] rounded-lg p-6 text-center hover:border-[#128A68] cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <Upload size={20} className="text-[#AAAAAA] mx-auto mb-1" />
            <p className="text-[13px] text-[#535353]">{uploading ? "Enviando..." : "Escolher arquivo"}</p>
            <p className="text-xs text-[#AAAAAA] mt-1">JPG, PNG, GIF · max 2MB</p>
          </div>
        </div>
      </Card>

      {company && (
        <Card>
          <SectionTitle title="Empresa" subtitle="Empresa vinculada à sua conta" />
          <div className="border-[0.5px] border-[#EEEEEE] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 hover:bg-[#F9F9F9]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[#128A68] text-white flex items-center justify-center text-sm font-semibold">
                  {company.name?.[0]?.toUpperCase() ?? "E"}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#111111]">{company.name}</p>
                  <p className="text-xs text-[#AAAAAA]">
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
    <div className="flex items-center h-10 border border-[#EEEEEE] rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-[#128A68] focus-within:border-[#128A68]">
      <div className="flex items-center gap-1.5 px-3 h-full bg-[#FAFAFA] border-r border-[#EEEEEE] shrink-0 select-none">
        <span className="text-base leading-none">🇧🇷</span>
        <span className="text-sm text-[#535353] font-medium">+55</span>
      </div>
      <input
        type="tel"
        value={value}
        onChange={e => onChange(maskPhone(e.target.value))}
        placeholder="(11) 99999-0000"
        maxLength={15}
        className="flex-1 px-3 h-full text-sm outline-none bg-white text-[#111111] placeholder:text-[#CCCCCC]"
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
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Empresa</h1>

      {/* Cabeçalho da empresa */}
      <Card className="!p-4">
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 rounded-full bg-[#128A68] flex items-center justify-center text-white text-xl font-semibold shrink-0 overflow-hidden">
            {company?.logo_url
              ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain" />
              : logoInitial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#111111]">{company?.name || "—"}</h2>
              <CheckCircle2 size={16} className="text-[#128A68]" />
            </div>
            {company?.email && (
              <p className="text-[13px] text-[#AAAAAA] mt-0.5">{company.email}</p>
            )}
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-2 flex-wrap">
                {company?.niche && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#111111] bg-white text-[11px] font-medium text-[#111111]">
                    {company.niche}
                  </span>
                )}
                {createdDate && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-[#AAAAAA]">
                    <Calendar size={12} className="text-[#AAAAAA] shrink-0" />
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
                        ? "bg-[#E1F5EE] text-[#128A68]"
                        : "text-[#535353] hover:bg-[#F5F5F5]"
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
            <label className="text-xs text-[#535353] mb-1 block">Nome da empresa *</label>
            <Input value={name} onChange={e => setName(e.target.value)}
              placeholder="Preencha com o nome da sua empresa" className="border-[#EEEEEE]" />
          </div>
          <div>
            <label className="text-xs text-[#535353] mb-1 block">E-mail da empresa</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Preencha com o e-mail da sua empresa" className="border-[#EEEEEE]" />
          </div>
          <div>
            <label className="text-xs text-[#535353] mb-1 block">Nicho</label>
            <Input value={niche} onChange={e => setNiche(e.target.value)}
              placeholder="Exemplo: Vendas" className="border-[#EEEEEE]" />
          </div>
          <div>
            <label className="text-xs text-[#535353] mb-1 block">Telefone</label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>
        </div>
      </Card>

      {/* Logo */}
      <Card>
        <SectionTitle title="Logo da empresa" subtitle="Faça o upload do logotipo da sua empresa aqui" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-[#128A68] flex items-center justify-center text-white text-2xl font-bold shrink-0 overflow-hidden border border-[#EEEEEE]">
            {company?.logo_url
              ? <img src={company.logo_url} alt="Logo" className="w-full h-full object-contain" />
              : logoInitial}
          </div>
          <div
            className="flex-1 border-[1.5px] border-dashed border-[#EEEEEE] rounded-lg p-6 text-center hover:border-[#128A68] cursor-pointer transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <Upload size={20} className="text-[#AAAAAA] mx-auto mb-1" />
            <p className="text-[13px] text-[#535353]">{uploading ? "Enviando..." : "Escolher arquivo"}</p>
            <p className="text-xs text-[#AAAAAA] mt-1">PNG, JPG, SVG · max 2MB</p>
          </div>
        </div>
      </Card>

      {/* Documentos */}
      <Card>
        <SectionTitle title="Documentos" subtitle="Cadastre os dados da sua empresa" />
        <div className="space-y-4">
          {/* Tipo de pessoa */}
          <div>
            <label className="text-xs text-[#535353] mb-1.5 block">Tipo de Pessoa</label>
            <div className="flex gap-2">
              {(["pj", "pf"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setDocType(t); setDocument(""); }}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                    docType === t
                      ? "bg-[#128A68] text-white border-[#128A68]"
                      : "bg-white text-[#535353] border-[#EEEEEE] hover:border-[#128A68]"
                  }`}
                >
                  {t === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}
                </button>
              ))}
            </div>
          </div>

          {/* Documento */}
          <div>
            <label className="text-xs text-[#535353] mb-1 block">
              {docType === "pj" ? "CNPJ" : "CPF"}
            </label>
            <Input
              value={document}
              onChange={e => handleDocChange(e.target.value)}
              placeholder={docType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
              className="border-[#EEEEEE]"
            />
          </div>
        </div>
      </Card>

      {/* Endereço */}
      <Card>
        <SectionTitle title="Endereço" subtitle="Endereço completo da sua empresa" />
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#535353] mb-1 block">CEP</label>
            <div className="relative">
              <Input value={zipCode} onChange={e => handleCepChange(e.target.value)}
                placeholder="00000-000" className="border-[#EEEEEE]" maxLength={9} />
              {loadingCep && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 rounded-full border-2 border-[#128A68] border-t-transparent animate-spin" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#535353] mb-1 block">Endereço</label>
            <Input value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Rua, Avenida..." className="border-[#EEEEEE]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#535353] mb-1 block">Número</label>
              <Input value={number} onChange={e => setNumber(e.target.value)}
                placeholder="123" className="border-[#EEEEEE]" />
            </div>
            <div>
              <label className="text-xs text-[#535353] mb-1 block">Complemento</label>
              <Input value={complement} onChange={e => setComplement(e.target.value)}
                placeholder="Apto, Sala..." className="border-[#EEEEEE]" />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#535353] mb-1 block">Bairro</label>
            <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              placeholder="Bairro" className="border-[#EEEEEE]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#535353] mb-1 block">Cidade</label>
              <Input value={city} onChange={e => setCity(e.target.value)}
                placeholder="São Paulo" className="border-[#EEEEEE]" />
            </div>
            <div>
              <label className="text-xs text-[#535353] mb-1 block">UF</label>
              <Input value={state} onChange={e => setState(e.target.value.toUpperCase())}
                placeholder="SP" className="border-[#EEEEEE]" maxLength={2} />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5 pt-4 border-t border-[#F5F5F5]">
          <Button onClick={handleSave} disabled={saving}
            className="bg-[#128A68] hover:bg-[#128A68]/90 min-w-[100px]">
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
}

interface PendingInvite {
  id: string;
  email: string;
  created_at: string;
}

function EquipeSection() {
  const { user } = useAuth();
  const { company } = useCompany();
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  const isAdmin = company?.owner_id === user?.id;

  const initials = (n: string) =>
    n.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const loadMembers = useCallback(async () => {
    if (!company?.name) return;
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .eq("company_name", company.name)
      .order("full_name");
    setMembers((data ?? []) as Member[]);
    setLoading(false);
  }, [company?.name]);

  const loadPendingInvites = useCallback(async () => {
    if (!isAdmin || !company?.id) return;
    const { data } = await supabase
      .from("company_invites")
      .select("id, email, created_at")
      .eq("company_id", company.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    setPendingInvites((data ?? []) as PendingInvite[]);
  }, [isAdmin, company?.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { loadPendingInvites(); }, [loadPendingInvites]);

  const handleAddMember = async () => {
    if (!inviteEmail.trim()) { toast.error("Informe o e-mail do usuário."); return; }
    setInviting(true);
    const { data, error } = await supabase.rpc("add_member_to_company", {
      member_email: inviteEmail.trim().toLowerCase(),
    });
    setInviting(false);
    if (error) { toast.error("Erro ao processar convite."); return; }

    if (data === "ok") {
      toast.success("Membro adicionado com sucesso!");
      loadMembers();
    } else if (data === "invited") {
      toast.success("Convite registrado! Quando esse e-mail criar uma conta, o acesso será liberado automaticamente.");
      loadPendingInvites();
    } else if (data === "no_company") {
      toast.error("Sua conta ainda não está vinculada a uma empresa.");
      return;
    }
    setInviteEmail("");
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

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#111111]">Equipe</h1>
          <p className="text-xs text-[#AAAAAA] mt-0.5">Gerencie os membros vinculados à sua empresa</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setAddOpen(true)} className="bg-[#128A68] hover:bg-[#128A68]/90">
            <UserPlus size={14} className="mr-1.5" /> Adicionar membro
          </Button>
        )}
      </div>

      {/* Membros ativos */}
      <Card>
        <SectionTitle title="Membros ativos" />
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 rounded-full border-2 border-[#128A68] border-t-transparent animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-8">
            <Users size={28} className="text-[#CCCCCC] mx-auto mb-2" />
            <p className="text-sm text-[#AAAAAA]">Nenhum membro na equipe ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(m => {
              const isOwner = m.id === company?.owner_id;
              const isSelf  = m.id === user?.id;
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg hover:bg-[#FAFAFA] transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-[#128A68] flex items-center justify-center text-white text-sm font-semibold shrink-0 overflow-hidden">
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
                      : initials(m.full_name || m.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-medium text-[#111111] truncate">
                        {m.full_name || "—"}
                        {isSelf && <span className="text-[#AAAAAA] font-normal ml-1">(você)</span>}
                      </p>
                      {isOwner && (
                        <span className="inline-flex items-center gap-1 bg-[#FFF8E7] text-[#D97706] border border-[#FDE68A] rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0">
                          <Crown size={9} /> Admin
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#AAAAAA] truncate">{m.email}</p>
                  </div>
                  {isAdmin && !isOwner && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      disabled={removing === m.id}
                      className="text-[#CCCCCC] hover:text-[#E24B4A] p-1 transition-colors disabled:opacity-50"
                      title="Remover da equipe"
                    >
                      {removing === m.id
                        ? <div className="w-4 h-4 rounded-full border-2 border-[#E24B4A] border-t-transparent animate-spin" />
                        : <UserMinus size={15} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!loading && members.length > 0 && (
          <p className="text-xs text-[#AAAAAA] mt-3 text-right">
            {members.length} {members.length === 1 ? "membro" : "membros"}
          </p>
        )}
      </Card>

      {/* Convites pendentes — visível apenas para admin */}
      {isAdmin && (
        <Card>
          <SectionTitle
            title="Convites pendentes"
            subtitle="Aguardando o usuário criar uma conta com o e-mail convidado"
          />
          {pendingInvites.length === 0 ? (
            <p className="text-sm text-[#AAAAAA] text-center py-4">Nenhum convite pendente.</p>
          ) : (
            <div className="space-y-2">
              {pendingInvites.map(inv => (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg bg-[#FAFAFA]"
                >
                  <div className="w-9 h-9 rounded-full bg-[#F0F0F0] flex items-center justify-center shrink-0">
                    <Mail size={14} className="text-[#AAAAAA]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-[#535353] truncate">{inv.email}</p>
                    <p className="text-[11px] text-[#AAAAAA]">
                      Convidado em {new Date(inv.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className="inline-flex items-center bg-[#FFF8E7] text-[#D97706] border border-[#FDE68A] rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0">
                    Aguardando
                  </span>
                  <button
                    onClick={() => handleCancelInvite(inv.email)}
                    disabled={canceling === inv.email}
                    className="text-[#CCCCCC] hover:text-[#E24B4A] p-1 transition-colors disabled:opacity-50"
                    title="Cancelar convite"
                  >
                    {canceling === inv.email
                      ? <div className="w-4 h-4 rounded-full border-2 border-[#E24B4A] border-t-transparent animate-spin" />
                      : <XCircle size={15} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={v => { if (!v) { setAddOpen(false); setInviteEmail(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar membro à equipe</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <label className="text-xs font-medium text-[#535353]">E-mail do usuário *</label>
            <Input
              type="email"
              placeholder="joao@empresa.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddMember()}
              className="border-[#EEEEEE]"
              autoFocus
            />
            <div className="bg-[#F0F9F5] border border-[#C6E9DC] rounded-lg px-3 py-2.5 mt-2">
              <p className="text-[11px] text-[#128A68] leading-relaxed">
                <strong>Já tem conta:</strong> o acesso é liberado imediatamente.<br />
                <strong>Sem conta ainda:</strong> o convite fica registrado e o acesso é liberado automaticamente ao criar a conta com este e-mail.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} className="border-[#EEEEEE]">Cancelar</Button>
            <Button onClick={handleAddMember} disabled={inviting} className="bg-[#128A68] hover:bg-[#128A68]/90">
              {inviting ? "Processando..." : "Convidar"}
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
    <div className="bg-white border-[0.5px] border-[#EEEEEE] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-[#E1F5EE] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <p className="text-[13px] font-medium text-[#111111]">{label}</p>
      </div>
      <p className="text-xl font-bold text-[#111111]">
        {current.toLocaleString("pt-BR")}
        <span className="text-sm font-normal text-[#AAAAAA] ml-1">/ {displayLimit}</span>
      </p>
      {limit !== null && (
        <Progress value={pct} className="h-1.5 mt-2 [&>div]:bg-[#128A68]" />
      )}
    </div>
  );
}

function PlanosSection() {
  const { company } = useCompany();
  const { leads, pipelines, teamMembers } = useCRM();

  const planKey = company?.plan ?? "free";
  const planDef = PLANS.find(p => p.key === planKey);
  const limits  = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free;

  const leadsCount    = Object.keys(leads).length;
  const pipelinesCount = pipelines.length;
  const membersCount  = teamMembers.length;

  const logoInitial = (company?.name?.[0] ?? "E").toUpperCase();

  return (
    <>
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Planos e pagamentos</h1>

      {/* Cabeçalho */}
      <Card className="!p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E1F5EE] flex items-center justify-center shrink-0">
              <CreditCard size={20} className="text-[#128A68]" />
            </div>
            <div>
              <p className="text-base font-semibold text-[#111111]">Planos e pagamentos</p>
              <p className="text-xs text-[#AAAAAA] mt-0.5">Controle seus planos, pagamentos e uso do Rezult CRM</p>
            </div>
          </div>
          {company && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-[#128A68] flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                {company.logo_url
                  ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain" />
                  : logoInitial}
              </div>
              <p className="text-[13px] font-medium text-[#111111]">{company.name}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Plano atual */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs text-[#AAAAAA] mb-1">Plano atual</p>
            <p className="text-2xl font-bold text-[#128A68]">{PLAN_LABELS[planKey] ?? planKey}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="border-[#EEEEEE] text-[#535353]">
              Gerenciar plano
            </Button>
            <Button size="sm" className="bg-[#128A68] hover:bg-[#128A68]/90">
              Upgrade
            </Button>
          </div>
        </div>

        <div className="flex items-stretch gap-0 border border-[#EEEEEE] rounded-xl overflow-hidden">
          {/* Renova em */}
          <div className="flex-1 px-4 py-3">
            <p className="text-[11px] text-[#AAAAAA] mb-1">Renova em</p>
            <p className="text-[13px] font-semibold text-[#111111]">
              {company?.plan_expires_at ? fmtDate(company.plan_expires_at) : "—"}
            </p>
          </div>
          <div className="w-px bg-[#EEEEEE] self-stretch" />
          {/* Valor */}
          <div className="flex-1 px-4 py-3">
            <p className="text-[11px] text-[#AAAAAA] mb-1">Valor</p>
            <p className="text-[13px] font-semibold text-[#111111]">
              {planDef?.pricing.mensal ?? (planKey === "free" ? "Grátis" : "—")}
            </p>
          </div>
          <div className="w-px bg-[#EEEEEE] self-stretch" />
          {/* Frequência */}
          <div className="flex-1 px-4 py-3">
            <p className="text-[11px] text-[#AAAAAA] mb-1">Frequência</p>
            <p className="text-[13px] font-semibold text-[#111111]">Mensal</p>
          </div>
          <div className="w-px bg-[#EEEEEE] self-stretch" />
          {/* Método de pagamento */}
          <div className="flex-1 px-4 py-3">
            <p className="text-[11px] text-[#AAAAAA] mb-1">Método de pagamento</p>
            <div className="flex items-center gap-1.5">
              <CreditCard size={13} className="text-[#535353] shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-[#111111] leading-none">Cartão de crédito</p>
                <p className="text-[11px] text-[#AAAAAA] mt-0.5">**** **** **** 5432</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Benefícios do plano */}
      {planDef && (
        <Card>
          <SectionTitle title="Benefícios do plano" subtitle={`Recursos incluídos no plano ${planDef.name}`} />
          <div className="grid grid-cols-2 gap-2">
            {planDef.features.map(f => (
              <div key={f} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#E1F5EE] flex items-center justify-center shrink-0">
                  <Check size={10} className="text-[#128A68]" strokeWidth={2.5} />
                </div>
                <p className="text-[13px] text-[#111111]">{f}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Cards de uso */}
      <p className="text-base font-semibold text-[#111111] mb-3">Uso do plano</p>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <UsageCard label="Leads" current={leadsCount} limit={limits.leads} icon={<Users size={14} className="text-[#128A68]" />} />
        <UsageCard label="Membros" current={membersCount} limit={limits.members} icon={<Users size={14} className="text-[#128A68]" />} />
        <UsageCard label="Pipelines" current={pipelinesCount} limit={limits.pipelines} icon={<Zap size={14} className="text-[#128A68]" />} />
        <UsageCard label="Conexões" current={0} limit={limits.connections} icon={<Link2 size={14} className="text-[#128A68]" />} />
        <UsageCard label="Automações" current={0} limit={limits.automations} icon={<Zap size={14} className="text-[#128A68]" />} />
        <UsageCard label="Integrações" current={0} limit={3} icon={<Plug size={14} className="text-[#128A68]" />} />
      </div>
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
          <p className="text-sm text-[#AAAAAA] text-center py-6">Nenhuma tag criada ainda.</p>
        ) : (
          <div className="space-y-2">
            {crmTags.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg">
                <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[#111111] font-medium leading-tight">{t.name}</p>
                  {t.description && <p className="text-[11px] text-[#AAAAAA] truncate">{t.description}</p>}
                </div>
                <span className="text-xs text-[#AAAAAA] shrink-0">{tagLeadCounts[t.name] ?? 0} leads</span>
                <button onClick={() => openEdit(t)} className="text-[#535353] hover:text-[#111111] p-1"><Pencil size={14} /></button>
                <button onClick={() => deleteTag(t.id)} className="text-[#535353] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
              <label className="text-xs font-medium text-[#535353] mb-1.5 block">Nome *</label>
              <input
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#128A68]"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Urgente"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#535353] mb-1.5 block">Descrição</label>
              <input
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#128A68]"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descrição opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#535353] mb-2 block">Cor</label>
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
                <span className="text-xs text-[#535353]">Cor selecionada: <strong>{color}</strong></span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-[#EEEEEE]">Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#128A68] hover:bg-[#128A68]/90">
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

      <div className="bg-white border-[0.5px] border-[#EEEEEE] rounded-xl overflow-hidden mb-5">
        {products.length === 0 ? (
          <p className="text-sm text-[#AAAAAA] text-center py-10">Nenhum produto cadastrado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-[#EEEEEE] hover:bg-transparent">
                <TableHead className="text-[#AAAAAA] text-xs font-medium">Produto</TableHead>
                <TableHead className="text-[#AAAAAA] text-xs font-medium">Identificador (SKU)</TableHead>
                <TableHead className="text-[#AAAAAA] text-xs font-medium">Preço</TableHead>
                <TableHead className="text-[#AAAAAA] text-xs font-medium">Data de criação</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map(p => (
                <TableRow key={p.id} className="border-[#EEEEEE] hover:bg-[#FAFAFA]">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#E1F5EE] flex items-center justify-center shrink-0">
                        <Package size={14} className="text-[#128A68]" />
                      </div>
                      <span className="text-[13px] font-medium text-[#111111]">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[13px] text-[#535353]">{p.sku || "—"}</TableCell>
                  <TableCell>
                    <span className="text-[13px] font-semibold text-[#128A68]">{fmt(p.defaultValue)}</span>
                  </TableCell>
                  <TableCell className="text-[13px] text-[#535353]">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="text-[#CCCCCC] hover:text-[#535353] p-1 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteProduct(p.id)} className="text-[#CCCCCC] hover:text-[#E24B4A] p-1 transition-colors">
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

      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <label className="text-xs font-medium text-[#535353] mb-1.5 block">Nome *</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Consultoria mensal"
                autoFocus
                className="border-[#EEEEEE]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#535353] mb-1.5 block">Identificador (SKU) *</label>
              <Input
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="Ex: produto1"
                className="border-[#EEEEEE]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#535353] mb-1.5 block">Preço *</label>
              <Input
                value={price}
                onChange={e => handlePriceChange(e.target.value)}
                placeholder="R$ 0,00"
                inputMode="numeric"
                className="border-[#EEEEEE]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-[#EEEEEE]">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#128A68] hover:bg-[#128A68]/90">
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
  const motivos = ["Preço alto", "Sem orçamento no momento", "Escolheu concorrente", "Sem resposta", "Projeto cancelado"];
  return (
    <>
      <SectionHeader title="Motivos de perda" onAdd="+ Novo motivo" onClick={() => toast.success("Em breve")} />
      <Card>
        <div className="space-y-2">
          {motivos.map(m => (
            <div key={m} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg">
              <p className="flex-1 text-[13px] text-[#111111]">{m}</p>
              <button className="text-[#535353] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#535353] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------------- LISTAS ---------------- */
function ListasSection() {
  const listas = [
    { name: "Leads quentes", count: 18 },
    { name: "Clientes ativos", count: 42 },
    { name: "Para reativar", count: 7 },
  ];
  return (
    <>
      <SectionHeader title="Listas" onAdd="+ Nova lista" onClick={() => toast.success("Em breve")} />
      <Card>
        <div className="space-y-2">
          {listas.map(l => (
            <div key={l.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg">
              <List size={16} className="text-[#128A68]" />
              <p className="flex-1 text-[13px] text-[#111111] font-medium">{l.name}</p>
              <span className="text-xs text-[#AAAAAA]">{l.count} leads</span>
              <button className="text-[#535353] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#535353] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------------- CAMPOS ---------------- */
function CamposSection() {
  const campos = [
    { name: "Ramo da empresa", type: "Texto", required: false },
    { name: "Orçamento disponível", type: "Número", required: true },
    { name: "Decisor", type: "Checkbox", required: false },
    { name: "Previsão de fechamento", type: "Data", required: false },
  ];
  return (
    <>
      <SectionHeader title="Campos adicionais" onAdd="+ Novo campo" onClick={() => toast.success("Em breve")} />
      <Card>
        <div className="space-y-2">
          {campos.map(c => (
            <div key={c.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg">
              <p className="flex-1 text-[13px] text-[#111111] font-medium">{c.name}</p>
              <Badge variant="secondary" className="text-xs">{c.type}</Badge>
              <Switch defaultChecked={c.required} />
              <button className="text-[#535353] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#535353] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
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
            <div key={d.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg">
              <Building2 size={16} className="text-[#128A68]" />
              <p className="flex-1 text-[13px] text-[#111111] font-medium">{d.name}</p>
              <span className="text-xs text-[#AAAAAA]">{d.count} membros</span>
              <button className="text-[#535353] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#535353] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Horários de trabalho</h1>
      <Card>
        <div className="space-y-3">
          {schedule.map((s, i) => (
            <div key={s.day} className="flex items-center gap-3">
              <Switch
                checked={s.active}
                onCheckedChange={(v) => setSchedule(prev => prev.map((p, idx) => idx === i ? { ...p, active: v } : p))}
              />
              <p className="text-[13px] text-[#111111] w-24">{s.day}</p>
              <Input
                type="time" value={s.start} disabled={!s.active}
                onChange={e => setSchedule(prev => prev.map((p, idx) => idx === i ? { ...p, start: e.target.value } : p))}
                className="border-[#EEEEEE] w-32"
              />
              <span className="text-xs text-[#AAAAAA]">às</span>
              <Input
                type="time" value={s.end} disabled={!s.active}
                onChange={e => setSchedule(prev => prev.map((p, idx) => idx === i ? { ...p, end: e.target.value } : p))}
                className="border-[#EEEEEE] w-32"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <Button onClick={() => toast.success("Horários salvos!")} className="bg-[#128A68] hover:bg-[#128A68]/90">Salvar horários</Button>
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
            <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-[#E1F5EE] flex items-center justify-center">
                <t.icon size={14} className="text-[#128A68]" />
              </div>
              <p className="flex-1 text-[13px] text-[#111111] font-medium">{t.name}</p>
              <button className="text-[#535353] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#535353] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------------- INTEGRAÇÕES ---------------- */
function IntegracoesSection() {
  const items = [
    { name: "WhatsApp", description: "Envie e receba mensagens direto do CRM.", icon: MessageSquare },
    { name: "Asaas", description: "Cobranças e histórico financeiro automatizados.", icon: KeyRound },
    { name: "Google Calendar", description: "Sincronize tarefas e reuniões com seu calendário.", icon: Calendar },
  ];
  return (
    <>
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Integrações</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map(i => (
          <div key={i.name} className="bg-white border-[0.5px] border-[#EEEEEE] rounded-xl p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E1F5EE] flex items-center justify-center shrink-0">
              <i.icon size={18} className="text-[#128A68]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-[#111111]">{i.name}</p>
                <Badge variant="secondary" className="text-[10px] h-5">Em breve</Badge>
              </div>
              <p className="text-xs text-[#AAAAAA]">{i.description}</p>
              <Button size="sm" variant="outline" className="mt-3 h-7 text-xs rounded-md border-[#EEEEEE]" disabled>
                Conectar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- API ---------------- */
function ApiSection({ showApi, setShowApi }: any) {
  const key = "rz_live_a8f3b2c91d7e4f5a6b8c9d0e1f2a3b4c";
  const masked = "rz_live_••••••••••••••••••••••••";
  return (
    <>
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Chaves de API</h1>
      <Card>
        <SectionTitle title="Sua chave de API" subtitle="Use esta chave para integrar o Rezult com sistemas externos" />
        <div className="flex gap-2">
          <Input value={showApi ? key : masked} readOnly className="border-[#EEEEEE] font-mono text-[13px]" />
          <Button variant="outline" size="icon" onClick={() => setShowApi((v: boolean) => !v)} className="border-[#EEEEEE]">
            {showApi ? <EyeOff size={14} /> : <Eye size={14} />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(key); toast.success("Copiado!"); }} className="border-[#EEEEEE]">
            <Copy size={14} />
          </Button>
        </div>
        <div className="mt-5 pt-5 border-t border-[#EEEEEE]">
          <Button variant="outline" className="border-[#E24B4A] text-[#E24B4A] hover:bg-[#E24B4A] hover:text-white">
            Gerar nova chave
          </Button>
          <p className="text-xs text-[#E24B4A] mt-2">⚠ Isso invalidará a chave atual</p>
        </div>
      </Card>
    </>
  );
}

/* ---------------- MCP ---------------- */
function McpSection() {
  return (
    <>
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Servidor MCP</h1>
      <Card>
        <SectionTitle title="Model Context Protocol" subtitle="Configure conexões MCP para integrar agentes externos com seu CRM" />
        <div className="bg-[#F5F5F5] border-[0.5px] border-[#EEEEEE] rounded-lg p-4 font-mono text-xs text-[#535353]">
          mcp://rezult.app/your-workspace
        </div>
        <Button className="mt-4 bg-[#128A68] hover:bg-[#128A68]/90"><Plus size={14} className="mr-1" /> Configurar servidor</Button>
      </Card>
    </>
  );
}

/* ---------------- ARMAZENAMENTO ---------------- */
function ArmazenamentoSection() {
  const breakdown = [
    { label: "Arquivos de leads", size: "1.2 GB", pct: 12 },
    { label: "Gravações de calls", size: "890 MB", pct: 9 },
    { label: "Materiais de agentes", size: "310 MB", pct: 3 },
  ];
  return (
    <>
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Armazenamento</h1>
      <Card>
        <SectionTitle title="Uso de armazenamento" subtitle="Acompanhe o consumo do seu plano" />
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-2xl font-semibold text-[#111111]">2.4 GB <span className="text-sm text-[#AAAAAA] font-normal">de 10 GB</span></p>
          <p className="text-sm text-[#128A68] font-medium">24%</p>
        </div>
        <Progress value={24} className="h-2 [&>div]:bg-[#128A68]" />
        <div className="mt-6 space-y-3">
          {breakdown.map(b => (
            <div key={b.label}>
              <div className="flex justify-between text-[13px] mb-1">
                <span className="text-[#111111]">{b.label}</span>
                <span className="text-[#535353]">{b.size}</span>
              </div>
              <div className="h-1 bg-[#F5F5F5] rounded-full overflow-hidden">
                <div className="h-full bg-[#128A68]" style={{ width: `${b.pct * 4}%` }} />
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" className="mt-5 border-[#EEEEEE]">Liberar espaço</Button>
      </Card>
    </>
  );
}

/* ---------------- helpers ---------------- */
function SectionHeader({ title, subtitle, onAdd, onClick }: { title: string; subtitle?: string; onAdd: string; onClick: () => void }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-[#111111]">{title}</h1>
        {subtitle && <p className="text-xs text-[#AAAAAA] mt-0.5">{subtitle}</p>}
      </div>
      <Button onClick={onClick} className="bg-[#128A68] hover:bg-[#128A68]/90"><Plus size={14} className="mr-1" />{onAdd.replace("+ ", "")}</Button>
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
          <Button onClick={() => { toast.success("Senha alterada!"); setOpen(false); setPw(""); }} className="bg-[#128A68] hover:bg-[#128A68]/90">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
