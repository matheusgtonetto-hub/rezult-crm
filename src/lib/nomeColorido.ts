// Cor estável para nome de remetente, como o WhatsApp faz em grupo.
//
// Não é enfeite. No Multiatendimento o lado direito é compartilhado: vários
// atendentes humanos e o agente de IA escrevem todos ali, com a mesma bolha
// verde. Sem cor no nome, descobrir que a Maria respondeu as três primeiras e
// o João o resto exige ler nome por nome. Em conversa de grupo o mesmo vale
// para o lado esquerdo.
//
// A cor vem de um hash do nome, não de sorteio: a mesma pessoa precisa manter
// a mesma cor entre recarregamentos e entre conversas, senão a cor não informa
// nada. Mesmo motivo pelo qual o WhatsApp não randomiza.
//
// A paleta foi escolhida para contraste sobre fundo claro (o nome fica acima
// da bolha, em cinza claro hoje). Tons muito claros ficaram de fora.
const PALETA = [
  "#128A68", // verde da marca
  "#B45309", // âmbar escuro
  "#1D4ED8", // azul
  "#BE185D", // rosa escuro
  "#6D28D9", // roxo
  "#0F766E", // teal
  "#C2410C", // laranja queimado
  "#4D7C0F", // oliva
  "#9F1239", // vinho
  "#0369A1", // azul petróleo
];

export function corDoNome(nome: string): string {
  const limpo = (nome ?? "").trim().toLowerCase();
  if (!limpo) return "#767676";
  // djb2: barato, determinístico e espalha bem nomes curtos e parecidos
  // ("Ana" e "Ane" caem em cores diferentes).
  let hash = 5381;
  for (let i = 0; i < limpo.length; i++) hash = ((hash << 5) + hash + limpo.charCodeAt(i)) | 0;
  return PALETA[Math.abs(hash) % PALETA.length];
}
