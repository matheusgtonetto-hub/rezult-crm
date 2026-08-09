-- A tela de Agentes só precisa saber SE existe chave de cada provedor, pra
-- liberar a ativação e avisar quando falta. Mas ai_provider_keys é
-- owner-only (owner_id = auth.uid()), então um MEMBRO da empresa lia zero
-- linhas e a tela dizia "cadastre sua chave" mesmo com a chave cadastrada,
-- sem nenhuma forma de resolver sozinho.
--
-- Abrir a tabela por is_member_of resolveria, mas expõe o api_key: a tela de
-- Configurações lê o valor da credencial. Então, em vez de afrouxar a RLS,
-- esta função devolve só os NOMES dos provedores. O segredo continua
-- visível apenas para o dono.
--
-- SECURITY DEFINER ignora RLS, por isso o is_member_of aqui dentro é
-- obrigatório: sem ele, qualquer usuário autenticado poderia sondar
-- qualquer empresa.
create or replace function public.company_ai_providers(p_company_id uuid)
returns table (provider text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct k.provider
  from public.ai_provider_keys k
  where k.company_id = p_company_id
    and k.active
    and public.is_member_of(p_company_id)
$function$;

revoke all on function public.company_ai_providers(uuid) from public;
grant execute on function public.company_ai_providers(uuid) to authenticated;
