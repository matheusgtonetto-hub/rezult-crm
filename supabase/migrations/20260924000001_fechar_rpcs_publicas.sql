-- Fecha três funções SECURITY DEFINER que a chave anon alcançava.
--
-- ─── O problema ────────────────────────────────────────────────────────────
--
-- `anon` é a chave pública do Supabase: ela vai no bundle do front e qualquer
-- pessoa lê. Uma função SECURITY DEFINER roda com os poderes do DONO dela, e
-- ignora RLS. Quando as duas coisas se encontram numa função que não checa quem
-- chamou, qualquer um de fora pode executá-la contra QUALQUER empresa.
--
-- É o terceiro caso do mesmo erro nesta base: em 22/09 nas funções de item do
-- negócio, em 23/09 em definir_departamentos_do_membro, e agora estas três.
-- O privilégio vem de PUBLIC (o `=X/postgres` na ACL), então revogar de anon e
-- authenticated sem revogar de public não tira nada -- foi por isso que a
-- primeira tentativa de correção, em 22/09, não corrigiu.
--
-- | Função                        | O que dava para fazer com a chave pública |
-- |-------------------------------|-------------------------------------------|
-- | dispatch_automation_event     | disparar automação de qualquer empresa,   |
-- |                               | o que inclui MANDAR WHATSAPP para o lead  |
-- | criar_agente_operacional      | criar um agente em qualquer empresa       |
-- | processar_gatilhos_de_metrica | rodar o avaliador de métricas à vontade   |
--
-- ─── Por que não quebra nada ───────────────────────────────────────────────
--
-- Quem chama estas três são cinco funções de gatilho do banco
-- (leads/activities/mensagens/conversas_automation_trigger_fn e
-- trg_fn_criar_agente_operacional), todas SECURITY DEFINER, e dois jobs do
-- pg_cron. Uns e outros rodam como o dono, e não como anon ou authenticated:
-- nenhum perde acesso. Nem o front nem as Edge Functions chamam qualquer uma
-- delas (verificado por busca no código em 24/09/2026).

revoke execute on function public.dispatch_automation_event(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.criar_agente_operacional(uuid)                     from public, anon, authenticated;
revoke execute on function public.processar_gatilhos_de_metrica()                    from public, anon, authenticated;

grant execute on function public.dispatch_automation_event(text, uuid, uuid, jsonb) to service_role;
grant execute on function public.criar_agente_operacional(uuid)                     to service_role;
grant execute on function public.processar_gatilhos_de_metrica()                    to service_role;

-- ── O gatilho "agendado" também precisava dos vários gatilhos ──────────────
--
-- O job de hora em hora procurava automações por
-- `flow->'trigger'->>'triggerId' = 'agendado'`, o formato de UM gatilho só.
-- Depois de 23/09 uma automação pode ter o "agendado" na segunda posição, e
-- aí o job não a enxergaria: ela simplesmente nunca rodaria, sem erro nenhum.
--
-- Este SQL mora no comando do job do pg_cron, e não num arquivo de migration,
-- que é por isso que ele escapou da varredura feita naquele dia.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'automation-agendado-hourly'),
  command := $cron$
  DO $$
  DECLARE
    r RECORD;
  BEGIN
    -- Só percorre leads de empresa que TENHA automação ativa no gatilho
    -- "agendado". Antes disparava para todo lead aberto de toda empresa, toda
    -- hora: 1268 POSTs/hora para nenhum ouvinte.
    FOR r IN
      SELECT l.id AS lead_id, c.id AS company_id
      FROM public.companies c
      JOIN public.leads l ON l.owner_id = c.owner_id AND l.status = 'open'
      WHERE EXISTS (
        SELECT 1
        FROM public.automations a,
             LATERAL public.gatilhos_do_fluxo(a.flow) g
        WHERE a.company_id = c.id AND a.active
          AND g->>'triggerId' = 'agendado'
      )
    LOOP
      PERFORM public.dispatch_automation_event('agendado', r.company_id, r.lead_id, '{}');
    END LOOP;
  END;
  $$
  $cron$
);
