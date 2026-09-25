// Catálogo de IA do produto.
//
// ─── Uma única fornecedora, e o cliente escolhe ESFORÇO ─────────────────────
//
// Decisão do dono em 25/09/2026. Antes, a tela oferecia três provedores e nove
// modelos, e pedia que o cliente escolhesse entre "Claude Sonnet 5" e
// "GPT-5.6 Terra" -- uma pergunta que ele não tem como responder, porque exige
// conhecer o mercado de modelos para configurar um agente de vendas.
//
// Agora a pergunta é outra: quanta cabeça você quer que o agente use? Baixo,
// médio ou alto. O modelo por trás é escolha nossa, e some da interface.
//
// Três razões práticas, além da simplicidade:
//
//   1. O crédito vendido pelo Rezult é abastecido por UMA conta na OpenAI
//      (secao 7 do plano do saldo). Deixar o cliente escolher Anthropic
//      significaria manter saldo em duas fornecedoras.
//   2. A chave da OpenAI é a única que cobre o produto inteiro -- agentes,
//      automações, transcrição de áudio e os embeddings da Base de
//      Conhecimento. Com Anthropic, a Base de Conhecimento ficava muda.
//   3. Três modelos Gemini ficaram MORTOS no catálogo sem ninguém notar (o 2.0
//      Flash foi desligado em 01/06/2026, a família 1.5 devolve 404). Menos
//      fornecedora é menos catálogo para apodrecer em silêncio.

export type IaEsforco = "baixo" | "medio" | "alto";

/**
 * O que o cliente vê e escolhe. O `modelo` é o que vai para o banco.
 *
 * Guardamos o ID do modelo, e não o esforço, de propósito: as linhas já
 * gravadas em `agents.model` e em `automations.flow` continuam válidas, e o
 * backend (que só entende ID de modelo) não muda nada. Trocar o modelo por trás
 * de um degrau é editar uma linha aqui.
 */
export const IA_ESFORCOS: {
  esforco: IaEsforco;
  modelo: string;
  titulo: string;
  descricao: string;
}[] = [
  {
    esforco: "baixo",
    modelo: "gpt-5.6-luna",
    titulo: "Baixo",
    descricao: "Respostas rápidas em tarefas diretas. O mais econômico.",
  },
  {
    esforco: "medio",
    modelo: "gpt-5.6-terra",
    titulo: "Médio",
    descricao: "Equilíbrio entre qualidade e custo. Serve à maioria dos casos.",
  },
  {
    esforco: "alto",
    modelo: "gpt-5.6-sol",
    titulo: "Alto",
    descricao: "Raciocínio mais longo para conversas complexas. O mais caro.",
  },
];

export const MODELO_POR_ESFORCO: Record<IaEsforco, string> = {
  baixo: "gpt-5.6-luna",
  medio: "gpt-5.6-terra",
  alto:  "gpt-5.6-sol",
};

/**
 * De volta do ID gravado para o degrau, para a tela abrir no lugar certo.
 *
 * Precisa engolir modelo antigo: existem agentes gravados em `claude-sonnet-5`
 * de antes desta decisão. Sem o mapa de legado, o seletor abriria vazio e
 * salvar qualquer coisa apagaria silenciosamente a configuração de alguém.
 */
const LEGADO_PARA_ESFORCO: Record<string, IaEsforco> = {
  "claude-haiku-4-5-20251001": "baixo",
  "claude-sonnet-5":           "medio",
  "claude-opus-5":             "alto",
  "gemini-2.0-flash":          "baixo",
  "gemini-1.5-flash":          "baixo",
  "gemini-1.5-pro":            "medio",
  "gemini-3.5-flash-lite":     "baixo",
  "gemini-3.8-flash":          "medio",
};

export function esforcoDoModelo(modelId: string | null | undefined): IaEsforco {
  if (!modelId) return "medio";
  const direto = IA_ESFORCOS.find(e => e.modelo === modelId);
  if (direto) return direto.esforco;
  return LEGADO_PARA_ESFORCO[modelId] ?? "medio";
}

export const IA_ESFORCO_LABELS: Record<IaEsforco, string> = {
  baixo: "Esforço baixo", medio: "Esforço médio", alto: "Esforço alto",
};

// Mesma paleta de badges já usada em outras telas do app -- verde/âmbar/vermelho
// para baixo/médio/alto. `border` é um tom intermediário entre bg e fg.
export const IA_ESFORCO_STYLES: Record<IaEsforco, { bg: string; fg: string; border: string }> = {
  baixo: { bg: "#E1F5EE", fg: "#008762", border: "#A7E8D0" },
  medio: { bg: "#FEF3C7", fg: "#92400E", border: "#FCD34D" },
  alto:  { bg: "#FEE2E2", fg: "#991B1B", border: "#FCA5A5" },
};

/**
 * Preço USD por 1M de tokens. Espelho de MODEL_PRICING em
 * `supabase/functions/_shared/uso.ts`, que é a fonte de verdade da cobrança --
 * esta cópia existe só porque Deno não importa de `src/`.
 *
 * ─── Por que os modelos de outras fornecedoras seguem aqui ──────────────────
 *
 * O catálogo acima é o que se VENDE; esta tabela é o que se SABE cobrar. São
 * coisas diferentes, e misturá-las custaria dinheiro: existem agentes gravados
 * em `claude-sonnet-5` e chamadas antigas em `agent_usage_log`. Um modelo sem
 * preço aqui é consumo registrado como ZERO -- acontece no fornecedor e não é
 * cobrado de ninguém. Tirar preço é abrir buraco; deixar não custa nada.
 */
export const IA_MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gpt-5.6-luna":               { inputPer1M: 0.4,  outputPer1M: 1.6 },
  "gpt-5.6-terra":              { inputPer1M: 2.5,  outputPer1M: 10 },
  "gpt-5.6-sol":                { inputPer1M: 12,   outputPer1M: 48 },
  // Legado: não é mais oferecido, mas ainda existe gravado e no histórico.
  "claude-haiku-4-5-20251001":  { inputPer1M: 0.8,  outputPer1M: 4 },
  "claude-sonnet-5":            { inputPer1M: 3,    outputPer1M: 15 },
  "claude-opus-5":              { inputPer1M: 15,   outputPer1M: 75 },
  "gemini-3.8-flash":           { inputPer1M: 0.75, outputPer1M: 3.75 },
  "gemini-3.5-flash-lite":      { inputPer1M: 0.30, outputPer1M: 2.50 },
};
