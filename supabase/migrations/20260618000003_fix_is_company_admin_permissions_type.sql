-- Corrige is_company_admin após conversão de permissions jsonb → text[].
-- O operador ? (jsonb contains key) foi substituído por = ANY() para text[].

CREATE OR REPLACE FUNCTION public.is_company_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM companies c
    WHERE c.id = p_company_id AND c.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM company_members m
    WHERE m.company_id = p_company_id
      AND m.user_id = auth.uid()
      AND 'admin' = ANY(m.permissions)
  );
$$;
