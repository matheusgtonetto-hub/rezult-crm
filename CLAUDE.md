# Rezult CRM — Guia do Projeto

CRM de vendas em português com pipelines Kanban, gestão de leads, tarefas e equipes. Stack: React + Supabase.

## Comandos

```bash
npm run dev        # Dev server (http://localhost:8080)
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
| Backend | Supabase (PostgreSQL + Auth) |
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

```
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
```

## Roteamento

**Sem sessão** — rotas públicas:
- `/login` — acesso para quem já tem conta
- `/register` — criação de conta nova
- `/reset-password` — redefinição de senha
- `*` → `LoginPage`

**Com sessão** — rotas protegidas:
- `/` → redirect `/dashboard`
- `/login` → redirect `/dashboard`
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
| `profiles` | Perfil do usuário (`id`, `full_name`, `email`, `avatar_url`) |
| `companies` | Empresa (`owner_id`, `name`, `plan`, `plan_expires_at`) |
| `pipelines` | Pipelines de venda |
| `pipeline_columns` | Etapas de um pipeline |
| `pipeline_groups` | Agrupamento de pipelines |
| `leads` | Leads/negócios |
| `tasks` | Tarefas vinculadas a leads |
| `tags` | Tags de leads |
| `activities` | Histórico de atividades de um lead |

Storage bucket: `avatars` — path `{user_id}/avatar.{ext}`

Todas as tabelas têm RLS habilitado. Políticas padrão: `auth.uid() = owner_id` ou campo equivalente.

## Convenções

- Português em toda a UI e mensagens de erro
- `toast.error()` / `toast.success()` para feedback ao usuário (Sonner)
- Sem Redux — Context API para estado global, `useState` para estado local
- Sem React Query nas páginas — fetch direto com async/await nos contexts
- Tipos centralizados em `src/data/mockData.ts`
- Prioridades: `"Alta" | "Média" | "Baixa"`
- Status de task: `"Pendente" | "Concluída"`
- Origens de lead: `"Instagram" | "Facebook Ads" | "Indicação" | "Site" | "Outro"`

## Skills disponíveis

### UI/UX Pro Max
Localização: .claude/skills/ui-ux-pro-max/SKILL.md
Use esta skill sempre que criar ou modificar interfaces, componentes visuais, páginas ou qualquer elemento de UI.
