import { useState, useEffect } from "react";

// Mesmo algoritmo de cor/iniciais usado em ConvAvatar (MultiatendimentoPage)
// -- extraído aqui pra ser reaproveitado em LeadDetailPage e PipelinePage.
export function colorFromString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 55% 50%)`;
}

export function initialsOf(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export function ProfileAvatar({ name, avatarUrl, size, onError, style }: { name: string; avatarUrl?: string; size: number; onError?: () => void; style?: React.CSSProperties }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [avatarUrl]);
  if (avatarUrl && !err) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        // URLs de foto do WhatsApp expiram (param oe=) -- ao falhar, mostra as
        // iniciais e avisa o pai pra tentar buscar uma URL nova.
        onError={() => { setErr(true); onError?.(); }}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0, ...style }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: colorFromString(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0, ...style }}>
      {initialsOf(name)}
    </div>
  );
}
