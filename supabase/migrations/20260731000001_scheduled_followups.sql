-- ============================================================================
-- Scheduled Followups — agendar o envio de UMA mensagem de WhatsApp avulsa
-- para uma data/hora futura, a partir do Multiatendimento.
-- ============================================================================
-- Diferente de `disparos` (campanha em massa, aciona uma automação por lead),
-- aqui é uma mensagem de texto única, enviada diretamente (sem passar por
-- automation-runner). Mesmo padrão de agendamento (status + scheduled_at +
-- pg_cron) que `disparos` já usa em produção.

create table if not exists public.scheduled_followups (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,                     -- dono da empresa (padrão multi-tenant)
  company_id      uuid not null references public.companies(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete cascade,
  phone           text not null,
  connection_id   uuid references public.whatsapp_connections(id) on delete set null,
  message         text not null,
  scheduled_at    timestamptz not null,
  status          text not null default 'agendado',  -- agendado|enviado|erro|cancelado
  error_message   text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists idx_scheduled_followups_due
  on public.scheduled_followups(status, scheduled_at);
create index if not exists idx_scheduled_followups_phone
  on public.scheduled_followups(owner_id, phone);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.scheduled_followups enable row level security;

drop policy if exists "scheduled_followups_select" on public.scheduled_followups;
drop policy if exists "scheduled_followups_insert" on public.scheduled_followups;
drop policy if exists "scheduled_followups_update" on public.scheduled_followups;
drop policy if exists "scheduled_followups_delete" on public.scheduled_followups;
create policy "scheduled_followups_select" on public.scheduled_followups for select using (owner_id = auth.uid() or is_company_member(owner_id));
create policy "scheduled_followups_insert" on public.scheduled_followups for insert with check (owner_id = auth.uid() or is_company_member(owner_id));
create policy "scheduled_followups_update" on public.scheduled_followups for update using (owner_id = auth.uid() or is_company_member(owner_id));
create policy "scheduled_followups_delete" on public.scheduled_followups for delete using (owner_id = auth.uid() or is_company_member(owner_id));

-- ─── updated_at automático ───────────────────────────────────────────────────
create or replace function public.scheduled_followups_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_scheduled_followups_touch on public.scheduled_followups;
create trigger trg_scheduled_followups_touch before update on public.scheduled_followups
  for each row execute function public.scheduled_followups_touch_updated_at();

-- ─── Realtime (lista de pendentes atualiza sozinha no popup) ─────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.scheduled_followups'; exception when duplicate_object then null; end;
end $$;
