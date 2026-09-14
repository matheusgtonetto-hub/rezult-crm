-- Base da empresa: o material que a empresa preenche UMA vez e que todos os
-- agentes que conversam leem.
--
-- Antes, instruções e documentos viviam dentro de cada agente. Com Atendente,
-- SDR e Closer a empresa teria de repetir o mesmo material três vezes, e as
-- cópias divergiriam na primeira edição. As instruções de cada agente continuam
-- existindo, como complemento específico daquele agente.
--
-- Decisões do dono (14/09/2026): entrevista com campos curtos + arquivos
-- opcionais; a base fica no topo de /agentes.
--
-- Peças:
--   1. company_knowledge_base   os campos da entrevista, um registro por empresa
--   2. products.descricao / products.link_venda
--   3. arquivos da empresa: agent_id passa a aceitar nulo nas tabelas de base
--      (nulo = vale para todos os agentes da empresa)
--   4. match_knowledge_chunks   busca nos arquivos do agente E da empresa

-- ─── 1. Campos da entrevista ────────────────────────────────────────────────
create table if not exists public.company_knowledge_base (
  company_id            uuid primary key references public.companies(id) on delete cascade,
  owner_id              uuid not null,
  sobre_empresa         text not null default '',
  publico               text not null default '',
  oferta                text not null default '',
  condicoes             text not null default '',
  objecoes              text not null default '',
  perguntas_frequentes  text not null default '',
  horario_contato       text not null default '',
  links                 text not null default '',
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);

alter table public.company_knowledge_base enable row level security;

-- Mesmo conjunto de políticas das bases de conhecimento dos agentes: membro da
-- empresa lê e edita; empresa em somente leitura por cobrança não altera.
drop policy if exists "company_all_company_knowledge_base" on public.company_knowledge_base;
create policy "company_all_company_knowledge_base" on public.company_knowledge_base
  for all using (public.is_member_of(company_id)) with check (public.is_member_of(company_id));

drop policy if exists "bloqueio_cobranca_insert" on public.company_knowledge_base;
create policy "bloqueio_cobranca_insert" on public.company_knowledge_base
  as restrictive for insert to authenticated
  with check (not public.empresa_bloqueada(company_id));

drop policy if exists "bloqueio_cobranca_update" on public.company_knowledge_base;
create policy "bloqueio_cobranca_update" on public.company_knowledge_base
  as restrictive for update to authenticated
  using (not public.empresa_bloqueada(company_id))
  with check (not public.empresa_bloqueada(company_id));

drop policy if exists "bloqueio_cobranca_delete" on public.company_knowledge_base;
create policy "bloqueio_cobranca_delete" on public.company_knowledge_base
  as restrictive for delete to authenticated
  using (not public.empresa_bloqueada(company_id));

-- ─── 2. Produtos ────────────────────────────────────────────────────────────
-- Descrição: sem ela, o agente só sabia "Consulta avulsa, 250,00".
-- Link de venda: usado pelo Closer para enviar o link cadastrado, nunca um
-- link escrito pelo modelo.
alter table public.products add column if not exists descricao text not null default '';
alter table public.products add column if not exists link_venda text not null default '';

-- ─── 3. Arquivos da empresa ─────────────────────────────────────────────────
-- agent_id nulo = base e documentos da empresa. As telas de cada agente filtram
-- por agent_id, então esses arquivos não aparecem misturados lá.
alter table public.agent_knowledge_bases alter column agent_id drop not null;
alter table public.agent_knowledge_documents alter column agent_id drop not null;

-- ─── 4. Busca ───────────────────────────────────────────────────────────────
-- Mesma busca de match_agent_knowledge_chunks, somando os arquivos da empresa.
-- A antiga continua existindo para quem ainda a chama.
create or replace function public.match_knowledge_chunks(
  query_embedding vector,
  p_agent_id uuid,
  p_company_id uuid,
  match_count integer default 5
)
returns table(id uuid, content text, similarity double precision, kb_name text, kb_description text)
language sql
stable
as $function$
  select c.id, c.content, 1 - (c.embedding <=> query_embedding) as similarity, kb.name, kb.description
    from agent_knowledge_chunks c
    join agent_knowledge_documents d on d.id = c.document_id
    join agent_knowledge_bases kb on kb.id = d.knowledge_base_id
   where d.company_id = p_company_id
     and (d.agent_id = p_agent_id or d.agent_id is null)
     and d.status = 'ready'
     and d.enabled = true
     and kb.enabled = true
   order by c.embedding <=> query_embedding
   limit match_count;
$function$;
