-- Canais por onde os clientes falam com a empresa, perguntados no cadastro.
--
-- Resposta múltipla: "Por onde seus clientes falam com você hoje?". Quase
-- nenhuma empresa atende por um canal só, e forçar escolha única devolveria
-- uma foto errada da operação.
--
-- Serve para duas coisas. Primeiro, dizer se o ICP bate: o Rezult é um CRM
-- para quem vende conversando, e quem marca só "Site ou formulário" está num
-- problema diferente do que o produto resolve melhor. Segundo, e mais
-- imediato, decidir qual é o primeiro passo do onboarding -- quem marca
-- WhatsApp precisa conectar a linha no primeiro dia, que é o evento de
-- ativação do produto, e não cadastrar produto ou montar funil.
--
-- Fica em `companies` e não em `profiles` porque canal de atendimento é fato
-- da empresa: os cinco vendedores dela atendem pelos mesmos canais. Difere de
-- `profiles.goals`, que é o que aquela pessoa específica quer alcançar.
--
-- `text[]` pelo mesmo motivo de `goals`: array é o que o Postgres consulta
-- ('WhatsApp' = any(channels)), enquanto string concatenada exigiria LIKE.
--
-- Nula nas empresas anteriores, que se cadastraram antes da pergunta existir.

alter table public.companies
  add column if not exists channels text[];

comment on column public.companies.channels is
  'Canais por onde os clientes falam com a empresa, marcados no cadastro (múltipla escolha). As opções estão em CANAIS_DE_ATENDIMENTO, em src/pages/CompanyRegisterPage.tsx. Fato da empresa, não da pessoa -- ver profiles.goals para o que é individual. Nula em empresas criadas antes da pergunta existir.';
