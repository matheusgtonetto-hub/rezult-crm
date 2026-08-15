-- "Tempo até a primeira resposta" passa a contar da mensagem do CONTATO.
--
-- O defeito: numa conversa que NÓS iniciamos (prospecção), o atendimento
-- nascia com aberto_em e primeira_resposta_em no mesmo instante -- tempo de
-- resposta ZERO, sendo que não houve resposta, houve iniciativa.
--
-- Pior, havia incoerência entre histórico e futuro: os 99 atendimentos que
-- começaram com mensagem nossa tinham primeira_resposta_em NULA (o backfill da
-- Fase 2 exigia uma entrada antes), enquanto toda prospecção nova gravaria
-- zero. A mediana ia despencar sozinha, e o painel elogiaria o time por
-- atender mais rápido quando só tinha havido mais prospecção.
--
-- A causa raiz é conceitual: "tempo até a primeira resposta" mede quanto o
-- CONTATO esperou. A base da conta não é sempre a abertura -- é a primeira
-- mensagem dele que ficou sem resposta. Quando ele inicia, as duas coincidem.
-- Quando nós iniciamos, medir da abertura contaria como demora nossa o tempo
-- que ELE levou para responder. Num teste real: 130 min pela conta antiga
-- contra 10 min reais.
--
-- Efeito na base: a mediana saiu de 247 para 157 minutos.
--
-- Esta migration traz também a versão FINAL de atendimento_do_evento, que
-- acumula o carimbo de atendimento_id na mensagem e o incremento de
-- reaberturas das migrations anteriores.
alter table public.atendimentos
  add column if not exists primeira_entrada_em timestamptz;

comment on column public.atendimentos.primeira_entrada_em is
  'Primeira mensagem DO CONTATO neste atendimento. E a base do tempo de resposta. Nula em atendimento que nos iniciamos e o contato nunca respondeu.';

-- Backfill pela coluna atendimento_id, que passou a existir, em vez de
-- adivinhar por tempo.
update public.atendimentos a
   set primeira_entrada_em = e.t
  from (
    select atendimento_id, min(created_at) as t
    from public.whatsapp_messages
    where atendimento_id is not null and not from_me
    group by 1
  ) e
 where e.atendimento_id = a.id;

-- Coerência: resposta sem entrada não existe. Se sobrou algum carimbo de
-- resposta em atendimento sem entrada, ele veio da iniciativa, não de resposta.
update public.atendimentos
   set primeira_resposta_em = null, primeira_resposta_humana_em = null
 where primeira_entrada_em is null
   and (primeira_resposta_em is not null or primeira_resposta_humana_em is not null);

create or replace function public.atendimento_do_evento()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_conv    public.whatsapp_conversations%rowtype;
  v_chave   uuid;
  v_canal   text;
  v_id      uuid;
  v_humano  boolean;
  v_entrada timestamptz;
begin
  if NEW.company_id is null or NEW.conversation_id is null then
    return NEW;
  end if;

  select * into v_conv from public.whatsapp_conversations where id = NEW.conversation_id;
  if not found then
    return NEW;
  end if;

  v_chave := coalesce(v_conv.contact_id, v_conv.id);
  v_canal := coalesce(v_conv.channel, 'whatsapp');
  -- Resposta de gente, não do agente de IA. É ela que tira o atendimento da
  -- fila humana: `aguardando` significa "esperando uma PESSOA".
  v_humano := NEW.from_me and not coalesce(NEW.sent_by_agent, false);

  -- Serializa por chave: duas mensagens chegando juntas por webhooks diferentes
  -- passariam as duas pelo "não existe aberto" e tentariam inserir.
  perform pg_advisory_xact_lock(hashtext('atend:' || NEW.company_id::text || ':' || v_chave::text || ':' || v_canal));

  select id into v_id
    from public.atendimentos
   where company_id = NEW.company_id
     and coalesce(contact_id, conversation_id) = v_chave
     and canal = v_canal
     and status <> 'finalizado'
   limit 1;

  -- Janela de reabertura: finalizado há menos de 24h volta a viver.
  if v_id is null then
    select id into v_id
      from public.atendimentos
     where company_id = NEW.company_id
       and coalesce(contact_id, conversation_id) = v_chave
       and canal = v_canal
       and status = 'finalizado'
       and fechado_em is not null
       and fechado_em > now() - interval '24 hours'
     order by fechado_em desc
     limit 1;

    if v_id is not null then
      update public.atendimentos
         set status      = case when v_humano then 'em_atendimento' else 'aguardando' end,
             fechado_em  = null,
             fechado_por = null,
             reaberturas = reaberturas + 1,
             primeira_entrada_em = coalesce(primeira_entrada_em, case when not NEW.from_me then NEW.created_at end)
       where id = v_id;
    end if;
  end if;

  if v_id is null then
    -- Nasce agora, com os dois carimbos de resposta nulos: numa conversa que
    -- nós iniciamos não há o que responder, e numa que o contato iniciou a
    -- resposta ainda não veio.
    insert into public.atendimentos
      (company_id, owner_id, conversation_id, contact_id, canal, status, aberto_em,
       responsavel, department_id, primeira_entrada_em)
    values
      (NEW.company_id, v_conv.owner_id, v_conv.id, v_conv.contact_id, v_canal,
       case when v_humano then 'em_atendimento' else 'aguardando' end,
       NEW.created_at,
       nullif(v_conv.assigned_to, ''), v_conv.department_id,
       case when not NEW.from_me then NEW.created_at end)
    returning id into v_id;
  else
    if NEW.from_me then
      -- Resposta só conta se havia mensagem do contato esperando. Sem isso, a
      -- prospecção gravaria "respondeu em 0 segundos".
      select primeira_entrada_em into v_entrada from public.atendimentos where id = v_id;
      update public.atendimentos
         set status = case when v_humano and status = 'aguardando' then 'em_atendimento' else status end,
             primeira_resposta_em        = case when v_entrada is not null
                                            then coalesce(primeira_resposta_em, NEW.created_at) end,
             primeira_resposta_humana_em = case when v_entrada is not null and v_humano
                                            then coalesce(primeira_resposta_humana_em, NEW.created_at)
                                            else primeira_resposta_humana_em end
       where id = v_id;
    else
      update public.atendimentos
         set primeira_entrada_em = coalesce(primeira_entrada_em, NEW.created_at)
       where id = v_id;
    end if;
  end if;

  -- Carimba a mensagem com o atendimento resolvido acima. É UPDATE porque o
  -- gatilho é AFTER: o atendimento pode ter nascido nesta mesma execução.
  if v_id is not null then
    update public.whatsapp_messages set atendimento_id = v_id where id = NEW.id;
  end if;

  -- Atendimento aberto e conversa marcada como finalizada não podem coexistir.
  if v_conv.finished is true then
    update public.whatsapp_conversations set finished = false where id = v_conv.id;
  end if;

  return NEW;
exception when others then
  -- Nunca derrubar a gravação da mensagem por causa do atendimento.
  raise warning 'atendimento_do_evento falhou: %', sqlerrm;
  return NEW;
end;
$$;
