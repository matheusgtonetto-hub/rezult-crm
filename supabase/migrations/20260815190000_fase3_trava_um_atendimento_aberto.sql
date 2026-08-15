-- Fase 3, parte 1: a trava de "um atendimento aberto por contato e canal".
--
-- O plano marca risco ALTO aqui: dapi, zapi, cloud-api, meta e o
-- automation-runner criam conversa em paralelo, e duas mensagens chegando junto
-- abririam dois atendimentos para o mesmo contato. A proteção tem que estar no
-- BANCO, não no cuidado do código.

-- ── Colisão histórica ───────────────────────────────────────────────────────
-- Um contato (mesmo telefone, mesma empresa) tinha 3 atendimentos abertos, um
-- por instance_id. Não eram três linhas diferentes: era a MESMA linha
-- reconectada, e cada reconexão gera um instance_id novo, criando conversa nova.
-- Mantém o mais recente aberto e encerra os anteriores. Nada se perde: as
-- conversas e as mensagens continuam intactas, muda só o estado do episódio.
with abertos as (
  select id,
         row_number() over (partition by company_id, contact_id, canal
                            order by aberto_em desc, id desc) as rn
  from public.atendimentos
  where status <> 'finalizado' and contact_id is not null
)
update public.atendimentos a
   set status = 'finalizado'
  from abertos k
 where k.id = a.id and k.rn > 1;

-- ── A trava ─────────────────────────────────────────────────────────────────
-- Índice FUNCIONAL sobre coalesce(contact_id, conversation_id), e não sobre
-- contact_id direto.
--
-- Motivo: 46 dos 207 atendimentos abertos não têm contact_id, e o Postgres
-- trata NULL como distinto em índice único. Um índice só em contact_id nasceria
-- com buraco de 22% -- protegeria justamente quem já tem contato resolvido e
-- deixaria solto quem ainda não tem, que é o caso mais propenso a duplicar.
create unique index if not exists uq_atendimento_aberto_por_contato
  on public.atendimentos (company_id, coalesce(contact_id, conversation_id), canal)
  where status <> 'finalizado';
