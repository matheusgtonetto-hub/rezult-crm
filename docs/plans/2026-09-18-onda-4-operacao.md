# Onda 4 — telas de operação

Data: 18/09/2026. Matriz: `docs/design-system/rezult-design-system.md` v1.0.

Escopo: Pipeline, Leads, Multiatendimento e Automações, mais os 16 componentes
que só elas usam. 23.409 linhas, o maior volume da migração.

## O que apareceu no caminho, e não era pintura

Quatro defeitos reais, todos da mesma família: **a mesma decisão existia em
várias cópias, e as cópias divergiram.** Nenhum deles é visível lendo uma tela
por vez, que é justamente por que sobreviveram.

### 1. A paleta de cores de tag existia em três cópias, duas nunca medidas

`SettingsPage` tinha a paleta escurecida na Onda 2 (0 de 20 reprovando).
`AutomacoesPage` tinha **outras duas cópias**, com a paleta original.

Medido: das 10 cores que Automações oferecia, **4 não alcançam 4,5:1 com
nenhuma tinta** (`#EF4444` 3,76, `#3B82F6` 3,68, `#8B5CF6` 4,23, `#EC4899`
3,80). Mais dois dos três defaults cravados no código: `#D97706` (4,21) e
`#3B82F6` (3,68).

Isso não era erro de CSS. **Cor de tag é dado gravado no banco.** O usuário
criava a tag pelo painel de automação, escolhia uma das quatro, e o app
persistia uma cor que ele mesmo já tinha rejeitado em Configurações. O erro
sobrevive à correção da tela.

Agora há `src/lib/paleta-de-tags.ts`, com a paleta e os dois tons nomeados das
tags que o sistema cria sozinho (a de ativação de agente e a de interesse
comercial). Cinco consumidores leem de lá.

### 2. A cor por pessoa tinha mais três cópias

A Onda 2 disse que consolidou três cópias numa só. **Estava incompleto.**
Havia seis, e as outras três não apareceram na busca porque tinham outro nome:
`colorFromName` em `LeadDrawer`, e `colorFromString` em `AppSidebar` e
`RezultPayPage`. As duas últimas ainda na luminosidade 45%, onde o pior matiz
dá 2,26:1 com a inicial branca.

A de `LeadDrawer` era pior: uma paleta de 8 cores fixas com `color: "#FFF"`
cravado. O âmbar `#F59E0B` com branco dá 2,15:1.

### 3. O mapa de aparência da linha do tempo estava duplicado, e três pares eram ilegíveis

`ACT_META` existia palavra por palavra em `MultiatendimentoPage` e em
`LeadDrawer`. É a mesma linha do tempo em dois lugares.

Medido, com o mínimo de 3:1 que vale para um glifo de 13px:

| Tipo | Antes | |
|---|---|---|
| Ganho | `#22C55E` sobre `#DCFCE7` | **2,07:1** |
| Ligação | `#22C55E` sobre `#DCFCE7` | **2,07:1** |
| E-mail | `#F59E0B` sobre `#FEF3C7` | **1,93:1** |

E a mesma cor apontava para dois sentidos: verde era "ganho" **e** "ligação",
roxo era "follow-up" **e** "transferência", azul era "reunião" **e** "etapa
alterada".

A saída não foi procurar doze cores acessíveis. Cada tipo **já tem um ícone
próprio**, e é o ícone que carrega a categoria. A cor ficou com o que ela sabe
dizer sozinha: desfecho. Ganho no verde da marca, perdido no vermelho do
sistema, WhatsApp no verde (cor de canal, exceção sancionada), o resto neutro.
Medido depois: 4,69:1 no neutro, 4,30 no verde, 5,91 no vermelho.

> **Isto muda a aparência da linha do tempo** e merece o seu olhar. O mapa
> inteiro está em `src/lib/atividades.ts`, num arquivo só, então voltar atrás é
> editar três constantes.

### 4. O fallback de cor de membro tinha cinco valores

`memberColors[x] ?? "..."` aparecia com `#888888`, `#AAAAAA`, `#888`,
`var(--text-muted)`, `var(--accent-700)` e `var(--neutral-700)`. Com a inicial
branca por cima, `#888888` dá 3,54:1 e `#AAAAAA` dá 2,32:1. Passou a existir um
só, que é o papel já declarado no token: "fundo de avatar sem cor".

## A pintura

| Frente | Quantas | O que mudou |
|---|---|---|
| Cromo neutro | **1.181** | Cinza, branco e borda literais viram token. A propriedade CSS decide o alvo: `#E5E5E5` em `border` vira `--border-default`, em `background` vira `--neutral-200` |
| Semânticos | **216** | Vermelho vira `--danger-*`, verde vira `--accent-*`, âmbar vira `--warning-*` |
| Raio | **128** | Os oito valores fora da escala (1, 2, 3, 4, 5, 7, 11, 14) caem nos seis papéis |
| Tipografia | **448** | A escala da seção 3.2 passa a valer |
| Botão primário inline | **23** | Verde escuro com texto branco vira emerald com tinta charcoal, como todo `Button` do shadcn desde a Onda 1 |
| `text-white` sobre emerald | **5** | Proibição 4 da matriz |
| Tinta branca sobre cor gerada | **7** | Vira tinta medida por `tintaSobre` |

Hex literais nos 20 arquivos: **2.112 → 659**. Os 659 que ficam são, quase
todos, cor de identidade de bloco no editor de fluxo (ver abaixo) e paleta de
dado protegida.

### A tipografia é a mudança que se vê

338 tamanhos abaixo de 12px e 279 de 11px. A regra da matriz: mínimo funcional
12px, e **11px existe só como overline** (caixa alta, peso 500, tracking
+0,08em). Então 232 usos de 11px em texto comum subiram para 12, e os 8 de
overline ficaram.

Verificado no navegador, a 1440px: nenhum texto cortado, nenhuma rolagem
horizontal nova nas quatro telas.

Sobre a forma: os tamanhos agora caem na escala, mas a **classe** continua
sendo `text-[12px]` em vez de `text-xs`. Trocar a forma muda também a
entrelinha que o utilitário do Tailwind traz junto, então isso fica para quando
a escala virar utilitário nomeado. A proibição que importa (tamanho fora da
escala) está cumprida: restam 4 classes e 8 inline abaixo de 12px, todas
overline.

## Uma decisão de fundação que é sua, não minha

**No editor de fluxo, a cor identifica a categoria do bloco.** Azul é espera e
API, laranja é ações, roxo é IA, ciano é mensagem. A cor liga o nó no canvas ao
painel de configuração dele, e some se tudo virar emerald, numa tela onde o
usuário monta com uma dúzia de tipos de bloco.

Isso é exatamente a natureza da exceção de cor de canal e cor de pessoa da
seção 3.10. **Não repintei.** Mantive a cor como identidade e tratei só o que
era defeito de leitura: o degrau do meio carregando texto de 12px.

| Família | Identidade (ícone, borda) | Texto |
|---|---|---|
| Azul | `#3B82F6` (3,68:1) | `#1D4ED8` (6,70:1) |
| Laranja | `#F97316` (2,80:1) | `#92400E` (7,09:1) |
| Roxo | `#8B5CF6` (4,23:1) | `#7C3AED` (5,70:1) |
| Ciano | `#0EA5E9` (2,77:1) | `#0369A1` (5,93:1) |

Ícone fica no degrau de identidade: glifo é componente de UI, mínimo 3:1, e o
roxo do ícone de IA dá 4,23:1.

**O que preciso do senhor:** se essa família entra na seção 3.10 como exceção
sancionada (com o nome "cor de categoria de bloco"), ou se o editor deve perder
a cor e ficar só com os ícones. Pela governança da seção 8, acrescentar uma
exceção é mudança de fundação, e quem aprova é o dono.

## Um erro meu, pego pela própria verificação

Unifiquei o fallback de cor de membro em `var(--neutral-700)`, que é token. Mas
esse valor **é lido por `tintaSobre`**, e `tintaSobre` devolvia charcoal para
qualquer coisa que não soubesse medir, inclusive `var()`. Resultado: **347
iniciais de avatar em charcoal sobre cinza escuro, a 1,7:1.** A varredura no
DOM pegou antes de eu reportar qualquer número.

A correção não foi só voltar atrás. `paraRgb` passa a resolver `var(--token)`
contra o documento. A regra "token no CSS, hex no dado" continua valendo, mas a
função que mede não pode depender de todo mundo lembrar dela.

Outro erro meu na mesma verificação: a varredura semântica mandou todo texto
verde para `--accent-700` sem olhar o fundo. A rampa é explícita: `--accent-700`
é verde sobre **cartão branco** (4,52:1), e sobre o canvas cinza ele reprova
(4,22:1). 38 declarações foram para `--accent-800`.

## Verificação

| Checagem | Resultado |
|---|---|
| `npm run typecheck` | Sem erro |
| Testes | 31 passaram |
| Build | Passou |
| Nós de texto medidos | 9.574 em 11 telas (app carregado, dado real) |
| Texto cortado ou rolagem horizontal nova | Nenhum |

### Contraste, por tela

| Tela | Reprovas | O que são |
|---|---|---|
| `/automacoes` (lista e editor) | **0** | |
| `/agentes`, `/disparos`, `/configuracoes` | **0** | |
| `/leads` | 2 | Tag em `#3B82F6` gravada no banco |
| `/multiatendimento` (vazio) | 2 | 1 rosa do Instagram (cor de canal, 4,34:1) e 1 marca d'água decorativa |
| `/multiatendimento` (com conversa aberta) | 16 | Ver "a medição incompleta", abaixo |
| `/pipeline` | 10 | 1 elemento inativo (isento) e 9 cores de etapa gravadas no banco |
| `/inicio` | 2 | Cor de canal gravada |
| `/calendario` | 5 | Dias fora do mês, inativos (isentos) |
| `/dashboard` | 1 | Falso positivo, ver abaixo |

**Zero reprovações causadas por decisão de código nas quatro telas da onda**,
depois das correções de 18/09 descritas em "a medição incompleta".
O que resta é cor gravada no banco antes das paletas novas, elemento inativo e
cor de canal.

Na Onda 3 o número era 18 em 5.172 nós. Agora são 22 em 9.574, com quase o
dobro de tela medida e seis páginas novas entrando na conta.

### A medição incompleta, e o que ela escondia

A primeira medição do Multiatendimento deu 70 nós de texto. **Era o estado
vazio.** Com uma conversa aberta são 199, e aí apareceram quatro defeitos que a
tela realmente mostra todo dia:

| O que | Antes | Agora |
|---|---|---|
| Nome do atendente na conversa | `--accent-700` sobre o fundo do chat, 4,33:1 | `--accent-800`, 6,3:1 |
| Crachá do atendimento (`#1002`) | Mesma coisa | `--accent-800` |
| Legenda de imagem na bolha do agente | Branco a 80%, 3,46:1 | Branco cheio, 4,52:1 |
| Chip de tag ("Demonstração") | A própria cor como texto sobre 12,5% dela, 2,25:1 | `tintaDeChip`, que escurece até passar |

O chip é o mesmo padrão que a Onda 2 corrigiu nas outras telas, e este passou
batido porque estava num ramo da tela que só existe com conversa aberta.

**A lição é de método, não de cor:** varrer uma tela no estado vazio mede o
esqueleto dela. O contador de nós serve para isso, e eu tinha o número (70) sem
ter feito a pergunta.

Sobram 16, nenhuma de decisão de código: 13 são o separador "·" entre metadados
(3,29:1, que é o mínimo de elemento de UI, e forçá-lo a 4,5 deixaria a
pontuação com o mesmo peso do texto que ela separa), 1 é a cor de canal do
Instagram, 1 é a marca d'água e 1 é um botão desabilitado.

### Um ponto cego do meu auditor

A `/dashboard` acusou "branco sobre branco, 1:1". Não é. É uma medalha de
ranking com degradê dourado, e `getComputedStyle().backgroundColor` reporta
degradê como transparente, então a varredura compõe contra o branco do pai.
**A varredura não enxerga `linear-gradient`.** Vale lembrar disso antes de
tratar um 1:1 como catástrofe.

## Dois defeitos apontados pelo dono, depois da onda

### O botão que ficava verde escuro depois do clique

Meu. Troquei o fundo de repouso de três botões do Multiatendimento para
`--surface-accent` e **não mexi nos manipuladores**: o `onMouseLeave` continuava
devolvendo `var(--accent-700)`, o valor antigo. O botão nascia menta, o ponteiro
passava uma vez e ele ficava verde escuro para sempre. O hover ainda usava um
`#2A9677` fora da rampa.

Agora os três seguem os mesmos estados do `Button` do shadcn: repouso em
`--surface-accent`, hover em `--accent-300`, retorno ao repouso. Medido com
ponteiro real: `#01D8A4` → `#5FE7BE` → `#01D8A4`.

**A lição:** estado de repouso e manipulador de evento são a mesma decisão de
pintura em duas sintaxes. Minha varredura lia `background: "#X"` e não
`style.background = "#X"`. Fechei essa lacuna também nos neutros.

### Os botões de `/agentes` no verde errado

Não era esquecimento de escopo, era papel trocado. A Onda 1 varreu
`bg-[#128A68]` para `bg-[color:var(--accent-700)]`: o token certo, mas o
**papel** errado. `--accent-700` é tinta e verde fechado; superfície de ação é
`--accent-400`.

Eram 17 `<Button>` com a tripla
`bg-[color:var(--accent-700)] hover:bg-[color:var(--accent-700)]/90 text-white`
sobrescrevendo a variante padrão. A correção foi **apagar a sobrescrita**, não
escrever outra: o `Button` já sabe a resposta desde a Onda 1.

Alcançou `/agentes` (13), `/rezult-pay` (4) e a Base da empresa (2), ou seja
passou do escopo da onda, porque é uma linha por ponto e deixar metade seria
criar a inconsistência de novo.

**O que ficou de propósito em `--accent-700`:** avatar de agente, bolha de
mensagem do próprio usuário, ponto de status e barra de progresso. Nenhum é
ação, e todos passam de contraste. Se o senhor quiser esses no emerald também,
é um pedido, não um defeito.

## Próxima onda

**Onda 5:** dashboard. É a menor em volume e já tem o piloto de pintura da
tentativa de 17/09 para servir de aferição. Depois vêm as telas de conta
(Onda 6), onde a varredura já mostrou o que espera: `/rezult-pay` tem 37
reprovações, quase todas `#AAAAAA` a 10 e 11px, e `/configuracoes/integracoes`
tem um `text-white` sobre emerald a 1,85:1.
