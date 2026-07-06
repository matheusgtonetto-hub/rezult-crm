-- Adiciona o tipo de atividade "transfer" (transferência de atendente no Multiatendimento).
-- Fica registrada como evento FIXO no histórico do lead (não editável/excluível, igual a stage_change).

alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type = any (array[
    'created', 'note', 'whatsapp', 'stage_change', 'won', 'lost',
    'meeting', 'call', 'email', 'follow_up', 'task', 'transfer'
  ]));
