-- Rede de segurança para o vínculo mensagem → conversa.
--
-- Depois da Fase 1, os sete caminhos que gravam mensagem resolvem a conversa
-- antes e preenchem conversation_id. Mas todos eles chamam
-- upsertConversationForMessage dentro de try/catch, e ela devolve null quando o
-- banco erra. Nesse caso a mensagem é gravada sem vínculo de propósito, porque
-- perder a mensagem seria pior que perder o agrupamento.
--
-- O problema é o que acontece DEPOIS. Para mensagem recebida existe conserto: a
-- reconciliação do Multiatendimento cria a conversa e vincula. Para mensagem
-- ENVIADA não existe, porque a reconciliação só olha recebidas -- e desde que a
-- tela passou a ler por conversation_id, uma mensagem enviada sem vínculo
-- simplesmente não aparece no histórico. Silenciosamente.
--
-- Este gatilho torna o invariante estrutural em vez de depender de cada
-- chamador lembrar. Vale inclusive para código que ainda não existe.

create or replace function public.vincular_mensagem_a_conversa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Quem já sabe a que conversa pertence passa direto. Este é o caminho normal
  -- depois da Fase 1, então o custo do gatilho é praticamente zero: o SELECT
  -- abaixo quase nunca roda.
  if new.conversation_id is not null then
    return new;
  end if;

  -- Mesma guarda de telefonesIguais() no TypeScript: abaixo de 10 dígitos não
  -- dá para afirmar de quem é o número, e um palpite aqui juntaria conversas de
  -- clientes diferentes.
  if length(public.nucleo_telefone(new.phone)) < 10 then
    return new;
  end if;

  -- SECURITY INVOKER de propósito (o padrão). Quando quem insere é o navegador,
  -- este SELECT passa pela RLS de whatsapp_conversations, que exige
  -- is_member_of(company_id) -- ou seja, o isolamento entre empresas é garantido
  -- pelo banco, não por uma condição que eu poderia esquecer de escrever.
  -- Quando quem insere é uma edge function (service_role), a RLS não se aplica,
  -- que é o comportamento correto ali.
  select c.id into new.conversation_id
  from public.whatsapp_conversations c
  where c.owner_id = new.owner_id
    and c.instance_id is not distinct from new.instance_id
    and public.nucleo_telefone(c.phone) = public.nucleo_telefone(new.phone)
    and (new.company_id is null or c.company_id is null or c.company_id = new.company_id)
  order by c.last_msg_at desc nulls last
  limit 1;

  -- Continua podendo sair nulo, e tudo bem: significa que a conversa não existe.
  -- O gatilho vincula ao que existe, nunca inventa conversa -- criar uma aqui
  -- fabricaria dado a partir de um caminho que já falhou uma vez.
  return new;
end;
$$;

comment on function public.vincular_mensagem_a_conversa() is
  'Rede de segurança: preenche whatsapp_messages.conversation_id quando o chamador não preencheu. Não cria conversa, só vincula à existente.';

drop trigger if exists trg_vincular_mensagem_a_conversa on public.whatsapp_messages;
create trigger trg_vincular_mensagem_a_conversa
  before insert on public.whatsapp_messages
  for each row
  execute function public.vincular_mensagem_a_conversa();

-- Índice funcional para a busca do gatilho.
--
-- Só é possível porque nucleo_telefone é IMMUTABLE e tem search_path travado.
-- Sem o search_path fixo o Postgres recusaria criar este índice (ou pior:
-- aceitaria e corromperia quando a resolução de nomes mudasse). O aviso do
-- linter que corrigi na revisão anterior era exatamente sobre isso.
create index if not exists idx_conversas_owner_nucleo
  on public.whatsapp_conversations (owner_id, public.nucleo_telefone(phone));
