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
import { useProfile } from "@/context/ProfileContext";
import { ConvAvatar } from "@/components/ConvAvatar";
import { corDoNome } from "@/lib/nomeColorido";
import { fetchWhatsappAvatar } from "@/lib/whatsappAvatar";
import { apagarMensagemWhatsapp } from "@/lib/apagarMensagemWhatsapp";
import { MenuDaMensagem, menuAbreParaCima } from "@/components/MenuDaMensagem";
import { Reply, Trash2, Copy, ChevronDown } from "lucide-react";
import { EMOJIS } from "@/lib/emojis";
import { enviarArquivoWhatsapp } from "@/lib/enviarArquivoWhatsapp";
import { extrairIdDaResposta, descreverResposta } from "@/lib/respostaEnvio";
import {
  BotMessageSquare,
  Check,
  Minus,
  X,
  Paperclip,
  Smile,
  ArrowRight,
} from "lucide-react";

interface ChatMsg {
  /** Nosso uuid da linha, para atualizar a mensagem certa no estado. */
  id?: string;
  from: "lead" | "agent";
  author: string;
  time: string;
  text: string;
  /**
   * Id da mensagem NO PROVEDOR. É o que se manda para citar ou apagar; o `id`
   * acima é o nosso e não serve para isso. Nulo nas mensagens antigas.
   */
  messageId?: string | null;
  /** O que esta mensagem cita, quando cita alguma. */
  citacao?: { messageId: string; preview: string } | null;
  /** Quando foi apagada. A bolha mostra o aviso, o histórico não se perde. */
  apagadaEm?: string | null;
  /**
   * Enviada pelo agente de IA, não por uma pessoa. Muda o avatar da bolha.
   *
   * Sem isto o chat flutuante mostrava a foto de QUEM ESTÁ OLHANDO a tela em
   * mensagens que o agente escreveu -- o mesmo defeito que o Multiatendimento
   * já tinha corrigido com a coluna sent_by_agent.
   */
  porAgente?: boolean;
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

// Lê o id que o provedor atribuiu à mensagem enviada, e registra o formato
// quando não acha. A D-API não documenta a resposta de sucesso, então o log é
// como descobrimos a estrutura pelo dado real.
async function lerIdDoEnvio(res: Response, provedor: string): Promise<string | null> {
  const corpo = await res.clone().json().catch(() => null);
  const id = extrairIdDaResposta(corpo);
  if (!id) console.warn(`[chat-flutuante] ${provedor}: id não encontrado na resposta. ${descreverResposta(corpo)}`);
  return id;
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
  const { profile } = useProfile();
  const lead = leads[leadId];

  const [draft, setDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [avatarDoLead, setAvatarDoLead] = useState<string | undefined>();
  const [citando, setCitando] = useState<ChatMsg | null>(null);
  const [msgSobreMouse, setMsgSobreMouse] = useState<string | null>(null);
  const [menuDaMsg, setMenuDaMsg] = useState<string | null>(null);
  const [menuParaCima, setMenuParaCima] = useState(false);
  // A Meta não permite apagar mensagem já enviada pela API oficial. Não é
  // limitação nossa, então o item aparece cinza com o motivo em vez de sumir.
  const podeApagar = whatsappConnections.find(c => c.connected && c.active)?.provider !== "cloud_api";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  /**
   * Ids no provedor das mensagens que ESTA janela acabou de enviar.
   *
   * Preenchido ANTES do insert, porque o realtime costuma chegar antes da
   * resposta do insert. Sem isso a própria mensagem voltaria pelo canal e
   * apareceria duas vezes.
   *
   * É um ref e não estado de propósito: mudar não deve renderizar nada, e o
   * handler do realtime precisa ler o valor do momento, não o da closure em
   * que foi criado.
   */
  const jaEnviadasPorMim = useRef<Set<string>>(new Set());
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

  // Foto do contato, mesma origem do Multiatendimento. A guarda de número
  // curto vive dentro de fetchWhatsappAvatar, então não precisa repetir aqui.
  useEffect(() => {
    const inst = whatsappConnections.find(c => c.connected && c.active);
    if (!inst?.token || !lead?.whatsapp) { setAvatarDoLead(undefined); return; }
    let cancelado = false;
    fetchWhatsappAvatar(lead.whatsapp, inst).then(url => { if (!cancelado && url) setAvatarDoLead(url); });
    return () => { cancelado = true; };
  }, [lead?.whatsapp, whatsappConnections]);

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
      // Descendente + inverter, pelo mesmo motivo do Multiatendimento: com
      // `ascending: true` o limite trazia as 100 mensagens mais ANTIGAS, e a
      // conversa congelava no centésimo recado. O corte tem que cair no começo
      // do histórico, não no fim.
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        if (!data?.length) return;
        setMessages([...data].reverse().map(m => ({
          id:     m.id as string,
          from:   m.from_me ? "agent" : "lead",
          author: m.from_me ? (m.sender_name ?? (m.sent_by_agent ? "Agente" : nomeAtendente)) : (m.chat_name ?? lead.name),
          porAgente: !!m.sent_by_agent,
          messageId: (m.message_id as string | null) ?? null,
          apagadaEm: (m.deleted_at as string | null) ?? null,
          citacao: m.reply_to_message_id
            ? { messageId: m.reply_to_message_id as string, preview: (m.reply_to_preview as string | null) ?? "" }
            : null,
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
          const m = payload.new as {
            id?: string; message_id?: string | null; from_me: boolean;
            chat_name?: string; sender_name?: string | null; body?: string;
            momment?: number; created_at?: string; sent_by_agent?: boolean;
            reply_to_message_id?: string | null; reply_to_preview?: string | null;
          };

          // Antes daqui saía `if (m.from_me) return`, para não duplicar a bolha
          // otimista de quem estava digitando. Só que isso engolia TODA mensagem
          // de saída, e a maioria não é minha: a resposta do agente de IA, a
          // mensagem que o dono manda pelo celular e a de outro atendente no
          // Multiatendimento. Nenhuma delas aparecia sem recarregar a tela.
          //
          // A pergunta certa não é "veio de nós?", é "eu já mostrei esta?".
          if (jaEnviadasPorMim.current.has(m.message_id ?? "")) return;

          const nova: ChatMsg = {
            id:        m.id,
            from:      m.from_me ? "agent" : "lead",
            author:    m.from_me ? (m.sender_name ?? (m.sent_by_agent ? "Agente" : nomeAtendente)) : (m.chat_name ?? lead.name),
            porAgente: !!m.sent_by_agent,
            messageId: m.message_id ?? null,
            citacao:   m.reply_to_message_id
              ? { messageId: m.reply_to_message_id, preview: m.reply_to_preview ?? "" }
              : null,
            time:      new Date(m.momment ?? m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            text:      m.body ?? "",
          };

          setMessages(prev => {
            // Já está na lista pelo uuid: nada a fazer.
            if (nova.id && prev.some(p => p.id === nova.id)) return prev;

            // Corrida: o realtime pode chegar antes da resposta do insert, e aí
            // a bolha otimista ainda não tem id nenhum para comparar. Nesse caso
            // adota a bolha pendente de mesmo texto em vez de empilhar outra.
            if (m.from_me) {
              const i = prev.findIndex(p => !p.id && p.from === "agent" && p.text === nova.text);
              if (i >= 0) {
                const copia = [...prev];
                copia[i] = { ...copia[i], ...nova };
                return copia;
              }
            }
            return [...prev, nova];
          });
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
      const { mediaUrl, ehImagem, avisoUpload, idNoProvedor } = await enviarArquivoWhatsapp({
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

      // Mesmo motivo do envio de texto: registrar antes do insert, senão o
      // realtime devolve o arquivo e ele aparece duas vezes para quem enviou.
      if (idNoProvedor) jaEnviadasPorMim.current.add(idNoProvedor);

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
        message_id:  idNoProvedor,
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

// Apagar. "Para mim" é marcação nossa e não passa pelo provedor, então
  // funciona em qualquer linha -- inclusive na oficial, onde a Meta proíbe
  // apagar de verdade.
  const apagarMensagem = async (m: ChatMsg, paraTodos: boolean) => {
    const inst = whatsappConnections.find(c => c.connected && c.active);
    if (paraTodos && (!inst?.token || !m.messageId || !lead?.whatsapp)) return;
    try {
      if (paraTodos) {
        await apagarMensagemWhatsapp({ messageId: m.messageId!, telefone: lead.whatsapp, conexao: inst!, paraTodos });
      }
      const agora = new Date().toISOString();
      if (m.id) {
        const { error } = await supabase.from("whatsapp_messages")
          .update({ deleted_at: agora, deleted_by: nomeAtendente }).eq("id", m.id);
        if (error) console.error("[chat-flutuante] marcar apagada:", error);
      }
      setMessages(prev => prev.map(mm => mm.id === m.id ? { ...mm, apagadaEm: agora } : mm));
      toast.success(paraTodos ? "Mensagem apagada para todos" : "Mensagem apagada");
    } catch (e) {
      toast.error(`Não consegui apagar: ${(e as Error).message}`);
    }
  };

  const copiarMensagem = async (m: ChatMsg) => {
    // A área de transferência pode recusar (Safari é rígido com o gesto). Sem o
    // catch a falha seria silenciosa: a pessoa acha que copiou e cola outra coisa.
    try {
      await navigator.clipboard.writeText(m.text);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e use Cmd+C.");
    }
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    // Adiciona à UI imediatamente (otimista)
    const newMsg: ChatMsg = {
      from: "agent", author: nomeAtendente, time: nowTime(), text,
      // Na hora, não só depois de recarregar: no Multiatendimento essa mesma
      // omissão fez a resposta aparecer como mensagem comum para quem acabou de
      // enviá-la, enquanto no celular chegava certa.
      citacao: citando?.messageId ? { messageId: citando.messageId, preview: citando.text.slice(0, 300) } : null,
    };
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
    // Congela a citação: o `citando` do closure sobreviveria ao setCitando(null),
    // mas depender disso é sutil demais num fluxo com três provedores no meio.
    const citada = citando;
    setCitando(null);
    try {
      let sendOk = false;
      // Mesmo motivo do Multiatendimento: guardar o id do provedor e o que
      // permite citar, apagar e encaminhar esta mensagem depois.
      let idNoProvedor: string | null = null;
      if (inst.provider === "cloud_api") {
        const res = await fetch(`https://graph.facebook.com/v21.0/${inst.instanceId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${inst.token}` },
          body: JSON.stringify({ messaging_product: "whatsapp", to: cleanPhone, type: "text", text: { body: text, preview_url: false }, ...(citada?.messageId ? { context: { message_id: citada.messageId } } : {}) }),
        });
        if (res.ok) { sendOk = true; idNoProvedor = await lerIdDoEnvio(res, "cloud-api"); }
        else {
          const err = await res.json().catch(() => ({}));
          toast.error(`Erro ao enviar: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
        }
      } else if (inst.provider === "dapi") {
        const res = await fetch(`https://api.d-api.cloud/api/v1/messages/send/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": inst.token },
          body: JSON.stringify({ sessionId: inst.instanceId, to: cleanPhone, text, ...(citada?.messageId ? { contextInfo: { stanzaId: citada.messageId } } : {}) }),
        });
        if (res.ok) { sendOk = true; idNoProvedor = await lerIdDoEnvio(res, "d-api"); }
        else toast.error(`Erro ao enviar: ${(await res.text().catch(() => "")).slice(0, 120) || res.status}`);
      } else {
        const res = await fetch(`https://api.z-api.io/instances/${inst.instanceId}/token/${inst.token}/send-text`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(inst.clientToken ? { "Client-Token": inst.clientToken } : {}),
          },
          body: JSON.stringify({ phone: cleanPhone, message: text, ...(citada?.messageId ? { messageId: citada.messageId } : {}) }),
        });
        if (res.ok) { sendOk = true; idNoProvedor = await lerIdDoEnvio(res, "z-api"); }
        else {
          const err = await res.json().catch(() => ({}));
          toast.error(`Erro ao enviar: ${(err as { message?: string }).message ?? res.status}`);
        }
      }

      if (!sendOk) return;

      // Registra ANTES do insert: o realtime costuma entregar o INSERT antes de
      // a resposta do insert voltar para cá. Registrando depois, a mensagem
      // apareceria duplicada na janela de quem enviou.
      if (idNoProvedor) jaEnviadasPorMim.current.add(idNoProvedor);

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
        message_id:  idNoProvedor,
        conversation_id: conversationId,
        reply_to_message_id: citada?.messageId ?? null,
        reply_to_preview: citada ? citada.text.slice(0, 300) : null,
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
          data-lista-mensagens
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
                  const quemFalou = isLead ? lead.name : m.author;
                  return (
                    <div
                      key={i}
                      className={`flex ${isLead ? "justify-start" : "justify-end"}`}
                    >
                      {/* Avatar do lado de quem falou, igual ao Multiatendimento:
                          a foto do contato à esquerda, a do atendente à direita. */}
                      {isLead && (
                        <ConvAvatar name={quemFalou} avatarUrl={avatarDoLead} size={24} fontSize={9} style={{ marginRight: 6 }} />
                      )}
                      <div className={`flex flex-col ${isLead ? "items-start" : "items-end"}`} style={{ minWidth: 0, maxWidth: "80%" }}>
                      <div
                        className="mb-0.5"
                        style={{ fontSize: 11 }}
                      >
                        {/* Nome colorido pelo mesmo hash do Multiatendimento, com
                            paletas separadas por lado: é o que deixa ver de
                            relance quem falou sem ler nome por nome. */}
                        <span style={{ color: corDoNome(quemFalou, isLead ? "cliente" : "atendente"), fontWeight: 600 }}>
                          {quemFalou}
                        </span>
                        <span style={{ color: "#AAAAAA" }}> · {m.time}</span>
                      </div>
                      <div
                        onMouseEnter={() => setMsgSobreMouse(m.id ?? null)}
                        onMouseLeave={() => setMsgSobreMouse(null)}
                        style={{
                          position: "relative",
                          padding: "8px 30px 8px 12px",
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
                          {/* Ação da mensagem, DENTRO do balão: do lado de fora o
                              vão sem hover faz o botão sumir no caminho do
                              cursor. O espaço à direita é reservado sempre, para
                              o balão não mudar de forma quando o mouse chega. */}
                          {(msgSobreMouse === m.id || menuDaMsg === m.id) && m.id && (
                            <button
                              data-menu-mensagem
                              onClick={e => {
                                if (menuDaMsg === m.id) { setMenuDaMsg(null); return; }
                                setMenuParaCima(menuAbreParaCima(e.currentTarget, 110));
                                setMenuDaMsg(m.id ?? null);
                              }}
                              title="Opções da mensagem"
                              style={{
                                position: "absolute", top: 2, right: 4,
                                width: 18, height: 18, borderRadius: 4, border: "none",
                                background: isLead ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.18)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", padding: 0, zIndex: 2,
                              }}
                            >
                              <ChevronDown size={12} color={isLead ? "#535353" : "#FFF"} />
                            </button>
                          )}
                          <MenuDaMensagem
                            aberto={menuDaMsg === m.id}
                            paraCima={menuParaCima}
                            onFechar={() => setMenuDaMsg(null)}
                            itens={[
                              ...(m.messageId ? [{ rotulo: "Responder", icone: <Reply size={14} color="#535353" />, acao: () => setCitando(m) }] : []),
                              ...(!m.apagadaEm ? [{
                                rotulo: "Apagar", icone: <Trash2 size={14} color="#B91C1C" />, destrutivo: true,
                                submenu: [
                                  { rotulo: "Apagar para mim", icone: <Trash2 size={14} color="#B91C1C" />, destrutivo: true,
                                    acao: () => apagarMensagem(m, false) },
                                  ...(!isLead && m.messageId ? [{
                                    rotulo: "Apagar para todos", icone: <Trash2 size={14} color={podeApagar ? "#B91C1C" : "#CCC"} />,
                                    destrutivo: true, desabilitado: !podeApagar,
                                    motivo: podeApagar ? undefined : "A API oficial do WhatsApp não permite apagar mensagens já enviadas.",
                                    acao: () => apagarMensagem(m, true),
                                  }] : []),
                                ],
                              }] : []),
                              { rotulo: "Copiar", icone: <Copy size={14} color="#535353" />, acao: () => copiarMensagem(m) },
                            ]}
                          />
                          {/* Citação: o que esta mensagem responde. */}
                          {m.citacao && !m.apagadaEm && (
                            <div style={{
                              borderLeft: `3px solid ${isLead ? "#128A68" : "rgba(255,255,255,0.55)"}`,
                              background: isLead ? "#F5F5F5" : "rgba(255,255,255,0.14)",
                              borderRadius: 6, padding: "4px 8px", marginBottom: 4, fontSize: 11,
                              color: isLead ? "#666" : "rgba(255,255,255,0.9)",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                            }}>
                              {m.citacao.preview || "Mensagem"}
                            </div>
                          )}
                          {m.apagadaEm
                            ? <span style={{ fontStyle: "italic", opacity: 0.75 }}>Mensagem apagada</span>
                            : m.text}
                        </div>
                      </div>
                      {!isLead && (
                        // Mesma regra do Multiatendimento: ícone de robô quando
                        // foi o agente, foto do perfil quando foi a própria
                        // pessoa que está olhando, e iniciais para os demais
                        // atendentes (a foto de outro atendente não está aqui).
                        m.porAgente ? (
                          <div title={quemFalou} style={{ width: 24, height: 24, borderRadius: "50%", background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 6 }}>
                            <BotMessageSquare size={13} color="#6D28D9" />
                          </div>
                        ) : (
                          <ConvAvatar name={quemFalou} avatarUrl={quemFalou === nomeAtendente ? (profile?.avatar_url ?? undefined) : undefined} size={24} fontSize={9} style={{ marginLeft: 6 }} />
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Mostra o que está sendo respondido, com saída visível. Sem isto a
            pessoa clica em responder e não tem sinal nenhum de que a próxima
            mensagem vai sair citando. */}
        {citando && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 6,
            margin: "0 10px 6px", padding: "6px 8px",
            background: "#F5F5F5", borderLeft: "3px solid #128A68", borderRadius: 6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#128A68" }}>
                Respondendo {citando.from === "agent" ? citando.author : lead.name}
              </div>
              <div style={{ fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {citando.text}
              </div>
            </div>
            <button onClick={() => setCitando(null)} title="Cancelar resposta"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}>
              <X size={12} color="#888" />
            </button>
          </div>
        )}

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
