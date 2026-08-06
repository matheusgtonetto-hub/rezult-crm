-- Reformulação da aba Perfil (objetivo do agente) e nova aba Ferramentas
-- (quais operações do CRM o agente pode chamar). Substitui o conceito de
-- "type" fixo/único como fonte de comportamento -- type continua existindo
-- só pra roteamento interno (qual edge function atende), mas o que o agente
-- realmente faz agora é definido por objectives + enabled_tools.
alter table agents add column if not exists objectives text[] not null default '{}';
alter table agents add column if not exists enabled_tools text[] not null default '{}';

-- Busca por similaridade na Base de Conhecimento do agente, usada pelo
-- objetivo "Atendimento" (e por qualquer outra ferramenta que precise citar
-- material da empresa). Filtra por agent_id via join com
-- agent_knowledge_documents -- agent_knowledge_chunks não guarda agent_id
-- diretamente.
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
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
