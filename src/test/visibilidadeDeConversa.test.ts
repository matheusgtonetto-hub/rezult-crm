import { describe, it, expect } from "vitest";
import { conversaVisivelPara, departamentosQueAlcanco } from "@/lib/visibilidadeDeConversa";

/*
 * Esta regra passou a servir dois lugares (a lista de conversas e o contador de
 * não lidas no ícone da barra), e os dois têm que responder igual. Os casos
 * abaixo são os que já mudaram de comportamento durante o desenho e que, se
 * voltarem atrás sem querer, escondem trabalho de alguém.
 */

const base = {
  isAdmin: false,
  currentUserName: "Ana Paula",
  meusDepartamentos: ["suporte"],
  totalDeDepartamentos: 3,
  allowSeeOthers: false,
  hideUnassigned: false,
};

describe("conversaVisivelPara", () => {
  it("admin vê tudo, inclusive de outro departamento e de outra pessoa", () => {
    expect(conversaVisivelPara(
      { departmentId: "comercial", assignedTo: "Carlos" },
      { ...base, isAdmin: true },
    )).toBe(true);
  });

  it("esconde conversa de departamento que não é meu", () => {
    expect(conversaVisivelPara({ departmentId: "comercial" }, base)).toBe(false);
  });

  it("mostra conversa do meu departamento", () => {
    expect(conversaVisivelPara({ departmentId: "suporte" }, base)).toBe(true);
  });

  it("conversa atribuída a mim aparece mesmo fora do meu departamento", () => {
    expect(conversaVisivelPara(
      { departmentId: "comercial", assignedTo: "Ana Paula" },
      base,
    )).toBe(true);
  });

  it("conversa do meu negócio aparece mesmo fora do meu departamento", () => {
    expect(conversaVisivelPara({ departmentId: "comercial" }, base, true)).toBe(true);
  });

  it("com um único departamento na empresa, o filtro não aperta", () => {
    expect(conversaVisivelPara(
      { departmentId: "comercial" },
      { ...base, totalDeDepartamentos: 1 },
    )).toBe(true);
  });

  it("conversa de outra pessoa só aparece com allowSeeOthers", () => {
    const conversa = { departmentId: "suporte", assignedTo: "Carlos" };
    expect(conversaVisivelPara(conversa, base)).toBe(false);
    expect(conversaVisivelPara(conversa, { ...base, allowSeeOthers: true })).toBe(true);
  });

  it("conversa sem dono some quando hideUnassigned está ligado", () => {
    const conversa = { departmentId: "suporte" };
    expect(conversaVisivelPara(conversa, base)).toBe(true);
    expect(conversaVisivelPara(conversa, { ...base, hideUnassigned: true })).toBe(false);
  });
});

describe("departamentosQueAlcanco", () => {
  const eu = "user-1";

  it("departamento sem ninguém definido é de todos", () => {
    expect(departamentosQueAlcanco(
      [{ id: "d1", attendants: [], attendant_ids: [] }],
      eu, "Ana Paula",
    )).toEqual(["d1"]);
  });

  it("casa por id de perfil", () => {
    expect(departamentosQueAlcanco(
      [{ id: "d1", attendants: ["Outro"], attendant_ids: [eu] },
       { id: "d2", attendants: ["Outro"], attendant_ids: ["user-2"] }],
      eu, "Ana Paula",
    )).toEqual(["d1"]);
  });

  it("cai no nome quando o departamento ainda não tem ids, ignorando caixa e espaços", () => {
    expect(departamentosQueAlcanco(
      [{ id: "d1", attendants: ["  ana paula "], attendant_ids: [] }],
      eu, "Ana Paula",
    )).toEqual(["d1"]);
  });

  it("o id manda sobre o nome: quem se renomeou continua dentro", () => {
    // O perfil virou "Ana P.", mas o departamento ainda guarda o nome antigo.
    expect(departamentosQueAlcanco(
      [{ id: "d1", attendants: ["Ana Paula"], attendant_ids: [eu] }],
      eu, "Ana P.",
    )).toEqual(["d1"]);
  });
});
