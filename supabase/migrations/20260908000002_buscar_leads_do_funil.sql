-- Busca paginada de negócios do funil, com os filtros aplicados no banco.
--
-- O kanban vai deixar de carregar todos os cards e passar a pedir uma fatia por
-- coluna. Isso obriga o filtro a sair do navegador: não dá para filtrar 657
-- cards se só 50 foram baixados, porque os que casam podem estar nos 607 que
-- ficaram no servidor.
--
-- ── Por que uma função, e não filtros encadeados no PostgREST ──
--
-- Dos 22 critérios de `LeadFilter`, três não se expressam no PostgREST:
--
--   lists          vive em `list_leads`, exige junção
--   closedFrom/To  depende da ÚLTIMA atividade de fechamento do negócio
--   customFields   jsonb com três operadores, sem diferenciar maiúscula
--
-- Encadear 19 filtros no cliente e resolver 3 de outro jeito espalharia a
-- regra em dois lugares, que é como as duas versões passam a discordar. Aqui a
-- regra inteira mora num arquivo só.
--
-- ── Esta função precisa concordar com leadMatchesFilter() ──
--
-- `src/data/disparos.ts` continua filtrando em memória nos lugares que ainda
-- não migraram. Enquanto os dois existirem, uma divergência faz o mesmo filtro
-- devolver conjuntos diferentes conforme a tela. Os detalhes copiados de lá,
-- que parecem arbitrários e não são:
--
--   * `responsibles` cai para `responsible` quando o array está vazio
--   * `created_at` cai para `entry_date` quando é nulo
--   * `stage_entered_at` cai para `entry_date` quando é nulo
--   * a data final do intervalo inclui o dia inteiro (23:59:59)
--   * texto compara sem diferenciar maiúscula
--   * `dealStatus` nulo conta como 'open'
--
-- ── Segurança ──
--
-- SEM `security definer`. A função roda com o papel de quem chamou, então a RLS
-- de `leads` continua valendo linha a linha. Uma função definer aqui viraria um
-- buraco: bastaria passar outro `p_company_id` para ler a base de outra empresa.

create or replace function public.buscar_leads_do_funil(
  p_company_id  uuid,
  p_pipeline_id uuid    default null,
  p_column_id   uuid    default null,
  p_filtro      jsonb   default '{}'::jsonb,
  p_busca       text    default null,
  p_ordem       text    default 'recent',
  p_limite      int     default 50,
  p_desloc      int     default 0
)
returns table (
  id           uuid,
  total_geral  bigint,
  dados        jsonb
)
language sql
stable
as $$
  with base as (
    select l.*
    from public.leads l
    where l.company_id = p_company_id
      and (p_pipeline_id is null or l.pipeline_id = p_pipeline_id)
      and (p_column_id   is null or l.column_id   = p_column_id)

      -- ids: seleção explícita, a mais restritiva
      and (
        p_filtro->'ids' is null
        or jsonb_array_length(p_filtro->'ids') = 0
        or l.id::text in (select jsonb_array_elements_text(p_filtro->'ids'))
      )

      -- busca livre da barra do kanban: nome, empresa, número do negócio e
      -- telefone. O telefone só entra com 3+ dígitos, igual ao JS, senão
      -- qualquer letra digitada casaria com meio mundo.
      and (
        p_busca is null or p_busca = ''
        or l.name    ilike '%' || p_busca || '%'
        or coalesce(l.company, '') ilike '%' || p_busca || '%'
        or coalesce(l.deal_number::text, '') like '%' || p_busca || '%'
        or (
          length(regexp_replace(p_busca, '\D', '', 'g')) >= 3
          and regexp_replace(coalesce(l.whatsapp, ''), '\D', '', 'g')
              like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
        )
      )

      -- busca do filtro avançado: campos diferentes da busca da barra
      and (
        p_filtro->>'search' is null or p_filtro->>'search' = ''
        or concat_ws(' ', l.name, l.email, l.whatsapp, l.company)
           ilike '%' || (p_filtro->>'search') || '%'
      )

      -- tags: os três modos do filtro
      and (
        p_filtro->'tags' is null
        or jsonb_array_length(p_filtro->'tags'->'ids') = 0
        or (
          case p_filtro->'tags'->>'mode'
            when 'all'  then l.tags @> array(select jsonb_array_elements_text(p_filtro->'tags'->'ids'))
            when 'none' then not (l.tags && array(select jsonb_array_elements_text(p_filtro->'tags'->'ids')))
            else             l.tags && array(select jsonb_array_elements_text(p_filtro->'tags'->'ids'))
          end
        )
      )

      and (p_filtro->'origins' is null or jsonb_array_length(p_filtro->'origins') = 0
           or l.origin in (select jsonb_array_elements_text(p_filtro->'origins')))

      -- responsáveis: o array novo, caindo para a coluna antiga quando vazio.
      -- `responsibles` é jsonb, não text[] (só `tags` é array de verdade nesta
      -- tabela), então precisa ser convertido antes de cruzar com o filtro.
      and (
        p_filtro->'responsibles' is null or jsonb_array_length(p_filtro->'responsibles') = 0
        or (
          case
            when jsonb_typeof(l.responsibles) = 'array' and jsonb_array_length(l.responsibles) > 0
              then array(select jsonb_array_elements_text(l.responsibles))
            when coalesce(l.responsible, '') <> ''
              then array[l.responsible]
            else array[]::text[]
          end
        ) && array(select jsonb_array_elements_text(p_filtro->'responsibles'))
      )

      and (p_filtro->'pipelines' is null or jsonb_array_length(p_filtro->'pipelines') = 0
           or l.pipeline_id::text in (select jsonb_array_elements_text(p_filtro->'pipelines')))

      and (p_filtro->'stages' is null or jsonb_array_length(p_filtro->'stages') = 0
           or l.column_id::text in (select jsonb_array_elements_text(p_filtro->'stages')))

      -- status nulo conta como 'open', igual ao JS
      and (p_filtro->'dealStatus' is null or jsonb_array_length(p_filtro->'dealStatus') = 0
           or coalesce(l.status, 'open') in (select jsonb_array_elements_text(p_filtro->'dealStatus')))

      and (p_filtro->>'valueMin' is null or l.value >= (p_filtro->>'valueMin')::numeric)
      and (p_filtro->>'valueMax' is null or l.value <= (p_filtro->>'valueMax')::numeric)

      and (p_filtro->'products' is null or jsonb_array_length(p_filtro->'products') = 0
           or l.product_id::text in (select jsonb_array_elements_text(p_filtro->'products')))

      -- listas: a junção que o PostgREST não faz
      and (
        p_filtro->'lists' is null or jsonb_array_length(p_filtro->'lists') = 0
        or exists (
          select 1 from public.list_leads ll
          where ll.lead_id = l.id
            and ll.list_id::text in (select jsonb_array_elements_text(p_filtro->'lists'))
        )
      )

      and (p_filtro->>'city'    is null or lower(coalesce(l.city, ''))    = lower(p_filtro->>'city'))
      and (p_filtro->>'state'   is null or lower(coalesce(l.state, ''))   = lower(p_filtro->>'state'))
      and (p_filtro->>'country' is null or lower(coalesce(l.country, '')) = lower(p_filtro->>'country'))

      -- criação: created_at caindo para entry_date, e o "até" pega o dia todo
      and (p_filtro->>'createdFrom' is null
           or coalesce(l.created_at, l.entry_date::timestamptz) >= (p_filtro->>'createdFrom')::timestamptz)
      and (p_filtro->>'createdTo' is null
           or coalesce(l.created_at, l.entry_date::timestamptz) <= ((p_filtro->>'createdTo') || 'T23:59:59')::timestamptz)

      -- movimentação: stage_entered_at caindo para entry_date
      and (p_filtro->>'movedFrom' is null
           or coalesce(l.stage_entered_at, l.entry_date::timestamptz) >= (p_filtro->>'movedFrom')::timestamptz)
      and (p_filtro->>'movedTo' is null
           or coalesce(l.stage_entered_at, l.entry_date::timestamptz) <= ((p_filtro->>'movedTo') || 'T23:59:59')::timestamptz)

      -- fechamento: a ÚLTIMA atividade de ganho ou perda, não a primeira. Um
      -- negócio reaberto e fechado de novo tem duas, e vale a que descreve
      -- a situação de hoje. Sem nenhuma, o negócio não passa no critério.
      and (
        (p_filtro->>'closedFrom' is null and p_filtro->>'closedTo' is null)
        or exists (
          select 1 from (
            select a.date
            from public.activities a
            where a.lead_id = l.id and a.type in ('won', 'lost')
            order by a.date desc
            limit 1
          ) ultimo
          where (p_filtro->>'closedFrom' is null or ultimo.date >= (p_filtro->>'closedFrom')::timestamptz)
            and (p_filtro->>'closedTo'   is null or ultimo.date <= ((p_filtro->>'closedTo') || 'T23:59:59')::timestamptz)
        )
      )

      and (p_filtro->'lossReasons' is null or jsonb_array_length(p_filtro->'lossReasons') = 0
           or l.loss_reason_id::text in (select jsonb_array_elements_text(p_filtro->'lossReasons')))

      -- campos personalizados: cada critério com seu operador, sem diferenciar
      -- maiúscula. Critério de valor vazio é ignorado, igual ao JS.
      and (
        p_filtro->'customFields' is null
        or not exists (
          select 1
          from jsonb_array_elements(p_filtro->'customFields') cf
          where coalesce(cf->>'value', '') <> ''
            and not (
              case coalesce(cf->>'op', 'contem')
                when 'igual'     then lower(coalesce(l.custom_field_values->>(cf->>'fieldId'), '')) =  lower(cf->>'value')
                when 'diferente' then lower(coalesce(l.custom_field_values->>(cf->>'fieldId'), '')) <> lower(cf->>'value')
                else                  lower(coalesce(l.custom_field_values->>(cf->>'fieldId'), '')) like '%' || lower(cf->>'value') || '%'
              end
            )
        )
      )
  ),
  -- O total é contado ANTES da fatia: o cabeçalho da coluna precisa dizer 657,
  -- não 50. Contar depois do limit devolveria o tamanho da página.
  contado as (select count(*) as n from base)
  select
    b.id,
    (select n from contado) as total_geral,
    to_jsonb(b.*) as dados
  from base b
  order by
    -- O id é o desempate em todas as ordens. `position` tem pouquíssimos
    -- valores distintos, e sem ordenação total a página 2 repete ou pula
    -- registros que a página 1 já trouxe.
    case when p_ordem = 'value'  then b.value end desc nulls last,
    case when p_ordem = 'name'   then b.name  end asc  nulls last,
    case when p_ordem = 'oldest' then b.entry_date end asc  nulls last,
    case when p_ordem = 'recent' then b.entry_date end desc nulls last,
    b.position asc,
    b.id asc
  limit greatest(p_limite, 0)
  offset greatest(p_desloc, 0);
$$;

comment on function public.buscar_leads_do_funil is
  'Busca paginada de negocios com os 22 criterios de LeadFilter aplicados no banco. Precisa concordar com leadMatchesFilter() em src/data/disparos.ts enquanto as duas existirem. Sem security definer de proposito: a RLS de leads precisa continuar valendo.';
