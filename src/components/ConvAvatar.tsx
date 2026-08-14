import { useEffect, useState } from "react";
import { corDoTexto, iniciais } from "@/lib/iniciais";

// Foto redonda de contato ou atendente, com iniciais coloridas como reserva.
//
// Vivia dentro do MultiatendimentoPage. Saiu de lá quando o chat flutuante
// precisou mostrar as mesmas bolinhas: copiar significaria dois lugares para
// arrumar quando a URL da foto do WhatsApp mudar de comportamento -- e ela já
// muda sozinha, porque expira.

export function ConvAvatar({
  name, avatarUrl, size, fontSize, style, onError,
}: {
  name: string;
  avatarUrl?: string;
  size: number;
  fontSize: number;
  style?: React.CSSProperties;
  onError?: () => void;
}) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [avatarUrl]);

  if (avatarUrl && !err) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        // URLs de foto do WhatsApp expiram (param oe=). Ao falhar, avisa o pai
        // para buscar uma URL nova e mostra as iniciais nesse meio-tempo.
        onError={() => { setErr(true); onError?.(); }}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0, ...style }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: corDoTexto(name), color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 700, flexShrink: 0, ...style,
    }}>
      {iniciais(name)}
    </div>
  );
}
