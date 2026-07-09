import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { TriangleAlert, X } from "lucide-react";

interface Props {
  resource: string;
  onClose: () => void;
}

export function PlanLimitModal({ resource, onClose }: Props) {
  const navigate = useNavigate();

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        pointerEvents: "all",
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        style={{
          background: "hsl(var(--card))",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          width: "100%",
          maxWidth: 360,
          margin: "0 16px",
        }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header vermelho */}
        <div style={{ position: "relative", padding: "16px 20px", background: "#EF4444" }}>
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.8)",
              display: "flex",
              alignItems: "center",
              padding: 2,
            }}
          >
            <X size={18} />
          </button>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginTop: 2,
            }}>
              <TriangleAlert size={18} color="#fff" />
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>
                Limite do plano atingido
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 }}>
                Você atingiu o limite de {resource}
              </div>
            </div>
          </div>
        </div>

        {/* Corpo */}
        <div style={{ padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 8 }}>
            Continue crescendo
          </div>
          <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.55 }}>
            Para continuar adicionando {resource}, atualize seu plano e desbloqueie recursos avançados.
          </p>

          <button
            onClick={() => { navigate("/configuracoes/planos"); onClose(); }}
            style={{
              marginTop: 20,
              width: "100%",
              height: 40,
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "hsl(var(--primary))",
              border: "none",
              cursor: "pointer",
            }}
          >
            Atualizar plano
          </button>

          <button
            onClick={onClose}
            style={{
              marginTop: 10,
              width: "100%",
              background: "none",
              border: "none",
              fontSize: 13,
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              padding: "4px 0",
            }}
          >
            Continuar com meu plano atual
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
