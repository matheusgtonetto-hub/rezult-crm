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

Stripe em modo `payment` (pagamento único), não `subscription`. A função
`create-checkout-session` já existe e ganha um modo novo, com os valores
sugeridos do print (R$ 50 / 100 / 250 / 500) e campo livre.

```
cliente escolhe valor
  -> checkout do Stripe
    -> webhook checkout.session.completed
      -> credita: insert em credit_transactions (tipo 'compra', stripe_event_id)
         + update do saldo, na mesma transação
```

O `stripe_event_id` único é o que torna o webhook repetível sem crédito dobrado.

---

## 5. As duas decisões de negócio que o desenho não toma

### 5.1 A moeda -- DECIDIDA: dólar (dono, 24/09/2026)

O saldo é em USD e o câmbio acontece na **venda**, não no débito: o cliente paga
em real no Stripe e recebe um valor em dólar de crédito.

Isso tira o câmbio do caminho quente. Cada débito é uma subtração simples, sem
taxa do dia para aplicar nem conversão para explicar em cada linha do extrato --
e some junto o risco de o crédito já vendido virar prejuízo numa alta do dólar,
porque a conversão já aconteceu no momento em que o dinheiro entrou.

O contraponto, que segue valendo: o cliente vê "US$ 12,40" e precisa converter
de cabeça para saber o que tem. E o valor em dólar deixa inferir a ordem de
grandeza do custo de origem.

### 5.2 O markup

Não é conta minha, é sua. Só registro que ele precisa cobrir: câmbio entre a
venda e o consumo, taxa do Stripe, imposto, crédito que expira sem uso (1 ano)
e a margem em si. E que o custo de origem hoje está inflado pelo Claude -- a
mesma operação na OpenAI custaria menos, então o markup calculado sobre a
medição atual sai conservador.

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

| # | Passo | Entrega |
|---|---|---|
| 1 | ~~Tabelas + `debitar_credito` + RLS~~ **feito em 24/09** | saldo existe, é debitável e está testado |
| 2 | Débito ligado aos 4 pontos de chamada | consumo já abate, mesmo sem venda |
| 3 | Extrato na tela de Agentes | dá para auditar antes de cobrar |
| 4 | Checkout avulso + webhook creditando | passa a vender |
| 5 | Trava, avisos e teto diário | passa a ser seguro |
| 6 | Chave da Rezult com fallback para a do cliente | o BYOK vira opcional |

Os passos 1 a 3 podem rodar **em modo sombra**: debitando de um saldo fictício,
sem cobrar ninguém, só para medir o consumo real por empresa. É a forma barata
de descobrir o custo por cliente antes de prometer preço a alguém.
