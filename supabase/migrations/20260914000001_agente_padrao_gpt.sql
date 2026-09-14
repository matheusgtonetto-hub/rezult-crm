-- Agente novo nasce com GPT, e não com Claude.
--
-- O objetivo é o cliente precisar de UMA chave só, a da OpenAI. Ela já cobre
-- tudo: responder as conversas (o motor do agente roda GPT com ferramentas) e
-- gerar os embeddings da Base de Conhecimento, que só a OpenAI oferece entre os
-- dois fornecedores. Com o padrão em Claude, todo agente novo exigia também a
-- chave da Anthropic para ser ligado.
--
-- Só muda o padrão: agentes que já existem mantêm o modelo que têm.
alter table public.agents alter column model set default 'gpt-5.6-terra';
