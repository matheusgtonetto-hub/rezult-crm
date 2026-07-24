# Central de Ajuda — ajuda.rezultcrm.com

Site estático (HTML/CSS puro, sem build) da Central de Ajuda do Rezult CRM.
É a página aberta pelo botão **Ajuda → Tutoriais** dentro do app.

## Estrutura

```
ajuda-site/
├── index.html              # Home da Central de Ajuda (grade de temas)
├── automacoes/             # Tema "Automações" (tudo sob /automacoes/...)
│   ├── index.html          #   /automacoes        — hub
│   ├── introducao.html     #   /automacoes/introducao
│   ├── gatilhos.html       #   /automacoes/gatilhos
│   ├── acoes.html          #   /automacoes/acoes
│   ├── condicoes-espera.html
│   ├── bloco-ia.html
│   └── modelos/            #   /automacoes/modelos — sub-hub de modelos
│       ├── index.html
│       └── leads-webhook.html
├── assets/
│   └── styles.css          # CSS compartilhado entre todas as páginas
├── favicon.svg             # Ícone "R" da marca
└── vercel.json             # cleanUrls, redirects e cache
```

> Cada tema da home é um **hub** numa pasta própria (ex.: `automacoes/`) servido em
> `/<tema>` via `index.html`; cada card vira um artigo em `/<tema>/<slug>`.
>
> ⚠️ Como as páginas ficam abaixo da raiz, **sempre** referencie assets e links
> internos por caminho **absoluto** (`/assets/styles.css`, `/favicon.svg`,
> `/automacoes/gatilhos`). O CSS é único em `assets/styles.css`.

## Rodar localmente

Como é estático, basta abrir o `index.html` no navegador. Ou servir:

```bash
npx serve ajuda-site
# ou
python -m http.server 5500 --directory ajuda-site
```

## Deploy em ajuda.rezultcrm.com (Vercel)

Recomenda-se um **projeto Vercel separado** do app principal (para não misturar com app.rezultcrm.com):

1. No painel da Vercel → **New Project**.
2. Conecte o mesmo repositório do CRM.
3. Em **Root Directory**, selecione `ajuda-site`.
4. **Framework Preset**: `Other` (sem build). Build Command vazio; Output Directory `.`.
5. Após o deploy, em **Settings → Domains**, adicione `ajuda.rezultcrm.com`.
6. No DNS do domínio `rezultcrm.com`, crie um registro **CNAME** `ajuda` apontando para `cname.vercel-dns.com` (a Vercel mostra o valor exato).

> Alternativa: mover esta pasta para um repositório próprio (`rezult-ajuda`) e deployar isolado. O conteúdo é autossuficiente.

## Conteúdo

A home traz os temas (Primeiros passos, Pipeline, Multiatendimento, Automações,
Leads, Configurações). Os temas ainda sem conteúdo ficam marcados como **EM BREVE**.

### Automações (publicado)

O hub `/automacoes` reúne os temas de Automações. A série linear tem 5 tutoriais:

| URL | Arquivo | Tema |
|-----|---------|------|
| `/automacoes/introducao`       | `automacoes/introducao.html`       | Introdução (1 de 5) |
| `/automacoes/gatilhos`         | `automacoes/gatilhos.html`         | Gatilhos (2 de 5) |
| `/automacoes/acoes`            | `automacoes/acoes.html`            | Ações (3 de 5) |
| `/automacoes/condicoes-espera` | `automacoes/condicoes-espera.html` | Condições & Espera (4 de 5) |
| `/automacoes/bloco-ia`         | `automacoes/bloco-ia.html`         | Bloco de Inteligência Artificial (5 de 5) |

Além da série, o card **Modelos de automação** leva a um **sub-hub** próprio
(`/automacoes/modelos`), com um tutorial por modelo:

| URL | Arquivo | Tema |
|-----|---------|------|
| `/automacoes/modelos`               | `automacoes/modelos/index.html`        | Modelos — **hub** (grade de cards) |
| `/automacoes/modelos/leads-webhook` | `automacoes/modelos/leads-webhook.html`| Modelo: Lead Formulário Webhook |

> Por enquanto o hub de modelos tem só o card do **Lead Formulário Webhook**.
> Para publicar outro modelo, crie `automacoes/modelos/<slug>.html` e adicione um
> `<a class="card" href="/automacoes/modelos/<slug>">` em `automacoes/modelos/index.html`.
>
> As URLs antigas (`/automacoes-*`) continuam funcionando via **redirects 301** em `vercel.json`.

Os "prints" dos blocos são **mockups em HTML/CSS** (classes `.mock-canvas` / `.mock-node`
em `assets/styles.css`) — nítidos e sempre alinhados com a identidade visual. Para trocar
por capturas reais, substitua o bloco `.mock-canvas` dentro de cada `<figure>` por uma `<img>`.
