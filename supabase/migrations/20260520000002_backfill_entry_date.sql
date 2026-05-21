-- Preenche entry_date com a data de criação para leads que não têm data de entrada
UPDATE leads
SET entry_date = created_at::date
WHERE entry_date IS NULL;
