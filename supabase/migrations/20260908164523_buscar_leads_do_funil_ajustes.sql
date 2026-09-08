-- Passo intermediário, superado na mesma sessão.
--
-- Esta migração adicionou p_contar, tirou custom_field_values do retorno,
-- fixou o search_path e removeu a permissão de anon. Tudo isso continua
-- valendo, mas a definição da função foi reescrita duas vezes depois daqui,
-- e a versão que vale é a de 20260908201419.
--
-- O arquivo existe para o histórico bater com supabase_migrations.schema_migrations
-- (a versão está registrada lá). Como a função é recriada por completo mais
-- adiante e o índice usa `if not exists`, reconstruir o banco aplicando as
-- migrações em ordem chega ao mesmo estado final sem este corpo.

create index if not exists idx_leads_kanban_recente
  on public.leads (company_id, pipeline_id, column_id, entry_date desc, id);

comment on index public.idx_leads_kanban_recente is
  'Serve a ordem padrao do kanban (entry_date desc). Sem ele a consulta le a coluna inteira e ordena em memoria para devolver a primeira pagina.';
