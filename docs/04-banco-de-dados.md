# Banco de Dados — Dicionário de Dados

> **Projeto Supabase:** `adhjmwkgyxrpsohufqob`  
> **Região:** `sa-east-1` (São Paulo)  
> **Versão PostgreSQL:** 17.6

---

## `public.profiles`

Armazena os dados de perfil de cada usuário autenticado. `id` espelha `auth.users.id`.

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | — | PK. Referência para `auth.users(id)` ON DELETE CASCADE |
| `name` | `text` | NOT NULL | `''` | Nome de exibição do usuário |
| `email` | `text` | NOT NULL | `''` | E-mail do usuário |
| `company_name` | `text` | NULL | — | Nome da empresa do usuário |
| `role` | `text` | NOT NULL | `'admin'` | Papel na empresa |
| `full_name` | `text` | NULL | — | Nome completo (adicionado via migration) |
| `phone` | `text` | NULL | — | Telefone de contato |
| `avatar_url` | `text` | NULL | — | URL pública da foto no Supabase Storage |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Data de criação do registro |

**Relacionamentos:** `profiles.id` → `auth.users.id` (FK com CASCADE DELETE)

---

## `public.pipelines`

Define os pipelines de venda de cada usuário.

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `owner_id` | `uuid` | NOT NULL | — | FK → `auth.users.id`. Dono do pipeline |
| `name` | `text` | NOT NULL | — | Nome do pipeline (ex: "Vendas 2026") |
| `category` | `text` | NOT NULL | `'Venda'` | `Venda` \| `Follow-up` \| `Operações` |
| `position` | `integer` | NOT NULL | `0` | Ordem de exibição na sidebar |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Data de criação |

---

## `public.pipeline_columns`

Representa as colunas (etapas) de um pipeline.

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `pipeline_id` | `uuid` | NOT NULL | — | FK → `pipelines.id` ON DELETE CASCADE |
| `title` | `text` | NOT NULL | — | Título da etapa (ex: "Qualificação") |
| `color` | `text` | NOT NULL | `'#AAAAAA'` | Cor hex do badge da etapa |
| `position` | `integer` | NOT NULL | `0` | Ordem da coluna no kanban |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Data de criação |

---

## `public.leads`

Tabela central do CRM. Armazena todos os dados dos leads.

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `owner_id` | `uuid` | NOT NULL | — | FK → `auth.users.id` |
| `pipeline_id` | `uuid` | NOT NULL | — | FK → `pipelines.id` ON DELETE CASCADE |
| `column_id` | `uuid` | NULL | — | FK → `pipeline_columns.id` ON DELETE SET NULL |
| `deal_number` | `integer` | NULL | — | Número sequencial do negócio (ex: 1001) |
| `name` | `text` | NOT NULL | — | Nome do lead |
| `company` | `text` | NULL | — | Empresa do lead |
| `whatsapp` | `text` | NULL | — | Número de telefone (sem DDI) |
| `phone_ddi` | `text` | NULL | — | DDI do telefone (ex: `+55`) |
| `site` | `text` | NULL | — | URL do site do lead |
| `email` | `text` | NULL | — | E-mail do lead |
| `value` | `numeric` | NOT NULL | `0` | Valor monetário do negócio |
| `responsible` | `text` | NULL | — | Nome do responsável pelo lead |
| `priority` | `text` | NOT NULL | `'Média'` | `Alta` \| `Média` \| `Baixa` |
| `origin` | `text` | NOT NULL | `'Outro'` | `Instagram` \| `Facebook Ads` \| `Indicação` \| `Site` \| `Outro` |
| `product_id` | `text` | NULL | — | ID do produto associado (referência soft) |
| `status` | `text` | NOT NULL | `'open'` | Status interno do lead |
| `tags` | `text[]` | NOT NULL | `'{}'` | Array de tags |
| `notes` | `text` | NOT NULL | `''` | Anotações livres |
| `entry_date` | `date` | NOT NULL | `CURRENT_DATE` | Data de entrada no pipeline |
| `next_follow_up` | `date` | NULL | — | Data do próximo follow-up |
| `position` | `integer` | NOT NULL | `0` | Posição dentro da coluna (ordenação kanban) |
| `document` | `text` | NULL | — | CPF ou CNPJ |
| `birth_date` | `date` | NULL | — | Data de nascimento |
| `country` | `text` | NULL | `'Brasil'` | País do endereço |
| `zip_code` | `text` | NULL | — | CEP (formato `00000-000`) |
| `address` | `text` | NULL | — | Logradouro |
| `addr_number` | `text` | NULL | — | Número do endereço |
| `complement` | `text` | NULL | — | Complemento do endereço |
| `neighborhood` | `text` | NULL | — | Bairro |
| `city` | `text` | NULL | — | Cidade |
| `state` | `text` | NULL | — | UF (ex: `SP`) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Data de criação do registro |

---

## `public.activities`

Log de eventos e interações associados a cada lead.

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `owner_id` | `uuid` | NOT NULL | — | FK → `auth.users.id` |
| `lead_id` | `uuid` | NOT NULL | — | FK → `leads.id` ON DELETE CASCADE |
| `type` | `text` | NOT NULL | — | `stage_change` \| `note` \| `whatsapp` \| `won` \| `lost` \| `created` |
| `description` | `text` | NOT NULL | — | Descrição textual da atividade |
| `date` | `date` | NOT NULL | `CURRENT_DATE` | Data em que a atividade ocorreu |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Timestamp de inserção |

---

## `public.tasks`

Tarefas vinculadas a leads ou standalone.

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `owner_id` | `uuid` | NOT NULL | — | FK → `auth.users.id` |
| `lead_id` | `uuid` | NULL | — | FK → `leads.id` ON DELETE SET NULL (opcional) |
| `lead_name` | `text` | NOT NULL | `''` | Nome do lead (desnormalizado para exibição) |
| `title` | `text` | NOT NULL | — | Título da tarefa |
| `responsible` | `text` | NOT NULL | `''` | Responsável pela tarefa |
| `due_date` | `text` | NOT NULL | `''` | Data de vencimento (string `YYYY-MM-DD`) |
| `status` | `text` | NOT NULL | `'Pendente'` | `Pendente` \| `Concluída` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Data de criação |

---

## `public.products`

Catálogo de produtos/serviços do usuário.

| Coluna | Tipo | Nullable | Padrão | Descrição |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | PK |
| `owner_id` | `uuid` | NOT NULL | — | FK → `auth.users.id` |
| `name` | `text` | NOT NULL | — | Nome do produto |
| `sku` | `text` | NOT NULL | `''` | Código SKU |
| `default_value` | `numeric` | NOT NULL | `0` | Valor padrão de venda |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Data de criação |

---

## ERD Simplificado

```
auth.users
    │
    ├──── profiles (1:1)
    ├──── pipelines (1:N)
    │         └── pipeline_columns (1:N)
    │                   └── leads (N:1) ←──┐
    ├──── leads (1:N) ──────────────────────┘
    │         ├── activities (1:N)
    │         └── tasks (1:N)
    ├──── activities (1:N)
    ├──── tasks (1:N)
    └──── products (1:N)
```
