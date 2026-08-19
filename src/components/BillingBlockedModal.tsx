import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { TriangleAlert, X } from "lucide-react";

interface Props {
  onClose: () => void;
}

/**
 * Aviso de conta em somente leitura por pagamento em aberto.
 *
 * Irmão do PlanLimitModal, com uma diferença de intenção: ali o cliente esbarra
 * num limite e é convidado a crescer; aqui a cobrança falhou e ele precisa
 * regularizar. Por isso o texto não vende plano melhor, aponta o caminho do
 * pagamento e diz o que continua funcionando, para não parecer que os dados
 * sumiram.
 */
export function BillingBlockedModal({ onClose }: Props) {
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
          background: "#fff",
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
                Pagamento em aberto
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 }}>
                Sua conta está em modo somente leitura
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 8 }}>
            Regularize para voltar a usar
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.55 }}>
            A cobrança da sua mensalidade não foi aprovada. Seus dados continuam aqui e você
            pode consultar tudo normalmente, mas cadastros, edições e envios ficam pausados
            até o pagamento ser confirmado.
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
              background: "#128A68",
              border: "none",
              cursor: "pointer",
            }}
          >
            Regularizar pagamento
          </button>

          <button
            onClick={onClose}
            style={{
              marginTop: 10,
              width: "100%",
              background: "none",
              border: "none",
              fontSize: 13,
              color: "#6B7280",
              cursor: "pointer",
              padding: "4px 0",
            }}
          >
            Voltar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
