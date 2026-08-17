-- O atendimento passa a carregar o ID do atendente, não só o nome.
--
-- Complemento de 20260817140000: lá o vínculo por id entrou em leads, tasks e
-- conversas. Sem esta parte os atendimentos ficariam de fora, e o painel
-- "Por atendente" do Dashboard voltaria a partir a mesma pessoa em duas linhas
-- assim que ela trocasse o nome -- que é justamente o bug sendo corrigido.
--
-- O id do atendimento vem da conversa (`assigned_to_user_id`), porque é a
-- conversa que carrega a atribuição feita na tela.

-- Histórico: quem já tem conversa com id herda agora.
update public.atendimentos a
   set responsavel_user_id = w.assigned_to_user_id
  from public.whatsapp_conversations w
 where w.id = a.conversation_id
   and a.responsavel_user_id is null
   and w.assigned_to_user_id is not null;

-- ── O gatilho da conversa passa a levar o id junto do nome ──────────────────
create or replace function public.atendimento_segue_a_conversa()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_chave uuid;
  v_canal text;
begin
  if NEW.company_id is null then
    return NEW;
  end if;

  v_chave := coalesce(NEW.contact_id, NEW.id);
  v_canal := coalesce(NEW.channel, 'whatsapp');

  if NEW.finished is true and coalesce(OLD.finished, false) is false then
    update public.atendimentos
       set status      = 'finalizado',
           fechado_em  = now(),
           fechado_por = coalesce(nullif(NEW.assigned_to, ''), fechado_por)
     where company_id = NEW.company_id
       and coalesce(contact_id, conversation_id) = v_chave
       and canal = v_canal
       and status <> 'finalizado';

  elsif NEW.finished is false and coalesce(OLD.finished, false) is true then
    if not exists (
      select 1 from public.atendimentos
       where company_id = NEW.company_id
         and coalesce(contact_id, conversation_id) = v_chave
         and canal = v_canal
         and status <> 'finalizado'
    ) then
      update public.atendimentos
         set status      = 'em_atendimento',
             fechado_em  = null,
             fechado_por = null
       where id = (
         select id from public.atendimentos
          where company_id = NEW.company_id
            and coalesce(contact_id, conversation_id) = v_chave
            and canal = v_canal
            and status = 'finalizado'
            and fechado_em is not null
            and fechado_em > now() - interval '24 hours'
          order by fechado_em desc limit 1);
    end if;
  end if;

  -- Responsável (nome E id) e departamento acompanham o atendimento aberto.
  -- O id entrou junto com o nome: é ele que sobrevive a uma troca de nome no
  -- perfil, e sem ele o atendimento ficaria com o nome antigo para sempre.
  if NEW.assigned_to is distinct from OLD.assigned_to
     or NEW.assigned_to_user_id is distinct from OLD.assigned_to_user_id
     or NEW.department_id is distinct from OLD.department_id then
    update public.atendimentos
       set responsavel         = nullif(NEW.assigned_to, ''),
           responsavel_user_id = NEW.assigned_to_user_id,
           department_id       = NEW.department_id
     where company_id = NEW.company_id
       and coalesce(contact_id, conversation_id) = v_chave
       and canal = v_canal
       and status <> 'finalizado';
  end if;

  return NEW;
exception when others then
  raise warning 'atendimento_segue_a_conversa falhou: %', sqlerrm;
  return NEW;
end;
$$;

-- ── O atendimento nasce ja com o id do atendente ────────────────────────────
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
       responsavel, responsavel_user_id, department_id, primeira_entrada_em)
    values
      (NEW.company_id, v_conv.owner_id, v_conv.id, v_conv.contact_id, v_canal,
       case when v_humano then 'em_atendimento' else 'aguardando' end,
       NEW.created_at,
       nullif(v_conv.assigned_to, ''), v_conv.assigned_to_user_id, v_conv.department_id,
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
