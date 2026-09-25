# Estrutura do saldo de créditos

Desenho pedido pelo dono em 24/09/2026, depois da análise em
`2026-09-24-credito-de-ia-vendido-pelo-rezult.md`. Aquele documento responde
"se dá e quanto custa". Este responde "como se constrói".

## O princípio

O saldo do cliente é **uma conta corrente nossa**, não um estoque comprado. Ele
existe em duas tabelas e em nenhum outro lugar. A conta na OpenAI é a nossa
torneira agregada, reposta por recarga automática, e não tem relação um-para-um
com nenhum cliente.

Três regras que o desenho inteiro serve para garantir:

1. **Nunca consumir sem débito.** Se a chamada aconteceu, o saldo caiu.
2. **Nunca debitar duas vezes o mesmo consumo.** Nem creditar duas vezes o
   mesmo pagamento.
3. **Nunca deixar o cliente descobrir o saldo pelo erro.** Ele vê antes.

---

## 1. As tabelas

### `credit_accounts` -- o saldo de cada empresa

```sql
create table public.credit_accounts (
  company_id   uuid primary key references public.companies(id) on delete cascade,
  saldo        numeric(12,4) not null default 0,   -- na moeda de venda (BRL)
  teto_diario  numeric(12,4),                       -- null = sem teto
  atualizado_em timestamptz not null default now(),
  constraint saldo_nao_negativo check (saldo >= 0)
);
```

**Mudei de opinião sobre esse `check` ao implementar, e ele NÃO existe.**

O débito acontece depois da chamada, com o custo real: ele registra um fato
consumado, dinheiro que já foi gasto no fornecedor. Se o `check` fizesse esse
insert falhar, o resultado seria consumo sem débito -- o pior dos dois mundos,
porque o prejuízo acontece e não fica registrado em lugar nenhum.

Saldo negativo é permitido e **visível**. A proteção mora antes: a trava na
entrada e o teto diário. O negativo possível é de uma chamada, não de uma conta
inteira.

### `credit_transactions` -- o extrato, que é a verdade

```sql
create table public.credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  tipo         text not null check (tipo in ('compra','consumo','ajuste','estorno','expiracao')),
  valor        numeric(12,4) not null,      -- positivo credita, negativo debita
  saldo_depois numeric(12,4) not null,      -- fotografia, para o extrato não precisar recalcular
  descricao    text,

  -- de onde veio, para conciliar e para não repetir
  stripe_event_id  text unique,             -- compra: o id do evento do Stripe
  agent_usage_id   uuid unique references public.agent_usage_log(id), -- consumo: a chamada
  custo_usd        numeric(12,6),           -- consumo: o custo de origem, antes do câmbio
  cambio           numeric(10,4),           -- consumo: a taxa aplicada

  criado_em    timestamptz not null default now()
);
```

Os dois `unique` são o coração da idempotência. O webhook do Stripe repete
evento (é o comportamento normal dele, não exceção), e um retry de chamada de
IA não pode debitar de novo. Com a restrição no banco, repetir vira erro de
chave duplicada em vez de dinheiro errado -- e erro de chave duplicada a gente
ignora com segurança.

`saldo_depois` existe para o extrato ser lido direto, sem somar a coluna inteira
a cada abertura de tela.

---

## 2. O débito, onde ele encaixa no que já existe

Hoje toda chamada de IA já grava em `agent_usage_log` com `cost_usd` calculado.
O débito é **a mesma transação**, não um segundo passo:

```sql
create or replace function public.debitar_credito(
  p_company_id uuid,
  p_usage_id   uuid,
  p_custo_usd  numeric,
  p_cambio     numeric
) returns numeric  -- saldo restante
language plpgsql security definer set search_path = 'public' as $$
declare
  v_valor numeric := round(p_custo_usd * p_cambio, 4);
  v_saldo numeric;
begin
  update credit_accounts
     set saldo = saldo - v_valor, atualizado_em = now()
   where company_id = p_company_id
   returning saldo into v_saldo;

  insert into credit_transactions
    (company_id, tipo, valor, saldo_depois, agent_usage_id, custo_usd, cambio, descricao)
  values
    (p_company_id, 'consumo', -v_valor, v_saldo, p_usage_id, p_custo_usd, p_cambio, 'uso de agente');

  return v_saldo;
end $$;
```

Se o `insert` falhar por `agent_usage_id` repetido, o `update` volta atrás
junto: uma função, uma transação. É isso que garante a regra 2.

### A ordem importa

O débito acontece **depois** da chamada, com o custo real, e não antes com uma
estimativa. Motivo: estimativa erra, e errar para mais gera reclamação e errar
para menos gera prejuízo. O preço a pagar é que uma chamada pode deixar o saldo
levemente negativo -- por isso a checagem de entrada usa uma margem (adiante).

---

## 3. A trava

Antes de cada chamada de IA, nos quatro pontos que hoje leem `ai_provider_keys`
(`agent-operacional-runner`, `agent-sds-qualify`, `automation-runner`,
`ai-suggest-reply`):

```
saldo < margem_minima  ->  não chama, registra o motivo, avisa
```

A `margem_minima` é o custo da chamada mais cara conhecida, com folga. Sem ela,
uma última chamada de US$ 2 sobre um saldo de R$ 0,50 fura o `check` e a
transação falha no meio de uma conversa.

**Quem é avisado:** o atendente e o admin da empresa, nunca o contato do
WhatsApp. O cliente final não pode receber "acabou o crédito" -- para ele, o
agente simplesmente não responde e um humano assume, que é o mesmo
comportamento de fora do horário.

**Aviso antes do fim:** em 20% do saldo e de novo em 5%, uma vez cada, para o
admin. Quem descobre o fim do saldo pela ausência de resposta já perdeu o lead.

---

## 4. A compra

Stripe em modo `payment` (pagamento unico), nao `subscription`. A funcao
`create-checkout-session` ja existe e ganha um modo novo.

**O `Price` e criado em USD** (emenda de 25/09/2026, secao 5.1): o cliente
brasileiro ve o valor em real no checkout porque o Stripe converte sozinho, e
nao ha tabela de precos em real para manter quando o dolar mexer.

```
cliente escolhe valor
  -> checkout do Stripe (mode: payment, price em USD)
    -> webhook checkout.session.completed
      -> creditar_credito(company_id, valor_usd, 'compra', stripe_event_id)
```

O `stripe_event_id` unico e o que torna o webhook repetivel sem credito dobrado.

### 4.1 A unidade -- DECIDIDA: Creditos Rezult (dono, 25/09/2026)

O cliente **paga em dolar** e **recebe creditos**. O dolar aparece uma unica vez,
no ato do pagamento, que e onde ele e dinheiro de verdade. Depois disso some da
interface.

| Onde | Unidade |
|---|---|
| Botao de compra | **US$ 25** (o Stripe mostra ~R$ 135 ao lado) |
| Card de saldo | **25.000 creditos** |
| Linha de consumo | **35 creditos** |

O nome na UI e "creditos" ou "Creditos Rezult", nunca "Rezult Credits": a
aplicacao e 100% em portugues por regra do projeto.

**As duas taxas, e so uma delas e preco:**

```
1.500 creditos = US$ 1,00 de CUSTO   → FIXO para sempre. E a definicao da unidade.
1.000 creditos = US$ 1,00 PAGO       → e PRECO. Pode mudar. Hoje = markup de 50%.
```

Esta separacao foi imposta pela regra 4.4 durante a implementacao, e o desenho
ingenuo (uma taxa so, derivada do markup) nao sobreviveu a ela. Ver 4.5.

`creditos = ceil(custo_usd x 1500)`, entao a resposta de agente que custa
US$ 0,0232 sai por 35 creditos.

### 4.2 Por que saldo e consumo compartilham a unidade, e a compra nao

O saldo E a soma do consumo. Se o card dissesse "US$ 24,81" e a linha dissesse
"19 creditos", o cliente veria o saldo cair sem conseguir conferir por que: as
duas grandezas nao se subtraem. Isso nao e preferencia de estilo, e a condicao
para o extrato ser legivel.

A compra e livre porque ali o dolar nao e saldo, e preco. E o mesmo que a Kiwify
faz: o checkout cobra US$ 10,00 e entrega "Ribas credits".

**O credito e ancorado no DOLAR, nao no real.** Se fosse ancorado no real, a
quantidade de creditos por pacote mudaria sozinha a cada oscilacao do cambio
("US$ 25 = 13.500 creditos hoje, 14.200 amanha"), o que e impossivel de
anunciar, e o risco cambial que a secao 5.1 eliminou voltaria pela porta dos
fundos.

### 4.3 O que mudou no banco -- FEITO (migration 20260925000002)

| Coluna | Antes | Depois |
|---|---|---|
| `credit_accounts.saldo_usd` | custo em USD | `saldo_creditos` numeric(14,2) |
| `credit_accounts.teto_diario_usd` | USD | `teto_diario_creditos` |
| `credit_transactions.valor` | USD | creditos |
| `credit_transactions.saldo_depois` | USD | creditos |
| `credit_transactions.custo_usd` | custo real | **inalterado** |
| `credit_transactions.creditos_por_dolar` | -- | **nova**: o fator daquela linha |
| `credit_transactions.pago_usd` | -- | **nova**: quanto o cliente pagou |

`custo_usd` ficou exatamente como estava: e ele que bate contra a fatura do
fornecedor na conciliacao mensal (secao 6) e nao tem markup nenhum. E a razao
de as duas colunas terem nascido separadas.

`debitar_credito` arredonda **para CIMA** (`ceil`). Meio credito nao existe para
o cliente, e a diferenca precisa cair do lado de quem paga o fornecedor:
arredondar para baixo faria toda chamada abaixo de meio credito sair de graca --
e chamada barata em volume e exatamente o perfil de uma automacao em laco.

### 4.4 A regra que precisa estar nos termos ANTES da primeira venda

**O valor do credito nunca muda para tras.** Qualquer reajuste vale so para
compras novas.

### 4.5 Como 4.4 e cumprida sem lote FIFO

O desenho inicial tinha uma taxa so, derivada do markup. Subir o markup de 50%
para 80% mudaria o fator de debito de 1500 para 1800, e os creditos **ja
comprados** passariam a comprar menos trabalho: violacao direta de 4.4. Cumprir
a regra exigiria congelar o fator por compra, com lotes FIFO, saldo em camadas
e reconciliacao entre eles.

A saida foi separar duas coisas que estavam sendo confundidas:

| | O que e | Muda? |
|---|---|---|
| 1.500 creditos por US$ 1 de custo | a **definicao** da unidade de trabalho | nunca |
| 1.000 creditos por US$ 1 pago | o **preco** dessa unidade | sim, e assim que se reajusta |

Um reajuste para 80% de markup passa a vender 833 creditos por dolar em vez de
1.000. Quem ja comprou nao e tocado, porque o que ele tem em maos continua
valendo os mesmos US$ 1/1500 de trabalho por credito.

A taxa de venda **nao mora no banco**: mora no Price do Stripe (secao 4) e em
`CREDITOS_POR_DOLAR_PAGO` no componente, que existe so para a tela dizer quantos
creditos o valor digitado compra. O banco recebe a quantidade ja convertida.

Resultado: 4.4 satisfeita com zero complexidade de lote. O credito e uma unidade
de TRABALHO, fixa; o que varia e quanto ela custa.



---

## 5. As duas decisões de negócio que o desenho não toma

### 5.1 A moeda -- DECIDIDA: dolar (dono, 24/09/2026)

O saldo e em USD e o cambio acontece na **venda**, nao no debito: o cliente paga
em real no Stripe e recebe um valor em dolar de credito.

Isso tira o cambio do caminho quente. Cada debito e uma subtracao simples, sem
taxa do dia para aplicar nem conversao para explicar em cada linha do extrato.

O contraponto, que segue valendo: o cliente ve "US$ 12,40" e precisa converter
de cabeca para saber o que tem. E o valor em dolar deixa inferir a ordem de
grandeza do custo de origem.

**Emenda de 25/09/2026 -- o PRECO tambem e em dolar, nao so o saldo.**

O `Price` do Stripe e criado em USD e a conversao para real fica com o Stripe
(Adaptive Pricing). Nao existe uma tabela de precos em real para manter.

Evidencia: o checkout da Kiwify para "Ribas credits" oferece os dois botoes,
R$ 54,13 ou US$ 10,00, para o mesmo produto, com `1 USD = 5,4130 BRL` impresso
na tela. Dividindo por 1,04 (a taxa de conversao que o Stripe cobra em pedidos
abaixo de US$ 500, paga pelo cliente e nao pelo vendedor) sai R$ 5,2048, que e o
dolar comercial do dia. Ou seja: aquele preco nao carrega markup nenhum, e
apenas US$ 10 convertidos.

Por que isso importa aqui: precificar em dolar faz a receita e a divida andarem
na mesma moeda. Se o dolar subir depois da venda, o proximo comprador paga mais
reais pelos mesmos US$ 10, e o credito ja vendido nao vira prejuizo.

Ressalva: a Kiwify consegue o casamento perfeito porque cobra por uma entidade
americana (`Kiwify US, Inc.`) que liquida em dolar. Uma conta Stripe brasileira
recebe reais, entao sobra exposicao entre a venda e a recarga da OpenAI. E uma
fresta de dias, nao de meses, mas existe.

### 5.2 O markup -- RECOMENDADO: 50% (25/09/2026), decisao do dono pendente

O que o markup precisa cobrir: taxa do Stripe, imposto, IOF e spread do cartao
na recarga da OpenAI, credito que expira sem uso (1 ano) e a margem em si.

**O custo real de cada dolar de credito**, com o dolar comercial a R$ 5,16:

| Componente | Valor |
|---|---|
| Dolar comercial | R$ 5,16 |
| Spread do cartao na recarga | ~4% |
| IOF | 3,5% |
| **Dolar efetivo** | **~R$ 5,55** |

**Os cenarios**, tomando US$ 25 de credito (custo R$ 138,75), Stripe a
3,99% + R$ 0,39 e imposto de 6% sobre a receita:

| Markup | Preco por US$ 1 | US$ 25 sai por | Stripe | Imposto | Margem |
|---|---|---|---|---|---|
| 30% | R$ 7,22 | R$ 180 | R$ 7,57 | R$ 10,82 | R$ 22,86 (12,7%) |
| **50%** | **R$ 8,33** | **R$ 208** | R$ 8,69 | R$ 12,50 | **R$ 48,06 (23,1%)** |
| 80% | R$ 9,99 | R$ 250 | R$ 10,36 | R$ 15,00 | R$ 85,89 (34,4%) |

Os 80% tem o apelo comercial de fechar em **R$ 10 = US$ 1**, que o cliente
entende sem calculadora. O que derrubou esse numero foi a emenda 5.1: o
argumento mais forte a favor dele era o risco cambial, e precificar em dolar
elimina esse risco. Sem ele, 50% ja opera com folga.

**Confianca: MEDIA.** A aritmetica esta verificada; a aceitacao de mercado nao.
O que falta para subir: comprar US$ 10 na Kiwify e medir quanto de uso real
aquele saldo compra. E o unico jeito de descobrir o markup deles, porque o
checkout nao revela nada (ver 5.1). Ressalva sobre esse comparavel: "Ribas
credits" nomeado com o sobrenome do dono e cobrado pela entidade de pagamento
da Kiwify tem cara de produto pessoal rodando em infra que ja existia, nao de
linha de receita com pricing estudado.

**O custo de origem medido hoje esta inflado pelo Claude**, que foi o provedor
da maioria dos testes. A mesma operacao no `gpt-5.6-terra` custaria menos, entao
qualquer markup calculado sobre a medicao atual sai conservador.

---

## 6. Os controles que evitam prejuízo

| Controle | O que impede | Onde |
|---|---|---|
| `teto_diario` por empresa | laço em automação queimando saldo | checagem na trava |
| Alarme de cobertura | a conta OpenAI zerar e parar todos | job diário: saldo lá / queima média |
| Cartão reserva na OpenAI | recarga recusada derrubar a base | configuração, não código |
| Conciliação mensal | divergência entre nosso débito e a fatura real | soma de `custo_usd` do mês x fatura |

A conciliação é o que revela erro de medição. Se a nossa soma e a fatura
divergirem mais que centavos, alguma chamada não está sendo contabilizada -- e
é melhor descobrir no mês 1 do que no mês 12.

---

## 7. O caixa no primeiro mês (levantado pelo dono)

O Stripe libera o dinheiro em ~30 dias, mas o consumo começa no dia 1. Então
**no primeiro ciclo a recarga da OpenAI sai do bolso**, e é reembolsada quando
o repasse cai.

Não é um problema do desenho, é uma necessidade de caixa com prazo conhecido.
O valor a reservar é a queima projetada de 30 dias -- que hoje não dá para
estimar, porque todo o consumo medido foi teste do próprio dono, nenhum cliente
usou os agentes ainda.

**Consequência prática:** a primeira empresa a usar crédito de verdade é a
medição. Vale tratá-la como piloto, com acompanhamento diário da queima, antes
de abrir para a base.

---

## 8. Ordem de construção

| # | Passo | Entrega | Estado |
|---|---|---|---|
| 1 | Tabelas + `debitar_credito` + RLS | saldo existe e é debitável | feito em 24/09 |
| 2a | Débito ligado a `agent-operacional-runner` e `agent-sds-qualify` | os dois runners de agente abatem | feito em 24/09 |
| 2b | Medir custo nos CINCO pontos (eram 4 na conta anterior) | todo consumo de IA passa a contar | feito em 25/09 |
| 3a | Migration da unidade + card em créditos | o saldo e o extrato falam em créditos | feito em 25/09 |
| 3b | Tela: "Compras" cronológico + "Consumo" agregado por agente e origem | dá para auditar antes de cobrar | **pendente, e é o proximo** |
| 4 | Checkout avulso (price em USD) + webhook creditando | passa a vender | pendente |
| 5 | Trava, avisos e teto diário | passa a ser seguro | pendente |
| 6 | Chave da Rezult com fallback para a do cliente | o BYOK vira opcional | pendente |

### Por que 2b vem antes de tudo

O passo 2 foi dado como concluído em 24/09 e cobriu **metade** dos pontos de
chamada. Verificado por leitura dos quatro arquivos em 25/09:

| Onde a IA é chamada | Calcula `cost_usd`? | Debita? |
|---|---|---|
| `agent-operacional-runner` | sim | sim |
| `agent-sds-qualify` | sim | sim |
| `automation-runner` (bloco `ia`) | **não** | não |
| `ai-suggest-reply` | **não** | não |

`automation_logs.tokens` guarda os tokens do bloco de IA mas nunca converte para
dólar. `ai-suggest-reply` não registra nada.

Uma tela de consumo que não conta as automações mostra um número **menor que a
realidade**, e o cliente confia nele. Isso é pior do que não ter a tela, e é a
razão de 2b vir antes de 3b. Cobrar por um consumo medido pela metade é pior
ainda.

### O modo sombra

Os passos até 3b podem rodar **em modo sombra**: debitando de um saldo fictício,
sem cobrar ninguém, só para medir o consumo real por empresa. É a forma barata
de descobrir o custo por cliente antes de prometer preço a alguém.
