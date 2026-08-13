import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCRM } from "@/context/CRMContext";
import { useFloatingChat } from "@/context/FloatingChatContext";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { variantesDeTelefone } from "@/lib/telefone";
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
  const { company, whatsappConnections } = useCompany();
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
      // Variantes, não igualdade exata. O telefone do lead vem do formulário
      // ("+55 48 99115-2442" -> 5548991152442) e o das mensagens vem do canal,
      // que grava com ou sem o 55 e com ou sem o nono dígito. Com `.eq` o chat
      // flutuante abria vazio sempre que os dois formatos não coincidiam, que é
      // o caso comum. Mesmo defeito já corrigido em LeadDrawer e LeadDetailPage.
      .in("phone", variantesDeTelefone(lead.whatsapp))
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

    // Mesmas variantes do histórico acima. Com `phone=eq.` o chat carregava o
    // histórico certo e depois ficava mudo: a mensagem nova chegava gravada em
    // outro formato e o filtro do realtime não a reconhecia.
    const variantes = variantesDeTelefone(lead.whatsapp);
    const ch = supabase
      .channel(`fchat-${cleanPhone}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `phone=in.(${variantes.join(",")})` },
        (payload) => {
          const m = payload.new as { from_me: boolean; chat_name?: string; body?: string; momment?: number; created_at?: string };
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

    // Envia pela 1ª conexão de WhatsApp ativa da empresa -- mesma escolha
    // usada pro avatar (lead não guarda qual conversa/instância o originou).
    // Suporta os 3 provedores (D-API/Z-API/Cloud API), igual ao
    // Multiatendimento -- antes só existia o caminho Z-API, em cima de
    // campos (company.zapi_*) que não são mais escritos desde a migração
    // pro modelo de múltiplas conexões, então o envio nunca funcionava.
    const contactPhone = lead.whatsapp;
    if (!user || !company || !contactPhone || contactPhone === "—") return;

    const inst = whatsappConnections.find(c => c.connected && c.active);
    if (!inst) {
      toast.error("Nenhuma conexão de WhatsApp ativa. Configure em Configurações → Conexões.");
      return;
    }

    const cleanPhone = contactPhone.replace(/\D/g, "");
    try {
      let sendOk = false;
      if (inst.provider === "cloud_api") {
        const res = await fetch(`https://graph.facebook.com/v21.0/${inst.instanceId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${inst.token}` },
          body: JSON.stringify({ messaging_product: "whatsapp", to: cleanPhone, type: "text", text: { body: text, preview_url: false } }),
        });
        if (res.ok) sendOk = true;
        else {
          const err = await res.json().catch(() => ({}));
          toast.error(`Erro ao enviar: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
        }
      } else if (inst.provider === "dapi") {
        const res = await fetch(`https://api.d-api.cloud/api/v1/messages/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": inst.token },
          body: JSON.stringify({ sessionId: inst.instanceId, to: cleanPhone, text }),
        });
        if (res.ok) sendOk = true;
        else toast.error(`Erro ao enviar: ${(await res.text().catch(() => "")).slice(0, 120) || res.status}`);
      } else {
        const res = await fetch(`https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/send-text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(inst.clientToken ? { "Client-Token": inst.clientToken } : {}),
          },
          body: JSON.stringify({ phone: cleanPhone, message: text }),
        });
        if (res.ok) sendOk = true;
        else {
          const err = await res.json().catch(() => ({}));
          toast.error(`Erro ao enviar: ${(err as { message?: string }).message ?? res.status}`);
        }
      }

      if (!sendOk) return;

      // Vincula à conversa existente, se houver. Diferente do Multiatendimento,
      // aqui não há conversa em contexto: o chat flutuante abre a partir do card
      // do lead, não da caixa de entrada.
      //
      // Se NÃO existir conversa, esta mensagem fica sem vínculo de propósito.
      // Criar uma aqui é decisão de produto, não de código: significaria que
      // mandar um recado rápido pelo pipeline passa a abrir uma thread na caixa
      // de entrada de todo mundo. Enquanto isso não for decidido, o null diz a
      // verdade, e é exatamente essa a situação das 80 mensagens sem conversa
      // que o backfill encontrou.
      const { data: conversa } = await supabase
        .from("whatsapp_conversations")
        .select("id")
        .eq("owner_id", company.owner_id)
        .eq("instance_id", inst.instanceId)
        .in("phone", variantesDeTelefone(lead.whatsapp))
        .order("last_msg_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Persiste para histórico -- mesmo padrão de owner_id/company_id usado
      // no resto do app (dono da empresa, não o usuário logado).
      await supabase.from("whatsapp_messages").insert({
        owner_id:    company.owner_id,
        company_id:  company.id,
        instance_id: inst.instanceId,
        phone:       cleanPhone,
        from_me:     true,
        body:        text,
        type:        "text",
        momment:     Date.now(),
        sender_name: agentName,
        conversation_id: conversa?.id ?? null,
      });
    } catch {
      toast.error("Falha ao enviar mensagem via WhatsApp");
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
                          border: isLead ? "1px solid #E5E5E5" : "none",
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
