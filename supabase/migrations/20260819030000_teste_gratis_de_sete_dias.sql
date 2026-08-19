-- Teste grátis do cadastro: marca quem está testando, sem cartão.
--
-- Até aqui o cadastro dava plano "free" por 2 dias, o que não era um teste:
-- `isFreePlan` já era verdadeiro no primeiro minuto, então a pessoa entrava com
-- os limites do gratuito, via a tarja vermelha de upgrade antes de conhecer o
-- produto, e no fim dos 2 dias nada mudava. As duas empresas que passaram por
-- esse fluxo expiraram sem cadastrar um único lead.
--
-- Agora o cadastro entra como Silver por 7 dias e esta coluna diz que aquilo é
-- teste, não contrato. Serve para a tela falar em prazo em vez de vender
-- upgrade, e para o /setup não desviar quem ainda não assinou.
--
-- Não confundir com subscriptions.trial_ends_at: aquele é o trial da Stripe,
-- com cartão já informado. Este é o de antes do cartão. O stripe-webhook zera
-- esta coluna assim que uma assinatura fica em dia, porque daí quem manda na
-- validade é a assinatura.

alter table companies add column if not exists trial_ends_at timestamptz;

comment on column companies.trial_ends_at is
  'Fim do teste gratis do cadastro (sem cartao). Nulo quando a empresa nunca testou ou ja assinou. Nao confundir com subscriptions.trial_ends_at, que e o trial da Stripe com cartao ja informado.';
