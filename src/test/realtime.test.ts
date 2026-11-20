import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import {
  assinarComRecuperacao,
  ESPERA_INICIAL_PARA_RECRIAR_MS,
  ESPERA_MAXIMA_PARA_RECRIAR_MS,
  type ClienteDeRealtime,
} from "@/lib/realtime";

type Avisar = (status: REALTIME_SUBSCRIBE_STATES) => void;

interface CanalFalso {
  nome: string;
  avisar: Avisar;
  removido: boolean;
  objeto: RealtimeChannel;
}

function clienteFalso() {
  const canais: CanalFalso[] = [];
  const cliente: ClienteDeRealtime = {
    channel(nome) {
      const registro = { nome, avisar: () => {}, removido: false } as unknown as CanalFalso;
      const objeto = {
        subscribe(cb: Avisar) {
          registro.avisar = cb;
          return objeto;
        },
      } as unknown as RealtimeChannel;
      registro.objeto = objeto;
      canais.push(registro);
      return objeto;
    },
    removeChannel(canal) {
      const registro = canais.find(c => c.objeto === canal);
      if (registro) registro.removido = true;
    },
  };
  return { cliente, canais };
}

const { SUBSCRIBED, CLOSED, CHANNEL_ERROR, TIMED_OUT } = REALTIME_SUBSCRIBE_STATES;

describe("assinarComRecuperacao", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("não relê na primeira assinatura, relê uma vez quando volta depois de uma queda", () => {
    const { cliente, canais } = clienteFalso();
    const recuperar = vi.fn();
    assinarComRecuperacao(cliente, { nome: "teste", montar: c => c, recuperar });

    canais[0].avisar(SUBSCRIBED);
    expect(recuperar).not.toHaveBeenCalled();

    canais[0].avisar(CHANNEL_ERROR);
    expect(recuperar).not.toHaveBeenCalled();

    canais[0].avisar(SUBSCRIBED);
    expect(recuperar).toHaveBeenCalledTimes(1);
  });

  it("relê quando a primeira assinatura só sai depois de uma falha", () => {
    const { cliente, canais } = clienteFalso();
    const recuperar = vi.fn();
    assinarComRecuperacao(cliente, { nome: "teste", montar: c => c, recuperar });

    canais[0].avisar(TIMED_OUT);
    canais[0].avisar(SUBSCRIBED);
    expect(recuperar).toHaveBeenCalledTimes(1);
  });

  it("recria o canal fechado com outro nome, e a nova assinatura relê", () => {
    const { cliente, canais } = clienteFalso();
    const recuperar = vi.fn();
    assinarComRecuperacao(cliente, { nome: "teste", montar: c => c, recuperar });

    canais[0].avisar(SUBSCRIBED);
    canais[0].avisar(CLOSED);
    expect(canais).toHaveLength(1);

    vi.advanceTimersByTime(ESPERA_INICIAL_PARA_RECRIAR_MS);
    expect(canais).toHaveLength(2);
    expect(canais[1].nome).not.toBe(canais[0].nome);
    expect(canais[1].nome.startsWith("teste-")).toBe(true);

    canais[1].avisar(SUBSCRIBED);
    expect(recuperar).toHaveBeenCalledTimes(1);
  });

  it("dobra a espera a cada fechamento seguido, até o teto, e zera depois de assinar", () => {
    const { cliente, canais } = clienteFalso();
    assinarComRecuperacao(cliente, { nome: "teste", montar: c => c, recuperar: () => {} });

    let espera = ESPERA_INICIAL_PARA_RECRIAR_MS;
    for (let i = 0; i < 8; i++) {
      const antes = canais.length;
      canais[antes - 1].avisar(CLOSED);
      vi.advanceTimersByTime(espera - 1);
      expect(canais).toHaveLength(antes);
      vi.advanceTimersByTime(1);
      expect(canais).toHaveLength(antes + 1);
      espera = Math.min(espera * 2, ESPERA_MAXIMA_PARA_RECRIAR_MS);
    }
    expect(espera).toBe(ESPERA_MAXIMA_PARA_RECRIAR_MS);

    const ultimo = canais[canais.length - 1];
    ultimo.avisar(SUBSCRIBED);
    ultimo.avisar(CLOSED);
    vi.advanceTimersByTime(ESPERA_INICIAL_PARA_RECRIAR_MS);
    expect(canais[canais.length - 1]).not.toBe(ultimo);
  });

  it("encerrar remove o canal e ignora avisos que chegam depois", () => {
    const { cliente, canais } = clienteFalso();
    const recuperar = vi.fn();
    const parar = assinarComRecuperacao(cliente, { nome: "teste", montar: c => c, recuperar });

    canais[0].avisar(SUBSCRIBED);
    parar();
    expect(canais[0].removido).toBe(true);

    canais[0].avisar(SUBSCRIBED);
    canais[0].avisar(CLOSED);
    vi.advanceTimersByTime(ESPERA_MAXIMA_PARA_RECRIAR_MS);
    expect(recuperar).not.toHaveBeenCalled();
    expect(canais).toHaveLength(1);
  });

  it("encerrar durante a espera cancela a recriação", () => {
    const { cliente, canais } = clienteFalso();
    const parar = assinarComRecuperacao(cliente, { nome: "teste", montar: c => c, recuperar: () => {} });

    canais[0].avisar(CLOSED);
    parar();
    vi.advanceTimersByTime(ESPERA_MAXIMA_PARA_RECRIAR_MS);
    expect(canais).toHaveLength(1);
  });

  it("ignora aviso de um canal que já foi trocado", () => {
    const { cliente, canais } = clienteFalso();
    const recuperar = vi.fn();
    assinarComRecuperacao(cliente, { nome: "teste", montar: c => c, recuperar });

    canais[0].avisar(CLOSED);
    vi.advanceTimersByTime(ESPERA_INICIAL_PARA_RECRIAR_MS);
    canais[0].avisar(SUBSCRIBED);
    expect(recuperar).not.toHaveBeenCalled();
  });

  it("dois canais com o mesmo começo de nome recebem nomes diferentes", () => {
    const { cliente, canais } = clienteFalso();
    assinarComRecuperacao(cliente, { nome: "mesmo", montar: c => c, recuperar: () => {} });
    assinarComRecuperacao(cliente, { nome: "mesmo", montar: c => c, recuperar: () => {} });
    expect(canais[0].nome).not.toBe(canais[1].nome);
  });
});
