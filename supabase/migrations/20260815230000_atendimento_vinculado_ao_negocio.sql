-- O atendimento passa a saber a que NEGÓCIO pertence.
--
-- O plano lista o campo desde a Fase 2 ("número próprio, contato, negócio,
-- canal..."), a coluna existia e ficou em 0 de 220. Sem ela o dashboard não
-- consegue cruzar atendimento com receita, que é metade do valor de medir.
--
-- Resolução em duas tentativas, da mais precisa para a mais ampla:
--   1. person_id do lead == contact_id do atendimento  (167 dos 220)
--   2. núcleo do telefone da conversa                   (184 dos 220)
-- O telefone alcança mais mas tem 3 casos ambíguos, então só entra quando o
-- contato não resolve.
--
-- Entre vários negócios do mesmo contato, escolhe o ABERTO mais recente: é o
-- que o atendente tem em mãos quando conversa. Sem nenhum aberto, o mais
-- recente de todos.
create or replace function public.negocio_do_atendimento(
  p_company_id uuid, p_contact_id uuid, p_conversation_id uuid
) returns uuid
language sql
stable
security definer
set search_path = 'public'
as $$
  select l.id
    from public.leads l
   where l.company_id = p_company_id
     and (
       (p_contact_id is not null and l.person_id = p_contact_id)
       or (p_contact_id is null and exists (
             select 1 from public.whatsapp_conversations w
              where w.id = p_conversation_id
                and nullif(public.nucleo_telefone(w.phone),'') is not null
                and public.nucleo_telefone(l.whatsapp) = public.nucleo_telefone(w.phone)))
     )
   order by (l.status = 'open' and l.pipeline_id is not null) desc, l.created_at desc
   limit 1;
$$;

comment on function public.negocio_do_atendimento(uuid, uuid, uuid) is
  'Negocio que representa o atendimento: o aberto mais recente do contato, ou o mais recente de todos. Casa por person_id e, sem contato, pelo nucleo do telefone.';

create or replace function public.vincula_atendimento_ao_negocio()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if NEW.lead_id is null then
    NEW.lead_id := public.negocio_do_atendimento(NEW.company_id, NEW.contact_id, NEW.conversation_id);
  end if;
  return NEW;
exception when others then
  raise warning 'vincula_atendimento_ao_negocio falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_atendimento_negocio on public.atendimentos;
create trigger trg_atendimento_negocio
  before insert on public.atendimentos
  for each row execute function public.vincula_atendimento_ao_negocio();

update public.atendimentos a
   set lead_id = public.negocio_do_atendimento(a.company_id, a.contact_id, a.conversation_id)
 where a.lead_id is null;
