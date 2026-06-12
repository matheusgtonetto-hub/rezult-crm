-- Mensagens de mídia (áudio/imagem/documento) precisam da URL pública do arquivo
-- para reprodução/preview no Multiatendimento. Antes só guardávamos o nome/duração
-- em body, então o chat não conseguia tocar o áudio enviado.
alter table public.whatsapp_messages
  add column if not exists media_url text;
