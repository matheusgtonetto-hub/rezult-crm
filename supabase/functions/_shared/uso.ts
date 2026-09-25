// deno-lint-ignore-file no-explicit-any

/**
 * Registro de uso de IA e débito do crédito, para TODOS os pontos de chamada.
 *
 * ─── Por que isto virou um módulo ──────────────────────────────────────────
 *
 * A tabela de preços vivia copiada em três lugares (os dois runners de agente e
 * `src/lib/ai-models.ts`), com um comentário pedindo sincronia manual. Tabela de
 * preço copiada é tabela que diverge no primeiro reajuste, e divergir aqui
 * significa cobrar do cliente um número que não é o custo.
 *
 * Pior: a varredura de 25/09/2026 mostrou que três dos CINCO pontos que chamam
 * IA não mediam custo nenhum (`automation-runner`, `ai-suggest-reply` e
 * `agent-kb-ingest`). Consumo invisível não é consumo de graça, é consumo que
 * alguém paga sem saber.
 *
 * `src/lib/ai-models.ts` continua sendo uma quarta cópia, porque Deno não
 * importa de `src/`. Essa ainda precisa de sincronia manual.
 */

import { debitarCredito } from "./credito.ts";

export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-sonnet-5":           { inputPer1M: 3,   outputPer1M: 15 },
  "claude-opus-5":             { inputPer1M: 15,  outputPer1M: 75 },
  "gpt-5.6-luna":              { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-5.6-terra":             { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-5.6-sol":               { inputPer1M: 12,  outputPer1M: 48 },
  // Gemini. Os tres modelos que o catalogo oferecia (2.0-flash, 1.5-pro,
  // 1.5-flash) estao MORTOS: o 2.0 Flash foi desligado em 01/06/2026 e a
  // familia 1.5 devolve 404. Substituidos pelos recomendados de hoje.
  //
  // ATENCAO ao prazo: a tarifa do 3.8 Flash vale ate 31/12/2026 e DOBRA em
  // 01/01/2027, para 1,50 / 7,50. Revisar antes da virada, ou a margem de quem
  // usa Gemini cai pela metade sem ninguem mexer em nada.
  "gemini-3.8-flash":          { inputPer1M: 0.75, outputPer1M: 3.75 },
  "gemini-3.5-flash-lite":     { inputPer1M: 0.30, outputPer1M: 2.50 },
  // Embeddings da Base de Conhecimento. Só entrada: não existe token de saída
  // num embedding, o retorno é um vetor.
  "text-embedding-3-large":    { inputPer1M: 0.13, outputPer1M: 0 },
};

/**
 * De onde veio a chamada. É a dimensão que a tela de Consumo usa nas colunas,
 * e o que responde "minhas automações gastam mais que meus agentes?" sem
 * precisar nomear modelo nenhum para o cliente.
 */
export type OrigemDoUso = "agente" | "automacao" | "sugestao" | "base_conhecimento";

/**
 * Seis casas decimais, não quatro.
 *
 * Um chunk de 500 tokens no `text-embedding-3-large` custa US$ 0,000065. Com
 * quatro casas isso vira 0,0001 (erro de 54%), e um chunk menor vira ZERO --
 * a ingestão de um documento inteiro apareceria como consumo nenhum.
 */
export function custoDaChamada(model: string, entrada: number, saida: number): number {
  const preco = MODEL_PRICING[model];

  /*
   * Modelo sem preco GRITA, em vez de devolver zero em silencio.
   *
   * O silencio era um buraco real: o catalogo do frontend (src/lib/ai-models.ts)
   * oferecia tres modelos Gemini que nao existiam em tabela de preco nenhuma, e
   * o `?? { 0, 0 }` fazia essa escolha sair DE GRACA -- consumo cobrado do
   * fornecedor e nao cobrado do cliente, sem nenhum sinal.
   *
   * O zero continua, porque inventar um preco seria pior que nao cobrar. O que
   * muda e que agora da para achar no log.
   */
  if (!preco) {
    console.error(
      `[uso] MODELO SEM PRECO: "${model}". O consumo sera registrado como ZERO e ninguem sera cobrado. ` +
      `Acrescente o preco em supabase/functions/_shared/uso.ts (e espelhe em src/lib/ai-models.ts).`,
    );
    return 0;
  }

  const bruto = (entrada / 1_000_000) * preco.inputPer1M + (saida / 1_000_000) * preco.outputPer1M;
  return Number(bruto.toFixed(6));
}

/**
 * Whisper nao e cobrado por token, e por MINUTO de audio: US$ 0,006/min.
 *
 * Por isso ele nao cabe no MODEL_PRICING, que tem forma de entrada/saida. Passe
 * o resultado desta funcao em `custoUsd` e deixe entrada/saida em zero.
 */
export const WHISPER_USD_POR_MINUTO = 0.006;

export function custoDeAudio(segundos: number): number {
  if (!segundos || segundos <= 0) return 0;
  return Number(((segundos / 60) * WHISPER_USD_POR_MINUTO).toFixed(6));
}

export type DadosDoUso = {
  companyId: string;
  model: string;
  entrada: number;
  saida: number;
  origem: OrigemDoUso;
  /** Null nos pontos que não têm agente: sugestão, automação e embeddings. */
  agentId?: string | null;
  /** Null no modo teste (o lead simulado não existe) e onde não há lead. */
  leadId?: string | null;
  sucesso?: boolean;
  /**
   * Custo ja calculado, para o que nao e cobrado por token (Whisper, por
   * minuto). Quando vem, a conta de entrada/saida e ignorada.
   */
  custoUsd?: number;
};

/**
 * Grava uma linha de uso e desconta o crédito NA MESMA função.
 *
 * É o mesmo lugar de propósito: enquanto o débito for um segundo passo em outro
 * canto do código, existe o caminho em que a chamada acontece e o saldo não cai,
 * que é a única coisa que este sistema não pode deixar acontecer.
 *
 * Nunca lança. Se o registro falhar, a chamada de IA já aconteceu e o custo já
 * existe no fornecedor: derrubar o fluxo aqui não desfaz o gasto, só acrescenta
 * um atendimento quebrado por cima do prejuízo. O que ela faz é gritar no log.
 */
export async function registrarUso(db: any, dados: DadosDoUso): Promise<void> {
  const { companyId, model, entrada, saida, origem } = dados;

  // Sem empresa nao ha a quem atribuir, entao nao ha o que gravar -- mas isso
  // significa consumo que aconteceu e ninguem paga. Grita pelo mesmo motivo do
  // modelo sem preco: buraco visivel e consertavel, buraco silencioso nao.
  if (!companyId) {
    console.error(`[${origem}] uso de IA SEM company_id: consumo nao atribuido a ninguem`, { model, entrada, saida });
    return;
  }

  const custo = dados.custoUsd ?? custoDaChamada(model, entrada, saida);
  // Nada a registrar: nem token, nem custo direto. Evita poluir o extrato com
  // linhas de zero (cache, erro antes de chegar no modelo, audio de 0s).
  if (entrada === 0 && saida === 0 && custo === 0) return;

  const { data: registro, error } = await db.from("agent_usage_log").insert({
    agent_id:      dados.agentId ?? null,
    company_id:    companyId,
    model,
    input_tokens:  entrada,
    output_tokens: saida,
    cost_usd:      custo,
    lead_id:       dados.leadId ?? null,
    success:       dados.sucesso ?? true,
    origem,
  }).select("id").single();

  if (error || !registro) {
    // Uso não registrado é consumo que ninguém vai cobrar nem conciliar.
    console.error(`[${origem}] FALHA AO REGISTRAR USO (consumo sem débito):`, error?.message, {
      companyId,
      model,
      custo,
    });
    return;
  }

  await debitarCredito(db, companyId, registro.id as string, custo, origem);
}
