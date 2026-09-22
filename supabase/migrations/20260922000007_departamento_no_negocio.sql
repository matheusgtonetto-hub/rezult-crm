-- O negócio passa a carregar o departamento (dono, 22/09/2026).
--
-- O responsável já morava aqui (`responsible`/`responsibles`) e a conversa só
-- espelhava. Faltava o par dele: sem departamento no negócio, transferir a
-- conversa de time deixava o negócio para trás, e a pergunta "de quem é este
-- negócio" tinha resposta na tela de atendimento e nenhuma no funil.
alter table public.leads
  add column if not exists department_id uuid references public.departments(id) on delete set null;

comment on column public.leads.department_id is
  'Departamento dono do negócio. Anda junto com o da conversa: transferir no Multiatendimento move os dois.';

create index if not exists leads_department_id_idx on public.leads(department_id);

-- Os negócios que já existem herdam o departamento da conversa vinculada.
-- Onde não há conversa, fica nulo: inventar um departamento para um negócio
-- criado à mão no funil seria dizer algo que ninguém disse.
update public.leads l
   set department_id = c.department_id
  from public.whatsapp_conversations c
 where l.department_id is null
   and c.department_id is not null
   and c.company_id = l.company_id
   and (
     c.contact_id = l.contact_id
     or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(l.whatsapp, ''), '\D', '', 'g')
   )
   and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') <> '';
