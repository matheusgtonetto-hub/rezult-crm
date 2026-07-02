-- ============================================================================
-- Disparos — execução em massa de automações sobre leads filtrados
-- ============================================================================
-- Um "disparo" envia vários leads para uma automação (gatilho manual por leads),
-- em lotes, respeitando um ritmo configurável. Cada lead vira um "item" com status
-- próprio (nao_iniciado → pendente → em_execucao → concluido | erro).

create table if not exists public.disparos (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null,                     -- dono da empresa (padrão multi-tenant)
  company_id      uuid not null references public.companies(id) on delete cascade,
  created_by      uuid,                              -- usuário que criou
  title           text not null,
  description     text,
  automation_id   uuid references public.automations(id) on delete set null,
  automation_name text,
  status          text not null default 'criado',    -- criado|agendado|em_andamento|pausado|concluido|erro
  rhythm          text not null default 'normal',     -- normal|turbo|lento|humano
  filters         jsonb not null default '{}'::jsonb, -- config do filtro de leads usado
  scheduled_at    timestamptz,                        -- início agendado (opcional)
  confirm_filters boolean not null default false,     -- reprocessar filtro antes de iniciar
  total_leads     integer not null default 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.disparo_itens (
  id            uuid primary key default gen_random_uuid(),
  disparo_id    uuid not null references public.disparos(id) on delete cascade,
  company_id    uuid not null,
  owner_id      uuid not null,
  lead_id       uuid references public.leads(id) on delete cascade,
  lead_name     text,
  lead_phone    text,
  status        text not null default 'nao_iniciado', -- nao_iniciado|pendente|em_execucao|concluido|erro
  error_message text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (disparo_id, lead_id)
);

create index if not exists idx_disparos_company        on public.disparos(company_id);
create index if not exists idx_disparos_status          on public.disparos(status);
create index if not exists idx_disparo_itens_disparo    on public.disparo_itens(disparo_id);
create index if not exists idx_disparo_itens_status     on public.disparo_itens(disparo_id, status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.disparos      enable row level security;
alter table public.disparo_itens enable row level security;

drop policy if exists "disparos_select" on public.disparos;
drop policy if exists "disparos_insert" on public.disparos;
drop policy if exists "disparos_update" on public.disparos;
drop policy if exists "disparos_delete" on public.disparos;
create policy "disparos_select" on public.disparos for select using (owner_id = auth.uid() or is_company_member(owner_id));
create policy "disparos_insert" on public.disparos for insert with check (owner_id = auth.uid() or is_company_member(owner_id));
create policy "disparos_update" on public.disparos for update using (owner_id = auth.uid() or is_company_member(owner_id));
create policy "disparos_delete" on public.disparos for delete using (owner_id = auth.uid() or is_company_member(owner_id));

drop policy if exists "disparo_itens_select" on public.disparo_itens;
drop policy if exists "disparo_itens_insert" on public.disparo_itens;
drop policy if exists "disparo_itens_update" on public.disparo_itens;
drop policy if exists "disparo_itens_delete" on public.disparo_itens;
create policy "disparo_itens_select" on public.disparo_itens for select using (owner_id = auth.uid() or is_company_member(owner_id));
create policy "disparo_itens_insert" on public.disparo_itens for insert with check (owner_id = auth.uid() or is_company_member(owner_id));
create policy "disparo_itens_update" on public.disparo_itens for update using (owner_id = auth.uid() or is_company_member(owner_id));
create policy "disparo_itens_delete" on public.disparo_itens for delete using (owner_id = auth.uid() or is_company_member(owner_id));

-- ─── updated_at automático ───────────────────────────────────────────────────
create or replace function public.disparos_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_disparos_touch      on public.disparos;
drop trigger if exists trg_disparo_itens_touch on public.disparo_itens;
create trigger trg_disparos_touch      before update on public.disparos      for each row execute function public.disparos_touch_updated_at();
create trigger trg_disparo_itens_touch before update on public.disparo_itens for each row execute function public.disparos_touch_updated_at();

-- ─── Realtime (acompanhar progresso em tempo real) ───────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.disparos';      exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.disparo_itens'; exception when duplicate_object then null; end;
end $$;
