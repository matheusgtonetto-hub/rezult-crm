-- Qual CRM a pessoa usava, e o porte sai do cadastro.
--
-- ── previous_crm ────────────────────────────────────────────────────────────
--
-- Campo curto e OPCIONAL que aparece só quando a resposta de "Você já usou um
-- CRM antes?" é "Sim, já usei um CRM".
--
-- Quem responde isso está dizendo duas coisas de valor: tem processo comercial
-- montado, e está insatisfeito com alguém. A primeira muda o onboarding (essa
-- pessoa não precisa de introdução a funil), a segunda é inteligência
-- competitiva -- saber de quem se está tirando cliente.
--
-- Opcional de propósito: quem não quiser dizer segue em frente sem atrito, e o
-- pouco que vier é melhor do que nada. Obrigatório aqui só serviria para
-- inventar respostas.
--
-- ── company_size ────────────────────────────────────────────────────────────
--
-- A pergunta de porte saiu do cadastro. Eram três perguntas de dimensão
-- seguidas (porte, quantas pessoas usarão, volume de leads), e o porte é a que
-- menos age: volume mede a dor e diz a quem ligar, usuários previstos medem o
-- tamanho da conta e conversam com preço, e o porte é um proxy que as duas
-- cobrem melhor.
--
-- A coluna FICA, e vazia. Não foi apagada porque apagar coluna é irreversível
-- e ela não atrapalha nada estando ali; o comentário abaixo é que passa a
-- registrar que ninguém mais a preenche, para quem consultar não achar que os
-- nulos são falha de gravação.

alter table public.profiles
  add column if not exists previous_crm text;

comment on column public.profiles.previous_crm is
  'Qual CRM a pessoa usava antes, perguntado no cadastro só para quem respondeu "Sim, já usei um CRM" em crm_experience. Campo livre e opcional -- nulo aqui é "não quis dizer" ou "a pergunta não se aplica", nunca falha.';

comment on column public.companies.company_size is
  'DESATIVADA: a pergunta de porte saiu do cadastro em 2026-08-25, substituída por monthly_leads (tamanho da dor) e expected_users (tamanho da conta), que agem melhor. Nada preenche esta coluna hoje, e os nulos não são falha de gravação. Mantida vazia em vez de apagada por ser irreversível.';
