// Normaliza a duração do áudio para "MM:SS". Aceita já formatado ("01:23"),
// segundos puros ("83" → "01:23", como o WhatsApp/Z-API entrega no recebido)
// ou vazio quando desconhecido.
//
// Mora aqui, e não junto do AudioBubble, porque um arquivo que exporta
// componente e função solta quebra o hot reload do Vite (react-refresh).
export function parseAudioDuration(raw?: string | null): string {
  const b = (raw ?? "").trim();
  if (/^\d{1,2}:\d{2}$/.test(b)) return b;
  if (/^\d+$/.test(b)) {
    const s = parseInt(b, 10);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  return "";
}
