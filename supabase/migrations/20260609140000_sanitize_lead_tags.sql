-- GARANTIA estrutural contra "tags fantasma" (órfãs) em leads.
--
-- leads.tags é um array de NOMES de tag, desacoplado da tabela `tags`. Vários
-- caminhos escrevem nesse array (motor de automações, webhook por token em
-- api/webhook/[token].ts, integrações, app, API direta). Se qualquer um gravar
-- um nome/UUID que não corresponde a uma tag real da empresa, ele vira um chip
-- cinza impossível de usar. Já corrigimos o motor (escopo por empresa) e as
-- telas, mas para garantir que NUNCA MAIS aconteça — independente da origem —
-- este trigger sanitiza leads.tags a cada escrita, mantendo só os nomes que
-- existem como tag do MESMO dono (owner_id está sempre presente no lead; já o
-- company_id pode vir nulo em alguns caminhos de ingestão).

create or replace function public.sanitize_lead_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.owner_id is not null
     and NEW.tags is not null
     and array_length(NEW.tags, 1) > 0 then
    -- Mantém apenas os nomes que existem como tag do dono, preservando a ordem.
    NEW.tags := coalesce((
      select array_agg(t order by ord)
      from unnest(NEW.tags) with ordinality as u(t, ord)
      where exists (
        select 1 from public.tags tg
        where tg.owner_id = NEW.owner_id and tg.name = u.t
      )
    ), '{}');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sanitize_lead_tags on public.leads;
create trigger trg_sanitize_lead_tags
  before insert or update of tags on public.leads
  for each row execute function public.sanitize_lead_tags();
