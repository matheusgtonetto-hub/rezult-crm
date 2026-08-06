-- Reformulação da aba "Base de Conhecimento": documentos deixam de pendurar
-- direto no agente e passam a viver dentro de uma "Base de Conhecimento"
-- nomeada (nome + descrição, a descrição funciona como instrução pra IA
-- saber quando usar aquele material). Um agente pode ter várias KBs.
create table if not exists agent_knowledge_bases (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references agents(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  owner_id    uuid not null,
  name        text not null,
  description text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table agent_knowledge_bases enable row level security;
create policy "company_all_agent_knowledge_bases" on agent_knowledge_bases
  for all using (is_member_of(company_id)) with check (is_member_of(company_id));

create or replace function agent_knowledge_bases_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_agent_knowledge_bases_touch on agent_knowledge_bases;
create trigger trg_agent_knowledge_bases_touch before update on agent_knowledge_bases
  for each row execute function agent_knowledge_bases_touch_updated_at();

alter table agent_knowledge_documents add column if not exists knowledge_base_id uuid references agent_knowledge_bases(id) on delete cascade;

-- Backfill: documentos já existentes (upload antes dessa mudança) ganham uma
-- KB "Base de Conhecimento" default por agente, pra não ficarem órfãos.
insert into agent_knowledge_bases (agent_id, company_id, owner_id, name)
select distinct agent_id, company_id, owner_id, 'Base de Conhecimento'
from agent_knowledge_documents
where knowledge_base_id is null;

update agent_knowledge_documents d
set knowledge_base_id = kb.id
from agent_knowledge_bases kb
where d.knowledge_base_id is null
  and kb.agent_id = d.agent_id
  and kb.name = 'Base de Conhecimento';

-- Busca por similaridade agora respeita habilitado tanto no documento quanto
-- na KB inteira, e devolve nome/descrição da KB pra virar contexto no prompt.
-- Assinatura de retorno mudou (colunas novas) -- precisa dropar antes de
-- recriar, "create or replace" não deixa trocar o shape das colunas OUT.
drop function if exists match_agent_knowledge_chunks(vector, uuid, integer);

create function match_agent_knowledge_chunks(
  query_embedding vector(1536),
  match_agent_id uuid,
  match_count int default 5
)
returns table (id uuid, content text, similarity float, kb_name text, kb_description text)
language sql stable
as $$
  select c.id, c.content, 1 - (c.embedding <=> query_embedding) as similarity, kb.name, kb.description
  from agent_knowledge_chunks c
  join agent_knowledge_documents d on d.id = c.document_id
  join agent_knowledge_bases kb on kb.id = d.knowledge_base_id
  where d.agent_id = match_agent_id
    and d.status = 'ready'
    and d.enabled = true
    and kb.enabled = true
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
