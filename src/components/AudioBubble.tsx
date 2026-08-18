// Player de áudio das bolhas de conversa.
//
// Morava dentro do MultiatendimentoPage. Saiu de lá quando o chat flutuante
// passou a exibir mídia: o flutuante mostrava áudio como bolha vazia, e a saída
// preguiçosa seria colar um <audio controls> lá -- dois players diferentes para
// a mesma mensagem, em duas telas do mesmo produto. Aqui é um só.
//
// O componente é autocontido de propósito (sem contexto, sem supabase): recebe
// a fonte e a duração e desenha. Quem sabe de onde veio o áudio é quem chama.

import { useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

function Waveform({ light, progress = 0 }: { light: boolean; progress?: number }) {
  const heights = [6, 10, 14, 8, 16, 12, 18, 10, 6, 12, 14, 8, 16, 10, 6];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
      {heights.map((h, i) => {
        const played = (i + 1) / heights.length <= progress;
        return <div key={i} style={{ width: 2, height: h, background: light ? "#FFF" : "#128A68", opacity: progress > 0 ? (played ? 1 : 0.35) : (light ? 1 : 0.4), borderRadius: 1, transition: "opacity 0.1s" }} />;
      })}
    </div>
  );
}

export function AudioBubble({ duration, src, light }: { duration: string; src?: string; light: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const fg = light ? "#FFF" : "#128A68";

  const fmt = (s: number) =>
    (isFinite(s) && s > 0)
      ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`
      : (duration || "00:00");

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => {}); }
    else { a.pause(); setPlaying(false); }
  };

  const progress = dur > 0 ? Math.min(1, cur / dur) : 0;
  // Mostra o tempo decorrido enquanto toca; senão a duração total (ou a legada)
  const label = src ? fmt((playing || cur > 0) ? cur : dur) : (duration || "00:00");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: light ? "transparent" : "#F5F5F5", padding: light ? 0 : "6px 10px", borderRadius: 10 }}>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={e => {
            const a = e.currentTarget;
            if (isFinite(a.duration)) { setDur(a.duration); return; }
            // WebM do MediaRecorder não traz a duração no header → o browser
            // reporta Infinity e o player ficava em 00:00. Truque padrão: seek
            // para um tempo enorme força o cálculo; durationchange entrega o
            // valor real e voltamos ao início.
            const onDur = () => {
              if (isFinite(a.duration) && a.duration > 0) {
                setDur(a.duration);
                a.currentTime = 0;
                a.removeEventListener("durationchange", onDur);
              }
            };
            a.addEventListener("durationchange", onDur);
            a.currentTime = 1e10;
          }}
          onTimeUpdate={e => { const t = e.currentTarget.currentTime; if (isFinite(t) && t < 1e9) setCur(t); }}
          onEnded={() => { setPlaying(false); setCur(0); }}
          style={{ display: "none" }}
        />
      )}
      <button
        onClick={toggle}
        disabled={!src}
        title={src ? (playing ? "Pausar" : "Reproduzir") : "Áudio indisponível"}
        style={{ width: 32, height: 32, borderRadius: "50%", background: light ? "rgba(255,255,255,0.3)" : "#128A68", color: "#FFF", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: src ? "pointer" : "default", flexShrink: 0, opacity: src ? 1 : 0.6 }}
      >
        {playing ? <Pause size={14} fill="#FFF" /> : <Play size={14} fill="#FFF" />}
      </button>
      <Waveform light={light} progress={progress} />
      <span style={{ fontSize: 11, color: fg, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{label}</span>
    </div>
  );
}
