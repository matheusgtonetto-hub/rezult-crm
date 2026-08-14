import { describe, it, expect } from "vitest";
import { extrairCitacao } from "../../supabase/functions/_shared/upsert-conversation.ts";

// Este extrator lê o bloco de citação de três provedores que batizaram a mesma
// coisa de jeitos diferentes. É lógica pura sobre JSON que vem de fora, ou seja:
// quando um deles mudar um nome de campo, nada quebra em compilação e nada
// aparece no log -- a citação simplesmente para de ser gravada, calada.
// Teste é a única coisa que grita nesse caso.

describe("extrairCitacao — D-API", () => {
  it("lê id e texto de context_info", () => {
    const c = extrairCitacao({
      id: "ABC123",
      message: "não, esse aqui",
      context_info: {
        quoted_message_id: "MSG_ORIGINAL_1",
        participant: "5548999999999@s.whatsapp.net",
        quoted_message: { body: "Podemos marcar terça às 15h?", type: "text" },
      },
    });
    expect(c.replyToMessageId).toBe("MSG_ORIGINAL_1");
    expect(c.replyToPreview).toBe("Podemos marcar terça às 15h?");
  });

  it("aceita stanza_id quando não vem quoted_message_id", () => {
    const c = extrairCitacao({ context_info: { stanza_id: "STANZA_9" } });
    expect(c.replyToMessageId).toBe("STANZA_9");
    expect(c.replyToPreview).toBeNull();
  });
});

describe("extrairCitacao — Cloud API (Meta)", () => {
  it("lê o id de context, e aceita não vir texto", () => {
    // A Meta manda só o id da mensagem citada. O texto não vem, e é esperado:
    // a bolha resolve buscando pelo id na própria base.
    const c = extrairCitacao({
      id: "wamid.HBgN...",
      type: "text",
      context: { from: "554891152442", id: "wamid.ORIGINAL" },
    });
    expect(c.replyToMessageId).toBe("wamid.ORIGINAL");
    expect(c.replyToPreview).toBeNull();
  });
});

describe("extrairCitacao — Z-API", () => {
  it("lê referenceMessageId no nível de cima", () => {
    const c = extrairCitacao({ referenceMessageId: "ZAPI_REF_7", referenceMessageBody: "obrigado!" });
    expect(c.replyToMessageId).toBe("ZAPI_REF_7");
    expect(c.replyToPreview).toBe("obrigado!");
  });
});

describe("extrairCitacao — quando não há citação", () => {
  it("devolve nulos para mensagem comum, que é a maioria", () => {
    const c = extrairCitacao({ id: "X", message: "oi" });
    expect(c.replyToMessageId).toBeNull();
    expect(c.replyToPreview).toBeNull();
  });

  it("não quebra com payload vazio, nulo ou indefinido", () => {
    for (const entrada of [{}, null, undefined]) {
      const c = extrairCitacao(entrada);
      expect(c.replyToMessageId).toBeNull();
      expect(c.replyToPreview).toBeNull();
    }
  });
});

describe("extrairCitacao — bordas", () => {
  it("converte id numérico para texto, porque a coluna é text", () => {
    const c = extrairCitacao({ context_info: { quoted_message_id: 12345 } });
    expect(c.replyToMessageId).toBe("12345");
  });

  it("corta retrato longo em 300 caracteres", () => {
    // O retrato é para caber numa linha de citação. Sem o corte, uma mensagem
    // de 5 mil caracteres citada viraria uma segunda cópia do histórico dentro
    // da tabela de mensagens.
    const c = extrairCitacao({ context_info: { stanza_id: "A", quoted_message: { body: "x".repeat(5000) } } });
    expect(c.replyToPreview).toHaveLength(300);
  });

  it("id vazio conta como ausência, não como citação de id vazio", () => {
    const c = extrairCitacao({ context_info: { quoted_message_id: "" } });
    expect(c.replyToMessageId).toBeNull();
  });
});
