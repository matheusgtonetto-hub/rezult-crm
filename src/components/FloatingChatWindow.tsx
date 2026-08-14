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
import { upsertConversationForMessage, previewLabelFor } from "@/lib/conversas";
import { useNomeAtendente } from "@/hooks/useNomeAtendente";
import { EMOJIS } from "@/lib/emojis";
import { enviarArquivoWhatsapp } from "@/lib/enviarArquivoWhatsapp";
import {
  Check,
  Minus,
  X,
  Paperclip,
  Smile,
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
  const nomeAtendente = useNomeAtendente();
  const lead = leads[leadId];

  const [draft, setDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        setMessages(data.map(m => ({
          from:   m.from_me ? "agent" : "lead",
          author: m.from_me ? (m.sender_name ?? nomeAtendente) : (m.chat_name ?? lead.name),
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

  // Anexo. Reaproveita enviarArquivoWhatsapp(), a mesma função que o
  // Multiatendimento usa: a diferença entre Cloud API, D-API e Z-API não pode
  // existir em dois lugares.
  //
  // A conversa é criada aqui também, pelo mesmo motivo do envio de texto: quem
  // manda arquivo pelo pipeline está iniciando um atendimento, e ele tem que
  // aparecer no Multiatendimento.
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !lead || !user || !company) return;

    const contactPhone = lead.whatsapp;
    if (!contactPhone || contactPhone === "—") {
      toast.error("Este lead não tem WhatsApp cadastrado.");
      return;
    }
    const inst = whatsappConnections.find(c => c.connected && c.active);
    if (!inst?.token) {
      toast.error("Nenhuma conexão de WhatsApp ativa. Configure em Configurações → Conexões.");
      return;
    }

    const cleanPhone = contactPhone.replace(/\D/g, "");
    setEnviandoArquivo(true);
    toast.loading("Enviando arquivo…", { id: "fchat-file" });
    try {
      const { mediaUrl, ehImagem, avisoUpload } = await enviarArquivoWhatsapp({
        file,
        telefone: cleanPhone,
        conexao: inst,
        userId: user.id,
      });
      if (avisoUpload) toast.error(`Falha ao salvar o arquivo (não será baixável no chat): ${avisoUpload}`);

      setMessages(prev => [...prev, {
        from: "agent",
        author: nomeAtendente,
        time: nowTime(),
        text: ehImagem ? `🖼️ ${file.name}` : `📎 ${file.name}`,
      }]);

      let conversationId: string | null = null;
      try {
        conversationId = await upsertConversationForMessage(supabase, {
          ownerId: company.owner_id,
          companyId: company.id,
          instanceId: inst.instanceId,
          phone: cleanPhone,
          name: lead.name,
          preview: previewLabelFor(ehImagem ? "image" : "document", file.name),
          fromMe: true,
        });
      } catch (err) {
        console.error("[chat-flutuante] não consegui criar/achar a conversa:", err);
      }

      const { error } = await supabase.from("whatsapp_messages").insert({
        owner_id:    company.owner_id,
        company_id:  company.id,
        instance_id: inst.instanceId,
        phone:       cleanPhone,
        from_me:     true,
        body:        file.name,
        type:        ehImagem ? "image" : "document",
        media_url:   mediaUrl,
        momment:     Date.now(),
        sender_name: nomeAtendente,
        conversation_id: conversationId,
      });
      if (error) {
        console.error("[chat-flutuante] insert do arquivo:", error);
        toast.error("Arquivo enviado, mas não salvo no histórico.");
      }
      toast.success("Arquivo enviado!", { id: "fchat-file" });
    } catch (err) {
      toast.error(`Erro ao enviar arquivo: ${(err as Error).message}`, { id: "fchat-file" });
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    // Adiciona à UI imediatamente (otimista)
    const newMsg: ChatMsg = { from: "agent", author: nomeAtendente, time: nowTime(), text };
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

      // Cria a conversa se ainda não existir, e devolve o id para a mensagem
      // nascer vinculada. Mesma função que os webhooks usam, não uma cópia.
      //
      // Criar SÓ no envio é o ponto: abrir o chat flutuante para espiar o
      // histórico não abre thread na caixa de entrada de ninguém. Quem manda
      // mensagem está iniciando um atendimento de fato, e aí ele tem que
      // aparecer no Multiatendimento como qualquer outro.
      //
      // É este caminho que produzia mensagem sem conversa: 80 delas, para 20
      // leads, sentadas no banco sem aparecer em lugar nenhum do CRM.
      let conversationId: string | null = null;
      try {
        conversationId = await upsertConversationForMessage(supabase, {
          ownerId: company.owner_id,
          companyId: company.id,
          instanceId: inst.instanceId,
          phone: cleanPhone,
          name: lead.name,
          preview: previewLabelFor("text", text),
          fromMe: true,
        });
      } catch (e) {
        console.error("[chat-flutuante] não consegui criar/achar a conversa:", e);
      }

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
        sender_name: nomeAtendente,
        conversation_id: conversationId,
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
                          // Mesmo tratamento da bolha do Multiatendimento:
                          // preserva quebra digitada e quebra o que nao tem
                          // espaco (codigo PIX, link longo), para a janela nao
                          // rolar na horizontal.
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
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
          className="flex items-center gap-2 border-t shrink-0 relative"
          style={{
            height: 52,
            padding: "8px 12px",
            background: "#FFFFFF",
            borderColor: "#E5E5E5",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={enviandoArquivo}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary disabled:opacity-50"
            aria-label="Anexar"
          >
            <Paperclip size={16} style={{ color: enviandoArquivo ? "#128A68" : "#AAAAAA" }} />
          </button>
          <button
            onClick={() => setShowEmoji(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary"
            aria-label="Emoji"
          >
            <Smile size={16} style={{ color: showEmoji ? "#128A68" : "#AAAAAA" }} />
          </button>
          {showEmoji && (
            <div style={{ position: "absolute", bottom: "100%", left: 8, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", padding: 10, zIndex: 100, width: 280 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => { setDraft(v => v + e); setShowEmoji(false); }}
                    style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 4px", borderRadius: 6, lineHeight: 1 }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = "#F5F5F5")}
                    onMouseLeave={ev => (ev.currentTarget.style.background = "none")}
                  >{e}</button>
                ))}
              </div>
            </div>
          )}
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
