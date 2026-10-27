// Imagem de conversa aberta em tela cheia, com download.
//
// No Multiatendimento a foto ficava presa na miniatura de 220px: não dava para
// ampliar nem baixar, e print de comprovante ou de documento é justamente o
// que o atendente precisa ler e guardar (dono, 27/10/2026).
//
// Usa o Dialog do Radix direto, e não o DialogContent do sistema: aquele é um
// cartão branco com padding, e aqui a imagem precisa ocupar a tela sobre um
// fundo escuro. O Radix já entrega o que importa num visualizador: Esc fecha,
// o foco fica preso dentro e a página atrás não rola.

import { useState, type CSSProperties } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, Loader2, X } from "lucide-react";

export type ImagemAberta = { src: string; legenda?: string };

/**
 * Nome do arquivo baixado: o da própria URL quando ela tem um, senão
 * "imagem-AAAA-MM-DD" com a extensão do tipo que veio. URL de dado (base64)
 * não tem nome, e chamar tudo de "download" deixa a pasta ilegível.
 */
function nomeDoArquivo(src: string, tipo: string): string {
  if (!src.startsWith("data:")) {
    try {
      const ultimo = new URL(src).pathname.split("/").pop() ?? "";
      if (/\.[a-z0-9]{2,5}$/i.test(ultimo)) return decodeURIComponent(ultimo);
    } catch { /* URL inválida: cai no nome gerado */ }
  }
  const ext = (tipo.split("/")[1] ?? "jpg").replace("jpeg", "jpg").split(/[+;]/)[0];
  return `imagem-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/**
 * Origens que o /api/baixar-midia aceita. É a mesma lista de lá
 * (api/baixar-midia.ts); mudou uma, mude a outra. Fica duplicada porque o
 * cliente precisa saber ANTES de navegar: mandar uma URL de fora para a
 * função trocaria o download por uma página de erro.
 */
const ORIGENS_DO_PROXY = [
  "https://f004.backblazeb2.com/file/temp-file-download/",
  "https://s3.us-east-005.backblazeb2.com/d-api-media/",
  "https://d-api-media.s3.sa-east-1.amazonaws.com/",
  "https://adhjmwkgyxrpsohufqob.supabase.co/storage/",
];

function clicarEmDownload(href: string, nome: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Salva a imagem no computador, em vez de só abrir.
 *
 * O atributo `download` do <a> é ignorado em URL de outra origem. Então:
 *
 * 1. Tenta buscar direto e salvar como blob local. Funciona com o Storage
 *    do Supabase, que libera a leitura.
 * 2. As fotos recebidas moram no Backblaze/S3 dos provedores de WhatsApp,
 *    que não liberam (CORS). Para essas, passa pelo /api/baixar-midia, que
 *    devolve a foto do domínio do CRM marcada como anexo: o navegador salva
 *    sem sair da tela. Essa função só existe na Vercel; no `npm run dev`
 *    a rota não roda, e aí vale o passo 3.
 * 3. Último recurso: abre numa aba nova, de onde ainda dá para salvar.
 */
async function baixar(src: string) {
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(String(resp.status));
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    clicarEmDownload(url, nomeDoArquivo(src, blob.type || "image/jpeg"));
    // Solta o blob depois do clique; revogar na hora pode cancelar o download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  } catch { /* sem CORS: segue para o proxy */ }

  if (!import.meta.env.DEV && ORIGENS_DO_PROXY.some((o) => src.startsWith(o))) {
    const nome = nomeDoArquivo(src, "image/jpeg");
    clicarEmDownload(`/api/baixar-midia?url=${encodeURIComponent(src)}&nome=${encodeURIComponent(nome)}`, nome);
    return;
  }

  window.open(src, "_blank", "noopener,noreferrer");
}

const BOTAO: CSSProperties = {
  width: 40, height: 40, borderRadius: 999, border: "none",
  background: "rgba(255,255,255,0.14)", color: "#FFF",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
};

export function VisualizadorDeImagem({ imagem, onFechar }: { imagem: ImagemAberta | null; onFechar: () => void }) {
  const [baixando, setBaixando] = useState(false);

  const aoBaixar = async () => {
    if (!imagem || baixando) return;
    setBaixando(true);
    try { await baixar(imagem.src); } finally { setBaixando(false); }
  };

  return (
    <DialogPrimitive.Root open={!!imagem} onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogPrimitive.Portal>
        {/* Fundo quase preto nos dois temas: foto se lê melhor sobre escuro,
            e é o que o próprio WhatsApp faz. */}
        <DialogPrimitive.Overlay style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.88)" }} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onClick={onFechar}
          style={{
            position: "fixed", inset: 0, zIndex: 61, outline: "none",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 12, padding: "64px 16px 24px",
          }}
        >
          <DialogPrimitive.Title className="sr-only">Imagem da conversa</DialogPrimitive.Title>

          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={aoBaixar} title="Baixar imagem" aria-label="Baixar imagem" style={BOTAO} disabled={baixando}>
              {baixando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            </button>
            <DialogPrimitive.Close asChild>
              <button type="button" title="Fechar" aria-label="Fechar" style={BOTAO}>
                <X size={18} />
              </button>
            </DialogPrimitive.Close>
          </div>

          {imagem && (
            <>
              {/* Clique na imagem não fecha: quem clica nela quer olhar, não sair. */}
              <img
                src={imagem.src}
                alt={imagem.legenda || "Imagem da conversa"}
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "100%", maxHeight: imagem.legenda ? "calc(100% - 64px)" : "100%", objectFit: "contain", borderRadius: 8, display: "block" }}
              />
              {imagem.legenda && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth: 640, color: "#FFF", fontSize: 14, lineHeight: 1.4, textAlign: "center", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 52, overflowY: "auto" }}
                >
                  {imagem.legenda}
                </div>
              )}
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
