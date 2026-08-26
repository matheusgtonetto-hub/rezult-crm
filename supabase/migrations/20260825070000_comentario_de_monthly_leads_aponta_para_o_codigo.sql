-- O comentário de `monthly_leads` deixa de listar as faixas.
--
-- As faixas mudaram duas vezes em poucos minutos e vão mudar de novo enquanto
-- a pergunta é calibrada. Repetir a lista aqui garante que este comentário
-- fique errado -- e comentário errado é pior que comentário nenhum, porque
-- parece documentação e manda para o lado contrário.
--
-- A lista mora em FAIXAS_DE_LEADS, em src/pages/CompanyRegisterPage.tsx, que é
-- de onde os valores realmente saem. O comentário guarda o que NÃO muda: o que
-- a coluna significa e com o que ela não deve ser confundida.
--
-- Sem UPDATE de dados: a coluna está vazia.

comment on column public.companies.monthly_leads is
  'Leads novos por mês, respondido no cadastro. As faixas estão em FAIXAS_DE_LEADS, em src/pages/CompanyRegisterPage.tsx, e ainda estão sendo calibradas -- este comentário aponta para lá em vez de repeti-las, porque lista desatualizada aqui engana mais do que ajuda. Mede o tamanho da dor, não o da empresa (ver company_size). Nula em empresas criadas antes da pergunta existir.';
