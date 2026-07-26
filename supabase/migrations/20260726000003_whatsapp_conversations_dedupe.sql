-- Bug reportado: duas mensagens inbound chegando poucos ms uma da outra pro
-- mesmo (instance_id, phone) sem conversa ainda faziam o handler de realtime
-- do frontend criar DUAS conversas, porque cada disparo consultava o estado
-- local antes do primeiro `setConvList` do outro ter sido commitado (race
-- condition). Não havia nada no banco impedindo o insert duplicado.
--
-- Mescla as duplicatas exatas existentes (mesmo owner_id + instance_id +
-- phone) na mais antiga: apaga as demais, antes de criar a constraint única
-- (senão a criação falharia). Confirmado via information_schema que nenhuma
-- outra tabela tem FK pra whatsapp_conversations.id -- mensagens são
-- associadas por (instance_id, phone), não por conversation_id, então nada
-- fica órfão.
do $$
declare
  r record;
  keep_id uuid;
  dup_id uuid;
begin
  for r in
    select owner_id, instance_id, phone, array_agg(id order by created_at asc) as ids
    from public.whatsapp_conversations
    where instance_id is not null and phone is not null
    group by owner_id, instance_id, phone
    having count(*) > 1
  loop
    keep_id := r.ids[1];
    for i in 2 .. array_length(r.ids, 1) loop
      dup_id := r.ids[i];
      delete from public.whatsapp_conversations where id = dup_id;
    end loop;
  end loop;
end $$;

-- Constraint única "de verdade" (não índice parcial): o cliente JS do Supabase
-- só aceita lista de colunas em onConflict, sem predicado WHERE, então uma
-- unique index parcial não pode ser usada como alvo de upsert. Uma UNIQUE
-- constraint normal já trata NULL como "nunca conflita com NULL" por padrão
-- do SQL, então conversas legadas sem instance_id/phone continuam livres
-- pra coexistir -- não precisa de cláusula WHERE nenhuma.
alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_owner_instance_phone_key
  unique (owner_id, instance_id, phone);
