// Baixa uma imagem de conversa como ARQUIVO, para o atendente salvar no
// computador (dono, 27/10/2026).
//
// O navegador não consegue fazer isso sozinho: as fotos recebidas moram no
// Backblaze/S3 dos provedores de WhatsApp, que não liberam leitura para outra
// origem (CORS), e o atributo `download` do <a> é ignorado em link de outro
// domínio. O resultado era o botão "Baixar" abrir a foto numa aba nova.
// Passando por aqui, a resposta sai do domínio do CRM com
// `Content-Disposition: attachment`, e o navegador salva o arquivo.
//
// Não é um repassador genérico: só aceita as origens de mídia que existem na
// base (conferidas em whatsapp_messages.media_url em 27/10/2026) e só devolve
// imagem. Sem essa trava, qualquer um usaria o domínio do CRM para buscar
// qualquer endereço da internet. A mesma lista existe no cliente, em
// src/components/VisualizadorDeImagem.tsx; mudou uma, mude a outra.

export const config = { runtime: "edge" };

const ORIGENS_PERMITIDAS = [
  "https://f004.backblazeb2.com/file/temp-file-download/",   // Z-API
  "https://s3.us-east-005.backblazeb2.com/d-api-media/",     // D-API
  "https://d-api-media.s3.sa-east-1.amazonaws.com/",         // D-API, legado
  "https://adhjmwkgyxrpsohufqob.supabase.co/storage/",       // mídia enviada pelo CRM
];

// Foto de WhatsApp passa pouco de 5 MB; o teto só impede usar a função para
// arrastar arquivo grande pelo domínio do CRM.
const TAMANHO_MAXIMO = 25 * 1024 * 1024;

/** Nome seguro para o cabeçalho: sem barra, aspas ou quebra de linha. */
function limparNome(nome: string): string {
  const limpo = nome.replace(/[\\/"\r\n]/g, "_").trim().slice(0, 120);
  return limpo || "imagem.jpg";
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const params = new URL(req.url).searchParams;
  const alvo = params.get("url") ?? "";
  const nome = limparNome(params.get("nome") ?? "");

  // Compara pela URL já interpretada, e não pelo texto cru: "https://f004...@outro.com"
  // ou "..%2F.." passariam num startsWith ingênuo.
  let normalizada: string;
  try {
    const u = new URL(alvo);
    if (u.username || u.password) throw new Error("credencial na URL");
    normalizada = u.href;
  } catch {
    return new Response("URL inválida", { status: 400 });
  }
  if (!ORIGENS_PERMITIDAS.some((origem) => normalizada.startsWith(origem))) {
    return new Response("Origem não permitida", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(normalizada);
  } catch {
    return new Response("Falha ao buscar a imagem", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Imagem indisponível", { status: upstream.status === 404 ? 404 : 502 });
  }

  const tipo = upstream.headers.get("content-type") ?? "";
  // Os provedores às vezes servem foto como octet-stream; aceita esse caso
  // e marca como jpeg, que é o formato do WhatsApp.
  const ehImagem = tipo.startsWith("image/");
  if (!ehImagem && !tipo.startsWith("application/octet-stream")) {
    return new Response("Não é uma imagem", { status: 415 });
  }
  const tamanho = Number(upstream.headers.get("content-length") ?? "0");
  if (tamanho > TAMANHO_MAXIMO) {
    return new Response("Arquivo grande demais", { status: 413 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": ehImagem ? tipo : "image/jpeg",
      // filename= só aceita ASCII no cabeçalho; o nome com acento vai no filename*.
      "Content-Disposition": `attachment; filename="${nome.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
