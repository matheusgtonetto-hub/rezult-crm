-- Fim do teste grátis passa a bloquear, igual a um plano cancelado.
--
-- Antes desta migration o teste vencido apenas rebaixava a empresa para os
-- limites do plano gratuito: ela continuava criando lead, movendo negócio e
-- respondendo no Multiatendimento, só que com teto menor. Na prática o teste
-- não terminava, virava um plano grátis permanente.
--
-- Agora ele termina no mesmo estado de quem não pagou: somente leitura. Os dados
-- continuam visíveis, a escrita para até assinar.
--
-- A regra entra DENTRO de empresa_bloqueada() de propósito, em vez de virar uma
-- segunda trava paralela. Assim as 145 políticas de RLS, os runners de fundo e a
-- tela herdam o comportamento sem nenhuma linha nova: existe um lugar só no
-- sistema que responde "esta empresa pode escrever?".
--
-- O `not exists` sobre subscriptions é cinto de segurança. O stripe-webhook já
-- zera trial_ends_at quando uma assinatura fica em dia, mas se o evento atrasar
-- ou falhar, quem acabou de pagar não pode ficar preso do lado de fora.
--
-- O CASE existe para o custo: a função é avaliada linha a linha em toda escrita,
-- e a consulta a subscriptions só acontece para quem realmente tem teste vencido.

create index if not exists subscriptions_company_id_idx on public.subscriptions (company_id);

create or replace function public.empresa_bloqueada(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      -- Cobrança recusada
      c.billing_status = 'bloqueado'
      or (c.billing_status = 'pendente'
          and c.billing_grace_until is not null
          and c.billing_grace_until < now())
      -- Teste grátis encerrado sem assinatura
      or case
           when c.trial_ends_at is not null and c.trial_ends_at < now()
             then not exists (
               select 1 from subscriptions s
               where s.company_id = c.id
                 and s.status in ('active', 'trialing')
             )
           else false
         end
    from companies c
    where c.id = p_company
  ), false);
$$;

comment on function public.empresa_bloqueada(uuid) is
  'true quando a empresa esta em somente leitura: cobranca recusada ou teste gratis encerrado sem assinatura. Empresa sem teste e sem assinatura (legado) nunca bloqueia.';
