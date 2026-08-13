// Lista de emojis do seletor, uma só para todas as telas que têm compositor de
// mensagem. Vivia dentro de MultiatendimentoPage.tsx; saiu de lá quando o chat
// flutuante passou a precisar da mesma coisa, para não nascer a segunda cópia.
//
// A ordem é intencional: rostos primeiro (o uso mais comum numa conversa), gestos
// e reações no meio, e por último os de trabalho, que é o que um CRM usa para
// falar de reunião, proposta e prazo.
export const EMOJIS = [
  "😀","😃","😄","😁","😅","😂","🤣","😊","😍","🥰","😘","😎","🤩","🥳","😇",
  "🤔","😬","😒","😔","😢","😭","😤","😡","🥺","😱","😴","😜","😝","🤯","🫡",
  "👍","👎","👏","🙌","🤝","💪","✌️","🤞","👋","🫶","❤️","🔥","⭐","✅","💯",
  "🎉","🚀","💡","📞","💬","📧","📅","🗓️","📋","✏️","🔔","💰","📊","🏆","🎯",
];
