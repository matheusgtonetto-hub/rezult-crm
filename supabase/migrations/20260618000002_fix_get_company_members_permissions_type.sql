-- Corrige get_company_members após conversão de permissions jsonb → text[].
-- A função anterior fazia UNION entre '["admin"]'::jsonb e m.permissions text[],
-- causando erro de tipo. Recria com permissions text[] consistente.

DROP FUNCTION IF EXISTS get_company_members(uuid);

CREATE OR REPLACE FUNCTION get_company_members(p_company_id uuid)
RETURNS TABLE(
  id          uuid,
  full_name   text,
  email       text,
  avatar_url  text,
  permissions text[],
  is_owner    boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.email, p.avatar_url,
         ARRAY['admin']::text[], true
  FROM profiles p
  JOIN companies c ON c.id = p_company_id AND c.owner_id = p.id
  WHERE (c.owner_id = auth.uid() OR is_member_of(p_company_id))

  UNION ALL

  SELECT p.id, p.full_name, p.email, p.avatar_url,
         m.permissions, false
  FROM company_members m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.company_id = p_company_id
    AND (
      EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND owner_id = auth.uid())
      OR is_member_of(p_company_id)
    );
$$;
