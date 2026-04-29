# Gerenciamento de Estado e Roteamento

## AuthContext (`src/context/AuthContext.tsx`)

**Estado:**

| Estado | Tipo | Descrição |
|---|---|---|
| `session` | `Session \| null` | Sessão Supabase ativa |
| `user` | `User \| null` | Objeto do usuário autenticado |
| `loading` | `boolean` | Carregando sessão inicial |

**Métodos:**

| Método | Assinatura | Descrição |
|---|---|---|
| `signIn` | `(email, password) → Promise<string \| null>` | Retorna mensagem de erro ou null |
| `signUp` | `(email, password) → Promise<{error, needsConfirmation}>` | Cria usuário + perfil inicial |
| `signOut` | `() → Promise<void>` | Encerra sessão |

---

## ProfileContext (`src/context/ProfileContext.tsx`)

**Estado:**

| Estado | Tipo | Descrição |
|---|---|---|
| `profile` | `Profile \| null` | Dados do perfil do usuário logado |
| `profileLoading` | `boolean` | Carregando perfil do banco |

**Métodos:**

| Método | Assinatura | Descrição |
|---|---|---|
| `updateProfile` | `(data: Partial<Profile>) → Promise<void>` | Atualiza `full_name`, `phone`, `email` |
| `uploadAvatar` | `(file: File) → Promise<void>` | Upload para Storage + atualiza `avatar_url` |

**Interface Profile:**
```typescript
interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  created_at: string;
}
```

---

## CRMContext (`src/context/CRMContext.tsx`)

**Estado:**

| Estado | Tipo |
|---|---|
| `pipelines` | `Pipeline[]` |
| `leads` | `Record<string, Lead>` |
| `tasks` | `Task[]` |
| `activePipelineId` | `string` |
| `selectedLeadId` | `string \| null` |

**Métodos:**

| Método | Descrição |
|---|---|
| `addPipeline` | Cria pipeline + colunas no banco e estado |
| `updatePipeline` / `deletePipeline` | Edita/remove pipeline |
| `addColumn` / `updateColumn` / `deleteColumn` | CRUD de colunas |
| `addLead` | Cria lead + activity "created" no banco |
| `updateLead` | Atualiza lead (estado + banco) |
| `deleteLead` | Remove lead + tarefas associadas |
| `moveLead` | Move lead entre colunas (drag & drop) |
| `markLeadWon` / `markLeadLost` | Move lead para coluna "ganho"/"perdido" |
| `nextDealNumber` | Retorna `max(dealNumber) + 1` |
| `addActivity` | Adiciona activity otimisticamente |
| `addTask` / `updateTask` / `deleteTask` | CRUD de tarefas |

---

## Roteamento (`src/App.tsx`)

```
/                        → redirect para /dashboard
/login                   → LoginPage (não requer auth)
/dashboard               → DashboardPage ✓
/pipeline                → PipelinePage ✓
/pipeline/lead/:id       → LeadDetailPage ✓
/leads                   → LeadsPage ✓
/contatos                → redirect para /leads
/agentes                 → AgentesPage ✓
/rezult-pay              → RezultPayPage ✓
/multiatendimento        → MultiatendimentoPage ✓
/automacoes              → AutomacoesPage ✓
/configuracoes           → SettingsPage ✓
/pilot                   → PilotPage ✓
*                        → NotFound
```

✓ = Requer autenticação (protegido pelo guard em `AppRoutes`)

**Lógica de guard:**
```tsx
// App.tsx — AppRoutes
if (loading) return <Spinner />;
if (!session) return <LoginPage />;
return <CRMProvider>...<Routes /></CRMProvider>;
```
