-- Departamento por conversa no Multiatendimento.
-- Usado pelo filtro "Departamentos" e pela ação em massa "Transferir departamento".
alter table public.whatsapp_conversations
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_whatsapp_conversations_department
  on public.whatsapp_conversations(department_id);
