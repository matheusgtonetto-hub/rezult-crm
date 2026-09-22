# Novo Design System do Rezult CRM — Plano de Implementação

**Objetivo:** aplicar `Rezult CRM Design System-3` ao app React sem retirar rotas, painéis, permissões, estados, integrações ou ações existentes.

**Arquitetura:** manter React, TypeScript, Tailwind, shadcn/Radix, Recharts, drag and drop, Supabase e os contextos atuais. Traduzir os tokens do novo design system para a camada visual existente, adaptar componentes compartilhados sem trocar suas APIs e migrar telas por grupos, com validação funcional e visual a cada grupo. O pacote de referência é uma especificação visual e um protótipo; não substitui a implementação do CRM.

**Dependências:** na raiz `/Users/matheustonetto/Documents/Megabrain/rezult-crm/`, consultar `src/App.tsx`, `src/index.css`, `tailwind.config.ts`, `src/components/ui/`, `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx`, `src/context/ProfileContext.tsx` e `AGENTS.md`. A referência nova fica em `/Users/matheustonetto/Documents/Megabrain/Rezult CRM Design System-3/`. Ela prevalece sobre `docs/design-system.md` e `docs/design/design_handoff_rezult_crm/` para decisões visuais; regras operacionais do app continuam prevalecendo para comportamento.

---

## 1. Inventário e limites da migração

O projeto tem 202 arquivos em `src/`, 50 componentes em `src/components/ui/`, cerca de 43 mil linhas em páginas, 32 Edge Functions e 163 migrations. `App.tsx` registra o fluxo público, onboarding, callbacks e 16 famílias de telas protegidas. O pacote novo cobre visualmente dashboard, pipeline, contatos, detalhe de negócio e configurações. Para as demais telas, a implementação precisa estender os mesmos tokens e padrões, preservando o conteúdo e as ações atuais.

| Área atual | Arquivos principais | Fluxos que devem permanecer |
|---|---|---|
| Acesso e onboarding | `src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `Verify2FAPage.tsx`, `ResetPasswordPage.tsx`, `CompanyRegisterPage.tsx`, `SetupPage.tsx` | Login, 2FA, recuperação, cadastro da empresa e seleção de plano |
| Estrutura do app | `src/App.tsx`, `src/components/AppLayout.tsx`, `AppSidebar.tsx`, `src/context/*` | Rotas, carregamento, permissões, troca de empresa, notificações, ajuda, avatar, banner e bloqueios de cobrança |
| Início e análise | `src/pages/InicioPage.tsx`, `DashboardPage.tsx`, `src/components/dashboard/*` | Checklist, filtros, abas, KPIs, gráficos, comparações e exportações existentes |
| Operação comercial | `PipelinePage.tsx`, `LeadsPage.tsx`, `LeadDetailPage.tsx`, `src/components/LeadDrawer.tsx`, `PipelineSidebar.tsx` | Colunas, arrastar, busca, filtros, importação, edição, histórico, atividades e controles de acesso |
| Conversas e agenda | `MultiatendimentoPage.tsx`, `CalendarPage.tsx`, `src/components/FloatingChat*` | Filas, mensagens, anexos/áudio, atribuição, janelas flutuantes, eventos e sincronização |
| Automação e IA | `AutomacoesPage.tsx`, `AgentesPage.tsx`, `DisparosPage.tsx`, `DisparoDetailPage.tsx` | Canvas com pan/zoom, configurações dos nós, agentes, filtros, execução, pausa, logs e estados em tempo real |
| Administração | `SettingsPage.tsx` e `IntegracoesPage.tsx` | 16 seções, inclusive usuários/permissões, integrações, conexões, API/MCP e armazenamento |
| Comercial e callbacks | `Planos.tsx`, `RezultPayPage.tsx`, `CheckoutSuccess.tsx`, callbacks de Google/Meta/WhatsApp | Escolha e cobrança de plano, confirmação e retornos das integrações |

**Fora do escopo visual:** alterar tabelas, RLS, Edge Functions, contratos com Supabase, nomes de planos, regras de assinatura ou modelos de automação. Mudanças nessas áreas exigiriam uma necessidade funcional concreta, separada desta migração.

## 2. Diferenças que exigem decisão técnica

| Ponto | App atual | Novo sistema | Tratamento |
|---|---|---|---|
| Cor e contraste | Primário `#128A68`, texto branco nos botões | Esmeralda `#01D8A4`, texto grafite sobre o destaque | Criar aliases semânticos de dois temas; conferir contraste de todos os CTAs e gráficos. Não manter texto branco sobre o novo esmeralda. |
| Tipografia | Inter declarado, mas Tailwind aponta para Geist Sans/Mono | Inter 400/500/600/700; JetBrains Mono só para IDs e dados técnicos | Consolidar carregamento e mapeamento de fontes; preservar quebras e largura de formulários/tabelas. |
| Tema | Classe `.dark` e escolha salva em `profiles.theme`, mas opção **Escuro** desativada em Configurações | `data-theme="dark"` e exemplo com `localStorage` | Preservar `profiles.theme` como fonte da escolha; espelhar `data-theme` se necessário. Auditar todas as telas no escuro antes de habilitar a opção. Evitar uma segunda preferência independente. |
| Navegação | Barra fixa de 52 px, somente ícones | Barra de 248 px, colapsável para 72 px, topbar 72 px | Criar versão adaptada com rótulos, colapso e drawer responsivo; manter cada destino, permissão, badge e popover. Medir espaço útil das telas densas. |
| Componentes | shadcn/Radix já usados em dezenas de telas | JSX/CSS de referência com props próprias | Reestilizar componentes existentes preservando props, foco, portal, teclado e estados; não copiar componentes do kit por cima. |
| Cores locais | Milhares de estilos/classes pontuais, inclusive cores de status, canais e gráficos | Tokens e uma cor de destaque dominante | Inventariar os literais por contexto. Estados de erro, aviso, canais e séries de dados continuam distinguíveis e legíveis. |
| Escopo das amostras | Produto amplo e vivo | Cinco telas de demonstração, feitas a partir de imagens | Não remover funcionalidades que não aparecem no kit; desenhá-las com o mesmo vocabulário visual. |

## 3. Execução por etapas

### Etapa 0 — Baseline e matriz de preservação

**Arquivos:** criar inventário de rotas/fluxos em `docs/plans/`; consultar `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/pages/SettingsPage.tsx` e principais diálogos.

1. Registrar para cada rota: perfis autorizados, tema claro/escuro, estados vazio/carregando/erro, largura desktop/mobile, ações primárias, menus, modais e navegação de retorno.
2. Capturar imagens do estado atual das telas principais com dados de teste sem alterar registros reais.
3. Verificar baseline de `npm run build` e `npm test`; registrar avisos existentes separadamente de regressões novas. No levantamento de 17/09/2026: build passou e 31 testes passaram.
4. Definir checklists de operação para pipeline, leads, multiatendimento, automações, agentes, disparos, agenda, pagamentos e configurações.

**Saída verificável:** matriz de cobertura com cada item da navegação e as 16 seções de configuração presentes.

### Etapa 1 — Tokens, tema e fontes

**Arquivos:** `src/index.css`, `tailwind.config.ts`, `src/context/ProfileContext.tsx`, `index.html` e novos arquivos de tokens sob `src/styles/` se a separação melhorar a manutenção.

1. Introduzir tokens de cor, tipo, espaçamento, raio, borda, sombra e movimento equivalentes aos arquivos `tokens/` do pacote novo. Manter nomes semânticos do app como ponte para shadcn/Tailwind.
2. Aplicar a escala de Inter/JetBrains Mono e testar overflow de rótulos em português, números e filtros.
3. Fazer `.dark` e `data-theme` refletirem a mesma escolha gravada em `profiles.theme`; não importar o `ThemeToggle` do kit com seu armazenamento local. A opção escura está desativada em `SettingsPage.tsx` e só deve ser habilitada após a revisão visual e funcional das telas migradas.
4. Verificar pares de contraste, foco visível, texto em botões esmeralda, estados disabled e ícones nos dois temas.
5. Adotar tokens por escopo ou tela piloto antes da troca global, para evitar que um ajuste em `--primary` altere todas as rotas de uma vez.

**Saída verificável:** amostra de tokens nos dois temas sem mudança de comportamento de login, perfil ou troca de tema.

### Etapa 2 — Componentes compartilhados

**Arquivos:** `src/components/ui/button.tsx`, `input.tsx`, `select.tsx`, `checkbox.tsx`, `switch.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `table.tsx`, `badge.tsx`, `card.tsx`, `toast.tsx`, `src/components/Logo.tsx` e componentes equivalentes usados no app.

1. Ajustar aparência e tamanhos dos componentes já usados, preservando suas variantes, props, refs e eventos.
2. Verificar portais Radix em tema escuro, scroll de modal, foco inicial/devolvido, Escape, teclado, touch, erros de formulário e mensagens do Sonner.
3. Criar somente os componentes visuais ausentes que se repitam no app; manter regras de negócio nos componentes de domínio atuais.
4. Não alterar em lote componentes de configuração, editor de automações ou conversa antes de validar os padrões compartilhados numa tela piloto.

**Saída verificável:** catálogo de componentes do app com estados normal, hover, foco, selecionado, desabilitado, carregando e erro em ambos os temas.

### Etapa 3 — Estrutura e navegação

**Arquivos:** `src/components/AppLayout.tsx`, `AppSidebar.tsx`, `FreePlanBanner.tsx`, `FloatingChatManager.tsx` e estilos relacionados.

1. Prototipar barra lateral expandida/colapsada e topbar do novo sistema sem retirar links, controle de permissão, empresa, ajuda, notificações, agenda e perfil.
2. Preservar a lógica de redirecionamento, limites de plano, bloqueio de escrita e banners do `AppLayout`.
3. Em telas estreitas, usar drawer navegável e restaurar foco ao fechá-lo. Testar que modais, popovers, chat flutuante e banner não se sobreponham indevidamente.
4. Medir o espaço útil das telas com Kanban, conversa em colunas, calendário e canvas; oferecer estado colapsado quando a barra de 248 px prejudicar a tarefa.

**Saída verificável:** todas as rotas acessíveis por mouse, teclado e touch, com a mesma matriz de permissão e sem conteúdo cortado.

### Etapa 4 — Telas com correspondência direta no kit

**Arquivos:** `src/pages/DashboardPage.tsx`, `PipelinePage.tsx`, `LeadsPage.tsx`, `LeadDetailPage.tsx`, `SettingsPage.tsx`, `src/components/dashboard/*`, `LeadDrawer.tsx`, `PipelineSidebar.tsx`.

1. Migrar primeiro o dashboard como piloto visual. Reaproveitar consultas, períodos, abas e configurações dos gráficos Recharts; trocar apenas apresentação e tokens de séries.
2. Migrar pipeline e cards preservando drag and drop, colunas personalizadas, filtros, busca, menus e ações de lead.
3. Migrar lista/detalhe de leads preservando densidade de informação, seleção, importação, edição, campos adicionais e histórico.
4. Migrar as 16 seções de configurações em sublotes; validar formulários, permissões de admin, salvamento, integrações e plano após cada sublote.

**Saída verificável:** as cinco famílias de telas do kit com dados reais do app e paridade funcional documentada.

### Etapa 5 — Telas sem amostra direta no kit

**Arquivos:** `InicioPage.tsx`, `MultiatendimentoPage.tsx`, `CalendarPage.tsx`, `AutomacoesPage.tsx`, `AgentesPage.tsx`, `DisparosPage.tsx`, `DisparoDetailPage.tsx`, `RezultPayPage.tsx` e componentes de suporte.

1. Aplicar tokens e padrões do kit aos contêineres e controles externos, preservando a hierarquia e as ações próprias de cada tela.
2. Multiatendimento: manter legibilidade de mensagens, remetente, horário, status, anexos, áudio, filas e ações rápidas; testar chat flutuante.
3. Automações: tratar canvas, nós, portas, pan/zoom, drag, seleção, painéis e preview como superfície especializada. Não alterar geometria de hit targets sem teste operacional.
4. Agentes/disparos: manter wizards, filtros, ligação/desligamento, status em tempo real, logs e configurações detalhadas.
5. Agenda e início: preservar visualizações, eventos, onboarding, progresso e convites à ação. Fluxos de pagamento conservam texto e lógica comercial atuais.

**Saída verificável:** cada rota fora do kit com o mesmo inventário funcional da etapa 0, em ambos os temas.

### Etapa 6 — Acesso, onboarding e acabamento

**Arquivos:** telas públicas, `CompanyRegisterPage.tsx`, `SetupPage.tsx`, `Planos.tsx`, callbacks e estados globais.

1. Harmonizar login, 2FA, recuperação, registro, setup e checkout sem interferir em validação, redirecionamentos, sessão ou callbacks OAuth/WhatsApp/Meta.
2. Revisar vazios, loading, erro, sucesso, estados sem permissão e fim de trial.
3. Remover estilos visuais antigos apenas depois que não houver mais consumidores; atualizar `docs/design-system.md` para apontar para a versão nova.

**Saída verificável:** nenhuma rota órfã, nenhuma preferência de tema duplicada, nenhuma classe antiga removida enquanto estiver em uso.

### Etapa 7 — Validação e entrega

**Arquivos:** testes de componentes/fluxos necessários em `src/test/` e documentação de aceitação em `docs/plans/`.

1. Rodar `npm run build`, `npm test` e `npm run lint`, distinguindo falhas preexistentes das introduzidas.
2. Fazer revisão visual em light/dark e desktop/tablet/mobile, inclusive zoom do navegador e textos longos em português.
3. Executar a matriz funcional por perfil (dono, admin, membro e acesso restrito): navegar, criar/editar, filtrar, salvar, arrastar, conversar, agendar, executar e pagar conforme permissão.
4. Conferir contraste, foco, ordem de tabulação, labels, hit targets e preferência por movimento reduzido.
5. Entregar em commits pequenos por etapa, com possibilidade de reverter só a camada visual afetada. Publicar apenas após a revisão final do usuário.

**Critério de conclusão:** todos os itens da matriz da etapa 0 continuam disponíveis e funcionais; claro/escuro coerentes; sem regressões novas no build/testes, overflow ou acessibilidade; nenhuma regra de negócio alterada pela migração visual.

## 4. Ordem recomendada de aplicação

**Piloto:** tokens + componentes básicos + dashboard. **Depois:** estrutura e navegação; pipeline/leads; configuração em sublotes; conversas/agenda; automações/agentes/disparos; acesso/onboarding/comercial; revisão final. Cada etapa deve ser demonstrável no localhost antes da próxima.

## 5. Mapa de conexão

`tokens novos` → alimentam `Tailwind/shadcn` → estilizam `componentes compartilhados` → compõem `AppLayout` e `páginas`; `ProfileContext` → aplica o tema salvo; `App.tsx` → mantém as rotas; `Auth/Company/CRMContext` → mantêm sessão, permissões e dados; `Supabase` → continua executando as operações atuais.

**Analogia operacional:** a migração troca a identidade visual da loja e a disposição das prateleiras enquanto caixa, estoque, equipe e regras de acesso continuam funcionando. Cada corredor é reaberto só depois de confirmar que o cliente ainda encontra e conclui a tarefa que fazia antes.

**Decisão central:** adaptar o design system ao app existente. Copiar o UI kit inteiro seria mais rápido para produzir uma demo, mas perderia as funções que a demo não contém; uma ponte de tokens e uma migração por telas exigem mais verificação e preservam o produto real.
