import { useState } from "react";
import {
  Plus,
  TrendingUp,
  Clock,
  AlertCircle,
  BarChart3,
  CreditCard,
  Banknote,
  QrCode,
  MoreHorizontal,
  Search,
  Download,
  Eye,
  MessageCircle,
  Link as LinkIcon,
  Check,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function initials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 45%)`;
}

type Status = "pago" | "pendente" | "vencido" | "cancelado";
type Method = "cartao" | "pix" | "boleto";

const STATUS_BADGE: Record<Status, { bg: string; fg: string; label: string }> = {
  pago: { bg: "#E1F5EE", fg: "#085041", label: "Pago" },
  pendente: { bg: "#FAEEDA", fg: "#633806", label: "Pendente" },
  vencido: { bg: "#FCEBEB", fg: "#A32D2D", label: "Vencido" },
  cancelado: { bg: "#F5F5F5", fg: "#666666", label: "Cancelado" },
};

function MethodIcon({ method, size = 14 }: { method: Method; size?: number }) {
  if (method === "cartao") return <CreditCard size={size} color="#0F6E56" />;
  if (method === "pix") return <QrCode size={size} color="#378ADD" />;
  return <Banknote size={size} color="#F59E0B" />;
}

const METHOD_LABEL: Record<Method, string> = { cartao: "Cartão", pix: "Pix", boleto: "Boleto" };

type Charge = {
  id: string;
  client: string;
  company: string;
  deal: string;
  amount: number;
  method: Method;
  due: string;
  status: Status;
};

const CHARGES: Charge[] = [
  { id: "c1", client: "Carlos Andrade", company: "Andrade & Cia", deal: "#1085", amount: 3500, method: "cartao", due: "20/05/2026", status: "pendente" },
  { id: "c2", client: "Mariana Costa", company: "MC Consultoria", deal: "#1092", amount: 6200, method: "cartao", due: "15/05/2026", status: "pendente" },
  { id: "c3", client: "Renata Oliveira", company: "RO Studio", deal: "#1078", amount: 5200, method: "pix", due: "10/05/2026", status: "pago" },
  { id: "c4", client: "Sandro Lima", company: "Lima Tech", deal: "#1065", amount: 4500, method: "cartao", due: "08/05/2026", status: "pago" },
  { id: "c5", client: "Bruno Alves", company: "BA Marketing", deal: "#1088", amount: 5000, method: "cartao", due: "25/05/2026", status: "pendente" },
  { id: "c6", client: "Camila Ferreira", company: "CF Beauty", deal: "#1091", amount: 3800, method: "boleto", due: "05/05/2026", status: "vencido" },
  { id: "c7", client: "Lucas Martins", company: "LM Imóveis", deal: "#1089", amount: 3200, method: "pix", due: "30/04/2026", status: "vencido" },
  { id: "c8", client: "Fernanda Lima", company: "FL Coach", deal: "#1076", amount: 4500, method: "cartao", due: "28/05/2026", status: "pendente" },
];

const UPCOMING = [
  { name: "Carlos Andrade", amount: 3500, due: "20/05/2026", days: 5 },
  { name: "Mariana Costa", amount: 6200, due: "15/05/2026", days: 2 },
  { name: "Bruno Alves", amount: 5000, due: "25/05/2026", days: 8 },
  { name: "Camila Ferreira", amount: 3800, due: "05/05/2026", days: -3 },
  { name: "Fernanda Lima", amount: 4500, due: "28/05/2026", days: 11 },
];

const MONTHLY = [
  { month: "Nov", cartao: 12400, pix: 5200, boleto: 1800 },
  { month: "Dez", cartao: 14100, pix: 6800, boleto: 2200 },
  { month: "Jan", cartao: 15600, pix: 7100, boleto: 2400 },
  { month: "Fev", cartao: 13800, pix: 5900, boleto: 1900 },
  { month: "Mar", cartao: 17200, pix: 8400, boleto: 2600 },
  { month: "Abr", cartao: 18900, pix: 6420, boleto: 1600 },
];

const SUBSCRIPTIONS = [
  { id: "s1", client: "Tech Solutions", plan: "Plano Pro", value: 1997, next: "01/06/2026", cycle: "Mensal", status: "Ativa" },
  { id: "s2", client: "Bela Moda Store", plan: "Plano Starter", value: 997, next: "15/06/2026", cycle: "Mensal", status: "Ativa" },
  { id: "s3", client: "DF Consulting", plan: "Plano Pro", value: 1997, next: "10/06/2026", cycle: "Mensal", status: "Ativa" },
  { id: "s4", client: "LA Cosméticos", plan: "Plano Starter", value: 997, next: "20/05/2026", cycle: "Mensal", status: "Pausada" },
  { id: "s5", client: "PH Consultoria", plan: "Plano Anual", value: 19970, next: "01/01/2027", cycle: "Anual", status: "Ativa" },
];

const COMMISSIONS = [
  { id: "k1", name: "Rafael Silva", role: "Coordenador", deals: "3 negócios", sold: 14700, pct: 8, value: 1176, status: "A pagar" },
  { id: "k2", name: "Fernanda Lima", role: "Closer", deals: "5 negócios", sold: 23900, pct: 10, value: 2390, status: "A pagar" },
  { id: "k3", name: "Carlos Andrade", role: "SDR", deals: "8 leads qualificados", sold: 23900, pct: 5, value: 1195, status: "A pagar" },
  { id: "k4", name: "Ana Paula", role: "SDR", deals: "6 leads qualificados", sold: 14700, pct: 5, value: 735, status: "Pago" },
];

type Tx = { id: string; date: string; desc: string; method?: Method; amount: number; balance: number };
const TRANSACTIONS: Tx[] = [
  { id: "t1", date: "19/04 14h32", desc: "Recebimento — Renata Oliveira", method: "pix", amount: 5200, balance: 22420 },
  { id: "t2", date: "18/04 10h15", desc: "Recebimento — Sandro Lima", method: "cartao", amount: 4500, balance: 17220 },
  { id: "t3", date: "17/04 16h00", desc: "Comissão paga — Ana Paula", amount: -735, balance: 12720 },
  { id: "t4", date: "16/04 09h22", desc: "Recebimento — Tech Solutions (assinatura)", method: "cartao", amount: 1997, balance: 13455 },
  { id: "t5", date: "15/04 11h45", desc: "Taxa plataforma", amount: -142, balance: 11458 },
  { id: "t6", date: "14/04 14h00", desc: "Recebimento — Bela Moda Store (assinatura)", method: "cartao", amount: 997, balance: 11600 },
  { id: "t7", date: "13/04 16h30", desc: "Comissão paga — Carlos", amount: -1195, balance: 10603 },
  { id: "t8", date: "12/04 09h00", desc: "Recebimento — DF Consulting (assinatura)", method: "cartao", amount: 1997, balance: 11798 },
  { id: "t9", date: "11/04 15h20", desc: "Recebimento — PH Consultoria", method: "cartao", amount: 5400, balance: 9801 },
  { id: "t10", date: "10/04 11h00", desc: "Taxa antecipação", amount: -89, balance: 4401 },
];

function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_BADGE[status];
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function MetricCard({ label, value, hint, icon, accent }: { label: string; value: string; hint: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] uppercase tracking-wide text-[#AAAAAA] font-semibold">{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}1A` }}>
          {icon}
        </div>
      </div>
      <div className="text-[24px] font-bold text-[#111111] mt-2">{value}</div>
      <div className="text-[12px] text-[#666] mt-1">{hint}</div>
    </div>
  );
}

function StackedBarChart() {
  const max = Math.max(...MONTHLY.map(m => m.cartao + m.pix + m.boleto));
  return (
    <div>
      <div className="flex items-end justify-between h-[180px] gap-3 px-2">
        {MONTHLY.map(m => {
          const total = m.cartao + m.pix + m.boleto;
          const h = (total / max) * 160;
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
              <div className="text-[10px] text-[#AAAAAA]">{BRL(total).replace("R$", "").trim()}</div>
              <div className="w-full flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: h }}>
                <div style={{ background: "#0F6E56", height: `${(m.cartao / total) * 100}%` }} />
                <div style={{ background: "#378ADD", height: `${(m.pix / total) * 100}%` }} />
                <div style={{ background: "#F59E0B", height: `${(m.boleto / total) * 100}%` }} />
              </div>
              <div className="text-[11px] text-[#666] font-medium">{m.month}</div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-[#666] justify-center">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#0F6E56" }} /> Cartão</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#378ADD" }} /> Pix</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#F59E0B" }} /> Boleto</span>
      </div>
    </div>
  );
}

export default function RezultPayPage() {
  const [openNew, setOpenNew] = useState(false);
  const [period, setPeriod] = useState("mes");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [methodFilter, setMethodFilter] = useState<string>("todos");
  const [draft, setDraft] = useState({
    client: "",
    deal: "",
    desc: "",
    amount: "",
    due: "",
    method: "cartao" as Method,
    installments: "1",
    recurring: false,
    cycle: "mensal",
    notifyWpp: true,
    notifyEmail: false,
  });

  const filteredCharges = CHARGES.filter(c => {
    if (statusFilter !== "todos" && c.status !== statusFilter) return false;
    if (methodFilter !== "todos" && c.method !== methodFilter) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!c.client.toLowerCase().includes(s) && !String(c.amount).includes(s)) return false;
    }
    return true;
  });

  function createCharge() {
    if (!draft.client || !draft.amount) {
      toast.error("Preencha cliente e valor");
      return;
    }
    toast.success("Cobrança criada com sucesso");
    setOpenNew(false);
    setDraft({ ...draft, client: "", desc: "", amount: "", due: "" });
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold text-[#111111] leading-tight">Rezult Pay</h1>
          <p className="text-[13px] text-[#AAAAAA] mt-1">
            Gestão financeira completa da sua operação comercial
          </p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white">
          <Plus size={16} /> Nova cobrança
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-transparent p-0 h-auto gap-1 border-b border-[#EEEEEE] w-full justify-start rounded-none mb-5">
          {[
            { v: "overview", l: "Visão Geral" },
            { v: "charges", l: "Cobranças" },
            { v: "subs", l: "Assinaturas" },
            { v: "commissions", l: "Comissões" },
            { v: "statement", l: "Extrato" },
          ].map(t => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="data-[state=active]:bg-transparent data-[state=active]:text-[#0F6E56] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#0F6E56] rounded-none text-[13px] px-3 py-2 -mb-px"
            >
              {t.l}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-5 mt-0">
          <div className="flex justify-end">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="ano">Este ano</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <MetricCard label="Total recebido" value={BRL(26920)} hint="+12% vs mês anterior" icon={<ArrowUpRight size={14} color="#0F6E56" />} accent="#0F6E56" />
            <MetricCard label="Total em aberto" value={BRL(32200)} hint="6 cobranças pendentes" icon={<Clock size={14} color="#F59E0B" />} accent="#F59E0B" />
            <MetricCard label="Total vencido" value={BRL(4500)} hint="2 cobranças vencidas" icon={<AlertCircle size={14} color="#E24B4A" />} accent="#E24B4A" />
            <MetricCard label="Previsão do mês" value={BRL(58120)} hint="Recebido + em aberto" icon={<BarChart3 size={14} color="#0F6E56" />} accent="#0F6E56" />
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-5">
            <h3 className="text-[14px] font-semibold text-[#111111] mb-4">Recebimentos mensais</h3>
            <StackedBarChart />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-5">
              <h3 className="text-[14px] font-semibold text-[#111111] mb-3">Cobranças recentes</h3>
              <div className="space-y-2">
                {CHARGES.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-2 border-b border-[#F0F0F0] last:border-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: colorFromString(c.client) }}>
                      {initials(c.client)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#111111] truncate">{c.client}</div>
                      <div className="text-[11px] text-[#AAAAAA] flex items-center gap-1.5">
                        <MethodIcon method={c.method} size={11} /> {METHOD_LABEL[c.method]} · {c.due}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-semibold text-[#0F6E56]">{BRL(c.amount)}</div>
                      <div className="mt-0.5"><StatusBadge status={c.status} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-5">
              <h3 className="text-[14px] font-semibold text-[#111111] mb-3">Próximos vencimentos</h3>
              <div className="space-y-2">
                {UPCOMING.map(u => {
                  const badgeColor = u.days < 0
                    ? { bg: "#FCEBEB", fg: "#A32D2D", label: `${Math.abs(u.days)}d vencido` }
                    : u.days <= 3
                      ? { bg: "#FAEEDA", fg: "#633806", label: `em ${u.days}d` }
                      : { bg: "#E1F5EE", fg: "#085041", label: `em ${u.days}d` };
                  return (
                    <div key={u.name} className="flex items-center gap-3 py-2 border-b border-[#F0F0F0] last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[#111111] truncate">{u.name}</div>
                        <div className="text-[11px] text-[#AAAAAA]">Vence em {u.due}</div>
                      </div>
                      <div className="text-[13px] font-semibold text-[#111111]">{BRL(u.amount)}</div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded shrink-0" style={{ background: badgeColor.bg, color: badgeColor.fg }}>
                        {badgeColor.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* CHARGES */}
        <TabsContent value="charges" className="space-y-4 mt-0">
          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA]" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou valor" className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Método" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos métodos</SelectItem>
                <SelectItem value="cartao">Cartão</SelectItem>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-[#0F6E56] text-[#0F6E56] hover:bg-[#E1F5EE]">
              <Download size={14} /> Exportar
            </Button>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#FAFAFA] text-[11px] uppercase text-[#AAAAAA] tracking-wide">
                  <th className="px-3 py-3 text-left w-8"><Checkbox /></th>
                  <th className="px-3 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-3 py-3 text-left font-semibold">Negócio</th>
                  <th className="px-3 py-3 text-left font-semibold">Valor</th>
                  <th className="px-3 py-3 text-left font-semibold">Método</th>
                  <th className="px-3 py-3 text-left font-semibold">Vencimento</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredCharges.map(c => (
                  <tr key={c.id} className="border-t border-[#F0F0F0] hover:bg-[#FAFAFA]">
                    <td className="px-3 py-3"><Checkbox /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: colorFromString(c.client) }}>
                          {initials(c.client)}
                        </div>
                        <div>
                          <div className="font-medium text-[#111111]">{c.client}</div>
                          <div className="text-[11px] text-[#AAAAAA]">{c.company}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <a href="/pipeline" className="text-[#0F6E56] hover:underline font-medium">{c.deal}</a>
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#111111]">{BRL(c.amount)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5"><MethodIcon method={c.method} /> {METHOD_LABEL[c.method]}</div>
                    </td>
                    <td className="px-3 py-3 text-[#666]">{c.due}</td>
                    <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-7 h-7 rounded-md hover:bg-[#F0F0F0] flex items-center justify-center text-[#666]">
                            <MoreHorizontal size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem><Eye size={14} className="mr-2" /> Ver detalhes</DropdownMenuItem>
                          <DropdownMenuItem><MessageCircle size={14} className="mr-2" /> Enviar lembrete</DropdownMenuItem>
                          <DropdownMenuItem><LinkIcon size={14} className="mr-2" /> Copiar link</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem><Check size={14} className="mr-2" /> Marcar como pago</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive"><XCircle size={14} className="mr-2" /> Cancelar cobrança</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filteredCharges.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-[#AAAAAA]">Nenhuma cobrança encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* SUBSCRIPTIONS */}
        <TabsContent value="subs" className="space-y-4 mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#111111]">Assinaturas recorrentes</h2>
            <Button className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white"><Plus size={16} /> Nova assinatura</Button>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <MetricCard label="MRR" value={BRL(12400)} hint="Receita recorrente mensal" icon={<TrendingUp size={14} color="#0F6E56" />} accent="#0F6E56" />
            <MetricCard label="Assinantes ativos" value="8" hint="Clientes recorrentes" icon={<Check size={14} color="#0F6E56" />} accent="#0F6E56" />
            <MetricCard label="Churn do mês" value="1" hint="Cancelamento" icon={<ArrowDownRight size={14} color="#E24B4A" />} accent="#E24B4A" />
            <MetricCard label="LTV médio" value={BRL(18600)} hint="Valor por cliente" icon={<BarChart3 size={14} color="#0F6E56" />} accent="#0F6E56" />
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#FAFAFA] text-[11px] uppercase text-[#AAAAAA] tracking-wide">
                  <th className="px-3 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-3 py-3 text-left font-semibold">Plano</th>
                  <th className="px-3 py-3 text-left font-semibold">Valor</th>
                  <th className="px-3 py-3 text-left font-semibold">Próxima cobrança</th>
                  <th className="px-3 py-3 text-left font-semibold">Ciclo</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {SUBSCRIPTIONS.map(s => {
                  const stColor = s.status === "Ativa"
                    ? { bg: "#E1F5EE", fg: "#085041" }
                    : s.status === "Pausada"
                      ? { bg: "#FAEEDA", fg: "#633806" }
                      : { bg: "#FCEBEB", fg: "#A32D2D" };
                  return (
                    <tr key={s.id} className="border-t border-[#F0F0F0] hover:bg-[#FAFAFA]">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: colorFromString(s.client) }}>
                            {initials(s.client)}
                          </div>
                          <span className="font-medium text-[#111111]">{s.client}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#666]">{s.plan}</td>
                      <td className="px-3 py-3 font-semibold text-[#111111]">{BRL(s.value)}<span className="text-[11px] font-normal text-[#AAAAAA]">/{s.cycle === "Anual" ? "ano" : "mês"}</span></td>
                      <td className="px-3 py-3 text-[#666]">{s.next}</td>
                      <td className="px-3 py-3 text-[#666]">{s.cycle}</td>
                      <td className="px-3 py-3"><span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: stColor.bg, color: stColor.fg }}>{s.status}</span></td>
                      <td className="px-3 py-3">
                        <button className="w-7 h-7 rounded-md hover:bg-[#F0F0F0] flex items-center justify-center text-[#666]">
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* COMMISSIONS */}
        <TabsContent value="commissions" className="space-y-4 mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#111111]">Comissões do time</h2>
            <div className="flex items-center gap-2">
              <Select defaultValue="abr">
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="abr">Abril 2026</SelectItem>
                  <SelectItem value="mar">Março 2026</SelectItem>
                  <SelectItem value="fev">Fevereiro 2026</SelectItem>
                </SelectContent>
              </Select>
              <Button className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white">Processar comissões</Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-4">
              <div className="text-[11px] uppercase tracking-wide text-[#AAAAAA] font-semibold">Total a pagar</div>
              <div className="text-[24px] font-bold text-[#111111] mt-2">{BRL(4836)}</div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-4">
              <div className="text-[11px] uppercase tracking-wide text-[#AAAAAA] font-semibold">Total pago</div>
              <div className="text-[24px] font-bold text-[#0F6E56] mt-2">{BRL(2100)}</div>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-4">
              <div className="text-[11px] uppercase tracking-wide text-[#AAAAAA] font-semibold">Vendedores com comissão</div>
              <div className="text-[24px] font-bold text-[#111111] mt-2">3</div>
            </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#FAFAFA] text-[11px] uppercase text-[#AAAAAA] tracking-wide">
                  <th className="px-3 py-3 text-left font-semibold">Vendedor</th>
                  <th className="px-3 py-3 text-left font-semibold">Negócios</th>
                  <th className="px-3 py-3 text-left font-semibold">Valor vendido</th>
                  <th className="px-3 py-3 text-left font-semibold">%</th>
                  <th className="px-3 py-3 text-left font-semibold">Comissão</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {COMMISSIONS.map(k => (
                  <tr key={k.id} className="border-t border-[#F0F0F0] hover:bg-[#FAFAFA]">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: colorFromString(k.name) }}>
                          {initials(k.name)}
                        </div>
                        <div>
                          <div className="font-medium text-[#111111]">{k.name}</div>
                          <div className="text-[11px] text-[#AAAAAA]">{k.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#666]">{k.deals}</td>
                    <td className="px-3 py-3 text-[#111111] font-medium">{BRL(k.sold)}</td>
                    <td className="px-3 py-3 text-[#666]">{k.pct}%</td>
                    <td className="px-3 py-3 font-semibold text-[#0F6E56]">{BRL(k.value)}</td>
                    <td className="px-3 py-3">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{
                        background: k.status === "Pago" ? "#E1F5EE" : "#FAEEDA",
                        color: k.status === "Pago" ? "#085041" : "#633806",
                      }}>{k.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-7 h-7 rounded-md hover:bg-[#F0F0F0] flex items-center justify-center text-[#666]">
                            <MoreHorizontal size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Check size={14} className="mr-2" /> Marcar como pago</DropdownMenuItem>
                          <DropdownMenuItem><Eye size={14} className="mr-2" /> Detalhes</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-[14px] font-semibold text-[#111111]">Regras de comissão</h3>
                <p className="text-[12px] text-[#AAAAAA]">Configurações atuais aplicadas ao time</p>
              </div>
              <Button variant="outline" className="border-[#0F6E56] text-[#0F6E56] hover:bg-[#E1F5EE]">Editar regras</Button>
            </div>
            <div className="space-y-2 text-[13px] text-[#111111]">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#185FA5]" /> <strong>Closer:</strong> 10% sobre valor fechado</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#854F0B]" /> <strong>SDR:</strong> 5% sobre valor dos leads que qualificou e fecharam</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#534AB7]" /> <strong>Coordenador:</strong> 8% sobre equipe</div>
            </div>
          </div>
        </TabsContent>

        {/* STATEMENT */}
        <TabsContent value="statement" className="space-y-4 mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#111111]">Extrato de transações</h2>
            <div className="flex items-center gap-2">
              <Select defaultValue="abr">
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="abr">Abril 2026</SelectItem>
                  <SelectItem value="mar">Março 2026</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline"><Download size={14} /> Exportar CSV</Button>
            </div>
          </div>

          <div className="rounded-xl p-5 text-white" style={{ background: "linear-gradient(135deg, #0F6E56, #0a5544)" }}>
            <div className="text-[12px] uppercase tracking-wide opacity-80 font-semibold">Saldo disponível</div>
            <div className="text-[32px] font-bold mt-1">{BRL(22420)}</div>
            <div className="text-[12px] opacity-80 mt-1">Atualizado agora</div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 overflow-hidden">
            {TRANSACTIONS.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#F0F0F0] last:border-0 hover:bg-[#FAFAFA]">
                <div className="text-[11px] text-[#AAAAAA] w-[100px] shrink-0">{t.date}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[#111111] truncate">{t.desc}</div>
                </div>
                <div className="w-[80px] flex items-center gap-1.5 text-[12px] text-[#666]">
                  {t.method ? <><MethodIcon method={t.method} size={12} /> {METHOD_LABEL[t.method]}</> : <span className="text-[#CCCCCC]">—</span>}
                </div>
                <div className={`w-[110px] text-right text-[13px] font-semibold ${t.amount >= 0 ? "text-[#0F6E56]" : "text-[#E24B4A]"}`}>
                  {t.amount >= 0 ? "+" : ""}{BRL(t.amount)}
                </div>
                <div className="w-[110px] text-right text-[12px] text-[#AAAAAA]">{BRL(t.balance)}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* New charge modal */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Criar nova cobrança</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <section>
              <h3 className="text-[12px] uppercase tracking-wide text-[#AAAAAA] font-semibold mb-2">Cliente</h3>
              <Input
                value={draft.client}
                onChange={e => setDraft({ ...draft, client: e.target.value })}
                placeholder="Buscar lead ou contato"
              />
              {draft.client && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-[#F5F5F5] rounded-lg">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: colorFromString(draft.client) }}>
                    {initials(draft.client)}
                  </div>
                  <div className="text-[12px] text-[#111111] flex-1">{draft.client}</div>
                  <Select value={draft.deal} onValueChange={v => setDraft({ ...draft, deal: v })}>
                    <SelectTrigger className="w-[130px] h-8 text-[12px]"><SelectValue placeholder="Vincular negócio" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1085">#1085</SelectItem>
                      <SelectItem value="1092">#1092</SelectItem>
                      <SelectItem value="1088">#1088</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-[12px] uppercase tracking-wide text-[#AAAAAA] font-semibold">Cobrança</h3>
              <div>
                <Label className="text-[12px]">Descrição/produto</Label>
                <Input value={draft.desc} onChange={e => setDraft({ ...draft, desc: e.target.value })} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">Valor (R$)</Label>
                  <Input value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.value })} className="mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-[12px]">Vencimento</Label>
                  <Input type="date" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-[12px]">Método de pagamento</Label>
                <Select value={draft.method} onValueChange={v => setDraft({ ...draft, method: v as Method })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartao">Cartão de crédito</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.method === "cartao" && (
                <div>
                  <Label className="text-[12px]">Parcelamento</Label>
                  <Select value={draft.installments} onValueChange={v => setDraft({ ...draft, installments: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x sem juros</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                <div className="text-[13px] text-[#111111]">Cobrança recorrente</div>
                <Switch checked={draft.recurring} onCheckedChange={v => setDraft({ ...draft, recurring: v })} />
              </div>
              {draft.recurring && (
                <Select value={draft.cycle} onValueChange={v => setDraft({ ...draft, cycle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </section>

            <section>
              <h3 className="text-[12px] uppercase tracking-wide text-[#AAAAAA] font-semibold mb-2">Notificação</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                  <div className="text-[13px] text-[#111111]">Enviar link por WhatsApp</div>
                  <Switch checked={draft.notifyWpp} onCheckedChange={v => setDraft({ ...draft, notifyWpp: v })} />
                </div>
                <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
                  <div className="text-[13px] text-[#111111]">Enviar por e-mail</div>
                  <Switch checked={draft.notifyEmail} onCheckedChange={v => setDraft({ ...draft, notifyEmail: v })} />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={createCharge} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white">Criar cobrança</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
