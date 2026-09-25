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

### 4.7 Como o passo 4 ficou (25/09/2026)

**`create-checkout-session` ganhou um caminho `tipo: "credito"`**, que sai antes
de toda a logica de assinatura (cupom da primeira contratacao, janela do teste
gratis, `subscription_data`). Separado de proposito: misturar os dois num fluxo
so seria pedir para o cupom de 50% um dia cair numa compra de credito.

**Os creditos viajam no `metadata`, calculados no servidor.** O webhook credita
a partir dali, NUNCA de `amount_total`, por dois motivos:

1. Com a conversao automatica do Stripe, `amount_total` pode vir na moeda de
   apresentacao (real). Creditar "135 x 1070" seria catastrofico.
2. O numero nasce do mesmo valor que foi cobrado, entao o cliente nao consegue
   inflar um sem inflar o outro.

**`payment_status` e checado explicitamente.** `checkout.session.completed`
dispara quando a sessao COMPLETA, e isso nao e o mesmo que ter sido paga: um
metodo assincrono completa a sessao com o pagamento pendente. Creditar ali seria
entregar saldo antes de receber.

**Teto de US$ 2.000 por compra**, nos dois lados. Nao e desconfianca do cliente:
um zero a mais em "500" vira uma cobranca de US$ 5.000, e desfazer custa
estorno, taxa e uma conversa ruim.

**Sem `allow_promotion_codes`** na compra de saldo. Cupom daria credito acima do
que foi pago, e 13,2% de margem nao tem folga para isso.

**A volta do checkout espera o webhook.** O Stripe manda o cliente para
`/agentes?credito=ok` assim que o pagamento passa, mas quem credita e o webhook,
que chega instantes depois. O card recarrega a cada 2s, no maximo 8 vezes, e
para assim que o saldo muda. Sem isso a pessoa paga, ve o saldo ANTIGO e conclui
que o dinheiro se perdeu.

**Onde a taxa de venda mora agora:** `CREDITOS_POR_DOLAR_PAGO` existe em DOIS
lugares -- `supabase/functions/create-checkout-session` (a que VALE, porque e a
que entra no metadata) e `src/components/SaldoDeCreditos.tsx` (so para a tela
dizer quantos creditos o valor compra). Mudar uma sem a outra faz a tela
prometer um numero e o checkout entregar outro.

### 4.1 A unidade -- DECIDIDA: Creditos Rezult (dono, 25/09/2026)

O cliente **paga em dolar** e **recebe creditos**. O dolar aparece uma unica vez,
no ato do pagamento, que e onde ele e dinheiro de verdade. Depois disso some da
interface.

| Onde | Unidade |
|---|---|
| Botao de compra | **US$ 25** (o Stripe mostra ~R$ 135 ao lado) |
| Card de saldo | **25.000 creditos** |
| Linha de consumo | **35 creditos** |

**Ida e volta do dolar na tela, em 25/09/2026.**

O saldo chegou a aparecer em dolar do que foi pago, e voltou para credito no
mesmo dia. Fica registrado porque a ideia e tentadora e vai voltar: em dolar, a
tela fica 1:1 com o pagamento e some uma unidade para explicar ao cliente.

O que ela custa e a liberdade de reajustar, e o custo so aparece quando se tenta
mexer no preco. Com dolar pago na tela, vender 833 creditos por dolar (markup de
80%) faria quem paga US$ 1 ver US$ 0,83 entrar -- impossivel de anunciar. O
reajuste passaria a ter de mexer em quanto cada credito COMPRA, o que
desvaloriza saldo ja vendido: exatamente o que 4.4 proibe. A saida barata de 4.5
deixava de existir e o lote FIFO voltava.

Em credito, as duas taxas seguem independentes e 4.5 continua valendo.

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

### 4.6 O cartão da Performance vazava o markup -- CORRIGIDO em 25/09

`src/pages/AgentesPage.tsx:4302` mostra "Valor gasto (7 dias): $0.42 · custo de
tokens de IA". É o `cost_usd` CRU, somado direto de `agent_usage_log`, sem
markup nenhum.

Quem tiver conta de crédito vê as duas coisas na mesma sessão: US$ 0,42 de custo
naquele cartão e 630 créditos a menos no saldo. Dividir um pelo outro dá 1500, o
fator exato. A opção B existe para que a comparação com o preço de tabela do
fornecedor não seja possível, e este cartão a reabre.

**Medido na empresa de demonstracao**: 7 chamadas, US$ 0,1932 de custo, 294
creditos debitados. 294 / 0,1932 = 1521 -- nao 1500, por causa do `ceil` linha a
linha, mas perto o bastante para entregar a margem.

**Corrigido**: o cartao passa a ler `consumo_por_origem` e mostrar os CREDITOS
descontados, para quem tem conta. Quem usa chave propria segue vendo o custo
real em dolar, que e a fatura dele. Nunca os dois na mesma tela -- e, em
creditos, os dois numeros nem sao a mesma unidade, o que ja desencoraja a
divisao.

O conserto não é esconder o número, é escolher a unidade certa para cada caso:

| Empresa | O que o cartão deve mostrar | Por que |
|---|---|---|
| com conta de crédito | créditos consumidos | é a unidade dela, e bate com o saldo |
| BYOK (todas hoje) | dólar de custo real | é a fatura que ela mesma paga ao fornecedor |

Somar os créditos de `credit_transactions` em vez de multiplicar o dólar por
1500: cada débito arredonda para cima individualmente, então a soma dos `ceil`
não é o `ceil` da soma. Multiplicar daria um número que não fecha com o extrato.

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

### 5.2 O markup -- DECIDIDO: 30% com hedge (dono, 25/09/2026)

**O markup e de 30% sobre o custo EFETIVO**, e a exposicao cambial e fechada
comprando os dolares no ato da venda (o hedge, secao 6.1).

Periodo inicial, explicitamente: o dono decidiu medir com cliente real
consumindo antes de ajustar. Nenhum cliente comprou credito ainda, e todo o
consumo medido ate hoje foi teste do proprio dono.

**As duas taxas:**

```
1.500 creditos = US$ 1,00 de custo do fornecedor   → definicao da unidade, FIXA
1.070 creditos = US$ 1,00 pago                     → preco, reajustavel
```

**Como 1.070 sai de "30%":** o markup e sobre o custo efetivo, nao sobre o preco
de tabela do fornecedor. Comprar US$ 1 de custo custa US$ 1,0764, porque o IOF
(3,5%) e o spread do cartao (~4%) incidem na recarga.

```
1500 / (1,30 x 1,0764) = 1072,3  →  1.070
```

Arredondado para BAIXO: menos credito por dolar empurra o markup para cima
(30,24%), e o erro de arredondamento deve cair do lado seguro.

**Correcao de um erro meu, de 25/09/2026.** A constante anterior era 1.000 e
estava errada. Ela foi derivada sobre o custo CRU, ignorando IOF e spread,
enquanto a tabela de cenarios que embasou a discussao calculava sobre o
EFETIVO. Os "50%" daquela constante eram 39,4% de verdade. As duas contas nao
usavam a mesma definicao de markup.

**A economia de cada dolar pago, em 30,24%:**

| | Por US$ 1,00 pago |
|---|---|
| Receita | US$ 1,0000 |
| Compra dos dolares (com IOF e spread) | US$ 0,7678 |
| Stripe (3,99%) | US$ 0,0399 |
| Imposto (6%) | US$ 0,0600 |
| **Margem liquida** | **US$ 0,1323 (13,2%)** |

**O que o hedge muda nessa conta:** nada. E esse o ponto. Sem hedge, os 30%
tinham um ponto de ruina -- dolar acima de R$ 6,02 e a venda virava prejuizo.
Com os dolares comprados no ato da venda, os 13,2% sao estaveis qualquer que
seja a cotacao, e escolher 30% deixa de ser aposta e passa a ser decisao sobre
quanto operar apertado.

**O que 13,2% NAO absorve, e e o que justifica medir cedo:** um estorno, uma
hora de suporte, a taxa da Stripe mudando. E os 30 dias de repasse continuam
significando que a recarga sai do bolso antes de o dinheiro entrar (secao 7).

**Confianca: MEDIA.** A aritmetica esta verificada acima. O que falta para subir:
consumo de cliente real. O custo de origem medido ate hoje esta inflado pelo
Claude, que foi o provedor da maioria dos testes -- e desde 25/09 o produto usa
somente OpenAI, entao a medicao vai mudar.

---

## 6. Os controles que evitam prejuízo

| Controle | O que impede | Onde |
|---|---|---|
| `teto_diario` por empresa | laço em automação queimando saldo | checagem na trava |
| Alarme de cobertura | a conta OpenAI zerar e parar todos | job diário: saldo lá / queima média |
| Cartão reserva na OpenAI | recarga recusada derrubar a base | configuração, não código |
| Conciliação mensal | divergência entre nosso débito e a fatura real | soma de `custo_usd` do mês x fatura |

### 6.1 O hedge: comprar os dolares quando vender

**A regra:** o saldo em dolar na OpenAI deve cobrir os creditos vendidos e ainda
nao consumidos. Cada venda gera uma recarga na proporcao correspondente.

Sem isso, o credito e um passivo em dolar com receita travada em reais: o
cliente paga hoje e consome em seis meses, com o dolar em outro patamar. Indexar
o PRECO nao resolve, porque o preco ja foi cobrado. O que resolve e travar o
custo na mesma cotacao da receita, e para isso os dolares tem de ser comprados
no ato da venda.

**A cobertura necessaria, a qualquer momento:**

```
creditos_vendidos_nao_consumidos / 1500 = USD que precisa existir na OpenAI
```

Isso e `sum(saldo_creditos)` de `credit_accounts` dividido por 1500. O sistema
sabe calcular; ele nao sabe ler o saldo real na OpenAI, que nao e exposto por
API estavel. Entao o relatorio diz **quanto deveria haver**, e a conferencia com
o painel da OpenAI e humana.

**O risco NOVO que o hedge cria:** credito da OpenAI expira em 1 ano. Pre-comprar
dolar para credito que o cliente so vai consumir no mes onze deixa a validade
apertada; pre-comprar de sobra e perder dinheiro na expiracao. Por isso o hedge
**acompanha o passivo** e nao e uma reserva: compra-se o que foi vendido, e nao
mais.

**Implementacao:** entra no passo 5, junto com a trava e os avisos. E um
relatorio, nao um automatismo -- a recarga da OpenAI dispara por limite minimo e
nao por venda, entao a acao final e do dono.

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
| 3b | Abas "Consumo" e "Compras" + cartão da Performance (4.6) | dá para auditar antes de cobrar | feito em 25/09 |
| 4 | Checkout avulso (price em USD, 1.070 créditos por dólar) + webhook creditando | passa a vender | feito em 25/09 |
| 5 | Trava, avisos, teto diário e **relatório de cobertura do hedge (6.1)** | passa a ser seguro | **pendente, e é o proximo** |
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
