import { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowRight, ChevronDown, History, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string; timestamp: Date };
type Conversation = { id: string; title: string; messages: Message[]; createdAt: Date };

const SUGGESTIONS = [
  "Como estão minhas vendas esse mês?",
  "Quais leads precisam de follow-up hoje?",
  "Qual SDR está performando melhor?",
  "Por que perdi negócios essa semana?",
];

const AGENT = { name: "Agent Master", icon: Sparkles };

function mockedReply(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("vend") || q.includes("mês") || q.includes("mes")) {
    return "Neste mês você tem **8 negócios ativos** totalizando **R$ 37.700**. Desses, 1 foi ganho (R$ 4.000) e 1 perdido (R$ 1.500). Sua taxa de conversão atual é **50%** — acima da média do mercado (32%). Os 6 negócios em aberto somam R$ 32.200 de receita potencial.";
  }
  if (q.includes("follow") || q.includes("contato") || q.includes("hoje")) {
    return "Você tem **3 leads** que precisam de atenção hoje:\n\n- **Carlos Andrade** — 5 dias sem contato, proposta enviada\n- **Mariana Costa** — reunião agendada para amanhã\n- **Bruno Lima** — aguardando retorno desde segunda\n\nQuer que eu priorize algum deles?";
  }
  if (q.includes("sdr") || q.includes("perform") || q.includes("melhor")) {
    return "**Rafael** tem a maior taxa de qualificação do time: 68% dos leads que ele aborda chegam à etapa de proposta.\n\n**Mariana** converte mais em valor: ticket médio de R$ 8.400 por negócio fechado.\n\n**Carlos** tem o ciclo mais rápido: fecha em média em 12 dias.";
  }
  return "Estou analisando os dados da sua operação. Com base no seu pipeline atual, posso ver que você tem oportunidades de melhoria na etapa de **Negociação** — 2 leads estão parados há mais de 7 dias. Quer que eu sugira uma abordagem de reativação?";
}

function renderMarkdown(text: string) {
  // very small markdown: **bold**, line breaks, list items "- "
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

function groupConversations(convs: Conversation[]) {
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const week: Conversation[] = [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const weekAgo = startOfToday - 7 * 86400000;
  for (const c of convs) {
    const t = c.createdAt.getTime();
    if (t >= startOfToday) today.push(c);
    else if (t >= startOfYesterday) yesterday.push(c);
    else if (t >= weekAgo) week.push(c);
  }
  return { today, yesterday, week };
}

export default function PilotPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = conversations.find((c) => c.id === activeId) || null;
  const messages = active?.messages || [];

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

    setTimeout(() => {
      const reply: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: mockedReply(trimmed),
        timestamp: new Date(),
      };
      setConversations((cs) =>
        cs.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, reply] } : c)),
      );
      setTyping(false);
    }, 1500);
  }

  const grouped = groupConversations(conversations);

  return (
    <div className="flex h-[calc(100vh-0px)] bg-background relative">
      {/* History sidebar */}
      <div
        className={`${historyOpen ? "w-[240px]" : "w-0"} transition-all duration-200 overflow-hidden border-r border-card-border bg-secondary/40 shrink-0`}
      >
        <div className="w-[240px] h-full flex flex-col">
          <div className="p-3 flex items-center justify-between border-b border-card-border">
            <button
              onClick={newConversation}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
            >
              <Plus size={16} /> Nova conversa
            </button>
            <button onClick={() => setHistoryOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-sm">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">Sem conversas ainda</p>
            )}
            {(["today", "yesterday", "week"] as const).map((key) => {
              const list = grouped[key];
              if (list.length === 0) return null;
              const label = key === "today" ? "Hoje" : key === "yesterday" ? "Ontem" : "Últimos 7 dias";
              return (
                <div key={key} className="mb-3">
                  <p className="text-[11px] uppercase text-muted-foreground px-2 py-1 font-medium">{label}</p>
                  {list.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={`group flex items-center justify-between gap-2 px-2 py-2 rounded-md cursor-pointer ${
                        activeId === c.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-secondary"
                      }`}
                    >
                      <span className="truncate text-[13px]">{c.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(c.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Toggle button when collapsed */}
      {!historyOpen && (
        <button
          onClick={() => setHistoryOpen(true)}
          className="absolute left-2 top-4 z-10 w-9 h-9 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground"
          aria-label="Histórico"
        >
          <History size={18} />
        </button>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex flex-col items-center pt-6 pb-4 px-4 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={28} className="text-primary" />
            <h1 className="text-[20px] font-bold text-foreground">Pilot</h1>
          </div>
          <p className="text-[13px] text-muted-foreground mt-1">Seu agente de inteligência comercial</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full border border-card-border text-[13px] hover:bg-secondary">
                <Sparkles size={14} className="text-primary" />
                <span className="font-medium">{AGENT.name}</span>
                <ChevronDown size={14} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem>
                <Sparkles size={14} className="mr-2 text-primary" /> Agent Master
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Messages or empty state */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
          <div className="max-w-[720px] mx-auto w-full py-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center mt-8">
                <div className="w-16 h-16 rounded-2xl border-2 border-primary text-primary flex items-center justify-center text-lg font-bold mb-4">
                  RZ
                </div>
                <h2 className="text-[24px] font-bold text-foreground">Como posso ajudar hoje?</h2>
                <p className="text-[13px] text-muted-foreground mt-1">{AGENT.name} ativo</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-[640px]">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left px-4 py-3.5 rounded-xl bg-secondary border-[0.5px] border-card-border text-[13px] text-[hsl(0_0%_40%)] hover:bg-sidebar-accent hover:border-primary hover:text-primary transition-colors"
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
                      <div className="w-5 h-5 mt-1 shrink-0 rounded-md border border-primary text-primary text-[9px] font-bold flex items-center justify-center">
                        RZ
                      </div>
                    )}
                    <div className={`max-w-[80%] flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                      <div
                        className={`px-4 py-3 text-[14px] ${
                          m.role === "user"
                            ? "bg-primary text-primary-foreground rounded-[16px_16px_4px_16px]"
                            : "bg-secondary text-foreground rounded-[16px_16px_16px_4px]"
                        }`}
                      >
                        {renderMarkdown(m.content)}
                      </div>
                      <span className="text-[11px] text-[hsl(0_0%_80%)] mt-1 px-1">{formatTime(m.timestamp)}</span>
                    </div>
                    {m.role === "user" && (
                      <div className="w-5 h-5 mt-1 shrink-0 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                        CA
                      </div>
                    )}
                  </div>
                ))}
                {typing && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-5 h-5 mt-1 rounded-md border border-primary text-primary text-[9px] font-bold flex items-center justify-center">
                      RZ
                    </div>
                    <div className="bg-secondary rounded-[16px_16px_16px_4px] px-4 py-3 flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-card-border bg-background px-4 py-3 shrink-0">
          <div className="max-w-[720px] mx-auto flex items-end gap-2">
            <div className="flex-1 bg-secondary border border-card-border rounded-xl px-4 py-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Pergunte ao seu agente..."
                className="w-full bg-transparent resize-none outline-none text-[14px] placeholder:text-muted-foreground max-h-[112px]"
                style={{ fontFamily: "Plus Jakarta Sans, system-ui, sans-serif" }}
              />
            </div>
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className={`w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors ${
                input.trim() ? "bg-primary text-primary-foreground hover:opacity-90" : "bg-card-border text-muted-foreground cursor-not-allowed"
              }`}
              aria-label="Enviar"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
