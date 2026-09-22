# Receita do ganho: o preço de tabela por cima do negociado

Data: 20/09/2026. Reportado pelo Geomar: *"esse gráfico de evolução no período
por receita está puxando o valor do produto pré-cadastrado, não o valor real da
receita cadastrada na hora do ganho"*.

Ele está certo, e a investigação achou **dois** defeitos. O segundo é maior que
o primeiro.

## Defeito 1: o diálogo de ganho abria com o preço de tabela

[FONTE:src/pages/LeadDetailPage.tsx, `handleWon`]
```js
const v = prod?.defaultValue ?? lead.value ?? 0;   // o PRODUTO primeiro
setWonCustomValue(v > 0 ? fmtBRL(v) : "");
```

E o `handleConfirmWon` grava esse campo no negócio:
```js
finalValue = customVal;
await updateLead(lead.id, { productId: wonProductId, value: finalValue });
```

Ou seja: negócio fechado a R$ 2.191 com um produto de tabela R$ 797 abria o
diálogo mostrando **797**, e confirmar sem reparar gravava 797 por cima. O texto
de apoio até anunciava isso ("Valor pré-definido do produto"), mas o efeito era
apagar a negociação.

**Caso real no banco** (negócio "Carolina Janot", 11/09/2026):

| Hora | Evento |
|---|---|
| 13:48:13 | ganho com **R$ 2.191,00** (o negociado) |
| 13:48:14 | reaberto |
| 13:48:18 | ganho com **R$ 797,00** (a tabela do produto) |

O negócio ficou valendo 797. O dashboard passou a mostrar a tabela como receita.

Na empresa do Geomar, 7 dos 9 negócios ganhos têm valor **exatamente igual** à
tabela do produto.

### Correção

O campo abre com o valor DO NEGÓCIO, e só cai na tabela quando o negócio ainda
não tem valor. Escolher outro produto no diálogo continua sugerindo a tabela
daquele produto, que ali é a informação nova. O texto virou "Valor do negócio.
Altere se fechou por outro valor."

## Defeito 2: o mesmo negócio contado duas vezes

Achado ao ler o cálculo do gráfico. Ele percorria as ATIVIDADES:

```js
lead.activities.forEach(act => {
  if (act.type === "won") { bucket.ganhos++; bucket.ganhosValor += lead.value; }
```

Um negócio ganho, reaberto e ganho de novo tem duas atividades de ganho, e
entrava duas vezes -- na contagem e na receita. O caso acima tem exatamente
isso.

**Medido no banco:**

| Empresa | Ganhos | Com ganho repetido | Receita correta | O que o gráfico somava | Inflação |
|---|---|---|---|---|---|
| Geomar Junior | 8 | 4 | R$ 2.257 | R$ 3.804 | **+69%** |
| Consultório Samantha | 9 | 1 | R$ 7.130 | R$ 12.130 | +70% |
| Rezult CRM | 34 | 1 | R$ 24.666 | R$ 25.666 | +4% |
| Mão Amiga | 36 | 1 | R$ 10.700 | R$ 11.300 | +6% |

### Correção

Cada compartimento do gráfico (mês, dia ou hora) passa a lembrar quais negócios
já contou, por desfecho. O mesmo negócio entra uma vez, mesmo com três ganhos
registrados. Vale para "Resultado no período" e para "Resultados por
horário/dia".

Os KPIs do topo nunca tiveram esse erro: eles contam LEADS, não atividades.

### Verificação

Com a empresa "Consultório Samantha" aberta, o KPI diz R$ 7.130,00 em 9
negócios. A consulta ao banco contando cada negócio uma vez devolve os mesmos
R$ 7.130,00 em 9 negócios, e a curva de Ganhos em Receita agora fecha com isso.

## Defeito 3: o valor não era congelado no fechamento (corrigido em 20/09)

O gráfico somava `leads.value`, que é o valor ATUAL do negócio. Editar um
negócio ganho reescrevia a receita de meses fechados, e o valor do fechamento só
existia dentro do texto da atividade, de onde não dá para somar.

### Correção

Migration `add_won_value_to_leads`: coluna `leads.won_value`, nula em negócio
que nunca foi ganho.

| Quem | O que faz |
|---|---|
| `markLeadWon` | Congela o valor informado no diálogo; sem valor (botão do drawer, automação), congela o que o negócio vale no momento |
| `markLeadOpen` | Limpa o valor ao reabrir: o negócio voltou a ser negociação |
| `receitaDoGanho(lead)` | `wonValue ?? value`, o ponto único de leitura |

O `??` cobre os negócios ganhos antes da coluna. O **backfill não reinterpretou
o histórico**: gravou o valor vigente (`won_value = value`), para nenhum número
que os clientes já veem mudar sozinho. Daqui para frente o valor é gravado no
ato.

Passaram a usar `receitaDoGanho`: KPIs do topo, curva do período, desempenho por
responsável, ranking de produtos, painel de tags e o contador de vendas da tela
de Agentes (que lê `won_value` direto do banco).

### Verificação

| O quê | Resultado |
|---|---|
| Migration | aplicada; 87 ganhos, **0** sem valor congelado |
| Backfill | receita dos ganhos R$ 44.953 antes e depois: nada mudou na tela |
| Coluna em uso | negócio de teste ganho a 800 e depois editado para 1.000: `valor atual 1.000, congelado 800`; registro apagado em seguida |
| KPIs no navegador | "Total em vendas" segue R$ 7.130,00 em 9 negócios |

## O que fica em aberto

**Os dados já gravados.** O negócio "Carolina Janot" está valendo R$ 797 quando
o ganho anterior registrava R$ 2.191. Corrigir é alterar dado de cliente em
produção e depende de quem sabe qual dos dois é o preço certo -- o texto das
duas atividades de ganho continua no histórico e permite reconstruir.
