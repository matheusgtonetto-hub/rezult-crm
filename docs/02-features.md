# Features e Regras de Negócio

## 3.1 Autenticação

**Regras de Negócio:**
- Senha mínima de 6 caracteres (validação frontend).
- Após cadastro, o Supabase envia e-mail de confirmação; o usuário não acessa o app até confirmar.
- Ao confirmar o e-mail, é criado automaticamente um registro em `public.profiles` com `email` e `full_name` derivado do prefixo do e-mail (via `AuthContext.signUp`).
- Se o perfil ainda não existir no carregamento inicial (`ProfileContext`), ele é criado via `upsert`.
- O evento `onAuthStateChange` do Supabase mantém a sessão sincronizada em tempo real.
- Usuário não autenticado é redirecionado para `/login` por `AppRoutes`.

**Telas envolvidas:** `LoginPage.tsx` (screens: `login` | `signup` | `confirm`)

---

## 3.2 Perfil do Usuário

**Regras de Negócio:**
- O perfil é lido de `public.profiles` filtrado por `auth.uid()`.
- Campos editáveis: `full_name`, `phone`, `email`.
- Foto de perfil enviada ao bucket `avatars` no caminho `{user_id}/avatar.{ext}` com `upsert: true` (substitui a foto anterior).
- Arquivo máximo: **2 MB**. Formatos aceitos: JPG, PNG, GIF (validação frontend).
- URL pública da foto é salva em `profiles.avatar_url`.
- Qualquer alteração salva via `updateProfile` propaga imediatamente para `ProfileContext`, atualizando a sidebar (avatar + nome) e o painel de configurações em tempo real — **sem recarregar a página**.
- Alteração de senha é feita via dialog separado (integração Supabase Auth — em implementação).

**Arquivos:** `ProfileContext.tsx`, `SettingsPage.tsx (PerfilSection)`

---

## 3.3 Pipelines (Kanban)

**Regras de Negócio:**
- Um pipeline pertence exclusivamente ao `owner_id` (RLS).
- Cada pipeline tem uma `category`: `"Venda"` | `"Follow-up"` | `"Operações"`.
- Um pipeline contém `pipeline_columns` (etapas), cada uma com `title`, `color` e `position`.
- A ordem dos pipelines é definida pelo campo `position` (inteiro, ordenação ascendente).
- Leads são movidos entre colunas via drag-and-drop; a operação atualiza `leads.column_id` e reordena `leads.position`.
- O campo `activePipelineId` é mantido no `CRMContext`; ao deletar o pipeline ativo, o próximo da lista é selecionado automaticamente.
- **Leads NÃO podem ser criados dentro da aba Pipeline.** Criação de leads ocorre exclusivamente na aba `/leads`.

**Arquivos:** `PipelinePage.tsx`, `PipelineSidebar.tsx`, `CRMContext.tsx`

---

## 3.4 Leads

**Regras de Negócio:**
- **Criação:** Exclusivamente via modal de 4 abas acessado pelo botão "+ Novo Lead" na aba `/leads`.
- **Campo obrigatório:** `name`.
- O `deal_number` é gerado automaticamente como `max(deal_number) + 1` sobre todos os leads do usuário.
- Ao criar, o lead é inserido no primeiro pipeline e primeira coluna disponíveis do usuário.

**Estrutura do modal de criação/edição:**

| Aba | Campos |
|---|---|
| Contato | Telefone (DDI selecionável, 9 países) + número, E-mail, Site |
| Dados Pessoais | Documento (CPF/CNPJ), Empresa, Origem, Data de Nascimento |
| Endereço | País, CEP (auto-fill ViaCEP), Endereço, Número, Complemento, Bairro, Cidade, UF |
| Anotações | Campo de texto livre (`notes`) |

**DDI disponíveis:** +55 🇧🇷, +1 🇺🇸, +351 🇵🇹, +34 🇪🇸, +44 🇬🇧, +49 🇩🇪, +33 🇫🇷, +54 🇦🇷, +52 🇲🇽

**Origem disponíveis:** `Instagram` | `Facebook Ads` | `Indicação` | `Site` | `Outro`

**Tags:** Selecionadas via badges (`availableTags` em `mockData.ts`). Salvas como `text[]`.

**Menu de ações (`...`) por lead:**

| Ação | Comportamento |
|---|---|
| Editar | Abre `LeadModal` com dados preenchidos |
| Criar negócio | Dialog para selecionar pipeline + etapa; duplica o lead com novo `deal_number` |
| Abrir Chat | `window.open("https://wa.me/{DDI_sem_+}{número_sem_formatação}", "_blank")` |
| Excluir | Modal de confirmação antes de deletar (remove também tarefas associadas) |

**Arquivos:** `LeadsPage.tsx`, `LeadModal.tsx`, `CRMContext.tsx`

---

## 3.5 Atividades

**Regras de Negócio:**
- Ao criar um lead, é inserida automaticamente uma activity do tipo `"created"`.
- Ao marcar lead como ganho/perdido, é inserida activity do tipo `"won"` / `"lost"`.
- Activities têm `owner_id` próprio e são vinculadas ao `lead_id`.
- Exibidas cronologicamente no `LeadDrawer`.

**Tipos válidos:** `"stage_change"` | `"note"` | `"whatsapp"` | `"won"` | `"lost"` | `"created"`

---

## 3.6 Tarefas

**Regras de Negócio:**
- Uma tarefa pode ou não estar vinculada a um `lead_id` (campo opcional).
- Status: `"Pendente"` | `"Concluída"`.
- Ao excluir um lead, todas as suas tarefas são removidas do estado local.
- Tarefas são ordenadas por `created_at` ASC.

---

## 3.7 Configurações

| Seção | Status | Persiste no DB? |
|---|---|---|
| Meu perfil | ✅ Implementado | Sim (`profiles`) |
| Tags | 🔨 UI apenas | Não |
| Produtos | 🔨 UI apenas | Sim (`products` — leitura) |
| Motivos de perda | 🔨 UI apenas | Não |
| Listas | 🔨 UI apenas | Não |
| Campos adicionais | 🔨 UI apenas | Não |
| Departamentos | 🔨 UI apenas | Não |
| Horários de trabalho | 🔨 UI apenas | Não |
| Tipos de atividades | 🔨 UI apenas | Não |
| Integrações | 🔨 Em breve | Não |
| Conexões | 🔨 Em breve | Não |
| Chaves de API | 🔨 UI apenas | Não |
| Servidor MCP | 🔨 Em breve | Não |
| Armazenamento | 🔨 UI apenas | Não |

---

## 3.8 Chat Flutuante

**Regras de Negócio:**
- Máximo de 3 janelas simultâneas. Ao abrir a 4ª, a mais antiga minimizada é removida.
- Apenas 1 janela pode estar maximizada ao mesmo tempo. Abrir outra minimiza a atual.
- Estado gerenciado exclusivamente em memória (`FloatingChatContext`) — não persiste no banco.
