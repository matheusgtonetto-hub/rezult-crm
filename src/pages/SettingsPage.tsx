import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCRM } from "@/context/CRMContext";
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
  Phone, Mail, Calendar, MessageSquare, MapPin,
} from "lucide-react";

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
  <div className={`bg-white border-[0.5px] border-[#E5E5E5] rounded-xl p-6 mb-5 ${className}`}>{children}</div>
);

const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-4">
    <h2 className="text-base font-semibold text-[#111111]">{title}</h2>
    {subtitle && <p className="text-xs text-[#AAAAAA] mt-0.5">{subtitle}</p>}
  </div>
);

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout, products, teamMembers, memberColors } = useCRM();
  const [active, setActive] = useState<SectionId>("perfil");
  const [pwOpen, setPwOpen] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [twoFA, setTwoFA] = useState(false);
  const [theme, setTheme] = useState("claro");

  return (
    <div className="flex h-screen bg-[#FAFAFA]">
      {/* Sidebar */}
      <aside className="w-[200px] bg-white border-r-[0.5px] border-[#E5E5E5] flex flex-col shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-[13px] text-[#666666] hover:bg-[#F5F5F5] px-4 py-3 border-b-[0.5px] border-[#E5E5E5]"
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
                    ? "bg-[#E1F5EE] text-[#0F6E56] border-l-[3px] border-[#0F6E56] font-medium pl-[13px]"
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
          {active === "perfil" && <PerfilSection logout={logout} setPwOpen={setPwOpen} twoFA={twoFA} setTwoFA={setTwoFA} theme={theme} setTheme={setTheme} />}
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
function PerfilSection({ logout, setPwOpen, twoFA, setTwoFA, theme, setTheme }: any) {
  return (
    <>
      <h1 className="text-xl font-semibold text-[#111111] mb-6">Meu perfil</h1>

      <Card>
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-full bg-[#0F6E56] flex items-center justify-center text-white text-2xl font-semibold shrink-0">
            RP
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#111111]">Rodrigo Pessoal</h2>
              <CheckCircle2 size={16} className="text-[#0F6E56]" />
              <span className="text-base">🇧🇷</span>
            </div>
            <p className="text-[13px] text-[#AAAAAA] mt-1">rodrigo@rezult.com</p>
            <p className="text-xs text-[#AAAAAA] mt-1">Criado em 09 de março de 2026</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="border-[#E5E5E5] text-[#666666]">
            Sair
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Informações" subtitle="Suas informações de cadastro e login" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#666666] mb-1 block">Nome</label>
            <Input defaultValue="Rodrigo Pessoal" className="border-[#E5E5E5]" />
          </div>
          <div>
            <label className="text-xs text-[#666666] mb-1 block">Telefone</label>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 px-3 border-[0.5px] border-[#E5E5E5] rounded-md bg-[#F5F5F5] text-[13px]">🇧🇷 +55</div>
              <Input defaultValue="(11) 99999-0000" className="border-[#E5E5E5] flex-1" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[#666666] mb-1 block">E-mail</label>
            <Input type="email" defaultValue="rodrigo@rezult.com" className="border-[#E5E5E5]" />
          </div>
          <div>
            <label className="text-xs text-[#666666] mb-1 block">Senha</label>
            <Button variant="outline" onClick={() => setPwOpen(true)} className="w-full border-[#E5E5E5] text-[#666666] justify-start">
              Alterar senha
            </Button>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={() => toast.success("Informações salvas!")} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90">Salvar</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Imagem de perfil" subtitle="Faça o upload da sua imagem de perfil aqui" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#0F6E56] flex items-center justify-center text-white font-semibold shrink-0">RP</div>
          <div className="flex-1 border-[1.5px] border-dashed border-[#E5E5E5] rounded-lg p-6 text-center hover:border-[#0F6E56] cursor-pointer transition-colors">
            <Upload size={20} className="text-[#AAAAAA] mx-auto mb-1" />
            <p className="text-[13px] text-[#666666]">Escolher arquivo</p>
            <p className="text-xs text-[#AAAAAA] mt-1">JPG, PNG, GIF · max 2MB</p>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={() => toast.success("Imagem salva!")} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90">Salvar</Button>
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
              <SelectTrigger className="border-[#E5E5E5] max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="claro">Claro</SelectItem>
                <SelectItem value="escuro">Escuro</SelectItem>
                <SelectItem value="sistema">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start justify-between pt-3 border-t border-[#E5E5E5]">
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
        <Input placeholder="Buscar empresa..." className="border-[#E5E5E5] mb-3" />
        <div className="border-[0.5px] border-[#E5E5E5] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 hover:bg-[#F9F9F9]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#0F6E56] text-white flex items-center justify-center text-sm font-semibold">R</div>
              <div>
                <p className="text-[13px] font-medium text-[#111111]">Rezult Demo</p>
                <p className="text-xs text-[#AAAAAA]">Plano Professional</p>
              </div>
            </div>
            <button className="text-[#0F6E56] text-sm">→</button>
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
    </>
  );
}

/* ---------------- TAGS ---------------- */
function TagsSection() {
  const tags = [
    { name: "Follow-up", color: "#E24B4A", count: 12 },
    { name: "SDR", color: "#888888", count: 8 },
    { name: "Proposta", color: "#378ADD", count: 6 },
    { name: "Negociação", color: "#8B5CF6", count: 4 },
    { name: "Reunião", color: "#F59E0B", count: 3 },
  ];
  return (
    <>
      <SectionHeader title="Tags" onAdd="+ Nova tag" onClick={() => toast.success("Em breve")} />
      <Card>
        <div className="space-y-2">
          {tags.map(t => (
            <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#E5E5E5] rounded-lg">
              <button className="w-5 h-5 rounded-full border border-[#E5E5E5]" style={{ backgroundColor: t.color }} />
              <p className="flex-1 text-[13px] text-[#111111] font-medium">{t.name}</p>
              <span className="text-xs text-[#AAAAAA]">{t.count} leads</span>
              <button className="text-[#666666] hover:text-[#111111] p-1"><Pencil size={14} /></button>
              <button className="text-[#666666] hover:text-[#E24B4A] p-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </Card>
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
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#E5E5E5] rounded-lg">
              <div className="w-9 h-9 rounded-lg bg-[#E1F5EE] flex items-center justify-center">
                <Package size={16} className="text-[#0F6E56]" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-[#111111]">{p.name}</p>
                <p className="text-xs text-[#AAAAAA]">SKU: {p.sku}</p>
              </div>
              <span className="text-sm font-semibold text-[#0F6E56]">
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
            <div key={m} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#E5E5E5] rounded-lg">
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
            <div key={l.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#E5E5E5] rounded-lg">
              <List size={16} className="text-[#0F6E56]" />
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
            <div key={c.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#E5E5E5] rounded-lg">
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
            <div key={d.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#E5E5E5] rounded-lg">
              <Building2 size={16} className="text-[#0F6E56]" />
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
                className="border-[#E5E5E5] w-32"
              />
              <span className="text-xs text-[#AAAAAA]">às</span>
              <Input
                type="time" value={s.end} disabled={!s.active}
                onChange={e => setSchedule(prev => prev.map((p, idx) => idx === i ? { ...p, end: e.target.value } : p))}
                className="border-[#E5E5E5] w-32"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-5">
          <Button onClick={() => toast.success("Horários salvos!")} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90">Salvar horários</Button>
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
            <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 border-[0.5px] border-[#E5E5E5] rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-[#E1F5EE] flex items-center justify-center">
                <t.icon size={14} className="text-[#0F6E56]" />
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
          <div key={i.name} className="bg-white border-[0.5px] border-[#E5E5E5] rounded-xl p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E1F5EE] flex items-center justify-center shrink-0">
              <i.icon size={18} className="text-[#0F6E56]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-[#111111]">{i.name}</p>
                <Badge variant="secondary" className="text-[10px] h-5">Em breve</Badge>
              </div>
              <p className="text-xs text-[#AAAAAA]">{i.description}</p>
              <Button size="sm" variant="outline" className="mt-3 h-7 text-xs rounded-md border-[#E5E5E5]" disabled>
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
          <Input value={showApi ? key : masked} readOnly className="border-[#E5E5E5] font-mono text-[13px]" />
          <Button variant="outline" size="icon" onClick={() => setShowApi((v: boolean) => !v)} className="border-[#E5E5E5]">
            {showApi ? <EyeOff size={14} /> : <Eye size={14} />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(key); toast.success("Copiado!"); }} className="border-[#E5E5E5]">
            <Copy size={14} />
          </Button>
        </div>
        <div className="mt-5 pt-5 border-t border-[#E5E5E5]">
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
        <div className="bg-[#F5F5F5] border-[0.5px] border-[#E5E5E5] rounded-lg p-4 font-mono text-xs text-[#666666]">
          mcp://rezult.app/your-workspace
        </div>
        <Button className="mt-4 bg-[#0F6E56] hover:bg-[#0F6E56]/90"><Plus size={14} className="mr-1" /> Configurar servidor</Button>
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
          <p className="text-sm text-[#0F6E56] font-medium">24%</p>
        </div>
        <Progress value={24} className="h-2 [&>div]:bg-[#0F6E56]" />
        <div className="mt-6 space-y-3">
          {breakdown.map(b => (
            <div key={b.label}>
              <div className="flex justify-between text-[13px] mb-1">
                <span className="text-[#111111]">{b.label}</span>
                <span className="text-[#666666]">{b.size}</span>
              </div>
              <div className="h-1 bg-[#F5F5F5] rounded-full overflow-hidden">
                <div className="h-full bg-[#0F6E56]" style={{ width: `${b.pct * 4}%` }} />
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" className="mt-5 border-[#E5E5E5]">Liberar espaço</Button>
      </Card>
    </>
  );
}

/* ---------------- helpers ---------------- */
function SectionHeader({ title, onAdd, onClick }: { title: string; onAdd: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold text-[#111111]">{title}</h1>
      <Button onClick={onClick} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90"><Plus size={14} className="mr-1" />{onAdd.replace("+ ", "")}</Button>
    </div>
  );
}

function ChangePasswordDialog({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const [pw, setPw] = useState("");
  const strength = pw.length === 0 ? 0 : pw.length < 6 ? 1 : pw.length < 10 ? 2 : 3;
  const strengthLabel = ["", "Fraca", "Média", "Forte"][strength];
  const strengthColor = ["", "#E24B4A", "#F59E0B", "#0F6E56"][strength];
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
          <Button onClick={() => { toast.success("Senha alterada!"); setOpen(false); setPw(""); }} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
