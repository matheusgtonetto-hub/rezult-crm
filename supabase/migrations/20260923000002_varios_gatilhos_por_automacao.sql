-- Vários gatilhos por automação.
--
-- Até aqui o bloco Início guardava UM gatilho, em `flow->'trigger'`. Agora
-- guarda uma lista em `flow->'triggers'`, e a tela continua escrevendo
-- `flow->'trigger'` com o primeiro da lista, como espelho, para que nada que
-- ainda leia o campo antigo pare de disparar no meio da subida.
--
-- Esta migration existe porque o BANCO também lê o gatilho, em dois lugares que
-- ninguém lembra ao mexer na tela:
--   1. alguma_automacao_escuta(), o porteiro que evita chamada HTTP por evento
--      que ninguém escuta. Lendo só o primeiro gatilho, uma automação cujo
--      segundo gatilho fosse "mensagem recebida" nunca seria acordada.
--   2. processar_gatilhos_de_metrica(), o avaliador de hora em hora.

-- ── 1. Leitor único dos dois formatos ───────────────────────────────────────
-- Espelha gatilhosDoFluxo() da tela e do automation-runner. Os três precisam
-- responder igual; é a mesma regra escrita na linguagem de cada lado.
create or replace function public.gatilhos_do_fluxo(p_flow jsonb)
returns setof jsonb
language sql
immutable
as $$
  select g
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_flow->'triggers') = 'array'
       and jsonb_array_length(p_flow->'triggers') > 0
        then p_flow->'triggers'
      when jsonb_typeof(p_flow->'trigger') = 'object'
        then jsonb_build_array(p_flow->'trigger')
      else '[]'::jsonb
    end
  ) as g;
$$;

comment on function public.gatilhos_do_fluxo(jsonb) is
  'Os gatilhos de um flow, no formato novo (triggers[]) ou no antigo (trigger). Unico lugar que conhece as duas formas.';

-- ── 2. Porteiro dos eventos ─────────────────────────────────────────────────
create or replace function public.alguma_automacao_escuta(
  p_company_id uuid,
  p_trigger_id text
) returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.automations a,
         lateral public.gatilhos_do_fluxo(a.flow) g
    where a.company_id = p_company_id
      and a.active
      and g->>'triggerId' = p_trigger_id
  );
$$;

-- ── 3. Trava do "uma vez só" por gatilho, não por automação ────────────────
-- A chave era (automacao, lead). Com dois gatilhos de métrica na MESMA
-- automação, o primeiro a disparar trancava o segundo para sempre, e o segundo
-- nunca rodaria para aquele lead. A chave passa a incluir o gatilho.
--
-- A chave é o triggerId, e não o id do gatilho: o id é atribuído na tela e muda
-- quando uma automação antiga é aberta e salva, e uma chave que muda faria o
-- gatilho disparar DE NOVO para quem já recebeu. Dois gatilhos do mesmo tipo na
-- mesma automação (duas faixas da mesma métrica) compartilham a trava: dispara
-- o primeiro que casar. É o erro para menos, que é o lado seguro aqui.
alter table public.automation_metric_fired
  add column if not exists trigger_key text not null default '';

-- Backfill: quem já disparou fica com o gatilho de métrica que a automação usa
-- hoje. Sem isto, toda linha existente ficaria com chave '' e o primeiro ciclo
-- do cron re-disparia para clientes que já receberam.
update public.automation_metric_fired f
set trigger_key = coalesce((
  select g->>'triggerId'
  from public.automations a,
       lateral public.gatilhos_do_fluxo(a.flow) g
  where a.id = f.automation_id
    and g->>'triggerId' in ('lead_qtd_ganhos', 'lead_valor_ganhos', 'lead_sem_compra')
  limit 1
), '')
where f.trigger_key = '';

alter table public.automation_metric_fired
  drop constraint if exists automation_metric_fired_pkey;
alter table public.automation_metric_fired
  add primary key (automation_id, trigger_key, lead_id);

comment on column public.automation_metric_fired.trigger_key is
  'triggerId do gatilho de metrica que disparou. Entrou em 2026-09-23, quando a automacao passou a aceitar varios gatilhos.';

-- ── 4. Avaliador das métricas ───────────────────────────────────────────────
create or replace function public.processar_gatilhos_de_metrica()
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  a record;
  alvo record;
  v_disparos integer := 0;
  v_limite numeric;
begin
  -- Uma linha por GATILHO de métrica, não por automação: a mesma automação pode
  -- ter dois, cada um com o seu limite.
  for a in
    select aut.id, aut.company_id,
           g->>'triggerId' as gatilho,
           coalesce(g->'configData', '{}'::jsonb) as cfg
    from public.automations aut,
         lateral public.gatilhos_do_fluxo(aut.flow) g
    where aut.active
      and g->>'triggerId' in
          ('lead_qtd_ganhos', 'lead_valor_ganhos', 'lead_sem_compra')
  loop
    v_limite := nullif(
      coalesce(a.cfg->>'quantidade', a.cfg->>'valor', a.cfg->>'dias'), ''
    )::numeric;

    -- Limite zerado ou em branco casaria com a base inteira. Trata como "ainda
    -- não configurado" e ignora, em vez de disparar para todos os leads.
    if v_limite is null or v_limite <= 0 then
      continue;
    end if;

    for alvo in
      with por_pessoa as (
        select
          public.nucleo_telefone(l.whatsapp) as pessoa,
          count(*)    filter (where l.status = 'won')                 as qtd_ganhos,
          sum(coalesce(l.value, 0)) filter (where l.status = 'won')   as valor_ganhos,
          max(coalesce(l.won_at, l.created_at)) filter (where l.status = 'won') as ultimo_ganho
        from public.leads l
        where l.company_id = a.company_id
          and l.whatsapp is not null and l.whatsapp <> ''
        group by 1
      ),
      elegivel as (
        select p.pessoa, p.qtd_ganhos, p.valor_ganhos, p.ultimo_ganho
        from por_pessoa p
        where case a.gatilho
                when 'lead_qtd_ganhos'   then p.qtd_ganhos   >= v_limite
                when 'lead_valor_ganhos' then p.valor_ganhos >= v_limite
                when 'lead_sem_compra'   then p.ultimo_ganho is not null
                                          and p.ultimo_ganho < now() - (v_limite || ' days')::interval
              end
      )
      select distinct on (e.pessoa)
             l.id as lead_id, e.qtd_ganhos, e.valor_ganhos, e.ultimo_ganho
      from elegivel e
      join public.leads l
        on l.company_id = a.company_id
       and public.nucleo_telefone(l.whatsapp) = e.pessoa
      order by e.pessoa, l.created_at desc
    loop
      begin
        insert into public.automation_metric_fired (automation_id, trigger_key, lead_id)
        values (a.id, a.gatilho, alvo.lead_id);
      exception when unique_violation then
        continue;
      end;

      perform public.dispatch_automation_event(
        a.gatilho, a.company_id, alvo.lead_id,
        jsonb_build_object(
          'metric_qtd_ganhos',   coalesce(alvo.qtd_ganhos, 0),
          'metric_valor_ganhos', coalesce(alvo.valor_ganhos, 0),
          'metric_ultimo_ganho', alvo.ultimo_ganho,
          'metric_limite',       v_limite
        )
      );
      v_disparos := v_disparos + 1;
    end loop;
  end loop;

  return v_disparos;
end;
$$;
