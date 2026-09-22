# A barra superior: entrou e saiu no mesmo dia

Data: 19/09/2026. Matriz: `docs/design-system/rezult-design-system.md` v1.0.

Este registro existe para que ninguém reproponha a ida. O pedido, a execução e a
reversão foram todos do dono, no mesmo dia.

## A ida

Pedido: *"no design system tem uma barra superior que não implementamos, quero
que seja implementada com os ícones de ferramentas e usuário"*.

Foi feita: `BarraSuperior.tsx`, 72px, do `Topbar.jsx` do material. Saudação à
esquerda; Agenda, Tutoriais, Notificações e Configurações em botões redondos de
38px à direita; régua vertical; menu da pessoa com troca de empresa. Sem a busca
do material, porque o CRM não tem busca global.

A barra lateral ficou só com a navegação, e a saudação saiu do hero do Início
para não duplicar.

## A volta

Pedido: *"volte para somente a barra lateral, porém mantenha os ícones que estão
na superior com esse formato redondo"*. E logo depois: *"volte os 4 ícones como
eram anteriormente, iguais aos outros da sidebar"*.

Estado final, que é praticamente o de antes da ida:

| Peça | Onde está |
|---|---|
| Navegação (grupo Menu) | Barra lateral |
| Ferramentas (grupo Ferramentas) | Barra lateral, no pé, **em linha**, igual aos itens do Menu |
| Pessoa | Barra lateral, abaixo das ferramentas |
| Saudação | Hero do Início, de volta |
| `BarraSuperior.tsx` | Removido (cópia em scratchpad) |

## O que ficou da ida, e vale manter

**1. Os painéis ancoram na borda da barra, não no gatilho.** Antes, um popover
aberto por um item da barra nascia a 10px do item e cobria a própria barra. Com
o `PopoverAnchor` (exportado agora em `src/components/ui/popover.tsx`) preso à
borda direita do bloco, o painel começa em 248px com a barra aberta e em 72px
com ela recolhida. Medido nos dois estados.

**2. O ponto de notificação se prende ao ícone, não à linha.** Preso à linha,
ele iria para o fim dela com a barra aberta, longe do sino.

**3. `--altura-util` ficou.** Hoje vale `100vh`, porque nada ocupa o topo. As
oito telas de altura cheia (Configurações, Pipeline ×3, detalhe do lead ×2,
Automações, Multiatendimento ×4) seguem medindo por ela em vez de `100vh`
direto. A ida custou trocar os oito contêineres na mão; a variável faz da
próxima vez uma linha em `src/index.css`.

**4. `--sidebar-header-h`** nomeia os 72px do cabeçalho da barra (marca e seta),
que antes era um número solto.

## O que a ida custou, e por que não foi perdido

Três arquivos tocados e revertidos (`AppLayout`, `FundoDoCrmAoVivo`,
`InicioPage`), mais a matriz, que registrou a D7 como revista e depois
restaurada. A decisão antiga não foi apagada em nenhum momento: quem ler a
matriz vê que houve escolha, e não esquecimento.

## Verificação (estado final)

| Porta | Resultado |
|---|---|
| `npm run typecheck` | limpo |
| `npm test` | 31 passam |
| `npm run build` | 4,77s |
| `npm run lint` | 47 erros, a linha de base (nenhum nos arquivos tocados) |
| Contraste na barra (aberta, recolhida, com hover) | 0 falhas |
| Contraste na página (4 telas) | só as 2 conhecidas do Início (verde do WhatsApp, azul de etiqueta legada) |
| Pé da barra | avatar termina em 860px numa janela de 860px, sem corte |
| Painéis | Tutoriais e Notificações começam em 248px (aberta) e 72px (recolhida) |
