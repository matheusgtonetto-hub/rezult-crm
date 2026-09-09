-- Acrescenta o último acesso de cada membro ao retorno de get_company_members.
--
-- ── Por que sai por aqui ──
--
-- O dado mora no schema `auth`, que o cliente NÃO alcança: a API não o expõe. A
-- função já é SECURITY DEFINER e já decide quem pode ver a lista, então a coluna
-- nova herda exatamente a mesma regra de acesso das outras.
--
-- ── Por que não é `last_sign_in_at` sozinho ──
--
-- `auth.users.last_sign_in_at` só se mexe quando a pessoa AUTENTICA de novo --
-- digita a senha, entra pelo OAuth. Uma sessão viva se renova sozinha por token
-- e nunca toca nesse campo, então quem usa o CRM todo dia sem deslogar aparecia
-- com o login de semanas atrás. Tecnicamente certo, e inútil para a pergunta que
-- a tela faz: "esta pessoa ainda usa o sistema?".
--
-- `auth.sessions.updated_at` responde isso: acompanha a renovação do token, ou
-- seja, o último momento em que aquele navegador esteve de fato ativo.
--
-- GREATEST entre os dois, e não só a sessão: ao deslogar (ou quando a sessão
-- expira) a linha de `auth.sessions` some, e sobraria nulo para quem entrou
-- ontem e saiu. O GREATEST do Postgres ignora nulos, então cada caso cai no
-- valor que existe:
--   sessão viva  -> a renovação, que é mais recente
--   deslogado    -> o último sign-in
--   nunca entrou -> nulo, e a tela escreve "Nunca acessou"
--
-- ── Detalhes ──
--
-- LEFT JOIN em auth.users porque um perfil pode existir sem linha lá (convite
-- aceito por outro caminho, seed, importação). Com INNER JOIN esse membro
-- sumiria da lista inteira em vez de aparecer sem data.
--
-- A assinatura ganhou uma coluna, então o DROP é obrigatório: o Postgres não
-- deixa o CREATE OR REPLACE mudar o tipo de retorno de uma função.

drop function if exists public.get_company_members(uuid);

create or replace function public.get_company_members(p_company_id uuid)
returns table(
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  permissions text[],
  is_owner boolean,
  last_active_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
  SELECT p.id, p.full_name, p.email, p.avatar_url,
         ARRAY['admin']::text[], true,
         GREATEST(u.last_sign_in_at, (SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = p.id))
  FROM profiles p
  JOIN companies c ON c.id = p_company_id AND c.owner_id = p.id
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE (c.owner_id = auth.uid() OR is_member_of(p_company_id))

  UNION ALL

  SELECT p.id, p.full_name, p.email, p.avatar_url,
         m.permissions, false,
         GREATEST(u.last_sign_in_at, (SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = p.id))
  FROM company_members m
  JOIN profiles p ON p.id = m.user_id
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE m.company_id = p_company_id
    AND (
      EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND owner_id = auth.uid())
      OR is_member_of(p_company_id)
    );
$function$;
