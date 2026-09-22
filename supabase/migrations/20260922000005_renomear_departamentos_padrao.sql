-- "Time Comercial" vira "Comercial" e "Suporte Técnico" vira "Suporte"
-- (dono, 22/09/2026). "Sucesso do Cliente" fica.

-- 1. Os que já existem. O `not exists` protege a empresa que já tenha um
--    departamento com o nome novo: renomear às cegas criaria dois "Comercial"
--    na mesma lista, sem nada que os distinga no seletor.
update public.departments d
   set name = 'Comercial'
 where d.name = 'Time Comercial'
   and not exists (select 1 from public.departments o where o.company_id = d.company_id and o.name = 'Comercial');

update public.departments d
   set name = 'Suporte'
 where d.name = 'Suporte Técnico'
   and not exists (select 1 from public.departments o where o.company_id = d.company_id and o.name = 'Suporte');

-- 2. As contas novas.
create or replace function public.criar_departamentos_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    return new;
  end if;

  insert into public.departments (owner_id, company_id, name, color, position)
  select new.owner_id, new.id, v.nome, v.cor, v.pos
  from (values
    ('Comercial',         '#196CF4', 0),
    ('Suporte',           '#C35305', 1),
    ('Sucesso do Cliente','#00825E', 2)
  ) as v(nome, cor, pos)
  where not exists (
    select 1 from public.departments d where d.company_id = new.id and d.name = v.nome
  );

  return new;
exception when others then
  raise warning '[criar_departamentos_padrao] falhou para a empresa %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- 3. O roteamento para de depender de NOME.
--
--    O passo 3 da cascata procurava o departamento chamado "Time Comercial", e
--    esta migration acabou de mostrar o problema: bastou o dono querer outro
--    nome para a regra apontar para o vazio. Pior, o cliente renomeia pela
--    tela, quando quiser, e nada avisaria -- as conversas novas simplesmente
--    parariam de receber departamento.
--
--    Passa a ser o PRIMEIRO departamento da lista da empresa (menor position,
--    desempate pelo mais antigo). É a mesma ordem que a pessoa vê na tela, e
--    "cai no primeiro" é uma regra que se explica sem consultar o código.
create or replace function public.rotear_departamento_da_conversa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept uuid;
begin
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

  -- 3. O primeiro departamento da empresa.
  if v_dept is null then
    select d.id into v_dept
      from public.departments d
     where d.company_id = new.company_id
     order by d.position, d.created_at
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
