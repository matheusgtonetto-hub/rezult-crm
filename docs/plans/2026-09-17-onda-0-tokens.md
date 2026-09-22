# Onda 0 — a camada de tokens

Data: 17/09/2026. Matriz: `docs/design-system/rezult-design-system.md` v1.0.

## O que esta onda fez

Trocou a base visual do app inteiro de uma vez, sem migrar nenhum componente e
sem criar nenhuma tela, painel, campo ou botão.

| Arquivo | O que mudou |
|---|---|
| `src/index.css` | A camada de tokens: rampa emerald (9 tons), neutros (12), semânticos, papéis semânticos, séries de gráfico, raio por papel, elevação, movimento e densidade. Os aliases HSL do Tailwind e do shadcn passaram a apontar para esses valores |
| `tailwind.config.ts` | `sans` e `heading` para Inter; raio `xl`/`2xl`/`3xl` (12/16/20) para cobrir menu, cartão e modal; sombras `xs`/`card`/`raised`/`overlay`; easings do sistema |
| `src/components/AppSidebar.tsx` | Decisão D6: barra branca com régua de 1px, ícone cinza em repouso, item ativo em pílula emerald com ícone charcoal. Antes era o verde da marca chapado com ícones brancos, o que com o emerald novo daria 1,85:1 |
| 7 arquivos de página e componente | Varredura mecânica de cor em estilo inline: 39 pontos de emerald usado como tinta viraram `var(--text-link)`, e 5 de branco sobre emerald viraram `var(--text-on-accent)` |
| `src/pages/CalendarPage.tsx` | Seletor de visão e pílula do dia de hoje: tinta charcoal sobre o emerald |
| `src/main.tsx`, `src/pages/DashboardPage.tsx` | A ponte `.rz-ds-v3`, que era o piloto por tela, foi removida. Token agora é global (regra 5 da seção 6 da matriz) |

## Densidade

Os tokens de densidade confortável (`--row-h: 48px`, `--control-h-md: 40px`,
`--pad-card: 20px`) estão declarados, mas **ainda não aplicados**: quem define
altura de linha e de controle hoje são as classes de cada componente. Isso é
trabalho das ondas 1 e 2, e é lá que a densidade muda na tela.

## O andaime (temporário)

Duas regras em `@layer utilities` seguram o contraste nas telas que ainda não
foram migradas:

```css
.bg-primary[class*="text-white"],
.bg-primary [class*="text-white"] { color: var(--text-on-accent); }
.text-primary { color: var(--accent-800); }
```

Elas existem porque 20 pontos escrevem `text-white` sobre superfície emerald por
classe, e 140 usam `text-primary` como tinta. **Morrem quando a última onda
terminar.** Não são licença para escrever `text-white` sobre verde em código novo.

## Verificação

| Checagem | Resultado |
|---|---|
| `tsc --noEmit` | Sem erro |
| Testes | 31 passaram |
| Build de produção | Passou, 7,88s |
| Console do navegador | Sem erro em 10 rotas |
| **Contraste sobre superfície emerald** | **Zero reprovações em 10 telas** (dashboard, leads, pipeline, tarefas, automações, configurações, multiatendimento, disparos, agentes, início), medido no DOM com composição de alfa |

O medidor de contraste rodou no navegador contra os dados reais da conta, e não
sobre hex no código: ele compõe o fundo real de cada nó, inclusive camadas
translúcidas, e compara com a cor computada do texto.

## O que a varredura revelou de herança (não é desta onda)

Texto reprovando contraste por cores que **não são** do sistema e que já estavam
lá antes:

| Tela | Nós reprovados | Padrão dominante |
|---|---|---|
| `/leads` | ~820 | Iniciais brancas sobre avatares em `#06B6D4`, `#AAAAAA` e `#888888` |
| `/pipeline` | 28 | Iniciais brancas sobre âmbar `#F59E0B` |
| `/calendario` | 12 | Dias fora do mês em `#CCCCCC` sobre branco |
| `/multiatendimento` | 11 | Avatares de cor gerada por hash |
| `/agentes` | 9 | Chips em ciano e no verde antigo `#128A68` |

São a paleta de avatar e de chip, que entram na **Onda 2** (badge, avatar, chip,
estado vazio). Ficam registradas aqui para não se perderem.

## Pendências levantadas nesta onda

1. **Mono:** a matriz pede JetBrains Mono; o app segue em Geist Mono, que já está vendorizada. Trocar quando a JetBrains for vendorizada, ou emendar a matriz.
2. **Azul de informação** (`--info`, `#3B82F6`): mantido porque 117 pontos o usam. Decidir na Onda 2 se vira neutro ou permanece como sexta cor semântica.
3. **Emoji na interface:** o cabeçalho de `/inicio` traz "Boa noite 🌃". A matriz proíbe emoji em interface de produto (seção 3 do DS-3, princípio 2 daqui). Sai numa onda de conteúdo.
4. **`NotFound`** tem link "Return to Home" em inglês, contra a regra de UI 100% em pt-BR.
5. Os arquivos `brilho-botao-verde` e `texto-brilho` em `src/index.css` são efeitos importados do site e usam `#00E599`. Revisar quando a Onda 7 tocar o site.

## Como voltar atrás

`git diff` de 15 arquivos, nenhuma migração de dados, nenhuma alteração de
consulta, rota ou permissão. Reverter é `git checkout` nos 15. Cópias de
segurança do estado anterior de `index.css`, `tailwind.config.ts` e
`AppSidebar.tsx` ficaram na pasta temporária da sessão.

## Ajuste pedido pelo dono, mesmo dia

Depois de circular pelo app, o dono apontou três coisas, todas conferidas contra
o material do design system antes de mexer:

| Apontamento | O que o material diz | O que foi feito |
|---|---|---|
| "A barra está muito fina" | `tokens/layout.css`: 248px com rótulo, 72px colapsada só com ícones | A faixa foi de 52px (valor sem origem) para **72px**, via token `--rail-w`. O alvo do ícone foi de 36 para 40px, que é a altura de linha de navegação do sistema |
| "Em /leads o quadrado da esquerda está verde" | `components/forms/Checkbox.jsx`: desmarcado é fundo branco com contorno `--border-strong`; marcado é emerald com o "certo" em charcoal | O `ui/checkbox` tinha `border-primary`, então a caixa **vazia** era verde. Agora: 18px, contorno neutro de 1,5px quando vazia, emerald com tinta charcoal quando marcada. E o estado indeterminado virou traço, não "certo": com uma linha marcada, a caixa do cabeçalho afirmava que tudo estava selecionado |
| "A linha selecionada não fica na cor ativa" | `components/data/DataTable.jsx`: linha selecionada em `--surface-selected` | O `TableRow` do app pintava selecionado em cinza (`bg-muted`) e a `/leads` nem declarava o estado. Agora o `TableRow` usa emerald claro `#CFFAEB` em `data-[state=selected]`, e a `/leads` declara o estado. Vale para toda tabela do app |

Verificado no navegador com dados reais: duas linhas selecionadas em emerald
claro, caixas vazias neutras, cabeçalho com traço, e o kanban e o dashboard sem
deslocamento com a faixa mais larga.

## Próxima onda

**Onda 1:** os 49 componentes `ui/` do shadcn, contra a matriz. É onde botão,
input, select, badge e diálogo passam a nascer certos, e onde a densidade
confortável começa a valer de verdade.
