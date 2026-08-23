# Rezult CRM — Guia do Projeto

CRM de vendas B2B brasileiro. SaaS com multi-tenancy por empresa. Stack: React + TypeScript + Vite + Supabase + Tailwind + shadcn/ui. Deploy: Vercel. Domínio: app.rezultcrm.com.

## Contexto do Produto

- Planos: Silver (R$237/mês), Platinum (R$399/mês), Emerald (R$747/mês) — com desconto semestral (-15%) e anual (-30%)
- Mercado: PMEs brasileiras com times de vendas
- UI 100% em português brasileiro
- Cada empresa é isolada por RLS no Supabase (multi-tenant)

## Comandos

```bash
npm run dev        # Dev server (http://localhost:8083)
npm run build      # Build de produção
npm run lint       # Lint
npm run preview    # Preview do build
```

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 + SWC |
| Roteamento | React Router v6 |
| Estilo | Tailwind CSS + shadcn/ui (Radix) |
| Ícones | Lucide React |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Email | Resend.io (domínio rezultcrm.com) |
| Notificações | Sonner (toast) |
| Drag-and-drop | @hello-pangea/dnd |
| Gráficos | Recharts |
| Datas | date-fns |

## Variáveis de Ambiente

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Estrutura
src/
├── components/
│   ├── ui/                     # Componentes shadcn/ui
│   ├── AppLayout.tsx           # Layout principal (sidebar + outlet)
│   ├── AppSidebar.tsx          # Navegação lateral
│   ├── FreePlanBanner.tsx      # Banner de trial gratuito
│   ├── LeadDrawer.tsx          # Painel lateral de lead
│   └── PipelineSidebar.tsx     # Nav de pipelines
├── context/
│   ├── AuthContext.tsx         # Sessão Supabase + auth helpers
│   ├── CRMContext.tsx          # Estado global do CRM (pipelines, leads, tasks)
│   ├── CompanyContext.tsx      # Empresa + plano + expiração
│   ├── ProfileContext.tsx      # Perfil do usuário + avatar
│   └── FloatingChatContext.tsx # Estado do chat flutuante
├── pages/                      # Uma página por rota
├── data/
│   ├── mockData.ts             # Interfaces TypeScript (Lead, Pipeline, Task…)
│   └── plans.ts                # Definição de planos/preços
└── lib/
├── supabase.ts             # Cliente Supabase (singleton)
└── utils.ts                # cn() e utilitários

## Roteamento

**Sem sessão** — rotas públicas:
- `/login` — acesso para quem já tem conta
- `/register` — criação de conta nova
- `/reset-password` — redefinição de senha
- `*` → `LoginPage`

**Com sessão** — rotas protegidas:
- `/` → redirect `/dashboard`
- `/company-register` — cadastro inicial da empresa
- `/setup` — seleção de plano
- `/dashboard`, `/pipeline`, `/leads`, `/configuracoes`, etc. (dentro do `AppLayout`)

O `AppLayout` redireciona para `/company-register` se a empresa não existir, e para `/setup` se o trial expirou.

## Auth (AuthContext)

- Fluxo PKCE: confirmação de e-mail via `?code=` → `exchangeCodeForSession` → sign-out imediato → sessionStorage flag `email_confirmed` → LoginPage mostra banner de sucesso
- Recuperação de senha via `#type=recovery` → `pendingPasswordReset = true` → redirect `/reset-password`
- Hooks: `useAuth()` → `{ session, user, loading, signIn, signUp, signOut, resetPassword, pendingPasswordReset }`

## Estado Global (CRMContext)

Carrega tudo no mount via Supabase. Expõe:
- `pipelines`, `activePipeline`, `setActivePipeline`
- `leads` (Record<id, Lead>), funções CRUD de lead
- `tasks`, `tags`, `activities`

Atualizações: optimistic state + upsert no Supabase.

## Empresa (CompanyContext)

- Busca `companies` onde `owner_id = auth.uid()`
- `isFreePlan`, `planExpired`, `planDaysLeft`
- `refetchCompany()` — chamar após criar/atualizar empresa

## Banco de Dados (Supabase)

| Tabela | Uso |
|--------|-----|
| `profiles` | Perfil do usuário (`id`, `full_name`, `email`, `avatar_url`, `theme`) |
| `companies` | Empresa (`owner_id`, `name`, `plan`, `plan_expires_at`) |
| `pipelines` | Pipelines de venda |
| `pipeline_columns` | Etapas de um pipeline |
| `pipeline_groups` | Agrupamento de pipelines |
| `leads` | Leads/negócios |
| `tasks` | Tarefas vinculadas a leads |
| `tags` | Tags de leads |
| `activities` | Histórico de atividades de um lead |
| `automations` | Automações (`owner_id`, `company_id`, `name`, `description`, `group_name`, `active`, `flow` jsonb) |
| `whatsapp_connections` | Conexões WhatsApp da empresa (usadas pelo Bloco Mensagem). `provider` = `dapi` \| `zapi` \| `cloud_api`. **D-API** (https://d-api.cloud): 1 API Key da conta + um `sessionId` criado pelo CRM → reaproveita `instance_id` (=sessionId) e `token` (=API Key), sem colunas novas. **Z-API**: `instance_id`/`token`/`client_token` |
| `whatsapp_messages` | Mensagens enviadas/recebidas pelo Bloco Mensagem — escrito pela Edge Function |
| `automation_logs` | Logs de execução por nó (`automation_id`, `company_id`, `lead_id`, `node_id`, `status`, `error_message`, `tokens` int — tokens consumidos pelo nó de IA) — escrito pela Edge Function via service role |
| `automation_runner_config` | Config interna do motor de automações (`supabase_url`, `automation_secret`) — sem acesso via API (RLS total) |
| `automation_pending` | Execuções pausadas por blocos Espera (`company_id`, `automation_id`, `lead_id`, `node_ids text[]`, `trigger_payload jsonb`, `resume_after timestamptz`) — sem acesso via API (RLS total); pg_cron chama a Edge Function a cada minuto para retomar |
| `ai_provider_keys` | Chaves de IA dos clientes (BYOK) usadas pelo Bloco de IA (`company_id`, `owner_id`, `provider` openai/anthropic/google, `api_key`, `active`) — uma por provedor por empresa (`unique(company_id, provider)`); RLS: só o dono gerencia. Gerenciada em Configurações → Chaves de API |
| `subscriptions` | Assinatura Stripe da empresa (`company_id`, `owner_user_id`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `plan_name`, `billing_period`, `status`, `trial_ends_at`, `current_period_start`, `current_period_end`, `canceled_at`) |
| `disparos` | Execução em massa de uma automação (gatilho `lead_manual`) sobre leads filtrados (`owner_id`, `company_id`, `title`, `automation_id`, `status` criado/agendado/em_andamento/pausado/concluido/erro, `rhythm` normal/turbo/lento/humano, `filters` jsonb, `scheduled_at`, `confirm_filters`, `total_leads`) |
| `disparo_itens` | Um lead dentro de um disparo (`disparo_id`, `company_id`, `owner_id`, `lead_id`, `lead_name`, `lead_phone`, `status` nao_iniciado/pendente/em_execucao/concluido/erro, `error_message`) — escrito pela Edge Function `disparo-runner` |

| `whatsapp_conversations` | Conversas WhatsApp (`owner_id`, `company_id`, `instance_id`, `name`, `phone`, `channel`, `tags`, `preview`, `last_msg_at`, `read`) |

Storage bucket: `avatars` — path `{user_id}/avatar.{ext}`

## Modelo de Acesso (RLS)

**Recursos pertencem à empresa, não ao usuário.** O `owner_id` existe apenas como campo de auditoria (quem criou). O acesso é controlado por `company_id` via a função `is_member_of(company_id)`.

### Função `is_member_of(company_id)`
Retorna `true` se o usuário autenticado:
- É membro da empresa em `company_members`, OU
- É o `owner_id` da empresa em `companies` (owner implícito)

Isso garante que o dono da empresa sempre acessa tudo, mesmo sem estar em `company_members`.

### Padrão de policies
Todas as tabelas principais usam o padrão:
```sql
FOR SELECT USING (is_member_of(company_id))
FOR INSERT WITH CHECK (is_member_of(company_id))
FOR UPDATE USING (is_member_of(company_id))
FOR DELETE USING (is_member_of(company_id))
```

**Exceção — `leads`:** mantém permissões granulares por membro (`leads:admin`, `leads:member`, `leads:operator`, `leads:restricted`), mas o owner da empresa tem acesso total irrestrito via policy separada.

### Tabelas com `company_id` (controle de acesso)
`automations`, `pipelines`, `pipeline_groups`, `pipeline_columns`, `leads`, `tasks`, `tags`, `activities`, `disparos`, `disparo_itens`, `automation_logs`, `whatsapp_connections`, `whatsapp_conversations`, `whatsapp_messages`

### Ao criar nova tabela
- Sempre incluir `company_id uuid NOT NULL` e `owner_id uuid` (auditoria)
- Usar `is_member_of(company_id)` nas policies — nunca `owner_id = auth.uid()` como única regra
- Documentar na seção Banco de Dados acima

## Convenções

- Português em toda a UI e mensagens de erro
- `toast.error()` / `toast.success()` para feedback (Sonner)
- Sem Redux — Context API para estado global, `useState` para estado local
- Sem React Query — fetch direto com async/await nos contexts
- Tipos centralizados em `src/data/mockData.ts`
- Prioridades: `"Alta" | "Média" | "Baixa"`
- Status de task: `"Pendente" | "Concluída"`
- Origens de lead: `"Instagram" | "Facebook Ads" | "Google Ads" | "Meta Ads" | "TikTok Ads" | "LinkedIn Ads" | "YouTube Ads" | "Email Marketing" | "Orgânico" | "WhatsApp" | "Evento" | "Indicação" | "Site" | "Outro"` — o runner normaliza sinônimos automaticamente (ex: "ig" → "Instagram")
- Tema: salvo em `profiles.theme` (`"light" | "dark" | "system"`), aplicado via classe no `<html>`

## Motor de Automações

Automações são salvas em `automations.flow` (JSONB) e **executadas de verdade** por uma Supabase Edge Function (~2.700 linhas). **Não editar o runner sem ler esta seção completa — a função tem múltiplas rotas e tipos de nó que interagem entre si.**

### Arquivo da Edge Function
`supabase/functions/automation-runner/index.ts`

### SQL Migrations
- `supabase/migrations/automation_engine_setup.sql` — setup principal (trigger PostgreSQL, pg_net, automation_runner_config)
- `supabase/migrations/20260529000001_automation_pending.sql` — tabela `automation_pending` + job pg_cron para retomar esperas

### Rotas da Edge Function

O runner é uma única Edge Function com múltiplos pontos de entrada por path:

| Rota | Auth | Quando é chamada |
|------|------|-----------------|
| `POST /automation-runner` | `AUTOMATION_SECRET` no header | PostgreSQL trigger via pg_net (eventos do banco) |
| `POST /automation-runner/manual` | JWT do usuário | UI executa automação manualmente em 1 lead |
| `POST /automation-runner/webhook/<automationId>` | Sem auth (token no body opcional) | Webhook externo por automação (`http_webhook`) |
| `POST /automation-runner/mcp-trigger` | Chave MCP | Ferramenta MCP dispara automação (`mcp_tool`) |
| `POST /automation-runner/resume-reply` | Service key | `zapi-webhook` chama ao receber resposta do contato (Bloco Mensagem → Entrada do usuário) |
| `POST /automation-runner` com `{ resume: true }` | `AUTOMATION_SECRET` | pg_cron chama a cada minuto para retomar `automation_pending` |

### Arquitetura geral

```
Evento do banco (INSERT/UPDATE em leads)
  → PostgreSQL trigger leads_automation_trigger
    → pg_net → POST /automation-runner  (Authorization: Bearer AUTOMATION_SECRET)
      → runTrigger(): filtra automações ativas da empresa com trigger_type correspondente
      → confere configData do gatilho (tag, etapa, atendente, campo…)
      → executa nós do flow em sequência

Gatilho manual (UI)
  → POST /automation-runner/manual  (Authorization: Bearer <JWT>)
    → handleManual(): trigger_type="lead_manual", automation_id obrigatório

Webhook externo
  → POST /automation-runner/webhook/<automationId>
    → handleWebhook(): trigger_type="http_webhook", interpola campos do body no contexto

Ferramenta MCP
  → POST /automation-runner/mcp-trigger
    → handleMcpTrigger(): trigger_type="mcp_tool"

Resposta WhatsApp (Entrada do usuário)
  → zapi-webhook recebe mensagem do contato
    → POST /automation-runner/resume-reply
      → handleResumeReply(): retoma o flow a partir do sub-bloco que aguardava resposta

Retomada de esperas (pg_cron — 1x/min)
  → POST /automation-runner  com body { resume: true }
    → handleResume(): processa registros vencidos em automation_pending
```

### Tipos de nós do flow (`automations.flow.nodes[].type`)

| Tipo | O que faz |
|------|-----------|
| `start` | Ignorado (ponto de entrada visual) |
| `note` | Ignorado (anotação no canvas) |
| `acoes` | Executa lista de `actionItems` em sequência |
| `condicoes` | Avalia `conditionItems`; segue branch `true` ou `false` |
| `espera` | Pausa o flow pelo tempo/janela configurada em `espera` |
| `api` | Executa requisições HTTP definidas em `apiConfig.requests`; resposta vira datasource |
| `campos` | Operações de campo: `mapeamento` (escreve valor no lead) ou `analise_telefone` (parse de número) |
| `ia` | Bloco de IA BYOK: executa `iaActions` usando chave do provedor em `ai_provider_keys` |
| `randomizador` | Distribui execução entre branches por percentual (`randomBranches`) |
| `mensagem` | Envia mensagens WhatsApp via `subBlocks`; pode pausar para aguardar resposta |

### Bloco de IA (`ia`)

Usa a chave BYOK da empresa em `ai_provider_keys`. Cada `IaAction` em `iaActions`:

| Tipo | Descrição |
|------|-----------|
| `assistente_chat` | Chat com histórico de conversa WhatsApp do lead |
| `gerar_texto` | Geração de texto livre com instruções |
| `invocar_agente` | Chama um agente configurado (`agentId`) |
| `transcricao_audio` | Transcreve áudio de `whatsapp_messages` via OpenAI Whisper |
| `intencao` | Classifica intenção do lead entre opções configuradas |
| `sentimento` | Classifica sentimento entre opções configuradas |
| `extrator_params` | Extrai parâmetros estruturados da conversa |

Provedores: `openai`, `anthropic`, `google`. Resultado disponível como `{{outputVar.resposta}}` nos nós seguintes.

### Bloco Mensagem (`mensagem`)

Envia via WhatsApp usando a conexão definida em `node.connectionId` (tabela `whatsapp_connections`). O envio é **agnóstico de provedor**: `sendWa()` no runner traduz para a API certa conforme `connection.provider` — **Z-API** (`sendZapi`, `api.z-api.io/.../send-*`) ou **D-API** (`sendDapi`, `POST api.d-api.cloud/api/v1/messages/send/{text|image|audio|document}` com header `Authorization: <API Key>` e corpo `{ sessionId, to, ... }`). Sub-blocos (`subBlocks`) processados em sequência:

| Sub-bloco | O que faz |
|-----------|-----------|
| `mensagem_texto` | Envia texto (suporta botões de resposta rápida) |
| `mensagem_audio` | Envia arquivo de áudio |
| `arquivo_anexo` | Envia arquivo por URL direta |
| `arquivo_url` | Envia arquivo por URL com download prévio |
| `atraso_tempo` | Pausa N segundos entre sub-blocos (inline se ≤ 90s, senão `automation_pending`) |
| `entrada_usuario` | Envia mensagem e **pausa o flow** aguardando resposta do contato → `resume-reply` retoma quando `zapi-webhook` receber a mensagem; timeout configu rável |

Mensagens são gravadas em `whatsapp_messages`. Respostas do contato chegam via webhook do provedor → `resume-reply`: **Z-API** → `zapi-webhook`; **D-API** → `dapi-webhook` (traduz os eventos `messages.received`/`connection.status` da D-API para o mesmo insert + retomada). Ambos localizam o dono por `whatsapp_connections.instance_id`. Registrados em `config.toml` com `verify_jwt = false`.

### Bloco Espera (`espera`)

| Tipo | Comportamento |
|------|--------------|
| `segundos` ≤ 90s | `setTimeout` inline (Edge Function aguarda) |
| `segundos` > 90s | Insere em `automation_pending`, pg_cron retoma |
| `minutos`, `horas`, `dias` | Insere em `automation_pending`, pg_cron retoma |
| `intervalo_semana` | Se dentro da janela: continua; senão, agenda para próximo início de janela |
| `dia_horario` | Agenda para data/hora configurada (campo do lead ou data fixa) |
| `usuario_parou` | Agenda para `now() + amount segundos` |

### Gatilhos implementados

**Do PostgreSQL** (via `leads_automation_trigger` + pg_net):
`lead_criado`, `neg_criado`, `neg_movido`, `neg_ganho`, `neg_perdido`, `neg_restaurado`, `atend_atribuido`, `atend_retirado`, `tag_adicionada`, `tag_removida`, `campo_alterado`

**Da UI / externos**:
- `lead_manual` — execução manual por lead (rota `/manual`, JWT)
- `http_webhook` — webhook externo por automação (rota `/webhook/<id>`)
- `mcp_tool` — ferramenta MCP (rota `/mcp-trigger`)
- `outra_automacao` — disparado internamente pela ação `iniciar_automacao`

### Ações implementadas (nó `acoes`)

`mover_etapa`, `duplicar_negocio`, `criar_lead`, `criar_negocio`, `ganhar_negocio`, `restaurar_negocio`, `perder_negocio`, `transf_atend_neg`, `transf_atend_lead`, `remover_atend_neg`, `remover_atend_lead`, `add_produto_neg`, `rem_produto_neg`, `remover_negocio`, `adicionar_tags`, `remover_tags`, `adicionar_listas`, `remover_listas`, `comentario_lead`, `deletar_lead`, `criar_atividade`, `enviar_notificacao`, `iniciar_automacao`

### Variáveis de contexto interpoladas

O runner interpola `{{variavel}}` nos textos. Fontes disponíveis:
- Campos do lead (`{{lead.nome}}`, `{{lead.whatsapp}}`, `{{lead.email}}`, campos adicionais…)
- Saídas de blocos de IA (`{{outputVar.resposta}}`)
- Saídas de blocos API (`{{datasource.campo}}`)
- Dados de análise de telefone (`{{datasource.phone}}`, `.country`, `.valid`…)
- Respostas do usuário capturadas por Entrada do usuário (`{{varName}}`)
- Gatilho: `{{gatilho.tipo}}`, `{{gatilho.tag}}`, `{{gatilho.etapa}}`…

### Setup (uma vez por projeto Supabase)

1. **Deploy da Edge Function** — Supabase → Edge Functions → `automation-runner`. Secret: `AUTOMATION_SECRET=<openssl rand -hex 32>`
2. **SQL Migration principal** — `automation_engine_setup.sql` (preencher URL e secret)
3. **Migration esperas** — `20260529000001_automation_pending.sql`
4. **Extensões necessárias** — `pg_net` (triggers) e `pg_cron` (retomada de esperas)

---

## Motor de Disparos

"Disparos" (ícone de foguete na sidebar, rota `/disparos`) executam uma automação **em massa** sobre leads filtrados, em lotes, no ritmo escolhido.

- **Elegibilidade**: só automações com gatilho `lead_manual` (Execução manual por lead) podem ser disparadas, e precisam estar **ativas** (o `automation-runner` só roda automações ativas).
- **Frontend**: `src/pages/DisparosPage.tsx` (lista), `DisparoDetailPage.tsx` (detalhe + realtime), `src/components/disparos/CreateDisparoWizard.tsx` (wizard 4 etapas) e `LeadFilterPanel.tsx` (filtro avançado). Camada de dados/tipos/filtro em `src/data/disparos.ts`.
- **Execução**: Edge Function `supabase/functions/disparo-runner/index.ts`, acionada pela UI (JWT, ao clicar "Iniciar") e por **pg_cron a cada minuto** (`20260630000002_disparos_cron.sql`) com o `automation_secret`. Processa 1 lote por passagem: pega itens `nao_iniciado` (tamanho do lote por ritmo), marca `pendente`→`em_execucao`, chama o `automation-runner` (modo normal, secret) com `{ trigger_type: "lead_manual", automation_id, lead_id }` por lead, e marca `concluido`/`erro`. Quando não sobram itens → disparo `concluido`.
- **Ritmos** (lote/passagem): turbo 40, normal 25, lento 12, humano 3.
- **Migrations**: `20260630000001_disparos.sql` (tabelas, RLS, realtime), `20260630000002_disparos_cron.sql` (pg_cron). `disparo-runner` está em `config.toml` com `verify_jwt = false`.

---

## Regras de Desenvolvimento

- NUNCA hardcodar textos em inglês na UI
- SEMPRE usar `toast` para feedback de ações do usuário
- SEMPRE verificar RLS antes de criar nova tabela ou query
- NUNCA duplicar lógica que já existe em um Context
- Ao criar nova página, registrar a rota em `App.tsx`
- Ao criar nova tabela no Supabase, documentar aqui na seção Banco de Dados
- Commits em português, descritivos

## Planos e Pagamentos (Stripe)

O plano é vinculado à **empresa** (não ao usuário). Todos os membros da empresa compartilham o mesmo plano.

### Preços

| Plano (chave interna) | Mensal | Semestral (total) | Anual (total) |
|----------------------|--------|-------------------|---------------|
| Silver (`silver`) | R$ 237 | R$ 1.209 | R$ 1.989 |
| Platinum (`platinum`) | R$ 399 | R$ 2.035 | R$ 3.352 |
| Emerald (`emerald`) | R$ 747 | R$ 3.810 | R$ 6.272 |

> As chaves internas (`silver`, `platinum`, `emerald`) são usadas no banco e no Stripe metadata — **nunca alterar sem migration SQL**.

### Price IDs Stripe (live mode)

| Plano | Mensal | Semestral | Anual |
|-------|--------|-----------|-------|
| Silver | `price_1TougzHxAJVer2B2OhFa2dMf` | `price_1TougyHxAJVer2B2XcQObtEA` | `price_1TougzHxAJVer2B2pYF5yixE` |
| Platinum | `price_1TougzHxAJVer2B21QUlvqh7` | `price_1Touh0HxAJVer2B2nc56t9f1` | `price_1TougyHxAJVer2B2U6e9SlEV` |
| Emerald | `price_1TougyHxAJVer2B2UWGevkxv` | `price_1TougzHxAJVer2B247BGzYO9` | `price_1TougzHxAJVer2B2pePEiWPm` |

### Fluxo de assinatura

1. Usuário clica em um plano → **SEMPRE** redireciona para o checkout do Stripe via `create-checkout-session`
2. Stripe webhook (`stripe-webhook`) recebe o evento e atualiza `subscriptions` e `companies`
3. Para assinantes existentes, passa `stripe_customer_id` para evitar criar cliente duplicado no Stripe

### Edge Functions Stripe

| Função | Uso |
|--------|-----|
| `create-checkout-session` | Cria sessão de checkout. Aceita `customerId` opcional para reutilizar cliente existente |
| `create-portal-session` | Abre o Customer Portal do Stripe para gerenciar assinatura ativa |
| `stripe-webhook` | Recebe eventos do Stripe e sincroniza `subscriptions` + `companies` |
| `update-subscription` | Atualiza assinatura via API do Stripe — **NÃO usar para mudança de plano via UI** (sempre usar checkout) |

### Páginas de plano

- `/planos` — seleção de plano para novos usuários (trial 7 dias)
- `/setup` — seleção inicial de plano após criar empresa
- `/configuracoes` → seção "Planos e Pagamentos" — upgrade/downgrade para assinantes existentes

### Regra crítica

**NUNCA** chamar `update-subscription` diretamente ao trocar de plano pela UI. Sempre redirecionar para o checkout do Stripe (`create-checkout-session`), mesmo para usuários com assinatura ativa.

## Skills disponíveis

### UI/UX Pro Max
Localização: .Codex/skills/ui-ux-pro-max/SKILL.md
Use sempre que criar ou modificar interfaces, componentes visuais, páginas ou qualquer elemento de UI.

