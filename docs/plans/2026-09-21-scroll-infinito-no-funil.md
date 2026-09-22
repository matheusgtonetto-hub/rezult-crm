# Funil: 20 por leva, carregando ao rolar

Data: 21/09/2026. Pedido do dono: as colunas do funil devem carregar 20 negócios
por vez e buscar a leva seguinte **sozinhas** quando a pessoa chega no fim, em
vez de exigir um clique em "Carregar mais".

## O que mudou

| Antes | Agora |
|---|---|
| `POR_PAGINA = 50` | `POR_PAGINA = 20` |
| Botão "Carregar mais (N restantes)" | `SentinelaDeScroll` no fim da coluna |

O tamanho da leva passou a importar mais do que antes: a leva chega enquanto a
pessoa rola, e 50 linhas por coluna deixavam a primeira pintura mais lenta sem
ninguém pedir.

A paginação em si não mudou: continua por janela (aumenta o LIMIT e refaz a
consulta), pelos motivos já registrados em `useColunasDoKanban.ts`.

## O sentinela

Um elemento fino no fim da lista. Quando entra no campo de visão, pede a leva
seguinte. Usa `IntersectionObserver`, e não um ouvinte de scroll: o observer
avisa quando o alvo cruza a borda, fora da linha do scroll, enquanto um
`onScroll` dispararia dezenas de vezes por gesto medindo geometria no mesmo
quadro em que o navegador rola.

Ele também não precisa saber qual é o contêiner rolável: o observer respeita o
recorte dos ancestrais, então o sentinela só conta como visível quando aparece
DENTRO da coluna.

## Duas armadilhas que apareceram no caminho

**1. O observer preso a um nó morto.** A primeira versão criava o observer num
`useEffect`. O funil re-renderiza muito (arrastar, filtrar, contadores), e
quando o React trocava o nó do sentinela o observer seguia observando o
**antigo**, já fora do documento -- que nunca volta a intersectar nada. Medido:
a coluna carregava a primeira leva e travava em 20, com cinco rolagens até o fim
sem efeito. O nó passou a mandar, por callback ref: a cada troca, o observer
velho é desconectado e um novo observa o atual.

**2. O sentinela que continua visível.** Depois de carregar, a lista cresceu mas
o sentinela segue no fim e ainda à vista. O observer não avisa de novo, porque
não houve NOVA interseção, e a rolagem longa travaria a cada leva. Por isso, ao
fim de cada busca, o observer é reconectado: a primeira observação de um alvo já
visível dispara na hora.

O guard de "já estou buscando" é lido de um ref dentro do disparo, e não desliga
o observer -- senão o sentinela pediria a página seguinte, e a seguinte, até o
fim da coluna.

## Adendo: o scroll voltava ao topo (mesmo dia)

O dono reportou: a cada 20 cards novos, a rolagem pulava de volta para o começo
da coluna. E faltava um sinal de que algo estava sendo carregado.

### A causa

Entre pedir a leva e recebê-la, a coluna ficava com **zero cards** por um
instante. Medido: o conteúdo caía de 4364px para 513px -- a altura da área
visível --, e como não havia mais o que rolar, o navegador zerava o `scrollTop`.
Quando os 40 cards chegavam, a rolagem já estava no topo.

O `placeholderData: keepPreviousData` das consultas não cobre esse caso: o
limite faz parte da chave, e dentro de `useQueries` as consultas são casadas por
hash -- a do limite novo entra como consulta inédita, sem predecessora de onde
herdar dados.

### A correção

O hook guarda o **último resultado bom de cada coluna** num ref e o serve
enquanto a leva nova está em voo. A lista nunca esvazia: ela cresce por baixo, o
scroll fica onde estava, e o carregamento aparece só no sentinela.

O sentinela ganhou o ícone girando (`Loader2`) com "Carregando mais…", e altura
**fixa** de 28px com ou sem busca em voo -- se a altura mudasse ao aparecer o
ícone, a lista cresceria alguns pixels justo quando a pessoa está no fim do
scroll.

### Verificação do adendo

Rolando até o fim cinco vezes seguidas, registrando o scroll antes e depois de
cada leva:

| Rolou para | Cards antes | Cards depois | Scroll depois | Manteve |
|---|---|---|---|---|
| 8203 | 40 | 60 | 8203 | sim |
| 12543 | 60 | 80 | 12543 | sim |
| 16883 | 80 | 100 | 16883 | sim |
| 21223 | 100 | 120 | 21223 | sim |
| 25563 | 120 | 134 | 25563 | sim |

O ícone aparece durante a busca e sai quando ela termina (observado nas amostras
de 350ms).

## Verificação

Coluna "Em contato" (134 negócios abertos), rolando até o fim repetidamente:

```
20 → 40 → 60 → 80 → 100 → 120 → 134 → 134
```

Vinte por rolagem, nada de cascata (se disparasse em série, saltaria direto ao
total), e para sozinho quando a coluna acaba.

Coluna com 1 negócio: nenhum sentinela renderizado, nenhum pedido extra.

| Porta | Resultado |
|---|---|
| `npm run typecheck` | limpo |
| `npm test` | 31 passam |
| `npm run build` | 8,2s |
| `npm run lint` | 47 erros, a linha de base |
| Console no funil | zero erros |
