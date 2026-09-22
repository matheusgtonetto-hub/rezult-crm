# Raio e borda dos painéis: o app inteiro

Data: 19/09/2026. Matriz: `docs/design-system/rezult-design-system.md` v1.0.

O dono olhou a amostra do design system ao lado do nosso dashboard e disse achar
o raio do exemplo maior. Estava certo, e o desvio era do app inteiro.

## O que estava errado, e por quê

| | Matriz manda | App tinha |
|---|---|---|
| Raio de painel | 16px (`--radius-card`) | **12px** no dashboard e na maioria das telas; **8px** nos cartões de Configurações |
| Borda de painel | `--border-default` `#E7E7E7` | `border-gray-200` `#E5E7EB` em 32 lugares |
| Sombra | Borda **E** sombra, nunca só uma (seção 3.5) | Cartões de Configurações sem sombra nenhuma |

A causa do raio foi a **armadilha do nome das classes**: `rounded-xl` parece o
raio de cartão, mas o `tailwind.config.ts` mapeia `xl` para `--radius-menu`
(12px) e `2xl` para `--radius-card` (16px). Quem escreveu `rounded-xl` num painel
escolheu, sem saber, o raio de menu.

O material confirma os 16: `components/core/Card.jsx` do DS-3 usa
`borderRadius: var(--radius-card)`, e `tokens/radius.css` traz
`--radius-card: 16px`. O `StatCard` da amostra que o dono mostrou é esse mesmo
`Card`. (O `--radius-panel: 20px` do material existe, mas é de modal e de coluna
de kanban, não de painel de conteúdo.)

## O que foi corrigido

| Onde | Painéis |
|---|---|
| Dashboard (`DashboardPage` + 12 componentes) | 22 |
| Configurações (o `Card` de todas as abas, listas, cartões de conexão, uso do plano) | 13 |
| Início, Pipeline, Leads, Agentes, Disparos, Base da empresa, fundo do cadastro | 21 |

Mais **32 bordas** trocadas de `border-gray-200` para `border-card-border`, em
todo o `src/` — inclusive fora de painel, porque a classe é proibida pela seção
6 da matriz. Hoje o app tem **zero** ocorrências dela.

Os cartões de Configurações ganharam a sombra que a seção 3.5 exige. Os cartões
de conexão trocaram o `hover:shadow-md` do Tailwind pelo `hover:shadow-raised`
do sistema.

## A hierarquia que ficou

Medido no navegador, em dez telas:

```
painel                          16px   (rounded-2xl)
  └── cartão dentro dele        12px   (trilha do Início, renovação em Planos)
        └── moldura de tabela    6px   (tabelas do dashboard, listas de Configurações)
  └── controle                  10px   (botão, input, seletor segmentado)
```

Os 10px do "Escolher arquivo" e os 6px das molduras de tabela não são desvio:
são o papel deles.

## Verificação

| Porta | Resultado |
|---|---|
| `npm run typecheck` | limpo |
| `npm test` | 31 passam |
| `npm run build` | 4,54s |
| `npm run lint` | 47 erros, a linha de base |
| Varredura de raio (10 telas) | nenhum painel fora de 16px |
| Contraste (6 telas) | sem falha nova; permanecem as conhecidas (cor de origem vinda do banco, verde do WhatsApp) |

---

## Adendo: a tabela ocupa o cartão (mesmo dia)

Com o raio corrigido, o dono comparou de novo com o material e apontou o que
ainda diferia: *"no exemplo do claude design os painéis ocupam todo card usando
somente linhas horizontais"*.

Estava certo. Nossas tabelas tinham **moldura própria** (borda de 1px e raio de
6) dentro de um painel que já tem borda e raio, e **réguas verticais** entre as
colunas. Duas linhas desenhadas a 20px uma da outra, e uma grade onde o material
usa só linhas horizontais.

[FONTE:Rezult CRM Design System-3/components/data/DataTable.jsx:20-21]
> `border:'1px solid var(--border-default)', borderRadius:'var(--radius-card)', boxShadow:'var(--shadow-card)', overflow:'hidden'`

Ou seja: no material a tabela **é** o cartão. As células têm `padding: 0 16px`,
o cabeçalho é `border-bottom` sozinho, e não há nenhuma borda vertical.

### O que mudou

| Antes | Agora |
|---|---|
| `MOLDURA = "overflow-x-auto rounded-[6px] border border-card-border"` | `MOLDURA = "overflow-x-auto -mx-5 -mb-5"` |
| Cabeçalho com `[&>th]:border-r` | só a régua de baixo |
| Células das pontas com `pl-3`/`pr-3` | `pl-5`/`pr-5`, alinhando a primeira coluna com o título |
| Rótulo de cabeçalho quebrando em três linhas | `whitespace-nowrap`, uma linha (e a largura fixa de 96px saiu) |

As margens negativas cancelam o `p-5` do painel: a tabela sangra até as bordas e
encosta no rodapé. Medido: 1px de cada lado, que é a borda do cartão.

Painel com conteúdo **depois** da tabela usa `SANGRIA_LATERAL` (só `-mx-5`), que
não puxa o rodapé. É o caso do UTM, que traz a nota dos leads sem rastreio
embaixo: medido, 12px entre a tabela e a nota, 24px até o fim do cartão.

### Verificação do adendo

- Sete painéis de tabela medidos: sangria de 1px nos dois lados, zero réguas verticais.
- Contraste nas três abas do dashboard (347 nós cada): 0 falhas.
- `npm run typecheck`, `npm test` (31), `npm run build`, `npm run lint` (linha de base): tudo limpo.

---

## Adendo 2: tela branca ao passar o mouse no anel (20/09/2026)

Sintoma: passar o mouse no painel "Resultado por responsável" derrubava a
aplicação inteira em tela branca.

Exceção: `TypeError: Cannot read properties of undefined (reading 'map')` em
`CaixaTooltip`, na linha do `linhas.map(...)`.

### Causa

O `Anel` desenha o donut em CAMADAS (um `<Pie>` por fatia, para os cantos
arredondados não brigarem entre si). Cada camada montava um objeto novo com
três campos:

```js
data={[{ nome: c.nome, valor: c.valor, cor: c.cor }]}
```

É esse objeto que o Recharts devolve no `payload` do tooltip. O `PainelAnel` lê
dele o campo `linhas` para montar o popup, e recebia `undefined`. O
`DonutDistribuicao` não quebrava porque o tooltip dele só usa nome e valor.

A cópia entrou junto com as camadas, na Onda 5, e ficou latente: só quebra no
anel que usa `linhas`.

### Correção, em dois níveis

1. **A raiz**: as camadas passam a carregar a fatia INTEIRA (`data={[c.dados]}`
   e `data={[base]}`), então qualquer campo que um painel adicione continua
   chegando ao tooltip.
2. **A rede de proteção**: `CaixaTooltip` recebe `linhas = []` por padrão. Um
   popup incompleto é um detalhe num canto da tela e não pode derrubar a página
   inteira.

### O que isso ensina sobre a verificação

O sintoma apareceu nos meus próprios testes -- três capturas de tela saíram em
branco e o contador de erros do console subiu para 5 -- e eu tratei como falha
do mouse sintético do Playwright, seguindo em frente. A captura em branco ERA o
defeito. Quando a evidência não bate com o esperado, a hipótese "a ferramenta
falhou" precisa ser a última, não a primeira.

Verificação depois da correção: mouse passado por seis pontos da faixa de cada
anel, nas três abas do dashboard, com zero exceções e os 11 painéis de pé em
todas elas.
