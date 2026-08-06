-- Novo fluxo de criação de agente: nome + descrição (organizacional, não afeta
-- a IA) + ícone ilustrativo. O tipo deixa de ser escolhido na criação e passa
-- a viver na aba "Tipos" dentro do agente já criado.
alter table agents add column if not exists description text;
alter table agents add column if not exists avatar text;
