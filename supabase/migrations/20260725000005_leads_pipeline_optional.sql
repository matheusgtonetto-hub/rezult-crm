-- Permite Lead sem negócio: pipeline_id deixa de ser obrigatório em leads.
-- Um Lead (pessoa) pode existir sem nenhum negócio/pipeline vinculado ainda;
-- column_id/stage já era nullable desde a migration original.
alter table public.leads alter column pipeline_id drop not null;
