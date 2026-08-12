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

// Duas paletas SEM interseção, uma por lado da conversa.
//
// Com uma paleta única, cliente e atendente podiam cair na mesma cor por
// coincidência do hash -- justamente na hora em que distinguir os dois é o que
// mais importa. Separando as faixas, isso deixa de ser possível, e cada lado
// mantém variedade suficiente para diferenciar pessoas entre si num grupo ou
// num time.
//
// Tons escolhidos para contraste sobre fundo claro: o nome fica acima da
// bolha, na área clara. Os frios ficam com quem escreve de fora (cliente) e os
// quentes com quem atende, o que dá uma leitura de lado mesmo antes de ler o
// nome.
const CORES_CLIENTE = [
  "#1D4ED8", // azul
  "#6D28D9", // roxo
  "#0369A1", // azul petróleo
  "#0F766E", // teal
  "#4338CA", // índigo
];

const CORES_ATENDENTE = [
  "#128A68", // verde da marca
  "#B45309", // âmbar escuro
  "#BE185D", // rosa escuro
  "#C2410C", // laranja queimado
  "#9F1239", // vinho
];

// djb2: barato, determinístico e espalha bem nomes curtos e parecidos
// ("Ana" e "Ane" caem em cores diferentes).
function hash(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function corDoNome(nome: string, lado: "cliente" | "atendente"): string {
  const limpo = (nome ?? "").trim().toLowerCase();
  const paleta = lado === "cliente" ? CORES_CLIENTE : CORES_ATENDENTE;
  if (!limpo) return "#767676";
  return paleta[hash(limpo) % paleta.length];
}
