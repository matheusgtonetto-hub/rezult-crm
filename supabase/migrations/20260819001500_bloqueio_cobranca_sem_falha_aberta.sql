-- Correção de falha aberta nas políticas indiretas de bloqueio por cobrança.
--
-- As políticas de lead_files e list_leads resolviam a empresa por subconsulta:
--
--   not empresa_bloqueada((select l.company_id from leads l where l.id = lead_id))
--
-- Subconsulta dentro de política TAMBÉM passa pelo RLS de quem está escrevendo.
-- Quando o usuário não enxerga a linha referenciada, a subconsulta devolve NULL,
-- empresa_bloqueada(NULL) devolve false e a escrita passa. Ou seja: a trava valia
-- só para quem já tinha permissão de leitura sobre o alvo.
--
-- Reproduzido antes da correção: usuário de uma empresa anexou arquivo num lead de
-- outra empresa que estava BLOQUEADA, e a política deixou passar.
--
-- A resolução da empresa passa a acontecer em função SECURITY DEFINER, que ignora
-- o RLS do chamador. Agora a trava independe do que o usuário pode ler.

create or replace function public.empresa_do_lead(p_lead uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select l.company_id from leads l where l.id = p_lead;
$$;

create or replace function public.empresa_da_lista(p_lista uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select li.company_id from lists li where li.id = p_lista;
$$;

comment on function public.empresa_do_lead(uuid) is
  'Empresa dona do lead, sem passar pelo RLS do chamador. Existe para politicas nao falharem abertas.';
comment on function public.empresa_da_lista(uuid) is
  'Empresa dona da lista, sem passar pelo RLS do chamador. Mesmo motivo de empresa_do_lead.';

revoke all on function public.empresa_do_lead(uuid)  from public;
revoke all on function public.empresa_da_lista(uuid) from public;
grant execute on function public.empresa_do_lead(uuid)  to authenticated, service_role;
grant execute on function public.empresa_da_lista(uuid) to authenticated, service_role;

-- anon não tem por que perguntar se uma empresa está inadimplente.
revoke execute on function public.empresa_bloqueada(uuid) from anon;

drop policy if exists bloqueio_cobranca_insert on public.lead_files;
drop policy if exists bloqueio_cobranca_update on public.lead_files;
drop policy if exists bloqueio_cobranca_delete on public.lead_files;

create policy bloqueio_cobranca_insert on public.lead_files as restrictive
  for insert to authenticated
  with check (not public.empresa_bloqueada(public.empresa_do_lead(lead_id)));
create policy bloqueio_cobranca_update on public.lead_files as restrictive
  for update to authenticated
  using      (not public.empresa_bloqueada(public.empresa_do_lead(lead_id)))
  with check (not public.empresa_bloqueada(public.empresa_do_lead(lead_id)));
create policy bloqueio_cobranca_delete on public.lead_files as restrictive
  for delete to authenticated
  using (not public.empresa_bloqueada(public.empresa_do_lead(lead_id)));

drop policy if exists bloqueio_cobranca_insert on public.list_leads;
drop policy if exists bloqueio_cobranca_update on public.list_leads;
drop policy if exists bloqueio_cobranca_delete on public.list_leads;

create policy bloqueio_cobranca_insert on public.list_leads as restrictive
  for insert to authenticated
  with check (not public.empresa_bloqueada(public.empresa_da_lista(list_id)));
create policy bloqueio_cobranca_update on public.list_leads as restrictive
  for update to authenticated
  using      (not public.empresa_bloqueada(public.empresa_da_lista(list_id)))
  with check (not public.empresa_bloqueada(public.empresa_da_lista(list_id)));
create policy bloqueio_cobranca_delete on public.list_leads as restrictive
  for delete to authenticated
  using (not public.empresa_bloqueada(public.empresa_da_lista(list_id)));
