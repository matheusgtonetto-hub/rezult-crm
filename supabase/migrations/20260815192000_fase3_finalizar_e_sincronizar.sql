-- Fase 3, parte 3: finalizar no Multiatendimento fecha o atendimento.
--
-- A tela já escreve whatsapp_conversations.finished. Aqui isso vira o
-- fechamento do episódio, COM data, que a origem nunca guardou. Daqui para
-- frente fechado_em deixa de ser nulo e o tempo até fechar vira mensurável.
--
-- fechado_por usa o responsável da conversa no momento do fechamento. É uma
-- aproximação declarada: a tela não informa quem clicou, e o responsável é o
-- sinal mais próximo disponível. Quando a UI passar o autor de verdade, é só
-- preencher a coluna diretamente.
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

  -- Finalizou
  if NEW.finished is true and coalesce(OLD.finished, false) is false then
    update public.atendimentos
       set status      = 'finalizado',
           fechado_em  = now(),
           fechado_por = coalesce(nullif(NEW.assigned_to, ''), fechado_por)
     where company_id = NEW.company_id
       and coalesce(contact_id, conversation_id) = v_chave
       and canal = v_canal
       and status <> 'finalizado';

  -- Reabriu pela tela. Só volta o que fechou há menos de 24h, mesma janela do
  -- caminho de mensagem, E somente se o contato não tiver outro episódio
  -- aberto: a regra é um aberto por contato, e reabrir por cima criaria dois.
  --
  -- A condição explícita foi achada na revisão. Antes, o update tentava mesmo
  -- assim, o índice único barrava, e o `exception when others` engolia: a
  -- conversa reabria na tela e o atendimento ficava fechado, sem sinal nenhum.
  -- O resultado estava certo; chegar nele por exceção engolida é que não.
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

  -- Responsável e departamento acompanham o atendimento aberto.
  if NEW.assigned_to is distinct from OLD.assigned_to
     or NEW.department_id is distinct from OLD.department_id then
    update public.atendimentos
       set responsavel   = nullif(NEW.assigned_to, ''),
           department_id = NEW.department_id
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

drop trigger if exists trg_atendimento_segue_a_conversa on public.whatsapp_conversations;
create trigger trg_atendimento_segue_a_conversa
  after update on public.whatsapp_conversations
  for each row execute function public.atendimento_segue_a_conversa();
