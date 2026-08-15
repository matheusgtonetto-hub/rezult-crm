-- Gatilhos de métrica do lead: quantidade de ganhos, valor de ganhos, dias sem
-- compra.
--
-- São os três últimos gatilhos do catálogo que a tela oferecia sem nada atrás.
-- Diferente dos outros, não têm evento que os dispare: ninguém "faz" um lead
-- passar de 30 dias sem comprar, o tempo é que passa. Por isso vão num
-- avaliador periódico, e é também por isso que a própria tela avisa que o
-- disparo é assíncrono e pode acontecer horas depois da mudança.

-- ── 1. Quando o negócio foi ganho ───────────────────────────────────────────
-- A tabela leads não registrava isso: tem created_at e mais nada de data. Sem
-- essa coluna, "não compra há 30 dias" só poderia olhar a data de CRIAÇÃO do
-- negócio, o que é outra pergunta -- um negócio criado em janeiro e ganho ontem
-- pareceria uma compra de seis meses atrás.
alter table public.leads add column if not exists won_at timestamptz;

comment on column public.leads.won_at is
  'Quando o negocio virou ganho. Null nos historicos anteriores a 2026-08-14, que caem no created_at como aproximacao.';

create or replace function public.stamp_won_at()
returns trigger
language plpgsql
as $$
begin
  -- OLD não existe em INSERT: lê-lo ali levanta "record old is not assigned
  -- yet". Por isso os dois caminhos são separados por TG_OP.
  if TG_OP = 'INSERT' then
    if NEW.status = 'won' then
      NEW.won_at := now();
    end if;
    return NEW;
  end if;

  -- Carimba na virada para ganho e limpa se o negócio for reaberto, senão um
  -- negócio restaurado carregaria a data da vitória antiga para sempre.
  if NEW.status = 'won' and OLD.status is distinct from 'won' then
    NEW.won_at := now();
  elsif NEW.status is distinct from 'won' then
    NEW.won_at := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_stamp_won_at on public.leads;
create trigger trg_stamp_won_at
  before insert or update on public.leads
  for each row execute function public.stamp_won_at();

-- ── 2. Estado de "já disparou" ──────────────────────────────────────────────
-- O risco que define este desenho: condição de métrica é CONTÍNUA. "Tem 2
-- negócios ganhos" segue verdadeiro para sempre depois que fica verdadeiro. Um
-- avaliador ingênuo dispararia a cada hora, e uma automação que manda WhatsApp
-- mandaria de hora em hora, para sempre, para um cliente real.
--
-- Cada par (automação, lead) dispara UMA vez. Preferimos errar para menos:
-- deixar de re-disparar é um evento perdido; disparar em loop é o cliente
-- recebendo 24 mensagens por dia.
create table if not exists public.automation_metric_fired (
  automation_id uuid not null references public.automations(id) on delete cascade,
  lead_id       uuid not null references public.leads(id)       on delete cascade,
  fired_at      timestamptz not null default now(),
  primary key (automation_id, lead_id)
);

comment on table public.automation_metric_fired is
  'Marca que um gatilho de metrica ja disparou para um lead. Condicao de metrica e continua: sem isto a automacao repetiria a cada hora.';

-- Controle interno: escrito e lido só pelo avaliador, que é SECURITY DEFINER.
-- RLS ligado SEM nenhuma policy = ninguém alcança via PostgREST, que é o
-- desejado aqui.
alter table public.automation_metric_fired enable row level security;

-- ── 3. Avaliador ────────────────────────────────────────────────────────────
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
  -- Só automações ativas de métrica. Hoje são zero, e o custo precisa ser zero.
  for a in
    select id, company_id, flow->'trigger'->>'triggerId' as gatilho,
           coalesce(flow->'trigger'->'configData', '{}'::jsonb) as cfg
    from public.automations
    where active
      and flow->'trigger'->>'triggerId' in
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
      -- Uma "pessoa" é o núcleo do telefone dentro da empresa, o mesmo
      -- agrupamento que o resto do sistema usa hoje. Quando contact_id estiver
      -- povoado (hoje: 1 de 2502 leads), esta é a consulta que troca de chave.
      with por_pessoa as (
        select
          public.nucleo_telefone(l.whatsapp) as pessoa,
          count(*)    filter (where l.status = 'won')                 as qtd_ganhos,
          sum(coalesce(l.value, 0)) filter (where l.status = 'won')   as valor_ganhos,
          -- coalesce porque os ganhos anteriores a esta migration não têm
          -- won_at: cai no created_at como aproximação declarada.
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
      -- O lead que representa a pessoa: o mais recente dela.
      select distinct on (e.pessoa)
             l.id as lead_id, e.qtd_ganhos, e.valor_ganhos, e.ultimo_ganho
      from elegivel e
      join public.leads l
        on l.company_id = a.company_id
       and public.nucleo_telefone(l.whatsapp) = e.pessoa
      order by e.pessoa, l.created_at desc
    loop
      -- O insert é a própria trava do "uma vez só": se já existe, não dispara.
      -- Sem janela de corrida entre duas execuções do cron.
      begin
        insert into public.automation_metric_fired (automation_id, lead_id)
        values (a.id, alvo.lead_id);
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

comment on function public.processar_gatilhos_de_metrica() is
  'Avalia os gatilhos de metrica do lead e dispara uma vez por (automacao, lead). Chamado de hora em hora pelo cron.';
