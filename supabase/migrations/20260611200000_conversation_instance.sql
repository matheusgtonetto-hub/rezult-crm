-- Multiatendimento: cada conversa pertence a UMA instância (número do WhatsApp).
-- Assim o histórico não mistura entre instâncias e a instância é lembrada ao
-- reabrir a conversa. A identidade da conversa passa a ser (instance_id, phone).
alter table public.whatsapp_conversations
  add column if not exists instance_id text;

-- Backfill: associa cada conversa existente à instância da sua mensagem mais
-- recente (melhor esforço; conversas sem match ficam null e usam o fallback).
update public.whatsapp_conversations c
set instance_id = sub.instance_id
from (
  select distinct on (owner_id, phone) owner_id, phone, instance_id
  from public.whatsapp_messages
  where instance_id is not null and instance_id <> ''
  order by owner_id, phone, created_at desc
) sub
where c.instance_id is null
  and c.owner_id = sub.owner_id
  and c.phone = sub.phone;
