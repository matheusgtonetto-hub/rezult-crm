import { useState } from "react";
import {
  Bot,
  Plus,
  Upload,
  FileText,
  FileType,
  X,
  Zap,
  Heart,
  BarChart3,
  Pencil,
  Trash2,
  Link as LinkIcon,
  Circle,
  Network,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import AgentUserView from "@/components/AgentUserView";

type AgentType = "Master" | "Coordenador" | "Closer" | "SDR";

type Agent = {
  id: string;
  role: string;
  user: string;
  type: AgentType;
  parentId: string | null;
  active: boolean;
  level: number;
};

const TYPE_COLORS: Record<AgentType, { bg: string; fg: string }> = {
  Master: { bg: "#085041", fg: "#FFFFFF" },
  Coordenador: { bg: "#534AB7", fg: "#FFFFFF" },
  Closer: { bg: "#185FA5", fg: "#FFFFFF" },
  SDR: { bg: "#854F0B", fg: "#FFFFFF" },
};

const INITIAL_AGENTS: Agent[] = [
  { id: "1", role: "CEO", user: "Matheus Tonetto", type: "Master", parentId: null, active: true, level: 1 },
  { id: "2", role: "Coordenador", user: "Rafael Silva", type: "Coordenador", parentId: "1", active: true, level: 2 },
  { id: "3", role: "Closer", user: "Fernanda Lima", type: "Closer", parentId: "2", active: true, level: 3 },
  { id: "4", role: "SDR", user: "Carlos Andrade", type: "SDR", parentId: "2", active: true, level: 3 },
  { id: "5", role: "SDR", user: "Ana Paula", type: "SDR", parentId: "2", active: false, level: 3 },
];

const MOCK_USERS = ["Matheus Tonetto", "Rafael Silva", "Fernanda Lima", "Carlos Andrade", "Ana Paula", "Bruno Costa"];

function initials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 45%)`;
}

function TreeNode({
  agent,
  agents,
  selectedId,
  onSelect,
  isRoot = true,
}: {
  agent: Agent;
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isRoot?: boolean;
}) {
  const children = agents.filter(a => a.parentId === agent.id);
  const isSelected = selectedId === agent.id;
  const typeColor = TYPE_COLORS[agent.type];

  return (
    <div className="relative">
      <div className="relative">
        {!isRoot && (
          <span
            className="absolute left-[-14px] top-1/2 w-3"
            style={{ background: "#E5E5E5", height: "1.5px" }}
          />
        )}
        <button
          onClick={() => onSelect(agent.id)}
          className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-left cursor-pointer ${
            isSelected
              ? "border-[#0F6E56] bg-[#E1F5EE]"
              : "border-[#EEEEEE] bg-white hover:bg-[#F5F5F5]"
          }`}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
            style={{ background: colorFromString(agent.role) }}
          >
            {initials(agent.role)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-[#111111] truncate">{agent.role}</span>
              <Circle
                size={8}
                fill={agent.active ? "#0F6E56" : "#CCCCCC"}
                color={agent.active ? "#0F6E56" : "#CCCCCC"}
              />
            </div>
            <div className="text-[11px] text-[#AAAAAA] truncate">{agent.user}</div>
          </div>
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
            style={{ background: typeColor.bg, color: typeColor.fg }}
          >
            {agent.type}
          </span>
        </button>
      </div>

      {children.length > 0 && (
        <div className="relative pl-5 mt-1.5 space-y-1.5">
          <span
            className="absolute left-[18px] top-0 bottom-5 pointer-events-none"
            style={{ background: "#E5E5E5", width: "1.5px" }}
          />
          {children.map(child => (
            <TreeNode
              key={child.id}
              agent={child}
              agents={agents}
              selectedId={selectedId}
              onSelect={onSelect}
              isRoot={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TONE_OPTIONS = [
  { id: "direct", label: "Direto e objetivo", icon: Zap },
  { id: "consultative", label: "Consultivo e empático", icon: Heart },
  { id: "technical", label: "Técnico e analítico", icon: BarChart3 },
];

const MOCK_FILES = [
  { name: "Playbook de Vendas 2026.pdf", size: "2.4MB", date: "12/03/2026", type: "pdf" },
  { name: "Script de Qualificação SDR.docx", size: "180KB", date: "08/03/2026", type: "docx" },
  { name: "ICP — Perfil do Cliente Ideal.pdf", size: "890KB", date: "01/03/2026", type: "pdf" },
  { name: "Objeções e Respostas.txt", size: "45KB", date: "22/02/2026", type: "txt" },
];

const MOCK_RULES = [
  { id: "r1", on: true, text: "Sempre verificar se o lead tem orçamento aprovado antes de avançar no funil" },
  { id: "r2", on: true, text: "Alertar o SDR quando lead ficar mais de 2 dias sem resposta" },
  { id: "r3", on: false, text: "Sugerir follow-up por ligação após 3 mensagens sem retorno" },
  { id: "r4", on: true, text: "Nunca revelar o preço antes de entender a dor do lead" },
];

const MOCK_ANALYSES = [
  { id: "a1", level: "warning", text: "Lead parado há 4 dias na etapa Proposta Enviada — follow-up recomendado", time: "hoje 14h32" },
  { id: "a2", level: "good", text: "Qualificação completa realizada — orçamento e decisor confirmados", time: "hoje 11h15" },
  { id: "a3", level: "critical", text: "SDR revelou preço antes de identificar a dor — alerta registrado", time: "ontem 16h48" },
  { id: "a4", level: "good", text: "Meta diária de abordagens atingida: 12/10", time: "ontem 18h00" },
];

const ANALYSIS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  good: { bg: "#E1F5EE", fg: "#0F6E56", label: "Positivo" },
  warning: { bg: "#FEF3C7", fg: "#92400E", label: "Atenção" },
  critical: { bg: "#FEE2E2", fg: "#991B1B", label: "Crítico" },
};

function FileIcon({ type }: { type: string }) {
  const color = type === "pdf" ? "#E24B4A" : type === "docx" ? "#378ADD" : "#AAAAAA";
  return <FileText size={18} color={color} />;
}

type ViewMode = "admin" | "user-sdr" | "user-closer";

export default function AgentesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("admin");
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [selectedId, setSelectedId] = useState<string | null>("1");
  const [tone, setTone] = useState("consultative");
  const [rules, setRules] = useState(MOCK_RULES);
  const [instructions, setInstructions] = useState("");
  const [links, setLinks] = useState<string[]>(["https://docs.rezult.com/playbook"]);
  const [newLink, setNewLink] = useState("");
  const [openDialog, setOpenDialog] = useState(false);
  const [draft, setDraft] = useState({
    role: "",
    type: "SDR" as AgentType,
    user: MOCK_USERS[0],
    parentId: "1",
    active: true,
  });

  const RoleSwitcher = () => (
    <div className="inline-flex items-center bg-white border border-[#EEEEEE] rounded-full p-1 shadow-elev-1">
      {[
        { v: "admin" as const, l: "Admin/Gestor" },
        { v: "user-sdr" as const, l: "SDR" },
        { v: "user-closer" as const, l: "Closer" },
      ].map(opt => (
        <button
          key={opt.v}
          onClick={() => setViewMode(opt.v)}
          className={`text-[12px] px-3 py-1.5 rounded-full transition-colors ${
            viewMode === opt.v
              ? "bg-[#0F6E56] text-white font-semibold"
              : "text-[#666] hover:text-[#111]"
          }`}
        >
          {opt.l}
        </button>
      ))}
    </div>
  );

  if (viewMode === "user-sdr" || viewMode === "user-closer") {
    return (
      <div>
        <div className="px-6 pt-6 flex justify-end max-w-[1400px] mx-auto">
          <RoleSwitcher />
        </div>
        <AgentUserView
          role={viewMode === "user-sdr" ? "SDR" : "Closer"}
          userName={viewMode === "user-sdr" ? "Carlos Andrade" : "Fernanda Lima"}
        />
      </div>
    );
  }

  const selected = agents.find(a => a.id === selectedId) || null;
  const roots = agents.filter(a => a.parentId === null);

  const isSDR = selected?.type === "SDR";
  const isCloser = selected?.type === "Closer";

  function createAgent() {
    if (!draft.role.trim()) {
      toast.error("Informe o nome do cargo");
      return;
    }
    const parent = agents.find(a => a.id === draft.parentId);
    const newAgent: Agent = {
      id: String(Date.now()),
      role: draft.role,
      type: draft.type,
      user: draft.user,
      parentId: draft.parentId,
      active: draft.active,
      level: parent ? parent.level + 1 : 1,
    };
    setAgents(prev => [...prev, newAgent]);
    setOpenDialog(false);
    setDraft({ role: "", type: "SDR", user: MOCK_USERS[0], parentId: "1", active: true });
    toast.success("Agente criado");
  }

  if (agents.length === 0) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <Network size={64} color="#E5E5E5" />
          <h2 className="text-[20px] font-bold text-[#111111] mt-4">
            Crie a estrutura de inteligência da sua equipe
          </h2>
          <p className="text-[13px] text-[#AAAAAA] mt-2 max-w-[420px]">
            Adicione os cargos da sua empresa e vincule um agente de IA a cada profissional
          </p>
          <Button
            onClick={() => setOpenDialog(true)}
            className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white mt-6"
          >
            <Plus size={16} /> Criar primeiro agente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold text-[#111111] leading-tight">Agentes</h1>
          <p className="text-[13px] text-[#AAAAAA] mt-1">
            Configure a estrutura de inteligência comercial da sua empresa
          </p>
        </div>
        <Button
          onClick={() => setOpenDialog(true)}
          className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white"
        >
          <Plus size={16} /> Novo agente
        </Button>
      </div>

      <div className="grid grid-cols-[380px_1fr] gap-6">
        {/* Left: Org tree */}
        <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1 p-4">
          <h2 className="text-[11px] uppercase tracking-wide text-[#AAAAAA] font-semibold mb-3">
            Estrutura da equipe
          </h2>
          <div className="space-y-1.5">
            {roots.map(root => (
              <TreeNode
                key={root.id}
                agent={root}
                agents={agents}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
          <button
            onClick={() => setOpenDialog(true)}
            className="w-full mt-4 py-2.5 rounded-lg border border-dashed border-[#CCCCCC] bg-[#F5F5F5] text-[#AAAAAA] text-[12px] font-medium hover:text-[#0F6E56] hover:border-[#0F6E56] transition-colors"
          >
            + Adicionar cargo
          </button>
        </div>

        {/* Right: Config panel */}
        <div className="bg-white border border-[#EEEEEE] rounded-xl shadow-elev-1">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Bot size={64} color="#E5E5E5" />
              <p className="text-[#AAAAAA] text-[14px] mt-4">
                Selecione um agente para configurar
              </p>
            </div>
          ) : (
            <Tabs defaultValue="perfil" className="w-full">
              <div className="px-6 pt-5 pb-0 border-b border-[#EEEEEE]">
                <div className="mb-4">
                  <h2 className="text-[16px] font-bold text-[#111111]">{selected.role}</h2>
                  <p className="text-[12px] text-[#AAAAAA]">{selected.user}</p>
                </div>
                <TabsList className="bg-transparent p-0 h-auto gap-1">
                  {[
                    { v: "perfil", l: "Perfil" },
                    { v: "kb", l: "Base de Conhecimento" },
                    { v: "comportamento", l: "Comportamento" },
                    { v: "performance", l: "Performance" },
                  ].map(t => (
                    <TabsTrigger
                      key={t.v}
                      value={t.v}
                      className="data-[state=active]:bg-[#E1F5EE] data-[state=active]:text-[#0F6E56] data-[state=active]:shadow-none rounded-md text-[13px] px-3 py-1.5"
                    >
                      {t.l}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* PERFIL */}
              <TabsContent value="perfil" className="p-6 space-y-6 mt-0">
                <section>
                  <h3 className="text-[13px] font-semibold text-[#111111] mb-3">Identidade do Agente</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[12px] text-[#666]">Nome do agente</Label>
                      <Input defaultValue={`Agent ${selected.type} — ${selected.user.split(" ")[0]}`} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[12px] text-[#666]">Tipo de agente</Label>
                      <Select defaultValue={selected.type}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["Master", "Coordenador", "Closer", "SDR"] as AgentType[]).map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                          <SelectItem value="custom">Personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[12px] text-[#666]">Usuário vinculado</Label>
                      <Select defaultValue={selected.user}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MOCK_USERS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[12px] text-[#666]">Nível hierárquico</Label>
                      <Input type="number" defaultValue={selected.level} className="mt-1" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 p-3 bg-[#F5F5F5] rounded-lg">
                    <div>
                      <div className="text-[13px] font-medium text-[#111111]">Agente ativo</div>
                      <div className="text-[11px] text-[#AAAAAA]">Quando inativo, não realiza análises</div>
                    </div>
                    <Switch defaultChecked={selected.active} />
                  </div>
                </section>

                <section key={selected.id}>
                  <h3 className="text-[13px] font-semibold text-[#111111] mb-3">Acesso a Dados</h3>
                  <div className="space-y-2.5">
                    {[
                      { label: "Conversas WhatsApp do usuário", tip: "Lê as conversas de WhatsApp do profissional vinculado para análises e sugestões" },
                      { label: "Calls e transcrições", tip: "Acessa gravações e transcrições de ligações para avaliar abordagens" },
                      { label: "Pipeline e leads do usuário", tip: "Visualiza os negócios e leads atribuídos ao profissional vinculado" },
                      { label: "Performance dos agentes abaixo", tip: "Visualiza métricas e score de todos os agentes da hierarquia inferior" },
                      { label: "Dados financeiros (Rezult Pay)", tip: "Acessa receitas, comissões e dados financeiros vinculados aos negócios" },
                      { label: "Relatórios da equipe completa", tip: "Consulta relatórios consolidados de toda a operação comercial" },
                    ].map(({ label, tip }) => {
                      const checked = selected.type === "Master" ? true : ["Conversas WhatsApp do usuário", "Calls e transcrições", "Pipeline e leads do usuário"].includes(label);
                      return (
                        <Tooltip key={label}>
                          <TooltipTrigger asChild>
                            <label className="flex items-center gap-2.5 text-[13px] text-[#111111] cursor-pointer">
                              <Checkbox defaultChecked={checked} />
                              {label}
                            </label>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[260px] text-[12px]">{tip}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </section>

                <div className="flex justify-end pt-2">
                  <Button onClick={() => toast.success("Perfil salvo")} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white">
                    Salvar perfil
                  </Button>
                </div>
              </TabsContent>

              {/* KB */}
              <TabsContent value="kb" className="p-6 space-y-6 mt-0">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#111111]">Materiais de treinamento</h3>
                  <p className="text-[12px] text-[#AAAAAA]">
                    Faça upload dos materiais que vão treinar este agente
                  </p>
                </div>

                <div className="border-2 border-dashed border-[#CCCCCC] rounded-xl p-8 text-center hover:border-[#0F6E56] hover:bg-[#E1F5EE]/30 transition-colors cursor-pointer">
                  <Upload size={32} className="mx-auto text-[#AAAAAA]" />
                  <p className="text-[13px] text-[#111111] font-medium mt-2">
                    Arraste arquivos ou clique para selecionar
                  </p>
                  <p className="text-[11px] text-[#AAAAAA] mt-1">
                    PDF, DOCX, TXT — máx 10MB por arquivo
                  </p>
                </div>

                <div className="space-y-2">
                  {MOCK_FILES.map(f => (
                    <div key={f.name} className="group flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg hover:bg-[#F5F5F5] transition-colors">
                      <FileIcon type={f.type} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#111111] truncate">{f.name}</div>
                        <div className="text-[11px] text-[#AAAAAA]">{f.size} · {f.date}</div>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 text-[#AAAAAA] hover:text-[#E24B4A] transition-opacity">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <section>
                  <h3 className="text-[13px] font-semibold text-[#111111] mb-2">Links e referências</h3>
                  <div className="flex gap-2">
                    <Input
                      value={newLink}
                      onChange={e => setNewLink(e.target.value)}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        if (newLink.trim()) {
                          setLinks(prev => [...prev, newLink.trim()]);
                          setNewLink("");
                        }
                      }}
                      variant="outline"
                    >
                      Adicionar
                    </Button>
                  </div>
                  <div className="space-y-1.5 mt-3">
                    {links.map((l, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-[#F5F5F5] rounded-lg">
                        <LinkIcon size={14} className="text-[#AAAAAA]" />
                        <span className="flex-1 text-[12px] text-[#111111] truncate">{l}</span>
                        <button onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))} className="text-[#AAAAAA] hover:text-[#E24B4A]">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              </TabsContent>

              {/* COMPORTAMENTO */}
              <TabsContent value="comportamento" className="p-6 space-y-6 mt-0">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#111111]">Como este agente deve atuar</h3>
                  <p className="text-[12px] text-[#AAAAAA]">
                    Programe o comportamento, tom e prioridades do agente
                  </p>
                </div>

                <div>
                  <Label className="text-[12px] text-[#666]">Instruções principais</Label>
                  <Textarea
                    value={instructions}
                    onChange={e => setInstructions(e.target.value.slice(0, 2000))}
                    placeholder="Ex: Você é o agente SDR da empresa Rezult. Seu objetivo é supervisionar as conversas de qualificação do Carlos. Sempre que identificar que o lead não foi perguntado sobre orçamento, alerte o SDR. Use um tom direto mas amigável. Nunca sugira descontos sem autorização do coordenador..."
                    className="mt-1 min-h-[200px] text-[13px]"
                  />
                  <div className="text-right text-[11px] text-[#AAAAAA] mt-1">
                    {instructions.length} / 2000
                  </div>
                </div>

                <section>
                  <h3 className="text-[13px] font-semibold text-[#111111] mb-2">Regras de comportamento</h3>
                  <div className="space-y-2">
                    {rules.map(r => (
                      <div key={r.id} className="flex items-center gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg">
                        <Switch
                          checked={r.on}
                          onCheckedChange={v => setRules(prev => prev.map(x => x.id === r.id ? { ...x, on: v } : x))}
                        />
                        <span className={`flex-1 text-[13px] ${r.on ? "text-[#111111]" : "text-[#AAAAAA]"}`}>
                          {r.text}
                        </span>
                        <button className="text-[#AAAAAA] hover:text-[#0F6E56]"><Pencil size={14} /></button>
                        <button
                          onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))}
                          className="text-[#AAAAAA] hover:text-[#E24B4A]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setRules(prev => [...prev, { id: String(Date.now()), on: true, text: "Nova regra" }])}
                    className="w-full mt-3 py-2.5 rounded-lg border border-dashed border-[#CCCCCC] bg-[#F5F5F5] text-[#AAAAAA] text-[12px] font-medium hover:text-[#0F6E56] hover:border-[#0F6E56] transition-colors"
                  >
                    + Adicionar regra
                  </button>
                </section>

                <section>
                  <h3 className="text-[13px] font-semibold text-[#111111] mb-2">Tom de voz</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {TONE_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const sel = tone === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setTone(opt.id)}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                            sel
                              ? "border-[#0F6E56] bg-[#E1F5EE] text-[#0F6E56]"
                              : "border-[#EEEEEE] bg-white text-[#666] hover:bg-[#F5F5F5]"
                          }`}
                        >
                          <Icon size={20} />
                          <span className="text-[12px] font-medium">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="flex justify-end pt-2">
                  <Button onClick={() => toast.success("Comportamento salvo")} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white">
                    Salvar comportamento
                  </Button>
                </div>
              </TabsContent>

              {/* PERFORMANCE */}
              <TabsContent value="performance" className="p-6 space-y-6 mt-0">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#111111]">Performance do agente</h3>
                  <p className="text-[12px] text-[#AAAAAA]">
                    Resultados do profissional vinculado a este agente
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {(isCloser
                    ? [
                        { label: "Negócios fechados", value: "8" },
                        { label: "Taxa de fechamento", value: "52%" },
                        { label: "Ticket médio", value: "R$ 4.800" },
                        { label: "Score do agente", value: "9.1/10" },
                      ]
                    : [
                        { label: "Leads qualificados", value: "34" },
                        { label: "Taxa de qualificação", value: "68%" },
                        { label: "Reuniões agendadas", value: "23" },
                        { label: "Score do agente", value: "8.4/10" },
                      ]
                  ).map(m => (
                    <div key={m.label} className="bg-white border border-[#EEEEEE] rounded-lg p-3">
                      <div className="text-[10px] uppercase text-[#AAAAAA] tracking-wide">{m.label}</div>
                      <div className="text-[24px] font-bold text-[#111111] mt-1">{m.value}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
                  <h4 className="text-[13px] font-semibold text-[#111111] mb-3">
                    Evolução do score nos últimos 30 dias
                  </h4>
                  <svg viewBox="0 0 400 100" className="w-full h-24">
                    <polyline
                      fill="none"
                      stroke="#0F6E56"
                      strokeWidth="2"
                      points="0,70 40,65 80,55 120,60 160,45 200,40 240,50 280,30 320,35 360,20 400,25"
                    />
                  </svg>
                </div>

                <section>
                  <h4 className="text-[13px] font-semibold text-[#111111] mb-2">
                    Últimas análises do agente
                  </h4>
                  <div className="space-y-2">
                    {MOCK_ANALYSES.map(a => {
                      const badge = ANALYSIS_BADGE[a.level];
                      return (
                        <div key={a.id} className="flex items-start gap-3 p-3 bg-white border border-[#EEEEEE] rounded-lg">
                          <FileType size={16} className="text-[#AAAAAA] mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-[#111111]">{a.text}</div>
                            <div className="text-[11px] text-[#AAAAAA] mt-0.5">{a.time}</div>
                          </div>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0"
                            style={{ background: badge.bg, color: badge.fg }}
                          >
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* New Agent Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Criar novo agente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[12px]">Nome do cargo</Label>
              <Input
                value={draft.role}
                onChange={e => setDraft({ ...draft, role: e.target.value })}
                placeholder="Ex: SDR Sênior"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[12px]">Tipo de agente</Label>
              <Select value={draft.type} onValueChange={v => setDraft({ ...draft, type: v as AgentType })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["Master", "Coordenador", "Closer", "SDR"] as AgentType[]).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Usuário vinculado</Label>
              <Select value={draft.user} onValueChange={v => setDraft({ ...draft, user: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOCK_USERS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Reporta a</Label>
              <Select value={draft.parentId} onValueChange={v => setDraft({ ...draft, parentId: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.role} — {a.user}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 bg-[#F5F5F5] rounded-lg">
              <Label className="text-[13px]">Ativar agente imediatamente</Label>
              <Switch
                checked={draft.active}
                onCheckedChange={v => setDraft({ ...draft, active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={createAgent} className="bg-[#0F6E56] hover:bg-[#0F6E56]/90 text-white">
              Criar agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
