-- Anexo pertence ao negócio, não a quem subiu.
--
-- Até aqui a visibilidade era `owner_id = auth.uid()`: cada pessoa só via os
-- arquivos que ela mesma tinha subido. Um gestor não enxergava o contrato que o
-- vendedor anexou no negócio da própria empresa, o que é o oposto do esperado
-- num CRM, onde o anexo é do negócio e a equipe trabalha o mesmo negócio.
--
-- A regra passa a seguir quem enxerga o LEAD, e não a empresa inteira, porque o
-- CRM já tem permissão `leads:restricted`, em que o vendedor só vê os leads dos
-- quais é responsável. Herdando a visibilidade do lead, o anexo respeita essa
-- permissão sozinho, hoje e quando ela mudar.
--
-- Aqui a subconsulta comum é proposital: dentro de uma política ela passa pelo
-- RLS de quem consulta, que é exatamente o efeito desejado ("enxergo o anexo se
-- enxergo o negócio"). É o oposto da trava de cobrança, que usa SECURITY DEFINER
-- justamente para NÃO depender do que a pessoa pode ler.
--
-- Escrita continua nominal: só se grava anexo em nome próprio. Apagar exige ser
-- quem subiu ou admin da empresa, para um colega não sumir com o documento de
-- outro sem querer.

drop policy if exists own_lead_files on public.lead_files;

create policy lead_files_select on public.lead_files
  for select
  using (exists (select 1 from leads l where l.id = lead_id));

create policy lead_files_insert on public.lead_files
  for insert
  with check (
    owner_id = auth.uid()
    and exists (select 1 from leads l where l.id = lead_id)
  );

create policy lead_files_update on public.lead_files
  for update
  using (
    exists (select 1 from leads l where l.id = lead_id)
    and (owner_id = auth.uid() or public.is_company_admin(public.empresa_do_lead(lead_id)))
  );

create policy lead_files_delete on public.lead_files
  for delete
  using (
    exists (select 1 from leads l where l.id = lead_id)
    and (owner_id = auth.uid() or public.is_company_admin(public.empresa_do_lead(lead_id)))
  );

-- ── O arquivo em si ──────────────────────────────────────────────────────────
--
-- Sem esta parte a mudança seria inútil: o download usa link assinado, que exige
-- permissão de leitura no objeto, e o caminho começa com o id de QUEM SUBIU
-- (`{user_id}/{lead_id}/{timestamp}.ext`). O gestor passaria a ver o nome do
-- arquivo na lista e receberia erro ao tentar abrir.
--
-- Em vez de reescrever o caminho dos arquivos já existentes, o acesso ao objeto
-- passa a seguir o registro em lead_files, que por sua vez segue o negócio.
-- `storage.objects.name` vai qualificado de propósito: lead_files também tem uma
-- coluna `name`, e sem a qualificação a comparação casaria a coluna errada.

create index if not exists lead_files_storage_path_idx on public.lead_files (storage_path);

drop policy if exists read_lead_files on storage.objects;
create policy read_lead_files on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lead-files'
    and exists (
      select 1 from public.lead_files f
      where f.storage_path = storage.objects.name
    )
  );

drop policy if exists delete_lead_files on storage.objects;
create policy delete_lead_files on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lead-files'
    and (
      (storage.foldername(name))[1] = (auth.uid())::text
      or exists (
        select 1 from public.lead_files f
        where f.storage_path = storage.objects.name
          and public.is_company_admin(public.empresa_do_lead(f.lead_id))
      )
    )
  );
