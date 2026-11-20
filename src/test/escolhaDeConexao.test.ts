import { describe, expect, it } from "vitest";
import { conexaoParaFoto, linhaPadrao } from "@/lib/escolhaDeConexao";

// A ordem é a do contexto: da mais antiga para a mais nova.
const oficial = { instanceId: "oficial", provider: "cloud_api", connected: true, active: true };
const dapi = { instanceId: "dapi", provider: "dapi", connected: true, active: true };
const zapi = { instanceId: "zapi", provider: "zapi", connected: true, active: true };
const desligada = { instanceId: "desligada", provider: "dapi", connected: false, active: true };
const inativa = { instanceId: "inativa", provider: "zapi", connected: true, active: false };

describe("linhaPadrao", () => {
  it("prefere a linha que aceita texto livre, mesmo a oficial sendo mais antiga", () => {
    expect(linhaPadrao([oficial, dapi])?.instanceId).toBe("dapi");
  });

  it("fica com a oficial quando ela é a única ativa", () => {
    expect(linhaPadrao([oficial, desligada])?.instanceId).toBe("oficial");
  });

  it("ignora conexão desconectada ou desativada", () => {
    expect(linhaPadrao([desligada, inativa, zapi])?.instanceId).toBe("zapi");
  });

  it("devolve undefined sem nenhuma ativa", () => {
    expect(linhaPadrao([desligada, inativa])).toBeUndefined();
  });

  it("conta como ativa a instância sem os campos de estado", () => {
    expect(linhaPadrao([{ instanceId: "x", provider: "dapi" }])?.instanceId).toBe("x");
  });
});

describe("conexaoParaFoto", () => {
  it("usa a linha da conversa quando ela fornece foto", () => {
    expect(conexaoParaFoto([dapi, zapi], "zapi")?.instanceId).toBe("zapi");
  });

  it("troca a oficial por outra linha, porque a oficial não fornece foto", () => {
    expect(conexaoParaFoto([oficial, dapi], "oficial")?.instanceId).toBe("dapi");
  });

  it("sem preferida, pega a primeira que fornece foto", () => {
    expect(conexaoParaFoto([oficial, desligada, zapi])?.instanceId).toBe("zapi");
  });

  it("devolve undefined quando só há a oficial", () => {
    expect(conexaoParaFoto([oficial])).toBeUndefined();
  });
});
