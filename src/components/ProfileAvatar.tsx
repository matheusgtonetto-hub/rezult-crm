import { useState, useEffect } from "react";
import { tintaSobre } from "@/lib/contraste";
import { colorFromString } from "@/lib/iniciais";

export { colorFromString };

// Mesmo algoritmo de cor/iniciais usado em ConvAvatar (MultiatendimentoPage)
// -- extraído aqui pra ser reaproveitado em LeadDetailPage e PipelinePage.
export function initialsOf(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/**
 * `bg` existe porque o fundo do avatar às vezes é dado, e não hash: no kanban
 * ele leva a cor da etapa, escolhida pelo usuário. Antes isso chegava por
 * `style={{ backgroundColor }}`, e o componente calculava a tinta para a cor do
 * hash enquanto pintava outra cor por cima -- a inicial branca acabava sobre
 * âmbar e laranja, em 2,1:1.
 *
 * Com `bg`, o fundo e a tinta saem da mesma fonte.
 */
export function ProfileAvatar({ name, avatarUrl, size, onError, style, bg }: { name: string; avatarUrl?: string; size: number; onError?: () => void; style?: React.CSSProperties; bg?: string }) {
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
  const fundo = bg || colorFromString(name);
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: fundo, color: tintaSobre(fundo), display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, flexShrink: 0, ...style }}>
      {initialsOf(name)}
    </div>
  );
}
