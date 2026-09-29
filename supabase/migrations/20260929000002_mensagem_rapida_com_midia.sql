-- Mensagem rápida deixa de ser só texto: agora também arquivo e áudio.
--
-- ─── O modelo ────────────────────────────────────────────────────────────────
--
-- `tipo` diz o que a mensagem É, e o resto das colunas segue daí. A alternativa
-- era inferir pelo preenchimento (tem media_url? então é mídia), mas aí um
-- arquivo com legenda e um texto seriam indistinguíveis, e nada impediria uma
-- linha com os dois pela metade.
--
-- A mídia fica no bucket `automation-media`, o MESMO que o chat já usa para
-- arquivo e áudio enviados. Não é conveniência: é o bucket que já está público,
-- já tem as políticas certas e já é de onde os provedores (Cloud API e D-API)
-- baixam o arquivo pela URL. Um bucket novo exigiria repetir tudo isso.
--
-- ─── Por que `content` deixa de ser obrigatório ──────────────────────────────
--
-- Áudio não tem texto. Deixar `not null` obrigaria a gravar string vazia, e aí
-- a checagem "tem conteúdo?" viraria `btrim(content) <> ''` espalhada pelo
-- código, em vez de uma regra no banco. As linhas que já existem são todas
-- 'texto' com conteúdo, então o default de `tipo` as mantém válidas sem
-- backfill.

alter table public.quick_messages
  add column if not exists tipo          text not null default 'texto',
  add column if not exists media_url     text,
  add column if not exists media_nome    text,
  add column if not exists media_mime    text,
  -- Segundos. É o que o chat mostra no balão da nota de voz antes de tocar;
  -- sem isso o áudio aparece como 00:00, que foi um defeito real do envio
  -- avulso quando o upload falhava.
  add column if not exists media_duracao integer;

alter table public.quick_messages alter column content drop not null;

alter table public.quick_messages
  drop constraint if exists quick_messages_tipo_valido;
alter table public.quick_messages
  add constraint quick_messages_tipo_valido check (tipo in ('texto', 'arquivo', 'audio'));

-- A regra que impede meia-linha: texto sem texto, ou mídia sem arquivo, não
-- entram. Sem ela, uma falha no upload salvaria uma mensagem rápida de áudio
-- que não toca nada, e o defeito só apareceria na frente do cliente.
alter table public.quick_messages
  drop constraint if exists quick_messages_conteudo_coerente;
alter table public.quick_messages
  add constraint quick_messages_conteudo_coerente check (
    case tipo
      when 'texto' then content is not null and btrim(content) <> ''
      else media_url is not null
    end
  );

comment on column public.quick_messages.tipo is
  'texto | arquivo | audio. Define qual das outras colunas e obrigatoria (ver quick_messages_conteudo_coerente).';
comment on column public.quick_messages.content is
  'Obrigatorio em texto. Em arquivo, e a legenda opcional. Em audio, sempre nulo.';
