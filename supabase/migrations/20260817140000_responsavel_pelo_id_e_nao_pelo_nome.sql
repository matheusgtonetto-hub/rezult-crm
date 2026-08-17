-- O responsável passa a ser identificado por id, e não pelo nome escrito.
--
-- Bug relatado por usuário: trocar o nome em Meu perfil desliga a pessoa de
-- todos os negócios dela. A causa é o vínculo ser uma string com o nome, então
-- renomear cria um valor que não corresponde a mais ninguém.
--
-- O estrago já estava no banco quando isto foi escrito:
--   "Geomar"            -> 639 negócios, enquanto o usuário virou "Geomar Junior"
--   "Samantha Oliveira" ->  20 negócios, enquanto a usuária virou "Samantha de Oliveira"
--
-- Desenho escolhido: guardar o id AO LADO do nome, em vez de substituir o nome.
--
--   responsible          text  -> continua, é o que a tela exibe e filtra
--   responsible_user_id  uuid  -> novo, é o vínculo de verdade
--
-- Por que não trocar o texto pelo id de uma vez: 163 pontos do frontend usam o
-- nome como chave (cores por membro, avatares, filtros, seletores). Reescrever
-- tudo numa rodada arriscaria a área que o cliente usa o dia inteiro, para
-- resolver um problema que o par (id + nome sincronizado) já resolve.
--
-- Por que não usar o e-mail, que foi a primeira ideia: e-mail também muda. Ele
-- parece estável só porque a tela de perfil não o edita hoje -- o Supabase Auth
-- permite trocar, e nesse dia o bug voltaria idêntico. O id nunca muda.
--
-- O texto livre continua permitido: 341 negócios têm nomes que nunca foram
-- usuários (vieram de importação), e exigir id os deixaria sem responsável.

-- ── 1. As colunas ───────────────────────────────────────────────────────────
-- ON DELETE SET NULL, não CASCADE: se um usuário for removido, o negócio
-- continua existindo e mantém o nome de quem cuidava dele. Apagar o negócio
-- junto seria perder venda por causa de uma saída de time.
alter table public.leads
  add column if not exists responsible_user_id uuid references public.profiles(id) on delete set null;
alter table public.tasks
  add column if not exists responsible_user_id uuid references public.profiles(id) on delete set null;
alter table public.atendimentos
  add column if not exists responsavel_user_id uuid references public.profiles(id) on delete set null;
alter table public.whatsapp_conversations
  add column if not exists assigned_to_user_id uuid references public.profiles(id) on delete set null;

comment on column public.leads.responsible_user_id is
  'Quem e o responsavel. A coluna responsible guarda o NOME para exibicao e e mantida em sincronia por trigger; o vinculo real e este id.';
comment on column public.whatsapp_conversations.assigned_to_user_id is
  'Quem e o atendente. assigned_to guarda o nome para exibicao.';

create index if not exists idx_leads_responsible_user on public.leads(responsible_user_id) where responsible_user_id is not null;
create index if not exists idx_tasks_responsible_user on public.tasks(responsible_user_id) where responsible_user_id is not null;
create index if not exists idx_atendimentos_responsavel_user on public.atendimentos(responsavel_user_id) where responsavel_user_id is not null;
create index if not exists idx_conversas_assigned_user on public.whatsapp_conversations(assigned_to_user_id) where assigned_to_user_id is not null;

-- ── 2. Quem é membro de cada empresa ────────────────────────────────────────
-- Dono e membros convivem em lugares diferentes (companies.owner_id e
-- company_members), exatamente como get_company_members faz. Sem o dono, a
-- Samantha e o Geomar ficariam de fora, que são justamente os casos do bug.
create or replace view public.vw_membros_da_empresa as
  select c.id as company_id, p.id as user_id, p.full_name, p.email
    from public.companies c
    join public.profiles p on p.id = c.owner_id
  union
  select cm.company_id, p.id, p.full_name, p.email
    from public.company_members cm
    join public.profiles p on p.id = cm.user_id;

comment on view public.vw_membros_da_empresa is
  'Dono + membros de cada empresa, a mesma uniao de get_company_members. Usada pelo backfill e pela sincronia de nome do responsavel.';

-- ── 3. Backfill: nome que casa com membro vira id ───────────────────────────
-- Comparação normalizada (sem espaço nas pontas, sem diferenciar maiúscula):
-- há registro gravado como "Beatriz " com espaço no fim, e igualdade exata o
-- deixaria de fora sem motivo.
update public.leads l set responsible_user_id = m.user_id
  from public.vw_membros_da_empresa m
 where m.company_id = l.company_id
   and lower(btrim(m.full_name)) = lower(btrim(l.responsible))
   and l.responsible_user_id is null and coalesce(l.responsible,'') <> '';

update public.tasks t set responsible_user_id = m.user_id
  from public.vw_membros_da_empresa m
 where m.company_id = t.company_id
   and lower(btrim(m.full_name)) = lower(btrim(t.responsible))
   and t.responsible_user_id is null and coalesce(t.responsible,'') <> '';

update public.atendimentos a set responsavel_user_id = m.user_id
  from public.vw_membros_da_empresa m
 where m.company_id = a.company_id
   and lower(btrim(m.full_name)) = lower(btrim(a.responsavel))
   and a.responsavel_user_id is null and coalesce(a.responsavel,'') <> '';

update public.whatsapp_conversations w set assigned_to_user_id = m.user_id
  from public.vw_membros_da_empresa m
 where m.company_id = w.company_id
   and lower(btrim(m.full_name)) = lower(btrim(w.assigned_to))
   and w.assigned_to_user_id is null and coalesce(w.assigned_to,'') <> '';

-- ── 4. Religa quem já tinha perdido o vínculo ───────────────────────────────
-- Só os casos em que a empresa tem UM ÚNICO membro cujo primeiro nome coincide
-- com o nome órfão. Com dois "Ana" na mesma empresa a condição não se cumpre e
-- nada é tocado: é preferível deixar sem responsável a atribuir à pessoa errada.
--
-- Na base de hoje isso alcança "Geomar" -> Geomar Junior (639) e
-- "Samantha Oliveira" -> Samantha de Oliveira (20). Não alcança os 341 nomes
-- importados que nunca foram usuários, e é assim que deve ser: não há a quem
-- religar sem inventar.
with candidato as (
  select l.id as lead_id, m.user_id, m.full_name
    from public.leads l
    join public.vw_membros_da_empresa m on m.company_id = l.company_id
   where l.responsible_user_id is null
     and coalesce(l.responsible,'') <> ''
     -- primeiro nome igual, dos dois lados
     and lower(split_part(btrim(l.responsible), ' ', 1)) = lower(split_part(btrim(m.full_name), ' ', 1))
     -- e um membro só com esse primeiro nome na empresa
     and (select count(*) from public.vw_membros_da_empresa m2
           where m2.company_id = l.company_id
             and lower(split_part(btrim(m2.full_name), ' ', 1)) = lower(split_part(btrim(l.responsible), ' ', 1))) = 1
)
update public.leads l
   set responsible_user_id = c.user_id,
       responsible         = c.full_name,
       responsibles        = to_jsonb(array[c.full_name])
  from candidato c where c.lead_id = l.id;

-- ── 5. Renomear no perfil não desliga mais ninguém ──────────────────────────
-- Trigger no banco, e não no botão Salvar da tela: o nome pode mudar por outros
-- caminhos (SQL de suporte, futura tela de admin, importação) e todos precisam
-- manter a coerência. É o mesmo motivo de o despacho de atendimento viver aqui
-- embaixo e não no TypeScript.
create or replace function public.nome_do_responsavel_acompanha_o_perfil()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if NEW.full_name is not distinct from OLD.full_name or coalesce(NEW.full_name,'') = '' then
    return NEW;
  end if;

  update public.leads
     set responsible  = NEW.full_name,
         -- O array acompanha só na posição do nome antigo. Ele guarda nomes, e
         -- trocar o elemento certo preserva os outros responsáveis da lista.
         --
         -- A comparação é `valor = to_jsonb(OLD.full_name)`, não `valor =
         -- OLD.full_name`: `valor` é jsonb, e comparar com texto faz o Postgres
         -- tentar ler o nome como JSON ("Token ... is invalid"). A primeira
         -- versão desta função tinha esse erro, e como toda ela roda sob
         -- `exception when others`, o efeito era o pior possível: renomear
         -- perfil não propagava nada e não avisava nada.
         responsibles = case
           when responsibles is null then responsibles
           else (select jsonb_agg(case when valor = to_jsonb(OLD.full_name) then to_jsonb(NEW.full_name) else valor end)
                   from jsonb_array_elements(responsibles) as valor)
         end
   where responsible_user_id = NEW.id;

  update public.tasks         set responsible = NEW.full_name where responsible_user_id = NEW.id;
  update public.atendimentos  set responsavel = NEW.full_name where responsavel_user_id = NEW.id;
  update public.whatsapp_conversations set assigned_to = NEW.full_name where assigned_to_user_id = NEW.id;

  return NEW;
exception when others then
  -- Nunca impedir a troca de nome por causa da propagação: o perfil é do
  -- usuário, e falhar aqui deixaria o botão Salvar quebrado sem explicação.
  raise warning 'nome_do_responsavel_acompanha_o_perfil falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_nome_do_responsavel on public.profiles;
create trigger trg_nome_do_responsavel
  after update of full_name on public.profiles
  for each row execute function public.nome_do_responsavel_acompanha_o_perfil();
