# Guia de Setup do Zero

Siga esta ordem exata para recriar o projeto em um novo projeto Supabase.

## Passo 1 — Criar Projeto Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto.
2. Anote o `Project URL` e a `anon key` (em **Settings → API**).
3. Configure o e-mail de confirmação em **Authentication → Email Templates**.

---

## Passo 2 — Variáveis de Ambiente

Crie `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-anon-key>
```

---

## Passo 3 — Executar Migrations (ordem obrigatória)

Execute os scripts da pasta [`migrations/`](./migrations/) no **SQL Editor** do Supabase, nesta ordem:

```
1. 001_create_profiles.sql
2. 002_create_pipelines.sql
3. 003_create_pipeline_columns.sql
4. 004_create_leads.sql
5. 005_create_activities.sql
6. 006_create_tasks.sql
7. 007_create_products.sql
8. 008_storage_avatars.sql
9. 009_rls_policies.sql
```

> **Importante:** Os scripts usam `CREATE TABLE IF NOT EXISTS`. Se a tabela já existir com schema diferente, as colunas novas devem ser adicionadas via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

---

## Passo 4 — Instalar Dependências

```bash
npm install
```

---

## Passo 5 — Rodar em Desenvolvimento

```bash
npm run dev
```

O servidor inicia em `http://localhost:8082` (ou próxima porta disponível).

---

## Passo 6 — Build de Produção

```bash
npm run build
```

Os artefatos são gerados em `dist/`.
