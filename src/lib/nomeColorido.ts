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
// Os frios ficam com quem escreve de fora (cliente) e os quentes com quem
// atende, o que dá uma leitura de lado mesmo antes de ler o nome.
//
// ─── Por que são tokens, e não hex ──────────────────────────────────────────
//
// Os tons foram escolhidos para contraste sobre fundo CLARO, porque o nome fica
// acima da bolha, na área clara. No tema escuro essa área é escura, e os mesmos
// tons davam 2,22:1 (o roxo) e 3,05:1 (o laranja) -- medido na tela em
// 23/09/2026. Cada slot virou um token com valor próprio em cada tema, e o
// `.dark` no index.css troca os dez de uma vez. A função continua pura: ela
// escolhe o SLOT, e o CSS resolve a cor do tema em vigor.
const CORES_CLIENTE = [
  "var(--nome-cliente-1)", // azul
  "var(--nome-cliente-2)", // roxo
  "var(--nome-cliente-3)", // azul petróleo
  "var(--nome-cliente-4)", // teal
  "var(--nome-cliente-5)", // índigo
];

const CORES_ATENDENTE = [
  "var(--accent-800)",       // verde da marca, que já inverte com o tema
  "var(--nome-atendente-2)", // âmbar
  "var(--nome-atendente-3)", // rosa
  "var(--nome-atendente-4)", // laranja
  "var(--nome-atendente-5)", // vinho
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
  if (!limpo) return "var(--text-muted)";
  return paleta[hash(limpo) % paleta.length];
}
