declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * `eventId` é o que deixa a Meta deduplicar o mesmo evento quando ele chega por
 * dois caminhos: pelo pixel, no navegador, e pela Conversions API, no servidor.
 * Com o mesmo id nos dois, conta uma vez só. Sem id, conta duas.
 */
export function pixelTrack(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window.fbq !== "function") return;
  if (eventId) {
    window.fbq("track", event, params ?? {}, { eventID: eventId });
  } else {
    window.fbq("track", event, params ?? {});
  }
}
