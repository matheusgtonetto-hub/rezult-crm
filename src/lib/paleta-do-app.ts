// A paleta de cores que o app OFERECE para o usuário escolher.
//
// Serve TAG e DEPARTAMENTO. Eram duas paletas diferentes para o mesmo trabalho
// (escolher uma cor de identificação que vai para o banco), e a de departamento
// nunca passou pela medição: 7 das 20 cores dela não alcançavam 4,5:1 com
// nenhuma tinta. Oferecer duas paletas para a mesma pergunta é oferecer duas
// respostas para ela.
//
// ESTA É A ÚNICA CÓPIA. Em 18/09/2026 havia três, e duas nunca passaram pela
// medição: a de `SettingsPage` estava escurecida (0 de 20 reprovando), mas as
// duas de `AutomacoesPage` seguiam com a paleta original, onde `#EF4444`,
// `#3B82F6`, `#8B5CF6` e `#EC4899` não alcançam 4,5:1 com NENHUMA tinta.
//
// A consequência não era só visual: o usuário criava a tag pelo painel de
// automação, escolhia um desses quatro, e o app gravava no banco uma cor que o
// próprio sistema já tinha rejeitado em Configurações. Cor de tag é dado
// persistido, então o erro sobrevive à correção do CSS.
//
// Por isso a paleta é responsabilidade do sistema (matriz, seção 3.1: "a
// paleta que o app oferece para escolha é responsabilidade do sistema"), e a
// tinta de quem for escrever em cima sai de `tintaSobre`/`tintaDeChip`.
//
// Medição de 18/09/2026: 0 de 20 reprovam. Pior caso `#9E42F6` a 4,60:1.

/**
 * 20 cores, quatro fileiras de cinco, do vermelho ao neutro.
 *
 * Hex e não token de propósito: isto vira coluna no banco. `var(--accent-700)`
 * numa coluna cria um dado que só existe dentro deste app (matriz, seção 6).
 */
export const PALETA_DO_APP = [
  "#DD2C2B", "#C35305", "#9E6506", "#916F05", "#517E0E",
  "#17843F", "#0C855D", "#00825E", "#0E8174", "#047F94",
  "#0B7CAF", "#196CF4", "#5E61F1", "#6D28D9", "#9E42F6",
  "#C513DF", "#DB1778", "#E80D33", "#64748B", "#374151",
] as const;

/** Pré-seleção de um seletor de cor novo. É o verde da marca, dentro da paleta. */
export const COR_DE_TAG_PADRAO = "#00825E";

/**
 * Cor da tag que ativa o agente de IA num negócio.
 *
 * Fica nomeada porque é a MESMA tag em três telas (picker do agente, criação
 * automática em AgentesPage, edição em Configurações), e tag igual com cor
 * diferente por tela é o defeito que esta consolidação existe para matar.
 *
 * O roxo é o que já está gravado no banco de clientes reais, e por isso ele
 * entrou na paleta no lugar de `#8452F5`: assim a cor de uma tag existente
 * aparece marcada no seletor em vez de parecer "fora da paleta".
 */
export const COR_TAG_AGENTE = "#6D28D9";

/**
 * Cor da tag "interesse comercial", marcada pelo Atendente.
 *
 * Era `#D97706`, que dá 4,21:1 no melhor caso: abaixo do mínimo com branco e
 * com charcoal. O âmbar da paleta resolve sem mudar o sentido da cor. Tag já
 * gravada mantém o âmbar antigo, como toda cor de banco anterior à paleta nova.
 */
export const COR_TAG_INTERESSE = "#9E6506";
