import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export interface FloatingChatState {
  leadId: string;
  minimized: boolean;
  unread?: boolean;
  /**
   * Linha escolhida ao abrir (o seletor "Enviar via WhatsApp" do card do
   * Pipeline). Vale para contato SEM conversa; com conversa, manda a linha
   * dela, igual ao Multiatendimento.
   */
  linha?: string;
}

interface FloatingChatContextType {
  windows: FloatingChatState[];
  openChat: (leadId: string, linha?: string) => void;
  closeChat: (leadId: string) => void;
  minimizeChat: (leadId: string) => void;
  restoreChat: (leadId: string) => void;
}

const FloatingChatContext = createContext<FloatingChatContextType | null>(null);

export function useFloatingChat() {
  const ctx = useContext(FloatingChatContext);
  if (!ctx) throw new Error("useFloatingChat must be within FloatingChatProvider");
  return ctx;
}

const MAX_WINDOWS = 3;

export function FloatingChatProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<FloatingChatState[]>([]);

  // Abrir o chat não cria conversa em lugar nenhum: ela nasce no primeiro envio
  // (FloatingChatWindow, upsertConversationForMessage), como em qualquer canal.
  const openChat = useCallback((leadId: string, linha?: string) => {
    setWindows(prev => {
      const exists = prev.find(w => w.leadId === leadId);
      const others = prev.filter(w => w.leadId !== leadId).map(w => ({ ...w, minimized: true }));
      const next = exists
        ? [...others, { ...exists, minimized: false, unread: false, ...(linha ? { linha } : {}) }]
        : [...others, { leadId, minimized: false, linha }];
      if (next.length > MAX_WINDOWS) {
        const minimizedIdx = next.findIndex(w => w.minimized);
        if (minimizedIdx >= 0) next.splice(minimizedIdx, 1);
        else next.shift();
      }
      return next;
    });
  }, []);

  const closeChat = useCallback((leadId: string) => {
    setWindows(prev => prev.filter(w => w.leadId !== leadId));
  }, []);

  const minimizeChat = useCallback((leadId: string) => {
    setWindows(prev => prev.map(w => (w.leadId === leadId ? { ...w, minimized: true } : w)));
  }, []);

  const restoreChat = useCallback((leadId: string) => {
    setWindows(prev =>
      prev.map(w =>
        w.leadId === leadId
          ? { ...w, minimized: false, unread: false }
          : { ...w, minimized: true }
      )
    );
  }, []);

  return (
    <FloatingChatContext.Provider value={{ windows, openChat, closeChat, minimizeChat, restoreChat }}>
      {children}
    </FloatingChatContext.Provider>
  );
}
