# Vários gatilhos por automação

Pedido do dono (23/09/2026): "o campo início só deixa adicionar um gatilho de
ativação, quero que possibilite adicionar vários".

## Regra de funcionamento

Os gatilhos do bloco Início valem como **OU**: basta um deles acontecer para a
automação rodar, e ela roda **uma vez** por evento, mesmo que dois gatilhos
descrevam o mesmo acontecimento. Executar uma vez por gatilho casado mandaria a
mesma mensagem duas vezes para o cliente.

Cada gatilho tem a sua própria configuração (etapa, tag, funil), então dá para
pôr dois "Negócio movido" apontando para etapas diferentes.

## Onde o gatilho era lido

O campo não era lido só pela tela. Eram quatro leitores, e três estavam fora do
código do editor:

| Leitor | Arquivo | O que quebraria se ficasse para trás |
|---|---|---|
| Editor | `src/pages/AutomacoesPage.tsx` | mostrar e salvar |
| Motor | `supabase/functions/automation-runner/index.ts` | o disparo em si |
| Porteiro de eventos | `alguma_automacao_escuta()` | evento com o 2º gatilho nunca acordaria a automação |
| Avaliador de métricas | `processar_gatilhos_de_metrica()` | só o 1º gatilho seria avaliado |

Os três lados ganharam a mesma função, escrita na linguagem de cada um:
`gatilhosDoFluxo` (TS, duas cópias) e `public.gatilhos_do_fluxo(jsonb)` (SQL).

## Compatibilidade

`flow.triggers` é a lista verdadeira. `flow.trigger` continua sendo gravado com
o primeiro da lista, como espelho, para que uma automação salva na tela nova não
pare de disparar enquanto a Edge Function antiga ainda estiver no ar. As 36
automações da base estão todas no formato antigo e são lidas pelo caminho de
compatibilidade, sem migração de dados.

## Trava do "uma vez só" das métricas

`automation_metric_fired` tinha chave `(automação, lead)`. Com dois gatilhos de
métrica na mesma automação, o primeiro a disparar trancaria o segundo para
sempre. A chave passou a incluir `trigger_key`.

A chave é o `triggerId`, e não o id do gatilho: o id é atribuído na tela e muda
quando uma automação antiga é aberta e salva, e uma chave que muda faria o
gatilho disparar de novo para quem já recebeu. O custo é que dois gatilhos do
mesmo tipo na mesma automação dividem a trava. É o erro para menos, que é o lado
seguro: deixar de disparar é um evento perdido, disparar em laço é o cliente
recebendo mensagem repetida.

## Para subir

```bash
supabase functions deploy automation-runner --project-ref adhjmwkgyxrpsohufqob
```

E rodar `supabase/migrations/20260923000002_varios_gatilhos_por_automacao.sql`
no SQL editor.
