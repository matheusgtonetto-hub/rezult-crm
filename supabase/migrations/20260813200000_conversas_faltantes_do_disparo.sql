-- Fase 1, passo 2.5: cria as conversas que faltavam para as mensagens de
-- disparo, para o passo 3 poder ler SÓ por conversation_id sem esconder nada.
--
-- Contexto: 80 mensagens, para 20 leads, enviadas entre 31/07 e 05/08 por um
-- caminho que gravava a mensagem sem criar a linha da conversa. Elas existiam no
-- banco e não apareciam em lugar nenhum do CRM. O passo 2 fechou a torneira
-- (todo caminho de envio agora cria a conversa antes); esta migration limpa o
-- que já tinha vazado.
--
-- Decisões tomadas aqui, e o porquê de cada uma:
--
-- last_msg_at recebe a data REAL da última mensagem, não now(). Com now() as 20
-- conversas subiriam para o topo da caixa de entrada hoje, como se algo tivesse
-- acontecido agora. Com a data real elas aparecem no lugar cronológico delas, 8
-- a 13 dias atrás, que é onde de fato pertencem.
--
-- read = true porque todas as mensagens são nossas (from_me). Não há nada
-- aguardando resposta do atendente; marcar como não lida criaria 20 notificações
-- falsas.
--
-- finished = false (o padrão). Marcar como finalizada afirmaria que alguém
-- concluiu o atendimento, e ninguém concluiu: o lead simplesmente não respondeu.
-- Se a preferência for tirá-las da lista de abertas, é um UPDATE de uma linha,
-- e essa é uma decisão de operação, não de dados.
--
-- name vem do lead quando existe (todos os 20 têm), não do telefone. Conversa
-- chamada "5511981662549" é pior que não existir.
--
-- Só a instância viva. As outras 5 mensagens órfãs estão em instâncias que não
-- existem mais em whatsapp_connections (sessões de teste já removidas). Criar
-- conversa apontando para uma linha morta produziria um item que nunca abre.

with orfas as (
  select m.*
  from public.whatsapp_messages m
  join public.whatsapp_connections k on k.instance_id = m.instance_id
  where m.conversation_id is null
    and length(public.nucleo_telefone(m.phone)) >= 10
),
grupos as (
  select owner_id, company_id, instance_id,
         public.nucleo_telefone(phone)                  as nucleo,
         (array_agg(phone order by created_at desc))[1] as phone,
         (array_agg(body  order by created_at desc))[1] as ultimo_corpo,
         max(created_at)                                as ultima_em
  from orfas
  group by 1, 2, 3, 4
),
novas as (
  insert into public.whatsapp_conversations
    (owner_id, company_id, instance_id, name, phone, channel, tags, preview, last_msg_at, read)
  select g.owner_id, g.company_id, g.instance_id,
         coalesce(l.name, g.phone),
         g.phone,
         'whatsapp',
         '{}',
         coalesce(left(g.ultimo_corpo, 120), ''),
         g.ultima_em,
         true
  from grupos g
  left join lateral (
    select name from public.leads
    where company_id = g.company_id
      and public.nucleo_telefone(whatsapp) = g.nucleo
    order by created_at
    limit 1
  ) l on true
  returning id, owner_id, instance_id, phone
)
-- Vincula as mensagens às conversas recém-criadas, pela mesma chave que o
-- backfill original usa.
update public.whatsapp_messages m
set conversation_id = n.id
from novas n
where m.conversation_id is null
  and m.owner_id = n.owner_id
  and m.instance_id = n.instance_id
  and public.nucleo_telefone(m.phone) = public.nucleo_telefone(n.phone);
