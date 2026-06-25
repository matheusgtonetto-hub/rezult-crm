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
| `automation_logs` | Logs de execução por nó (`automation_id`, `company_id`, `lead_id`, `node_id`, `status`, `error_message`, `tokens` int — tokens consumidos pelo nó de IA) — escrito pela Edge Function via service role |
| `automation_runner_config` | Config interna do motor de automações (`supabase_url`, `automation_secret`) — sem acesso via API (RLS total) |
| `automation_pending` | Execuções pausadas por blocos Espera (`company_id`, `automation_id`, `lead_id`, `node_ids text[]`, `trigger_payload jsonb`, `resume_after timestamptz`) — sem acesso via API (RLS total); pg_cron chama a Edge Function a cada minuto para retomar |
| `ai_provider_keys` | Chaves de IA dos clientes (BYOK) usadas pelo Bloco de IA (`company_id`, `owner_id`, `provider` openai/anthropic/google, `api_key`, `active`) — uma por provedor por empresa (`unique(company_id, provider)`); RLS: só o dono gerencia. Gerenciada em Configurações → Chaves de API |
| `subscriptions` | Assinatura Stripe da empresa (`company_id`, `owner_user_id`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `plan_name`, `billing_period`, `status`, `trial_ends_at`, `current_period_start`, `current_period_end`, `canceled_at`) |

Storage bucket: `avatars` — path `{user_id}/avatar.{ext}`

Todas as tabelas têm RLS habilitado. Políticas padrão: `auth.uid() = owner_id` ou campo equivalente.

## Convenções

- Português em toda a UI e mensagens de erro
- `toast.error()` / `toast.success()` para feedback (Sonner)
- Sem Redux — Context API para estado global, `useState` para estado local
- Sem React Query — fetch direto com async/await nos contexts
- Tipos centralizados em `src/data/mockData.ts`
- Prioridades: `"Alta" | "Média" | "Baixa"`
- Status de task: `"Pendente" | "Concluída"`
- Origens de lead: `"Instagram" | "Facebook Ads" | "Indicação" | "Site" | "Outro"`
- Tema: salvo em `profiles.theme` (`"light" | "dark" | "system"`), aplicado via classe no `<html>`

## Motor de Automações

Automações são salvas em `automations.flow` (JSONB) e **executadas de verdade** por uma Supabase Edge Function.

### Arquitetura

```
leads (INSERT/UPDATE)
  → PostgreSQL trigger leads_automation_trigger
    → pg_net → POST /functions/v1/automation-runner
      → filtra automações ativas da empresa
      → confere configData do gatilho (tag específica, etapa, atendente…)
      → executa actionItems dos nós "acoes" em sequência
```

### Arquivo da Edge Function
`supabase/functions/automation-runner/index.ts`

### SQL Migration
`supabase/migrations/automation_engine_setup.sql`

### Setup (uma vez por projeto Supabase)

1. **Deploy da Edge Function**
   - No painel Supabase → Edge Functions → New Function → nome: `automation-runner`
   - Cole o conteúdo de `supabase/functions/automation-runner/index.ts`
   - Em Secrets, adicione: `AUTOMATION_SECRET=<valor-aleatorio>` (openssl rand -hex 32)

2. **SQL Migration**
   - Abra `supabase/migrations/automation_engine_setup.sql`
   - Preencha `REPLACE_WITH_YOUR_SUPABASE_URL` e `REPLACE_WITH_A_RANDOM_SECRET` (mesmo valor do secret acima)
   - Execute no SQL Editor do Supabase

3. **Verificar extensão pg_net**
   - Dashboard → Database → Extensions → pg_net (deve estar habilitado por padrão no Supabase)

4. **Bloco Espera — setup adicional (uma vez)**
   - Execute `supabase/migrations/20260529000001_automation_pending.sql` no SQL Editor do Supabase
   - Isso cria a tabela `automation_pending` e um job pg_cron que chama a Edge Function a cada minuto para retomar automações pausadas
   - Pré-requisito: `automation_runner_config` já deve ter `supabase_url` e `automation_secret` (feito na migration principal)
   - Verifique pg_cron: Dashboard → Database → Extensions → pg_cron

### Como funciona o bloco Espera na execução

| Tipo | Comportamento no runner |
|------|------------------------|
| `segundos` ≤ 90s | `setTimeout` inline — a Edge Function aguarda antes de continuar |
| `segundos` > 90s | Insere em `automation_pending`, pg_cron retoma após o delay |
| `minutos`, `horas`, `dias` | Insere em `automation_pending`, pg_cron retoma após o delay |
| `intervalo_semana` | Se já dentro da janela: continua imediatamente; senão, agenda para o próximo início de janela |
| `dia_horario` | Agenda para a data/hora configurada (se no futuro); se inválida, continua imediatamente |
| `usuario_parou` | Agenda para `now() + amount segundos` |

### Gatilhos implementados (disparam do PostgreSQL)
`lead_criado`, `neg_criado`, `neg_movido`, `neg_ganho`, `neg_perdido`, `neg_restaurado`, `atend_atribuido`, `atend_retirado`, `tag_adicionada`, `tag_removida`

### Ações implementadas (executam no banco via service role)
`mover_etapa`, `ganhar_negocio`, `restaurar_negocio`, `perder_negocio`, `transf_atend_neg`, `transf_atend_lead`, `remover_atend_neg`, `remover_atend_lead`, `add_produto_neg`, `rem_produto_neg`, `remover_negocio`, `adicionar_tags`, `remover_tags`, `adicionar_listas`, `remover_listas`, `comentario_lead`, `deletar_lead`, `criar_atividade`, `enviar_notificacao`, `iniciar_automacao`

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

### Price IDs Stripe (test mode)

| Plano | Mensal | Semestral | Anual |
|-------|--------|-----------|-------|
| Silver | `price_1Tbp3sHLGbQg56rmYk9RbtKj` | `price_1Tbp3sHLGbQg56rm6sleoFHK` | `price_1Tbp3sHLGbQg56rmuvxhNhoQ` |
| Platinum | `price_1Tbp7lHLGbQg56rmxz4NpynU` | `price_1Tbp7lHLGbQg56rmnvtsYz4a` | `price_1Tbp7lHLGbQg56rmJcvQ4GY5` |
| Emerald | `price_1TbpAAHLGbQg56rmh1i1HdvY` | `price_1TbpAAHLGbQg56rmzhs7ffCL` | `price_1TbpAAHLGbQg56rmYRFZlZ3I` |

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
Localização: .claude/skills/ui-ux-pro-max/SKILL.md
Use sempre que criar ou modificar interfaces, componentes visuais, páginas ou qualquer elemento de UI.

