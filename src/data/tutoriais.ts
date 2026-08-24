/**
 * Vídeos da aba Tutoriais, em Início.
 *
 * Lista em arquivo próprio, e não dentro da página, porque quem edita isto é
 * quem grava os vídeos, não quem mexe no layout. Publicar um tutorial passa a
 * ser acrescentar um item aqui.
 *
 * O `youtubeId` é o trecho depois de `?v=` no endereço do vídeo. Enquanto ele
 * não existir, o card aparece como "Em breve", sem play: é mais honesto do que
 * esconder o assunto, porque a lista também serve de índice do que vem por aí.
 */

export interface Tutorial {
  id: string;
  titulo: string;
  descricao: string;
  /** Ex.: "dQw4w9WgXcQ". Ausente = card em breve. */
  youtubeId?: string;
  /** Texto do selo de duração ("4:12"). Só aparece com o vídeo publicado. */
  duracao?: string;
}

export const TUTORIAIS: Tutorial[] = [
  {
    id: "visao-geral",
    titulo: "Conhecendo o Rezult",
    descricao: "Um passeio pelas telas principais e o caminho que um negócio faz do primeiro contato até a venda.",
  },
  {
    id: "whatsapp",
    titulo: "Conectando seu WhatsApp",
    descricao: "Como ligar sua linha ao CRM e passar a receber as conversas dentro do Multiatendimento.",
  },
  {
    id: "funil",
    titulo: "Montando seu funil",
    descricao: "Criar etapas que refletem o seu processo de vendas e mover negócios entre elas.",
  },
  {
    id: "multiatendimento",
    titulo: "Atendendo pelo Multiatendimento",
    descricao: "Responder, transferir, usar respostas rápidas e fechar o atendimento sem sair da tela.",
  },
  {
    id: "automacoes",
    titulo: "Criando sua primeira automação",
    descricao: "Gatilhos, condições e ações para o CRM cuidar do que se repete todo dia.",
  },
  {
    id: "disparos",
    titulo: "Fazendo um disparo",
    descricao: "Selecionar o público por filtro, escrever a mensagem e acompanhar as entregas.",
  },
  {
    id: "agentes",
    titulo: "Agentes de IA",
    descricao: "Configurar um agente para qualificar, responder e agendar enquanto você não está.",
  },
  {
    id: "dashboard",
    titulo: "Lendo seus números",
    descricao: "O que cada painel do dashboard responde e como usar os filtros de período.",
  },
  {
    id: "equipe",
    titulo: "Equipe e permissões",
    descricao: "Convidar pessoas e definir o que cada uma enxerga e pode fazer dentro do CRM.",
  },
];
