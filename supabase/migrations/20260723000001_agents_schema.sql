-- Agentes de IA (SDS e futuros tipos): configuração por empresa, pool de
-- closers para agendamento, e base de conhecimento (RAG) por documento.
-- Segue o mesmo padrão de multi-tenancy já usado no resto do schema:
-- company_id + is_member_of(company_id) via RLS; owner_id é só auditoria
-- (quem criou), nunca controla acesso — ver CLAUDE.md > "Modelo de Acesso (RLS)".

create extension if not exists vector;

-- ─── AGENTS ──────────────────────────────────────────────────────────────
-- Objetivo e metodologia de cada `type` (ex: SDS) são FIXOS no código da
-- edge function, não ficam nesta tabela — só o que é customizável por
-- empresa (tom, contexto) vive aqui, em custom_context.
create table if not exists agents (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  owner_id       uuid not null,                 -- auditoria: quem criou
  type           text not null,                 -- 'SDS' por enquanto
  name           text not null,
  model          text not null default 'claude-opus-4-8',
  active         boolean not null default false,
  custom_context text,                          -- tom/contexto que a empresa escreve
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table agents enable row level security;

create policy "company_select_agents" on agents
  for select using (is_member_of(company_id));
create policy "company_insert_agents" on agents
  for insert with check (is_member_of(company_id));
create policy "company_update_agents" on agents
  for update using (is_member_of(company_id));
create policy "company_delete_agents" on agents
  for delete using (is_member_of(company_id));

-- ─── AGENT_CLOSERS ───────────────────────────────────────────────────────
-- Pool de closers elegíveis a receber reunião agendada por um agente.
-- Many-to-many: um agente pode ter vários closers.
create table if not exists agent_closers (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references agents(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agent_id, user_id)
);

alter table agent_closers enable row level security;

create policy "company_all_agent_closers" on agent_closers
  for all using (is_member_of(company_id))
  with check (is_member_of(company_id));

-- ─── AGENT_KNOWLEDGE_DOCUMENTS ───────────────────────────────────────────
-- Metadado de cada arquivo enviado (PDF/DOCX/TXT) — o conteúdo bruto vive
-- no Supabase Storage; aqui só rastreamos o ciclo de vida do processamento.
create table if not exists agent_knowledge_documents (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references agents(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  owner_id     uuid not null,                    -- auditoria: quem fez upload
  file_name    text not null,
  storage_path text not null,
  status       text not null default 'pending',  -- pending | processing | ready | error
  error_detail text,
  created_at   timestamptz not null default now()
);

alter table agent_knowledge_documents enable row level security;

create policy "company_all_agent_knowledge_documents" on agent_knowledge_documents
  for all using (is_member_of(company_id))
  with check (is_member_of(company_id));

-- ─── AGENT_KNOWLEDGE_CHUNKS ──────────────────────────────────────────────
-- Pedaços de texto + embedding de cada documento, para busca por
-- similaridade (RAG) no momento da qualificação.
create table if not exists agent_knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references agent_knowledge_documents(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade, -- evita join extra na busca vetorial
  content     text not null,
  embedding   vector(1536),                      -- OpenAI text-embedding-3-large — mesma escolha canônica do Mega Brain
  created_at  timestamptz not null default now()
);

alter table agent_knowledge_chunks enable row level security;

create policy "company_all_agent_knowledge_chunks" on agent_knowledge_chunks
  for all using (is_member_of(company_id))
  with check (is_member_of(company_id));

-- Índice para a busca vetorial não escanear a tabela inteira a cada mensagem.
create index if not exists agent_knowledge_chunks_embedding_idx
  on agent_knowledge_chunks using ivfflat (embedding vector_cosine_ops);
