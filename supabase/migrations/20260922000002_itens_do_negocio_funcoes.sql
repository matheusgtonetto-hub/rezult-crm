-- Adicionar e remover item do negócio, para quem escreve de FORA da tela.
--
-- A tela faz isso direto em lead_products (CRMContext), mas automação e agente
-- de IA rodam com service role fora do navegador. Sem um lugar comum, a regra
-- de "qual preço gravar", "qual posição" e "espelhar leads.product_id" viraria
-- três cópias -- e a primeira correção já as faria divergir.
--
-- SECURITY DEFINER com escopo por empresa dentro do corpo: as duas funções
-- recusam produto de outra empresa, que é o mesmo cuidado que a ação de tags do
-- runner já toma contra id residual de importação.

create or replace function public.adicionar_item_do_negocio(p_lead uuid, p_produto uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_valor numeric;
  v_item uuid;
begin
  select company_id into v_company from leads where id = p_lead;
  if v_company is null then return null; end if;

  -- O produto tem que ser da MESMA empresa do negócio.
  select default_value into v_valor
    from products where id = p_produto and company_id = v_company;
  if not found then return null; end if;

  -- Idempotente: pedir duas vezes o mesmo produto não cria linha repetida. É o
  -- que a tela já faz (o escolhido sai do dropdown) e o que uma automação que
  -- roda de novo no mesmo negócio espera.
  select id into v_item from lead_products
   where lead_id = p_lead and product_id = p_produto limit 1;
  if v_item is not null then return v_item; end if;

  insert into lead_products (company_id, lead_id, product_id, quantidade, valor_unitario, posicao)
  values (
    v_company, p_lead, p_produto, 1,
    coalesce(v_valor, 0),
    coalesce((select max(posicao) + 1 from lead_products where lead_id = p_lead), 0)
  )
  returning id into v_item;

  -- leads.product_id segue o PRIMEIRO item: é o campo que filtro de disparos e
  -- integrações antigas ainda leem.
  update leads l
     set product_id = (select lp.product_id from lead_products lp
                        where lp.lead_id = p_lead order by lp.posicao limit 1)
   where l.id = p_lead;

  return v_item;
end;
$$;

comment on function public.adicionar_item_do_negocio is
  'Adiciona um produto ao negócio (preço vindo do cadastro do produto) e espelha leads.product_id no primeiro item. Idempotente. Usada pelo automation-runner e pelo agente de IA.';

create or replace function public.remover_item_do_negocio(p_lead uuid, p_produto uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removidos integer;
begin
  -- Sem produto informado, remove todos: é o que a ação antiga fazia ao zerar
  -- leads.product_id, e o que uma automação existente continua esperando.
  delete from lead_products
   where lead_id = p_lead
     and (p_produto is null or product_id = p_produto);
  get diagnostics v_removidos = row_count;

  update leads l
     set product_id = (select lp.product_id from lead_products lp
                        where lp.lead_id = p_lead order by lp.posicao limit 1)
   where l.id = p_lead;

  return v_removidos;
end;
$$;

comment on function public.remover_item_do_negocio is
  'Remove um produto do negócio, ou todos quando p_produto é nulo, e reespelha leads.product_id. Usada pelo automation-runner e pelo agente de IA.';

-- Estas funções escrevem no negócio: quem chama é o service role (runner e
-- agente). Pela API pública ninguém precisa delas.
revoke execute on function public.adicionar_item_do_negocio(uuid, uuid) from anon, authenticated;
revoke execute on function public.remover_item_do_negocio(uuid, uuid) from anon, authenticated;
