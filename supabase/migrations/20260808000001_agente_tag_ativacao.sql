-- A ativação do agente por negócio depende da tag "Agente" em leads.tags
-- (ver hasAgentTag em supabase/functions/agent-sds-qualify/index.ts). Só que
-- o trigger sanitize_lead_tags APAGA silenciosamente qualquer tag que não
-- esteja cadastrada em public.tags para o dono do lead -- e nada no produto
-- jamais cadastrava a tag "Agente". Resultado: era impossível ativar o
-- agente em qualquer negócio, de qualquer empresa; a tag era descartada sem
-- nenhum erro, tanto pelo dropdown do card quanto por automação.
--
-- Correção em duas camadas, porque uma só não basta:
--   1. O sanitizador passa a tratar "Agente" como tag de SISTEMA e nunca a
--      remove. Sem isso, apagar a tag do cadastro voltaria a quebrar o
--      agente silenciosamente.
--   2. A tag passa a ser criada de fato no cadastro da empresa, senão ela
--      não aparece no dropdown do card do Pipeline e o usuário não tem como
--      aplicá-la manualmente.

-- ─── Camada 1: "Agente" é tag de sistema, imune ao sanitizador ──────────────
create or replace function public.sanitize_lead_tags()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.owner_id is not null
     and NEW.tags is not null
     and array_length(NEW.tags, 1) > 0 then
    -- Mantém apenas os nomes que existem como tag do dono, preservando a ordem.
    -- "Agente" é exceção: é tag de sistema (liga/desliga o agente de IA no
    -- negócio), então sobrevive mesmo que não esteja no cadastro de tags.
    NEW.tags := coalesce((
      select array_agg(t order by ord)
      from unnest(NEW.tags) with ordinality as u(t, ord)
      where u.t = 'Agente'
         or exists (
        select 1 from public.tags tg
        where tg.owner_id = NEW.owner_id and tg.name = u.t
      )
    ), '{}');
  end if;
  return NEW;
end;
$function$;

-- ─── Camada 2: garantir a tag no cadastro ──────────────────────────────────
-- Roxo #6D28D9 = mesma cor que o Multiatendimento já usa no filtro "Agente"
-- (ver MultiatendimentoPage.tsx), pra ficar visualmente consistente.
create or replace function public.ensure_agente_tag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.tags (owner_id, name, description, color, company_id)
  select c.owner_id,
         'Agente',
         'Ativa o agente de IA neste negócio. Remover a tag devolve a conversa para atendimento humano.',
         '#6D28D9',
         c.id
  from public.companies c
  where c.id = NEW.company_id
    and not exists (
      select 1 from public.tags t
      where t.company_id = c.id and t.name = 'Agente'
    );
  return NEW;
end;
$function$;

drop trigger if exists trg_ensure_agente_tag on public.agents;
create trigger trg_ensure_agente_tag
  after insert on public.agents
  for each row execute function public.ensure_agente_tag();

-- Backfill: empresas que já têm agente criado antes desta migration.
insert into public.tags (owner_id, name, description, color, company_id)
select distinct c.owner_id,
       'Agente',
       'Ativa o agente de IA neste negócio. Remover a tag devolve a conversa para atendimento humano.',
       '#6D28D9',
       c.id
from public.companies c
where exists (select 1 from public.agents a where a.company_id = c.id)
  and not exists (select 1 from public.tags t where t.company_id = c.id and t.name = 'Agente');
