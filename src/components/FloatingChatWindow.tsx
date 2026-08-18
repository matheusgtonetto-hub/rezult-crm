import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { WhatsappTemplatePicker, type Modelo } from "@/components/WhatsappTemplatePicker";
// Mesmo player de áudio do Multiatendimento, não uma segunda versão dele.
import { AudioBubble } from "@/components/AudioBubble";
import { parseAudioDuration } from "@/lib/audio";
import {
  BotMessageSquare,
  Minus,
  X,
  Paperclip,
  Smile,
  ArrowRight,
  FileText,
  Download,
  FolderOpen,
  CornerUpLeft,
  Image as ImageIcon,
} from "lucide-react";

interface ChatMsg {
  /** Nosso uuid da linha, para atualizar a mensagem certa no estado. */
  id?: string;
  from: "lead" | "agent";
  author: string;
  time: string;
  /**
   * O que a bolha desenha. Antes só existia texto aqui, e a janela renderizava
   * `body` cru para tudo: áudio virava bolha vazia (o `body` de áudio é ""),
   * imagem aparecia só como legenda e documento como o nome do arquivo, sem
   * link. 161 mensagens da base caíam nesse caso. O Multiatendimento já
   * distinguia; esta tela não.
   */
  kind: "text" | "image" | "audio" | "file" | "system";
  /** Texto, legenda da imagem, nome do arquivo ou aviso de sistema. */
  text: string;
  /** Onde a mídia está guardada. Nulo em mensagem antiga, e a bolha avisa. */
  mediaUrl?: string | null;
  /** Só áudio: "MM:SS" quando o provedor informa. */
  duracao?: string;
  /**
   * Botões que ACOMPANHARAM esta mensagem (automação com resposta rápida).
   * Aqui são registro do que foi oferecido, não controle: quem clica é o
   * contato, no WhatsApp dele.
   */
  botoes?: string[] | null;
  /**
   * Por qual linha esta mensagem passou.
   *
   * Esta janela junta, num fio só, tudo que o contato falou com a empresa,
   * mesmo que tenha sido por números diferentes (é o que acontece com quem
   * trocou de linha: 7 contatos da base estão nesse caso). Juntar dá o contexto
   * completo, mas sem dizer de onde veio cada trecho a tela sugere uma conversa
   * contínua que nunca existiu -- e alguém responde contando com algo que a
   * pessoa recebeu em OUTRO número. Guardar a origem é o que permite avisar.
   */
  instanceId?: string | null;
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

/** Linha de whatsapp_messages, nos campos que a bolha usa. */
type LinhaDeMensagem = {
  id?: string;
  message_id?: string | null;
  from_me?: boolean;
  chat_name?: string | null;
  sender_name?: string | null;
  sent_by_agent?: boolean;
  body?: string | null;
  type?: string | null;
  media_url?: string | null;
  instance_id?: string | null;
  buttons?: unknown;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to_preview?: string | null;
  momment?: number | null;
  created_at?: string;
};

/**
 * Linha do banco → bolha da conversa.
 *
 * Uma função só para o histórico e para o realtime. Antes eram dois trechos
 * quase iguais, e "quase" é o problema: quando um ganhava um campo novo, o
 * outro não, e a mesma mensagem aparecia diferente conforme tivesse chegado ao
 * vivo ou depois de recarregar. Espelha o `buildIncomingMsg` do
 * Multiatendimento, que resolve o mesmo problema lá.
 */
function montarMsg(m: LinhaDeMensagem, nomeDoLead: string, nomeAtendente: string): ChatMsg {
  const deMim = !!m.from_me;
  const base = {
    id: m.id,
    from: (deMim ? "agent" : "lead") as "agent" | "lead",
    author: deMim
      ? (m.sender_name ?? (m.sent_by_agent ? "Agente" : nomeAtendente))
      : (m.chat_name ?? nomeDoLead),
    porAgente: !!m.sent_by_agent,
    messageId: m.message_id ?? null,
    apagadaEm: m.deleted_at ?? null,
    citacao: m.reply_to_message_id
      ? { messageId: m.reply_to_message_id, preview: m.reply_to_preview ?? "" }
      : null,
    time: new Date(m.momment ?? m.created_at ?? Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    botoes: Array.isArray(m.buttons) ? (m.buttons as string[]) : null,
    mediaUrl: m.media_url ?? null,
    instanceId: m.instance_id ?? null,
  };

  if (m.type === "audio")    return { ...base, kind: "audio", text: "", duracao: parseAudioDuration(m.body) };
  if (m.type === "image")    return { ...base, kind: "image", text: m.body ?? "" };
  if (m.type === "document") return { ...base, kind: "file",  text: m.body ?? "arquivo" };
  // Aviso do próprio CRM ("Atendimento transferido para..."), não fala de
  // ninguém. Sem este caso ele entrava como mensagem RECEBIDA, com o nome do
  // cliente por cima: o contato parecia estar anunciando a própria transferência.
  if (m.type === "system")   return { ...base, kind: "system", from: "lead", text: m.body ?? "" };
  return { ...base, kind: "text", text: m.body ?? "" };
}

/**
 * Onde entra a etiqueta "via {linha}" na lista, uma posição por mensagem.
 *
 * Aparece só quando o histórico tem MAIS DE UMA origem. Com uma linha só (o
 * caso da maioria) nenhuma etiqueta é desenhada, senão a tela repetiria o óbvio
 * a cada bloco.
 *
 * Mensagem de sistema não conta como troca de origem: ela é aviso do CRM, não
 * passou por número nenhum, e sem esta ressalva um aviso no meio da conversa
 * cortaria o mesmo fio em dois blocos falsos, cada um com sua etiqueta.
 */
// Sem `export`: um arquivo de componente que exporta função solta quebra o hot
// reload do Vite. Fica interna, e o teste a alcança extraindo o trecho.
function etiquetasDeOrigem(
  msgs: Pick<ChatMsg, "kind" | "instanceId">[],
  nomeDaLinha: (instanceId: string) => string,
): (string | null)[] {
  const origens = new Set(
    msgs.filter(m => m.kind !== "system" && m.instanceId).map(m => m.instanceId as string),
  );
  if (origens.size < 2) return msgs.map(() => null);
  let atual: string | null = null;
  return msgs.map(m => {
    if (m.kind === "system" || !m.instanceId || m.instanceId === atual) return null;
    atual = m.instanceId;
    return nomeDaLinha(m.instanceId);
  });
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
/** Até onde o campo de mensagem cresce antes de passar a rolar. */
const ALTURA_MAX_MENSAGEM = 110;
const RAIL_WIDTH = 32;
const RAIL_GAP = 8;

export function FloatingChatWindow({ leadId, index }: Props) {
  const { leads } = useCRM();
  const navigate = useNavigate();
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
  /**
   * O telefone como o WhatsApp o conhece, que NÃO é o do cadastro.
   *
   * `lead.whatsapp` é o que alguém digitou no CRM e costuma vir sem o código do
   * país: neste lead está "55996635570", enquanto o canal usa "555596635570".
   * Não dá para consertar isso somando "55" na frente, porque 55 também é o DDD
   * de Santa Maria -- e é justamente o caso deste número, onde o "55" do começo
   * é o DDD e não o país. `variantesDeTelefone` existe por isso: ela lista as
   * formas plausíveis, sem escolher uma.
   *
   * Para ENVIAR mensagem a diferença passa batida (o provedor resolve o
   * número), mas o endpoint de presence não resolve: aceita, responde 200 e o
   * "digitando..." não aparece em lugar nenhum.
   *
   * Então a fonte aqui é a conversa, cujo telefone veio do JID que o WhatsApp
   * mandou -- fato observado no canal, não palpite sobre formato.
   *
   * O `id` vem junto porque é o que o Multiatendimento espera para abrir esta
   * mesma conversa (`location.state.openConvId`).
   *
   * Três estados, não dois: `undefined` = ainda buscando, `null` = não existe
   * conversa. A diferença importa para a janela de 24h abaixo, onde "não sei
   * ainda" e "o contato nunca escreveu" levam a decisões opostas.
   *
   * O `instanceId` diz por qual linha esta conversa aconteceu, e é o que define
   * a conexão que esta janela usa (ver `conexaoAtiva`).
   */
  const [conversaDoCanal, setConversaDoCanal] = useState<{ id: string; phone: string; instanceId: string | null } | null | undefined>(undefined);
  /**
   * Janela de 24h da Cloud API, a MESMA regra que o Multiatendimento aplica.
   *
   * Faltava aqui: o Multiatendimento avisava que a janela tinha fechado e esta
   * janela seguia com a caixa de texto liberada para a mesma conversa. Quem
   * escrevesse por aqui recebia a recusa da Meta depois de mandar -- e ainda
   * via a própria mensagem na tela, porque a bolha otimista nunca era retirada.
   *
   * Regra da Meta: passadas 24h da última mensagem DO CLIENTE, o WhatsApp
   * oficial só aceita modelo aprovado. Vale só para cloud_api; D-API e Z-API
   * não têm essa restrição.
   */
  const [janela, setJanela] = useState<"carregando" | "aberta" | "fechada">("aberta");
  /** Conversa cuja janela já foi checada uma vez, para não repetir o estado de espera. */
  const conversaVerificadaRef = useRef<string | null>(null);
  const [modelosAbertos, setModelosAbertos] = useState(false);
  const [enviandoModelo, setEnviandoModelo] = useState(false);
  const [citando, setCitando] = useState<ChatMsg | null>(null);
  const [msgSobreMouse, setMsgSobreMouse] = useState<string | null>(null);
  const [menuDaMsg, setMenuDaMsg] = useState<string | null>(null);
  const [menuParaCima, setMenuParaCima] = useState(false);
  /**
   * A conexão por onde esta janela envia. Uma só, usada por TUDO aqui dentro
   * (envio, anexo, janela de 24h, "digitando...", foto, apagar e o rótulo do
   * cabeçalho), para nenhum desses pedaços falar de uma linha e a mensagem sair
   * por outra.
   *
   * A linha vem da CONVERSA, não da lista de conexões. Antes era sempre a
   * primeira ativa da empresa, o que só coincide com a realidade em quem tem uma
   * conexão só: com duas, esta janela podia calcular a janela de 24h por uma
   * linha e enviar por outra, e discordar do Multiatendimento sobre a mesma
   * conversa. Lá a linha da conversa já é adotada ao abri-la
   * (MultiatendimentoPage.tsx, switchActiveInstance e o efeito que o antecede).
   *
   * Fallback para a primeira ativa em dois casos, o mesmo critério da outra
   * tela: enquanto a conversa ainda está sendo buscada, e quando a linha dela
   * não existe mais para este usuário (removida, ou de outra empresa) -- aí
   * insistir nela deixaria a janela sem conexão nenhuma em vez de utilizável.
   */
  const primeiraAtiva = whatsappConnections.find(c => c.connected && c.active);
  const conexaoDaConversa = conversaDoCanal?.instanceId
    ? whatsappConnections.find(c => c.instanceId === conversaDoCanal.instanceId && c.connected && c.active)
    : undefined;
  const conexaoAtiva = conexaoDaConversa ?? primeiraAtiva;
  // Nome dado à conexão nas Configurações; sem nome, o próprio número, que é
  // como o atendente reconhece a linha.
  const nomeDaConexao = conexaoAtiva?.name?.trim() || conexaoAtiva?.phone || "Conexão sem nome";
  // A Meta não permite apagar mensagem já enviada pela API oficial. Não é
  // limitação nossa, então o item aparece cinza com o motivo em vez de sumir.
  const podeApagar = conexaoAtiva?.provider !== "cloud_api";
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
  /**
   * Estado do indicador "digitando..." enviado ao aparelho do lead.
   *
   * `lastTypingAt` faz o throttle (um "typing" a cada 3s, não um por tecla) e
   * `pauseTimer` agenda o "paused" — sem ele o "digitando..." ficaria preso na
   * tela do cliente depois que o atendente para de escrever.
   *
   * Ref e não estado: nada disso deve provocar renderização.
   */
  const typingRef = useRef<{ lastTypingAt: number; pauseTimer: ReturnType<typeof setTimeout> | null }>({ lastTypingAt: 0, pauseTimer: null });
  // Cresce a caixa conforme o texto. Zera a altura antes de medir, senão o
  // scrollHeight nunca diminui e a caixa fica grande depois de apagar texto.
  const campoMensagemRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = campoMensagemRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, ALTURA_MAX_MENSAGEM) + "px";
  }, [draft]);
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
    if (!conexaoAtiva?.token || !lead?.whatsapp) { setAvatarDoLead(undefined); return; }
    let cancelado = false;
    fetchWhatsappAvatar(lead.whatsapp, conexaoAtiva).then(url => { if (!cancelado && url) setAvatarDoLead(url); });
    return () => { cancelado = true; };
  }, [lead?.whatsapp, conexaoAtiva]);

  // Carregar histórico + Realtime ao abrir o chat
  useEffect(() => {
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }
    if (!lead || !user) return;
    const cleanPhone = (lead.whatsapp ?? "").replace(/\D/g, "");
    // Sem telefone não há conversa a procurar. Marcar como `null` (e não deixar
    // em `undefined`) evita que a janela de 24h fique presa em "verificando".
    if (!cleanPhone) { setConversaDoCanal(null); return; }

    setMessages([]);
    setConversaDoCanal(undefined);

    // Conversa do canal: telefone para o indicador "digitando...", id para o
    // atalho do Multiatendimento. Mais recente primeiro porque um contato pode
    // ter conversa em mais de uma instância, e a última movimentada é a que
    // está em uso.
    supabase
      .from("whatsapp_conversations")
      .select("id, phone, instance_id")
      .in("phone", variantesDeTelefone(lead.whatsapp))
      .order("last_msg_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .then(({ data, error }) => {
        // Erro cai no mesmo `null` de "não existe conversa" de propósito. Na
        // Cloud API isso leva a janela para "fechada", ou seja, exige modelo:
        // gastar um modelo à toa é mais barato que escrever uma mensagem
        // inteira e receber a recusa da Meta depois de mandar.
        if (error) { console.warn("conversa do canal:", error.message); setConversaDoCanal(null); return; }
        const c = data?.[0] as { id: string; phone: string; instance_id: string | null } | undefined;
        setConversaDoCanal(c ? { id: c.id, phone: c.phone, instanceId: c.instance_id } : null);
      });

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
        setMessages([...data].reverse().map(m => montarMsg(m as LinhaDeMensagem, lead.name, nomeAtendente)));
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
          const m = payload.new as LinhaDeMensagem;

          // Antes daqui saía `if (m.from_me) return`, para não duplicar a bolha
          // otimista de quem estava digitando. Só que isso engolia TODA mensagem
          // de saída, e a maioria não é minha: a resposta do agente de IA, a
          // mensagem que o dono manda pelo celular e a de outro atendente no
          // Multiatendimento. Nenhuma delas aparecia sem recarregar a tela.
          //
          // A pergunta certa não é "veio de nós?", é "eu já mostrei esta?".
          if (jaEnviadasPorMim.current.has(m.message_id ?? "")) return;

          const nova = montarMsg(m, lead.name, nomeAtendente);

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

  // Fechar a janela (ou trocar de lead) no meio da digitação deixaria o
  // "digitando..." aceso no celular do cliente, porque quem o apagaria é um
  // timer desta janela. Este encerramento é mais necessário aqui do que no
  // Multiatendimento: lá a tela permanece montada, aqui a janela some a
  // qualquer momento. A dependência no telefone faz a limpeza rodar também na
  // troca de lead, encerrando o indicador de quem estava aberto antes.
  //
  // Fica ACIMA do `if (!lead)` abaixo: hook depois de saída antecipada muda a
  // ordem dos hooks entre renderizações e quebra o componente justamente
  // quando o lead some -- que é um dos momentos em que este cleanup precisa
  // rodar. O `typingRef` é copiado aqui dentro porque o objeto é estável (só
  // os campos dele mudam), então a cópia é a mesma referência que o cleanup
  // usaria depois.
  const typingAtual = typingRef.current;
  useEffect(() => {
    return () => {
      if (typingAtual.pauseTimer) { clearTimeout(typingAtual.pauseTimer); typingAtual.pauseTimer = null; }
      if (!typingAtual.lastTypingAt) return; // não estava digitando: nada a desfazer
      typingAtual.lastTypingAt = 0;
      enviarPresence(conversaDoCanal?.phone, "paused");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaDoCanal?.phone]);

  // Janela de 24h. O corte sai do banco, e não das mensagens já carregadas,
  // pelo mesmo motivo do Multiatendimento: o que está no estado guarda a hora
  // formatada para exibição ("14:07"), que não dá para comparar com precisão de
  // 24 horas. A consulta é por `conversation_id`, não por telefone: o mesmo
  // contato pode ter falado numa OUTRA linha, e uma mensagem que chegou lá não
  // abre a janela desta.
  useEffect(() => {
    if (conexaoAtiva?.provider !== "cloud_api") { setJanela("aberta"); return; }
    if (conversaDoCanal === undefined) { setJanela("carregando"); return; }
    // Sem conversa, o contato nunca escreveu por aqui: não existe janela para
    // estar aberta, e a Meta recusa texto livre do mesmo jeito.
    if (conversaDoCanal === null) { setJanela("fechada"); return; }

    let cancelado = false;
    // "carregando" só na PRIMEIRA checagem desta conversa. Nas revalidações
    // (toda mensagem nova dispara uma) o veredito anterior continua valendo até
    // o novo chegar -- senão o campo piscaria desabilitado a cada mensagem
    // enviada, bem no meio de quem está escrevendo em sequência.
    if (conversaVerificadaRef.current !== conversaDoCanal.id) {
      conversaVerificadaRef.current = conversaDoCanal.id;
      setJanela("carregando");
    }
    (async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("conversation_id", conversaDoCanal.id)
        .eq("from_me", false)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelado) return;
      // Falha de leitura libera o campo em vez de travá-lo: aqui já sabemos que
      // a conversa existe, então bloquear por causa de um erro nosso tiraria do
      // atendente uma mensagem que provavelmente passaria.
      if (error) { console.warn("janela de 24h:", error.message); setJanela("aberta"); return; }
      const ultima = data?.[0]?.created_at as string | undefined;
      const fechaEm = ultima ? new Date(ultima).getTime() + 24 * 60 * 60_000 : 0;
      setJanela(fechaEm > Date.now() ? "aberta" : "fechada");
    })();
    return () => { cancelado = true; };
    // `messages.length` entra de propósito: mensagem nova do cliente chegando
    // pelo realtime reabre a janela, e o campo precisa destravar na hora.
  }, [conexaoAtiva?.provider, conversaDoCanal, messages.length]);

  if (!lead) return null;

  const janelaFechada = janela === "fechada";
  // Enquanto a verificação corre, o campo fica travado: liberar por otimismo
  // deixaria a pessoa escrever num intervalo em que ainda não sabemos se a
  // mensagem pode sair.
  const naoPodeEscrever = janela !== "aberta";

  // Como chamar a linha por onde a mensagem passou. Linha desligada ou apagada
  // some de `whatsappConnections`, e aí só sobra o identificador interno, que
  // não diz nada a quem lê -- melhor dizer o que aconteceu com ela.
  const nomeDaLinha = (instanceId: string) => {
    const c = whatsappConnections.find(k => k.instanceId === instanceId);
    if (!c) return "um número removido";
    return c.name?.trim() || c.phone || "linha sem nome";
  };

  const etiquetaDeOrigem = etiquetasDeOrigem(messages, nomeDaLinha);

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
    // Anexo pela Cloud API cai na mesma regra do texto: fora da janela de 24h a
    // Meta recusa mídia também.
    if (naoPodeEscrever) {
      if (janelaFechada) toast.error("Passaram 24h sem mensagem deste contato. Use Modelos para retomar a conversa.");
      return;
    }

    const contactPhone = lead.whatsapp;
    if (!contactPhone || contactPhone === "—") {
      toast.error("Este lead não tem WhatsApp cadastrado.");
      return;
    }
    const inst = conexaoAtiva;
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

      // A mesma bolha que vai aparecer depois de recarregar (imagem com
      // miniatura, arquivo com link), e não um texto "📎 nome.pdf" que só
      // existia enquanto a janela ficasse aberta.
      setMessages(prev => [...prev, {
        from: "agent",
        author: nomeAtendente,
        time: nowTime(),
        kind: ehImagem ? "image" : "file",
        text: file.name,
        mediaUrl,
        instanceId: inst.instanceId,
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
    const inst = conexaoAtiva;
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

  // O que "Copiar" põe na área de transferência. Mesmos rótulos do
  // Multiatendimento: em áudio o `text` é vazio, e copiar o vazio faria o botão
  // dizer "Mensagem copiada" sem copiar nada.
  const textoDaMensagem = (m: ChatMsg) => {
    if (m.kind === "image") return m.text || "🖼️ Imagem";
    if (m.kind === "file")  return `📎 ${m.text}`;
    if (m.kind === "audio") return "🎤 Mensagem de áudio";
    return m.text;
  };

  const copiarMensagem = async (m: ChatMsg) => {
    // A área de transferência pode recusar (Safari é rígido com o gesto). Sem o
    // catch a falha seria silenciosa: a pessoa acha que copiou e cola outra coisa.
    try {
      await navigator.clipboard.writeText(textoDaMensagem(m));
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e use Cmd+C.");
    }
  };

  // Indicador "digitando..." no aparelho do lead, a mesma mecânica que o
  // Multiatendimento já usava e que faltava aqui: quem escrevia pela janela
  // flutuante não aparecia digitando para o cliente.
  //
  // Só D-API. A Z-API não expõe envio de presence, e a Cloud API amarra o
  // indicador ao id de uma mensagem recebida em vez de oferecer um interruptor
  // livre. Best-effort de ponta a ponta: falhar aqui não pode atrapalhar o
  // envio nem virar aviso na tela, já que a função é só humanizar a conversa.
  //
  // Recebe o telefone em vez de ler do closure porque quem chama na limpeza
  // precisa encerrar o indicador do lead ANTERIOR, não do atual. E o telefone
  // que entra aqui é sempre o do CANAL (ver `conversaDoCanal`): mandar o do
  // cadastro devolve 200 e não acende nada.
  function enviarPresence(telefone: string | null | undefined, state: "typing" | "paused") {
    const inst = conexaoAtiva;
    if (inst?.provider !== "dapi" || !inst.token || !telefone) return;
    fetch("https://api.d-api.cloud/api/v1/chats/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": inst.token },
      body: JSON.stringify({ sessionId: inst.instanceId, to: telefone.replace(/\D/g, ""), presence: state }),
    }).catch(e => console.warn("enviarPresence:", e));
  }

  // Chamado a cada tecla. Manda "typing" no máximo uma vez a cada 3s e agenda
  // "paused" para 4s de inatividade.
  function handleTypingActivity() {
    const t = typingRef.current;
    const agora = Date.now();
    if (agora - t.lastTypingAt > 3000) {
      t.lastTypingAt = agora;
      enviarPresence(conversaDoCanal?.phone, "typing");
    }
    if (t.pauseTimer) clearTimeout(t.pauseTimer);
    t.pauseTimer = setTimeout(() => {
      enviarPresence(conversaDoCanal?.phone, "paused");
      t.lastTypingAt = 0;
    }, 4000);
  }

  const handleSend = async () => {
    if (!draft.trim()) return;
    // Trava também aqui, e não só no campo: o texto sai por Enter, por clique e
    // pelo emoji, e é a Meta que recusa no fim da linha.
    if (naoPodeEscrever) {
      if (janelaFechada) toast.error("Passaram 24h sem mensagem deste contato. Use Modelos para retomar a conversa.");
      return;
    }
    const text = draft.trim();
    // A mensagem já está saindo, então não faz sentido seguir anunciando
    // digitação: o "paused" evita que o indicador fique aceso ao lado de uma
    // mensagem que o cliente já recebeu.
    if (typingRef.current.pauseTimer) { clearTimeout(typingRef.current.pauseTimer); typingRef.current.pauseTimer = null; }
    if (typingRef.current.lastTypingAt) {
      typingRef.current.lastTypingAt = 0;
      enviarPresence(conversaDoCanal?.phone, "paused");
    }
    // Adiciona à UI imediatamente (otimista)
    const newMsg: ChatMsg = {
      from: "agent", author: nomeAtendente, time: nowTime(), kind: "text", text,
      instanceId: conexaoAtiva?.instanceId ?? null,
      // Na hora, não só depois de recarregar: no Multiatendimento essa mesma
      // omissão fez a resposta aparecer como mensagem comum para quem acabou de
      // enviá-la, enquanto no celular chegava certa.
      citacao: citando?.messageId ? { messageId: citando.messageId, preview: textoDaMensagem(citando).slice(0, 300) } : null,
    };
    setMessages(prev => [...prev, newMsg]);
    setDraft("");

    // Tira da tela a bolha que acabou de entrar e devolve o texto ao campo.
    //
    // Faltava: quando o envio era recusado (janela de 24h fechada, conexão fora
    // do ar, lead sem telefone), a mensagem continuava lá como se tivesse ido, e
    // o texto se perdia junto. O pior dos dois mundos -- ninguém recebeu, e quem
    // escreveu não tem como saber nem como recuperar o que escreveu.
    //
    // A comparação é por identidade do objeto: ele só é substituído no caminho
    // de sucesso, quando o realtime adota a bolha pendente. O campo só é
    // reescrito se estiver vazio, para não apagar o que já foi digitado depois.
    const desfazerEnvio = () => {
      setMessages(prev => prev.filter(m => m !== newMsg));
      setDraft(d => (d.trim() ? d : text));
    };

    // Envia pela linha da conversa (ver `conexaoAtiva`), a mesma que o
    // cabeçalho anuncia e que a janela de 24h usa para decidir.
    // Suporta os 3 provedores (D-API/Z-API/Cloud API), igual ao
    // Multiatendimento -- antes só existia o caminho Z-API, em cima de
    // campos (company.zapi_*) que não são mais escritos desde a migração
    // pro modelo de múltiplas conexões, então o envio nunca funcionava.
    const contactPhone = lead.whatsapp;
    if (!user || !company || !contactPhone || contactPhone === "—") {
      desfazerEnvio();
      if (!contactPhone || contactPhone === "—") toast.error("Este lead não tem WhatsApp cadastrado.");
      return;
    }

    const inst = conexaoAtiva;
    if (!inst) {
      desfazerEnvio();
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

      if (!sendOk) { desfazerEnvio(); return; }

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
      desfazerEnvio();
      toast.error("Falha ao enviar mensagem via WhatsApp");
    }
  };

  // Envio de MODELO aprovado, o único caminho com a janela de 24h fechada.
  //
  // Espelha o `enviarModelo` do Multiatendimento: mesmo payload (type
  // "template", com nome, idioma e componentes) e mesma regra de gravar no
  // banco o texto RESOLVIDO, não o modelo cru -- quem abrir a conversa depois
  // precisa ler a mensagem que o cliente recebeu, não "{{1}} às {{2}}".
  const enviarModelo = async (modelo: Modelo, valores: Record<string, string>, textoResolvido: string) => {
    const inst = conexaoAtiva;
    if (!inst?.token) { toast.error("Conexão sem token."); return; }
    // Preferir o telefone do canal: ele veio do JID que o WhatsApp mandou, e o
    // do cadastro costuma estar sem o código do país. Para modelo isso pesa
    // mais que no texto comum -- é a primeira mensagem depois de um silêncio,
    // sem conversa aberta para o provedor se apoiar.
    const cleanPhone = (conversaDoCanal?.phone ?? lead.whatsapp ?? "").replace(/\D/g, "");
    if (!cleanPhone || !user || !company) { toast.error("Este lead não tem WhatsApp cadastrado."); return; }

    setEnviandoModelo(true);
    try {
      const numeradas = Object.keys(valores).sort((a, b) => Number(a) - Number(b));
      const res = await fetch(`https://graph.facebook.com/v21.0/${inst.instanceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${inst.token}` },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleanPhone,
          type: "template",
          template: {
            name: modelo.name,
            language: { code: modelo.language },
            ...(numeradas.length
              ? { components: [{ type: "body", parameters: numeradas.map(n => ({ type: "text", text: valores[n] })) }] }
              : {}),
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Erro ao enviar modelo: ${(err as { error?: { message?: string } }).error?.message ?? res.status}`);
        return;
      }
      const idNoProvedor = await lerIdDoEnvio(res, "cloud-api");
      if (idNoProvedor) jaEnviadasPorMim.current.add(idNoProvedor);

      setMessages(prev => [...prev, { from: "agent", author: nomeAtendente, time: nowTime(), kind: "text", text: textoResolvido, instanceId: inst.instanceId }]);

      let conversationId: string | null = conversaDoCanal?.id ?? null;
      try {
        conversationId = await upsertConversationForMessage(supabase, {
          ownerId: company.owner_id,
          companyId: company.id,
          instanceId: inst.instanceId,
          phone: cleanPhone,
          name: lead.name,
          preview: previewLabelFor("text", textoResolvido),
          fromMe: true,
        });
      } catch (e) {
        console.error("[chat-flutuante] não consegui criar/achar a conversa do modelo:", e);
      }

      const { error } = await supabase.from("whatsapp_messages").insert({
        owner_id:    company.owner_id,
        company_id:  company.id,
        instance_id: inst.instanceId,
        phone:       cleanPhone,
        from_me:     true,
        body:        textoResolvido,
        type:        "text",
        momment:     Date.now(),
        sender_name: nomeAtendente,
        message_id:  idNoProvedor,
        conversation_id: conversationId,
      });
      if (error) toast.error("Modelo enviado, mas houve erro ao salvar no histórico.");

      // O modelo enviado NÃO reabre a janela: quem reabre é a resposta do
      // cliente. Por isso o campo de texto continua travado depois daqui.
      else toast.success("Modelo enviado");
      setModelosAbertos(false);
    } catch {
      toast.error("Falha ao enviar o modelo.");
    } finally {
      setEnviandoModelo(false);
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
          {/* Active indicator -- também com a foto, para a bolinha da barra
              casar com o rosto do cabeçalho da janela que ela representa. */}
          <div
            className="rounded-full overflow-hidden"
            style={{
              width: 32,
              height: 32,
              border: "2px solid #128A68",
            }}
            title={lead.name}
          >
            <ConvAvatar name={lead.name} avatarUrl={avatarDoLead} size={28} fontSize={11} />
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
          {/* A foto do contato, não só as iniciais. A busca por ela já existia
              (avatarDoLead) e só alimentava as bolhas das mensagens, então o
              cabeçalho desenhava iniciais mesmo com a foto carregada na mesma
              tela -- e o Multiatendimento, ao lado, mostrava o rosto.

              ConvAvatar cuida das duas coisas que um <img> aqui não cuidaria:
              cai para as iniciais quando não há foto e, quando a URL do
              WhatsApp expira (elas expiram, param oe=), avisa para buscar
              outra em vez de deixar um quadrado quebrado. */}
          <ConvAvatar
            name={lead.name}
            avatarUrl={avatarDoLead}
            size={32}
            fontSize={11}
            style={{ marginRight: 0 }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="truncate"
              style={{ fontSize: 14, fontWeight: 600, color: "#111", lineHeight: 1.2 }}
              title={lead.name}
            >
              {lead.name}
            </div>
            {/* Qual número está falando com o contato. Com mais de uma linha
                conectada, quem escreve daqui não tinha como saber por qual
                delas a mensagem sairia -- e a escolha é feita em código (a 1ª
                conexão ativa), não pelo atendente. */}
            <div
              className="flex items-center gap-2 truncate"
              style={{ fontSize: 11, color: "#AAAAAA", lineHeight: 1.2 }}
            >
              {/* "via" na frente porque, sozinho, o número da linha seria lido
                  como o número do CONTATO -- que é o outro número da tela. */}
              <span className="truncate" title={conexaoAtiva ? `Enviando pela linha ${nomeDaConexao}` : "Nenhuma conexão de WhatsApp ativa"}>
                {conexaoAtiva ? `via ${nomeDaConexao}` : "Sem conexão"}
              </span>
              {/* Abre esta mesma conversa no Multiatendimento, onde estão o
                  histórico completo e as ações do atendimento. Antes o rótulo
                  era "Ver no pipeline →" e o clique abria o drawer do lead:
                  nem ia para o pipeline, nem para a conversa. */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  navigate("/multiatendimento", conversaDoCanal ? { state: { openConvId: conversaDoCanal.id } } : undefined);
                }}
                className="hover:underline shrink-0"
                style={{ color: "#128A68", fontWeight: 500 }}
                title={conversaDoCanal ? "Abrir esta conversa no Multiatendimento" : "Abrir o Multiatendimento"}
              >
                Multiatendimento →
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* O botão "Lida" saiu daqui. Ele tinha onClick={e => e.stopPropagation()}
                e mais nada: não marcava coisa nenhuma, em nenhuma das duas
                camadas. Um controle que não faz o que promete é pior que a
                ausência dele, porque quem clica acredita ter marcado. */}
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
                  const origem = etiquetaDeOrigem[i];

                  // Aviso do CRM, não fala de ninguém: faixa no meio, sem
                  // bolha, sem avatar e sem menu. Mesmo tratamento da outra
                  // tela, onde ele já não se disfarçava de mensagem do cliente.
                  if (m.kind === "system") {
                    return (
                      <div key={i} className="flex justify-center">
                        <span style={{
                          fontSize: 11, color: "#767676", background: "#EFEFEF",
                          borderRadius: 10, padding: "4px 10px", textAlign: "center",
                          maxWidth: "90%", overflowWrap: "anywhere",
                        }}>
                          {m.text}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <Fragment key={i}>
                    {/* De onde vem o trecho a seguir. Sem isto, a conversa do
                        número antigo e a do atual apareciam coladas, como se
                        fossem um papo só -- e quem responde acha que a pessoa
                        recebeu, no número de agora, algo que ela recebeu no
                        anterior. */}
                    {origem && (
                      <div className="flex justify-center" style={{ margin: "4px 0" }}>
                        <span
                          title="As mensagens abaixo passaram por esta linha"
                          style={{
                            fontSize: 10, color: "#767676", background: "#EFEFEF",
                            borderRadius: 10, padding: "3px 10px", maxWidth: "90%",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          via {origem}
                        </span>
                      </div>
                    )}
                    <div
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
                          {m.apagadaEm ? (
                            <span style={{ fontStyle: "italic", opacity: 0.75 }}>Mensagem apagada</span>
                          ) : m.kind === "audio" ? (
                            <AudioBubble duration={m.duracao ?? ""} src={m.mediaUrl ?? undefined} light={!isLead} />
                          ) : m.kind === "image" ? (
                            <div style={{ overflow: "hidden", borderRadius: 10 }}>
                              {m.mediaUrl ? (
                                // Abre em tamanho real numa aba: dentro de uma
                                // janela de 360px, a miniatura não serve para ler
                                // um comprovante nem um print de conversa.
                                <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" title="Abrir imagem">
                                  <img src={m.mediaUrl} alt={m.text || "imagem"} style={{ maxWidth: 180, maxHeight: 150, display: "block", objectFit: "cover", cursor: "zoom-in" }} />
                                </a>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <ImageIcon size={16} color={isLead ? "#128A68" : "rgba(255,255,255,0.85)"} />
                                  <span>{m.text || "Imagem"}</span>
                                </div>
                              )}
                              {m.mediaUrl && m.text && (
                                <div style={{ paddingTop: 4, fontSize: 12, color: isLead ? "#666" : "rgba(255,255,255,0.85)", maxWidth: 180 }}>
                                  {m.text}
                                </div>
                              )}
                            </div>
                          ) : m.kind === "file" ? (
                            m.mediaUrl ? (
                              <a
                                href={m.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={m.text}
                                title={`Baixar ${m.text}`}
                                style={{ display: "flex", alignItems: "center", gap: 8, color: "inherit", textDecoration: "none" }}
                              >
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: isLead ? "#F0F0F0" : "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <Download size={15} color={isLead ? "#128A68" : "#FFF"} />
                                </div>
                                <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "underline" }}>{m.text}</span>
                              </a>
                            ) : (
                              // Mensagem antiga, gravada antes de guardarmos o
                              // arquivo: mostra o nome e diz por que não baixa,
                              // em vez de oferecer um link que não leva a nada.
                              <div title="Arquivo indisponível para download" style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.7 }}>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: isLead ? "#F0F0F0" : "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <FolderOpen size={15} color={isLead ? "#128A68" : "#FFF"} />
                                </div>
                                <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</span>
                              </div>
                            )
                          ) : (
                            m.text
                          )}
                        </div>
                        {/* Botões que a automação ofereceu com esta mensagem.
                            Registro, não controle: quem clica é o contato, no
                            WhatsApp dele. Sem aparência de clicável de
                            propósito, senão o atendente responderia no lugar
                            do cliente. Mesma decisão do Multiatendimento. */}
                        {!m.apagadaEm && m.botoes && m.botoes.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 3, width: "100%" }}>
                            {m.botoes.map((rotulo, bi) => (
                              <div key={bi} style={{
                                fontSize: 11, color: "#128A68", background: "#FFF",
                                border: "1px solid #D6E9E2", borderRadius: 8,
                                padding: "5px 8px", textAlign: "center",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                              }}>
                                <CornerUpLeft size={11} />
                                <span style={{ overflowWrap: "anywhere" }}>{rotulo}</span>
                              </div>
                            ))}
                          </div>
                        )}
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
                    </Fragment>
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
                {textoDaMensagem(citando)}
              </div>
            </div>
            <button onClick={() => setCitando(null)} title="Cancelar resposta"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}>
              <X size={12} color="#888" />
            </button>
          </div>
        )}

        {/* Footer
            `minHeight` no lugar de `height`: com altura fixa, o campo que
            cresce vazava para fora da janela em vez de empurrar a barra -- a
            última linha do que estava sendo escrito ficava atrás da borda.

            `items-end` alinha anexo, emoji e enviar pela base, para os botões
            acompanharem a última linha em vez de flutuarem no meio do campo. */}
        <div
          className="flex items-end gap-2 border-t shrink-0 relative"
          style={{
            minHeight: 52,
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
            disabled={enviandoArquivo || naoPodeEscrever}
            title={janelaFechada ? "Passaram 24h sem mensagem do contato — só um modelo aprovado retoma a conversa" : "Anexar"}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary disabled:opacity-50"
            aria-label="Anexar"
          >
            <Paperclip size={16} style={{ color: enviandoArquivo ? "#128A68" : "#AAAAAA" }} />
          </button>
          <button
            onClick={() => setShowEmoji(v => !v)}
            disabled={naoPodeEscrever}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary disabled:opacity-50"
            aria-label="Emoji"
          >
            <Smile size={16} style={{ color: showEmoji ? "#128A68" : "#AAAAAA" }} />
          </button>
          {/* Modelos aprovados da Meta. Só na conexão oficial, porque é a única
              com a regra de janela de 24h. Fica sempre disponível, e não só com
              a janela fechada: às vezes o atendente quer usar um texto pronto
              mesmo podendo escrever livre. Mesmo critério do Multiatendimento. */}
          {conexaoAtiva?.provider === "cloud_api" && (
            <button
              onClick={() => { setModelosAbertos(v => !v); setShowEmoji(false); }}
              title="Modelos aprovados pela Meta"
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary"
              aria-label="Modelos aprovados"
            >
              <FileText size={16} style={{ color: modelosAbertos || janelaFechada ? "#128A68" : "#AAAAAA" }} />
            </button>
          )}
          {modelosAbertos && (
            <>
              <div onClick={() => setModelosAbertos(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
              <div style={{ position: "absolute", bottom: "100%", left: 8, right: 8, background: "#FFF", border: "1px solid #E5E5E5", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden" }}>
                <div style={{ padding: "12px 14px 10px" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Modelos aprovados</span>
                  <p style={{ fontSize: 11, color: "#888", marginTop: 3, lineHeight: 1.4 }}>
                    {janelaFechada
                      ? "Passaram 24h sem mensagem deste contato. Pelo WhatsApp oficial, só um modelo aprovado pela Meta retoma a conversa."
                      : "Textos aprovados pela Meta. Vão direto ao contato, sem edição."}
                  </p>
                </div>
                <div style={{ height: 1, background: "#EEEEEE" }} />
                <div style={{ padding: 12 }}>
                  <WhatsappTemplatePicker
                    wabaId={conexaoAtiva?.wabaId ?? null}
                    token={conexaoAtiva?.token ?? ""}
                    enviando={enviandoModelo}
                    onEnviar={(m, v, texto) => { void enviarModelo(m, v, texto); }}
                  />
                </div>
              </div>
            </>
          )}
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
          {/* Textarea que cresce, não input de uma linha. Com <input> o texto
              rolava para fora pela esquerda: quem escrevia um parágrafo perdia
              de vista o começo do que tinha escrito, sem jeito de reler antes
              de enviar. Mesmo defeito e mesma correção do Multiatendimento.

              Shift+Enter quebra linha, Enter envia -- o padrão de quem escreve
              em chat, e o que a outra tela já faz. */}
          <textarea
            ref={campoMensagemRef}
            rows={1}
            value={draft}
            onChange={e => { setDraft(e.target.value); handleTypingActivity(); }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            /* Janela fechada: o campo sai de operação e o texto explica o
               porquê e o caminho. Deixar a caixa liberada seria convidar a
               pessoa a escrever uma mensagem inteira para receber a recusa da
               Meta depois de mandar -- que era exatamente o que acontecia. */
            placeholder={
              janela === "carregando" ? "Verificando se a conversa aceita mensagem…"
              : janelaFechada ? "Passaram 24h sem mensagem do contato — use Modelos para retomar"
              : "Mensagem..."
            }
            disabled={naoPodeEscrever}
            className="flex-1 bg-transparent outline-none border-none min-w-0"
            style={{
              fontSize: 13, fontFamily: "Inter, sans-serif", color: "#111",
              lineHeight: "18px", padding: 0, resize: "none", overflowY: "auto",
              // Teto menor que o do Multiatendimento (200px): a janela toda tem
              // 520px de altura, então 200 comeriam quase metade da conversa.
              maxHeight: ALTURA_MAX_MENSAGEM,
              opacity: naoPodeEscrever ? 0.5 : 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || naoPodeEscrever}
            className="flex items-center justify-center transition-colors shrink-0"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: draft.trim() && !naoPodeEscrever ? "#0F6E56" : "#E5E5E5",
              color: draft.trim() && !naoPodeEscrever ? "#FFFFFF" : "#AAAAAA",
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
