-- Fix 1: is_member_of agora reconhece o owner da empresa como membro implícito
CREATE OR REPLACE FUNCTION public.is_member_of(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM companies
    WHERE id = p_company_id
      AND owner_id = auth.uid()
  )
$$;

-- Fix 2: ao remover membro, transfere owner_id dos recursos para o dono da empresa
CREATE OR REPLACE FUNCTION public.transfer_ownership_on_member_remove()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_company_owner_id
  FROM companies
  WHERE id = OLD.company_id;

  -- Não faz nada se o membro removido é o próprio dono
  IF OLD.user_id = v_company_owner_id THEN
    RETURN OLD;
  END IF;

  -- Transfere automações
  UPDATE automations
  SET owner_id = v_company_owner_id
  WHERE company_id = OLD.company_id
    AND owner_id = OLD.user_id;

  -- Transfere pipelines
  UPDATE pipelines
  SET owner_id = v_company_owner_id
  WHERE company_id = OLD.company_id
    AND owner_id = OLD.user_id;

  -- Transfere whatsapp_connections
  UPDATE whatsapp_connections
  SET owner_id = v_company_owner_id
  WHERE company_id = OLD.company_id
    AND owner_id = OLD.user_id;

  -- Transfere disparos
  UPDATE disparos
  SET owner_id = v_company_owner_id
  WHERE company_id = OLD.company_id
    AND owner_id = OLD.user_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_member_removed ON company_members;
CREATE TRIGGER on_member_removed
  BEFORE DELETE ON company_members
  FOR EACH ROW
  EXECUTE FUNCTION transfer_ownership_on_member_remove();
