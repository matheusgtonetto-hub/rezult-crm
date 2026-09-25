// Catálogo de modelos de IA por provedor (BYOK) — fonte única, usada tanto no
// bloco de IA das Automações quanto na aba "Modelos" dos Agentes. Mantém os
// mais recentes/recomendados de cada provedor.
export type IaProvider = "openai" | "anthropic" | "google";
export type IaModelCost = "baixo" | "medio" | "alto";

export const IA_MODELS: Record<IaProvider, { id: string; label: string; cost: IaModelCost }[]> = {
  openai: [
    { id: "gpt-5.6-luna",  label: "GPT-5.6 Luna (mais barato, workloads sensíveis a custo)",     cost: "baixo" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (equilíbrio entre inteligência e custo)",       cost: "medio" },
    { id: "gpt-5.6-sol",   label: "GPT-5.6 Sol (mais capaz, trabalho profissional complexo)",    cost: "alto"  },
  ],
  anthropic: [
    { id: "claude-opus-5",             label: "Claude Opus 5 (projetos complexos, mais capaz)",       cost: "alto"  },
    { id: "claude-sonnet-5",           label: "Claude Sonnet 5 (tarefas do dia a dia, equilibrado)",   cost: "medio" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (mais rápido, menor custo)",           cost: "baixo" },
  ],
  // Os três modelos anteriores (gemini-2.0-flash, gemini-1.5-pro,
  // gemini-1.5-flash) foram REMOVIDOS em 25/09/2026: estavam mortos. O 2.0
  // Flash foi desligado em 01/06/2026 e a família 1.5 devolve 404. Quem
  // escolhesse qualquer um deles no bloco de IA recebia erro do provedor -- e,
  // depois que a medição de custo entrou, o consumo ainda saía de graça, porque
  // nenhum deles tinha preço em tabela nenhuma.
  google: [
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (mais barato, respostas rápidas)", cost: "baixo" },
    { id: "gemini-3.8-flash",      label: "Gemini 3.8 Flash (equilíbrio entre inteligência e custo)", cost: "medio" },
  ],
};

export const IA_PROVIDER_LABELS: Record<IaProvider, string> = {
  openai: "OpenAI (ChatGPT)", anthropic: "Anthropic (Claude)", google: "Google (Gemini)",
};

export const IA_COST_LABELS: Record<IaModelCost, string> = {
  baixo: "Custo baixo", medio: "Custo médio", alto: "Custo alto",
};

// Mesma paleta de badges já usada em outras telas do app (ex: STATUS_BADGE em
// AgentesPage.tsx) — verde/âmbar/vermelho para baixo/médio/alto. `border` é
// um tom intermediário entre bg e fg (mesma matiz, um pouco mais escuro que
// o fundo) pra dar contorno à tag sem competir com o texto.
export const IA_COST_STYLES: Record<IaModelCost, { bg: string; fg: string; border: string }> = {
  baixo: { bg: "#E1F5EE", fg: "#008762", border: "#A7E8D0" },
  medio: { bg: "#FEF3C7", fg: "#92400E", border: "#FCD34D" },
  alto:  { bg: "#FEE2E2", fg: "#991B1B", border: "#FCA5A5" },
};

// Preço USD por 1M tokens. Espelho de MODEL_PRICING em
// supabase/functions/_shared/uso.ts, que é a fonte de verdade da cobrança --
// esta cópia existe só porque Deno não importa de src/.
//
// Todo modelo de IA_MODELS acima PRECISA estar aqui e lá. Modelo sem preço é
// consumo que sai de graça: o backend registra custo zero e ninguém é cobrado.
// Desde 25/09/2026 isso grita no log em vez de passar batido, mas o conserto
// continua sendo acrescentar o preço nos dois lugares.
//
// ATENÇÃO à data: a tarifa do Gemini 3.8 Flash vale até 31/12/2026 e DOBRA em
// 01/01/2027 (1,50 / 7,50).
export const IA_MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8,  outputPer1M: 4 },
  "claude-sonnet-5":           { inputPer1M: 3,    outputPer1M: 15 },
  "claude-opus-5":             { inputPer1M: 15,   outputPer1M: 75 },
  "gpt-5.6-luna":               { inputPer1M: 0.4,  outputPer1M: 1.6 },
  "gpt-5.6-terra":              { inputPer1M: 2.5,  outputPer1M: 10 },
  "gpt-5.6-sol":                { inputPer1M: 12,   outputPer1M: 48 },
  "gemini-3.8-flash":           { inputPer1M: 0.75, outputPer1M: 3.75 },
  "gemini-3.5-flash-lite":      { inputPer1M: 0.30, outputPer1M: 2.50 },
};
