import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gravarMensagemVinculada } from "@/lib/gravarMensagem";

type Resposta = { error: { code?: string; message: string } | null };
type Chamada = { tabela: string; op: "insert" | "update"; dados: Record<string, unknown> };

/**
 * Cliente falso com o pedaço da API que a gravação e upsertConversationForMessage usam.
 * `mensagens` são as respostas, em ordem, dos inserts em whatsapp_messages.
 */
function clienteFalso(cfg: {
  mensagens: Resposta[];
  conversaDoContato?: { id: string } | null;
  erroAoCriarConversa?: Resposta["error"];
}) {
  const chamadas: Chamada[] = [];
  const cliente = {
    from(tabela: string) {
      let op: "select" | "insert" | "update" = "select";
      const construtor = {
        select: () => construtor,
        eq: () => construtor,
        in: () => construtor,
        limit: () => construtor,
        insert(dados: Record<string, unknown>) { op = "insert"; chamadas.push({ tabela, op, dados }); return construtor; },
        update(dados: Record<string, unknown>) { op = "update"; chamadas.push({ tabela, op, dados }); return construtor; },
        maybeSingle: () => Promise.resolve({ data: cfg.conversaDoContato ?? null, error: null }),
        then(ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) {
          let r: Resposta = { error: null };
          if (tabela === "whatsapp_messages" && op === "insert") r = cfg.mensagens.shift() ?? { error: null };
          if (tabela === "whatsapp_conversations" && op === "insert") r = { error: cfg.erroAoCriarConversa ?? null };
          return Promise.resolve(r).then(ok, falha);
        },
      };
      return construtor;
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, chamadas };
}

const enviada = {
  id: "msg-1", owner_id: "dono", company_id: "empresa", instance_id: "linha-9897",
  phone: "5534992614374", from_me: true, body: "oi", type: "text",
};
const semConversa = { code: "23503", message: "violates foreign key constraint" };
const mensagensGravadas = (c: Chamada[]) => c.filter(x => x.tabela === "whatsapp_messages");

describe("gravarMensagemVinculada", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("grava vinculada quando a conversa da tela existe", async () => {
    const { cliente, chamadas } = clienteFalso({ mensagens: [{ error: null }] });
    const r = await gravarMensagemVinculada(cliente, enviada, "conversa-da-tela");
    expect(r).toEqual({ error: null, conversationId: "conversa-da-tela" });
    expect(mensagensGravadas(chamadas)).toHaveLength(1);
  });

  it("conversa da tela não existe: grava na conversa do contato que já está no banco", async () => {
    const { cliente, chamadas } = clienteFalso({
      mensagens: [{ error: semConversa }, { error: null }],
      conversaDoContato: { id: "conversa-real" },
    });
    const r = await gravarMensagemVinculada(cliente, enviada, "id-do-lead", "Fulano");
    expect(r.conversationId).toBe("conversa-real");
    const gravadas = mensagensGravadas(chamadas);
    expect(gravadas).toHaveLength(2);
    expect(gravadas[1].dados.conversation_id).toBe("conversa-real");
    expect(chamadas.some(c => c.tabela === "whatsapp_conversations" && c.op === "insert")).toBe(false);
  });

  it("conversa da tela não existe e o contato não tem nenhuma: cria pela linha e grava nela", async () => {
    const { cliente, chamadas } = clienteFalso({ mensagens: [{ error: semConversa }, { error: null }] });
    const r = await gravarMensagemVinculada(cliente, enviada, "id-do-lead", "Fulano");
    const criada = chamadas.find(c => c.tabela === "whatsapp_conversations" && c.op === "insert");
    expect(criada?.dados).toMatchObject({ owner_id: "dono", instance_id: "linha-9897", phone: "5534992614374", name: "Fulano" });
    expect(r.conversationId).toBe(criada?.dados.id);
    expect(mensagensGravadas(chamadas)[1].dados.conversation_id).toBe(criada?.dados.id);
  });

  it("evento de sistema não cria conversa: grava sem vínculo, como antes", async () => {
    const { cliente, chamadas } = clienteFalso({ mensagens: [{ error: semConversa }, { error: null }] });
    const r = await gravarMensagemVinculada(cliente, { ...enviada, from_me: false, type: "system" }, "id-velho");
    expect(r.conversationId).toBeNull();
    expect(chamadas.some(c => c.tabela === "whatsapp_conversations")).toBe(false);
    expect(mensagensGravadas(chamadas)[1].dados.conversation_id).toBeNull();
  });

  it("sem achar nem conseguir criar a conversa, a mensagem não se perde", async () => {
    const { cliente, chamadas } = clienteFalso({
      mensagens: [{ error: semConversa }, { error: null }],
      erroAoCriarConversa: { code: "42501", message: "permissão negada" },
    });
    const r = await gravarMensagemVinculada(cliente, enviada, "id-do-lead");
    expect(r).toEqual({ error: null, conversationId: null });
    expect(mensagensGravadas(chamadas)[1].dados.conversation_id).toBeNull();
  });

  it("outro erro volta como veio, sem segunda tentativa", async () => {
    const recusa = { code: "42501", message: "permissão negada" };
    const { cliente, chamadas } = clienteFalso({ mensagens: [{ error: recusa }] });
    const r = await gravarMensagemVinculada(cliente, enviada, "conversa-da-tela");
    expect(r.error).toEqual(recusa);
    expect(mensagensGravadas(chamadas)).toHaveLength(1);
  });
});
