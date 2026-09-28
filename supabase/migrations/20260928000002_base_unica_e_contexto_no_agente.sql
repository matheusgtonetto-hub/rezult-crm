-- Base de Conhecimento passa a ser UMA, da empresa. As perguntas vao para o
-- agente. Decisao do dono em 28/09/2026.
--
-- ═══ O problema ═════════════════════════════════════════════════════════════
--
-- Havia duas "bases" e elas se confundiam:
--
--   company_knowledge_base    8 perguntas, da empresa, inteiras em todo prompt
--   agent_knowledge_documents arquivos, presos a UM agente, buscados por
--                             semelhanca
--
-- Compartilhar material exigia subir o mesmo arquivo de novo. Prova viva nos
-- dados: `politicas.txt` existia DUAS vezes no Consultorio Samantha, uma copia
-- para cada agente.
--
-- E tres das oito perguntas (sobre a empresa, o que vende, objecoes) ja tinham
-- secao equivalente na aba Instrucoes de cada agente. As duas entravam no MESMO
-- prompt de sistema, entao o modelo recebia duas versoes do mesmo fato e vencia
-- a que estivesse mais abaixo no texto -- sem ninguem saber.
--
-- ═══ O desenho novo ═════════════════════════════════════════════════════════
--
--   Base de Conhecimento (empresa)  →  so materiais, subidos uma vez
--   Instrucoes (agente)             →  as perguntas + as regras daquele agente
--   Base de Conhecimento (agente)   →  quais materiais ELE usa
--
-- Por que as perguntas vao para o agente: uma empresa pode ter um agente por
-- produto, e ai "o que vende", "preco" e "objecoes" mudam por agente. "Sobre a
-- empresa" se repete, e o custo disso e duas ou tres frases -- ja era assim na
-- aba Instrucoes de qualquer forma.

-- ── 1. As perguntas, agora no agente ───────────────────────────────────────
alter table public.agents
  add column if not exists contexto_comercial jsonb not null default '{}'::jsonb;

comment on column public.agents.contexto_comercial is
  'As perguntas que vinham de company_knowledge_base, agora por agente: sobre_empresa, publico, oferta, condicoes, objecoes, perguntas_frequentes, links. Sem horario_contato, que duplicava o horario de atendimento da aba Comportamento.';

-- ── 2. "Quando usar", no documento ─────────────────────────────────────────
--
-- Substitui a descricao do agrupamento (agent_knowledge_bases.description), que
-- entrava no prompt como instrucao de quando consultar aquele material. Com uma
-- base so, o agrupamento perde sentido como conceito de usuario, mas a dica
-- era util -- e no documento ela fica na granularidade certa.
alter table public.agent_knowledge_documents
  add column if not exists quando_usar text;

comment on column public.agent_knowledge_documents.quando_usar is
  'Opcional. Entra no prompt junto do trecho recuperado, dizendo ao agente quando aquele material se aplica.';

-- ── 3. Quais documentos cada agente NAO usa ────────────────────────────────
--
-- Guarda a EXCECAO, nao a inclusao, e a escolha e sobre qual falha e pior.
--
-- Guardando inclusoes, um documento novo nao chegaria a agente nenhum ate
-- alguem marcar: a pessoa sobe o arquivo, testa, o agente diz que nao sabe, e
-- nada na tela explica. E o silencio que nao se depura.
--
-- Guardando excecoes, documento novo chega em todos. O erro possivel e visivel
-- -- o agente fala de algo que nao devia -- e a pessoa sabe onde desmarcar.
-- E o caso comum ("todos os agentes usam tudo") passa a exigir zero configuracao.
create table if not exists public.agente_documento_desativado (
  agent_id    uuid not null references public.agents(id) on delete cascade,
  document_id uuid not null references public.agent_knowledge_documents(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (agent_id, document_id)
);

create index if not exists agente_documento_desativado_doc
  on public.agente_documento_desativado (document_id);

alter table public.agente_documento_desativado enable row level security;

create policy agente_documento_desativado_membro on public.agente_documento_desativado
  for all using (public.is_member_of(company_id)) with check (public.is_member_of(company_id));

-- ── 4. Migra os documentos existentes SEM mudar comportamento ──────────────
--
-- Um documento preso ao agente X deve continuar sendo lido so por X. Entao,
-- antes de soltar o `agent_id`, a ligacao vira exclusao para todos os OUTROS
-- agentes da empresa. Sem isto, material de um agente vazaria para os demais
-- na hora em que a migration rodasse.
insert into public.agente_documento_desativado (agent_id, document_id, company_id)
select a.id, d.id, d.company_id
  from public.agent_knowledge_documents d
  join public.agents a
    on a.company_id = d.company_id
   and a.id <> d.agent_id
 where d.agent_id is not null
on conflict do nothing;

update public.agent_knowledge_documents set agent_id = null where agent_id is not null;

-- ── 5. A busca respeita a exclusao e devolve o "quando usar" ───────────────
create or replace function public.match_knowledge_chunks(
  query_embedding vector,
  p_agent_id      uuid,
  p_company_id    uuid,
  match_count     integer default 5
)
returns table (id uuid, content text, similarity double precision, kb_name text, kb_description text)
language sql
stable
as $$
  select c.id,
         c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         -- O nome do ARQUIVO no lugar do nome do agrupamento: com uma base so,
         -- "Base de Conhecimento" repetido em todo trecho nao informa nada, e o
         -- nome do arquivo diz de onde aquilo veio.
         d.file_name,
         -- `quando_usar` do documento, e a descricao do agrupamento como resto
         -- de compatibilidade para o material antigo.
         coalesce(d.quando_usar, kb.description)
    from agent_knowledge_chunks c
    join agent_knowledge_documents d on d.id = c.document_id
    -- LEFT: documento novo nasce sem agrupamento, e um INNER join o descartaria
    -- em silencio -- a Base ficaria muda sem nenhum erro aparecer.
    left join agent_knowledge_bases kb on kb.id = d.knowledge_base_id
   where d.company_id = p_company_id
     and d.status = 'ready'
     and d.enabled = true
     and (kb.id is null or kb.enabled = true)
     and not exists (
       select 1 from agente_documento_desativado x
        where x.agent_id = p_agent_id and x.document_id = d.id
     )
   order by c.embedding <=> query_embedding
   limit match_count;
$$;

comment on function public.match_knowledge_chunks(vector, uuid, uuid, integer) is
  'Trechos da Base de Conhecimento da EMPRESA, menos os documentos que este agente desativou. Ligado por padrao: so a excecao e guardada.';
