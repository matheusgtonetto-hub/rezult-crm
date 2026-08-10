-- Tag de ativação passa a ser um campo do agente, escolhido pelo usuário.
--
-- Antes a tag era a string fixa "Agente", única por empresa: ela dizia SE algum
-- agente atende, e QUAL atendia era inferido pela linha de WhatsApp. Com dois
-- agentes sem linha configurada, ou dois na mesma linha, a escolha caía num
-- `unassigned[0]` sobre consulta sem ORDER BY -- arbitrária, podendo trocar de
-- agente entre uma mensagem e outra da mesma conversa.
--
-- A tentativa anterior (migration 20260810000001) derivava a tag do NOME do
-- agente. Funcionava, mas era escolha do sistema: renomear o agente mexia na
-- tag e nos leads, e não dava para reaproveitar uma tag que a empresa já usa
-- (ex.: mandar tudo marcado como "Meta ads" para um agente específico).

alter table public.agents add column if not exists activation_tag text;

-- Uma tag ativa no máximo um agente por empresa. Sem isso a ambiguidade volta,
-- só que agora com o usuário achando que configurou.
create unique index if not exists agents_activation_tag_unica_por_empresa
  on public.agents (company_id, activation_tag)
  where activation_tag is not null;

-- ─── Migração dos agentes existentes ───────────────────────────────────────
-- O agente ATIVO de cada empresa herda "Agente" (é a tag que os leads em uso
-- já carregam, então o comportamento atual não regride). Os demais ficam com a
-- tag específica que o backfill da migration anterior criou.
with ranqueados as (
  select a.id, a.company_id, a.name,
         row_number() over (
           partition by a.company_id
           order by a.active desc, a.created_at asc
         ) as posicao
  from public.agents a
  where coalesce(a.draft, false) = false
)
update public.agents a
   set activation_tag = case when r.posicao = 1 then 'Agente' else 'Agente: ' || r.name end
  from ranqueados r
 where a.id = r.id and a.activation_tag is null;

-- ─── Desfaz a automação da migration anterior ──────────────────────────────
-- A tag agora é escolha do usuário: não deve nascer, ser renomeada nem ser
-- apagada junto com o agente. Apagar seria especialmente ruim, porque a tag
-- pode ser pré-existente da empresa e estar marcando leads sem relação nenhuma
-- com o agente.
drop trigger if exists trg_sync_tag_do_agente on public.agents;
drop trigger if exists trg_remove_tag_do_agente on public.agents;
drop function if exists public.sync_tag_do_agente();
drop function if exists public.remove_tag_do_agente();

-- ensure_agente_tag volta a criar só as três tags padrão da empresa.
create or replace function public.ensure_agente_tag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.tags (owner_id, name, description, color, company_id)
  select c.owner_id, v.nome, v.descricao, v.cor, c.id
  from public.companies c
  cross join (values
    ('Agente',               'Ativa o agente de IA neste negócio. Remover a tag devolve a conversa para atendimento humano.', '#6D28D9'),
    ('SDS: Qualificado',     'Marcada pelo agente quando o lead é considerado um bom encaixe.',                                '#128A68'),
    ('SDS: Não qualificado', 'Marcada pelo agente quando o lead não é um bom encaixe.',                                        '#B91C1C')
  ) as v(nome, descricao, cor)
  where c.id = NEW.company_id
    and not exists (select 1 from public.tags t where t.company_id = c.id and t.name = v.nome);
  return NEW;
end;
$function$;
