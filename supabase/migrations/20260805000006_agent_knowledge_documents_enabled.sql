-- Aba "Bases de Conhecimento": usuário escolhe quais documentos já
-- importados o agente pode de fato usar (upload continua indexando tudo,
-- mas só os habilitados entram na busca por similaridade).
alter table agent_knowledge_documents add column if not exists enabled boolean not null default true;

create or replace function match_agent_knowledge_chunks(
  query_embedding vector(1536),
  match_agent_id uuid,
  match_count int default 5
)
returns table (id uuid, content text, similarity float)
language sql stable
as $$
  select c.id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from agent_knowledge_chunks c
  join agent_knowledge_documents d on d.id = c.document_id
  where d.agent_id = match_agent_id
    and d.status = 'ready'
    and d.enabled = true
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
