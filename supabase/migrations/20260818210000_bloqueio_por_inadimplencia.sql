-- Bloqueio por inadimplência.
--
-- Antes desta migration o único portão de acesso do sistema era
-- companies.plan_expires_at, e o webhook da Stripe empurrava essa data para o
-- fim do período novo mesmo quando a cobrança tinha sido recusada. Resultado
-- observado em produção (Ayres Company, agosto/2026): a falha de pagamento
-- ESTENDEU o acesso por mais um ciclo, porque a Stripe avança o período da
-- assinatura ao emitir a fatura, antes de recebê-la.
--
-- Agora o estado de cobrança é explícito e mora em companies:
--
--   ok         → em dia
--   pendente   → cobrança recusada, Stripe ainda tentando (janela de carência)
--   bloqueado  → Stripe desistiu, ou a carência venceu
--
-- 'pendente' vira 'bloqueado' sozinho quando billing_grace_until passa. Esse
-- fallback existe porque a Stripe pode estar configurada para NÃO fazer nada ao
-- fim das tentativas: sem ele a assinatura ficaria past_due para sempre e nada
-- bloquearia o cliente.

alter table companies
  add column if not exists billing_status      text not null default 'ok',
  add column if not exists billing_grace_until timestamptz;

alter table companies drop constraint if exists companies_billing_status_check;
alter table companies
  add constraint companies_billing_status_check
  check (billing_status in ('ok', 'pendente', 'bloqueado'));

comment on column companies.billing_status is
  'Estado de cobrança: ok | pendente (recusada, em carência) | bloqueado (somente leitura). Escrito pelo stripe-webhook.';
comment on column companies.billing_grace_until is
  'Fim da carência de uma cobrança recusada. Depois disso, pendente vale como bloqueado.';

-- SECURITY DEFINER de propósito: a função é usada dentro das políticas da
-- própria tabela companies e precisa ler a linha sem passar pelo RLS, senão a
-- avaliação da política chamaria a si mesma.
create or replace function public.empresa_bloqueada(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.billing_status = 'bloqueado'
        or (c.billing_status = 'pendente'
            and c.billing_grace_until is not null
            and c.billing_grace_until < now())
    from companies c
    where c.id = p_company
  ), false);
$$;

comment on function public.empresa_bloqueada(uuid) is
  'true quando a empresa está em somente leitura por falta de pagamento. Empresa sem assinatura (free/trial) nunca bloqueia.';

revoke all on function public.empresa_bloqueada(uuid) from public;
grant execute on function public.empresa_bloqueada(uuid) to authenticated, anon, service_role;

-- ── Somente leitura via RLS ──────────────────────────────────────────────────
--
-- Políticas RESTRICTIVE são somadas com E às permissivas já existentes, então
-- nenhuma regra atual precisa ser reescrita: some tudo se estas forem dropadas.
--
-- Uma política por comando, e NENHUMA para SELECT. Um "FOR ALL" restritivo
-- filtraria a leitura junto e esconderia os dados do próprio cliente, que é
-- bloqueio total. A decisão aqui é somente leitura: ele continua vendo o
-- histórico, só não escreve.
--
-- Vale só para 'authenticated'. O service_role ignora RLS por natureza, então
-- webhooks continuam gravando mensagem recebida (o cliente segue enxergando o
-- que chega) e os runners de fundo são barrados no código deles, não aqui.
do $$
declare
  t text;
  tabelas text[] := array[
    'activities', 'agent_calendar_connections', 'agent_closer_availability',
    'agent_closers', 'agent_knowledge_bases', 'agent_knowledge_chunks',
    'agent_knowledge_documents', 'agent_meta_connections',
    'agent_webhook_integrations', 'agent_whatsapp_connections', 'agents',
    'ai_provider_keys', 'atendimentos', 'automations', 'company_invites',
    'company_members', 'contacts', 'custom_field_groups', 'custom_field_items',
    'departments', 'disparo_itens', 'disparos', 'google_calendar_connections',
    'google_oauth_tokens', 'leads', 'lists', 'loss_reasons', 'meta_connections',
    'meta_integrations', 'meta_messages', 'multiatendimento_attendant_settings',
    'multiatendimento_settings', 'pipeline_columns', 'pipeline_groups',
    'pipelines', 'products', 'quick_messages', 'scheduled_followups', 'tags',
    'tasks', 'webhook_api_keys', 'webhook_integrations', 'whatsapp_connections',
    'whatsapp_conversations', 'whatsapp_messages', 'work_schedules'
  ];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists bloqueio_cobranca_insert on public.%I', t);
    execute format('drop policy if exists bloqueio_cobranca_update on public.%I', t);
    execute format('drop policy if exists bloqueio_cobranca_delete on public.%I', t);

    execute format(
      'create policy bloqueio_cobranca_insert on public.%I as restrictive '
      'for insert to authenticated with check (not public.empresa_bloqueada(company_id))', t);
    execute format(
      'create policy bloqueio_cobranca_update on public.%I as restrictive '
      'for update to authenticated using (not public.empresa_bloqueada(company_id)) '
      'with check (not public.empresa_bloqueada(company_id))', t);
    execute format(
      'create policy bloqueio_cobranca_delete on public.%I as restrictive '
      'for delete to authenticated using (not public.empresa_bloqueada(company_id))', t);
  end loop;
end $$;

-- companies fica de fora do laço: a coluna que identifica a empresa aqui é o
-- próprio id, não company_id.
drop policy if exists bloqueio_cobranca_update on public.companies;
create policy bloqueio_cobranca_update on public.companies as restrictive
  for update to authenticated
  using (not public.empresa_bloqueada(id))
  with check (not public.empresa_bloqueada(id));

-- ── Estado inicial, a partir do que a Stripe já contou ───────────────────────
update companies c
set billing_status      = 'pendente',
    billing_grace_until = s.current_period_start + interval '15 days'
from subscriptions s
where s.company_id = c.id
  and s.status = 'past_due'
  and c.billing_status = 'ok';

update companies c
set billing_status = 'bloqueado'
from subscriptions s
where s.company_id = c.id
  and s.status = 'unpaid';
