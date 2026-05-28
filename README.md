# Rezult CRM

CRM de vendas B2B brasileiro. SaaS multi-tenant com pipelines, automações e multiatendimento via WhatsApp.

**Produção:** [app.rezultcrm.com](https://app.rezultcrm.com)  
**Stack:** React 18 + TypeScript + Vite + Supabase + Tailwind + shadcn/ui  
**Deploy:** Vercel (auto-deploy via GitHub)

---

## Fluxo de desenvolvimento

### Branches

| Branch | Finalidade | Deploy |
|--------|-----------|--------|
| `main` | Código em produção | `app.rezultcrm.com` (produção) |
| `dev`  | Desenvolvimento do proprietário | URL de preview Vercel |
| `dev-geomar` | Desenvolvimento do Geomar | URL de preview Vercel |

### Regras

- **`dev` e `dev-geomar` devem permanecer sempre sincronizadas** — ao receber mudanças em uma, mergear na outra
- **Para ir a produção:** merge da branch desejada (`dev` ou `dev-geomar`) em `main`
- **Nunca commitar diretamente na `main`**
- Cada desenvolvedor trabalha na sua branch; sincroniza com a outra antes de começar novas tarefas

### Fluxo padrão (Geomar)

```bash
# 1. Atualizar dev-geomar com o que está em dev
git checkout dev-geomar
git pull origin dev-geomar
git merge origin/dev

# 2. Desenvolver e commitar
git add <arquivos>
git commit -m "feat: descrição da mudança"
git push origin dev-geomar

# 3. Sincronizar de volta para dev
git checkout dev
git pull origin dev
git merge origin/dev-geomar
git push origin dev

# 4. Quando pronto para produção (apenas mudanças do Geomar):
#    Solicitar merge de dev-geomar → main
```

### Fluxo padrão (Proprietário)

```bash
# Trabalha na branch dev normalmente
git checkout dev
git pull origin dev
# ... desenvolve ...
git push origin dev

# Para ir a produção:
# Solicitar merge de dev → main
```

### Preview das branches

Cada push em `dev` ou `dev-geomar` gera um deploy de preview automático no Vercel. A URL aparece nos checks do PR e na aba "Deployments" do repositório GitHub.

---

## Comandos locais

```bash
npm run dev      # Servidor de desenvolvimento (http://localhost:8083)
npm run build    # Build de produção
npm run lint     # Lint
npm run preview  # Preview do build local
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon pública do Supabase |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Chave pública do Stripe |

> As chaves secretas do Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) são configuradas como **Supabase Secrets**, nunca no frontend.
