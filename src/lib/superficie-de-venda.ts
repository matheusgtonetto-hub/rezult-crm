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

// ─── Token aqui só se não inverter (dono, 29/09/2026) ───────────────────────
//
// Esta superfície é escura SEMPRE, nos dois temas. Quem seguia o tema era a
// tinta em cima dela, e no modo escuro o modal de planos ficava ilegível:
//
//   campo          token usado        claro      escuro     sobre #0C1115
//   texto          --neutral-0        #FFFFFF -> #1A1D21    ~1,3:1, some
//   textoSuave     --neutral-300      #D5D5D5 -> #3A4046    ~1,8:1, some
//   verdeFechado   --accent-800       #00654A -> #8BF0D3    selo claro com
//                                                           texto BRANCO
//   sobreVerde     --text-on-accent   #2D2F33 -> #0C231D    (os dois escuros,
//                                                            este não quebrou)
//
// No escuro `--neutral-0` deixa de ser branco e vira "superfície de cartão"
// (#1A1D21), e `--accent-800` deixa de ser tinta sobre canvas claro e vira
// tinta sobre canvas escuro. Os dois tokens estão certos; era o uso aqui que
// estava errado, porque assumia o valor do tema claro.
//
// A REGRA desta paleta, então: só usar `var(--token)` para token que NÃO é
// redefinido no bloco escuro do index.css. Hoje isso vale para `--accent-400`
// e `--danger-400` (verificados). Todo o resto entra como hex fixo, porque num
// fundo fixo a tinta também é fixa. Antes de trocar um hex daqui por um token,
// conferir se ele aparece redefinido em `:root[data-theme="dark"]`.

export const VENDA = {
  /** Os três níveis de profundidade do cartão preto. Ver a nota acima. */
  fundo: "#05080A",
  superficie: "#0C1115",
  superficie2: "#131A1E",

  /**
   * O emerald, 9,32:1 sobre a superfície escura.
   *
   * VOLTOU A SER HEX em 08/10/2026, e a regra desta paleta explica por quê.
   * Ele era `var(--accent-400)` porque aquele token valia o mesmo nos dois
   * temas -- e a condição para usar token aqui é exatamente essa. Na virada do
   * CRM para charcoal, o --accent-400 virou #1D1D1D no tema CLARO e continuou
   * menta no escuro, ou seja, deixou de cumprir a condição.
   *
   * O estrago era invisível no escuro e total no claro: esta superfície é
   * preta nos DOIS temas, então no claro o botão do plano recomendado, o selo
   * e os vistos passaram a ser #1D1D1D sobre #0C1115. Preto sobre preto, 1,2:1.
   * A tela de venda ficava sem nenhum verde e sem o botão principal.
   *
   * Não é exceção à virada: a virada é do app, e estas três telas (oferta,
   * cadastro e tour) são a superfície de VENDA, que seguiu no menta por
   * decisão do dono junto com a /planos.
   */
  verde: "#01D8A4",

  /** Tinta sobre o emerald: charcoal, como manda a decisão D2. */
  sobreVerde: "#2D2F33",

  /**
   * Verde fechado do selo da oferta, que leva texto BRANCO.
   *
   * Precisa ser mais escuro que o botão ao lado, senão os dois blocos verdes
   * competem. E branco sobre o emerald dá 1,85:1: o selo não teria saída sem
   * um verde fechado. 7,09:1.
   */
  verdeFechado: "#00654A",

  texto: "#FFFFFF",
  textoSuave: "#D5D5D5",
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
