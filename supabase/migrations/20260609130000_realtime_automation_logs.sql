-- Publica automation_logs no Realtime para que o editor de automações atualize
-- os logs/contadores de cada bloco ao vivo, a cada execução — sem precisar
-- reabrir a automação. As políticas RLS de SELECT (dono + membro) já filtram
-- quais linhas cada usuário recebe.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'automation_logs'
  ) then
    alter publication supabase_realtime add table public.automation_logs;
  end if;
end $$;
