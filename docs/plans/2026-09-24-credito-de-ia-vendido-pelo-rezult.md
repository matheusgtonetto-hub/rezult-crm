# Vender crédito de IA dentro do Rezult

Pergunta do dono (24/09/2026), depois de ver o kiwiagent.com vender crédito por
Stripe dentro do próprio produto: dá para fazer isso no Rezult, e o que
precisa?

Resposta curta: **dá, e o senhor está mais perto do que imagina.** Mas o número
que decide o projeto não é técnico, é o custo por lead. Ele está no fim deste
documento, e é o que muda a conversa.

---

## 1. A dor é real, e está medida

| Medida | Valor |
|---|---|
| Empresas na base | 13 |
| Empresas com agente criado | 13 |
| **Empresas com chave de IA ativa** | **3** |

Dez de treze criaram o agente e **pararam** exatamente no passo que o senhor
descreveu: criar conta na OpenAI, gerar API key, pôr saldo, colar no Rezult.
São 77% de abandono num funil que já estava dentro do produto, com o cliente já
convencido. Não é hipótese, é o estado da base hoje.

Qualquer discussão sobre esforço tem que ser lida contra esse número.

## 2. O que JÁ existe (e é mais do que parece)

| Peça | Estado | Onde |
|---|---|---|
| Medição de consumo em dólar | **Pronta** | `agent_usage_log` já grava `model`, `input_tokens`, `output_tokens`, `cost_usd` |
| Cobrança por Stripe | **Pronta** | `create-checkout-session`, `stripe-webhook`, `create-portal-session` no ar |
| Ponto único onde a chave é escolhida | **Pronto** | `agent-operacional-runner`, `agent-sds-qualify`, `automation-runner`, `ai-suggest-reply` leem `ai_provider_keys` |
| Bloqueio por inadimplência | **Pronto** | `empresa_bloqueada()` já barra execução |

O pedaço tradicionalmente mais difícil de um modelo de crédito -- **medir o
consumo com precisão suficiente para cobrar** -- já está construído e rodando.
91 chamadas registradas, US$ 2,2953 de custo real contabilizado.

## 3. O que NÃO existe

1. **Saldo.** Uma tabela de conta corrente por empresa (crédito comprado,
   consumo debitado, saldo atual) e o débito acontecendo a cada chamada.
2. **Checkout de valor avulso.** O Stripe hoje só vende assinatura. Falta a
   sessão de pagamento único, com os valores sugeridos.
3. **A chave da Rezult.** Uma chave nossa, com escopo e limite, usada quando a
   empresa não tem a própria.
4. **A trava.** O que acontece quando o saldo acaba no meio de uma conversa.
5. **O extrato.** O cliente precisa ver para onde foi o dinheiro dele, senão a
   primeira fatura vira chamado de suporte.

## 4. Os quatro riscos que decidem o projeto

### 4.1 O custo por lead, que é o risco de verdade

Medido na base, com os agentes que já rodaram:

| Medida | Valor |
|---|---|
| Custo médio por chamada | US$ 0,0252 |
| **Chamadas por lead atendido** | **44** |
| **Custo médio por lead** | **US$ 1,02** |
| Lead mais caro | US$ 2,02 |
| Lead mais barato | US$ 0,03 |

A amostra é pequena (2 leads), então trate como ordem de grandeza e não como
precificação. Mas a ordem de grandeza já é suficiente para o alerta:

**Um cliente que atende 200 leads no mês gasta ~US$ 200 de IA.** Ao câmbio de
hoje, mais de R$ 1.000, em cima de um plano de R$ 237 a R$ 747. O crédito não
seria um acessório barato; seria a maior linha da conta dele.

E a variação de 67x entre o lead mais caro e o mais barato é o segundo
problema: o cliente não consegue prever o gasto, e o que não se prevê não se
aprova.

**Antes de vender crédito, o custo por lead precisa cair.** Os caminhos:
modelo mais barato no operacional (as 44 chamadas por lead não precisam todas
do modelo grande), menos contexto por chamada, e cache. Vender crédito com o
custo atual é vender um problema com o nome de conveniência.

### 4.2 Revenda: verificado em 24/09/2026

O Services Agreement da OpenAI diz que o cliente *"may not resell or lease
access to their Account or any End User Account"*. **Revender acesso à conta é
proibido.** Mas a mesma leitura traz a distinção que salva o projeto: os
OUTPUTS são do cliente, e vender aplicações construídas sobre a API é
permitido. O que não se pode é repassar acesso ou credenciais.

Isso não impede o modelo. Define como ele se chama e como se vende:

| Não faça | Faça |
|---|---|
| Vender "crédito de OpenAI" | Vender **"crédito de uso dos agentes Rezult"** |
| Prometer "X tokens da OpenAI" | Prometer uso do produto |
| Expor a chave, o modelo ou o fornecedor | Manter o fornecedor como insumo interno |

É exatamente o que o Kiwiagent faz: o Stripe do print cobra "Kiwiagent
credits", não "créditos OpenAI". E é o segundo motivo para não informar o
modelo ao cliente -- além de ser melhor para o produto, é o que mantém a
relação como "vendo meu software" em vez de "revendo acesso alheio".

**Isto é leitura de termos, não parecer jurídico.** Antes de faturar, vale a
validação de quem responde por isso.

Fontes: [Services Agreement](https://openai.com/policies/services-agreement/),
[Business terms](https://openai.com/policies/aug-2023-business-terms/).

### 4.3 Câmbio e fiscal

O senhor compra em dólar e venderia em real. Entre a venda do crédito e o
consumo dele podem passar meses, e o câmbio corre contra a margem esse tempo
todo. Some IOF, a nota fiscal do que exatamente está sendo vendido, e o
tratamento contábil de crédito não consumido (que é obrigação, não receita).

Nada disso é impeditivo, e é resolvível com margem e com prazo de validade do
crédito. Mas é decisão sua e do seu contador, não minha.

### 4.4 Abuso e vazamento

Com a chave da Rezult rodando para o cliente, um laço mal configurado numa
automação consome dinheiro **seu** até alguém perceber. Precisa de teto por
empresa e por dia, corte automático e alarme. Isso não é opcional: é a
diferença entre um produto e um prejuízo.

### 4.5 O caixa: como o dinheiro anda de verdade

A pergunta do dono era não precisar comprar saldo antes para deixar disponível.
A resposta tem duas partes, e a primeira **corrige o que eu havia dito**.

**Não existe estoque por cliente.** O saldo do cliente é um número numa tabela
nossa. Ele compra, o número sobe; consome, o número desce. Nada é adquirido por
cliente, em lugar nenhum.

**Mas a conta da OpenAI é PRÉ-PAGA, e não pós-paga como eu afirmei antes.** A
OpenAI migrou de pós-pago para pré-pago: é preciso ter crédito na conta ANTES
de consumir. Então existe, sim, um capital inicial. O que se mantém da análise
anterior é o tamanho dele: um colchão proporcional à queima de alguns dias, e
não ao total vendido. Vendendo R$ 50.000 em crédito, não é preciso ter R$
50.000 lá dentro.

O mecanismo que o dono descreveu existe e se chama **auto-recharge**: repõe
quando o saldo cai abaixo de um limite definido, mínimo de US$ 5 por recarga,
com teto mensal opcional. É uma torneira agregada, alimentada pelo caixa que os
clientes já depositaram -- não uma compra por cliente.

Três parâmetros que vieram junto e mudam decisões:

1. **Créditos comprados expiram em 1 ano** e **não são reembolsáveis**.
   Argumento forte para colchão pequeno e recarga frequente, em vez de um lote
   grande comprado de uma vez.
2. **Saldo zero derruba todo mundo junto.** A API passa a devolver erro de cota
   esgotada, e como a conta é uma só, todos os clientes param ao mesmo tempo --
   inclusive os que têm saldo comprado. Precisa de alarme com folga de dias, e
   não aviso no dia.
3. O float (dinheiro recebido e ainda não consumido) **não é receita**, é
   obrigação. Gastá-lo é o mecanismo que quebra empresa de gift card. Receita se
   reconhece conforme o consumo acontece.

Fontes: [prepaid billing](https://help.openai.com/en/articles/8264778-what-is-prepaid-billing),
[expiração e recarga](https://benchlm.ai/blog/posts/api-credits-explained).

## 5. Recomendação

**Fazer, mas em duas etapas, e não como o senhor descreveu.**

### Etapa 1 -- Crédito como alternativa, não como substituto

- A empresa segue podendo usar a própria chave (BYOK).
- Quem não tem chave, compra crédito no Rezult e usa a nossa.
- Uma tabela de saldo, débito a cada chamada pelo `cost_usd` que já é
  calculado, teto diário por empresa, extrato na tela.
- Checkout avulso no Stripe, com os valores sugeridos, como no print.

Isso resolve os 77% de abandono **sem** tirar nada de quem já se virou
sozinho, e sem amarrar o produto a um fornecedor. O cliente novo entra pelo
caminho fácil; o avançado continua com o dele.

### Etapa 2 -- Só depois, e só se a Etapa 1 mostrar tração

Padronizar num provedor e remover a escolha de modelo. Aí sim a simplificação
que o senhor imaginou.

### O que eu NÃO recomendo agora

**Remover o BYOK e adotar um provedor único de saída.** Três motivos:

1. Amarra o preço do seu produto ao preço de um fornecedor. Se ele subir 30%,
   sua margem vai junto, e você não tem para onde correr.
2. As 3 empresas que já configuraram chave própria perderiam controle de custo
   que hoje têm. É tirar de quem já está funcionando.
3. Hoje a base roda `claude-sonnet-5`, `claude-haiku-4-5` e `gpt-5.6-terra`. Há
   trabalho de ajuste de prompt em cima de cada um, e trocar tudo de uma vez é
   mexer na qualidade do agente e no modelo de cobrança na mesma semana. Se a
   qualidade cair, ninguém vai saber se foi o modelo ou o preço.

A escolha de modelo é uma decisão de **custo**, e o senhor vai querer essa
alavanca na mão justamente quando estiver vendendo crédito.

## 6. Esforço, em ordem

| # | Tarefa | Depende de |
|---|---|---|
| 0 | ~~Verificar os termos do fornecedor~~ **feito em 24/09**: pode vender o produto, não pode revender acesso | — |
| 1 | Baixar o custo por lead (modelo, contexto, cache) | nada -- pode começar junto |
| 2 | Tabela de saldo + débito no `cost_usd` já calculado | 0 |
| 3 | Teto por empresa/dia + corte + alarme | 2 |
| 4 | Checkout avulso no Stripe + webhook creditando | 2 |
| 5 | Extrato na tela de Agentes | 2 |
| 6 | Chave da Rezult com fallback para a do cliente | 2, 3 |

O item 1 é o que manda agora, já que o 0 saiu do caminho. Os outros são trabalho conhecido em cima de
peças que já existem.

## 7. Resposta à pergunta "o que você acha?"

A leitura do senhor está certa no diagnóstico e no remédio: o atrito de criar
conta na OpenAI está custando 77% dos agentes, e vender crédito dentro do
produto remove esse atrito.

Onde eu discordo é no "assim não teriam outras opções de modelo". Isso troca um
problema do CLIENTE (atrito) por um problema SEU (margem amarrada a um
fornecedor, sem alavanca de custo). Dá para ter a mesma facilidade mantendo a
escolha escondida: o cliente não precisa saber qual modelo roda, e o senhor
precisa poder trocá-lo sem avisar ninguém.

E o número que eu levaria para a mesa antes de tudo: **US$ 1,02 por lead
atendido**. Se esse número não cair, o crédito vende bem uma vez e gera
cancelamento no segundo mês.
