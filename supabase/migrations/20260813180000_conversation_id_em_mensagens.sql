-- Fase 1 do plano de atendimentos, passo 1 de 3: dar às mensagens um vínculo
-- explícito com a conversa.
--
-- Hoje mensagem e conversa se encontram por TEXTO: 22 das 28 consultas montam
-- uma lista de variantes do telefone (com/sem 55, com/sem o nono dígito) e
-- procuram por igualdade de string. Isso é a origem direta de conversa
-- duplicada, histórico que some e `.maybeSingle()` estourando com mais de uma
-- linha. Um id resolve de uma vez.
--
-- Este passo é ADITIVO: cria a coluna, preenche o histórico e para por aí.
-- Nenhuma consulta lê a coluna ainda, então nada muda de comportamento e
-- reverter é um `drop column`. Trocar as consultas vem depois, e só depois de
-- confirmar que mensagem nova nasce com o vínculo preenchido.

-- ── A regra de normalização, agora também em SQL ────────────────────────────
--
-- O backfill precisa casar telefone do mesmo jeito que o aplicativo casa. Se as
-- duas regras divergirem em um único número, aquela conversa recebe mensagem de
-- outra pessoa, e o erro fica GRAVADO no banco em vez de aparecer na tela.
--
-- Espelha supabase/functions/_shared/telefone.ts::normalizarTelefoneBr. A
-- igualdade foi provada, não assumida: os dois lados normalizaram as mesmas
-- 100.005 entradas geradas pela mesma fórmula e produziram o mesmo md5
-- (b0a9d8975388258ebaf2ddcc9c4d9992). Ao mexer em um lado, refaça a prova.
--
-- As duas reduções, na ordem, e a ordem importa:
--   1. tira o código do país só quando sobra número demais para ser nacional
--      (>11 dígitos). O guarda existe porque 55 também é o DDD de Santa Maria;
--      a base tem "+5555996635570" de verdade, que é um número gaúcho.
--   2. tira o nono dígito do celular, exigido pela operadora desde 2013, que
--      cada canal grava de um jeito.
--
-- `set search_path = ''` não é enfeite. Sem isso o linter do Supabase acusa
-- `function_search_path_mutable`, e o motivo é concreto: uma função IMMUTABLE
-- cujo search_path varia por sessão pode resolver nomes diferentes conforme
-- quem chama. Aqui só há built-in do pg_catalog, que é sempre visível mesmo com
-- o caminho vazio, então travar não custa nada e fecha a porta antes de alguém
-- criar um índice funcional em cima desta função, que é quando isso passa a ser
-- corrupção de índice em vez de aviso.
create or replace function public.nucleo_telefone(bruto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when length(d2) = 11 and substr(d2, 3, 1) = '9'
             then left(d2, 2) || substr(d2, 4)
           else d2
         end
  from (
    select case
             when length(d1) > 11 and left(d1, 2) = '55' then substr(d1, 3)
             else d1
           end as d2
    from (select regexp_replace(coalesce(bruto, ''), '\D', '', 'g') as d1) a
  ) b;
$$;

comment on function public.nucleo_telefone(text) is
  'Telefone BR reduzido a DDD + 8 dígitos, para comparação. Espelha normalizarTelefoneBr em supabase/functions/_shared/telefone.ts — os dois precisam concordar.';

-- ── A coluna ────────────────────────────────────────────────────────────────
--
-- Anulável de propósito. 87 mensagens do histórico não têm conversa
-- correspondente (80 delas são disparos que nunca criaram a linha da conversa),
-- e inventar uma conversa para elas seria fabricar dado. Null diz a verdade:
-- "esta mensagem ainda não sabe a que conversa pertence".
--
-- on delete set null, não cascade: apagar uma conversa não pode apagar o
-- histórico de mensagens junto. A mensagem é o fato; a conversa é o agrupamento.
alter table public.whatsapp_messages
  add column if not exists conversation_id uuid
    references public.whatsapp_conversations(id) on delete set null;

comment on column public.whatsapp_messages.conversation_id is
  'Conversa a que a mensagem pertence. Null = ainda não vinculada (histórico anterior ao vínculo, ou disparo sem conversa criada).';

-- Índice para o padrão que vai substituir a busca por variantes de telefone:
-- "as mensagens desta conversa, mais recentes primeiro".
create index if not exists idx_whatsapp_messages_conversation
  on public.whatsapp_messages (conversation_id, created_at desc)
  where conversation_id is not null;

-- ── Backfill ────────────────────────────────────────────────────────────────
--
-- Casa por (dono, instância, núcleo do telefone), que é a mesma chave que o
-- Multiatendimento usa hoje para agrupar mensagem em conversa. A instância entra
-- porque o mesmo número atendido por duas linhas são duas conversas separadas.
--
-- Conferido antes de rodar, sobre os dados reais:
--   3.597 mensagens casam com exatamente 1 conversa
--      87 mensagens não casam com nenhuma  → ficam null
--       0 mensagens casam com mais de uma  → não existe ambiguidade a resolver
--
-- É esse zero que torna o backfill seguro: não há escolha a fazer, então não há
-- escolha errada a fazer.
update public.whatsapp_messages m
set conversation_id = c.id
from public.whatsapp_conversations c
where m.conversation_id is null
  and c.owner_id = m.owner_id
  and c.instance_id is not distinct from m.instance_id
  and public.nucleo_telefone(c.phone) = public.nucleo_telefone(m.phone)
  -- Guarda de empresa. O escopo natural aqui seria company_id, mas a tela casa
  -- por owner_id e a Fase 1 se propoe a nao mudar o que aparece, entao o
  -- owner_id fica. Acontece que owner_id e por PESSOA, nao por empresa: no dia
  -- em que um cliente criar a segunda empresa, o mesmo telefone atendido nas
  -- duas cruzaria a fronteira -- e aqui o erro fica gravado no banco, protegido
  -- por chave estrangeira, nao so exibido na tela.
  --
  -- Tolera nulo dos dois lados de proposito: existe 1 mensagem antiga com
  -- company_id nulo cuja conversa sabe a empresa certa, e exigir igualdade
  -- estrita a desvincularia sem motivo.
  --
  -- Conferido: hoje sao 10 donos para 10 empresas, entao a guarda nao muda
  -- nenhum vinculo. Ela existe para o dia em que isso deixar de ser verdade.
  and (m.company_id is null or c.company_id is null or m.company_id = c.company_id)
;

-- Segunda passada: mensagem de sistema guarda o ID DA CONVERSA na coluna phone.
--
-- É o que a tela já reconhece hoje, no `phone.eq.${activeId}` que ela acrescenta
-- à lista de variantes. Ou seja: essas mensagens sempre souberam a que conversa
-- pertencem, só que pelo campo errado. A primeira passada não as pega porque
-- normalizar um UUID produz dígitos que não casam com telefone nenhum.
--
-- Casamento exato por id, então não há ambiguidade possível. Conferido antes:
-- 1 mensagem nessa situação, nenhuma já vinculada em outro lugar.
update public.whatsapp_messages m
set conversation_id = c.id
from public.whatsapp_conversations c
where m.conversation_id is null
  and c.id::text = m.phone;

-- Terceira passada: conversa LEGADA, sem instância gravada.
--
-- A tela trata esse caso de propósito: `if (active.instanceId)` só aplica o
-- filtro de instância quando a conversa tem uma, então conversa antiga casa
-- pelo telefone em qualquer linha. O mesmo aparece no realtime, em
-- `(!c.instanceId || !msgInst || c.instanceId === msgInst)`.
--
-- Sem esta passada o vínculo mostraria MENOS mensagens que a tela mostra hoje,
-- e a Fase 1 inteira se propõe a não mudar o que aparece. Foi assim que este
-- caso apareceu: comparando, conversa a conversa, o conjunto de mensagens da
-- consulta atual com o do vínculo novo. 186 de 187 bateram; esta é a 187ª.
--
-- Vem por último de propósito. As duas passadas acima são mais específicas, e
-- rodando antes garantem que uma mensagem com instância própria fique na
-- conversa da instância dela, não na legada. A precedência fica no código, não
-- na sorte do plano de execução.
--
-- Conferido antes de rodar: 2 conversas sem instância na base, e sob esta regra
-- nenhuma mensagem passa a casar com mais de uma conversa.
update public.whatsapp_messages m
set conversation_id = c.id
from public.whatsapp_conversations c
where m.conversation_id is null
  and c.owner_id = m.owner_id
  and c.instance_id is null
  and public.nucleo_telefone(c.phone) = public.nucleo_telefone(m.phone)
  and (m.company_id is null or c.company_id is null or m.company_id = c.company_id);
