-- Substitui a de 20260908205945. Duas mudanças, as duas sobre ORDENAÇÃO.
--
-- ── 1. `position` vira desempate ──
--
-- O board não ordenava só pelo critério escolhido na barra. Ordenava por ele e,
-- nos empates, pela ordem em que os ids chegavam:
--
--   CRMContext.tsx:714   leadIds ordenado por position
--   PipelinePage.tsx:476 ids.sort(...) só compara o sortKey
--
-- `Array.prototype.sort` é estável, então o segundo preserva o primeiro: a ordem
-- efetiva na tela sempre foi `<sortKey>, position, id`.
--
-- O que `position` guarda é a ordem de CRIAÇÃO dentro da coluna: sai de
-- `col.leadIds.length` no insert (CRMContext.tsx:1062) e nunca mais é gravado --
-- `moveLead` grava só `column_id` e `stage_entered_at`. Ou seja, arrastar um card
-- para outra posição dentro da mesma coluna já não sobrevive a um F5 hoje, e
-- continua não sobrevivendo. Isso não é o que esta mudança resolve.
--
-- O que ela resolve é a ordem ficar a MESMA de antes. `entry_date` tem precisão
-- de dia, então todos os negócios criados no mesmo dia empatam -- o caso comum de
-- quem cadastra vários numa tarde. Sem `position`, esses empates passariam a ser
-- desfeitos pelo id, e a coluna apareceria embaralhada em relação ao que a mesma
-- pessoa via ontem, sem nada ter mudado nos dados.
--
-- ── 2. `nulls last` sai ──
--
-- As quatro colunas de ordenação (entry_date, position, value, name) são NOT NULL.
-- O `nulls last` não mudava resultado nenhum e só divergia da forma do índice.
--
-- ── Os índices acompanham ──
--
-- Os dois índices "recente" terminavam em (entry_date desc, id). Com `position`
-- no meio da ordenação eles deixariam de entregar a ordem pronta, e a consulta
-- passaria a ler a coluna inteira e ordenar em memória -- exatamente o que o
-- LIMIT existe para evitar. `create index if not exists` NÃO reconstrói um índice
-- cuja definição mudou, por isso o drop explícito.
--
-- Confirmado depois de aplicar, na coluna de 121 cards:
--   Index Scan using idx_leads_kanban_recente ... rows=50
--   sem nó de Sort, 5 buffers, 2,6 ms
--
-- O resto do corpo é idêntico ao de 20260908205945.

drop index if exists public.idx_leads_kanban_recente;
drop index if exists public.idx_leads_kanban_status_recente;

create index idx_leads_kanban_recente
  on public.leads (company_id, pipeline_id, column_id, entry_date desc, "position", id);

create index idx_leads_kanban_status_recente
  on public.leads (company_id, pipeline_id, column_id, (coalesce(status, 'open')), entry_date desc, "position", id);

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

  -- Os responsáveis do negócio, com o mesmo fallback de leadMatchesFilter():
  -- o array `responsibles` manda, e `responsible` só entra quando ele está
  -- vazio. O sentinela '__no_responsible__' casa com o negócio que não tem
  -- nenhum -- ver o cabeçalho deste arquivo.
  -- O `case` aparece duas vezes de propósito. Dar nome a ele com um CTE ou um
  -- lateral vira subconsulta escalar por linha, e foi exatamente isso que as
  -- medições anteriores mostraram derrubar o índice. Repetido, continua sendo
  -- uma expressão só.
  if p_filtro ? 'responsibles' and jsonb_array_length(p_filtro->'responsibles') > 0 then
    v_cond := array_append(v_cond, $c$(
      (case
        when jsonb_typeof(l.responsibles) = 'array' and jsonb_array_length(l.responsibles) > 0
          then array(select jsonb_array_elements_text(l.responsibles))
        when coalesce(l.responsible, '') <> '' then array[l.responsible]
        else array[]::text[]
      end) && array(select jsonb_array_elements_text($6->'responsibles'))
      or (
        $6->'responsibles' @> '["__no_responsible__"]'::jsonb
        and cardinality(case
          when jsonb_typeof(l.responsibles) = 'array' and jsonb_array_length(l.responsibles) > 0
            then array(select jsonb_array_elements_text(l.responsibles))
          when coalesce(l.responsible, '') <> '' then array[l.responsible]
          else array[]::text[]
        end) = 0
      )
    )$c$);
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

  -- `position` entra como desempate em todas as ordens, e `nulls last` sai.
  -- Ver o cabeçalho deste arquivo para o porquê dos dois.
  v_ordem := case p_ordem
    when 'value'  then 'l.value desc, l."position" asc, l.id asc'
    when 'name'   then 'l.name asc, l."position" asc, l.id asc'
    when 'oldest' then 'l.entry_date asc, l."position" asc, l.id asc'
    else               'l.entry_date desc, l."position" asc, l.id asc'
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
  'Busca paginada de negocios com os 22 criterios de LeadFilter aplicados no banco. Precisa concordar com leadMatchesFilter() em src/data/disparos.ts. Em responsibles aceita o sentinela __no_responsible__, que casa com negocio sem responsavel (recorte de permissao do kanban). Devolve total_geral e total_valor da COLUNA INTEIRA (nao da pagina), para o cabecalho nao mostrar a soma dos 50 carregados. WHERE e ORDER BY montados incluindo so o que o filtro traz, senao o planejador nao usa indice. p_contar=false pula contagem e soma. Nao devolve custom_field_values. Sem security definer: a RLS de leads precisa continuar valendo.';

revoke execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) from public;
revoke execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) from anon;
grant  execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) to authenticated;
