-- `revoke ... from anon` não bastava.
--
-- A ACL da função era:
--
--   =X/postgres | postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
--   ^ este primeiro item, sem nome antes do "=", é o PUBLIC
--
-- PUBLIC tinha EXECUTE, e anon é membro de PUBLIC. Tirar do anon não muda nada
-- enquanto o PUBLIC concede. Confirmado na prática: um POST em
-- /rest/v1/rpc/buscar_leads_do_funil com a chave anon respondia HTTP 200. Não
-- vazava dado, porque a RLS de `leads` barrava as linhas e a resposta vinha
-- vazia, mas a função executava para quem não estava autenticado.
--
-- Depois de revogar do PUBLIC, a mesma chamada responde HTTP 401 com
-- "permission denied for function".
--
-- O grant explícito ao `authenticated` fica: revogar do PUBLIC atinge todo
-- papel sem concessão própria, e sem ele o app logado perderia o acesso junto.
--
-- Vale como regra para as próximas funções deste projeto: no Supabase, revogar
-- de `anon` é quase sempre inútil sozinho. O que fecha a porta é revogar de
-- PUBLIC e conceder de volta a quem precisa.

revoke execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) from public;
revoke execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) from anon;
grant  execute on function public.buscar_leads_do_funil(uuid, uuid, uuid, jsonb, text, text, int, int, boolean) to authenticated;
