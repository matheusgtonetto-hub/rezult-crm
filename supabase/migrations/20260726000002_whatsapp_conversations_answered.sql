-- "Não iniciadas" e "Abertas" no Multiatendimento se sobrepunham: "Abertas"
-- era simplesmente "não finalizada", um superset que já incluía toda conversa
-- "Não iniciadas" (que também não está finalizada). Faltava um sinal real de
-- "o atendente já respondeu nessa conversa" pra separar os dois estados.
--
-- answered = true assim que a primeira mensagem enviada pelo atendente (bumpPreview,
-- chamado em todo envio de texto/áudio/imagem/arquivo) acontecer nessa conversa.
alter table public.whatsapp_conversations
  add column if not exists answered boolean not null default false;

-- Backfill: marca como respondida toda conversa que já tem pelo menos uma
-- mensagem enviada (from_me=true) em whatsapp_messages. Casamento por
-- (instance_id exato + últimos 10 dígitos do telefone), pois
-- whatsapp_messages.phone não guarda o DDI e whatsapp_conversations.phone
-- guarda (mesma normalização usada em normalizeBrPhone/phonesMatch no app).
update public.whatsapp_conversations wc
set answered = true
where wc.instance_id is not null
  and wc.phone is not null
  and exists (
    select 1
    from public.whatsapp_messages wm
    where wm.instance_id = wc.instance_id
      and wm.from_me = true
      and right(regexp_replace(wm.phone, '\D', '', 'g'), 10) = right(regexp_replace(wc.phone, '\D', '', 'g'), 10)
  );
