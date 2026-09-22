# Onda 1 — os componentes base

Data: 17/09/2026. Matriz: `docs/design-system/rezult-design-system.md` v1.0.

## O que esta onda fez

Passou os componentes compartilhados para a especificação da matriz, e varreu o
verde antigo do app inteiro. Nenhuma tela, painel ou campo novo.

### Controles

| Componente | Antes | Agora |
|---|---|---|
| `button` | Raio 8, texto 13, hover escurecendo por opacidade, halo verde no hover, desabilitado por opacidade | Raio 10, texto 14, hover CLAREIA para o tom 300, pressão escurece para o 500 com escala .97, anel de foco emerald de 3px, desabilitado em superfície neutra. Alturas 36/40/44 |
| `input` | Raio 5, borda `#gray-300` cravada, texto 13, foco com anel do navegador | Raio 10, borda `--input`, texto 14, foco com borda charcoal **mais** anel emerald, desabilitado em superfície neutra |
| `textarea` | Raio 8, fundo branco cravado | Igual ao input |
| `checkbox` | 16px, **contorno emerald quando vazio**, indeterminado com "certo" | 18px, contorno neutro quando vazio, emerald com tinta charcoal quando marcado, indeterminado com traço |
| `radio-group` | 16px, contorno emerald quando vazio | 18px, contorno neutro, ponto de 9px em emerald 500 quando marcado |
| `switch` | 24x44, botão com `shadow-lg`, desligado em `--input` | 26x44 com botão de 20px e `shadow-xs`, desligado em `--neutral-300` |
| `label` | 14px | 13px Medium no charcoal, como o design system define |

### Superfícies e sobreposições

| Componente | Mudança |
|---|---|
| `card` | Raio 16 e sombra de cartão (era raio 10 e `shadow-sm`), respiro 20px (era 24), título 20px (era 24) |
| `dialog` e `alert-dialog` | Raio 20, `shadow-overlay`, e o scrim virou charcoal a 45% com 3px de desfoque, que é o único ponto com translucidez no sistema |
| `dropdown-menu` | Painel raio 12 com `shadow-overlay`, item raio 8 com hover neutro e selecionado em emerald claro |
| `popover` | Raio 12, `shadow-overlay` |
| `tooltip` | Superfície inversa com tinta clara (era popover branco com sombra média) |
| `tabs` | Trilho `--neutral-100` com 3px, aba ativa branca com `shadow-xs`. O emerald sai das abas e fica para a ação principal da tela |
| `badge` | Raio 6 e peso 500 (era pílula com peso 600), mais os tons do sistema: `soft`, `warning`, `dark`, `dead`, e a variante de forma `pill` para os filtros que já a usavam |
| `alert` | Pares semânticos de fundo e tinta (`soft`, `warning`, `destructive`), em vez de borda translúcida |
| `progress` | 6px de altura (era 16, que lia como campo vazio) |
| `skeleton` | Cintilação neutra, nunca na cor da marca |
| `avatar` | Iniciais em emerald claro com tinta verde fechada |
| `table` | Linha selecionada em emerald claro, hover neutro |

### A varredura do verde antigo

`#128A68` aparecia em **405 pontos** de 35 arquivos: classes utilitárias,
estilos inline, constantes e SVG. Todos passaram para `--accent-700`, que é o
papel de "verde fechado" no sistema.

O tom 700 e não o 400: 249 desses pontos eram superfície **com texto branco
escrito à mão** por cima. O 700 mantém esse branco legível (4,52:1) e põe tudo
no sistema hoje. A troca para superfície emerald com tinta charcoal acontece
tela por tela, nas ondas 2 a 6.

### O modal de lead

As sub-abas do `LeadModal` tinham o verde antigo cravado (`bg-[#128A68]` com
`text-white`) e um trilho em `bg-green-100`, que não é token nenhum. Voltaram ao
SegmentedTabs do sistema. Com isso o modal deixou de ter dois elementos emerald
disputando a atenção: sobrou um, o botão de criar, como manda o princípio 1.

## Duas regras que esta onda descobriu

Entraram na matriz porque valem para sempre, não só para hoje.

### 1. Token no CSS, hex no dado

A varredura trocou `#128A68` por `var(--accent-700)` em todo lugar, inclusive em
três lugares onde a cor **não é estilo, é dado**:

- a paleta de cor de tag, que o usuário escolhe e o banco grava;
- a paleta de reserva dos gráficos, que o Recharts recebe como atributo de SVG e
  interpola em animação;
- mapas de cor por status em `.ts` consumidos por biblioteca.

CSS var não é valor de cor persistível: gravar `var(--accent-700)` numa coluna
do banco cria um dado que só existe dentro deste app. Os três voltaram para o
hex `#008762`.

### 2. Cor escolhida pelo usuário tem tinta calculada, não cravada

Cor de tag e cor de etapa são dado. Não existe token que as cubra, e `text-white`
cravado em cima delas era o que fazia a tag "Demonstração" ficar em 2,54:1.

Agora existe `src/lib/contraste.ts`: ele mede a luminância relativa da cor pela
fórmula da WCAG e devolve charcoal ou branco, o que tiver mais contraste.

O limiar é **0,237**, e não o 0,179 que se vê por aí: aquele é o cruzamento
contra preto puro, e o sistema não usa preto. Resolvendo "contraste com charcoal
igual a contraste com branco" para o charcoal `#2D2F33`, o cruzamento sai em
0,237. Com 0,179, as cores entre os dois valores recebiam charcoal quando o
branco tinha mais contraste.

### A paleta de tag estava com oito opções ilegíveis

Medindo as 20 cores da paleta: **8 não alcançavam 4,5:1 com nenhuma tinta**,
nem branca nem charcoal (`#E24B4A`, `#3B82F6`, `#6366F1`, `#8B5CF6`, `#A855F7`,
`#D946EF`, `#EC4899`, `#F43F5E`). Eram escolhas que o app oferecia e que nasciam
ilegíveis.

A paleta foi escurecida matiz por matiz, baixando só a luminosidade até o branco
passar 4,6:1 em todas. Tags já gravadas com as cores antigas continuam
funcionando, e o chip escolhe a melhor tinta possível para elas.

## Verificação

| Checagem | Resultado |
|---|---|
| `tsc --noEmit` | Sem erro |
| Testes | 31 passaram |
| Build de produção | Passou |
| Console | Sem erro em 10 rotas |

### Contraste, antes e depois da onda, medido no DOM

| Tela | Antes | Depois |
|---|---|---|
| `/leads` | 821 | **2** |
| `/pipeline` | 28 | 17 |
| `/multiatendimento` | 11 | 11 |
| `/calendario` | 12 | 12 |
| `/agentes` | 9 | 1 |
| `/dashboard` | 5 | 2 |
| `/configuracoes` | 2 | 1 |
| `/automacoes` | 1 | **0** |
| `/disparos` | 0 | 0 |
| `/inicio` | 1 | 1 |

A queda de 821 para 2 em `/leads` vem de três correções: iniciais de avatar
(o gerador de cor usava luminosidade 45%, onde o branco dava 2,26:1 no pior
matiz; passou para 30%, onde o pior caso é 4,75:1, medido nos 360 matizes),
chips de tag com tinta calculada, e o cinza de avatar sem cor de membro.

Os dois que sobraram em `/leads` são uma tag gravada no azul `#3B82F6`, que está
na zona onde nenhuma tinta alcança 4,5. É dado antigo; a paleta nova não oferece
mais essa cor.

### Um erro meu, encontrado pela medição

Ao trocar o cinza de avatar, usei `var(--neutral-700)`, um degrau que **não
estava declarado** nos tokens. Resultado: fundo inválido, e 345 iniciais brancas
sobre branco (1,00:1) em `/leads`. O medidor pegou na varredura seguinte. O
degrau foi declarado nos dois temas e o número voltou a 2.

Fica o registro do porquê a verificação é no DOM, e não no código: um token
ausente não quebra o build, não quebra o `tsc`, não quebra teste. Ele só apaga
o texto na tela.

## O que fica para as ondas seguintes

| Tela | Reprovações | Padrão |
|---|---|---|
| `/pipeline` | 17 | Iniciais brancas sobre cor de etapa escolhida pelo usuário (âmbar, laranja, azul). Mesma solução do chip de tag: tinta calculada. **Onda 4** |
| `/calendario` | 12 | Dias fora do mês em `#888` e `#8A8A8E` a 11px. A matriz proíbe o tom 500 abaixo de 16px. **Onda 6** |
| `/multiatendimento` | 11 | Horários e metadados em `#AAAAAA` a 11px. **Onda 4** |
| `/dashboard` | 2 | `--text-muted` a 50% de opacidade. **Onda 5** |
| `/configuracoes`, `/agentes`, `/inicio` | 1 cada | Vermelho `#E24B4A` como texto, chip ciano, emerald a 80% sobre emerald claro. **Onda 2** |

## Próxima onda

**Onda 2:** tabela, KPI, badge em uso, estado vazio. É onde a densidade
confortável (linha de 48px) chega às tabelas de verdade, e onde entra a paleta
de avatar e de chip com tinta calculada em todas as telas.
