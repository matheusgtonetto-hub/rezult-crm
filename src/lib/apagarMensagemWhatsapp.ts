import type { ConexaoWhatsapp } from "@/lib/enviarArquivoWhatsapp";

// Apagar mensagem no WhatsApp, para todos.
//
// A cobertura NÃO é uniforme entre provedores, e essa diferença é decisão de
// plataforma, não nossa:
//
//   D-API ....... DELETE /chats/messages/{id}, com forEveryone
//   Z-API ....... DELETE /messages, com owner=true
//   Cloud API ... NÃO EXISTE. A Meta não permite apagar mensagem já enviada
//                 pela API oficial, em nenhuma circunstância.
//
// Por isso a tela mostra o item desabilitado nas linhas oficiais, com a
// explicação ao passar o mouse: é melhor dizer por que não dá do que esconder
// a opção e deixar a pessoa procurando.

/** Erro com mensagem em português, para a tela poder mostrar direto. */
export class ApagarNaoSuportado extends Error {}

export async function apagarMensagemWhatsapp(params: {
  messageId: string;
  telefone: string;
  conexao: ConexaoWhatsapp;
}): Promise<void> {
  const { messageId, telefone, conexao } = params;
  const digitos = telefone.replace(/\D/g, "");

  if (conexao.provider === "cloud_api") {
    throw new ApagarNaoSuportado(
      "A API oficial do WhatsApp não permite apagar mensagens já enviadas.",
    );
  }

  if (conexao.provider === "dapi") {
    // O exemplo da documentação usa JID ("5511...@s.whatsapp.net"), mas os
    // endpoints de ENVIO desta mesma API aceitam o telefone puro -- e a doc não
    // afirma qual dos dois o delete espera.
    //
    // Em vez de escolher no escuro e descobrir num teste falho, tenta os dois e
    // registra qual funcionou. Uma tentativa a mais custa milissegundos; um
    // "apagar" que falha em silêncio custa a confiança na função inteira.
    const formatos = [`${digitos}@s.whatsapp.net`, digitos];
    let ultimoErro = "";
    for (const to of formatos) {
      const r = await fetch(`https://api.d-api.cloud/api/v1/chats/messages/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": conexao.token },
        body: JSON.stringify({ sessionId: conexao.instanceId, to, forEveryone: true }),
      });
      if (r.ok) {
        console.info(`[apagar] d-api aceitou o formato "${to.includes("@") ? "JID" : "telefone puro"}"`);
        return;
      }
      ultimoErro = (await r.text().catch(() => "")).slice(0, 160) || String(r.status);
    }
    throw new Error(ultimoErro);
  }

  // Z-API. Formato conforme a convenção deles (owner=true significa "apagar
  // para todos"). Não verificado contra uma instância real: nenhuma conexão
  // Z-API ativa aqui hoje, e o erro do provedor aparece para quem clicar.
  const url = new URL(`https://api.z-api.io/instances/${conexao.instanceId}/token/${conexao.token}/messages`);
  url.searchParams.set("messageId", messageId);
  url.searchParams.set("phone", digitos);
  url.searchParams.set("owner", "true");
  const r = await fetch(url.toString(), {
    method: "DELETE",
    headers: conexao.clientToken ? { "Client-Token": conexao.clientToken } : {},
  });
  if (!r.ok) throw new Error((await r.text().catch(() => "")).slice(0, 160) || String(r.status));
}
