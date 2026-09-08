-- Versão que vale de buscar_leads_do_funil. Substitui a de 20260908201419.
--
-- ── O que mudou em relação à anterior ──
--
-- Passa a devolver `total_valor` junto com `total_geral`, os dois da COLUNA
-- INTEIRA e não da página. O cabeçalho de cada etapa do kanban mostra a soma
-- dos valores dos negócios; somar só os 50 carregados daria o total da primeira
-- página em vez do total da coluna.
--
-- A soma sai da mesma varredura que já fazia a contagem, então não custa nada a
-- mais. Quando p_contar é false, nenhuma das duas roda.
--
-- O drop explícito é obrigatório: mudar o `returns table` faz o
-- `create or replace` falhar em vez de substituir.
--
-- ── Para que a função serve ──
--
-- O kanban deixa de carregar todos os cards e passa a pedir uma fatia por
-- coluna. Isso obriga o filtro a sair do navegador: não dá para filtrar 635
-- cards se só 50 foram baixados, porque os que casam podem estar nos 585 que
-- ficaram no servidor.
--
-- Dos 22 critérios de LeadFilter, três não se expressam no PostgREST e por isso
-- tudo mora aqui em vez de virar filtros encadeados no cliente:
--
--   lists          vive em list_leads, exige junção
--   closedFrom/To  depende da ÚLTIMA atividade de fechamento do negócio
--   customFields   jsonb com três operadores, sem diferenciar maiúscula
--
-- ── Esta função precisa concordar com leadMatchesFilter() ──
--
-- src/data/disparos.ts continua filtrando em memória nos lugares que ainda não
-- migraram. Enquanto os dois existirem, uma divergência faz o mesmo filtro
-- devolver conjuntos diferentes conforme a tela. Os detalhes copiados de lá,
-- que parecem arbitrários e não são:
--
--   * responsibles cai para responsible quando o array está vazio
--   * created_at e stage_entered_at caem para entry_date quando nulos
--   * a data final do intervalo inclui o dia inteiro (23:59:59)
--   * texto compara sem diferenciar maiúscula
--   * dealStatus nulo conta como 'open'
--
-- ── Segurança ──
--
-- SEM security definer: a RLS de leads precisa continuar valendo linha a linha.
-- Uma função definer aqui viraria um buraco, bastaria passar outro
-- p_company_id para ler a base de outra empresa.
--
-- E o revoke é do PUBLIC, não só do anon: anon é membro de PUBLIC, e revogar
-- só dele não fecha nada. Ver 20260908202925.

drop function if exists public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean);

create function public.buscar_leads_do_funil(
  p_company_id  uuid,
  p_pipeline_id uuid    default null,
  p_column_id   uuid    default null,
  p_filtro      jsonb   default '{}'::jsonb,
  p_busca       text    default null,
  p_ordem       text    default 'recent',
  p_limite      int     default 50,
  p_desloc      int     default 0,
  p_contar      boolean default true
)
returns table (
  id           uuid,
  total_geral  bigint,
  total_valor  numeric,
  dados        jsonb
)
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_cond   text[] := array[]::text[];
  v_onde   text;
  v_ordem  text;
  v_status text[] := null;
  v_total  bigint := null;
  v_valor  numeric := null;
begin
  /*
    WHERE e ORDER BY montados incluindo só o que o filtro realmente traz.
    As quatro decisões deste corpo foram medidas, não escolhidas:

    ── WHERE dinâmico ──
    Com os 22 critérios sempre presentes, cada um como subconsulta jsonb, o
    planejador não prova nada sobre `in (select jsonb_array_elements_text(...))`:
    vira SubPlan com hash e o índice para de ser usado além das igualdades.
      todos sempre presentes  43 ms   ·   só os do filtro  23 ms

    ── `= any($9)` para o status ──
    Reconhecido como igualdade e casa com índice; subconsulta jsonb não casa.

    ── ORDER BY literal ──
    Com CASE no order by, as chaves viram expressões e nenhum índice se aplica.

    ── array_append e não `||` ──
    `text[] || 'literal'` é ambíguo: o Postgres tenta ler a string como literal
    de array e falha com "malformed array literal".

    Sem risco de injeção: nada vindo de fora entra na string. Os fragmentos são
    textos fixos escritos aqui, e todo valor entra por parâmetro.

    Parâmetros: $1 limite $2 desloc $3 empresa $4 pipeline $5 coluna
                $6 filtro $7 busca  $8 total   $9 status   $10 valor
  */

  v_cond := array_append(v_cond, 'l.company_id = $3');
  if p_pipeline_id is not null then v_cond := array_append(v_cond, 'l.pipeline_id = $4'); end if;
  if p_column_id   is not null then v_cond := array_append(v_cond, 'l.column_id = $5');   end if;

  if p_filtro ? 'dealStatus' and jsonb_array_length(p_filtro->'dealStatus') > 0 then
    v_status := array(select jsonb_array_elements_text(p_filtro->'dealStatus'));
    v_cond := array_append(v_cond, 'coalesce(l.status, ''open'') = any($9)');
  end if;

  if coalesce(p_busca, '') <> '' then
    v_cond := array_append(v_cond, $c$(
      l.name ilike '%' || $7 || '%'
      or coalesce(l.company, '') ilike '%' || $7 || '%'
      or coalesce(l.deal_number::text, '') like '%' || $7 || '%'
      or (
        length(regexp_replace($7, '\D', '', 'g')) >= 3
        and regexp_replace(coalesce(l.whatsapp, ''), '\D', '', 'g')
            like '%' || regexp_replace($7, '\D', '', 'g') || '%'
      )
    )$c$);
  end if;

  if p_filtro ? 'ids' and jsonb_array_length(p_filtro->'ids') > 0 then
    v_cond := array_append(v_cond, 'l.id::text in (select jsonb_array_elements_text($6->''ids''))');
  end if;

  if coalesce(p_filtro->>'search', '') <> '' then
    v_cond := array_append(v_cond, $c$concat_ws(' ', l.name, l.email, l.whatsapp, l.company) ilike '%' || ($6->>'search') || '%'$c$);
  end if;

  if p_filtro ? 'tags' and jsonb_array_length(p_filtro->'tags'->'ids') > 0 then
    v_cond := array_append(v_cond, $c$(case $6->'tags'->>'mode'
        when 'all'  then l.tags @> array(select jsonb_array_elements_text($6->'tags'->'ids'))
        when 'none' then not (l.tags && array(select jsonb_array_elements_text($6->'tags'->'ids')))
        else             l.tags && array(select jsonb_array_elements_text($6->'tags'->'ids'))
      end)$c$);
  end if;

  if p_filtro ? 'origins' and jsonb_array_length(p_filtro->'origins') > 0 then
    v_cond := array_append(v_cond, 'l.origin in (select jsonb_array_elements_text($6->''origins''))');
  end if;

  if p_filtro ? 'responsibles' and jsonb_array_length(p_filtro->'responsibles') > 0 then
    v_cond := array_append(v_cond, $c$(case
        when jsonb_typeof(l.responsibles) = 'array' and jsonb_array_length(l.responsibles) > 0
          then array(select jsonb_array_elements_text(l.responsibles))
        when coalesce(l.responsible, '') <> '' then array[l.responsible]
        else array[]::text[]
      end) && array(select jsonb_array_elements_text($6->'responsibles'))$c$);
  end if;

  if p_filtro ? 'pipelines' and jsonb_array_length(p_filtro->'pipelines') > 0 then
    v_cond := array_append(v_cond, 'l.pipeline_id::text in (select jsonb_array_elements_text($6->''pipelines''))');
  end if;

  if p_filtro ? 'stages' and jsonb_array_length(p_filtro->'stages') > 0 then
    v_cond := array_append(v_cond, 'l.column_id::text in (select jsonb_array_elements_text($6->''stages''))');
  end if;

  if p_filtro ? 'valueMin' then v_cond := array_append(v_cond, 'l.value >= ($6->>''valueMin'')::numeric'); end if;
  if p_filtro ? 'valueMax' then v_cond := array_append(v_cond, 'l.value <= ($6->>''valueMax'')::numeric'); end if;

  if p_filtro ? 'products' and jsonb_array_length(p_filtro->'products') > 0 then
    v_cond := array_append(v_cond, 'l.product_id::text in (select jsonb_array_elements_text($6->''products''))');
  end if;

  if p_filtro ? 'lists' and jsonb_array_length(p_filtro->'lists') > 0 then
    v_cond := array_append(v_cond, $c$exists (
      select 1 from public.list_leads ll
      where ll.lead_id = l.id
        and ll.list_id::text in (select jsonb_array_elements_text($6->'lists'))
    )$c$);
  end if;

  if coalesce(p_filtro->>'city', '')    <> '' then v_cond := array_append(v_cond, $c$lower(coalesce(l.city, ''))    = lower($6->>'city')$c$);    end if;
  if coalesce(p_filtro->>'state', '')   <> '' then v_cond := array_append(v_cond, $c$lower(coalesce(l.state, ''))   = lower($6->>'state')$c$);   end if;
  if coalesce(p_filtro->>'country', '') <> '' then v_cond := array_append(v_cond, $c$lower(coalesce(l.country, '')) = lower($6->>'country')$c$); end if;

  if p_filtro ? 'createdFrom' then
    v_cond := array_append(v_cond, $c$coalesce(l.created_at, l.entry_date::timestamptz) >= ($6->>'createdFrom')::timestamptz$c$);
  end if;
  if p_filtro ? 'createdTo' then
    v_cond := array_append(v_cond, $c$coalesce(l.created_at, l.entry_date::timestamptz) <= (($6->>'createdTo') || 'T23:59:59')::timestamptz$c$);
  end if;
  if p_filtro ? 'movedFrom' then
    v_cond := array_append(v_cond, $c$coalesce(l.stage_entered_at, l.entry_date::timestamptz) >= ($6->>'movedFrom')::timestamptz$c$);
  end if;
  if p_filtro ? 'movedTo' then
    v_cond := array_append(v_cond, $c$coalesce(l.stage_entered_at, l.entry_date::timestamptz) <= (($6->>'movedTo') || 'T23:59:59')::timestamptz$c$);
  end if;

  if p_filtro ? 'closedFrom' or p_filtro ? 'closedTo' then
    v_cond := array_append(v_cond, $c$exists (
      select 1 from (
        select a.date from public.activities a
        where a.lead_id = l.id and a.type in ('won', 'lost')
        order by a.date desc limit 1
      ) ultimo
      where ($6->>'closedFrom' is null or ultimo.date >= ($6->>'closedFrom')::date)
        and ($6->>'closedTo'   is null or ultimo.date <= ($6->>'closedTo')::date)
    )$c$);
  end if;

  if p_filtro ? 'lossReasons' and jsonb_array_length(p_filtro->'lossReasons') > 0 then
    v_cond := array_append(v_cond, 'l.loss_reason_id::text in (select jsonb_array_elements_text($6->''lossReasons''))');
  end if;

  if p_filtro ? 'customFields' and jsonb_array_length(p_filtro->'customFields') > 0 then
    v_cond := array_append(v_cond, $c$not exists (
      select 1 from jsonb_array_elements($6->'customFields') cf
      where coalesce(cf->>'value', '') <> ''
        and not (
          case coalesce(cf->>'op', 'contem')
            when 'igual'     then lower(coalesce(l.custom_field_values->>(cf->>'fieldId'), '')) =  lower(cf->>'value')
            when 'diferente' then lower(coalesce(l.custom_field_values->>(cf->>'fieldId'), '')) <> lower(cf->>'value')
            else                  lower(coalesce(l.custom_field_values->>(cf->>'fieldId'), '')) like '%' || lower(cf->>'value') || '%'
          end
        )
    )$c$);
  end if;

  v_onde := array_to_string(v_cond, ' and ');

  v_ordem := case p_ordem
    when 'value'  then 'l.value desc nulls last, l.id asc'
    when 'name'   then 'l.name asc, l.id asc'
    when 'oldest' then 'l.entry_date asc nulls last, l.id asc'
    else               'l.entry_date desc nulls last, l.id asc'
  end;

  if p_contar then
    execute 'select count(*), coalesce(sum(l.value), 0) from public.leads l where ' || v_onde
      into v_total, v_valor
      using p_limite, p_desloc, p_company_id, p_pipeline_id, p_column_id, p_filtro, p_busca, null::bigint, v_status;
  end if;

  return query execute
    'select l.id, $8::bigint, $10::numeric, (to_jsonb(l.*) - ''custom_field_values'')
       from public.leads l
      where ' || v_onde || '
      order by ' || v_ordem || '
      limit greatest($1, 0) offset greatest($2, 0)'
    using p_limite, p_desloc, p_company_id, p_pipeline_id, p_column_id,
          p_filtro, p_busca, v_total, v_status, v_valor;
end;
$fn$;

comment on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) is
  'Busca paginada de negocios com os 22 criterios de LeadFilter aplicados no banco. Precisa concordar com leadMatchesFilter() em src/data/disparos.ts. Devolve total_geral e total_valor da COLUNA INTEIRA (nao da pagina), para o cabecalho nao mostrar a soma dos 50 carregados. WHERE e ORDER BY montados incluindo so o que o filtro traz, senao o planejador nao usa indice. p_contar=false pula contagem e soma. Nao devolve custom_field_values. Sem security definer: a RLS de leads precisa continuar valendo.';

revoke execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) from public;
revoke execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) from anon;
grant  execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) to authenticated;
