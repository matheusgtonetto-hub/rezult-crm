import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
import { useProfile } from "@/context/ProfileContext";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, User, Tag, Package, XCircle, List, FormInput, Building2,
  Clock, Activity, Plug, Link2, KeyRound, Server, HardDrive,
  CheckCircle2, Trash2, Pencil, Plus, Upload, Copy, Eye, EyeOff,
  Phone, Mail, Calendar, MessageSquare, MapPin, Lock,
} from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SectionId =
  | "perfil" | "tags" | "produtos" | "motivos" | "listas" | "campos"
  | "departamentos" | "horarios" | "atividades" | "integracoes"
  | "conexoes" | "api" | "mcp" | "armazenamento";

const SECTIONS: { id: SectionId; label: string; icon: any }[] = [
  { id: "perfil", label: "Meu perfil", icon: User },
  { id: "tags", label: "Tags", icon: Tag },
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
  const [theme, setTheme] = useState("claro");

  return (
    <div className="flex h-screen bg-[#FAFAFA]">
      {/* Sidebar */}
      <aside className="w-[200px] bg-white border-r-[0.5px] border-[#EEEEEE] flex flex-col shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-[13px] text-[#666666] hover:bg-[#F5F5F5] px-4 py-3 border-b-[0.5px] border-[#EEEEEE]"
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
                    : "text-[#666666] hover:bg-[#F5F5F5]"
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
        <div className="max-w-[720px] mx-auto p-8">
          {active === "perfil" && <PerfilSection setPwOpen={setPwOpen} twoFA={twoFA} setTwoFA={setTwoFA} theme={theme} setTheme={setTheme} />}
          {active === "tags" && <TagsSection />}
          {active === "produtos" && <ProdutosSection products={products} />}
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
function PerfilSection({ setPwOpen, twoFA, setTwoFA, theme, setTheme }: any) {
  const { profile, updateProfile, uploadAvatar } = useProfile();
  const { user, signOut } = useAuth();
  const { company, updateCompany } = useCompany();
  const [name, setName]       = useState(profile?.full_name ?? "");
  const [phone, setPhone]     = useState(company?.phone ?? "");
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync name when profile loads asynchronously
  useEffect(() => {
    if (profile) setName(profile.full_name ?? "");
  }, [profile]);

  // Sync phone when company loads asynchronously
  useEffect(() => {
    if (company) setPhone(company.phone ?? "");
  }, [company?.id]);

  const initials = (n: string) =>
    n.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const authEmail = user?.email ?? profile?.email ?? "";

  const createdDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "";

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updateProfile({ full_name: name }),
        company ? updateCompany({ phone }) : Promise.resolve(),
      ]);
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
          <Button variant="outline" size="sm" onClick={signOut} className="border-[#EEEEEE] text-[#666666]">
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
            <label className="text-xs text-[#666666] mb-1 block">Nome</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome completo"
              className="border-[#EEEEEE]"
            />
          </div>

          {/* Telefone — salva em companies */}
          <div>
            <label className="text-xs text-[#666666] mb-1 block">Telefone</label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-0000"
              className="border-[#EEEEEE]"
            />
          </div>

          {/* E-mail — somente leitura, vem do auth */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <label className="text-xs text-[#666666]">E-mail</label>
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
            <label className="text-xs text-[#666666] mb-1 block">Senha</label>
            <Button
              variant="outline"
              onClick={() => setPwOpen(true)}
              className="w-full border-[#EEEEEE] text-[#666666] justify-start"
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
            <p className="text-[13px] text-[#666666]">{uploading ? "Enviando..." : "Escolher arquivo"}</p>
            <p className="text-xs text-[#AAAAAA] mt-1">JPG, PNG, GIF · max 2MB</p>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Preferências" subtitle="Personalize a aparência do app selecionando o tema" />
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-[13px] text-[#111111]">Tema</label>
              <Badge className="bg-[#FEF3C7] text-[#92400E] hover:bg-[#FEF3C7] text-[10px] h-4">Beta</Badge>
            </div>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="border-[#EEEEEE] max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="claro">Claro</SelectItem>
                <SelectItem value="escuro">Escuro</SelectItem>
                <SelectItem value="sistema">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start justify-between pt-3 border-t border-[#EEEEEE]">
            <div className="flex-1 pr-4">
              <p className="text-[13px] text-[#111111] font-medium">Verificação em duas etapas</p>
              <p className="text-xs text-[#AAAAAA] mt-0.5">Adicione uma camada extra de segurança à sua conta. Um código será enviado ao seu e-mail a cada login.</p>
            </div>
            <Switch checked={twoFA} onCheckedChange={setTwoFA} />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Empresas" subtitle="Empresas que você possui ou participa" />
        <Input placeholder="Buscar empresa..." className="border-[#EEEEEE] mb-3" />
        <div className="border-[0.5px] border-[#EEEEEE] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-[#F9F9F9]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#128A68] text-white flex items-center justify-center text-sm font-semibold">R</div>
              <div>
                <p className="text-[13px] font-medium text-[#111111]">Rezult Demo</p>
                <p className="text-xs text-[#AAAAAA]">Plano Professional</p>
              </div>
            </div>
            <button className="text-[#128A68] text-sm">→</button>
          </div>
        </div>
        <p className="text-xs text-[#AAAAAA] mt-3 text-right">1 de 1</p>
      </Card>

      <Card className="border-[#FECACA] bg-[#FEF2F2]">
        <SectionTitle title="Excluir conta" subtitle="Você tem um prazo de 30 dias para poder restaurar sua conta." />
        <Button variant="outline" className="border-[#E24B4A] text-[#E24B4A] hover:bg-[#E24B4A] hover:text-white">
          <Trash2 size={14} className="mr-2" /> Excluir conta
        </Button>
      </Card>
    </TooltipProvider>
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
                <button onClick={() => openEdit(t)} className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
                <button onClick={() => deleteTag(t.id)} className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
              <label className="text-xs font-medium text-[#666666] mb-1.5 block">Nome *</label>
              <input
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#128A68]"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Urgente"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#666666] mb-1.5 block">Descrição</label>
              <input
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#128A68]"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descrição opcional"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#666666] mb-2 block">Cor</label>
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
                <span className="text-xs text-[#666666]">Cor selecionada: <strong>{color}</strong></span>
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
function ProdutosSection({ products }: any) {
  return (
    <>
      <SectionHeader title="Produtos" onAdd="+ Novo produto" onClick={() => toast.info("Em breve: cadastro de produtos")} />
      <Card>
        <div className="space-y-2">
          {products.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#EEEEEE] rounded-lg">
              <div className="w-9 h-9 rounded-lg bg-[#E1F5EE] flex items-center justify-center">
                <Package size={16} className="text-[#128A68]" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-[#111111]">{p.name}</p>
                <p className="text-xs text-[#AAAAAA]">SKU: {p.sku}</p>
              </div>
              <span className="text-sm font-semibold text-[#128A68]">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.defaultValue)}
              </span>
              <button className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
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
              <button className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
              <button className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
              <button className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
              <button className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
              <button className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
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
        <div className="bg-[#F5F5F5] border-[0.5px] border-[#EEEEEE] rounded-lg p-4 font-mono text-xs text-[#666666]">
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
                <span className="text-[#666666]">{b.size}</span>
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
function SectionHeader({ title, onAdd, onClick }: { title: string; onAdd: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold text-[#111111]">{title}</h1>
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
