-- 'claude-opus-4-8' saiu da lista de modelos disponíveis (Claude Console
-- passou a oferecer a linha 5: Opus 5, Sonnet 5, Haiku 4.5). Troca o default
-- da coluna e migra os agentes já criados que ainda apontavam pro modelo antigo.
alter table agents alter column model set default 'claude-sonnet-5';
update agents set model = 'claude-sonnet-5' where model = 'claude-opus-4-8';
