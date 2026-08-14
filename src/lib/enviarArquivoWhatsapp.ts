import { supabase } from "@/lib/supabase";

// Envio de arquivo por WhatsApp: sobe para o storage e entrega pelo provedor da
// conexão. Uma implementação só, usada pelo Multiatendimento e pelo chat
// flutuante.
//
// Vivia dentro de handleFileSelect no MultiatendimentoPage, com noventa linhas
// de diferença entre Cloud API, D-API e Z-API embutidas no meio da função de
// interface. Saiu de lá quando o chat flutuante precisou da mesma coisa: copiar
// isso seria criar a próxima divergência, e as diferenças entre provedores são
// justamente onde ninguém lembra de aplicar a correção duas vezes.
//
// O que NÃO entrou aqui de propósito: bolha otimista, toast e gravação no
// histórico. Cada tela faz isso do seu jeito (o Multiatendimento tem conversa em
// contexto, o chat flutuante não), e misturar interface com transporte é o que
// deixava esse código impossível de reaproveitar.

export interface ConexaoWhatsapp {
  provider?: "zapi" | "dapi" | "cloud_api" | string;
  instanceId: string;
  token: string;
  clientToken?: string | null;
}

export interface ResultadoEnvioArquivo {
  /** URL pública do arquivo, ou null quando o upload falhou mas o envio deu certo (só Z-API). */
  mediaUrl: string | null;
  ehImagem: boolean;
  /**
   * Preenchido quando o arquivo foi entregue ao contato mas NÃO ficou salvo no
   * storage. É importante avisar: o destinatário recebe normalmente, e quem
   * abrir a conversa depois não consegue mais baixar. Sem esse aviso o envio
   * parece ter dado certo por inteiro.
   */
  avisoUpload?: string;
}

/**
 * Sobe o arquivo e envia. Lança em qualquer falha de entrega, para o chamador
 * decidir o que mostrar; não emite toast nem mexe em estado de tela.
 */
export async function enviarArquivoWhatsapp(params: {
  file: File;
  telefone: string;
  conexao: ConexaoWhatsapp;
  /** Usado só para montar o caminho no storage, separando por usuário. */
  userId: string;
}): Promise<ResultadoEnvioArquivo> {
  const { file, telefone, conexao, userId } = params;
  const ehImagem = file.type.startsWith("image/");

  // Storage primeiro. Sem isso a mensagem fica sem media_url e, ao recarregar a
  // conversa, o arquivo não pode mais ser baixado no chat -- ele só existiria
  // no WhatsApp do destinatário.
  let mediaUrl: string | null = null;
  let avisoUpload: string | undefined;
  try {
    const nomeSeguro = file.name.replace(/[^\w.-]+/g, "_");
    const caminho = `${userId}/file-${Date.now()}-${nomeSeguro}`;
    const { error: erroUpload } = await supabase.storage
      .from("automation-media")
      .upload(caminho, file, { upsert: true, contentType: file.type || "application/octet-stream" });
    if (erroUpload) {
      console.error("[arquivo] upload storage:", erroUpload);
      avisoUpload = erroUpload.message;
    } else {
      mediaUrl = supabase.storage.from("automation-media").getPublicUrl(caminho).data.publicUrl;
    }
  } catch (e) {
    console.error("[arquivo] upload storage:", e);
    avisoUpload = String(e);
  }

  // D-API e Cloud API recebem uma URL no corpo da requisição; sem o upload não
  // há o que enviar. A Z-API aceita base64, então ainda funciona.
  if ((conexao.provider === "cloud_api" || conexao.provider === "dapi") && !mediaUrl) {
    throw new Error("Falha ao preparar o arquivo para envio (upload)");
  }

  if (conexao.provider === "cloud_api") {
    const r = await fetch(`https://graph.facebook.com/v21.0/${conexao.instanceId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conexao.token}` },
      body: JSON.stringify(ehImagem
        ? { messaging_product: "whatsapp", to: telefone, type: "image", image: { link: mediaUrl } }
        : { messaging_product: "whatsapp", to: telefone, type: "document", document: { link: mediaUrl, filename: file.name } }),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}));
      throw new Error((corpo as { error?: { message?: string } }).error?.message ?? String(r.status));
    }
  } else if (conexao.provider === "dapi") {
    const caminho = ehImagem ? "image" : "document";
    const r = await fetch(`https://api.d-api.cloud/api/v1/messages/send/${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": conexao.token },
      body: JSON.stringify(ehImagem
        ? { sessionId: conexao.instanceId, to: telefone, image: mediaUrl }
        : { sessionId: conexao.instanceId, to: telefone, document: mediaUrl, fileName: file.name }),
    });
    if (!r.ok) {
      const texto = await r.text().catch(() => "");
      throw new Error(texto.slice(0, 120) || String(r.status));
    }
  } else {
    // Z-API aceita base64 direto. A URI completa ("data:image/jpeg;base64,...")
    // é exigida por eles: mandar só a parte base64 falha.
    const dataUri = await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result as string);
      leitor.onerror = reject;
      leitor.readAsDataURL(file);
    });
    // send-document exige a extensão no caminho (/send-document/pdf).
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const endpoint = ehImagem ? "send-image" : `send-document/${ext}`;
    const corpo = ehImagem
      ? { phone: telefone, image: dataUri, caption: file.name }
      : { phone: telefone, document: dataUri, fileName: file.name };
    const r = await fetch(
      `https://api.z-api.io/instances/${conexao.instanceId}/token/${conexao.token}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(conexao.clientToken ? { "Client-Token": conexao.clientToken } : {}) },
        body: JSON.stringify(corpo),
      },
    );
    if (!r.ok) {
      const erro = await r.json().catch(() => ({}));
      throw new Error((erro as { error?: string }).error ?? String(r.status));
    }
  }

  return { mediaUrl, ehImagem, avisoUpload };
}
