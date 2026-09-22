-- Itens de um negócio: vários produtos no mesmo negócio.
--
-- Aplicada em produção em 20/09/2026 (pelo MCP do Supabase); este arquivo
-- registra a mudança no repositório.
--
-- Até aqui o vínculo era `leads.product_id`, um produto só. `leads.product_id`
-- CONTINUA existindo como espelho do primeiro item, porque automações, agente
-- de IA e filtro de disparos ainda leem de lá.
create table if not exists lead_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantidade integer not null default 1 check (quantidade > 0),
  -- Copiado do produto na hora de adicionar: o preço de tabela pode mudar
  -- depois sem reescrever o que já foi vendido.
  valor_unitario numeric not null default 0 check (valor_unitario >= 0),
  posicao integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table lead_products is
  'Itens de um negócio (produto, quantidade, valor unitário). O valor do negócio é a soma destes itens, salvo quando leads.value_is_manual = true.';

create index if not exists lead_products_lead_id_idx on lead_products(lead_id);
create index if not exists lead_products_company_id_idx on lead_products(company_id);
create index if not exists lead_products_product_id_idx on lead_products(product_id);

alter table lead_products enable row level security;

-- O padrão da casa: quem é da empresa vê e mexe.
create policy "lead_products_select" on lead_products for select using (is_member_of(company_id));
create policy "lead_products_insert" on lead_products for insert with check (is_member_of(company_id));
create policy "lead_products_update" on lead_products for update using (is_member_of(company_id));
create policy "lead_products_delete" on lead_products for delete using (is_member_of(company_id));

-- Migração: cada negócio que já tinha produto vira um item, com o valor que
-- tem hoje. Os que apontam para produto APAGADO ficam de fora -- sem chave
-- estrangeira, `leads.product_id` aceitava apontar para o que não existe mais.
insert into lead_products (company_id, lead_id, product_id, quantidade, valor_unitario, posicao)
select l.company_id, l.id, p.id, 1, coalesce(l.value, 0), 0
from leads l
join products p on p.id::text = l.product_id::text
where not exists (select 1 from lead_products lp where lp.lead_id = l.id);
