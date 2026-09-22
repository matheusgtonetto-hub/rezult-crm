-- A conversa que entra já nasce num departamento.
--
-- Mora no BANCO, e não nas Edge Functions, porque conversa é criada por seis
-- caminhos diferentes: zapi-webhook, dapi-webhook, cloud-api-webhook,
-- automation-runner, agent-sds-qualify e a própria tela. Seis cópias da mesma
-- cascata divergem na primeira correção, e cinco delas exigiriam deploy para
-- mudar uma regra de negócio.
create or replace function public.rotear_departamento_da_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept uuid;
begin
  -- Quem já veio com departamento escolhido manda: a tela e as automações
  -- podem criar a conversa já no lugar certo.
  if new.department_id is not null then
    return new;
  end if;

  -- 1. O departamento do NÚMERO que recebeu a mensagem.
  select w.department_id into v_dept
    from public.whatsapp_connections w
   where w.instance_id = new.instance_id
     and w.company_id = new.company_id
     and w.department_id is not null
   limit 1;

  -- 2. O padrão que a empresa escolheu em Configurações. A conferência de
  --    company_id não é zelo excessivo: multiatendimento_settings é por
  --    owner_id, e um dono com duas empresas apontaria o padrão de uma para o
  --    departamento da outra.
  if v_dept is null then
    select s.default_department_id into v_dept
      from public.multiatendimento_settings s
      join public.departments d on d.id = s.default_department_id
     where s.owner_id = new.owner_id
       and d.company_id = new.company_id
     limit 1;
  end if;

  -- 3. O Time Comercial da empresa. É o departamento que toda conta recebe, e
  --    é para onde vai quem chega sem ninguém ter dito nada -- melhor do que
  --    "sem departamento", que some da tela de quem escolheu qualquer caixa.
  if v_dept is null then
    select d.id into v_dept
      from public.departments d
     where d.company_id = new.company_id
       and d.name = 'Time Comercial'
     limit 1;
  end if;

  new.department_id := v_dept;
  return new;
exception when others then
  -- Uma conversa sem departamento é um problema pequeno. Uma mensagem de
  -- cliente perdida porque o roteamento falhou é outra coisa.
  raise warning '[rotear_departamento_da_conversa] falhou para a conversa %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_rotear_departamento_da_conversa on public.whatsapp_conversations;
create trigger trg_rotear_departamento_da_conversa
before insert on public.whatsapp_conversations
for each row execute function public.rotear_departamento_da_conversa();

-- As conversas que já existem vão para o Time Comercial (decisão do dono).
-- Sem isto elas ficariam todas em "Sem departamento", e quem escolhesse
-- qualquer caixa abriria a tela vazia no primeiro dia.
update public.whatsapp_conversations c
   set department_id = d.id
  from public.departments d
 where c.department_id is null
   and d.company_id = c.company_id
   and d.name = 'Time Comercial';

-- O padrão da empresa passa a estar escrito na tela de Configurações, e não só
-- no passo 3 da cascata: o campo aparecia vazio enquanto o sistema já tinha
-- para onde mandar, o que é o tipo de coisa que ninguém consegue depurar.
update public.multiatendimento_settings s
   set default_department_id = d.id
  from public.companies c
  join public.departments d on d.company_id = c.id and d.name = 'Time Comercial'
 where s.owner_id = c.owner_id
   and s.default_department_id is null;
