# Design System 3 — Registro de execução

## Marco 1: primeiro passe do dashboard

Data: 17/09/2026.

### Baseline observado

- `App.tsx` mantém as rotas públicas, onboarding, callbacks e rotas protegidas.
- `AppLayout.tsx` concentra navegação, banner de plano, bloqueio de cobrança e chat flutuante.
- `ProfileContext.tsx` grava a escolha claro/escuro em `profiles.theme` e aplica a classe `.dark`.
- O seletor em `SettingsPage.tsx` mostra "Escuro — Em breve" desativado. A preferência atual do usuário não foi alterada durante a verificação.
- O dashboard contém três visões: Performance Geral, Por Pipeline e Da Equipe. Seus controles e painéis estão dentro de `DashboardPage.tsx` e `src/components/dashboard/`.
- Build de produção: passou antes da migração; avisos de bundle grande e imports mistos já existiam.
- Testes existentes: 31 passaram antes da migração.

### Feito neste marco

- Criada a ponte de tokens em `src/styles/design-system-v3.css`, limitada à classe `.rz-ds-v3`.
- Dashboard com Inter, superfícies, bordas, sombra de cartão e esmeralda do novo material.
- Todos os painéis das três visões usam a hierarquia visual do novo Card e DataTable: títulos, subtítulos, cabeçalhos neutros, linhas, totais e estados de foco/seleção.
- Seletor das três visões segue SegmentedTabs; os seletores internos mantêm sua interação.
- Cores principais de gráficos, barras, tooltip e cartões KPI atualizadas. A paleta multissérie preserva cores distintas para até oito categorias.
- Corrigida a margem do eixo do gráfico de horários para mostrar o primeiro dígito de `120`.
- Nenhuma consulta, permissão, evento, rota ou ação de negócio foi alterada.

### Onde isso vive

```text
rezult-crm/
├── src/
│   ├── main.tsx                         importa o CSS do piloto
│   ├── styles/design-system-v3.css       tokens e aparência por tema
│   ├── pages/DashboardPage.tsx           ativa o escopo no dashboard
│   └── components/dashboard/             gráficos, tabelas e cartões existentes
│       ├── HorariosPanel.tsx
│       ├── KpiCard.tsx
│       ├── UtmAttributionPanel.tsx
│       └── useDashboardHelpers.ts
└── docs/plans/                           plano e este registro
```

| Elemento | O que é / formato | Liga-se a / quem aciona | Se for removido |
|---|---|---|---|
| `design-system-v3.css` | CSS com tokens e ajustes visuais do piloto | `main.tsx` importa; a classe do dashboard ativa | O piloto volta à aparência anterior, sem perda de dados |
| Classe `.rz-ds-v3` | Marcador visual na raiz do dashboard | `DashboardPage.tsx` aplica aos painéis filhos | Tokens ficam carregados, mas não atingem o dashboard |
| Cores dos gráficos/KPIs | Constantes de apresentação em TypeScript | Recharts e cartões já existentes usam | Dados permanecem, mas as cores ficam desalinhadas do novo sistema |
| Aparência dos painéis e tabelas | Regras CSS limitadas ao dashboard | Painéis existentes, sem trocar sua lógica | Voltam os cabeçalhos e divisórias anteriores |

`main.tsx` importa CSS → `.rz-ds-v3` ativa tokens → cartões e gráficos os usam; `App.tsx` continua escolhendo a rota e os contextos continuam entregando dados.

Analogia: a primeira área da loja recebeu a nova sinalização e pintura; caixa, estoque e regras de acesso continuam no mesmo lugar.

Decisão: o escopo por tela permite conferir o dashboard antes de espalhar tokens globais. A alternativa de trocar `--primary` em `src/index.css` afetaria de uma vez todas as telas e seus estados; por isso a expansão virá após a validação dos componentes compartilhados.

### Verificação

- Build de produção: passou depois da mudança.
- Testes existentes: 31 passaram depois da mudança.
- Navegador local: dashboard carregou dados reais; visualizou KPIs, gráficos, filtros e abas.
- As três abas do dashboard (Performance Geral, Por Pipeline e Da Equipe) abriram e exibiram seus painéis; a vista inicial foi restaurada.
- Painéis de ranking, origem, UTM, horários, tags, conversão e equipe conferidos visualmente no navegador.
- Filtro de fonte UTM abriu com as opções existentes e foi fechado sem mudar a seleção.
- Eixo de horários voltou a mostrar `120` inteiro.
- O seletor de período abriu e fechou sem alterar o recorte salvo.
- Tema claro: fonte Inter, fundo `#F7F7F7`, borda de cartão `#E7E7E7`, raio 16 px e destaque esmeralda confirmados no CSS calculado.

## Marco 1.1: limpeza das invenções

Data: 17/09/2026, mesmo dia, depois da revisão do dono.

### O que estava errado

O marco 1 não se limitou a pintar. Ele trouxe para o produto a tela de exemplo
do design system (`ui_kits/rezult_crm/Dashboard.jsx`), que é uma composição
fictícia, e tratou aquele exemplo como especificação. Entraram no CRM peças que
não existem no produto e que ninguém pediu.

| Retirado | Onde estava | Por que saiu |
|---|---|---|
| Topbar com saudação, busca global, campainha e avatar | `DashboardTopbar.tsx`, montada no `AppLayout` só em `/dashboard` | Navegação nova, duplicando a sidebar, que já tem avatar e notificações |
| Painel "Atividade" (mapa de calor dia x faixa horária) | `DashboardActivityHeatmap.tsx` | Painel inventado, ao lado de "Horários e dias de maior resultado", que responde a mesma pergunta |
| Botão "Exportar" gerando CSV dos leads do período | `DashboardPage.tsx` | Funcionalidade nova, com download de dado de cliente. Não é decisão de design |
| Botão "Novo negócio" no cabeçalho | `DashboardPage.tsx` | Funcionalidade nova |
| KPIs remontados: 3 no topo e "Total em aberto" como cartão gigante | `DashboardPage.tsx`, props `reference`/`feature`/`onOpen` no `KpiCard` | Muda a informação da tela, não a aparência. Voltaram os 4 na mesma fileira |
| Sparkline e seta de "abrir" nos KPIs | `KpiCard.tsx` | O sparkline havia sido removido de propósito (repetia em 44px o que o painel abaixo conta); a seta é navegação nova |
| Par de origem separado em duas linhas | prop `variant` no `OriginPanel` | O par existe para comparar volume contra receita lado a lado |
| Cores de canal trocadas por tons de verde | `ORIGIN_COLORS` em `useDashboardHelpers.ts` | Instagram, Facebook Ads e Indicação usam a cor da própria marca, que é o que permite seguir um canal com o olho entre os três painéis. "Outro" havia ficado com o esmeralda da marca, o tom de maior destaque, para a categoria menos importante |
| Reestilo da sidebar por rota, com `!important` | `.rz-ds-dashboard-shell` no CSS | A navegação passava a ter duas aparências, uma no dashboard e outra no resto do app, e a marca ficava escondida |
| `max-width` e `padding` da página no CSS | `.rz-ds-v3` no CSS | Competia com as classes utilitárias que a própria página declara |
| Título "Dashboards" virou "Dashboard" | `DashboardPage.tsx` | Conteúdo, e o plural tem razão escrita no código: a tela abriga três visões |

### O que ficou

Só a pintura, agora declarada como tal no cabeçalho de `design-system-v3.css`:

- Tokens de superfície, borda, sombra, raio, texto e esmeralda, escopados em `.rz-ds-v3`.
- Inter no dashboard.
- Cartão do sistema (borda de 1px, raio 16, sombra larga) nos painéis existentes.
- Cabeçalho de tabela neutro no lugar da faixa esmeralda com texto branco, que daria 1,85:1.
- Abas das três visões no SegmentedTabs.
- `text-primary` no tom 800 sobre claro (7,1:1) e tinta charcoal sobre superfície esmeralda (7,2:1).
- Anel de foco esmeralda.
- Cores de gráfico do sistema em `AREAS_NEGOCIOS`, `KpiCard` e `HorariosPanel`, mais a correção da margem do eixo que cortava o `120`.

### Onde está a versão anterior

- `git stash@{0}` — "DS v3 dashboard: versao do agente (invencoes) antes da limpeza", com os 7 arquivos rastreados.
- Patch completo e os dois componentes retirados: pasta temporária da sessão (`scratchpad/ds-v3-backup/`). Como é diretório de sessão, o que precisa sobreviver está no stash.

### Verificação

- `tsc --noEmit`: sem erro.
- Testes: 31 passaram.
- Navegador local, dados reais: 4 KPIs na fileira, par de origem lado a lado com as cores de canal, cabeçalho de tabela neutro, sidebar igual à das outras rotas, sem topbar e sem painel de atividade. Nenhum erro no console.
- Nenhuma referência pendente às classes e componentes retirados (busca por `rz-ds-topbar`, `rz-ds-stat`, `rz-ds-activity`, `rz-ds-action`, `rz-ds-pagehead`, `rz-ds-dashboard-shell`, `DashboardTopbar`, `DashboardActivityHeatmap`).

### Regra para os próximos marcos

Um design system define **como** o produto se parece. Ele não define **o que** a
tela contém. Kit de exemplo do sistema serve de referência visual, e não de
inventário: nenhum painel, campo, botão de ação ou navegação entra no CRM a
partir dele. Se a pintura pedir uma peça que não existe, isso é decisão de
produto e sobe para o dono antes de virar código.

### Próximo marco

- Verificar tema escuro em ambiente isolado; só liberar o seletor depois da auditoria de todas as telas.
- Expandir a ponte para componentes compartilhados e, depois, para a navegação.

## Correção visual após a referência da tela

O usuário esclareceu que esperava a composição completa mostrada na imagem do Design System 3. O primeiro passe acima havia aplicado os tokens e o tratamento dos painéis, mas ainda mantinha a estrutura visual antiga.

```text
rezult-crm/
├── src/
│   ├── components/AppLayout.tsx
│   ├── components/AppSidebar.tsx
│   ├── components/dashboard/
│   │   ├── DashboardTopbar.tsx
│   │   ├── DashboardActivityHeatmap.tsx
│   │   ├── KpiCard.tsx
│   │   └── OriginPanel.tsx
│   ├── pages/DashboardPage.tsx
│   └── styles/design-system-v3.css
└── docs/plans/2026-09-17-design-system-v3-progress.md
```

| Elemento | O que é e formato | Conexão e gatilho | Se for removido |
|---|---|---|---|
| `DashboardTopbar.tsx` | Cabeçalho React com saudação, busca, notificações e perfil | `AppLayout.tsx` renderiza na rota `/dashboard`; a busca lê os negócios existentes | Busca e ações do cabeçalho desaparecem |
| `DashboardActivityHeatmap.tsx` | Painel React de atividade por dia e horário dentro do período selecionado | `DashboardPage.tsx` passa negócios e intervalo | A terceira linha perde o mapa de atividade |
| `KpiCard.tsx` e `OriginPanel.tsx` | Componentes React de indicadores e anéis | O dashboard passa séries e dados atuais | Os painéis voltam à apresentação anterior |
| `design-system-v3.css` | CSS com rail, topbar, grade e superfícies | `main.tsx` importa e a classe da tela limita a aplicação | A composição visual da referência se perde |

`AppLayout.tsx` mostra topbar → `DashboardPage.tsx` monta indicadores e painéis → os componentes leem dados dos contextos existentes → filtros alteram os recortes exibidos. O botão de notificações abre o painel que `AppSidebar.tsx` já usava; “Novo negócio” abre o cadastro existente.

Analogia: os mesmos números, equipes e processos comerciais passaram a aparecer em um novo painel de controle. O atendimento e o cadastro continuam ligados ao mesmo sistema.

Decisão: reproduzir a organização da imagem com os dados reais do CRM. Copiar os números demonstrativos do kit daria semelhança visual imediata, mas tornaria o dashboard incorreto. A consequência é que curvas e anéis mudam de formato conforme os dados do usuário. O quarto indicador e todos os relatórios adicionais permanecem acessíveis mais abaixo, porque removê-los apagaria informação útil que a imagem não cobre.

Verificação visual: rail branco com uma marca, topbar, três indicadores com minigráficos, gráfico e anel na segunda linha, barras, anel e atividade na terceira linha; o quarto indicador e receita por origem continuam abaixo. Busca por negócio, notificações, acesso ao cadastro e visão Por Pipeline conferidos no navegador. Build de produção passou; os 31 testes existentes passaram; `git diff --check` não apontou erros. O seletor de tema escuro continua desativado no produto e não foi alterado.
- Pendência anterior a este trabalho: o anel de "Resultado por responsável" usa a paleta de reserva do `DonutDistribuicao` e sai magenta, fora do acento único do sistema.
- Quando a ponte virar global, as regras presas a classes utilitárias (`.bg-card.border table thead`) devem morrer e os valores passam para `src/index.css`.
