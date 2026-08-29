-- Automações padrão em toda empresa nova.
--
-- Mesmo raciocínio do funil padrão (`criar_funil_padrao`): quem acaba de criar
-- a conta abre /automacoes e encontra uma tela vazia, sem nenhuma pista de como
-- um fluxo se parece. Duas automações prontas dão o ponto de partida -- uma
-- entrada de leads por webhook e uma primeira mensagem -- e servem de exemplo
-- editável para as próximas.
--
-- ── Por que uma TABELA de modelos, e não JSON dentro da função ──
--
-- Os fluxos são JSON de vários KB. Enfiados dentro da função do gatilho, cada
-- ajuste de vírgula num modelo viraria uma migração nova reescrevendo o blob
-- inteiro, e a função ficaria ilegível. Numa tabela, o gatilho é curto, mudar um
-- modelo é um `update`, e um terceiro modelo é um `insert` -- sem tocar em
-- código.
--
-- Os modelos nascem INATIVOS de propósito. O fluxo de webhook mapeia campos de
-- um formulário que ainda não existe, e o de primeira mensagem dispara texto
-- para lead real. Ligar sozinho na conta nova seria agir em nome de alguém que
-- ainda não leu o que aquilo faz.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela de modelos
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.automation_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  description text        not null default '',
  group_name  text        not null default 'Automação',
  flow        jsonb       not null,
  -- Ordem de criação na empresa nova. Sem isto a ordem sairia do plano de
  -- execução do `select`, que não promete nada.
  position    int         not null default 0,
  -- Desligar um modelo sem apagá-lo: o histórico de por que ele existiu some
  -- junto com a linha, e às vezes só se quer parar de distribuí-lo.
  enabled     boolean     not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.automation_templates is
  'Modelos de automacao copiados para toda empresa nova pelo gatilho trg_criar_automacoes_padrao. Editar aqui muda o que as PROXIMAS contas recebem; nao mexe nas ja criadas.';

-- RLS ligada e sem política nenhuma: nenhum cliente lê ou escreve isto. Quem
-- precisa ler é o gatilho, que roda como `security definer` e por isso passa
-- por cima da RLS. Tabela global, sem `company_id`, não tem o que expor.
alter table public.automation_templates enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Os dois modelos
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Copiados da empresa 32131, onde foram desenhados e conferidos na tela. O JSON
-- vai entre delimitadores de cifrão (dollar quoting) para as aspas de dentro não
-- precisarem de escape: com aspas simples duplicadas, um erro de contagem no
-- meio de 7 KB seria invisível.

insert into public.automation_templates (name, description, group_name, position, flow)
values (
  'Novo lead via webhook',
  'Recebe leads de formulário via webhook (HTTP): analisa o telefone, evita duplicar o lead por e-mail/telefone, cria o lead e o negócio e mapeia os campos e UTMs. Ajuste o pipeline/etapa e os campos conforme o seu formulário.',
  'Lead',
  0,
  $fluxo${"nodes": [{"x": 30.803347280334666, "y": 290.0836820083682, "id": "n1", "type": "start", "label": "Início", "trigger": {"label": "Webhook (HTTP)", "triggerId": "http_webhook", "categoryId": "http", "configData": {}, "description": ""}, "parentIds": [], "errorParentIds": [], "timeoutParentIds": []}, {"x": 349.4979079497907, "y": 285.3682008368201, "id": "47f80bdc-6d2d-4cf6-9ebc-b58b8334f5fd", "type": "campos", "label": "Operações de campos", "fieldOps": [{"id": "fo1780949943823", "type": "analise_telefone", "phone": "{{gatilho.telefone}}", "datasourceName": "phone-1", "defaultCountry": "BR", "datasourceColor": "#6366F1"}], "parentIds": ["n1"], "errorParentIds": [], "timeoutParentIds": []}, {"x": 711.9297011780764, "y": -144.3515534585596, "id": "b91d0749-d26a-405e-bf33-3d7049ee0cfd", "type": "condicoes", "label": "Condições", "parentIds": ["47f80bdc-6d2d-4cf6-9ebc-b58b8334f5fd"], "conditionItems": [{"id": "74abf544-7d1b-41bc-a384-db4f1f50b456", "label": "Lead com email existente", "config": {"email": "{{gatilho.email}}"}, "categoryId": "leads", "conditionId": "com_email"}], "errorParentIds": [], "timeoutParentIds": []}, {"x": 706.5188284518828, "y": 141.47280334728032, "id": "270c139f-2ed7-4f0d-8484-fa02af092d0a", "type": "condicoes", "label": "Condições", "parentIds": [], "conditionItems": [{"id": "ci1780961144983", "label": "Lead com telefone existente", "config": {"telefone": "{{phone-1.phone}}"}, "categoryId": "leads", "conditionId": "com_telefone"}], "errorParentIds": ["b91d0749-d26a-405e-bf33-3d7049ee0cfd"], "timeoutParentIds": []}, {"x": 719.5397489539748, "y": 431.69456066945605, "id": "294778fb-c1a5-4e9c-9013-d8dd9410701a", "type": "campos", "label": "Operações de campos", "fieldOps": [{"id": "092221bd-9823-4b25-81e6-93087451a6dc", "type": "mapeamento", "value": "{{gatilho.nome}}", "fieldKey": "lead.name", "fieldLabel": "Nome do lead"}, {"id": "e56d1c67-a64e-4a03-9054-bdb7ed7ac3af", "type": "mapeamento", "value": "{{gatilho.email}}", "fieldKey": "lead.email", "fieldLabel": "E-mail"}, {"id": "828ee144-1fbf-433c-8fd9-29a414b9ec67", "type": "mapeamento", "value": "{{phone-1.phone}}", "fieldKey": "lead.whatsapp", "fieldLabel": "Telefone"}, {"id": "3d39a7fe-0209-40c5-bad7-1a9eb7546b72", "type": "mapeamento", "value": "{{gatilho.origem}}", "fieldKey": "lead.origin", "fieldLabel": "Origem"}], "parentIds": [], "errorParentIds": ["270c139f-2ed7-4f0d-8484-fa02af092d0a"], "timeoutParentIds": []}, {"x": 1131.581589958159, "y": 423.1924686192469, "id": "edcecf8b-a8c2-4340-c185-385389031851", "type": "acoes", "label": "Ação", "parentIds": ["294778fb-c1a5-4e9c-9013-d8dd9410701a"], "actionItems": [{"id": "ai1780949926048", "label": "Criar lead", "actionId": "criar_lead", "categoryId": "leads", "description": "Cria o lead com as informações guardadas nos parâmetros da sessão. Caso o lead já exista, não será criado um novo lead"}], "errorParentIds": [], "timeoutParentIds": []}, {"x": 2049.8326359832636, "y": 136.2928870292887, "id": "e07410f6-6f3b-4e1a-a102-6a7562c3e195", "type": "acoes", "label": "Ação", "parentIds": [], "actionItems": [{"id": "ai1780950024157", "label": "Criar negócio", "actionId": "criar_negocio", "categoryId": "negocios", "description": "Cria um novo negócio para o lead"}], "errorParentIds": ["0456935a-642d-426e-9af2-053ba03b9e6f"], "timeoutParentIds": []}, {"x": 2038.4853556485355, "y": -164.8326359832636, "id": "0456935a-642d-426e-9af2-053ba03b9e6f", "type": "condicoes", "label": "Condições", "parentIds": ["n1780960791155"], "conditionItems": [{"id": "4366358c-2f41-499c-8bdd-2272f3fa8394", "label": "Lead possui negócio no pipeline", "categoryId": "negocios", "conditionId": "neg_pipeline"}], "errorParentIds": [], "timeoutParentIds": []}, {"x": 1609.5062761506274, "y": -145.05439330543936, "id": "n1780960791155", "type": "campos", "label": "Operações de campos", "fieldOps": [{"id": "092221bd-9823-4b25-81e6-93087451a6dc", "type": "mapeamento", "value": "{{gatilho.nome}}", "fieldKey": "lead.name", "fieldLabel": "Nome do lead"}, {"id": "e56d1c67-a64e-4a03-9054-bdb7ed7ac3af", "type": "mapeamento", "value": "{{gatilho.email}}", "fieldKey": "lead.email", "fieldLabel": "E-mail"}, {"id": "828ee144-1fbf-433c-8fd9-29a414b9ec67", "type": "mapeamento", "value": "{{phone-1.phone}}", "fieldKey": "lead.whatsapp", "fieldLabel": "Telefone"}, {"id": "3d39a7fe-0209-40c5-bad7-1a9eb7546b72", "type": "mapeamento", "value": "{{gatilho.origem}}", "fieldKey": "lead.origin", "fieldLabel": "Origem"}, {"id": "fo1780960840506", "type": "mapeamento", "value": "{{gatilho.utm_source}}", "fieldKey": "lead.utm_source", "fieldLabel": "UTM Source"}, {"id": "fo1780960862361", "type": "mapeamento", "value": "{{gatilho.utm_medium}}", "fieldKey": "lead.utm_medium", "fieldLabel": "UTM Medium"}, {"id": "fo1780960874256", "type": "mapeamento", "value": "{{gatilho.utm_campaign}}", "fieldKey": "lead.utm_campaign", "fieldLabel": "UTM Campaign"}, {"id": "fo1780960884458", "type": "mapeamento", "value": "{{gatilho.utm_term}}", "fieldKey": "lead.utm_term", "fieldLabel": "UTM Term"}, {"id": "fo1780960899397", "type": "mapeamento", "value": "{{gatilho.utm_content}}", "fieldKey": "lead.utm_content", "fieldLabel": "UTM Content"}, {"id": "fo1780965196258", "type": "mapeamento", "value": "{{gatilho.empresa}}", "fieldKey": "lead.company", "fieldLabel": "Empresa"}], "parentIds": ["edcecf8b-a8c2-4340-c185-385389031851", "270c139f-2ed7-4f0d-8484-fa02af092d0a", "b91d0749-d26a-405e-bf33-3d7049ee0cfd_74abf544-7d1b-41bc-a384-db4f1f50b456"], "errorParentIds": [], "timeoutParentIds": []}, {"x": 680.1759970340554, "y": -232.44076055293687, "id": "note1780950041404", "type": "note", "label": "Anotação", "width": 818, "height": 1087, "noteText": "Altere o campo com os dados de entrada do seu Webhook", "parentIds": [], "errorParentIds": [], "timeoutParentIds": []}, {"x": 1578.5062761506274, "y": -233.44351464435147, "id": "note1780950089555", "type": "note", "label": "Anotação", "width": 360, "height": 528, "noteText": "Edite conforme as perguntas do formulário.", "parentIds": [], "errorParentIds": [], "noteColorIndex": 1, "timeoutParentIds": []}, {"x": 2011.8953974895396, "y": -238.13807531380755, "id": "note1780950117317", "type": "note", "label": "Anotação", "width": 365, "height": 648, "noteText": "", "parentIds": [], "errorParentIds": [], "noteColorIndex": 2, "timeoutParentIds": []}, {"x": 2440.8558372035523, "y": -45.14123195990196, "id": "n1787975674750", "type": "acoes", "label": "Ações", "parentIds": ["0456935a-642d-426e-9af2-053ba03b9e6f_4366358c-2f41-499c-8bdd-2272f3fa8394", "e07410f6-6f3b-4e1a-a102-6a7562c3e195"], "subBlocks": [], "actionItems": [{"id": "ai1787975701655", "label": "Adicionar tags", "actionId": "adicionar_tags", "categoryId": "leads", "description": "Adicione uma ou mais tags ao lead"}, {"id": "ai1787975710352", "label": "Transferir um atendente ao lead", "actionId": "transf_atend_lead", "categoryId": "leads", "description": "Transferir o atendente responsável do lead"}], "errorParentIds": [], "timeoutParentIds": []}], "trigger": {"label": "Webhook (HTTP)", "triggerId": "http_webhook", "categoryId": "http", "configData": {}, "description": ""}}$fluxo$::jsonb
), (
  'Mensagem automática',
  'Esta automação envia uma primeira mensagem automática ao novo lead criado.',
  'Primeira mensagem',
  1,
  $fluxo${"nodes": [{"x": 20, "y": 251, "id": "n1", "type": "start", "label": "Início", "trigger": {"label": "Lead criado", "triggerId": "lead_criado", "categoryId": "leads", "configData": {}, "description": "Quando um lead é criado"}, "parentIds": [], "errorParentIds": [], "timeoutParentIds": []}, {"x": 345.77777777777766, "y": 271.80952380952374, "id": "m1", "type": "mensagem", "label": "Mensagem", "parentIds": ["n1"], "subBlocks": [{"id": "m1_sb", "text": "Olá, {{lead.name}}! 👋 \nComo podemos ajudar?", "type": "mensagem_texto", "buttons": [{"id": "bt1787976439442", "label": ""}], "splitMessages": false}], "errorParentIds": [], "timeoutParentIds": []}, {"x": 681.8571428571427, "y": 296.2698412698412, "id": "w1", "type": "espera", "label": "Espera", "espera": {"type": "minutos", "amount": 1}, "parentIds": ["m1"], "errorParentIds": [], "timeoutParentIds": []}, {"x": 1025.6984126984123, "y": 271.1111111111111, "id": "m2", "type": "mensagem", "label": "Mensagem", "parentIds": ["w1"], "subBlocks": [{"id": "m2_sb", "text": "Pra começar, me conta: qual é o seu principal objetivo neste momento?", "type": "mensagem_texto", "splitMessages": false}], "errorParentIds": [], "timeoutParentIds": []}], "trigger": {"label": "Lead criado", "triggerId": "lead_criado", "categoryId": "leads", "configData": {}, "description": "Quando um lead é criado"}}$fluxo$::jsonb
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O gatilho
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.criar_automacoes_padrao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Sem dono não há a quem atribuir as automações (`automations.owner_id` é NOT
  -- NULL). Não deveria acontecer, mas se acontecer é melhor a empresa nascer sem
  -- automação do que o cadastro falhar.
  if new.owner_id is null then
    return new;
  end if;

  insert into public.automations (owner_id, company_id, name, description, group_name, active, flow)
  select new.owner_id, new.id, t.name, t.description, t.group_name, false, t.flow
  from public.automation_templates t
  where t.enabled
  order by t.position, t.created_at;

  return new;
exception when others then
  -- Falhar aqui NUNCA pode derrubar a criação da empresa: sem automação de
  -- exemplo a pessoa cria a dela, sem conta ela não tem produto. Mesmo contrato
  -- do `criar_funil_padrao`.
  raise warning '[criar_automacoes_padrao] falhou para a empresa %: %', new.id, sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_criar_automacoes_padrao on public.companies;

-- Gatilho separado do `trg_criar_funil_padrao`, e não uma função só: cada um tem
-- o seu `exception when others`, então um erro nas automações não impede o funil
-- de existir (nem o contrário). Juntos, o primeiro a falhar abortaria o resto.
create trigger trg_criar_automacoes_padrao
after insert on public.companies
for each row execute function public.criar_automacoes_padrao();
