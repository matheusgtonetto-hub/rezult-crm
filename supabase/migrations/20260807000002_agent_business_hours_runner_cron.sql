-- Agenda o agent-business-hours-runner (retoma conversas que o agente
-- deixou sem resposta por causa do gate de horário de atendimento -- ver
-- comentário no topo de supabase/functions/agent-business-hours-runner/index.ts).
-- Mesma granularidade e padrão dos outros runners de agente (a cada minuto,
-- só invoca a function se existir pelo menos 1 agente usando a restrição de
-- horário -- o filtro fino de "está dentro da janela agora" roda dentro da
-- própria function, por agente/fuso).
select cron.schedule(
  'process-agent-business-hours',
  '* * * * *',
  $job$
  select net.http_post(
    url              => (select value from automation_runner_config where key = 'supabase_url' limit 1)
                        || '/functions/v1/agent-business-hours-runner',
    headers          => jsonb_build_object(
                          'Content-Type',  'application/json',
                          'Authorization', 'Bearer ' || (select value from automation_runner_config where key = 'automation_secret' limit 1)
                        ),
    body             => '{}'::jsonb,
    timeout_milliseconds => 55000
  )
  where exists (
    select 1 from agents
    where type = 'SDS' and active = true
      and (behavior_config->>'horario_atendimento_ativo')::boolean is true
  )
  $job$
);
