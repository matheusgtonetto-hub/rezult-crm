-- Três departamentos em toda conta: Time Comercial, Suporte Técnico e Sucesso
-- do Cliente (decisão do dono, 22/09/2026).
--
-- O recurso existia e ninguém usava: 13 empresas, 2 departamentos criados no
-- total, 0 conversas dentro de um. Pedir que a pessoa invente a própria divisão
-- antes de ver para que serve é o que manteve a tela vazia. Com três prontos,
-- o seletor já nasce com significado e quem não quiser renomeia ou apaga.

-- O departamento de cada NÚMERO. Sem ele, a conversa que entra não tem de onde
-- herdar o departamento e o dropdown do cartão de conexão não teria o que
-- guardar. `on delete set null`: apagar um departamento não pode derrubar a
-- conexão de WhatsApp da empresa junto.
alter table public.whatsapp_connections
  add column if not exists department_id uuid references public.departments(id) on delete set null;

comment on column public.whatsapp_connections.department_id is
  'Departamento dono deste número. As conversas que entram por ele nascem nele (ver trigger rotear_departamento_da_conversa).';

-- Molde igual ao de criar_tags_padrao: dispara no INSERT da empresa, é
-- idempotente pelo nome e NUNCA derruba o cadastro -- uma exceção aqui
-- impediria alguém de criar a conta por causa de um departamento.
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
    ('Time Comercial',    '#196CF4', 0),
    ('Suporte Técnico',   '#C35305', 1),
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

drop trigger if exists trg_criar_departamentos_padrao on public.companies;
create trigger trg_criar_departamentos_padrao
after insert on public.companies
for each row execute function public.criar_departamentos_padrao();

-- As empresas que já existem. Mesmo `not exists` por nome: quem já tem um
-- "Time Comercial" não ganha um segundo.
--
-- Os departamentos que o cliente criou por conta própria ("Marketing",
-- "Comercial") ficam onde estão: apagar ou renomear o que alguém criou é
-- decisão de quem criou, não desta migration.
insert into public.departments (owner_id, company_id, name, color, position)
select c.owner_id, c.id, v.nome, v.cor,
       coalesce((select max(d.position) + 1 from public.departments d where d.company_id = c.id), 0) + v.pos
from public.companies c
cross join (values
  ('Time Comercial',    '#196CF4', 0),
  ('Suporte Técnico',   '#C35305', 1),
  ('Sucesso do Cliente','#00825E', 2)
) as v(nome, cor, pos)
where c.owner_id is not null
  and not exists (
    select 1 from public.departments d where d.company_id = c.id and d.name = v.nome
  );
