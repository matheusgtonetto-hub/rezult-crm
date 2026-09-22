# Dois produtos no mesmo negócio: viabilidade

Data: 20/09/2026. Pedido de clientes, levantado a pedido do dono.

**Resposta curta:** é viável, e o caminho é claro. Não é uma mudança pequena: o
vínculo é 1:1 no banco, e sete lugares do produto leem isso. O trabalho não está
em permitir dois produtos, está em decidir **quanto cada um vale** -- sem isso o
dashboard passa a mentir.

## O que existe hoje

| Camada | Estado |
|---|---|
| Banco | `leads.product_id uuid` -- **um** produto por negócio. Não há tabela de junção |
| Valor | `leads.value` é do NEGÓCIO, não do item. Não existe preço por item |
| Telas | Detalhe do negócio (seleção e diálogo de ganho), drawer, importação, Multiatendimento |
| Dashboard | Ranking "Produtos mais vendidos" |
| Automações | Ações `add_produto_neg` / `rem_produto_neg`, condição "tem o produto X" |
| Agente (IA) | `criar_negocio` e `definir_produto` em `agent-tools.ts` |
| Disparos | Filtro por produto (`LeadFilter.products`) |

Volume atual: 3.333 negócios, **166 com produto** (87 deles ganhos), 23 produtos
cadastrados. A migração de dados é pequena.

## Dois achados no caminho

**1. A automação promete somar e na verdade troca.**

[FONTE:supabase/functions/automation-runner/index.ts:2838-2842]
```js
case "add_produto_neg": {
  const productId = cfg.produto as string;
  await supabase.from("leads").update({ product_id: productId }).eq("id", lead_id);
```

A ação se chama "adicionar produto ao negócio" e executa um `update`. Quem montou
uma automação com duas dessas em sequência ficou só com a última, sem aviso. É
provável que parte do pedido dos clientes venha daí.

**2. O ranking de produtos não sobrevive a dois produtos sem preço por item.**

[FONTE:src/pages/DashboardPage.tsx, `topProducts`]
```js
cur.count++; cur.value += receitaDoGanho(l);   // o valor do NEGÓCIO inteiro
```

Hoje funciona porque há um produto só. Com dois, somar a receita do negócio em
cada produto conta a mesma venda duas vezes -- o mesmo erro que acabou de ser
corrigido no gráfico do período. Por isso **preço por item não é opcional**: é o
que torna a mudança possível sem quebrar o relatório.

## O caminho

### Fase 1 -- Banco

```sql
create table lead_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null references leads(id) on delete cascade,
  product_id uuid not null references products(id),
  quantidade integer not null default 1,
  valor_unitario numeric not null,          -- copiado do produto, editável
  created_at timestamptz default now()
);
-- RLS no padrão da casa: is_member_of(company_id) nas quatro operações.
```

Migração: uma linha por negócio que já tem produto (166), com
`valor_unitario = leads.value` e quantidade 1. `leads.product_id` **fica**, como
espelho do primeiro item, até todos os consumidores migrarem -- é o que evita um
big bang no agente, nas automações e nos filtros.

### Fase 2 -- Telas

Detalhe do negócio: lista de itens com "+ Adicionar produto", quantidade e valor
por item, e o total somado. O diálogo de ganho passa a mostrar os itens e o
total, mantendo a regra nova (abre com o valor do negócio, não com a tabela).

### Fase 3 -- Relatórios e automações

Ranking de produtos passa a ler `lead_products` (receita por item, não do
negócio). `add_produto_neg` passa a inserir de verdade, e `rem_produto_neg`
ganha "qual produto". A condição "tem o produto X" vira "algum item é X".

### Fase 4 -- Agente e filtros

`definir_produto` vira `adicionar_produto`, e o filtro de disparos passa a casar
com qualquer item.

## Executado em 20-21/09/2026 (Entrega 1)

Decisão do dono: **o valor do negócio passa a ser a soma dos produtos, e
continua editável à mão como hoje**.

### Banco

| Migration | O que faz |
|---|---|
| `lead_products_itens_do_negocio` | Tabela de itens, com RLS no padrão `is_member_of(company_id)` |
| `valor_do_negocio_soma_dos_itens` | `leads.value_is_manual` + gatilho que recalcula `leads.value` a cada mudança de item |
| `voltar_a_somar_os_itens` | Desligar o ajuste manual devolve o valor à soma na hora |

O recálculo vive no BANCO porque automação, agente de IA e a tela escrevem por
caminhos diferentes: três cópias da regra divergiriam na primeira correção.

Migração: 122 negócios que já tinham produto viraram um item cada, com o valor
que tinham. Outros **45 apontavam para produtos apagados** (todos perdidos, da
conta de teste do dono, de maio) e ficaram de fora -- `leads.product_id` não tem
chave estrangeira, e por isso aceitava apontar para o que não existe mais.

### Tela

O mesmo dropdown de antes, sempre visível, onde o campo "Produto" sempre esteve.
O que muda é que escolher não TROCA: acrescenta, e o escolhido sobe para uma
lista logo acima, com o preço e um "×". O rótulo do dropdown vira "Adicionar
outro produto" quando já há algum.

Não há "Nenhum produto neste negócio" nem botão "Adicionar produto": o dropdown
já diz o que fazer, e os dois eram degraus a mais para o mesmo lugar.

O campo "Orçamento / Valor" segue editável; quando alguém digita um valor,
aparece "Valor ajustado à mão · Voltar a somar os produtos".

**O que NÃO entrou, e por quê:** a primeira versão trouxe quantidade e preço
editável por linha. O dono cortou: o preço já é cadastrado junto com o produto,
e quem precisa de outro total edita o campo de valor. Era um formulário de
pedido onde bastava uma lista de nomes.

A segunda versão ainda trazia uma frase de vazio e um link "Adicionar produto",
e o dono cortou também -- o dropdown sozinho faz as duas coisas.

### Dois defeitos encontrados no caminho

1. **O menu que não adicionava nada.** O botão montava o seletor já aberto; ao
   clicar numa opção, o Radix fecha o menu ANTES de avisar a escolha, o
   `onOpenChange` desmontava o componente e o `onValueChange` morria junto. Um
   clique, nenhum produto, nenhum erro. Agora o seletor É o botão e fica sempre
   montado.
2. **O realtime apagava a lista.** O handler de UPDATE de `leads` reconstruía o
   negócio com `dbToLead(row, activities)` -- e os itens vivem em outra tabela,
   então voltavam vazios. O produto entrava, aparecia, e sumia meio segundo
   depois, quando o eco do próprio `product_id` espelhado chegava.

### Verificação

| O quê | Resultado |
|---|---|
| Dois produtos | Plano Agência (1.000) + Rezult Emerald (747) = **R$ 1.747** no valor do negócio |
| Três produtos | 747 + 237 + 399 = **R$ 1.383** |
| Valor à mão | digitado 1.500; adicionar produto **não** mexeu nele |
| Voltar a somar | 1.500 → **1.383** |
| Receita dos ganhos | R$ 44.953 antes e depois da migração |
| Portas | typecheck, 31 testes, build e lint na linha de base |

O negócio usado no ensaio foi devolvido ao estado original.

## O que depende de decisão do dono

1. **O valor do negócio passa a ser a soma dos itens, ou continua independente?**
   Somar é mais correto e mexe em quem edita o valor à mão hoje. Independente é
   menos intrusivo e deixa os dois números divergirem.
2. **Quantidade por item entra agora?** Sem ela, "3 licenças" viram três linhas.
3. **Preço por item editável?** É o que permite desconto. Sem isso, só a tabela.
4. **Desconto no negócio** (valor total menor que a soma) entra agora ou depois?

## Recomendação

**Posição:** fazer, em duas entregas. A primeira é Fases 1 e 2 (dois produtos
funcionando no negócio, com valor por item) e já atende o pedido dos clientes. A
segunda é Fases 3 e 4, que alinha relatório, automação e agente.

**Justificativa:** o modelo atual bloqueia um pedido recorrente e já produz um
comportamento errado na automação. O risco está concentrado no relatório, e o
preço por item o elimina.

**Confiança:** ALTA quanto ao alcance (sete pontos mapeados no código e no
banco); MÉDIA quanto ao esforço, que depende das quatro decisões acima --
**missing evidence:** quantos clientes pedem quantidade e desconto, e não apenas
"dois produtos".
