-- Cargo e experiência com CRM, perguntados na etapa "Sobre você" do cadastro.
--
-- Duas colunas em `profiles` porque as duas respostas são da PESSOA, não da
-- empresa: numa empresa com cinco pessoas, cada uma tem seu cargo e sua
-- bagagem, e guardar isso em `companies` obrigaria a escolher qual das cinco
-- respostas vale.
--
-- `job_title` é o cargo declarado, e NÃO tem relação com `profiles.role`, que é
-- permissão dentro do sistema e hoje vale 'admin' em todas as linhas. Um é o
-- que a pessoa faz na empresa dela, o outro é o que ela pode fazer no CRM.
-- Misturar os dois seria dar acesso de administrador a quem respondeu
-- "Proprietário" e tirar de quem respondeu "Funcionário", que não é o que
-- nenhuma das duas perguntas quer dizer.
--
-- `crm_experience` responde "Você já usou um CRM antes?". Serve para saber com
-- quem estamos falando na primeira sessão: quem vem de planilha precisa de uma
-- introdução diferente de quem está trocando de CRM.
--
-- As duas são texto livre com valores vindos da tela, e nulas por padrão. Ficam
-- nulas nos perfis que já existem, que se cadastraram antes das perguntas
-- existirem -- nulo aqui é "não perguntamos", não "não respondeu".

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists crm_experience text;

comment on column public.profiles.job_title is
  'Cargo declarado no cadastro: Proprietário, Gerente, Funcionário, Estudante, freelancer ou estagiário. Não confundir com profiles.role, que é permissão no sistema.';

comment on column public.profiles.crm_experience is
  'Resposta a "Você já usou um CRM antes?" no cadastro: Não, nunca usei CRM / Uso planilhas / Sim, já usei um CRM.';
