-- Fase 3, parte 2: o ciclo de vida do atendimento.
--
-- Mensagem nova abre atendimento; se existir um finalizado há menos de 24h para
-- o mesmo contato, REABRE aquele em vez de abrir outro. Fora da janela, nasce um
-- novo.
--
-- 24h espelha a própria sessão do WhatsApp, que a Cloud API já impõe e que os
-- BSPs brasileiros herdam. Sem janela, o "obrigado" dez minutos depois de
-- finalizar viraria um atendimento novo com uma mensagem dentro, poluindo o
-- relatório e obrigando alguém a fechar de novo.
--
-- Vive em trigger de banco, e não nos webhooks, porque são CINCO produtores
-- (dapi, zapi, cloud-api, meta e o automation-runner) e o plano marca a
-- concorrência entre eles como risco alto. Um ponto só, com trava no banco.
--
-- ── Um bug que só apareceu no teste ─────────────────────────────────────────
-- A primeira versão reabria o atendimento e deixava
-- whatsapp_conversations.finished em true. Duas consequências, as duas ruins:
--   1. a conversa aparecia como finalizada na tela enquanto o atendimento
--      estava aberto;
--   2. o "finalizar" seguinte não disparava nada, porque o gatilho da conversa
--      só age na transição false->true e o campo já estava em true. O
--      atendimento ficava impossível de fechar de novo.
-- Por isso o bloco final: atendimento aberto e conversa finalizada não podem
-- coexistir. A escrita dispara trg_atendimento_segue_a_conversa pelo ramo
-- true->false, que procura um finalizado dentro da janela; como o atendimento já
-- está aberto, aquele update não encontra nada e a recursão morre em um nível.
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
  v_reaberto boolean := false;
begin
  if NEW.company_id is null or NEW.conversation_id is null then
    return NEW;
  end if;

  select * into v_conv from public.whatsapp_conversations where id = NEW.conversation_id;
  if not found then
    return NEW;
  end if;

  -- Mesma chave do índice único: contato quando existe, conversa como reserva.
  v_chave := coalesce(v_conv.contact_id, v_conv.id);
  v_canal := coalesce(v_conv.channel, 'whatsapp');

  -- Serializa por chave. Duas mensagens chegando juntas por webhooks diferentes
  -- passariam as duas pelo "não existe aberto" e tentariam inserir; o índice
  -- pegaria a segunda com erro. Com o lock, a segunda espera e enxerga o
  -- atendimento que a primeira criou.
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
         set status      = case when NEW.from_me then 'em_atendimento' else 'aguardando' end,
             fechado_em  = null,
             fechado_por = null
       where id = v_id;
      v_reaberto := true;
    end if;
  end if;

  -- Nem aberto nem reabrível: nasce um novo. O número vem do trigger próprio.
  if v_id is null then
    insert into public.atendimentos
      (company_id, owner_id, conversation_id, contact_id, canal, status, aberto_em,
       responsavel, department_id, primeira_resposta_em)
    values
      (NEW.company_id, v_conv.owner_id, v_conv.id, v_conv.contact_id, v_canal,
       case when NEW.from_me then 'em_atendimento' else 'aguardando' end,
       NEW.created_at,
       nullif(v_conv.assigned_to, ''), v_conv.department_id,
       case when NEW.from_me then NEW.created_at else null end)
    returning id into v_id;
    v_reaberto := true;  -- nasceu aberto: a conversa também não pode ficar finalizada
  else
    -- Mensagem de SAÍDA promove para em_atendimento e carimba a primeira
    -- resposta, se ainda não tem.
    if NEW.from_me then
      update public.atendimentos
         set status = case when status = 'aguardando' then 'em_atendimento' else status end,
             primeira_resposta_em = coalesce(primeira_resposta_em, NEW.created_at)
       where id = v_id;
    end if;
  end if;

  -- Atendimento aberto e conversa marcada como finalizada não podem coexistir.
  if v_conv.finished is true then
    update public.whatsapp_conversations set finished = false where id = v_conv.id;
  end if;

  return NEW;
exception when others then
  -- Nunca derrubar a gravação da mensagem por causa do atendimento. Mensagem
  -- perdida é dano permanente; atendimento não criado é recuperável.
  raise warning 'atendimento_do_evento falhou: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_atendimento_do_evento on public.whatsapp_messages;
create trigger trg_atendimento_do_evento
  after insert on public.whatsapp_messages
  for each row execute function public.atendimento_do_evento();
