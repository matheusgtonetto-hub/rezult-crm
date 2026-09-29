/**
 * As perguntas sobre o negócio que cada agente responde.
 *
 * ─── Por que ficam no AGENTE e não na empresa (dono, 28/09/2026) ───────────
 *
 * Elas viviam em `company_knowledge_base`, uma cópia por empresa. Uma empresa
 * pode ter um agente por PRODUTO, e aí "o que vende", "preço" e "objeções"
 * mudam de agente para agente -- na tabela da empresa, os três eram obrigados a
 * ser iguais para todos.
 *
 * E havia contradição silenciosa: três delas já tinham seção equivalente na aba
 * Instruções de cada agente, e as duas entravam no MESMO prompt de sistema. O
 * modelo recebia duas versões do mesmo fato e seguia a que estivesse mais
 * abaixo no texto, sem ninguém saber.
 *
 * ─── Por que continuam sendo CAMPOS, e não texto livre ─────────────────────
 *
 * A aba Instruções é uma caixa de texto com chips que escrevem títulos. Campo
 * rotulado com contador de progresso é preenchido; caixa em branco fica vazia.
 * Juntar as perguntas ali dentro simplificaria o código e derrubaria a taxa de
 * preenchimento -- e agente sem contexto responde mal, o que o cliente atribui
 * ao produto, não ao campo que deixou em branco.
 *
 * ─── O que saiu da lista ───────────────────────────────────────────────────
 *
 * "Horário e canais de atendimento" foi removido: duplicava o horário de
 * atendimento da aba Comportamento, onde não é texto no prompt, é comportamento
 * de verdade. Ter os dois criava contradição -- um dizia uma coisa ao modelo e
 * o outro definia o que acontecia.
 */

export type ChaveDoContexto =
  | "sobre_empresa" | "publico" | "oferta" | "condicoes"
  | "objecoes" | "perguntas_frequentes" | "links";

/** A mesma lista e a mesma ordem de CAMPOS_DA_BASE no agent-sds-qualify. */
export const CAMPOS_DO_CONTEXTO: { chave: ChaveDoContexto; pergunta: string; exemplo: string }[] = [
  { chave: "sobre_empresa",        pergunta: "O que a sua empresa faz?",                  exemplo: "Ex: Atendemos clientes em todo o Brasil, presencial e online, com planos mensais e projetos avulsos." },
  { chave: "publico",              pergunta: "Para quem você vende?",                     exemplo: "Ex: Donos de pequenas empresas de serviço que querem organizar o comercial." },
  { chave: "oferta",               pergunta: "O que você vende e como funciona?",         exemplo: "Ex: Plano mensal com acompanhamento semanal. Projeto avulso orçado conforme o escopo." },
  { chave: "condicoes",            pergunta: "Preço, pagamento e condições",              exemplo: "Ex: A partir de R$ 300 por mês. Pix, cartão em até 12x ou boleto. Sem fidelidade." },
  { chave: "objecoes",             pergunta: "Objeções mais comuns e como responder",     exemplo: "Ex: \"Está caro\": lembre que a primeira conversa é gratuita e sem compromisso." },
  { chave: "perguntas_frequentes", pergunta: "Perguntas que os clientes sempre fazem",    exemplo: "Ex: Atende aos sábados? Sim, das 9h às 12h." },
  { chave: "links",                pergunta: "Links que o agente pode enviar",            exemplo: "Ex: Site, Instagram, página de agendamento." },
];

export type ContextoComercial = Partial<Record<ChaveDoContexto, string>>;

/** Quantas perguntas têm resposta. Alimenta o contador de progresso. */
export function contextoPreenchido(c: ContextoComercial | null | undefined): number {
  return CAMPOS_DO_CONTEXTO.filter((campo) => String(c?.[campo.chave] ?? "").trim()).length;
}
