-- Atalho da mensagem rápida deixa de ser opcional e passa a exigir a barra.
--
-- ─── Por que o banco, e não só a tela ───────────────────────────────────────
--
-- O campo de mensagem do Multiatendimento só abre a lista de atalhos quando o
-- texto COMEÇA com "/". Um atalho gravado sem a barra nunca é chamado: ele
-- existe na tabela e não existe na conversa. E um atalho vazio deixa a
-- mensagem acessível só pelo ícone do raio, que é o caminho que ninguém usa no
-- meio de um atendimento.
--
-- Isso já aconteceu: o primeiro cliente a usar o recurso criou quarenta e sete
-- mensagens rápidas, duas delas sem atalho nenhum, e numa terceira digitou a
-- barra no campo Título por não achar onde ela ia. A tela agora obriga e
-- normaliza, mas a tela é uma das portas; a regra vale para qualquer escrita.
--
-- ─── O que entra no lugar do nulo ───────────────────────────────────────────
--
-- O título, normalizado do mesmo jeito que a tela normaliza: barra na frente,
-- espaços viram hífen. É o que a pessoa escreveria se o campo tivesse sido
-- pedido na hora, e no caso real acima o título de uma das linhas já ERA o
-- atalho que faltava.

update public.quick_messages
   set shortcut = '/' || regexp_replace(
                           btrim(regexp_replace(title, '^/+', '')),
                           '\s+', '-', 'g')
 where shortcut is null or btrim(shortcut) = '';

-- Rede de segurança para a linha cujo título era só barras ou só espaços: sem
-- isto o `set not null` abaixo derrubaria a migration inteira por causa dela.
update public.quick_messages
   set shortcut = '/mensagem-' || left(id::text, 8)
 where shortcut is null or btrim(shortcut) = '' or shortcut = '/';

-- Desempate de atalhos repetidos dentro da mesma empresa. Hoje não existe
-- nenhum (conferido antes de escrever esta migration), mas o preenchimento
-- acima parte do título, e dois títulos iguais gerariam dois atalhos iguais
-- justamente na hora de criar o índice único.
with repetidos as (
  select id,
         row_number() over (partition by owner_id, lower(shortcut) order by created_at) as n
    from public.quick_messages
)
update public.quick_messages q
   set shortcut = q.shortcut || '-' || r.n
  from repetidos r
 where r.id = q.id and r.n > 1;

alter table public.quick_messages alter column shortcut set not null;

-- A barra é o gatilho e o espaço é o que encerra a palavra digitada: "/bom
-- dia" só casaria até "/bom". As duas regras juntas são o que faz um atalho
-- ser chamável.
alter table public.quick_messages
  drop constraint if exists quick_messages_atalho_valido;
alter table public.quick_messages
  add constraint quick_messages_atalho_valido check (
    shortcut like '/%' and length(shortcut) > 1 and shortcut !~ '\s'
  );

-- Atalho repetido não quebra o envio (a lista mostra os dois), mas o Tab
-- escolhe um deles sem dizer qual, e a pessoa descobre pelo que o cliente
-- recebeu. Único por empresa, sem diferenciar maiúscula de minúscula, porque é
-- assim que a conversa compara.
create unique index if not exists quick_messages_atalho_unico_por_empresa
  on public.quick_messages (owner_id, lower(shortcut));

comment on column public.quick_messages.shortcut is
  'Obrigatorio. Comeca com / e nao tem espaco: e o texto digitado na conversa para chamar a mensagem. Unico por owner_id.';
