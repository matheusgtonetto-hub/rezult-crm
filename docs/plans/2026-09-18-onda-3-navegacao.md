# Onda 3 — navegação, e a correção do cabeçalho de tabela

Data: 18/09/2026. Matriz: `docs/design-system/rezult-design-system.md` v1.0.

## O cabeçalho de tabela que o dono apontou

Ele viu que o cabeçalho da tabela em `/leads` estava na mesma cor do fundo.
Estava: `#F7F7F7` sobre o cartão branco dá **1,07:1**. O tint existia no código
e não na tela.

A origem: aquele fundo veio da ponte do piloto (`.rz-ds-v3`), onde ele
substituía a faixa esmeralda com texto branco. Quando os tokens viraram globais,
a substituição veio junto, mas **o material não usa fundo tingido no
cabeçalho**: em `components/data/DataTable.jsx` o `th` é transparente e o que
separa o cabeçalho do corpo é uma linha de 1px em `--border-default`.

Ao medir, apareceu um segundo defeito meu, da Onda 2: o cabeçalho estava com
48px em vez de 44px, porque o `h-12` que pus no `TableRow` também atinge a
linha do `thead`.

| Item | Antes | Agora |
|---|---|---|
| Fundo do cabeçalho | `#F7F7F7` (1,07:1 contra o cartão) | Transparente |
| Separação | Só o tint, que não se via | Linha de 1px `--border-default` |
| Altura do cabeçalho | 48px | 44px (`[&_tr]:h-11` no `thead`) |
| Divisória do corpo | `#E7E7E7`, mesmo peso da moldura | `--neutral-100`, mais leve |

A `/leads` também sobrescrevia a divisória com `border-card-border` na linha, o
que anulava o peso leve do corpo. O override saiu.

## Navegação

| Item | Antes | Agora |
|---|---|---|
| Brilho na logo (`glow-rz`) | Animação em loop de 4s | Removida. Existia para dar presença sobre a barra escura, e a barra é branca desde a D6 |
| Brilho no ícone de Agentes (`glow-agentes`) | Animação em loop de 3s | Removida (seção 3.6: sem movimento permanente). A pastilha "IA" já distingue o item |
| Pastilha "IA" | Branca sobre a barra branca | Badge suave: `--accent-100` com tinta `--accent-800` (6,26:1) |
| Contorno do ícone da empresa | Branco a 30%, feito para fundo escuro | `--border-default` |
| Ponto de notificação | `#EF4444` com texto branco | `--danger-500`, que é o vermelho de superfície do sistema |
| Avatar do usuário no pé | Fundo branco sobre barra branca | Superfície de avatar do sistema |
| Iniciais da empresa | `text-white` cravado sobre cor gerada | Tinta calculada por luminância |
| `PipelineSidebar` | Tinta `#09090b`, raio de 4px, `fontFamily` repetida em cada item | `--text-heading`, raio do sistema, família herdada do `body` |
| `FreePlanBanner` | Paleta do SITE importada: `#05080A`, `#00E599`, halo de 35% | Tokens: superfície inversa, emerald da marca, tinta charcoal, sem halo |

O banner segue sendo a única faixa escura do app, o que é proposital: ele vende,
e por isso se separa do resto. O que mudou é que agora ele usa os valores da
matriz em vez de uma paleta própria.

## Regressão minha, encontrada na verificação

A escala "Métrica" de 32px que apliquei na Onda 2 não caberia num KPI de
dinheiro: `R$ 10.475.302,00` tem 17 caracteres e o número encostava na borda com
quatro cartões na fileira. Virou `clamp(20px, 2.1vw, 32px)`: mantém os 32px onde
cabe e encolhe em cartão estreito, sem quebrar linha. Medido: 21px de folga à
direita a 1440px.

## Uma exceção que a matriz passou a registrar

O anel de "Resultado por responsável" sai magenta, e eu tinha listado isso como
pendência na Onda 1. Estava errado da minha parte: aquela é a **cor da pessoa**,
derivada do nome, a mesma do avatar dela em toda tela. É a mesma lógica da cor
de canal, e forçar emerald apagaria a informação. A matriz agora diz isso na
seção 3.10, junto da exceção de canal.

## Verificação

| Checagem | Resultado |
|---|---|
| `npm run typecheck` | Sem erro |
| Testes | 31 passaram |
| Build | Passou |
| Nós de texto medidos | 5.172 (app carregado, com dado real) |
| Reprovações de contraste | **18**, sendo 6 de elemento inativo (isentos) e 12 de cor gravada no banco |

Nenhuma reprovação nova. As 12 de dado antigo seguem aguardando a decisão do
dono (deixar, ou trocar avatar e chip para fundo pálido com tinta escura).

## Próxima onda

**Onda 4:** telas de operação (Pipeline, Leads, Multiatendimento, Automações). É
o maior volume de sobrescrita por tela: tamanhos de texto abaixo de 12px,
paddings próprios e raios fora da escala. É também onde mora a maior parte dos
2.000 e poucos literais de cor que ainda restam no app.
