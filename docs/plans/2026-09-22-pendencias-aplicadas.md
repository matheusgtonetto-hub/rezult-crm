# Três pendências aplicadas

Data: 22/09/2026. As três que estavam em aberto ao fim do refino, autorizadas em
bloco pelo dono.

## 1. O valor do negócio "Carolina Janot"

Estava valendo R$ 797 desde 11/09. O histórico do próprio negócio reconstrói o
que houve:

| Hora | Evento |
|---|---|
| 13:48:13 | ganho com **R$ 2.191,00** |
| 13:48:14 | reaberto |
| 13:48:18 | ganho com **R$ 797,00** |

R$ 797,00 é o preço de tabela exato do produto, e cinco segundos separam os dois
ganhos: é a assinatura do defeito do diálogo de ganho, corrigido em 20/09. O
valor negociado é o primeiro.

**Aplicado:** o item do negócio passou a valer R$ 2.191 (o gatilho recalculou
`leads.value`), `won_value` foi para R$ 2.191, e uma anotação no histórico
explica a correção. Sem a anotação, seria um número que mudou sozinho.

**Só este caso.** A varredura procurou todo negócio com dois ganhos de valores
diferentes: apareceram dois, e o outro é um negócio de teste que subiu de 0 para
R$ 5.000 com 34 dias entre os ganhos, ou seja, alguém editando de propósito.

## 2. RLS em `public.vagas_postadas`

A tabela estava com RLS desligado e `anon` com todos os privilégios, inclusive
DELETE e TRUNCATE. A chave anon é pública (vai no pacote do site), então as 27
linhas podiam ser apagadas por qualquer um. Não há dado pessoal: é o registro de
quais vagas já foram postadas, para não repetir.

Nenhum código do CRM lê essa tabela, mas ela recebia escrita de fora até 19/09 e
não há como provar qual chave a automação usa. Por isso SELECT e INSERT seguem
abertos, e o que fecha é o que destrói: UPDATE e DELETE sem política, TRUNCATE
revogado no grant (TRUNCATE não passa por RLS).

Migration: `20260922000001_rls_vagas_postadas.sql`. O alerta saiu do advisor.

## 3. Entrega 2 de vários produtos por negócio

Registrada em `2026-09-20-dois-produtos-por-negocio.md`, seção "Executado em
22/09/2026".

## Pendente de autorização

O deploy das Edge Functions `automation-runner`, `agent-operacional-runner` e
`agent-sds-qualify` foi recusado pelo modo automático ("Production Deploy"). O
código está pronto e versionado; o motor segue rodando a versão antiga até o
deploy.

## Correção no próprio trabalho: o revoke que não revogava

As duas funções novas saíram com `revoke execute ... from anon, authenticated`,
e isso não tirou nada. O privilégio não vinha de um grant nominal a esses
papéis: vinha de PUBLIC, que o Postgres concede por padrão em toda função nova
e que todo papel carrega. A ACL continuava `=X/postgres` (o `=` vazio é PUBLIC)
e `has_function_privilege('anon', …)` respondia **true** depois do revoke.

Não era detalhe. As funções são SECURITY DEFINER e não perguntam quem chamou --
quem responde por isso é o service role do runner e do agente. Pela API
pública, `/rest/v1/rpc/adicionar_item_do_negocio` com a chave anon (que vai no
pacote do site) escreveria em negócio de qualquer empresa, passando por cima do
RLS, que SECURITY DEFINER ignora.

Corrigido revogando de PUBLIC e concedendo a `service_role` explicitamente.
Conferido depois: anon **false**, authenticated **false**, service_role
**true**. Os três consumidores (automation-runner, agent-operacional-runner,
agent-sds-qualify) criam o cliente com `SUPABASE_SERVICE_ROLE_KEY`, então nada
neles depende do que foi revogado.

Lição para as próximas funções: revogar de PUBLIC, não dos papéis.

## Deploy

Feito pelo dono em 22/09: `automation-runner` (v129), `agent-sds-qualify`
(v126) e `agent-operacional-runner` (v4), todas ACTIVE.
