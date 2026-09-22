-- vagas_postadas estava com RLS DESLIGADO e `anon` com todos os privilégios.
-- A chave anon é pública (vai no pacote do site), então qualquer pessoa podia
-- apagar as 27 linhas. Não há dado pessoal aqui: é o registro de quais vagas já
-- foram postadas, usado para não repetir.
--
-- Nenhum código do CRM lê esta tabela (grep vazio no repositório), mas ela
-- recebe escrita de fora até 19/09/2026 -- e como não dá para provar qual chave
-- a automação usa, as políticas mantêm SELECT e INSERT abertos para anon. O que
-- fecha é o que destrói: UPDATE e DELETE ficam sem política nenhuma.
alter table public.vagas_postadas enable row level security;

create policy "vagas_postadas_select" on public.vagas_postadas for select using (true);
create policy "vagas_postadas_insert" on public.vagas_postadas for insert with check (true);

-- TRUNCATE não passa por RLS, então precisa ser revogado no grant. UPDATE e
-- DELETE são revogados junto por cinto e suspensório: a política já os bloqueia.
revoke truncate, update, delete on public.vagas_postadas from anon, authenticated;
