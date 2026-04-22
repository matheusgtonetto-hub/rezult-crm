import { useFloatingChat } from "@/context/FloatingChatContext";
import { useCRM } from "@/context/CRMContext";
import { FloatingChatWindow } from "./FloatingChatWindow";
import { WhatsAppIcon } from "./WhatsAppIcon";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join("")
    .toUpperCase();
}

export function FloatingChatManager() {
  const { windows, restoreChat, closeChat } = useFloatingChat();
  const { leads } = useCRM();

  const open = windows.filter(w => !w.minimized);
  const minimized = windows.filter(w => w.minimized);

  return (
    <>
      {open.map((w, i) => (
        <FloatingChatWindow key={w.leadId} leadId={w.leadId} index={i} total={open.length} />
      ))}

      {/* Minimized chips */}
      {minimized.length > 0 && (
        <div
          className="fixed flex gap-2"
          style={{ right: 24, bottom: 24, zIndex: 999 }}
        >
          {minimized.map(w => {
            const lead = leads[w.leadId];
            if (!lead) return null;
            return (
              <div
                key={w.leadId}
                className="flex items-center gap-2 bg-card border rounded-full pl-1 pr-3 py-1 cursor-pointer hover:shadow-elev-2 transition-shadow"
                style={{
                  borderColor: "#E5E5E5",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                }}
                onClick={() => restoreChat(w.leadId)}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white relative"
                  style={{ background: "#128A68" }}
                >
                  {getInitials(lead.name)}
                  {w.unread && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full animate-pulse"
                      style={{ background: "#25D366", border: "2px solid #FFF" }}
                    />
                  )}
                </div>
                <span
                  className="truncate max-w-[100px]"
                  style={{ fontSize: 12, color: "#111", fontWeight: 500 }}
                >
                  {lead.name}
                </span>
                <WhatsAppIcon size={12} />
                <button
                  onClick={e => {
                    e.stopPropagation();
                    closeChat(w.leadId);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
