-- Aba Performance: 2 métricas novas -- "número de conversas" e "taxa de
-- sucesso". Hoje agent_usage_log tem 1 linha por invocação do loop de IA,
-- mas nada liga essa linha a uma conversa específica -- o único contador
-- existente (whatsapp_conversations.ai_interaction_count) é zerado sempre
-- que a conversa é finalizada/qualificada, então não serve como histórico
-- por período. lead_id resolve isso (1 lead = 1 conversa de WhatsApp, mesmo
-- agrupamento já usado pro resto da aba Performance).
--
-- "success" = a invocação completou sem erro: a chamada à API do modelo não
-- falhou (senão actions vem null -- ver agent-sds-qualify/index.ts) E
-- nenhuma tool chamada nesse turno devolveu { ok: false } (ex: enviar_mensagem
-- sem conexão de WhatsApp ativa). "Taxa de sucesso" = % de conversas cujas
-- linhas no período são todas success=true.
alter table agent_usage_log
  add column if not exists lead_id uuid references leads(id) on delete set null,
  add column if not exists success boolean not null default true;

create index if not exists agent_usage_log_lead_idx
  on agent_usage_log (lead_id);
