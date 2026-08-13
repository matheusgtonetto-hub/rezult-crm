import { describe, it, expect } from "vitest";
import {
  somenteDigitos,
  normalizarTelefoneBr,
  telefonesIguais,
  variantesDeTelefone,
} from "@/lib/telefone";

// Estes testes existem porque a normalização de telefone é a chave que liga
// lead, contato, conversa e mensagem. Quando ela erra, o sintoma nunca é um
// erro na tela: é uma conversa duplicada, um histórico que some, um arquivo
// que não aparece. Bug silencioso precisa de rede de segurança automática.

describe("somenteDigitos", () => {
  it("descarta máscara e mantém a ordem", () => {
    expect(somenteDigitos("+55 (48) 99115-2442")).toBe("5548991152442");
  });

  it("aceita nulo sem quebrar", () => {
    expect(somenteDigitos(null)).toBe("");
    expect(somenteDigitos(undefined)).toBe("");
  });
});

describe("normalizarTelefoneBr", () => {
  it("reduz as quatro formas do mesmo celular ao mesmo núcleo", () => {
    const nucleo = "4891152442";
    expect(normalizarTelefoneBr("+5548991152442")).toBe(nucleo); // país + nono
    expect(normalizarTelefoneBr("5548 91152442")).toBe(nucleo);  // país, sem nono
    expect(normalizarTelefoneBr("48991152442")).toBe(nucleo);    // nono, sem país
    expect(normalizarTelefoneBr("4891152442")).toBe(nucleo);     // nu
  });

  it("preserva DDD 55, que não é código de país", () => {
    // Santa Maria/RS. Sem o guarda de comprimento, o "55" da frente seria
    // confundido com o código do Brasil e o número viraria outro cliente.
    expect(normalizarTelefoneBr("5533334444")).toBe("5533334444");
    expect(normalizarTelefoneBr("55933334444")).toBe("5533334444");
    expect(normalizarTelefoneBr("555533334444")).toBe("5533334444");
  });

  it("não tira o nono de fixo que começa com 9 no terceiro dígito", () => {
    // 10 dígitos nunca perde dígito: a regra do nono só vale para 11.
    expect(normalizarTelefoneBr("1139999999")).toBe("1139999999");
  });

  it("devolve o que sobrou quando não parece brasileiro", () => {
    expect(normalizarTelefoneBr("123")).toBe("123");
    expect(normalizarTelefoneBr("")).toBe("");
  });
});

describe("telefonesIguais", () => {
  it("casa o mesmo número gravado em formatos diferentes", () => {
    expect(telefonesIguais("+55 48 99115-2442", "4891152442")).toBe(true);
    expect(telefonesIguais("5548991152442", "48991152442")).toBe(true);
  });

  it("separa números diferentes", () => {
    expect(telefonesIguais("48991152442", "48991152443")).toBe(false);
  });

  it("recusa afirmar com número curto demais", () => {
    // Trecho de número casaria com muita gente. Responder "sim" aqui juntaria
    // conversas de clientes distintos na mesma thread.
    expect(telefonesIguais("91152442", "91152442")).toBe(false);
    expect(telefonesIguais("", "")).toBe(false);
  });
});

describe("variantesDeTelefone", () => {
  it("cobre as quatro formas que o banco tem de verdade", () => {
    expect(new Set(variantesDeTelefone("+5548991152442"))).toEqual(
      new Set(["4891152442", "48991152442", "554891152442", "5548991152442"]),
    );
  });

  it("chega no mesmo conjunto partindo de qualquer formato", () => {
    const doCompleto = new Set(variantesDeTelefone("5548991152442"));
    const doNu = new Set(variantesDeTelefone("4891152442"));
    expect(doNu).toEqual(doCompleto);
  });

  it("não inventa variante para número curto", () => {
    expect(variantesDeTelefone("123")).toEqual(["123"]);
    expect(variantesDeTelefone("")).toEqual([]);
  });

  it("não repete quando as formas coincidem", () => {
    const v = variantesDeTelefone("4891152442");
    expect(v.length).toBe(new Set(v).size);
  });
});
