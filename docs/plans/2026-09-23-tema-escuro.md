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

## O que falta

A passada visual tela a tela. O que foi corrigido aqui é o que dava para
encontrar por medida (classe crua, token que se anula, cálculo com o branco
cravado). Sobra o ajuste de olho: contraste de um cartão específico, uma sombra
que some no escuro, um ícone claro demais.
