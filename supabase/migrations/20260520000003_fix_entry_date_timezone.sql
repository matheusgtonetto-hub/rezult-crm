-- Corrige entry_date de leads criados após 21h BRT (cujo created_at::date em UTC ficou no dia seguinte)
-- Reaplica o backfill usando o fuso horário de São Paulo para todos os registros que estão com
-- entry_date diferente da data local correta.
UPDATE leads
SET entry_date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
WHERE entry_date != (created_at AT TIME ZONE 'America/Sao_Paulo')::date;
