-- O valor do negócio passa a ser a SOMA DOS ITENS, e continua editável à mão.
--
-- Aplicada em produção em 20/09/2026 (pelo MCP do Supabase); este arquivo
-- registra a mudança no repositório.
--
-- Decisão do dono: "o valor do negócio passa a ser a soma dos itens e pode ser
-- alterado como funciona hoje". As duas coisas convivem por esta bandeira:
-- enquanto ela é falsa, o valor acompanha os itens; quando alguém digita um
-- valor, ela vira verdadeira e o valor para de ser recalculado -- é o desconto
-- no total, e não um número que some no próximo item adicionado.
alter table leads add column if not exists value_is_manual boolean not null default false;

comment on column leads.value_is_manual is
  'true = o valor do negócio foi digitado à mão e não é mais recalculado pela soma dos itens. Volta a false quando a pessoa pede para recalcular.';

-- O recálculo vive no BANCO, e não no app: automação, agente de IA e a própria
-- tela escrevem em lead_products por caminhos diferentes, e três cópias da
-- mesma regra divergem na primeira correção.
create or replace function recalcular_valor_do_negocio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid := coalesce(new.lead_id, old.lead_id);
begin
  update leads l
     set value = coalesce((
           select sum(lp.quantidade * lp.valor_unitario)
           from lead_products lp
           where lp.lead_id = alvo
         ), 0)
   where l.id = alvo
     and l.value_is_manual = false;
  return null;
end;
$$;

drop trigger if exists trg_recalcular_valor_do_negocio on lead_products;
create trigger trg_recalcular_valor_do_negocio
after insert or update or delete on lead_products
for each row execute function recalcular_valor_do_negocio();

-- Desligar o ajuste manual precisa devolver o valor à soma NA HORA. Sem isto, a
-- pessoa que clicou em "voltar a somar" veria o valor antigo, como se o botão
-- não tivesse funcionado.
create or replace function recalcular_ao_sair_do_manual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.value_is_manual = true and new.value_is_manual = false then
    new.value := coalesce((
      select sum(lp.quantidade * lp.valor_unitario)
      from lead_products lp
      where lp.lead_id = new.id
    ), 0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recalcular_ao_sair_do_manual on leads;
create trigger trg_recalcular_ao_sair_do_manual
before update of value_is_manual on leads
for each row execute function recalcular_ao_sair_do_manual();
