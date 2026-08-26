-- Os comentários de crm_experience e previous_crm deixam de listar os valores.
--
-- A pergunta virou "Você já usa um CRM?" e as três respostas foram reescritas.
-- Os comentários das duas colunas citavam os rótulos antigos, e comentário que
-- descreve valor que não existe mais é pior que comentário nenhum: parece
-- documentação e manda para o lado errado.
--
-- Mesma solução já usada em monthly_leads e channels: o comentário aponta para
-- a constante no código, que é de onde os valores realmente saem, e guarda só o
-- que não muda -- o significado da coluna e a relação entre as duas.
--
-- Sem UPDATE de dados: as colunas estão vazias.

comment on column public.profiles.crm_experience is
  'Resposta a "Você já usa um CRM?" no cadastro. As opções estão em EXPERIENCIAS_COM_CRM, em src/pages/CompanyRegisterPage.tsx -- este comentário aponta para lá em vez de repeti-las, porque os rótulos ainda estão sendo calibrados e lista desatualizada aqui engana mais do que ajuda. Nula em perfis criados antes da pergunta existir.';

comment on column public.profiles.previous_crm is
  'Qual CRM a pessoa usa, perguntado só para quem escolheu a resposta afirmativa em crm_experience (a constante CRM_JA_USADO, em src/pages/CompanyRegisterPage.tsx). Campo livre e opcional -- nulo aqui é "não quis dizer" ou "a pergunta não se aplica", nunca falha.';
