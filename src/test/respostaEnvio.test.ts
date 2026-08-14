import { describe, it, expect } from "vitest";
import { extrairIdDaResposta, descreverResposta } from "@/lib/respostaEnvio";

// O id devolvido no envio é pré-requisito de citação, exclusão e encaminhamento.
// Se um provedor mudar o formato da resposta, nada quebra em compilação: o id
// volta nulo e a mensagem é gravada sem ele, exatamente como acontecia antes --
// calado. Estes testes fixam os formatos conhecidos.

describe("extrairIdDaResposta", () => {
  it("Cloud API: messages[0].id", () => {
    expect(extrairIdDaResposta({
      messaging_product: "whatsapp",
      contacts: [{ input: "554891152442", wa_id: "554891152442" }],
      messages: [{ id: "wamid.HBgNNTU0ODkxMTUyNDQyFQ" }],
    })).toBe("wamid.HBgNNTU0ODkxMTUyNDQyFQ");
  });

  it("Z-API: messageId no topo", () => {
    expect(extrairIdDaResposta({ zaapId: "3999", messageId: "3EB0ABC", id: "3EB0ABC" })).toBe("3EB0ABC");
  });

  it("D-API: arranjos plausíveis, já que a resposta não é documentada", () => {
    expect(extrairIdDaResposta({ data: { id: "3EB0D266A77" } })).toBe("3EB0D266A77");
    expect(extrairIdDaResposta({ data: { messageId: "3EB0XYZ" } })).toBe("3EB0XYZ");
    expect(extrairIdDaResposta({ key: { id: "3EB0KEY" } })).toBe("3EB0KEY");
    expect(extrairIdDaResposta({ data: { key: { id: "3EB0DK" } } })).toBe("3EB0DK");
  });

  it("id numérico vira texto, porque a coluna é text", () => {
    expect(extrairIdDaResposta({ id: 987654 })).toBe("987654");
  });

  it("devolve nulo quando não acha, em vez de inventar", () => {
    for (const r of [{}, null, undefined, { ok: true }, { messages: [] }, { id: "" }]) {
      expect(extrairIdDaResposta(r)).toBeNull();
    }
  });
});

describe("descreverResposta", () => {
  it("mostra as chaves, que é o que revela o formato no log", () => {
    expect(descreverResposta({ data: { id: "X" }, ok: true })).toContain("chaves=[data,ok]");
  });

  it("corta corpo longo, porque log não guarda payload inteiro", () => {
    const d = descreverResposta({ texto: "y".repeat(2000) });
    expect(d.length).toBeLessThan(400);
  });

  it("não quebra com valor não serializável", () => {
    const circular: Record<string, unknown> = {};
    circular.eu = circular;
    expect(() => descreverResposta(circular)).not.toThrow();
  });
});
