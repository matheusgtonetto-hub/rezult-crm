# Rezult Design System

**A matriz.** Este é o documento único do qual todo o visual do Rezult deriva: o
app (`rezult-crm`) e o site (`rezult-site`). Nada de cor, tipografia, espaço,
raio, sombra, estado ou formato de número entra no produto sem estar aqui.

| | |
|---|---|
| Versão | 1.0 (fundação) |
| Data | 17/09/2026 |
| Status | **Ondas 0 a 6 aplicadas** (17 a 19/09/2026): o APP inteiro passou pela matriz. Tokens globais, Inter, componentes base, tabela/KPI/chip/avatar/estado vazio, navegação, telas de operação, dashboard e telas de conta. Registros em `docs/plans/`. Falta a Onda 7, o site. |
| Decide | O dono do produto. Nenhuma alteração de fundação sem registro na seção 8. |
| Executa | Quem implementa (pessoa ou agente), sempre contra este documento |
| Substitui | `Rezult CRM Design System-3` (proposta visual, virou insumo desta matriz) e a ponte `.rz-ds-v3` (piloto do dashboard) |

---

## 0. Como usar este documento

1. **Antes de escrever CSS ou JSX**, ache o token aqui. Se não existe, não invente: proponha na seção 8.
2. **Este documento decide COMO o produto se parece.** Ele não decide O QUE cada tela contém. Painel, campo, botão de ação e navegação são decisão de produto, e vêm do dono, nunca de um kit de exemplo. Essa confusão já custou um retrabalho no dashboard em 17/09/2026.
3. **A fundação (seção 3) é comum** ao app e ao site. As aplicações (seções 4 e 5) só dizem como cada superfície usa a mesma fundação.
4. **Todo valor aqui é auditável.** Contraste está medido, não estimado. Onde este documento contraria o DS-3, o motivo está escrito.

---

## 1. Princípios

1. **Um acento por tela.** O emerald marca exatamente uma coisa por vista: a ação principal, o item ativo, a linha selecionada. Três elementos emerald na mesma tela significam que dois estão errados.
2. **Dado antes de enfeite.** A interface afirma fatos e contagens. Sem degradê decorativo, sem textura, sem sombra dramática, sem movimento em loop.
3. **Denso, com respiro onde se lê.** É uma ferramenta de operação: cabe muita informação na tela. O respiro vai para o que se lê (título de painel, linha de tabela, rótulo de eixo), não para a moldura.
4. **Contraste é requisito, não estética.** Texto pequeno em 4,5:1, texto grande e elemento de interface em 3:1. Quando cor e contraste brigam, contraste ganha e a cor muda de tom. A única isenção é a que a própria WCAG dá: elemento **inativo** (desabilitado, dia fora do mês, botão sem ação disponível) usa `--text-disabled` e sai da conta.
5. **Estado sempre visível sem depender de matiz.** Ativo, selecionado, erro e desabilitado se distinguem por forma, peso ou posição, além da cor. Quem não separa verde de cinza continua operando.

---

## 2. Decisões de fundação

Registro datado. Estas cinco respostas geram quase todo o resto do documento.

| # | Decisão | Escolha | Data | Consequência |
|---|---|---|---|---|
| D1 | Cor da marca | **Emerald `#01D8A4`**, o acento da logo (a barra diagonal) | 17/09/2026 | Substitui o `#128A68` do app e o `#00B873` do site. Exige rampa: o `#01D8A4` é superfície, não tinta. O verde fechado do azulejo da logo vira `--accent-700`, a tinta verde do sistema (ver 3.1) |
| D2 | Tinta sobre o acento | **Charcoal `#2D2F33`**, nunca branco | 17/09/2026 | Charcoal sobre emerald dá 7,25:1; branco daria 1,85:1 e reprovaria |
| D3 | Tipografia | **Inter**, família única | 17/09/2026 | Substitui Geist Sans no app. Já vendorizada em `public/fonts/Inter-Variable.ttf`; o site já migrou |
| D4 | Escopo | **Uma fundação, duas aplicações**: app e site | 17/09/2026 | Cor, tipo, espaço, raio, estado e número são comuns. Só a densidade e a escala de título mudam |
| D5 | Tema | **Claro é o padrão.** Escuro fica com tokens prontos e seletor fechado | 17/09/2026 | O seletor em Configurações segue "Em breve" até a auditoria das 27 páginas |
| D6 | Barra lateral | **Branca**, **72px**, separada do conteúdo por régua de 1px `--border-default` | 17/09/2026 | Substitui a faixa verde de hoje, que ficaria ilegível: ícone branco sobre o emerald novo dá 1,85:1. Ícone em repouso `--icon-default`, item ativo em pílula emerald com ícone charcoal |
| D7 | Topbar global | **Existe**, 72px (`--topbar-h`): saudação à esquerda, ferramentas e menu da pessoa à direita. A lateral fica só com a navegação | 17/09, revista em 19/09, revertida em 20/09 e **restaurada em 21/09/2026** | Na volta, o pedido do dono foi que as duas barras fossem lidas como UMA peça em L: nenhuma régua entre elas, e o conteúdo arredondando o canto do encontro (`--junta-barras`). Ferramentas e pessoa sobem para o topo, senão ficariam nos dois lugares. Cada página mantém o próprio cabeçalho, abaixo da barra |
| D8 | Densidade padrão | **Confortável**: linha de 48px, corpo de 14px, controle de 40px | 17/09/2026 | O app hoje é mais compacto que isso (linha ~36px, texto 11 a 13px). Custa cerca de 4 linhas de tabela por tela e devolve legibilidade. Modo compacto (40px) fica disponível como opt-in da tela |

---

## 3. Fundação

### 3.1 Cor

#### Rampa da marca

Cor de marca não é um hex, é uma rampa com papéis. Cada tom existe para um uso.

| Token | Hex | Papel | Nunca use para |
|---|---|---|---|
| `--accent-50` | `#ECFDF7` | Fundo de bloco informativo, faixa de destaque | Texto |
| `--accent-100` | `#CFFAEB` | Linha selecionada, badge suave, fundo de ícone | Texto |
| `--accent-200` | `#A5F3D9` | Borda de bloco emerald, degrau de mapa de calor | Texto |
| `--accent-300` | `#5FE7BE` | **Hover** de superfície emerald | Texto sobre claro |
| `--accent-400` | `#01D8A4` | **A cor da marca.** Superfície de ação, item ativo, série 1 de gráfico | **Texto sobre claro (1,85:1)** |
| `--accent-500` | `#00BA88` | **Press** de superfície emerald | Texto sobre claro |
| `--accent-600` | `#00A879` | Série 3 de gráfico, ícone sobre claro | Texto pequeno |
| `--accent-700` | `#008762` | **Texto e link em verde sobre cartão branco** (4,52:1) | Texto sobre o canvas cinza (4,22:1, reprova) |
| `--accent-800` | `#00654A` | Texto verde sobre canvas (6,62:1) e sobre emerald claro (6,26:1) | Superfície grande |

#### Neutros

Charcoal faz o trabalho do preto. `#000000` não aparece na interface.

| Token | Hex | Papel |
|---|---|---|
| `--neutral-0` | `#FFFFFF` | Cartão, painel, superfície de conteúdo |
| `--neutral-25` | `#FAFAFA` | Canvas do site |
| `--neutral-50` | `#F7F7F7` | Canvas do app, trilho de aba, cabeçalho de tabela |
| `--neutral-100` | `#F2F2F2` | Divisória de linha de tabela, fundo desabilitado |
| `--neutral-200` | `#E7E7E7` | **Borda padrão** |
| `--neutral-300` | `#D5D5D5` | Borda forte (input em repouso, divisor de seção) |
| `--neutral-400` | `#B4B4B7` | Texto desabilitado, série 4 de gráfico |
| `--neutral-500` | `#8A8A8E` | Texto terciário, **só a partir de 16px** |
| `--neutral-600` | `#6C6C6C` | **Texto secundário e rótulo de eixo** (5,25:1) |
| `--neutral-800` | `#3A3A3E` | Corpo de texto (11,32:1) |
| `--neutral-900` | `#2D2F33` | Título, ink, superfície inversa, série 2 de gráfico |
| `--neutral-950` | `#1B1B1B` | Rail de navegação, rodapé do site, capa escura |

#### Semânticos

| Token | Hex | Papel |
|---|---|---|
| `--danger-400` | `#FD5555` | Preenchimento, ponto de notificação, linha de queda em gráfico |
| `--danger-fg` | `#B02424` | **Texto de erro** (6,72:1 sobre branco, 5,91:1 sobre `#FFECEC`) |
| `--danger-bg` | `#FFECEC` | Fundo de alerta de erro |
| `--warning-400` | `#F7B32B` | Aviso, estrela de avaliação |
| `--warning-fg` | `#8A5B00` | Texto de aviso (5,37:1 sobre `#FFF4DA`) |
| `--warning-bg` | `#FFF4DA` | Fundo de aviso |
| `--success` | `--accent-700` | Sucesso é o próprio verde da marca. Não existe um segundo verde |
| `--muted-dead` | `#A8BDB4` | Cancelado, fora de estoque, expirado: o estado "morto", diferente de "errado" |

#### Papéis semânticos (é isso que o código consome)

O código nunca pede `--accent-400`. Ele pede o papel. Trocar a marca amanhã passa a ser trocar nove linhas.

```
--bg-app: --neutral-50            --text-heading: --neutral-900
--surface-card: --neutral-0       --text-body: --neutral-800
--surface-hover: --neutral-50     --text-muted: --neutral-600
--surface-selected: --accent-100  --text-subtle: --neutral-500
--surface-accent: --accent-400    --text-on-accent: --neutral-900
--surface-inverse: --neutral-950  --text-link: --accent-700
--border-default: --neutral-200   --border-focus: --accent-400
--border-strong: --neutral-300    --icon-default: --neutral-600
```

#### A marca tem dois verdes, e é por isso que a rampa existe

A logo (`public/favicon.png`, `src/assets/logo-outline.svg`, `logo-wordmark.svg`) é
um azulejo de canto arredondado em **verde fechado** com o "R" branco e uma barra
diagonal em **emerald claro**. Os arquivos hoje usam `#128A68` no azulejo e
`#00E599` na barra.

Ou seja: o `#01D8A4` da decisão D1 é o papel de **acento** da marca, não o do
azulejo. A rampa da seção 3.1 já reproduz essa dupla: `--accent-400` é a barra
diagonal (superfície de destaque) e `--accent-700` é o azulejo (tinta e verde
fechado). É a mesma linguagem da marca, agora com nove degraus em vez de dois.

| Item | Hoje no arquivo | Papel no sistema | Ação |
|---|---|---|---|
| Barra diagonal da logo | `#00E599` | `--accent-400` `#01D8A4` | Reexportar quando conveniente. Diferença perceptível é mínima |
| Azulejo da logo | `#128A68` | `--accent-700` `#008762` | Reexportar quando conveniente |
| Logo em uso | Como está | **Ativo de marca**, fora da paleta de interface | Não recolorir por CSS, não aplicar filtro |

Até o reexporte, a logo é tratada como o selo da Meta no site: arte fechada, usada
como veio. O que **não** pode acontecer é `#00E599` ou `#128A68` aparecerem em
botão, texto, borda ou gráfico. Lá valem só os tokens.

#### Cor que vem do usuário: a tinta é calculada

Cor de tag e cor de etapa de pipeline são **dado**, escolhido pelo usuário e
gravado no banco. Nenhum token cobre isso, e tinta cravada em cima de cor
arbitrária é como o app estava: a tag "Demonstração" em verde claro com texto
branco dava 2,54:1.

Regra: **texto sobre cor vinda do banco usa `tintaSobre()`**
(`src/lib/contraste.ts`), que mede a luminância relativa da cor pela fórmula da
WCAG e devolve charcoal ou branco, o que tiver mais contraste. O limiar é
**0,237**, o cruzamento entre o charcoal do sistema e o branco. (O 0,179 que
circula por aí é o cruzamento contra preto puro, e aqui não existe preto puro.)

A paleta que o app **oferece** para escolha é responsabilidade do sistema, e por
isso ela é escurecida até o branco passar 4,6:1 em todas as opções. Medição de
17/09/2026: das 20 cores da paleta antiga, 8 não alcançavam 4,5:1 com nenhuma
tinta. Cor gravada antes disso continua funcionando, com a melhor tinta possível.

O mesmo vale para cor gerada por hash (avatar de membro): a fórmula fixa a
luminosidade em 30%, onde o branco passa em todos os 360 matizes (pior caso
4,75:1). A 45%, que era o valor anterior, o pior matiz dava 2,26:1.

#### Regras de cor (não negociáveis)

1. **Emerald `#01D8A4` é superfície, jamais texto sobre claro.** Texto verde usa `--accent-700` no cartão branco e `--accent-800` no canvas cinza.
2. **Sobre emerald, a tinta é charcoal.** Nenhum `text-white` sobre fundo emerald. Isso mata as faixas verdes com texto branco que existem hoje nas tabelas.
3. **Vermelho `#FD5555` não é texto pequeno** (3,18:1). Texto de erro usa `--danger-fg`.
4. **`--neutral-500` (`#8A8A8E`) não serve para texto abaixo de 16px** (3,44:1). Rótulo de eixo, legenda e caption usam `--neutral-600`. *Desvio consciente do DS-3, que propõe `#8A8A8E` em eixo.*
5. **Nenhum hex novo.** Cor que não está nesta seção não existe. A exceção única e documentada está em 3.10.

### 3.2 Tipografia

**Inter**, quatro pesos: 400, 500, 600, 700. Sem segunda família. Mono só para ID, token e código, em JetBrains Mono.

| Papel | Tamanho / peso | Entrelinha | Tracking | Onde |
|---|---|---|---|---|
| Display | 48 / 700 | 1,05 | -0,03em | Só o site (hero) |
| H1 | 32 / 600 | 1,15 | -0,02em | Título de página do site |
| H2 | 24 / 600 | 1,2 | -0,015em | Título de seção |
| H3 | 20 / 600 | 1,25 | -0,01em | Título de painel grande |
| Título | 18 / 600 | 1,3 | -0,01em | Título de painel do app |
| Métrica | 32 / 600 | 1,1 | -0,02em | Número de KPI, com `tabular-nums` |
| Corpo | 14 / 400 | 1,45 | 0 | Texto padrão do app |
| Corpo forte | 14 / 500 | 1,45 | 0 | Ênfase dentro de frase |
| Small | 13 / 400 | 1,4 | 0 | Célula de tabela densa, texto de apoio |
| Caption | 12 / 400 | 1,35 | 0 | Subtítulo de painel, ajuda, rodapé de card |
| Overline | 11 / 500 | 1,3 | +0,08em, caixa alta | Etiqueta de seção, badge |

**Regras:**

1. **Mínimo funcional: 12px.** Nada abaixo disso carrega informação. O `text-[8px]`, `[9px]` e `[10px]` que existem hoje saem.

   **Três exceções, abertas pelo dono em 21/09/2026.** A terceira são as tags
   no card do funil, em 10px: o card é estreito, e duas ou três tags em 12px
   empurravam o nome do negócio. A tinta sai de `tintaSobre`, que garante o
   contraste sobre a cor que a tag tem no banco. A segunda é o nome
   (11px) e o e-mail (10px) ao lado do avatar na barra superior: duas linhas
   dentro de 48px de altura só cabem nesse corpo, e o e-mail em 12px cortaria
   no meio. O e-mail fica em `--text-muted`, 5,25:1 sobre o branco. A primeira
   é a trilha de etapas no topo do negócio (`LeadDetailPage`), em 10px. Ela põe até oito nomes de etapa lado
   a lado numa linha, e só nesse corpo o nome inteiro cabe sem virar
   reticências. Mantém peso 600 e o contraste medido (4,52:1 na etapa ativa,
   6,26:1 na concluída). É exceção NOMEADA: qualquer outro 10px continua fora.
2. **Fim dos tamanhos arbitrários.** Hoje há 804 usos de `text-[Npx]` no app. Todo texto passa a cair num dos onze papéis acima.
3. **Tracking negativo só a partir de 18px.** Abaixo disso, zero.
4. **Número é sempre `tabular-nums`** em tabela, KPI e eixo, para os dígitos não dançarem entre linhas.
5. **Caixa alta só em overline.** Nunca em botão, título ou célula.

### 3.3 Espaço e densidade

Escala base 2, com os degraus que a interface realmente usa: `2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 64, 80`.

| Papel | Confortável (padrão) | Compacto (opt-in) |
|---|---|---|
| Linha de tabela | 48px | 40px |
| Padding de cartão | 20px | 16px |
| Gap de grade | 16px | 12px |
| Linha de navegação | 40px | 40px |
| Altura de controle | 36 / 40 / 44px (sm/md/lg) | 32 / 36 / 40px |
| Padding horizontal de controle | 12 / 14 / 18px | 10 / 12 / 14px |
| Padding de página | 24px | 20px |
| Largura máxima de conteúdo | 1440px | 1440px |

O modo compacto é escolha da tela, não do usuário, e vale para tabela longa (100+ linhas) e para o kanban. O resto do app usa o confortável.

### 3.4 Raio

Hoje o app usa **18 valores diferentes** de raio, incluindo `rounded-[5px]`, `[7px]`, `[11px]` e `[15px]`. Passam a existir seis, por papel:

| Papel | Valor | Onde |
|---|---|---|
| Badge, chip quadrado, checkbox | 6px | Badge de status, caixa de seleção |
| Miniatura | 8px | Thumbnail, avatar quadrado |
| Botão, input, select | 10px | Todo controle |
| Menu, dropdown, card de negócio | 12px | Popover, menu, card do kanban |
| Cartão, painel | 16px | Todo painel de conteúdo |
| Modal, drawer | 20px | Sobreposição |
| Pílula, avatar redondo | 999px | Filtro em pílula, avatar |

**Hierarquia dentro de um painel.** O raio diminui conforme desce: painel
**16**, cartão dentro dele **12** (os cartões da trilha do Início, o bloco de
renovação em Planos, o card do kanban), moldura de lista **6** (as listas de
Configurações). Controles seguem os 10 do papel deles, dentro de qualquer um.

Tabela de painel não tem raio nenhum: ela sangra até as bordas do cartão e usa o
raio DELE (ver a linha "Tabela" na seção 4). As tabelas do dashboard tinham
moldura de 6px até 19/09/2026, quando o dono comparou com o material.

**Armadilha das classes do Tailwind.** `rounded-xl` NÃO é o raio de painel: o
`tailwind.config.ts` mapeia `xl` para `--radius-menu` (12px) e `2xl` para
`--radius-card` (16px). Painel é **`rounded-2xl`**. Foi assim que o dashboard
inteiro (22 painéis) ficou em 12px até 19/09/2026, quando o dono notou que o
raio do material era maior que o nosso. O material confirma os 16: o `Card.jsx`
do DS-3, que o `StatCard` da amostra usa, é `border-radius: var(--radius-card)`
com `--radius-card: 16px` (`tokens/radius.css`). O `--radius-panel: 20px` do
material existe, mas é de modal e coluna de kanban, não de painel de conteúdo.

### 3.5 Elevação

Sombra é larga, fria e discreta. **Cartão sempre tem borda de 1px E sombra**, nunca só um dos dois.

| Token | Valor | Onde |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(27,27,27,.05)` | Aba ativa, badge elevado |
| `--shadow-card` | `0 1px 2px rgba(27,27,27,.04), 0 4px 16px rgba(27,27,27,.05)` | Cartão em repouso |
| `--shadow-raised` | `0 2px 4px rgba(27,27,27,.05), 0 10px 28px rgba(27,27,27,.08)` | Cartão em hover, popover |
| `--shadow-overlay` | `0 12px 40px rgba(27,27,27,.14), 0 2px 8px rgba(27,27,27,.08)` | Modal, drawer, menu |

As oito variantes de sombra em uso hoje (`shadow-md`, `lg`, `xl`, `elev-1`, `elev-2`, `elev-3`, `sm`, `none`) colapsam nestas quatro.

### 3.6 Movimento

| Token | Valor | Uso |
|---|---|---|
`--dur-instant` | 80ms | Press |
`--dur-fast` | 120ms | Cor, borda, sombra |
`--dur-normal` | 180ms | Hover de cartão, abrir menu |
`--dur-slow` | 260ms | Abrir drawer, modal |
`--ease-out` | `cubic-bezier(.16,1,.3,1)` | Entrada de elemento |
`--ease-standard` | `cubic-bezier(.2,0,0,1)` | Cor e posição |
`--press-scale` | `.97` | A única transformação do sistema |

**Sem** bounce, spring, parallax, flutuação em loop e brilho pulsante. `prefers-reduced-motion: reduce` desliga toda animação não essencial.

### 3.7 Estados

| Estado | Regra |
|---|---|
| Hover | Superfície clareia: emerald vira `--accent-300`; branco vira `--neutral-50`; fantasma vira `--neutral-100`. Cartão sobe 1px e aprofunda a sombra |
| Press | Escurece um degrau (emerald vira `--accent-500`) **e** escala `.97` |
| Foco | Anel de 3px `rgba(1,216,164,.45)`. Nunca o contorno azul do navegador, nunca `outline: none` sem substituto |
| Selecionado | Preenchimento `--accent-100` (linha de tabela, item de menu) ou pílula emerald cheia (navegação ativa), com `aria-selected` ou `aria-current` |
| Desabilitado | Fundo `--neutral-100`, borda `--neutral-200`, texto `--neutral-400`. Nunca só opacidade |
| Carregando | Esqueleto cinza (shimmer neutro) ou barra indeterminada emerald. Botão troca o ícone da esquerda por um anel de 2px |
| Vazio | Um componente só: quadrado de fundo suave com glifo, título de até 6 palavras, uma linha de orientação, no máximo uma ação secundária |
| Erro | Mesma forma do vazio, em `--danger-bg` com texto `--danger-fg`, e a ação é "tentar de novo" |

### 3.8 Ícones

Lucide React, que o app já usa. Traço 1,75 (2 quando o item está ativo). Tamanhos: 18px em navegação e cabeçalho de painel, 16px em botão e input, 14px em célula de tabela e badge, 12px em chip de variação. Cor `--icon-default` em repouso, `--neutral-900` quando ativo ou sobre superfície emerald. Ícone nunca carrega o acento sozinho, exceto dentro de tile escuro. **Sem emoji na interface.**

### 3.9 Números, moeda e variação

O app é sobre dinheiro, então o formato é parte do sistema, não do componente.

| Item | Regra | Exemplo |
|---|---|---|
| Moeda | `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`, sempre com símbolo | `R$ 24.666,00` |
| Moeda em eixo e chip | Abreviada, sem centavos | `R$ 24,6 mil` |
| Contagem | Número mais o substantivo, singular ou plural correto | `390 negócios`, `1 negócio` |
| Variação | Percentual, mais seta de direção, mais **a janela de comparação**. A janela nunca é omitida | `17,8% ↗ vs. período anterior` |
| Sem base de comparação | Diz que é novo, não inventa percentual | `novo` |
| Zero real x ausência | Zero é `0`, `R$ 0,00`. Ausência é travessão curto, e nunca `0` | `0` x `-` |
| Alinhamento | Coluna numérica alinhada à direita, com `tabular-nums` | |
| Data | `dd/MM/yyyy` e, por extenso, `Qui, 17 Set 26` | |

### 3.10 Gráficos e dados

**Série padrão, nesta ordem fixa:**

| Série | Cor | Papel |
|---|---|---|
| 1 | `--accent-400` `#01D8A4` | A medida principal |
| 2 | `--neutral-900` `#2D2F33` | A comparação (período anterior, meta) |
| 3 | `--accent-600` `#00A879` | Terceira categoria |
| 4 | `--neutral-400` `#B4B4B7` | "Outros" |
| Queda | `--danger-400` `#FD5555` | Perda e declínio. **Nunca cor de categoria** |

**Regras:** grade só no eixo que ajuda a comparar, em `--neutral-200`. Rótulo de eixo em `--neutral-600`, 12px, abreviado (`5k`, `20k`). Preenchimento de área é o único degradê permitido no produto (emerald ou vermelho, indo a transparente). Sem legenda quando há uma série só. Período sem dado desenha o eixo e diz que não há dado, não some.

**A exceção sancionada: cor de canal e cor de pessoa.** Nas repartições por origem de lead (Instagram, Facebook Ads, Google Ads, Meta Ads, TikTok, LinkedIn, YouTube, Email, Orgânico, WhatsApp, Evento, Indicação, Site, Outro), cada canal usa **a cor da própria marca dele**, mantida em `ORIGIN_COLORS`. Motivo: o reconhecimento é instantâneo e o mesmo canal precisa ter a mesma cor nos três painéis que o repartem, senão a comparação entre volume e receita deixa de ser visual. Canal fora da lista cai na rampa de reserva. O mesmo vale para **cor por pessoa**: o avatar, o nome no multiatendimento e a
fatia do anel "Resultado por responsável" usam a cor estável derivada do nome
(`src/lib/iniciais.ts`). É a mesma lógica: a cor identifica quem, e precisa ser
a mesma em toda tela onde a pessoa aparece. Forçar emerald aqui apagaria a
informação.

**Aguardando decisão do dono (18/09/2026): cor de categoria de bloco.** No
editor de automação cada família de bloco tem a sua cor (azul em espera e API,
laranja em ações, roxo em IA, ciano em mensagem), e é ela que liga o nó no
canvas ao painel de configuração dele. É a mesma natureza da cor de canal. A
Onda 4 **manteve** essa cor e tratou só o defeito de leitura: o degrau do meio
não escreve texto de 12px (azul `#3B82F6` dá 3,68:1), então o texto usa o
degrau escuro da própria família (`#1D4ED8`, 6,70:1) e o ícone fica na cor de
identidade, que a 3:1 de componente de UI passa. Falta o dono decidir se a
família entra aqui de vez ou se o editor perde a cor.

**Tipo de atividade NÃO é cor.** Fechado nas ondas 4 e 6, depois de encontrar
a mesma decisão em quatro cópias divergentes (linha do tempo do negócio, pílula
do calendário, seletor de nova atividade, cartões de status do disparo). Cada
tipo já tem ícone, rótulo ou título que o nomeia; a cor fica com o **desfecho**
(ganho, perdido, atrasado, com erro). Achar uma cor acessível para cada tipo
resolveria o contraste e não o problema: verde significava "ligação" E
"realizada" ao mesmo tempo.

Esta é a única família de cor fora da seção 3.1, e foi ela que a tentativa de
17/09 destruiu ao pintar tudo de verde.

---

## 4. Aplicação A: o app (`rezult-crm`)

Produto denso, primeiro dado, superfície branca sobre canvas cinza.

| Superfície | Regra |
|---|---|
| Barra lateral | **Retrátil: 248px aberta, 72px recolhida** (ver abaixo), fundo `--surface-card` branco, separada do conteúdo por régua de 1px `--border-default`. Ícone 18px em `--icon-default`; item ativo em pílula emerald raio 10 com ícone charcoal, traço 2 e `aria-current="page"`; hover em `--surface-hover`. O brilho (`glow-rz`) sai: existia para dar presença no fundo escuro. Ponto de notificação em `--danger-400`. Tooltip em `--surface-inverse` com texto branco |
| Canvas | `--bg-app` `#F7F7F7`, padding 24px, conteúdo até 1440px. Com a barra branca e o cartão branco, é o canvas cinza que separa as camadas: nunca pintar painel de cinza sobre o canvas |
| Cabeçalho de página | Título (H3 18/600 no app), subtítulo em caption com o recorte ativo, e as ações da página à direita. **Sem topbar global** (ver D7) |
| Painel | Cartão branco, raio 16, borda `--border-default`, `--shadow-card`, padding 20. Título 18/600 e subtítulo 12/400 em `--text-muted` |
| Tabela | **A tabela ocupa o cartão inteiro**: sangra até as bordas (as margens negativas cancelam o padding do painel) e o recuo volta nas células das pontas, alinhando a primeira coluna com o título. Cabeçalho **sem fundo tingido**, texto `--text-muted` 13/500 em UMA linha (`nowrap`), separado do corpo por 1px `--border-default`. **Só réguas horizontais**: nenhuma moldura própria e nenhuma linha vertical entre colunas -- é o `DataTable.jsx` do material, onde a tabela É o cartão. Linha 48px, divisória `--neutral-100`, hover `--surface-hover`, selecionada `--surface-selected`. Coluna que ordena mostra a **seta dupla** (`ChevronsUpDown`, 13px, `--icon-default`) mesmo em repouso -- é ela que diz "esta coluna ordena" --, e vira `ChevronUp`/`ChevronDown` em `--icon-strong` no sentido em vigor. Coluna numérica à direita. **Nunca faixa emerald com texto branco** |
| Tooltip de gráfico | **Escuro**: `--surface-inverse` com `--text-inverse`, sem borda, `--shadow-overlay` (o `LineChart.jsx` do material). Título em branco, rótulos em `--neutral-400` (7,4:1 sobre a caixa), o número que explica o desenho de volta ao branco. A bolinha de cor leva um anel claro de 1px, senão a série em charcoal some no fundo. Era branca com borda, e num painel branco se confundia com o conteúdo |
| Cor de gráfico | A rampa da **marca**, em `PALETA`: emerald 400, charcoal, emerald 600, neutral 400, emerald 800, emerald 300, neutral 600, emerald 200. Nada de azul, âmbar, roxo ou rosa -- eles vinham de um tema genérico. A cor entra por POSIÇÃO depois de ordenar as fatias, para a maior levar a primeira cor. Em anel de pessoas ela não identifica ninguém (o nome está na legenda); a cor do avatar segue valendo onde identifica |
| Série temporal | O eixo cobre o período escolhido, com **três aparas**: nunca além de **hoje** (futuro não é zero, é ausência), nunca antes do **primeiro registro da conta** (ali o zero é "não existíamos") e nunca além do fim do período. Compartimento vazio **no meio** permanece zerado: ali o zero é o dado. Nunca apagar um vale só porque ele é baixo |
| KPI | Rótulo em caption, número em Métrica 32/600 com `tabular-nums`. A variação é uma **pílula** com o percentual e a **seta dentro dela**, à direita do número (o `DeltaChip.jsx` do material): número na tinta do texto, só a seta colorida -- verde na alta, vermelho na queda --, para não ler "verde = bom" num cartão como "Total perdidos". O canto superior direito leva o **botão redondo escuro de 30px com a seta diagonal de 15px** (o `size="sm"` do `IconButton`, que é o que o `StatCard` usa) (`IconButton variant="dark"`), que ABRE o recorte do cartão na lista de leads (`/leads?status=won|lost|open`); sem destino, o botão não é desenhado. Sparkline é opcional e só quando o painel vizinho não conta a mesma história |
| Kanban | Coluna com fundo `--neutral-50`, card de negócio branco raio 12 com `--shadow-xs`, faixa de 4px na cor da etapa no topo da coluna |
| Formulário | Label 13/500 acima do campo, input altura 40, raio 10, borda `--border-strong`, foco com o anel emerald. Erro abaixo do campo em `--danger-fg` 12px |
| Drawer e modal | Raio 20, `--shadow-overlay`, scrim `rgba(27,27,27,.45)` com blur de 3px. É o único lugar com translucidez |
| Toast | Sonner, canto inferior direito, raio 12, `--shadow-overlay`. Sucesso em emerald com tinta charcoal, erro em `--danger-bg` |

### A barra é retrátil (19/09/2026)

O material (`tokens/layout.css` e `components/navigation/Sidebar.jsx`) propõe duas
larguras, e o dono decidiu usar as duas: a barra passou a ser retrátil.

| Estado | Largura | O que mostra |
|---|---|---|
| Aberta (padrão) | `--sidebar-w-expanded`, 248px | Marca, grupo **Menu** com o nome de cada tela, grupo **Ferramentas** em botões redondos, e a pessoa com o nome da empresa |
| Recolhida | `--rail-w`, 72px | Só os ícones (as ferramentas empilham em coluna), com o nome em dica ao passar o ponteiro |

Regras, tiradas do componente do material:

1. O botão de **recolher/expandir** fica **sobre a régua** que separa a marca do
   menu, centrado na barra (dono, 21/09/2026): círculo de 20px com fundo de
   cartão e borda, que interrompe a linha em vez de pousar sobre ela. A régua é
   absoluta e vem ANTES do botão no DOM, e o botão é `relative`: é essa ordem
   que faz a linha passar por baixo e desaparecer dentro do círculo. A régua
   leva `pointer-events-none` -- sendo absoluta, ela interceptava o clique e a
   barra não abria (pego ao testar o clique, não ao olhar a tela). Ele já
   esteve ao lado da marca, e ali disputava os 72px da barra recolhida --
   empurrava a marca para fora do centro. Sobre a linha o lugar é o mesmo nos
   dois estados, porque o centro da linha não se mexe ao abrir ou fechar. A
   régua tem **21px acima e abaixo**, igual nos dois estados
   (`--respiro-marca`) -- a mesma medida separa a régua vertical da barra
   superior dos vizinhos dela.
2. A **dica com o nome** só existe recolhida. Aberta, o nome já está escrito.
3. A barra tem **três faixas**, separadas por duas réguas de 1px
   `--border-default`: marca (com a seta), navegação com as ferramentas, e a
   pessoa. As réguas são **elementos**, e não bordas dos blocos vizinhos: como
   borda elas iam de ponta a ponta, e o dono pediu recuo nas laterais. O recuo
   é `mx-3`, o mesmo da navegação, então a linha começa e termina onde começam e
   terminam as linhas de menu (medido: 224px de linha numa barra de 248, 48px
   numa de 72). A de cima tem 10px de folga de cada lado.
4. A largura atual mora numa variável só, `--barra-largura`, definida pelo
   `AppLayout`. A barra, a margem do conteúdo e a tarja de plano fixa no rodapé
   leem dela, e por isso andam juntas na animação (`--dur-normal`, `--ease-out`).
5. A escolha é **preferência de quem olha**, não dado da empresa: fica no
   `localStorage` do navegador (`src/lib/barraLateral.ts`), e sem armazenamento a
   barra abre aberta.
6. Os estados do item são **classes**, não manipuladores de mouse escrevendo
   `style.background`. Foi esse padrão que deixou botões presos no verde escuro no
   Multiatendimento na Onda 4.

Os grupos têm o rótulo do material, em português: **Menu** (as telas de trabalho)
e **Ferramentas** (Agenda, Tutoriais, Notificações, Configurações), em caixa
alta, 11px, peso 500 (o papel overline), só com a barra aberta. A tinta é
`--text-muted`, e não o `--text-subtle` do material, pela regra 4 da seção 3.1.

A seta de expandir fica **no topo**, logo abaixo da marca, e não no pé como no
material: decisão do dono em 19/09, para os dois botões (recolher e expandir)
morarem no mesmo lugar.

O ícone da empresa saiu da barra (decisão do dono em 19/09). Trocar de empresa e
"Adicionar empresa" passaram para o menu da pessoa, que hoje mora na barra
superior: o ícone era o único caminho para as duas coisas.

### A marca (19/09/2026)

A arte oficial é **`public/favicon.png`**: o R branco com a barra emerald sobre
o preto, com o brilho. Um arquivo só serve a aba do navegador, o topo da barra
lateral e o componente `Logo` (que antes desenhava um quadrado emerald com as
letras "RZ" em texto, um lugar reservado de quando não havia arquivo de marca).

| Arquivo | Medida | Para quê |
|---|---|---|
| `favicon.png` | 256px, 48KB | A aba, o topo da barra, o `Logo` |
| `favicon.ico` | 16/32/48 | O `/favicon.ico` que o navegador pede sozinho |
| `apple-touch-icon.png` | 180px | iOS, quando o app vai para a tela de início |
| `og-rezult.png` | 512px, 196KB | Só o cartão de link (`og:image`, `twitter:image`) |

Regras:

1. **O enquadramento é o do arquivo entregue**, sem recorte. Uma versão
   recortada (a marca preenchendo o quadro, como o ícone anterior) foi testada
   e o dono recusou: a folga em volta faz parte do desenho.
2. O preview social tem **arquivo próprio**, e não o favicon: o favicon está em
   256px, que é pouco para o cartão de link.
3. Trocar a arte é substituir os quatro arquivos e **subir o `?v=`** em
   `index.html`, `AppSidebar`, `FundoDoCrm` e `Logo`. Favicon é dos recursos que
   o navegador guarda com mais teimosia: sem trocar a URL, quem já visitou
   continua vendo o ícone velho por tempo indeterminado. Hoje em `?v=4`.
4. O logotipo **horizontal** (`logo-rezult.png`, com o nome escrito, usado em
   Login, Registro e cadastro da empresa) segue o de antes: a arte nova é só o
   símbolo, e um quadrado no lugar de um logotipo deitado quebraria a
   composição daquelas telas. Pendente de uma versão horizontal nova.

### As duas barras são uma peça em L (21/09/2026)

A barra superior e a lateral não se separam: juntas, formam um **L branco** que
envolve o conteúdo.

| Peça | Regra |
|---|---|
| Barra superior | **48px** (`--topbar-h`), mais fina que a lateral, fundo `--surface-card`, **sem texto nenhum** |
| Barra lateral | 72px recolhida, fundo `--surface-card` |
| Conteúdo | Fundo `--bg-app`, `border-top-left-radius: var(--junta-barras)` (16px) e **borda de 1px no topo e à esquerda** |

O truque é o `<main>` ser **branco** como as barras: o canvas cinza mora no
bloco de dentro, que arredonda o próprio canto superior esquerdo. O branco que
aparece na curva é o do `<main>`, e é ele que emenda a barra superior na
lateral.

**A régua é uma linha só.** Ela é a BORDA do bloco de conteúdo, e não uma borda
em cada barra: como o canto é arredondado, ela sobe pela esquerda encostada na
lateral, faz a curva e segue sob a barra superior. Duas bordas separadas se
encontrariam num canto reto, cada uma parando onde a outra começa.

O que a barra superior leva: **nada à esquerda**. À direita, Agenda, Tutoriais,
Notificações e Configurações em botões redondos de 30px, uma régua vertical
curta e o menu da pessoa -- só o avatar, porque nome e empresa não cabem em 48px
e são lidos dentro do menu que ele abre. **Sem busca** e **sem saudação**: o CRM
não tem busca global, e a saudação saiu a pedido do dono em 21/09.

Telas de altura cheia medem por `--altura-util` (`100vh` menos a barra), nunca
por `100vh`.

---

## 6. Como isso vira código

O documento carrega a decisão. O código faz valer. **Uma camada só**, consumida por todas as telas.

```
rezult-crm/
├── src/index.css              ← ÚNICA fonte de tokens (rampa + papéis semânticos)
├── tailwind.config.ts         ← mapeia utilitário para token, sem hex próprio
└── src/components/ui/         ← shadcn lendo os tokens, não hex

rezult-site/
├── site-typography.css        ← tokens de tipo (espelho desta matriz)
└── site-tokens.css            ← a criar: cor, espaço, raio, sombra
```

**Token no CSS, hex no dado.** Token resolve em CSS e só ali. Valor que vira
dado precisa ser cor de verdade:

| Vai para | Formato | Por quê |
|---|---|---|
| Classe, estilo, CSS | `var(--token)` | É o ponto do sistema. Trocar a marca é trocar o token |
| Coluna do banco (cor de tag, de etapa) | Hex | `var(--accent-700)` numa coluna cria um dado que só existe dentro deste app |
| Biblioteca de gráfico (Recharts, canvas) | Hex | Ela recebe como atributo de SVG e interpola em animação |
| Export, e-mail, PDF | Hex | Não há CSS do app do outro lado |

**O portão de verificação.** `npx tsc --noEmit` **não serve** neste projeto: o
`tsconfig.json` tem `"files": []` com referências, e nesse formato o comando
compila zero arquivo. Use `npm run typecheck` (`tsc -b --noEmit`). Descoberto em
18/09/2026, depois de dois erros de tipo passarem por seis verificações que eu
reportei como limpas.

Além dele, a verificação que pega o que o tipo não pega é a varredura de
contraste no DOM, com o app carregado e com dado real: token ausente, cor de
banco e tinta calculada errada não quebram build nem teste, só apagam texto na
tela. E confira o número de nós de texto medidos: se caiu, o app quebrou e o
"zero reprovações" é sintoma, não resultado.

Dois pontos cegos conhecidos dessa varredura, para não tratar falso positivo
como catástrofe: ela não enxerga `linear-gradient` (o `backgroundColor` de um
degradê volta transparente, e a medição acaba feita contra o fundo do pai), e
não distingue texto decorativo de texto que informa (marca d'água e separador
de pontuação, por exemplo).

E uma armadilha de método, que custou caro duas vezes: **varrer uma tela no
estado inicial mede só o esqueleto dela.** O Multiatendimento deu 2 reprovações
com a lista vazia e 22 com uma conversa aberta; o dashboard tem três visões e a
primeira não mostra as tabelas de pódio. O contador de nós de texto denuncia
isso, mas só se a pergunta for feita.

**Proibições, verificáveis por lint:**

1. Nenhum hex literal em `.tsx` ou `.ts`. Eram **3.581** em 17/09, sendo 402 do verde antigo; são 991 em 19/09, quase todos dado.
1b. **Nenhuma classe de paleta do Tailwind** (`text-green-600`, `bg-red-500`, `border-amber-200`). Descoberta em 19/09: não é hex nem token, é uma terceira sintaxe, e por isso passou por baixo da proibição 1 e de quatro varreduras. Havia 110, com quatro verdes convivendo. O `_adherence.oxlintrc.json` do DS-3 **não** pega isto: a regra dele é de hex.
2. Nenhum `text-[Npx]`. Hoje há **804**.
3. Nenhum `rounded-[Npx]` fora dos seis papéis.
4. Nenhum `text-white` sobre superfície emerald.
5. Nenhuma ponte de CSS por tela, como o `.rz-ds-v3` do piloto. Token é global ou não é token.

O DS-3 já traz um `_adherence.oxlintrc.json` com as duas primeiras regras (hex literal e px literal) prontas para o oxlint. Adotá-lo é o que impede a regressão silenciosa.

---

## 7. Ordem de migração

A fundação entra primeiro, as telas depois, em ondas com verificação entre elas. Cada onda termina com `tsc --noEmit`, os 31 testes e conferência no navegador.

| Onda | O que | Por que nesta ordem | Risco |
|---|---|---|---|
| 0 | Tokens em `src/index.css` e `tailwind.config.ts`, mais a troca da fonte para Inter | Nada depende de tela. Muda a base de tudo de uma vez | Alto alcance visual, baixo risco lógico. É onde o dono confirma se gostou |
| 1 | Os 49 componentes `ui/` (shadcn) | Todas as 27 páginas consomem. Corrigir aqui corrige em toda parte | Médio: botão, input e select mudam em todo o app |
| 2 | Tabela, KPI, badge, estado vazio | São a cara do produto e o incômodo declarado com "tabelas, gráficos e números" | Médio |
| 3 | Navegação: rail, menu de empresa, notificações | Depende de A1 estar confirmado | Baixo, alta visibilidade |
| 4 | Telas de operação: Pipeline, Leads, Multiatendimento, Automações | Maior volume de hex hardcoded | Alto: são as telas de uso diário |
| 5 | Dashboard | Já tem o piloto de pintura, serve de aferição | Baixo |
| 6 | Telas de entrada e conta: Login, Registro, Setup, Planos, Configurações | Fora do uso diário | Baixo |
| 7 | Site: `site-tokens.css` e as cinco páginas | Fundação já estará provada no app | Médio |

## 8. Governança

**O que este documento decide:** cor, tipografia, espaço, densidade, raio, elevação, movimento, estado, ícone, formato de número, e como cada superfície usa isso.

**O que ele não decide:** qual painel existe numa tela, qual campo um formulário tem, qual botão de ação aparece, e o que a navegação lista. Isso é produto, e vem do dono. Kit de exemplo de design system é referência visual, nunca inventário de tela.

**Como mudar a fundação:**

1. Quem propõe escreve o que quer mudar, o motivo, e o que quebra.
2. Se a mudança afeta contraste, vem com a medição, não com a impressão.
3. O dono aprova ou recusa. Aprovada, entra na seção 2 como decisão datada, e a versão do documento sobe.
4. Mudança de fundação sem registro aqui é bug, mesmo que esteja bonita.

**Versionamento:** `1.x` para acréscimo de token ou regra nova. `2.0` para troca de cor de marca, de família tipográfica ou de densidade padrão.

---

## Anexo A: o estado de hoje (a evidência)

Medido em 17/09/2026, no `main` do `rezult-crm`.

| Medida | Número | Leitura |
|---|---|---|
| Páginas / rotas | 27 / 35 | O alcance da migração |
| Componentes shadcn (`ui/`) | 49 | Onda 1 |
| Componentes próprios | 59 | Ondas 2 a 6 |
| Hex literais em `.tsx`/`.ts` | **3.581** | Não existe fonte única de cor hoje |
| Só do verde antigo `#128A68` | 402 | A troca de marca passa por 402 pontos |
| Tamanhos de texto arbitrários | **804** | A escala tipográfica não existe na prática |
| Variantes de raio | **18** | Seis passam a ser suficientes |
| Variantes de sombra | **8** | Quatro passam a ser suficientes |
| Camadas de token concorrentes | 3 | `src/index.css`, `.rz-ds-v3` (dashboard), `site-typography.css` |
| Verdes de marca em circulação | 3 | `#128A68` no app, `#01D8A4` no DS-3, `#00B873` no site |

Isso é o que a palavra "inconsistência entre telas" significa em número: cada tela é uma decisão própria porque não havia matriz.

**Onde estava em 18/09, depois das ondas 0 a 4:** 1.927 hex literais (de 3.581),
sendo 659 nas vinte telas e componentes já migrados, contra 2.112 que havia
neles. Os que restam nas telas migradas são, quase todos, cor de identidade de
bloco no editor de fluxo e paleta que vira dado no banco. Os 355 tamanhos
arbitrários que sobram concentram-se nas telas das ondas 5 a 7.

## Anexo B: pendências abertas

1. **Reexporte da logo** para `--accent-400` na barra diagonal e `--accent-700` no azulejo (ver 3.1). Não bloqueia nada: até lá a arte é usada como veio.
2. **Tema escuro:** tokens definidos, seletor fechado. Liberar só após auditoria das 27 páginas.
3. ~~**Anel de "Resultado por responsável"** sai magenta.~~ **Resolvido na onda 3, e o diagnóstico estava errado:** aquela é a cor da pessoa, a mesma do avatar dela em toda tela. Virou exceção registrada na seção 3.10.
4. **Componentes do DS-3** (`components/` da pasta) são React lendo CSS custom properties, e podem ser aproveitados como referência de comportamento na onda 1. Não são dependência.
5. **Acessibilidade:** este documento fixa contraste, foco e alvo de toque. Falta decidir navegação por teclado no kanban e leitura de tabela por leitor de tela.
6. ~~**Texto em inglês no 404.**~~ Resolvido em 18/09: a tela foi reescrita em português, na escala da matriz.
7. **Decisão do dono, aberta desde 18/09:** a cor de categoria de bloco do editor de automação entra na seção 3.10 como exceção sancionada, ou o editor perde a cor? Ver 3.10 e `docs/plans/2026-09-18-onda-4-operacao.md`.
8. **Decisão do dono, aberta desde 18/09:** as cores gravadas no banco antes das paletas novas (uma tag e nove etapas de pipeline, entre 3,7 e 4,3:1) ficam como estão, ou avatar e chip mudam para fundo pálido com tinta escura? A recomendação segue sendo deixar: o componente já escolhe a melhor tinta possível, e a cor nova aparece quando o usuário reeditar.
9. **`ui/button.tsx`** ainda tem dois hex literais (`#E33A3A` e `#BF2A2A`, hover e press do botão destrutivo). Fechar exige dois degraus novos na família `--danger`, que é acréscimo de token e sobe a versão do documento.
10. **A forma `text-[Npx]`** continua nas telas migradas, ainda que todos os valores já estejam na escala. Trocar por utilitário nomeado (`text-xs`, `text-sm`) traz junto a entrelinha do Tailwind, então depende de a escala virar utilitário no `tailwind.config.ts`.
11. **`corDoNome` e `corDoTexto` são dois sistemas de cor por pessoa.** O avatar usa hash em HSL; o nome do remetente no multiatendimento usa duas paletas fixas, uma por lado da conversa. A separação por lado carrega informação real, mas a seção 3.10 diz que a cor da pessoa é a mesma em toda tela. Decidir qual das duas vence.
