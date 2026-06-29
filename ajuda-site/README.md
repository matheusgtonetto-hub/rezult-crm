# Central de Ajuda — ajuda.rezultcrm.com

Site estático (HTML/CSS puro, sem build) da Central de Ajuda do Rezult CRM.
É a página aberta pelo botão **Ajuda → Tutoriais** dentro do app.

## Estrutura

```
ajuda-site/
├── index.html        # Home da Central de Ajuda (grade de temas)
├── automacoes.html   # Hub de tutoriais de Automações (cards EM BREVE)
├── assets/
│   └── styles.css    # CSS compartilhado entre todas as páginas
├── favicon.svg       # Ícone "R" da marca
└── vercel.json       # Headers/cache para deploy estático
```

> Cada tema da home é um **hub** (ex.: `automacoes.html`) com uma grade de cards;
> cada card vira um artigo próprio quando o tutorial for publicado. O CSS é único
> em `assets/styles.css` — toda página nova só precisa linká-lo.

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

O hub `automacoes.html` reúne os temas de Automações. A série linear tem 6 tutoriais,
cada um em sua própria página:

| Página | Tema |
|--------|------|
| `automacoes-introducao.html`       | Introdução às automações (1 de 6) |
| `automacoes-gatilhos.html`         | Gatilhos (2 de 6) |
| `automacoes-acoes.html`            | Ações (3 de 6) |
| `automacoes-condicoes-espera.html` | Condições & Espera (4 de 6) |
| `automacoes-bloco-ia.html`         | Bloco de Inteligência Artificial (5 de 6) |
| `automacoes-exemplo-pratico.html`  | Exemplo prático — boas-vindas (6 de 6) |

Além da série, o card **Modelos de automação** leva a um **sub-hub** próprio
(mesmo padrão visual da home), com um tutorial por modelo:

| Página | Tema |
|--------|------|
| `automacoes-modelos.html`          | Modelos de automação — **hub** (grade de cards) |
| `automacoes-modelos-webhook.html`  | Modelo: Lead Formulário Webhook |

> Por enquanto o hub de modelos tem só o card do **Lead Formulário Webhook**.
> Para publicar outro modelo, adicione um `<a class="card">` em `automacoes-modelos.html`
> apontando para a nova página do tutorial.

Os "prints" dos blocos são **mockups em HTML/CSS** (classes `.mock-canvas` / `.mock-node`
em `assets/styles.css`) — nítidos e sempre alinhados com a identidade visual. Para trocar
por capturas reais, substitua o bloco `.mock-canvas` dentro de cada `<figure>` por uma `<img>`.
