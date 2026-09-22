# Onda 5 — dashboard

Data: 18/09/2026. Matriz: `docs/design-system/rezult-design-system.md` v1.0.

Escopo: `DashboardPage` e os 15 painéis de `components/dashboard/`, mais o
`DateRangePicker`. 5.177 linhas.

Esta é a onda mais curta em volume e a mais interessante em conteúdo: o
dashboard já tinha passado por uma tentativa de pintura em 17/09 (a que foi
revertida), e por isso a **cor dele já estava quase toda certa**. Eram 41 hex
literais contra 2.112 nas telas de operação.

O que estava errado não era *qual* cor, era **qual cor fazia o quê**.

## A faixa esmeralda com texto branco

O dashboard tinha três: os cabeçalhos das tabelas "Top SDR" e "Top Closer", e o
cabeçalho do "Performance por UTM". Todas em `--primary` chapado com
`text-white`.

**1,85:1.** É o pior contraste do app, e é literalmente o que a decisão D2 foi
escrita para eliminar ("nunca faixa emerald com texto branco", seção 4).

O mais instrutivo é que cada uma vinha com um comentário no código defendendo a
escolha. O do UTM dizia que, sobre a faixa, "a distinção passa a ser feita por
opacidade e peso do branco, que funcionam sem depender de matiz". O raciocínio
está certo sobre matiz e errado sobre a base: não adianta distinguir dois
brancos se nenhum dos dois se lê.

| | Antes | Agora |
|---|---|---|
| Fundo do cabeçalho | `--primary` chapado | Transparente |
| Tinta | Branco (1,85:1) | `--text-muted` 13/500 |
| Divisa | A troca de cor | Linha de 1px `--border-default` |
| Réguas entre colunas | Branco a 20% | `--border-default` |
| Coluna com filtro ativo | Branco em peso 600 | `--accent-800`, o verde que o app usa para "escolhido" |

Sem a faixa, **a cor volta a poder significar alguma coisa**. Era esse o custo
escondido: para o texto sobreviver ao fundo verde, todo o resto da faixa teve
que virar branco, e a marcação de coluna filtrada perdeu a cor que a
identificava.

A **linha de total** do UTM continua em emerald, porque ali o destaque é o
ponto. O que mudou foi a tinta: charcoal (7,25:1) no lugar do branco.

## O pódio: duas implementações, e a que tinha justificativa também não passava

As medalhas de 1º, 2º e 3º existiam em dois lugares.

O `DashboardPage` usava a paleta do Tailwind com número branco: `bg-yellow-500`
(**1,92:1**), `bg-gray-400` (**2,54:1**), `bg-amber-600` (**3,19:1**), e
`bg-muted-foreground/40` da quarta posição em diante. O número do pódio era o
texto menos legível da tela.

O `UtmAttributionPanel` usava degradês metálicos, com um comentário longo
explicando a escolha: ouro e prata clássicos dão 2,1:1 e 1,8:1, então o degradê
desce até um tom escuro do mesmo metal, "e é essa metade que sustenta o número".

**Medi essa justificativa, e ela não fecha.** A ponta escura do ouro (`#B8860B`)
dá 3,25:1 com branco, e a da prata (`#78828F`) dá 3,90:1. Só o bronze passava. E
num degradê o texto atravessa as duas metades, então quem manda é a pior.

A saída não é escurecer os metais (o ouro vira oliva em `#96690A`). É a mesma
regra que o sistema já usa para o emerald na D2: **superfície clara pede tinta
charcoal.**

| Medalha | Tom | Tinta | Contraste |
|---|---|---|---|
| Ouro | `#F2CE63` | charcoal | 8,80:1 |
| Prata | `#CBD0D7` | charcoal | 8,65:1 |
| Bronze | `#D48F55` | charcoal | 5,02:1 |
| 4º em diante | `#008762` | branco | 4,52:1 |

Uma cópia só, em `src/components/dashboard/medalhas.ts`. Sumiu o degradê e, com
ele, o ponto cego da varredura de contraste que eu tinha registrado no fim da
Onda 4: era exatamente essa medalha que aparecia como "branco sobre branco,
1:1".

## O resto

| Item | Antes | Agora |
|---|---|---|
| Número da medalha | 9px | 12px, em pastilha de 18px |
| Tinta dentro da fita do heatmap de horários | `#0C231D`, um verde quase preto fora da rampa | `#2D2F33`, o charcoal do sistema |
| "Ganhos" na velocidade de etapa e no gráfico | `#10B981`, um segundo verde | `#008762` |
| "Outros motivos" no anel | `#94A3B8` | `#B4B4B7`, a série 4 da matriz |
| Anel vazio | `#E5E7EB` | `#E7E7E7`, `--border-default` |
| Fallback de cor de membro | `#888` | `#525154`, o mesmo da Onda 4 |
| Avatar de atendente | `text-white` sobre cor gerada | Tinta medida por `tintaSobre` |
| Tipografia | 24 tamanhos abaixo de 12px | Nenhum |
| Raio | Um `rounded-[5px]` | `rounded-[6px]`, o papel de badge |

Os hex que **ficam** (35 no total) são todos dado: a série padrão de gráfico da
seção 3.10, as cores de canal de `ORIGIN_COLORS`, a paleta de reserva e os tons
das medalhas. Recharts recebe cor como atributo de SVG, e a regra "token no CSS,
hex no dado" manda que continuem hex.

## Um erro meu, na mesma sessão

Ao trocar o texto do cabeçalho do UTM, usei `--text-subtle` num rótulo de 12px.
A regra 4 da própria seção 3.1 diz que `#8A8A8E` **não serve para texto abaixo
de 16px** (3,44:1). A varredura pegou na primeira medição. Virou `--text-muted`.

## Verificação

| Checagem | Resultado |
|---|---|
| `npm run typecheck` | Sem erro |
| Testes | 31 passaram |
| Build | Passou |
| Lint | 47 erros, idêntico à linha de base (nenhum novo) |

### Contraste, nas três visões do dashboard

Desta vez medi **cada aba**, e não só a que abre primeiro. Foi a lição da Onda 4,
onde o Multiatendimento foi medido no estado vazio.

| Visão | Nós medidos | Reprovações |
|---|---|---|
| Performance Geral | 227 | **0** |
| Por Pipeline | 90 | **0** |
| Da Equipe | 91 | **0** |

**Zero em todo o dashboard**, inclusive nas reprovações que não são de código:
aqui não há cor gravada no banco nem elemento inativo visível.

## Três coisas apontadas pelo dono, depois da onda

### O seletor de visão sumiu no fundo

Ele estava em `bg-muted/40`, cinza a 40%. Sobre o canvas isso compõe em
`#F5F5F5` contra `#F7F7F7`: **1,02:1**. Dentro dos cartões brancos o mesmo
código dava `#FAFAFA` sobre branco, **1,05:1**.

O markup não era meu, mas o efeito foi: `bg-muted/40` foi escrito quando o
canvas do app era **branco**, e a Onda 0 aplicou a decisão D5, que tornou o
canvas `--bg-app` (`#F7F7F7`). Desde então o preenchimento não fazia trabalho em
lugar nenhum do app. Quem desenhava o controle era só a borda de 1px.

Medi os cinco controles segmentados que existem (três no dashboard, um no
`ResultadoResponsavelPanel`, um no `/inicio`) e todos estavam assim.

A regra que entra: **a trilha é o oposto do que está atrás.**

| Onde | Trilha |
|---|---|
| Sobre o canvas cinza | Branca, com `--shadow-xs`, como a barra de navegação |
| Dentro de cartão branco | `--neutral-100` chapado, como sulco |

### `/rezult-pay` removido

O dono confirmou que a tela não está no ar e não será implementada. Ela estava
**órfã**: nenhum link na navegação, nenhum `navigate` no código, só a rota
registrada em `App.tsx`. Saíram o arquivo (749 linhas), o `import`, a `<Route>`
e a linha do inventário em `docs/07-frontend.md`. O arquivo está versionado
(commit `1230d69`), e há cópia em scratchpad.

Com ela vão embora as 37 reprovações de contraste que a varredura tinha
encontrado ali, e que estavam listadas como o trabalho da Onda 6.

### O 404 estava em inglês

Apareceu ao conferir que `/rezult-pay` tinha mesmo saído: a tela do 404 dizia
"Oops! Page not found" e "Return to Home". A regra do projeto é explícita
("NUNCA hardcodar textos em inglês na UI") e a pendência já estava no anexo B da
matriz.

Reescrita em português e na escala da matriz: o "404" vira overline (é
referência, não manchete), a frase leva o peso de título, e o botão é o botão do
sistema. O link aponta para `/`, que cai no `SmartRedirect` e sabe decidir entre
`/inicio` e `/login` — o 404 é alcançável com e sem sessão.

## Correção pedida pelo dono: os gráficos, como o material desenha

Comparando com a amostra do design system, dois gráficos estavam diferentes.

### O painel de linhas era de área

O `LineChart.jsx` do material traça `fill="none"`: é linha pura. A seção 3.10 da
matriz **permite** o preenchimento de área ("o único degradê permitido no
produto"), mas permitir não é prescrever, e o painel que o material desenha é de
linha.

| Item | Antes | Agora (como o material) |
|---|---|---|
| Preenchimento | Degradê a 24% sob a curva | Nenhum |
| Traço | 2px | 2,5px, com ponta e junta redondas |
| Grade | Tracejado `3 3`, cor de moldura | `4 5` em `--border-default` |
| Ponto ativo | r=4 com traço branco | r=5 com **miolo** branco e aro da série |

E entraram o verde da marca e o charcoal no lugar dos dois verdes vizinhos que
estavam ali ("Negócios" em `#01D8A4` e "Ganhos" em `#008762`, cuja distinção
dependia de enxergar a diferença entre eles).

**Qual fica com qual, o dono corrigiu.** Eu tinha lido "medida principal" como o
volume de entrada e posto o verde em "Negócios". A leitura dele é a que o painel
serve: o verde da marca marca o **ganho**, que é o resultado; "Negócios" é o
universo contra o qual esse resultado se lê, ou seja a comparação, que é o papel
do charcoal na seção 3.10.

**O que NÃO segui do material:** o rótulo de eixo, que ele propõe em `#8A8A8E` a
11px. A regra 4 da seção 3.1 recusa esse cinza abaixo de 16px (3,44:1), e a
matriz já registra esse desvio como consciente. Fica `--neutral-600` a 12px.

### O anel não tinha ponta redonda

O `DonutChart.jsx` do material desenha cada fatia com `strokeLinecap="round"`.
No Recharts o equivalente é `cornerRadius` no `<Pie>`, e o valor sai da conta,
não do olho: a faixa do anel tem 26% do raio, e a meia-lua perfeita é metade
disso.

**E aí apareceu um defeito que só a tela mostrou.** Com o raio cheio, fatia cujo
arco é mais curto que o próprio raio de canto **degenera**: no painel "Motivo de
perda por origem", três motivos que somam menos de 1% viraram blocos soltos
FORA da faixa do anel.

O material não tem esse problema porque lá a ponta é um `strokeLinecap` num
traço, e traço curto demais vira um ponto redondo dentro da faixa. O Recharts
arredonda os quatro cantos do setor, e sem espaço ele se deforma.

A saída foi medir antes de arredondar: o raio é o menor entre a meia-faixa e a
metade do arco da menor fatia. Com fatias grandes o anel fica idêntico ao do
material; com uma fatia mínima em cena, todas cedem um pouco e nenhuma quebra.

### A maior fatia é a base, e levei duas tentativas para acertar

O dono apontou duas vezes, e as duas estavam certas.

**Primeira tentativa, errada:** deixei as fatias lado a lado, tirei o
arredondado da maior e mantive nas outras. Resultado: no encontro entre duas
aparecia a quebra, um canto reto colado num canto redondo. Arredondar todas
trazia de volta o defeito da fatia mínima.

**Segunda tentativa, também errada:** empilhei em camadas, mas coloquei por
baixo o arco mais LONGO, que carrega a cor da MENOR fatia. O pedido era o
contrário.

**O desenho certo:** a maior fatia é um círculo INTEIRO de base, sem canto
(arco de 360 graus não tem ponta à vista). As outras assentam em cima dela, cada
uma indo das 12 horas até a soma dela para trás, com as pontas redondas:

```
fatias (desc)   s1=50%   s2=30%   s3=20%

base       círculo inteiro na cor de s1, sem canto
camada 2   arco 0 -> 50% (s2+s3) na cor de s2, pontas redondas
camada 3   arco 0 -> 20% (s3)    na cor de s3, pontas redondas, no topo

visível, no sentido do relógio a partir das 12h:
  s3 de 0 a 20, s2 de 20 a 50, e s1 ocupando o resto
```

A ponta redonda de cada camada **pousa** na camada debaixo. Não existe junção
entre duas pontas, então não existe quebra. E some o defeito da fatia mínima:
o canto é calculado **por camada**, a partir do arco dela, então a camada larga
recebe a meia-lua cheia e a estreitíssima recebe o que couber. Antes o limite
era global, e bastava uma fatia de 1% para apagar o arredondado do anel inteiro.

**O acerto entre camada e fatia sai de graça:** o SVG entrega o evento a quem
foi pintado por último naquele ponto, e por último ali está exatamente a cor que
se vê. Medido nos dois anéis: a 80 graus o navegador entrega "Facebook Ads", a
260 entrega "Outro", que é o que se enxerga em cada lugar.

**Uma armadilha que a mudança abriu, e que o teste pegou:** com o arco passando
a ser definido por `startAngle`/`endAngle`, o valor do dado deixou de desenhar o
setor, e eu o zerei para 1. Só que o tooltip lê esse mesmo campo, e passou a
mostrar "Facebook Ads / Quantidade 1" em vez de 177. Com um dado só por `<Pie>`
o valor não interfere na geometria, então ele voltou a ser o número verdadeiro.

### Todas as tabelas do dashboard viraram a mesma tabela

O dono pediu duas coisas: a barra de total do UTM sem o verde, e todos os
painéis de tabela no formato do UTM, com filtro nas colunas.

**A barra de total** tinha ficado emerald com tinta charcoal. Ela existia para
"fechar a tabela entre duas bandas", mas a banda do topo já tinha saído. Agora é
a última linha, sem fundo, separada por uma régua mais forte, e as cores de
estado voltaram a ela: o próprio comentário antigo admitia que "perdidos em
vermelho e vendas em verde não sobrevivem" em cima da faixa.

**As tabelas.** Eram nove no dashboard, e só a de UTM era tabela de verdade. As
outras oito eram listas com cabeçalho escritas à mão, com três jeitos
diferentes de separar cabeçalho do corpo. Refazer as oito à mão repetiria o
problema, então o desenho foi para uma peça só, `TabelaPainel.tsx`, e cada
painel declara as colunas:

| Declaração | O que o cabeçalho vira |
|---|---|
| `filtro` | O menu do UTM: um valor, ou todos. Coluna filtrada em `--accent-800` |
| `valor` | Botão de ordenar, com a seta só na coluna ativa |
| `primeiroCrescente` | O primeiro clique ordena crescente (a coluna "Etapa" dos funis) |
| `largura` | Largura fixa, para o rótulo não quebrar em três linhas |

| Tabela | Filtro | Ordena |
|---|---|---|
| Produtos mais vendidos, Responsáveis com mais vendas | nome | as 3 de número |
| Performance por tag | tag | as 3 de número |
| Top SDR, Top Closer, Atendentes | nome | as de número |
| Tabela de conversão | — | etapa (ordem do funil) e as de número |
| Tempo médio por etapa | — | etapa e as de número |

Três decisões dentro disso:

1. **Funil não perde a ordem do funil.** Nas tabelas de etapa a coluna "Etapa"
   ordena pela posição no pipeline, é por ela que a tabela abre e é para ela
   que um clique volta. Ganhos e Perdidos ficam presos no pé: são o desfecho do
   funil, não mais uma etapa. "Conv. etapa anterior" é calculada antes de
   ordenar, então não muda de sentido quando a linha troca de lugar.
2. **A medalha segue a linha, não a posição.** No Top SDR e no Top Closer, com a
   tabela ordenada por conversão, o ouro continua em quem mais agendou. É a
   regra que o UTM já seguia.
3. **A legenda dos anéis ganhou moldura e cabeçalho, mas não ordenação.** Ela já
   filtra (clicar numa linha isola a fatia no anel), e a ordem dela é a ordem do
   empilhamento do anel ao lado. Ordenar desalinharia a legenda da figura.

**Um defeito que a tela mostrou:** a tabela de responsáveis estourou para o
lado, com "Receita gerada" cortado. Em tabela de layout automático a coluna de
nome crescia até caber o e-mail inteiro e empurrava o dinheiro para fora. A
coluna de nome passou a absorver o que sobra e truncar (`w-full max-w-0`), e
valor em dinheiro não quebra linha. Medido depois nas 11 tabelas das três
visões: nenhuma estoura.

`StageVelocityPanel` ("Tempo médio por etapa") foi convertido, mas **nenhuma
tela o usa**: não há import dele em lugar nenhum. Fica anotado.

### O que ficou diferente da amostra, de propósito

O tooltip. O do material é uma pastilha escura com **uma** série; o nosso é um
cartão branco com as três, porque o nosso gráfico tem três curvas e um valor só
não responderia "três o quê". Se o senhor preferir a pastilha escura, é troca de
um componente (`CaixaTooltip`).

## Uma observação fora do escopo da matriz

Nas tabelas "Top SDR" e "Top Closer", a coluna Conversão mostra `0%` em verde de
sucesso. Verde em zero lê como "bom" onde não há resultado. Isso é semântica de
produto, não de pintura, e a seção 8 diz que a matriz não decide o que um painel
diz. Fica anotado para o senhor decidir.

## Próxima onda

**Onda 6:** telas de entrada e conta (Login, Registro, Setup, Planos,
Configurações, Integrações). Encolheu: `/rezult-pay`, que respondia por 37 das
reprovações previstas, foi removido. O que resta de conhecido é
`/configuracoes/integracoes`, com um `text-white` sobre emerald a 1,85:1 — a
última faixa verde do app — e seis rótulos em `--text-muted` a 80% de opacidade.
