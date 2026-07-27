-- Um contato só pode ter um negócio (pipeline_id preenchido) aberto por vez.
-- A checagem principal já foi adicionada no app (CRMContext.tsx:
-- addLead/transferLead/markLeadOpen) -- este trigger é só o backstop de
-- banco, fecha a corrida entre 2 abas/chamadas concorrentes que o app
-- sozinho não consegue evitar.
--
-- "Mesmo contato" usa os mesmos 3 sinais que o app já usa em
-- resolveLeadForConv/findOpenNegocioConflict, nessa ordem de confiança:
--   1) person_id (esquema novo, só o Multiatendimento popula)
--   2) contact_id (esquema legado auto-referencial: o "Novo negócio" do
--      LeadDrawer/Pipeline seta contact_id = id do lead original)
--   3) telefone normalizado (fallback, cobre os casos sem os dois acima)
--
-- Não é uma unique index direta de propósito: hoje já existem 2 contatos em
-- produção com mais de um negócio aberto simultâneo (dado histórico, de
-- antes dessa regra existir) -- uma index falharia ao aplicar. Isso vira
-- index de verdade numa migration futura, depois de alguém revisar
-- manualmente esses 2 casos.
create or replace function public.check_single_open_negocio()
returns trigger language plpgsql as $$
declare
  conflict_id uuid;
begin
  if NEW.pipeline_id is null or NEW.status is distinct from 'open' then
    return NEW;
  end if;

  select l.id into conflict_id
  from public.leads l
  where l.id <> NEW.id
    and l.company_id = NEW.company_id
    and l.pipeline_id is not null
    and l.status = 'open'
    and (
      (NEW.person_id is not null and l.person_id = NEW.person_id)
      or (NEW.contact_id is not null and (l.id = NEW.contact_id or l.contact_id = NEW.contact_id))
      or (
        length(public.normalize_br_phone(NEW.whatsapp)) >= 10
        and public.normalize_br_phone(l.whatsapp) = public.normalize_br_phone(NEW.whatsapp)
      )
    )
  for update of l
  limit 1;

  if conflict_id is not null then
    raise exception 'Este contato já tem um negócio aberto (id %). Marque como ganho ou perdido antes de abrir outro.', conflict_id
      using errcode = '23505';
  end if;

  return NEW;
end; $$;

drop trigger if exists trg_single_open_negocio on public.leads;
create trigger trg_single_open_negocio
  before insert or update of status, pipeline_id, person_id, contact_id, whatsapp
  on public.leads
  for each row
  execute function public.check_single_open_negocio();
