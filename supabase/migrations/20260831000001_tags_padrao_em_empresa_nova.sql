-- Tags padrão em toda empresa nova.
--
-- Mesmo raciocínio do funil e das automações padrão: a conta nasce com o
-- vocabulário mínimo para marcar lead, em vez de uma tela de tags vazia onde
-- ninguém sabe o que criar primeiro.
--
-- ── Por que virou gatilho ──
--
-- A "Follow-up" já existia, mas era criada pelo FRONTEND, num `insert` logo
-- depois do cadastro (`CompanyRegisterPage.tsx`). Isso deixava a criação
-- dependente de a tela chegar até aquela linha: um erro de rede no meio do
-- cadastro, ou uma empresa criada por qualquer outro caminho, nascia sem ela.
-- No banco, a tag existe junto com a empresa ou não existe empresa.
--
-- O `insert` do frontend sai no mesmo commit desta migração. Se ele ficasse,
-- toda conta nova nasceria com DUAS "Follow-up": não há restrição de unicidade
-- em (company_id, name), então o banco aceitaria a segunda sem reclamar.
--
-- ── Sobre as descrições ──
--
-- Vazias, como as que foram desenhadas na empresa de origem. O nome da tag é o
-- que aparece no chip do lead; a descrição só é lida na tela de Tags, e inventar
-- texto aqui seria decidir por quem vai usá-las.

create or replace function public.criar_tags_padrao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Sem dono não há a quem atribuir as tags (`tags.owner_id`). Não deveria
  -- acontecer, mas se acontecer é melhor a empresa nascer sem tags do que o
  -- cadastro falhar.
  if new.owner_id is null then
    return new;
  end if;

  insert into public.tags (owner_id, company_id, name, description, color)
  select new.owner_id, new.id, v.nome, '', v.cor
  from (values
    ('Follow-up', '#A32D2D'),
    ('Indicação', '#14B8A6'),
    ('Automação', '#8B5CF6'),
    ('Agente 01', '#D946EF')
  ) as v(nome, cor)
  -- Guarda contra a tag já existir. Hoje é impossível numa empresa recém-criada,
  -- mas mantém o gatilho seguro caso um dia ele passe a rodar em outro momento.
  where not exists (
    select 1 from public.tags t where t.company_id = new.id and t.name = v.nome
  );

  return new;
exception when others then
  -- Falhar aqui NUNCA pode derrubar a criação da empresa: sem as tags a pessoa
  -- cria as suas em dois cliques, sem conta ela não tem produto. Mesmo contrato
  -- do `criar_funil_padrao` e do `criar_automacoes_padrao`.
  raise warning '[criar_tags_padrao] falhou para a empresa %: %', new.id, sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_criar_tags_padrao on public.companies;

-- Gatilho separado dos outros dois, e não uma função só: cada um tem o seu
-- `exception when others`, então um erro nas tags não impede o funil nem as
-- automações de existirem. Juntos, o primeiro a falhar abortaria o resto.
create trigger trg_criar_tags_padrao
after insert on public.companies
for each row execute function public.criar_tags_padrao();
