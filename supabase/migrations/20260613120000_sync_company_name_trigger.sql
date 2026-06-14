-- Trigger: sincroniza profiles.company_name quando companies.name é alterado

CREATE OR REPLACE FUNCTION sync_company_name_to_profiles()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name <> OLD.name THEN
    UPDATE profiles
    SET company_name = NEW.name
    WHERE company_name = OLD.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_company_name ON companies;

CREATE TRIGGER trg_sync_company_name
AFTER UPDATE OF name ON companies
FOR EACH ROW EXECUTE FUNCTION sync_company_name_to_profiles();
