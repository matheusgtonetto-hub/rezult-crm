-- Mensagem passa a carregar o atendimento a que pertence.
--
-- Era o risco "O realtime escuta por telefone" do plano: "enquanto a mensagem
-- não carregar o id do atendimento, mensagem nova pode cair no atendimento
-- errado quando existir mais de um para o mesmo contato". Já há 3 contatos com
-- mais de um atendimento, então deixou de ser hipótese.
--
-- Também é o que permite a divisória dentro da thread e a métrica "em que ponto
-- da conversa escalou para humano", as duas pedidas no plano.
alter table public.whatsapp_messages
  add column if not exists atendimento_id uuid references public.atendimentos(id) on delete set null;

comment on column public.whatsapp_messages.atendimento_id is
  'Episodio a que a mensagem pertence. Null nas anteriores a 15/08/2026 que nao caem em nenhuma janela de atendimento.';

create index if not exists idx_msgs_por_atendimento
  on public.whatsapp_messages (atendimento_id) where atendimento_id is not null;

-- Backfill pela janela de cada atendimento (de aberto_em até fechado_em, ou até
-- agora se aberto). Quem não cai em janela nenhuma fica null: fatiar por tempo
-- seria o "chute retroativo" que o plano marca como risco alto.
update public.whatsapp_messages m
   set atendimento_id = a.id
  from public.atendimentos a
 where m.atendimento_id is null
   and m.conversation_id = a.conversation_id
   and m.created_at >= a.aberto_em
   and (a.fechado_em is null or m.created_at <= a.fechado_em);
