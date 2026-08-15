-- "Iniciar atendimento" passa a ser ato HUMANO.
--
-- Decisão de produto: `aguardando` significa "esperando uma PESSOA", não
-- "ninguém falou". O robô respondendo não tira a conversa da fila humana -- o
-- chip "Agente" já mostra quais estão com ele. É o que casa com o botão
-- "Iniciar atendimento" que a tela passou a mostrar.
--
-- Consequência: precisamos de DOIS carimbos, porque medem coisas diferentes e
-- colapsar os dois perderia informação que a Fase 4 vai querer:
--
--   primeira_resposta_em        -> qualquer resposta (o cliente ouviu de volta)
--   primeira_resposta_humana_em -> resposta de gente (o time pegou)
--
-- A diferença entre os dois É a métrica "quanto o agente cobriu sozinho", que o
-- plano cita como o número que o concorrente não tem.
--
-- Sem o segundo carimbo o status ficaria incoerente: atendimento em
-- `aguardando` com primeira_resposta_em preenchida, que foi exatamente a
-- incoerência corrigida na revisão da Fase 2.
alter table public.atendimentos
  add column if not exists primeira_resposta_humana_em timestamptz;

comment on column public.atendimentos.primeira_resposta_em is
  'Primeira resposta de QUALQUER origem (humano ou agente de IA). Mede quanto o cliente esperou para ouvir de volta.';
comment on column public.atendimentos.primeira_resposta_humana_em is
  'Primeira resposta de uma PESSOA. Mede quanto o contato esperou pelo time. A diferenca entre os dois carimbos e o que o agente cobriu sozinho.';

with entrada as (
  select conversation_id, min(created_at) as t_lead
  from public.whatsapp_messages where conversation_id is not null and not from_me group by 1
),
humana as (
  select m.conversation_id, min(m.created_at) as t
  from public.whatsapp_messages m
  join entrada e on e.conversation_id = m.conversation_id
  where m.from_me and not coalesce(m.sent_by_agent, false) and m.created_at > e.t_lead
  group by 1
)
update public.atendimentos a
   set primeira_resposta_humana_em = h.t
  from humana h
 where h.conversation_id = a.conversation_id;

-- Realinha o histórico: quem só teve resposta do robô volta para a fila humana.
-- Não mexe em finalizados nem em quem tem responsável (alguém assumiu de fato).
update public.atendimentos
   set status = 'aguardando'
 where status = 'em_atendimento'
   and responsavel is null
   and primeira_resposta_humana_em is null;

-- ── O gatilho passa a promover só com resposta humana ───────────────────────
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

  perform pg_advisory_xact_lock(hashtext('atend:' || NEW.company_id::text || ':' || v_chave::text || ':' || v_canal));

  select id into v_id
    from public.atendimentos
   where company_id = NEW.company_id
     and coalesce(contact_id, conversation_id) = v_chave
     and canal = v_canal
     and status <> 'finalizado'
   limit 1;

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
             primeira_resposta_em        = coalesce(primeira_resposta_em, case when NEW.from_me then NEW.created_at end),
             primeira_resposta_humana_em = coalesce(primeira_resposta_humana_em, case when v_humano then NEW.created_at end)
       where id = v_id;
    end if;
  end if;

  if v_id is null then
    insert into public.atendimentos
      (company_id, owner_id, conversation_id, contact_id, canal, status, aberto_em,
       responsavel, department_id, primeira_resposta_em, primeira_resposta_humana_em)
    values
      (NEW.company_id, v_conv.owner_id, v_conv.id, v_conv.contact_id, v_canal,
       case when v_humano then 'em_atendimento' else 'aguardando' end,
       NEW.created_at,
       nullif(v_conv.assigned_to, ''), v_conv.department_id,
       case when NEW.from_me then NEW.created_at end,
       case when v_humano   then NEW.created_at end)
    returning id into v_id;
  else
    if NEW.from_me then
      update public.atendimentos
         set status = case when v_humano and status = 'aguardando' then 'em_atendimento' else status end,
             primeira_resposta_em        = coalesce(primeira_resposta_em, NEW.created_at),
             primeira_resposta_humana_em = coalesce(primeira_resposta_humana_em, case when v_humano then NEW.created_at end)
       where id = v_id;
    end if;
  end if;

  -- Atendimento aberto e conversa marcada como finalizada não podem coexistir.
  if v_conv.finished is true then
    update public.whatsapp_conversations set finished = false where id = v_conv.id;
  end if;

  return NEW;
exception when others then
  raise warning 'atendimento_do_evento falhou: %', sqlerrm;
  return NEW;
end;
$$;
