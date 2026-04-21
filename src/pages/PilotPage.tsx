import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  ArrowRight,
  History,
  Plus,
  Trash2,
  X,
  BarChart3,
  Diamond,
  Trophy,
  Lightbulb,
  Star,
  CheckCircle2,
  RefreshCw,
  Check,
  Zap,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";

type Mode = "agent" | "claude";
type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string; timestamp: Date };
type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  mode: Mode;
};

const AGENT_SUGGESTIONS = [
  "Como estão minhas vendas esse mês?",
  "Quais leads precisam de follow-up hoje?",
  "Qual SDR está performando melhor?",
  "Por que perdi negócios essa semana?",
];

const CLAUDE_SUGGESTIONS = [
  "Escreva um e-mail de proposta",
  "Crie um script de vendas",
  "Resuma esse contrato para mim",
  "Dicas para melhorar meu pitch",
];

const MOCK_AGENT_CONVS: Conversation[] = [
  { id: "a1", title: "Como estão minhas vendas...", messages: [], createdAt: new Date(), mode: "agent" },
  { id: "a2", title: "Quais leads precisam de...", messages: [], createdAt: new Date(), mode: "agent" },
  { id: "a3", title: "Análise da semana", messages: [], createdAt: new Date(Date.now() - 86400000), mode: "agent" },
  { id: "a4", title: "Follow-up Carlos Andrade", messages: [], createdAt: new Date(Date.now() - 86400000), mode: "agent" },
];

const MOCK_CLAUDE_CONVS: Conversation[] = [
  { id: "c1", title: "Escreva um e-mail de proposta", messages: [], createdAt: new Date(), mode: "claude" },
  { id: "c2", title: "Resumo do contrato da Tech...", messages: [], createdAt: new Date(Date.now() - 86400000), mode: "claude" },
  { id: "c3", title: "Dicas para cold call", messages: [], createdAt: new Date(Date.now() - 2 * 86400000), mode: "claude" },
];

function mockedAgentReply(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("vend") || q.includes("mês") || q.includes("mes")) {
    return "Neste mês você tem **8 negócios ativos** totalizando **R$ 37.700**. Desses, 1 foi ganho (R$ 4.000) e 1 perdido (R$ 1.500). Sua taxa de conversão atual é **50%** — acima da média do mercado (32%).";
  }
  if (q.includes("follow") || q.includes("hoje")) {
    return "Você tem **3 leads** que precisam de atenção hoje:\n\n- **Carlos Andrade** — 5 dias sem contato\n- **Mariana Costa** — reunião amanhã\n- **Bruno Lima** — aguardando retorno";
  }
  if (q.includes("sdr") || q.includes("perform")) {
    return "**Rafael** tem a maior taxa de qualificação: 68%.\n\n**Mariana** converte mais em valor: ticket médio R$ 8.400.\n\n**Carlos** tem o ciclo mais rápido: 12 dias.";
  }
  return "Analisando seu pipeline. Você tem oportunidades na etapa de **Negociação** — 2 leads parados há mais de 7 dias.";
}

function mockedClaudeReply(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("e-mail") || q.includes("email") || q.includes("proposta")) {
    return "Aqui vai um modelo de e-mail de proposta:\n\n**Assunto:** Proposta personalizada para [Empresa]\n\nOlá [Nome],\n\nConforme conversamos, segue nossa proposta para atender suas necessidades. Estou à disposição para alinhar próximos passos.\n\nAbraços";
  }
  if (q.includes("script")) {
    return "Estrutura básica de script de vendas:\n\n- **Abertura**: contexto + valor em 15s\n- **Descoberta**: 3 perguntas-chave\n- **Pitch**: solução conectada à dor\n- **Fechamento**: próximo passo claro";
  }
  if (q.includes("pitch") || q.includes("dica")) {
    return "Dicas para melhorar seu pitch:\n\n- Comece pela **dor**, não pelo produto\n- Use **dados concretos** de clientes similares\n- Termine sempre com uma **pergunta aberta**";
  }
  return "Posso te ajudar com isso! Me dê mais contexto sobre o que você precisa e eu te ajudo a estruturar uma resposta.";
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const isBullet = line.startsWith("- ");
    const content = (isBullet ? line.slice(2) : line).split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return <span key={j}>{part}</span>;
    });
    return isBullet ? (
      <li key={i} className="ml-4 list-disc">{content}</li>
    ) : (
      <p key={i} className={line === "" ? "h-2" : ""}>{content}</p>
    );
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function relativeLabel(d: Date): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "hoje";
  if (t >= startOfToday - 86400000) return "ontem";
  const days = Math.floor((startOfToday - t) / 86400000) + 1;
  return `há ${days} dias`;
}

export default function PilotPage() {
  const [mode, setMode] = useState<Mode>("agent");
  const [conversations, setConversations] = useState<Conversation[]>([
    ...MOCK_AGENT_CONVS,
    ...MOCK_CLAUDE_CONVS,
  ]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [period, setPeriod] = useState<"hoje" | "semana" | "mes">("hoje");
  const [actions, setActions] = useState([
    { id: 1, text: "Ligar para Carlos Andrade", priority: "Alta", done: false },
    { id: 2, text: "Enviar proposta para Mariana Costa", priority: "Alta", done: false },
    { id: 3, text: "Follow-up Bruno Lima", priority: "Média", done: false },
    { id: 4, text: "Qualificar 5 leads", priority: "Média", done: true },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = conversations.find((c) => c.id === activeId) || null;
  const messages = active?.messages || [];
  const isAgent = mode === "agent";
  const accent = isAgent ? "#128A68" : "#111111";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, typing]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 4 * 22 + 24) + "px";
  }, [input]);

  function newConversation() {
    setActiveId(null);
    setInput("");
  }

  function deleteConversation(id: string) {
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function selectConversation(c: Conversation) {
    setActiveId(c.id);
    setMode(c.mode);
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    let convId = activeId;
    if (!convId) {
      const newConv: Conversation = {
        id: crypto.randomUUID(),
        title: trimmed.slice(0, 50),
        messages: [userMsg],
        createdAt: new Date(),
        mode,
      };
      convId = newConv.id;
      setConversations((cs) => [newConv, ...cs]);
      setActiveId(convId);
    } else {
      setConversations((cs) =>
        cs.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c)),
      );
    }

    setInput("");
    setTyping(true);

    const reply = mode === "agent" ? mockedAgentReply(trimmed) : mockedClaudeReply(trimmed);

    setTimeout(() => {
      const replyMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };
      setConversations((cs) =>
        cs.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, replyMsg] } : c)),
      );
      setTyping(false);
    }, 1200);
  }

  const agentConvs = conversations.filter((c) => c.mode === "agent");
  const claudeConvs = conversations.filter((c) => c.mode === "claude");
  const suggestions = isAgent ? AGENT_SUGGESTIONS : CLAUDE_SUGGESTIONS;

  return (
    <div className="flex h-[calc(100vh-0px)] bg-background relative overflow-hidden">
      {/* COLUNA 1 — HISTÓRICO */}
      <div
        className={`${historyOpen ? "w-[240px]" : "w-0"} transition-[width] duration-250 overflow-hidden shrink-0 border-r`}
        style={{ borderColor: "#E5E5E5", backgroundColor: "#F5F5F5" }}
      >
        <div className="w-[240px] h-full flex flex-col">
          <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: "#E5E5E5" }}>
            <button
              onClick={newConversation}
              className="flex items-center gap-2 text-[13px] font-medium hover:opacity-80"
              style={{ color: "#128A68" }}
            >
              <Plus size={14} /> Nova conversa
            </button>
            <button onClick={() => setHistoryOpen(false)} style={{ color: "#AAAAAA" }} className="hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {/* Meu Agente */}
            <p className="text-[10px] uppercase font-semibold px-2 py-2" style={{ color: "#AAAAAA" }}>
              Meu Agente
            </p>
            {agentConvs.map((c) => (
              <ConvItem
                key={c.id}
                conv={c}
                active={activeId === c.id}
                accent="#128A68"
                icon={<Sparkles size={10} style={{ color: "#128A68" }} />}
                onSelect={() => selectConversation(c)}
                onDelete={() => deleteConversation(c.id)}
              />
            ))}

            <div className="my-3 border-t" style={{ borderColor: "#E5E5E5" }} />

            {/* Claude */}
            <p className="text-[10px] uppercase font-semibold px-2 py-2" style={{ color: "#AAAAAA" }}>
              Claude — Uso Geral
            </p>
            {claudeConvs.map((c) => (
              <ConvItem
                key={c.id}
                conv={c}
                active={activeId === c.id}
                accent="#111111"
                icon={<Diamond size={10} style={{ color: "#111111" }} />}
                onSelect={() => selectConversation(c)}
                onDelete={() => deleteConversation(c.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* COLUNA 2 — CHAT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#E5E5E5" }}>
          <div className="flex items-start gap-2 w-[200px]">
            {!historyOpen && (
              <button
                onClick={() => setHistoryOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
                style={{ color: "#666666" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F5F5")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                aria-label="Histórico"
              >
                <History size={18} />
              </button>
            )}
          </div>

          <div className="flex flex-col items-center flex-1">
            <div className="flex items-center gap-2">
              <Sparkles size={18} style={{ color: accent }} />
              <h1 className="text-[18px] font-bold" style={{ color: "#111111" }}>Pilot</h1>
            </div>
            <p className="text-[12px]" style={{ color: "#AAAAAA" }}>
              Seu agente de inteligência comercial
            </p>
            {/* Mode selector - centralizado abaixo do subtítulo */}
            <div className="flex items-center justify-center mt-3">
              <div
                className="flex items-center rounded-full p-1 border"
                style={{ backgroundColor: "#F5F5F5", borderColor: "#E5E5E5" }}
              >
                <button
                  onClick={() => setMode("agent")}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-semibold transition-colors"
                  style={{
                    backgroundColor: isAgent ? "#128A68" : "transparent",
                    color: isAgent ? "#FFFFFF" : "#666666",
                  }}
                >
                  <Sparkles size={14} />
                  Agent Master
                </button>
                <button
                  onClick={() => setMode("claude")}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-semibold transition-colors"
                  style={{
                    backgroundColor: !isAgent ? "#111111" : "transparent",
                    color: !isAgent ? "#FFFFFF" : "#666666",
                  }}
                >
                  <Diamond size={14} />
                  Claude
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 w-[200px] justify-end">
            {!reportsOpen && (
              <button
                onClick={() => setReportsOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
                style={{ color: "#666666" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F5F5F5")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                aria-label="Relatórios"
              >
                <BarChart3 size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Messages or empty state */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
          <div className="max-w-[720px] mx-auto w-full py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center mt-8">
                <div
                  className="w-16 h-16 rounded-2xl border-2 flex items-center justify-center text-lg font-bold mb-4"
                  style={{ borderColor: accent, color: accent }}
                >
                  {isAgent ? "RZ" : <Diamond size={28} />}
                </div>
                <h2 className="text-[24px] font-bold" style={{ color: "#111111" }}>
                  Como posso ajudar hoje?
                </h2>
                <p className="text-[13px] mt-1" style={{ color: "#AAAAAA" }}>
                  {isAgent ? "Agent Master ativo" : "Claude — uso geral"}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-[640px]">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left px-4 py-3.5 rounded-xl border text-[13px] transition-colors"
                      style={{
                        backgroundColor: "#F5F5F5",
                        borderColor: "#E5E5E5",
                        color: "#666666",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = accent;
                        e.currentTarget.style.color = accent;
                        e.currentTarget.style.backgroundColor = isAgent ? "#E1F5EE" : "#F5F5F5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#E5E5E5";
                        e.currentTarget.style.color = "#666666";
                        e.currentTarget.style.backgroundColor = "#F5F5F5";
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
                    {m.role === "assistant" && (
                      <div
                        className="w-5 h-5 mt-1 shrink-0 rounded-md border text-[9px] font-bold flex items-center justify-center"
                        style={{ borderColor: accent, color: accent }}
                      >
                        {isAgent ? "RZ" : <Diamond size={10} />}
                      </div>
                    )}
                    <div className={`max-w-[80%] flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                      <div
                        className="px-4 py-3 text-[14px]"
                        style={{
                          backgroundColor:
                            m.role === "user"
                              ? accent
                              : isAgent
                              ? "hsl(var(--secondary))"
                              : "#F5F5F5",
                          color: m.role === "user" ? "#FFFFFF" : "#111111",
                          borderRadius:
                            m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        }}
                      >
                        {renderMarkdown(m.content)}
                      </div>
                      <span className="text-[11px] mt-1 px-1" style={{ color: "#CCCCCC" }}>
                        {formatTime(m.timestamp)}
                      </span>
                    </div>
                    {m.role === "user" && (
                      <div
                        className="w-5 h-5 mt-1 shrink-0 rounded-full text-[9px] font-bold flex items-center justify-center"
                        style={{ backgroundColor: accent, color: "#FFFFFF" }}
                      >
                        CA
                      </div>
                    )}
                  </div>
                ))}
                {typing && (
                  <div className="flex gap-2 justify-start">
                    <div
                      className="w-5 h-5 mt-1 rounded-md border text-[9px] font-bold flex items-center justify-center"
                      style={{ borderColor: accent, color: accent }}
                    >
                      {isAgent ? "RZ" : <Diamond size={10} />}
                    </div>
                    <div
                      className="px-4 py-3 flex gap-1"
                      style={{ backgroundColor: "#F5F5F5", borderRadius: "16px 16px 16px 4px" }}
                    >
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "#AAAAAA", animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "#AAAAAA", animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "#AAAAAA", animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t bg-background px-4 py-3 shrink-0" style={{ borderColor: "#E5E5E5" }}>
          <div className="max-w-[720px] mx-auto flex items-end gap-2">
            <div
              className="flex-1 border rounded-xl px-4 py-3 transition-colors focus-within:border-2"
              style={{
                backgroundColor: "#F5F5F5",
                borderColor: "#E5E5E5",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = accent)}
                onBlur={(e) => (e.currentTarget.parentElement!.style.borderColor = "#E5E5E5")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={isAgent ? "Pergunte ao seu agente..." : "Pergunte ao Claude..."}
                className="w-full bg-transparent resize-none outline-none text-[14px] max-h-[112px]"
                style={{ fontFamily: "Plus Jakarta Sans, system-ui, sans-serif", color: "#111111" }}
              />
            </div>
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors disabled:cursor-not-allowed"
              style={{
                backgroundColor: input.trim() ? accent : "#E5E5E5",
                color: input.trim() ? "#FFFFFF" : "#AAAAAA",
              }}
              aria-label="Enviar"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* COLUNA 3 — RELATÓRIOS */}
      <div
        className={`${reportsOpen ? "w-[280px]" : "w-0"} transition-[width] duration-250 overflow-hidden shrink-0 border-l`}
        style={{ borderColor: "#E5E5E5", backgroundColor: "#FFFFFF" }}
      >
        <div className="w-[280px] h-full flex flex-col">
          {/* Header */}
          <div className="p-3 border-b" style={{ borderColor: "#E5E5E5" }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-[14px] font-semibold" style={{ color: "#111111" }}>Relatórios</h3>
                <p className="text-[11px]" style={{ color: "#AAAAAA" }}>Gerado pelo seu agente</p>
              </div>
              <button onClick={() => setReportsOpen(false)} style={{ color: "#AAAAAA" }} className="hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-1">
              {(["hoje", "semana", "mes"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors capitalize"
                  style={{
                    backgroundColor: period === p ? "#E1F5EE" : "#F5F5F5",
                    color: period === p ? "#128A68" : "#666666",
                    border: period === p ? "1px solid #128A68" : "1px solid transparent",
                  }}
                >
                  {p === "mes" ? "Mês" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Performance */}
            <div className="rounded-xl p-3.5 mb-3" style={{ backgroundColor: "#E1F5EE" }}>
              <div className="flex items-center gap-1.5 mb-3">
                <Trophy size={14} style={{ color: "#128A68" }} />
                <span className="text-[12px] font-semibold" style={{ color: "#128A68" }}>
                  Performance do dia
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Metric label="Leads abordados" value="8" />
                <Metric label="Qualificados" value="5" />
                <Metric label="Reuniões" value="2" />
                <Metric label="Score" value="8.2/10" />
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: "#128A68" }}>
                  <span>Score geral</span>
                  <span className="font-semibold">8.2 / 10</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#FFFFFF" }}>
                  <div className="h-full rounded-full" style={{ width: "82%", backgroundColor: "#128A68" }} />
                </div>
              </div>
            </div>

            {/* Insights */}
            <div className="rounded-xl border p-3.5 mb-3" style={{ borderColor: "#E5E5E5", backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-1.5 mb-3">
                <Lightbulb size={14} style={{ color: "#F59E0B" }} />
                <span className="text-[12px] font-semibold" style={{ color: "#111111" }}>Insights</span>
              </div>
              <div className="space-y-2.5">
                <Insight icon={<Check size={11} style={{ color: "#128A68" }} />} text="Meta diária atingida: 8 abordagens realizadas" time="hoje 18h00" />
                <Insight icon={<Zap size={11} style={{ color: "#F59E0B" }} />} text="2 leads parados há mais de 3 dias na etapa Proposta Enviada" time="hoje 14h32" />
                <Insight icon={<TrendingUp size={11} style={{ color: "#378ADD" }} />} text="Sua taxa de qualificação subiu 12% essa semana" time="hoje 12h15" />
                <Insight icon={<AlertTriangle size={11} style={{ color: "#E24B4A" }} />} text="Carlos Andrade não respondeu em 4 dias — follow-up urgente" time="hoje 09h48" />
              </div>
            </div>

            {/* Dica */}
            <div className="rounded-xl border p-3.5 mb-3" style={{ borderColor: "#E5E5E5", backgroundColor: "#FAFAFA" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Star size={14} style={{ color: "#8B5CF6" }} />
                <span className="text-[12px] font-semibold" style={{ color: "#111111" }}>Dica do dia</span>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: "#666666" }}>
                Baseado no seu histórico, leads que respondem em menos de 2 horas têm 3x mais chance de fechar. Tente responder o Carlos ainda hoje.
              </p>
            </div>

            {/* Próximas ações */}
            <div className="rounded-xl border p-3.5 mb-3" style={{ borderColor: "#E5E5E5", backgroundColor: "#FFFFFF" }}>
              <div className="flex items-center gap-1.5 mb-3">
                <CheckCircle2 size={14} style={{ color: "#128A68" }} />
                <span className="text-[12px] font-semibold" style={{ color: "#111111" }}>Próximas ações</span>
              </div>
              <div className="space-y-2">
                {actions.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setActions((acts) => acts.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)))
                      }
                      className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                      style={{
                        borderColor: a.done ? "#128A68" : "#CCCCCC",
                        backgroundColor: a.done ? "#128A68" : "transparent",
                      }}
                    >
                      {a.done && <Check size={10} color="#FFFFFF" />}
                    </button>
                    <span
                      className="flex-1 text-[12px]"
                      style={{
                        color: a.done ? "#AAAAAA" : "#111111",
                        textDecoration: a.done ? "line-through" : "none",
                      }}
                    >
                      {a.text}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: a.priority === "Alta" ? "#FEE2E2" : "#FEF3C7",
                        color: a.priority === "Alta" ? "#E24B4A" : "#B45309",
                      }}
                    >
                      {a.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 border-t" style={{ borderColor: "#E5E5E5" }}>
            <p className="text-[11px] mb-2" style={{ color: "#AAAAAA" }}>
              Última atualização: hoje às 18h32
            </p>
            <button
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-medium hover:bg-[#E1F5EE]"
              style={{ borderColor: "#128A68", color: "#128A68" }}
            >
              <RefreshCw size={12} /> Atualizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConvItem({
  conv,
  active,
  accent,
  icon,
  onSelect,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  accent: string;
  icon: React.ReactNode;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? "#E1F5EE" : "transparent",
        color: active ? accent : "#111111",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "#EBEBEB";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-[13px]">{conv.title}</p>
        <p className="text-[10px]" style={{ color: "#AAAAAA" }}>{relativeLabel(conv.createdAt)}</p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100"
        style={{ color: "#AAAAAA" }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2" style={{ backgroundColor: "#FFFFFF" }}>
      <p className="text-[10px]" style={{ color: "#666666" }}>{label}</p>
      <p className="text-[15px] font-bold" style={{ color: "#128A68" }}>{value}</p>
    </div>
  );
}

function Insight({ icon, text, time }: { icon: React.ReactNode; text: string; time: string }) {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] leading-snug" style={{ color: "#111111" }}>{text}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "#AAAAAA" }}>{time}</p>
      </div>
    </div>
  );
}
