# Tema escuro

Pedido do dono (23/09/2026): "precisamos criar a versão escura, e quero que seja
um ícone acima de Configurações na barra lateral que alterna entre os temas".

## O que já existia

Mais do que parecia. O bloco `.dark` no `index.css` estava escrito desde a v1 do
design system, com a escala de neutros invertida, e `profiles.theme` já gravava
a escolha. O que faltava era: a porta de entrada (o seletor dizia "Em breve"), o
que o CSS não alcança, e o que quebrava.

## As três coisas que quebravam

**1. Classes cruas que não invertem.** 153 ocorrências de `bg-white`,
`border-gray-*`, `bg-gray-*`, `text-gray-*` e `text-black` espalhadas por 25
arquivos. Foram para os papéis do sistema (`bg-card`, `border-input`,
`bg-muted`, `text-foreground`, `text-muted-foreground`), que já invertem
sozinhos. As telas de antes do login ficaram de fora: são claras por decisão de
marca, e a classe `.dark` nem chega nelas.

**2. A tinta das etiquetas de tag.** `tintaDeChip` compunha o fundo do chip
contra branco, cravado como `255` no código, e ESCURECIA a cor até passar 4,5:1.
No escuro, o cartão é `#1A1D21`: o mesmo cálculo dava tinta escura sobre fundo
escuro, e a etiqueta sumia. Agora a superfície é lida do documento e a busca
anda para o lado certo, clareando sobre fundo escuro.

**3. Papéis que se anulavam no escuro.** `--surface-inverse` apontava para o
`neutral-950`, que no escuro é o próprio canvas: o tooltip ficava invisível, com
texto branco sobre branco. `--danger-fg` e `--warning-fg` são tons fechados,
feitos para fundo branco, e davam 1,6:1 sobre o `--danger-bg` escuro. Os quatro
ganharam valor próprio no `.dark`.

## A rampa da marca não inverte

Regra do design system, mantida de propósito, e é ela que evita uma auditoria de
500 chamadas. Cada tom do verde faz dois trabalhos: o `--accent-700` é fundo de
botão em 22 lugares e tinta de texto em 103; o `--accent-50` é fundo em 68 e os
tons 50/100/200 são TINTA em 25. Inverter o tom quebraria metade dos usos de
cada um.

A consequência visível: a pílula de fundo `--accent-50` continua clara no
escuro. Ela lê como etiqueta, e a tinta verde fechada dentro dela segue legível.

## Onde o botão ficou

No pé da barra lateral, logo acima de Configurações, com a mesma altura, o mesmo
ícone de 18 e a mesma dica quando recolhida. É botão, e não link: nunca fica em
estado "ativo", porque o realce emerald dos vizinhos quer dizer "é aqui que você
está", e aqui não há um "aqui". O ícone mostra para onde se vai (lua no claro,
sol no escuro).

O seletor de Configurações continua existindo e agora anda junto: os dois leem o
mesmo estado.

## Sem lampejo branco

O tema é aplicado em `main.tsx`, antes do primeiro quadro, lendo
`localStorage["rezult:tema"]`. O perfil no Supabase continua sendo a verdade
entre dispositivos, mas ele demora, e sem essa memória local todo F5 começava
claro e virava escuro quando a resposta chegava.

`color-scheme: dark` entra junto: barra de rolagem, autofill e controles nativos
seguem o tema sem CSS adicional.

## A passada tela a tela (23/09/2026)

Feita no navegador, nas duas direções (escuro e claro), com um medidor rodando
dentro da página em vez de julgamento a olho: para cada elemento visível, o
contraste real entre a tinta e a superfície que está de fato atrás dela, pela
fórmula da WCAG. Screenshot não serve para isto, e foi justamente o medidor que
mostrou que a leitura visual das capturas não era confiável.

O que ele achou, e que estava mesmo quebrado:

| Onde | Medida | Causa |
|---|---|---|
| Linha da conversa selecionada, Multiatendimento | 1,29:1 | `--accent-50` é superfície GRANDE, e continuava clara |
| Etiqueta "Administrador", Usuários | 1,54:1 | fundo `#FFF8E7` cravado com tinta de token |
| Botão "Automação" do lead | 1,94:1 | roxo `#6B21A8` cravado |
| Nome do remetente no chat | 2,22:1 | paleta escolhida para fundo claro |
| Etiqueta do negócio (#1080) | 2,38:1 | `--accent-800` como tinta |
| Telefone do remetente | 3,05:1 | mesma paleta |
| Botão "Avançar" | 3,74:1 | `--accent-700` como tinta |

A correção de raiz foi separar os DOIS papéis do verde. O `--accent-700` era
fundo de botão em 53 lugares e tinta de texto em 103; no claro o mesmo valor
serve aos dois, no escuro eles querem lados opostos. Os fundos saíram para
`--surface-accent-strong` e `--border-accent`, que não invertem. O que sobrou em
700/800 é só tinta, e os tons 50/100/200 são só superfície (medido: zero usos
como tinta) -- então os dois grupos passaram a inverter, cada um para o seu
lado. Foi isto que resolveu quatro das sete linhas da tabela de uma vez.

O resto virou token: as dez cores de nome do chat, o roxo da IA, a borda e o
fundo de aviso/erro/informação, a linha "Negócios" do gráfico (charcoal cravado,
invisível no escuro; branca agora, a pedido do dono), o canvas da tela de
negócio e a tela de carregamento do app (folha branca em tela cheia no escuro).

### O que ficou de propósito

Os pastéis do editor de automações (as etiquetas "EM BREVE" e "Atenção", os
ladrilhos de ícone, as notas adesivas) trazem a própria tinta cravada do mesmo
matiz. São pares coerentes, legíveis nos dois temas: ali o conjunto é da cor, e
não do tema.

### Dois defeitos antigos que apareceram e não são do escuro

- Os textos de dica "+ Empresa", "+ E-mail", "+ Documento" usam `--neutral-400`:
  3,55:1 no escuro e 2,90:1 no claro. Já estava assim.
- O botão "Perdido" é branco sobre `--danger-400`: 3,18:1 nos dois temas.
