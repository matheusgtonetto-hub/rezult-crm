-- Generaliza o que a 20260808000001 fez só para "Agente": TODA tag que o
-- próprio agente escreve é de sistema e não pode depender de o usuário
-- tê-la cadastrado em public.tags.
--
-- "SDS: Qualificado" / "SDS: Não qualificado" são gravadas pela tool
-- qualificar_lead e estavam sendo apagadas em silêncio pelo
-- sanitize_lead_tags -- o resultado da qualificação sumia do card e dos
-- filtros do Multiatendimento, sem erro nenhum.
create or replace function public.sanitize_lead_tags()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  tags_sistema text[] := array['Agente', 'SDS: Qualificado', 'SDS: Não qualificado'];
begin
  if NEW.owner_id is not null
     and NEW.tags is not null
     and array_length(NEW.tags, 1) > 0 then
    NEW.tags := coalesce((
      select array_agg(t order by ord)
      from unnest(NEW.tags) with ordinality as u(t, ord)
      where u.t = any(tags_sistema)
         or exists (
        select 1 from public.tags tg
        where tg.owner_id = NEW.owner_id and tg.name = u.t
      )
    ), '{}');
  end if;
  return NEW;
end;
$function$;

-- Cadastra as tags de qualificação junto com a "Agente" quando um agente é
-- criado, pra aparecerem no dropdown do card e nos filtros.
create or replace function public.ensure_agente_tag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.tags (owner_id, name, description, color, company_id)
  select c.owner_id, v.nome, v.descricao, v.cor, c.id
  from public.companies c
  cross join (values
    ('Agente',               'Ativa o agente de IA neste negócio. Remover a tag devolve a conversa para atendimento humano.', '#6D28D9'),
    ('SDS: Qualificado',     'Marcada pelo agente quando o lead é considerado um bom encaixe.',                                '#128A68'),
    ('SDS: Não qualificado', 'Marcada pelo agente quando o lead não é um bom encaixe.',                                        '#B91C1C')
  ) as v(nome, descricao, cor)
  where c.id = NEW.company_id
    and not exists (
      select 1 from public.tags t where t.company_id = c.id and t.name = v.nome
    );
  return NEW;
end;
$function$;

-- Backfill para empresas que já têm agente.
insert into public.tags (owner_id, name, description, color, company_id)
select distinct c.owner_id, v.nome, v.descricao, v.cor, c.id
from public.companies c
cross join (values
  ('Agente',               'Ativa o agente de IA neste negócio. Remover a tag devolve a conversa para atendimento humano.', '#6D28D9'),
  ('SDS: Qualificado',     'Marcada pelo agente quando o lead é considerado um bom encaixe.',                                '#128A68'),
  ('SDS: Não qualificado', 'Marcada pelo agente quando o lead não é um bom encaixe.',                                        '#B91C1C')
) as v(nome, descricao, cor)
where exists (select 1 from public.agents a where a.company_id = c.id)
  and not exists (select 1 from public.tags t where t.company_id = c.id and t.name = v.nome);
