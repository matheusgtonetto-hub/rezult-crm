import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import {
  Check,
  Minus,
  X,
  Paperclip,
  Smile,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface ChatMsg {
  from: "lead" | "agent";
  author: string;
  time: string;
  text: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase();
}

function nowTime() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  leadId: string;
  index: number;
  total: number;
}

const WIDTH = 360;
const HEIGHT = 520;
const RAIL_WIDTH = 32;
const RAIL_GAP = 8;

export function FloatingChatWindow({ leadId, index }: Props) {
  const { leads, setSelectedLeadId } = useCRM();
  const { closeChat, minimizeChat, openChat, windows } = useFloatingChat();
  const { user } = useAuth();
  const lead = leads[leadId];

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null
  );
  const msgsRef = useRef<HTMLDivElement>(null);

  const otherLeads = windows
    .filter(w => w.leadId !== leadId)
    .map(w => leads[w.leadId])
    .filter(Boolean)
    .slice(0, 4);

  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [messages.length, leadId]);

  // Carregar histórico + Realtime ao abrir o chat
  useEffect(() => {
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }
    if (!lead || !user) return;
    const cleanPhone = (lead.whatsapp ?? "").replace(/\D/g, "");
    if (!cleanPhone) return;

    setMessages([]);

    supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("phone", cleanPhone)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (!data?.length) return;
        const agentName = user.email?.split("@")[0] ?? "Você";
        setMessages(data.map(m => ({
          from:   m.from_me ? "agent" : "lead",
          author: m.from_me ? (m.sender_name ?? agentName) : (m.chat_name ?? lead.name),
          time:   new Date(m.momment ?? m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          text:   m.body ?? "",
        })));
      });

    const ch = supabase
      .channel(`fchat-${cleanPhone}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `phone=eq.${cleanPhone}` },
        (payload) => {
          const m = payload.new as Record<string, any>;
          if (m.from_me) return;
          setMessages(prev => [...prev, {
            from:   "lead",
            author: m.chat_name ?? lead.name,
            time:   new Date(m.momment ?? m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            text:   m.body ?? "",
          }]);
        }
      )
      .subscribe();
    realtimeRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      realtimeRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, user?.id]);

  // Default position: bottom-right with rail to the left of the window
  const defaultRight = 16 + index * 20;
  const defaultBottom = 24 + index * 20;

  const onMouseDown = (e: React.MouseEvent) => {
    const containerRect = (e.currentTarget.closest("[data-floating-chat-root]") as HTMLDivElement)
      ?.getBoundingClientRect();
    if (!containerRect) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: containerRect.left,
      baseY: containerRect.top,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!lead) return null;

  const positionStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: defaultRight, bottom: defaultBottom };

  const handleSend = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    const agentName = user?.email?.split("@")[0] ?? "Você";

    // Adiciona à UI imediatamente (otimista)
    const newMsg: ChatMsg = { from: "agent", author: agentName, time: nowTime(), text };
    setMessages(prev => [...prev, newMsg]);
    setDraft("");

    // Enviar via Z-API se houver instância conectada e telefone do lead
    const contactPhone = lead.whatsapp;
    if (user && contactPhone && contactPhone !== "—") {
      try {
        const raw = localStorage.getItem(`rzlt_zapi_${user.id}`);
        if (raw) {
          const creds = JSON.parse(raw);
          if (creds.connected && creds.instanceId && creds.token) {
            const cleanPhone = contactPhone.replace(/\D/g, "");
            const res = await fetch(
              `https://api.z-api.io/instances/${creds.instanceId}/token/${creds.token}/send-text`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(creds.clientToken ? { "Client-Token": creds.clientToken } : {}),
                },
                body: JSON.stringify({ phone: cleanPhone, message: text }),
              }
            );
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              toast.error(`Erro ao enviar: ${(err as { message?: string }).message ?? res.status}`);
            }

            // Persiste para histórico
            await supabase.from("whatsapp_messages").insert({
              owner_id:    user.id,
              instance_id: creds.instanceId,
              phone:       cleanPhone,
              from_me:     true,
              body:        text,
              type:        "text",
              momment:     Date.now(),
              sender_name: agentName,
            });
          } else {
            toast.error("Nenhuma instância WhatsApp conectada. Configure em Conexões.");
          }
        } else {
          toast.error("Nenhuma instância WhatsApp conectada. Configure em Conexões.");
        }
      } catch {
        toast.error("Falha ao enviar mensagem via WhatsApp");
      }
    }
  };

  return (
    <div
      data-floating-chat-root
      className="fixed flex items-end animate-scale-in"
      style={{
        gap: RAIL_GAP,
        zIndex: 1000 + index,
        ...positionStyle,
      }}
    >
      {/* External avatar rail */}
      {otherLeads.length > 0 && (
        <div
          className="flex flex-col gap-2"
          style={{ width: RAIL_WIDTH, paddingBottom: 8 }}
        >
          {otherLeads.map(l => (
            <button
              key={l.id}
              onClick={() => openChat(l.id)}
              className="rounded-full flex items-center justify-center text-[11px] font-semibold text-white transition-opacity hover:opacity-100"
              style={{
                width: 32,
                height: 32,
                background: "#128A68",
                opacity: 0.6,
              }}
              title={l.name}
            >
              {getInitials(l.name)}
            </button>
          ))}
          {/* Active indicator */}
          <div
            className="rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
            style={{
              width: 32,
              height: 32,
              background: "#128A68",
              border: "2px solid #128A68",
              boxShadow: "0 0 0 2px #FFFFFF inset",
            }}
            title={lead.name}
          >
            {getInitials(lead.name)}
          </div>
        </div>
      )}

      {/* Chat window */}
      <div
        className="flex flex-col bg-card overflow-hidden"
        style={{
          width: WIDTH,
          height: HEIGHT,
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.16)",
        }}
      >
        {/* Header */}
        <div
          onMouseDown={onMouseDown}
          className="flex items-center gap-2 border-b cursor-move select-none shrink-0"
          style={{
            height: 52,
            padding: "0 12px",
            background: "#FFFFFF",
            borderColor: "#E5E5E5",
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
            style={{ background: "#128A68" }}
          >
            {getInitials(lead.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate"
              style={{ fontSize: 14, fontWeight: 600, color: "#111", lineHeight: 1.2 }}
              title={lead.name}
            >
              {lead.name}
            </div>
            <div
              className="flex items-center gap-2 truncate"
              style={{ fontSize: 11, color: "#AAAAAA", lineHeight: 1.2 }}
            >
              <span>WhatsApp</span>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setSelectedLeadId(leadId);
                }}
                className="hover:underline"
                style={{ color: "#128A68", fontWeight: 500 }}
              >
                Ver no pipeline →
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] rounded-md"
              onClick={e => e.stopPropagation()}
            >
              <Check size={12} className="mr-1" />
              Lida
            </Button>
            <button
              onClick={() => minimizeChat(leadId)}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary"
              aria-label="Minimizar"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => closeChat(leadId)}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={msgsRef}
          className="flex-1 overflow-y-auto"
          style={{ background: "#FAFAFA", padding: 12 }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <div style={{ fontSize: 12, color: "#AAA", textAlign: "center" }}>
                Nenhuma mensagem ainda
              </div>
              <div style={{ fontSize: 11, color: "#CCC", textAlign: "center" }}>
                Envie uma mensagem para iniciar a conversa
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-3">
                <span
                  className="text-[11px] px-3 py-1 rounded-full"
                  style={{ background: "#E5E5E5", color: "#666" }}
                >
                  Hoje
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {messages.map((m, i) => {
                  const isLead = m.from === "lead";
                  return (
                    <div
                      key={i}
                      className={`flex flex-col ${isLead ? "items-start" : "items-end"}`}
                    >
                      <div
                        className="mb-0.5"
                        style={{ fontSize: 11, color: "#AAAAAA" }}
                      >
                        {isLead ? lead.name : m.author} · {m.time}
                      </div>
                      <div
                        style={{
                          maxWidth: "80%",
                          padding: "8px 12px",
                          fontSize: 13,
                          lineHeight: 1.4,
                          background: isLead ? "#FFFFFF" : "#0F6E56",
                          color: isLead ? "#111111" : "#FFFFFF",
                          border: isLead ? "0.5px solid #E5E5E5" : "none",
                          borderRadius: isLead
                            ? "4px 16px 16px 16px"
                            : "16px 4px 16px 16px",
                        }}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 border-t shrink-0"
          style={{
            height: 52,
            padding: "8px 12px",
            background: "#FFFFFF",
            borderColor: "#E5E5E5",
          }}
        >
          <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary" aria-label="Anexar">
            <Paperclip size={16} style={{ color: "#AAAAAA" }} />
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary" aria-label="Emoji">
            <Smile size={16} style={{ color: "#AAAAAA" }} />
          </button>
          <button
            className="flex items-center justify-center"
            style={{
              background: "#E1F5EE",
              padding: 4,
              borderRadius: 6,
            }}
            aria-label="IA"
          >
            <Sparkles size={14} style={{ color: "#128A68" }} />
          </button>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Mensagem..."
            className="flex-1 bg-transparent outline-none border-none min-w-0"
            style={{ fontSize: 13, fontFamily: "Inter, sans-serif", color: "#111" }}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="flex items-center justify-center transition-colors shrink-0"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: draft.trim() ? "#0F6E56" : "#E5E5E5",
              color: draft.trim() ? "#FFFFFF" : "#AAAAAA",
            }}
            aria-label="Enviar"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Hidden but kept for hover hint of WhatsApp brand */}
      <span style={{ display: "none" }}>
        <WhatsAppIcon size={1} />
      </span>
    </div>
  );
}
