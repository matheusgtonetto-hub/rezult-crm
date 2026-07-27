-- Visibilidade de conversas por atendente no Multiatendimento. Administrador/
-- Administrador de multiatendimento sempre veem tudo (checado no app via
-- usePermissions, sem exceção aqui). Supervisor/Atendente dependem dessas 2
-- configurações, setadas por um admin na aba "Atendentes" das configurações
-- do Multiatendimento -- hoje aquela tela é um stub morto (checked={false},
-- onChange só mostra toast "Em breve"), esta tabela é o dado real por trás.
--
-- Chaveada por user_id (não nome) -- mais robusto, mesmo padrão de
-- company_members/get_company_members. Sem linha = valores default (as duas
-- regras desligadas): não vê conversas de outros atendentes, mas continua
-- vendo conversas sem atendente.
create table public.multiatendimento_attendant_settings (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  allow_see_others_convs   boolean not null default false,
  hide_unassigned_convs    boolean not null default false,
  updated_at               timestamptz not null default now(),
  unique (company_id, user_id)
);

alter table public.multiatendimento_attendant_settings enable row level security;

-- Leitura: qualquer membro da empresa (mesmo padrão de get_company_members,
-- que já expõe as permissions de todo mundo pra todo mundo -- não é dado
-- sensível).
create policy "company_select_mu_attendant_settings"
  on public.multiatendimento_attendant_settings
  for select
  using (public.is_member_of(company_id));

-- Escrita: só dono da empresa ou quem tem admin/multiatendimento:admin.
create policy "admin_write_mu_attendant_settings"
  on public.multiatendimento_attendant_settings
  for all
  using (
    exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
    or exists (
      select 1 from public.company_members cm
      where cm.company_id = multiatendimento_attendant_settings.company_id
        and cm.user_id = auth.uid()
        and ('admin' = any(cm.permissions) or 'multiatendimento:admin' = any(cm.permissions))
    )
  )
  with check (
    exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid())
    or exists (
      select 1 from public.company_members cm
      where cm.company_id = multiatendimento_attendant_settings.company_id
        and cm.user_id = auth.uid()
        and ('admin' = any(cm.permissions) or 'multiatendimento:admin' = any(cm.permissions))
    )
  );

create index idx_mu_attendant_settings_company on public.multiatendimento_attendant_settings(company_id);
