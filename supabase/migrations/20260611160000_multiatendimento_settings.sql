-- Configurações do Multiatendimento (aba Configurações). Uma linha por empresa.
create table if not exists public.multiatendimento_settings (
  owner_id              uuid primary key,                 -- dono da empresa (escopo RLS)
  company_id            uuid,
  default_department_id uuid,                             -- departamento padrão das conversas
  work_schedule_id      uuid,                             -- horário de funcionamento padrão
  audio_transcription   text not null default 'desativado', -- desativado | sempre | atribuido
  signature_required    boolean not null default false,   -- assinatura obrigatória
  keep_attendant        boolean not null default false,   -- manter atendente ao finalizar
  keep_department       boolean not null default false,   -- manter departamento ao finalizar
  updated_at            timestamptz not null default now()
);

alter table public.multiatendimento_settings enable row level security;

create policy owner_all on public.multiatendimento_settings
  for all using (auth.uid() = owner_id);
create policy member_select on public.multiatendimento_settings
  for select using (is_company_member(owner_id));
create policy member_insert on public.multiatendimento_settings
  for insert with check ((owner_id = auth.uid()) or is_company_member(owner_id));
create policy member_update on public.multiatendimento_settings
  for update using (is_company_member(owner_id));
