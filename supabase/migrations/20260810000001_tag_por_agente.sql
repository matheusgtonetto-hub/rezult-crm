-- Tag própria por agente, para rotear o lead para UM agente específico.
--
-- Antes só existia a tag "Agente", única por empresa: ela dizia SE algum
-- agente atende, e quem atendia era decidido pela linha de WhatsApp. Com dois
-- agentes na mesma linha, ou sem linha configurada, a escolha vinha de um
-- `unassigned[0]` sobre uma consulta sem ORDER BY -- ou seja, arbitrária e
-- podendo mudar entre uma mensagem e outra da mesma conversa.
--
-- A tag genérica continua valendo (rotear pela linha). A específica ganha
-- precedência quando presente.

-- ─── Criação: junto com as tags padrão, uma tag do próprio agente ──────────
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
    ('Agente',               'Ativa qualquer agente de IA neste negócio (qual deles atende é definido pela linha de WhatsApp). Remover a tag devolve a conversa para atendimento humano.', '#6D28D9'),
    ('SDS: Qualificado',     'Marcada pelo agente quando o lead é considerado um bom encaixe.',                                '#128A68'),
    ('SDS: Não qualificado', 'Marcada pelo agente quando o lead não é um bom encaixe.',                                        '#B91C1C')
  ) as v(nome, descricao, cor)
  where c.id = NEW.company_id
    and not exists (select 1 from public.tags t where t.company_id = c.id and t.name = v.nome);

  -- Tag deste agente. Rascunho não gera tag: o registro é criado antes de o
  -- usuário terminar o wizard e pode ser descartado pela limpeza diária.
  if coalesce(NEW.draft, false) = false then
    insert into public.tags (owner_id, name, description, color, company_id)
    select c.owner_id, 'Agente: ' || NEW.name,
           'Direciona o negócio especificamente para o agente "' || NEW.name || '", independente da linha de WhatsApp.',
           '#6D28D9', c.id
    from public.companies c
    where c.id = NEW.company_id
      and not exists (select 1 from public.tags t where t.company_id = c.id and t.name = 'Agente: ' || NEW.name);
  end if;
  return NEW;
end;
$function$;

-- ─── Renome: a tag acompanha o agente, e os leads que já a usam também ─────
-- Sem isso, renomear o agente deixaria a tag antiga órfã: os leads com ela
-- perderiam o direcionamento e o sanitizador a apagaria na edição seguinte.
create or replace function public.sync_tag_do_agente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.name is distinct from OLD.name and coalesce(NEW.draft, false) = false then
    update public.tags
       set name = 'Agente: ' || NEW.name,
           description = 'Direciona o negócio especificamente para o agente "' || NEW.name || '", independente da linha de WhatsApp.'
     where company_id = NEW.company_id and name = 'Agente: ' || OLD.name;

    update public.leads
       set tags = array_replace(tags, 'Agente: ' || OLD.name, 'Agente: ' || NEW.name)
     where company_id = NEW.company_id and tags @> array['Agente: ' || OLD.name];
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_sync_tag_do_agente on public.agents;
create trigger trg_sync_tag_do_agente
after update on public.agents
for each row execute function public.sync_tag_do_agente();

-- ─── Exclusão: some a tag e sai dos leads ─────────────────────────────────
create or replace function public.remove_tag_do_agente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.leads
     set tags = array_remove(tags, 'Agente: ' || OLD.name)
   where company_id = OLD.company_id and tags @> array['Agente: ' || OLD.name];

  delete from public.tags
   where company_id = OLD.company_id and name = 'Agente: ' || OLD.name;
  return OLD;
end;
$function$;

drop trigger if exists trg_remove_tag_do_agente on public.agents;
create trigger trg_remove_tag_do_agente
after delete on public.agents
for each row execute function public.remove_tag_do_agente();

-- ─── Sanitizador: prefixo "Agente: " é de sistema ─────────────────────────
-- A tag existe em public.tags, então o exists() abaixo já a aprovaria. O
-- prefixo entra como cinto de segurança para a janela entre o agente gravar
-- a tag e a linha existir (ou se alguém apagar a tag à mão).
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
         or u.t like 'Agente: %'
         or exists (
        select 1 from public.tags tg
        where tg.owner_id = NEW.owner_id and tg.name = u.t
      )
    ), '{}');
  end if;
  return NEW;
end;
$function$;

-- ─── Backfill dos agentes que já existem ──────────────────────────────────
insert into public.tags (owner_id, name, description, color, company_id)
select distinct c.owner_id, 'Agente: ' || a.name,
       'Direciona o negócio especificamente para o agente "' || a.name || '", independente da linha de WhatsApp.',
       '#6D28D9', c.id
from public.agents a
join public.companies c on c.id = a.company_id
where coalesce(a.draft, false) = false
  and not exists (select 1 from public.tags t where t.company_id = c.id and t.name = 'Agente: ' || a.name);
