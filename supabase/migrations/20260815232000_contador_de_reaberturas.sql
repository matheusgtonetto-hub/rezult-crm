-- Contador de reaberturas.
--
-- O plano pede "taxa de reabertura" no dashboard, e ela não era computável:
-- reabrir limpava fechado_em e trocava o status, sem deixar rastro. Depois da
-- primeira reabertura o atendimento ficava indistinguível de um que nunca
-- fechou.
--
-- Taxa de reabertura alta costuma significar atendente fechando cedo demais,
-- que é exatamente o tipo de coisa que só aparece medindo.
--
-- São dois caminhos que reabrem: mensagem dentro da janela de 24h (tratado em
-- atendimento_do_evento, ver a migration seguinte) e o botão "Reabrir" da tela,
-- tratado aqui.
alter table public.atendimentos
  add column if not exists reaberturas integer not null default 0;

comment on column public.atendimentos.reaberturas is
  'Quantas vezes este atendimento voltou de finalizado. Zero nos historicos: antes de 15/08/2026 reabrir nao deixava rastro.';

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
             fechado_por = null,
             reaberturas = reaberturas + 1
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
