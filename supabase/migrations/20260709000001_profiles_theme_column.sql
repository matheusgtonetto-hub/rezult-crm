-- Adiciona a coluna `theme` em profiles (light | dark).
-- A coluna estava documentada no CLAUDE.md mas nunca havia sido criada por migration,
-- então `update profiles set theme=...` falhava silenciosamente e o tema não persistia
-- entre recarregamentos. As policies de UPDATE em profiles já existem
-- ("profiles: editar próprio" / "profiles: owner update").

alter table public.profiles
  add column if not exists theme text;
