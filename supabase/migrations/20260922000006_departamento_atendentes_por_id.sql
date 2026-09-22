-- Quem é de um departamento passa a ser guardado por ID, e não só por nome.
--
-- `departments.attendants` é um array de NOMES. Quem trocasse o nome em Meu
-- Perfil saía do departamento sem nada avisar -- e isso já aconteceu: o
-- departamento "Marketing" aponta para "Geomar", enquanto o membro da empresa
-- hoje se chama "Geomar Junior". O vínculo está quebrado desde a renomeação, em
-- silêncio.
--
-- É o mesmo remédio já aplicado ao responsável da conversa, que grava
-- `assigned_to` (nome, para exibir) junto de `assigned_to_user_id` (o vínculo
-- de verdade). Aqui `attendants` continua existindo pelo mesmo motivo: é o que
-- a tela mostra, e apagá-lo exigiria migrar tudo de uma vez.
alter table public.departments
  add column if not exists attendant_ids uuid[] not null default '{}';

comment on column public.departments.attendant_ids is
  'Quem pertence ao departamento, por id de perfil. É o vínculo que vale; attendants (nomes) é o espelho para exibição e sobrevive a renomeação.';

-- Backfill: casa cada nome com o perfil de um MEMBRO daquela empresa,
-- ignorando caixa e espaços. Nome que não casa fica de fora, e o nome segue
-- gravado em `attendants` -- apagar o que não se conseguiu resolver seria
-- perder a única pista de quem a pessoa quis escolher.
update public.departments d
   set attendant_ids = coalesce((
     select array_agg(distinct p.id)
       from unnest(d.attendants) as nome
       join public.profiles p
         on lower(btrim(p.full_name)) = lower(btrim(nome))
      where p.id in (
        select cm.user_id from public.company_members cm where cm.company_id = d.company_id
        union
        select c.owner_id from public.companies c where c.id = d.company_id
      )
   ), '{}')
 where array_length(d.attendants, 1) > 0;
