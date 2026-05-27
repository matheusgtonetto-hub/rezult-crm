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
| `dev`  | Desenvolvimento ativo | URL de preview Vercel |

### Regras

- **Todo desenvolvimento novo acontece na branch `dev`**
- **Para ir a produção:** abrir PR de `dev → main` e fazer merge
- **Nunca commitar diretamente na `main`**

### Fluxo padrão

```bash
# 1. Certifique-se de estar na dev e atualizada
git checkout dev
git pull origin dev

# 2. Desenvolva e commite na dev
git add <arquivos>
git commit -m "feat: descrição da mudança"
git push origin dev

# 3. Quando pronto para produção: abra PR no GitHub
#    dev → main
#    Após merge, o Vercel deploya automaticamente em produção
```

### Preview da branch dev

Cada push na `dev` gera um deploy de preview automático no Vercel. A URL aparece nos checks do PR e na aba "Deployments" do repositório GitHub.

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
