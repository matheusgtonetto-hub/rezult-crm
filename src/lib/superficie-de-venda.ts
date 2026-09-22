// A superfície escura das telas que VENDEM dentro do app.
//
// ESTA É A ÚNICA CÓPIA. Em 18/09/2026 este objeto existia, idêntico, em
// `SetupPage` e em `OfertaDeContratacao`, e uma terceira variante dele estava
// solta em `BalaoDoTour`. São as telas de oferta de plano e o tour de boas
// vindas: as únicas do app que não são ferramenta de trabalho, e por isso as
// únicas com fundo escuro.
//
// ─── O que mudou, e por quê ──────────────────────────────────────────────────
//
// O verde era `#00E599`, que é o verde do SITE. O comentário que estava aqui
// defendia a escolha assim: "verde diferente do --primary do CRM de propósito:
// no fundo escuro o #00E599 é o que dá o contraste, e o var(--accent-700) do
// app sumiria".
//
// Metade disso está certa: `--accent-700` sobre o preto dá 3,81:1 e realmente
// some. Mas a conclusão não segue. O emerald do sistema é `--accent-400`, e ele
// dá **9,32:1** sobre superfície escura -- que é exatamente o número que a
// matriz cita na seção 5 ao dizer que na seção escura "o emerald vira texto".
// A resposta certa não era importar um terceiro verde de marca, era usar o
// degrau certo do que já existe.
//
// Medido na troca: a tinta escura sobre o botão vai de 11,40:1 para 10,22:1, e
// o verde como texto sobre o preto de 12,12:1 para 10,86:1. Nada perde.
//
// Os brilhos verdes saíram: a seção 3.5 não tem sombra colorida, e foi a mesma
// remoção que a Onda 3 fez no `FreePlanBanner`, que é a irmã destas telas.
//
// ─── O que NÃO mudou, e está aguardando o dono ───────────────────────────────
//
// Os três tons de preto (`fundo`, `superficie`, `superficie2`) continuam sendo
// os do site, e não `--surface-inverse` (`#1B1B1B`). Alinhá-los exigiria dois
// degraus escuros novos na rampa, o que é acréscimo de token, e mudaria a
// aparência de uma tela de conversão. Isso é decisão do dono, não de varredura.

export const VENDA = {
  /** Os três níveis de profundidade do cartão preto. Ver a nota acima. */
  fundo: "#05080A",
  superficie: "#0C1115",
  superficie2: "#131A1E",

  /** O emerald do sistema. 9,32:1 sobre superfície escura. */
  verde: "var(--accent-400)",
  /** Tinta sobre o emerald: charcoal, como manda a decisão D2. */
  sobreVerde: "var(--text-on-accent)",
  /**
   * Verde fechado do selo da oferta, que leva texto BRANCO.
   *
   * Precisa ser mais escuro que o botão ao lado, senão os dois blocos verdes
   * competem. E branco sobre o emerald dá 1,85:1: o selo não teria saída sem
   * um verde fechado. `--accent-800` dá 7,09:1.
   */
  verdeFechado: "var(--accent-800)",

  texto: "var(--neutral-0)",
  textoSuave: "var(--neutral-300)",
  textoFraco: "rgba(244, 246, 244, 0.38)",
  borda: "rgba(255, 255, 255, 0.15)",
  bordaSuave: "rgba(1, 216, 164, 0.20)",
  bordaAtiva: "rgba(1, 216, 164, 0.45)",

  /**
   * Sem halo verde. Eram `rgba(0,229,153,.18)` e `.35`, o `--glow` do site.
   * A seção 3.5 define quatro sombras, todas frias e neutras, e nenhuma
   * colorida. O destaque vem do contraste entre o cartão escuro e o canvas
   * claro, não de um brilho em volta.
   */
  brilhoSuave: "transparent",
  brilhoVerde: "transparent",

  /** Preço antigo riscado. Vermelho marca o que a pessoa NÃO vai pagar. */
  vermelho: "var(--danger-400)",
} as const;
